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

    def extract_smart(self, text: str, context: Optional[str] = None, top_k: int = 5) -> List[str]:
        """
        使用OpenAI进行智能关键词识别
        
        Args:
            text: 输入文本
            context: 上下文信息（如学科、主题）
            top_k: 返回前k个关键词
            
        Returns:
            关键词列表
        """
        if not self.openai_client:
            print("[ERROR] OpenAI client not configured")
            return []

        try:
            prompt = f"Extract at most {top_k} most important keywords or key concepts from the following text, separated by English commas. Return only keywords without any other content.\n\n{text}"
            
            if context:
                prompt = f"Context: {context}\n\n" + prompt

            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{
                    "role": "user",
                    "content": prompt
                }],
                temperature=0.3,
                max_tokens=150
            )
            
            keywords_text = response.choices[0].message.content.strip()
            raw_keywords = [kw.strip() for kw in keywords_text.split(",") if kw.strip()]
            
            print(f"[KEYWORDS] Raw OpenAI response: {raw_keywords}")
            
            # 验证关键词并规范化大小写
            text_lower = text.lower()
            verified_keywords = []
            
            for kw in raw_keywords:
                kw_lower = kw.lower()
                
                # 方法1：尝试作为完整单词匹配（带词边界）
                match = re.search(rf'\b{re.escape(kw_lower)}\b', text_lower)
                if match:
                    # 使用文本中的实际大小写形式
                    actual_form = text[match.start():match.end()]
                    verified_keywords.append(actual_form)
                    continue
                
                # 方法2：如果是多词短语，允许不严格的匹配
                if ' ' in kw_lower:
                    match = text_lower.find(kw_lower)
                    if match != -1:
                        actual_form = text[match:match + len(kw_lower)]
                        verified_keywords.append(actual_form)
                        continue
                
                # 方法3：作为子字符串检查（最后的保险）
                match = text_lower.find(kw_lower)
                if match != -1:
                    actual_form = text[match:match + len(kw_lower)]
                    verified_keywords.append(actual_form)
            
            # 如果验证后没有关键词，返回空列表
            if not verified_keywords:
                print(f"[WARNING] No keywords verified in text")
                return []
            
            result = verified_keywords[:top_k]
            print(f"[KEYWORDS] Smart extraction (verified {len(verified_keywords)}/{len(raw_keywords)}): {result}")
            return result
            
        except Exception as e:
            print(f"[ERROR] Smart extraction failed: {e}")
            return []


def create_extractor(openai_api_key: Optional[str] = None) -> KeywordExtractor:
    """工厂函数 - 创建提取器实例"""
    return KeywordExtractor(openai_api_key)

