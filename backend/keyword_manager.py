"""
关键词管理模块 - AI 驱动的关键词提取和解释功能
"""

from ai_service import AIService
from typing import List, Optional, Generator


class KeywordManager(AIService):
    """关键词管理器 - 提取关键词和生成解释"""

    def extract_smart(self, text: str) -> List[str]:
        """
        使用 OpenAI 进行智能关键词识别
        
        Args:
            text: 输入文本
            
        Returns:
            关键词列表
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
        """
        流式生成关键词解释（支持基于context的解释）
        
        Args:
            keyword: 要解释的关键词
            language: 解释的语言
            context: 关键词在原文中的前后文本上下文（可选）
            
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
            
            if context:
                user_message = f"""Based on this context from a document:

\"{context}\"

Please explain the keyword: {keyword}"""
            else:
                user_message = f"Explain this keyword: {keyword}"
        else:
            # 其他语言的解释
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
    """
    创建关键词管理器实例工厂函数
    
    Args:
        openai_api_key: OpenAI API 密钥
        
    Returns:
        KeywordManager 实例
    """
    return KeywordManager(openai_api_key)


# 向后兼容：保留旧的工厂函数名称
def create_extractor(openai_api_key: Optional[str] = None) -> KeywordManager:
    """向后兼容：旧的工厂函数名称"""
    return create_keyword_manager(openai_api_key)


def create_explainer(openai_api_key: Optional[str] = None) -> KeywordManager:
    """向后兼容：旧的工厂函数名称"""
    return create_keyword_manager(openai_api_key)
