import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { getDshHome, BUILD_DIR_NAMES, DEP_DIR_NAMES } from './scanner.js';

/**
 * 递归计算目录大小与文件数
 */
export function getDirStats(dirPath) {
  let size = 0;
  let count = 0;
  if (!dirPath || typeof dirPath !== 'string') return { size: 0, count: 0, exists: false };
  try {
    if (!fs.existsSync(dirPath)) return { size: 0, count: 0, exists: false };
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return { size: stat.size, count: 1, exists: true };
    }
  } catch {
    return { size: 0, count: 0, exists: false };
  }

  const stack = [dirPath];
  while (stack.length > 0) {
    const cur = stack.pop();
    try {
      const entries = fs.readdirSync(cur, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(cur, entry.name);
        try {
          if (entry.isDirectory()) {
            stack.push(full);
          } else if (entry.isFile()) {
            size += fs.statSync(full).size;
            count++;
          }
        } catch {}
      }
    } catch {}
  }
  return { size, count, exists: true };
}

/**
 * 获取已知可清理系统与开发缓存列表
 */
export function getSystemCacheTargets() {
  const home = os.homedir();
  return [
    {
      id: 'cache-uv',
      name: 'Python uv 依赖构建与 Wheel 缓存',
      category: 'system_caches',
      risk: 'safe', // safe | low_risk | warning | danger
      defaultSelected: true,
      path: path.join(home, '.cache', 'uv'),
      description:
        'Python 极速包管理器下载的 Wheel 编译轮子与源码构建暂存。清理后下次使用 uv 会按需重新拉取，完全不影响已有的虚拟环境或全局 Python。',
      tags: ['开发工具', '推荐清理', '100%安全']
    },
    {
      id: 'cache-citrolabs',
      name: 'ego-browser (Citro Labs) 网页与渲染缓存',
      category: 'system_caches',
      risk: 'safe',
      defaultSelected: true,
      path: path.join(home, 'Library', 'Caches', 'Citro Labs'),
      description:
        '多模态自动化 Chromium 浏览器运行过程中沉淀的 HTTP 缓存与 GPU 渲染缓存。仅清理临时运行时缓存，用户登录凭据、Cookie 与配置文件安全保留在 Application Support 中。',
      tags: ['浏览器缓存', '推荐清理', '保留登录态']
    },
    {
      id: 'cache-npm',
      name: 'Node.js npm 全局包下载缓存',
      category: 'system_caches',
      risk: 'safe',
      defaultSelected: true,
      path: path.join(home, '.npm'),
      description:
        'npm 包管理器在安装依赖时下载的 tarball 归档文件。清理后不影响任何已安装项目，下次 npm install 时会自动重新拉取。',
      tags: ['Node.js', '推荐清理', '100%安全']
    },
    {
      id: 'cache-pnpm',
      name: 'pnpm 包下载与网络元数据缓存',
      category: 'system_caches',
      risk: 'safe',
      defaultSelected: true,
      path: path.join(home, 'Library', 'Caches', 'pnpm'),
      description:
        'pnpm 的下载归档与元数据缓存。不影响全局硬链接包池 (~/Library/pnpm)，清理后可安全释放空间。',
      tags: ['pnpm', '推荐清理', '100%安全']
    },
    {
      id: 'cache-homebrew',
      name: 'Homebrew 安装包下载缓存',
      category: 'system_caches',
      risk: 'safe',
      defaultSelected: true,
      path: path.join(home, 'Library', 'Caches', 'Homebrew'),
      description:
        'Homebrew 安装命令行工具时下载的 bottles 安装归档。安装完成后即可安全清理。',
      tags: ['系统包管理', '推荐清理']
    },
    {
      id: 'cache-billion-context',
      name: 'Billion-Context 引擎临时分析缓存',
      category: 'system_caches',
      risk: 'safe',
      defaultSelected: true,
      path: path.join(home, '.cache', 'billion-context'),
      description: '大模型长上下文分块引擎分析过程产生的临时分块与索引数据。',
      tags: ['AI引擎', '临时缓存']
    },
    {
      id: 'cache-playwright',
      name: 'Playwright 无头浏览器运行时缓存',
      category: 'system_caches',
      risk: 'safe',
      defaultSelected: false,
      path: path.join(home, 'Library', 'Caches', 'ms-playwright'),
      description: 'Playwright 自动化无头浏览器下载的临时文件或旧版本内核驱动。',
      tags: ['测试框架']
    }
  ];
}

/**
 * 扫描全量可清理目标项（结合系统、工作区构建产物、已归档对话与项目依赖）
 */
