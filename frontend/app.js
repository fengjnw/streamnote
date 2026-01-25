class StreamNote {
    constructor() {
        this.mediaRecorder = null;
        this.isRecording = false;
        this.preciseResults = {};
        this.chunkIndex = 0;
        this.startTime = null;
        this.audioChunks = [];
        this.durationInterval = null;

        // 停顿检测
        this.audioContext = null;
        this.analyser = null;
        this.silenceStart = null;
        this.voiceStart = null;
        this.lastSendTime = null;
        this.recordingStartTime = null;
        this.hasVoice = false;
        this.checkInterval = null;

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

            // 设置音量检测
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);
            this.analyser.fftSize = 2048;

            this.mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
            this.startTime = Date.now();
            this.lastSendTime = Date.now();
            this.recordingStartTime = Date.now();
            this.chunkIndex = 0;
            this.isRecording = true;
            this.audioChunks = [];
            this.silenceStart = null;
            this.voiceStart = null;
            this.hasVoice = false;

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    // 立即发送这个完整的音频块
                    this.sendToWhisper();
                    this.audioChunks = [];
                }
            };

            this.mediaRecorder.onstop = () => {
                // 停止时直接丢弃最后一段（通常是静音）
                if (!this.isRecording) {
                    console.log('[STOP] Discarding final chunk');
                    this.audioChunks = [];
                }
            };

            // 开始录制
            this.mediaRecorder.start();

            // 每 100ms 检测音量，停顿 600ms 或超过 10秒 就发送
            this.checkInterval = setInterval(() => {
                if (!this.isRecording) return;

                const volume = this.getVolume();
                const now = Date.now();
                const timeSinceLastSend = now - this.lastSendTime;
                const recordingDuration = now - this.recordingStartTime;

                console.log(`[VOLUME] ${volume.toFixed(3)} | Duration: ${(recordingDuration / 1000).toFixed(1)}s | HasVoice: ${this.hasVoice}`);

                if (volume < 0.025) {  // 沉默
                    this.voiceStart = null;

                    if (!this.silenceStart) {
                        this.silenceStart = now;
                        console.log('[SILENCE] Started');
                    } else if (now - this.silenceStart > 600 && recordingDuration > 1000 && this.hasVoice) {
                        // 沉默 >600ms + 录制 >1s + 有真实语音 → 发送
                        console.log('[SILENCE] 600ms detected with voice, sending...');
                        this.mediaRecorder.stop();
                        this.mediaRecorder.start();
                        this.recordingStartTime = Date.now();
                        this.hasVoice = false;
                        this.voiceStart = null;
                        this.silenceStart = null;
                    }
                } else {  // 有声音
                    this.silenceStart = null;

                    if (!this.voiceStart) {
                        this.voiceStart = now;
                        console.log('[VOICE] Start detecting...');
                    } else if (!this.hasVoice && now - this.voiceStart > 600) {
                        // 持续声音 >600ms → 确认为真实语音
                        this.hasVoice = true;
                        console.log('[VOICE] Confirmed! (>600ms)');
                    }
                }

                // 超过 10秒 + 有真实语音 → 强制发送
                if (timeSinceLastSend > 10000 && this.hasVoice) {
                    console.log('[TIMEOUT] 10s reached with voice, force sending...');
                    this.mediaRecorder.stop();
                    this.mediaRecorder.start();
                    this.recordingStartTime = Date.now();
                    this.hasVoice = false;
                    this.voiceStart = null;
                }
            }, 100);

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

            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }

            if (this.audioContext) {
                this.audioContext.close();
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

    getVolume() {
        if (!this.analyser) return 0;
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sum += normalized * normalized;
        }
        return Math.sqrt(sum / dataArray.length);
    }

    async sendToWhisper() {
        if (this.audioChunks.length === 0) {
            return;
        }

        this.lastSendTime = Date.now();
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