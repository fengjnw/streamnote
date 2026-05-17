/**
 * StreamNoteEvaluationManager - lightweight technical evaluation harness.
 *
 * It plays lecture audio in the browser, routes that playback into the existing
 * RecordingManager, and measures the normal transcription/AI workflow.
 */
class StreamNoteEvaluationManager {
    constructor(app, config = {}) {
        this.app = app;
        this.lectures = config.lectures || window.StreamNoteEvaluationLectures || [];
        this.externalStopwords = new Set(config.stopwords || []);
        this.genericKeywords = new Set([
            "thing",
            "people",
            "part",
            "system",
            "process",
            "information",
            "issue",
            "example"
        ]);
        this.referenceConceptStopwords = new Set([
            ...StreamNoteEvaluationManager.DEFAULT_ENGLISH_STOPWORDS,
            ...this.genericKeywords
        ]);
        this.resetRunMetrics();
    }

    resetRunMetrics() {
        this.metrics = {
            apiTotal: 0,
            apiSuccessful: 0,
            pendingTranslations: 0,
            uncaughtErrors: 0,
            evaluationStart: null,
            evaluationEnd: null
        };
        this.activeLectureMetrics = null;
    }

    createLectureMetrics() {
        return {
            chunkRequests: new Map(),
            chunkLatencies: [],
            failedChunks: 0,
            completedChunks: new Set(),
            emptyChunks: 0,
            translationLatencies: [],
            translationRequests: 0,
            failedTranslations: 0,
            explanationLatencies: [],
            explanationRequests: 0,
            failedExplanations: 0
        };
    }

    async run(options = {}) {
        const selectedLectures = options.lectures || this.lectures.slice(0, 2);
        if (!selectedLectures.length) {
            console.warn("[Evaluation] No lecture fixtures configured.");
            return null;
        }

        this.resetRunMetrics();
        this.metrics.evaluationStart = performance.now();
        const cleanup = this.installObservers();
        const results = [];

        try {
            for (const lecture of selectedLectures) {
                results.push(await this.evaluateLecture(lecture));
            }
        } finally {
            cleanup();
            this.metrics.evaluationEnd = performance.now();
        }

        const aggregate = this.aggregateResults(results);
        this.printReport(aggregate);
        return aggregate;
    }

    installObservers() {
        const originalRequest = this.app.apiClient?.request?.bind(this.app.apiClient);
        const originalTranslateText = this.app.translationManager?.translateText?.bind(this.app.translationManager);
        const previousChunkRequest = this.app.recordingManager.onChunkRequest;
        const previousChunkResponse = this.app.recordingManager.onChunkResponse;
        const previousChunkError = this.app.recordingManager.onChunkError;

        const onWindowError = () => {
            this.metrics.uncaughtErrors += 1;
        };
        const onUnhandledRejection = () => {
            this.metrics.uncaughtErrors += 1;
        };

        if (originalRequest) {
            this.app.apiClient.request = async (...args) => {
                this.metrics.apiTotal += 1;
                const response = await originalRequest(...args);
                if (response && response.ok) {
                    this.metrics.apiSuccessful += 1;
                } else if (typeof args[0] === "string" && args[0].includes("/api/translate")) {
                    if (this.activeLectureMetrics) {
                        this.activeLectureMetrics.failedTranslations += 1;
                    }
                }
                return response;
            };
        }

        if (originalTranslateText) {
            this.app.translationManager.translateText = async (...args) => {
                const started = performance.now();
                const lectureMetrics = this.activeLectureMetrics;
                if (lectureMetrics) {
                    lectureMetrics.translationRequests += 1;
                }
                this.metrics.pendingTranslations += 1;
                try {
                    const result = await originalTranslateText(...args);
                    if (lectureMetrics) {
                        lectureMetrics.translationLatencies.push(performance.now() - started);
                    }
                    return result;
                } catch (error) {
                    if (lectureMetrics) {
                        lectureMetrics.failedTranslations += 1;
                    }
                    throw error;
                } finally {
                    this.metrics.pendingTranslations = Math.max(0, this.metrics.pendingTranslations - 1);
                }
            };
        }

        this.app.recordingManager.onChunkRequest = (event) => {
            previousChunkRequest(event);
            this.activeLectureMetrics?.chunkRequests.set(event.index, performance.now());
        };
        this.app.recordingManager.onChunkResponse = (event) => {
            previousChunkResponse(event);
            const lectureMetrics = this.activeLectureMetrics;
            if (!lectureMetrics) {
                return;
            }
            const started = lectureMetrics.chunkRequests.get(event.index);
            if (started) {
                lectureMetrics.chunkLatencies.push(performance.now() - started);
            }
            lectureMetrics.completedChunks.add(event.index);
            if (!event.text) {
                lectureMetrics.emptyChunks += 1;
            }
        };
        this.app.recordingManager.onChunkError = (event) => {
            previousChunkError(event);
            if (this.activeLectureMetrics) {
                this.activeLectureMetrics.failedChunks += 1;
            }
        };

        window.addEventListener("error", onWindowError);
        window.addEventListener("unhandledrejection", onUnhandledRejection);

        return () => {
            if (originalRequest) {
                this.app.apiClient.request = originalRequest;
            }
            if (originalTranslateText) {
                this.app.translationManager.translateText = originalTranslateText;
            }
            this.app.recordingManager.onChunkRequest = previousChunkRequest;
            this.app.recordingManager.onChunkResponse = previousChunkResponse;
            this.app.recordingManager.onChunkError = previousChunkError;
            window.removeEventListener("error", onWindowError);
            window.removeEventListener("unhandledrejection", onUnhandledRejection);
        };
    }

