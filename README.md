# Okoskodó – Röpdolgozat program (v1.37.15)

> **100% Offline Helyi Hálózatos Iskolai Röpdolgozat Rendszer (Socrative-klón)**  
> Általános iskolai oktatási környezetre tervezve: **Digitális kultúra** és **Technika** (`3–8. évfolyam`), valamint **Fejlesztő foglalkozás** (`1–8. évfolyam`).  
> Részletes verziótörténet: [`CHANGELOG.md`](./CHANGELOG.md) · Részletes szervertelepítési útmutató: [`telepítés.md`](./telepítés.md)

---

## 1. Rendszeráttekintés és Főbb Képességek

Az **Okoskodó – Röpdolgozat program** egy helyi hálózaton (LAN) futó, internetkapcsolatot egyáltalán nem igénylő tantermi mérő- és értékelőrendszer. Célja a felhőalapú Socrative és a papíralapú röpdolgozatok kiváltása iskolai környezetben (**1 db központi Windows Server 2016 kiszolgáló**, akár **42 db Windows 10/11 tanulói kliensgép** és párhuzamos tanári munkaállomások).

### Főbb előnyök a tanteremben
* **100% Offline működés (Zero-Build, Zero-CDN):** Nincs internetfüggőség, a betűkészletek (`Nunito Sans`, `Material Symbols`) és minden erőforrás helyben, a szerveren tárolódik.
* **0 Gépelés – 3 Kattintásos Diák Belépés:** A tanulók tantárgyat, osztályt (Fejlesztő foglalkozásnál `1.a`–`8.c`, egyébként `3.a`–`8.c`), majd a hivatalos osztálynévsorból nevet választanak – nincs elgépelés, hibátlan a KRÉTA-illesztés.
* **Párhuzamos tantárgy–évfolyam csatornák:** Több tantárgy és évfolyam dolgozatai futhatnak egyszerre egymástól teljesen függetlenül (pl. egy több napig nyitva tartott fejlesztő felmérő nem zavarja a tanórai Digitális kultúra dolgozatokat).
* **Tantermi Gépváltás Adatvesztés Nélkül:** Ha egy tanulói gép elromlik, a tanár a vezérlőpulton egy kattintással engedélyezi a gépváltást. A diák másik gépre átülve minden korábbi válaszát és pontját megőrzi.
* **Téves Névfoglalás Törlése:** Ha egy diák véletlenül más nevére kattintott, a tanár egy kattintással visszaállíthatja a nevet az aktív névsorba.
* **Valós idejű Élő Mátrix és 1-Kattintásos Felülbírálás:** Socket.io alapú élő eredménytábla fókuszvesztés-figyeléssel, anonimizáló kivetítő-kapcsolóval és egykattintásos tanári pontfelülbírálással (Helyes / Részpont / Hibás).

---

## 2. Dolgozatmódok

A rendszer négyféle tantermi módban indítható:

1. **Saját tempójú (`Student Paced`):** A tanulók önálló tempóban haladnak kérdésről kérdésre. Opcionális szerveroldali időkorlát (`deadline_at`), kérdés- és opciókeverés, valamint ki- vagy bekapcsolható azonnali visszajelzés.
2. **Szabad navigáció (`Open Navigation`):** A diákok szabadon lépkedhetnek oda-vissza a kérdések között a kérdéstérkép segítségével, a rendszer verziózott piszkozatként folyamatosan menti a válaszaikat, és csak a végső beadáskor (vagy tanári lezáráskor) történik meg a végleges kiértékelés.
3. **Tanár által vezérelt (`Teacher Paced`):** A tanár központilag lépteti a kérdéseket az egész osztály számára, támogatva a közös feladatmegbeszélést és kétlépcsős lezárást.
4. **Csapatverseny (`Space Race`):** A tanulók csapatszínt választanak, a helyes válaszok pedig valós időben mozgatják a csapatok rakétáit a kivetítőn (`/projector`).

