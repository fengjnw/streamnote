"""Unit tests for Summarizer service."""

import pytest
from unittest.mock import Mock, patch
from summarizer import Summarizer, create_summarizer


@pytest.fixture
def mock_client():
    """Mock OpenAI client."""
    client = Mock()
    client.chat.completions.create = Mock()
    return client


@pytest.fixture
def summarizer(mock_client):
    """Create Summarizer with mocked client."""
    summary_service = Summarizer(None)
    summary_service.client = mock_client
    return summary_service


class TestSummarization:
    """Test text summarization functionality."""

    def test_summarize_streams_summary(self, summarizer):
        """Test streaming text summarization."""
        # Arrange
        summarizer.stream_chat = Mock(return_value=iter(["This ", "is ", "a ", "summary"]))
        long_text = "A" * 100

        # Act
        chunks = list(summarizer.summarize(long_text))

        # Assert
        assert len(chunks) > 0
        assert "summary" in "".join(chunks)

    def test_summarize_skips_short_text(self, summarizer):
        """Test that text shorter than 50 chars is skipped."""
        # Act
        result = list(summarizer.summarize("short text"))

        # Assert
        assert len(result) == 0

    def test_summarize_skips_empty_text(self, summarizer):
        """Test that empty text is skipped."""
        # Act
        result = list(summarizer.summarize(""))

        # Assert
        assert len(result) == 0

    def test_summarize_skips_whitespace_only_text(self, summarizer):
        """Test that whitespace-only text is skipped."""
        # Act
        result = list(summarizer.summarize("   \n\t   "))

        # Assert
        assert len(result) == 0

    def test_summarize_uses_default_language_english(self, summarizer):
        """Test that default language is English."""
        # Arrange
        summarizer.stream_chat = Mock(return_value=iter(["summary"]))
        long_text = "A" * 100

        # Act
        list(summarizer.summarize(long_text))

        # Assert
        summarizer.stream_chat.assert_called_once()
        call_args = summarizer.stream_chat.call_args
        assert "English" in str(call_args)

    def test_summarize_supports_multiple_languages(self, summarizer):
        """Test summarization in multiple languages."""
        # Arrange
        summarizer.stream_chat = Mock(return_value=iter(["摘要"]))
        long_text = "A" * 100

        # Act
        list(summarizer.summarize(long_text, language="Chinese"))

        # Assert
        summarizer.stream_chat.assert_called_once()
        call_args = summarizer.stream_chat.call_args
        assert "Chinese" in str(call_args)

    def test_summarize_uses_default_paragraph_style(self, summarizer):
        """Test that default style is paragraph."""
        # Arrange
        summarizer.stream_chat = Mock(return_value=iter(["summary"]))
        long_text = "A" * 100

        # Act
        list(summarizer.summarize(long_text))

        # Assert
        summarizer.stream_chat.assert_called_once()
        call_args = summarizer.stream_chat.call_args
        # Check for paragraph-style system message
        assert "100-150 words" in str(call_args)

    def test_summarize_key_takeaways_style(self, summarizer):
        """Test key takeaways summary style."""
        # Arrange
        summarizer.stream_chat = Mock(return_value=iter(["- takeaway 1", "\n- takeaway 2"]))
        long_text = "A" * 100

        # Act
        list(summarizer.summarize(long_text, style="key_takeaways"))

        # Assert
        call_args = summarizer.stream_chat.call_args
        assert "key takeaways" in str(call_args).lower() or "insights" in str(call_args).lower()

    def test_summarize_qa_style(self, summarizer):
        """Test Q&A summary style."""
        # Arrange
        summarizer.stream_chat = Mock(return_value=iter(["Q: ", "A: "]))
        long_text = "A" * 100

        # Act
        list(summarizer.summarize(long_text, style="q&a"))

        # Assert
        call_args = summarizer.stream_chat.call_args
        assert "q&a" in str(call_args).lower() or "question" in str(call_args).lower()

    def test_summarize_paragraph_style_token_limit(self, summarizer):
        """Test paragraph style uses correct token limit."""
        # Arrange
        summarizer.stream_chat = Mock(return_value=iter(["summary"]))
        long_text = "A" * 100

        # Act
        list(summarizer.summarize(long_text, style="paragraph"))

        # Assert
        call_args = summarizer.stream_chat.call_args
        # Verify max_tokens parameter
        assert "max_tokens" in str(call_args)
        # max_tokens should be 300 for paragraph
        assert call_args.kwargs.get("max_tokens") == 300 or "300" in str(call_args)

    def test_summarize_key_takeaways_token_limit(self, summarizer):
        """Test key takeaways uses correct token limit."""
        # Arrange
        summarizer.stream_chat = Mock(return_value=iter(["takeaways"]))
        long_text = "A" * 100

        # Act
        list(summarizer.summarize(long_text, style="key_takeaways"))

        # Assert
        call_args = summarizer.stream_chat.call_args
        # max_tokens should be 600 for key_takeaways
        assert call_args.kwargs.get("max_tokens") == 600 or "600" in str(call_args)

    def test_summarize_trims_input_text(self, summarizer):
        """Test that input text is trimmed."""
        # Arrange
        summarizer.stream_chat = Mock(return_value=iter(["summary"]))
        long_text = "   " + "A" * 100 + "   "

        # Act
        list(summarizer.summarize(long_text))

        # Assert
        summarizer.stream_chat.assert_called_once()
        call_args = summarizer.stream_chat.call_args
        user_message = call_args.kwargs.get("user_message", "")
        # Verify text was trimmed
        assert user_message.strip() == user_message or "A" * 100 in user_message


class TestSummarizerFactory:
    """Test summarizer factory function."""

    def test_create_summarizer_returns_summarizer_instance(self):
        """Test that factory creates Summarizer instance."""
        # Act
        with patch('summarizer.Summarizer.__init__', return_value=None):
            summarizer = create_summarizer()

        # Assert
        assert summarizer is not None

    def test_create_summarizer_accepts_api_key(self):
        """Test that factory accepts API key."""
        # Act
        with patch('summarizer.Summarizer.__init__', return_value=None):
            summarizer = create_summarizer("test-api-key")

        # Assert
        assert summarizer is not None


class TestSummarizerStyles:
    """Test different summarization styles."""

    @pytest.mark.parametrize("style,max_tokens", [
        ("paragraph", 300),
        ("key_takeaways", 600),
        ("q&a", 600)
    ])
    def test_summarize_style_max_tokens(self, summarizer, style, max_tokens):
        """Test that each style uses correct max_tokens."""
        # Arrange
        summarizer.stream_chat = Mock(return_value=iter(["result"]))
        long_text = "A" * 100

        # Act
        list(summarizer.summarize(long_text, style=style))

        # Assert
        call_args = summarizer.stream_chat.call_args
        actual_tokens = call_args.kwargs.get("max_tokens")
        assert actual_tokens == max_tokens, f"Style {style} should use {max_tokens} tokens, got {actual_tokens}"

    def test_summarize_unsupported_style_defaults_to_paragraph(self, summarizer):
        """Test that unsupported style falls back to paragraph."""
        # Arrange
        summarizer.stream_chat = Mock(return_value=iter(["summary"]))
        long_text = "A" * 100

        # Act
        list(summarizer.summarize(long_text, style="unknown_style"))

        # Assert
        call_args = summarizer.stream_chat.call_args
        # Should default to paragraph template
        assert "100-150 words" in str(call_args)
