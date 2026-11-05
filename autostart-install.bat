@echo off
chcp 65001 >nul
title 数理 - 安装开机自启
cd /d "%~dp0"

echo ================================================
echo   安装开机自启
echo   （登录 Windows 后自动在后台启动服务，不弹浏览器）
echo ================================================
echo.

rem 快捷方式直接指向 cmd 启动 server，WorkingDirectory 设为项目根目录，
rem 这样 Arguments 里不需要嵌引号（路径含空格也不会出问题）。
rem WindowStyle=7 表示最小化窗口。
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) '数理.lnk';" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk);" ^
  "$s.TargetPath = 'cmd.exe';" ^
  "$s.Arguments = '/c pnpm --filter ./server start';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.WindowStyle = 7;" ^
  "$s.IconLocation = 'shell32.dll,13';" ^
  "$s.Description = '数理：登录后启动本地服务（最小化窗口，不开浏览器）';" ^
  "$s.Save();" ^
  "Write-Host ('[完成] 已创建开机自启快捷方式：' + $lnk)"

echo.
rem 端口与 .env 同源
set "PORT="
for /f "usebackq tokens=1,* delims==" %%A in ("server\.env") do (
  if /i "%%A"=="PORT" set "PORT=%%B"
)
if not defined PORT set "PORT=7788"

echo   访问地址：http://localhost:%PORT%
echo   建议把上面这个地址加进浏览器书签——以后开机自动在后台跑，点书签就能用。
echo   想停止服务：双击「stop.bat」
echo   想取消自启：双击「autostart-uninstall.bat」
echo.
pause
