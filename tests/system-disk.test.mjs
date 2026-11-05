import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getSystemDiskStats } from '../lib/scanner.js';
import { createApiHandler } from '../lib/api-handler.js';

describe('System Disk Stats Tests', () => {
  it('getSystemDiskStats 应当正确读取或平稳兜底本地存储容量', () => {
    const stats = getSystemDiskStats();
    assert.ok(stats, 'stats 对象不能为 null 或 undefined');
    assert.strictEqual(typeof stats.supported, 'boolean');

    if (stats.supported) {
      assert.ok(stats.totalBytes > 0, '总容量必须大于 0');
      assert.ok(stats.availableBytes >= 0, '可用容量必须大于等于 0');
      assert.ok(stats.usedBytes >= 0, '已用容量必须大于等于 0');
      assert.strictEqual(stats.totalBytes, stats.availableBytes + stats.usedBytes);
      assert.ok(stats.usedPercent >= 0 && stats.usedPercent <= 100, '已用百分比在 0~100 之间');
      assert.ok(stats.availablePercent >= 0 && stats.availablePercent <= 100, '可用百分比在 0~100 之间');
    }
  });

  it('API 路由 GET /api/storage-inspector/disk 应当极速返回磁盘空间统计', async () => {
    const handler = createApiHandler({});
    let statusCode = 0;
    const headers = {};
    let responseBody = '';

    const req = {
      method: 'GET',
      url: '/api/storage-inspector/disk',
      headers: {}
    };

    const res = {
      setHeader(key, val) {
        headers[key] = val;
      },
      writeHead(code) {
        statusCode = code;
      },
      end(body) {
        responseBody = body;
      }
    };

    await handler(req, res);

    assert.strictEqual(statusCode, 200, 'HTTP 状态码应当为 200');
    assert.ok(responseBody, '响应体不能为空');
    const json = JSON.parse(responseBody);
    assert.strictEqual(json.ok, true, 'json.ok 应当为 true');
    assert.ok(json.data, 'json.data 应当包含磁盘数据');
    assert.strictEqual(typeof json.data.supported, 'boolean');
  });
});
