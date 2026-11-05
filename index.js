import { createApiHandler } from './lib/api-handler.js';

export const name = 'dsh-plugin-storage-inspector';

export function apply(ctx) {
  const handler = createApiHandler(ctx);

  // 1. 注册原生 WebServer 前缀路由
  ctx.inject(['webServer'], (host) => {
    if (!host || !host.webServer || typeof host.webServer.register !== 'function') {
      return;
    }

    ctx.effect(() => {
      const unregister = host.webServer.register({
        kind: 'prefix',
        path: '/api/storage-inspector',
        handler
      });
      ctx.logger?.info?.('[storage-inspector] WebServer 路由已注册：/api/storage-inspector');
      return unregister;
    });
  });

  // 2. 注入 connection.fetch 作为双重保障（适配不同网络网关与客户端通信机制）
  ctx.inject(['connection'], (scope) => {
    if (!scope || !scope.connection || !scope.connection.fetch || typeof scope.connection.fetch.register !== 'function') {
      return;
    }

    const fetchHandler = async (request) => {
      // 适配 Fetch API Request/Response
      const url = new URL(request.url);
      let rawBody = '';
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        try {
          rawBody = await request.text();
        } catch {}
      }

      return new Promise((resolve) => {
        const reqMock = {
          url: url.pathname + url.search,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          rawBody,
          on(event, cb) {
            if (event === 'data' && rawBody) {
              cb(Buffer.from(rawBody));
            } else if (event === 'end') {
              cb();
            }
            return this;
          }
        };

        const resMock = {
          statusCode: 200,
          headers: {},
          setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
          },
          writeHead(code, headers = {}) {
            this.statusCode = code;
            for (const [k, v] of Object.entries(headers)) {
              this.headers[k.toLowerCase()] = v;
            }
          },
          end(body) {
            resolve(
              new Response(body, {
                status: this.statusCode,
                headers: this.headers
              })
            );
          }
        };

        handler(reqMock, resMock);
      });
    };

    const registeredSubPaths = [
      'data',
      'refresh',
      'workspace',
      'cleanup/targets',
      'cleanup/execute',
      'deps/overview',
      'deps/project',
      'deps/refresh'
    ];

    for (const subPath of registeredSubPaths) {
      scope.connection.fetch.register({
        path: `/api/storage-inspector/${subPath}`,
        methods: ['GET', 'POST'],
        fetch: fetchHandler
      });
    }
    ctx.logger?.info?.('[storage-inspector] Connection Fetch 路由已就绪（含磁盘清理与依赖治理接口）');
  });

  ctx.logger?.info?.('[storage-inspector] 存储空间与磁盘清理插件宿主端加载完成');
}
