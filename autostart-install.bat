@echo off
rem ASCII-only on purpose: see the note at the top of start.bat.
title Shuli - install autostart
cd /d "%~dp0"

echo ================================================
echo   Install autostart
echo   (starts the server minimized after Windows login)
echo ================================================
echo.

rem The shortcut points straight at node.exe instead of cmd.exe:
rem   - no nested quotes in the arguments, so spaces in the path are fine
rem   - no lingering cmd window behind the console
rem Portable package uses runtime\node.exe; a source checkout falls back
rem to the system node (first absolute path reported by `where`).
set "NODE_EXE="
if exist "runtime\node.exe" set "NODE_EXE=%CD%\runtime\node.exe"
if not defined NODE_EXE goto find_node
goto create_link

:find_node
for /f "delims=" %%I in ('where node 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%I"
)
if not defined NODE_EXE goto no_node

:create_link
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Shuli.lnk';" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk);" ^
  "$s.TargetPath = '%NODE_EXE%';" ^
  "$s.Arguments = '\"server\src\index.js\"';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.WindowStyle = 7;" ^
  "$s.IconLocation = 'shell32.dll,13';" ^
  "$s.Description = 'Shuli: start local server after login (minimized, no browser)';" ^
  "$s.Save();" ^
  "Write-Host ('[done] startup shortcut created: ' + $lnk)"

echo.
set "PORT="
if not exist "server\.env" goto default_port
for /f "usebackq tokens=1,* delims==" %%A in ("server\.env") do (
  if /i "%%A"=="PORT" set "PORT=%%B"
)
:default_port
if not defined PORT set "PORT=7788"

echo   runtime : %NODE_EXE%
echo   address : http://localhost:%PORT%
echo.
echo   Bookmark that address. From now on the server runs in the
echo   background after login: just open the bookmark.
echo   Stop it with stop.bat, remove autostart with autostart-uninstall.bat
echo.
pause
exit /b 0

:no_node
echo [error] Node.js runtime not found, cannot install autostart.
echo   Portable package: make sure runtime\node.exe exists.
echo   Source checkout: install Node.js first.
echo.
pause
exit /b 1
