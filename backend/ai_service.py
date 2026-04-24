"""Shared AI service helpers for OpenAI interactions."""

from openai import OpenAI
from typing import Optional, Callable, Generator


class AIService:
    """Base AI service with shared streaming and completion helpers."""

    def __init__(self, openai_api_key: Optional[str] = None):
        """Initialize the AI service client.

        Args:
            openai_api_key: OpenAI API key.
        """
        self.client = OpenAI(api_key=openai_api_key) if openai_api_key else None

    def stream_chat(
        self,
        system_message: str,
        user_message: str,
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
        model: str = "gpt-4o-mini"
    ) -> Generator[str, None, None]:
        """Call a chat model and stream response chunks.

        Args:
            system_message: System instruction.
            user_message: User input content.
            temperature: Sampling temperature (0.0-2.0).
            max_tokens: Optional maximum tokens.
            model: Model name.

        Yields:
            Streamed response content chunks.
        """
        if not self.client:
            raise RuntimeError("OpenAI client not configured")

        try:
            kwargs = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": user_message}
                ],
                "temperature": temperature,
                "stream": True
            }
            
            if max_tokens:
                kwargs["max_tokens"] = max_tokens
            
            stream = self.client.chat.completions.create(**kwargs)
            
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
                    
        except Exception as e:
            print(f"[ERROR] Stream error: {e}")
            yield f"[ERROR] {str(e)}"

    def chat_completion(
        self,
        system_message: str,
        user_message: str,
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
        model: str = "gpt-4o-mini"
    ) -> str:
        """Call a chat model and return a full response.

        Args:
            system_message: System instruction.
            user_message: User input content.
            temperature: Sampling temperature (0.0-2.0).
            max_tokens: Optional maximum tokens.
            model: Model name.

        Returns:
            Model response text.
        """
        if not self.client:
            raise RuntimeError("OpenAI client not configured")

        try:
            kwargs = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": user_message}
                ],
                "temperature": temperature
            }
            
            if max_tokens:
                kwargs["max_tokens"] = max_tokens
            
            response = self.client.chat.completions.create(**kwargs)
            return response.choices[0].message.content
            
        except Exception as e:
            print(f"[ERROR] Completion error: {e}")
            raise
