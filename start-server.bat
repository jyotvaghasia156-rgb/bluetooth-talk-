@echo off
title BlueTalk Pro - Local Web Server
color 0A

echo ========================================================
echo       BLUETALK PRO - BLUETOOTH & WIRELESS WEB SERVER
echo ========================================================
echo.

:: Get Local IP Address
for /f "tokens=4" %%a in ('route print ^| findstr 0.0.0.0 ^| findstr /v "0.0.0.0.*0.0.0.0"') do (
    set LOCAL_IP=%%a
)

echo [*] Starting local web server...
echo [*] Laptop / Desktop URL:  http://localhost:8080
echo [*] Mobile Phone URL:      http://%LOCAL_IP%:8080
echo.
echo ========================================================
echo   Open the Mobile Phone URL in your phone's browser!
echo ========================================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"

pause
