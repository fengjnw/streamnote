/**
 * ContentActionsListenersManager - binds add-content and transcript-edit related listeners.
 */
class ContentActionsListenersManager {
    constructor(app) {
        this.app = app;
    }

    setup() {
        const app = this.app;
        const addContentBtn = document.getElementById("addContentBtn");
        const downloadSessionBtn = document.getElementById("downloadSessionBtn");
        const contentMenu = document.getElementById("contentMenu");
        const downloadMenu = document.getElementById("downloadMenu");
        const importFromFileOption = document.getElementById("importFromFileOption");
        const importFromTextOption = document.getElementById("importFromTextOption");
        const importSessionOption = document.getElementById("importSessionOption");
        const downloadCurrentSessionOption = document.getElementById("downloadCurrentSessionOption");
        const downloadAllSessionsOption = document.getElementById("downloadAllSessionsOption");
        const copyTranscriptOption = document.getElementById("copyTranscriptOption");
        const exportTranscriptTextOption = document.getElementById("exportTranscriptTextOption");
        const exportTranscriptMarkdownOption = document.getElementById("exportTranscriptMarkdownOption");
        const importFileInput = document.getElementById("importFileInput");
        const textFileInput = document.getElementById("textFileInput");

        const isMobileViewport = () => window.DeviceCapabilities?.isMobileViewport?.()
            ?? window.matchMedia("(max-width: 768px)").matches;

        const supportsClipboardWrite = () => window.DeviceCapabilities?.supportsClipboardWrite?.()
            ?? !!navigator.clipboard?.writeText;

        const setDisplay = (element, isVisible) => {
            if (element) {
                element.style.display = isVisible ? "block" : "none";
            }
        };

        const applyImportMenuCapabilities = () => {
            const isMobile = isMobileViewport();

            if (importFromFileOption) {
                importFromFileOption.textContent = isMobile ? "File" : "From File";
            }
            if (importFromTextOption) {
                importFromTextOption.textContent = isMobile ? "Text" : "From Text";
            }
            if (importSessionOption) {
                importSessionOption.textContent = isMobile ? "Session" : "From Session JSON";
            }
        };

        const applyExportMenuCapabilities = () => {
            const isMobile = isMobileViewport();

            setDisplay(copyTranscriptOption, isMobile && supportsClipboardWrite());
            setDisplay(downloadAllSessionsOption, !isMobile);
            setDisplay(exportTranscriptMarkdownOption, !isMobile);

            if (downloadCurrentSessionOption) {
                downloadCurrentSessionOption.textContent = isMobile ? "Session JSON" : "Current Session";
            }
            if (exportTranscriptTextOption) {
                exportTranscriptTextOption.textContent = isMobile ? "Text File" : "Transcript (TXT)";
            }
        };

        const hideUploadMenu = () => {
            if (contentMenu) {
                contentMenu.style.display = "none";
            }
            if (addContentBtn) {
                addContentBtn.classList.remove("active");
            }
        };

        const hideDownloadMenu = () => {
            if (downloadMenu) {
                downloadMenu.style.display = "none";
            }
            if (downloadSessionBtn) {
                downloadSessionBtn.classList.remove("active");
            }
        };

        const isMenuVisible = (menuEl) => {
            if (!menuEl) return false;
            return window.getComputedStyle(menuEl).display !== "none";
        };

        const positionActionMenu = (menuEl, triggerEl) => {
            if (!menuEl || !triggerEl) return;

            if (window.matchMedia("(max-width: 768px)").matches) {
                menuEl.style.left = "10px";
                menuEl.style.right = "10px";
                menuEl.style.top = "auto";
                menuEl.style.bottom = "calc(66px + var(--safe-area-bottom))";
                return;
            }

            const rect = triggerEl.getBoundingClientRect();
            menuEl.style.left = (rect.right + 8) + "px";
            menuEl.style.right = "auto";
            menuEl.style.top = (rect.top - 4) + "px";
            menuEl.style.bottom = "auto";
        };

        if (addContentBtn && contentMenu) {
            addContentBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                window.dispatchEvent(new Event("ui:close-transient-layers"));
                const isVisible = isMenuVisible(contentMenu);
                hideDownloadMenu();

                if (!isVisible) {
                    applyImportMenuCapabilities();
                    positionActionMenu(contentMenu, addContentBtn);
                    contentMenu.style.display = "block";
                    addContentBtn.classList.add("active");
                } else {
                    hideUploadMenu();
                }
            });

