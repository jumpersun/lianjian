import { useEffect, useState } from "react";
import { testCustomModel } from "../lib/aiClient.js";
import { isCustomModelReady } from "../lib/modelConfig.js";
import { useModalDialog } from "../lib/useModalDialog.js";
import { parseBackup } from "../lib/backup.js";

export function ModelSettings({ isOpen, config, onClose, onSave, productState, onExport, onRestore, onExportPrevious }) {
  const dialogRef = useModalDialog(isOpen, onClose);
  const [draft, setDraft] = useState(config);
  const [connectionState, setConnectionState] = useState({ type: "idle", message: "" });
  const [importPreview, setImportPreview] = useState(null);
  const [backupNotice, setBackupNotice] = useState("");

  useEffect(() => {
    if (isOpen) {
      setDraft(config);
      setConnectionState({ type: "idle", message: "" });
      setImportPreview(null);
      setBackupNotice("");
    }
  }, [config, isOpen]);

  if (!isOpen) return null;

  function update(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setConnectionState({ type: "idle", message: "" });
  }

  function validateDraft() {
    if (draft.mode !== "custom") return;
    const url = new URL(draft.baseUrl);
    if (!(["https:", "http:"].includes(url.protocol))) throw new Error("模型地址必须使用 HTTP 或 HTTPS");
    if (!isCustomModelReady(draft)) throw new Error("请填写完整的模型地址、名称和 API Key");
  }

  async function checkConnection() {
    setConnectionState({ type: "loading", message: "正在测试连接…" });
    try {
      validateDraft();
      await testCustomModel(draft);
      setConnectionState({ type: "success", message: "连接成功，可以使用这个模型生成计划。" });
    } catch (error) {
      const message = error?.name === "AbortError" ? "连接超时，请检查地址或网络。" : error?.message || "连接失败";
      setConnectionState({ type: "error", message });
    }
  }

  function save() {
    try {
      validateDraft();
      onSave(draft);
      onClose();
    } catch (error) {
      setConnectionState({ type: "error", message: error.message });
    }
  }

  async function readBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setImportPreview(null);
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("请选择 10 MB 以内的备份文件");
      setImportPreview(parseBackup(await file.text()));
      setBackupNotice("");
    } catch (error) { setBackupNotice(error.message); }
  }

  return (
    <div className="dialog-backdrop settings-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="dialog-topbar">
          <span>设置</span>
          <button type="button" onClick={onClose} data-dialog-initial-focus>关闭</button>
        </div>
        <div className="settings-content">
          <div className="settings-heading">
            <span className="section-kicker">AI 与数据</span>
            <h2 id="settings-title">模型设置</h2>
            <p>默认方案无需配置。高级用户可以连接兼容 OpenAI Chat Completions 的模型。</p>
          </div>

          <div className="model-mode" role="group" aria-label="模型模式">
            <button
              type="button"
              className={draft.mode === "system" ? "is-active" : ""}
              aria-pressed={draft.mode === "system"}
              onClick={() => update("mode", "system")}
            >
              <strong>系统方案</strong>
              <span>无需密钥；未配置平台 AI 时使用本地规则编排</span>
            </button>
            <button
              type="button"
              className={draft.mode === "custom" ? "is-active" : ""}
              aria-pressed={draft.mode === "custom"}
              onClick={() => update("mode", "custom")}
            >
              <strong>自定义模型</strong>
              <span>使用自己的地址、模型名称和 API Key</span>
            </button>
          </div>

          {draft.mode === "custom" && (
            <div className="custom-model-fields">
              <label>
                <span>API 地址</span>
                <input value={draft.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} placeholder="https://api.example.com/v1" />
              </label>
              <label>
                <span>模型名称</span>
                <input value={draft.model} onChange={(event) => update("model", event.target.value)} placeholder="输入服务商提供的模型 ID" />
              </label>
              <label>
                <span>API Key</span>
                <input type="password" value={draft.apiKey} onChange={(event) => update("apiKey", event.target.value)} autoComplete="off" placeholder="仅保存在当前浏览器会话" />
              </label>
              <div className="model-security-note">
                <strong>密钥不会写入长期本地存储</strong>
                <p>关闭浏览器会话后需要重新输入。训练资料、疼痛说明与调整消息会发送给你填写的服务商，请只连接信任的 HTTPS 地址。该服务需允许浏览器跨域请求，可能产生服务商费用。</p>
              </div>
              <button className="secondary-button" type="button" onClick={checkConnection} disabled={connectionState.type === "loading"}>
                {connectionState.type === "loading" ? "正在连接…" : "测试连接"}
              </button>
            </div>
          )}

          {connectionState.message && (
            <p className={`settings-status ${connectionState.type}`} role="status">{connectionState.message}</p>
          )}

          <div className="account-panel">
            <div>
              <span className="account-badge">游客模式</span>
              <h3>本机数据与备份</h3>
              <p>计划、对话与训练历史仅保存在此浏览器，不会自动同步到其他设备。清理浏览器数据可能丢失记录，请定期备份。文件含个人训练资料，请妥善保管；不包含模型密钥。</p>
            </div>
            <span className="account-state">本地优先</span>
          </div>
          <section className="backup-panel" aria-label="数据备份与恢复">
            <p>{productState?.plan ? "1 份计划" : "尚无计划"} · {productState?.workoutHistory.length || 0} 次训练记录</p>
            <div className="mvp-button-row">
              <button type="button" className="secondary-button" onClick={onExport}>导出数据备份</button>
              <label className="backup-file-button">选择备份文件<input type="file" accept="application/json,.json" onChange={readBackup} disabled={Boolean(productState?.activeWorkout)} /></label>
              <button type="button" className="secondary-button" onClick={() => { try { onExportPrevious(); } catch (error) { setBackupNotice(error.message); } }}>下载恢复前备份</button>
            </div>
            {productState?.activeWorkout && <p>当前训练进行中，可导出；请先保存训练再导入其他备份。</p>}
            {importPreview && <div className="import-preview">
              <strong>准备恢复：{importPreview.plan?.title || "无计划"}</strong>
              <p>{importPreview.workoutHistory.length} 次记录 · {importPreview.messages.length} 条对话{importPreview.activeWorkout ? " · 包含未完成训练" : ""}</p>
              <p>确认后覆盖本机资料、计划和记录，不合并。恢复前会自动备份当前数据；模型设置保持不变。</p>
              <div className="mvp-button-row"><button type="button" className="primary-button" onClick={() => { try { onRestore(importPreview); } catch (error) { setBackupNotice(error.message); } }}>确认恢复备份</button><button type="button" className="secondary-button" onClick={() => setImportPreview(null)}>取消恢复</button></div>
            </div>}
            {backupNotice && <p role="alert">{backupNotice}</p>}
          </section>

          <div className="settings-actions">
            <button type="button" onClick={onClose}>取消</button>
            <button className="primary-button" type="button" onClick={save}>保存设置</button>
          </div>
        </div>
      </section>
    </div>
  );
}
