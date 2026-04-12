/**
 * ModalManager - manages modal visibility and overlay state.
 */
class ModalManager {
    constructor(config = {}) {
        this.overlayId = config.overlayId || "modalOverlay";
        this.openModals = new Set();
        this.buttonResolver = config.buttonResolver || (() => null);
    }

    toggle(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        if (modal.style.display === "none" || modal.style.display === "") {
            this.open(modalId);
        } else {
            this.close(modalId);
        }
    }

    open(modalId) {
        const modal = document.getElementById(modalId);
        const overlay = document.getElementById(this.overlayId);
        const button = this.buttonResolver(modalId);

        if (!modal) return;

        if (this.openModals.size > 0) {
            this.openModals.forEach((id) => {
                if (id !== modalId) {
                    const otherModal = document.getElementById(id);
                    const otherButton = this.buttonResolver(id);
                    if (otherModal) {
                        otherModal.style.display = "none";
                        if (otherButton) {
                            otherButton.classList.remove("active");
                        }
                    }
                }
            });
            this.openModals.clear();
        }

        if (overlay) {
            overlay.style.display = "block";
            overlay.onclick = () => this.close(modalId);
        }

        modal.style.display = "flex";
        this.openModals.add(modalId);

        if (button) {
            button.classList.add("active");
        }

        document.body.style.overflow = "hidden";
    }

    close(modalId) {
        const modal = document.getElementById(modalId);
        const overlay = document.getElementById(this.overlayId);
        const button = this.buttonResolver(modalId);

        if (!modal) return;

        modal.style.display = "none";
        this.openModals.delete(modalId);

        if (button) {
            button.classList.remove("active");
        }

        if (this.openModals.size === 0) {
            if (overlay) {
                overlay.style.display = "none";
                overlay.onclick = null;
            }
            document.body.style.overflow = "auto";
        }
    }

    closeAll() {
        const openModalsCopy = Array.from(this.openModals);
        openModalsCopy.forEach((modalId) => {
            this.close(modalId);
        });
    }
}

window.ModalManager = ModalManager;
