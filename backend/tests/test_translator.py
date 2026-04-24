"""Unit tests for Translator service."""

import pytest
from unittest.mock import Mock, patch
from translator import Translator, create_translator
import json


@pytest.fixture
def mock_client():
    """Mock OpenAI client."""
    client = Mock()
    client.chat.completions.create = Mock()
    return client


@pytest.fixture
def translator(mock_client):
    """Create Translator with mocked client."""
    translator_service = Translator(None)
    translator_service.client = mock_client
    return translator_service


class TestTextTranslation:
    """Test text translation functionality."""

    def test_translate_text_streams_translation(self, translator):
        """Test streaming text translation."""
        # Arrange
        translator.stream_chat = Mock(return_value=iter(["Hola ", "mundo"]))

        # Act
        chunks = list(translator.translate_text("Hello world", target_lang="Spanish"))

        # Assert
        assert len(chunks) > 0
        assert "".join(chunks) == "Hola mundo"

    def test_translate_text_with_context(self, translator):
        """Test translation with context."""
        # Arrange
        translator.stream_chat = Mock(return_value=iter(["translated"]))

        # Act
        result = list(translator.translate_text(
            "new text",
            target_lang="French",
            context="previous context"
        ))

        # Assert
        translator.stream_chat.assert_called_once()
        # Verify context was passed
        call_args = translator.stream_chat.call_args
        assert "context" in str(call_args).lower() or "previous" in str(call_args).lower()

    def test_translate_text_skips_empty_text(self, translator):
        """Test that empty text is skipped."""
        # Act
        result = list(translator.translate_text("", target_lang="Chinese"))

        # Assert
        assert len(result) == 0

    def test_translate_text_uses_default_language(self, translator):
        """Test that default language is Chinese."""
        # Arrange
        translator.stream_chat = Mock(return_value=iter(["你好"]))

        # Act
        list(translator.translate_text("Hello"))

        # Assert
        translator.stream_chat.assert_called_once()
        # Verify system message mentions Chinese
        call_args = translator.stream_chat.call_args
        assert "Chinese" in str(call_args)

    def test_translate_text_maintains_terminology_consistency(self, translator):
        """Test that context ensures terminology consistency."""
        # Arrange
        translator.stream_chat = Mock(return_value=iter(["translation"]))
        context = "machine learning"

        # Act
        list(translator.translate_text("model", target_lang="Spanish", context=context))

        # Assert
        translator.stream_chat.assert_called_once()
        call_args = translator.stream_chat.call_args
        assert "machine learning" in str(call_args)


class TestKeywordTranslation:
    """Test keyword translation functionality."""

    def test_translate_keywords_returns_json_array(self, translator, mock_client):
        """Test that keyword translation returns valid JSON array."""
        # Arrange
        keywords_json = '["espanol", "traducion"]'
        mock_response = Mock()
        mock_response.choices = [Mock(message=Mock(content=keywords_json))]
        translator.chat_completion = Mock(return_value=keywords_json)

        # Act
        result = translator.translate_keywords("spanish, translation", target_lang="Spanish")

        # Assert
        assert result == keywords_json
        # Verify it's valid JSON
        parsed = json.loads(result)
        assert isinstance(parsed, list)

    def test_translate_keywords_splits_comma_separated_list(self, translator):
        """Test that comma-separated keywords are properly split."""
        # Arrange
        keywords_json = '["python", "data", "science"]'
        translator.chat_completion = Mock(return_value=keywords_json)

        # Act
        result = translator.translate_keywords("python, data, science")

        # Assert
        translator.chat_completion.assert_called_once()
        call_args = translator.chat_completion.call_args
        # Verify user message contains all keywords
        assert "python, data, science" in str(call_args)

    def test_translate_keywords_trims_whitespace(self, translator):
        """Test that whitespace is trimmed from keywords."""
        # Arrange
        keywords_json = '["python", "data", "science"]'
        translator.chat_completion = Mock(return_value=keywords_json)

        # Act
        result = translator.translate_keywords("  python  ,  data  ,  science  ")

        # Assert
        # Verify trimmed keywords are used
        call_args = translator.chat_completion.call_args
        assert "python, data, science" in str(call_args)

    def test_translate_keywords_handles_empty_input(self, translator):
        """Test that empty input returns empty JSON array."""
        # Act
        result = translator.translate_keywords("")

        # Assert
        assert result == "[]"

    def test_translate_keywords_filters_empty_keywords(self, translator):
        """Test that empty keywords are filtered."""
        # Arrange
        keywords_json = '["python", "data"]'
        translator.chat_completion = Mock(return_value=keywords_json)

        # Act
        result = translator.translate_keywords("python, , data, ")

        # Assert
        call_args = translator.chat_completion.call_args
        assert "python, data" in str(call_args)


class TestTranslatorFactory:
    """Test translator factory function."""

    def test_create_translator_returns_translator_instance(self):
        """Test that factory creates Translator instance."""
        # Act
        with patch('translator.Translator.__init__', return_value=None):
            translator = create_translator()

        # Assert
        assert translator is not None

    def test_create_translator_accepts_api_key(self):
        """Test that factory accepts API key."""
        # Act
        with patch('translator.Translator.__init__', return_value=None):
            translator = create_translator("test-api-key")

        # Assert
        assert translator is not None
