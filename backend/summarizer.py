"""
总结模块 - GPT 驱动的文本总结功能
"""

from ai_service import AIService
from typing import Optional, Generator


class Summarizer(AIService):
    """总结器 - 生成文本总结"""

    def summarize(
        self,
        text: str,
        language: str = "English"
    ) -> Generator[str, None, None]:
        """
        流式生成文本总结
        
        Args:
            text: 要总结的文本
            language: 总结的目标语言
            
        Yields:
            流式总结结果
        """
        text = text.strip()
        
        if not text or len(text) < 50:
            return
        
        system_message = f"""You are a professional note summariser.
Summarise the given text in {language}.
- Aim for 100-150 words
- Keep key points, remove redundancy
- Maintain clarity and structure
- Return plain text only, no prefix or explanation"""
        
        user_message = f"Summarise this text:\n{text}"
        
        yield from self.stream_chat(
            system_message=system_message,
            user_message=user_message,
            temperature=0.3,
            max_tokens=250
        )


def create_summarizer(openai_api_key: Optional[str] = None) -> Summarizer:
    """
    创建总结器实例工厂函数
    
    Args:
        openai_api_key: OpenAI API 密钥
        
    Returns:
        Summarizer 实例
    """
    return Summarizer(openai_api_key)
