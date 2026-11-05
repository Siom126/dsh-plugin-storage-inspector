/**
 * 轻量 SemVer 版本号解析 (不依赖任何外部 npm 库)
 *
 * @param {string} v
 * @returns {{ major: number, minor: number, patch: number } | null}
 */
export function parseSemver(v) {
  if (!v || typeof v !== 'string') return null;
  const m = v.match(/^[vV^~=<>]*\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: m[2] !== undefined ? parseInt(m[2], 10) : 0,
    patch: m[3] !== undefined ? parseInt(m[3], 10) : 0
  };
}

/**
 * 格式化 Node 环境分桶展示标签
 */
export function formatBucketLabel(bucketKey) {
  if (!bucketKey || bucketKey === 'unknown') {
    return '未声明 Node 版本 (需前置规范)';
  }
  if (bucketKey.endsWith('-node-multi')) {
    return '多版本 Node 宽松范围 (非确定性)';
  }
  const m = bucketKey.match(/^(.*?)-(.*?)-node(\d+)$/);
  if (m) {
    const osRaw = m[1];
    const arch = m[2];
    const nodeMajor = m[3];
    let osLabel = osRaw;
    if (osRaw === 'darwin') osLabel = 'macOS';
    else if (osRaw === 'linux') osLabel = 'Linux';
    else if (osRaw === 'win32') osLabel = 'Windows';
    return `Node ${nodeMajor} (${osLabel} ${arch})`;
  }
  return bucketKey;
}

/**
 * 跨项目聚合分析、构建漂移矩阵与提取治理发现项
 *
 * @param {Array<import('./types.js').GovernanceProjectSummary & { _dependencies?: import('./types.js').ProjectDependencyItem[] }>} projects
 * @returns {import('./types.js').GovernanceOverviewResponse}
 */
