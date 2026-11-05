# DSH 跨项目依赖治理技术规范 (SPEC-DEPENDENCY-GOVERNANCE)

> **版本**：v1.0.0-final  
> **状态**：Normative (基准规范)  
> **角色**：系统架构师 (architect)  
> **下游受众**：backend-engineer (P1 后端开发), frontend-engineer (P2 前端实现), git-manager (版本与 Commit 规划)  
> **基准对话来源**：历史会话 `session-1f92bd5d-b780-4cf5-bbca-2b03e8510dd0` (seq: 421, 432, 442) 最终确立方案

---

## 目录

1. [定位与架构边界 (Architecture Principles & Boundary)](#1-定位与架构边界)
2. [四层事实链架构模型 (Four-Layer Fact Chain Model)](#2-四层事实链架构模型)
   - [2.1 第一层：项目发现 (Project Discovery)](#21-第一层项目发现-project-discovery)
   - [2.2 第二层：环境指纹 (Runtime Fingerprint)](#22-第二层环境指纹-runtime-fingerprint)
   - [2.3 第三层：依赖事实 (Dependency Facts)](#23-第三层依赖事实-dependency-facts)
   - [2.4 第四层：治理分析 (Governance Analyzer)](#24-第四层治理分析-governance-analyzer)
3. [严重度与判定等级系统 (Severity & Verdict Classification)](#3-严重度与判定等级系统)
4. [数据契约与类型定义 (Data Contracts & TypeScript Definitions)](#4-数据契约与类型定义)
5. [HTTP API 路由与通信契约 (HTTP API Routes Specification)](#5-http-api-路由与通信契约)
6. [后端模块职责与工程划分 (Backend Implementation Blueprint)](#6-后端模块职责与工程划分)
7. [前端视图结构与交互契约 (Frontend UI & Interaction Blueprint)](#7-前端视图结构与交互契约)
8. [验收基线与真实测试夹具 (Acceptance Baseline & Test Fixtures)](#8-验收基线与真实测试夹具)
9. [红线与反模式 (Anti-Patterns & Architectural Guardrails)](#9-红线与反模式)

---

## 1. 定位与架构边界

### 1.1 产品定位
- **模块名称**：`依赖治理 (Dependency Governance)`，作为 `dsh-plugin-storage-inspector` 的第三个主视图（与“全景存储分析”、“磁盘清理中心”并列）。
- **核心定位**：**只读跨项目依赖治理平台**。先准确认定事实，再提供治理建议，由开发者自主决策与执行。
- **核心价值**：
  1. 准确呈现跨项目依赖的“真实身份”而非模糊推测；
  2. 暴露 Node 运行环境分桶与版本漂移隐患；
  3. 清晰标记兄弟模板、重包独占及可共享候选；
  4. 为未来团队采用标准包管理器（如 pnpm store / pnpm workspace）提供客观的数据支撑。

### 1.2 绝对边界与红线
1. **零写操作 (Zero-Write)**：
   - 严禁调用任何包管理器 CLI（`npm install`, `pnpm add`, `yarn` 等）；
   - 严禁修改任何项目的 `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `node_modules` 或文件系统中的任何项目代码；
   - 严禁通过符号链接或硬链接将 `node_modules` 内部包目录重定向到中央共享池；
   - 严禁自动执行 semver 升降级求解；
   - 治理 API 的 `POST /api/storage-inspector/deps/refresh` 仅代表“强制刷新后端分析缓存”，底层只执行只读文件读取。
2. **不自建 CAS (Content-Addressable Storage)**：
   - 坚决不在 `~/.dsh/` 下自建所谓的 `shared-modules` 全局符号链接存储池（前期实测证实：自建链接会导致 `Cannot find module 'react'` 等 peerDependencies 跨目录拓扑断裂问题，且极易引入 ABI 冲突与权限脏状态）。
3. **V1 计量边界（只看包身份，不看虚假 MB）**：
   - V1 依赖治理严禁用现有递归 stat 猜测“可节省 XXX MB”；
   - 原因：现有 scanner 会跳过 symlink、对 hardlink 多次重复计数，给出模糊或错误的字节数会制造虚假指标。V1 专注于**包数、版本一致性、环境分桶与漂移严重度**。

---

## 2. 四层事实链架构模型

```
           [ DSH 工作区配置 / Workspace Store ]
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ ① 项目发现 (project-discovery.js)                           │
│   • 深度上限 4，跳过忽略黑名单                              │
│   • 真实路径 (realpath) 去重，标记 nested (嵌套/monorepo)   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ ② 环境指纹 (runtime-fingerprint.js)                         │
│   • .nvmrc > .node-version > engines.node > .tool-versions  │
│   • 提取 OS + Arch + Node 主版本 -> 生成 bucket key         │
│   • 置信度判定 (exact / multi / missing)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ ③ 依赖事实 (lockfile.js)                                    │
│   • 声明范围 (dependencies / devDeps / optionalDeps)        │
│   • 解析 package-lock.json (v1/v2/v3) -> 提取 resolved      │
│   • pnpm/yarn lock 标注 unsupported，避免模糊猜测           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ ④ 治理分析 (governance-analyzer.js)                         │
│   • 跨项目同名包聚合 -> 版本漂移矩阵 (Matrix Rows)          │
│   • 判定同桶共享候选 (exact-candidate)                      │
│   • 暴露分桶冲突 (node-bucket-conflict) 与主漂移 (drift-major)│
│   • 挖掘兄弟模板 (sibling-template) 与大包独占 (heavy-single)│
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
          [ 只读 HTTP API & 前端治理主视图 ]
```

### 2.1 第一层：项目发现 (Project Discovery)
- **输入**：DSH 活跃工作区路径列表（由 `workspaceStore.getWorkspaces()` 提供）。
- **扫描逻辑**：
  1. 递归探测工作区目录下的 `package.json` 文件；
  2. **最大递归深度**：`maxDepth = 4`；
  3. **绝对排除黑名单目录**：
     `node_modules`, `.git`, `.next`, `dist`, `build`, `out`, `coverage`, `.turbo`, `.cache`, `vendor`, `target`, `.venv`, `venv`, `.agent-teams`, `tmp`, `temp`。
  4. **路径去重**：使用 `fs.realpathSync` 解析物理路径，避免符号链接循环；若目标路径不在工作区管辖物理目录内，则跳过。
  5. **结构标记**：
     - 若 `package.json` 所在目录即为工作区根目录，标记 `isRoot: true`；
     - 若在子目录下发现，标记 `nested: true`，记录 `relativePath`（便于识别 monorepo 子包或示例站）。
  6. **空项目容错**：统计直接声明依赖总数，若总数为 0 标记 `isEmpty: true`（前端默认折叠）。

### 2.2 第二层：环境指纹 (Runtime Fingerprint)
Node 原生 C++ 扩展（如 sharp, esbuild, canvas, sqlite3）与 Node ABI 强绑定，必须在相同的操作系统、CPU 架构与 Node 主版本下才能安全共享。
- **输入**：项目根目录路径及 `package.json` 内容。
- **优先级读取链**：
  1. `.nvmrc`（文本首行去除 `v` 前缀）；
  2. `.node-version`（文本首行去除 `v` 前缀）；
  3. `package.json` 中 `engines.node` 字段；
  4. `.tool-versions` 中 `nodejs` 声明；
  5. `mise.toml` / `volta.node`（如存在）。
- **平台指纹采集**：`process.platform + '-' + process.arch`（如 `darwin-arm64`, `linux-x64`, `win32-x64`）。
- **解析与置信度规则**：
  - **Exact (精确匹配)**：如 `20`, `20.11.1`, `v20.x`, `^20.0.0`, `~20.10.0`
    -> 主版本锁定为 `node20`，`confidence = 'exact'`，生成桶键：`{platform}-{arch}-node20`（例如 `darwin-arm64-node20`）。
  - **Multi / Range (多版本或宽松范围)**：如 `>=18`, `18 || 20`, `*`, `^18.0.0 || ^20.0.0`
    -> 无法锁定单一主版本，`confidence = 'multi'`，桶键标记为 `{platform}-{arch}-node-multi`。**规则：多版本范围不得参与“可安全共享”判定。**
  - **Missing (缺失声明)**：未探测到任何版本声明文件
    -> `confidence = 'missing'`，桶键标记为 `unknown`。**规则：未声明环境的项目直接阻断“可安全共享”结论，并给出 warning 引导。**

### 2.3 第三层：依赖事实 (Dependency Facts)
- **输入**：项目 `package.json` 与同目录锁文件。
- **直接依赖分类**：
  - `dependencies` -> 生产依赖 (`prod`)
  - `devDependencies` -> 开发依赖 (`dev`)
  - `optionalDependencies` -> 可选依赖 (`optional`)
  - `peerDependencies` -> 仅做声明记录 (`peer`)，标注 `declaredOnly: true`，不计入项目本地必须安装实体。
- **锁定版本提取 (Lockfile Extraction)**：
  - **npm `package-lock.json`**：
    - `lockfileVersion` 2 或 3：解析根级 `packages["node_modules/" + name]`，提取 `version` 与 `resolved`；
    - `lockfileVersion` 1：递归回溯顶层 `dependencies[name].version` 作为兜底；
    - 成功提取时：`hasLockfile: true`, `lockfileType: 'npm'`, `resolved: "x.y.z"`, `exact: true`。
  - **无锁文件 (No Lockfile)**：
    - `hasLockfile: false`, `lockfileType: 'none'`, `resolved: null`, `exact: false`。仅显示声明范围（如 `^18.2.0`），标注“未锁定”。
  - **pnpm / yarn 锁文件**：
    - 若探测到 `pnpm-lock.yaml` 或 `yarn.lock`：
    - V1 策略：**不随意猜测**，标记 `lockfileType: 'pnpm' | 'yarn'`, `supported: false`，只展示 package.json 声明范围，不虚构 resolved 版本。
- **包管理器标识**：读取 `package.json` 的 `packageManager`（如 `pnpm@9.1.0`, `yarn@1.22.19`），无则置空。

### 2.4 第四层：治理分析 (Governance Analyzer)
分析引擎基于聚合事实库，生成两类核心数据产物：**版本漂移矩阵 (Matrix)** 和 **治理发现项 (Findings)**。

#### 1. 版本漂移矩阵生成算法：
1. 建立包名全景索引 `Map<packageName, { kind, projectEntries }>`；
2. 针对每一个被至少两个项目引用的包名进行对比：
   - 提取各项目的 `resolved`（或 `range`）与 `nodeBucket`；
   - 检查所有引用的 `nodeBucket` 是否相同：
     - 若存在不同的 Node 桶，标记 `sameBucket = false`；
   - 检查所有引用的版本：
     - 若版本字符串完全一致且 `sameBucket === true` -> `verdict = 'identical'`（完全一致）；
     - 若主版本不同（如 `v6.x` vs `v8.x`）-> `verdict = 'drift-major'`（主版本漂移）；
     - 若主版本相同但次版本/补丁不同（如 `v18.2.0` vs `v18.3.1`）-> `verdict = 'drift-minor'`（次版本漂移）；
     - 若有项目缺少 lockfile -> `verdict = 'unlocked'`；
     - 若在完全相同版本但分桶不同 -> `verdict = 'bucket-conflict'`。

#### 2. 治理发现 (Findings) 提取规则：
- **`node-bucket-conflict`**：同名包在两个及以上项目中版本一致，但项目的 Node 桶不同（严重阻断共享）。
- **`drift-major`**：重要依赖（如 `react`, `vue`, `vite`, `next`, `typescript`）存在跨主版本差异，提示升级阻抗。
- **`drift-minor`**：次版本或补丁差异，提示有对齐潜力。
- **`unknown-runtime` / `node-version-missing`**：项目缺少运行时环境锁定，提示治理前置风险。
- **`sibling-template`**：两个项目的直接依赖重合率超过 50%，判定为孪生模板项目（如 demo-app 与 fixture-app）。
- **`exact-candidate`**：同名包在相同 Node 桶内完全锁定为同一版本，且项目数 ≥ 2（具备共享事实基础）。
- **`no-lockfile`**：项目缺乏版本锁定文件，造成无法推断确定性事实。

---

## 3. 严重度与判定等级系统

治理模型将所有发现项划分为 4 个严谨的严重度等级：

| 等级代码 (Level) | 中文标签 | 视觉标识 | 语义解释与行动准则 |
| :--- | :--- | :--- | :--- |
| **`blocked`** | 阻断 / 风险阻断 | 🛑 红色标签 | **存在硬性环境冲突或破坏性共享隐患**。<br>典型场景：同版本依赖但 Node 主版本不同（如 Node 20 vs Node 24）、操作系统/架构不匹配。<br>**准则**：坚决禁止共享，必须先对齐 Node 基线或明确隔离。 |
| **`warn`** | 警告 / 漂移关注 | ⚠️ 橙色标签 | **存在显著规范缺失或主版本断层**。<br>典型场景：主版本漂移（`drift-major`）、项目未声明 Node 运行环境（`unknown-runtime`）。<br>**准则**：阻断“可共享”建议，提示人工评估与升级。 |
| **`candidate`** | 候选 / 共享就绪 | ❇️ 绿色标签 | **完全具备共享或对齐条件**。<br>典型场景：同名同版本包位于相同 Node 桶内（`exact-candidate`）。<br>**准则**：可被 pnpm workspace / pnpm store 物理共享。 |
| **`info`** | 提示 / 结构洞察 | ℹ️ 蓝色/灰色标签 | **客观结构现状洞察**。<br>典型场景：次版本补丁差异（`drift-minor`）、兄弟模板关联（`sibling-template`）、未带锁文件（`no-lockfile`）、大包独占（`heavy-single`）。<br>**准则**：作为辅助决策依据，无需紧急处置。 |

---

## 4. 数据契约与类型定义

以下数据契约必须在前后端严格遵循，后端字段命名全部使用小驼峰（camelCase）。

```ts
/**
 * 运行时环境指纹
 */
export interface RuntimeFingerprint {
  declared: string | null;           // 声明值，如 '20', '24.19.0', '>=18'
  source: '.nvmrc' | '.node-version' | 'engines.node' | '.tool-versions' | 'none';
  confidence: 'exact' | 'multi' | 'missing';
  bucket: string;                    // 如 'darwin-arm64-node20', 'darwin-arm64-node-multi', 'unknown'
  platform: string;                  // 如 'darwin-arm64', 'linux-x64'
  major: number | null;              // 解析出的主版本号，如 20，多版本或未知为 null
  note?: string | null;
}

/**
 * 单个项目依赖事实
 */
export interface ProjectDependencyItem {
  name: string;                      // 包名，如 'react'
  kind: 'prod' | 'dev' | 'optional' | 'peer';
  range: string;                     // 声明版本范围，如 '^18.2.0'
  resolved: string | null;           // 锁定的精确版本，如 '18.2.0'，无锁时为 null
  exact: boolean;                    // 是否有确定的精确版本
  declaredOnly?: boolean;            // 是否仅声明（如 peerDependencies）
}

/**
 * 项目治理摘要
 */
export interface GovernanceProjectSummary {
  id: string;                        // 项目唯一标识，如 'ecom-bi' 或相对路径哈希
  name: string;                      // 项目名称（来自 package.json.name 或目录名）
  workspaceName: string;             // 所属工作区名称
  workspacePath: string;             // 所属工作区根路径
  projectPath: string;               // package.json 所在绝对目录
  relativePath: string;              // 相对工作区路径，如 '' 或 'apps/web'
  isRoot: boolean;                   // 是否在工作区根目录
  nested: boolean;                   // 是否嵌套子项目
  packageManager?: string | null;    // 如 'pnpm@9.1.0', 'npm'
  lockfileType: 'npm' | 'pnpm' | 'yarn' | 'none';
  hasLockfile: boolean;
  lockfileSupported: boolean;        // npm 为 true，pnpm/yarn 在 V1 为 false
  runtime: RuntimeFingerprint;       // 环境指纹
  depCounts: {
    prod: number;
    dev: number;
    optional: number;
    total: number;
  };
  isEmpty: boolean;                  // 0 依赖项目
}

/**
 * 漂移矩阵中的单项目引用格
 */
export interface MatrixProjectCell {
  projectId: string;
  projectName: string;
  range: string;
  resolved: string | null;
  exact: boolean;
  bucket: string;
}

/**
 * 跨项目依赖漂移矩阵行
 */
export interface DependencyMatrixRow {
  name: string;                      // 包名
  kind: 'prod' | 'dev' | 'optional'; // 主要依赖类型
  consumerCount: number;             // 引用此包的项目数
  projects: Record<string, MatrixProjectCell>; // key 为 projectId
  verdict: 'identical' | 'drift-major' | 'drift-minor' | 'bucket-conflict' | 'unlocked' | 'single-consumer';
  verdictLabel: string;              // 中文判定文本，如 '完全同版本' | '主版本漂移' | '分桶冲突'
  level: 'candidate' | 'warn' | 'blocked' | 'info';
  sameBucket: boolean;               // 所有引用项目是否在同一 Node 桶内
  resolvedVersions: string[];        // 涉及的全部不重复 resolved 版本列表
}

/**
 * 治理发现项 (Finding)
 */
export interface GovernanceFinding {
  id: string;                        // 唯一标识，如 'bucket-conflict-ecom-harness'
  type: 'node-bucket-conflict' | 'drift-major' | 'drift-minor' | 'unknown-runtime' | 'sibling-template' | 'exact-candidate' | 'no-lockfile';
  level: 'blocked' | 'warn' | 'candidate' | 'info';
  title: string;                     // 简明标题
  description?: string;              // 详细说明
  evidence: string[];                // 事实依据证据链（2-4条）
  recommendation: string;            // 架构与治理建议
  projectIds: string[];              // 涉及项目 ID 列表
  packageNames?: string[];           // 涉及包名（可选）
}

/**
 * Node 环境分桶聚类
 */
export interface NodeBucketGroup {
  bucketKey: string;                 // 如 'darwin-arm64-node20'
  label: string;                     // 展示名称，如 'Node 20 (macOS arm64)'
  confidence: 'exact' | 'multi' | 'missing';
  projectCount: number;
  projectIds: string[];
}

/**
 * 治理概览 API 返回契约 (GET /api/storage-inspector/deps/overview)
 */
export interface GovernanceOverviewResponse {
  timestamp: number;
  cached: boolean;
  ttl: number;                       // 缓存剩余有效秒数
  kpi: {
    totalProjects: number;
    activeProjects: number;          // 非空项目数
    nodeBucketsCount: number;
    identicalPackagesCount: number;  // 完全一致的同版本包数
    driftPackagesCount: number;      // 发生漂移的包数
    blockedFindingsCount: number;    // 阻断级发现项数
  };
  nodeBuckets: NodeBucketGroup[];    // Node 环境分桶列表
  projects: GovernanceProjectSummary[]; // 项目列表
  matrix: DependencyMatrixRow[];     // 跨项目依赖矩阵
  findings: GovernanceFinding[];     // 治理发现项列表
  errors?: { projectPath: string; error: string }[];
}

/**
 * 单项目详情 API 返回契约 (GET /api/storage-inspector/deps/project?id=<id>)
 */
export interface GovernanceProjectDetailResponse {
  project: GovernanceProjectSummary;
  dependencies: ProjectDependencyItem[];
  findings: GovernanceFinding[];     // 该项目相关的发现项
  matrixRows: DependencyMatrixRow[]; // 该项目涉及的矩阵行
}
```

---

## 5. HTTP API 路由与通信契约

所有 API 挂载在既有插件前缀 `/api/storage-inspector/` 下，保持只读纯净性。

### 5.1 概览接口：`GET /api/storage-inspector/deps/overview`
- **功能**：拉取跨项目依赖治理总览数据（KPI、Node 分桶、项目列表、漂移矩阵与发现项）。
- **缓存策略**：内存 TTL 缓存 60 秒。高并发或多次切换 Tab 时直接命中内存，保障响应时间 < 50ms。
- **冷启动指标**：首屏无缓存扫描响应时间 < 1500ms（基于 4-8 个项目）。
- **请求参数**：无。
- **返回状态**：
  - `200 OK`：返回符合 `GovernanceOverviewResponse` 结构的 JSON 数据。
  - `500 Internal Error`：若扫描发生全局未捕获异常，返回 `{ error: string }`。单个项目解析失败不得导致全局 500。

### 5.2 单项目详情：`GET /api/storage-inspector/deps/project`
- **功能**：获取指定项目的完整依赖清单与上下文。
- **请求参数**：`?id=<projectId>`（必填，URL 编码的项目 ID）。
- **返回状态**：
  - `200 OK`：返回符合 `GovernanceProjectDetailResponse` 结构的 JSON 数据。
  - `400 Bad Request`：未传递 `id` 参数。
  - `404 Not Found`：未找到对应项目。

### 5.3 强制刷新：`POST /api/storage-inspector/deps/refresh`
- **功能**：绕过 60 秒内存缓存，重新执行项目发现与事实链分析。
- **语义说明**：仅代表“刷新后端分析缓存”，依然**绝对不执行任何文件系统写操作**。
- **并发控制**：内部互斥锁（Mutex）。若上一次扫描尚未结束，后续请求复用正在进行的 Promise，防止 I/O 风暴。
- **返回状态**：
  - `200 OK`：返回刷新后的最新 `GovernanceOverviewResponse`。

---

## 6. 后端模块职责与工程划分

代码平铺存放在 `dsh-plugin-storage-inspector/lib/` 目录下，与现有架构保持严格一致：

| 模块文件 | 核心职责与设计原则 | 预估代码行 |
| :--- | :--- | :--- |
| **`lib/project-discovery.js`** | 扫描工作区内所有 `package.json`，深度控制（4层），排除目录黑名单，解析 `realpath` 去重，标记 `nested`。导出 `discoverProjects(workspacePaths)`。 | ~120 行 |
| **`lib/runtime-fingerprint.js`** | 按优先级解析 `.nvmrc` / `.node-version` / `engines.node` / `.tool-versions`，确定平台 (`darwin-arm64` 等) 与 Node 主版本，计算置信度与桶键。导出 `extractFingerprint(projectDir, pkgJson)`。 | ~100 行 |
| **`lib/lockfile.js`** | 解析 npm `package-lock.json` (v1/v2/v3)，支持提取依赖项精确 `resolved` 版本；探测 pnpm / yarn 锁并返回 `unsupported` 状态。导出 `extractDependencyFacts(projectDir, pkgJson)`。 | ~180 行 |
| **`lib/governance-analyzer.js`** | 跨项目聚合分析、构建版本漂移矩阵、计算 Node 分桶冲突、提取严重度等级与结构化治理发现项。导出 `analyzeGovernance(projectsWithFacts)`。 | ~220 行 |
| **`lib/governance-store.js`** | 治理数据集中缓存管理器，封装 60s TTL 缓存、单飞互斥锁（In-flight lock）与强制刷新接口。导出 `governanceStore` 单例。 | ~90 行 |
| **`lib/api-handler.js`** *(修改)* | 挂载 3 条治理路由，将请求转发给 `governanceStore`。 | +40 行 |
| **`index.js`** *(修改)* | 在 WebServer 的 `registeredSubPaths` 集合中追加 3 条依赖治理路由路径。 | +5 行 |
| **`tests/governance.test.mjs`** | 使用 Node 原生测试套件 (`node:test` + `node:assert`)，覆盖四层事实链单元测试与真实 fixture 场景断言。 | ~220 行 |

**依赖约束**：
- **零外部 npm 依赖引入**：全部使用 Node.js 原生标准库（`fs`, `path`, `os`）；
- semver 版本比较只解析形如 `X.Y.Z` 的数字分量进行对比，不引入体积庞大的 `semver` 库。

---

## 7. 前端视图结构与交互契约

### 7.1 主视图挂载
- 在 `client.js` 的状态 `mainView` 中扩展：
  ```js
  const [mainView, setMainView] = useState('dashboard'); // 'dashboard' | 'cleaner' | 'governance'
  ```
- 顶部导航 Tab 新增第三项（带只读徽标）：
  ```
  [📊 全景存储分析]   [🧹 磁盘清理中心]   [🧭 依赖治理 (只读)]
  ```
- **惰性加载**：仅当用户首次点击 `governance` Tab 时才发起数据请求，避免首屏性能损耗。

### 7.2 页面栅格布局
```
┌────────────────────────────────────────────────────────────────────────┐
│ 🧭 依赖治理 (只读)                                        [🔄 强制刷新] │
│ 跨项目依赖版本漂移分析与环境分桶洞察；只读诊断，不修改任何项目文件      │
├────────────────────────────────────────────────────────────────────────┤
│ [ 📦 项目: 6 ] [ 🌐 Node分桶: 2 ] [ ❇️ 同版本: 11 ] [ ⚠️ 漂移: 3 ] [ 🛑 阻断: 1 ]│
├────────────────────────────────────────────────────────────────────────┤
│ ① Node 环境分桶卡片 (Node Runtime Buckets)                             │
│   • darwin-arm64-node20 (1个项目: Ecom_BI)                              │
│   • darwin-arm64-node24 (1个项目: .harness-kit)                         │
│   • 未声明 Node 版本 (4个项目: gpt-image2, web-design, demo, fixture)   │
├────────────────────────────────────────────────────────────────────────┤
│ ② 版本漂移矩阵 (Dependency Matrix Table)                               │
│   [筛选器: 全部(45) | ❇️同版本(11) | ⚠️主版本漂移(3) | 🛑分桶冲突(1) | 仅多消费者]│
│   ┌───────────────┬──────┬─────────┬─────────┬─────────┬──────────────┐│
│   │ 依赖包名      │ 类型 │ Ecom_BI │ gpt-img │ web-des │ 治理判定     ││
│   ├───────────────┼──────┼─────────┼─────────┼─────────┼──────────────┤│
│   │ react         │ prod │ 18.2.0  │ 19.0.0  │ 19.0.0  │ ⚠️ 主版本漂移 ││
│   │ lucide-react  │ prod │ 0.475.0 │ 0.475.0 │ 0.475.0 │ 🛑 分桶冲突   ││
│   │ typescript    │ dev  │ 5.8.3   │ 5.8.3   │ 5.8.3   │ ❇️ 完全同版本 ││
│   └───────────────┴──────┴─────────┴─────────┴─────────┴──────────────┘│
├────────────────────────────────────────────────────────────────────────┤
│ ③ 治理发现与建议 (Governance Findings)                                 │
│   [🛑 阻断] Ecom_BI 与 .harness-kit 有 3 个同版本包，但 Node 分桶不同   │
│             证据: Ecom_BI(node20) vs .harness-kit(node24)              │
│             建议: 保持项目物理隔离，先确认是否需要统一 Node 主版本       │
│   [⚠️ 警告] Ecom_BI 与 gpt-image2 的 vite 存在主版本断层 (6 vs 8)       │
│   [ℹ️ 提示] gpt-image2 与 web-design 依赖重合率 72%，判定为兄弟模板     │
├────────────────────────────────────────────────────────────────────────┤
│ ④ 导出报告                                            [JSON] [Markdown]│
└────────────────────────────────────────────────────────────────────────┘
```

### 7.3 交互细节与样式规范
1. **抽屉详情交互**：
   - 点击矩阵中任意一行，或点击发现项中的项目卡片，右侧弹出“项目依赖详情”抽屉，展示该项目的完整依赖树、锁定状态与所属 Node 桶。
2. **纯前端离线导出**：
   - **导出 JSON**：使用 `URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))`，触发浏览器下载；
   - **导出 Markdown**：在前端即时拼装格式规范的 Markdown 依赖治理报告，方便开发者贴入 GitHub Issue / PR 说明中。
   - **绝对不调用后端写文件接口**，保持端到端纯净无副反应。
3. **样式与视觉设计**：
   - 严格采用现有 `--dsw-alias-*` CSS 变量；
   - 容器包裹在 `.si-root-scroll-wrapper` 内，确保在 DSH 设置页面内嵌或全屏侧栏展开时均能平滑自适应滚动；
   - 完美适配深浅两种系统主题。

---

## 8. 验收基线与真实测试夹具

基于工作区现有真实项目数据建立测试夹具与单元测试断言标准：

| 校验项编号 | 事实断言规则 | 期望标准结果 |
| :---: | :--- | :--- |
| **TC-01** | 跨工作区扫描发现具备依赖的项目 | 识别出至少 6 个真实项目：`Ecom_BI`, `.harness-kit`, `gpt-image2`, `web-design`, `demo-app`, `fixture-app` |
| **TC-02** | Ecom_BI 环境指纹识别 | 命中 `.nvmrc` -> `20` -> 桶键为 `{platform}-{arch}-node20`，置信度 `exact` |
| **TC-03** | .harness-kit 环境指纹识别 | 命中 `engines.node` -> `24.19.0` -> 桶键为 `{platform}-{arch}-node24`，置信度 `exact` |
| **TC-04** | 未声明 Node 版本项目识别 | `gpt-image2`, `web-design` 无声明 -> 桶键为 `unknown`，置信度 `missing`，**绝对不得标记为可安全共享** |
| **TC-05** | Node 分桶冲突判定 | Ecom_BI 与 .harness-kit 的 `typescript@5.8.3` 版本完全相同，但因 Node 20 vs 24 判定为 `node-bucket-conflict` (level: `blocked`) |
| **TC-06** | 主版本漂移判定 | Ecom_BI (`vite@^6.4.3`) 与 gpt-image2 (`vite@^8.0.10`) 触发 `drift-major` (level: `warn`) |
| **TC-07** | 兄弟模板识别 | `gpt-image2` 与 `web-design` 顶层直接依赖相同数 ≥ 10，识别出 `sibling-template` (level: `info`) |
| **TC-08** | 无锁文件项目处理 | `demo-app` 与 `fixture-app` 无 lockfile，`exact: false`，标记 `no-lockfile`，不推测 resolved 版本 |
| **TC-09** | 只读安全性校验 | 执行 `overview` 与 `refresh` 前后，被扫描工作区内所有文件的 `mtime` 与内容散列值保持 100% 绝对一致 |
| **TC-10** | 性能与并发 | 连续发起 10 次 refresh 请求，后端单飞锁有效生效，冷启动扫描耗时 < 1.5s，缓存命中响应 < 50ms |

---

## 9. 红线与反模式

为确保开发过程不偏离架构初衷，以下行为列入**架构违规黑名单**：

1. ❌ **禁止在治理界面提供“一键合并 / 一键软链”按钮**：
   - 依赖治理插件绝非包安装工具，擅自改动依赖结构会打破前端构建工具（Vite/Next.js）的模块解析机制。
2. ❌ **禁止使用 `child_process.exec` 运行包管理命令**：
   - 后端代码不得包含 `exec('pnpm ...')` 或 `exec('npm ...')` 等进程调用。
3. ❌ **禁止在 V1 输出未经校验的“可节省 XXX MB”**：
   - 绝不提供虚假伪造的存储节省数字，只输出确凿的“包数量”、“版本差异”与“分桶信息”。
4. ❌ **禁止依赖外部巨型解析库**：
   - 严禁为了解析 semver 引入 `semver` 库，严禁为了解析 yaml 引入 `js-yaml`，保持轻量无依赖。
5. ❌ **禁止修改现有“全景存储分析”与“磁盘清理中心”的业务逻辑**：
   - 保持前两个主视图平稳运行，依赖治理作为独立平行模块注入。
