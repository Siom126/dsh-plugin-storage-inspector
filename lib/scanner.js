import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import child_process from 'node:child_process';

// 常见文件扩展名分类
export const EXT_CATEGORIES = {
  code: new Set([
    '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs',
    '.py', '.pyw', '.java', '.go', '.rs', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
    '.vue', '.svelte', '.php', '.rb', '.swift', '.kt', '.kts', '.scala',
    '.sh', '.bash', '.zsh', '.fish', '.sql', '.html', '.htm', '.css', '.scss', '.sass', '.less',
    '.dart', '.lua', '.r', '.pl', '.pm', '.asm', '.s'
  ]),
  docs: new Set([
    '.md', '.markdown', '.txt', '.rtf', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.json', '.jsonc', '.json5', '.yaml', '.yml', '.toml', '.xml', '.csv', '.tsv', '.ini', '.conf'
  ]),
  media: new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.tiff', '.tif',
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv',
    '.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a',
    '.ttf', '.otf', '.woff', '.woff2', '.eot',
    '.zip', '.tar', '.gz', '.7z', '.rar', '.dmg', '.iso'
  ])
};

export const DEP_DIR_NAMES = new Set([
  'node_modules', 'venv', '.venv', 'env', '.env_dir', '__pycache__', '.pytest_cache',
  'vendor', 'target', 'Pods', '.cargo', '.gradle', 'packages'
]);

export const BUILD_DIR_NAMES = new Set([
  'dist', 'build', '.next', '.nuxt', '.output', 'out', '.turbo', '.cache', '.parcel-cache'
]);

export const VCS_DIR_NAMES = new Set([
  '.git', '.svn', '.hg', '.agent-teams', '.vscode', '.idea'
]);

/**
 * 递归扫描工作区物理目录，分类统计文件与磁盘大小
 */
