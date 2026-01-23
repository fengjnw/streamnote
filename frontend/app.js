class StreamNote {
    constructor() {
        this.socket = io("http://localhost:5001");
        this.audioContext = null;
        this.mediaRecorder = null;
        this.isRecording = false;
        this.chunkIndex = 0;
        this.startTime = null;
        this.fastResults = {};
        this.preciseResults = {};

        this.setupSocketListeners();
        this.setupUIListeners();
    }

    setupSocketListeners() {
        this.socket.on("connect", () => {
            console.log("[CONNECT] Connected to server");
            this.updateStatus("Connected");
        });

        this.socket.on("disconnect", () => {
            console.log("[DISCONNECT] Disconnected from server");
            this.updateStatus("Disconnected");
        });

        this.socket.on("fast_result", (data) => {
            console.log("[FAST]", data.text);
            this.fastResults[data.chunk_index] = data.text;
            this.updateDisplay();
        });

        this.socket.on("precise_result", (data) => {
            console.log("[PRECISE]", data.text);
            this.preciseResults[data.chunk_index] = data.text;
            this.updateDisplay();
        });
    }

    setupUIListeners() {
        document.getElementById("startBtn").addEventListener("click", () => this.start());
        document.getElementById("stopBtn").addEventListener("click", () => this.stop());
        document.getElementById("clearBtn").addEventListener("click", () => this.clear());
    }

    async start() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            this.mediaRecorder = new MediaRecorder(stream);
            this.startTime = Date.now();
            this.chunkIndex = 0;
            this.isRecording = true;

            const audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
                this.sendAudioChunk(audioBlob, this.chunkIndex, true, true);
                audioChunks.length = 0;
            };

            this.mediaRecorder.start(2000);

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
            this.mediaRecorder.stop();
            this.isRecording = false;

            document.getElementById("startBtn").disabled = false;
            document.getElementById("stopBtn").disabled = true;
            this.updateStatus("Stopped");
        }
    }

    clear() {
        this.fastResults = {};
        this.preciseResults = {};
        this.chunkIndex = 0;
        this.updateDisplay();
        this.updateStatus("Cleared");
    }

    sendAudioChunk(blob, index, isCheckpoint, isFinal) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const audioData = new Uint8Array(event.target.result);
            this.socket.emit("audio_chunk", {
                audio: Array.from(audioData),
                chunk_index: index,
                is_checkpoint: isCheckpoint,
                is_final: isFinal,
            });
            console.log(`[SEND] Chunk ${index}`);
        };
        reader.readAsArrayBuffer(blob);
    }

    updateDisplay() {
        const precise = Object.values(this.preciseResults).join(" ");
        const fast = Object.values(this.fastResults).join(" ");

        const transcriptDiv = document.getElementById("transcript");
        if (precise) {
            transcriptDiv.innerHTML = `<p>${precise}</p><p class="temporary">${fast}</p>`;
        } else if (fast) {
            transcriptDiv.innerHTML = `<p class="temporary">${fast}</p>`;
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