"""
全局配置模块 —— 从环境变量 / .env 文件加载所有系统参数。

所有配置项均可通过环境变量覆盖，支持 .env 文件自动加载。
在 backend 目录下创建 .env 文件即可完成本地开发配置。
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# 自动加载 backend/.env 文件中的环境变量
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)


class Settings:
    """
    应用级全局配置类。

    配置分组:
    - MongoDB: 数据库连接（Docker 部署时使用）
    - LLM: 大模型 Provider 选择与 API 密钥
    - Feishu: 飞书 Webhook 推送配置
    - Scheduler: 定时采集间隔
    - LLM Limits: 内容截断 Token 上限
    - Logging: 日志级别
    """

    # ---------- MongoDB（Docker 部署时可选） ----------
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB_NAME: str = os.getenv("MONGO_DB_NAME", "agent_news")

    # ---------- LLM Provider 配置 ----------
    # 可选值: "openai" | "anthropic"，决定调用哪个大模型 API
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai")

    # OpenAI 配置（支持自定义 Base URL 以兼容代理/中转服务）
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

    # Anthropic 配置
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-20241022")

    # ---------- 飞书 Webhook 推送 ----------
    FEISHU_WEBHOOK_URL: str = os.getenv("FEISHU_WEBHOOK_URL", "")
    FEISHU_WEBHOOK_SECRET: str = os.getenv("FEISHU_WEBHOOK_SECRET", "")  # 可选签名校验密钥

    # ---------- 定时采集调度 ----------
    # 自动采集间隔（分钟），APScheduler 使用
    FETCH_INTERVAL_MINUTES: int = int(os.getenv("FETCH_INTERVAL_MINUTES", "30"))

    # ---------- LLM 内容截断限制 ----------
    # 发送给 LLM 的最大 Token 数，防止超出上下文窗口或成本失控
    MAX_CONTENT_TOKENS: int = int(os.getenv("MAX_CONTENT_TOKENS", "4000"))

    # ---------- 日志级别 ----------
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")


# 全局单例，其他模块通过 `from backend.config import settings` 直接引用
settings = Settings()
