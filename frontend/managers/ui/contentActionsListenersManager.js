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
        const importFileInput = document.getElementById("importFileInput");
        const textFileInput = document.getElementById("textFileInput");

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

        if (addContentBtn && contentMenu) {
            addContentBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                window.dispatchEvent(new Event("ui:close-transient-layers"));
                const isVisible = isMenuVisible(contentMenu);
                hideDownloadMenu();

                if (!isVisible) {
                    const rect = addContentBtn.getBoundingClientRect();
                    contentMenu.style.left = (rect.right + 8) + "px";
                    contentMenu.style.top = (rect.top - 4) + "px";
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
                    const rect = downloadSessionBtn.getBoundingClientRect();
                    downloadMenu.style.left = (rect.right + 8) + "px";
                    downloadMenu.style.top = (rect.top - 4) + "px";
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
