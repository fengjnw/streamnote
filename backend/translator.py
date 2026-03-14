"""
翻译模块 - GPT 驱动的翻译功能
"""

from ai_service import AIService
from typing import List, Optional, Generator


class Translator(AIService):
    """翻译器 - 支持文本翻译和关键词列表翻译"""

    def translate_text(
        self,
        text: str,
        target_lang: str = "Chinese",
        context: str = ""
    ) -> Generator[str, None, None]:
        """
        流式翻译文本
        
        Args:
            text: 要翻译的文本
            target_lang: 目标语言
            context: 前文上下文，帮助改进翻译的准确性和连贯性
            
        Yields:
            流式翻译结果
        """
        if not text or len(text) < 1:
            return
        
        if context:
            system_message = f"You are a professional translator. Previous context for reference: '{context}'. Now translate the following text to {target_lang}, maintaining consistency with the context. Only provide the translation, no explanations."
        else:
            system_message = f"You are a professional translator. Translate the following text to {target_lang}. Only provide the translation, no explanations."
        user_message = text
        
        yield from self.stream_chat(
            system_message=system_message,
            user_message=user_message,
            temperature=0.3
        )

    def translate_keywords(
        self,
        keywords_text: str,
        target_lang: str = "Chinese"
    ) -> str:
        """
        翻译关键词列表（返回 JSON 数组）
        
        Args:
            keywords_text: 逗号分隔的关键词列表
            target_lang: 目标语言
            
        Returns:
            JSON 格式的翻译关键词数组
        """
        if not keywords_text or len(keywords_text) < 1:
            return "[]"
        
        keywords_list = [kw.strip() for kw in keywords_text.split(',') if kw.strip()]
        
        system_message = f"""You are a professional translator. You will receive a list of keywords/terms, one per line or comma-separated.
Your task: Translate EACH keyword/term to {target_lang}. 
CRITICAL: You must translate EVERY SINGLE keyword. Do not skip any or combine them.
Return ONLY a JSON array of translated keywords in the EXACT same order, nothing else.
Format: ["translation1", "translation2", "translation3", ...]"""
        
        user_message = ", ".join(keywords_list)
        
        return self.chat_completion(
            system_message=system_message,
            user_message=user_message,
            temperature=0.3
        )


def create_translator(openai_api_key: Optional[str] = None) -> Translator:
    """
    创建翻译器实例工厂函数
    
    Args:
        openai_api_key: OpenAI API 密钥
        
    Returns:
        Translator 实例
    """
    return Translator(openai_api_key)
