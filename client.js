/**
 * dsh-plugin-storage-inspector - Client half
 * 客户端端点：在设置页面（settings.section）及主面板注册存储空间分析与本地磁盘清理看板
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-storage-inspector',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useMemo = React.useMemo;
    const useCallback = React.useCallback;

    const PANEL_ID = 'storage-inspector';
    const API_URL = '/api/storage-inspector/data';
    const REFRESH_URL = '/api/storage-inspector/refresh';
    const CLEANUP_TARGETS_URL = '/api/storage-inspector/cleanup/targets';
    const CLEANUP_EXECUTE_URL = '/api/storage-inspector/cleanup/execute';
    const GOV_OVERVIEW_URL = '/api/storage-inspector/deps/overview';
    const GOV_PROJECT_URL = '/api/storage-inspector/deps/project';
    const GOV_REFRESH_URL = '/api/storage-inspector/deps/refresh';

    // 格式化字节数
    function formatBytes(bytes) {
      if (bytes === 0 || !bytes || isNaN(bytes)) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2) + ' ' + sizes[i];
    }

    // 格式化时间戳
    function formatDate(ts) {
      if (!ts) return '-';
      const d = new Date(ts);
      const pad = (n) => (n < 10 ? '0' + n : n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // 嵌入样式（确保每次更新都能生效，且原生适配浅色与深色主题）
    function ensureStyles() {
      if (typeof document === 'undefined') return;
      const tagId = 'dsh-plugin-storage-inspector-css';
      let style = document.getElementById(tagId);
      if (!style) {
        style = document.createElement('style');
        style.id = tagId;
        document.head.appendChild(style);
      }
      style.textContent = `
.si-root-scroll-wrapper {
  width: 100%;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  flex: 1 1 0%;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
}

.si-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  padding-bottom: 140px;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  box-sizing: border-box;
}

.si-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
}

.si-title-group h2 {
  margin: 0;
  font-size: 1.45rem;
  font-weight: 700;
  color: var(--dsw-alias-label-primary, #0f1115);
  display: flex;
  align-items: center;
  gap: 8px;
}

.si-title-group p {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: var(--dsw-alias-label-secondary, #475569);
}

.si-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* 主视图切换 Tab */
.si-main-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--dsw-alias-bg-layer-1, #f1f5f9);
  padding: 3px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
}

.si-main-tab-btn {
  padding: 6px 14px;
  font-size: 0.82rem;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #475569);
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  user-select: none;
}

