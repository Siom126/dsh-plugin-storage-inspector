# DeepSeek Harness 存储空间分析插件 (dsh-plugin-storage-inspector)
## GitHub 远端建仓与初始归档操作指引

本文档为 `dsh-plugin-storage-inspector` 插件项目提供从本地代码清理、Git 规范初始化、排除无关文件、执行初版提交，到在 GitHub 远端创建仓库并安全完成首次推送的完整实操指南。

---

### 一、仓库基本元数据推荐 (Repository Metadata)

| 配置项 | 推荐值 | 说明 |
| :--- | :--- | :--- |
| **Repository Name** | `dsh-plugin-storage-inspector` | 与 `package.json` 中的 name 一致 |
| **Description** | DeepSeek Harness 本地存储空间全景洞察与跨项目依赖治理插件 | 突出存储分析与依赖治理能力 |
| **Visibility** | `Public` (或按需选择 `Private`) | 开源插件推荐 Public |
| **Initialize with** | **全部留空 (Do not initialize)** | **切勿**勾选 README、.gitignore、License，避免与本地已有文件产生冲突 |

---

### 二、创建 GitHub 远端仓库

您可以选择 **Web 页面创建** 或 **GitHub CLI 命令行创建** 任一方式：

#### 方式 A：通过 GitHub Web 页面创建（推荐）
1. 登录 [GitHub](https://github.com/)，点击右上角 **「+」** -> **「New repository」**。
2. 填写 **Repository name**: `dsh-plugin-storage-inspector`。
3. 填写 **Description**: `DeepSeek Harness 存储空间全景分析与只读跨项目依赖治理插件`。
4. 选择可见性：`Public` 或 `Private`。
5. **重要**：在 "Initialize this repository with:" 区域，**保持所有选项（Add a README file / Add .gitignore / Choose a license）均为未勾选状态**。
6. 点击 **「Create repository」**。
7. 复制生成的远程仓库地址（推荐 SSH 协议）：
   - SSH: `git@github.com:<your-username>/dsh-plugin-storage-inspector.git`
   - HTTPS: `https://github.com/<your-username>/dsh-plugin-storage-inspector.git`

#### 方式 B：通过 GitHub CLI (`gh`) 一键创建
如果本地已安装并授权 `gh`：
```bash
# 切换至插件目录
cd /Users/siom/Desktop/临时/dsh-plugin-storage-inspector

# 一键创建远端仓库并自动关联（以 Public 仓库为例）
gh repo create dsh-plugin-storage-inspector --public --description "DeepSeek Harness 本地存储空间全景洞察与跨项目依赖治理插件" --source=. --remote=origin
```

---

### 三、本地仓库初始化与初版归档（已落地命令）

#### 1. 排除无关文件配置 (`.gitignore`)
为防止 Node 依赖、系统缓存、IDE 临时文件及 DSH 本地会话数据误入仓库，在插件根目录下配置 `.gitignore`：

```gitignore
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Diagnostic / report files
report.[0-9]*.[0-9]*.[0-9]*.[0-9]*.json

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Dependency directories
node_modules/
jspm_packages/
.pnpm-store/

# Build & Cache
dist/
build/
.temp/
.cache/
*.tsbuildinfo
.eslintcache

# Operating System files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE and Editor files
.idea/
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# DSH runtime and session cache
.dsh/
*.zstd
*.v4.jsonl
```

#### 2. 本地 Git 初始化与初版基线提交
在插件根目录下执行：

```bash
cd /Users/siom/Desktop/临时/dsh-plugin-storage-inspector

# 1. 初始化 Git 主分支为 main
git init -b main

# 2. 检查暂存区状态（确保无冗余文件）
git status

# 3. 暂存所有规范内源文件
git add .

# 4. 执行初版提交（采用 Conventional Commits 规范）
git commit -m "feat: initial release of dsh-plugin-storage-inspector v1.0.0"
```

当前基线收录的核心文件包括：
- `package.json`：插件元信息、依赖定义、DSH 客户端扩展声明
- `cordis.patch.yml`：DSH 插件服务编排与补丁描述
- `README.md`：项目多维度说明文档
- `index.js`：插件服务端生命周期入口
- `client.js`：DSH 设置页面 Web 前端核心挂载脚本
- `lib/scanner.js`：磁盘空间剖析扫描核心
- `lib/workspace-store.js`：工作区元信息与会话存储定位
- `lib/cleaner.js`：冗余文件扫描与安全清理机制
- `lib/api-handler.js`：服务端 RESTful API 路由分发器
- `.gitignore`：标准版本控制忽略规则

---

### 四、关联远端并执行首次推送 (Push)

在本地提交完成后，将本地 `main` 分支推送到 GitHub 远端仓库：

```bash
# 1. 添加远端关联（以实际 GitHub 账号为例，如 Siom126）
git remote add origin git@github.com:Siom126/dsh-plugin-storage-inspector.git

# 如果使用 HTTPS：
# git remote add origin https://github.com/Siom126/dsh-plugin-storage-inspector.git

# 2. 确认远程仓库配置
git remote -v

# 3. 确保当前分支为主分支 main
git branch -M main

# 4. 首次推送到远端仓库并设置上游追踪
git push -u origin main
```

---

### 五、团队后续开发与 Git Commit 规范建议

为了支持多 Agent（后端工程师、前端工程师、架构师）与团队协作的顺畅推进，制定以下提交规范：

#### 1. Commit Message 结构
```text
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

#### 2. 推荐 Type 类型
- `feat`: 引入新功能（例如跨项目依赖治理后端事实层、前端漂移矩阵 Tab）
- `fix`: 修复 Bug（如只读安全性拦截、深层嵌套扫描异常）
- `docs`: 文档新增或更新
- `refactor`: 代码重构（不改变功能与外部 API 行为）
- `perf`: 性能优化（如缓存加速、并发限制）
- `test`: 新增或修改单元测试与验收测试
- `chore`: 构建、配置或辅助工具变动

#### 3. 分阶段提交规划示例
- **阶段一（当前已就绪）**：
  `feat: initial release of dsh-plugin-storage-inspector v1.0.0`
- **阶段二（后端治理模块）**：
  `feat(governance): implement read-only dependency scanner and api handler`
- **阶段三（前端治理界面）**：
  `feat(ui): add cross-project dependency governance tab and drift matrix`
- **阶段四（阶段收官与文档）**：
  `docs(governance): add complete architecture and governance documentation`

---

### 六、常见问题排查 (Troubleshooting)

1. **SSH 权限问题 (`Permission denied (publickey)`)**：
   - 检查本地 SSH 密钥配置：`ssh -T git@github.com`。
   - 如未配置，请运行 `ssh-keygen -t ed25519` 并将生成的公钥添加至 GitHub Settings -> SSH and GPG keys。
2. **远程仓库非空导致冲突 (`Updates were rejected because the remote contains work`)**：
   - 如果创建远端仓库时不慎勾选了自动生成 README，推送时会被拒绝。
   - 解决方案：`git pull --rebase origin main` 后再执行 `git push -u origin main`。
3. **误暂存/误提交大文件或临时文件**：
   - 撤销暂存：`git rm -r --cached <path>`。
   - 确认 `.gitignore` 涵盖该路径后再重新提交。
