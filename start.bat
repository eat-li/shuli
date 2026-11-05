@echo off
rem ============================================================
rem  Keep this file ASCII-only.
rem
rem  cmd.exe parses .bat using the console codepage captured when
rem  cmd starts, NOT the one set by a later `chcp`. Multi-byte text
rem  interpreted under the wrong codepage makes the trailing byte of
rem  a Chinese character swallow the CR, so two lines get glued
rem  together and the script dies with a meaningless
rem  "not recognized as a command".
rem
rem  All Chinese text is printed by the Node process instead, which
rem  always speaks UTF-8. Keep this launcher dumb and ASCII.
rem ============================================================
title Shuli
cd /d "%~dp0"

set "NODE_EXE="
if exist "runtime\node.exe" set "NODE_EXE=%CD%\runtime\node.exe"
if not defined NODE_EXE goto find_node
goto node_ready

:find_node
for /f "delims=" %%I in ('where node 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%I"
)
if not defined NODE_EXE goto no_node

:node_ready
rem Front-end bundle ships with the portable package. Only a source
rem checkout without a build needs to compile it here.
if exist "client\dist\index.html" goto check_deps
where pnpm >nul 2>nul
if errorlevel 1 goto no_dist
echo [setup] building front-end, first run takes about 20 seconds...
call pnpm install
if errorlevel 1 goto build_fail
call pnpm build
if errorlevel 1 goto build_fail
if not exist "client\dist\index.html" goto build_fail

:check_deps
if exist "server\node_modules" goto resolve_port
where pnpm >nul 2>nul
if errorlevel 1 goto no_dist
echo [setup] installing dependencies, please wait...
call pnpm install
if errorlevel 1 goto install_fail

rem Port comes from server\.env when present, otherwise 7788.
rem The server, this script and stop.bat all read the same file,
rem so there is exactly one place to change it.
:resolve_port
set "PORT="
if not exist "server\.env" goto default_port
for /f "usebackq tokens=1,* delims==" %%A in ("server\.env") do (
  if /i "%%A"=="PORT" set "PORT=%%B"
)
:default_port
if not defined PORT set "PORT=7788"

rem The server opens the browser itself once listen() succeeds.
rem A fixed sleep would open the page before the port is ready on
rem a slow machine, which looks like "the app is broken".
set "OPEN_BROWSER=1"
"%NODE_EXE%" "server\src\index.js"
echo.
echo [info] server stopped.
pause
exit /b 0

:no_node
echo.
echo [error] Node.js runtime not found.
echo   Portable package: make sure runtime\node.exe exists, and that you
echo   extracted the archive before running (running from inside a .zip
echo   never works).
echo   Source checkout: install Node.js from https://nodejs.org/
echo.
echo   See the plain-text readme in this folder for details.
echo.
pause
exit /b 1

:no_dist
echo.
echo [error] client\dist is missing and pnpm was not found.
echo   Portable package: extract the archive completely, then run again.
echo   Source checkout: install pnpm, then run pnpm install and pnpm build.
echo.
pause
exit /b 1

:install_fail
echo.
echo [error] dependency installation failed, check your network and retry.
echo.
pause
exit /b 1

:build_fail
echo.
echo [error] front-end build failed, see the output above.
echo.
pause
exit /b 1
