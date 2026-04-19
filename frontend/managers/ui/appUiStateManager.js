/**
 * AppUiStateManager - handles app-level UI helper states and lightweight UI actions.
 */
class AppUiStateManager {
    constructor(app) {
        this.app = app;
        this.authUser = null;
        this.pendingSyncChoiceResolver = null;
    }

    initAccountStatusUI() {
        const authBtn = document.getElementById("headerAuthBtn");
        if (authBtn) {
            authBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                await this.handleAuthAction();
            });
        }

        const deleteAccountBtn = document.getElementById("deleteAccountBtn");
        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener("click", async () => {
                await this.handleDeleteAccount();
            });
        }

        this.initAuthModal();
        this.initSessionSyncModal();

        this.refreshAuthState();
        this.renderAccountStatus();
    }

    async refreshAuthState() {
        if (!this.app.apiClient || typeof this.app.apiClient.getCurrentUser !== "function") {
            return;
        }

        try {
            const response = await this.app.apiClient.getCurrentUser();
            if (!response.ok) {
                this.authUser = null;
                this.app.sessionManager?.disableAccountSync();
                this.renderAccountStatus();
                return;
            }
            const payload = await response.json();
            this.authUser = payload?.user || null;
            if (this.authUser?.email) {
                await this.app.sessionManager?.initializeAccountSync({
                    userKey: this.authUser.email,
                    interactive: true,
                    syncChoiceResolver: () => this.openSessionSyncChoiceModal(),
                });
            } else {
                this.app.sessionManager?.disableAccountSync();
            }
        } catch {
            this.authUser = null;
            this.app.sessionManager?.disableAccountSync();
        }

        this.renderAccountStatus();
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

    initSessionSyncModal() {
        const closeBtn = document.getElementById("closeSessionSyncModal");
        const mergeBtn = document.getElementById("syncChoiceMergeBtn");
        const localBtn = document.getElementById("syncChoiceLocalBtn");
        const cloudBtn = document.getElementById("syncChoiceCloudBtn");

        closeBtn?.addEventListener("click", () => {
            this.resolveSessionSyncChoice({ mode: "merge", remember: false });
        });

        mergeBtn?.addEventListener("click", () => {
            this.resolveSessionSyncChoice("merge");
        });

        localBtn?.addEventListener("click", () => {
            this.resolveSessionSyncChoice("local");
        });

        cloudBtn?.addEventListener("click", () => {
            this.resolveSessionSyncChoice("cloud");
        });

        window.addEventListener("modal:closed", (event) => {
            const modalId = event?.detail?.modalId;
            if (modalId !== "sessionSyncModal") return;
            if (!this.pendingSyncChoiceResolver) return;
            this.resolveSessionSyncChoice("merge");
        });
    }

    openSessionSyncChoiceModal() {
        this.app.openModal("sessionSyncModal");

        return new Promise((resolve) => {
            this.pendingSyncChoiceResolver = resolve;
        });
    }

    resolveSessionSyncChoice(result) {
        if (this.pendingSyncChoiceResolver) {
            const resolver = this.pendingSyncChoiceResolver;
            this.pendingSyncChoiceResolver = null;
            resolver(result);
        }
        this.app.closeModal("sessionSyncModal");
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
                if (this.authUser?.email) {
                    await this.app.sessionManager?.initializeAccountSync({
                        userKey: this.authUser.email,
                        interactive: true,
                        syncChoiceResolver: () => this.openSessionSyncChoiceModal(),
                    });
                }
                this.closeAuthModal();
                this.showStatusMessage(mode === "register" ? "Account created and signed in" : "Signed in", 1800);
                this.renderAccountStatus();
                return;
            }

            const errorPayload = await response.json().catch(() => ({}));
            const message = errorPayload?.error?.message || (mode === "register" ? "Sign up failed" : "Sign in failed");
            this.showAuthError(message);
        } catch {
            this.showAuthError(mode === "register" ? "Network error during sign up" : "Network error during sign in");
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
        } catch {
            // Best-effort logout to keep UI consistent with browser cookie state.
        }

        this.authUser = null;
        this.app.sessionManager?.disableAccountSync();
        this.showStatusMessage("Signed out", 1500);
        this.renderAccountStatus();
    }

    async handleDeleteAccount() {
        if (!this.authUser?.email) {
            this.showStatusMessage("Please sign in first", 1800);
            return;
        }

        const confirmed = window.confirm("Delete this account permanently? This action cannot be undone.");
        if (!confirmed) return;

        const password = window.prompt("Enter your password to confirm account deletion") || "";
        if (!password) return;

        try {
            const response = await this.app.apiClient.deleteAccount({ password });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                const message = payload?.error?.message || "Delete account failed";
                this.showStatusMessage(message, 2200);
                return;
            }

            this.authUser = null;
            this.showStatusMessage("Account deleted", 1800);
            this.renderAccountStatus();
            this.app.closeModal("settingsModal");
        } catch {
            this.showStatusMessage("Network error during account deletion", 2200);
        }
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

    renderAccountStatus() {
        const accountStatusEl = document.getElementById("accountStatusLabel");
        const email = this.authUser?.email || "";
        const statusText = email || "Not signed in";
        if (accountStatusEl) {
            accountStatusEl.textContent = statusText;
            accountStatusEl.title = statusText;
        }

        const avatarEl = document.getElementById("accountAvatar");
        if (avatarEl) {
            const seed = email || "anonymous";
            avatarEl.textContent = this.avatarInitialForSeed(seed);
            avatarEl.style.background = this.avatarStyleForSeed(seed, !!email);
        }

        const authBtn = document.getElementById("headerAuthBtn");
        if (authBtn) {
            if (this.authUser?.email) {
                authBtn.textContent = "Sign Out";
                authBtn.title = "Sign out";
            } else {
                authBtn.textContent = "Sign In";
                authBtn.title = "Sign in";
            }
        }

        const settingsAccountEmailEl = document.getElementById("settingsAccountEmail");
        if (settingsAccountEmailEl) {
            settingsAccountEmailEl.textContent = this.authUser?.email || "Not signed in";
        }

        const deleteAccountBtn = document.getElementById("deleteAccountBtn");
        if (deleteAccountBtn) {
            deleteAccountBtn.disabled = !this.authUser?.email;
            deleteAccountBtn.title = this.authUser?.email ? "Delete current account" : "Sign in to enable account deletion";
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
