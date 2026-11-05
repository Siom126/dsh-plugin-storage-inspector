# DSH 存储空间全景分析与跨项目依赖治理插件 (dsh-plugin-storage-inspector)

DeepSeek Harness (DSH) 本地存储空间全景洞察与跨项目依赖治理只读诊断插件。

集成了两大核心能力：
1. **本地存储空间全景洞察**：精确分析每个工作区物理文件系统与会话数据链，在设置页面中直观展现全部工作区、Session 会话、源码、依赖、构建产物、媒体资源与全局附件的磁盘占用。
2. **跨项目依赖治理平台 (SPEC-DEPENDENCY-GOVERNANCE)**：严格遵循四层事实链（项目发现、环境指纹、依赖事实、治理分析），只读扫描跨项目 package.json 与 lockfile，检测版本漂移、Node 运行环境分桶与治理风险，辅助依赖收敛决策。零写操作、零私有 CAS、零自动链接。

---

## 🌟 核心功能

### 一、本地存储空间全景洞察
1. **工作区与对话全景统计**：
   - 查看每个工作区的总体占用空间（项目磁盘体积 + 会话记录体积）。
   - 细致罗列该工作区下的**每一个对话（Session）**，包括活跃与已归档状态、单对话记录大小（`session.v4.jsonl.zstd`）、投影缓存大小（`session_projcache`）与创建更新时间。
2. **多维度物理文件分类剖析**：
   - 💻 **项目源码 (Code)**：`.ts`, `.js`, `.py`, `.go`, `.rs`, `.vue`, `.html`, `.css` 等源文件体积与文件数。
   - 📦 **依赖模块 (Dependencies)**：`node_modules`, `venv`, `vendor`, `target` 等依赖包体积。
   - 🏗️ **构建产物 (Build / Dist)**：`dist`, `build`, `.next`, `.output` 等构件体积。
   - 🔀 **版本控制与元数据 (VCS & Metadata)**：`.git`, `.agent-teams`, `.vscode` 等。
   - 📄 **文档与配置 (Docs & Configs)**：`.md`, `.json`, `.yaml`, `.pdf`, `.docx` 等。
   - 🎨 **媒体与静态资源 (Media & Assets)**：图片、视频、音频、压缩包等。
3. **全局存储概览与分布色块**：
   - 本地总空间、工作区文件总计、会话记录总计、DSH 全局附件库（`~/.dsh/attachments`）一目了然。
   - 智能色彩条直观展示各数据类别的占比关系。
4. **大体积文件与目录预警**：
   - 自动提取各工作区内占用空间前列的子目录与大文件，帮助用户发现潜在的冗余或缓存。
5. **无缝集成设置页与侧栏**：
   - 自动注册至 DSH 设置页面「存储空间分析」（`settings.section`）。
   - 同时支持从侧边栏图标一键全屏打开。
   - 响应式设计，完美适配 DSH 深色与浅色原生主题。

### 二、只读跨项目依赖治理平台 (Dependency Governance)
1. **四层事实链架构驱动**：
   - **Layer 1 (项目发现)**：遍历全工作区受管目录，发现所有包含 `package.json` 的工程，受 4 层深度控制与严格黑名单约束。
   - **Layer 2 (运行环境指纹)**：优先级链 `.nvmrc` > `.node-version` > `package.json engines.node` 识别每个项目的 Node 主版本分桶，并标记置信度（`exact` / `multi` / `missing`）。
   - **Layer 3 (依赖事实提取)**：解析 `package-lock.json`（npm lockfile v2/v3）获得精确解析版本；对于未受管锁文件类型保持保守只读不臆测。
   - **Layer 4 (只读分析与漂移矩阵)**：交叉比对跨项目同名包，评估分桶冲突、主版本漂移与兄弟模板克隆。
2. **多消费者跨项目依赖漂移矩阵**：
   - 过滤孤立依赖，专注多项目共用的核心三方包。
   - 快速辨识全版本完全一致（`identical`）、次版本漂移（`drift-minor`）、主版本漂移（`drift-major`）与跨 Node 分桶冲突（`bucket-conflict`）。
3. **分级风险预警与行动建议**：
   - 输出阻断级（`blocked`）、告警级（`warn`）、候选级（`candidate`）和信息级（`info`）治理发现。
   - 提供基于证据链的针对性治理决策建议，辅助团队进行版本锁定与收敛。
4. **极致安全与高性能缓存**：
   - 严格 100% 只读保障，零写操作，不修改任何项目文件，不构建私有 CAS，不做软链接。
   - 后端单飞锁（single-flight）与 TTL 缓存机制，避免多用户或频繁请求引发的高并发 IO 浪涌。

---

## 📂 插件目录结构

```
dsh-plugin-storage-inspector/
├── package.json         # 插件清单与 DSH Cordis bundle / client 规范配置
├── cordis.patch.yml     # Cordis Loader 挂载补丁
├── index.js             # 宿主端入口：注册 WebServer 前缀路由与 connection.fetch
├── client.js            # 客户端入口：注册 settings.section、侧栏、双Tab（存储全景/依赖治理）组件
├── lib/
│   ├── project-discovery.js    # Layer 1: 跨工作区项目发现引擎 (深度控制+黑名单)
│   ├── runtime-fingerprint.js  # Layer 2: Node 运行环境指纹提取与分桶 (.nvmrc/.node-version/engines)
│   ├── lockfile.js             # Layer 3: 锁文件与声明依赖精确提取 (npm v2/v3 事实链)
│   ├── governance-analyzer.js  # Layer 4: 治理分析器 (分桶冲突/版本漂移/兄弟模板/治理指标)
│   ├── governance-store.js     # 依赖治理单飞锁与 TTL 缓存中心
│   ├── scanner.js              # 存储物理目录递归扫描器与文件分类器
│   ├── workspace-store.js      # 存储工作区与会话数据聚合存储库
│   ├── cleaner.js              # 存储空间安全清理策略
│   └── api-handler.js          # HTTP API 路由处理器 (同时挂载存储与依赖治理端点)
├── docs/
│   ├── SPEC-DEPENDENCY-GOVERNANCE.md # 依赖治理技术规范与四层架构契约
│   ├── GITHUB_ARCHIVE_GUIDE.md       # GitHub 远端建仓与代码归档指引
│   └── COMMIT_AND_RELEASE_PLAN.md    # 版本规划与发布变更日志
├── tests/
│   └── governance.test.mjs           # 25 项端到端规范与验收基线测试套件
└── README.md
```

---

## 🚀 安装与加载方式

### 方式一：在当前 DSH Profile 中本地链接（推荐）

在 `/Users/siom/.dsh/profiles/desktop/package.json` 中配置依赖：
```json
{
  "dependencies": {
    "dsh-plugin-storage-inspector": "link:/Users/siom/Desktop/临时/dsh-plugin-storage-inspector"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "...",
        "dsh-plugin-storage-inspector"
      ]
    }
  }
}
```

在 `/Users/siom/.dsh/profiles/desktop/node_modules/` 下创建符号链接：
```bash
ln -s "/Users/siom/Desktop/临时/dsh-plugin-storage-inspector" "/Users/siom/.dsh/profiles/desktop/node_modules/dsh-plugin-storage-inspector"
```

重启 DSH 或刷新页面即可在设置页面中查看！
