@echo off
title Updating OffTrack...
echo ======================================================
echo                 Updating OffTrack
echo ======================================================
echo.
echo Pulling the latest updates from GitHub...
git pull origin main
echo.
echo Checking dependencies...
call npm install
echo.
echo OffTrack is up to date! Relaunching...
timeout /t 2 /nobreak >nul
start "" "OffTrack.bat"
exit
