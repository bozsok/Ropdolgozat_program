# PRODUCT REQUIREMENTS DOCUMENT (PRD)
**Projekt neve:** Ropdolgozat  program – Iskolai Helyi Hálózatos Röpdolgozat Rendszer (Socrative-klón)
**Célközönség:** Általános iskola 3–8. osztály (Digitális kultúra tantárgy)
**Környezet:** 100% Offline Helyi Hálózat (LAN) – 1 db Windows Server 2022 + 42 db Windows 10 kliensgép + 1 db kétmonitoros tanári gép.

---

## 1. Projekt Vízió és Célok
A rendszer célja a papíralapú röpdolgozatok és a felhőalapú Socrative szolgáltatás teljes kiváltása egy helyi szerveren futó, internetkapcsolat nélkül is atombiztosan működő webes alkalmazással. A programnak ki kell szolgálnia 42 egyidejű diákot adatvesztés nélkül, valós idejű tanári visszajelzést kell adnia, támogatnia kell a meglévő Socrative tesztek (`.xlsx`) importálását, és kezelnie kell a valós iskolai órai vészhelyzeteket (böngészőbezárás, géplefagyás, elgépelések).

---

## 2. Felhasználói Szerepkörök és Belépés (User Roles & Auth)

### 2.1. Diák (Student)
- Jelszó és regisztráció nélkül csatlakozik a helyi hálózaton (javasolt indítás: teljes képernyős Kioszk módban: `--app=http://<SZERVER_IP>:3000/?gep=14 --start-fullscreen`).
- Az URL paraméter (`?gep=1` .. `?gep=22`) automatikusan azonosítja a munkaállomást.
- **Névválasztás (Osztálynévsorból):** Ha a tanár a teszt indításakor kiválasztott egy előre feltöltött osztályt (pl. `5.b`), a diáknak nem kell gépelnie, hanem egy legördülő listából választja ki a saját nevét. Aki már belépett, annak a neve kiszürkül/inaktívvá válik a listában. (Ha nincs kiválasztva osztálynévsor, szabad szöveges névbevitel jelenik meg).
- **Munkamenet-folytatás (Session Recovery):** Ha a diák véletlenül bezárja a böngészőt, vagy gépmeghibásodás miatt átül egy másik gépre és újra kiválasztja a nevét (vagy a tanár engedélyezi az újracsatlakozást), a rendszer nem engedi elölről kezdeni a tesztet, hanem betölti az addig megválaszolt kérdéseit, és ott folytathatja, ahol abbahagyta.

### 2.2. Tanár (Teacher / Admin)
- **Tanári PIN / Jelszó védelem:** A `/admin` és `/projector` felületek, valamint az adminisztrációs API végpontok helyi PIN-kóddal (alapértelmezetten a `config.js`-ben megadott kód, HTTP-Only Session Cookie-val) védettek, hogy a diákok a helyi hálózaton ne férhessenek hozzá.
- Két monitoron követi és vezérli az eseményeket:
  - **1. monitor (`/admin` - Privát Vezérlőpult):** Élő mátrix a diákok válaszaival, kézi felülbírálással, fókuszvesztés (puskázás) riasztásokkal, diák kiléptető (Kick/Reset) gombbal és időzítővel.
  - **2. monitor (`/projector` - Kivetítő):** Csapatverseny (Space Race) állása, nagy visszaszámláló óra, vagy név nélküli (anonim) statisztika a közös megbeszéléshez.

---

## 3. Funkcionális Követelmények (Functional Specifications)

### 3.1. Kérdéstípusok és Digitális Kultúra Extrák
1. **Feleletválasztós (`ABCD`):** 2–6 válaszlehetőség, egy vagy több helyes válasszal.
2. **Igaz / Hamis (`TF`):** Két válaszlehetőség (Igaz / Hamis).
3. **Rövid szöveges válasz (`SHORT`):** Szabad szöveges bevitel. A szerver kis- és nagybetű függetlenül (`case-insensitive`), a felesleges szóközöket levágva (`trim`) hasonlítja össze a megadott elfogadható kulcsszavakkal.
- **Kódrészletek és Képletek (Monospace / Code Block):** A kérdések szövegében és a válaszokban a backtick (` `kód` ` vagy ` ```kódblokk``` `) közé írt részek jól olvasható, kiemelt, írógép (`monospace`) betűtípussal jelennek meg (pl. `=SZUM(A1:A10)`, HTML tagek vagy Python kódok számára).
- *Minden kérdéshez opcionálisan csatolható 1 db kép, adható meg pontszám és szöveges magyarázat.*

