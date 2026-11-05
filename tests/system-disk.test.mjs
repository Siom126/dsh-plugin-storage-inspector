import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getSystemDiskStats } from '../lib/scanner.js';

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
});
