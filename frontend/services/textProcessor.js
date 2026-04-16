

class TextProcessor {
    static cleanText(text) {
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        text = text.trim();

        return text;
    }

    static readTextFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file provided'));
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const cleanedText = this.cleanText(text);
                    resolve(cleanedText);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsText(file, 'UTF-8');
        });
    }

    static validateFile(file) {
        if (!file) {
            return { valid: false, error: 'No file provided' };
        }

        const filename = file.name;
        if (!filename) {
            return { valid: false, error: 'File name is empty' };
        }

        const fileExt = filename.toLowerCase().split('.').pop();
        const supportedFormats = ['txt', 'md', 'text', 'markdown', 'docx', 'pdf'];

        if (!supportedFormats.includes(fileExt)) {
            return {
                valid: false,
                error: `Unsupported file format: .${fileExt}. Supported: ${supportedFormats.join(', ')}`
            };
        }

        const maxSizeMB = 10;
        const maxSizeBytes = maxSizeMB * 1024 * 1024;

        if (file.size > maxSizeBytes) {
            return {
                valid: false,
                error: `File size exceeds ${maxSizeMB}MB limit`
            };
        }

        return { valid: true, error: null };
    }

    static convertToPreciseResults(text, sessionStartTimeMs = null) {
        const lines = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const sessionStart = sessionStartTimeMs || Date.now();
        const relativeSeconds = Math.floor((Date.now() - sessionStart) / 1000);
        const timestamp = relativeSeconds;

        const preciseResults = {};

        lines.forEach((line, index) => {
            preciseResults[index] = {
                text: line,
                timestamp: timestamp,
                source: 'text'
            };
        });

        return {
            data: preciseResults,
            lineCount: Object.keys(preciseResults).length
        };
    }

    static async processFile(file, sessionStartTimeMs = null) {
        const validation = this.validateFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const fileExt = file.name.toLowerCase().split('.').pop();
        let text;

        if (fileExt === 'docx') {
            text = await this.readDocxFile(file);
        } else if (fileExt === 'pdf') {
            text = await this.readPdfFile(file);
        } else {
            text = await this.readTextFile(file);
        }

        const result = this.convertToPreciseResults(text, sessionStartTimeMs);

        return {
            preciseResults: result.data,
            fileName: file.name,
            fileSize: file.size,
            lineCount: result.lineCount,
            uploadTime: Date.now()
        };
    }

    static readDocxFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file provided'));
                return;
            }

            if (typeof mammoth === 'undefined') {
                reject(new Error('DOCX support library (mammoth) is not loaded. Please refresh the page and try again.'));
                return;
            }

            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const result = await mammoth.convertToHtml({ arrayBuffer });

                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = result.value;
                    const text = tempDiv.textContent || tempDiv.innerText || '';

                    const cleanedText = this.cleanText(text);
                    resolve(cleanedText);
                } catch (error) {
                    reject(new Error(`Failed to read DOCX: ${error.message}`));
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read DOCX file'));
            };

            reader.readAsArrayBuffer(file);
        });
    }

    static readPdfFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file provided'));
                return;
            }

            if (typeof pdfjsLib === 'undefined') {
                reject(new Error('PDF support library (pdf.js) is not loaded. Please refresh the page and try again.'));
                return;
            }

            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    pdfjsLib.GlobalWorkerOptions.workerSrc =
                        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    const textArray = [];

                    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                        const page = await pdf.getPage(pageNum);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items
                            .map(item => item.str)
                            .join(' ');
                        if (pageText.trim()) {
                            textArray.push(pageText);
                        }
                    }

                    const text = this.cleanText(textArray.join('\n'));
                    resolve(text);
                } catch (error) {
                    reject(new Error(`Failed to read PDF: ${error.message}`));
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read PDF file'));
            };

            reader.readAsArrayBuffer(file);
        });
    }
}

window.TextProcessor = TextProcessor;
