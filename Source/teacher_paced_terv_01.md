# Teacher Paced (Tanári léptetés) mód és válaszválasztási UX – Részletes beépítési terv (v1.0)

- **Dokumentum azonosítója:** `Source/teacher_paced_terv_01.md`
- **Kiindulási állapot:** Okoskodó `v1.34.5`
- **Dátum:** 2026. november 22.
- **Érintett terület:** Új `TEACHER_PACED` dolgozatmód (SQLite-sémaváltás nélkül) + diákoldali válaszválasztási színek és jelölések újratervezése

---

## 1. Cél és pedagógiai alapelvek

A **Teacher Paced (Tanári léptetés)** mód célja, hogy a tanár – különösen alsóbb évfolyamokon (pl. 3. osztályban) az alkalmazás első megismerésekor vagy közös órai gyakorláskor – kérdésről kérdésre, egységes tempóban vezethesse végig az osztályt a feladatsoron.

### Alapvető működési szabályok (Socrative-modell alapján)
1. **Szigorú kérdéssorrend (nincs kérdéskeverés):** `TEACHER_PACED` módban minden diák egyszerre pontosan ugyanazt a kérdést látja a feladatsor eredeti sorrendjében (`shuffle_questions = 0` automatikusan kényszerítve mind a felületen, mind a szerveren).
2. **Válaszlehetőségek keverése engedélyezett:** A válaszopciók keverése (`shuffle_options`) továbbra is szabadon be- vagy kikapcsolható az indítási ablakban.
3. **Visszajelzés és magyarázat kapcsolhatósága:** A dolgozat indításakor beállítható, hogy a válasz beküldése után a tanuló lássa-e az azonnali kiértékelést (helyes/hibás válasz + tanári magyarázat).
4. **Nincs külön üres „várakozó képernyő” válaszadás után:**
   - Amikor a tanuló beküldi a válaszát, a képernyőn **továbbra is az aktuális kérdés marad látható** a bejelölt válaszával (és – ha a tanár engedélyezte – a kiértékeléssel, helyes megoldással és magyarázattal).
   - A „Következő kérdés” gomb helyén kizárólag egy nyugodt, informatív állapotjelző sáv jelenik meg:
     > *„Válasz beküldve. Várd meg, amíg a tanár a következő kérdésre lép!”*
   - Ha a tanuló a későbbi kérdésnél jár, vagy a tanár még nem lépett tovább, a diák nem tud önállóan előrelépni a következő kérdésre.
5. **Adatbázis-séma érintetlensége:** A `sessions` táblában a `mode = 'TEACHER_PACED'` és a `current_question_index` oszlop már létezik, ezért **nincs szükség SQLite-sémamódosításra vagy migrációra**. A meglévő `STUDENT_PACED` és `SPACE_RACE` módok működése 100%-ban változatlan marad.

---

## 2. Érintett fájlok és beépítési térkép

| Fájl | Feladat |
| --- | --- |
| `src/db/sessionRepo.js` | `TEACHER_PACED` indítás engedélyezése (`shuffle_questions` automatikusan `0`, `current_question_index` alapértelmezett `0`); szerveroldali ellenőrzés `submitAnswer()`-ben, hogy a diák csak az aktuálisan aktív kérdésre küldhessen választ; `setCurrentQuestionIndex()` határellenőrzéssel (`0 <= index < totalQuestions`). |
| `src/routes/api.js` | Új védett tanári végpont `POST /api/admin/sessions/:id/question-index` (`requireAdminAuth`, `req.routeLogged = 'admin.teacher_step'`); `GET /api/student/session-data` válasz kiegészítése az aktuális `current_question_index` mezővel `TEACHER_PACED` módhoz; `show_feedback_on_end` / magyarázat kapcsoló átadása `POST /api/admin/sessions/start`-nál. |
| `src/sockets/liveHandler.js` | Meglévő `teacher:next_question` esemény megerősítése (`TEACHER_PACED` mód- és határellenőrzés, valamint `sessionId` csatolása a `session:question_changed` eseményhez). |
| `src/services/diagnostics.js` | `admin.teacher_step` felvétele az `ALLOWED_ROUTES` listába (a diagnosztikai naplózás összhangjáért). |
| `public/admin.html` | 1. A `TEACHER_PACED` opció aktiválása a dolgozatindító modálban (`#start-mode`).<br>2. Új „Azonnali kiértékelés és magyarázat megjelenítése” jelölőnégyzet a dolgozatindító modálban.<br>3. Tanári léptető vezérlősáv elhelyezése az élő mátrix fölött (csak `TEACHER_PACED` módban látható): **Előző kérdés**, **aktuális kérdésszám / összes kérdés + kérdés címsor előnézet**, **Következő kérdés**, valamint gyors kérdésválasztó. |
| `public/js/admin.js` | Indítási modál dinamikus viselkedése (`TEACHER_PACED` választásakor a „Kérdések keverése” checkbox automatikusan kikapcsol és letiltódik, a „Válaszok keverése” aktív marad; „Egyéni időkorlát” opcionális marad vagy `0`-ra állítható); léptető sáv vezérlése és valós idejű frissítése több tanári gép között (`session:question_changed`). |
| `public/js/student.js` | `TEACHER_PACED` támogatás: kezdeti és újracsatlakozási kérdésindex betöltése (`session.current_question_index`), `session:question_changed` Socket.IO eseményre azonnali kérdésváltás, már megválaszolt kérdésre való visszalépéskor a korábbi válasz és kiértékelés visszaállítása, beküldés után „Következő kérdés” gomb helyett tanári léptetésre váró üzenetsáv megjelenítése. |
| `public/css/style.css` | 1. Válaszválasztási (`selected`) állapot átszínezése narancsról semleges, nyugodt **halványkékre** (ABCD és TF csempéken egyaránt).<br>2. A jobb oldali pipa (`✓`) eltávolítása a kiválasztási állapotból – a pipa (`✓`) és az `✕` kizárólag a beküldés utáni kiértékeléskor (zöld / piros) jelenik meg.<br>3. Tanári léptető sáv és diákoldali „Várakozás a tanárra” sáv stílusai (tiszta CSS-szabályokkal). |
| `scratch/test_teacher_paced.js` | Új, izolált automatizált integrációs tesztcsomag a `TEACHER_PACED` mód összes szabályára, bekötve a `scratch/run_all_tests.js`-be. |

