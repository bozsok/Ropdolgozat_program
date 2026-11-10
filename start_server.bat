@echo off
chcp 65001 > nul
title Okoskodó – Röpdolgozat Program Szerver (Port: 3000)

echo ================================================================
echo   Okoskodó – Helyi Hálózati Röpdolgozat Rendszer
echo   Windows Server Környezet (2016 / 2019 / 2022)
echo ================================================================
echo.

cd /d "%~dp0"

:: 1. Node.js jelenléti ellenőrzése
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [HIBA] A Node.js nem található a rendszerben!
    echo Kérlek telepítsd a hivatalos Node.js v22 LTS verziót a szerverre,
    echo vagy ellenőrizd a rendszer PATH környezeti változóját.
    echo.
    pause
    exit /b 1
)

:: 2. Node.js verzió ellenőrzése (minimum v22 LTS követelmény)
node -e "const v = parseInt(process.versions.node.split('.')[0]); if (v < 22) { console.error('[HIBA] Nem megfelelő Node.js verzió: v' + process.versions.node); console.error('A rendszerhez minimum Node.js v22.11.0 LTS szükséges!'); process.exit(1); }"
if %errorlevel% neq 0 (
    echo.
    echo [HIBA] A szerveren futó Node.js elavult a jobb teljesítményű SQLite motorhoz.
    echo Kérlek telepítsd fel a hivatalos Node.js v22.x LTS (x64) változatot!
    echo.
    pause
    exit /b 1
)

:: 3. node_modules csomag mappa ellenőrzése
if not exist "node_modules" (
    echo [HIBA] A 'node_modules' mappa nem található a program könyvtárában!
    echo A szerver 100%%-ban offline üzemű. Kérlek másold át a teljes
    echo telepítőcsomagot a fejlesztői gépről a 'node_modules' mappával együtt!
    echo.
    pause
    exit /b 1
)

:: 4. Adatmappák integritásának biztosítása
if not exist "data" (
    echo [INFO] 'data' mappa nem létezett, automatikus létrehozás...
    mkdir "data"
)
if not exist "data\uploads" (
    echo [INFO] 'data\uploads' mappa nem létezett, automatikus létrehozás...
    mkdir "data\uploads"
)

:: 5. Adatbázis ellenőrzése és inicializálása
echo Adatbázis ellenőrzése és séma érvényesítése...
node src/db/init.js
if %errorlevel% neq 0 (
    echo.
    echo [HIBA] Az adatbázis inicializálása vagy ellenőrzése hibára futott!
    echo Kérlek tekintsd át a fenti hibaüzenetet az elhárításhoz.
    echo.
    pause
    exit /b 1
)
echo.

:: 6. Webszerver indítása
echo Webszerver indítása a 3000-es porton...
node server.js
set SERVER_EXIT_CODE=%errorlevel%

echo.
if %SERVER_EXIT_CODE% neq 0 (
    echo [HIBA] A webszerver váratlanul leállt! (Kilépési kód: %SERVER_EXIT_CODE%)
    echo Kérlek ellenőrizd a fenti hibaüzenetet, vagy a hálózati port foglaltságát.
) else (
    echo A webszerver szabályosan leállt.
)

pause