---

## 3. Tesztszerkesztő és Kérdéstípusok

* **Szabad Tesztszerkesztő (pillanatkép-védelemmel):** A futó és lezárt dolgozatok rögzített pillanatképből (`quiz_snapshot_json`) dolgoznak, ezért a feladatsorok a Tesztszerkesztőben bármikor szabadon szerkeszthetők, javíthatók, duplikálhatók vagy egyesíthetők.
* **Mapparendszer, hierarchikus áthelyezés és Drag & Drop sorrendezés:** Korlátlan mélységű mappák és almappák létrehozása, átnevezése, törlése, áthelyezése (teljes belső almappa- és tesztstruktúrával, duplázásmentes mappafa-választóval és ciklusvédelemmel), valamint a **mappa- és tesztkártyák húzható (Drag & Drop) egyéni sorrendezése**, amely a Dolgozatindítóban és a mappafa-választóban is érvényesül.
* **Valódi WYSIWYG szövegformázás:** Félkövér, dőlt, aláhúzott, inline kód, felső és alsó index (`B`, `I`, `U`, `</>`, `x²`, `x₂`) közvetlen vizuális megjelenítéssel és üres sorok megőrzésével.
* **Támogatott kérdéstípusok:**
  - **Feleletválasztós (ABCD):** 1 helyes válasz vagy **több helyes válasz (többválasztós ABCD)** szigorú (minden vagy semmi) pontozással.
  - **Képes ABCD válaszlehetőségek:** Minden válaszhoz csatolható kép (feltöltéssel vagy `Ctrl+V` vágólapos beillesztéssel), a diákfelületen görgetésmentes `2×2` (2–4 válasz) vagy `3×2` (5–6 válasz) rácsban, képenkénti nagyító gombbal (Lightbox).
  - **Igaz / Hamis (TF)** és **Rövid válasz (SHORT)** több elfogadott válasszal.
* **Socrative PDF-import:** Meglévő Socrative PDF feladatsorok automatikus beolvasása kérdésekkel, opciókkal, megoldókulccsal, ábrákkal és AkH. 12. szerinti helyesírási/tipográfiai normalizálással.

---

## 4. Technológiai Architektúra és Adatintegritás

| Réteg | Alkalmazott technológia |
|---|---|
| **Kiszolgáló (Backend)** | Node.js (**v22.x LTS**, `>= 22.11.0`) + Express + Socket.io + Cookie-Parser + Multer + ExcelJS + Archiver |
| **Kliensfelület (Frontend)** | Zero-Build Vanilla HTML5, modern CSS3 (Flexbox/Grid, `!important` nélkül), Vanilla ES6 JavaScript |
| **Adatbázis** | SQLite3 (`better-sqlite3`), **WAL** mód, `foreign_keys = ON`, sémaverzió `13700` |
| **Alapértelmezett port** | `3000` (`http://localhost:3000` vagy `http://szerver_ip:3000`) |

* **Munkamenet- és puskázásgátló védelem:** A diák felé soha nem kerül le a helyes válasz (`correct_answer`) és a magyarázat; a munkamenetek kriptográfiai tokenhez (`session_token`) kötöttek.
* **Adatbázisszintű integritás:** Szerveroldali UTC időkorlát, tranzakcionális válaszmentés és idempotencia (`UNIQUE(participant_id, question_id)`), pontplafon-ellenőrzés és lezárt dolgozatok módosítás elleni védelme.
* **Teljes rendszermentés (Backup / Restore) és helyi diagnosztika:** Egykattintásos ZIP mentés és visszaállítás (`PRAGMA integrity_check` vizsgálattal), valamint alapértelmezetten bekapcsolható helyi diagnosztikai naplózás (`DIAGNOSTICS_ENABLED=true`).

---

## 5. Iskolai Éles Telepítés – Windows Server 2016 (Zero-Install)

