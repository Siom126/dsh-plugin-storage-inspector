import fs from 'node:fs';
import path from 'node:path';
import {
  getDshHome,
  scanDirectory,
  scanDshGlobalStorage,
  getFolderTotalSize
} from './scanner.js';

class WorkspaceStore {
  constructor(options = {}) {
    this.cacheDurationMs = options.cacheDurationMs ?? 60000; // 默认缓存1分钟
    this.lastScannedAt = 0;
    this.cachedData = null;
    this.isScanning = false;
    this.scanPromise = null;
  }

  /**
   * 获取所有工作区及对话的聚合存储数据
   */
  async getStorageData(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cachedData && now - this.lastScannedAt < this.cacheDurationMs) {
      return this.cachedData;
    }

    if (this.isScanning && this.scanPromise) {
      return this.scanPromise;
    }

    this.isScanning = true;
    this.scanPromise = this._collectData()
      .then((data) => {
        this.cachedData = data;
        this.lastScannedAt = Date.now();
        this.isScanning = false;
        this.scanPromise = null;
        return data;
      })
      .catch((err) => {
        this.isScanning = false;
        this.scanPromise = null;
        throw err;
      });

    return this.scanPromise;
  }

  /**
   * 内部数据收集与计算
   */
  async _collectData() {
    const dshHome = getDshHome();
    const globalStorage = scanDshGlobalStorage();

    // 1. 读取 workspace.json
    const wsJsonPath = path.join(dshHome, 'storages', 'workspace.json');
    let workspaceJson = { tables: { workspaces: {} }, global: { archivedSessionIds: [] } };
    if (fs.existsSync(wsJsonPath)) {
      try {
        workspaceJson = JSON.parse(fs.readFileSync(wsJsonPath, 'utf8'));
      } catch (e) {
        console.error('[storage-inspector] Failed to parse workspace.json:', e);
      }
    }

    const archivedSet = new Set(workspaceJson.global?.archivedSessionIds || []);
    const workspacesTable = workspaceJson.tables?.workspaces || {};

    // 2. 读取 session_projcache
    const projCacheDir = path.join(dshHome, 'storages', 'session_projcache', 'sessions');
    const projCacheMap = new Map();
    if (fs.existsSync(projCacheDir)) {
      try {
        const files = fs.readdirSync(projCacheDir);
        for (const f of files) {
          if (!f.endsWith('.json')) continue;
          const p = path.join(projCacheDir, f);
          try {
            const stat = fs.statSync(p);
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            const rawId = f.replace(/\.json$/, '');
            const sid = rawId.startsWith('session-') ? rawId : `session-${rawId}`;
            const item = {
              rawId,
              sid,
              size: stat.size,
              cwd: data.record?.identity?.cwd || '',
              title: data.record?.rows?.title?.val || data.record?.rows?.titleInput?.val?.first || '未命名对话',
              createdAt: data.record?.identity?.createdAt || 0,
              updatedAt: stat.mtimeMs
            };
            projCacheMap.set(sid, item);
            projCacheMap.set(rawId, item);
          } catch {}
        }
      } catch {}
    }

    // 3. 读取 sessions 目录下的实体文件大小
    const sessionsDir = path.join(dshHome, 'sessions');
    const sessionDiskMap = new Map(); // sessionId -> { dirSize, fileCount, path, files }
    if (fs.existsSync(sessionsDir)) {
      try {
        const wsDirs = fs.readdirSync(sessionsDir);
        for (const wsd of wsDirs) {
          const fullWsd = path.join(sessionsDir, wsd);
          try {
            if (!fs.statSync(fullWsd).isDirectory()) continue;
            const sDirs = fs.readdirSync(fullWsd);
            for (const sd of sDirs) {
              const fullSd = path.join(fullWsd, sd);
              try {
                if (!fs.statSync(fullSd).isDirectory()) continue;
                const sFiles = fs.readdirSync(fullSd);
                let dirSize = 0;
                let fileCount = 0;
                const fileList = [];
                for (const sf of sFiles) {
                  try {
                    const fStat = fs.statSync(path.join(fullSd, sf));
                    dirSize += fStat.size;
                    fileCount += 1;
                    fileList.push({ name: sf, size: fStat.size, mtime: fStat.mtimeMs });
                  } catch {}
                }
                const info = {
                  dirSize,
                  fileCount,
                  path: fullSd,
                  folderName: wsd,
                  files: fileList
                };
                sessionDiskMap.set(sd, info);
                if (!sd.startsWith('session-')) {
                  sessionDiskMap.set(`session-${sd}`, info);
                }
              } catch {}
            }
          } catch {}
        }
      } catch {}
    }

    // 4. 汇总每个工作区
    const workspaces = [];
    const processedSessionIds = new Set();

    for (const [wsId, wsInfo] of Object.entries(workspacesTable)) {
      const wsPath = wsInfo.path;
      const wsSessions = [];
      const sessionIds = new Set(wsInfo.sessionIds || []);

      // 关联归档或未在 sessionIds 中的 session（通过 projcache.cwd 匹配）
      for (const [sid, cache] of projCacheMap.entries()) {
        if (sid.startsWith('session-') && cache.cwd === wsPath) {
          sessionIds.add(sid);
        }
      }

      for (const sid of sessionIds) {
        processedSessionIds.add(sid);
        const cache = projCacheMap.get(sid) || {};
        const disk = sessionDiskMap.get(sid) || { dirSize: 0, fileCount: 0, files: [] };
        const isArchived = archivedSet.has(sid);
        const dataSize = disk.dirSize || 0;
        const cacheSize = cache.size || 0;
        const totalSize = dataSize + cacheSize;

        wsSessions.push({
          id: sid,
          title: cache.title || '未命名对话',
          isArchived,
          dataSize,
          cacheSize,
          totalSize,
          fileCount: disk.fileCount || 0,
          files: disk.files || [],
          createdAt: cache.createdAt || 0,
          updatedAt: cache.updatedAt || 0
        });
      }

      // 按占用空间从大到小排序
      wsSessions.sort((a, b) => b.totalSize - a.totalSize);

      // 扫描工作区物理目录
      const dirScan = scanDirectory(wsPath, { maxDepth: 6 });

      const sessionsTotalSize = wsSessions.reduce((sum, s) => sum + s.totalSize, 0);
      const totalWorkspaceStorage = dirScan.totalBytes + sessionsTotalSize;

      workspaces.push({
        id: wsId,
        title: wsInfo.title || path.basename(wsPath) || '工作区',
        path: wsPath,
        exists: dirScan.exists,
        accessible: dirScan.accessible,
        projectDiskBytes: dirScan.totalBytes,
        projectFilesBytes: dirScan.totalBytes,
        projectDiskFiles: dirScan.totalFiles,
        totalFiles: dirScan.totalFiles,
        categories: dirScan.categories,
        categoryDetails: dirScan.categoryDetails,
        topLargestDirs: dirScan.topLargestDirs,
        topLargestFiles: dirScan.topLargestFiles,
        sessionsCount: wsSessions.length,
        activeSessionsCount: wsSessions.filter((s) => !s.isArchived).length,
        archivedSessionsCount: wsSessions.filter((s) => s.isArchived).length,
        sessionsTotalBytes: sessionsTotalSize,
        sessionsBytes: sessionsTotalSize,
        totalStorageBytes: totalWorkspaceStorage,
        sessions: wsSessions
      });
    }

    // 处理游离/孤儿 Session（不属于任何配置的工作区）
    const orphanSessions = [];
    for (const [sid, cache] of projCacheMap.entries()) {
      if (!sid.startsWith('session-') || processedSessionIds.has(sid)) continue;
      const disk = sessionDiskMap.get(sid) || { dirSize: 0, fileCount: 0, files: [] };
      const isArchived = archivedSet.has(sid);
      const dataSize = disk.dirSize || 0;
      const cacheSize = cache.size || 0;
      const totalSize = dataSize + cacheSize;

      orphanSessions.push({
        id: sid,
        title: cache.title || '未命名对话',
        isArchived,
        cwd: cache.cwd || '未知目录',
        dataSize,
        cacheSize,
        totalSize,
        fileCount: disk.fileCount || 0,
        files: disk.files || [],
        createdAt: cache.createdAt || 0,
        updatedAt: cache.updatedAt || 0
      });
    }

    if (orphanSessions.length > 0) {
      orphanSessions.sort((a, b) => b.totalSize - a.totalSize);
      const orphanTotal = orphanSessions.reduce((sum, s) => sum + s.totalSize, 0);
      workspaces.push({
        id: '_orphans',
        title: '历史与未关联对话',
        path: '（已移除工作区或临时对话）',
        exists: true,
        accessible: true,
        projectDiskBytes: 0,
        projectFilesBytes: 0,
        projectDiskFiles: 0,
        totalFiles: 0,
        categories: {
          code: { label: '项目代码', bytes: 0, files: 0, color: '#3b82f6' },
          dependencies: { label: '依赖模块', bytes: 0, files: 0, color: '#f59e0b' },
          build: { label: '构建产物', bytes: 0, files: 0, color: '#8b5cf6' },
          vcs: { label: '版本与元数据', bytes: 0, files: 0, color: '#64748b' },
          docs: { label: '文档与配置', bytes: 0, files: 0, color: '#10b981' },
          media: { label: '媒体与资源', bytes: 0, files: 0, color: '#ec4899' },
          others: { label: '其他文件', bytes: 0, files: 0, color: '#94a3b8' }
        },
        topLargestDirs: [],
        topLargestFiles: [],
        sessionsCount: orphanSessions.length,
        activeSessionsCount: orphanSessions.filter((s) => !s.isArchived).length,
        archivedSessionsCount: orphanSessions.filter((s) => s.isArchived).length,
        sessionsTotalBytes: orphanTotal,
        sessionsBytes: orphanTotal,
        totalStorageBytes: orphanTotal,
        sessions: orphanSessions
      });
    }

    // 按总存储占用降序排序
    workspaces.sort((a, b) => b.totalStorageBytes - a.totalStorageBytes);

    // 计算全局聚合统计
    const summary = {
      totalWorkspaces: workspaces.length,
      totalSessions: workspaces.reduce((sum, w) => sum + w.sessionsCount, 0),
      totalStorageBytes:
        workspaces.reduce((sum, w) => sum + w.totalStorageBytes, 0) +
        globalStorage.attachments.bytes,
      totalProjectFilesBytes: workspaces.reduce((sum, w) => sum + w.projectDiskBytes, 0),
      totalSessionsBytes: workspaces.reduce((sum, w) => sum + w.sessionsTotalBytes, 0),
      attachmentsBytes: globalStorage.attachments.bytes,
      attachmentsFiles: globalStorage.attachments.files,
      dshInternalBytes: globalStorage.totalDshInternalBytes,
      categories: {
        code: workspaces.reduce((sum, w) => sum + w.categories.code.bytes, 0),
        dependencies: workspaces.reduce((sum, w) => sum + w.categories.dependencies.bytes, 0),
        build: workspaces.reduce((sum, w) => sum + w.categories.build.bytes, 0),
        vcs: workspaces.reduce((sum, w) => sum + w.categories.vcs.bytes, 0),
        docs: workspaces.reduce((sum, w) => sum + w.categories.docs.bytes, 0),
        media: workspaces.reduce((sum, w) => sum + w.categories.media.bytes, 0),
        others: workspaces.reduce((sum, w) => sum + w.categories.others.bytes, 0)
      },
      scannedAt: Date.now()
    };

    return {
      summary,
      workspaces,
      globalStorage
    };
  }
}

export const workspaceStore = new WorkspaceStore();
