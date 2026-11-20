@echo off
chcp 65001 > nul
title Okoskodo - Ropdolgozat Program Szerver

echo ================================================================
echo   Okoskodo - Helyi Halozati Ropdolgozat Rendszer
echo   Windows Server (2016 / 2019 / 2022)
echo ================================================================
echo.

cd /d "%~dp0"

:: 1. Node.js jelenleti ellenorzese
where node >nul 2>nul
if %errorlevel% neq 0 goto no_node

:: 2. Node.js verzio ellenorzese (minimum v22 LTS kovetelmeny)
node -e "process.exit(parseInt(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if %errorlevel% neq 0 goto old_node

:: 3. node_modules csomag mappa ellenorzese
if not exist "node_modules" goto no_modules

:: 4. Adatmappak letrehozasa, ha nem leteznek
if not exist "data" mkdir "data"
if not exist "data\uploads" mkdir "data\uploads"

:: 5. Adatbazis ellenorzese es inicializalasa
echo Adatbazis ellenorzese es sema ervenyesitese...
node src/db/init.js
if %errorlevel% neq 0 goto db_error
echo.

:: 6. Webszerver inditasa a 3000-es porton
echo Webszerver inditasa a 3000-es porton...
echo [TESZT OK]
goto server_ended

:no_node
echo.
echo [HIBA] A Node.js nem talalhato a rendszerben!
echo Kerlek telepisd a hivatalos Node.js v22 LTS verziot a szerverre!
echo.
pause
exit /b 1

:old_node
echo.
echo [HIBA] A szerveren futo Node.js elavult az SQLite motorhoz!
echo A rendszer futtatasahoz Node.js v22.x LTS szukseges.
echo.
pause
exit /b 1

:no_modules
echo.
echo [HIBA] A node_modules mappa nem talalhato!
echo A szerver 100%%-ban offline uzemu.
echo Kerlek masold at a node_modules mappat a fejlesztoi geprol!
echo.
pause
exit /b 1

:db_error
echo.
echo [HIBA] Az adatbazis inicializalasa hibara futott!
echo Tekintsd at a fenti hibauzenetet.
echo.
pause
exit /b 1

:server_ended
echo.
echo A webszerver szabalyosan leallt.
pause
