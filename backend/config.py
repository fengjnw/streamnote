import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

FLASK_CONFIG = {
    "host": "0.0.0.0",
    "port": int(os.getenv("PORT", 5001)),  # Railway会设置PORT环境变量
    "debug": os.getenv("FLASK_DEBUG", "False").lower() == "true",  # 生产环境关闭debug
}