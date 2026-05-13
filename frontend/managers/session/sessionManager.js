
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
        this.accountSyncEnabled = false;
        this.accountUserKey = null;
        this.deviceId = this.getOrCreateDeviceId();
        this.syncStatus = this.apiClient ? 'local' : 'offline';
        this.lastSyncedAt = null;
        this.lastSyncError = null;

        this.defaultSettings = {
            defaultLanguage: "Chinese",
            defaultExplanationLanguage: "English"
        };

        this.loadDefaultSettings();
        this.loadSessions();
        this.setupUI();
        this.emitIdentityUpdate();
        this.emitSyncStatusChanged();
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
            let pruned = false;
            if (saved) {
                this.sessions = JSON.parse(saved);
                this.normalizeLoadedSessions(this.sessions);
                this.migrateLegacyWelcomeSessionId();
                pruned = this.pruneRedundantDefaultSession();
            }

            const hasSessions = Object.keys(this.sessions).length > 0;

            if (!hasSessions) {
                this.ensureWelcomeAsDefault(false);
            } else {
                const currentId = localStorage.getItem(this.CURRENT_SESSION_KEY);
                if (currentId && this.sessions[currentId]) {
                    this.currentSessionId = currentId;
                } else if (this.sessions['welcome-session']) {
                    this.currentSessionId = 'welcome-session';
                    localStorage.setItem(this.CURRENT_SESSION_KEY, this.currentSessionId);
                } else {
                    const firstSessionId = Object.keys(this.sessions)[0] || null;
                    if (firstSessionId) {
                        this.currentSessionId = firstSessionId;
                        localStorage.setItem(this.CURRENT_SESSION_KEY, this.currentSessionId);
                    } else {
                        this.ensureWelcomeAsDefault(false);
                    }
                }
            }

            if (pruned) {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.sessions));
                if (this.currentSessionId) {
                    localStorage.setItem(this.CURRENT_SESSION_KEY, this.currentSessionId);
                }
            }
        } catch (error) {
            console.error('[SessionManager] Load error:', error);
            this.ensureWelcomeAsDefault(false);
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
                    Korean: {},
                    Arabic: {},
                    Hindi: {},
                    Portuguese: {}
                };
            }

            const translationDefaults = [
                "Chinese",
                "English",
                "Spanish",
                "French",
                "Japanese",
                "Korean",
                "Arabic",
                "Hindi",
                "Portuguese"
            ];

            if (!session.translations || typeof session.translations !== "object") {
                session.translations = {};
            }

            translationDefaults.forEach((language) => {
                if (!session.translations[language]) {
                    session.translations[language] = {};
                }
            });

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
                    explanationLanguage: "English"
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
                    session.settings.explanationLanguage = "English";
                }

                delete session.settings.keywordEnabled;
                delete session.settings.keywordExplanationLanguage;
                delete session.settings.explanationCache;
                delete session.settings.queryHistory;
                delete session.settings.summaryCache;
            }
        });
    }

    isSessionEffectivelyEmpty(session) {
        if (!session || typeof session !== 'object') {
            return true;
        }

        const transcriptCount = Object.keys(session.transcripts || {}).length;
        const keywordCount = Array.isArray(session.keywords) ? session.keywords.length : 0;
        const highlightCount = Array.isArray(session.highlights) ? session.highlights.length : 0;
        const explanationCount = Array.isArray(session.explanations) ? session.explanations.length : 0;

        const translationCount = Object.values(session.translations || {}).reduce((sum, langMap) => {
            if (!langMap || typeof langMap !== 'object') {
                return sum;
            }
            return sum + Object.keys(langMap).length;
        }, 0);

        return (
            transcriptCount === 0
            && keywordCount === 0
            && highlightCount === 0
            && explanationCount === 0
            && translationCount === 0
        );
    }

    pruneRedundantDefaultSession() {
        const welcomeId = 'welcome-session';
        if (!this.sessions[welcomeId]) {
            return false;
        }

        const ids = Object.keys(this.sessions);
        if (ids.length !== 2) {
            return false;
        }

        const candidateId = ids.find((id) => id !== welcomeId);
        if (!candidateId) {
            return false;
        }

        const candidate = this.sessions[candidateId];
        if (!this.isSessionEffectivelyEmpty(candidate)) {
            return false;
        }

        delete this.sessions[candidateId];

        if (!this.currentSessionId || this.currentSessionId === candidateId) {
            this.currentSessionId = welcomeId;
        }

        return true;
    }

    snapshotState() {
        const sessions = JSON.parse(JSON.stringify(this.sessions || {}));
        const defaultSettings = JSON.parse(JSON.stringify(this.defaultSettings || {}));
        return {
            sessions,
            currentSessionId: this.currentSessionId,
            defaultSettings,
        };
    }

    normalizeStateForSync(state) {
        if (!state || typeof state !== 'object') {
            return {
                sessions: {},
                currentSessionId: null,
                defaultSettings: {},
            };
        }

        const normalized = JSON.parse(JSON.stringify(state));

        if (!normalized.sessions || typeof normalized.sessions !== 'object') {
            normalized.sessions = {};
        }

        this.normalizeLoadedSessions(normalized.sessions);
        const migrated = this.migrateLegacyWelcomeSessionIdInMap(normalized.sessions, normalized.currentSessionId);
        normalized.currentSessionId = migrated.currentSessionId;

        if (!normalized.defaultSettings || typeof normalized.defaultSettings !== 'object') {
            normalized.defaultSettings = {};
        }

        delete normalized.defaultSettings.loadWelcomeSession;
        delete normalized.defaultSettings.loadTutorialSession;

        if (normalized.currentSessionId && !normalized.sessions[normalized.currentSessionId]) {
            const firstId = Object.keys(normalized.sessions)[0];
            normalized.currentSessionId = firstId || null;
        }

        return normalized;
    }

    migrateLegacyWelcomeSessionIdInMap(sessionMap, currentSessionId) {
        const legacyId = 'tutorial-session';
        const welcomeId = 'welcome-session';
        const legacySession = sessionMap[legacyId];
        const welcomeSession = sessionMap[welcomeId];
        let nextCurrent = currentSessionId;

        if (legacySession && !welcomeSession) {
            sessionMap[welcomeId] = {
                ...legacySession,
                id: welcomeId,
                name: legacySession.name === 'Tutorial' ? 'Welcome' : legacySession.name,
            };
            delete sessionMap[legacyId];
        } else if (legacySession && welcomeSession) {
            delete sessionMap[legacyId];
        }

        if (nextCurrent === legacyId) {
            nextCurrent = welcomeId;
        }

        return { currentSessionId: nextCurrent };
    }

    stableSerialize(value) {
        if (value === null || value === undefined) {
            return 'null';
        }

        if (Array.isArray(value)) {
            return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
        }

        if (typeof value === 'object') {
            const keys = Object.keys(value).sort();
            const body = keys
                .map((key) => `${JSON.stringify(key)}:${this.stableSerialize(value[key])}`)
                .join(',');
            return `{${body}}`;
        }

        return JSON.stringify(value);
    }

    normalizeSyncChoice(choice) {
        if (!choice) {
            return 'merge';
        }

        if (typeof choice === 'string') {
            const mode = choice.trim().toLowerCase();
            if (mode === 'local' || mode === 'cloud' || mode === 'merge') {
                return mode;
            }
            return 'merge';
        }

        if (typeof choice === 'object') {
            const mode = typeof choice.mode === 'string' ? choice.mode.trim().toLowerCase() : 'merge';
            return (mode === 'local' || mode === 'cloud' || mode === 'merge') ? mode : 'merge';
        }

        return 'merge';
    }

    async resolvePostLoginSyncChoice(options = {}) {
        if (typeof options.syncChoiceResolver === 'function') {
            try {
                const result = await options.syncChoiceResolver();
                return this.normalizeSyncChoice(result);
            } catch (error) {
                console.warn('[SessionManager] Sync choice resolver failed, fallback to prompt:', error);
            }
        }

        const promptText = [
            'Local and account data are both available.',
            'Choose sync mode: merge / local / cloud',
            'merge = combine both, local = upload local only, cloud = use account data only',
            'Press Cancel or leave empty to use merge.'
        ].join('\n');

        const raw = window.prompt(promptText, 'merge');
        return this.normalizeSyncChoice(raw || 'merge');
    }

    statesAreEquivalent(a, b) {
        if (!a || !b) return false;
        try {
            const normalizedA = this.normalizeStateForSync(a);
            const normalizedB = this.normalizeStateForSync(b);
            return this.stableSerialize(normalizedA) === this.stableSerialize(normalizedB);
        } catch {
            return false;
        }
    }

    hasMeaningfulState(state) {
        const normalized = this.normalizeStateForSync(state);
        const sessions = normalized.sessions || {};
        const ids = Object.keys(sessions);
        if (ids.length === 0) return false;

        return ids.some((id) => {
            const session = sessions[id] || {};
            const transcriptCount = Object.keys(session.transcripts || {}).length;
            const isReserved = this.RESERVED_SESSION_IDS.includes(id);
            return transcriptCount > 0 || (!isReserved && ids.length > 1);
        });
    }

    mergeStates(localState, remoteState) {
        const normalizedLocal = this.normalizeStateForSync(localState);
        const normalizedRemote = this.normalizeStateForSync(remoteState);

        const localSessions = normalizedLocal.sessions || {};
        const remoteSessions = normalizedRemote.sessions || {};
        const mergedSessions = JSON.parse(JSON.stringify(remoteSessions));

        Object.keys(localSessions).forEach((sessionId) => {
            const localSession = localSessions[sessionId] || {};
            const remoteSession = mergedSessions[sessionId] || null;

            if (!remoteSession) {
                mergedSessions[sessionId] = JSON.parse(JSON.stringify(localSession));
                return;
            }

            const localUpdated = Number(localSession.lastModified || localSession.lastAccessed || localSession.createdAt || 0);
            const remoteUpdated = Number(remoteSession.lastModified || remoteSession.lastAccessed || remoteSession.createdAt || 0);

            const newer = localUpdated >= remoteUpdated ? localSession : remoteSession;
            const older = localUpdated >= remoteUpdated ? remoteSession : localSession;

            const merged = {
                ...JSON.parse(JSON.stringify(older)),
                ...JSON.parse(JSON.stringify(newer)),
                transcripts: {
                    ...(older.transcripts || {}),
                    ...(newer.transcripts || {}),
                },
                translations: {
                    ...(older.translations || {}),
                    ...(newer.translations || {}),
                },
                keywordCache: {
                    ...(older.keywordCache || {}),
                    ...(newer.keywordCache || {}),
                },
                highlightCache: {
                    ...(older.highlightCache || {}),
                    ...(newer.highlightCache || {}),
                },
                explanationCache: {
                    ...(older.explanationCache || {}),
                    ...(newer.explanationCache || {}),
                },
                summaryCache: {
                    ...(older.summaryCache || {}),
                    ...(newer.summaryCache || {}),
                },
                settings: {
                    ...(older.settings || {}),
                    ...(newer.settings || {}),
                },
                highlights: [...new Set([...(older.highlights || []), ...(newer.highlights || [])])],
                keywords: [...new Set([...(older.keywords || []), ...(newer.keywords || [])])],
                explanationHistory: [...(newer.explanationHistory || older.explanationHistory || [])],
                explanations: [...(newer.explanations || older.explanations || [])],
                lastModified: Math.max(localUpdated, remoteUpdated),
            };

            mergedSessions[sessionId] = merged;
        });

        const mergedDefaultSettings = {
            ...(normalizedRemote.defaultSettings || {}),
            ...(normalizedLocal.defaultSettings || {}),
        };
        delete mergedDefaultSettings.loadWelcomeSession;
        delete mergedDefaultSettings.loadTutorialSession;

        let mergedCurrentSessionId = normalizedLocal.currentSessionId || normalizedRemote.currentSessionId || null;
        if (!mergedCurrentSessionId || !mergedSessions[mergedCurrentSessionId]) {
            const fallbackIds = Object.keys(mergedSessions);
            mergedCurrentSessionId = fallbackIds.length > 0 ? fallbackIds[0] : null;
        }

        return {
            sessions: mergedSessions,
            currentSessionId: mergedCurrentSessionId,
            defaultSettings: mergedDefaultSettings,
        };
    }

    applyStateSnapshot(state, options = {}) {
        if (!state || typeof state !== 'object') {
            return;
        }

        const shouldEmit = options.emitSessionChanged !== false;
        const shouldPersist = options.persist !== false;

        this.isHydratingFromRemote = true;

        if (state.defaultSettings && typeof state.defaultSettings === 'object') {
            this.defaultSettings = { ...this.defaultSettings, ...state.defaultSettings };
            delete this.defaultSettings.loadWelcomeSession;
            delete this.defaultSettings.loadTutorialSession;
            this.saveDefaultSettings();
        }

        if (state.sessions && typeof state.sessions === 'object') {
            this.sessions = JSON.parse(JSON.stringify(state.sessions));
            this.normalizeLoadedSessions(this.sessions);
            this.migrateLegacyWelcomeSessionId();
            this.pruneRedundantDefaultSession();
        }

        const incomingCurrent = state.currentSessionId === 'tutorial-session'
            ? 'welcome-session'
            : state.currentSessionId;

        if (incomingCurrent && this.sessions[incomingCurrent]) {
            this.currentSessionId = incomingCurrent;
        } else if (this.sessions['welcome-session']) {
            this.currentSessionId = 'welcome-session';
        } else if (!this.currentSessionId || !this.sessions[this.currentSessionId]) {
            const firstId = Object.keys(this.sessions)[0] || null;
            this.currentSessionId = firstId;
        }

        if (!this.currentSessionId) {
            this.ensureWelcomeAsDefault(false);
        }

        if (shouldPersist) {
            this.saveSessions();
        } else {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.sessions));
            localStorage.setItem(this.CURRENT_SESSION_KEY, this.currentSessionId);
        }
        this.renderSessionList();

        const sessionNameDisplay = document.getElementById('sessionNameDisplay');
        if (sessionNameDisplay && this.sessions[this.currentSessionId]) {
            sessionNameDisplay.textContent = this.sessions[this.currentSessionId].name;
        }

        if (shouldEmit) {
            window.dispatchEvent(new CustomEvent('sessionChanged', {
                detail: { sessionId: this.currentSessionId }
            }));
        }

        this.isHydratingFromRemote = false;
    }

    async initializeAccountSync(options = {}) {
        if (!this.apiClient) {
            return;
        }

        const userKey = options.userKey || null;
        const interactive = options.interactive !== false;

        if (userKey && this.accountSyncEnabled && this.accountUserKey === userKey) {
            return;
        }

        try {
            this.setSyncStatus('syncing');
            const localState = this.snapshotState();

            const response = await this.apiClient.getAccountSessionState();
            if (!response.ok) {
                this.setSyncStatus('error', `HTTP ${response.status}`);
                return;
            }

            const payload = await response.json();
            const remoteState = payload?.state && typeof payload.state === 'object' ? payload.state : null;

            const hasLocal = this.hasMeaningfulState(localState);
            const hasRemote = this.hasMeaningfulState(remoteState);

            let chosenMode = 'merge';
            if (hasLocal && hasRemote && !this.statesAreEquivalent(localState, remoteState) && interactive) {
                chosenMode = await this.resolvePostLoginSyncChoice(options);
            } else if (hasLocal && !hasRemote) {
                chosenMode = 'local';
            } else if (!hasLocal && hasRemote) {
                chosenMode = 'cloud';
            }

            if (chosenMode === 'cloud') {
                if (remoteState) {
                    this.applyStateSnapshot(remoteState, { emitSessionChanged: true, persist: false });
                }
            } else if (chosenMode === 'local') {
                await this.apiClient.saveAccountSessionState(localState);
            } else {
                const mergedState = this.mergeStates(localState, remoteState || { sessions: {}, currentSessionId: null, defaultSettings: {} });
                this.applyStateSnapshot(mergedState, { emitSessionChanged: true, persist: false });
                await this.apiClient.saveAccountSessionState(mergedState);
            }

            this.accountSyncEnabled = true;
            this.accountUserKey = userKey;
            this.lastSyncedAt = Date.now();
            this.lastSyncError = null;
            this.setSyncStatus('synced');
        } catch (error) {
            console.warn('[SessionManager] Account sync initialization failed:', error);
            this.setSyncStatus('offline', error?.message || 'Network unavailable');
        }
    }

    disableAccountSync() {
        this.accountSyncEnabled = false;
        this.accountUserKey = null;
        this.lastSyncError = null;
        this.setSyncStatus(this.apiClient ? 'local' : 'offline');
    }

    scheduleRemoteSync() {
        if (!this.apiClient || !this.accountSyncEnabled || this.isHydratingFromRemote) {
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
        if (!this.apiClient || !this.accountSyncEnabled || this.remoteSyncInFlight) {
            return;
        }

        this.remoteSyncInFlight = true;
        this.setSyncStatus('syncing');
        try {
            const response = await this.apiClient.saveAccountSessionState(this.snapshotState());
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

    ensureWelcomeAsDefault(useSwitch = false) {
        const loaded = this.loadWelcomeSessionIntoState(useSwitch);
        if (!loaded) {
            console.error('[SessionManager] Failed to load welcome session as default');
        }
        return loaded;
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
                Korean: {},
                Arabic: {},
                Hindi: {},
                Portuguese: {}
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

    createSingleImportSessionId() {
        return Date.now().toString();
    }

    createBulkImportSessionId() {
        return Date.now().toString() + Math.random();
    }

    importSingleSessionRecord(sessionData) {
        const newId = this.createSingleImportSessionId();
        const imported = { ...sessionData, id: newId };
        this.sessions[newId] = imported;
        this.switchSession(newId);
        alert(`Successfully imported session: ${imported.name}`);
    }

    importMultipleSessionRecords(sessionMap) {
        const confirmMsg = `Import ${Object.keys(sessionMap).length} sessions?\nThis will merge with existing data.`;
        if (!confirm(confirmMsg)) {
            return;
        }

        Object.values(sessionMap).forEach(session => {
            const newId = this.createBulkImportSessionId();
            this.sessions[newId] = { ...session, id: newId };
        });

        this.saveSessions();
        this.renderSessionList();
        alert('Import successful!');
    }

    handleImportedData(data) {
        if (data.session) {
            this.importSingleSessionRecord(data.session);
            return;
        }

        if (data.sessions) {
            this.importMultipleSessionRecords(data.sessions);
        }
    }

    importSessions(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.handleImportedData(data);
            } catch (error) {
                console.error('[SessionManager] Import error:', error);
                alert('Import failed: Invalid file format');
            }
        };
        reader.readAsText(file);
    }

    shouldClearAllSessions() {
        const confirmMsg = '⚠️ Clear all session data?\nThis action cannot be undone!';
        if (!confirm(confirmMsg)) {
            return false;
        }

        const doubleConfirm = 'Final confirmation: Really delete all data?';
        return confirm(doubleConfirm);
    }

    performClearAllSessions() {
        this.sessions = {};
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem(this.CURRENT_SESSION_KEY);

        this.ensureWelcomeAsDefault(true);
        alert('All data cleared');
    }

    clearAllSessions() {
        if (this.shouldClearAllSessions()) {
            this.performClearAllSessions();
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
                this.ensureWelcomeAsDefault(true);
            }
        }
    }

    bindSessionCreationButtons() {
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
    }

    bindSessionPanelButtons() {
        const openBtn = document.getElementById('openSessionPanel');
        if (openBtn) {
            openBtn.addEventListener('click', () => {
                if (window.streamNoteInstance) {
                    window.streamNoteInstance.toggleModal('sessionModal');
                }
            });
        }
    }

    bindSessionNameControls() {
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
    }

    bindSessionImportControls() {
        const importInput = document.getElementById('importFileInput');

        importInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.importSessions(file);
                e.target.value = '';
            }
        });
    }

    bindSessionActionButtons() {
        document.getElementById('renameSessionBtn')?.addEventListener('click', () => {
            this.enterRenameMode();
        });

        document.getElementById('deleteSessionBtn')?.addEventListener('click', () => {
            this.deleteCurrentSession();
        });
    }

    setupUI() {
        this.bindSessionCreationButtons();
        this.bindSessionPanelButtons();
        this.bindSessionNameControls();
        this.bindSessionImportControls();
        this.bindSessionActionButtons();

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

            const lineCount = Object.keys(session.transcripts || {}).length || 0;
            const highlightCount = Array.isArray(session.highlights) ? session.highlights.length : 0;
            const keywordCount = Array.isArray(session.keywords) ? session.keywords.length : 0;
            const createdDate = this.formatFullDate(session.createdAt);
            const lastModified = this.formatRelativeTime(session.lastModified || session.createdAt);

            return `
                <div class="session-item ${isActive ? 'active' : ''}" data-session-id="${id}">
                    <div class="session-main">
                        <div class="session-name">${session.name}</div>
                        <div class="session-brief">
                            <span class="brief-item">${createdDate}</span>
                            <span class="brief-item">${lineCount} lines</span>
                            <span class="brief-item">${highlightCount} highlights</span>
                            <span class="brief-item">${keywordCount} keywords</span>
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
