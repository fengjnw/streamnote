"""
文件处理模块 - 处理文本文件的上传和提取
支持格式：.txt, .md（未来可扩展：.pdf, .docx）
"""

import re


def clean_text(text):
    """
    清理和规范化文本
    
    Args:
        text: 原始文本内容
        
    Returns:
        清理后的文本
    """
    # 1. 规范换行（Windows CRLF → Unix LF）
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    # 2. 移除多余空格（保留换行）
    text = re.sub(r'[ \t]+', ' ', text)
    
    # 3. 规范段落间距（多个空行 → 两个）
    text = re.sub(r'\n\n+', '\n\n', text)
    
    # 4. 清理首尾空格
    text = text.strip()
    
    return text


def extract_text_from_txt(content):
    """
    从文本内容提取纯文本（.txt 格式）
    
    Args:
        content: 字节内容
        
    Returns:
        提取的纯文本字符串
    """
    # 尝试多种编码
    encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'gb2312', 'big5']
    
    for encoding in encodings:
        try:
            text = content.decode(encoding)
            return text
        except (UnicodeDecodeError, AttributeError):
            continue
    
    # 如果所有编码都失败，使用默认编码并忽略错误
    return content.decode('utf-8', errors='replace')


def extract_text_from_file(file_obj):
    """
    从文件对象提取文本内容
    
    Args:
        file_obj: Flask 文件对象 (request.files['file'])
        
    Returns:
        dict: {
            'text': '提取的文本',
            'fileName': '文件名',
            'fileSize': 文件大小（字节）,
            'paragraphCount': 段落数
        }
        
    Raises:
        ValueError: 文件格式不支持或提取失败
    """
    if not file_obj:
        raise ValueError("No file provided")
    
    filename = file_obj.filename
    if not filename:
        raise ValueError("File name is empty")
    
    # 检查文件扩展名
    file_ext = filename.lower().split('.')[-1]
    supported_formats = ['txt', 'md', 'text']
    
    if file_ext not in supported_formats:
        raise ValueError(f"Unsupported file format: .{file_ext}. Supported: {', '.join(supported_formats)}")
    
    # 读取文件内容
    file_content = file_obj.read()
    file_size = len(file_content)
    
    # 验证文件大小（限制为 10MB）
    max_size_mb = 10
    if file_size > max_size_mb * 1024 * 1024:
        raise ValueError(f"File size exceeds {max_size_mb}MB limit")
    
    # 提取文本
    if file_ext in ['txt', 'text', 'md']:
        text = extract_text_from_txt(file_content)
    else:
        raise ValueError(f"Unsupported file format: .{file_ext}")
    
    # 清理文本
    text = clean_text(text)
    
    # 计算段落数（按 \n\n 分割）
    paragraphs = text.split('\n\n')
    paragraph_count = len([p for p in paragraphs if p.strip()])
    
    return {
        'text': text,
        'fileName': filename,
        'fileSize': file_size,
        'paragraphCount': paragraph_count
    }


def validate_file(file_obj):
    """
    验证文件（不实际提取内容）
    
    Args:
        file_obj: Flask 文件对象
        
    Returns:
        dict: 验证结果 {'valid': bool, 'error': str or None}
    """
    try:
        if not file_obj:
            return {'valid': False, 'error': 'No file provided'}
        
        filename = file_obj.filename
        if not filename:
            return {'valid': False, 'error': 'File name is empty'}
        
        file_ext = filename.lower().split('.')[-1]
        supported_formats = ['txt', 'md', 'text']
        
        if file_ext not in supported_formats:
            return {
                'valid': False,
                'error': f"Unsupported file format: .{file_ext}"
            }
        
        # 检查文件大小（读取分块以避免全部加载到内存）
        max_size_mb = 10
        max_size_bytes = max_size_mb * 1024 * 1024
        
        file_obj.seek(0, 2)  # 移到文件末尾
        file_size = file_obj.tell()
        file_obj.seek(0)  # 回到开始
        
        if file_size > max_size_bytes:
            return {
                'valid': False,
                'error': f'File size exceeds {max_size_mb}MB limit'
            }
        
        return {'valid': True, 'error': None}
    
    except Exception as e:
        return {'valid': False, 'error': str(e)}