export async function scanAllCleanupTargets(workspacesData = []) {
  const home = os.homedir();
  const dshHome = getDshHome();

  const results = {
    scannedAt: Date.now(),
    totalCleanableBytes: 0,
    safeCleanableBytes: 0,
    groups: [
      {
        id: 'system_caches',
        title: '🟢 推荐安全清理（无风险·系统与工具缓存）',
        risk: 'safe',
        description: '纯临时下载与运行渲染缓存，清理后完全不影响个人代码与工具账号登录状态',
        targets: []
      },
      {
        id: 'workspace_builds',
        title: '🟡 工作区项目构建产物（低风险·可重新构建）',
        risk: 'low_risk',
        description: '项目打包与构建临时输出目录（如 dist、build、.turbo），执行 build 命令即可重新生成',
        targets: []
      },
      {
        id: 'dsh_archives',
        title: '🟠 DSH 已归档历史对话记录（按需清理）',
        risk: 'warning',
        description: '在 DSH 中已被手动归档的历史会话磁盘文件（包含 jsonl.zstd 记录及投影缓存）',
        targets: []
      },
      {
        id: 'workspace_dependencies',
        title: '🔴 工作区依赖深度清理（谨慎操作·需重新安装）',
        risk: 'danger',
        description: '项目本地依赖包（如 node_modules、venv），清理后必须重新执行包管理安装命令',
        targets: []
      }
    ]
  };

  const groupMap = new Map();
  for (const g of results.groups) {
    groupMap.set(g.id, g);
  }

  // 1. 扫描系统与工具缓存
  const sysTargets = getSystemCacheTargets();
  for (const st of sysTargets) {
    const stats = getDirStats(st.path);
    if (stats.exists && stats.size > 0) {
      const item = {
        id: st.id,
        name: st.name,
        category: 'system_caches',
        risk: st.risk,
        defaultSelected: st.defaultSelected,
        path: st.path,
        size: stats.size,
        files: stats.count,
        description: st.description,
        tags: st.tags || []
      };
      groupMap.get('system_caches').targets.push(item);
      results.totalCleanableBytes += stats.size;
      results.safeCleanableBytes += stats.size;
    }
  }

  // 2. 扫描工作区构建产物与开发依赖
  const wsPathsMap = new Map();
  for (const w of workspacesData) {
    if (w.path && fs.existsSync(w.path)) {
      wsPathsMap.set(w.path, w.title || path.basename(w.path));
    }
  }

  // 额外排查桌面常见核心工程
  const desktopDir = path.join(home, 'Desktop');
  if (fs.existsSync(desktopDir)) {
    try {
      const dItems = fs.readdirSync(desktopDir, { withFileTypes: true });
      for (const it of dItems) {
        if (it.isDirectory() && !it.name.startsWith('.')) {
          const full = path.join(desktopDir, it.name);
          if (!wsPathsMap.has(full)) {
            wsPathsMap.set(full, it.name);
          }
        }
      }
    } catch {}
  }

  const buildTargetNames = ['dist', 'build', '.turbo', '.next', '.nuxt', 'out', 'temp_audio', 'temp_subtitles'];
  const depTargetNames = ['node_modules', 'venv', '.venv'];

  for (const [wsPath, wsTitle] of wsPathsMap.entries()) {
    // 检查工作区根目录下的构建产物
    for (const bName of buildTargetNames) {
      const targetDir = path.join(wsPath, bName);
      const bStats = getDirStats(targetDir);
      if (bStats.exists && bStats.size > 0) {
        const item = {
          id: `build-${crypto.createHash('sha256').update(targetDir).digest('hex').slice(0, 16)}`,
          name: `[${wsTitle}] 构建目录 (${bName}/)`,
          category: 'workspace_builds',
          risk: 'low_risk',
          defaultSelected: true,
          path: targetDir,
          workspacePath: wsPath,
          workspaceTitle: wsTitle,
          size: bStats.size,
          files: bStats.count,
          description: `位于工作区 ${wsTitle} 的构建产物目录，执行项目构建命令即可随时重新生成。`,
          tags: ['构建产物', wsTitle]
        };
        groupMap.get('workspace_builds').targets.push(item);
        results.totalCleanableBytes += bStats.size;
        results.safeCleanableBytes += bStats.size;
      }
    }

    // 检查工作区二级子目录（例如 AiFilm/garden-skills/dist 等）
    try {
      const subEntries = fs.readdirSync(wsPath, { withFileTypes: true });
      for (const sub of subEntries) {
        if (sub.isDirectory() && !sub.name.startsWith('.') && sub.name !== 'node_modules') {
          const subPath = path.join(wsPath, sub.name);
          for (const bName of buildTargetNames) {
            const targetDir = path.join(subPath, bName);
            const bStats = getDirStats(targetDir);
            if (bStats.exists && bStats.size > 0) {
              const item = {
                id: `build-${crypto.createHash('sha256').update(targetDir).digest('hex').slice(0, 16)}`,
                name: `[${wsTitle}/${sub.name}] 构建目录 (${bName}/)`,
                category: 'workspace_builds',
                risk: 'low_risk',
                defaultSelected: true,
                path: targetDir,
                workspacePath: wsPath,
                workspaceTitle: wsTitle,
                size: bStats.size,
                files: bStats.count,
                description: `位于 ${wsTitle}/${sub.name} 子项目的构建产物，可重新生成。`,
                tags: ['子工程产物', wsTitle]
              };
              groupMap.get('workspace_builds').targets.push(item);
              results.totalCleanableBytes += bStats.size;
              results.safeCleanableBytes += bStats.size;
            }
          }
        }
      }
    } catch {}

    // 检查工作区依赖模块 (node_modules 等)
    for (const dName of depTargetNames) {
      const targetDir = path.join(wsPath, dName);
      const dStats = getDirStats(targetDir);
      if (dStats.exists && dStats.size > 0) {
        const item = {
          id: `dep-${crypto.createHash('sha256').update(targetDir).digest('hex').slice(0, 16)}`,
          name: `[${wsTitle}] 第三方依赖 (${dName}/)`,
          category: 'workspace_dependencies',
          risk: 'danger',
          defaultSelected: false,
          path: targetDir,
          workspacePath: wsPath,
          workspaceTitle: wsTitle,
          size: dStats.size,
          files: dStats.count,
          description: `⚠️ 警告：工作区 ${wsTitle} 的项目依赖。清理后该项目无法直接运行，需在项目终端运行包安装命令（如 pnpm install / npm install）方可恢复。`,
          tags: ['开发依赖', wsTitle, '需重新安装']
        };
        groupMap.get('workspace_dependencies').targets.push(item);
        results.totalCleanableBytes += dStats.size;
      }
    }
  }

  // 3. 扫描 DSH 已归档历史对话记录
  try {
    const wsJsonPath = path.join(dshHome, 'storages', 'workspace.json');
    if (fs.existsSync(wsJsonPath)) {
      const wsJson = JSON.parse(fs.readFileSync(wsJsonPath, 'utf8'));
      const archivedIds = new Set(wsJson.global?.archivedSessionIds || []);
      if (archivedIds.size > 0) {
        let archBytes = 0;
        let archFiles = 0;
        const archPaths = [];

        // 检查 ~/.dsh/sessions/ 下归档文件
        const sessionsBase = path.join(dshHome, 'sessions');
        if (fs.existsSync(sessionsBase)) {
          const encDirs = fs.readdirSync(sessionsBase);
          for (const ed of encDirs) {
            const ep = path.join(sessionsBase, ed);
            try {
              if (!fs.statSync(ep).isDirectory()) continue;
              const sDirs = fs.readdirSync(ep);
              for (const sd of sDirs) {
                if (archivedIds.has(sd) || archivedIds.has(`session-${sd}`)) {
                  const sp = path.join(ep, sd);
                  const st = getDirStats(sp);
                  archBytes += st.size;
                  archFiles += st.count;
                  archPaths.push(sp);
                }
              }
            } catch {}
          }
        }

        // 检查 projection cache 下归档文件
        const projDir = path.join(dshHome, 'storages', 'session_projcache', 'sessions');
        if (fs.existsSync(projDir)) {
          for (const sid of archivedIds) {
            const rawId = sid.replace(/^session-/, '');
            const pf = path.join(projDir, `${rawId}.json`);
            if (fs.existsSync(pf)) {
              try {
                const stat = fs.statSync(pf);
                archBytes += stat.size;
                archFiles++;
                archPaths.push(pf);
              } catch {}
            }
          }
        }

        if (archBytes > 0) {
          const item = {
            id: 'dsh-archived-sessions',
            name: `DSH 历史已归档对话数据 (${archivedIds.size} 个对话)`,
            category: 'dsh_archives',
            risk: 'warning',
            defaultSelected: false,
            path: `~/.dsh/sessions/ (共 ${archPaths.length} 个归档会话目录)`,
            archivedPaths: archPaths,
            size: archBytes,
            files: archFiles,
            description:
              'DSH 中已被标记为归档的历史对话数据包（包含 jsonl.zstd 历史记录与投影缓存）。清理后不影响当前活跃对话，可释放对话历史存储空间。',
            tags: ['会话记录', '已归档历史']
          };
          groupMap.get('dsh_archives').targets.push(item);
          results.totalCleanableBytes += archBytes;
        }
      }
    }
  } catch (err) {
    console.error('[storage-cleaner] Error scanning archived sessions:', err);
  }

  return results;
}