export function scanDirectory(dirPath, options = {}) {
  const maxDepth = options.maxDepth ?? 7;
  const timeoutMs = options.timeoutMs ?? 15000;
  const startTime = Date.now();

  const stats = {
    path: dirPath,
    exists: false,
    accessible: false,
    totalBytes: 0,
    totalFiles: 0,
    scannedAt: Date.now(),
    scanDurationMs: 0,
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
    topLargestFiles: []
  };

  if (!dirPath || typeof dirPath !== 'string') return stats;

  try {
    if (!fs.existsSync(dirPath)) {
      stats.exists = false;
      return stats;
    }
    stats.exists = true;
    const rootStat = fs.statSync(dirPath);
    if (!rootStat.isDirectory()) {
      stats.totalBytes = rootStat.size;
      stats.totalFiles = 1;
      stats.accessible = true;
      return stats;
    }
    stats.accessible = true;
  } catch (err) {
    stats.error = err.message;
    return stats;
  }

  const allFiles = [];
  const dirSizeMap = new Map();
  const filesByCategory = {
    code: [],
    dependencies: [],
    build: [],
    vcs: [],
    docs: [],
    media: [],
    others: []
  };
  const dirsByCategory = {
    code: new Map(),
    dependencies: new Map(),
    build: new Map(),
    vcs: new Map(),
    docs: new Map(),
    media: new Map(),
    others: new Map()
  };

  const CODE_DIR_NAMES = new Set([
    'src', 'lib', 'app', 'components', 'pages', 'server', 'api', 'core',
    'test', 'tests', 'include', 'internal', 'pkg', 'scripts', 'utils', 'hooks', 'views'
  ]);

  function recordDirCategoryBytes(relFilePath, cat, size) {
    let curRelDir = path.dirname(relFilePath);
    while (curRelDir && curRelDir !== '.' && curRelDir !== '/') {
      const parts = curRelDir.split(path.sep);
      if (parts.length <= 3) {
        if (!dirSizeMap.has(curRelDir)) dirSizeMap.set(curRelDir, 0);
        dirSizeMap.set(curRelDir, dirSizeMap.get(curRelDir) + size);

        if (dirsByCategory[cat]) {
          const cur = dirsByCategory[cat].get(curRelDir) || 0;
          dirsByCategory[cat].set(curRelDir, cur + size);
        }
      }
      curRelDir = path.dirname(curRelDir);
    }
  }

  function walk(currentPath, depth, currentCategory = null) {
    if (Date.now() - startTime > timeoutMs) return;
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    let currentDirBytes = 0;

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue; // 避免符号链接死循环

      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        let childCategory = currentCategory;
        if (!childCategory) {
          if (DEP_DIR_NAMES.has(entry.name)) {
            childCategory = 'dependencies';
          } else if (BUILD_DIR_NAMES.has(entry.name)) {
            childCategory = 'build';
          } else if (VCS_DIR_NAMES.has(entry.name)) {
            childCategory = 'vcs';
          } else if (CODE_DIR_NAMES.has(entry.name)) {
            childCategory = 'code';
          }
        }

        const subDirBytes = walk(fullPath, depth + 1, childCategory);
        currentDirBytes += subDirBytes;
      } else if (entry.isFile()) {
        try {
          const fileStat = fs.statSync(fullPath);
          const size = fileStat.size;
          stats.totalBytes += size;
          stats.totalFiles += 1;
          currentDirBytes += size;

          let cat = currentCategory;
          if (!cat) {
            const ext = path.extname(entry.name).toLowerCase();
            if (EXT_CATEGORIES.code.has(ext)) {
              cat = 'code';
            } else if (EXT_CATEGORIES.docs.has(ext)) {
              cat = 'docs';
            } else if (EXT_CATEGORIES.media.has(ext)) {
              cat = 'media';
            } else {
              cat = 'others';
            }
          }

          stats.categories[cat].bytes += size;
          stats.categories[cat].files += 1;

          const relPath = path.relative(dirPath, fullPath);
          const fileInfo = {
            name: entry.name,
            relPath,
            path: relPath,
            size,
            category: cat
          };

          if (filesByCategory[cat]) {
            filesByCategory[cat].push(fileInfo);
          }

          recordDirCategoryBytes(relPath, cat, size);

          if (size > 256 * 1024) {
            allFiles.push(fileInfo);
          }
        } catch {
          // 忽略单个读取失败文件
        }
      }
    }

    return currentDirBytes;
  }

  walk(dirPath, 0);

  // 排序最大文件前 15
  allFiles.sort((a, b) => b.size - a.size);
  stats.topLargestFiles = allFiles.slice(0, 15);

  // 排序最大目录前 15
  const sortedDirs = Array.from(dirSizeMap.entries())
    .map(([relPath, bytes]) => ({ relPath, dir: relPath, bytes }))
    .sort((a, b) => b.bytes - a.bytes);
  stats.topLargestDirs = sortedDirs.slice(0, 15);

  // 分类明细：每个分类的 Top 目录与 Top 文件
  stats.categoryDetails = {};
  for (const [catKey, list] of Object.entries(filesByCategory)) {
    list.sort((a, b) => b.size - a.size);
    const catDirMap = dirsByCategory[catKey];
    const topDirs = catDirMap
      ? Array.from(catDirMap.entries())
          .map(([relPath, bytes]) => ({ relPath, dir: relPath, bytes }))
          .sort((a, b) => b.bytes - a.bytes)
          .slice(0, 10)
      : [];

    const catStat = stats.categories[catKey] || { bytes: 0, files: 0 };
    stats.categoryDetails[catKey] = {
      bytes: catStat.bytes,
      files: catStat.files,
      topFiles: list.slice(0, 10).map((f) => ({
        name: f.name,
        relPath: f.relPath,
        path: f.relPath,
        size: f.size,
        category: f.category
      })),
      topDirs
    };
  }

  stats.scanDurationMs = Date.now() - startTime;
  return stats;
}

/**
 * 递归计算某个路径的大小和文件数
 */
export function getFolderTotalSize(targetPath, maxDepth = 10) {
  let bytes = 0;
  let files = 0;
  if (!targetPath || !fs.existsSync(targetPath)) return { bytes: 0, files: 0 };

  function walk(p, d) {
    if (d > maxDepth) return;
    try {
      const stat = fs.statSync(p);
      if (stat.isFile()) {
        bytes += stat.size;
        files += 1;
      } else if (stat.isDirectory()) {
        const entries = fs.readdirSync(p);
        for (const e of entries) {
          walk(path.join(p, e), d + 1);
        }
      }
    } catch {}
  }

  walk(targetPath, 0);
  return { bytes, files };
}

/**
 * 获取 DSH 基础存储目录
 */
export function getDshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

