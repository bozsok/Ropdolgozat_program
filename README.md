# Okoskodó – Röpdolgozat program (v1.8.0)

> **100% Offline Helyi Hálózatos Iskolai Röpdolgozat Rendszer (Socrative-klón)**  
> Kifejezetten általános iskolai 3–8. évfolyamos oktatási környezetre (Digitális kultúra, Technika és Fejlesztő foglalkozás tantárgyakhoz) tervezve.  
> Részletes verziótörténet és módosítási napló: [`CHANGELOG.md`](file:///d:/dev/Röpdolgozat%20program/CHANGELOG.md)

---

## 1. Rendszeráttekintés és Célkitűzés

A **Röpdolgozat program** egy helyi hálózaton (LAN) futó, internetkapcsolatot egyáltalán nem igénylő tantermi értékelő alkalmazás. Célja a felhőalapú Socrative rendszer és a papíralapú röpdolgozatok teljes körű, modern kiváltása tantermi környezetben (1 db központi Windows Server 2016 / 2019 / 2022 kiszolgáló, 42 db Windows 10 kliensgép és párhuzamos tanári munkaállomások).

### Főbb előnyök a tanteremben
* **100% Offline működés:** Nincs külső internetfüggőség, nincsenek külső CDN-ek, az alkalmazás teljesen izolált helyi hálózaton működik.
* **0 Gépelés – 3 Kattintásos Belépés:** A diákok hivatalos osztálynévsorból választják ki a nevüket legördülő listából. Ezzel teljesen kiküszöbölhetők a gyermekek elgépelései (*„kovacs peti”*, *„Batman”*), és azonnal biztosított a KRÉTA naplóval való hibátlan összerendelés.
* **Tantermi Gépváltás Adatvesztés Nélkül:** Ha a diák gépe elromlik vagy lefagy a dolgozat közben, a tanár a vezérlőpulton egyetlen kattintással engedélyezi a gépváltást (`authorizeSeatChange`). A diák egy új gépre átülve **egyetlen korábbi válaszának és pontjának elvesztése nélkül** ott folytathatja a tesztet, ahol abbahagyta.
* **Téves Névfoglalás Kezelése (Reset):** Ha egy diák véletlenül a padtársa nevére kattint, a tanár a `Név törlése` funkcióval tiszta lappal visszaállíthatja a nevet az aktív névsorba.
* **Valós idejű Tanári Vezérlőpult:** WebSocket (Socket.io) alapú élő eredménytábla (Live Matrix), amely másodpercenként mutatja a 42 munkaállomás állapotát, fókuszvesztéseit és válaszait.
* **1-Kattintásos Tanári Felülbírálás (Override):** A tanár a felületen bármelyik diákválaszra kattintva azonnal átbillentheti a státuszt: Zöld (Helyes), Sárga (Részpont), Piros (Hibás).

---

## 2. Dolgozatmódok és Pedagógiai Sajátosságok

A rendszer a Socrative jól bevált koncepciójára épülve háromféle módban futtatható:

1. 🏃 **Saját tempójú (Student Paced):**
   * A tanulók önálló tempóban haladnak kérdésről kérdésre.
   * Beállítható globális időkorlát (pl. 15 perc), amelynél a szerver szigorú határidőt (`deadline_at`) kényszerít ki.
   * Diákonkénti véletlenszerű kérdés- és válaszlehetőség-keverés (Shuffle) a puskázás megelőzésére.
2. 👨‍🏫 **Tanár által vezérelt (Teacher Paced):**
   * A tanár központilag lépteti a kérdéseket az egész osztály számára, támogatva a közös feladatmegbeszélést és magyarázatot.
3. 🚀 **Csapatverseny (Space Race):**
   * A tanulók csapatszíneket választanak (Kék, Piros, Sárga, Zöld), és a helyes válaszok függvényében a rakétáik valós időben haladnak előre a kivetítőn (`/projector`).

### Formatív pedagógiai visszajelzés
A tanuló minden kérdés beküldésekor azonnal látja a minősítést: helyes válasz esetén zöld, hibás válasz esetén piros kiemelést a helyes válasz megjelölésével. Ez a tudatos pedagógiai döntés a formatív általános iskolai oktatást, a hibák azonnali felismerését és javítását szolgálja.

---

## 3. Technológiai Architektúra és Adatintegritás

| Réteg | Alkalmazott technológia és sajátosságok |
|---|---|
| **Kiszolgáló (Backend)** | Node.js (v22+ LTS) + Express + Socket.io + Cookie-Parser + Multer + ExcelJS + Archiver |
| **Felhasználói felület (Frontend)** | Zero-Build Vanilla HTML5, modern CSS3 (Flexbox/Grid, szigorúan `!important` nélkül), Vanilla ES6 JavaScript, beágyazott inline SVG ikonok |
| **Adatbázis** | SQLite3 (`better-sqlite3`) szigorúan **WAL (Write-Ahead Logging)** módban és bekapcsolt idegen kulcsokkal (`foreign_keys = ON`) |
| **Alapértelmezett port** | `3000` (`http://localhost:3000` vagy `http://szerver_ip:3000`) |

### Adatbázisszintű garanciák (22 db SQL Trigger)
* **Tartós Tesztzárolás (`locked_at`):** Amint egy teszthez elindul egy dolgozat, a teszt automatikusan zárolódik. Zárolt teszt kérdései és alapadatai nem módosíthatók; módosítási szándék esetén az **[ 📋 Másolat készítése és szerkesztése ]** funkció készít független új példányt.
* **Lezárt dolgozatok védelme:** Lezárt (`FINISHED`) dolgozathoz tilos új választ vagy résztvevőt beszúrni, beállításai és lezárási ideje nem módosíthatók, fizikai törlés ellen védettek.
* **Pontozási CHECK megszorítás és pontplafon triggerek:** 
  - `WRONG` státusznál szigorúan 0 pont és `is_correct = 0`.
  - `PARTIAL` státusznál kötelezően pozitív pontszám (`points_earned > 0.0`) és `is_correct = 1`.
  - [`trg_validate_answer_points_limit`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql#L354) és [`trg_validate_answer_points_limit_update`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql#L364): A kapott vagy felülbírált pontszám nem haladhatja meg a kérdés adatbázisban tárolt maximális pontértékét.
* **OWASP Munkamenet-biztonság:** A tanuló azonosítása a szerver által kiadott kriptográfiai tokenhez (`session_token`) kötött, idegen böngészőből vagy gépről a név nem vehető át.

---

## 4. Rendszerkövetelmények és Telepítés

> Részletes pendrive-os és Windows Server 2022 éles üzembe helyezési útmutató: [`telepítés.md`](file:///d:/dev/Röpdolgozat%20program/telep%C3%ADt%C3%A9s.md)

### Előfeltételek
* **Operációs rendszer:** Windows Server 2022, Windows 10/11, vagy Linux disztribúció
* **Node.js:** v20.0.0 vagy újabb (LTS ajánlott)

### Telepítés lépései
1. Klónozd vagy másold a projekt könyvtárát a szervergépre:
   ```bash
   cd "d:\dev\Röpdolgozat program"
   ```
2. Telepítsd a szükséges Node.js csomagokat:
   ```bash
   npm install
   ```
3. Inicializáld az adatbázist a beépített minta Digitális kultúra teszttel és a minta osztálynévsorral:
   ```bash
   npm run init-db
   ```

---

## 5. Indítás és Használat

### 1. Szerver indítása
* **Parancssorból:**
  ```bash
  npm start
  ```
* **Vagy Windows környezetben dupla kattintással:**
  Futtasd a gyökérkönyvtárban található [`start_server.bat`](file:///d:/dev/Röpdolgozat%20program/start_server.bat) parancsfájlt.

### 2. Kliensfelületek elérése
* **Diák munkaállomások (`1–42. gép`):**
  Nyisd meg a böngészőt a gépszám paraméterrel (célszerűen Windows Kioszk módban):
  ```
  http://szerver_ip:3000/?gep=12
  ```
* **Tanári 1. monitor (Privát Vezérlőpult és Élő Mátrix):**
  ```
  http://szerver_ip:3000/admin
  ```
  *Alapértelmezett tanári PIN:* `admin123` (a [`config.js`](file:///d:/dev/Röpdolgozat%20program/config.js) fájlban módosítható).
* **Tanári 2. monitor (Kivetítő és Space Race projektor):**
  ```
  http://szerver_ip:3000/projector
  ```

---

## 6. Exportálási Lehetőségek és KRÉTA Illesztés

A dolgozat befejezésekor (vagy az archívumból utólag bármikor) 4 professzionális formátumban tölthetők le az eredmények:
1. 📊 **Csoportos Excel (.xlsx):** Teljes KRÉTA-kompatibilis munkafüzet, színezett cellákkal (zöld/sárga/piros), kérdésenkénti válaszokkal, összpontszámmal, százalékkal, hivatalos osztályátlaggal és érdemjegyekkel.
2. 🌐 **Interaktív Csoportos HTML (.html):** Egyetlen önálló offline fájl, szűrhető, rendezhető, anonimizálható statisztikákkal.
3. 📦 **Egyéni Értékelőlapok (.zip):** Minden diáknak külön egyéni díszes értékelőlap ZIP-be csomagolva.
4. 🖨️ **Nyomtatható A4 PDF Sablon:** Böngészőből azonnal nyomtatható nézet (`@media print` szabályokkal, oldalanként pontosan egy tanulóval) azonnali PDF mentéshez.

### Alapértelmezett KRÉTA ponthatárok (Százalék)
* **0–29%:** Elégtelen (1)
* **30–54%:** Elégséges (2)
* **55–74%:** Közepes (3)
* **75–89%:** Jó (4)
* **90–100%:** Jeles (5)

---

## 7. Projekt Könyvtárstruktúra

```text
├── CHANGELOG.md              # Részletes verziótörténet és változási napló (v1.8.0)
├── config.js                 # Központi konfiguráció (port: 3000, PIN, elérési utak, ponthatárok)
├── DATABASE_SCHEMA.sql       # Teljes relációs adatbázis séma 7 táblával és 22 triggerrel
├── package.json              # Node.js projektleíró és környezeti követelmények (Node >= 22.11.0)
├── project-context.md        # Rendszermegállapodás és működési szabályzat
├── server.js                 # Express szerver és Socket.io belépési pont
├── start_server.bat          # Intelligens Windows indítószkript önellenőrző diagnosztikával
├── telepítés.md              # Zero-Install Best Practice üzembe helyezési útmutató (Windows Server 2016+)
├── data/                     # SQLite adatbázis és feltöltött képek (gitignore védi)
│   └── uploads/              # Feltöltött médiafájlok (.gitkeep)
├── public/                   # 100% Offline kliensoldali fájlok (Zero-Build)
│   ├── student.html          # Közös belépési (tanári loginnal) és tanulói vizsgafelület („Calm Learner”)
│   ├── admin.html            # Tanári vezérlőpult és szerkesztő
│   ├── projector.html        # Tantermi kivetítő (Space Race és statisztikák)
│   ├── css/
│   │   └── style.css         # Egységes stíluslap (tilos az !important)
│   ├── fonts/                # 100% Offline helyi betűkészletek (Nunito Sans & Material Symbols)
│   └── js/
│       ├── student.js        # Diákoldali logika és Session Recovery
│       ├── admin.js          # Tanári élő mátrix, szerkesztők és felülbírálás
│       ├── projector.js      # Kivetítő animációk és verseny grafika
│       └── utils.js          # Offline segédfüggvények (XSS szűrés, kódkiemelés)
├── src/                      # Szerveroldali modulok
│   ├── db/
│   │   ├── init.js           # Adatbázis inicializálás és beépített mintaadatok
│   │   ├── quizRepo.js       # Tesztek és kérdések adattára (zárolás, duplikálás)
│   │   ├── rosterRepo.js     # Osztálynévsorok adattára
│   │   └── sessionRepo.js    # Dolgozatok, belépés, gépváltás, mátrix és pontozás
│   ├── middleware/
│   │   └── auth.js           # Tanári PIN hitelesítés és Cookie kezelés
│   ├── routes/
│   │   └── api.js            # REST API végpontok (admin és student)
│   └── services/
│       ├── backup.js         # Teljes SQLite adatbázis archiválás és ZIP mentés
│       ├── exporter.js       # KRÉTA Excel, HTML és ZIP értékelőlap generáló
│       └── grader.js         # Automatikus pontozó motor (ABCD, TF, SHORT)
└── scratch/                  # Integrációs és regressziós tesztkészlet (41 teszteset)
```

---

## 8. Licenc és Fejlesztési Információk

* **Készült:** Általános iskolai helyi hálózatos oktatási célra.
* **Szabványok:** W3C HTML5/CSS3, ECMAScript 2022 (ES13), MTA 12. kiadása szerinti magyar helyesírás.

