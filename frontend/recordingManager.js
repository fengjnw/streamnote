/**
 * 录音管理器 - 前端模块
 * 负责音频录制、转录、音量检测、停顿检测
 */

class RecordingManager {
    constructor(config = {}) {
        this.mediaRecorder = null;
        this.isRecording = false;
        this.audioChunks = [];

        // 音量检测
        this.audioContext = null;
        this.analyser = null;
        this.silenceStart = null;
        this.voiceStart = null;
        this.lastSendTime = null;
        this.recordingStartTime = null;
        this.hasVoice = false;
        this.checkInterval = null;

        // 状态
        this.startTime = null;
        this.chunkIndex = 0;
        this.preciseResults = {};
        this.statsUpdateInterval = null;
        this.isTranscribing = false;  // 转录状态标志

        // Session 相关
        this.sessionStartTime = null;  // 用于计算相对时间戳的参考点（毫秒）

        // 转录上下文 - 用于Whisper的prompt参数，帮助提高准确率
        this.transcriptionContext = "";

        // API 和回调
        this.transcribeApiUrl = config.transcribeApiUrl || "/api/transcribe";
        this.onTranscribeProgress = config.onTranscribeProgress || (() => { });
        this.onStatusUpdate = config.onStatusUpdate || (() => { });
        this.onRecordingStateChange = config.onRecordingStateChange || (() => { });
    }

    /**
     * 设置session开始时间（用于计算相对时间戳）
     */
    setSessionStartTime(sessionStartTimeMs) {
        this.sessionStartTime = sessionStartTimeMs || Date.now();
    }

    /**
     * 开始录音
     */
    async start(sessionId = null) {
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

            if (Object.keys(this.preciseResults).length === 0) {
                this.chunkIndex = 0;
            } else {
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
                    this.submitForTranscription(sessionId);
                    this.audioChunks = [];
                }
            };

            this.mediaRecorder.onstop = () => {
                if (!this.isRecording) {
                    this.audioChunks = [];
                }
            };

            this.mediaRecorder.start();

            // 每 100ms 检测音量，停顿 600ms 或超过 10秒 就发送
            this.checkInterval = setInterval(() => {
                this._checkSilenceAndSend();
            }, 100);

            this.onStatusUpdate("Listening...");
            this.onRecordingStateChange(true);