/**
 * 校验路径是否在严谨的安全白名单内，坚决杜绝误删系统或重要用户资产
 */
export function isPathSafeToClean(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  const resolved = path.resolve(targetPath);
  const home = os.homedir();

  // 绝对禁止的系统关键路径
  const FORBIDDEN_EXACT = [
    '/',
    '/System',
    '/Library',
    '/Applications',
    '/Users',
    '/private',
    '/opt',
    '/usr',
    home,
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    path.join(home, 'Downloads'),
    path.join(home, 'Pictures'),
    path.join(home, 'Library'),
    path.join(home, 'Library', 'Application Support'),
    path.join(home, '.dsh'),
    path.join(home, '.dsh', 'profiles')
  ];

  for (const f of FORBIDDEN_EXACT) {
    if (resolved === f) return false;
  }

  // 必须位于用户主目录下
  if (!resolved.startsWith(home + path.sep)) {
    return false;
  }

  // 检查已知系统安全缓存目录
  const allowedCachePrefixes = [
    path.join(home, '.cache', 'uv'),
    path.join(home, 'Library', 'Caches', 'Citro Labs'),
    path.join(home, '.npm'),
    path.join(home, 'Library', 'Caches', 'pnpm'),
    path.join(home, 'Library', 'Caches', 'Homebrew'),
    path.join(home, '.cache', 'billion-context'),
    path.join(home, 'Library', 'Caches', 'ms-playwright')
  ];

  for (const ac of allowedCachePrefixes) {
    if (resolved === ac || resolved.startsWith(ac + path.sep)) {
      return true;
    }
  }

  // 检查 DSH 已归档对话目录
  const dshSessionsPrefix = path.join(home, '.dsh', 'sessions');
  const dshProjcachePrefix = path.join(home, '.dsh', 'storages', 'session_projcache', 'sessions');
  if (resolved.startsWith(dshSessionsPrefix + path.sep) || resolved.startsWith(dshProjcachePrefix + path.sep)) {
    return true;
  }

  // 检查工作区内的构建或依赖目录（只允许指定名字的叶子目录）
  const baseName = path.basename(resolved);
  const isBuildDir = BUILD_DIR_NAMES.has(baseName);
  const isDepDir = DEP_DIR_NAMES.has(baseName);

  if (isBuildDir || isDepDir) {
    // 确保它确实位于子级，且不是根
    const parent = path.dirname(resolved);
    if (parent !== home && parent !== path.join(home, 'Desktop')) {
      return true;
    }
  }

  return false;
}

