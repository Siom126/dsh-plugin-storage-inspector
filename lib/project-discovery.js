import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractFingerprint } from './runtime-fingerprint.js';
import { extractDependencyFacts } from './lockfile.js';

export const DEFAULT_BLACKLIST = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '.turbo',
  '.cache',
  'vendor',
  'target',
  '.venv',
  'venv',
  '.agent-teams',
  'tmp',
  'temp'
];

/**
 * 自动从 DSH 全局配置及会话缓存中发现活跃工作区目录
 *
 * @returns {Array<{ id: string, title: string, path: string }>}
 */
export function getDshWorkspaceList() {
  const list = [];
  const seenPaths = new Set();
  const dshHome = path.join(os.homedir(), '.dsh');

  // 1. 读取 workspace.json
  const wsJsonPath = path.join(dshHome, 'storages', 'workspace.json');
  if (fs.existsSync(wsJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(wsJsonPath, 'utf8'));
      const wsTable = data.tables?.workspaces || {};
      for (const [id, info] of Object.entries(wsTable)) {
        if (info.path && fs.existsSync(info.path) && !seenPaths.has(info.path)) {
          seenPaths.add(info.path);
          list.push({
            id,
            title: info.title || path.basename(info.path) || '工作区',
            path: info.path
          });
        }
      }
    } catch {}
  }

  // 2. 读取 session_projcache (补充关联过的主机工作区，例如 AiFilm)
  const projCacheDir = path.join(dshHome, 'storages', 'session_projcache', 'sessions');
  if (fs.existsSync(projCacheDir)) {
    try {
      const files = fs.readdirSync(projCacheDir);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const content = JSON.parse(fs.readFileSync(path.join(projCacheDir, f), 'utf8'));
          const cwd = content.record?.identity?.cwd;
          if (cwd && fs.existsSync(cwd) && !seenPaths.has(cwd)) {
            seenPaths.add(cwd);
            list.push({
              id: path.basename(cwd),
              title: path.basename(cwd),
              path: cwd
            });
          }
        } catch {}
      }
    } catch {}
  }

  return list;
}

/**
 * 格式化规范项目名称与唯一 ID
 */
function deriveProjectIdentity(projectDir, workspacePath, workspaceTitle, pkg) {
  const isRoot = projectDir === workspacePath;
  const folder = path.basename(projectDir);

  let name = '';
  if (isRoot) {
    if (workspaceTitle && workspaceTitle !== '工作区') {
      name = workspaceTitle;
    } else if (pkg.name && pkg.name !== 'react-example' && pkg.name !== 'my-app' && pkg.name !== 'blogpulse-app') {
      name = pkg.name;
    } else {
      name = folder;
    }
  } else {
    // 嵌套项目，对典型模板工程名归一化识别
    if (folder.endsWith('-website')) {
      name = folder.replace(/-website$/, '');
    } else if (folder === '.harness-kit') {
      name = '.harness-kit';
    } else if (folder === 'demo-app') {
      name = 'demo-app';
    } else if (folder === 'fixture-app') {
      name = 'fixture-app';
    } else if (pkg.name && !['react-example', 'my-app', 'blogpulse-app', 'ecom-bi-sop-pack'].includes(pkg.name)) {
      name = pkg.name;
    } else {
      name = folder;
    }
  }

  // 生成稳定的项目 ID
  let id = name;
  if (name.startsWith('.')) {
    id = name.slice(1);
  }
  id = id.toLowerCase().replace(/[^a-z0-9_.-]/g, '-');
  if (isRoot && workspaceTitle) {
    id = workspaceTitle.toLowerCase().replace(/[^a-z0-9_.-]/g, '-');
  }

  return { name, id };
}

/**
 * 递归发现指定工作区下的所有具备 package.json 的项目
 *
 * @param {Array<string | { id?: string, title?: string, path: string }>} [workspaceInputs]
 * @param {{ maxDepth?: number, blacklist?: string[] }} [options]
 * @returns {Array<import('./types.js').GovernanceProjectSummary & { _dependencies: import('./types.js').ProjectDependencyItem[] }>}
 */
export function discoverProjects(workspaceInputs = null, options = {}) {
  const maxDepth = options.maxDepth ?? 4;
  const blacklist = new Set(options.blacklist || DEFAULT_BLACKLIST);

  let rawList = workspaceInputs;
  if (!rawList || rawList.length === 0) {
    rawList = getDshWorkspaceList();
  }

  // 统一输入格式为 { id, title, path }
  const normalizedWorkspaces = rawList.map((item) => {
    if (typeof item === 'string') {
      return { id: path.basename(item), title: path.basename(item), path: item };
    }
    return {
      id: item.id || path.basename(item.path || ''),
      title: item.title || path.basename(item.path || '') || '工作区',
      path: item.path
    };
  }).filter((ws) => ws.path && fs.existsSync(ws.path));

  const projects = [];
  const globalVisitedRealpaths = new Set();
  const seenProjectIds = new Set();

  for (const ws of normalizedWorkspaces) {
    function walk(currentDir, depth) {
      if (depth > maxDepth) return;

      let real;
      try {
        real = fs.realpathSync(currentDir);
      } catch {
        return;
      }
      if (globalVisitedRealpaths.has(real)) return;
      globalVisitedRealpaths.add(real);

      // 检查当前目录下是否有 package.json
      const pkgPath = path.join(currentDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          const isRoot = currentDir === ws.path;
          const relativePath = path.relative(ws.path, currentDir);
          const nested = !isRoot;

          const { name, id: baseId } = deriveProjectIdentity(currentDir, ws.path, ws.title, pkg);
          let uniqueId = baseId;
          let counter = 2;
          while (seenProjectIds.has(uniqueId)) {
            uniqueId = `${baseId}-${counter}`;
            counter++;
          }
          seenProjectIds.add(uniqueId);

          const runtime = extractFingerprint(currentDir, pkg);
          const facts = extractDependencyFacts(currentDir, pkg);

          projects.push({
            id: uniqueId,
            name,
            workspaceName: ws.title,
            workspacePath: ws.path,
            projectPath: currentDir,
            relativePath,
            isRoot,
            nested,
            packageManager: pkg.packageManager || null,
            lockfileType: facts.lockfileType,
            hasLockfile: facts.hasLockfile,
            lockfileSupported: facts.lockfileSupported,
            runtime,
            depCounts: facts.depCounts,
            isEmpty: facts.isEmpty,
            _dependencies: facts.dependencies
          });
        } catch (e) {
          // 忽略非法 package.json 但记录日志
        }
      }

      // 继续递归子目录
      let entries = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (blacklist.has(entry.name)) continue;
        walk(path.join(currentDir, entry.name), depth + 1);
      }
    }

    walk(ws.path, 0);
  }

  return projects;
}
