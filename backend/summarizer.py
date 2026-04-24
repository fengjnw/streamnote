"""GPT-based text summarization module."""

from ai_service import AIService
from typing import Optional, Generator


class Summarizer(AIService):
    """Generate text summaries."""

    def summarize(
        self,
        text: str,
        language: str = "English",
        style: str = "paragraph"
    ) -> Generator[str, None, None]:
        """Stream a summary for the given text.

        Args:
            text: Text to summarize.
            language: Target summary language.
            style: Summary style (paragraph, bullet_points, q&a).

        Yields:
            Streamed summary chunks.
        """
        text = text.strip()
        
        if not text or len(text) < 50:
            return
        
        style_prompts = {
            "paragraph": f"""You are a professional note summariser.
Summarise the given text in {language}.
- Aim for 100-150 words
- Keep key points, remove redundancy
- Maintain clarity and structure
- Keep response concise and under 300 tokens
- Return plain text only, no prefix or explanation""",
            
            "key_takeaways": f"""You are a professional note summariser.
Extract and present the key takeaways from the given text in {language}.
- Extract all important insights and takeaways
- Each takeaway should be concise but complete
- Start each with a dash (-)
- Focus on actionable insights and core concepts
- Keep total length under 600 tokens, be concise
- Return only the key takeaways, no prefix or explanation""",
            
            "q&a": f"""You are a professional note summariser.
Summarise the given text as Q&A format in {language}.
- Generate 3-5 important questions based on the content
- Provide comprehensive answers (2-3 sentences or a short paragraph)
- Format: Q: [question]\nA: [answer]
- Focus on core concepts and insights
- Keep total length under 600 tokens
- Return only Q&A pairs, no prefix or explanation"""
        }
        
        system_message = style_prompts.get(style, style_prompts["paragraph"])
        user_message = f"Summarise this text:\n{text}"
        
        max_tokens_map = {
            "paragraph": 300,
            "key_takeaways": 600,
            "q&a": 600
        }
        max_tokens = max_tokens_map.get(style, 300)
        
        yield from self.stream_chat(
            system_message=system_message,
            user_message=user_message,
            temperature=0.3,
            max_tokens=max_tokens
        )


def create_summarizer(openai_api_key: Optional[str] = None) -> Summarizer:
    """Factory for Summarizer.

    Args:
        openai_api_key: OpenAI API key.

    Returns:
        Summarizer instance.
    """
    return Summarizer(openai_api_key)
