#!/bin/bash
# 启动 SearchNewsAgent 全栈服务
set -e

echo "[后端] 启动中..."
cd backend
# 创建虚拟环境（只需一次）
if [ ! -d venv ]; then
  python3 -m venv venv
fi
source venv/bin/activate
if [ -f requirements.txt ]; then
  pip install -r requirements.txt
fi
PYTHONPATH=.. uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
deactivate
cd ..

# 启动前端（Next.js, 默认3000端口）
echo "[前端] 启动中..."
cd frontend
if [ -f package.json ]; then
  npm install
fi
npm run dev &
FRONTEND_PID=$!
cd ..

echo "---\n服务已启动："
echo "  后端: http://localhost:8000/docs"
echo "  前端: http://localhost:3000/"
echo "[按 Ctrl+C 可全部停止]"

# 等待子进程
wait $BACKEND_PID $FRONTEND_PID
