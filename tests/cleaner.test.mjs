import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scanAllCleanupTargets } from '../lib/cleaner.js';

describe('Storage Cleaner Target ID & Uniqueness Tests', () => {
  it('应当为不同工作区的同名构建目录和依赖目录生成唯一的 target.id（防止同前缀截断碰撞）', async () => {
    // 模拟两个具有相同前缀路径的工作区（例如同在 /Users/siom/Desktop/...）
    const mockWorkspaces = [
      { id: 'ws1', title: 'Ecom_BI', path: '/Users/siom/Desktop/Ecom_BI' },
      { id: 'ws2', title: 'AiFilm', path: '/Users/siom/Desktop/AiFilm' }
    ];

    const results = await scanAllCleanupTargets(mockWorkspaces);
    const allTargets = [];
    for (const group of results.groups) {
      for (const target of group.targets) {
        allTargets.push(target);
      }
    }

    // 检查所有 target.id 必须全局唯一
    const idSet = new Set();
    for (const target of allTargets) {
      assert.ok(target.id, 'target.id 不能为空');
      assert.ok(
        !idSet.has(target.id),
        `检测到重复的 target.id: ${target.id} (路径: ${target.path})，会导致前端无法单选！`
      );
      idSet.add(target.id);
    }
  });
});
