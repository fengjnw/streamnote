
class SessionManager {
    constructor(options = {}) {
        this.sessions = {};
        this.currentSessionId = null;
        this.STORAGE_KEY = 'streamnote_sessions';
        this.CURRENT_SESSION_KEY = 'streamnote_current_session';
        this.DEFAULT_SETTINGS_KEY = 'streamnote_default_settings';
        this.DEVICE_ID_KEY = 'streamnote_device_id';

        this.RESERVED_SESSION_IDS = ['welcome-session'];

        this.apiClient = options.apiClient || null;
        this.remoteSyncTimer = null;
        this.isHydratingFromRemote = false;
        this.remoteSyncInFlight = false;
        this.deviceId = this.getOrCreateDeviceId();
        this.syncStatus = this.apiClient ? 'idle' : 'offline';
        this.lastSyncedAt = null;
        this.lastSyncError = null;

        this.defaultSettings = {
            defaultLanguage: "Chinese",
            defaultExplanationLanguage: "Chinese"
        };

        this.loadDefaultSettings();
        this.loadSessions();
        this.setupUI();
        this.emitIdentityUpdate();
        this.emitSyncStatusChanged();
        this.loadRemoteStateIfAvailable();
    }

    loadDefaultSettings() {
        try {
            const saved = localStorage.getItem(this.DEFAULT_SETTINGS_KEY);
            if (saved) {
                this.defaultSettings = JSON.parse(saved);

                // Drop removed welcome/tutorial toggle keys from older saved settings.
                if (
                    this.defaultSettings.loadWelcomeSession !== undefined
                    || this.defaultSettings.loadTutorialSession !== undefined
                ) {
                    delete this.defaultSettings.loadWelcomeSession;
                    delete this.defaultSettings.loadTutorialSession;
                    this.saveDefaultSettings();
                }
            }
        } catch (error) {
            console.error('[SessionManager] Load default settings error:', error);
        }
    }

    saveDefaultSettings() {
        try {
            localStorage.setItem(this.DEFAULT_SETTINGS_KEY, JSON.stringify(this.defaultSettings));
        } catch (error) {
            console.error('[SessionManager] Save default settings error:', error);
        }
    }

    getDefaultSettings() {
        return { ...this.defaultSettings };
    }

    updateDefaultSettings(settings) {
        this.defaultSettings = { ...this.defaultSettings, ...settings };
        this.saveDefaultSettings();
    }

