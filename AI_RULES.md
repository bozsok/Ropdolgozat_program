# AI AGENT RULES & DEVELOPMENT GUIDELINES (Antigravity / Gemini)
**Projekt:** Ropdolgozat program (Offline Iskolai Röpdolgozat Rendszer)

Ezeket a szabályokat az AI ügynöknek **minden egyes fájl létrehozásakor és módosításakor szigorúan be kell tartania**. Bármilyen eltérés a rendszer működésképtelenségét okozza az iskolai környezetben!

---

## 1. KRITIKUS TILALMAK (HARD CONSTRAINTS)

1. **100% OFFLINE KÖVETELMÉNY – TILOS KÜLSŐ CDN-T HASZNÁLNI!**
   - A célkörnyezetben (Windows Server 2022 + 22 db Windows 10 kliens) a tesztírás során **nincs internetkapcsolat**.
   - **TILOS** a HTML/CSS/JS fájlokba külső URL-eket írni (pl. `https://cdn.tailwindcss.com`, `https://fonts.googleapis.com`, `https://cdnjs.cloudflare.com`, `https://unpkg.com`).
   - Minden CSS-t helyben a `public/css/style.css` fájlban kell megírni.
   - A Socket.io kliens szkriptet a szerver saját beépített végpontjáról (`/socket.io/socket.io.js`) kell betölteni.
   - Ikonokhoz kizárólag beágyazott (inline) `<svg>` elemeket vagy natív Unicode karaktereket szabad használni.

2. **PUSKÁZÁSGÁTLÓ ADATBIZTONSÁG – TILOS LEKÜLDENI A HELYES VÁLASZT!**
   - Amikor egy diák lekéri az aktív teszt kérdéseit (`/api/session/questions` vagy WebSocket eseményen keresztül), a szervernek **kötelező kiszűrnie** (törölnie) a `correct_answer` és az `explanation` mezőket a JSON válaszból!
   - A diák böngészőjének *F12 (Fejlesztői eszköztár -> Network / Console)* ablakában semmilyen körülmények között nem látszódhat a helyes megoldás a teszt írása közben.
   - A helyes válaszok és magyarázatok csak akkor küldhetők le a diáknak, ha `session.is_finished === 1` ÉS `session.show_feedback_on_end === 1`.

3. **ZERO-BUILD FRONTEND ARCHITEKTÚRA**
   - **TILOS** React, Vue, Angular, Svelte, Vite vagy Webpack bevezetése.
   - A `public/` mappában lévő HTML, CSS és Vanilla JS fájloknak közvetlenül, fordítás (build lépés) nélkül kell futniuk a böngészőben, hogy a tanár bármikor akár egy Jegyzettömbbel is módosíthassa a szövegeket a szerveren.

---

## 2. ADATBÁZIS ÉS KONKURENCIA SZABÁLYOK (SQLite)

1. **Kötelező WAL mód:** Az `src/db/init.js` fájlban az adatbázis megnyitása után az első parancs kötelezően:
   ```javascript
   db.pragma('journal_mode = WAL');
   db.pragma('synchronous = NORMAL');
   db.pragma('foreign_keys = ON');
   ```
   Ez garantálja, hogy amikor 42 diák azonos ezredmásodpercben küld választ, az SQLite ne dobjon `SQLITE_BUSY` hibát.
2. **Tranzakciók és UPSERT:**
   - Többsoros beszúrásoknál (pl. teszt mentése, Socrative `.xlsx` importálás, osztálynévsor mentése) mindig használd a `db.transaction(() => { ... })` blokkot.
   - Diákválasz mentésekor használd az `INSERT INTO answers ... ON CONFLICT(participant_id, question_id) DO UPDATE SET ...` szintaxist.
3. **Biztonságos Adatbázis Mentés (Backup):**
   - A teljes biztonsági mentéskor (`src/services/backup.js`) az SQLite `.db` fájl másolása előtt futtasd le a `db.pragma('wal_checkpoint(TRUNCATE)');` parancsot (vagy használd a `better-sqlite3` `.backup()` metódusát), hogy a WAL fájlban lévő friss adatok is bekerüljenek a letöltendő `.zip` archívumba!

---

## 3. ÜZLETI LOGIKA ÉS ÓRAI VÉSZHELYZETEK KEZELÉSE

