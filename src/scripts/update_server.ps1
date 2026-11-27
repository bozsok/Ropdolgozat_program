param(
  [Parameter(Mandatory = $true)]
  [string]$RootDir,
  [string]$DropZip = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

# F4: Relativ -DropZip utvonal feloldasa a PowerShell aktualis munkamappajahoz kepest meg a gyokervaltas elott
if (-not [string]::IsNullOrWhiteSpace($DropZip) -and -not [System.IO.Path]::IsPathRooted($DropZip)) {
  $DropZip = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DropZip)
}
$root = (Resolve-Path -LiteralPath $RootDir).Path.TrimEnd('\')
# F2: Munkakonyvtar rogzitese a tenyleges telepitesi gyokerre, hogy relativ utvonalak soha ne csusszanak el!
Set-Location -LiteralPath $root
$pkgPath = Join-Path $root 'package.json'
if (-not (Test-Path -LiteralPath $pkgPath)) {
  Write-Host '[HIBA] A package.json nem talalhato a celkonyvtarban!'
  exit 1
}

$pkg = Get-Content -LiteralPath $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$curVerStr = [string]$pkg.version
$curVer = [version]$curVerStr

$selectedZip = $null
$zipVerStr = $null

if (-not [string]::IsNullOrWhiteSpace($DropZip)) {
  if (-not (Test-Path -LiteralPath $DropZip)) {
    Write-Host ('[HIBA] A megadott frissitesi csomag nem talalhato: ' + $DropZip)
    exit 2
  }
  $selectedZip = Get-Item -LiteralPath $DropZip
  if ($selectedZip.Name -match 'Okoskodo_frissites_v(\d+\.\d+\.\d+)\.zip$') {
    $zipVerStr = $Matches[1]
  }
} else {
  $candidates = @(
    Get-ChildItem -LiteralPath $root -Filter 'Okoskodo_frissites_v*.zip' -File | ForEach-Object {
      if ($_.Name -match '^Okoskodo_frissites_v(\d+\.\d+\.\d+)\.zip$') {
        [PSCustomObject]@{ File = $_; VerStr = $Matches[1]; Ver = [version]$Matches[1] }
      }
    } | Sort-Object Ver -Descending
  )
  if ($candidates.Count -gt 0) {
    $selectedZip = $candidates[0].File
    $zipVerStr = $candidates[0].VerStr
  }
}

if (-not $selectedZip) {
  Write-Host '[HIBA] Nem talalhato Okoskodo_frissites_v*.zip fajl a fokonyvtarban!'
  Write-Host 'Masold ide az otthoni gepen elkeszitett .zip csomagot, majd probald ujra.'
  exit 2
}

if (-not $zipVerStr) {
  Write-Host ('[HIBA] A kivalasztott fajl nevebol nem allapithato meg a verzioszam: ' + $selectedZip.Name)
  exit 2
}

$zipVer = [version]$zipVerStr
Write-Host ('Jelenlegi szerver verzio : v' + $curVerStr)
Write-Host ('Talalt frissitesi csomag : ' + $selectedZip.Name + ' (v' + $zipVerStr + ')')
Write-Host ''

if ($zipVer -lt $curVer) {
  Write-Host ('[LEALLITVA] A csomag (v' + $zipVerStr + ') REGEBBI, mint a szerveren levo verzio (v' + $curVerStr + ')!')
  Write-Host 'Visszafele frissites (downgrade) adatbiztonsagi okbol nem engedelyezett.'
  Write-Host 'Egyetlen fajl sem kerult modositasra.'
  exit 3
}

if ($zipVer -eq $curVer) {
  Write-Host ('[FIGYELEM] A szerveren mar a(z) v' + $curVerStr + ' verzio fut!')
  $ans = (Read-Host 'Biztosan ujratelepited / felulirod ugyanezt a verziot? (I/N)')
  if ($ans) { $ans = $ans.Trim().Trim([char]0xFEFF) }
  if ($ans -notin @('I', 'i', 'Y', 'y', 'igen', 'IGEN')) {
    Write-Host 'Frissites megszakitva.'
    exit 4
  }
} else {
  $ans = (Read-Host ('Frissites inditasa: v' + $curVerStr + ' -> v' + $zipVerStr + '. Folytatod? (I/N)'))
  if ($ans) { $ans = $ans.Trim().Trim([char]0xFEFF) }
  if ($ans -notin @('I', 'i', 'Y', 'y', 'igen', 'IGEN')) {
    Write-Host 'Frissites megszakitva.'
    exit 4
  }
}

# Tenyleges adatbazis-utvonal es port feloldasa a config.js / DB_PATH alapjan (F2: hibas config eseten ne essen vissza csendben!)
$liveDb = Join-Path $root 'data\ropdolgozat.db'
$livePort = 3000
$configPath = Join-Path $root 'config.js'
if (Test-Path -LiteralPath $configPath) {
  $prevEapCfg = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $cfgOut = (& node -e "const c = require(process.argv[1]); console.log(JSON.stringify({ dbPath: c && c.dbPath ? String(c.dbPath) : '', port: c && c.port ? Number(c.port) : 3000 }));" $configPath 2>&1)
  $cfgExit = $LASTEXITCODE
  $ErrorActionPreference = $prevEapCfg
  if ($cfgExit -ne 0) {
    Write-Host ('[HIBA] A helyi config.js beolvasasa sikertelen! A frissites biztonsagi okbol leallt: ' + ($cfgOut -join ' '))
    exit 5
  }
  $cfgJsonLine = ($cfgOut | Select-Object -Last 1)
  try {
    $parsedCfg = $cfgJsonLine | ConvertFrom-Json
    if ($parsedCfg.dbPath -and $parsedCfg.dbPath.Trim()) {
      $liveDb = $parsedCfg.dbPath.Trim()
    }
    if ($parsedCfg.port -and [int]$parsedCfg.port -gt 0) {
      $livePort = [int]$parsedCfg.port
    }
  } catch {
    Write-Host '[HIBA] A helyi config.js ervenytelen konfiguraciot adott vissza! A frissites leallt.'
    exit 5
  }
}
# F2: Kanonikus abszolut adatbazis-utvonal feloldasa a telepitesi gyokerhez kepest
if (-not [System.IO.Path]::IsPathRooted($liveDb)) {
  $liveDb = Join-Path $root $liveDb
}
$liveDb = [System.IO.Path]::GetFullPath($liveDb)
$hadLiveDb = Test-Path -LiteralPath $liveDb

# F2: Konfiguralt port ellenorzese kozvetlen PS1 inditas eseten is
try {
  $listening = (& netstat -ano 2>$null | Select-String -Pattern (':' + $livePort + '\s+.*LISTENING'))
  if ($listening) {
    Write-Host ('[FIGYELEM] A szerver jelenleg FUT a(z) ' + $livePort + '-as porton! Allitsd le elobb, majd futtasd ujra a frissitot.')
    exit 1
  }
} catch {}

# F3: Atomi frissitesi zar megszerzese (FileMode.CreateNew) es korabbi felbeszakadt muvelet szigoru megallitasa
$stateDir = Join-Path $root 'data\.okoskodo_update'
$lockFile = Join-Path $stateDir 'update.lock'
$pendingManifestFile = Join-Path $stateDir 'pending_rollback.json'
$lockAcquired = $false
if (-not (Test-Path -LiteralPath $stateDir)) {
  New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
}
$lockToken = [guid]::NewGuid().ToString('N')
$lockPayloadBytes = [System.Text.Encoding]::UTF8.GetBytes((@{ pid = $PID; token = $lockToken; startedAt = (Get-Date).ToString('o'); zip = $selectedZip.Name } | ConvertTo-Json))
for ($attempt = 1; $attempt -le 2; $attempt++) {
  try {
    $fsLock = [System.IO.File]::Open($lockFile, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
      $fsLock.Write($lockPayloadBytes, 0, $lockPayloadBytes.Length)
    } finally {
      $fsLock.Close()
    }
    $lockAcquired = $true
    break
  } catch [System.IO.IOException] {
    # F3: Konzervativ lock-vizsgalat: olvashatatlan/iras alatti zarat NEM torlunk elarvultkent!
    $existingPid = $null
    for ($readTry = 1; $readTry -le 2; $readTry++) {
      try {
        $lockData = Get-Content -LiteralPath $lockFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($lockData -and $lockData.pid -and ([int]$lockData.pid -gt 0)) {
          $existingPid = [int]$lockData.pid
          break
        }
      } catch {}
      if ($readTry -eq 1) { Start-Sleep -Milliseconds 250 }
    }
    if (-not $existingPid) {
      Write-Host '[HIBA] Aktiv vagy olvashatatlan frissitesi zar talalhato (update.lock)! A frissites biztonsagi okbol leallt.'
      exit 1
    }
    if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
      Write-Host ('[HIBA] Mar fut egy masik frissitesi folyamat (PID: ' + $existingPid + ')! Vard meg a befejezeset.')
      exit 1
    }
    if ($attempt -eq 1) {
      # Kizarolag igazoltan halott PID eseten tavolitjuk el az elarvult zarat, majd ismetelt atomi proba
      Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
    } else {
      Write-Host '[HIBA] Nem sikerult atomi frissitesi zarat szerezni (parhuzamos inditas gyanuja)!'
      exit 1
    }
  }
}