> Részletes, lépésről lépésre szóló üzembe helyezési kézikönyv (tűzfal, automatikus indítás, diák parancsikonok, frissítés): [`telepítés.md`](./telepítés.md)

### Előfeltételek a szerveren
* **Operációs rendszer:** **Windows Server 2016** (64 bites; kompatibilis Windows Server 2019 / 2022 és Windows 10/11 rendszerekkel is).
* **Node.js:** **Kötelezően Node.js v22.x LTS (Windows x64 `.msi`)** – minimum `v22.11.0`. Régebbi (pl. v20) verzióval a `start_server.bat` el sem indul a `better-sqlite3` bináris kompatibilitás miatt!

### Mit hová kell másolni? (Pendrive-os Zero-Install elv)

Mivel az iskolai szerver offline, **a szerveren NEM futtatunk `npm install`-t!** A fejlesztői (64 bites Windows) gépen már előkészített és tesztelt projektet a kész `node_modules` mappával együtt másold át a szerver **`C:\Ropdolgozat\`** mappájába:

**Átmásolandó mappák és fájlok ➔ `C:\Ropdolgozat\`:**
* `node_modules/` *(kötelező átmásolni – tartalmazza az előre lefordított SQLite binárist)*
* `public/` *(teljes kliensfelület, CSS, JS, offline betűkészletek, ikonok)*
* `src/` *(teljes szerveroldali forráskód)*
* `data/` *(adatbázis és `data/uploads/` mappa – tiszta indításhoz a `ropdolgozat.db` kihagyható; meglévő tesztek/névsorok átviteléhez a `data/ropdolgozat.db` és a `data/uploads/` tartalma is másolandó)*
* `server.js`, `config.js`, `package.json`, `package-lock.json`, `start_server.bat`, `DATABASE_SCHEMA.sql`
* Dokumentáció *(ajánlott)*: `README.md`, `CHANGELOG.md`, `telepítés.md`, `project-context.md`

**Mit NEM kell / nem szabad átmásolni az éles szerverre:**
* ❌ `scratch/` *(fejlesztői tesztszkriptek)*
* ❌ `.git/` *(verziókezelő belső adatai)*
* ❌ `Source/` *(helyi forrás/nyersanyag mappa, ha létezik)*

### Üzembe helyezés lépései a Windows Server 2016 gépen
1. Telepítsd a pendrive-ról a **Node.js v22.x LTS (x64)** telepítőt, majd ellenőrizd Parancssorban: `node -v` (elvárt: `v22.x.x`).
2. Másold be a fenti fájlokat a **`C:\Ropdolgozat\`** könyvtárba.
3. Engedélyezd a **3000-es TCP portot** rendszergazdai PowerShellben:
   ```powershell
   New-NetFirewallRule -DisplayName "Okoskodó Szerver (Port 3000)" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```
4. Indítsd el a szervert a **`C:\Ropdolgozat\start_server.bat`** dupla kattintásával.
   * A szkript automatikusan ellenőrzi a Node.js v22 meglétét, a `node_modules` mappát, létrehozza a hiányzó `data/` és `data/uploads/` könyvtárakat, inicializálja/migrálja az adatbázist (`node src/db/init.js`), bekapcsolja a helyi diagnosztikát, majd elindítja a szervert a `3000`-es porton.
   * Egyedi tanári PIN és süti-titkosítási kulcs a [`start_server.bat`](./start_server.bat) (`ADMIN_PIN`, `COOKIE_SECRET`) vagy a [`config.js`](./config.js) fájlban állítható be.

### Későbbi programfrissítés (1 kattintás otthon + 1 kattintás a szerveren)

Ha a későbbiekben hibajavítás vagy új funkció készül a programhoz, **nem kell kézzel válogatni a fájlokat**:

1. **Otthoni (fejlesztői) gépen:** Futtasd a főkönyvtárban található [`csomagolj_frissitest.bat`](./csomagolj_frissitest.bat) fájlt. Ez kiolvassa a `package.json` verziószámát, és létrehoz egyetlen, verziószámozott csomagot (pl. `Okoskodo_frissites_v1.37.15.zip`), amely **kizárólag a programfájlokat** tartalmazza (`src/`, `public/`, `server.js`, stb.), a `data/`, `node_modules/`, `config.js` és `start_server.bat` kihagyásával.
2. **Iskolai szerveren:** Állítsd le a futó szervert, másold be a `.zip` fájlt a `C:\Ropdolgozat\` főkönyvtárba, majd futtasd a [`frissitsd_a_szervert.bat`](./frissitsd_a_szervert.bat) fájlt:
   - Automatikusan kiválasztja a legmagasabb verziószámú `Okoskodo_frissites_v*.zip` csomagot (vagy ráhúzható egérrel a `.bat` ikonra).
   - **Verzióvédelem:** régebbi verziójú csomag esetén biztonsági okból leáll (nem ír felül semmit); megegyező verzió esetén külön megerősítést kér; újabb verzió esetén jóváhagyás után frissít.
   - A `data/` mappa (adatbázis, eredmények, 196+ feltöltött kép), a `node_modules/`, valamint a szerver egyedi `config.js` és `start_server.bat` beállításai **100%-osan érintetlenek maradnak**.
   - A frissítés végén lefuttatja a `node src/db/init.js` sémaellenőrzést, és **kizárólag 100%-ban hibamentes futás esetén** automatikusan törli a felhasznált `.zip` fájlt.

*(Megjegyzés: ha az otthoni gépen elkészített új **teszteket, mappákat és képeket** szeretnéd átvinni, azt továbbra is a tanári felület **Beállítások és mentés → Teljes rendszermentés (.zip) / Visszaállítás** funkciójával, vagy leállított szerver mellett a `data/ropdolgozat.db` **és** a teljes `data/uploads/` mappa együttes másolásával végezd.)*

---

## 6. Kliensfelületek Elérése és Exportok

### Kliensfelületek (böngészőből)
* **Diák munkaállomások (`1–42. gép`):** `http://szerver_ip:3000/?gep=12`
* **Tanári vezérlőpult (1. monitor):** `http://szerver_ip:3000/admin` *(alapértelmezett PIN: `admin123`, módosítása éles üzemben ajánlott)*
* **Tantermi kivetítő / Space Race (2. monitor):** `http://szerver_ip:3000/projector`

