/**
 * StreamNoteApiClient - HTTP client for StreamNote API endpoints
 * Handles all communication with the backend API including session management,
 * AI services (summarization, translation, keyword extraction), and authentication.
 * 
 * @class
 * @example
 * const client = new StreamNoteApiClient({ baseUrl: 'https://api.example.com' });
 * const keywords = await client.extractKeywords({ text: 'sample text' }, signal);
 */
class StreamNoteApiClient {
    /**
     * Create a new API client instance
     * @param {Object} config - Configuration object
     * @param {string} [config.baseUrl] - Base URL for API requests (default: "")
     */
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || "";
    }

    /**
     * Build full URL from path and base URL
     * @private
     * @param {string} path - API endpoint path
     * @returns {string} Complete URL
     */
    buildUrl(path) {
        if (!this.baseUrl) return path;
        return `${this.baseUrl}${path}`;
    }

    /**
     * Make a generic HTTP request
     * @private
     * @param {string} path - API endpoint path
     * @param {Object} [options={}] - Fetch options (method, headers, body, signal, etc.)
     * @returns {Promise<Response>} Fetch response object
     */
    async request(path, options = {}) {
        return fetch(this.buildUrl(path), options);
    }

    /**
     * Make a POST request with JSON payload
     * @private
     * @param {string} path - API endpoint path
     * @param {Object} payload - Request payload to send
     * @param {AbortSignal} [signal] - AbortSignal for request cancellation
     * @returns {Promise<Response>} Fetch response object
     */
    async postJson(path, payload, signal) {
        return this.request(path, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal,
        });
    }

    /**
     * Request AI summarization of text
     * @param {Object} payload - Request payload
     * @param {string} payload.text - Text to summarize
     * @param {AbortSignal} [signal] - Request cancellation signal
     * @returns {Promise<Response>} Response with summary content
     */
    async summarize(payload, signal) {
        return this.postJson("/api/summarize", payload, signal);
    }

    /**
     * Upload audio file for transcription
     * @param {FormData} formData - FormData object containing audio file
     * @returns {Promise<Response>} Response with transcription result
     */
    async transcribe(formData) {
        return this.request("/api/transcribe", {
            method: "POST",
            body: formData,
        });
    }

    /**
     * Request text translation to specified language
     * @param {Object} payload - Request payload
     * @param {string} payload.text - Text to translate
     * @param {string} payload.language - Target language for translation
     * @param {AbortSignal} [signal] - Request cancellation signal
     * @returns {Promise<Response>} Response with translated text
     */
    async translate(payload, signal) {
        return this.postJson("/api/translate", payload, signal);
    }

    /**
     * Extract keywords from text using AI
     * @param {Object} payload - Request payload
     * @param {string} payload.text - Text to extract keywords from
     * @param {AbortSignal} [signal] - Request cancellation signal
     * @returns {Promise<Response>} Response with array of keywords
     */
    async extractKeywords(payload, signal) {
        return this.postJson("/api/extract-keywords", payload, signal);
    }

    /**
     * Get explanation for a keyword
     * @param {Object} payload - Request payload
     * @param {string} payload.keyword - Keyword to explain
     * @param {string} payload.context - Context around the keyword
     * @param {AbortSignal} [signal] - Request cancellation signal
     * @returns {Promise<Response>} Response with keyword explanation
     */
    async explainKeyword(payload, signal) {
        return this.postJson("/api/explain-keyword", payload, signal);
    }

    /**
     * Retrieve session state for a device
     * @param {string} deviceId - Device identifier
     * @param {AbortSignal} [signal] - Request cancellation signal
     * @returns {Promise<Response>} Response with session state object
     */
    async getSessionState(deviceId, signal) {
        const encodedDeviceId = encodeURIComponent(deviceId);
        return this.request(`/api/session-state?deviceId=${encodedDeviceId}`, {
            method: "GET",
            signal,
        });
    }

    /**
     * Save session state for a device
     * @param {string} deviceId - Device identifier
     * @param {Object} state - Session state object to save
     * @param {AbortSignal} [signal] - Request cancellation signal
     * @returns {Promise<Response>} Response confirming save operation
     */
    async saveSessionState(deviceId, state, signal) {
        return this.request("/api/session-state", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                deviceId,
                state,
            }),
            signal,
        });
    }

    /**
     * Retrieve account-level session state (requires authentication)
     * @param {AbortSignal} [signal] - Request cancellation signal
     * @returns {Promise<Response>} Response with account session state
     */
    async getAccountSessionState(signal) {
        return this.request("/api/account-session-state", {
            method: "GET",
            credentials: "same-origin",
            signal,
        });
    }

    /**
     * Save account-level session state (requires authentication)
     * @param {Object} state - Account session state object to save
     * @param {AbortSignal} [signal] - Request cancellation signal
     * @returns {Promise<Response>} Response confirming save operation
     */
    async saveAccountSessionState(state, signal) {
        return this.request("/api/account-session-state", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ state }),
            credentials: "same-origin",
            signal,
        });
    }

    /**
     * Register a new user account
     * @param {Object} payload - Registration data
     * @param {string} payload.email - User email address
     * @param {string} payload.password - User password
     * @param {AbortSignal} [signal] - Request cancellation signal
     * @returns {Promise<Response>} Response with new user data
     */
    async register(payload, signal) {
        return this.request("/api/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            credentials: "same-origin",
            signal,
        });
    }

    /**
     * Authenticate user with email and password
     * @param {Object} payload - Login credentials
     * @param {string} payload.email - User email address
     * @param {string} payload.password - User password
     * @param {AbortSignal} [signal] - Request cancellation signal
     * @returns {Promise<Response>} Response with authentication token/session
     */
    async login(payload, signal) {
        return this.request("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            credentials: "same-origin",
            signal,
        });
    }

    /**
     * Get current authenticated user information
     * @param {AbortSignal} [signal] - Request cancellation signal
     * @returns {Promise<Response>} Response with current user data
     */
    async getCurrentUser(signal) {
        return this.request("/api/auth/me", {
            method: "GET",
            credentials: "same-origin",
            signal,
        });
    }

    async logout(signal) {
        return this.request("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin",
            signal,
        });
    }

    async deleteAccount(payload, signal) {
        return this.request("/api/auth/delete-account", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            credentials: "same-origin",
            signal,
        });
    }
}

window.StreamNoteApiClient = StreamNoteApiClient;
