@echo off
chcp 65001 >nul
title 数理 - 卸载开机自启
cd /d "%~dp0"

echo ================================================
echo   取消开机自启
echo ================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) '数理.lnk';" ^
  "if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host '[完成] 已移除开机自启快捷方式' } else { Write-Host '[信息] 没有找到自启快捷方式（可能已经卸载过）' }"

echo.
echo   （这只影响开机自启；正在运行的服务请用「stop.bat」结束）
echo.
pause
