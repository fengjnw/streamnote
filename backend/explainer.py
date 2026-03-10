"""
关键词解释模块 - GPT 驱动的关键词解释功能
"""

from ai_service import AIService
from typing import Optional, Generator


class Explainer(AIService):
    """解释器 - 生成关键词解释"""

    def explain(
        self,
        keyword: str,
        language: str = "English"
    ) -> Generator[str, None, None]:
        """
        流式生成关键词解释
        
        Args:
            keyword: 要解释的关键词
            language: 解释的语言
            
        Yields:
            流式解释结果
        """
        keyword = keyword.strip()
        
        if not keyword:
            return
        
        if language == "English":
            # 英文解释
            system_message = """You are an expert educator. Provide a clear, concise explanation of the following keyword/term.
Format: One paragraph (2-3 sentences maximum), explain what this term means and its context.
Keep it simple and suitable for students."""
            user_message = f"Explain this keyword: {keyword}"
        else:
            # 其他语言的解释
            system_message = f"""You are an expert educator who speaks {language}. 
Provide a clear, concise explanation of the following keyword/term in {language}.
Format: One paragraph (2-3 sentences maximum), explain what this term means and its context.
Keep it simple and suitable for students."""
            user_message = f"Explain this keyword in {language}: {keyword}"
        
        yield from self.stream_chat(
            system_message=system_message,
            user_message=user_message,
            temperature=0.7,
            max_tokens=150
        )


def create_explainer(openai_api_key: Optional[str] = None) -> Explainer:
    """
    创建解释器实例工厂函数
    
    Args:
        openai_api_key: OpenAI API 密钥
        
    Returns:
        Explainer 实例
    """
    return Explainer(openai_api_key)