---

## 3. Részletes működési specifikáció

### 3.1. Dolgozat indítása (`TEACHER_PACED`)
- A tanári indító ablakban (`#modal-start-session`) a `#start-mode` legördülőben aktiválódik a:
  - `Tanári léptetés (Teacher Paced – közös haladás)` opció.
- Ha a tanár a `TEACHER_PACED` módot választja:
  - A **„Kérdések keverése”** jelölőnégyzet automatikusan **kivett állapotba** kerül és letiltódik (magyarázó felirattal: *„Tanári léptetésnél a kérdések sorrendje rögzített”*).
  - A **„Válaszok keverése”** jelölőnégyzet továbbra is szabadon kapcsolható.
  - Megjelenik / elérhető az **„Azonnali visszajelzés és magyarázat megjelenítése”** jelölőnégyzet (alapértelmezetten bekapcsolva, a meglévő `show_feedback_on_end` oszlopot használva: `1` = azonnali kiértékelés + megoldás + magyarázat látszik; `0` = csak a *„Válasz beküldve. Várd meg, amíg a tanár a következő kérdésre lép!”* jelzés látszik, megoldás és magyarázat nélkül).
- Szerveroldali garancia (`sessionRepo.startSession`):
  - `if (mode === 'TEACHER_PACED')`: `effectiveShuffleQuestions = 0` kötelezően, `current_question_index = 0` (az 1. kérdés azonnal nyitott).
  - A `participants.question_order_json` a `quiz_snapshot_json` eredeti sorrendjét kapja minden diáknál, így a `questionIndex = 0` minden gépnél garantáltan ugyanazt az 1. kérdést jelenti.

### 3.2. Tanári léptetés és szinkronizáció
- **Végpont:** `POST /api/admin/sessions/:id/question-index` (`{ questionIndex: number }`), `requireAdminAuth` védelemmel.
- **Szerveroldali ellenőrzések (`sessionRepo.setTeacherQuestionIndex`):**
  1. A munkamenet létezik, aktív (`status === 'ACTIVE'`) és `mode === 'TEACHER_PACED'`.
  2. A `questionIndex` egész szám és a `[0, totalQuestions - 1]` tartományba esik.
  3. Frissíti a `sessions.current_question_index` értékét az adatbázisban.
  4. Broadcastol a Socket.IO szobákba:
     - `session_${sessionId}_student`
     - `session_${sessionId}_teacher` (több tanári gép azonnali szinkronja)
     - `session_${sessionId}_projector`
     - Esemény: `session:question_changed`, payload: `{ sessionId, questionIndex }`.
- **Tanári vezérlősáv az élő mátrix fölött (`public/admin.html` & `public/js/admin.js`):**
  - Csak akkor látható, ha az éppen megtekintett aktív dolgozat módja `TEACHER_PACED`.
  - Elemei:
    - **[ ◀ Előző kérdés ]** gomb (0-nál inaktív).
    - **Kérdésjelző és gyorsugró:** `1 / 10. kérdés` + az aktuális kérdés szövegének rövid előnézete + hány csatlakozott diák válaszolt már erre a kérdésre (pl. *„18 / 22 diák válaszolt”*).
    - **[ Következő kérdés ▶ ]** gomb (utolsó kérdésnél inaktív, és ekkor látható emlékeztető, hogy a jobb felső **Dolgozat befejezése** gombbal zárható le az óra).

