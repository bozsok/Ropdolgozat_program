@echo off
chcp 65001 > nul
title Okoskodo - Szerver Frissitese

echo ================================================================
echo   Okoskodo - Offline Szerver Frissito (Windows Server 2016+)
echo ================================================================
echo.

set "DROP_ZIP="
if not "%~1"=="" set "DROP_ZIP=%~f1"

cd /d "%~dp0"

if not exist "package.json" (
  echo [HIBA] A package.json nem talalhato! Futtasd ezt a szkriptet a program fokonyvtarabol!
  pause
  exit /b 1
)

:: 1. Konfiguralt port kiolvasasa (alapertelmezett: 3000) es futasellenorzes
set "APP_PORT=3000"
if exist "config.js" (
  for /f "usebackq delims=" %%P in (`node -e "try{const c=require('./config.js'); if(c&&c.port) console.log(c.port);}catch(e){}" 2^>nul`) do set "APP_PORT=%%P"
)
netstat -ano | findstr ":%APP_PORT% " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 goto server_running
goto check_update

:server_running
echo [FIGYELEM] A szerver jelenleg FUT a(z) %APP_PORT%-es porton!
echo Kerlek elobb allitsd le a futo szervert ^(zard be a start_server.bat ablakot^),
echo majd inditsd ujra ezt a frissito szkriptet!
echo.
pause
exit /b 1

:check_update
if not exist "src\scripts\update_server.ps1" (
  echo [HIBA] A src\scripts\update_server.ps1 fajl nem talalhato!
  echo Kerlek masold at a legfrissebb src\scripts\update_server.ps1 fajlt is a szerverre!
  echo.
  pause
  exit /b 1
)

set "APP_ROOT=%~dp0"
if "%APP_ROOT:~-1%"=="\" set "APP_ROOT=%APP_ROOT:~0,-1%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%APP_ROOT%\src\scripts\update_server.ps1" -RootDir "%APP_ROOT%" -DropZip "%DROP_ZIP%"
set "UPD_ERR=%errorlevel%"
echo.
if "%UPD_ERR%"=="0" goto upd_ok
if "%UPD_ERR%"=="4" goto upd_cancel
if "%UPD_ERR%"=="7" goto upd_pending
if "%UPD_ERR%"=="8" goto upd_installed_pending
if "%UPD_ERR%"=="9" goto upd_critical
echo A frissites nem tortent meg ^(hibakod: %UPD_ERR%^). A .zip fajl megmaradt.
goto upd_end

:upd_ok
echo Most mar elindithatod a szervert a start_server.bat fajllal!
goto upd_end

:upd_cancel
echo A felhasznalo megszakitotta a muveletet.
goto upd_end

:upd_pending
echo [FIGYELEM] Korabbi felbeszakadt frissites fuggo jegyzeke miatt a muvelet megallt ^(hibakod: 7^).
echo Kerlek ellenorizd a fenti uzenetben jelzett jegyzeket es mentest, mielott ujra probalkozol!
goto upd_end

:upd_installed_pending
echo [FIGYELEM] Az uj verzio TELEPULT es elindult, de a fuggo allapotjegyzek zarolt maradt ^(kod: 8^)!
echo A biztonsagi mentes es a .zip csomag megorzésre kerult; ellenorizd a fenti utvonalakat!
goto upd_end

:upd_critical
echo [KRITIKUS HIBA] A visszagorgetes reszben sikertelen volt ^(hibakod: 9^)!
echo Ellenorizd az aktualis fajlokat es a fenti uzenetben megorzott biztonsagi mentest!

:upd_end
echo.
pause
exit /b %UPD_ERR%
