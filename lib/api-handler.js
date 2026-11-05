import { workspaceStore } from './workspace-store.js';
import { scanAllCleanupTargets, executeCleanup } from './cleaner.js';
import { governanceStore } from './governance-store.js';
import { getSystemDiskStats } from './scanner.js';

async function parseJsonBody(req) {
  if (req.rawBody !== undefined) {
    if (!req.rawBody) return {};
    try {
      return JSON.parse(req.rawBody);
    } catch {
      return {};
    }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        req.destroy?.();
        resolve({});
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export function createApiHandler(ctx) {
  return async (req, res) => {
    // 设置通用安全头与缓存策略
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const pathname = url.pathname.replace(/\/+$/, ''); // 去除末尾斜杠统一处理

      // 路由 0: GET /api/storage-inspector/disk (极速读取本地磁盘空间统计)
      if (pathname === '/api/storage-inspector/disk') {
        const disk = getSystemDiskStats();
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, data: disk }));
        return;
      }

      // 路由 1: GET /api/storage-inspector/data (获取存储全景分析数据)
      if (pathname === '/api/storage-inspector/data') {
        const forceRefresh = url.searchParams.get('refresh') === 'true' || req.method === 'POST';
        const data = await workspaceStore.getStorageData(forceRefresh);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      // 路由 2: POST /api/storage-inspector/refresh (强制重新扫描)
      if (pathname === '/api/storage-inspector/refresh') {
        const data = await workspaceStore.getStorageData(true);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, data }));
        return;
      }

      // 路由 3: GET /api/storage-inspector/workspace (单个工作区明细)
      if (pathname === '/api/storage-inspector/workspace') {
        const wsId = url.searchParams.get('id');
        const data = await workspaceStore.getStorageData(false);
        const ws = data.workspaces.find((w) => w.id === wsId || w.path === wsId);
        if (!ws) {
          res.writeHead(404);
          res.end(JSON.stringify({ ok: false, error: '未找到指定工作区' }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, workspace: ws }));
        return;
      }

      // 路由 4: GET /api/storage-inspector/cleanup/targets (扫描全量可清理项)
      if (pathname === '/api/storage-inspector/cleanup/targets') {
        const storageData = await workspaceStore.getStorageData(false);
        const cleanupData = await scanAllCleanupTargets(storageData.workspaces || []);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, data: cleanupData }));
        return;
      }

      // 路由 5: POST /api/storage-inspector/cleanup/execute (执行安全清理)
      if (pathname === '/api/storage-inspector/cleanup/execute') {
        const body = await parseJsonBody(req);
        const targetIds = Array.isArray(body.targetIds) ? body.targetIds : [];

        if (targetIds.length === 0) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: '未提供需要清理的目标项 ID' }));
          return;
        }

        // 重新扫描以获取确切的绝对路径
        const storageData = await workspaceStore.getStorageData(false);
        const cleanupData = await scanAllCleanupTargets(storageData.workspaces || []);
        const allTargets = [];
        for (const g of cleanupData.groups || []) {
          for (const t of g.targets || []) {
            allTargets.push(t);
          }
        }

        // 执行清理
        const execResult = await executeCleanup(targetIds, allTargets);

        // 清理完成后自动刷新存储大盘缓存
        workspaceStore.getStorageData(true).catch(() => {});

        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, ...execResult }));
        return;
      }

      // ===== 依赖治理只读 API (SPEC-DEPENDENCY-GOVERNANCE) =====

      // 路由 6: GET /api/storage-inspector/deps/overview (获取跨项目依赖治理总览)
      if (pathname === '/api/storage-inspector/deps/overview') {
        const forceRefresh = url.searchParams.get('refresh') === 'true';
        const data = await governanceStore.getOverview(forceRefresh);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, ...data, data }));
        return;
      }

      // 路由 7: GET /api/storage-inspector/deps/project (单个项目依赖事实与详情)
      if (pathname === '/api/storage-inspector/deps/project') {
        const projectId = url.searchParams.get('id');
        if (!projectId) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: '未提供项目 ID 参数' }));
          return;
        }
        const detail = await governanceStore.getProjectDetail(projectId);
        if (!detail) {
          res.writeHead(404);
          res.end(JSON.stringify({ ok: false, error: '未找到指定项目' }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, ...detail, data: detail }));
        return;
      }

      // 路由 8: POST /api/storage-inspector/deps/refresh (强制刷新依赖治理分析缓存)
      if (pathname === '/api/storage-inspector/deps/refresh') {
        const data = await governanceStore.getOverview(true);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, ...data, data }));
        return;
      }

      // 默认回退：全量存储分析数据
      const data = await workspaceStore.getStorageData(false);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, data }));
    } catch (err) {
      console.error('[storage-inspector] API request error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: err.message || '服务器内部错误' }));
    }
  };
}
