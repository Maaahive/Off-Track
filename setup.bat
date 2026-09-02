@echo off
title OffTrack - Initial Setup
color 0A

echo ========================================================
echo               OffTrack Setup Wizard
echo ========================================================
echo.
echo Installing all required packages and dependencies...
echo (Includes Electron, FFmpeg, and YouTube audio engine)
echo.

call npm install

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Installation failed. Make sure Node.js is installed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo               Setup Complete! Starting OffTrack...
echo ========================================================
echo.

call npm start
