@echo off
rem ASCII-only on purpose: see the note at the top of start.bat.
title Shuli - remove autostart
cd /d "%~dp0"

echo ================================================
echo   Remove autostart
echo ================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Shuli.lnk';" ^
  "if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host '[done] startup shortcut removed' } else { Write-Host '[info] no startup shortcut found (already removed?)' }"

echo.
echo   This only affects autostart. A running server keeps running:
echo   use stop.bat to end it.
echo.
pause