    loadSessions() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                this.sessions = JSON.parse(saved);
                this.normalizeLoadedSessions(this.sessions);
                this.migrateLegacyWelcomeSessionId();
            }

            const hasSessions = Object.keys(this.sessions).length > 0;

            if (!hasSessions) {
                const loaded = this.loadWelcomeSessionIntoState(false);
                if (!loaded) {
                    this.createNewSession();
                }
            } else {
                const currentId = localStorage.getItem(this.CURRENT_SESSION_KEY);
                if (currentId && this.sessions[currentId]) {
                    this.currentSessionId = currentId;
                } else {
                    this.createNewSession();
                }
            }
        } catch (error) {
            console.error('[SessionManager] Load error:', error);
            const loaded = this.loadWelcomeSessionIntoState(false);
            if (loaded) {
                // welcome session loaded
            } else {
                this.createNewSession();
            }
        }
    }

    migrateLegacyWelcomeSessionId() {
        const legacyId = 'tutorial-session';
        const welcomeId = 'welcome-session';
        const legacySession = this.sessions[legacyId];
        const welcomeSession = this.sessions[welcomeId];
        let changed = false;

        if (legacySession && !welcomeSession) {
            this.sessions[welcomeId] = {
                ...legacySession,
                id: welcomeId,
                name: legacySession.name === 'Tutorial' ? 'Welcome' : legacySession.name,
            };
            delete this.sessions[legacyId];
            changed = true;
        } else if (legacySession && welcomeSession) {
            delete this.sessions[legacyId];
            changed = true;
        }

        if (this.currentSessionId === legacyId) {
            this.currentSessionId = welcomeId;
            changed = true;
        }

        return changed;
    }

    generateDeviceId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }

    getOrCreateDeviceId() {
        try {
            const existing = localStorage.getItem(this.DEVICE_ID_KEY);
            if (existing && existing.trim()) {
                return existing;
            }
            const created = this.generateDeviceId();
            localStorage.setItem(this.DEVICE_ID_KEY, created);
            return created;
        } catch (error) {
            console.error('[SessionManager] Device ID error:', error);
            return this.generateDeviceId();
        }
    }

    getDeviceIdentityInfo() {
        const fullId = this.deviceId || '';
        const compact = fullId.replace(/-/g, '').toUpperCase();
        const shortId = compact ? compact.slice(-6) : '------';
        return {
            deviceId: fullId,
            shortId,
            label: `Device #${shortId}`,
        };
    }

    setSyncStatus(status, errorMessage = null) {
        this.syncStatus = status;
        if (errorMessage) {
            this.lastSyncError = errorMessage;
        }
        this.emitSyncStatusChanged();
    }

    emitIdentityUpdate() {
        window.dispatchEvent(new CustomEvent('deviceIdentityChanged', {
            detail: this.getDeviceIdentityInfo(),
        }));
    }

    emitSyncStatusChanged() {
        window.dispatchEvent(new CustomEvent('sessionSyncStatusChanged', {
            detail: {
                status: this.syncStatus,
                lastSyncedAt: this.lastSyncedAt,
                lastSyncError: this.lastSyncError,
            }
        }));
    }

    normalizeLoadedSessions(sessionMap) {
        Object.keys(sessionMap).forEach(id => {
            const session = sessionMap[id];

            if (session.translations && !session.translations.Chinese) {
                const oldTranslations = { ...session.translations };
                session.translations = {
                    Chinese: oldTranslations,
                    English: {},
                    Spanish: {},
                    French: {},
                    Japanese: {},
                    Korean: {}
                };
            }

            if (!session.explanations) session.explanations = [];
            if (!session.explanationHistory) session.explanationHistory = [];
            if (!session.keywordCache) session.keywordCache = {};
            if (!session.highlightCache) session.highlightCache = {};
            if (!session.explanationCache) session.explanationCache = {};
            if (!session.summaryCache) session.summaryCache = {};
            if (!session.highlightPositions) session.highlightPositions = {};
            if (session.lastKeywordExtractedTime === undefined) session.lastKeywordExtractedTime = null;
            if (!session.lastSummaryGeneratedTime) session.lastSummaryGeneratedTime = {};

            if (!session.startTime) {
                session.startTime = session.createdAt || session.lastModified || Date.now();
            }

            if (!session.lastAccessed) {
                session.lastAccessed = session.lastModified || Date.now();
            }

            delete session.translatedKeywords;

            if (!session.settings) {
                session.settings = {
                    translationEnabled: true,
                    translationLayout: "split-bottom",
                    language: "Chinese",
                    explanationLanguage: "Chinese"
                };
            } else {
                if (session.settings.targetLanguage && !session.settings.language) {
                    session.settings.language = session.settings.targetLanguage;
                }
                delete session.settings.targetLanguage;

                if (session.settings.layout && !session.settings.translationLayout) {
                    session.settings.translationLayout = session.settings.layout;
                }
                delete session.settings.layout;

                if (session.settings.translationEnabled === undefined) {
                    session.settings.translationEnabled = session.settings.translationLayout !== 'full-transcript';
                }

                if (!session.settings.explanationLanguage) {
                    session.settings.explanationLanguage = session.settings.language || "Chinese";
                }

                delete session.settings.keywordEnabled;
                delete session.settings.keywordExplanationLanguage;
                delete session.settings.explanationCache;
                delete session.settings.queryHistory;
                delete session.settings.summaryCache;
            }
        });
    }

    snapshotState() {
        return {
            sessions: this.sessions,
            currentSessionId: this.currentSessionId,
            defaultSettings: this.defaultSettings,
        };
    }

    scheduleRemoteSync() {
        if (!this.apiClient || !this.deviceId || this.isHydratingFromRemote) {
            return;
        }

        if (this.remoteSyncTimer) {
            clearTimeout(this.remoteSyncTimer);
        }

        this.remoteSyncTimer = setTimeout(() => {
            this.remoteSyncTimer = null;
            this.syncStateToBackend();
        }, 350);
    }

    async syncStateToBackend() {
        if (!this.apiClient || !this.deviceId || this.remoteSyncInFlight) {
            return;
        }

        this.remoteSyncInFlight = true;
        this.setSyncStatus('syncing');
        try {
            const response = await this.apiClient.saveSessionState(this.deviceId, this.snapshotState());
            if (!response.ok) {
                console.warn('[SessionManager] Remote sync failed with status:', response.status);
                this.setSyncStatus('error', `HTTP ${response.status}`);
                return;
            }
            this.lastSyncedAt = Date.now();
            this.lastSyncError = null;
            this.setSyncStatus('synced');
        } catch (error) {
            console.warn('[SessionManager] Remote sync skipped:', error);
            this.setSyncStatus('offline', error?.message || 'Network unavailable');
        } finally {
            this.remoteSyncInFlight = false;
        }
    }

    async loadRemoteStateIfAvailable() {
        if (!this.apiClient || !this.deviceId) {
            return;
        }

        try {
            this.setSyncStatus('syncing');
            const response = await this.apiClient.getSessionState(this.deviceId);
            if (!response.ok) {
                this.setSyncStatus('error', `HTTP ${response.status}`);
                return;
            }

            const payload = await response.json();
            const remoteState = payload?.state;
            this.lastSyncedAt = Date.now();
            this.lastSyncError = null;
            this.setSyncStatus('synced');
            if (!remoteState || typeof remoteState !== 'object') {
                return;
            }

            this.isHydratingFromRemote = true;
            if (remoteState.defaultSettings && typeof remoteState.defaultSettings === 'object') {
                this.defaultSettings = { ...this.defaultSettings, ...remoteState.defaultSettings };

                delete this.defaultSettings.loadWelcomeSession;
                delete this.defaultSettings.loadTutorialSession;

                this.saveDefaultSettings();
            }

            if (remoteState.sessions && typeof remoteState.sessions === 'object') {
                this.sessions = remoteState.sessions;
                this.normalizeLoadedSessions(this.sessions);
                this.migrateLegacyWelcomeSessionId();
            }

            const remoteCurrentSessionId = remoteState.currentSessionId === 'tutorial-session'
                ? 'welcome-session'
                : remoteState.currentSessionId;

            if (
                remoteCurrentSessionId
                && typeof remoteCurrentSessionId === 'string'
                && this.sessions[remoteCurrentSessionId]
            ) {
                this.currentSessionId = remoteCurrentSessionId;
            } else if (!this.currentSessionId || !this.sessions[this.currentSessionId]) {
                const firstId = Object.keys(this.sessions)[0];
                this.currentSessionId = firstId || null;
            }

            if (!this.currentSessionId) {
                this.createNewSession();
            } else {
                this.saveSessions();
                this.renderSessionList();

                const sessionNameDisplay = document.getElementById('sessionNameDisplay');
                if (sessionNameDisplay && this.sessions[this.currentSessionId]) {
                    sessionNameDisplay.textContent = this.sessions[this.currentSessionId].name;
                }

                window.dispatchEvent(new CustomEvent('sessionChanged', {
                    detail: { sessionId: this.currentSessionId }
                }));
            }
        } catch (error) {
            console.warn('[SessionManager] Remote load skipped:', error);
            this.setSyncStatus('offline', error?.message || 'Network unavailable');
        } finally {
            this.isHydratingFromRemote = false;
        }
    }

    loadWelcomeSessionIntoState(useSwitch = false) {
        if (typeof createWelcomeSession !== 'function' || !WELCOME_SESSION_DATA) {
            return false;
        }

        createWelcomeSession();

        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            this.sessions = JSON.parse(saved);
        }

        if (!this.sessions[WELCOME_SESSION_DATA.id]) {
            return false;
        }

        if (useSwitch) {
            this.switchSession(WELCOME_SESSION_DATA.id);
        } else {
            this.currentSessionId = WELCOME_SESSION_DATA.id;
        }

        return true;
    }

    formatSessionDefaultName(date = new Date()) {
        if (window.DateTimeUtils && typeof window.DateTimeUtils.formatDateTime === 'function') {
            return window.DateTimeUtils.formatDateTime(date);
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    saveSessions() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.sessions));
            localStorage.setItem(this.CURRENT_SESSION_KEY, this.currentSessionId);
            this.scheduleRemoteSync();
        } catch (error) {
            console.error('[SessionManager] Save error:', error);
        }
    }

    createNewSession(name = null) {
        const id = Date.now().toString();

        // Generate default name using ISO 8601 format (YYYY-MM-DD HH:MM:SS)
        let defaultName = name;
        if (!defaultName) {
            defaultName = this.formatSessionDefaultName(new Date());
        }

        const defaultSettings = this.getDefaultSettings();

        this.sessions[id] = {
            id: id,
            name: defaultName,

            transcripts: {},

            contentMetadata: {
                source: 'transcript',
                sourceFile: null,
                uploadTime: null,
                paragraphCount: 0
            },

            translations: {
                Chinese: {},
                English: {},
                Spanish: {},
                French: {},
                Japanese: {},
                Korean: {}
            },

            keywords: [],
            highlights: [],
            explanations: [],
            explanationHistory: [],

            highlightPositions: {}, // { "highlightText": { sourceIndices: [...], startIndex: ..., endIndex: ... } }

            keywordCache: {},      // { "keyword|language": "explanation", ... }
            highlightCache: {},    // { "keyword|language": "explanation", ... }
            explanationCache: {},  // { "keyword|language": "explanation", ... }

            summaryCache: {},      // { language: "summary", ... }

            settings: {
                language: defaultSettings.defaultLanguage,
                explanationLanguage: defaultSettings.defaultExplanationLanguage
            },

            createdAt: Date.now(),
            startTime: Date.now(),
            lastModified: Date.now(),
            lastAccessed: Date.now(),
            lastTextModified: null,
            lastKeywordExtractedTime: null,
            lastSummaryGeneratedTime: {}
        };

        this.saveSessions();
        this.switchSession(id);
        return id;
    }

    getCurrentSession() {
        return this.sessions[this.currentSessionId];
    }

    getSession(sessionId) {
        return this.sessions[sessionId] || null;
    }

    withCurrentSession(mutator) {
        const session = this.getCurrentSession();
        if (!session) return null;

        mutator(session);
        session.lastModified = Date.now();
        this.saveSessions();
        return session;
    }

    withSessionById(sessionId, mutator) {
        const session = this.sessions[sessionId];
        if (!session) {
            return false;
        }

        mutator(session);
        session.lastModified = Date.now();
        this.saveSessions();
        return true;
    }

    /**
     * @param {string} sessionId - session ID
     */
    updateLastTextModified(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || !session.transcripts) return;

        const indices = Object.keys(session.transcripts)
            .map(Number)
            .filter(k => !isNaN(k))
            .sort((a, b) => b - a);

        if (indices.length > 0) {
            const lastItem = session.transcripts[indices[0]];
            session.lastTextModified = lastItem?.timestamp || 0;
        } else {
            session.lastTextModified = null;
        }

        this.saveSessions();
    }

    updateLastKeywordExtractedTime(sessionId, textTimestamp) {
        const session = this.getSession(sessionId);
        if (!session) return;

        session.lastKeywordExtractedTime = textTimestamp ?? null;
        session.lastModified = Date.now();
        this.saveSessions();
    }

    updateLastSummaryGeneratedTime(sessionId, cacheKey, textTimestamp) {
        const session = this.getSession(sessionId);
        if (!session || !cacheKey) return;

        if (!session.lastSummaryGeneratedTime) {
            session.lastSummaryGeneratedTime = {};
        }

        session.lastSummaryGeneratedTime[cacheKey] = textTimestamp ?? null;
        session.lastModified = Date.now();
        this.saveSessions();
    }

    switchSession(sessionId) {
        if (!this.sessions[sessionId]) {
            console.error('[SessionManager] Session not found:', sessionId);
            return false;
        }

        this.currentSessionId = sessionId;
        this.saveSessions();
        this.renderSessionList();

        const sessionNameDisplay = document.getElementById('sessionNameDisplay');
        if (sessionNameDisplay) {
            sessionNameDisplay.textContent = this.sessions[sessionId].name;
        }

        window.dispatchEvent(new CustomEvent('sessionChanged', {
            detail: { sessionId: sessionId }
        }));

        return true;
    }

    updateCurrentTranscripts(transcripts) {
        const session = this.getCurrentSession();
        if (session) {
            session.transcripts = { ...transcripts };
            session.lastModified = Date.now();
            this.saveSessions();
        }
    }

    updateTranscriptsForSession(sessionId, transcripts) {
        return this.withSessionById(sessionId, (session) => {
            session.transcripts = { ...session.transcripts, ...transcripts };
        });
    }

    updateKeywordsForSession(sessionId, keywords) {
        return this.withSessionById(sessionId, (session) => {
            session.keywords = [...keywords];
        });
    }

    updateCurrentKeywords(keywords) {
        this.withCurrentSession((session) => {
            session.keywords = [...keywords];
        });
    }

    updateCurrentHighlights(highlights) {
        this.withCurrentSession((session) => {
            session.highlights = [...highlights];
        });
    }

    updateHighlightPositions(positions) {
        this.withCurrentSession((session) => {
            if (!session.highlightPositions) {
                session.highlightPositions = {};
            }
            session.highlightPositions = { ...positions };
        });
    }

    updateCurrentTranslations(translations, language) {
        this.withCurrentSession((session) => {
            if (!session.translations) {
                session.translations = {};
            }
            if (!session.translations[language]) {
                session.translations[language] = {};
            }
            session.translations[language] = { ...session.translations[language], ...translations };
        });
    }

    updateCurrentExplanations(explanations) {
        this.withCurrentSession((session) => {
            session.explanations = [...explanations];
        });
    }

    updateCurrentExplanationHistory(explanationHistory) {
        this.withCurrentSession((session) => {
            session.explanationHistory = [...explanationHistory];
        });
    }

    updateCurrentKeywordCache(cache) {
        this.withCurrentSession((session) => {
            session.keywordCache = { ...session.keywordCache, ...cache };
        });
    }

    updateCurrentHighlightCache(cache) {
        this.withCurrentSession((session) => {
            session.highlightCache = { ...session.highlightCache, ...cache };
        });
    }

    updateCurrentExplanationCache(cache) {
        this.withCurrentSession((session) => {
            session.explanationCache = { ...session.explanationCache, ...cache };
        });
    }

    updateCurrentSummaryCache(cache) {
        this.withCurrentSession((session) => {
            session.summaryCache = { ...session.summaryCache, ...cache };
        });
    }

    updateCurrentSettings(settings) {
        this.withCurrentSession((session) => {
            session.settings = { ...session.settings, ...settings };
        });
    }

    renameCurrentSession(newName) {
        const trimmedName = newName.trim();
        if (!trimmedName) {
            return false;
        }

        const session = this.withCurrentSession((current) => {
            current.name = trimmedName;
        });

        if (!session) {
            return false;
        }

        this.renderSessionList();

        const sessionNameDisplay = document.getElementById('sessionNameDisplay');
        if (sessionNameDisplay) {
            sessionNameDisplay.textContent = session.name;
        }

        return true;
    }

    exportCurrentSession() {
        const session = this.getCurrentSession();
        if (!session) return;

        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            session: session
        };

        this.downloadJSON(data, `StreamNote_${session.name}_${this.formatDate()}.json`);
    }

    exportAllSessions() {
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            sessions: this.sessions
        };

        this.downloadJSON(data, `StreamNote_All_Sessions_${this.formatDate()}.json`);
    }

    importSessions(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (data.session) {
                    // Import single session
                    const newId = Date.now().toString();
                    const imported = { ...data.session, id: newId };
                    this.sessions[newId] = imported;
                    this.switchSession(newId);
                    alert(`Successfully imported session: ${imported.name}`);
                } else if (data.sessions) {
                    // Import multiple sessions
                    const confirmMsg = `Import ${Object.keys(data.sessions).length} sessions?\nThis will merge with existing data.`;
                    if (confirm(confirmMsg)) {
                        Object.values(data.sessions).forEach(session => {
                            const newId = Date.now().toString() + Math.random();
                            this.sessions[newId] = { ...session, id: newId };
                        });
                        this.saveSessions();
                        this.renderSessionList();
                        alert('Import successful!');
                    }
                }
            } catch (error) {
                console.error('[SessionManager] Import error:', error);
                alert('Import failed: Invalid file format');
            }
        };
        reader.readAsText(file);
    }

    clearAllSessions() {
        const confirmMsg = '⚠️ Clear all session data?\nThis action cannot be undone!';
        if (confirm(confirmMsg)) {
            const doubleConfirm = 'Final confirmation: Really delete all data?';
            if (confirm(doubleConfirm)) {
                this.sessions = {};
                localStorage.removeItem(this.STORAGE_KEY);
                localStorage.removeItem(this.CURRENT_SESSION_KEY);
                this.createNewSession('Default Session');
                alert('All data cleared');
            }
        }
    }

    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    formatDate() {
        const now = new Date();
        return now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
    }

    deleteSession(sessionId) {
        if (!this.sessions[sessionId]) return;
        delete this.sessions[sessionId];

        if (this.currentSessionId === sessionId) {
            const sessionIds = Object.keys(this.sessions);
            if (sessionIds.length > 0) {
                this.switchSession(sessionIds[sessionIds.length - 1]);
            } else {
                this.createNewSession("Default Session");
            }
        }
    }

    setupUI() {
        const newSessionBtn = document.getElementById('newSessionBtn');
        if (newSessionBtn) {
            newSessionBtn.addEventListener('click', () => {
                this.createNewSession();
            });
        }

        const sidebarNewSessionBtn = document.getElementById('sidebarNewSessionBtn');
        if (sidebarNewSessionBtn) {
            sidebarNewSessionBtn.addEventListener('click', () => {
                this.createNewSession();
            });
        }

        const openBtn = document.getElementById('openSessionPanel');
        if (openBtn) {
            openBtn.addEventListener('click', () => {
                if (window.streamNoteInstance) {
                    window.streamNoteInstance.toggleModal('sessionModal');
                }
            });
        }

        const toggleBtn = document.getElementById('closeSessionModal');
        if (toggleBtn) {
        }

        const editBtn = document.getElementById('editSessionNameBtn');
        const confirmBtn = document.getElementById('confirmSessionNameBtn');
        const cancelBtn = document.getElementById('cancelSessionNameBtn');
        const nameInput = document.getElementById('sessionNameInput');
        const displayMode = document.getElementById('sessionNameDisplay');
        const editMode = document.getElementById('sessionNameEdit');

        editBtn?.addEventListener('click', () => {
            const session = this.getCurrentSession();
            if (session) {
                nameInput.value = session.name;
                displayMode.style.display = 'none';
                editMode.style.display = 'flex';
                nameInput.focus();
                nameInput.select();
            }
        });

        confirmBtn?.addEventListener('click', () => {
            const newName = nameInput.value.trim();
            if (newName) {
                this.renameCurrentSession(newName);
            }
            displayMode.style.display = 'flex';
            editMode.style.display = 'none';
        });

        cancelBtn?.addEventListener('click', () => {
            displayMode.style.display = 'flex';
            editMode.style.display = 'none';
        });

        nameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            } else if (e.key === 'Escape') {
                cancelBtn.click();
            }
        });

        const importInput = document.getElementById('importFileInput');

        importInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.importSessions(file);
                e.target.value = '';
            }
        });

        document.getElementById('renameSessionBtn')?.addEventListener('click', () => {
            this.enterRenameMode();
        });

        document.getElementById('deleteSessionBtn')?.addEventListener('click', () => {
            this.deleteCurrentSession();
        });

        this.renderSessionList();
    }

    formatRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;

        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    formatFullDate(timestamp) {
        if (window.DateTimeUtils && typeof window.DateTimeUtils.formatDateFromEpochMs === 'function') {
            return window.DateTimeUtils.formatDateFromEpochMs(timestamp);
        }
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    renderSessionList() {
        const listContainer = document.getElementById('sessionList');
        if (!listContainer) return;

        // Keep newest sessions on top for predictable recency-first browsing.
        const sessionIds = Object.keys(this.sessions).sort((a, b) => {
            return this.sessions[b].createdAt - this.sessions[a].createdAt;
        });

        if (sessionIds.length === 0) {
            listContainer.innerHTML = '<p class="empty-message">No sessions</p>';
            return;
        }

        listContainer.innerHTML = sessionIds.map(id => {
            const session = this.sessions[id];
            const isActive = id === this.currentSessionId;

            const itemCount = Object.keys(session.transcripts || {}).length || 0;
            const createdDate = this.formatFullDate(session.createdAt);
            const lastModified = this.formatRelativeTime(session.lastModified || session.createdAt);

            return `
                <div class="session-item ${isActive ? 'active' : ''}" data-session-id="${id}">
                    <div class="session-main">
                        <div class="session-name">${session.name}</div>
                        <div class="session-brief">
                            <span class="brief-item">${createdDate}</span>
                            <span class="brief-item">${itemCount} items</span>
                        </div>
                    </div>
                    <div class="session-time">${lastModified}</div>
                </div>
            `;
        }).join('');

        listContainer.querySelectorAll('.session-item').forEach(item => {
            item.addEventListener('click', () => {
                const sessionId = item.dataset.sessionId;
                this.switchSession(sessionId);
            });
        });
    }

    enterRenameMode() {
        const currentSessionId = this.currentSessionId;
        if (!currentSessionId) {
            alert('No session selected');
            return;
        }

        const session = this.sessions[currentSessionId];
        const sessionItem = document.querySelector(`[data-session-id="${currentSessionId}"]`);
        if (!sessionItem) return;

        const sessionNameDiv = sessionItem.querySelector('.session-name');
        const currentName = session.name;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'session-name-input-inline';
        input.value = currentName;
        input.style.flex = '1';
        input.style.padding = '4px 8px';
        input.style.border = '1px solid var(--color-primary)';
        input.style.borderRadius = '4px';
        input.style.fontSize = '1em';
        input.style.fontWeight = '600';

        sessionNameDiv.replaceWith(input);

        const saveRename = () => {
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
                this.renameCurrentSession(newName);
            }
            this.renderSessionList();
        };

        const cancelEdit = () => {
            this.renderSessionList();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveRename();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });

        input.addEventListener('blur', () => {
            saveRename();
        });

        input.focus();
        input.select();
    }

    deleteCurrentSession() {
        const currentSessionId = this.currentSessionId;
        if (!currentSessionId) {
            alert('No session selected');
            return;
        }

        const session = this.sessions[currentSessionId];
        if (confirm(`Delete session "${session.name}"?`)) {
            this.deleteSession(currentSessionId);
        }
    }
}

window.SessionManager = SessionManager;
