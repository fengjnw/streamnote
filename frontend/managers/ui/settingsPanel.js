

class SettingsPanel {
    constructor(config = {}) {
        this.sessionManager = config.sessionManager;
        this.onStatusUpdate = config.onStatusUpdate || (() => { });
        this.onLanguageChange = config.onLanguageChange || (() => { });
    }

    initialize() {
        const defaultLanguageSelect = document.getElementById("defaultLanguage");
        const defaultExplanationLanguageSelect = document.getElementById("defaultExplanationLanguage");

        if (!defaultLanguageSelect) return;

        const defaultSettings = this.sessionManager.getDefaultSettings();

        defaultLanguageSelect.value = defaultSettings.defaultLanguage || "Chinese";
        if (defaultExplanationLanguageSelect) {
            defaultExplanationLanguageSelect.value = defaultSettings.defaultExplanationLanguage || "Chinese";
        }

        defaultLanguageSelect.onchange = null;
        if (defaultExplanationLanguageSelect) {
            defaultExplanationLanguageSelect.onchange = null;
        }

        defaultLanguageSelect.addEventListener("change", (e) => {
            this.sessionManager.updateDefaultSettings({
                defaultLanguage: e.target.value
            });
            this.onStatusUpdate(`Default translation language set to ${e.target.value}`);
        });

        if (defaultExplanationLanguageSelect) {
            defaultExplanationLanguageSelect.addEventListener("change", (e) => {
                this.sessionManager.updateDefaultSettings({
                    defaultExplanationLanguage: e.target.value
                });
                this.onStatusUpdate(`Default explanation language set to ${e.target.value}`);
            });
        }

        this.initializeSessionManagementButtons();
    }

    initializeSessionManagementButtons() {
        const exportCurrentBtn = document.getElementById("exportCurrentBtn");
        const exportAllBtn = document.getElementById("exportAllBtn");
        const importBtn = document.getElementById("importBtn");
        const importFileInput = document.getElementById("importFileInput");

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
                            const id = imported.id;
                            this.sessionManager.sessions[id] = imported;
                            this.sessionManager.saveSessions();
                            this.sessionManager.switchSession(id);
                            this.onStatusUpdate("✅ Session imported successfully");
                        } else if (typeof imported === 'object') {
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

    }
}

window.SettingsPanel = SettingsPanel;