    async evaluateLecture(lecture) {
        console.log(`[Evaluation] Starting ${lecture.title || lecture.id}`);
        const lectureMetrics = this.createLectureMetrics();
        const referenceText = await this.loadReferenceText(lecture);
        this.activeLectureMetrics = lectureMetrics;
        const sessionId = this.app.sessionManager.createNewSession(`Evaluation - ${lecture.title || lecture.id}`);
        this.app.recordingSessionId = sessionId;
        this.app.displaySessionId = sessionId;
        this.app.recordingManager.clear();
        this.app.translationManager.clear();
        this.app.keywordManager.reset();
        this.app.summaryCache = {};
        this.app.translationEnabled = true;
        this.app.translationManager.setEnabled(true);
        this.app.recordingControlManager?.setRecordingUiEnabled(false);
        this.app.recordingControlManager?.updateRecordingButtonState();

        let playback = null;
        let transcript = "";
        let keywordsResult = { keywords: [], latency: 0, genericRatio: 0, transcriptPresenceRate: 0 };
        let explanationResult = { averageLatency: 0, failedCount: 0 };
        let summaryResult = { summary: "", latency: 0, compressionRatio: 0, detectedConcepts: 0, expectedConcepts: lecture.expectedConcepts?.length || 0 };

        try {
            playback = await this.createPlaybackStream(lecture.audioUrl);
            this.app.recordingManager.setSessionStartTime(Date.now());
            await this.app.recordingManager.startWithStream(playback.stream, sessionId);
            await playback.play();
            await this.waitForAudioEnd(playback.audio);
            this.stopEvaluationRecording();
            await this.waitForIdle();

            transcript = this.getTranscriptText();
            keywordsResult = await this.evaluateKeywords(transcript);
            explanationResult = await this.evaluateExplanations(keywordsResult.keywords, transcript);
            summaryResult = await this.evaluateSummary(transcript, this.getExpectedConcepts(lecture, referenceText));
        } finally {
            this.stopEvaluationRecording();
            if (playback) {
                playback.cleanup();
            }
            this.activeLectureMetrics = null;
        }

        const wer = this.calculateWer(referenceText, transcript);
        const computedMetrics = this.buildLectureMetrics(lectureMetrics, keywordsResult, explanationResult, summaryResult, wer);

        return {
            lecture,
            transcript,
            referenceText,
            wer,
            keywords: keywordsResult,
            explanations: explanationResult,
            summary: summaryResult,
            metrics: computedMetrics
        };
    }

    stopEvaluationRecording() {
        if (this.app.recordingManager?.isRecording) {
            this.app.recordingControlManager?.stop(true);
        } else {
            this.app.recordingSessionId = null;
            this.app.updateRecordingIndicator?.();
            this.app.recordingControlManager?.setRecordingUiEnabled(true);
            this.app.recordingControlManager?.updateRecordingButtonState();
        }
        this.app.updateDisplay?.();
    }

    async createPlaybackStream(audioUrl) {
        const audio = document.createElement("audio");
        audio.crossOrigin = "anonymous";
        audio.src = this.resolveFixtureUrl(audioUrl);
        audio.controls = true;
        audio.preload = "auto";
        audio.style.display = "none";
        document.body.appendChild(audio);

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaElementSource(audio);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        source.connect(audioContext.destination);

        return {
            audio,
            stream: destination.stream,
            play: async () => {
                await audioContext.resume();
                try {
                    await audio.play();
                } catch (error) {
                    throw new Error(`Audio playback failed. Use a direct, browser-playable, CORS-enabled audio URL: ${audio.src}. Original error: ${error.message}`);
                }
            },
            cleanup: () => {
                audio.pause();
                audio.remove();
                audioContext.close();
            }
        };
    }

