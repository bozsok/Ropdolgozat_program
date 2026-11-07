@echo off
chcp 65001 > nul
title Ropdolgozat Program Szerver (Port: 3000)

echo ================================================================
echo   Ropdolgozat program - Helyi Halozati Ropdolgozat Rendszer
echo   Windows Server 2022 Kornyezet
echo ================================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [HIBA] A Node.js nem talalhato a rendszerben!
    echo Kerlek telepitsd a Node.js-t, vagy allitsd be a PATH valtozot.
    pause
    exit /b 1
)

echo Adatbazis ellenorzese...
node src/db/init.js
echo.

echo Webszerver inditasa a 3000-es porton...
node server.js

pause

