/**
 * AppUiStateManager - handles app-level UI helper states and lightweight UI actions.
 */
class AppUiStateManager {
    constructor(app) {
        this.app = app;
        this.identityRefreshTimer = null;
        this.authUser = null;
    }

    initDeviceIdentityUI() {
        const triggerBtn = document.getElementById("deviceIdentityBtn");
        const panel = document.getElementById("deviceIdentityPopover");
        if (!triggerBtn || !panel) return;

        triggerBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            panel.classList.toggle("hidden");
        });

        const authBtn = document.getElementById("headerAuthBtn");
        if (authBtn) {
            authBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                await this.handleAuthAction();
            });
        }

        this.initAuthModal();

        document.addEventListener("click", (event) => {
            if (panel.classList.contains("hidden")) return;
            const identityRoot = document.getElementById("deviceIdentityRoot");
            if (!identityRoot || !identityRoot.contains(event.target)) {
                panel.classList.add("hidden");
            }
        });

        window.addEventListener("ui:close-transient-layers", () => {
            panel.classList.add("hidden");
        });

        window.addEventListener("deviceIdentityChanged", () => this.renderDeviceIdentity());
        window.addEventListener("sessionSyncStatusChanged", () => this.renderDeviceIdentity());

        if (this.identityRefreshTimer) {
            clearInterval(this.identityRefreshTimer);
        }

        this.identityRefreshTimer = setInterval(() => {
            this.renderDeviceIdentity();
        }, 15000);

        this.refreshAuthState();
        this.renderDeviceIdentity();
    }

    async refreshAuthState() {
        if (!this.app.apiClient || typeof this.app.apiClient.getCurrentUser !== "function") {
            return;
        }

        try {
            const response = await this.app.apiClient.getCurrentUser();
            if (!response.ok) {
                this.authUser = null;
                this.renderDeviceIdentity();
                return;
            }
            const payload = await response.json();
            this.authUser = payload?.user || null;
        } catch (error) {
            this.authUser = null;
        }

        this.renderDeviceIdentity();
    }

    async handleAuthAction() {
        if (!this.app.apiClient) {
            this.showStatusMessage("API client unavailable", 1800);
            return;
        }

        if (this.authUser) {
            await this.logoutCurrentUser();
            return;
        }

        this.openAuthModal();
    }

    initAuthModal() {
        const closeBtn = document.getElementById("closeAuthModal");
        const loginBtn = document.getElementById("authLoginBtn");
        const registerBtn = document.getElementById("authRegisterBtn");
        const passwordInput = document.getElementById("authPasswordInput");
        const togglePasswordBtn = document.getElementById("toggleAuthPasswordBtn");

        closeBtn?.addEventListener("click", () => {
            this.closeAuthModal();
        });

        loginBtn?.addEventListener("click", async () => {
            await this.submitAuth("login");
        });

        registerBtn?.addEventListener("click", async () => {
            await this.submitAuth("register");
        });

        passwordInput?.addEventListener("keydown", async (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            await this.submitAuth("login");
        });

        togglePasswordBtn?.addEventListener("click", () => {
            this.toggleAuthPasswordVisibility();
        });
    }

    openAuthModal() {
        this.clearAuthError();
        this.app.openModal("authModal");

        const emailInput = document.getElementById("authEmailInput");
        const passwordInput = document.getElementById("authPasswordInput");

        if (emailInput) {
            emailInput.value = this.authUser?.email || "";
        }
        if (passwordInput) {
            passwordInput.value = "";
        }
        this.setAuthPasswordVisibility(false);

        setTimeout(() => {
            emailInput?.focus();
        }, 0);
    }

    closeAuthModal() {
        this.setAuthPasswordVisibility(false);
        this.app.closeModal("authModal");
    }

    setAuthPasswordVisibility(visible) {
        const passwordInput = document.getElementById("authPasswordInput");
        const toggleBtn = document.getElementById("toggleAuthPasswordBtn");
        if (!passwordInput || !toggleBtn) return;

        passwordInput.type = visible ? "text" : "password";
        toggleBtn.textContent = visible ? "Hide" : "Show";
        toggleBtn.setAttribute("aria-label", visible ? "Hide password" : "Show password");
        toggleBtn.setAttribute("title", visible ? "Hide password" : "Show password");
    }

    toggleAuthPasswordVisibility() {
        const passwordInput = document.getElementById("authPasswordInput");
        if (!passwordInput) return;
        this.setAuthPasswordVisibility(passwordInput.type !== "text");
    }

    showAuthError(message) {
        const errorEl = document.getElementById("authErrorMessage");
        if (!errorEl) return;
        errorEl.textContent = message;
        errorEl.classList.remove("hidden");
    }

    clearAuthError() {
        const errorEl = document.getElementById("authErrorMessage");
        if (!errorEl) return;
        errorEl.textContent = "";
        errorEl.classList.add("hidden");
    }

    async submitAuth(mode) {
        const emailInput = document.getElementById("authEmailInput");
        const passwordInput = document.getElementById("authPasswordInput");
        const loginBtn = document.getElementById("authLoginBtn");
        const registerBtn = document.getElementById("authRegisterBtn");

        const email = (emailInput?.value || "").trim().toLowerCase();
        const password = passwordInput?.value || "";

        this.clearAuthError();

        if (!email) {
            this.showAuthError("Email is required.");
            return;
        }
        if (password.length < 6) {
            this.showAuthError("Password must be at least 6 characters.");
            return;
        }

        loginBtn && (loginBtn.disabled = true);
        registerBtn && (registerBtn.disabled = true);

        try {
            const payload = {
                email,
                password,
                deviceId: this.app.sessionManager?.deviceId || "",
            };

            const response = mode === "register"
                ? await this.app.apiClient.register(payload)
                : await this.app.apiClient.login(payload);

            if (response.ok) {
                const data = await response.json();
                this.authUser = data?.user || null;
                this.closeAuthModal();
                this.showStatusMessage(mode === "register" ? "Account created and logged in" : "Logged in", 1800);
                this.renderDeviceIdentity();
                return;
            }

            const errorPayload = await response.json().catch(() => ({}));
            const message = errorPayload?.error?.message || (mode === "register" ? "Register failed" : "Login failed");
            this.showAuthError(message);
        } catch (error) {
            this.showAuthError(mode === "register" ? "Network error during register" : "Network error during login");
        } finally {
            loginBtn && (loginBtn.disabled = false);
            registerBtn && (registerBtn.disabled = false);
        }
    }

    async logoutCurrentUser() {
        if (!this.app.apiClient || typeof this.app.apiClient.logout !== "function") {
            return;
        }

        try {
            await this.app.apiClient.logout();
        } catch (error) {
            // Best-effort logout to keep UI consistent with browser cookie state.
        }

        this.authUser = null;
        this.showStatusMessage("Logged out", 1500);
        this.renderDeviceIdentity();
    }

    buildAvatarSeed(identityInfo) {
        return this.authUser?.email || identityInfo?.deviceId || "anonymous";
    }

    hashCode(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    avatarStyleForSeed(seed, isLoggedIn) {
        if (!isLoggedIn) {
            return "#6b7280";
        }

        const hash = this.hashCode(seed);
        const hue = hash % 360;
        return `hsl(${hue}, 58%, 43%)`;
    }

    avatarInitialForSeed(seed) {
        if (!seed) return "A";
        const normalized = seed.trim();
        if (!normalized) return "A";
        const char = normalized[0].toUpperCase();
        return /[A-Z0-9]/.test(char) ? char : "A";
    }

    getSyncStatusLabel(status) {
        switch (status) {
            case "syncing":
                return "Syncing";
            case "synced":
                return "Synced";
            case "offline":
                return "Offline";
            case "error":
                return "Sync error";
            default:
                return "Pending";
        }
    }

    formatRelativeSyncTime(timestamp) {
        if (!timestamp) return "Not yet";

        const diffMs = Math.max(0, Date.now() - timestamp);
        const sec = Math.floor(diffMs / 1000);
        if (sec < 5) return "just now";
        if (sec < 60) return `${sec}s ago`;

        const min = Math.floor(sec / 60);
        if (min < 60) return `${min}m ago`;

        const hour = Math.floor(min / 60);
        if (hour < 24) return `${hour}h ago`;

        const day = Math.floor(hour / 24);
        return `${day}d ago`;
    }

    renderDeviceIdentity() {
        const identityInfo = this.app.sessionManager?.getDeviceIdentityInfo();
        if (!identityInfo) return;

        const labelEl = document.getElementById("deviceIdentityLabel");
        if (labelEl) {
            labelEl.textContent = this.authUser?.email ? `User: ${this.authUser.email}` : identityInfo.label;
        }

        const typeEl = document.getElementById("identityTypeValue");
        if (typeEl) {
            typeEl.textContent = this.authUser?.email ? "Logged in user" : "Anonymous device";
        }

        const accountEmailEl = document.getElementById("identityAccountEmail");
        if (accountEmailEl) {
            accountEmailEl.textContent = this.authUser?.email || "-";
        }

        const fullIdEl = document.getElementById("deviceIdentityFullId");
        if (fullIdEl) {
            fullIdEl.textContent = identityInfo.deviceId || "-";
        }

        const shortIdEl = document.getElementById("deviceIdentityShortId");
        if (shortIdEl) {
            shortIdEl.textContent = identityInfo.shortId || "------";
        }

        const status = this.app.sessionManager?.syncStatus || "idle";
        const statusLabel = this.getSyncStatusLabel(status);

        const statusEl = document.getElementById("deviceSyncStatus");
        if (statusEl) {
            statusEl.textContent = statusLabel;
        }

        const syncTimeEl = document.getElementById("deviceLastSyncTime");
        if (syncTimeEl) {
            syncTimeEl.textContent = this.formatRelativeSyncTime(this.app.sessionManager?.lastSyncedAt || null);
        }

        const avatarEl = document.getElementById("identityAvatar");
        if (avatarEl) {
            const seed = this.buildAvatarSeed(identityInfo);
            avatarEl.textContent = this.avatarInitialForSeed(seed);
            avatarEl.style.background = this.avatarStyleForSeed(seed, !!this.authUser?.email);
        }

        const authBtn = document.getElementById("headerAuthBtn");
        if (authBtn) {
            if (this.authUser?.email) {
                authBtn.textContent = "Log Out";
                authBtn.title = "Log out";
            } else {
                authBtn.textContent = "Log In";
                authBtn.title = "Log in";
            }
        }
    }

    syncExplanationLanguageSelectors() {
        const selectorIds = [
            "summary-language",
            "keyword-explanation-language",
            "defaultExplanationLanguage"
        ];

        selectorIds.forEach((selectorId) => {
            const selector = document.getElementById(selectorId);
            if (selector) {
                selector.value = this.app.explanationLanguage;
            }
        });
    }

    setEditModalVisibility(isVisible) {
        const backdrop = document.getElementById("editModalBackdrop");
        const modal = document.getElementById("editModal");
        if (!backdrop || !modal) return;

        backdrop.style.display = isVisible ? "block" : "none";
        modal.style.display = isVisible ? "flex" : "none";
    }

    getCurrentSessionTranscriptText() {
        const session = this.app.sessionManager.getCurrentSession();
        if (!session || !session.transcripts) return "";

        return Object.values(session.transcripts)
            .map(item => item && item.text ? item.text : "")
            .filter(text => text.trim().length > 0)
            .join(" ");
    }

    async updateSummaryDisplayForSelection(summaryDisplay, selectedStyle, autoGenerateOnMiss) {
        if (!summaryDisplay) return;

        const cacheKey = `${this.app.explanationLanguage}-${selectedStyle}`;

        if (this.app.summaryCache[cacheKey]) {
            summaryDisplay.innerHTML = TextFormatters.formatSummaryDisplay(this.app.summaryCache[cacheKey], selectedStyle);
            return;
        }

        if (!autoGenerateOnMiss) {
            summaryDisplay.innerHTML = '<p class="placeholder">Select a style and click Refresh to create a summary</p>';
            return;
        }

        const hasContent = summaryDisplay.children.length > 0 && !summaryDisplay.querySelector(".placeholder");
        if (!hasContent) {
            summaryDisplay.innerHTML = '<p class="placeholder">Select a style and click Refresh to create a summary</p>';
            return;
        }

        try {
            const textToSummarize = this.getCurrentSessionTranscriptText();
            if (textToSummarize && textToSummarize.trim().length > 0) {
                this.showStatusMessage("Generating summary...", 1000);
                summaryDisplay.innerHTML = '<p class="placeholder">Generating summary...</p>';
                const summary = await this.app.summarizeText(textToSummarize, true, selectedStyle);
                if (summary) {
                    summaryDisplay.innerHTML = TextFormatters.formatSummaryDisplay(summary, selectedStyle);
                }
            }
        } catch (error) {
            console.error("[SUMMARY] Error auto-generating summary:", error);
            summaryDisplay.innerHTML = '<p class="placeholder">Failed to generate summary</p>';
        }
    }

    showStatusMessage(message, duration = 3000) {
        const statusEl = document.getElementById("status");

        if (this.app.statusMessageTimeout) {
            clearTimeout(this.app.statusMessageTimeout);
        }

        statusEl.textContent = message;

        this.app.statusMessageTimeout = setTimeout(() => {
            statusEl.textContent = "";
            this.app.statusMessageTimeout = null;
        }, duration);
    }

    updateHighlightButtonState(word, isHighlighted) {
        const btn = document.getElementById("highlight-current-word-btn");
        if (!btn) return;

        if (isHighlighted) {
            btn.title = "Remove from highlights";
            btn.classList.add("active");
        } else {
            btn.title = "Add to highlights";
            btn.classList.remove("active");
        }
    }

    updateRecordingIndicator() {
        const indicator = document.getElementById("recording-indicator");
        const sessionNameEl = document.getElementById("recording-session-name");

        if (this.app.recordingSessionId !== null) {
            const recordingSession = this.app.sessionManager.getSession(this.app.recordingSessionId);
            const recordingSessionName = recordingSession ? recordingSession.name : "Unknown";
            sessionNameEl.textContent = recordingSessionName;
            indicator.style.display = "inline-block";

            const sessionItems = document.querySelectorAll(".session-item");
            sessionItems.forEach(item => {
                if (item.dataset.sessionId === this.app.recordingSessionId) {
                    item.classList.add("recording");
                } else {
                    item.classList.remove("recording");
                }
            });
        } else {
            indicator.style.display = "none";
            const sessionItems = document.querySelectorAll(".session-item");
            sessionItems.forEach(item => {
                item.classList.remove("recording");
            });
        }
    }

    deleteKeyword(keyword) {
        if (!this.app.keywordManager) return;

        const currentWordEl = document.getElementById("current-explanation-word");
        const currentWord = currentWordEl?.textContent?.trim();
        const isCurrentlyExplaining = currentWord === keyword;

        const highlightIndex = this.app.keywordManager.highlights.indexOf(keyword);
        const extractIndex = this.app.keywordManager.extracts.indexOf(keyword);

        if (highlightIndex > -1) {
            this.app.keywordManager.highlights.splice(highlightIndex, 1);
            this.app.highlightManager.removeHighlightFromTranscript(keyword);
        } else if (extractIndex > -1) {
            this.app.keywordManager.extracts.splice(extractIndex, 1);
        } else {
            return;
        }

        this.app.keywordManager.updateAllKeywordDisplays();

        if (isCurrentlyExplaining) {
            this.updateHighlightButtonState(keyword, false);
        }

        this.app.sessionManager.updateCurrentHighlights(this.app.keywordManager.highlights);
        this.app.sessionManager.updateCurrentKeywords(this.app.keywordManager.extracts);

        this.showStatusMessage(`Removed "${keyword}"`, 1200);
    }
}

window.AppUiStateManager = AppUiStateManager;