    async loadReferenceText(lecture) {
        if (!lecture.referenceText && !lecture.referenceUrl) {
            return "";
        }
        if (lecture.referenceText) {
            return lecture.referenceText;
        }
        let response;
        const resolvedUrl = this.resolveFixtureUrl(lecture.referenceUrl);
        try {
            response = await fetch(resolvedUrl);
        } catch (error) {
            throw new Error(`Reference script failed to load. Use a direct same-origin or CORS-enabled text URL: ${resolvedUrl}. Original error: ${error.message}`);
        }
        if (!response.ok) {
            console.warn(`[Evaluation] Reference script not found: ${lecture.referenceUrl}`);
            return "";
        }
        return await response.text();
    }

    resolveFixtureUrl(url) {
        if (!url || typeof url !== "string") {
            return url;
        }

        const googleDriveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
        if (googleDriveMatch) {
            return `https://drive.google.com/uc?export=download&id=${googleDriveMatch[1]}`;
        }

        return url;
    }

    waitForAudioEnd(audio) {
        return new Promise((resolve, reject) => {
            audio.addEventListener("ended", resolve, { once: true });
            audio.addEventListener("error", () => {
                reject(new Error(`Audio playback failed. Use a direct, browser-playable, CORS-enabled audio URL: ${audio.src}`));
            }, { once: true });
        });
    }

    async waitForIdle(timeoutMs = 30000) {
        const started = performance.now();
        while (performance.now() - started < timeoutMs) {
            if (!this.app.recordingManager.isTranscribingActive() && this.pendingTranslationCount() === 0) {
                await this.delay(1200);
                return;
            }
            await this.delay(250);
        }
        console.warn("[Evaluation] Timed out waiting for pending work to settle.");
    }

    pendingTranslationCount() {
        return this.metrics.pendingTranslations;
    }

    async evaluateKeywords(transcript) {
        const started = performance.now();
        let keywords = [];
        keywords = await this.app.keywordManager.extractKeywords(transcript);
        const keywordLatency = performance.now() - started;
        const normalizedTranscript = this.normalizeText(transcript);
        const transcriptWordCount = this.words(transcript).length;
        const genericCount = keywords.filter((keyword) => this.genericKeywords.has(keyword.toLowerCase())).length;
        const presentCount = keywords.filter((keyword) => normalizedTranscript.includes(this.normalizeText(keyword))).length;

        return {
            keywords,
            latency: keywordLatency,
            transcriptWordCount,
            genericCount,
            presentCount,
            keywordDensity: this.ratio(keywords.length, transcriptWordCount),
            genericRatio: this.ratio(genericCount, keywords.length),
            transcriptPresenceRate: this.ratio(presentCount, keywords.length)
        };
    }

    async evaluateExplanations(keywords, transcript) {
        const sample = keywords.slice(0, 3);
        const lectureMetrics = this.activeLectureMetrics;
        for (const keyword of sample) {
            const started = performance.now();
            if (lectureMetrics) {
                lectureMetrics.explanationRequests += 1;
            }
            try {
                const response = await this.app.apiClient.explainKeyword({
                    keyword,
                    language: this.app.explanationLanguage,
                    context: transcript.slice(0, 1200)
                });
                if (!response.ok) {
                    if (lectureMetrics) {
                        lectureMetrics.failedExplanations += 1;
                    }
                    continue;
                }
                await this.readStreamText(response);
                if (lectureMetrics) {
                    lectureMetrics.explanationLatencies.push(performance.now() - started);
                }
            } catch (error) {
                if (lectureMetrics) {
                    lectureMetrics.failedExplanations += 1;
                }
                console.error("[Evaluation] Explanation failed:", error);
            }
        }

        return {
            averageLatency: this.average(lectureMetrics?.explanationLatencies || []),
            failedCount: lectureMetrics?.failedExplanations || 0
        };
    }

    async evaluateSummary(transcript, expectedConcepts) {
        const started = performance.now();
        const summary = await this.app.summarizeText(transcript, true, "paragraph");
        const summaryLatency = performance.now() - started;
        const summaryText = summary || "";
        const summaryWords = this.words(summaryText).length;
        const transcriptWords = this.words(transcript).length;
        const normalizedSummary = this.normalizeText(summaryText);
        const detectedConcepts = expectedConcepts.filter((concept) => normalizedSummary.includes(this.normalizeText(concept)));
        const grounding = this.calculateContentGrounding(summaryText, transcript);

        return {
            summary: summaryText,
            latency: summaryLatency,
            summaryWordCount: summaryWords,
            transcriptWordCount: transcriptWords,
            compressionRatio: this.ratio(summaryWords, transcriptWords),
            detectedConcepts: detectedConcepts.length,
            expectedConcepts: expectedConcepts.length,
            groundedContentWords: grounding.groundedCount,
            summaryContentWords: grounding.contentWordCount,
            transcriptGroundingRate: grounding.groundingRate,
            tooShort: summaryWords < 30 || this.ratio(summaryWords, transcriptWords) < 0.03
        };
    }

