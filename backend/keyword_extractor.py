"""
关键词识别模块 - AI 驱动（OpenAI API）
"""

import re
from typing import List, Optional
from openai import OpenAI


class KeywordExtractor:
    """关键词提取器 - 仅使用 OpenAI API"""

    def __init__(self, openai_api_key: Optional[str] = None):
        """
        初始化提取器
        
        Args:
            openai_api_key: OpenAI API密钥
        """
        self.openai_client = OpenAI(api_key=openai_api_key) if openai_api_key else None

    def extract_smart(self, text: str) -> List[str]:
        """
        使用OpenAI进行智能关键词识别
        
        Args:
            text: 输入文本
            
        Returns:
            关键词列表
        """
        if not self.openai_client:
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

            response = self.openai_client.chat.completions.create(
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


def create_extractor(openai_api_key: Optional[str] = None) -> KeywordExtractor:
    """工厂函数 - 创建提取器实例"""
    return KeywordExtractor(openai_api_key)

