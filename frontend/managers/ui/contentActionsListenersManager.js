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
        const contentMenu = document.getElementById("contentMenu");
        const importFromFileOption = document.getElementById("importFromFileOption");
        const importFromTextOption = document.getElementById("importFromTextOption");
        const textFileInput = document.getElementById("textFileInput");

        if (addContentBtn && contentMenu) {
            addContentBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const isVisible = contentMenu.style.display !== "none";

                if (!isVisible) {
                    const rect = addContentBtn.getBoundingClientRect();
                    contentMenu.style.left = (rect.right + 8) + "px";
                    contentMenu.style.top = (rect.top - 4) + "px";
                    contentMenu.style.display = "block";
                    addContentBtn.classList.add("active");
                } else {
                    contentMenu.style.display = "none";
                    addContentBtn.classList.remove("active");
                }
            });

            document.addEventListener("click", (e) => {
                if (!addContentBtn.contains(e.target) && !contentMenu.contains(e.target)) {
                    contentMenu.style.display = "none";
                    addContentBtn.classList.remove("active");
                }
            });
        }

        if (importFromFileOption && textFileInput) {
            importFromFileOption.addEventListener("click", () => {
                contentMenu.style.display = "none";
                addContentBtn.classList.remove("active");
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
                contentMenu.style.display = "none";
                addContentBtn.classList.remove("active");
                app.showAddTextDialog();
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
