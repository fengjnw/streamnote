"""File processing helpers for text upload and extraction.

Supported formats: .txt and .md.
"""

import re


def clean_text(text):
    """Normalize and clean input text.

    Args:
        text: Raw text content.

    Returns:
        Cleaned text.
    """
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    text = re.sub(r'[ \t]+', ' ', text)
    
    text = re.sub(r'\n\n+', '\n\n', text)
    
    text = text.strip()
    
    return text


def extract_text_from_txt(content):
    """Decode plain-text bytes into a string.

    Args:
        content: File bytes.

    Returns:
        Decoded plain-text string.
    """
    encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'gb2312', 'big5']
    
    for encoding in encodings:
        try:
            text = content.decode(encoding)
            return text
        except (UnicodeDecodeError, AttributeError):
            continue
    
    return content.decode('utf-8', errors='replace')


def extract_text_from_file(file_obj):
    """Extract and clean text from an uploaded file.

    Args:
        file_obj: Flask uploaded file object (request.files['file']).

    Returns:
        dict: {
            'text': extracted text,
            'fileName': original filename,
            'fileSize': file size in bytes,
            'paragraphCount': paragraph count
        }

    Raises:
        ValueError: Unsupported format or extraction failure.
    """
    if not file_obj:
        raise ValueError("No file provided")
    
    filename = file_obj.filename
    if not filename:
        raise ValueError("File name is empty")
    
    file_ext = filename.lower().split('.')[-1]
    supported_formats = ['txt', 'md', 'text']
    
    if file_ext not in supported_formats:
        raise ValueError(f"Unsupported file format: .{file_ext}. Supported: {', '.join(supported_formats)}")
    
    file_content = file_obj.read()
    file_size = len(file_content)
    
    max_size_mb = 10
    if file_size > max_size_mb * 1024 * 1024:
        raise ValueError(f"File size exceeds {max_size_mb}MB limit")
    
    if file_ext in ['txt', 'text', 'md']:
        text = extract_text_from_txt(file_content)
    else:
        raise ValueError(f"Unsupported file format: .{file_ext}")
    
    text = clean_text(text)
    
    paragraphs = text.split('\n\n')
    paragraph_count = len([p for p in paragraphs if p.strip()])
    
    return {
        'text': text,
        'fileName': filename,
        'fileSize': file_size,
        'paragraphCount': paragraph_count
    }


def validate_file(file_obj):
    """Validate uploaded file metadata and size without extracting content.

    Args:
        file_obj: Flask uploaded file object.

    Returns:
        dict: validation result {'valid': bool, 'error': str or None}.
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
        
        max_size_mb = 10
        max_size_bytes = max_size_mb * 1024 * 1024
        
        file_obj.seek(0, 2)
        file_size = file_obj.tell()
        file_obj.seek(0)
        
        if file_size > max_size_bytes:
            return {
                'valid': False,
                'error': f'File size exceeds {max_size_mb}MB limit'
            }
        
        return {'valid': True, 'error': None}
    
    except Exception as e:
        return {'valid': False, 'error': str(e)}
