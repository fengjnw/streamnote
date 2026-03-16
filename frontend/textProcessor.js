/**
 * 文本处理模块 - 在前端处理文本提取和转换
 * 支持格式：.txt, .md, .docx, .pdf
 */

class TextProcessor {
    /**
     * 清理和规范化文本
     * @param {string} text - 原始文本
     * @returns {string} 清理后的文本
     */
    static cleanText(text) {
        // 1. 规范换行（Windows CRLF → Unix LF）
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // 2. 清理首尾空格
        text = text.trim();

        return text;
    }

    /**
     * 读取文本文件
     * @param {File} file - 文件对象
     * @returns {Promise<string>} 文件内容
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

            // 尝试用 UTF-8 读取（大部分情况都是）
            reader.readAsText(file, 'UTF-8');
        });
    }

    /**
     * 验证文件
     * @param {File} file - 文件对象
     * @returns {Object} 验证结果 {valid: bool, error: string|null}
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

        // 检查文件大小
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
     * 将文本转换为 preciseResults 格式
     * @param {string} text - 文本内容
     * @returns {Object} preciseResults 格式的数据
     */
    static convertToPreciseResults(text) {
        // 按行分割（每行成为一个item）
        const lines = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        // 获取当前时间作为所有导入项的时间戳（从 00:00:00 开始的秒数）
        const now = new Date();
        const timestamp = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

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
     * 处理文件上传（完整流程）
     * @param {File} file - 文件对象
     * @returns {Promise<Object>} 转换后的 preciseResults 和元数据
     */
    static async processFile(file) {
        // 验证
        const validation = this.validateFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // 根据文件类型读取
        const fileExt = file.name.toLowerCase().split('.').pop();
        let text;

        if (fileExt === 'docx') {
            text = await this.readDocxFile(file);
        } else if (fileExt === 'pdf') {
            text = await this.readPdfFile(file);
        } else {
            text = await this.readTextFile(file);
        }

        // 转换
        const result = this.convertToPreciseResults(text);

        return {
            preciseResults: result.data,
            fileName: file.name,
            fileSize: file.size,
            lineCount: result.lineCount,
            uploadTime: Date.now()
        };
    }

    /**
     * 读取 DOCX 文件
     * @param {File} file - 文件对象
     * @returns {Promise<string>} 文件内容
     */
    static readDocxFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file provided'));
                return;
            }

            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    // 使用 mammoth 库提取文本
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    const text = this.cleanText(result.value);
                    resolve(text);
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

    /**
     * 读取 PDF 文件
     * @param {File} file - 文件对象
     * @returns {Promise<string>} 文件内容
     */
    static readPdfFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file provided'));
                return;
            }

            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    // 设置 pdf.js worker 脚本
                    pdfjsLib.GlobalWorkerOptions.workerSrc =
                        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    const textArray = [];

                    // 遍历所有页面提取文本
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
