

/**
 * RecordingManager - Handles audio recording, transcription, and transcript data management
 * Manages microphone access, audio chunking, voice activity detection, and streaming
 * transcription via API. Stores precise transcript results with timestamps.
 * 
 * @class
 * @example
 * const manager = new RecordingManager({
 *   apiClient: apiClientInstance,
 *   onTranscribeProgress: (data) => console.log(data)
 * });
 * await manager.start();
 */
class RecordingManager {
    /**
     * Create a new RecordingManager instance
     * @param {Object} config - Configuration object
     * @param {string} [config.transcribeApiUrl] - Transcription API endpoint (default: "/api/transcribe")
     * @param {StreamNoteApiClient} [config.apiClient] - API client for requests
     * @param {Function} [config.onTranscribeProgress] - Callback for transcription progress updates
     * @param {Function} [config.onStatusUpdate] - Callback for status messages
     * @param {Function} [config.onRecordingStateChange] - Callback for recording state changes
     */
    constructor(config = {}) {
        this.mediaRecorder = null;
        this.isRecording = false;
        this.audioChunks = [];

        this.audioContext = null;
        this.analyser = null;
        this.silenceStart = null;
        this.voiceStart = null;
        this.lastSendTime = null;
        this.recordingStartTime = null;
        this.hasVoice = false;
        this.checkInterval = null;

        this.startTime = null;
        this.chunkIndex = 0;
        this.preciseResults = {};
        this.statsUpdateInterval = null;
        this.isTranscribing = false;

        this.sessionStartTime = null;

        this.transcriptionContext = "";

        this.transcribeApiUrl = config.transcribeApiUrl || "/api/transcribe";
        this.apiClient = config.apiClient || null;
        this.onTranscribeProgress = config.onTranscribeProgress || (() => { });
        this.onStatusUpdate = config.onStatusUpdate || (() => { });
        this.onRecordingStateChange = config.onRecordingStateChange || (() => { });
    }

    setSessionStartTime(sessionStartTimeMs) {
        this.sessionStartTime = sessionStartTimeMs || Date.now();
    }

    async start(sessionId = null, source = "microphone") {
        try {
            let stream = null;

            if (source === "tab") {
                if (!navigator.mediaDevices?.getDisplayMedia) {
                    throw new Error("display-media-unsupported");
                }

                const displayStream = await navigator.mediaDevices.getDisplayMedia({
                    audio: true,
                    video: true
                });

                const audioTracks = displayStream.getAudioTracks();
                if (!audioTracks.length) {
                    displayStream.getTracks().forEach((track) => track.stop());
                    throw new Error("display-audio-unavailable");
                }

                displayStream.getVideoTracks().forEach((track) => track.stop());
                stream = new MediaStream(audioTracks);
            } else {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            const mediaSource = this.audioContext.createMediaStreamSource(stream);
            mediaSource.connect(this.analyser);
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

            this.checkInterval = setInterval(() => {
                this._checkSilenceAndSend();
            }, 100);

            this.onStatusUpdate("Listening...");
            this.onRecordingStateChange(true);

            if (this.statsUpdateInterval) clearInterval(this.statsUpdateInterval);
            this.statsUpdateInterval = setInterval(() => {
                if (this.isRecording && !this.isTranscribing) {
                    this.onStatusUpdate("Listening...");
                }
            }, 1000);

        } catch (error) {
            const isTabSource = source === "tab";
            const statusMessage = isTabSource
                ? "Tab audio access failed"
                : "Microphone access denied";
            console.error("[ERROR] Recording access:", error);
            this.onStatusUpdate(statusMessage);
        }
    }

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

            this.onStatusUpdate("");
            this.onRecordingStateChange(false);
        }
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

    /**
     * @private
     */
    _checkSilenceAndSend() {
        if (!this.isRecording) return;

        const volume = this.getVolume();
        const now = Date.now();
        const timeSinceLastSend = now - this.lastSendTime;
        const recordingDuration = now - this.recordingStartTime;

        // Chunk policy: send on sustained silence, or force flush every 10s if speech exists.
        if (volume < 0.015) {
            this.voiceStart = null;

            if (!this.silenceStart) {
                this.silenceStart = now;
            } else if (now - this.silenceStart > 600 && recordingDuration > 100 && this.hasVoice) {
                this.mediaRecorder.stop();
                this.mediaRecorder.start();
                this.recordingStartTime = Date.now();
                this.lastSendTime = Date.now();
                this.hasVoice = false;
                this.voiceStart = null;
                this.silenceStart = null;
            }
        } else {
            this.silenceStart = null;

            if (!this.voiceStart) {
                this.voiceStart = now;
            } else if (!this.hasVoice && now - this.voiceStart > 150) {
                this.hasVoice = true;
            }
        }

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

        if (this.transcriptionContext) {
            formData.append("context", this.transcriptionContext);
        }

        // Reserve index before async call to avoid collisions between overlapping requests.
        const currentChunkIndex = this.chunkIndex;
        this.chunkIndex += 1;
        const sessionIdAtRequest = sessionId;

        const app = window.streamNoteInstance;
        const displaySessionIdAtRequest = app ? app.displaySessionId : sessionIdAtRequest;

        this.isTranscribing = true;
        this.onStatusUpdate("Transcripting...");

        try {
            const response = this.apiClient
                ? await this.apiClient.transcribe(formData)
                : await fetch(this.transcribeApiUrl, {
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

            this.isTranscribing = false;

            const sessionStart = this.sessionStartTime || Date.now();
            const relativeSeconds = Math.floor((Date.now() - sessionStart) / 1000);
            const timestamp = relativeSeconds;

            if (!text) {
                this.onTranscribeProgress({
                    index: currentChunkIndex,
                    text: "",
                    timestamp: timestamp,
                    sessionId: sessionIdAtRequest
                });
                if (!this.isRecording) {
                    this.onStatusUpdate("");
                }
                return;
            }

            // Discard results if user switched session while request was in flight.
            if (app && app.displaySessionId !== displaySessionIdAtRequest) {
                console.log(`[RecordingManager] Session changed from ${displaySessionIdAtRequest} to ${app.displaySessionId}, discarding transcription result`);
                return;
            }

            this.preciseResults[currentChunkIndex] = { text, timestamp };

            this.onTranscribeProgress({
                index: currentChunkIndex,
                text: text,
                timestamp: timestamp,
                sessionId: sessionIdAtRequest
            });

            if (this.isRecording) {
                this.onStatusUpdate("Listening...");
            } else {
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

    clear() {
        this.preciseResults = {};
        this.chunkIndex = 0;
    }

    getTranscriptData() {
        return { ...this.preciseResults };
    }

    setTranscriptData(data) {
        this.preciseResults = { ...data };
        this.chunkIndex = Object.keys(this.preciseResults).length;
    }

    setTranscriptionContext(context) {
        this.transcriptionContext = context || "";
    }

    getTranscriptionContext() {
        return this.transcriptionContext;
    }

    isTranscribingActive() {
        return this.isTranscribing;
    }
}

window.RecordingManager = RecordingManager;
