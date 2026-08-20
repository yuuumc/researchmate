@echo off
chcp 65001 >nul
cd /d %~dp0
title researchmate dev

echo ==========================================
echo   researchmate (研芯通) - 本地开发一键启动
echo ==========================================
echo.

REM 1. 检查 Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 https://nodejs.org
  pause
  exit /b 1
)

REM 2. 首次运行自动安装依赖
if not exist node_modules (
  echo [初始化] 首次运行，正在安装依赖（约 1-3 分钟）...
  call npm install
  if errorlevel 1 (
    echo [错误] npm install 失败，请检查网络后重试
    pause
    exit /b 1
  )
)

REM 3. 检查 .env（本项目用 .env，不是 .env.local）
if not exist .env (
  echo [错误] 未找到 .env 文件
  echo 请创建 .env 并填入：DEEPSEEK_API_KEY=sk-你的key
  pause
  exit /b 1
)
findstr /c:"DEEPSEEK_API_KEY=sk-" .env >nul
if errorlevel 1 (
  echo [警告] .env 中未检测到 DEEPSEEK_API_KEY=sk-... ，AI 对话会返回 401
  echo.
)

REM 4. 修正环境（仅本窗口会话内生效，不改系统设置）：
REM    - 清掉系统环境变量里的 DEEPSEEK_API_KEY：若它格式异常会遮蔽 .env 里的正确值（导致 401）
REM    - 固定本地 CORS 白名单为 localhost:5173，避免系统级生产白名单导致本地 403
set DEEPSEEK_API_KEY=
set ALLOWED_ORIGINS=http://localhost:5173

REM 5. 4 秒后自动打开浏览器
start "" /min cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:5173"

REM 6. 启动开发服务器（前端 + API 一体，关闭本窗口即停止）
echo 启动中：http://localhost:5173
echo 停止：直接关闭本窗口 或按 Ctrl+C
echo.
call npm run dev
pause
