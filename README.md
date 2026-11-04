# DSH 存储空间全景分析插件 (dsh-plugin-storage-inspector)

DeepSeek Harness (DSH) 本地存储空间全景洞察插件。通过精确分析每个工作区物理文件系统与会话数据链，让用户可以在**设置页面**直观清晰地掌握全部工作区、对话 Session、项目代码、依赖组件、构建产物、媒体资源及全局附件所占据的本地磁盘空间。

---

## 🌟 核心功能

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

---

## 📂 插件目录结构

```
dsh-plugin-storage-inspector/
├── package.json         # 插件清单与 DSH Cordis bundle / client 规范配置
├── cordis.patch.yml     # Cordis Loader 挂载补丁
├── index.js             # 宿主端入口：注册 WebServer 前缀路由与 connection.fetch
├── client.js            # 客户端入口：注册 settings.section、侧栏与主面板组件
├── lib/
│   ├── scanner.js       # 物理目录递归扫描器与扩展名智能分类器
│   ├── workspace-store.js # 工作区与会话数据聚合存储库
│   └── api-handler.js   # HTTP API 路由处理器
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
