@echo off
rem ASCII-only on purpose: see the note at the top of start.bat.
title Shuli - dev
cd /d "%~dp0"

echo ================================================
echo   Shuli  dev mode (Vite hot reload)
echo ================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto no_node

where pnpm >nul 2>nul
if errorlevel 1 goto try_pnpm
goto check_deps

:try_pnpm
echo [setup] pnpm not found, trying to enable it through corepack...
corepack enable >nul 2>nul
where pnpm >nul 2>nul
if errorlevel 1 goto no_pnpm

:check_deps
if exist "node_modules" goto start_dev
echo [setup] installing dependencies, please wait...
echo.
call pnpm install
if errorlevel 1 goto install_fail

:start_dev
rem Same env file as the launch scripts. Dev mode also uses the local
rem SQLite file (server\data\shuli.sqlite) - no database server needed.
set "PORT="
if not exist "server\.env" goto default_port
for /f "usebackq tokens=1,* delims==" %%A in ("server\.env") do (
  if /i "%%A"=="PORT" set "PORT=%%B"
)
:default_port
if not defined PORT set "PORT=7788"

echo [info] starting front-end and back-end...
echo    front-end: http://localhost:5173  (hot reload)
echo    back-end : http://localhost:%PORT%
echo    Ctrl+C or closing this window stops both.
echo.
call pnpm dev
echo.
echo [info] stopped.
pause
exit /b 0

:no_node
echo [error] Node.js not found. Install it from https://nodejs.org/
echo.
pause
exit /b 1

:no_pnpm
echo [error] could not enable pnpm. Run: npm install -g pnpm
echo.
pause
exit /b 1

:install_fail
echo [error] dependency installation failed, check your network and retry.
echo.
pause
exit /b 1
