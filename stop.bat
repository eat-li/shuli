@echo off
rem ASCII-only on purpose: see the note at the top of start.bat.
title Shuli - stop
cd /d "%~dp0"

rem Port comes from server\.env, same file the server reads.
set "PORT="
if not exist "server\.env" goto default_port
for /f "usebackq tokens=1,* delims==" %%A in ("server\.env") do (
  if /i "%%A"=="PORT" set "PORT=%%B"
)
:default_port
if not defined PORT set "PORT=7788"

echo ================================================
echo   Stop Shuli  (port %PORT% and dev port 5173)
echo ================================================
echo.

set "FOUND=0"
for %%P in (%PORT% 5173) do (
  rem Trailing space matters: without it :7788 also matches 17788
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:":%%P " ^| findstr "LISTENING"') do (
    echo [stop] port %%P, PID=%%A
    taskkill /f /pid %%A >nul 2>nul
    set "FOUND=1"
  )
)

if "%FOUND%"=="0" (
  echo [info] nothing is running on port %PORT% or 5173
) else (
  echo.
  echo [done] server stopped.
)

echo.
pause
