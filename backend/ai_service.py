"""
AI 服务共享模块 - 处理与 OpenAI 的通用交互
"""

from openai import OpenAI
from typing import Optional, Callable, Generator


class AIService:
    """AI 服务基类 - 处理流式响应和通用 AI 操作"""

    def __init__(self, openai_api_key: Optional[str] = None):
        """
        初始化 AI 服务
        
        Args:
            openai_api_key: OpenAI API 密钥
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
        """
        流式调用 GPT 模型
        
        Args:
            system_message: 系统提示词
            user_message: 用户输入
            temperature: 温度参数 (0.0-2.0)
            max_tokens: 最大令牌数
            model: 使用的模型
            
        Yields:
            流式响应内容
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
        """
        非流式调用 GPT 模型（获取完整响应）
        
        Args:
            system_message: 系统提示词
            user_message: 用户输入
            temperature: 温度参数 (0.0-2.0)
            max_tokens: 最大令牌数
            model: 使用的模型
            
        Returns:
            模型响应文本
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
