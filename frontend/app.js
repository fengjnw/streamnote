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

        // 关键词提取器
        this.keywordExtractor = null;
        this.currentTranscriptText = "";

        // Session 管理器
        this.sessionManager = null;

        this.initSessionManager();
        this.setupUIListeners();
        this.initKeywordExtractor();
        this.loadCurrentSession();
    }

    /**
     * 初始化 Session 管理器
     */
    initSessionManager() {
        this.sessionManager = new SessionManager();

        // 监听 session 切换事件
        window.addEventListener('sessionChanged', (e) => {
            console.log('[StreamNote] Session changed:', e.detail.sessionId);
            this.loadCurrentSession();
        });

        console.log('[StreamNote] SessionManager initialized');
    }

    /**
     * 加载当前 session 的数据
     */
    loadCurrentSession() {
        const session = this.sessionManager.getCurrentSession();
        if (!session) return;

        // 停止当前录制
        if (this.isRecording) {
            this.stop();
        }

        // 加载转录内容
        this.preciseResults = { ...session.transcripts };
        this.chunkIndex = Object.keys(this.preciseResults).length;

        // 更新显示
        this.updateDisplay();

        // 重置关键词
        if (this.keywordExtractor) {
            this.keywordExtractor.reset();
            // 如果有保存的关键词，恢复它们
            if (session.keywords && session.keywords.length > 0) {
                this.keywordExtractor.allCollectedKeywords = [...session.keywords];
            }
            this.processKeywords();
        }

        console.log(`[StreamNote] Loaded session: ${session.name}`);
        this.updateStatus(`Loaded: ${session.name}`);
    }

    /**
     * 保存当前数据到 session
     */
    saveToSession() {
        if (!this.sessionManager) return;

        this.sessionManager.updateCurrentTranscripts(this.preciseResults);

        // 保存关键词
        if (this.keywordExtractor && this.keywordExtractor.allCollectedKeywords) {
            this.sessionManager.updateCurrentKeywords(this.keywordExtractor.allCollectedKeywords);
        }
    }

    /**
     * 初始化关键词提取器
     */
    initKeywordExtractor() {
        this.keywordExtractor = new KeywordExtractor({
            apiUrl: "http://localhost:5001/api/extract-keywords",
            transcriptElement: document.getElementById("transcript"),
            keywordElement: document.getElementById("keywords-display"),
            topK: 5
        });

        // 绑定开关
        const toggleCheckbox = document.getElementById("keyword-toggle");
        if (toggleCheckbox) {
            toggleCheckbox.addEventListener("change", (e) => {
                this.keywordExtractor.setEnabled(e.target.checked);
                if (e.target.checked) {
                    // 重新高亮
                    this.keywordExtractor.reHighlightElement();
                }
            });
        }

        // 绑定强度滑块
        const intensitySlider = document.getElementById("keyword-intensity");
        const intensityValue = document.getElementById("intensity-value");
        if (intensitySlider) {
            intensitySlider.addEventListener("input", async (e) => {
                const intensity = parseInt(e.target.value);
                this.keywordExtractor.setIntensity(intensity);
                if (intensityValue) {
                    intensityValue.textContent = intensity;
                }
                // 强度改变时，清除已有的关键词并重新识别（确保一致性）
                this.keywordExtractor.allCollectedKeywords = [];
                this.keywordExtractor.clearHighlights(document.getElementById("transcript"));
                await this.processKeywords();
            });
        }

        console.log("[StreamNote] KeywordExtractor initialized");
    }

    setupUIListeners() {
        document.getElementById("startBtn").addEventListener("click", () => this.start());
        document.getElementById("stopBtn").addEventListener("click", () => this.stop());
        document.getElementById("clearBtn").addEventListener("click", () => this.clear());

        // 添加keywords面板toggle
        const toggleBtn = document.getElementById("keywords-panel-toggle");
        const mainContent = document.querySelector(".main-content");
        const keywordsContainer = document.querySelector(".keywords-container-main");

        if (toggleBtn && mainContent && keywordsContainer) {
            toggleBtn.addEventListener("click", () => {
                mainContent.classList.toggle("keywords-hidden");
                keywordsContainer.classList.toggle("hidden");
                // 切换按钮文字
                toggleBtn.textContent = mainContent.classList.contains("keywords-hidden") ? "☷" : "☰";
            });
        }
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
            // 只在第一次或清空后重置 chunkIndex，继续录制时保留
            if (Object.keys(this.preciseResults).length === 0) {
                this.chunkIndex = 0;
            } else {
                // 继续录制：chunkIndex 继续从上次结束的地方开始
                this.chunkIndex = Math.max(...Object.keys(this.preciseResults).map(Number)) + 1;
            }
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

                if (volume < 0.015) {  // 沉默（降低阈值，避免噪音干扰）
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
                        this.lastSendTime = Date.now();
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
                    this.lastSendTime = Date.now();
                    this.hasVoice = false;
                    this.voiceStart = null;
                    this.silenceStart = null;
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
        this.currentTranscriptText = "";
        this.updateDisplay();
        if (this.keywordExtractor) {
            this.keywordExtractor.reset();
        }
        this.updateStatus("Cleared");

        // 保存到当前 session
        this.saveToSession();
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
                const timestamp = new Date().toLocaleTimeString('zh-CN', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                this.preciseResults[this.chunkIndex] = { text, timestamp };
                this.chunkIndex += 1;
                this.updateDisplay();

                // 自动保存到当前 session
                this.saveToSession();

                // 处理关键词提取
                this.processKeywords();
            }

        } catch (error) {
            console.error("[ERROR] Whisper request failed:", error);
        }
    }

    updateDisplay() {
        const transcriptDiv = document.getElementById("transcript");

        const formattedLines = Object.values(this.preciseResults).map(item => {
            if (!item || !item.text) return null;

            const text = item.text.trim();
            const timestamp = item.timestamp || new Date().toLocaleTimeString('zh-CN', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            return `<p>[${timestamp}] ${text}</p>`;
        }).filter(line => line !== null);

        if (formattedLines.length > 0) {
            transcriptDiv.innerHTML = formattedLines.join('');
        } else {
            transcriptDiv.innerHTML = '<p class="placeholder">Press "Start Recording" to begin...</p>';
        }
        transcriptDiv.scrollTop = transcriptDiv.scrollHeight;

        // 在更新HTML后，立即重新应用所有已收集的关键词高亮
        if (this.keywordExtractor && this.keywordExtractor.allCollectedKeywords.length > 0) {
            setTimeout(() => {
                this.keywordExtractor.reHighlightElement(transcriptDiv);
            }, 0);
        }
    }

    updateStatus(text) {
        document.getElementById("status").textContent = text;
    }

    /**
     * 处理关键词提取 - 基于整个转录文本
     */
    async processKeywords() {
        if (!this.keywordExtractor) return;

        // 收集所有转录文本（保证准确率）
        this.currentTranscriptText = Object.values(this.preciseResults)
            .map(item => item && item.text ? item.text : "")
            .join(" ");

        if (this.currentTranscriptText.length > 10) {
            console.log(`[StreamNote] Processing full text for keywords: "${this.currentTranscriptText.substring(0, 50)}..."`);

            // 获取转录div元素
            const transcriptDiv = document.getElementById("transcript");
            // 基于整个文本提取关键词，应用到当前div
            await this.keywordExtractor.processText(this.currentTranscriptText, transcriptDiv);
        }
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