# PROJEKT KONTEXTUS ÉS RENDSZERMEGÁLLAPODÁS (project-context.md)
**Projekt neve:** Röpdolgozat program – Iskolai Helyi Hálózatos Röpdolgozat Rendszer (Socrative-klón)  
**Célközönség:** Általános iskola 3–8. osztály (Digitális kultúra, Technika és Fejlesztő foglalkozás tantárgyak)  
**Működési környezet:** 100% Offline Helyi Hálózat (LAN) – 1 db Windows Server 2022 + 42 db Windows 10 kliensgép + több tanári munkaállomás.  
**Alapértelmezett port:** `3000` (http://szerver_ip:3000)

---

## 1. Alapvető Üzleti és Működési Modell (Single Source of Truth)

### 1.1. Tantárgy + Évfolyam Csatornamodell (Virtuális Termek)
* **A „Terem” jelentése:** A Socrative virtuális szobáinak megfelelője a rendszerben a **Tantárgy** (`Digitális kultúra`, `Technika`, `Fejlesztő foglalkozás`) és az **Évfolyam** (`3–8. évfolyam`) párosa.
* **Egymást követő tanórák kezelése (45 perces blokkok):**
  - A tanár az adott óra elején kiválasztja a Tantárgyat és Évfolyamot (pl. `Digitális kultúra` + `6. évfolyam`), majd a meglévő tesztjei közül kiválasztja az adott órára szánt feladatsort (pl. *14. teszt – Hálózatok*), és elindítja.
  - A diákok megírják, a tanár az óra végén leállítja a dolgozatot.
  - A következő órán érkező osztálynak (pl. 6.b, akik le vannak maradva) a tanár ugyanehhez az évfolyamhoz egy korábbi tesztet (pl. *13. teszt – Fájlkezelés*) indít el.
* **Párhuzamos munkamenetek (Kolléganő felmérése):**
  - A fejlesztő pedagógus a saját tantárgyában (`Fejlesztő foglalkozás` + `3. évfolyam`) elindítja a felmérőt.
  - Ez napokig nyitva tartható és aktív maradhat anélkül, hogy a tanórai Digitális kultúra dolgozatok lezárnák vagy zavarnák azt, mivel teljesen külön csatornán futnak.

### 1.2. Diák Belépési Folyamata (3 Kattintás, 0 Gépelés)
* **Miért szigorúan legördülő névsor (Nincs kézi névbeírás!):**
  - Általános iskolás (3–8. osztályos) gyermekeknél a kézi gépelés elkerülhetetlen elgépeléseket (*„kovacs peti”*, *„Peti”*, ékezet nélküli nevek) és viccelődéseket (*„Batman”*) eredményezne.
  - A hivatalos osztálynévsor garantálja a **hibátlan KRÉTA napló-illesztést**, a gyors Excel exportot és az atombiztos **munkamenet-folytatást (Session Recovery)**.
* **A belépés menete a diáknak:**
  1. **Tantárgy kiválasztása:** Alapértelmezetten a `Digitális kultúra` aktív (a szaktantermi 42 gépen parancsikonból átadható az alapértelmezés).
  2. **Osztály kiválasztása:** A diák kiválasztja a saját osztályát (pl. `6.a` vagy `3.b`). A program az osztály jelöléséből azonnal és automatikusan beazonosítja az **évfolyamot**, és betölti az ahhoz éppen aktív dolgozatot.
  3. **Név kiválasztása:** Lenyílik az adott osztály hivatalos névsora, a diák rákattint a saját nevére, és elindul a teszt.
  - *(Csapatverseny / Space Race módban a diák a névválasztás után önállóan választja ki a csapatszínét: pl. Kék, Piros, Sárga, Zöld).*

### 1.3. Tanári Vezérlőpult UX (Élő Státusz Kártyák / Fülek - Live Badges)
* **Azonnali áttekinthetőség:** A tanári admin felület fejlécében állandóan láthatóak az aktív és inaktív csatornák gyorsgombjai:
  - 🟢 **Digitális kultúra 6. évf.** *(ÉLŐ – „Hálózatok alapjai” – 21 diák csatlakozva)*
  - 🟢 **Fejlesztő foglalkozás 3. évf.** *(ÉLŐ – „Bemeneti mérés” – 3 diák csatlakozva)*
  - ⚪ **Technika 5. évf.** *(Inaktív)*
* **1-kattintásos navigáció:** A zölden világító fülre kattintva a felület azonnal az adott szoba élő eredménytáblájára (Matrix) vált. A státuszfülön NINCS külön gomb, így kizárt a véletlen leállítás.
* **Egyetlen Lezárás (Finish) gomb:** Kizárólag az élő eredménytábla jobb felső sarkában található a piros **[ ⏹️ Dolgozat befejezése (Finish) ]** gomb, amely megerősítés után állítja le a dolgozatot. A lezárást követően a fül automatikusan kikerül az aktív sávból.
* **Lezárás utáni exportlehetőségek (és a korábbi eredmények archívumából bármikor újra elérhető formátumok):**
  - 📊 **1. Csoportos Excel (.xlsx):** Színezett cellák (zöld/sárga/piros), diákok válaszai, összpontszám, százalék, KRÉTA érdemjegy és osztályátlag (fogadóórára és naplózáshoz).
  - 🌐 **2. Interaktív Csoportos HTML (.html):** Egyetlen önálló offline fájl, szűrhető, rendezhető, anonimizálható (nevek elrejtése) és kivetíthető statisztikával.
  - 📦 **3. Egyéni Értékelőlapok (.zip és Nyomtatható A4 PDF):** Minden diáknak külön díszes HTML fájl ZIP-be csomagolva, valamint egyetlen gombnyomással nyomtatható A4-es nézet (`@media print` szabályokkal, oldalanként egy diák) a böngészőből azonnali PDF mentéshez.
  - 🖥️ **4. Azonnali órai kiosztás:** A tanár engedélyezheti, hogy a lezáráskor a diákok saját képernyőjén megjelenjen a részletes személyre szabott értékelőlapjuk.
* **Több tanári gép párhuzamosan:** A központi szerverhez bármelyik tanári gépről be lehet jelentkezni jelszóval. A Socket.io valós időben mindkét tanár képernyőjén egyszerre frissíti a diákok válaszait.

### 1.4. Dolgozatírás, Kiértékelés és Adatintegritás Szabályai
* **Azonnali kiértékelés (Socrative-modell és pedagógiai cél):** A tanuló minden kérdés beküldésekor azonnal látja a minősítést:
  - Helyes válasz esetén: **zöld** kiemelés.
  - Hibás válasz esetén: **piros** kiemelés, és a rendszer **megjelöli a helyes választ** is.
  - *Tudatos pedagógiai megfontolás:* Ez a viselkedés az általános iskolai 3–8. osztályos formáló/tanulási célú mérést támogatja (azonnali hibajavítás és rögzülés). A tanárnak tudatában kell lennie, hogy a korábban végző diákok a helyes válaszokat továbbadhatják, ezért az órai ültetés és figyelemfelügyelet alapvető része az alkalmazásnak.
* **Végleges és idempotens válaszok:** A diák nem léphet vissza korábbi válaszokat módosítani. Hálózati mikromegszakadásból eredő duplikált beküldés esetén a szerver adatbázis-szinten (`UNIQUE(participant_id, question_id)`) védi az adatok épségét.
* **Szerveroldali időkorlát és automatikus lezárás (`deadline_at`):** Az időzítő nem a kliens helyi órájára támaszkodik: ha `time_limit_min > 0`, a szerver a tanuló belépési pillanatában egységes UTC ISO 8601 időbélyeggel rögzíti a pontos `deadline_at` lejárati időpontot (`joined_at + time_limit_min`). Ha `time_limit_min = 0` (időkorlát nélküli dolgozat), a `deadline_at` értéke `NULL`, a tanulónak nincs egyéni visszaszámlálója, a dolgozat a saját befejezéséig vagy a tanár óra végi lezárásáig tart. Újracsatlakozáskor az idő nem indul újra. A szerver minden válasznál szigorúan ellenőrzi: `server_utc_now < deadline_at`; a határidő elérésekor a szerver a további válaszokat elutasítja, és automatikusan lezártnak (`is_finished = 1`) jelöli a diákot. A válaszmentés tranzakcióban (`BEGIN IMMEDIATE`) fut, garantálva az idempotenciát.
* **Csatorna-egyediség és állapot-összhang:** Adatbázisszinten (`idx_active_session_channel`) szavatolt, hogy egy tantárgy–évfolyam csatornán egyszerre szigorúan legfeljebb **1 aktív dolgozat** futhat. A `sessions` tábla CHECK feltétele kizárja az ellentmondásos állapotokat (aktív dolgozatnak nem lehet lezárási ideje, befejezettnek kötelező). A dolgozat tesztje (`quiz_id`) indítás után utólag megváltoztathatatlan (`trg_prevent_session_quiz_change`).
* **Munkamenet–Résztvevő–Válasz kapcsolati garancia:** Az `answers` tábla összetett idegen kulccsal (`participant_id, session_id`) és adatbázis-triggerrel (`trg_validate_answer_question`) kényszeríti ki, hogy egy válasz kizárólag ahhoz a dolgozathoz és kvízhez tartozhasson, amelyben a diák valóban résztvevő.
* **Tartós Tesztzárolás (`quizzes.locked_at` és Triggerek):** Amint egy teszthez elindul az első dolgozat (`session`), a trigger azonnal kitölti a `quizzes.locked_at` mezőt (UTC ISO 8601), amely többé nem állítható vissza `NULL`-ra. A zárolt teszt adatai (cím, tantárgy, évfolyam, alapértelmezett időkorlát: `trg_lock_quiz_update`) és kérdései adatbázis-triggerekkel védettek `INSERT`, `UPDATE` és `DELETE` ellen. Módosítási szándék esetén a tanári felület a **[ 📋 Másolat készítése és szerkesztése (Duplikálás) ]** funkcióval önálló, független kérdéspéldányokat hoz létre az új teszthez, így a múltbeli dolgozatok eredményei örökre megőrzik hitelességüket (még a tanév végi archiválás után is).
* **Lezárt Dolgozat Abszolút Védelme és Rekordbeszúrási Tilalom:** A lezárt (`FINISHED`) dolgozat állapota semmilyen módon nem állítható vissza aktívvá (`trg_prevent_session_reopen`), és a befejezési ideje sem módosítható (`trg_prevent_session_ended_at_change`). A lezárt dolgozathoz adatbázisszinten tilos új résztvevőt hozzáadni (`trg_prevent_participant_insert_when_finished`), és tilos utólag új választ beszúrni (`trg_prevent_answer_insert_when_finished`). A lezárt dolgozat beállításai (`grade_thresholds_json`, `shuffle_questions`, `mode`, stb. - `trg_prevent_finished_session_update`) és a résztvevők történeti adatai (`trg_prevent_finished_participant_update`) mindenfajta utólagos felülírástól védettek. Lezárt dolgozat, annak résztvevői és válaszai fizikai törlés ellen triggerekkel védettek (`trg_prevent_finished_session_delete`, `trg_prevent_participant_delete_when_finished`, `trg_prevent_answer_delete_when_finished`), kizárva minden véletlen vagy szándékos törlési és módosítási kiskaput.
* **Válaszok immutabilitása, Törlésvédelem és Pontozási Konzisztencia:** A diák által leadott válasz alapadatai és időadatai (`session_id, participant_id, question_id, submitted_answer, answered_at, time_spent_sec`) trigger szinten megváltoztathatatlanok (`trg_prevent_answer_core_update`). Adatbázisszintű CHECK feltétel szavatolja a pontozási konzisztenciát: `WRONG` státusz esetén kötelezően `points_earned = 0.0` és `is_correct = 0`, `CORRECT` státusznál `is_correct = 1` és `points_earned >= 0.0`, míg `PARTIAL` státusznál szigorúan `is_correct = 1` és `points_earned > 0.0`. A kapott vagy felülbírált pontszám nem haladhatja meg a kérdés maximális pontértékét (`trg_validate_answer_points_limit` és `trg_validate_answer_points_limit_update`). Kizárólag a tanári felülbírálás módosíthatja a pontozást és státuszt, szigorú szerveroldali jogosultság-ellenőrzéssel és pontplafon hibajelzéssel egyetlen tranzakcióban. Az eredeti gépi pontszám (`original_points_earned`) beszúráskor kötelezően rögzül (`NOT NULL`), és utólag megváltoztathatatlan marad a legutóbbi javítási időbélyeggel (`overridden_at`) együtt.
* **Archiválás és Tanévek kezelése:** Az élő adatbázisból nem kell és nem szabad törölni a lezárt dolgozatokat. Az archiválás az SQLite Backup API segítségével egy teljes, konzisztens ZIP mentést jelent (`ropdolgozat.db` + feltöltött képek). A korábbi tanévek zárolt tesztjeiből az új tanévben korlátlanul indíthatók új dolgozatok az új osztályoknak változatlan tartalommal.
* **Session Recovery és Tantermi Munkamenet-biztonság (Report 12):** 
  - **Azonos böngésző:** Ha a tanuló a saját gépén frissíti a böngészőt, a tárolt kriptográfiai `session_token` alapján automatikusan a folyamatban lévő kérdéshez ugrik. Másik gép vagy böngésző nem veheti át a nevet token nélkül.
  - **Gépváltás adatvesztés nélkül (Tanári jóváhagyással):** Ha egy gép elromlik, a tanár az élő mátrixban a **[ 💺 Gépváltás ]** gombra kattintva engedélyezi az átülést. A tanuló korábbi válaszai és pontjai maradéktalanul megmaradnak, a régi gép tokenje azonnal érvénytelenné válik, és az új gép új tokent kap.
  - **Téves névfoglalás törlése:** Ha egy diák véletlenül a padtársa nevére kattintott bejelentkezéskor, a tanár a **[ 🗑️ Név törlése ]** gombbal kitörli a téves rekordot és a tévesen leadott válaszokat az aktív dolgozatból, így a valódi diák tiszta lappal léphet be.
* **Diákazonosítás és Történeti Hitelesség:** A tanulók stabil belső `student_id` alapján azonosítódnak, a nevük pedig történeti pillanatfelvételként tárolódik. Azonos nevű diákok esetén a hivatalos KRÉTA naplózási gyakorlat szerint megkülönböztető jelölés (pl. „Kovács Péter I.”, „Kovács Péter II.”) alkalmazandó.
* **Alapértelmezett KRÉTA ponthatárok:** `0–29%: 1`, `30–54%: 2`, `55–74%: 3`, `75–89%: 4`, `90–100%: 5`.

---

## 2. Technológiai Stack és Adatbázis Szerkezet

* **Futási környezet:** Node.js (v20+ LTS) + `express` + `better-sqlite3` + `socket.io` + `cookie-parser` + `multer` + `exceljs` + `archiver`.
* **Frontend:** 100% Offline Vanilla HTML5 + modern CSS3 (`public/css/style.css`, Flexbox, CSS Grid) + Vanilla JavaScript (ES6+), Zero-Build. Nincs külső CDN, beágyazott inline SVG ikonok.
* **Kódkiemelés és XSS-védelem:** Kódrészleteknél (backtick: `` `kód` ``) kötelező az `escapeHtml` szűrés a `<code>` formázás előtt.
* **Adatbázis Táblák (SQLite WAL módban):**
  1. `subjects` (Tantárgyak: Digitális kultúra, Technika, Fejlesztő foglalkozás)
  2. `students` (Előre rögzített hivatalos osztálynévsorok: osztálynév + diák teljes neve)
  3. `quizzes` (Feladatsorok fejléce, évfolyam megjelöléssel és tantárgy kapcsolattal)
  4. `questions` (Kérdések: ABCD, TF, SHORT opciókkal, pontszámmal, képpel, magyarázattal)
  5. `sessions` (Aktív és lezárt órai alkalmak / szobák, évfolyammal, tantárggyal, ponthatárokkal)
  6. `participants` (Csatlakozott tanulók, gépazonosító `1-42`, csapatszín, fókuszvesztés-számláló)
  7. `answers` (Egyedi diákválaszok, `eval_status`, `points_earned`, manuális felülbírálás)

---

## 3. Fejlesztési Ütemterv (AI_RULES.md szerint)

1. **1. Lépés:** `package.json`, `config.js`, `src/db/init.js` létrehozása a végleges séma és beépített minta Digitális kultúra teszt + osztálynévsor alapján.
2. **2. Lépés:** Alap webszerver (`server.js`), jelszavas hitelesítés (`src/middleware/auth.js`), pontozó logika (`src/services/grader.js`), valamint az adattárak (`rosterRepo.js`, `quizRepo.js`, `sessionRepo.js`).
3. **3. Lépés:** Valós idejű kommunikáció (`liveHandler.js`) és REST API útvonalak (`routes/api.js`).
4. **4. Lépés:** Offline stílusok (`style.css`), segédfüggvények (`utils.js`), valamint a diák felület (`student.html`, `student.js`).
5. **5. Lépés:** Tanári elsődleges vezérlőpult (`admin.html`, `admin.js`) élő státuszfülekkel (Live Badges), mátrixszal és szerkesztőkkel.
6. **6. Lépés:** Tanári másodlagos kivetítő (`projector.html`, `projector.js`) Space Race verseny grafikával és anonim statisztikával.
7. **7. Lépés:** Exportok (KRÉTA Excel, interaktív HTML, egyéni ZIP és nyomtatható PDF sablon), biztonsági mentés (`backup.js`), valamint a szerverindító `start_server.bat`.