/**
 * 执行清理指定的目标 ID 列表
 */
export async function executeCleanup(targetIds = [], allTargets = []) {
  const targetIdSet = new Set(targetIds);
  const cleanedList = [];
  const errorsList = [];
  let totalFreedBytes = 0;

  for (const target of allTargets) {
    if (!targetIdSet.has(target.id)) continue;

    // 特殊处理 DSH 归档对话
    if (target.id === 'dsh-archived-sessions' && Array.isArray(target.archivedPaths)) {
      let archFreed = 0;
      for (const ap of target.archivedPaths) {
        if (!isPathSafeToClean(ap)) {
          errorsList.push({ targetId: target.id, path: ap, error: '安全防护机制拦截：路径不在白名单中' });
          continue;
        }
        try {
          if (fs.existsSync(ap)) {
            const st = getDirStats(ap);
            fs.rmSync(ap, { recursive: true, force: true });
            archFreed += st.size;
          }
        } catch (err) {
          errorsList.push({ targetId: target.id, path: ap, error: err.message });
        }
      }
      totalFreedBytes += archFreed;
      cleanedList.push({
        id: target.id,
        name: target.name,
        path: target.path,
        freedBytes: archFreed
      });
      continue;
    }

    // 常规目录清理
    const targetPath = target.path;
    if (!isPathSafeToClean(targetPath)) {
      errorsList.push({
        targetId: target.id,
        path: targetPath,
        error: '安全防护机制拦截：该路径受保护，拒绝删除'
      });
      continue;
    }

    try {
      if (fs.existsSync(targetPath)) {
        const stats = getDirStats(targetPath);
        fs.rmSync(targetPath, { recursive: true, force: true });
        totalFreedBytes += stats.size;
        cleanedList.push({
          id: target.id,
          name: target.name,
          path: targetPath,
          freedBytes: stats.size
        });
      } else {
        cleanedList.push({
          id: target.id,
          name: target.name,
          path: targetPath,
          freedBytes: 0,
          note: '目录此前已被清理或不存在'
        });
      }
    } catch (err) {
      errorsList.push({
        targetId: target.id,
        path: targetPath,
        error: err.message || '删除失败'
      });
    }
  }

  return {
    ok: errorsList.length === 0 || cleanedList.length > 0,
    cleanedCount: cleanedList.length,
    errorCount: errorsList.length,
    totalFreedBytes,
    cleanedList,
    errorsList
  };
}
