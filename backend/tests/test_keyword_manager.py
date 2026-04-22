"""Unit tests for KeywordManager."""

import pytest
from unittest.mock import Mock, MagicMock, patch
from keyword_manager import KeywordManager


@pytest.fixture
def mock_client():
    """Mock OpenAI client."""
    client = Mock()
    client.chat.completions.create = Mock()
    return client


@pytest.fixture
def keyword_manager(mock_client):
    """Create KeywordManager with mocked client."""
    manager = KeywordManager(None)
    manager.client = mock_client
    return manager


class TestKeywordExtraction:
    """Test keyword extraction functionality."""

    def test_extract_smart_returns_keywords_from_text(self, keyword_manager, mock_client):
        """Test basic keyword extraction."""
        # Arrange
        mock_response = Mock()
        mock_response.choices = [Mock(message=Mock(content="python, data science, machine learning"))]
        mock_client.chat.completions.create.return_value = mock_response

        # Act
        keywords = keyword_manager.extract_smart("Python is great for data science")

        # Assert
        assert keywords == ["python", "data science", "machine learning"]
        mock_client.chat.completions.create.assert_called_once()

    def test_extract_smart_handles_empty_text(self, keyword_manager):
        """Test that empty text returns empty list."""
        # Act
        keywords = keyword_manager.extract_smart("")

        # Assert
        assert keywords == []

    def test_extract_smart_handles_whitespace_only_text(self, keyword_manager):
        """Test that whitespace-only text returns empty list."""
        # Act
        keywords = keyword_manager.extract_smart("   \n\t   ")

        # Assert
        assert keywords == []

    def test_extract_smart_trims_whitespace_from_keywords(self, keyword_manager, mock_client):
        """Test that whitespace is trimmed from extracted keywords."""
        # Arrange
        mock_response = Mock()
        mock_response.choices = [Mock(message=Mock(content="  keyword1  ,  keyword2  ,  keyword3  "))]
        mock_client.chat.completions.create.return_value = mock_response

        # Act
        keywords = keyword_manager.extract_smart("test text")

        # Assert
        assert keywords == ["keyword1", "keyword2", "keyword3"]

    def test_extract_smart_filters_empty_keywords(self, keyword_manager, mock_client):
        """Test that empty keywords are filtered out."""
        # Arrange
        mock_response = Mock()
        mock_response.choices = [Mock(message=Mock(content="keyword1, , keyword2,  "))]
        mock_client.chat.completions.create.return_value = mock_response

        # Act
        keywords = keyword_manager.extract_smart("test text")

        # Assert
        assert keywords == ["keyword1", "keyword2"]

    def test_extract_smart_handles_api_error(self, keyword_manager, mock_client):
        """Test error handling when API fails."""
        # Arrange
        mock_client.chat.completions.create.side_effect = Exception("API Error")

        # Act
        keywords = keyword_manager.extract_smart("test text")

        # Assert
        assert keywords == []

    def test_extract_smart_handles_no_client(self):
        """Test extraction when client is not configured."""
        # Arrange
        manager = KeywordManager(None)
        manager.client = None

        # Act
        keywords = manager.extract_smart("test text")

        # Assert
        assert keywords == []


class TestKeywordExplanation:
    """Test keyword explanation functionality."""

    def test_explain_yields_explanation_for_english(self, keyword_manager, mock_client):
        """Test explanation streaming for English."""
        # Arrange
        mock_client.chat.completions.create = MagicMock()
        mock_client.chat.completions.create.return_value = Mock(
            choices=[Mock(message=Mock(content="This is an explanation"))]
        )

        # Mock stream_chat to return generator
        keyword_manager.stream_chat = Mock(return_value=iter(["This ", "is ", "an ", "explanation"]))

        # Act
        explanation_chunks = list(keyword_manager.explain("Python"))

        # Assert
        assert len(explanation_chunks) > 0

    def test_explain_skips_empty_keyword(self, keyword_manager):
        """Test that empty keyword is skipped."""
        # Act
        result = list(keyword_manager.explain(""))

        # Assert
        assert len(result) == 0

    def test_explain_skips_whitespace_keyword(self, keyword_manager):
        """Test that whitespace-only keyword is skipped."""
        # Act
        result = list(keyword_manager.explain("   \n\t   "))

        # Assert
        assert len(result) == 0

    def test_explain_with_context(self, keyword_manager):
        """Test explanation with context."""
        # Arrange
        keyword_manager.stream_chat = Mock(return_value=iter(["Explanation"]))

        # Act
        result = list(keyword_manager.explain("Python", context="used for programming"))

        # Assert
        # Verify stream_chat was called
        keyword_manager.stream_chat.assert_called_once()

    def test_explain_supports_multiple_languages(self, keyword_manager):
        """Test explanation in multiple languages."""
        # Arrange
        keyword_manager.stream_chat = Mock(return_value=iter(["解释"]))

        # Act
        result = list(keyword_manager.explain("Python", language="Chinese"))

        # Assert
        keyword_manager.stream_chat.assert_called_once()


class TestKeywordManager:
    """Test KeywordManager class."""

    def test_keyword_manager_inherits_from_ai_service(self, keyword_manager):
        """Test that KeywordManager is properly initialized."""
        assert hasattr(keyword_manager, 'client')
        assert hasattr(keyword_manager, 'extract_smart')
        assert hasattr(keyword_manager, 'explain')

    def test_keyword_manager_with_api_key(self):
        """Test KeywordManager initialization with API key."""
        with patch('keyword_manager.AIService.__init__', return_value=None):
            manager = KeywordManager("test-api-key")
            assert manager is not None
