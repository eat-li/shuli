@echo off
chcp 65001 >nul
title 数学老师综合管理后台 - 开发模式
cd /d "%~dp0"

echo ================================================
echo   数学老师综合管理后台  开发模式（Vite 热更新）
echo ================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto no_node

where pnpm >nul 2>nul
if errorlevel 1 goto try_pnpm

goto check_deps

:try_pnpm
echo [提示] 未检测到 pnpm，尝试通过 corepack 启用...
corepack enable >nul 2>nul
where pnpm >nul 2>nul
if errorlevel 1 goto no_pnpm

:check_deps
if exist "node_modules" goto start_dev
echo [信息] 首次运行，正在安装依赖，请稍候...
echo.
call pnpm install
if errorlevel 1 goto install_fail

:start_dev
rem 端口与 .env 同源；vite 代理也从同一个文件读后端端口
set "PORT="
for /f "usebackq tokens=1,* delims==" %%A in ("server\.env") do (
  if /i "%%A"=="PORT" set "PORT=%%B"
)
if not defined PORT set "PORT=7788"

echo [信息] 正在启动前后端开发服务...
echo    前端: http://localhost:5173  （改动源码即时生效）
echo    后端: http://localhost:%PORT%
echo    关闭本窗口或按 Ctrl+C 可同时停止前后端。
echo.
call pnpm dev
echo.
echo [信息] 服务已停止。
pause
exit /b 0

:no_node
echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org/
echo.
pause
exit /b 1

:no_pnpm
echo [错误] 无法启用 pnpm，请手动执行：npm install -g pnpm
echo.
pause
exit /b 1

:install_fail
echo [错误] 依赖安装失败，请检查网络后重试。
echo.
pause
exit /b 1
