from io import BytesIO

from file_processor import clean_text, extract_text_from_file, validate_file


def make_upload(filename: str, content: bytes):
    file_obj = BytesIO(content)
    file_obj.filename = filename
    return file_obj


def test_clean_text_normalizes_newlines_and_spaces():
    raw = "Line 1\r\n\r\nLine\t\t2   \rLine 3\n\n\n"
    cleaned = clean_text(raw)
    assert cleaned == "Line 1\n\nLine 2 \nLine 3"


def test_validate_file_rejects_unsupported_extension():
    upload = make_upload("notes.pdf", b"hello")
    result = validate_file(upload)
    assert result["valid"] is False
    assert "Unsupported file format" in result["error"]


def test_validate_file_accepts_supported_extension():
    upload = make_upload("notes.txt", b"hello")
    result = validate_file(upload)
    assert result == {"valid": True, "error": None}


def test_extract_text_from_file_returns_structured_payload():
    upload = make_upload("notes.md", b"Title\n\nParagraph 1\n\nParagraph 2")
    result = extract_text_from_file(upload)

    assert result["fileName"] == "notes.md"
    assert result["fileSize"] > 0
    assert result["text"] == "Title\n\nParagraph 1\n\nParagraph 2"
    assert result["paragraphCount"] == 3


def test_extract_text_from_file_raises_on_empty_name():
    upload = make_upload("", b"hello")
    try:
        extract_text_from_file(upload)
        assert False, "Expected ValueError for empty file name"
    except ValueError as error:
        assert "File name is empty" in str(error)
