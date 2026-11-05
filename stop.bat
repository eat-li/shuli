@echo off
chcp 65001 >nul
title 数理 - 停止服务
cd /d "%~dp0"

rem 端口与启动脚本同源：只从 server\.env 读，避免各处硬编码走散
set "PORT="
for /f "usebackq tokens=1,* delims==" %%A in ("server\.env") do (
  if /i "%%A"=="PORT" set "PORT=%%B"
)
if not defined PORT set "PORT=7788"

echo ================================================
echo   停止后台服务（%PORT% 打包版 / 5173 开发版）
echo ================================================
echo.

set FOUND=0
for %%P in (%PORT% 5173) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P" ^| findstr "LISTENING"') do (
    echo [停止] 端口 %%P 上的进程 PID=%%A
    taskkill /f /pid %%A >nul 2>nul
    set FOUND=1
  )
)

if "%FOUND%"=="0" (
  echo [信息] 没有在运行的服务（端口 %PORT% 与 5173 都空闲）
) else (
  echo.
  echo [完成] 服务已停止。重新使用请双击「start.bat」。
)

echo.
pause
