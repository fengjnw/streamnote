/**
 * AppContext - Centralized dependency injection and service locator
 * Provides a cleaner alternative to accessing global window.streamNoteInstance.
 * 
 * This class manages all application services and allows components to request
 * dependencies instead of directly accessing global state.
 * 
 * @class
 * @example
 * // In main app initialization:
 * const context = new AppContext();
 * context.setSessionManager(sessionManager);
 * context.setKeywordManager(keywordManager);
 * 
 * // In a manager:
 * class MyManager {
 *   constructor(appContext) {
 *     this.appContext = appContext;
 *   }
 *   
 *   async doSomething() {
 *     const session = this.appContext.getSessionManager();
 *     // Use session instead of window.streamNoteInstance.sessionManager
 *   }
 * }
 */
class AppContext {
    /**
     * Create a new AppContext instance
     * @constructor
     */
    constructor() {
        // Core managers
        this._sessionManager = null;
        this._keywordManager = null;
        this._recordingManager = null;
        this._translationManager = null;
        this._highlightManager = null;
        this._panelManager = null;
        this._apiClient = null;

        // UI managers
        this._modalManager = null;
        this._settingsPanel = null;
        this._visibilityManager = null;
        this._displayManager = null;

        // Application state
        this._currentTranscriptText = "";
        this._language = "Chinese";
        this._explanationLanguage = "Chinese";
        this._translationEnabled = true;

        // Callbacks
        this._onStatusUpdate = null;
        this._onSaveSettings = null;
    }

    // ============= Core Managers =============

    /**
     * Set the session manager
     * @param {SessionManager} manager - Session manager instance
     */
    setSessionManager(manager) {
        this._sessionManager = manager;
    }

    /**
     * Get the session manager
     * @returns {SessionManager|null} Session manager or null if not set
     */
    getSessionManager() {
        return this._sessionManager;
    }

    /**
     * Set the keyword manager
     * @param {KeywordManager} manager - Keyword manager instance
     */
    setKeywordManager(manager) {
        this._keywordManager = manager;
    }

    /**
     * Get the keyword manager
     * @returns {KeywordManager|null} Keyword manager or null if not set
     */
    getKeywordManager() {
        return this._keywordManager;
    }

    /**
     * Set the recording manager
     * @param {RecordingManager} manager - Recording manager instance
     */
    setRecordingManager(manager) {
        this._recordingManager = manager;
    }

    /**
     * Get the recording manager
     * @returns {RecordingManager|null} Recording manager or null if not set
     */
    getRecordingManager() {
        return this._recordingManager;
    }

    /**
     * Set the translation manager
     * @param {TranslationManager} manager - Translation manager instance
     */
    setTranslationManager(manager) {
        this._translationManager = manager;
    }

    /**
     * Get the translation manager
     * @returns {TranslationManager|null} Translation manager or null if not set
     */
    getTranslationManager() {
        return this._translationManager;
    }

    /**
     * Set the highlight manager
     * @param {HighlightManager} manager - Highlight manager instance
     */
    setHighlightManager(manager) {
        this._highlightManager = manager;
    }

    /**
     * Get the highlight manager
     * @returns {HighlightManager|null} Highlight manager or null if not set
     */
    getHighlightManager() {
        return this._highlightManager;
    }

    /**
     * Set the panel manager
     * @param {PanelManager} manager - Panel manager instance
     */
    setPanelManager(manager) {
        this._panelManager = manager;
    }

    /**
     * Get the panel manager
     * @returns {PanelManager|null} Panel manager or null if not set
     */
    getPanelManager() {
        return this._panelManager;
    }

    /**
     * Set the API client
     * @param {StreamNoteApiClient} client - API client instance
     */
    setApiClient(client) {
        this._apiClient = client;
    }

    /**
     * Get the API client
     * @returns {StreamNoteApiClient|null} API client or null if not set
     */
    getApiClient() {
        return this._apiClient;
    }

    // ============= UI Managers =============

    /**
     * Set the modal manager
     * @param {ModalManager} manager - Modal manager instance
     */
    setModalManager(manager) {
        this._modalManager = manager;
    }

    /**
     * Get the modal manager
     * @returns {ModalManager|null} Modal manager or null if not set
     */
    getModalManager() {
        return this._modalManager;
    }