### 3.2. Tesztfuttatási Módok (Quiz Modes)
1. **Saját tempójú (Student Paced):**
   - A diákok saját tempóban haladnak végig a kérdéseken.
   - Opcionálisan beállítható globális időkorlát (pl. 20 perc), amelynek lejártakor a rendszer mindenkinél automatikusan beküldi és lezárja a tesztet.
   - **Puskázásgátló keverés (Shuffle):** Külön-külön bekapcsolható a *kérdések sorrendjének* és az *ABCD válaszlehetőségek sorrendjének* véletlenszerű összekeverése diákonként. A tanári mátrixban a válaszok mindig az eredeti kérdéssorrendnek megfelelő oszlopba kerülnek.
2. **Tanár által léptetett (Teacher Paced):**
   - Minden diák gépén pontosan az a kérdés jelenik meg, amelyiket a tanár a vezérlőpulton kiválaszt.
3. **Csapatverseny (Space Race):**
   - A diákok (egyénileg vagy automatikusan/kézzel osztott színes csapatokban) saját tempóban válaszolnak.
   - Minden helyes válasz előrébb mozdítja a csapat/diák ikonját a projektoros (`/projector`) képernyőn.

### 3.3. Tanári Élő Vezérlőpult (Live Results Matrix)
- **Valós idejű frissítés (WebSockets):** Oldalfrissítés nélkül jelenik meg minden csatlakozott gép (`1-42`), a diák neve, az elért pontszám/százalék, a kalkulált érdemjegy, és kérdésenként a cellák.
- **1-kattintásos Kézi Felülbírálás (Manual Override):** A tanár az élő mátrixban (vagy a lezárt dolgozatnál) rákattinthat bármelyik diák bármelyik válasz-cellájára, és kézzel átbillentheti a státuszát:
  - **Zöld (Helyes - 100% pont)**
  - **Sárga (Részpontszám / Fél pont - 50% pont)** – pl. apró elgépelés esetén rövid szöveges válasznál.
  - **Piros (Hibás - 0 pont)**
  *A rendszer a kattintás pillanatában újraszámolja a diák összpontszámát, százalékát és érdemjegyét!*
- **Diák Kiléptetése / Feloldása (Kick / Unlock):** Ha egy diák tévesen más nevére kattintott a névsorban, a tanár a diák sora melletti gombbal törölheti/felszabadíthatja a csatlakozást, vagy engedélyezheti az átülést másik gépre.
- **Puskázásgátló (Focus Loss Detection):** Ha a diák böngészőablaka elveszíti a fókuszt (`blur` vagy `visibilitychange`), a tanári mátrixban a diák sora narancssárgán felvillan, és nő a fókuszvesztés-számláló.

### 3.4. Tartalomkezelés, Osztálynévsorok és Mentés
- **Osztálynévsor-kezelő (Class Rosters):** Egyszerű felület, ahol a tanár osztályonként (pl. `5.a`, `6.b`) szövegesen (soronként egy név) bemásolhatja a diákok névsorát.
- **Vizuális Tesztszerkesztő:** Webes űrlap új tesztek létrehozására, kérdések szerkesztésére, képek feltöltésére.
- **Socrative `.xlsx` Importáló & AI JSON Gyorsimport:** Meglévő Socrative Excel fájlok és AI által generált JSON kérdéssorok 1-kattintásos betöltése.
- **1-Kattintásos Biztonsági Mentés (Full Backup):** A tanári felületen egy gombnyomással letölthető egy `.zip` fájl, amely tartalmazza az aktuális SQLite adatbázist (`ropdolgozat.db`) és az összes feltöltött képet (`uploads/`), így pendrive-ra vagy másik gépre azonnal archiválható.

### 3.5. Kiértékelés, Ponthatárok és Exportálás
- **Érdemjegy-kalkulátor (KRÉTA-segéd):** Tesztenként módosítható százalékos ponthatárok (alapértelmezett: `0-29%: 1`, `30-54%: 2`, `55-74%: 3`, `75-89%: 4`, `90-100%: 5`).
- **Export 1 – Csoportos Excel (`.xlsx`):** Színezett cellák (zöld/sárga/piros), diákok válaszai, összpontszám, százalék, KRÉTA érdemjegy és kérdésenkénti osztályátlag.
- **Export 2 – Csoportos Interaktív HTML (`.html`):** Egyetlen önálló fájl, amely offline megnyitható, szűrhető, és név nélkül kivetíthető.
- **Export 3 – Egyéni Értékelőlapok (`.zip` / Nyomtatható A4 PDF nézet):**
  - Minden diáknak külön, névre szóló, díszes HTML fájl letöltése `.zip`-ben.
  - *Nyomtatási / PDF nézet:* A 42 diák értékelőlapja egymás alá töltődik be CSS `@media print` oldalelváltással (`page-break-after: always`), így a böngészőből azonnal egyetlen többoldalas PDF-be menthető.
- **Azonnali Órai Kiosztás:** A teszt lezárásakor a tanár egy gombnyomással megjelenítheti a diákok saját monitorán a részletes értékelőlapjukat.