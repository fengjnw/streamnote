class StreamNoteApiClient {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || "";
    }

    buildUrl(path) {
        if (!this.baseUrl) return path;
        return `${this.baseUrl}${path}`;
    }

    async summarize(payload, signal) {
        return fetch(this.buildUrl("/api/summarize"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal,
        });
    }

    async transcribe(formData) {
        return fetch(this.buildUrl("/api/transcribe"), {
            method: "POST",
            body: formData,
        });
    }

    async translate(payload, signal) {
        return fetch(this.buildUrl("/api/translate"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal,
        });
    }

    async extractKeywords(payload, signal) {
        return fetch(this.buildUrl("/api/extract-keywords"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal,
        });
    }

    async explainKeyword(payload, signal) {
        return fetch(this.buildUrl("/api/explain-keyword"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal,
        });
    }
}

window.StreamNoteApiClient = StreamNoteApiClient;