export function analyzeGovernance(projects = []) {
  // 1. 按 Node 桶进行聚类
  const bucketMap = new Map();
  for (const p of projects) {
    const bKey = p.runtime?.bucket || 'unknown';
    if (!bucketMap.has(bKey)) {
      bucketMap.set(bKey, {
        bucketKey: bKey,
        label: formatBucketLabel(bKey),
        confidence: p.runtime?.confidence || 'missing',
        projectCount: 0,
        projectIds: []
      });
    }
    const bGroup = bucketMap.get(bKey);
    bGroup.projectCount += 1;
    bGroup.projectIds.push(p.id);
  }
  const nodeBuckets = Array.from(bucketMap.values());

  // 2. 建立包名全局索引以构建漂移矩阵
  const packageMap = new Map(); // packageName -> { prodCount, devCount, optCount, projects: Map<projectId, Cell> }

  for (const p of projects) {
    const deps = p._dependencies || [];
    for (const d of deps) {
      if (d.declaredOnly) continue; // 忽略仅声明的 peerDependencies

      if (!packageMap.has(d.name)) {
        packageMap.set(d.name, {
          name: d.name,
          kinds: new Set(),
          cells: new Map()
        });
      }
      const pkgEntry = packageMap.get(d.name);
      pkgEntry.kinds.add(d.kind);
      pkgEntry.cells.set(p.id, {
        projectId: p.id,
        projectName: p.name,
        range: d.range,
        resolved: d.resolved,
        exact: d.exact,
        bucket: p.runtime?.bucket || 'unknown'
      });
    }
  }

  // 3. 构建漂移矩阵行 (Dependency Matrix Rows)
  const matrix = [];

  for (const [name, entry] of packageMap.entries()) {
    const consumerCount = entry.cells.size;
    const projectCellMap = Object.fromEntries(entry.cells.entries());
    const cellList = Array.from(entry.cells.values());

    // 确定主要依赖类型: prod 优先，其次 dev，最后 optional
    let kind = 'optional';
    if (entry.kinds.has('prod')) kind = 'prod';
    else if (entry.kinds.has('dev')) kind = 'dev';

    // 检查所有消费者是否在同一个有效 Node 桶内
    const firstBucket = cellList[0]?.bucket;
    const isSameBucket =
      firstBucket &&
      firstBucket !== 'unknown' &&
      !firstBucket.endsWith('-node-multi') &&
      cellList.every((c) => c.bucket === firstBucket);

    const resolvedVersions = Array.from(
      new Set(cellList.map((c) => c.resolved).filter(Boolean))
    );

    let verdict = 'single-consumer';
    let verdictLabel = '单一项目引用';
    let level = 'info';

    if (consumerCount === 1) {
      verdict = 'single-consumer';
      verdictLabel = '单一项目引用';
      level = 'info';
    } else {
      // 两个及以上消费者
      const allHaveResolved = cellList.every((c) => c.resolved !== null);

      if (allHaveResolved) {
        if (resolvedVersions.length === 1) {
          // 全部项目锁定在完全相同的版本
          if (isSameBucket) {
            verdict = 'identical';
            verdictLabel = '完全同版本';
            level = 'candidate';
          } else {
            verdict = 'bucket-conflict';
            verdictLabel = '分桶冲突';
            level = 'blocked';
          }
        } else {
          // 版本存在分歧，对比主版本
          const majors = new Set(
            resolvedVersions.map((v) => parseSemver(v)?.major).filter((m) => m !== undefined)
          );
          if (majors.size > 1) {
            verdict = 'drift-major';
            verdictLabel = '主版本漂移';
            level = 'warn';
          } else {
            verdict = 'drift-minor';
            verdictLabel = '次版本漂移';
            level = 'info';
          }
        }
      } else {
        // 部分或全部项目无锁文件，对比声明范围的主版本
        const rangeMajors = new Set(
          cellList.map((c) => parseSemver(c.resolved || c.range)?.major).filter((m) => m !== undefined)
        );
        if (rangeMajors.size > 1) {
          verdict = 'drift-major';
          verdictLabel = '主版本漂移';
          level = 'warn';
        } else {
          verdict = 'unlocked';
          verdictLabel = '未锁定版本';
          level = 'info';
        }
      }
    }

    matrix.push({
      name,
      kind,
      consumerCount,
      projects: projectCellMap,
      verdict,
      verdictLabel,
      level,
      sameBucket: isSameBucket,
      resolvedVersions
    });
  }

  // 矩阵排序：多消费者优先，严重度高（blocked -> warn -> candidate -> info）优先，包名字母序
  const levelOrder = { blocked: 0, warn: 1, candidate: 2, info: 3 };
  matrix.sort((a, b) => {
    if (b.consumerCount !== a.consumerCount) return b.consumerCount - a.consumerCount;
    const lDiff = (levelOrder[a.level] ?? 4) - (levelOrder[b.level] ?? 4);
    if (lDiff !== 0) return lDiff;
    return a.name.localeCompare(b.name);
  });

  // 4. 治理发现项 (Findings) 生成
  const findings = [];
  let findingCounter = 1;

  // 4.1 分桶冲突 (node-bucket-conflict) - 阻断级
  const bucketConflictRows = matrix.filter((r) => r.verdict === 'bucket-conflict');
  // 按项目对聚合
  const conflictPairs = new Map();
  for (const r of bucketConflictRows) {
    const pIds = Object.keys(r.projects);
    const key = [...pIds].sort().join('::');
    if (!conflictPairs.has(key)) {
      conflictPairs.set(key, { pIds, rows: [] });
    }
    conflictPairs.get(key).rows.push(r);
  }

  for (const [, pair] of conflictPairs.entries()) {
    const projNames = pair.pIds.map((pid) => {
      const p = projects.find((x) => x.id === pid);
      return `${p?.name || pid}(${p?.runtime?.bucket || 'unknown'})`;
    });
    const samplePkgs = pair.rows.slice(0, 5).map((r) => `${r.name}@${r.resolvedVersions[0]}`);
    findings.push({
      id: `finding-bucket-conflict-${findingCounter++}`,
      type: 'node-bucket-conflict',
      level: 'blocked',
      title: `${pair.pIds.map((pid) => projects.find((x) => x.id === pid)?.name || pid).join(' 与 ')} 存在 ${pair.rows.length} 个同版本依赖，但 Node 分桶不同`,
      description: '项目间依赖包版本虽然完全一致，但由于各自锁定的 Node 主版本或运行环境分桶存在差异，强行共享将引发 C++ 扩展 ABI 冲突或模块拓扑断裂。',
      evidence: [
        `项目分桶环境: ${projNames.join(' vs ')}`,
        `涉及同版本依赖包: ${samplePkgs.join(', ')}${pair.rows.length > 5 ? ` 等共 ${pair.rows.length} 个` : ''}`
      ],
      recommendation: '保持项目物理隔离，先确认是否需要统一 Node 主版本基线后再行规划共享。',
      projectIds: pair.pIds,
      packageNames: pair.rows.map((r) => r.name)
    });
  }

  // 4.2 主版本断层漂移 (drift-major) - 警告级
  const driftMajorRows = matrix.filter((r) => r.verdict === 'drift-major');
  for (const r of driftMajorRows) {
    const cells = Object.values(r.projects);
    const evidenceList = cells.map(
      (c) => `${c.projectName}: 声明 ${c.range}${c.resolved ? ` (锁定 v${c.resolved})` : ' (未锁定)'}`
    );
    findings.push({
      id: `finding-drift-major-${findingCounter++}`,
      type: 'drift-major',
      level: 'warn',
      title: `核心依赖存在跨项目主版本断层漂移: ${r.name}`,
      description: `包 ${r.name} 在不同项目中锁定了不同的大版本，跨主版本通常引入重大 Breaking Changes。`,
      evidence: evidenceList,
      recommendation: '建议组织技术评审，确认各项目 API 兼容性，制定主版本统一升级计划。',
      projectIds: Object.keys(r.projects),
      packageNames: [r.name]
    });
  }

  // 4.3 未声明 Node 运行时环境 (unknown-runtime) - 警告级
  for (const p of projects) {
    if (!p.isEmpty && p.runtime?.confidence === 'missing') {
      findings.push({
        id: `finding-unknown-runtime-${findingCounter++}`,
        type: 'unknown-runtime',
        level: 'warn',
        title: `项目缺少 Node 运行环境锁定声明: ${p.name}`,
        description: '项目未配置 .nvmrc、.node-version 或 engines.node，无法建立确定性 Node 分桶，阻断跨项目共享。',
        evidence: [
          '未在项目根目录发现 .nvmrc 或 .node-version 配置文件',
          'package.json 中缺少 engines.node 约束字段'
        ],
        recommendation: '建议在项目根目录添加 .nvmrc 或在 package.json 声明 engines.node，锁定环境基线。',
        projectIds: [p.id]
      });
    }
  }

  // 4.4 兄弟模板孪生识别 (sibling-template) - 提示级
  const activeProjects = projects.filter((p) => !p.isEmpty);
  for (let i = 0; i < activeProjects.length; i++) {
    for (let j = i + 1; j < activeProjects.length; j++) {
      const pA = activeProjects[i];
      const pB = activeProjects[j];
      const setA = new Set((pA._dependencies || []).map((d) => d.name));
      const setB = new Set((pB._dependencies || []).map((d) => d.name));
      if (setA.size < 3 || setB.size < 3) continue;

      const shared = [...setA].filter((name) => setB.has(name));
      const minSize = Math.min(setA.size, setB.size);
      const ratio = shared.length / minSize;

      // 满足重合度 ≥ 50% 或相同依赖数 ≥ 10
      if (shared.length >= 10 || (shared.length >= 4 && ratio >= 0.5)) {
        findings.push({
          id: `finding-sibling-template-${findingCounter++}`,
          type: 'sibling-template',
          level: 'info',
          title: `${pA.name} 与 ${pB.name} 依赖重合率达 ${Math.round(ratio * 100)}%，判定为兄弟模板项目`,
          description: '两项目直接依赖高度重合，属于同源脚手架或分支衍生项目。',
          evidence: [
            `两项目共有 ${shared.length} 个直接依赖完全相同，重合度达 ${Math.round(ratio * 100)}%`,
            `主要共有依赖: ${shared.slice(0, 8).join(', ')}${shared.length > 8 ? ' 等' : ''}`
          ],
          recommendation: '建议将公共依赖与基础设施脚本抽取为共享 Template 或 Monorepo 子包，降低双重维护成本。',
          projectIds: [pA.id, pB.id],
          packageNames: shared
        });
      }
    }
  }

  // 4.5 具备共享条件候选 (exact-candidate) - 候选级
  const identicalRows = matrix.filter((r) => r.verdict === 'identical');
  for (const r of identicalRows) {
    const projNames = Object.values(r.projects).map((c) => c.projectName);
    const bucketName = Object.values(r.projects)[0]?.bucket;
    findings.push({
      id: `finding-candidate-${findingCounter++}`,
      type: 'exact-candidate',
      level: 'candidate',
      title: `具备跨项目物理共享就绪包: ${r.name}@${r.resolvedVersions[0]}`,
      description: '同版本依赖且处于完全相同的 Node 运行环境分桶内，具备立即可用的共享事实基础。',
      evidence: [
        `${r.name}@${r.resolvedVersions[0]} 在同一分桶 (${formatBucketLabel(bucketName)}) 内被 ${r.consumerCount} 个项目引用`,
        `涉及项目: ${projNames.join(', ')}`
      ],
      recommendation: '可直接作为 pnpm store 或 pnpm workspace 共享对齐依赖，零风险复用。',
      projectIds: Object.keys(r.projects),
      packageNames: [r.name]
    });
  }

  // 4.6 缺乏锁文件 (no-lockfile) - 提示级
  for (const p of projects) {
    if (!p.isEmpty && !p.hasLockfile) {
      findings.push({
        id: `finding-no-lockfile-${findingCounter++}`,
        type: 'no-lockfile',
        level: 'info',
        title: `项目缺少依赖锁文件: ${p.name}`,
        description: '项目未检测到 package-lock.json，无法采集确定性 resolved 事实版本，可能存在偶发构建漂移。',
        evidence: [
          '未在项目根目录检测到 package-lock.json',
          '当前仅能采集 package.json 声明范围，无法确保每次安装的一致性'
        ],
        recommendation: '建议运行包管理器生成 lockfile 并提交至版本控制，确保构建结果确定性。',
        projectIds: [p.id]
      });
    }
  }

  // 5. 计算 KPI 大盘指标
  const kpi = {
    totalProjects: projects.length,
    activeProjects: projects.filter((p) => !p.isEmpty).length,
    nodeBucketsCount: nodeBuckets.length,
    identicalPackagesCount: identicalRows.length,
    driftPackagesCount: driftMajorRows.length + matrix.filter((r) => r.verdict === 'drift-minor').length,
    blockedFindingsCount: findings.filter((f) => f.level === 'blocked').length
  };

  // 6. 清理项目中不应直接序列化暴露的私有内部属性
  const cleanProjects = projects.map((p) => {
    const { _dependencies, ...summary } = p;
    return summary;
  });

  return {
    kpi,
    nodeBuckets,
    projects: cleanProjects,
    matrix,
    findings,
    errors: []
  };
}