### 3.3. Diákoldali viselkedés (`TEACHER_PACED`)
1. **Belépés és oldalfrissítés (Session Recovery):**
   - A `GET /api/student/session-data` visszaadja a `session.current_question_index` értéket.
   - `TEACHER_PACED` módban a diák felülete **mindig** a `session.current_question_index` által kijelölt kérdést nyitja meg (nem az első megválaszolatlan kérdést).
   - Ha a tanuló már korábban beküldte a válaszát erre a kérdésre (pl. oldalfrissítés után vagy mert a tanár visszalépett egy előző kérdésre):
     - A felület zárolt állapotban mutatja a kérdést, a tanuló saját válaszát és (ha a visszajelzés engedélyezett) a kiértékelést, helyes megoldást és magyarázatot, alatta pedig a várakozó üzenetsávot.
2. **Válasz beküldése:**
   - **Szerveroldali védelem (`sessionRepo.submitAnswer`):** `TEACHER_PACED` módban a szerver ellenőrzi, hogy a beküldött `question_id` megegyezik-e a `sessions.current_question_index` pozíción álló kérdéssel (ha nem, strukturált üzleti elutasítás: `QUESTION_NOT_ACTIVE`, HTTP `400`). *Megjegyzés:* az idempotencia továbbra is érvényes – ha már mentve volt a válasz erre a kérdésre, hiba nélkül visszaadja (`alreadySubmitted: true`).
   - **Kliensoldali megjelenés beküldés után:**
     - **Ha az azonnali visszajelzés és magyarázat be van kapcsolva (`hideFeedback === false`):**
       - Megjelenik a szokásos kiértékelés (zöld/piros csempék, helyes válasz, tanári magyarázat),
       - A „Következő kérdés” gomb **rejtve marad**, helyette megjelenik a nyugodt tájékoztató sáv:
         *„Válasz beküldve. Várd meg, amíg a tanár a következő kérdésre lép!”*
     - **Ha az azonnali visszajelzés ki van kapcsolva (`hideFeedback === true`):**
       - A diák kérdése és a bejelölt válasza zárolva a képernyőn marad (nem ugrik előre!),
       - A „Válasz beküldése” gomb eltűnik, helyette megjelenik a semleges kék/szürke állapotjelző sáv:
         *„Válasz beküldve. Várd meg, amíg a tanár a következő kérdésre lép!”*
3. **Tanári léptetés érkezése (`socket.on('session:question_changed')`):**
   - Ha az `activeSession.mode === 'TEACHER_PACED'` és a `sessionId` egyezik:
     - A diák felülete azonnal meghívja a `renderQuestion(questionIndex)` függvényt (ha a tanuló még nem válaszolt az új kérdésre, tiszta, válaszolható állapotban; ha már válaszolt rá korábban, a mentett válaszával és visszajelzésével zárolva).
   - **Fontos részlet:** `TEACHER_PACED` módban a diák az utolsó kérdés megválaszolása után **nem** zárja le magától a dolgozatot (`finishQuiz()`), hanem továbbra is a képernyőn marad a visszajelzéssel és a *„Válasz beküldve. Várd meg, amíg a tanár lezárja a dolgozatot!”* üzenettel – az értékelőlap akkor jelenik meg, amikor a tanár rákattint a **Dolgozat befejezése** gombra. *(Ha a tanuló a korábbi kérdések egyikét kihagyta, majd a tanár visszalép rá, így még tud rá válaszolni!)*

---

## 4. Válaszválasztási színek és a jobb oldali pipa újratervezése (UX javítás)

Ez a módosítás **minden dolgozatmódban** (`STUDENT_PACED`, `SPACE_RACE`, `TEACHER_PACED`) egységesen javítja a diákélményt, különösen a 3–5. osztályosoknál.

### A probléma oka (diagnózis a `public/css/style.css` alapján)
- A jelenlegi `.quiz-option-tile.selected` és `.quiz-tf-tile.selected` szabályok a `--primary` terrakotta/narancs színt használják (`#a33900` / `#ea580c`) és narancssárga korongban fehér pipát (`✓`) jelenítenek meg a válasz jobb oldalán.
- Mivel a narancs vizuálisan túl közel áll a hibás választ jelölő piroshoz (`--danger`), a felhasználók könnyen megijednek, hogy hibás választ adtak még a beküldés előtt.
- A kiválasztáskori pipa (`✓`) pedig összekeverhető a „helyes válasz” vagy a „már beküldve” állapottal.

### Tervezett új vizuális állapotok