# F3: A teljes zarolt szakaszt egyetlen kulso try/finally keret vedi, hogy barmilyen korai hiba vagy kivetel felszabaditsa a sajat zarat!
try {

if (Test-Path -LiteralPath $pendingManifestFile) {
  Write-Host '[HIBA] Korabbi felbeszakadt frissites fuggo jegyzeke talalhato! Uj frissites nem indithato a korabbi allapot rendezese elott.'
  Write-Host ('       Jegyzek helye: ' + $pendingManifestFile)
  try {
    $pm = Get-Content -LiteralPath $pendingManifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($pm.rollbackDir) { Write-Host ('       Megorzott mentes: ' + $pm.rollbackDir) }
    if ($pm.fromVersion -and $pm.toVersion) { Write-Host ('       Megszakadt muvelet: v' + $pm.fromVersion + ' -> v' + $pm.toVersion) }
  } catch {}
  exit 7
}

# F1: Zar megszerzese UTANI kotelezo ujraellenorzes (TOCTOU vedelem: a jovahagyas alatt nem valtozhatott meg a verzio/config/port!)
$lockedPkg = Get-Content -LiteralPath $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$lockedVerStr = [string]$lockedPkg.version
$lockedVer = [version]$lockedVerStr
if ($lockedVerStr -ne $curVerStr -or $zipVer -lt $lockedVer) {
  Write-Host ('[LEALLITVA] A szerver verzioja idokozben megvaltozott (v' + $curVerStr + ' -> v' + $lockedVerStr + ')! A csomag (v' + $zipVerStr + ') nem telepitheto.')
  exit 3
}
if (Test-Path -LiteralPath $configPath) {
  $prevEapCfg2 = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $cfgOut2 = (& node -e "const c = require(process.argv[1]); console.log(JSON.stringify({ dbPath: c && c.dbPath ? String(c.dbPath) : '', port: c && c.port ? Number(c.port) : 3000 }));" $configPath 2>&1)
  $cfgExit2 = $LASTEXITCODE
  $ErrorActionPreference = $prevEapCfg2
  if ($cfgExit2 -ne 0) {
    Write-Host '[HIBA] A helyi config.js zarolas utani beolvasasa sikertelen!'
    exit 5
  }
  $parsedCfg2 = ($cfgOut2 | Select-Object -Last 1) | ConvertFrom-Json
  $liveDb = if ($parsedCfg2.dbPath -and $parsedCfg2.dbPath.Trim()) { $parsedCfg2.dbPath.Trim() } else { Join-Path $root 'data\ropdolgozat.db' }
  if (-not [System.IO.Path]::IsPathRooted($liveDb)) { $liveDb = Join-Path $root $liveDb }
  $liveDb = [System.IO.Path]::GetFullPath($liveDb)
  $livePort = if ($parsedCfg2.port -and [int]$parsedCfg2.port -gt 0) { [int]$parsedCfg2.port } else { 3000 }
}
$hadLiveDb = Test-Path -LiteralPath $liveDb
try {
  $listening2 = (& netstat -ano 2>$null | Select-String -Pattern (':' + $livePort + '\s+.*LISTENING'))
  if ($listening2) {
    Write-Host ('[FIGYELEM] A szerver idokozben elindult a(z) ' + $livePort + '-as porton! Frissites leallitva.')
    exit 1
  }
} catch {}

# F1 & F2: Kozos, kizarolag loopback (127.0.0.1) interfeszre kotott, pipe-deadlock mentes inditasi fustproba
function Invoke-ServerSmokeTest {
  param(
    [string]$WorkDir,
    [string]$NodeModulesDir,
    [string]$DbPathOverride = '',
    [string]$UploadsDirOverride = '',
    [int]$FallbackPort = 0,
    [string]$Label = 'szerver'
  )
  $tcpProbe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
  $tcpProbe.Start()
  $smokePort = ([System.Net.IPEndPoint]$tcpProbe.LocalEndpoint).Port
  $tcpProbe.Stop()

  $outLog = Join-Path $tempBase ('okoskodo_smoke_out_' + [guid]::NewGuid().ToString('N') + '.log')
  $errLog = Join-Path $tempBase ('okoskodo_smoke_err_' + [guid]::NewGuid().ToString('N') + '.log')

  $prevHost = $env:HOST
  $prevPort = $env:PORT
  $prevDb = $env:DB_PATH
  $prevUp = $env:UPLOADS_DIR
  $prevNm = $env:NODE_PATH
  $smokeProc = $null
  try {
    $env:HOST = '127.0.0.1'
    $env:PORT = [string]$smokePort
    if ($DbPathOverride) { $env:DB_PATH = $DbPathOverride }
    if ($UploadsDirOverride) { $env:UPLOADS_DIR = $UploadsDirOverride }
    if ($NodeModulesDir) { $env:NODE_PATH = $NodeModulesDir }

    $smokeProc = Start-Process -FilePath 'node' -ArgumentList @('"' + (Join-Path $WorkDir 'server.js') + '"') -WorkingDirectory $WorkDir -NoNewWindow -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    $smokeOk = $false
    $portsToCheck = @($smokePort)
    if ($FallbackPort -gt 0 -and $FallbackPort -ne $smokePort) { $portsToCheck += $FallbackPort }

    $deadline = (Get-Date).AddSeconds(7)
    while ((Get-Date) -lt $deadline) {
      if ($smokeProc.HasExited) {
        $errTxt = ''
        if (Test-Path -LiteralPath $errLog) { $errTxt = (Get-Content -LiteralPath $errLog -Raw -ErrorAction SilentlyContinue) }
        throw ('A(z) ' + $Label + ' server.js inditaskor hibaval leallt (exit ' + $smokeProc.ExitCode + '): ' + ([string]$errTxt).Trim())
      }
      foreach ($pCheck in $portsToCheck) {
        try {
          $resp = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $pCheck + '/') -UseBasicParsing -TimeoutSec 1
          if (-not $smokeProc.HasExited -and $resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
            $smokeOk = $true
            break
          }
        } catch {}
      }
      if ($smokeOk) { break }
      Start-Sleep -Milliseconds 250
    }
    if (-not $smokeOk) {
      $errTxt = ''
      if (Test-Path -LiteralPath $errLog) { $errTxt = (Get-Content -LiteralPath $errLog -Raw -ErrorAction SilentlyContinue) }
      throw ('A(z) ' + $Label + ' server.js nem valaszolt a loopback fustproba soran! ' + ([string]$errTxt).Trim())
    }
  } finally {
    if ($smokeProc -and -not $smokeProc.HasExited) {
      try { $smokeProc.Kill(); $smokeProc.WaitForExit(3000) | Out-Null } catch {}
    }
    $env:HOST = $prevHost
    $env:PORT = $prevPort
    $env:DB_PATH = $prevDb
    $env:UPLOADS_DIR = $prevUp
    $env:NODE_PATH = $prevNm
    if (Test-Path -LiteralPath $outLog) { Remove-Item -LiteralPath $outLog -Force -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $errLog) { Remove-Item -LiteralPath $errLog -Force -ErrorAction SilentlyContinue }
  }
}