1. **Munkamenet-folytatás (Session Recovery) és Gépváltás:**
   - Ha egy diák belép az aktív dolgozatba (`POST /api/student/join`), a szerver ellenőrzi, hogy a `participants` táblában szerepel-e már ez a `student_name` az adott `session_id` alatt.
   - Ha már szerepel (pl. véletlenül bezárta a böngészőt, vagy lefagyott a 12-es gép és átült a 20-asra):
     - Frissítsd a `pc_number` értékét az új gépszámra.
     - Küldd vissza a meglévő `participant_id`-t, a `question_order_json`-t és a már megválaszolt kérdések ID-jait (`answered_question_ids`), hogy a diák pontosan a következő megválaszolatlan kérdéstől folytathassa!
2. **Kérdések és Válaszok Keverése (Shuffle):**
   - Ha `shuffle_questions === 1`, a diák első csatlakozásakor a szerver keverje össze a kérdések ID-jait, mentse el a `participants.question_order_json` mezőbe, és ebben a sorrendben adja át a diáknak.
   - Ha `shuffle_options === 1`, az ABCD válaszlehetőségek tömbjét jelenítse meg keverve a diáknak, de a válasz beküldésekor a válasz **szöveges értékét (vagy eredeti kulcsát)** ellenőrizze a szerver, ne a képernyőn látható pillanatnyi pozícióját!
3. **1-Kattintásos Tanári Felülbírálás (Manual Override):**
   - A tanári mátrixban bármely válasz-cellára kattintva a tanár válthasson a 3 állapot között: `CORRECT` (100% pont, zöld), `PARTIAL` (50% pont, sárga), `WRONG` (0 pont, piros).
   - A módosítás azonnal mentődjön az `answers` táblába (`is_manually_overridden = 1`), és a Socket.io küldjön frissítést a tanári felületnek az újraszámolt összpontszámmal és KRÉTA érdemjeggyel.
4. **Kódrészletek Formázása (`utils.js`):**
   - Minden kérdés és válasz megjelenítésekor (diák és tanári oldalon egyaránt) alakítsd át a backtick (` `szöveg` `) közötti részeket `<code class="inline-code">szöveg</code>` HTML elemekké (XSS-biztos szövegszűrés után!), hogy az informatikai képletek és parancsok jól olvashatóak legyenek.

---

## 4. FEJLESZTÉSI SORREND (STEP-BY-STEP ROADMAP AZ ÜGYNÖKNEK)

Amikor a felhasználó a rendszer felépítését kéri, **ebben a sorrendben, modulonként** haladj:

1. **1. Lépés – Alapok és Adatbázis:** `package.json`, `config.js`, `src/db/init.js` (a `DATABASE_SCHEMA.sql` alapján) + 1 db beépített minta Digitális Kultúra teszt (ABCD, TF, SHORT kérdésekkel, `=SZUM(A1:A10)` kódrészlettel) és 1 db minta osztálynévsor (`6.a`), hogy a rendszer azonnal kipróbálható legyen.
2. **2. Lépés – Backend Mag és Auth:** `server.js`, `src/middleware/auth.js` (PIN védelem), `src/services/grader.js`, valamint a Repository fájlok (`rosterRepo.js`, `quizRepo.js`, `sessionRepo.js`).
3. **3. Lépés – Valós idejű Socket.io és API:** `src/sockets/liveHandler.js` és `src/routes/api.js` (munkamenet-folytatással, válaszkiértékeléssel, kézi felülbírálással és fókuszvesztés-kezeléssel).
4. **4. Lépés – Offline Stílusok és Diák Felület:** `public/css/style.css`, `public/js/utils.js`, `public/student.html` és `public/js/student.js` (gépszám-felismerés `?gep=X`-ből, osztálynévsor legördülő lista, tesztírás, időzítő, fókuszvesztés-figyelő, óra végi értékelőlap).
5. **5. Lépés – Tanári 1. Monitor (Vezérlőpult és Szerkesztő):** `public/admin.html` és `public/js/admin.js` (Élő mátrix, 1-kattintásos zöld/sárga/piros felülbírálás, diák kiléptetés, Vizuális tesztszerkesztő, Osztálynévsor-kezelő).
6. **6. Lépés – Tanári 2. Monitor (Projektor):** `public/projector.html` és `public/js/projector.js` (Space Race űrhajós csapatverseny grafika, nagy óra, anonim statisztika).
7. **7. Lépés – Import, Export és Backup:** `src/services/socrativeImport.js`, `src/services/exporter.js` (KRÉTA-kompatibilis színezett `.xlsx`, interaktív `.html`, egyéni `.zip` és `print-report.html` `@media print` PDF nézet), valamint `src/services/backup.js` és `start_server.bat`.