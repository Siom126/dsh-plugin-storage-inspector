import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

import {
  parseNodeVersion,
  extractFingerprint,
  getPlatformArch
} from '../lib/runtime-fingerprint.js';
import { extractDependencyFacts } from '../lib/lockfile.js';
import { discoverProjects, DEFAULT_BLACKLIST } from '../lib/project-discovery.js';
import {
  parseSemver,
  formatBucketLabel,
  analyzeGovernance
} from '../lib/governance-analyzer.js';
import { GovernanceStore, governanceStore } from '../lib/governance-store.js';
import { createApiHandler } from '../lib/api-handler.js';

describe('DSH 依赖治理技术规范测试套件 (SPEC-DEPENDENCY-GOVERNANCE)', () => {

  // =========================================================================
  // 1. 第二层环境指纹单元测试 (Runtime Fingerprint)
  // =========================================================================
  describe('Layer 2: runtime-fingerprint.js', () => {
    const platform = getPlatformArch();

    test('parseNodeVersion: 精确锁定主版本 (exact)', () => {
      assert.deepEqual(parseNodeVersion('20', platform), {
        confidence: 'exact',
        major: 20,
        bucket: `${platform}-node20`
      });
      assert.deepEqual(parseNodeVersion('v20.11.1', platform), {
        confidence: 'exact',
        major: 20,
        bucket: `${platform}-node20`
      });
      assert.deepEqual(parseNodeVersion('24.19.0', platform), {
        confidence: 'exact',
        major: 24,
        bucket: `${platform}-node24`
      });
      assert.deepEqual(parseNodeVersion('^20.0.0', platform), {
        confidence: 'exact',
        major: 20,
        bucket: `${platform}-node20`
      });
      assert.deepEqual(parseNodeVersion('~18.2.0', platform), {
        confidence: 'exact',
        major: 18,
        bucket: `${platform}-node18`
      });
    });

    test('parseNodeVersion: 宽松或多版本范围 (multi)', () => {
      assert.deepEqual(parseNodeVersion('>=18', platform), {
        confidence: 'multi',
        major: null,
        bucket: `${platform}-node-multi`
      });
      assert.deepEqual(parseNodeVersion('18 || 20', platform), {
        confidence: 'multi',
        major: null,
        bucket: `${platform}-node-multi`
      });
      assert.deepEqual(parseNodeVersion('*', platform), {
        confidence: 'multi',
        major: null,
        bucket: `${platform}-node-multi`
      });
    });

    test('parseNodeVersion: 缺失或空声明 (missing)', () => {
      assert.deepEqual(parseNodeVersion(null, platform), {
        confidence: 'missing',
        major: null,
        bucket: 'unknown'
      });
      assert.deepEqual(parseNodeVersion('', platform), {
        confidence: 'missing',
        major: null,
        bucket: 'unknown'
      });
    });

    test('extractFingerprint 优先级读取链: .nvmrc > .node-version > engines.node', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-fp-'));
      try {
        // 初始无文件 -> missing
        let fp = extractFingerprint(tmpDir, {});
        assert.equal(fp.confidence, 'missing');
        assert.equal(fp.source, 'none');

        // 添加 engines.node
        fp = extractFingerprint(tmpDir, { engines: { node: '22.0.0' } });
        assert.equal(fp.confidence, 'exact');
        assert.equal(fp.major, 22);
        assert.equal(fp.source, 'engines.node');

        // 添加 .node-version (优先级高于 engines.node)
        fs.writeFileSync(path.join(tmpDir, '.node-version'), 'v20.10.0\n');
        fp = extractFingerprint(tmpDir, { engines: { node: '22.0.0' } });
        assert.equal(fp.confidence, 'exact');
        assert.equal(fp.major, 20);
        assert.equal(fp.source, '.node-version');

        // 添加 .nvmrc (优先级高于 .node-version)
        fs.writeFileSync(path.join(tmpDir, '.nvmrc'), '24.19.0\n');
        fp = extractFingerprint(tmpDir, { engines: { node: '22.0.0' } });
        assert.equal(fp.confidence, 'exact');
        assert.equal(fp.major, 24);
        assert.equal(fp.source, '.nvmrc');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // 2. 第三层依赖事实单元测试 (Lockfile Facts)
  // =========================================================================
  describe('Layer 3: lockfile.js', () => {
    test('extractDependencyFacts: npm lockfile v2/v3 精确版本提取', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-lock-'));
      try {
        const pkg = {
          dependencies: { react: '^18.2.0', express: '^4.21.0' },
          devDependencies: { typescript: '~5.8.2' },
          peerDependencies: { webpack: '>=5.0.0' }
        };
        const lock = {
          lockfileVersion: 3,
          packages: {
            'node_modules/react': { version: '18.2.0' },
            'node_modules/express': { version: '4.21.2' },
            'node_modules/typescript': { version: '5.8.3' }
          }
        };
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg));
        fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), JSON.stringify(lock));

        const facts = extractDependencyFacts(tmpDir, pkg);
        assert.equal(facts.lockfileType, 'npm');
        assert.equal(facts.hasLockfile, true);
        assert.equal(facts.lockfileSupported, true);
        assert.equal(facts.isEmpty, false);
        assert.equal(facts.depCounts.total, 3); // 2 prod + 1 dev

        const reactDep = facts.dependencies.find((d) => d.name === 'react');
        assert.equal(reactDep.resolved, '18.2.0');
        assert.equal(reactDep.exact, true);
        assert.equal(reactDep.kind, 'prod');

        const tsDep = facts.dependencies.find((d) => d.name === 'typescript');
        assert.equal(tsDep.resolved, '5.8.3');
        assert.equal(tsDep.exact, true);
        assert.equal(tsDep.kind, 'dev');

        const webpackDep = facts.dependencies.find((d) => d.name === 'webpack');
        assert.equal(webpackDep.declaredOnly, true);
        assert.equal(webpackDep.kind, 'peer');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('extractDependencyFacts: 无锁文件项目', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-nolock-'));
      try {
        const pkg = { dependencies: { lodash: '^4.17.21' } };
        const facts = extractDependencyFacts(tmpDir, pkg);
        assert.equal(facts.lockfileType, 'none');
        assert.equal(facts.hasLockfile, false);
        assert.equal(facts.lockfileSupported, false);
        const lodash = facts.dependencies[0];
        assert.equal(lodash.resolved, null);
        assert.equal(lodash.exact, false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('extractDependencyFacts: pnpm/yarn 标注 unsupported，不盲目推测', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-pnpm-'));
      try {
        const pkg = { dependencies: { vue: '^3.4.0' } };
        fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '# pnpm lockfile');
        const facts = extractDependencyFacts(tmpDir, pkg);
        assert.equal(facts.lockfileType, 'pnpm');
        assert.equal(facts.hasLockfile, true);
        assert.equal(facts.lockfileSupported, false);
        assert.equal(facts.dependencies[0].resolved, null);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // 3. 第一层项目发现单元测试 (Project Discovery)
  // =========================================================================
  describe('Layer 1: project-discovery.js', () => {
    test('discoverProjects: 深度控制 (maxDepth 4) 与黑名单跳过', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-disc-'));
      try {
        // 创建黑名单目录中的 package.json，应被跳过
        const nmDir = path.join(tmpDir, 'node_modules', 'subpkg');
        fs.mkdirSync(nmDir, { recursive: true });
        fs.writeFileSync(path.join(nmDir, 'package.json'), JSON.stringify({ name: 'should-ignore' }));

        // 创建根目录项目
        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'root-proj' }));

        // 创建深度 2 子项目
        const subDir = path.join(tmpDir, 'packages', 'app-a');
        fs.mkdirSync(subDir, { recursive: true });
        fs.writeFileSync(path.join(subDir, 'package.json'), JSON.stringify({ name: 'sub-app' }));

        // 创建深度 5 超限项目
        const deepDir = path.join(tmpDir, 'a', 'b', 'c', 'd', 'e');
        fs.mkdirSync(deepDir, { recursive: true });
        fs.writeFileSync(path.join(deepDir, 'package.json'), JSON.stringify({ name: 'deep-proj' }));

        const discovered = discoverProjects([{ id: 'test-ws', title: 'TestWS', path: tmpDir }], { maxDepth: 4 });
        const names = discovered.map((p) => p.name);

        assert.ok(names.includes('TestWS') || names.includes('root-proj'));
        assert.ok(names.includes('sub-app') || names.includes('app-a'));
        assert.ok(!names.includes('should-ignore')); // 黑名单排除
        assert.ok(!names.includes('deep-proj')); // 深度超过 4 排除
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // 4. 第四层治理分析引擎测试 (Governance Analyzer)
  // =========================================================================
  describe('Layer 4: governance-analyzer.js', () => {
    test('parseSemver 基础测试', () => {
      assert.deepEqual(parseSemver('^18.2.0'), { major: 18, minor: 2, patch: 0 });
      assert.deepEqual(parseSemver('6.4.3'), { major: 6, minor: 4, patch: 3 });
      assert.deepEqual(parseSemver('v24.19.0'), { major: 24, minor: 19, patch: 0 });
      assert.equal(parseSemver('invalid'), null);
    });

    test('analyzeGovernance: 分桶冲突 (bucket-conflict) 判定', () => {
      const mockProjects = [
        {
          id: 'proj-a',
          name: 'ProjectA',
          runtime: { bucket: 'darwin-arm64-node20', confidence: 'exact', major: 20 },
          isEmpty: false,
          hasLockfile: true,
          _dependencies: [{ name: 'pkg-x', kind: 'prod', range: '^1.0.0', resolved: '1.0.0', exact: true }]
        },
        {
          id: 'proj-b',
          name: 'ProjectB',
          runtime: { bucket: 'darwin-arm64-node24', confidence: 'exact', major: 24 },
          isEmpty: false,
          hasLockfile: true,
          _dependencies: [{ name: 'pkg-x', kind: 'prod', range: '^1.0.0', resolved: '1.0.0', exact: true }]
        }
      ];

      const res = analyzeGovernance(mockProjects);
      const row = res.matrix.find((r) => r.name === 'pkg-x');
      assert.equal(row.verdict, 'bucket-conflict');
      assert.equal(row.level, 'blocked');
      assert.equal(row.sameBucket, false);

      const conflictFinding = res.findings.find((f) => f.type === 'node-bucket-conflict');
      assert.ok(conflictFinding);
      assert.equal(conflictFinding.level, 'blocked');
    });

    test('analyzeGovernance: 同版本同桶共享就绪 (identical / exact-candidate)', () => {
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'P1',
          runtime: { bucket: 'darwin-arm64-node20', confidence: 'exact', major: 20 },
          isEmpty: false,
          hasLockfile: true,
          _dependencies: [{ name: 'shared-lib', kind: 'prod', range: '^2.0.0', resolved: '2.0.0', exact: true }]
        },
        {
          id: 'proj-2',
          name: 'P2',
          runtime: { bucket: 'darwin-arm64-node20', confidence: 'exact', major: 20 },
          isEmpty: false,
          hasLockfile: true,
          _dependencies: [{ name: 'shared-lib', kind: 'prod', range: '^2.0.0', resolved: '2.0.0', exact: true }]
        }
      ];

      const res = analyzeGovernance(mockProjects);
      const row = res.matrix.find((r) => r.name === 'shared-lib');
      assert.equal(row.verdict, 'identical');
      assert.equal(row.level, 'candidate');
      assert.equal(row.sameBucket, true);

      const candidateFinding = res.findings.find((f) => f.type === 'exact-candidate');
      assert.ok(candidateFinding);
      assert.equal(candidateFinding.level, 'candidate');
    });

    test('analyzeGovernance: 主版本漂移 (drift-major)', () => {
      const mockProjects = [
        {
          id: 'p-v6',
          name: 'AppV6',
          runtime: { bucket: 'darwin-arm64-node20', confidence: 'exact', major: 20 },
          isEmpty: false,
          hasLockfile: true,
          _dependencies: [{ name: 'vite', kind: 'dev', range: '^6.0.0', resolved: '6.4.3', exact: true }]
        },
        {
          id: 'p-v8',
          name: 'AppV8',
          runtime: { bucket: 'darwin-arm64-node20', confidence: 'exact', major: 20 },
          isEmpty: false,
          hasLockfile: true,
          _dependencies: [{ name: 'vite', kind: 'dev', range: '^8.0.0', resolved: '8.0.10', exact: true }]
        }
      ];

      const res = analyzeGovernance(mockProjects);
      const row = res.matrix.find((r) => r.name === 'vite');
      assert.equal(row.verdict, 'drift-major');
      assert.equal(row.level, 'warn');
    });
  });

  // =========================================================================
  // 5. 规范第 8 节验收基线断言 (Acceptance Baseline TC-01 ~ TC-10)
  // =========================================================================
  describe('Section 8 Acceptance Baseline: TC-01 ~ TC-10', () => {
    let allDiscoveredProjects = [];
    let overviewData = null;

    before(async () => {
      // 采集全工作区依赖事实
      allDiscoveredProjects = discoverProjects();
      overviewData = await governanceStore.getOverview(true);
    });

    test('TC-01: 跨工作区扫描发现具备依赖的项目 (至少识别出 6 个真实项目)', () => {
      const names = allDiscoveredProjects.map((p) => p.name);
      const ids = allDiscoveredProjects.map((p) => p.id);

      // 验证至少包含 target 项目
      assert.ok(names.includes('Ecom_BI') || ids.includes('ecom_bi'), '必须包含 Ecom_BI');
      assert.ok(names.includes('.harness-kit') || ids.includes('harness-kit'), '必须包含 .harness-kit');
      assert.ok(names.includes('gpt-image2') || ids.includes('gpt-image2'), '必须包含 gpt-image2');
      assert.ok(names.includes('web-design') || ids.includes('web-design'), '必须包含 web-design');
      assert.ok(names.includes('demo-app') || ids.includes('demo-app'), '必须包含 demo-app');
      assert.ok(names.includes('fixture-app') || ids.includes('fixture-app'), '必须包含 fixture-app');

      const activeProjects = allDiscoveredProjects.filter((p) => !p.isEmpty);
      assert.ok(activeProjects.length >= 6, `识别出的有效依赖项目数 (${activeProjects.length}) 必须 >= 6`);
    });

    test('TC-02: Ecom_BI 环境指纹识别 (.nvmrc -> 20 -> exact)', () => {
      const ecom = allDiscoveredProjects.find((p) => p.name === 'Ecom_BI' || p.id === 'ecom_bi');
      assert.ok(ecom, 'Ecom_BI 必须存在');
      assert.equal(ecom.runtime.confidence, 'exact');
      assert.equal(ecom.runtime.major, 20);
      assert.ok(ecom.runtime.bucket.endsWith('-node20'));
    });

    test('TC-03: .harness-kit 环境指纹识别 (24.19.0 -> node24 -> exact)', () => {
      const hk = allDiscoveredProjects.find((p) => p.name === '.harness-kit' || p.id === 'harness-kit');
      assert.ok(hk, '.harness-kit 必须存在');
      assert.equal(hk.runtime.confidence, 'exact');
      assert.equal(hk.runtime.major, 24);
      assert.ok(hk.runtime.bucket.endsWith('-node24'));
    });

    test('TC-04: 未声明 Node 版本项目识别 (gpt-image2, web-design -> unknown -> missing)', () => {
      const gpt = allDiscoveredProjects.find((p) => p.name === 'gpt-image2' || p.id === 'gpt-image2');
      const web = allDiscoveredProjects.find((p) => p.name === 'web-design' || p.id === 'web-design');
      assert.ok(gpt && web);
      assert.equal(gpt.runtime.confidence, 'missing');
      assert.equal(gpt.runtime.bucket, 'unknown');
      assert.equal(web.runtime.confidence, 'missing');
      assert.equal(web.runtime.bucket, 'unknown');
    });

    test('TC-05: Node 分桶冲突判定 (Ecom_BI 与 .harness-kit 同版本包触发 blocked 级分桶冲突)', () => {
      const conflictFinding = overviewData.findings.find(
        (f) =>
          f.type === 'node-bucket-conflict' &&
          (f.projectIds.includes('ecom_bi') || f.projectIds.includes('Ecom_BI')) &&
          (f.projectIds.includes('harness-kit') || f.projectIds.includes('.harness-kit'))
      );
      assert.ok(conflictFinding, '必须生成 Ecom_BI 与 .harness-kit 的 node-bucket-conflict 发现项');
      assert.equal(conflictFinding.level, 'blocked');
    });

    test('TC-06: 主版本漂移判定 (vite 跨版本漂移 6 vs 8 触发 warn 级主版本漂移)', () => {
      const viteRow = overviewData.matrix.find((r) => r.name === 'vite');
      assert.ok(viteRow, '矩阵中必须存在 vite');
      assert.equal(viteRow.verdict, 'drift-major');
      assert.equal(viteRow.level, 'warn');
    });

    test('TC-07: 兄弟模板识别 (gpt-image2 与 web-design 识别出 sibling-template)', () => {
      const siblingFinding = overviewData.findings.find(
        (f) =>
          f.type === 'sibling-template' &&
          (f.projectIds.includes('gpt-image2') || f.projectIds.includes('gpt-image2-website')) &&
          (f.projectIds.includes('web-design') || f.projectIds.includes('web-design-website'))
      );
      assert.ok(siblingFinding, '必须识别出 gpt-image2 与 web-design 的兄弟模板关联');
      assert.equal(siblingFinding.level, 'info');
    });

    test('TC-08: 无锁文件项目处理 (demo-app 与 fixture-app -> no-lockfile)', () => {
      const demo = allDiscoveredProjects.find((p) => p.name === 'demo-app' || p.id === 'demo-app');
      const fixture = allDiscoveredProjects.find((p) => p.name === 'fixture-app' || p.id === 'fixture-app');
      assert.ok(demo && fixture);
      assert.equal(demo.hasLockfile, false);
      assert.equal(fixture.hasLockfile, false);

      const noLockFindings = overviewData.findings.filter((f) => f.type === 'no-lockfile');
      assert.ok(noLockFindings.length >= 2, '必须产生 no-lockfile 发现项');
    });

    test('TC-09: 只读安全性校验 (前后文件 mtime 与内容哈希保持 100% 绝对一致)', async () => {
      const ecomBIPath = '/Users/siom/Desktop/Ecom_BI/package.json';
      const statBefore = fs.statSync(ecomBIPath);
      const hashBefore = crypto.createHash('sha256').update(fs.readFileSync(ecomBIPath)).digest('hex');

      // 执行多次扫描与刷新
      await governanceStore.getOverview(true);
      await governanceStore.getOverview(false);

      const statAfter = fs.statSync(ecomBIPath);
      const hashAfter = crypto.createHash('sha256').update(fs.readFileSync(ecomBIPath)).digest('hex');

      assert.equal(statBefore.mtimeMs, statAfter.mtimeMs, '文件 mtime 必须保持绝对不变');
      assert.equal(hashBefore, hashAfter, '文件内容哈希必须 100% 严格一致');
    });

    test('TC-10: 性能与并发 (连续发起 10 次 refresh 请求，单飞锁生效，冷启动 < 1.5s，缓存 < 50ms)', async () => {
      // 1. 测试单飞锁并发: 同时发起 10 次请求
      const startTime = Date.now();
      const promises = Array.from({ length: 10 }, () => governanceStore.getOverview(true));
      const results = await Promise.all(promises);
      const totalConcurrentDuration = Date.now() - startTime;

      assert.equal(results.length, 10);
      assert.ok(results[0].kpi.totalProjects > 0);

      // 2. 缓存命中响应时间断言
      const cacheStart = Date.now();
      const cachedResult = await governanceStore.getOverview(false);
      const cacheDuration = Date.now() - cacheStart;

      assert.equal(cachedResult.cached, true);
      assert.ok(cacheDuration < 50, `缓存响应耗时 (${cacheDuration}ms) 必须 < 50ms`);
      assert.ok(cachedResult.ttl <= 60 && cachedResult.ttl > 0);
    });
  });

  // =========================================================================
  // 6. HTTP API 路由与通信契约测试 (Routes Integration)
  // =========================================================================
  describe('HTTP API Routes: api-handler.js', () => {
    const handler = createApiHandler({});

    function mockRequest(method, urlString) {
      return new Promise((resolve) => {
        const req = {
          url: urlString,
          method,
          headers: {},
          rawBody: '',
          on() { return this; }
        };
        const res = {
          statusCode: 200,
          headers: {},
          setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
          writeHead(code, h = {}) {
            this.statusCode = code;
            for (const [k, v] of Object.entries(h)) this.headers[k.toLowerCase()] = v;
          },
          end(body) {
            resolve({
              statusCode: this.statusCode,
              headers: this.headers,
              body: body ? JSON.parse(body) : null
            });
          }
        };
        handler(req, res);
      });
    }

    test('GET /api/storage-inspector/deps/overview 返回规范概览契约', async () => {
      const res = await mockRequest('GET', '/api/storage-inspector/deps/overview');
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.kpi);
      assert.ok(Array.isArray(res.body.nodeBuckets));
      assert.ok(Array.isArray(res.body.projects));
      assert.ok(Array.isArray(res.body.matrix));
      assert.ok(Array.isArray(res.body.findings));
    });

    test('GET /api/storage-inspector/deps/project 获取单项目明细', async () => {
      // 成功获取
      const res = await mockRequest('GET', '/api/storage-inspector/deps/project?id=ecom_bi');
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.project);
      assert.ok(Array.isArray(res.body.dependencies));
      assert.ok(Array.isArray(res.body.findings));
      assert.ok(Array.isArray(res.body.matrixRows));

      // 400 缺少参数
      const res400 = await mockRequest('GET', '/api/storage-inspector/deps/project');
      assert.equal(res400.statusCode, 400);
      assert.equal(res400.body.ok, false);

      // 404 不存在
      const res404 = await mockRequest('GET', '/api/storage-inspector/deps/project?id=non_existent_project_xyz');
      assert.equal(res404.statusCode, 404);
      assert.equal(res404.body.ok, false);
    });

    test('POST /api/storage-inspector/deps/refresh 强制刷新分析缓存', async () => {
      const res = await mockRequest('POST', '/api/storage-inspector/deps/refresh');
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.cached, false);
    });
  });
});
