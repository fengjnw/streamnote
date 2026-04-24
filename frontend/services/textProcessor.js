

/**
 * TextProcessor - Utility class for text file processing and validation
 * Handles reading, cleaning, and validating text files in various formats (txt, md, docx, pdf).
 * Converts raw text into structured precise results with timestamps.
 * 
 * @class
 * @static
 */
class TextProcessor {
    /**
     * Clean and normalize text by removing extra whitespace and line-ending variations
     * @static
     * @param {string} text - Raw text to clean
     * @returns {string} Cleaned text with normalized line endings and trimmed whitespace
     */
    static cleanText(text) {
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        text = text.trim();

        return text;
    }

    /**
     * Read and parse a text file using FileReader
     * @static
     * @param {File} file - File object to read
     * @returns {Promise<string>} Promise resolving to cleaned text content
     * @throws {Error} If file is not provided or read fails
     */
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

    /**
     * Validate file format, name, and size constraints
     * @static
     * @param {File} file - File object to validate
     * @returns {Object} Validation result object
     * @returns {boolean} result.valid - Whether file passes validation
     * @returns {string|null} result.error - Error message if validation failed, null if valid
     */
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

    /**
     * Convert raw text into precise results structure with line-level timestamps
     * @static
     * @param {string} text - Raw text to convert
     * @param {number} [sessionStartTimeMs] - Session start time in milliseconds (uses current time if not provided)
     * @returns {Object} Precise results object
     * @returns {Object} result.data - Map of line index to line data objects
     * @returns {number} result.lineCount - Total number of lines processed
     */
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

    /**
     * Process an uploaded file, validate it, convert to text, and generate precise results
     * @static
     * @async
     * @param {File} file - File object to process
     * @param {number} [sessionStartTimeMs] - Session start time for timestamp calculation
     * @returns {Promise<Object>} Processed file data
     * @returns {Object} result.preciseResults - Map of line index to line data
     * @returns {string} result.fileName - Original filename
     * @returns {number} result.fileSize - File size in bytes
     * @returns {number} result.lineCount - Number of lines extracted
     * @returns {number} result.uploadTime - Timestamp of processing
     * @throws {Error} If file validation fails or processing encounters errors
     */
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
