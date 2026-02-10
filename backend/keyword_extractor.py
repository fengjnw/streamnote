"""
关键词识别模块
支持多种提取方法：TF-IDF、OpenAI API、领域知识库匹配
"""

import re
from collections import Counter
from typing import List, Dict, Optional
import nltk
from nltk.corpus import stopwords
from openai import OpenAI

# 确保下载必要的NLTK数据
try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords', quiet=True)


class KeywordExtractor:
    """关键词提取器 - 支持多种方法"""

    def __init__(self, openai_api_key: Optional[str] = None):
        """
        初始化提取器
        
        Args:
            openai_api_key: OpenAI API密钥，可选
        """
        self.stop_words = set(stopwords.words('english'))
        self.openai_client = OpenAI(api_key=openai_api_key) if openai_api_key else None

    def extract_fast(self, text: str, top_k: int = 5) -> List[str]:
        """
        快速提取关键词 (简单分词 + 词频)
        
        Args:
            text: 输入文本
            top_k: 返回前k个关键词
            
        Returns:
            关键词列表
        """
        if not text or len(text) < 10:
            return []

        # 简单分词：按空格和标点符号分割
        # 这样避免了依赖NLTK的punkt tokenizer
        tokens = re.findall(r'\b[a-zA-Z]+\b', text.lower())
        
        # 过滤停用词和短词
        candidates = [
            t for t in tokens 
            if t not in self.stop_words and len(t) > 2
        ]
        
        # 词频统计
        freq = Counter(candidates)
        
        # 返回前k个高频词
        return [kw for kw, _ in freq.most_common(top_k)]

    def extract_smart(self, text: str, context: Optional[str] = None, top_k: int = 5) -> List[str]:
        """
        使用OpenAI进行智能识别
        
        Args:
            text: 输入文本
            context: 上下文信息（如学科、主题）
            top_k: 返回前k个关键词
            
        Returns:
            关键词列表
        """
        if not self.openai_client:
            print("[WARNING] OpenAI client not configured, using fast extraction instead")
            return self.extract_fast(text, top_k)

        try:
            prompt = f"从以下文本中提取最多{top_k}个最重要的关键词或关键概念，用英文逗号分隔。只返回关键词，不要有其他内容。\n\n{text}"
            
            if context:
                prompt = f"背景：{context}\n\n" + prompt

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
            
            # 如果验证后没有关键词，返回快速提取的结果
            if not verified_keywords:
                print(f"[WARNING] No keywords verified in text, using fast extraction instead")
                return self.extract_fast(text, top_k)
            
            result = verified_keywords[:top_k]
            print(f"[KEYWORDS] Smart extraction (verified {len(verified_keywords)}/{len(raw_keywords)}): {result}")
            return result
            
        except Exception as e:
            print(f"[ERROR] Smart extraction failed: {e}")
            # 降级到快速提取
            return self.extract_fast(text, top_k)

    def extract_domain_keywords(
        self, 
        text: str, 
        domain_keywords: Dict[str, List[str]],
        top_k: int = 5
    ) -> List[str]:
        """
        基于领域知识库匹配关键词
        
        Args:
            text: 输入文本
            domain_keywords: 领域关键词库 {"domain_name": ["keyword1", "keyword2"]}
            top_k: 返回前k个关键词
            
        Returns:
            匹配到的关键词列表
        """
        text_lower = text.lower()
        matched = []
        
        # 遍历所有领域的关键词
        for domain, keywords in domain_keywords.items():
            for keyword in keywords:
                if keyword.lower() in text_lower:
                    matched.append(keyword)
        
        # 去重并返回前k个
        return list(set(matched))[:top_k]

    def extract_combined(
        self, 
        text: str, 
        use_openai: bool = True,
        domain_keywords: Optional[Dict[str, List[str]]] = None,
        top_k: int = 5
    ) -> Dict[str, List[str]]:
        """
        组合多种方法提取关键词
        
        Args:
            text: 输入文本
            use_openai: 是否使用OpenAI智能识别
            domain_keywords: 领域知识库
            top_k: 返回前k个关键词
            
        Returns:
            包含多种方法结果的字典
        """
        result = {
            "fast": self.extract_fast(text, top_k),
        }
        
        if use_openai and self.openai_client:
            result["smart"] = self.extract_smart(text, top_k=top_k)
        
        if domain_keywords:
            result["domain"] = self.extract_domain_keywords(text, domain_keywords, top_k)
        
        # 合并所有结果，去重
        all_keywords = set()
        for keywords in result.values():
            all_keywords.update(keywords)
        
        result["combined"] = list(all_keywords)[:top_k]
        
        return result


# 预定义的领域关键词库示例
DOMAIN_KEYWORDS = {
    "mathematics": [
        "derivative", "integral", "function", "variable", "equation",
        "theorem", "proof", "algorithm", "matrix", "vector"
    ],
    "biology": [
        "protein", "DNA", "RNA", "cell", "mutation", "photosynthesis",
        "enzyme", "organ", "mitochondria", "chromosome"
    ],
    "history": [
        "war", "revolution", "empire", "dynasty", "civilization",
        "treaty", "alliance", "conflict", "independence", "reform"
    ],
    "chemistry": [
        "molecule", "atom", "reaction", "compound", "element",
        "oxidation", "catalyst", "bond", "ion", "valence"
    ]
}


def create_extractor(openai_api_key: Optional[str] = None) -> KeywordExtractor:
    """工厂函数 - 创建提取器实例"""
    return KeywordExtractor(openai_api_key)
