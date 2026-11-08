# dsh-plugin-storage-inspector

**Storage analyzer & read-only cross-project dependency governance for DeepSeek Harness (DSH).**

A single settings section with two tabs — *Storage* and *Dependency governance* — plus a disk-usage badge on the sidebar.

- **Storage tab.** Scans local disk use per workspace, per conversation (record file and projection cache counted separately) and per file class — source, dependencies, build output, VCS/metadata, docs & configs, media, global attachments. Shows the share of each class as a colour bar, lists the largest subdirectories and files, and can delete **explicitly selected** build, dependency, archived-session and cache folders after a path allow-list check.
- **Dependency governance tab.** Walks every workspace for `package.json`, fingerprints each project's Node major (`.nvmrc` > `.node-version` > `engines.node`), reads npm lockfiles (v2/v3) and builds a cross-project drift matrix — `identical`, `drift-minor`, `drift-major`, `bucket-conflict` — reported as `blocked` / `warn` / `candidate` / `info` findings. This half never writes: no project file is modified, no private CAS, no symlinks.

No model-facing tools and no outbound network calls: the host half only registers local routes under `/api/storage-inspector/*`.

---

## 安装 / Install

```bash
dsh plugin add github:Siom126/dsh-plugin-storage-inspector
```

The repository declares a `dsh.bundle` manifest (`cordis.patch.yml` mounts `storage-inspector`), so the one command above is enough. Restart DSH or refresh the page; the panel appears under **设置 → 存储空间分析** and as a sidebar icon.

**本地开发 / Local development** (link a working copy instead of the GitHub source):

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dependencies": {
    "dsh-plugin-storage-inspector": "link:/absolute/path/to/dsh-plugin-storage-inspector"
  },
  "dsh": {
    "profile": { "bundles": ["...", "dsh-plugin-storage-inspector"] }
  }
}
```

then make `~/.dsh/profiles/<profile>/node_modules/dsh-plugin-storage-inspector` point at the same directory (a symlink is enough) and restart DSH.

---

## 安全边界 / What it can write

| 能力 | 是否写磁盘 |
| --- | --- |
| 存储统计、文件分类、大文件排行、会话体积 | 否，只 `stat` / 遍历 |
| 依赖治理（项目发现、环境指纹、锁文件解析、漂移矩阵） | 否，全程只读 |
| 清理（`POST /api/storage-inspector/cleanup/execute`） | **是**，`fs.rm -rf` 白名单内的目标 |

清理是显式动作：先 `GET /api/storage-inspector/cleanup/targets` 拿到分组目标，用户勾选后才会提交删除。每个目标在删除前都要通过 `lib/cleaner.js` 的 `isPathSafeToClean()`：

- 必须位于用户主目录下；`/`、`~`、`~/Desktop`、`~/Documents`、`~/Downloads`、`~/Library`、`~/.dsh`、`~/.dsh/profiles` 等关键路径一律拒绝；
- 已知缓存目录之外，只允许叶子目录名为构建/依赖目录（`dist`、`build`、`.next`、`node_modules`、`venv`、`vendor`、`target` 等）；
- DSH 已归档会话只允许落在 `~/.dsh/sessions` 与 `~/.dsh/storages/session_projcache/sessions` 之下。

---

## 核心功能 / Features

### 一、本地存储空间全景洞察

1. **工作区与对话全景统计**：每个工作区的总体占用（项目磁盘体积 + 会话记录体积）；逐条列出该工作区下的每一个对话（Session），含活跃/已归档状态、记录文件（`*.jsonl.zstd`）体积、投影缓存 `session_projcache` 体积与创建更新时间。
2. **多维度物理文件分类剖析**：`Code`（`.ts`/`.js`/`.py`/`.go`/`.rs`/`.vue`/`.html`/`.css` …）、`Dependencies`（`node_modules`/`venv`/`vendor`/`target`）、`Build`（`dist`/`build`/`.next`/`.output`）、`VCS & Metadata`（`.git`/`.agent-teams`/`.vscode`）、`Docs & Configs`（`.md`/`.json`/`.yaml`/`.pdf`/`.docx`）、`Media & Assets`（图片、视频、音频、压缩包）。
3. **全局存储概览与分布色块**：本地总空间、工作区文件总计、会话记录总计、DSH 全局附件库（`~/.dsh/attachments`），以及各数据类别占比色块。
4. **大体积文件与目录预警**：各工作区里占用前列的子目录与大文件。
5. **设置页与侧栏双入口**：注册为设置页的独立分段（`settings.section`），同时可从侧栏图标全屏打开；随 DSH 深色/浅色主题切换。

### 二、跨项目依赖治理（只读）

1. **四层事实链**：`Layer 1` 项目发现（受管目录遍历、深度 ≤ 4、黑名单跳过、realpath 去重）→ `Layer 2` 环境指纹（`.nvmrc` > `.node-version` > `engines.node`，置信度 `exact`/`multi`/`missing`）→ `Layer 3` 依赖事实（解析 `package-lock.json` v2/v3 的精确版本；pnpm/yarn 等未受管锁文件保守跳过，不臆测）→ `Layer 4` 只读分析（分桶冲突、主版本漂移、兄弟模板克隆）。
2. **多消费者漂移矩阵**：过滤孤立依赖，只看多项目共用的三方包，逐包判定 `identical` / `drift-minor` / `drift-major` / `bucket-conflict`。
3. **分级风险与建议**：`blocked`（跨 Node 分桶冲突）、`warn`（主版本断层）、`candidate`（次版本漂移/克隆）、`info`，每条发现带证据链与收敛建议。
4. **并发与缓存**：后端单飞锁（single-flight）+ TTL 缓存（60s），避免频繁请求引发 IO 浪涌。

---

## 目录结构 / Layout

```
dsh-plugin-storage-inspector/
├── package.json            # dsh.bundle manifest + client 声明
├── cordis.patch.yml        # Cordis loader 挂载补丁
├── index.js                # 宿主入口：注册 WebServer 前缀路由 + connection.fetch
├── client.js               # 客户端：settings.section、侧栏徽标、双 Tab 面板
├── lib/
│   ├── project-discovery.js     # Layer 1 项目发现
│   ├── runtime-fingerprint.js   # Layer 2 Node 环境指纹与分桶
│   ├── lockfile.js              # Layer 3 锁文件事实提取（npm v2/v3）
│   ├── governance-analyzer.js   # Layer 4 漂移矩阵与治理发现
│   ├── governance-store.js      # 单飞锁 + TTL 缓存
│   ├── scanner.js               # 物理目录递归扫描与文件分类
│   ├── workspace-store.js       # 工作区/会话体积聚合
│   ├── cleaner.js               # 清理目标扫描、路径白名单校验与执行
│   └── api-handler.js           # HTTP 路由（存储 + 清理 + 依赖治理）
├── tests/                  # node --test：governance / cleaner / system-disk
└── docs/                   # 依赖治理规范与发布计划
```

## HTTP 接口 / Routes

`GET /api/storage-inspector/data` · `GET|POST /api/storage-inspector/refresh` · `GET /api/storage-inspector/workspace` · `GET /api/storage-inspector/disk` · `GET /api/storage-inspector/cleanup/targets` · `POST /api/storage-inspector/cleanup/execute` · `GET /api/storage-inspector/deps/overview` · `GET /api/storage-inspector/deps/project` · `POST /api/storage-inspector/deps/refresh`

## 测试 / Tests

```bash
npm test   # node --test tests/**/*.test.mjs — 28 passing
```

## License

MIT