### Exportálási lehetőségek és KRÉTA-illesztés
1. **Csoportos Excel (`.xlsx`):** Színezett cellák, válaszok, összpontszám, százalék, osztályátlag és KRÉTA-érdemjegyek.
2. **Interaktív Csoportos HTML (`.html`):** Önálló offline fájl, szűrhető, rendezhető, anonimizálható nézettel.
3. **Egyéni Értékelőlapok (`.zip`):** Minden diáknak külön díszes HTML értékelőlap.
4. **Nyomtatható A4 PDF sablon:** Böngészőből azonnal nyomtatható nézet (oldalanként egy tanuló).

*Alapértelmezett KRÉTA ponthatárok (a Beállításokban testreszabhatók):* `0–29%: 1`, `30–54%: 2`, `55–74%: 3`, `75–89%: 4`, `90–100%: 5`.

---

## 7. Projekt Könyvtárstruktúra

```text
├── CHANGELOG.md              # Verziótörténet és változási napló (v1.37.15)
├── config.js                 # Központi konfiguráció (port: 3000, PIN, elérési utak, diagnosztika)
├── DATABASE_SCHEMA.sql       # Relációs adatbázisséma és integritási triggerek
├── package.json              # Node.js projektleíró (Node >= 22.11.0)
├── package-lock.json         # Verziózárolt függőséglista
├── project-context.md        # Rendszermegállapodás és működési szabályzat
├── README.md                 # Rendszerleírás (ez a fájl)
├── server.js                 # Express webszerver és Socket.io belépési pont
├── start_server.bat          # Önellenőrző Windows Server 2016 indítószkript
├── csomagolj_frissitest.bat  # Offline frissítési ZIP csomag készítő (fejlesztői gépre)
├── frissitsd_a_szervert.bat  # Verzióvédett offline szerverfrissítő szkript (éles szerverre)
├── telepítés.md              # Részletes Zero-Install szervertelepítési útmutató
├── data/                     # SQLite adatbázis, mentések, diagnosztika és feltöltött képek
│   ├── backups/              # Automatikus és manuális biztonsági mentések
│   ├── diagnostics/          # Helyi diagnosztikai naplók
│   └── uploads/              # Kérdésekhez és válaszokhoz feltöltött képek
├── public/                   # 100% Offline kliensoldali fájlok (Zero-Build)
│   ├── student.html          # Diák belépési és feladatmegoldó felület
│   ├── admin.html            # Tanári vezérlőpult, élő mátrix és tesztszerkesztő
│   ├── projector.html        # Tantermi kivetítő (Space Race és statisztika)
│   ├── print-report.html     # Nyomtatható A4 értékelőlap-sablon
│   ├── css/
│   │   ├── style.css         # Egységes stíluslap (!important nélkül)
│   │   └── print.css         # Nyomtatási stíluslap
│   ├── fonts/                # Helyi betűkészletek (Nunito Sans, Material Symbols)
│   ├── img/                  # Logó és favicon
│   └── js/
│       ├── student.js        # Diákoldali logika, Session Recovery, Open Nav, Lightbox
│       ├── admin.js          # Tanári mátrix, mappakezelés, WYSIWYG tesztszerkesztő
│       ├── projector.js      # Kivetítő és Space Race animációk
│       └── utils.js          # Közös XSS-védelem, szövegformázó, válasz-segédfüggvények
├── src/                      # Szerveroldali modulok
│   ├── db/
│   │   ├── init.js           # Adatbázis inicializálás és sémamigráció (13700)
│   │   ├── quizRepo.js       # Tesztek, kérdések és mappafa adattára
│   │   ├── rosterRepo.js     # Osztálynévsorok adattára
│   │   ├── sessionRepo.js    # Dolgozatok, belépés, piszkozatok, mátrix, felülbírálás
│   │   └── settingsRepo.js   # Rendszerbeállítások és ponthatárok adattára
│   ├── middleware/
│   │   └── auth.js           # Tanári PIN hitelesítés és süti-kezelés
│   ├── routes/
│   │   ├── api.js            # REST API végpontok (admin és student)
│   │   └── views.js          # Oldalútvonalak kiszolgálása
│   ├── services/
│   │   ├── backup.js         # Teljes adatbázis + média ZIP mentés és visszaállítás
│   │   ├── diagnostics.js    # Helyi diagnosztikai naplózás és export
│   │   ├── exporter.js       # KRÉTA Excel, interaktív HTML és ZIP értékelőlap generáló
│   │   ├── grader.js         # Automatikus kiértékelő (egy- és többválasztós ABCD, TF, SHORT)
│   │   ├── presenceService.js # Aktív diák- és névfoglalás-nyilvántartás
│   │   └── socrativePdfParser.js # Socrative PDF-import és helyesírási normalizálás
│   └── sockets/
│       └── liveHandler.js    # Socket.io valós idejű eseménykezelő
└── scratch/                  # Elszigetelt integrációs és regressziós tesztcsomag (npm test)
```

---

## 8. Fejlesztői Tesztelés

A teljes integrációs és regressziós tesztcsomag (teljesen elszigetelt, ideiglenes adatbázison) a fejlesztői gépen futtatható:

```powershell
npm test
```