    calculateContentGrounding(summary, transcript) {
        const transcriptWords = new Set(this.words(transcript));
        const summaryContentWords = this.words(summary).filter((word) => (
            word.length >= 4 && !this.isReferenceStopword(word)
        ));
        const groundedCount = summaryContentWords.filter((word) => transcriptWords.has(word)).length;

        return {
            groundedCount,
            contentWordCount: summaryContentWords.length,
            groundingRate: this.ratio(groundedCount, summaryContentWords.length)
        };
    }

    getExpectedConcepts(lecture, referenceText) {
        if (Array.isArray(lecture.expectedConcepts) && lecture.expectedConcepts.length > 0) {
            return lecture.expectedConcepts;
        }
        return this.extractReferenceConcepts(referenceText);
    }

    extractReferenceConcepts(referenceText, limit = 10) {
        const counts = new Map();
        for (const word of this.words(referenceText)) {
            if (word.length < 4 || this.isReferenceStopword(word)) {
                continue;
            }
            counts.set(word, (counts.get(word) || 0) + 1);
        }

        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, limit)
            .map(([word]) => word);
    }

    isReferenceStopword(word) {
        return this.referenceConceptStopwords.has(word) || this.externalStopwords.has(word);
    }

    getTranscriptText() {
        return Object.values(this.app.recordingManager.getTranscriptData())
            .map((item) => item?.text || "")
            .join(" ")
            .trim();
    }

    buildLectureMetrics(lectureMetrics, keywordsResult, explanationResult, summaryResult, wer) {
        return {
            transcription: {
                totalChunks: lectureMetrics.chunkRequests.size,
                completedChunks: lectureMetrics.completedChunks.size,
                emptyChunks: lectureMetrics.emptyChunks,
                averageChunkLatency: this.average(lectureMetrics.chunkLatencies),
                maxChunkLatency: this.max(lectureMetrics.chunkLatencies),
                failedChunks: lectureMetrics.failedChunks,
                approximateWer: wer,
                missingChunks: this.calculateMissingChunks(lectureMetrics)
            },
            translation: {
                requestCount: lectureMetrics.translationRequests,
                averageLatency: this.average(lectureMetrics.translationLatencies),
                failedCount: lectureMetrics.failedTranslations
            },
            keywords: {
                extractionCount: 1,
                latency: keywordsResult.latency || 0,
                count: keywordsResult.keywords?.length || 0,
                transcriptWordCount: keywordsResult.transcriptWordCount || 0,
                keywordDensity: keywordsResult.keywordDensity || 0,
                genericRatio: keywordsResult.genericRatio || 0,
                transcriptPresenceRate: keywordsResult.transcriptPresenceRate || 0
            },
            explanation: {
                requestCount: lectureMetrics.explanationRequests,
                averageLatency: explanationResult.averageLatency || 0,
                failedCount: explanationResult.failedCount || 0
            },
            summary: {
                summaryCount: 1,
                latency: summaryResult.latency || 0,
                summaryWordCount: summaryResult.summaryWordCount || 0,
                transcriptWordCount: summaryResult.transcriptWordCount || 0,
                compressionRatio: summaryResult.compressionRatio || 0,
                detectedConcepts: summaryResult.detectedConcepts || 0,
                expectedConcepts: summaryResult.expectedConcepts || 0,
                conceptCoverage: this.ratio(summaryResult.detectedConcepts || 0, summaryResult.expectedConcepts || 0),
                groundedContentWords: summaryResult.groundedContentWords || 0,
                summaryContentWords: summaryResult.summaryContentWords || 0,
                transcriptGroundingRate: summaryResult.transcriptGroundingRate || 0,
                tooShortCount: summaryResult.tooShort ? 1 : 0
            }
        };
    }

    calculateMissingChunks(lectureMetrics) {
        const indices = [...lectureMetrics.chunkRequests.keys()];
        if (!indices.length) {
            return 0;
        }
        const min = Math.min(...indices);
        const max = Math.max(...indices);
        let missing = 0;
        for (let index = min; index <= max; index += 1) {
            if (!lectureMetrics.completedChunks.has(index)) {
                missing += 1;
            }
        }
        return missing;
    }

    calculateWer(reference, hypothesis) {
        const refWords = this.words(reference);
        const hypWords = this.words(hypothesis);
        if (!refWords.length) {
            return null;
        }
        const previous = Array(hypWords.length + 1).fill(0).map((_, index) => index);
        let current = previous.slice();

        for (let i = 1; i <= refWords.length; i += 1) {
            current = [i];
            for (let j = 1; j <= hypWords.length; j += 1) {
                const substitution = previous[j - 1] + (refWords[i - 1] === hypWords[j - 1] ? 0 : 1);
                const insertion = current[j - 1] + 1;
                const deletion = previous[j] + 1;
                current[j] = Math.min(substitution, insertion, deletion);
            }
            for (let j = 0; j < current.length; j += 1) {
                previous[j] = current[j];
            }
        }

        return previous[hypWords.length] / refWords.length;
    }

    aggregateResults(results) {
        const lectureMetrics = results.map((result) => result.metrics).filter(Boolean);
        const transcriptionMetrics = lectureMetrics.map((metrics) => metrics.transcription);
        const translationMetrics = lectureMetrics.map((metrics) => metrics.translation);
        const keywordMetrics = lectureMetrics.map((metrics) => metrics.keywords);
        const explanationMetrics = lectureMetrics.map((metrics) => metrics.explanation);
        const summaryMetrics = lectureMetrics.map((metrics) => metrics.summary);

        return {
            transcription: {
                totalChunks: this.sum(transcriptionMetrics, "totalChunks"),
                completedChunks: this.sum(transcriptionMetrics, "completedChunks"),
                emptyChunks: this.sum(transcriptionMetrics, "emptyChunks"),
                averageChunkLatency: this.averageMetric(transcriptionMetrics, "averageChunkLatency"),
                maxChunkLatency: this.maxMetric(transcriptionMetrics, "maxChunkLatency"),
                failedChunks: this.sum(transcriptionMetrics, "failedChunks"),
                approximateWer: this.averageMetric(transcriptionMetrics, "approximateWer", true),
                missingChunks: this.sum(transcriptionMetrics, "missingChunks")
            },
            translation: {
                requestCount: this.sum(translationMetrics, "requestCount"),
                averageLatency: this.averageMetric(translationMetrics, "averageLatency"),
                failedCount: this.sum(translationMetrics, "failedCount")
            },
            keywords: {
                extractionCount: this.sum(keywordMetrics, "extractionCount"),
                latency: this.averageMetric(keywordMetrics, "latency"),
                averageCount: this.averageMetric(keywordMetrics, "count"),
                totalCount: this.sum(keywordMetrics, "count"),
                averageTranscriptWordCount: this.averageMetric(keywordMetrics, "transcriptWordCount"),
                keywordDensity: this.averageMetric(keywordMetrics, "keywordDensity"),
                genericRatio: this.averageMetric(keywordMetrics, "genericRatio"),
                transcriptPresenceRate: this.averageMetric(keywordMetrics, "transcriptPresenceRate")
            },
            explanation: {
                requestCount: this.sum(explanationMetrics, "requestCount"),
                averageLatency: this.averageMetric(explanationMetrics, "averageLatency"),
                failedCount: this.sum(explanationMetrics, "failedCount")
            },
            summary: {
                summaryCount: this.sum(summaryMetrics, "summaryCount"),
                latency: this.averageMetric(summaryMetrics, "latency"),
                averageSummaryWordCount: this.averageMetric(summaryMetrics, "summaryWordCount"),
                totalSummaryWordCount: this.sum(summaryMetrics, "summaryWordCount"),
                averageTranscriptWordCount: this.averageMetric(summaryMetrics, "transcriptWordCount"),
                compressionRatio: this.averageMetric(summaryMetrics, "compressionRatio"),
                detectedConcepts: this.sum(summaryMetrics, "detectedConcepts"),
                expectedConcepts: this.sum(summaryMetrics, "expectedConcepts"),
                conceptCoverage: this.averageMetric(summaryMetrics, "conceptCoverage"),
                groundedContentWords: this.sum(summaryMetrics, "groundedContentWords"),
                summaryContentWords: this.sum(summaryMetrics, "summaryContentWords"),
                transcriptGroundingRate: this.averageMetric(summaryMetrics, "transcriptGroundingRate"),
                tooShortCount: this.sum(summaryMetrics, "tooShortCount")
            },
            system: {
                apiSuccessRate: this.ratio(this.metrics.apiSuccessful, this.metrics.apiTotal),
                apiSuccessful: this.metrics.apiSuccessful,
                apiTotal: this.metrics.apiTotal,
                uncaughtErrors: this.metrics.uncaughtErrors,
                totalEvaluationTime: this.metrics.evaluationEnd - this.metrics.evaluationStart
            },
            lectures: results
        };
    }

    printReport(report) {
        console.log("");
        console.log("========================================");
        console.log("StreamNote Technical Evaluation");
        console.log("========================================");
        console.log("");
        report.lectures.forEach((result, index) => {
            this.printSingleLectureReport(result, index + 1);
        });
        console.log("[Overall Average]");
        console.log("");
        console.log("[Transcription]");
        console.log(`Average chunk latency: ${this.formatMs(report.transcription.averageChunkLatency)}`);
        console.log(`Max chunk latency: ${this.formatMs(report.transcription.maxChunkLatency)}`);
        console.log(`Approximate WER: ${this.formatPercent(report.transcription.approximateWer)}`);
        console.log(`Total chunks: ${report.transcription.totalChunks}`);
        console.log(`Completed chunks: ${report.transcription.completedChunks} / ${report.transcription.totalChunks}`);
        console.log(`Failed chunks: ${report.transcription.failedChunks} / ${report.transcription.totalChunks}`);
        console.log(`Empty chunks: ${report.transcription.emptyChunks} / ${report.transcription.totalChunks}`);
        console.log(`Missing chunks: ${report.transcription.missingChunks}`);
        console.log("");
        console.log("[Translation]");
        console.log(`Requests: ${report.translation.requestCount}`);
        console.log(`Average latency: ${this.formatMs(report.translation.averageLatency)}`);
        console.log(`Failed translations: ${report.translation.failedCount} / ${report.translation.requestCount}`);
        console.log("");
        console.log("[Keywords]");
        console.log(`Extraction latency: ${this.formatSeconds(report.keywords.latency)}`);
        console.log(`Average keyword count: ${this.formatNumber(report.keywords.averageCount)}`);
        console.log(`Total keywords: ${report.keywords.totalCount}`);
        console.log(`Average transcript word count: ${this.formatNumber(report.keywords.averageTranscriptWordCount)}`);
        console.log(`Keyword density: ${this.formatPerHundredWords(report.keywords.keywordDensity)} per 100 transcript words`);
        console.log(`Generic keyword ratio: ${this.formatPercent(report.keywords.genericRatio)}`);
        console.log(`Transcript presence rate: ${this.formatPercent(report.keywords.transcriptPresenceRate)}`);
        console.log("");
        console.log("[Explanation]");
        console.log(`Requests: ${report.explanation.requestCount}`);
        console.log(`Average latency: ${this.formatSeconds(report.explanation.averageLatency)}`);
        console.log(`Failed explanations: ${report.explanation.failedCount} / ${report.explanation.requestCount}`);
        console.log("");
        console.log("[Summary]");
        console.log(`Summaries generated: ${report.summary.summaryCount}`);
        console.log(`Generation latency: ${this.formatSeconds(report.summary.latency)}`);
        console.log(`Average summary word count: ${this.formatNumber(report.summary.averageSummaryWordCount)}`);
        console.log(`Total summary words: ${report.summary.totalSummaryWordCount}`);
        console.log(`Compression ratio: ${report.summary.compressionRatio.toFixed(2)}`);
        console.log(`Reference concept coverage: ${this.formatPercent(report.summary.conceptCoverage)} (${report.summary.detectedConcepts} / ${report.summary.expectedConcepts})`);
        console.log(`Transcript grounding rate: ${this.formatPercent(report.summary.transcriptGroundingRate)} (${report.summary.groundedContentWords} / ${report.summary.summaryContentWords} content words)`);
        console.log(`Too-short summaries: ${report.summary.tooShortCount} / ${report.summary.summaryCount}`);
        console.log("");
        console.log("[System]");
        console.log(`API success rate: ${this.formatPercent(report.system.apiSuccessRate)}`);
        console.log(`API requests: ${report.system.apiSuccessful} / ${report.system.apiTotal}`);
        console.log(`Uncaught errors: ${report.system.uncaughtErrors}`);
        console.log(`Total evaluation time: ${this.formatDuration(report.system.totalEvaluationTime)}`);
        console.log("");
        console.log("========================================");
        console.log("Evaluation Complete");
        console.log("========================================");
    }

    printSingleLectureReport(result, lectureNumber) {
        const title = result.lecture?.title || result.lecture?.id || `Lecture ${lectureNumber}`;
        const metrics = result.metrics;
        if (!metrics) {
            return;
        }

        console.log(`[Lecture ${lectureNumber}: ${title}]`);
        console.log(`Transcription: avg chunk ${this.formatMs(metrics.transcription.averageChunkLatency)}, max ${this.formatMs(metrics.transcription.maxChunkLatency)}, WER ${this.formatPercent(metrics.transcription.approximateWer)}, chunks ${metrics.transcription.completedChunks}/${metrics.transcription.totalChunks}, failed ${metrics.transcription.failedChunks}, empty ${metrics.transcription.emptyChunks}, missing ${metrics.transcription.missingChunks}`);
        console.log(`Translation: avg latency ${this.formatMs(metrics.translation.averageLatency)}, failed ${metrics.translation.failedCount}/${metrics.translation.requestCount}`);
        console.log(`Keywords: latency ${this.formatSeconds(metrics.keywords.latency)}, count ${metrics.keywords.count}, density ${this.formatPerHundredWords(metrics.keywords.keywordDensity)} per 100 words, generic ${this.formatPercent(metrics.keywords.genericRatio)}, present ${this.formatPercent(metrics.keywords.transcriptPresenceRate)}`);
        console.log(`Explanation: avg latency ${this.formatSeconds(metrics.explanation.averageLatency)}, failed ${metrics.explanation.failedCount}/${metrics.explanation.requestCount}`);
        console.log(`Summary: latency ${this.formatSeconds(metrics.summary.latency)}, words ${metrics.summary.summaryWordCount}, compression ${metrics.summary.compressionRatio.toFixed(2)}, concept coverage ${this.formatPercent(metrics.summary.conceptCoverage)} (${metrics.summary.detectedConcepts}/${metrics.summary.expectedConcepts}), grounding ${this.formatPercent(metrics.summary.transcriptGroundingRate)} (${metrics.summary.groundedContentWords}/${metrics.summary.summaryContentWords}), too short ${metrics.summary.tooShortCount}/${metrics.summary.summaryCount}`);
        console.log("");
    }

    async readStreamText(response) {
        if (!response.body?.getReader) {
            return await response.text();
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = "";
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                text += decoder.decode(value, { stream: true });
            }
            text += decoder.decode();
        } finally {
            reader.releaseLock();
        }
        return text;
    }

    words(text) {
        return this.normalizeText(text).split(/\s+/).filter(Boolean);
    }

    normalizeText(text) {
        return (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    }

    average(values) {
        if (!values.length) {
            return 0;
        }
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    averageMetric(items, key, skipNull = false) {
        const values = items
            .map((item) => item?.[key])
            .filter((value) => typeof value === "number" && (!skipNull || value !== null));
        return values.length ? this.average(values) : (skipNull ? null : 0);
    }

    maxMetric(items, key) {
        const values = items
            .map((item) => item?.[key])
            .filter((value) => typeof value === "number");
        return this.max(values);
    }

    sum(items, key) {
        return items.reduce((total, item) => total + (Number(item?.[key]) || 0), 0);
    }

    max(values) {
        return values.length ? Math.max(...values) : 0;
    }

    ratio(numerator, denominator) {
        return denominator ? numerator / denominator : 0;
    }

    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    formatMs(value) {
        return `${Math.round(value)} ms`;
    }

    formatSeconds(value) {
        return `${(value / 1000).toFixed(1)} s`;
    }

    formatPercent(value) {
        if (value === null || Number.isNaN(value)) {
            return "N/A";
        }
        return `${(value * 100).toFixed(1)}%`;
    }

    formatPerHundredWords(value) {
        return (value * 100).toFixed(2);
    }

    formatNumber(value) {
        return Number.isInteger(value) ? String(value) : value.toFixed(1);
    }

    formatDuration(value) {
        const totalSeconds = Math.round(value / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }
}

window.StreamNoteEvaluationManager = StreamNoteEvaluationManager;
StreamNoteEvaluationManager.DEFAULT_ENGLISH_STOPWORDS = [
    "a", "able", "about", "above", "according", "accordingly", "across", "actually", "after", "afterwards",
    "again", "against", "all", "allow", "allows", "almost", "alone", "along", "already", "also",
    "although", "always", "am", "among", "amongst", "an", "and", "another", "any", "anybody",
    "anyhow", "anyone", "anything", "anyway", "anyways", "anywhere", "apart", "appear", "appreciate", "appropriate",
    "are", "around", "as", "aside", "ask", "asking", "associated", "at", "available", "away",
    "awfully", "be", "became", "because", "become", "becomes", "becoming", "been", "before", "beforehand",
    "behind", "being", "believe", "below", "beside", "besides", "best", "better", "between", "beyond",
    "both", "brief", "but", "by", "came", "can", "cannot", "cant", "cause", "causes",
    "certain", "certainly", "changes", "clearly", "come", "comes", "concerning", "consequently", "consider", "considering",
    "contain", "containing", "contains", "corresponding", "could", "course", "currently", "definitely", "described", "despite",
    "did", "different", "do", "does", "doing", "done", "down", "downwards", "during", "each",
    "edu", "eg", "eight", "either", "else", "elsewhere", "enough", "entirely", "especially", "et",
    "etc", "even", "ever", "every", "everybody", "everyone", "everything", "everywhere", "ex", "exactly",
    "example", "except", "far", "few", "fifth", "first", "five", "followed", "following", "follows",
    "for", "former", "formerly", "forth", "four", "from", "further", "furthermore", "get", "gets",
    "getting", "given", "gives", "go", "goes", "going", "gone", "got", "gotten", "greetings",
    "had", "happens", "hardly", "has", "have", "having", "he", "hello", "help", "hence",
    "her", "here", "hereafter", "hereby", "herein", "hereupon", "hers", "herself", "hi", "him",
    "himself", "his", "hither", "hopefully", "how", "howbeit", "however", "ie", "if", "ignored",
    "immediate", "in", "inasmuch", "inc", "indeed", "indicate", "indicated", "indicates", "inner", "insofar",
    "instead", "into", "inward", "is", "it", "its", "itself", "just", "keep", "keeps",
    "kept", "know", "known", "knows", "last", "lately", "later", "latter", "latterly", "least",
    "less", "lest", "let", "like", "liked", "likely", "little", "look", "looking", "looks",
    "ltd", "mainly", "many", "may", "maybe", "me", "mean", "meanwhile", "merely", "might",
    "more", "moreover", "most", "mostly", "much", "must", "my", "myself", "name", "namely",
    "nd", "near", "nearly", "necessary", "need", "needs", "neither", "never", "nevertheless", "new",
    "next", "nine", "no", "nobody", "non", "none", "noone", "nor", "normally", "not",
    "nothing", "novel", "now", "nowhere", "obviously", "of", "off", "often", "oh", "ok",
    "okay", "old", "on", "once", "one", "ones", "only", "onto", "or", "other",
    "others", "otherwise", "ought", "our", "ours", "ourselves", "out", "outside", "over", "overall",
    "own", "particular", "particularly", "per", "perhaps", "placed", "please", "plus", "possible", "presumably",
    "probably", "provides", "que", "quite", "rather", "really", "reasonably", "regarding", "regardless", "regards",
    "relatively", "respectively", "right", "said", "same", "saw", "say", "saying", "says", "second",
    "secondly", "see", "seeing", "seem", "seemed", "seeming", "seems", "seen", "self", "selves",
    "sensible", "sent", "serious", "seriously", "seven", "several", "shall", "she", "should", "since",
    "six", "so", "some", "somebody", "somehow", "someone", "something", "sometime", "sometimes", "somewhat",
    "somewhere", "soon", "sorry", "specified", "specify", "specifying", "still", "sub", "such", "sup",
    "sure", "take", "taken", "tell", "tends", "th", "than", "thank", "thanks", "thanx",
    "that", "thats", "the", "their", "theirs", "them", "themselves", "then", "thence", "there",
    "thereafter", "thereby", "therefore", "therein", "theres", "thereupon", "these", "they", "think", "third",
    "this", "thorough", "thoroughly", "those", "though", "three", "through", "throughout", "thru", "thus",
    "to", "together", "too", "took", "toward", "towards", "tried", "tries", "truly", "try",
    "trying", "twice", "two", "un", "under", "unfortunately", "unless", "unlikely", "until", "unto",
    "up", "upon", "us", "use", "used", "useful", "uses", "using", "usually", "value",
    "various", "very", "via", "viz", "vs", "want", "wants", "was", "way", "we",
    "welcome", "well", "went", "were", "what", "whatever", "when", "whence", "whenever", "where",
    "whereafter", "whereas", "whereby", "wherein", "whereupon", "wherever", "whether", "which", "while", "whither",
    "who", "whoever", "whole", "whom", "whose", "why", "will", "willing", "wish", "with",
    "within", "without", "wonder", "would", "yes", "yet", "you", "your", "yours", "yourself",
    "yourselves", "zero"
];
window.runStreamNoteEvaluation = function runStreamNoteEvaluation(options = {}, config = {}) {
    const evaluationOptions = Array.isArray(options) ? { ...config, lectures: options } : options;
    window.streamNoteEvaluation = new StreamNoteEvaluationManager(window.streamNoteInstance, evaluationOptions);
    return window.streamNoteEvaluation.run();
};