    /**
     * Set the settings panel
     * @param {SettingsPanel} panel - Settings panel instance
     */
    setSettingsPanel(panel) {
        this._settingsPanel = panel;
    }

    /**
     * Get the settings panel
     * @returns {SettingsPanel|null} Settings panel or null if not set
     */
    getSettingsPanel() {
        return this._settingsPanel;
    }

    /**
     * Set the visibility manager
     * @param {VisibilityManager} manager - Visibility manager instance
     */
    setVisibilityManager(manager) {
        this._visibilityManager = manager;
    }

    /**
     * Get the visibility manager
     * @returns {VisibilityManager|null} Visibility manager or null if not set
     */
    getVisibilityManager() {
        return this._visibilityManager;
    }

    /**
     * Set the display manager
     * @param {DisplayManager} manager - Display manager instance
     */
    setDisplayManager(manager) {
        this._displayManager = manager;
    }

    /**
     * Get the display manager
     * @returns {DisplayManager|null} Display manager or null if not set
     */
    getDisplayManager() {
        return this._displayManager;
    }

    // ============= Application State =============

    /**
     * Set the current transcript text
     * @param {string} text - Transcript text
     */
    setCurrentTranscriptText(text) {
        this._currentTranscriptText = text;
    }

    /**
     * Get the current transcript text
     * @returns {string} Current transcript text
     */
    getCurrentTranscriptText() {
        return this._currentTranscriptText;
    }

    /**
     * Set the interface language
     * @param {string} lang - Language code (e.g., "Chinese", "English")
     */
    setLanguage(lang) {
        this._language = lang;
    }

    /**
     * Get the interface language
     * @returns {string} Current language
     */
    getLanguage() {
        return this._language;
    }

    /**
     * Set the explanation language
     * @param {string} lang - Language code for explanations
     */
    setExplanationLanguage(lang) {
        this._explanationLanguage = lang;
    }

    /**
     * Get the explanation language
     * @returns {string} Current explanation language
     */
    getExplanationLanguage() {
        return this._explanationLanguage;
    }

    /**
     * Set translation enabled state
     * @param {boolean} enabled - Whether translation is enabled
     */
    setTranslationEnabled(enabled) {
        this._translationEnabled = enabled;
    }

    /**
     * Check if translation is enabled
     * @returns {boolean} Translation enabled state
     */
    isTranslationEnabled() {
        return this._translationEnabled;
    }

    // ============= Callbacks =============

    /**
     * Register a callback for status updates
     * @param {Function} callback - Callback function(message, duration)
     */
    onStatusUpdate(callback) {
        this._onStatusUpdate = callback;
    }

    /**
     * Emit a status update
     * @param {string} message - Status message
     * @param {number} [duration] - Display duration in milliseconds
     */
    emitStatusUpdate(message, duration) {
        if (this._onStatusUpdate) {
            this._onStatusUpdate(message, duration);
        }
    }

    /**
     * Register a callback for settings save
     * @param {Function} callback - Callback function()
     */
    onSaveSettings(callback) {
        this._onSaveSettings = callback;
    }

    /**
     * Emit a save settings request
     */
    emitSaveSettings() {
        if (this._onSaveSettings) {
            this._onSaveSettings();
        }
    }

    // ============= Utility Methods =============

    /**
     * Reset all dependencies (useful for testing)
     * @public
     */
    reset() {
        this._sessionManager = null;
        this._keywordManager = null;
        this._recordingManager = null;
        this._translationManager = null;
        this._highlightManager = null;
        this._panelManager = null;
        this._apiClient = null;
        this._modalManager = null;
        this._settingsPanel = null;
        this._visibilityManager = null;
        this._displayManager = null;
        this._onStatusUpdate = null;
        this._onSaveSettings = null;
    }

    /**
     * Check if all critical managers are initialized
     * @returns {boolean} True if all critical managers are set
     */
    isInitialized() {
        return (
            this._sessionManager !== null &&
            this._keywordManager !== null &&
            this._recordingManager !== null &&
            this._apiClient !== null
        );
    }
}

// Create global singleton instance for backward compatibility
if (typeof window !== 'undefined') {
    window.AppContext = AppContext;
}
