/**
 * 文本处理模块 - 在前端处理文本提取和转换
 * 支持格式：.txt, .md（未来可扩展：.pdf, .docx）
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
        
        // 2. 移除多余空格（保留换行）
        text = text.replace(/[ \t]+/g, ' ');
        
        // 3. 规范段落间距（多个空行 → 两个）
        text = text.replace(/\n\n+/g, '\n\n');
        
        // 4. 清理首尾空格
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
        const supportedFormats = ['txt', 'md', 'text', 'markdown'];

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
        // 按段落分割
        const paragraphs = text
            .split('\n\n')
            .map(p => p.trim())
            .filter(p => p.length > 0);

        const importTime = Date.now();
        const preciseResults = {};

        paragraphs.forEach((para, index) => {
            preciseResults[index] = {
                text: para,
                timestamp: importTime,
                source: 'text'
            };
        });

        return {
            data: preciseResults,
            paragraphCount: Object.keys(preciseResults).length
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

        // 读取
        const text = await this.readTextFile(file);

        // 转换
        const result = this.convertToPreciseResults(text);

        return {
            preciseResults: result.data,
            fileName: file.name,
            fileSize: file.size,
            paragraphCount: result.paragraphCount,
            uploadTime: Date.now()
        };
    }
}
