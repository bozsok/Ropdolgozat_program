# TECHNOLOGY STACK & ARCHITECTURE SPECIFICATION
**Keretrendszer és Fejlesztői Környezet:** Antigravity + Gemini AI Agent
**Célplatform:** Windows Server 2022 (LAN Szerver) + Windows 10 Kliensek (Modern böngészővel: Edge / Chrome)

---

## 1. Architektúra Áttekintés ("Zero-Build" Monolitikus Webszerver)
A könnyű karbantarthatóság, a hordozhatóság és a gyors AI-alapú fejlesztés érdekében a projekt **nem használ bonyolult frontend build-folyamatot (nincs Webpack, Vite, React vagy Next.js)**. Egyetlen Node.js folyamat szolgálja ki a statikus fájlokat, a REST API-t, a WebSocket csatornát és az SQLite adatbázist.

```
[42 db Win10 Diák Gép (Kioszk)] <--- HTTP / WebSocket (LAN) ---> [Windows Server 2022]
[2 monitoros Tanári Gép]        <--- HTTP / WebSocket (LAN) ---> (Node.js + Express + Socket.io + SQLite)
```

---

## 2. Szoftverkomponensek és Csomagok (`package.json`)

### 2.1. Backend (Szerveroldal)
- **Futási környezet:** `Node.js` (v20 LTS vagy v22 LTS – akár Portable `.zip` verzióként is futtatható).
- **Webszerver keretrendszer:** `express` (v4.x) – gyors, stabil HTTP útválasztás és API végpontok.
- **Hitelesítés (Tanári PIN):** `cookie-parser` (vagy egyszerű natív cookie/token middleware) a tanári `/admin` és `/projector` végpontok védelméhez.
- **Adatbázis-motor:** `better-sqlite3` – szinkron, extrém gyors, C++ alapú SQLite meghajtó Node.js-hez. Kötelezően `PRAGMA journal_mode = WAL;` beállítással futtatva a konkurens olvasás/írás érdekében.
- **Valós idejű kommunikáció:** `socket.io` – kétirányú, eseményvezérelt kommunikáció a tanári mátrix, a munkamenet-folytatás (Session Recovery), a Teacher Paced léptetés, az időzítő és a fókuszvesztés-figyelő számára.
- **Fájlfeltöltés (Képek és Excel):** `multer` – a kérdésekhez tartozó képek és a Socrative `.xlsx` fájlok helyi mentéséhez.
- **Excel feldolgozás és generálás:** `exceljs` – a Socrative `.xlsx` tesztek beolvasásához ÉS a színezett, formázott tanári eredménytáblák exportálásához.
- **Tömörítés (Export és Backup):** `archiver` (vagy `adm-zip`) – a 22 diák egyéni HTML értékelőlapjának, valamint a teljes adatbázis + képek biztonsági mentésének `.zip` fájlba csomagolásához.

### 2.2. Frontend (Kliensoldal – 100% Offline)
- **HTML / Sablonok:** Tiszta HTML5 + Vanilla JavaScript (ES6+), dinamikus DOM-manipulációval.
- **Stílus (CSS):** Lokálisan tárolt CSS változók és segédosztályok (offline Tailwind CSS vagy strukturált modern CSS Grid/Flexbox) + `monospace` kódblokk formázás + `@media print` szabályok az A4-es PDF generáláshoz.
- **Ikonok:** Beágyazott inline SVG ikonok (nincs külső FontAwesome vagy Google Icons CDN!).

---

## 3. Projekt Mappaszerkezete (Directory Structure)

Az AI ügynöknek szigorúan ezt a mappaszerkezetet kell felépítenie és megtartania:

```text
ropdolgozat_program/
├── package.json
├── server.js                  # Belépési pont (Express + Socket.io indítása)
├── config.js                  # Port (3000), Tanári PIN (pl. "1234"), alapértelmezett ponthatárok
├── start_server.bat           # Windows Server 2022 automatikus indító parancsfájl
├── data/
│   ├── ropdolgozat.db         # SQLite adatbázis fájl (automatikusan generálódik)
│   └── uploads/               # Feltöltött kérdés-képek helye
├── src/
│   ├── middleware/
│   │   └── auth.js            # Tanári PIN-kód ellenőrző middleware (/admin és /api/admin/* védelme)
│   ├── db/
│   │   ├── init.js            # Adatbázis kapcsolat, WAL mód, táblák és mintaadatok létrehozása
│   │   ├── rosterRepo.js      # Osztályok és diákok (Osztálynévsorok) CRUD műveletei
│   │   ├── quizRepo.js        # Tesztek és kérdések CRUD műveletei
│   │   └── sessionRepo.js     # Órai alkalmak, diákválaszok, kézi felülbírálás és Session Recovery
│   ├── routes/
│   │   ├── api.js             # REST API végpontok (belépés, tesztek, névsorok, import, export, backup)
│   │   └── views.js           # HTML oldalak kiszolgálása (/ , /admin, /projector, /print)
│   ├── sockets/
│   │   └── liveHandler.js     # Socket.io események (csatlakozás, válasz, felülbírálás, kick, fókuszvesztés)
│   └── services/
│       ├── socrativeImport.js # Socrative .xlsx fájlok elemzése és DB-be írása
│       ├── grader.js          # Válaszok kiértékelése, félpontok és KRÉTA érdemjegy kalkuláció
│       ├── exporter.js        # Excel (.xlsx), Csoportos HTML és Egyéni HTML (.zip) generátor
│       └── backup.js          # SQLite biztonsági mentés (.db + uploads mappa -> .zip)
└── public/                    # Statikus, offline elérhető kliensoldali fájlok
    ├── css/
    │   ├── style.css          # Offline stílusok, kódblokk (monospace) formázás
    │   └── print.css          # A4-es nyomtatási/PDF szabályok (@media print)
    ├── js/
    │   ├── utils.js           # Kódrészlet-formázó (backtick -> <code>) és közös segédfüggvények
    │   ├── student.js         # Diák felület, Session Recovery, keverés (Shuffle) + fókuszvesztés-figyelő
    │   ├── admin.js           # Tanári 1. monitor (Élő mátrix, 1-kattintásos felülbírálás, Szerkesztő, Névsorok)
    │   └── projector.js       # Tanári 2. monitor (Space Race + Anonim statisztika)
    ├── student.html           # Diák belépő (névsor-választó) és tesztíró felület
    ├── admin.html             # Tanári fő vezérlőpult, névsorkezelő és tesztszerkesztő
    ├── projector.html         # Másodlagos monitor (kivetítő) felület
    └── print-report.html      # Nyomtatható egyéni értékelőlapok sablonja
```

---

## 4. Üzemeltetési és Kioszk Specifikáció
- **Windows Server 2022 Indítás:** A `start_server.bat` fájl elhelyezhető a Windows `shell:common startup` mappájában vagy Feladatütemezőben (Task Scheduler), így áramszünet után a szerver bejelentkezés nélkül is újraindul.
- **Windows 10 Kliensgép Parancsikon (Kioszk mód):**
  `msedge.exe --app=http://<SZERVER_IP>:3000/?gep=1 --start-fullscreen` (ahol a `gep` paraméter `1` és `42` között változik).