/**
 * 扫描全局 DSH 存储空间指标
 */
export function scanDshGlobalStorage() {
  const dshHome = getDshHome();
  const result = {
    dshHome,
    attachments: { bytes: 0, files: 0 },
    sessions: { bytes: 0, files: 0 },
    projcache: { bytes: 0, files: 0 },
    profiles: { bytes: 0, files: 0 },
    totalDshInternalBytes: 0
  };

  const attDir = path.join(dshHome, 'attachments');
  const sessDir = path.join(dshHome, 'sessions');
  const projDir = path.join(dshHome, 'storages', 'session_projcache');
  const profDir = path.join(dshHome, 'profiles');

  result.attachments = getFolderTotalSize(attDir);
  result.sessions = getFolderTotalSize(sessDir);
  result.projcache = getFolderTotalSize(projDir);
  result.profiles = getFolderTotalSize(profDir);

  result.totalDshInternalBytes =
    result.attachments.bytes +
    result.sessions.bytes +
    result.projcache.bytes +
    result.profiles.bytes;

  return result;
}

/**
 * 获取 macOS 宿主机系统原生标准存储空间（与 macOS 设置/系统信息完全一致，含可清除空间与十进制标称）
 */
function getMacSystemDiskStats() {
  if (process.platform !== 'darwin') return null;
  try {
    const script = '(() => {' +
      'ObjC.import("Foundation");' +
      'var url = $.NSURL.fileURLWithPath("/");' +
      'var error = $();' +
      'var keys = $([$.NSURLVolumeTotalCapacityKey, $.NSURLVolumeAvailableCapacityForImportantUsageKey]);' +
      'var dict = url.resourceValuesForKeysError(keys, error);' +
      'if (!dict) return "";' +
      'var total = dict.objectForKey($.NSURLVolumeTotalCapacityKey).longLongValue;' +
      'var important = dict.objectForKey($.NSURLVolumeAvailableCapacityForImportantUsageKey).longLongValue;' +
      'return total + "," + important;' +
      '})()';
    const raw = child_process.execFileSync('osascript', ['-l', 'JavaScript', '-e', script], {
      encoding: 'utf8',
      timeout: 2000
    }).trim();

    if (raw && raw.includes(',')) {
      const [totalStr, availStr] = raw.split(',');
      const total = Number(totalStr);
      const available = Number(availStr);
      if (total > 0 && available >= 0) {
        const used = Math.max(0, total - available);
        const availablePercent = Number(((available / total) * 100).toFixed(2));
        const usedPercent = Number(((used / total) * 100).toFixed(2));
        return {
          supported: true,
          totalBytes: total,
          freeBytes: available,
          availableBytes: available,
          usedBytes: used,
          usedPercent,
          availablePercent,
          mount: '/'
        };
      }
    }
  } catch (e) {
    // 降级回 POSIX statfs
  }
  return null;
}

/**
 * 获取本地磁盘/文件系统的总容量、可用容量与已用容量
 */
export function getSystemDiskStats() {
  // 1. 在 macOS 平台优先使用系统原生标准 API（包含可清除空间，与系统设置严格对齐）
  if (process.platform === 'darwin') {
    const macStats = getMacSystemDiskStats();
    if (macStats) return macStats;
  }

  // 2. 跨平台标准回退：fs.statfsSync
  try {
    const targetDir = getDshHome() || os.homedir();
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(targetDir);
      const total = Number(stats.blocks) * Number(stats.bsize);
      const free = Number(stats.bfree) * Number(stats.bsize);
      const available = Number(stats.bavail) * Number(stats.bsize);
      const used = Math.max(0, total - available);
      const usedPercent = total > 0 ? Number(((used / total) * 100).toFixed(2)) : 0;
      const availablePercent = total > 0 ? Number(((available / total) * 100).toFixed(2)) : 0;
      return {
        supported: true,
        totalBytes: total,
        freeBytes: free,
        availableBytes: available,
        usedBytes: used,
        usedPercent,
        availablePercent,
        mount: targetDir
      };
    }
  } catch (err) {
    // 降级容错
  }
  return {
    supported: false,
    totalBytes: 0,
    freeBytes: 0,
    availableBytes: 0,
    usedBytes: 0,
    usedPercent: 0,
    availablePercent: 0,
    mount: ''
  };
}