            document.addEventListener("click", (e) => {
                const clickedUploadArea = addContentBtn.contains(e.target) || contentMenu.contains(e.target);
                const clickedDownloadArea = downloadSessionBtn && downloadMenu
                    ? downloadSessionBtn.contains(e.target) || downloadMenu.contains(e.target)
                    : false;

                if (!clickedUploadArea) {
                    hideUploadMenu();
                }
                if (!clickedDownloadArea) {
                    hideDownloadMenu();
                }
            });

            window.addEventListener("ui:close-transient-layers", () => {
                hideUploadMenu();
                hideDownloadMenu();
            });
        }

        if (downloadSessionBtn && downloadMenu) {
            downloadSessionBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                window.dispatchEvent(new Event("ui:close-transient-layers"));
                const isVisible = isMenuVisible(downloadMenu);
                hideUploadMenu();

                if (!isVisible) {
                    applyExportMenuCapabilities();
                    positionActionMenu(downloadMenu, downloadSessionBtn);
                    downloadMenu.style.display = "block";
                    downloadSessionBtn.classList.add("active");
                } else {
                    hideDownloadMenu();
                }
            });
        }

        if (importFromFileOption && textFileInput) {
            importFromFileOption.addEventListener("click", () => {
                hideUploadMenu();
                textFileInput.click();
            });

            textFileInput.addEventListener("change", async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const session = app.sessionManager.getCurrentSession();
                        const sessionStart = session && session.startTime ? session.startTime : Date.now();
                        const result = await TextProcessor.processFile(file, sessionStart);
                        app.importTextContent(result.preciseResults, file.name, "file");
                        app.showStatusMessage(`Imported ${file.name}`, 2000);
                    } catch (error) {
                        console.error("Error processing file:", error);
                        app.showStatusMessage(`Failed to import file: ${error.message}`, 2000);
                    }
                }
                textFileInput.value = "";
            });
        }

        if (importFromTextOption) {
            importFromTextOption.addEventListener("click", () => {
                hideUploadMenu();
                app.showAddTextDialog();
            });
        }

        if (importSessionOption && importFileInput) {
            importSessionOption.addEventListener("click", () => {
                hideUploadMenu();
                importFileInput.click();
            });
        }

        if (downloadCurrentSessionOption) {
            downloadCurrentSessionOption.addEventListener("click", () => {
                hideDownloadMenu();
                app.sessionManager.exportCurrentSession();
            });
        }

        if (downloadAllSessionsOption) {
            downloadAllSessionsOption.addEventListener("click", () => {
                hideDownloadMenu();
                app.sessionManager.exportAllSessions();
            });
        }

        if (copyTranscriptOption) {
            copyTranscriptOption.addEventListener("click", async () => {
                hideDownloadMenu();

                const transcriptText = app.getCurrentSessionTranscriptText();
                if (!transcriptText.trim()) {
                    app.showStatusMessage("No transcript to copy", 1500);
                    return;
                }

                if (!supportsClipboardWrite()) {
                    app.showStatusMessage("Copy is unavailable in this browser", 1800);
                    return;
                }

                try {
                    await navigator.clipboard.writeText(transcriptText);
                    app.showStatusMessage("Transcript copied", 1500);
                } catch (error) {
                    console.error("[StreamNote] Failed to copy transcript:", error);
                    app.showStatusMessage("Failed to copy transcript", 1800);
                }
            });
        }

        if (exportTranscriptTextOption) {
            exportTranscriptTextOption.addEventListener("click", () => {
                hideDownloadMenu();
                app.sessionManager.exportTranscriptAsText();
            });
        }

        if (exportTranscriptMarkdownOption) {
            exportTranscriptMarkdownOption.addEventListener("click", () => {
                hideDownloadMenu();
                app.sessionManager.exportTranscriptAsMarkdown();
            });
        }

        window.addEventListener("resize", () => {
            applyImportMenuCapabilities();
            applyExportMenuCapabilities();
        });
        applyImportMenuCapabilities();
        applyExportMenuCapabilities();

        const editTextBtn = document.getElementById("editTextBtn");
        if (editTextBtn) {
            editTextBtn.addEventListener("click", () => {
                app.showEditTranscriptDialog();
            });
        }

        const editModalBackdrop = document.getElementById("editModalBackdrop");
        const closeEditModalBtn = document.getElementById("closeEditModal");

        const closeEditModal = () => {
            app.setEditModalVisibility(false);
            if (editTextBtn) {
                editTextBtn.classList.remove("active");
            }
        };

        if (closeEditModalBtn) {
            closeEditModalBtn.addEventListener("click", closeEditModal);
        }
        if (editModalBackdrop) {
            editModalBackdrop.addEventListener("click", (e) => {
                if (e.target === editModalBackdrop) {
                    closeEditModal();
                }
            });
        }
    }
}

window.ContentActionsListenersManager = ContentActionsListenersManager;
