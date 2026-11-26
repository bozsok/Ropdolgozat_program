@echo off
chcp 65001 > nul
title Okoskodo - Szerver Frissitese

echo ================================================================
echo   Okoskodo - Offline Szerver Frissito (Windows Server 2016+)
echo ================================================================
echo.

cd /d "%~dp0"

if not exist "package.json" (
  echo [HIBA] A package.json nem talalhato! Futtasd ezt a szkriptet a program fokonyvtarabol!
  pause
  exit /b 1
)

:: 1. Fut-e jelenleg a szerver a 3000-es porton?
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
  echo [FIGYELEM] A szerver jelenleg FUT a 3000-es porton!
  echo Kerlek elobb allitsd le a futo szervert (zard be a start_server.bat ablakot),
  echo majd inditsd ujra ezt a frissito szkriptet!
  echo.
  pause
  exit /b 1
)

:: 2. Frissitesi csomag keresese, verzio-ellenorzes es biztonsagos frissites
set "DROP_ZIP=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop'; " ^
  "$root = (Get-Location).Path; " ^
  "$pkg = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json; " ^
  "$curVerStr = [string]$pkg.version; " ^
  "$curVer = [version]$curVerStr; " ^
  "$dropZip = $env:DROP_ZIP; " ^
  "$selectedZip = $null; " ^
  "$zipVerStr = $null; " ^
  "if ($dropZip -and (Test-Path -LiteralPath $dropZip)) { " ^
  "  $selectedZip = Get-Item -LiteralPath $dropZip; " ^
  "  if ($selectedZip.Name -match 'Okoskodo_frissites_v(\d+\.\d+\.\d+)\.zip$') { $zipVerStr = $Matches[1] } " ^
  "} else { " ^
  "  $candidates = Get-ChildItem -LiteralPath $root -Filter 'Okoskodo_frissites_v*.zip' -File | ForEach-Object { " ^
  "    if ($_.Name -match '^Okoskodo_frissites_v(\d+\.\d+\.\d+)\.zip$') { " ^
  "      [PSCustomObject]@{ File = $_; VerStr = $Matches[1]; Ver = [version]$Matches[1] } " ^
  "    } " ^
  "  } | Sort-Object Ver -Descending; " ^
  "  if ($candidates -and $candidates.Count -gt 0) { " ^
  "    $top = $candidates | Select-Object -First 1; " ^
  "    $selectedZip = $top.File; " ^
  "    $zipVerStr = $top.VerStr; " ^
  "  } " ^
  "}; " ^
  "if (-not $selectedZip) { " ^
  "  Write-Host '[HIBA] Nem talalhato Okoskodo_frissites_v*.zip fajl a fokonyvtarban!'; " ^
  "  Write-Host 'Masold ide az otthoni gepen elkeszitett .zip csomagot, majd probald ujra.'; " ^
  "  exit 2; " ^
  "}; " ^
  "if (-not $zipVerStr) { " ^
  "  Write-Host ('[HIBA] A kivalasztott fajl nevebol nem allapithato meg a verzioszam: ' + $selectedZip.Name); " ^
  "  exit 2; " ^
  "}; " ^
  "$zipVer = [version]$zipVerStr; " ^
  "Write-Host ('Jelenlegi szerver verzio : v' + $curVerStr); " ^
  "Write-Host ('Talalt frissitesi csomag : ' + $selectedZip.Name + ' (v' + $zipVerStr + ')'); " ^
  "Write-Host ''; " ^
  "if ($zipVer -lt $curVer) { " ^
  "  Write-Host ('[LEALLITVA] A csomag (v' + $zipVerStr + ') REGEBBI, mint a szerveren levo verzio (v' + $curVerStr + ')!'); " ^
  "  Write-Host 'Visszafele frissites (downgrade) adatbiztonsagi okbol nem engedelyezett.'; " ^
  "  Write-Host 'Egyetlen fajl sem kerult modositasra.'; " ^
  "  exit 3; " ^
  "}; " ^
  "if ($zipVer -eq $curVer) { " ^
  "  Write-Host ('[FIGYELEM] A szerveren mar a(z) v' + $curVerStr + ' verzio fut!'); " ^
  "  $ans = Read-Host 'Biztosan ujratelepited / felulirod ugyanezt a verziot? (I/N)'; " ^
  "  if ($ans -notin @('I','i','Y','y','igen','IGEN')) { Write-Host 'Frissites megszakitva.'; exit 4 } " ^
  "} else { " ^
  "  $ans = Read-Host ('Frissites inditasa: v' + $curVerStr + ' -> v' + $zipVerStr + '. Folytatod? (I/N)'); " ^
  "  if ($ans -notin @('I','i','Y','y','igen','IGEN')) { Write-Host 'Frissites megszakitva.'; exit 4 } " ^
  "}; " ^
  "$stage = Join-Path $env:TEMP ('okoskodo_upd_' + [guid]::NewGuid().ToString('N')); " ^
  "New-Item -ItemType Directory -Path $stage -Force | Out-Null; " ^
  "try { " ^
  "  Write-Host ''; " ^
  "  Write-Host '1/3 Csomag kicsomagolasa...'; " ^
  "  Expand-Archive -LiteralPath $selectedZip.FullName -DestinationPath $stage -Force; " ^
  "  Write-Host '2/3 Programfajlok frissitese (data/, node_modules/, config.js, start_server.bat erintetlen marad)...'; " ^
  "  $protected = @('data', 'node_modules', 'config.js', 'start_server.bat'); " ^
  "  Get-ChildItem -LiteralPath $stage -Force | ForEach-Object { " ^
  "    if ($protected -contains $_.Name.ToLower()) { return }; " ^
  "    $dest = Join-Path $root $_.Name; " ^
  "    if ($_.PSIsContainer) { " ^
  "      Copy-Item -LiteralPath $_.FullName -Destination $root -Recurse -Force; " ^
  "    } else { " ^
  "      Copy-Item -LiteralPath $_.FullName -Destination $dest -Force; " ^
  "    } " ^
  "  }; " ^
  "  Write-Host '3/3 Adatbazis-sema ellenorzese (node src/db/init.js)...'; " ^
  "  & node (Join-Path $root 'src\db\init.js'); " ^
  "  if ($LASTEXITCODE -ne 0) { throw 'Az adatbazis-sema ellenorzes hibaval leallt!' }; " ^
  "  Remove-Item -LiteralPath $selectedZip.FullName -Force; " ^
  "  Write-Host ''; " ^
  "  Write-Host ('[SIKER] A szerver sikeresen frissult a(z) v' + $zipVerStr + ' verziora!'); " ^
  "  Write-Host ('        A felhasznalt csomag (' + $selectedZip.Name + ') automatikusan torlesre kerult.'); " ^
  "} finally { " ^
  "  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue } " ^
  "}"

set "UPD_ERR=%errorlevel%"
echo.
if "%UPD_ERR%"=="0" (
  echo Most mar elindithatod a szervert a start_server.bat fajllal!
) else if "%UPD_ERR%"=="4" (
  echo A felhasznalo megszakitotta a muveletet.
) else (
  echo A frissites nem tortent meg (hibakod: %UPD_ERR%). A .zip fajl megmaradt.
)
echo.
pause
exit /b %UPD_ERR%
