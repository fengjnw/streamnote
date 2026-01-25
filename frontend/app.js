class StreamNote {
    constructor() {
        this.mediaRecorder = null;
        this.isRecording = false;
        this.preciseResults = {};
        this.chunkIndex = 0;
        this.startTime = null;
        this.audioChunks = [];
        this.sendInterval = null;
        this.durationInterval = null;

        this.setupUIListeners();
    }

    setupUIListeners() {
        document.getElementById("startBtn").addEventListener("click", () => this.start());
        document.getElementById("stopBtn").addEventListener("click", () => this.stop());
        document.getElementById("clearBtn").addEventListener("click", () => this.clear());
    }

    async start() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            this.mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
            this.startTime = Date.now();
            this.chunkIndex = 0;
            this.isRecording = true;
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    // 立即发送这个完整的音频块
                    this.sendToWhisper();
                    this.audioChunks = [];
                }
            };

            this.mediaRecorder.onstop = () => {
                // 如果是真正的停止（不是间隔停止），处理剩余音频
                if (!this.isRecording && this.audioChunks.length > 0) {
                    this.sendToWhisper();
                    this.audioChunks = [];
                }
            };

            // 每 3 秒停止并重新开始录制，确保每个块都是完整的音频文件
            this.mediaRecorder.start();

            this.sendInterval = setInterval(() => {
                if (this.isRecording) {
                    // 停止当前录制，触发 ondataavailable
                    this.mediaRecorder.stop();
                    // 立即重新开始新的录制
                    this.mediaRecorder.start();
                }
            }, 3000);

            document.getElementById("startBtn").disabled = true;
            document.getElementById("stopBtn").disabled = false;
            this.updateStatus("Recording...");
            this.startDurationUpdate();

        } catch (error) {
            console.error("[ERROR] Microphone access:", error);
            this.updateStatus("Microphone access denied");
        }
    }

    stop() {
        if (this.mediaRecorder && this.isRecording) {
            this.isRecording = false;

            if (this.sendInterval) {
                clearInterval(this.sendInterval);
                this.sendInterval = null;
            }

            this.mediaRecorder.stop();

            if (this.mediaRecorder.stream) {
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }

            document.getElementById("startBtn").disabled = false;
            document.getElementById("stopBtn").disabled = true;
            this.updateStatus("Stopped");

            if (this.durationInterval) {
                clearInterval(this.durationInterval);
            }
        }
    }

    clear() {
        this.preciseResults = {};
        this.chunkIndex = 0;
        this.updateDisplay();
        this.updateStatus("Cleared");
    }

    async sendToWhisper() {
        if (this.audioChunks.length === 0) {
            return;
        }

        const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", audioBlob, "audio.webm");

        try {
            const response = await fetch("http://localhost:5001/api/transcribe", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                console.error(`[ERROR] API error: ${response.status}`);
                return;
            }

            const result = await response.json();
            const text = result.text.trim();

            if (text) {
                console.log("[WHISPER]", text);
                this.preciseResults[this.chunkIndex] = text;
                this.chunkIndex += 1;
                this.updateDisplay();
            }

        } catch (error) {
            console.error("[ERROR] Whisper request failed:", error);
        }
    }

    updateDisplay() {
        const allText = Object.values(this.preciseResults).join(" ").trim();

        const transcriptDiv = document.getElementById("transcript");
        if (allText) {
            transcriptDiv.innerHTML = `<p>${allText}</p>`;
        } else {
            transcriptDiv.innerHTML = '<p class="placeholder">Press "Start Recording" to begin...</p>';
        }
        transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
    }

    updateStatus(text) {
        document.getElementById("status").textContent = text;
    }

    startDurationUpdate() {
        this.durationInterval = setInterval(() => {
            if (this.isRecording) {
                const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                document.getElementById("duration").textContent =
                    `Duration: ${minutes}:${seconds.toString().padStart(2, "0")}`;
            }
        }, 1000);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new StreamNote();
});