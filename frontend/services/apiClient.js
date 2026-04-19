class StreamNoteApiClient {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || "";
    }

    buildUrl(path) {
        if (!this.baseUrl) return path;
        return `${this.baseUrl}${path}`;
    }

    async request(path, options = {}) {
        return fetch(this.buildUrl(path), options);
    }

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

    async summarize(payload, signal) {
        return this.postJson("/api/summarize", payload, signal);
    }

    async transcribe(formData) {
        return this.request("/api/transcribe", {
            method: "POST",
            body: formData,
        });
    }

    async translate(payload, signal) {
        return this.postJson("/api/translate", payload, signal);
    }

    async extractKeywords(payload, signal) {
        return this.postJson("/api/extract-keywords", payload, signal);
    }

    async explainKeyword(payload, signal) {
        return this.postJson("/api/explain-keyword", payload, signal);
    }

    async getSessionState(deviceId, signal) {
        const encodedDeviceId = encodeURIComponent(deviceId);
        return this.request(`/api/session-state?deviceId=${encodedDeviceId}`, {
            method: "GET",
            signal,
        });
    }

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

    async getAccountSessionState(signal) {
        return this.request("/api/account-session-state", {
            method: "GET",
            credentials: "same-origin",
            signal,
        });
    }

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
