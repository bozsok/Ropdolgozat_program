@echo off
chcp 65001 > nul
title Okoskodo - Frissitesi csomag keszitese

echo ================================================================
echo   Okoskodo - Offline Frissitesi Csomag Keszito (Otthoni gep)
echo ================================================================
echo.

cd /d "%~dp0"

if not exist "package.json" (
  echo [HIBA] A package.json nem talalhato ebben a mappaban!
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop'; " ^
  "$root = (Get-Location).Path; " ^
  "$pkg = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json; " ^
  "$ver = [string]$pkg.version; " ^
  "if (-not $ver) { throw 'Nem sikerult kiolvasni a verzioszamot a package.json fajlbol!' }; " ^
  "$zipName = 'Okoskodo_frissites_v' + $ver + '.zip'; " ^
  "$zipPath = Join-Path $root $zipName; " ^
  "$tempBase = (Get-Item -LiteralPath $env:TEMP).FullName.TrimEnd('\'); " ^
  "$stage = Join-Path $tempBase ('okoskodo_pkg_' + [guid]::NewGuid().ToString('N')); " ^
  "New-Item -ItemType Directory -Path $stage -Force | Out-Null; " ^
  "try { " ^
  "  foreach ($dir in @('src', 'public')) { " ^
  "    $srcDir = Join-Path $root $dir; " ^
  "    if (Test-Path -LiteralPath $srcDir) { Copy-Item -LiteralPath $srcDir -Destination (Join-Path $stage $dir) -Recurse -Force } " ^
  "  }; " ^
  "  $telepitesName = 'telep' + [char]0x00ED + 't' + [char]0x00E9 + 's.md'; " ^
  "  $files = @('server.js', 'package.json', 'package-lock.json', 'DATABASE_SCHEMA.sql', 'README.md', 'CHANGELOG.md', 'project-context.md', 'frissitsd_a_szervert.bat', $telepitesName); " ^
  "  foreach ($f in $files) { " ^
  "    $srcFile = Join-Path $root $f; " ^
  "    if (Test-Path -LiteralPath $srcFile) { Copy-Item -LiteralPath $srcFile -Destination (Join-Path $stage $f) -Force } " ^
  "  }; " ^
  "  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }; " ^
  "  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath -Force; " ^
  "  $sizeKb = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1KB, 1); " ^
  "  Write-Host ('[SIKER] Frissitesi csomag elkeszult: ' + $zipName + ' (' + $sizeKb + ' KB)'); " ^
  "  Write-Host '        Tartalom: csak a programfajlok (src, public, server.js, stb.).'; " ^
  "  Write-Host '        Kihagyva: data/, node_modules/, config.js, start_server.bat, scratch/.'; " ^
  "} finally { " ^
  "  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue } " ^
  "}"

if %errorlevel% neq 0 (
  echo.
  echo [HIBA] A frissitesi csomag keszitese sikertelen!
  pause
  exit /b 1
)

echo.
echo Kovetkezo lepes: Masold at az elkeszult .zip fajlt az iskolai szerver
echo C:\Ropdolgozat\ fokonyvtaraba, majd futtasd ott a frissitsd_a_szervert.bat fajlt!
echo.
pause