| Állapot | Csempe háttér | Keret | Bal oldali betűjel (`A`, `B`, `C`, `D`) | Jobb oldali jelölő |
| --- | --- | --- | --- | --- |
| **Alapállapot** | Fehér (`#ffffff`) | Halvány szürke | Világosszürke korong, sötét betű | Üres, halvány körvonal (rádiógomb) |
| **Kiválasztva (`.selected`)** | **Halvány égkék (`#eff6ff`)** | **Nyugodt kék (`#3b82f6`)** | **Halványkék korong (`#dbeafe`), sötétkék betű (`#1d4ed8`)** (vagy kék korong `#2563eb` fehér betűvel) | **Nincs pipa!** Tiszta kék rádiógomb-pötty (vagy teljesen elrejtve a kiértékelésig – lásd lentebb a döntési pontot) |
| **Kiértékelve – Helyes (`.tile-correct`)** | Halványzöld (`var(--success-bg)`) | Zöld (`var(--success)`) | Zöld korong, fehér betű | **Zöld korong + fehér pipa (`✓`)** |
| **Kiértékelve – Hibás (`.tile-wrong`)** | Halványpiros (`var(--danger-bg)`) | Piros (`var(--danger)`) | Piros korong, fehér betű | **Piros korong + fehér X (`✕`)** |

* **Igaz / Hamis (`.quiz-tf-tile.selected`):** Ugyanazt a nyugodt halványkék hátteret (`#eff6ff`), kék keretet (`#3b82f6`) és sötétkék feliratot (`#1d4ed8`) kapja.

---

## 5. Tesztelési és elfogadási terv (`scratch/test_teacher_paced.js`)

Az új, elszigetelt tesztfájl (bekötve a `scratch/run_all_tests.js` csomagba) az alábbi eseteket ellenőrzi automatizáltan:
1. **TP-01 – Indítás és sorrendkényszerítés:** `TEACHER_PACED` indítás sikeres, `shuffle_questions` automatikusan `0` akkor is, ha `1`-gyel hívták, `current_question_index` kezdetben `0`, minden diák ugyanazt a kérdéssorrendet kapja.
2. **TP-02 – Válaszbeküldés korlátozása az aktív kérdésre:** A diák a 0. (aktív) kérdésre sikeresen küldhet választ, de a 2. (még nem megnyitott) kérdésre küldött válasz `400` + `QUESTION_NOT_ACTIVE` elutasítást kap.
3. **TP-03 – Tanári léptetés és határellenőrzés:** `POST /api/admin/sessions/:id/question-index` sikeresen léptet `1`-re, érvénytelen indexre (`-1` vagy `totalQuestions`) `400`-at ad, jogosulatlan (nem admin) kérésre `401`-et ad. Léptetés után a diák már beküldheti a 2. kérdés válaszát.
4. **TP-04 – Visszalépés és idempotencia:** Ha a tanár visszalép `0`-ra, a diák `session-data` lekérése a `0` indexet adja vissza, a már leadott válasza sértetlenül megvan, ismételt beküldése `alreadySubmitted: true`.
5. **TP-05 – Visszajelzés/magyarázat kapcsolhatósága:** `show_feedback_on_end = 0` beállítással a `submit-answer` válaszban `hideFeedback: true` és `correctAnswer / explanation === null`; `show_feedback_on_end = 1` esetén mindkettő visszajön.
6. **TP-06 – Dolgozat lezárása:** `TEACHER_PACED` módban az utolsó kérdés megválaszolása nem zárja le automatikusan a teljes sessiont; a tanári `finishSession` zárja le, és utána a riportok/exportok hibátlanul elkészülnek.

---

## 6. Két nyitott kérdés a véglegesítés előtt

1. **Jobb oldali korong a kiválasztáskor (ABCD válaszoknál):**
   - **A opció (ajánlott):** Kiválasztáskor a jobb oldalon csak egy finom, pipa nélküli **kék rádiógomb** jelenjen meg (külső kék gyűrű + belső kék pötty), a pipa (`✓`) és az `✕` pedig kizárólag a beküldés utáni zöld/piros kiértékeléskor jelenjen meg.
   - **B opció:** Kiválasztáskor egyáltalán ne legyen jobb oldali korong (teljesen letisztult kártya, bal oldalon a kék `A/B/C/D` betűjellel és kék kerettel), és a jobb oldali zöld pipa / piros X csak kiértékelés után jelenjen meg.
2. **Válasz beküldése visszalépéskor (`TEACHER_PACED`):**
   - Ha a tanár előrelép a 2. kérdésre, majd visszalép az 1.-re, az a diák, aki lemaradt és még nem válaszolt az 1. kérdésre, **pótolhassa-e** a választ, amíg a tanár az 1. kérdésen áll? *(A terv jelenleg igenre állította, mert 3. osztályosoknál ez nagy segítség – de könnyen szigorítható is, ha másképp szeretnéd.)*