            // 每秒更新统计信息（当不在转录中时）
            if (this.statsUpdateInterval) clearInterval(this.statsUpdateInterval);
            this.statsUpdateInterval = setInterval(() => {
                if (this.isRecording && !this.isTranscribing) {
                    this.onStatusUpdate("Listening...");
                }
            }, 1000);

        } catch (error) {
            console.error("[ERROR] Microphone access:", error);
            this.onStatusUpdate("Microphone access denied");
        }
    }

    /**
     * 停止录音
     */
    stop() {
        if (this.mediaRecorder && this.isRecording) {
            this.isRecording = false;
            this.isTranscribing = false;

            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }

            if (this.statsUpdateInterval) {
                clearInterval(this.statsUpdateInterval);
                this.statsUpdateInterval = null;
            }

            if (this.audioContext) {
                this.audioContext.close();
            }

            this.mediaRecorder.stop();

            if (this.mediaRecorder.stream) {
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }

            this.onStatusUpdate("");  // 清除状态显示
            this.onRecordingStateChange(false);
        }
    }

    /**
     * 获取当前音量
     */
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

    /**
     * 检测停顿和发送音频
     * @private
     */
    _checkSilenceAndSend() {
        if (!this.isRecording) return;

        const volume = this.getVolume();
        const now = Date.now();
        const timeSinceLastSend = now - this.lastSendTime;
        const recordingDuration = now - this.recordingStartTime;

        if (volume < 0.015) {  // 沉默
            this.voiceStart = null;

            if (!this.silenceStart) {
                this.silenceStart = now;
            } else if (now - this.silenceStart > 600 && recordingDuration > 100 && this.hasVoice) {
                // 沉默 >600ms + 录制 >100ms + 有真实语音 → 发送
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
            } else if (!this.hasVoice && now - this.voiceStart > 150) {
                // 持续声音 >150ms → 确认为真实语音
                this.hasVoice = true;
            }
        }

        // 超过 10秒 + 有真实语音 → 强制发送
        if (timeSinceLastSend > 10000 && this.hasVoice) {
            this.mediaRecorder.stop();
            this.mediaRecorder.start();
            this.recordingStartTime = Date.now();
            this.lastSendTime = Date.now();
            this.hasVoice = false;
            this.voiceStart = null;
            this.silenceStart = null;
        }
    }

    /**
     * 发送音频到 Whisper API
     * @private
     */
    async submitForTranscription(sessionId = null) {
        if (this.audioChunks.length === 0) {
            return;
        }

        this.lastSendTime = Date.now();
        const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", audioBlob, "audio.webm");

        // 添加上下文信息作为prompt参数，帮助Whisper更准确地转录
        if (this.transcriptionContext) {
            formData.append("context", this.transcriptionContext);
        }

        // 关键修复：立即分配并增加 index，防止并发请求争用同一个 index
        const currentChunkIndex = this.chunkIndex;
        this.chunkIndex += 1;
        const sessionIdAtRequest = sessionId;

        // 显示转录进行中的状态
        this.isTranscribing = true;
        this.onStatusUpdate("Transcripting...");

        try {
            const response = await fetch(this.transcribeApiUrl, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                console.error(`[ERROR] API error: ${response.status}`);
                this.isTranscribing = false;
                if (this.isRecording) {
                    this.onStatusUpdate("Listening...");
                }
                return;
            }

            const result = await response.json();
            const text = result.text.trim();

            // 转录完成，回到监听状态（在通知上层之前设置）
            this.isTranscribing = false;

            // 计算相对于session开始时间的秒数
            const sessionStart = this.sessionStartTime || Date.now();
            const relativeSeconds = Math.floor((Date.now() - sessionStart) / 1000);
            const timestamp = relativeSeconds;

            if (!text) {
                // 即使没有文本，也要通知上层刷新UI（特别是当停止录音时）
                this.onTranscribeProgress({
                    index: currentChunkIndex,
                    text: "",
                    timestamp: timestamp,
                    sessionId: sessionIdAtRequest
                });
                // 清除转录进行中的状态
                if (!this.isRecording) {
                    this.onStatusUpdate("");
                }
                return;
            }

            this.preciseResults[currentChunkIndex] = { text, timestamp };

            // 触发回调，通知上层更新显示
            this.onTranscribeProgress({
                index: currentChunkIndex,
                text: text,
                timestamp: timestamp,
                sessionId: sessionIdAtRequest
            });

            // 恢复监听状态 - 只有在还在录音时才显示"Listening"
            if (this.isRecording) {
                this.onStatusUpdate("Listening...");
            } else {
                // 停止录音后，清除"Transcripting"状态
                this.onStatusUpdate("");
            }

        } catch (error) {
            console.error("[ERROR] Whisper request failed:", error);
            this.isTranscribing = false;
            if (this.isRecording) {
                this.onStatusUpdate("Listening...");
            }
        }
    }

    /**
     * 清除所有数据
     */
    clear() {
        this.preciseResults = {};
        this.chunkIndex = 0;
    }

    /**
     * 获取当前转录数据
     */
    getTranscriptData() {
        return { ...this.preciseResults };
    }

    /**
     * 更新转录数据（用于加载 session）
     */
    setTranscriptData(data) {
        this.preciseResults = { ...data };
        this.chunkIndex = Object.keys(this.preciseResults).length;
    }

    /**
     * 设置转录上下文 - 用于提高转录准确率
     * 上下文会作为prompt参数传递给转录API
     * 仅用作hint，不应出现在转录结果中
     */
    setTranscriptionContext(context) {
        this.transcriptionContext = context || "";
    }

    /**
     * 获取转录上下文
     */
    getTranscriptionContext() {
        return this.transcriptionContext;
    }

    /**
     * 获取转录状态
     */
    isTranscribingActive() {
        return this.isTranscribing;
    }
}
