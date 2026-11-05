import { discoverProjects } from './project-discovery.js';
import { analyzeGovernance } from './governance-analyzer.js';

export class GovernanceStore {
  constructor(options = {}) {
    this.cacheDurationMs = options.cacheDurationMs ?? 60000; // 默认 60 秒 TTL 缓存
    this.lastScannedAt = 0;
    this.cachedData = null;
    this.isScanning = false;
    this.scanPromise = null;
    this._rawProjects = []; // 内部缓存携带 _dependencies 的原始项目对象
  }

  /**
   * 收集并分析依赖治理数据 (核心底层实现，只读安全)
   */
  async _collectData(workspaceInputs = null) {
    // 1. 第一层与第二、三层：发现项目并提取指纹与锁文件事实
    const projectsWithFacts = discoverProjects(workspaceInputs);
    this._rawProjects = projectsWithFacts;

    // 2. 第四层：治理分析（漂移矩阵、Node分桶、严重度分级、发现项）
    const analysis = analyzeGovernance(projectsWithFacts);

    const now = Date.now();
    return {
      timestamp: now,
      kpi: analysis.kpi,
      nodeBuckets: analysis.nodeBuckets,
      projects: analysis.projects,
      matrix: analysis.matrix,
      findings: analysis.findings,
      errors: analysis.errors || []
    };
  }

  /**
   * 获取依赖治理全景概览数据 (GET /api/storage-inspector/deps/overview)
   * 支持 60 秒内存 TTL 缓存与并发单飞互斥锁 (In-flight Mutex)
   *
   * @param {boolean} [forceRefresh=false] 是否强制跳过缓存重新扫描
   * @param {any} [workspaceInputs] 可选指定工作区路径
   * @returns {Promise<import('./types.js').GovernanceOverviewResponse>}
   */
  async getOverview(forceRefresh = false, workspaceInputs = null) {
    const now = Date.now();

    // 命中 60s 内存缓存
    if (!forceRefresh && this.cachedData && now - this.lastScannedAt < this.cacheDurationMs) {
      const ttl = Math.max(0, Math.round((this.cacheDurationMs - (now - this.lastScannedAt)) / 1000));
      return {
        ...this.cachedData,
        cached: true,
        ttl
      };
    }

    // 并发请求复用正在进行的 Promise
    if (this.isScanning && this.scanPromise) {
      return this.scanPromise;
    }

    this.isScanning = true;
    this.scanPromise = this._collectData(workspaceInputs)
      .then((data) => {
        this.cachedData = data;
        this.lastScannedAt = Date.now();
        this.isScanning = false;
        this.scanPromise = null;
        return {
          ...data,
          cached: false,
          ttl: Math.round(this.cacheDurationMs / 1000)
        };
      })
      .catch((err) => {
        this.isScanning = false;
        this.scanPromise = null;
        throw err;
      });

    return this.scanPromise;
  }

  /**
   * 获取单个项目的完整依赖清单与治理上下文 (GET /api/storage-inspector/deps/project?id=...)
   *
   * @param {string} projectId 项目 ID 或项目名称
   * @returns {Promise<import('./types.js').GovernanceProjectDetailResponse | null>}
   */
  async getProjectDetail(projectId) {
    if (!projectId) return null;

    // 确保数据已就绪
    const overview = await this.getOverview(false);

    // 寻找目标项目 (支持 id, name, 大小写容错匹配)
    const rawProject = this._rawProjects.find(
      (p) =>
        p.id === projectId ||
        p.name === projectId ||
        p.id.toLowerCase() === projectId.toLowerCase() ||
        p.name.toLowerCase() === projectId.toLowerCase() ||
        p.projectPath === projectId
    );

    if (!rawProject) {
      return null;
    }

    const cleanSummary = overview.projects.find((p) => p.id === rawProject.id) || rawProject;
    const dependencies = rawProject._dependencies || [];

    // 关联该项目涉及的治理发现项
    const projectFindings = overview.findings.filter(
      (f) => f.projectIds.includes(rawProject.id) || f.projectIds.includes(rawProject.name)
    );

    // 关联该项目涉及的漂移矩阵行
    const matrixRows = overview.matrix.filter((r) => r.projects && r.projects[rawProject.id]);

    return {
      project: cleanSummary,
      dependencies,
      findings: projectFindings,
      matrixRows
    };
  }
}

export const governanceStore = new GovernanceStore();