# Rövid Windows (8.3) TEMP útvonal feloldása kanonikus hosszú névre még a kicsomagolás előtt
$tempBase = (Get-Item -LiteralPath $env:TEMP).FullName.TrimEnd('\')
$uid = [guid]::NewGuid().ToString('N')
$stage = Join-Path $tempBase ('okoskodo_upd_' + $uid)
$rollbackDir = Join-Path $tempBase ('okoskodo_rb_' + $uid)
$dryRunDir = Join-Path $tempBase ('okoskodo_dry_' + $uid)
$protected = @('data', 'node_modules', 'config.js', 'start_server.bat', 'frissitsd_a_szervert.bat')
$liveModified = $false
$keepRollback = $false
$addedRelFiles = @()
$addedRelDirs = @()

try {
  Write-Host ''
  Write-Host '1/5 Csomag kicsomagolasa es eloellenorzese...'
  [System.IO.Compression.ZipFile]::ExtractToDirectory($selectedZip.FullName, $stage)
  # Rövid Windows (8.3) TEMP útvonal feloldása kanonikus hosszú névre, hogy a relatív útvonalszámítás 100%-osan pontos legyen
  $stage = (Get-Item -LiteralPath $stage).FullName.TrimEnd('\')

  # F1: Kotelezo csomagelemek letezesenek ES tenyleges tipusanak (konyvtar vs. fajl) ellenorzese
  foreach ($reqDir in @('src', 'public')) {
    if (-not (Test-Path -LiteralPath (Join-Path $stage $reqDir) -PathType Container)) {
      throw ('Hianyos vagy serult frissitesi csomag: hianyzik vagy nem konyvtar a kotelezo elem: ' + $reqDir)
    }
  }
  foreach ($reqFile in @('server.js', 'package.json', 'DATABASE_SCHEMA.sql')) {
    if (-not (Test-Path -LiteralPath (Join-Path $stage $reqFile) -PathType Leaf)) {
      throw ('Hianyos vagy serult frissitesi csomag: hianyzik vagy nem fajl a kotelezo elem: ' + $reqFile)
    }
  }

  $stagePkg = Get-Content -LiteralPath (Join-Path $stage 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([string]$stagePkg.version -ne $zipVerStr) {
    throw ('Verzio-elteres a csomagon belul! Fajlnev: v' + $zipVerStr + ', package.json: v' + [string]$stagePkg.version)
  }

  Write-Host '2/5 Biztonsagi visszagorgetesi mentes keszitese (fajlszintu leltarral)...'
  New-Item -ItemType Directory -Path (Join-Path $rollbackDir 'app') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $rollbackDir 'data') -Force | Out-Null

  $stageItems = @(Get-ChildItem -LiteralPath $stage -Force | Where-Object { $protected -notcontains $_.Name.ToLower() })

  # Minden erintett relativ fajl es konyvtar pontos leltarozasa + fajl/konyvtar tipusutkozes ellenorzese!
  $stageRootPrefix = $stage + '\'
  foreach ($si in $stageItems) {
    $liveTarget = Join-Path $root $si.Name
    if (Test-Path -LiteralPath $liveTarget) {
      $liveItem = Get-Item -LiteralPath $liveTarget
      if ($si.PSIsContainer -ne $liveItem.PSIsContainer) {
        throw ('Fajl/konyvtar tipusutkozes a celhelyen: ' + $si.Name)
      }
      Copy-Item -LiteralPath $liveTarget -Destination (Join-Path $rollbackDir 'app') -Recurse -Force
    }
    if ($si.PSIsContainer) {
      $relTop = $si.Name
      if (-not (Test-Path -LiteralPath (Join-Path $root $relTop))) { $addedRelDirs += $relTop }
      Get-ChildItem -LiteralPath $si.FullName -Recurse -Force | ForEach-Object {
        $rel = $_.FullName.Substring($stageRootPrefix.Length)
        $dstPath = Join-Path $root $rel
        if (Test-Path -LiteralPath $dstPath) {
          $dstItem = Get-Item -LiteralPath $dstPath
          if ($_.PSIsContainer -ne $dstItem.PSIsContainer) {
            throw ('Fajl/konyvtar tipusutkozes a celhelyen: ' + $rel)
          }
        } else {
          if ($_.PSIsContainer) { $addedRelDirs += $rel } else { $addedRelFiles += $rel }
        }
      }
    } else {
      if (-not (Test-Path -LiteralPath $liveTarget)) { $addedRelFiles += $si.Name }
    }
  }

  if ($hadLiveDb) {
    foreach ($suf in @('', '-wal', '-shm')) {
      $p = $liveDb + $suf
      if (Test-Path -LiteralPath $p) {
        Copy-Item -LiteralPath $p -Destination (Join-Path $rollbackDir ('data\db_backup' + $suf)) -Force
      }
    }
  }

  Write-Host '3/5 Izolalt adatbazis-sema proba az eles fajlok modositasa elott...'
  New-Item -ItemType Directory -Path (Join-Path $dryRunDir 'data\uploads') -Force | Out-Null
  $dryDb = Join-Path $dryRunDir 'data\ropdolgozat.db'
  if ($hadLiveDb) {
    foreach ($suf in @('', '-wal', '-shm')) {
      $p = $liveDb + $suf
      if (Test-Path -LiteralPath $p) {
        Copy-Item -LiteralPath $p -Destination ($dryDb + $suf) -Force
      }
    }
  }

  # Szigoruan izolalt config.js a semaprobahoz, hogy rogzitett helyi config.js mellett se nyulhasson az eles DB-hez!
  $dryUploads = Join-Path $dryRunDir 'data\uploads'
  $dryDiag = Join-Path $dryRunDir 'data\diagnostics'
  $isolatedConfigJs = "module.exports = { port: parseInt(process.env.PORT || '3000', 10), adminPin: 'admin123', cookieSecret: 'okoskodo-smoke-secret', cookieName: 'ropdolgozat_admin_auth', dbPath: " + ($dryDb | ConvertTo-Json) + ", uploadsDir: " + ($dryUploads | ConvertTo-Json) + ", publicDir: " + ((Join-Path $stage 'public') | ConvertTo-Json) + ", diagnosticsDir: " + ($dryDiag | ConvertTo-Json) + ", defaultGradeThresholds: { 2: 30, 3: 55, 4: 75, 5: 90 } };"
  $isolatedConfigJs | Set-Content -LiteralPath (Join-Path $stage 'config.js') -Encoding UTF8

  $prevDbPath = $env:DB_PATH
  $prevUpDir = $env:UPLOADS_DIR
  $prevNodePath = $env:NODE_PATH
  try {
    $env:DB_PATH = $dryDb
    $env:UPLOADS_DIR = $dryUploads
    $env:NODE_PATH = (Join-Path $root 'node_modules')
    & node (Join-Path $stage 'src\db\init.js') | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw 'Az izolalt adatbazis-sema proba hibaval leallt! Az eles szerver erintetlen maradt.'
    }
    & node --check (Join-Path $stage 'server.js') | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw 'A csomagban levo server.js szintaxis-ellenorzese hibaval leallt!'
    }

    # F1 & F2: Izolalt staging inditasi fustproba (kizarolag 127.0.0.1 loopbacken!)
    Invoke-ServerSmokeTest -WorkDir $stage -NodeModulesDir (Join-Path $root 'node_modules') -DbPathOverride $dryDb -UploadsDirOverride $dryUploads -Label 'staging'
  } finally {
    $env:DB_PATH = $prevDbPath
    $env:UPLOADS_DIR = $prevUpDir
    $env:NODE_PATH = $prevNodePath
    if (Test-Path -LiteralPath (Join-Path $stage 'config.js')) {
      Remove-Item -LiteralPath (Join-Path $stage 'config.js') -Force -ErrorAction SilentlyContinue
    }
  }

  # F2: Tartos visszagorgetesi allapotjegyzek rogzitese az eles fajlok elso modositasa elott
  $manifestObj = @{
    timestamp = (Get-Date).ToString('o')
    rootDir = $root
    rollbackDir = $rollbackDir
    fromVersion = $curVerStr
    toVersion = $zipVerStr
    zipName = $selectedZip.Name
    liveDb = $liveDb
    hadLiveDb = $hadLiveDb
    addedRelFiles = $addedRelFiles
    addedRelDirs = $addedRelDirs
  }
  $manifestJson = ($manifestObj | ConvertTo-Json -Depth 4)
  $manifestJson | Set-Content -LiteralPath (Join-Path $rollbackDir 'rollback_manifest.json') -Encoding UTF8
  $manifestJson | Set-Content -LiteralPath $pendingManifestFile -Encoding UTF8

  Write-Host '4/5 Programfajlok frissitese, eles sema- es inditasi ellenorzes...'
  $liveModified = $true
  foreach ($si in $stageItems) {
    $dest = Join-Path $root $si.Name
    if ($si.PSIsContainer) {
      Copy-Item -LiteralPath $si.FullName -Destination $root -Recurse -Force
    } else {
      Copy-Item -LiteralPath $si.FullName -Destination $dest -Force
    }
  }

  $prevLiveDbEnv = $env:DB_PATH
  try {
    $env:DB_PATH = $liveDb
    & node (Join-Path $root 'src\db\init.js')
    $liveInitExit = $LASTEXITCODE
  } finally {
    $env:DB_PATH = $prevLiveDbEnv
  }
  if ($liveInitExit -ne 0) {
    throw 'Az eles adatbazis-sema ellenorzes hibaval leallt!'
  }

  # F1: Valodi telepites utani fustproba a megorzott helyi config.js-szel (kizarolag 127.0.0.1 loopbacken!)
  Invoke-ServerSmokeTest -WorkDir $root -NodeModulesDir (Join-Path $root 'node_modules') -FallbackPort $livePort -Label 'telepitett eles'

  # Innentol a frissites sikeresen lezarult: a fuggo jegyzek torlesenek sikere azonban ellenorzendo (F2)!
  $liveModified = $false
  if (Test-Path -LiteralPath $pendingManifestFile) {
    Remove-Item -LiteralPath $pendingManifestFile -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $pendingManifestFile) {
      $keepRollback = $true
      Write-Host ('[HIBA] A frissites telepult, de a fuggo allapotjegyzek (' + $pendingManifestFile + ') nem torolheto (zarolt fajl)!')
      Write-Host ('       A biztonsagi mentes (' + $rollbackDir + ') es a csomag (' + $selectedZip.Name + ') megorzésre kerult.')
      exit 8
    }
  }

  Write-Host '5/5 Takaritas...'
  $zipDeleted = $false
  try {
    Remove-Item -LiteralPath $selectedZip.FullName -Force
    $zipDeleted = $true
  } catch {
    Write-Host ('[FIGYELEM] A frissites sikeres, de a csomag (' + $selectedZip.Name + ') torlese nem sikerult: ' + $_.Exception.Message)
  }

  Write-Host ''
  Write-Host ('[SIKER] A szerver sikeresen frissult a(z) v' + $zipVerStr + ' verziora!')
  if ($zipDeleted) {
    Write-Host ('        A felhasznalt csomag (' + $selectedZip.Name + ') automatikusan torlesre kerult.')
  }
} catch {
  $errMsg = $_.Exception.Message
  Write-Host ('[HIBA] ' + $errMsg)
  if ($liveModified) {
    Write-Host ('Visszagorgetes inditasa az elozo verziora (v' + $curVerStr + ')...')
    try {
      # 1. Minden ujonnan hozzaadott fajl eltavolitasa (alkonyvtarakon belul is!)
      foreach ($relFile in $addedRelFiles) {
        $ap = Join-Path $root $relFile
        if (Test-Path -LiteralPath $ap) { Remove-Item -LiteralPath $ap -Force }
      }
      # 2. Ujonnan letrejott ures alkonyvtarak eltavolitasa melyseg szerint visszafele
      $sortedNewDirs = @($addedRelDirs | Sort-Object Length -Descending)
      foreach ($relDir in $sortedNewDirs) {
        $dp = Join-Path $root $relDir
        if (Test-Path -LiteralPath $dp) {
          $left = @(Get-ChildItem -LiteralPath $dp -Force)
          if ($left.Count -eq 0) { Remove-Item -LiteralPath $dp -Force }
        }
      }
      # 3. Elozo programfajlok visszaallitasa
      Get-ChildItem -LiteralPath (Join-Path $rollbackDir 'app') -Force | ForEach-Object {
        if ($_.PSIsContainer) {
          Copy-Item -LiteralPath $_.FullName -Destination $root -Recurse -Force
        } else {
          Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $root $_.Name) -Force
        }
      }
      # 4. Adatbazis (vagy korabban hianyzo adatbazis allapot) pontos visszaallitasa
      if ($hadLiveDb) {
        $rbDb = Join-Path $rollbackDir 'data\db_backup'
        foreach ($suf in @('', '-wal', '-shm')) {
          $srcP = $rbDb + $suf
          $dstP = $liveDb + $suf
          if (Test-Path -LiteralPath $srcP) {
            Copy-Item -LiteralPath $srcP -Destination $dstP -Force
          } elseif (Test-Path -LiteralPath $dstP) {
            Remove-Item -LiteralPath $dstP -Force
          }
        }
      } else {
        foreach ($suf in @('', '-wal', '-shm')) {
          $dstP = $liveDb + $suf
          if (Test-Path -LiteralPath $dstP) { Remove-Item -LiteralPath $dstP -Force }
        }
      }
      Write-Host ('[VISSZAGORGETVE] Az elozo verzio (v' + $curVerStr + ') es az adatbazis allapota sikeresen visszaallitva!')
      if (Test-Path -LiteralPath $pendingManifestFile) {
        Remove-Item -LiteralPath $pendingManifestFile -Force -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $pendingManifestFile) {
          $keepRollback = $true
          Write-Host ('[FIGYELEM] A fuggo allapotjegyzek (' + $pendingManifestFile + ') nem torolheto; a mentes megorzésre kerult: ' + $rollbackDir)
        }
      }
    } catch {
      $keepRollback = $true
      Write-Host ('[KRITIKUS HIBA] A visszagorgetes soran hiba tortent: ' + $_.Exception.Message)
      Write-Host ('A biztonsagi mentes itt talalhato: ' + $rollbackDir)
      exit 9
    }
  }
  exit 5
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $dryRunDir) { Remove-Item -LiteralPath $dryRunDir -Recurse -Force -ErrorAction SilentlyContinue }
  if (-not $keepRollback -and (Test-Path -LiteralPath $rollbackDir)) { Remove-Item -LiteralPath $rollbackDir -Recurse -Force -ErrorAction SilentlyContinue }
}

} finally {
  if ($lockAcquired) {
    $lockAcquired = $false
    if (Test-Path -LiteralPath $lockFile) {
      try {
        $curLock = Get-Content -LiteralPath $lockFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($curLock -and $curLock.token -eq $lockToken) {
          Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
        }
      } catch {}
    }
  }
}

exit 0
