"""
PyInstaller 入口脚本 —— 用于打包 AgentNews 后端为独立可执行文件。

此脚本是 Electron 生产模式下后端的启动入口，负责:
1. 设置 PyInstaller 冻结环境下的路径
2. 加载用户 .env 配置
3. 挂载前端静态文件（由 STATIC_DIR 环境变量指定）
4. 启动 FastAPI/Uvicorn 服务
"""

from __future__ import annotations

import os
import sys


def _setup_frozen_env() -> None:
    """冻结模式下修正工作目录和模块搜索路径。"""
    if getattr(sys, "frozen", False):
        # PyInstaller 解压后的临时目录
        bundle_dir = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
        # 将 bundle 目录加入模块搜索路径（确保 backend.* 可被导入）
        if bundle_dir not in sys.path:
            sys.path.insert(0, bundle_dir)


def _load_env_file() -> None:
    """加载用户自定义 .env 文件（路径由 ENV_FILE_PATH 环境变量指定）。"""
    env_path = os.getenv("ENV_FILE_PATH")
    if env_path and os.path.isfile(env_path):
        try:
            from dotenv import load_dotenv  # type: ignore[import-untyped]

            load_dotenv(env_path, override=True)
            print(f"[Electron] 已加载配置: {env_path}")
        except ImportError:
            # dotenv 未打包，手动解析
            with open(env_path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, value = line.partition("=")
                        os.environ[key.strip()] = value.strip().strip("\"'")


def main() -> None:
    """主入口: 配置环境 → 导入后端 → 挂载静态文件 → 启动服务。"""
    _setup_frozen_env()
    _load_env_file()

    # 延迟导入，确保路径和环境变量已就绪
    import uvicorn  # type: ignore[import-untyped]

    from backend.main import app

    # 如果指定了 STATIC_DIR，挂载前端静态文件
    static_dir = os.getenv("STATIC_DIR")
    if static_dir and os.path.isdir(static_dir):
        from fastapi.staticfiles import StaticFiles  # type: ignore[import-untyped]

        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
        print(f"[Electron] 已挂载前端静态文件: {static_dir}")

    port = int(os.getenv("PORT", "8000"))
    host = "127.0.0.1"  # Electron 模式仅监听本地回环

    print(f"[Electron] 后端启动: http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
