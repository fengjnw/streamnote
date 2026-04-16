"""AI-driven keyword extraction and explanation module."""

from ai_service import AIService
from typing import List, Optional, Generator


class KeywordManager(AIService):
    """Extract keywords and generate keyword explanations."""

    def extract_smart(self, text: str) -> List[str]:
        """Extract important keywords from input text.

        Args:
            text: Input text.

        Returns:
            List of extracted keywords.
        """
        if not self.client:
            print("[ERROR] OpenAI client not configured")
            return []

        try:
            prompt = """Extract the most important keywords, phrases, or concepts from the following text.

Requirements:
1. Prioritize domain-specific terms, unique concepts, and specific entities
2. Avoid generic words (is, are, important, different, etc.)
3. Return only truly essential content, don't list irrelevant items just to reach a number
4. Can be single words, phrases, or short sentences
5. Return format: comma-separated list, keywords only, no other content

Text:\n""" + text

            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{
                    "role": "user",
                    "content": prompt
                }],
                temperature=0.3,
                max_tokens=200
            )
            
            keywords_text = response.choices[0].message.content.strip()
            keywords = [kw.strip() for kw in keywords_text.split(",") if kw.strip()]
            
            return keywords
            
        except Exception as e:
            print(f"[ERROR] Smart extraction failed: {e}")
            return []

    def explain(
        self,
        keyword: str,
        language: str = "English",
        context: Optional[str] = None
    ) -> Generator[str, None, None]:
        """Stream a keyword explanation.

        Args:
            keyword: Keyword to explain.
            language: Explanation language.
            context: Optional surrounding context from source text.

        Yields:
            Streamed explanation chunks.
        """
        keyword = keyword.strip()
        
        if not keyword:
            return
        
        if language == "English":
            system_message = """You are an expert educator. Provide a clear, concise explanation of the following keyword/term.
Format: One paragraph (2-3 sentences maximum), explain what this term means and its context.
Keep it simple and suitable for students."""
            
            if context:
                user_message = f"""Based on this context from a document:

\"{context}\"

Please explain the keyword: {keyword}"""
            else:
                user_message = f"Explain this keyword: {keyword}"
        else:
            system_message = f"""You are an expert educator who speaks {language}. 
Provide a clear, concise explanation of the following keyword/term in {language}.
Format: One paragraph (2-3 sentences maximum), explain what this term means and its context.
Keep it simple and suitable for students."""
            
            if context:
                user_message = f"""基于以下文档中的上下文：

\"{context}\"

请用{language}解释这个关键词：{keyword}"""
            else:
                user_message = f"用{language}解释这个关键词：{keyword}"
        
        yield from self.stream_chat(
            system_message=system_message,
            user_message=user_message,
            temperature=0.7,
            max_tokens=150
        )


def create_keyword_manager(openai_api_key: Optional[str] = None) -> KeywordManager:
    """Factory for KeywordManager.

    Args:
        openai_api_key: OpenAI API key.

    Returns:
        KeywordManager instance.
    """
    return KeywordManager(openai_api_key)
