/**
 * 设置面板 - 前端模块
 * 负责设置面板的初始化、事件处理、导出/导入数据
 */

class SettingsPanel {
    constructor(config = {}) {
        this.sessionManager = config.sessionManager;
        this.onStatusUpdate = config.onStatusUpdate || (() => { });
        this.onLanguageChange = config.onLanguageChange || (() => { });
    }

    /**
     * 初始化设置面板
     */
    initialize() {
        // 获取默认设置控件
        const defaultLanguageSelect = document.getElementById("defaultLanguage");
        const defaultExplanationLanguageSelect = document.getElementById("defaultExplanationLanguage");

        if (!defaultLanguageSelect) return;

        // 从 sessionManager 获取当前默认设置
        const defaultSettings = this.sessionManager.getDefaultSettings();

        // 设置当前值
        defaultLanguageSelect.value = defaultSettings.defaultLanguage || "Chinese";
        if (defaultExplanationLanguageSelect) {
            defaultExplanationLanguageSelect.value = defaultSettings.defaultExplanationLanguage || "Chinese";
        }

        // 移除旧的事件监听器（防止重复）
        defaultLanguageSelect.onchange = null;
        if (defaultExplanationLanguageSelect) {
            defaultExplanationLanguageSelect.onchange = null;
        }

        // 添加翻译语言选择器的变化事件
        defaultLanguageSelect.addEventListener("change", (e) => {
            this.sessionManager.updateDefaultSettings({
                defaultLanguage: e.target.value
            });
            this.onStatusUpdate(`Default translation language set to ${e.target.value}`);
        });

        // 添加解释语言选择器的变化事件
        if (defaultExplanationLanguageSelect) {
            defaultExplanationLanguageSelect.addEventListener("change", (e) => {
                this.sessionManager.updateDefaultSettings({
                    defaultExplanationLanguage: e.target.value
                });
                this.onStatusUpdate(`Default explanation language set to ${e.target.value}`);
            });
        }

        // 初始化演示会话 Toggle
        const loadDemoSessionToggle = document.getElementById("loadDemoSessionToggle");
        if (loadDemoSessionToggle) {
            // 设置当前值
            loadDemoSessionToggle.checked = defaultSettings.loadDemoSession !== false;

            // 添加变化事件
            loadDemoSessionToggle.addEventListener("change", (e) => {
                this.sessionManager.updateDefaultSettings({
                    loadDemoSession: e.target.checked
                });
                const status = e.target.checked
                    ? "Demo session will be shown on next startup"
                    : "Demo session disabled";
                this.onStatusUpdate(status);
            });
        }

        // 初始化 Session Management 按钮
        this.initializeSessionManagementButtons();
    }

    /**
     * 初始化 Session Management 按钮
     */
    initializeSessionManagementButtons() {
        const exportCurrentBtn = document.getElementById("exportCurrentBtn");
        const exportAllBtn = document.getElementById("exportAllBtn");
        const importBtn = document.getElementById("importBtn");
        const importFileInput = document.getElementById("importFileInput");
        const clearAllBtn = document.getElementById("clearAllBtn");

        if (exportCurrentBtn) {
            exportCurrentBtn.onclick = () => {
                const session = this.sessionManager.getCurrentSession();
                if (!session) {
                    alert("No session to export");
                    return;
                }

                const dataStr = JSON.stringify(session, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

                const exportFileDefaultName = `${session.name}_${Date.now()}.json`;

                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', exportFileDefaultName);
                linkElement.click();
            };
        }

        if (exportAllBtn) {
            exportAllBtn.onclick = () => {
                const dataStr = JSON.stringify(this.sessionManager.sessions, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

                const exportFileDefaultName = `all_sessions_${Date.now()}.json`;

                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', exportFileDefaultName);
                linkElement.click();
            };
        }

        if (importBtn && importFileInput) {
            importBtn.onclick = () => {
                importFileInput.click();
            };

            importFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const imported = JSON.parse(event.target.result);

                        if (imported.id && imported.transcripts) {
                            // 单个 session
                            const id = imported.id;
                            this.sessionManager.sessions[id] = imported;
                            this.sessionManager.saveSessions();
                            this.sessionManager.switchSession(id);
                            this.onStatusUpdate("✅ Session imported successfully");
                        } else if (typeof imported === 'object') {
                            // 多个 sessions
                            Object.assign(this.sessionManager.sessions, imported);
                            this.sessionManager.saveSessions();
                            const firstId = Object.keys(imported)[0];
                            if (firstId) {
                                this.sessionManager.switchSession(firstId);
                            }
                            this.onStatusUpdate("✅ Sessions imported successfully");
                        }
                    } catch (error) {
                        console.error("Import error:", error);
                        alert("Failed to import sessions");
                    }
                };
                reader.readAsText(file);
            });
        }

        if (clearAllBtn) {
            clearAllBtn.onclick = () => {
                if (confirm("⚠️ Are you sure you want to delete all data? This cannot be undone.")) {
                    localStorage.clear();
                    alert("All data cleared. Please refresh the page.");
                }
            };
        }
    }
}