.si-main-tab-btn:hover {
  color: var(--dsw-alias-label-primary, #0f1115);
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
}

.si-main-tab-btn.active {
  background: var(--dsw-alias-bg-base, #ffffff);
  color: #2563eb;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.si-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #cbd5e1);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  user-select: none;
}

.si-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, #f1f5f9);
  border-color: var(--dsw-alias-border-l3, #94a3b8);
}

.si-btn-primary {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}

.si-btn-primary:hover {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

.si-btn-danger {
  background: #ef4444;
  color: #ffffff;
  border-color: #ef4444;
}

.si-btn-danger:hover {
  background: #dc2626;
  border-color: #dc2626;
}

.si-btn-sm {
  padding: 3px 8px;
  font-size: 0.74rem;
}

.si-metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.si-card {
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.si-card-label {
  font-size: 0.8rem;
  color: var(--dsw-alias-label-secondary, #475569);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.si-card-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--dsw-alias-label-primary, #0f1115);
  line-height: 1.2;
}

.si-card-desc {
  font-size: 0.75rem;
  color: var(--dsw-alias-label-tertiary, #64748b);
  display: flex;
  gap: 12px;
}

.si-breakdown-box {
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.si-breakdown-bar {
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  display: flex;
  background: var(--dsw-alias-border-l2, #e2e8f0);
}

.si-legend-list {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 0.75rem;
  color: var(--dsw-alias-label-secondary, #475569);
}

.si-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.si-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.si-filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}

.si-search-input {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #cbd5e1);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 0.82rem;
  min-width: 260px;
  outline: none;
}

.si-search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.si-ws-card {
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  transition: border-color 0.15s ease;
}

.si-ws-header {
  padding: 14px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  user-select: none;
}

.si-ws-header:hover {
  background: var(--dsw-alias-interactive-bg-hover, #f1f5f9);
}

.si-ws-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.si-ws-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f1115);
}

.si-ws-path {
  font-size: 0.75rem;
  color: var(--dsw-alias-label-tertiary, #64748b);
  font-family: monospace;
}

.si-ws-meta {
  display: flex;
  align-items: center;
  gap: 16px;
}

.si-ws-size-pill {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--dsw-alias-label-primary, #0f1115);
}

.si-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.72rem;
  font-weight: 500;
  background: var(--dsw-alias-border-l1, #f1f5f9);
  color: var(--dsw-alias-label-secondary, #475569);
}

.si-badge-green {
  background: #dcfce7;
  color: #15803d;
}

.si-badge-gray {
  background: #f1f5f9;
  color: #64748b;
}

.si-badge-amber {
  background: #fef3c7;
  color: #b45309;
}

.si-badge-blue {
  background: #dbeafe;
  color: #1d4ed8;
}

.si-badge-danger {
  background: #fee2e2;
  color: #b91c1c;
}

.si-ws-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
}

/* 分类小方块网格 */
.si-cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}

.si-cat-card {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: all 0.15s ease;
  user-select: none;
}

.si-cat-card.clickable {
  cursor: pointer;
}

.si-cat-card.clickable:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0,0,0,0.05);
}

.si-cat-card.active-amber {
  border-color: #f59e0b;
  background: #fef3c725;
  box-shadow: 0 0 0 1px #f59e0b40;
}

.si-cat-card.active-blue {
  border-color: #3b82f6;
  background: #dbeafe25;
  box-shadow: 0 0 0 1px #3b82f640;
}

.si-cat-card.active-purple {
  border-color: #8b5cf6;
  background: #ede9fe25;
  box-shadow: 0 0 0 1px #8b5cf640;
}

.si-cat-card.active-slate {
  border-color: #64748b;
  background: #f1f5f9;
  box-shadow: 0 0 0 1px #64748b40;
}

.si-cat-card.active-green {
  border-color: #10b981;
  background: #d1fae525;
  box-shadow: 0 0 0 1px #10b98140;
}

.si-cat-card.active-pink {
  border-color: #ec4899;
  background: #fce7f325;
  box-shadow: 0 0 0 1px #ec489940;
}

.si-cat-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.si-cat-name {
  font-size: 0.75rem;
  color: var(--dsw-alias-label-secondary, #475569);
  font-weight: 500;
}

.si-cat-bytes {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f1115);
}

.si-cat-active-pill {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
}

/* 分类明细面板 */
.si-cat-detail-panel {
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
}

.si-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--dsw-alias-border-l1, #e2e8f0);
}

.si-detail-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.si-tab-pill {
  padding: 3px 8px;
  font-size: 0.72rem;
  font-weight: 500;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, #cbd5e1);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-secondary, #475569);
  transition: all 0.15s ease;
  user-select: none;
}

.si-tab-pill:hover {
  background: var(--dsw-alias-interactive-bg-hover, #f1f5f9);
  color: var(--dsw-alias-label-primary, #0f1115);
}

.si-tab-pill.active {
  border-color: #d97706;
  background: #d97706;
  color: #ffffff;
  font-weight: 600;
}

.si-file-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
  margin-top: 4px;
}

.si-file-table th {
  text-align: left;
  padding: 6px 8px;
  color: var(--dsw-alias-label-secondary, #475569);
  border-bottom: 1px solid var(--dsw-alias-border-l2, #cbd5e1);
  font-weight: 600;
}

.si-file-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #f1f5f9);
  color: var(--dsw-alias-label-primary, #0f1115);
}

.si-file-table tr:hover td {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.03));
}

/* 会话列表 */
.si-sessions-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.si-sessions-table th {
  text-align: left;
  padding: 10px 8px;
  color: var(--dsw-alias-label-secondary, #475569);
  border-bottom: 1px solid var(--dsw-alias-border-l2, #cbd5e1);
  font-weight: 600;
}

.si-sessions-table td {
  padding: 10px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #f1f5f9);
  vertical-align: middle;
  color: var(--dsw-alias-label-primary, #0f1115);
}

.si-sessions-table tr:hover td {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.03));
}

.si-session-title {
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #0f1115);
  max-width: 320px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.si-session-id {
  font-size: 0.72rem;
  color: var(--dsw-alias-label-tertiary, #64748b);
  font-family: monospace;
}

.si-loading-box {
  padding: 40px;
  text-align: center;
  color: var(--dsw-alias-label-secondary, #61666b);
  font-size: 0.9rem;
}

.si-empty-box {
  padding: 24px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary, #81858c);
  font-size: 0.85rem;
}

.si-top-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.si-top-item {
  font-size: 0.75rem;
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  padding: 3px 8px;
  border-radius: 4px;
  font-family: monospace;
  color: var(--dsw-alias-label-primary, #0f1115);
}

/* 磁盘清理中心专用样式 */
.si-clean-banner {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(16, 185, 129, 0.08));
  border: 1px solid rgba(37, 99, 235, 0.25);
  border-radius: 10px;
  padding: 18px 22px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.si-clean-summary-val {
  font-size: 1.85rem;
  font-weight: 700;
  color: #2563eb;
  line-height: 1.2;
}

.si-clean-group {
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  background: var(--dsw-alias-bg-base, #ffffff);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.si-clean-group-header {
  padding: 12px 16px;
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.si-clean-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #f1f5f9);
  display: flex;
  align-items: flex-start;
  gap: 14px;
  transition: background 0.15s ease;
}

.si-clean-item:last-child {
  border-bottom: none;
}

.si-clean-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.02));
}

.si-clean-checkbox {
  width: 18px;
  height: 18px;
  margin-top: 3px;
  cursor: pointer;
  accent-color: #2563eb;
}

.si-tag {
  display: inline-block;
  padding: 1px 6px;
  font-size: 0.68rem;
  border-radius: 4px;
  font-weight: 500;
  margin-right: 6px;
}

.si-tag-safe {
  background: #dcfce7;
  color: #15803d;
}

.si-tag-warning {
  background: #fef3c7;
  color: #b45309;
}

.si-tag-danger {
  background: #fee2e2;
  color: #b91c1c;
}

.si-clean-success-banner {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  padding: 12px 18px;
  border-radius: 8px;
  font-size: 0.88rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

/* ==================== 依赖治理主视图 CSS (SPEC-DEPENDENCY-GOVERNANCE) ==================== */
.si-gov-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.si-gov-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
}

.si-gov-badge-readonly {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  font-size: 0.72rem;
  padding: 2px 8px;
  font-weight: 600;
}

.si-gov-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.si-gov-kpi-card {
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.si-gov-kpi-label {
  font-size: 0.8rem;
  color: var(--dsw-alias-label-secondary, #475569);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.si-gov-kpi-value {
  font-size: 1.55rem;
  font-weight: 700;
  color: var(--dsw-alias-label-primary, #0f1115);
  line-height: 1.2;
}

.si-gov-kpi-desc {
  font-size: 0.73rem;
  color: var(--dsw-alias-label-tertiary, #64748b);
  display: flex;
  gap: 8px;
}

.si-gov-section {
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 8px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.si-gov-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.si-gov-section-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f1115);
  display: flex;
  align-items: center;
  gap: 8px;
}

.si-gov-section-subtitle {
  font-size: 0.78rem;
  color: var(--dsw-alias-label-secondary, #475569);
  margin-top: 2px;
}

/* Node 分桶卡片 */
.si-gov-bucket-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.si-gov-bucket-card {
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  transition: all 0.15s ease;
}

.si-gov-bucket-card.bucket-exact {
  border-color: #86efac;
  background: rgba(240, 253, 244, 0.5);
}

.si-gov-bucket-card.bucket-multi {
  border-color: #fcd34d;
  background: rgba(254, 252, 232, 0.5);
}

.si-gov-bucket-card.bucket-missing {
  border-color: #fca5a5;
  background: rgba(254, 242, 242, 0.5);
}

.si-gov-bucket-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.si-gov-bucket-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f1115);
}

.si-gov-bucket-key {
  font-size: 0.73rem;
  color: var(--dsw-alias-label-tertiary, #64748b);
  font-family: monospace;
}

.si-gov-bucket-projects {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.si-gov-project-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #cbd5e1);
  font-size: 0.75rem;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-family: monospace;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.si-gov-project-tag:hover {
  border-color: #3b82f6;
  color: #2563eb;
  background: #eff6ff;
  transform: translateY(-1px);
}

.si-gov-notice-box {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.74rem;
  line-height: 1.4;
}

.si-gov-notice-danger {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.si-gov-notice-warning {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

/* 矩阵表格 */
.si-gov-matrix-wrap {
  overflow-x: auto;
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 6px;
  max-height: 560px;
  overflow-y: auto;
  position: relative;
}

.si-gov-matrix-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  text-align: left;
}

.si-gov-matrix-table th {
  position: sticky;
  top: 0;
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  border-bottom: 2px solid var(--dsw-alias-border-l2, #cbd5e1);
  padding: 10px 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f1115);
  z-index: 2;
  white-space: nowrap;
}

.si-gov-matrix-table td {
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  padding: 8px 12px;
  vertical-align: middle;
  white-space: nowrap;
}

.si-gov-matrix-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, #f8fafc);
}

.si-gov-matrix-row.active {
  background: #eff6ff;
}

.si-gov-cell-badge {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 0.72rem;
  font-family: monospace;
}

/* 严重度与判定徽标 */
.si-badge-blocked {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
  font-weight: 600;
}

.si-badge-warn {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  font-weight: 600;
}

.si-badge-candidate {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
  font-weight: 600;
}

.si-badge-info {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #7dd3fc;
}

.si-badge-unlocked {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

/* 治理发现项 */
.si-gov-findings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.si-gov-finding-card {
  border-radius: 8px;
  padding: 14px 16px;
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-left-width: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.si-gov-finding-card.level-blocked {
  border-left-color: #ef4444;
  background: rgba(254, 242, 242, 0.3);
}

.si-gov-finding-card.level-warn {
  border-left-color: #f59e0b;
  background: rgba(254, 252, 232, 0.3);
}

.si-gov-finding-card.level-candidate {
  border-left-color: #10b981;
  background: rgba(240, 253, 244, 0.3);
}

.si-gov-finding-card.level-info {
  border-left-color: #3b82f6;
  background: rgba(239, 246, 255, 0.3);
}

.si-gov-finding-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.si-gov-finding-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f1115);
  display: flex;
  align-items: center;
  gap: 8px;
}

.si-gov-finding-desc {
  font-size: 0.78rem;
  color: var(--dsw-alias-label-secondary, #475569);
  line-height: 1.45;
}

.si-gov-evidence-box {
  background: var(--dsw-alias-bg-base, #ffffff);
  border: 1px dashed var(--dsw-alias-border-l2, #cbd5e1);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.75rem;
  color: var(--dsw-alias-label-secondary, #475569);
}

.si-gov-evidence-list {
  margin: 4px 0 0 16px;
  padding: 0;
  font-family: monospace;
}

.si-gov-evidence-list li {
  margin-bottom: 2px;
}

.si-gov-rec-box {
  background: rgba(59, 130, 246, 0.05);
  border-left: 3px solid #3b82f6;
  border-radius: 0 6px 6px 0;
  padding: 8px 12px;
  font-size: 0.78rem;
  color: var(--dsw-alias-label-primary, #0f1115);
  line-height: 1.45;
}

/* 抽屉样式 (Drawer) */
.si-gov-drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 9999;
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
  animation: siFadeIn 0.15s ease-out;
}

.si-gov-drawer {
  width: min(660px, 92vw);
  height: 100%;
  background: var(--dsw-alias-bg-base, #ffffff);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  z-index: 10000;
  animation: siSlideIn 0.2s ease-out;
}

@keyframes siSlideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

@keyframes siFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.si-gov-drawer-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
}

.si-gov-drawer-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--dsw-alias-label-primary, #0f1115);
  display: flex;
  align-items: center;
  gap: 8px;
}

.si-gov-drawer-close {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #cbd5e1);
  background: var(--dsw-alias-bg-base, #ffffff);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  color: var(--dsw-alias-label-secondary, #475569);
  transition: all 0.15s ease;
}

.si-gov-drawer-close:hover {
  background: var(--dsw-alias-interactive-bg-hover, #f1f5f9);
  color: var(--dsw-alias-label-primary, #0f1115);
}

.si-gov-drawer-body {
  flex: 1 1 0%;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.si-gov-dep-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
  margin-top: 6px;
}

.si-gov-dep-table th {
  padding: 8px 10px;
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  border-bottom: 1px solid var(--dsw-alias-border-l2, #cbd5e1);
  font-weight: 600;
  text-align: left;
}

.si-gov-dep-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  vertical-align: middle;
}
`;
    }

    /**
     * 分类元数据定义
     */
    const CATEGORIES_META = [
      {
        key: 'dependencies',
        name: '📦 依赖模块 (node_modules等)',
        shortName: '📦 依赖模块',
        color: '#d97706',
        accentClass: 'active-amber',
        desc: '第三方依赖包、npm包、运行时与虚拟环境'
      },
      {
        key: 'code',
        name: '💻 项目代码',
        shortName: '💻 项目代码',
        color: '#2563eb',
        accentClass: 'active-blue',
        desc: '源代码文件、脚本、核心组件与样式'
      },
      {
        key: 'build',
        name: '🏗️ 构建产物 (dist/build)',
        shortName: '🏗️ 构建产物',
        color: '#7c3aed',
        accentClass: 'active-purple',
        desc: '项目编译打包输出、产物 bundle'
      },
      {
        key: 'vcs',
        name: '🔀 版本控制 (.git)',
        shortName: '🔀 版本控制',
        color: '#475569',
        accentClass: 'active-slate',
        desc: 'Git 仓库历史、commit 对象与元数据'
      },
      {
        key: 'docs',
        name: '📄 文档与配置',
        shortName: '📄 文档配置',
        color: '#059669',
        accentClass: 'active-green',
        desc: '配置文件、环境配置、数据与说明文档'
      },
      {
        key: 'media',
        name: '🎨 媒体与静态资源',
        shortName: '🎨 媒体资源',
        color: '#db2777',
        accentClass: 'active-pink',
        desc: '图片、音视频、字体与媒体文件'
      }
    ];

    /**
     * 纯前端安全文件下载（不经过服务端写磁盘）
     */
    function downloadFile(filename, content, mimeType) {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    }

    /**
     * 即时拼装格式规范的 Markdown 依赖治理报告 (可直接贴入 GitHub Issue / PR 说明)
     */
    function generateMarkdownReport(data) {
      if (!data) return '# 依赖治理报告为空';
      const d = new Date(data.timestamp || Date.now());
      const pad = (n) => (n < 10 ? '0' + n : n);
      const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

      let md = `# 🧭 DSH 跨项目依赖治理诊断报告\n\n`;
      md += `> **生成时间**：${timeStr}  \n`;
      md += `> **报告性质**：纯前端只读导出诊断报告（不触碰及修改任何项目源文件）  \n`;
      md += `> **缓存状态**：${data.cached ? `命中缓存 (TTL: ${data.ttl}s)` : '实时全量扫描'}\n\n`;

      md += `## 1. 核心治理指标 (KPI Summary)\n\n`;
      md += `| 指标项 | 统计数值 | 治理参考解读 |\n`;
      md += `| :--- | :---: | :--- |\n`;
      md += `| **扫描工作区项目总数** | **${data.kpi?.totalProjects ?? 0}** 个 | 包含顶层与嵌套工作区项目 |\n`;
      md += `| **活跃项目数 (含声明依赖)** | **${data.kpi?.activeProjects ?? 0}** 个 | 参与跨项目依赖比较的有效项目 |\n`;
      md += `| **Node 运行环境分桶数** | **${data.kpi?.nodeBucketsCount ?? 0}** 个 | 跨项目 Node 运行时分化程度 |\n`;
      md += `| **完全同版本依赖项** | **${data.kpi?.identicalPackagesCount ?? 0}** 个 | 跨项目锁文件版本 100% 一致 |\n`;
      md += `| **发生版本漂移依赖项** | **${data.kpi?.driftPackagesCount ?? 0}** 个 | 存在跨版本或不同版本号引用 |\n`;
      md += `| **阻断级治理风险项** | **${data.kpi?.blockedFindingsCount ?? 0}** 项 | 🚨 跨 Node 分桶冲突或高危问题 |\n\n`;

      md += `## 2. Node 运行时环境分桶洞察 (Runtime Buckets)\n\n`;
      md += `| 桶标识 (Bucket Key) | 环境描述 | 置信度 | 项目数 | 包含项目清单 |\n`;
      md += `| :--- | :--- | :---: | :---: | :--- |\n`;
      for (const b of data.nodeBuckets || []) {
        const confLabel = b.confidence === 'exact' ? '✅ 精确锁定' : b.confidence === 'multi' ? '⚠️ 宽泛范围' : '❌ 缺失未声明';
        md += `| \`${b.bucketKey}\` | ${b.label} | ${confLabel} | ${b.projectCount} | ${(b.projectIds || []).map((p) => '`' + p + '`').join(', ')} |\n`;
      }
      md += `\n`;

      md += `## 3. 治理发现与处理建议 (Governance Findings)\n\n`;
      if (!data.findings || data.findings.length === 0) {
        md += `*未检测到跨项目依赖治理异常。*\n\n`;
      } else {
        for (const f of data.findings) {
          const levelBadge =
            f.level === 'blocked'
              ? '🛑 [阻断 BLOCKED]'
              : f.level === 'warn'
              ? '⚠️ [警告 WARN]'
              : f.level === 'candidate'
              ? '❇️ [候选 CANDIDATE]'
              : 'ℹ️ [提示 INFO]';
          md += `### ${levelBadge} ${f.title}\n\n`;
          if (f.description) {
            md += `${f.description}\n\n`;
          }
          md += `**事实证据链**：\n`;
          for (const e of f.evidence || []) {
            md += `- ${e}\n`;
          }
          md += `\n**治理建议**：  \n> ${f.recommendation}\n\n`;
          md += `**涉及项目**：${(f.projectIds || []).map((p) => '`' + p + '`').join(', ')}\n\n`;
          md += `---\n\n`;
        }
      }

      md += `## 4. 多消费者跨项目依赖漂移矩阵 (Multi-consumer Drift Matrix)\n\n`;
      const multiConsumers = (data.matrix || []).filter((r) => r.consumerCount > 1);
      const activeProjects = (data.projects || []).filter((p) => !p.isEmpty);

      if (multiConsumers.length === 0) {
        md += `*暂无多项目共享依赖项。*\n\n`;
      } else {
        let header = `| 依赖包名 | 类型 | 判定 | 引用项目数 | 涉及版本 |`;
        let sep = `| :--- | :---: | :---: | :---: | :--- |`;
        for (const p of activeProjects) {
          header += ` ${p.name} |`;
          sep += ` :---: |`;
        }
        md += `${header}\n${sep}\n`;

        for (const row of multiConsumers) {
          let line = `| \`${row.name}\` | \`${row.kind}\` | **${row.verdictLabel}** | ${row.consumerCount} | ${row.resolvedVersions.map((v) => '`' + v + '`').join(', ') || '-'} |`;
          for (const p of activeProjects) {
            const cell = row.projects[p.id];
            if (!cell) {
              line += ` - |`;
            } else {
              const ver = cell.resolved ? `**${cell.resolved}**` : cell.range || '-';
              line += ` ${ver} |`;
            }
          }
          md += `${line}\n`;
        }
        md += `\n`;
      }

      md += `\n> *本报告由 DeepSeek Harness 存储空间与依赖治理插件 (dsh-plugin-storage-inspector) 只读引擎导出。*  \n`;
      md += `> *所有诊断基于 package.json、lockfile 及环境配置文件只读分析，未向文件系统写入任何内容。*\n`;

      return md;
    }

    function exportGovernanceJson(data) {
      if (!data) return;
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `dsh-dependency-governance-report-${dateStr}.json`;
      downloadFile(filename, JSON.stringify(data, null, 2), 'application/json');
    }

    function exportGovernanceMarkdown(data) {
      if (!data) return;
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `dsh-dependency-governance-report-${dateStr}.md`;
      const md = generateMarkdownReport(data);
      downloadFile(filename, md, 'text/markdown;charset=utf-8');
    }

    /**
     * 核心看板组件（支持全景存储分析与磁盘清理双模式）
     */
    function StorageInspectorDashboard() {
      const [mainView, setMainView] = useState('dashboard'); // 'dashboard' | 'cleaner'
      const [loading, setLoading] = useState(true);
      const [refreshing, setRefreshing] = useState(false);
      const [error, setError] = useState(null);
      const [data, setData] = useState(null);
      const [searchQuery, setSearchQuery] = useState('');
      const [expandedWs, setExpandedWs] = useState({});
      const [activeTab, setActiveTab] = useState('all'); // all, large, dependencies, sessions
      const [selectedCategoryMap, setSelectedCategoryMap] = useState({});

      // 清理中心专属状态
      const [cleanupData, setCleanupData] = useState(null);
      const [cleanupLoading, setCleanupLoading] = useState(false);
      const [cleanupExecuting, setCleanupExecuting] = useState(false);
      const [selectedTargetIds, setSelectedTargetIds] = useState(new Set());
      const [cleanResult, setCleanResult] = useState(null);

      // 依赖治理专属状态 (SPEC-DEPENDENCY-GOVERNANCE)
      const [govData, setGovData] = useState(null);
      const [govLoading, setGovLoading] = useState(false);
      const [govRefreshing, setGovRefreshing] = useState(false);
      const [govError, setGovError] = useState(null);
      const [matrixFilter, setMatrixFilter] = useState('all'); // all, identical, drift-major, bucket-conflict, multi-consumer
      const [matrixKind, setMatrixKind] = useState('all'); // all, prod, dev
      const [matrixSearch, setMatrixSearch] = useState('');
      const [findingLevelFilter, setFindingLevelFilter] = useState('all'); // all, blocked, warn, candidate, info
      const [drawerProjectId, setDrawerProjectId] = useState(null);
      const [drawerData, setDrawerData] = useState(null);
      const [drawerLoading, setDrawerLoading] = useState(false);
      const [drawerSearch, setDrawerSearch] = useState('');
      const [drawerKindFilter, setDrawerKindFilter] = useState('all');
      const [activeMatrixDetailRow, setActiveMatrixDetailRow] = useState(null);

      const fetchGovData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setGovRefreshing(true);
        else setGovLoading(true);
        setGovError(null);

        try {
          const url = isRefresh ? GOV_REFRESH_URL : GOV_OVERVIEW_URL;
          const res = await fetch(url, {
            method: isRefresh ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || '获取依赖治理数据失败');
          setGovData(json.data || json);
        } catch (err) {
          console.error('[storage-inspector] fetchGovData failed:', err);
          setGovError(err.message || '获取依赖治理数据失败');
        } finally {
          setGovLoading(false);
          setGovRefreshing(false);
        }
      }, []);

      const openProjectDrawer = useCallback(async (projectId) => {
        setDrawerProjectId(projectId);
        setDrawerLoading(true);
        setDrawerData(null);
        setDrawerSearch('');
        setDrawerKindFilter('all');

        try {
          const res = await fetch(`${GOV_PROJECT_URL}?id=${encodeURIComponent(projectId)}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || '获取项目详情失败');
          setDrawerData(json.data || json);
        } catch (err) {
          console.error('[storage-inspector] openProjectDrawer failed:', err);
        } finally {
          setDrawerLoading(false);
        }
      }, []);

      useEffect(() => {
        ensureStyles();
      }, []);

      const fetchData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        try {
          const url = isRefresh ? REFRESH_URL : API_URL;
          const res = await fetch(url, {
            method: isRefresh ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || '获取存储空间数据失败');
          setData(json.data);

          // 默认展开第一个或最大的工作区
          if (json.data && json.data.workspaces && json.data.workspaces.length > 0) {
            setExpandedWs((prev) => {
              if (Object.keys(prev).length === 0) {
                return { [json.data.workspaces[0].id]: true };
              }
              return prev;
            });
          }
        } catch (err) {
          setError(err.message || String(err));
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      }, []);

      const fetchCleanupTargets = useCallback(async () => {
        setCleanupLoading(true);
        try {
          const res = await fetch(CLEANUP_TARGETS_URL, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || '获取清理项目失败');
          setCleanupData(json.data);

          // 智能预选所有默认勾选项（无风险安全项和构建产物）
          const defaultIds = new Set();
          for (const g of json.data.groups || []) {
            for (const t of g.targets || []) {
              if (t.defaultSelected) {
                defaultIds.add(t.id);
              }
            }
          }
          setSelectedTargetIds(defaultIds);
        } catch (err) {
          console.error('[storage-inspector] Failed to fetch cleanup targets:', err);
        } finally {
          setCleanupLoading(false);
        }
      }, []);

      useEffect(() => {
        fetchData(false);
        fetchCleanupTargets();
      }, [fetchData, fetchCleanupTargets]);

      const toggleExpand = (wsId) => {
        setExpandedWs((prev) => ({
          ...prev,
          [wsId]: !prev[wsId]
        }));
      };

      const expandAll = () => {
        if (!data || !data.workspaces) return;
        const all = {};
        for (const w of data.workspaces) all[w.id] = true;
        setExpandedWs(all);
      };

      const collapseAll = () => {
        setExpandedWs({});
      };

      // 切换单个清理目标的选中状态
      const toggleTargetSelect = (targetId) => {
        setSelectedTargetIds((prev) => {
          const next = new Set(prev);
          if (next.has(targetId)) next.delete(targetId);
          else next.add(targetId);
          return next;
        });
      };

      // 组级别全选/取消
      const toggleGroupSelect = (group) => {
        const groupTargetIds = (group.targets || []).map((t) => t.id);
        const allSelected = groupTargetIds.every((id) => selectedTargetIds.has(id));
        setSelectedTargetIds((prev) => {
          const next = new Set(prev);
          for (const id of groupTargetIds) {
            if (allSelected) next.delete(id);
            else next.add(id);
          }
          return next;
        });
      };

      // 快捷全选推荐安全项
      const selectSafeOnly = () => {
        const ids = new Set();
        for (const g of cleanupData?.groups || []) {
          for (const t of g.targets || []) {
            if (t.risk === 'safe') ids.add(t.id);
          }
        }
        setSelectedTargetIds(ids);
      };

      // 快捷全选安全项 + 构建产物
      const selectSafeAndBuilds = () => {
        const ids = new Set();
        for (const g of cleanupData?.groups || []) {
          for (const t of g.targets || []) {
            if (t.risk === 'safe' || t.category === 'workspace_builds') ids.add(t.id);
          }
        }
        setSelectedTargetIds(ids);
      };

      // 全选
      const selectAll = () => {
        const ids = new Set();
        for (const g of cleanupData?.groups || []) {
          for (const t of g.targets || []) {
            ids.add(t.id);
          }
        }
        setSelectedTargetIds(ids);
      };

      // 清空选择
      const clearAll = () => {
        setSelectedTargetIds(new Set());
      };

      // 执行批量清理
      const handleExecuteCleanup = async () => {
        if (selectedTargetIds.size === 0) return;
        const count = selectedTargetIds.size;
        const sizeText = formatBytes(selectedCleanableBytes);
        const ok = window.confirm(
          `确认清理所选的 ${count} 个项目（预计释放 ${sizeText} 磁盘空间）吗？\n\n系统内置严格的安全白名单机制，个人源码与账号登录态均受严密保护。`
        );
        if (!ok) return;

        setCleanupExecuting(true);
        setCleanResult(null);

        try {
          const res = await fetch(CLEANUP_EXECUTE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetIds: Array.from(selectedTargetIds) })
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          const json = await res.json();
          if (!json.ok && (!json.cleanedList || json.cleanedList.length === 0)) {
            throw new Error(json.error || '清理执行遇到异常');
          }
          setCleanResult(json);

          // 重新拉取清理项和全局大盘数据
          await fetchCleanupTargets();
          await fetchData(true);
        } catch (err) {
          alert('清理操作失败: ' + (err.message || String(err)));
        } finally {
          setCleanupExecuting(false);
        }
      };

      // 就地清理单个目标
      const handleCleanSingle = async (target) => {
        const ok = window.confirm(
          `确定要清理 [${target.name}] (${formatBytes(target.size)}) 吗？\n路径：${target.path}`
        );
        if (!ok) return;

        try {
          const res = await fetch(CLEANUP_EXECUTE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetIds: [target.id] })
          });
          const json = await res.json();
          if (json.ok) {
            alert(`已成功清理 ${target.name}，释放 ${formatBytes(json.totalFreedBytes)} 空间！`);
            await fetchData(true);
            await fetchCleanupTargets();
          } else {
            alert(`清理失败：${json.error || '未知错误'}`);
          }
        } catch (err) {
          alert(`清理执行异常：${err.message || err}`);
        }
      };

      // 计算当前勾选的项目总可释放空间
      const selectedCleanableBytes = useMemo(() => {
        if (!cleanupData || !cleanupData.groups) return 0;
        let total = 0;
        for (const g of cleanupData.groups) {
          for (const t of g.targets || []) {
            if (selectedTargetIds.has(t.id)) {
              total += t.size || 0;
            }
          }
        }
        return total;
      }, [cleanupData, selectedTargetIds]);

      // 筛选工作区
      const filteredWorkspaces = useMemo(() => {
        if (!data || !data.workspaces) return [];
        let list = data.workspaces;

        if (activeTab === 'large') {
          list = list.filter((w) => w.totalStorageBytes > 50 * 1024 * 1024);
        } else if (activeTab === 'dependencies') {
          list = list.filter((w) => (w.categories?.dependencies?.bytes || 0) > 10 * 1024 * 1024);
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          list = list.filter(
            (w) =>
              (w.title && w.title.toLowerCase().includes(q)) ||
              (w.path && w.path.toLowerCase().includes(q)) ||
              (w.sessions &&
                w.sessions.some(
                  (s) =>
                    (s.title && s.title.toLowerCase().includes(q)) ||
                    (s.id && s.id.toLowerCase().includes(q))
                ))
          );
        }
        return list;
      }, [data, activeTab, searchQuery]);

      // 当切换到依赖治理标签时，自动拉取治理数据
      useEffect(() => {
        if (mainView === 'governance' && !govData && !govLoading) {
          fetchGovData(false);
        }
      }, [mainView, govData, govLoading, fetchGovData]);

      // 渲染跨项目依赖治理总览视图
      const renderGovernanceView = () => {
        if (!govData && govLoading) {
          return h(
            'div',
            { className: 'si-loading-box' },
            '正在扫描项目、提取环境指纹与分析跨项目依赖治理状态，请稍候...'
          );
        }

        if (!govData && govError) {
          return h(
            'div',
            { className: 'si-card', style: { borderColor: '#ef4444' } },
            h('div', { style: { color: '#ef4444', fontWeight: 600, fontSize: '0.95rem' } }, '读取跨项目依赖治理数据失败'),
            h('div', { style: { fontSize: '0.85rem', color: 'var(--dsw-alias-label-secondary, #475569)', margin: '6px 0 12px' } }, govError),
            h(
              'button',
              {
                className: 'si-btn si-btn-primary',
                onClick: () => fetchGovData(true)
              },
              '🔄 重新扫描分析'
            )
          );
        }

        if (!govData) {
          return h(
            'div',
            { className: 'si-loading-box' },
            '正在就绪依赖治理分析引擎...'
          );
        }

        const kpi = govData.kpi || {};
        const nodeBuckets = govData.nodeBuckets || [];
        const projects = govData.projects || [];
        const activeProjects = projects.filter((p) => !p.isEmpty);
        const matrix = govData.matrix || [];
        const findings = govData.findings || [];

        // 过滤矩阵数据
        let filteredMatrix = matrix;
        if (matrixKind !== 'all') {
          filteredMatrix = filteredMatrix.filter((r) => r.kind === matrixKind);
        }
        if (matrixFilter === 'drift-major') {
          filteredMatrix = filteredMatrix.filter((r) => r.verdict === 'drift-major');
        } else if (matrixFilter === 'bucket-conflict') {
          filteredMatrix = filteredMatrix.filter((r) => r.verdict === 'bucket-conflict');
        } else if (matrixFilter === 'identical') {
          filteredMatrix = filteredMatrix.filter((r) => r.verdict === 'identical');
        } else if (matrixFilter === 'multi-consumer') {
          filteredMatrix = filteredMatrix.filter((r) => r.consumerCount > 1);
        }
        if (matrixSearch.trim()) {
          const q = matrixSearch.trim().toLowerCase();
          filteredMatrix = filteredMatrix.filter(
            (r) =>
              r.name.toLowerCase().includes(q) ||
              (r.resolvedVersions && r.resolvedVersions.some((v) => v.toLowerCase().includes(q)))
          );
        }

        // 过滤治理发现项
        let filteredFindings = findings;
        if (findingLevelFilter !== 'all') {
          filteredFindings = filteredFindings.filter((f) => f.level === findingLevelFilter);
        }

        return h(
          'div',
          { className: 'si-gov-container' },

          // A. 顶部提示条与状态信息
          h(
            'div',
            { className: 'si-gov-header-bar' },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
              h('span', { className: 'si-gov-badge-readonly' }, '🛡️ 严格只读事实分析'),
              h(
                'span',
                { style: { fontSize: '0.8rem', color: 'var(--dsw-alias-label-secondary, #475569)' } },
                '基于 package.json、lockfile 与环境配置文件构建，不修改任何文件系统，安全无写操作'
              )
            ),
            h(
              'div',
              { style: { fontSize: '0.74rem', color: 'var(--dsw-alias-label-tertiary, #64748b)' } },
              govData.cached
                ? `⚡ 命中内存缓存（TTL 还剩 ${govData.ttl ?? 0}s）`
                : `🕒 最新分析时间: ${new Date(govData.timestamp || Date.now()).toLocaleTimeString()}`
            )
          ),

          // B. 五大核心指标 KPI 卡片
          h(
            'div',
            { className: 'si-gov-kpi-grid' },
            h(
              'div',
              { className: 'si-gov-kpi-card' },
              h('div', { className: 'si-gov-kpi-label' }, '📦 纳入治理项目'),
              h('div', { className: 'si-gov-kpi-value' }, kpi.totalProjects ?? projects.length),
              h(
                'div',
                { className: 'si-gov-kpi-desc' },
                `活跃: ${kpi.activeProjects ?? activeProjects.length} / 空依赖: ${kpi.emptyProjects ?? 0}`
              )
            ),
            h(
              'div',
              { className: 'si-gov-kpi-card' },
              h('div', { className: 'si-gov-kpi-label' }, '📚 依赖包总数'),
              h('div', { className: 'si-gov-kpi-value' }, kpi.totalUniquePackages ?? matrix.length),
              h('div', { className: 'si-gov-kpi-desc' }, `多项目复用: ${kpi.multiConsumerPackages ?? 0} 个`)
            ),
            h(
              'div',
              { className: 'si-gov-kpi-card' },
              h('div', { className: 'si-gov-kpi-label' }, '⚠️ 主版本漂移'),
              h(
                'div',
                {
                  className: 'si-gov-kpi-value',
                  style: { color: (kpi.driftMajorPackages || 0) > 0 ? '#f59e0b' : 'inherit' }
                },
                kpi.driftMajorPackages ?? 0
              ),
              h('div', { className: 'si-gov-kpi-desc' }, `次版本/补丁漂移: ${kpi.driftMinorPackages ?? 0} 个`)
            ),
            h(
              'div',
              { className: 'si-gov-kpi-card' },
              h('div', { className: 'si-gov-kpi-label' }, '🚫 Node 分桶冲突'),
              h(
                'div',
                {
                  className: 'si-gov-kpi-value',
                  style: { color: (kpi.bucketConflictPackages || 0) > 0 ? '#ef4444' : 'inherit' }
                },
                kpi.bucketConflictPackages ?? 0
              ),
              h('div', { className: 'si-gov-kpi-desc' }, `共 ${kpi.nodeBucketCount ?? nodeBuckets.length} 个运行时环境`)
            ),
            h(
              'div',
              { className: 'si-gov-kpi-card' },
              h('div', { className: 'si-gov-kpi-label' }, '🟢 完全同版本'),
              h(
                'div',
                {
                  className: 'si-gov-kpi-value',
                  style: { color: '#10b981' }
                },
                kpi.identicalPackages ?? 0
              ),
              h('div', { className: 'si-gov-kpi-desc' }, '同环境就绪收敛候选')
            )
          ),

          // C. Node 运行环境分桶洞察
          h(
            'div',
            { className: 'si-gov-section' },
            h(
              'div',
              { className: 'si-gov-section-header' },
              h(
                'div',
                null,
                h(
                  'div',
                  { className: 'si-gov-section-title' },
                  '⚙️ Node 运行环境分桶洞察',
                  h('span', { className: 'si-badge si-badge-blue' }, `${nodeBuckets.length} 个环境分桶`)
                ),
                h(
                  'div',
                  { className: 'si-gov-section-subtitle' },
                  '通过项目 .nvmrc / .node-version / package.json engines 聚类，跨桶项目天然隔离不可共享 node_modules'
                )
              )
            ),
            h(
              'div',
              { className: 'si-gov-bucket-grid' },
              nodeBuckets.map((bucket) => {
                const confLabel =
                  bucket.confidence === 'exact'
                    ? '精确锁定'
                    : bucket.confidence === 'multi'
                    ? '范围模糊'
                    : '缺失声明';
                const confBadgeClass =
                  bucket.confidence === 'exact'
                    ? 'si-badge-green'
                    : bucket.confidence === 'multi'
                    ? 'si-badge-amber'
                    : 'si-badge-gray';

                return h(
                  'div',
                  {
                    key: bucket.bucketKey,
                    className: `si-gov-bucket-card bucket-${bucket.confidence || 'exact'}`
                  },
                  h(
                    'div',
                    { className: 'si-gov-bucket-header' },
                    h(
                      'div',
                      null,
                      h('div', { className: 'si-gov-bucket-title' }, bucket.label || bucket.bucketKey),
                      h('div', { className: 'si-gov-bucket-key' }, bucket.bucketKey)
                    ),
                    h('span', { className: `si-badge ${confBadgeClass}` }, confLabel)
                  ),
                  h(
                    'div',
                    { className: 'si-gov-bucket-projects' },
                    (bucket.projectIds || []).map((pid) => {
                      const proj = projects.find((p) => p.id === pid);
                      return h(
                        'span',
                        {
                          key: pid,
                          className: 'si-gov-project-tag',
                          onClick: () => openProjectDrawer(pid),
                          title: '点击查看该项目详细依赖事实'
                        },
                        '📦 ',
                        proj ? proj.name : pid
                      );
                    })
                  ),
                  bucket.confidence === 'missing'
                    ? h(
                        'div',
                        { className: 'si-gov-notice-box si-gov-notice-warning' },
                        '该桶内项目未声明 Node 版本约束，生产构建与跨机部署可能隐式漂移，建议补全 .nvmrc'
                      )
                    : null
                );
              })
            )
          ),

          // D. 跨项目依赖版本漂移矩阵
          h(
            'div',
            { className: 'si-gov-section' },
            h(
              'div',
              { className: 'si-gov-section-header' },
              h(
                'div',
                null,
                h(
                  'div',
                  { className: 'si-gov-section-title' },
                  '🧭 跨项目依赖版本漂移矩阵 (Multi-Project Drift Matrix)'
                ),
                h(
                  'div',
                  { className: 'si-gov-section-subtitle' },
                  '横向比对各项目在同一依赖包上的声明与解析版本，快速锁定主版本分叉与跨环境复用风险'
                )
              ),
              // 顶部操作栏：过滤与搜索
              h(
                'div',
                { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
                // 搜索输入框
                h('input', {
                  type: 'text',
                  className: 'si-search-input',
                  style: { minWidth: '180px', height: '30px', fontSize: '0.78rem' },
                  placeholder: '🔍 搜索依赖包名或版本...',
                  value: matrixSearch,
                  onChange: (e) => setMatrixSearch(e.target.value)
                }),
                // 依赖类别下拉
                h(
                  'select',
                  {
                    value: matrixKind,
                    onChange: (e) => setMatrixKind(e.target.value),
                    className: 'si-select',
                    style: {
                      height: '30px',
                      fontSize: '0.78rem',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--dsw-alias-border-l2, #cbd5e1)',
                      background: 'var(--dsw-alias-bg-base, #ffffff)',
                      color: 'var(--dsw-alias-label-primary, #0f1115)'
                    }
                  },
                  h('option', { value: 'all' }, '全部依赖类型'),
                  h('option', { value: 'prod' }, '生产依赖 (dependencies)'),
                  h('option', { value: 'dev' }, '开发依赖 (devDependencies)')
                )
              )
            ),

            // 过滤标签组
            h(
              'div',
              { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              h(
                'button',
                {
                  className: `si-tab-pill ${matrixFilter === 'all' ? 'active' : ''}`,
                  onClick: () => setMatrixFilter('all')
                },
                `全部 (${matrix.length})`
              ),
              h(
                'button',
                {
                  className: `si-tab-pill ${matrixFilter === 'drift-major' ? 'active' : ''}`,
                  onClick: () => setMatrixFilter('drift-major')
                },
                `⚠️ 主版本漂移 (${kpi.driftMajorPackages ?? 0})`
              ),
              h(
                'button',
                {
                  className: `si-tab-pill ${matrixFilter === 'bucket-conflict' ? 'active' : ''}`,
                  onClick: () => setMatrixFilter('bucket-conflict')
                },
                `🚫 分桶冲突 (${kpi.bucketConflictPackages ?? 0})`
              ),
              h(
                'button',
                {
                  className: `si-tab-pill ${matrixFilter === 'identical' ? 'active' : ''}`,
                  onClick: () => setMatrixFilter('identical')
                },
                `🟢 完全同版本 (${kpi.identicalPackages ?? 0})`
              ),
              h(
                'button',
                {
                  className: `si-tab-pill ${matrixFilter === 'multi-consumer' ? 'active' : ''}`,
                  onClick: () => setMatrixFilter('multi-consumer')
                },
                `👥 多项目引用 (${kpi.multiConsumerPackages ?? 0})`
              )
            ),

            // 矩阵表格
            h(
              'div',
              { className: 'si-gov-matrix-wrap' },
              h(
                'table',
                { className: 'si-gov-matrix-table' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    h('th', { style: { minWidth: '150px' } }, '依赖包名'),
                    h('th', { style: { minWidth: '70px' } }, '类型'),
                    h('th', { style: { minWidth: '100px' } }, '判定结论'),
                    h('th', { style: { minWidth: '90px' } }, '引用项目'),
                    h('th', { style: { minWidth: '130px' } }, '涉及版本'),
                    activeProjects.map((p) =>
                      h(
                        'th',
                        {
                          key: p.id,
                          style: { cursor: 'pointer', textAlign: 'center', minWidth: '110px' },
                          onClick: () => openProjectDrawer(p.id),
                          title: `点击查看 ${p.name} 项目详情`
                        },
                        h('span', { style: { textDecoration: 'underline' } }, p.name)
                      )
                    )
                  )
                ),
                h(
                  'tbody',
                  null,
                  filteredMatrix.length === 0
                    ? h(
                        'tr',
                        null,
                        h(
                          'td',
                          {
                            colSpan: 5 + activeProjects.length,
                            style: { textAlign: 'center', padding: '30px', color: 'var(--dsw-alias-label-tertiary, #64748b)' }
                          },
                          '没有匹配的依赖项记录'
                        )
                      )
                    : filteredMatrix.map((row) => {
                        const isExpanded = activeMatrixDetailRow === row.name;
                        const badgeCls =
                          row.level === 'blocked'
                            ? 'si-badge-blocked'
                            : row.level === 'warn'
                            ? 'si-badge-warn'
                            : row.level === 'candidate'
                            ? 'si-badge-candidate'
                            : 'si-badge-info';

                        return h(
                          React.Fragment,
                          { key: row.name },
                          h(
                            'tr',
                            {
                              className: `si-gov-matrix-row ${isExpanded ? 'active' : ''}`,
                              onClick: () => setActiveMatrixDetailRow(isExpanded ? null : row.name),
                              style: { cursor: 'pointer' }
                            },
                            h(
                              'td',
                              { style: { fontWeight: 600, fontFamily: 'monospace' } },
                              row.name
                            ),
                            h(
                              'td',
                              null,
                              h(
                                'span',
                                {
                                  className: `si-badge ${row.kind === 'prod' ? 'si-badge-blue' : 'si-badge-gray'}`,
                                  style: { fontSize: '0.7rem' }
                                },
                                row.kind === 'prod' ? 'prod' : 'dev'
                              )
                            ),
                            h(
                              'td',
                              null,
                              h(
                                'span',
                                { className: `si-badge ${badgeCls}`, style: { fontSize: '0.72rem' } },
                                row.verdictLabel
                              )
                            ),
                            h('td', null, `${row.consumerCount} 个项目`),
                            h(
                              'td',
                              null,
                              (row.resolvedVersions || []).map((v) =>
                                h(
                                  'span',
                                  {
                                    key: v,
                                    className: 'si-gov-cell-badge',
                                    style: { background: 'var(--dsw-alias-bg-layer-2, #f1f5f9)', marginRight: '4px' }
                                  },
                                  v
                                )
                              )
                            ),
                            activeProjects.map((p) => {
                              const cell = row.projects?.[p.id];
                              if (!cell) {
                                return h(
                                  'td',
                                  { key: p.id, style: { textAlign: 'center', color: '#cbd5e1' } },
                                  '-'
                                );
                              }
                              return h(
                                'td',
                                { key: p.id, style: { textAlign: 'center' } },
                                h(
                                  'span',
                                  {
                                    className: 'si-gov-cell-badge',
                                    style: {
                                      background: cell.exact ? '#dcfce7' : '#fef3c7',
                                      color: cell.exact ? '#166534' : '#92400e',
                                      fontWeight: cell.exact ? 600 : 400
                                    },
                                    title: `声明: ${cell.range} | 锁定: ${cell.resolved || '无锁'} | 桶: ${cell.bucket}`
                                  },
                                  cell.resolved || cell.range
                                )
                              );
                            })
                          ),
                          // 点击展开该依赖行的详细信息
                          isExpanded &&
                            h(
                              'tr',
                              { style: { background: 'var(--dsw-alias-bg-layer-1, #f8fafc)' } },
                              h(
                                'td',
                                { colSpan: 5 + activeProjects.length, style: { padding: '12px 18px' } },
                                h(
                                  'div',
                                  { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                                  h(
                                    'div',
                                    { style: { fontWeight: 600, fontSize: '0.82rem' } },
                                    `🔍 依赖详情: ${row.name} (${row.verdictLabel})`
                                  ),
                                  h(
                                    'div',
                                    { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
                                    Object.values(row.projects || {}).map((item) =>
                                      h(
                                        'div',
                                        {
                                          key: item.projectId,
                                          style: {
                                            padding: '6px 10px',
                                            borderRadius: '6px',
                                            background: 'var(--dsw-alias-bg-base, #ffffff)',
                                            border: '1px solid var(--dsw-alias-border-l2, #e2e8f0)',
                                            fontSize: '0.75rem'
                                          }
                                        },
                                        h('strong', null, item.projectName),
                                        h('div', null, `声明范围: ${item.range}`),
                                        h('div', null, `锁定版本: ${item.resolved || '未锁定'}`),
                                        h(
                                          'div',
                                          { style: { color: 'var(--dsw-alias-label-tertiary, #64748b)' } },
                                          `环境分桶: ${item.bucket}`
                                        )
                                      )
                                    )
                                  )
                                )
                              )
                            )
                        );
                      })
                )
              )
            )
          ),

          // E. 架构与治理发现建议清单
          h(
            'div',
            { className: 'si-gov-section' },
            h(
              'div',
              { className: 'si-gov-section-header' },
              h(
                'div',
                null,
                h(
                  'div',
                  { className: 'si-gov-section-title' },
                  '📋 治理发现项与落地建议 (Findings & Recommendations)',
                  h('span', { className: 'si-badge si-badge-gray' }, `${findings.length} 条事实发现`)
                ),
                h(
                  'div',
                  { className: 'si-gov-section-subtitle' },
                  '四级严重度分级建议；严格遵循零写操作与只读审计原则，清晰指出版本漂移证据链'
                )
              ),
              // 严重度过滤
              h(
                'div',
                { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                h(
                  'button',
                  {
                    className: `si-tab-pill ${findingLevelFilter === 'all' ? 'active' : ''}`,
                    onClick: () => setFindingLevelFilter('all')
                  },
                  `全部 (${findings.length})`
                ),
                h(
                  'button',
                  {
                    className: `si-tab-pill ${findingLevelFilter === 'blocked' ? 'active' : ''}`,
                    onClick: () => setFindingLevelFilter('blocked')
                  },
                  '🚫 阻断级'
                ),
                h(
                  'button',
                  {
                    className: `si-tab-pill ${findingLevelFilter === 'warn' ? 'active' : ''}`,
                    onClick: () => setFindingLevelFilter('warn')
                  },
                  '⚠️ 警告级'
                ),
                h(
                  'button',
                  {
                    className: `si-tab-pill ${findingLevelFilter === 'candidate' ? 'active' : ''}`,
                    onClick: () => setFindingLevelFilter('candidate')
                  },
                  '🟢 收敛候选'
                ),
                h(
                  'button',
                  {
                    className: `si-tab-pill ${findingLevelFilter === 'info' ? 'active' : ''}`,
                    onClick: () => setFindingLevelFilter('info')
                  },
                  'ℹ️ 架构提示'
                )
              )
            ),

            // 发现项列表卡片
            h(
              'div',
              { className: 'si-gov-findings-list' },
              filteredFindings.length === 0
                ? h(
                    'div',
                    { className: 'si-empty-box' },
                    '当前筛选条件下没有待处理的发现项'
                  )
                : filteredFindings.map((finding) => {
                    const badgeCls =
                      finding.level === 'blocked'
                        ? 'si-badge-blocked'
                        : finding.level === 'warn'
                        ? 'si-badge-warn'
                        : finding.level === 'candidate'
                        ? 'si-badge-candidate'
                        : 'si-badge-info';

                    return h(
                      'div',
                      {
                        key: finding.id,
                        className: `si-gov-finding-card level-${finding.level}`
                      },
                      h(
                        'div',
                        { className: 'si-gov-finding-header' },
                        h(
                          'div',
                          { className: 'si-gov-finding-title' },
                          finding.title
                        ),
                        h(
                          'span',
                          { className: `si-badge ${badgeCls}` },
                          finding.level.toUpperCase()
                        )
                      ),
                      finding.description &&
                        h('div', { className: 'si-gov-finding-desc' }, finding.description),
                      finding.evidence &&
                        finding.evidence.length > 0 &&
                        h(
                          'div',
                          { className: 'si-gov-evidence-box' },
                          h(
                            'div',
                            { style: { fontWeight: 600, fontSize: '0.74rem', color: 'var(--dsw-alias-label-secondary, #475569)' } },
                            '🔍 事实证据链条 (Evidence):'
                          ),
                          h(
                            'ul',
                            { className: 'si-gov-evidence-list' },
                            finding.evidence.map((ev, i) =>
                              h('li', { key: i }, ev)
                            )
                          )
                        ),
                      finding.recommendation &&
                        h(
                          'div',
                          { className: 'si-gov-rec-box' },
                          h('strong', null, '💡 治理建议: '),
                          finding.recommendation
                        ),
                      h(
                        'div',
                        { style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' } },
                        h(
                          'span',
                          { style: { fontSize: '0.72rem', color: 'var(--dsw-alias-label-tertiary, #64748b)' } },
                          '关联项目:'
                        ),
                        (finding.projectIds || []).map((pid) =>
                          h(
                            'span',
                            {
                              key: pid,
                              className: 'si-gov-project-tag',
                              onClick: () => openProjectDrawer(pid),
                              title: '点击打开该项目依赖抽屉'
                            },
                            '📦 ',
                            pid
                          )
                        )
                      )
                    );
                  })
            )
          )
        );
      };

      // 渲染项目详情滑动抽屉
      const renderProjectDrawer = () => {
        if (!drawerProjectId) return null;

        const proj = drawerData?.project;
        const dependencies = drawerData?.dependencies || [];

        // 过滤依赖
        let filteredDeps = dependencies;
        if (drawerKindFilter !== 'all') {
          filteredDeps = filteredDeps.filter((d) => d.kind === drawerKindFilter);
        }
        if (drawerSearch.trim()) {
          const q = drawerSearch.trim().toLowerCase();
          filteredDeps = filteredDeps.filter(
            (d) =>
              d.name.toLowerCase().includes(q) ||
              (d.resolved && d.resolved.toLowerCase().includes(q)) ||
              (d.range && d.range.toLowerCase().includes(q))
          );
        }

        return h(
          'div',
          {
            className: 'si-gov-drawer-mask',
            onClick: () => setDrawerProjectId(null)
          },
          h(
            'div',
            {
              className: 'si-gov-drawer',
              onClick: (e) => e.stopPropagation()
            },
            // 抽屉头部
            h(
              'div',
              { className: 'si-gov-drawer-header' },
              h(
                'div',
                { className: 'si-gov-drawer-title' },
                h('span', null, '📦 项目依赖事实:'),
                h('span', { style: { fontFamily: 'monospace' } }, proj ? proj.name : drawerProjectId)
              ),
              h(
                'button',
                {
                  className: 'si-gov-drawer-close',
                  onClick: () => setDrawerProjectId(null),
                  title: '关闭抽屉'
                },
                '✕'
              )
            ),

            // 抽屉主体
            h(
              'div',
              { className: 'si-gov-drawer-body' },
              drawerLoading
                ? h(
                    'div',
                    { className: 'si-loading-box' },
                    '正在提取项目依赖事实与环境指纹...'
                  )
                : !drawerData || !proj
                ? h(
                    'div',
                    { className: 'si-empty-box' },
                    '未找到该项目的依赖详情数据'
                  )
                : h(
                    React.Fragment,
                    null,

                    // 1. 基本信息卡片
                    h(
                      'div',
                      {
                        style: {
                          background: 'var(--dsw-alias-bg-layer-1, #f8fafc)',
                          border: '1px solid var(--dsw-alias-border-l2, #e2e8f0)',
                          borderRadius: '8px',
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }
                      },
                      h(
                        'div',
                        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                        h('strong', { style: { fontSize: '0.92rem' } }, proj.name),
                        h(
                          'span',
                          { className: `si-badge ${proj.hasLockfile ? 'si-badge-green' : 'si-badge-amber'}` },
                          proj.hasLockfile ? `Lockfile: ${proj.lockfileType}` : '无锁文件 (No Lockfile)'
                        )
                      ),
                      h(
                        'div',
                        { style: { fontSize: '0.76rem', color: 'var(--dsw-alias-label-secondary, #475569)', wordBreak: 'break-all' } },
                        `工作区: ${proj.workspaceName || '-'} | 相对路径: ${proj.relativePath || './'}`
                      ),
                      h(
                        'div',
                        { style: { fontSize: '0.74rem', color: 'var(--dsw-alias-label-tertiary, #64748b)', wordBreak: 'break-all', fontFamily: 'monospace' } },
                        proj.projectPath
                      ),
                      h(
                        'div',
                        { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' } },
                        h(
                          'span',
                          { className: 'si-badge si-badge-blue' },
                          `Node 环境: ${proj.runtime?.targetNodeVersion || '未明确声明'} (${proj.runtime?.confidence || 'missing'})`
                        ),
                        h(
                          'span',
                          { className: 'si-badge si-badge-gray' },
                          `平台: ${proj.runtime?.platform || 'darwin'}-${proj.runtime?.arch || 'arm64'}`
                        ),
                        h(
                          'span',
                          { className: 'si-badge si-badge-gray' },
                          `包管理器: ${proj.packageManager || '未知'}`
                        )
                      ),
                      h(
                        'div',
                        { style: { fontSize: '0.78rem', marginTop: '4px', fontWeight: 500 } },
                        `生产依赖: ${proj.depCounts?.prod || 0} / 开发依赖: ${proj.depCounts?.dev || 0} / 合计: ${proj.depCounts?.total || 0}`
                      )
                    ),

                    // 2. 项目涉及的治理发现项
                    drawerData.findings && drawerData.findings.length > 0 &&
                      h(
                        'div',
                        { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                        h('div', { style: { fontWeight: 600, fontSize: '0.85rem' } }, '⚠️ 该项目涉及的治理发现:'),
                        drawerData.findings.map((f) =>
                          h(
                            'div',
                            {
                              key: f.id,
                              style: {
                                padding: '8px 12px',
                                borderRadius: '6px',
                                borderLeft: '3px solid #f59e0b',
                                background: 'rgba(254, 252, 232, 0.4)',
                                fontSize: '0.76rem'
                              }
                            },
                            h('div', { style: { fontWeight: 600 } }, f.title),
                            f.recommendation &&
                              h('div', { style: { color: 'var(--dsw-alias-label-secondary, #475569)', marginTop: '2px' } }, f.recommendation)
                          )
                        )
                      ),

                    // 3. 依赖事实列表
                    h(
                      'div',
                      { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
                      h(
                        'div',
                        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } },
                        h('div', { style: { fontWeight: 600, fontSize: '0.88rem' } }, `📋 完整依赖事实清单 (${filteredDeps.length})`),
                        h(
                          'div',
                          { style: { display: 'flex', gap: '6px' } },
                          h(
                            'button',
                            {
                              className: `si-tab-pill ${drawerKindFilter === 'all' ? 'active' : ''}`,
                              onClick: () => setDrawerKindFilter('all')
                            },
                            '全部'
                          ),
                          h(
                            'button',
                            {
                              className: `si-tab-pill ${drawerKindFilter === 'prod' ? 'active' : ''}`,
                              onClick: () => setDrawerKindFilter('prod')
                            },
                            'prod'
                          ),
                          h(
                            'button',
                            {
                              className: `si-tab-pill ${drawerKindFilter === 'dev' ? 'active' : ''}`,
                              onClick: () => setDrawerKindFilter('dev')
                            },
                            'dev'
                          )
                        )
                      ),
                      h('input', {
                        type: 'text',
                        className: 'si-search-input',
                        placeholder: '🔍 过滤该项目依赖包名或版本...',
                        value: drawerSearch,
                        onChange: (e) => setDrawerSearch(e.target.value)
                      }),
                      h(
                        'table',
                        { className: 'si-gov-dep-table' },
                        h(
                          'thead',
                          null,
                          h(
                            'tr',
                            null,
                            h('th', null, '依赖包名'),
                            h('th', null, '类别'),
                            h('th', null, '声明范围 (Range)'),
                            h('th', null, '解析锁定 (Resolved)'),
                            h('th', null, '状态')
                          )
                        ),
                        h(
                          'tbody',
                          null,
                          filteredDeps.length === 0
                            ? h(
                                'tr',
                                null,
                                h(
                                  'td',
                                  { colSpan: 5, style: { textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #64748b)', padding: '20px' } },
                                  '暂无依赖数据'
                                )
                              )
                            : filteredDeps.map((dep) =>
                                h(
                                  'tr',
                                  { key: dep.name },
                                  h('td', { style: { fontFamily: 'monospace', fontWeight: 600 } }, dep.name),
                                  h(
                                    'td',
                                    null,
                                    h(
                                      'span',
                                      {
                                        className: `si-badge ${dep.kind === 'prod' ? 'si-badge-blue' : 'si-badge-gray'}`,
                                        style: { fontSize: '0.68rem' }
                                      },
                                      dep.kind
                                    )
                                  ),
                                  h('td', { style: { fontFamily: 'monospace' } }, dep.range),
                                  h(
                                    'td',
                                    { style: { fontFamily: 'monospace', fontWeight: dep.exact ? 600 : 400 } },
                                    dep.resolved || '-'
                                  ),
                                  h(
                                    'td',
                                    null,
                                    dep.exact
                                      ? h('span', { className: 'si-badge si-badge-green', style: { fontSize: '0.68rem' } }, '精确锁定')
                                      : h('span', { className: 'si-badge si-badge-amber', style: { fontSize: '0.68rem' } }, '范围未锁')
                                  )
                                )
                              )
                        )
                      )
                    )
                  )
            )
          )
        );
      };

      if (loading && !data) {
        return h(
          'div',
          { className: 'si-container' },
          h(
            'div',
            { className: 'si-loading-box' },
            '正在扫描并分析本地工作区与对话存储空间，请稍候...'
          )
        );
      }

      if (error && !data) {
        return h(
          'div',
          { className: 'si-container' },
          h(
            'div',
            { className: 'si-card', style: { borderColor: '#ef4444' } },
            h('div', { style: { color: '#ef4444', fontWeight: 600 } }, '读取存储分析数据失败'),
            h('div', { style: { fontSize: '0.85rem', color: 'var(--dsw-alias-label-secondary, #475569)' } }, error),
            h(
              'button',
              {
                className: 'si-btn si-btn-primary',
                style: { alignSelf: 'flex-start', marginTop: '8px' },
                onClick: () => fetchData(true)
              },
              '重试'
            )
          )
        );
      }

      const summary = data?.summary || {};
      const totalBytes = summary.totalStorageBytes || 1;
      const pctCode = ((summary.categories?.code || 0) / totalBytes) * 100;
      const pctDep = ((summary.categories?.dependencies || 0) / totalBytes) * 100;
      const pctBuild = ((summary.categories?.build || 0) / totalBytes) * 100;
      const pctVcs = ((summary.categories?.vcs || 0) / totalBytes) * 100;
      const pctDocs = ((summary.categories?.docs || 0) / totalBytes) * 100;
      const pctMedia = ((summary.categories?.media || 0) / totalBytes) * 100;
      const pctSessions = ((summary.totalSessionsBytes || 0) / totalBytes) * 100;
      const pctAtt = ((summary.attachmentsBytes || 0) / totalBytes) * 100;

      return h(
        'div',
        { className: 'si-container' },

        // 1. 顶部 Header 与视图切换
        h(
          'div',
          { className: 'si-header' },
          h(
            'div',
            { className: 'si-title-group' },
            h(
              'h2',
              null,
              mainView === 'governance'
                ? '🧭 跨项目依赖治理诊断'
                : mainView === 'dashboard'
                ? '💾 本地存储空间全景分析'
                : '🧹 本地磁盘智能清理与空间释放'
            ),
            h(
              'p',
              null,
              mainView === 'governance'
                ? '多工作区依赖版本漂移分析与 Node 运行环境分桶洞察；严格只读诊断，绝不修改任何本地项目或配置'
                : mainView === 'dashboard'
                ? `精确统计每个工作区的项目代码、依赖包、构建产物、文件及全部 ${summary.totalSessions || 0} 个对话 Session 记录`
                : '深度排查系统开发缓存、工作区构建垃圾、DSH 历史归档与冗余依赖，安全释放数 GB 磁盘空间'
            )
          ),
          h(
            'div',
            { className: 'si-actions' },
            // 主模式切换选项卡
            h(
              'div',
              { className: 'si-main-tabs' },
              h(
                'button',
                {
                  className: `si-main-tab-btn ${mainView === 'dashboard' ? 'active' : ''}`,
                  onClick: () => setMainView('dashboard')
                },
                '📊 全景存储分析'
              ),
              h(
                'button',
                {
                  className: `si-main-tab-btn ${mainView === 'cleaner' ? 'active' : ''}`,
                  onClick: () => {
                    setMainView('cleaner');
                    if (!cleanupData) fetchCleanupTargets();
                  }
                },
                '🧹 磁盘清理中心',
                cleanupData && cleanupData.safeCleanableBytes > 0
                  ? h(
                      'span',
                      {
                        className: 'si-badge si-badge-green',
                        style: { marginLeft: '2px', fontSize: '0.7rem' }
                      },
                      formatBytes(cleanupData.safeCleanableBytes)
                    )
                  : null
              ),
              h(
                'button',
                {
                  className: `si-main-tab-btn ${mainView === 'governance' ? 'active' : ''}`,
                  onClick: () => {
                    setMainView('governance');
                    if (!govData && !govLoading) fetchGovData(false);
                  }
                },
                '🧭 依赖治理',
                h(
                  'span',
                  {
                    className: 'si-badge si-badge-blue',
                    style: { marginLeft: '2px', fontSize: '0.68rem', padding: '1px 5px' }
                  },
                  '只读'
                )
              )
            ),
            mainView === 'governance'
              ? h(
                  React.Fragment,
                  null,
                  h(
                    'button',
                    {
                      className: 'si-btn',
                      onClick: () => exportGovernanceJson(govData),
                      disabled: !govData || govLoading
                    },
                    '⬇️ 导出 JSON'
                  ),
                  h(
                    'button',
                    {
                      className: 'si-btn',
                      onClick: () => exportGovernanceMarkdown(govData),
                      disabled: !govData || govLoading
                    },
                    '📝 导出 Markdown'
                  ),
                  h(
                    'button',
                    {
                      className: 'si-btn si-btn-primary',
                      onClick: () => fetchGovData(true),
                      disabled: govRefreshing || govLoading
                    },
                    govRefreshing ? '正在分析...' : '🔄 强制刷新'
                  )
                )
              : h(
                  'button',
                  {
                    className: 'si-btn',
                    onClick: () => {
                      fetchData(true);
                      fetchCleanupTargets();
                    },
                    disabled: refreshing || cleanupLoading
                  },
                  refreshing || cleanupLoading ? '正在扫描...' : '🔄 重新扫描'
                )
          )
        ),

        // 2. 根据 mainView 渲染治理视图、清理视图或看板视图
        mainView === 'governance'
          ? renderGovernanceView()
          : mainView === 'cleaner'
          ? // ==================== 磁盘清理中心视图 ====================
            h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },

              // 清理成功结果提示条
              cleanResult &&
                h(
                  'div',
                  { className: 'si-clean-success-banner' },
                  h(
                    'div',
                    { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    h('span', { style: { fontSize: '1.2rem' } }, '🎉'),
                    h(
                      'span',
                      null,
                      `清理完成！本次共成功释放 `,
                      h('strong', null, formatBytes(cleanResult.totalFreedBytes)),
                      ` 磁盘空间（已处理 ${cleanResult.cleanedCount} 个项目）。`
                    )
                  ),
                  h(
                    'button',
                    {
                      className: 'si-btn si-btn-sm',
                      onClick: () => setCleanResult(null)
                    },
                    '✕ 关闭'
                  )
                ),

              // 顶部预估释放 Hero Banner
              h(
                'div',
                { className: 'si-clean-banner' },
                h(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                  h(
                    'div',
                    { style: { fontSize: '0.85rem', color: 'var(--dsw-alias-label-secondary, #475569)', fontWeight: 600 } },
                    '⚡ 选定项目预估可释放空间'
                  ),
                  h(
                    'div',
                    { className: 'si-clean-summary-val' },
                    formatBytes(selectedCleanableBytes)
                  ),
                  h(
                    'div',
                    { style: { fontSize: '0.78rem', color: 'var(--dsw-alias-label-tertiary, #64748b)' } },
                    `已勾选 ${selectedTargetIds.size} 项 / 全量可清理项共 ${
                      cleanupData
                        ? (cleanupData.groups || []).reduce((acc, g) => acc + (g.targets?.length || 0), 0)
                        : 0
                    } 项（全量可释放 ${formatBytes(cleanupData?.totalCleanableBytes || 0)}）`
                  )
                ),

                // 快捷操作与立即清理按钮
                h(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' } },
                  h(
                    'div',
                    { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                    h(
                      'button',
                      { className: 'si-tab-pill', onClick: selectSafeOnly },
                      '🟢 推荐无风险项'
                    ),
                    h(
                      'button',
                      { className: 'si-tab-pill', onClick: selectSafeAndBuilds },
                      '🟡 +构建产物'
                    ),
                    h('button', { className: 'si-tab-pill', onClick: selectAll }, '⚪ 全选'),
                    h('button', { className: 'si-tab-pill', onClick: clearAll }, '✕ 清空')
                  ),
                  h(
                    'button',
                    {
                      className: 'si-btn si-btn-primary',
                      style: { padding: '8px 20px', fontSize: '0.9rem', fontWeight: 600 },
                      onClick: handleExecuteCleanup,
                      disabled: selectedTargetIds.size === 0 || cleanupExecuting
                    },
                    cleanupExecuting
                      ? '⏳ 正在安全释放空间...'
                      : `🚀 立即清理释放 ${formatBytes(selectedCleanableBytes)}`
                  )
                )
              ),

              // 分组清理目标列表
              cleanupLoading
                ? h('div', { className: 'si-loading-box' }, '正在深度排查全盘可清理项...')
                : (cleanupData?.groups || []).map((group) => {
                    const targets = group.targets || [];
                    if (targets.length === 0) return null;

                    const groupTotalBytes = targets.reduce((sum, t) => sum + (t.size || 0), 0);
                    const allSelected = targets.every((t) => selectedTargetIds.has(t.id));

                    return h(
                      'div',
                      { key: group.id, className: 'si-clean-group' },
                      // 分组头部
                      h(
                        'div',
                        { className: 'si-clean-group-header' },
                        h(
                          'div',
                          { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                          h('span', { style: { fontWeight: 600, fontSize: '0.95rem' } }, group.title),
                          h(
                            'span',
                            { className: 'si-badge si-badge-blue' },
                            formatBytes(groupTotalBytes)
                          )
                        ),
                        h(
                          'div',
                          { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                          h(
                            'span',
                            { style: { fontSize: '0.78rem', color: 'var(--dsw-alias-label-tertiary, #64748b)' } },
                            group.description
                          ),
                          h(
                            'button',
                            {
                              className: 'si-btn si-btn-sm',
                              onClick: () => toggleGroupSelect(group)
                            },
                            allSelected ? '取消本组' : '全选本组'
                          )
                        )
                      ),

                      // 目标条目
                      h(
                        'div',
                        null,
                        targets.map((target) => {
                          const isChecked = selectedTargetIds.has(target.id);
                          return h(
                            'div',
                            {
                              key: target.id,
                              className: 'si-clean-item'
                            },
                            h('input', {
                              type: 'checkbox',
                              className: 'si-clean-checkbox',
                              checked: isChecked,
                              onChange: () => toggleTargetSelect(target.id)
                            }),
                            h(
                              'div',
                              {
                                style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', cursor: 'pointer' },
                                onClick: () => toggleTargetSelect(target.id)
                              },
                              h(
                                'div',
                                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                                h(
                                  'div',
                                  { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                                  h(
                                    'span',
                                    { style: { fontWeight: 600, fontSize: '0.9rem', color: 'var(--dsw-alias-label-primary, #0f1115)' } },
                                    target.name
                                  ),
                                  (target.tags || []).map((tag, idx) =>
                                    h(
                                      'span',
                                      {
                                        key: idx,
                                        className: `si-tag ${
                                          target.risk === 'safe'
                                            ? 'si-tag-safe'
                                            : target.risk === 'danger'
                                            ? 'si-tag-danger'
                                            : 'si-tag-warning'
                                        }`
                                      },
                                      tag
                                    )
                                  )
                                ),
                                h(
                                  'span',
                                  {
                                    style: {
                                      fontSize: '0.95rem',
                                      fontWeight: 700,
                                      color: target.risk === 'safe' ? '#15803d' : '#2563eb'
                                    }
                                  },
                                  formatBytes(target.size)
                                )
                              ),
                              h(
                                'div',
                                { style: { fontSize: '0.74rem', color: 'var(--dsw-alias-label-tertiary, #64748b)', fontFamily: 'monospace' } },
                                target.path,
                                target.files ? ` (${target.files} 个文件)` : ''
                              ),
                              h(
                                'div',
                                { style: { fontSize: '0.78rem', color: 'var(--dsw-alias-label-secondary, #475569)', marginTop: '2px' } },
                                target.description
                              )
                            )
                          );
                        })
                      )
                    );
                  })
            )
          : // ==================== 全景存储分析视图 ====================
            h(
              React.Fragment,
              null,

              // 2. 指标卡片网格
              h(
                'div',
                { className: 'si-metrics-grid' },
                h(
                  'div',
                  { className: 'si-card' },
                  h('div', { className: 'si-card-label' }, '💽 本地总占用空间'),
                  h('div', { className: 'si-card-value' }, formatBytes(summary.totalStorageBytes)),
                  h(
                    'div',
                    { className: 'si-card-desc' },
                    h('span', null, `工作区: ${summary.totalWorkspaces} 个`),
                    h('span', null, `总对话: ${summary.totalSessions} 个`)
                  )
                ),
                h(
                  'div',
                  { className: 'si-card' },
                  h('div', { className: 'si-card-label' }, '📦 项目物理文件与代码'),
                  h('div', { className: 'si-card-value' }, formatBytes(summary.totalProjectFilesBytes)),
                  h(
                    'div',
                    { className: 'si-card-desc' },
                    h('span', null, `依赖: ${formatBytes(summary.categories?.dependencies)}`),
                    h('span', null, `代码: ${formatBytes(summary.categories?.code)}`)
                  )
                ),
                h(
                  'div',
                  { className: 'si-card' },
                  h('div', { className: 'si-card-label' }, '💬 对话记录 (Sessions)'),
                  h('div', { className: 'si-card-value' }, formatBytes(summary.totalSessionsBytes)),
                  h(
                    'div',
                    { className: 'si-card-desc' },
                    h('span', null, `包含 jsonl.zstd 记录`),
                    h('span', null, `及投影缓存`)
                  )
                ),
                h(
                  'div',
                  { className: 'si-card' },
                  h('div', { className: 'si-card-label' }, '📎 DSH 全局附件库'),
                  h('div', { className: 'si-card-value' }, formatBytes(summary.attachmentsBytes)),
                  h(
                    'div',
                    { className: 'si-card-desc' },
                    h('span', null, `${summary.attachmentsFiles || 0} 个文件对象`),
                    h('span', null, '图片/生成物')
                  )
                )
              ),

              // 3. 全局存储构成分布条
              h(
                'div',
                { className: 'si-breakdown-box' },
                h(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      color: 'var(--dsw-alias-label-secondary, #475569)'
                    }
                  },
                  h('span', { style: { fontWeight: 600 } }, '总体存储分类分布'),
                  h('span', null, `依赖与构件占总比最高`)
                ),
                h(
                  'div',
                  { className: 'si-breakdown-bar' },
                  pctDep > 0 &&
                    h('div', {
                      style: { width: `${pctDep}%`, background: '#f59e0b' },
                      title: `依赖: ${formatBytes(summary.categories?.dependencies)}`
                    }),
                  pctAtt > 0 &&
                    h('div', {
                      style: { width: `${pctAtt}%`, background: '#e11d48' },
                      title: `附件: ${formatBytes(summary.attachmentsBytes)}`
                    }),
                  pctMedia > 0 &&
                    h('div', {
                      style: { width: `${pctMedia}%`, background: '#ec4899' },
                      title: `媒体: ${formatBytes(summary.categories?.media)}`
                    }),
                  pctVcs > 0 &&
                    h('div', {
                      style: { width: `${pctVcs}%`, background: '#64748b' },
                      title: `版本控制: ${formatBytes(summary.categories?.vcs)}`
                    }),
                  pctSessions > 0 &&
                    h('div', {
                      style: { width: `${pctSessions}%`, background: '#2563eb' },
                      title: `对话记录: ${formatBytes(summary.totalSessionsBytes)}`
                    }),
                  pctDocs > 0 &&
                    h('div', {
                      style: { width: `${pctDocs}%`, background: '#10b981' },
                      title: `文档配置: ${formatBytes(summary.categories?.docs)}`
                    }),
                  pctCode > 0 &&
                    h('div', {
                      style: { width: `${pctCode}%`, background: '#3b82f6' },
                      title: `项目源码: ${formatBytes(summary.categories?.code)}`
                    }),
                  pctBuild > 0 &&
                    h('div', {
                      style: { width: `${pctBuild}%`, background: '#8b5cf6' },
                      title: `构建产物: ${formatBytes(summary.categories?.build)}`
                    })
                ),
                h(
                  'div',
                  { className: 'si-legend-list' },
                  h(
                    'div',
                    { className: 'si-legend-item' },
                    h('span', { className: 'si-legend-dot', style: { background: '#f59e0b' } }),
                    `依赖模块: ${formatBytes(summary.categories?.dependencies)}`
                  ),
                  h(
                    'div',
                    { className: 'si-legend-item' },
                    h('span', { className: 'si-legend-dot', style: { background: '#e11d48' } }),
                    `全局附件: ${formatBytes(summary.attachmentsBytes)}`
                  ),
                  h(
                    'div',
                    { className: 'si-legend-item' },
                    h('span', { className: 'si-legend-dot', style: { background: '#ec4899' } }),
                    `媒体资源: ${formatBytes(summary.categories?.media)}`
                  ),
                  h(
                    'div',
                    { className: 'si-legend-item' },
                    h('span', { className: 'si-legend-dot', style: { background: '#64748b' } }),
                    `版本控制(.git): ${formatBytes(summary.categories?.vcs)}`
                  ),
                  h(
                    'div',
                    { className: 'si-legend-item' },
                    h('span', { className: 'si-legend-dot', style: { background: '#2563eb' } }),
                    `对话记录(Session): ${formatBytes(summary.totalSessionsBytes)}`
                  ),
                  h(
                    'div',
                    { className: 'si-legend-item' },
                    h('span', { className: 'si-legend-dot', style: { background: '#10b981' } }),
                    `文档配置: ${formatBytes(summary.categories?.docs)}`
                  ),
                  h(
                    'div',
                    { className: 'si-legend-item' },
                    h('span', { className: 'si-legend-dot', style: { background: '#3b82f6' } }),
                    `项目源码: ${formatBytes(summary.categories?.code)}`
                  ),
                  h(
                    'div',
                    { className: 'si-legend-item' },
                    h('span', { className: 'si-legend-dot', style: { background: '#8b5cf6' } }),
                    `构建产物: ${formatBytes(summary.categories?.build)}`
                  )
                )
              ),

              // 4. 搜索与筛选工具栏
              h(
                'div',
                { className: 'si-filter-bar' },
                h('input', {
                  className: 'si-search-input',
                  placeholder: '搜索工作区名称、路径或对话标题...',
                  value: searchQuery,
                  onChange: (e) => setSearchQuery(e.target.value)
                }),
                h(
                  'div',
                  { style: { display: 'flex', gap: '8px' } },
                  h(
                    'button',
                    {
                      className: `si-btn ${activeTab === 'all' ? 'si-btn-primary' : ''}`,
                      onClick: () => setActiveTab('all')
                    },
                    '全部工作区'
                  ),
                  h(
                    'button',
                    {
                      className: `si-btn ${activeTab === 'large' ? 'si-btn-primary' : ''}`,
                      onClick: () => setActiveTab('large')
                    },
                    '大体积 (>50MB)'
                  ),
                  h(
                    'button',
                    { className: 'si-btn', onClick: expandAll },
                    '全部展开'
                  ),
                  h(
                    'button',
                    { className: 'si-btn', onClick: collapseAll },
                    '全部折叠'
                  )
                )
              ),

              // 5. 工作区列表
              h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
                filteredWorkspaces.length === 0
                  ? h('div', { className: 'si-empty-box' }, '未找到匹配的工作区')
                  : filteredWorkspaces.map((ws) => {
                      const isExpanded = !!expandedWs[ws.id];
                      const activeCatKey =
                        selectedCategoryMap[ws.id] ||
                        (ws.categories?.dependencies?.bytes > 0 ? 'dependencies' : 'code');
                      const activeMeta =
                        CATEGORIES_META.find((m) => m.key === activeCatKey) || CATEGORIES_META[0];
                      const activeCategoryStat = ws.categories?.[activeCatKey] || { bytes: 0, files: 0 };
                      const rawCatDetail = ws.categoryDetails?.[activeCatKey] || {};
                      const catDetail = {
                        bytes: typeof rawCatDetail.bytes === 'number' ? rawCatDetail.bytes : (activeCategoryStat.bytes || 0),
                        files: typeof rawCatDetail.files === 'number' ? rawCatDetail.files : (activeCategoryStat.files || 0),
                        topDirs: rawCatDetail.topDirs || [],
                        topFiles: rawCatDetail.topFiles || []
                      };

                      const wsProjectBytes = ws.projectDiskBytes ?? ws.projectFilesBytes ?? 0;
                      const wsSessionsBytes = ws.sessionsTotalBytes ?? ws.sessionsBytes ?? 0;
                      const wsTotalFiles = ws.projectDiskFiles ?? ws.totalFiles ?? 0;

                      return h(
                        'div',
                        { key: ws.id, className: 'si-ws-card' },
                        // 工作区卡片头部
                        h(
                          'div',
                          {
                            className: 'si-ws-header',
                            onClick: () => toggleExpand(ws.id)
                          },
                          h(
                            'div',
                            { className: 'si-ws-title-wrap' },
                            h('div', null, '📁'),
                            h(
                              'div',
                              null,
                              h('div', { className: 'si-ws-title' }, ws.title),
                              h('div', { className: 'si-ws-path' }, ws.path)
                            )
                          ),
                          h(
                            'div',
                            { className: 'si-ws-meta' },
                            h(
                              'div',
                              { style: { textAlign: 'right' } },
                              h(
                                'div',
                                { className: 'si-ws-size-pill' },
                                formatBytes(ws.totalStorageBytes)
                              ),
                              h(
                                'div',
                                {
                                  style: {
                                    fontSize: '0.72rem',
                                    color: 'var(--dsw-alias-label-tertiary, #64748b)'
                                  }
                                },
                                `项目: ${formatBytes(wsProjectBytes)} | 对话: ${formatBytes(
                                  wsSessionsBytes
                                )}`
                              )
                            ),
                            h(
                              'span',
                              { className: 'si-badge si-badge-blue' },
                              `${ws.sessions?.length || 0} 个对话`
                            ),
                            h('span', { style: { fontSize: '0.8rem' } }, isExpanded ? '▲' : '▼')
                          )
                        ),

                        // 工作区展开明细
                        isExpanded &&
                          h(
                            'div',
                            { className: 'si-ws-body' },

                            // 5.1 物理分类卡片网格
                            h(
                              'div',
                              null,
                              h(
                                'div',
                                {
                                  style: {
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    marginBottom: '8px',
                                    color: 'var(--dsw-alias-label-primary, #0f1115)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }
                                },
                                h('span', null, '📁 项目物理文件分类占用（点击任意卡片查看下钻明细）'),
                                h(
                                  'span',
                                  {
                                    style: {
                                      fontSize: '0.74rem',
                                      color: 'var(--dsw-alias-label-tertiary, #64748b)',
                                      fontWeight: 400
                                    }
                                  },
                                  `共 ${wsTotalFiles.toLocaleString()} 个文件`
                                )
                              ),
                              h(
                                'div',
                                { className: 'si-cat-grid' },
                                CATEGORIES_META.map((meta) => {
                                  const cStat = ws.categories?.[meta.key] || { bytes: 0, files: 0 };
                                  const isSelected = activeCatKey === meta.key;

                                  return h(
                                    'div',
                                    {
                                      key: meta.key,
                                      className: `si-cat-card clickable ${isSelected ? meta.accentClass : ''}`,
                                      onClick: (e) => {
                                        e.stopPropagation();
                                        setSelectedCategoryMap((prev) => ({
                                          ...prev,
                                          [ws.id]: meta.key
                                        }));
                                      }
                                    },
                                    h(
                                      'div',
                                      { className: 'si-cat-header-row' },
                                      h('div', { className: 'si-cat-name' }, meta.shortName),
                                      isSelected
                                        ? h(
                                            'span',
                                            {
                                              className: 'si-cat-active-pill',
                                              style: { background: meta.color, color: '#ffffff' }
                                            },
                                            '已选择'
                                          )
                                        : null
                                    ),
                                    h('div', { className: 'si-cat-bytes' }, formatBytes(cStat.bytes)),
                                    h(
                                      'div',
                                      {
                                        style: {
                                          fontSize: '0.7rem',
                                          color: 'var(--dsw-alias-label-tertiary, #64748b)'
                                        }
                                      },
                                      `${cStat.files} 个文件`
                                    )
                                  );
                                })
                              ),

                              // 5.2 选中的分类详情面板
                              h(
                                'div',
                                { className: 'si-cat-detail-panel' },
                                h(
                                  'div',
                                  { className: 'si-detail-header' },
                                  h(
                                    'div',
                                    {
                                      style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        flexWrap: 'wrap'
                                      }
                                    },
                                    h(
                                      'span',
                                      {
                                        style: {
                                          fontWeight: 600,
                                          fontSize: '0.9rem',
                                          color: activeMeta.color
                                        }
                                      },
                                      activeMeta.name
                                    ),
                                    h(
                                      'span',
                                      {
                                        className: 'si-badge',
                                        style: {
                                          background: `${activeMeta.color}20`,
                                          color: activeMeta.color,
                                          fontWeight: 600
                                        }
                                      },
                                      formatBytes(catDetail.bytes)
                                    ),
                                    h(
                                      'span',
                                      {
                                        style: {
                                          fontSize: '0.74rem',
                                          color: 'var(--dsw-alias-label-tertiary, #64748b)'
                                        }
                                      },
                                      `(${catDetail.files} 个文件 · ${activeMeta.desc})`
                                    )
                                  )
                                ),

                                // 该分类下的 Top 目录
                                catDetail.topDirs && catDetail.topDirs.length > 0
                                  ? h(
                                      'div',
                                      null,
                                      h(
                                        'div',
                                        {
                                          style: {
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            color: 'var(--dsw-alias-label-secondary, #475569)',
                                            marginBottom: '4px'
                                          }
                                        },
                                        `📊 ${activeMeta.shortName} 中最大目录排行：`
                                      ),
                                      h(
                                        'div',
                                        { className: 'si-top-list' },
                                        catDetail.topDirs.map((d, idx) =>
                                          h(
                                            'span',
                                            { key: idx, className: 'si-top-item' },
                                            `${d.dir}: `,
                                            h('strong', null, formatBytes(d.bytes))
                                          )
                                        )
                                      )
                                    )
                                  : null,

                                // 该分类下的 Top 大文件列表
                                catDetail.topFiles && catDetail.topFiles.length > 0
                                  ? h(
                                      'div',
                                      null,
                                      h(
                                        'div',
                                        {
                                          style: {
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            color: 'var(--dsw-alias-label-secondary, #475569)',
                                            marginBottom: '4px'
                                          }
                                        },
                                        `📄 ${activeMeta.shortName} 中最大文件列表：`
                                      ),
                                      h(
                                        'table',
                                        { className: 'si-file-table' },
                                        h(
                                          'thead',
                                          null,
                                          h(
                                            'tr',
                                            null,
                                            h('th', { style: { width: '70%' } }, '文件相对路径'),
                                            h('th', { style: { textAlign: 'right' } }, '文件大小')
                                          )
                                        ),
                                        h(
                                          'tbody',
                                          null,
                                          catDetail.topFiles.map((f, idx) =>
                                            h(
                                              'tr',
                                              { key: idx },
                                              h(
                                                'td',
                                                { style: { fontFamily: 'monospace' } },
                                                f.path
                                              ),
                                              h(
                                                'td',
                                                {
                                                  style: {
                                                    textAlign: 'right',
                                                    fontWeight: 600
                                                  }
                                                },
                                                formatBytes(f.size)
                                              )
                                            )
                                          )
                                        )
                                      )
                                    )
                                  : h(
                                      'div',
                                      {
                                        style: {
                                          fontSize: '0.75rem',
                                          color: 'var(--dsw-alias-label-tertiary, #64748b)',
                                          padding: '8px 0'
                                        }
                                      },
                                      `该工作区当前未检测到 ${activeMeta.shortName} 文件。`
                                    )
                              )
                            ),

                            // 5.3 对话明细列表
                            h(
                              'div',
                              null,
                              h(
                                'div',
                                {
                                  style: {
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    marginBottom: '8px',
                                    color: 'var(--dsw-alias-label-primary, #0f1115)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }
                                },
                                h('span', null, `💬 该工作区下的全部对话明细 (${ws.sessions?.length || 0})`),
                                h(
                                  'span',
                                  {
                                    style: {
                                      fontSize: '0.74rem',
                                      color: 'var(--dsw-alias-label-tertiary, #64748b)',
                                      fontWeight: 400
                                    }
                                  },
                                  `对话记录合计: ${formatBytes(wsSessionsBytes)}`
                                )
                              ),
                              ws.sessions && ws.sessions.length > 0
                                ? h(
                                    'div',
                                    { style: { overflowX: 'auto' } },
                                    h(
                                      'table',
                                      { className: 'si-sessions-table' },
                                      h(
                                        'thead',
                                        null,
                                        h(
                                          'tr',
                                          null,
                                          h('th', { style: { width: '40%' } }, '对话标题 / ID'),
                                          h('th', null, '状态'),
                                          h('th', null, '对话记录 (jsonl.zstd)'),
                                          h('th', null, '投影缓存'),
                                          h('th', { style: { textAlign: 'right' } }, '单会话总占用')
                                        )
                                      ),
                                      h(
                                        'tbody',
                                        null,
                                        ws.sessions.map((s) =>
                                          h(
                                            'tr',
                                            { key: s.id },
                                            h(
                                              'td',
                                              null,
                                              h(
                                                'div',
                                                { className: 'si-session-title', title: s.title },
                                                s.title
                                              ),
                                              h('div', { className: 'si-session-id' }, s.id)
                                            ),
                                            h(
                                              'td',
                                              null,
                                              s.isArchived
                                                ? h('span', { className: 'si-badge si-badge-gray' }, '已归档')
                                                : h('span', { className: 'si-badge si-badge-green' }, '活跃')
                                            ),
                                            h('td', null, formatBytes(s.dataSize)),
                                            h('td', null, formatBytes(s.cacheSize)),
                                            h(
                                              'td',
                                              { style: { textAlign: 'right', fontWeight: 600 } },
                                              h(
                                                'span',
                                                {
                                                  className: `si-badge ${
                                                    s.totalSize > 2 * 1024 * 1024 ? 'si-badge-amber' : ''
                                                  }`
                                                },
                                                formatBytes(s.totalSize)
                                              )
                                            )
                                          )
                                        )
                                      )
                                    )
                                  )
                                : h('div', { className: 'si-empty-box' }, '该工作区暂无对话记录')
                            )
                          )
                      );
                    })
              )
            ),
        drawerProjectId ? renderProjectDrawer() : null
      );
    }

    // 导出的入口与 Slot 注册组件
    function StorageInspectorSection() {
      return h(
        'div',
        {
          className: 'si-root-scroll-wrapper',
          style: {
            width: '100%',
            height: '100%',
            maxHeight: '100%',
            minHeight: 0,
            flex: '1 1 0%',
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            boxSizing: 'border-box'
          }
        },
        h(StorageInspectorDashboard, null)
      );
    }

    function StorageSidebarIcon() {
      // 侧栏图标
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: '18',
          height: '18',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        },
        h('line', { x1: '22', y1: '12', x2: '2', y2: '12' }),
        h('path', {
          d: 'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'
        }),
        h('line', { x1: '6', y1: '16', x2: '6.01', y2: '16' }),
        h('line', { x1: '10', y1: '16', x2: '10.01', y2: '16' })
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // 1. 核心扩展点：注册在设置页的独立分段（settings.section）
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'storage-inspector',
              order: 85,
              label: '存储空间分析'
            },
            StorageInspectorSection
          )
        );

        // 2. 增强扩展点：支持在插件配置中直接展示
        ctx.slots.inject('plugins.bundle.config', () =>
          ctx.slots.register(
            {
              name: 'plugins.bundle.config',
              id: 'dsh-plugin-storage-inspector-config',
              key: 'dsh-plugin-storage-inspector'
            },
            StorageInspectorSection
          )
        );

        // 3. 增强扩展点：同时在左侧栏快捷入口注册，方便随时全屏打开
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 40,
              label: '存储分析'
            },
            StorageSidebarIcon
          )
        );

        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID
            },
            StorageInspectorSection
          )
        );
      }
    };
  }
});
