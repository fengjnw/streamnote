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
        language: str = "English",
        style: str = "paragraph"
    ) -> Generator[str, None, None]:
        """
        流式生成文本总结
        
        Args:
            text: 要总结的文本
            language: 总结的目标语言
            style: 总结风格 (paragraph, bullet_points, q&a, tldr)
            
        Yields:
            流式总结结果
        """
        text = text.strip()
        
        if not text or len(text) < 50:
            return
        
        # 根据不同风格生成对应的system prompt
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
- Generate important questions based on the content
- Provide very concise answers (1 sentence max)
- Format: Q: [question]\nA: [answer]
- Focus on core concepts and insights
- Keep total length under 500 tokens, prioritize brevity
- Return only Q&A pairs, no prefix or explanation""",
            
            "tldr": f"""You are a professional note summariser.
Create a TLDR (Too Long; Didn't Read) summary in {language}.
- Summarise the entire content in exactly 1-2 sentences
- Capture the absolute most important points
- Be direct and concise
- Keep under 150 tokens
- Return only the TLDR, no prefix or explanation"""
        }
        
        system_message = style_prompts.get(style, style_prompts["paragraph"])
        user_message = f"Summarise this text:\n{text}"
        
        # 根据风格设置不同的 token 限制
        max_tokens_map = {
            "paragraph": 300,
            "key_takeaways": 600,
            "q&a": 600,
            "tldr": 150
        }
        max_tokens = max_tokens_map.get(style, 300)
        
        yield from self.stream_chat(
            system_message=system_message,
            user_message=user_message,
            temperature=0.3,
            max_tokens=max_tokens
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
