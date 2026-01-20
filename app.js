// StreamNote - 最小可用原型
// 功能：实时语音转文字

class StreamNote {
    constructor() {
        // 检查浏览器支持
        this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!this.SpeechRecognition) {
            alert('抱歉，您的浏览器不支持语音识别。请使用 Chrome 或 Edge 浏览器。');
            return;
        }

        // 初始化识别器
        this.recognition = new this.SpeechRecognition();
        this.setupRecognition();

        // DOM 元素
        this.transcriptDiv = document.getElementById('transcript');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusSpan = document.getElementById('status');
        this.wordCountSpan = document.getElementById('wordCount');
        this.sessionTimeSpan = document.getElementById('sessionTime');

        // 状态
        this.isRecording = false;
        this.transcriptText = '';
        this.startTime = null;
        this.timerInterval = null;

        // 绑定事件
        this.bindEvents();
    }

    setupRecognition() {
        // 配置识别器
        this.recognition.continuous = true;           // 持续识别
        this.recognition.interimResults = true;       // 显示临时结果
        this.recognition.lang = 'zh-CN';              // 中文识别（可改为 'en-US'）
        this.recognition.maxAlternatives = 1;

        // 识别结果处理
        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            // 处理所有识别结果
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;

                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }

            // 更新显示
            this.updateTranscript(finalTranscript, interimTranscript);
        };

        // 错误处理
        this.recognition.onerror = (event) => {
            console.error('识别错误:', event.error);

            let errorMsg = '识别错误';
            switch (event.error) {
                case 'no-speech':
                    errorMsg = '未检测到语音';
                    break;
                case 'audio-capture':
                    errorMsg = '无法访问麦克风';
                    break;
                case 'not-allowed':
                    errorMsg = '麦克风权限被拒绝';
                    break;
                default:
                    errorMsg = `识别错误: ${event.error}`;
            }

            this.updateStatus(errorMsg, 'error');
        };

        // 识别结束处理
        this.recognition.onend = () => {
            if (this.isRecording) {
                // 如果还在录制状态，自动重启（保持连续）
                this.recognition.start();
            }
        };
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.start());
        this.stopBtn.addEventListener('click', () => this.stop());
    }

    start() {
        try {
            this.recognition.start();
            this.isRecording = true;
            this.startTime = Date.now();

            // 清空之前的内容
            this.transcriptText = '';
            this.transcriptDiv.innerHTML = '';

            // 更新 UI
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.updateStatus('正在录制...', 'recording');

            // 启动计时器
            this.startTimer();

            console.log('开始识别...');
        } catch (error) {
            console.error('启动失败:', error);
            this.updateStatus('启动失败', 'error');
        }
    }

    stop() {
        this.recognition.stop();
        this.isRecording = false;

        // 更新 UI
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.updateStatus('已停止', 'stopped');

        // 停止计时器
        this.stopTimer();

        console.log('停止识别');
    }

    updateTranscript(finalText, interimText) {
        // 累加确定的文本
        if (finalText) {
            this.transcriptText += finalText;

            // 创建新的文本段落（带时间戳）
            const timestamp = this.getCurrentTimestamp();
            const p = document.createElement('p');
            p.className = 'transcript-line';
            p.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${finalText}`;
            this.transcriptDiv.appendChild(p);

            // 自动滚动到底部
            this.transcriptDiv.scrollTop = this.transcriptDiv.scrollHeight;

            // 更新词数统计
            this.updateWordCount();
        }

        // 显示临时文本（如果有）
        if (interimText) {
            // 查找或创建临时文本元素
            let interimElement = document.getElementById('interim-text');
            if (!interimElement) {
                interimElement = document.createElement('p');
                interimElement.id = 'interim-text';
                interimElement.className = 'transcript-line interim';
                this.transcriptDiv.appendChild(interimElement);
            }
            interimElement.textContent = interimText;

            // 自动滚动
            this.transcriptDiv.scrollTop = this.transcriptDiv.scrollHeight;
        } else {
            // 移除临时文本
            const interimElement = document.getElementById('interim-text');
            if (interimElement) {
                interimElement.remove();
            }
        }
    }

    updateStatus(message, type = 'info') {
        this.statusSpan.textContent = message;
        this.statusSpan.className = `status status-${type}`;
    }

    updateWordCount() {
        const words = this.transcriptText.trim().split(/\s+/).filter(w => w.length > 0);
        this.wordCountSpan.textContent = `词数: ${words.length}`;
    }

    getCurrentTimestamp() {
        if (!this.startTime) return '00:00';

        const elapsed = Date.now() - this.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);

        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            this.sessionTimeSpan.textContent = `时长: ${this.getCurrentTimestamp()}`;
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new StreamNote();
});
