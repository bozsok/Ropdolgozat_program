# Változási napló (CHANGELOG)

Minden lényeges módosítás, hibajavítás és funkcióbővítés ebben a fájlban kerül rögzítésre a [Keep a Changelog](https://keepachangelog.com/hu/1.0.0/) ajánlásai, a [Szemantikus verziószámozás](https://semver.org/lang/hu/) (SemVer) irányelvei, valamint a magyar helyesírás szabályai (MTA 12. kiadása) szerint.

---

## [1.37.9] – 2026-11-25

### PDF-import karakterjavítás, Tesztszerkesztő szövegformázás és dinamikus beviteli mezők

Célzott hibajavítások, új szerkesztői szövegformázás és UX-finomítások a napi tantermi munka gyorsításához, SQLite-sémamódosítás nélkül (`13700`).

#### Hozzáadva (Added)
* **Szövegformázási lehetőségek és dinamikus magasságú beviteli mezők a Tesztszerkesztőben (`public/js/utils.js`, `public/js/admin.js`, `public/js/student.js`, `public/css/style.css`):**
  - **Fájlok:** [`public/js/utils.js`](file:///d:/dev/Röpdolgozat%20program/public/js/utils.js), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A központi, XSS-biztos `formatCode()` kibővült a **félkövér** (`**szöveg**`), *dőlt* (`*szöveg*`), aláhúzott (`__szöveg__`), `kód` (`` `kód` ``), felső index (`^szöveg^`), alsó index (`~szöveg~`) és sortörés (`\n` → `<br>`) támogatásával, védett inline kódblokkokkal és új `stripFormatting()` segédfüggvénnyel.
  - A Tesztszerkesztőben a **Kérdés szövege** (`.q-text`, alapból 2 soros) és a **Válaszlehetőségek** (`.q-opt-input`, alapból 1 soros) automatikusan méreteződő (`auto-resize`) `<textarea>` mezők lettek.
  - Minden kérdéskártyán kompakt formázó eszköztár (`B`, `I`, `U`, `</>`,`x²`, `x₂`, `↵`) és gyorsbillentyű-támogatás (`Ctrl+B`, `Ctrl+I`, `Ctrl+U`) segíti a kérdések és válaszok formázását a kijelölés elvesztése nélkül; a formázott szövegek a diák felületen és az összegző kártyán is helyesen jelennek meg.

#### Javítva (Fixed)
* **Socrative PDF-importnál kimaradó `r` betűk és írásjelek javítása (`src/services/socrativePdfParser.js`):**
  - **Fájl:** [`src/services/socrativePdfParser.js`](file:///d:/dev/Röpdolgozat%20program/src/services/socrativePdfParser.js)
  - A Socrative PDF-ekben használt `Inter` betűtípus OpenType kontextuális (`calt`/`case`) glifáihoz a PDF-exportáló `<0000>` (`ToUnicode`) értéket rendel, ami miatt bizonyos betűkapcsolatokban (pl. `interneten`, `pendrive`, `történik`, `True`) kiesett az `r` betű és néhány írásjel/operátor.
  - A `getFontCMap()` kiolvassa a betűtípus `/BaseFont` nevét, és az `INTER_NULL_GLYPH_FALLBACK` tábla kizárólag `Inter` betűtípusnál, tényleges `<0000>` bejegyzés esetén pótolja a hiányzó karaktereket (`<0336>` → `r`, `<051E>` → `(`, `<051F>` → `)`, `<0535>` → `-`, `<056F>` → `=`, `<0571>` → `+`, `<0572>` → `–`, `<0581>` → `×`).
  - **Adatbázis utólagos javítása (`data/ropdolgozat.db`):** Biztonsági mentés ([`ropdolgozat_before_r_fix_2026-11-25T06-08-00.db`](file:///d:/dev/Röpdolgozat%20program/data/backups/ropdolgozat_before_r_fix_2026-11-25T06-08-00.db)) után 31 már importált teszt 323 kérdésében 820 elmaradt `r` betű és 6 db `104108` → `104-108` érték került kijavításra, az ABCD javítókulcsok (`options_json` ↔ `correct_answer`) teljes szinkronjával és SQLite integritás-ellenőrzéssel.

* **Ismétlődő instrukciós mondat kiszűrése PDF-importnál (`src/services/socrativePdfParser.js`):**
  - **Fájl:** [`src/services/socrativePdfParser.js`](file:///d:/dev/Röpdolgozat%20program/src/services/socrativePdfParser.js)
  - PDF-importáláskor a `qBody` (a **Kérdés szövege** mező) összeállításakor automatikusan eltávolításra kerül a `Válaszd ki az egyetlen helyes megoldást!` mondat (kis- és nagybetű-függetlenül), mivel ez az ABCD kérdéseknél már alapértelmezetten szerepel a **További instrukciók a kérdéshez** (`instructions`) mezőben.

#### Módosítva (Changed)
* **Mappaalapú automatikus évfolyam-felismerés a PDF-importálásnál (`public/admin.html`, `public/js/admin.js`):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A *PDF importálása* modál `#import-pdf-grade` alapértelmezése `6. évfolyam` helyett **`3. évfolyam`** lett.
  - A `detectGradeFromCurrentFolder()` a modál megnyitásakor belülről kifelé végignézi az aktuális mappa útvonalát (`currentBreadcrumbs`), és ha talál `3–8` közötti évfolyamra utaló mintát (pl. `7. évfolyam`, `7. évf.`, `7. osztály`, `7. oszt.`, `7.o`, `7. o.`, `7 osztály`), automatikusan azt az évfolyamot jelöli ki.

* **Felesleges statikus alsó tippsáv eltávolítása a diák felületről (`public/student.html`):**
  - **Fájl:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html)
  - Eltávolításra került a statikus `.quiz-calm-tip-compact` sáv a kérdéskártya alól, több függőleges teret hagyva a feladatoknak és ábráknak.

---

## [1.37.8] – 2026-11-24

### Open Navigation (Szabad navigáció) UX-finomítás: Stabil lábléc görgetősáv-villanás nélkül és átlátható beadás-elhelyezés

Tantermi használhatósági és vizuális javítások az Open Navigation diákfelületen, SQLite-sémamódosítás nélkül (`13700`).

#### Javítva és módosítva (Fixed and Changed)
* **Ábrás kérdéseknél jelentkező függőleges görgetősáv-villanás megszüntetése (`public/css/style.css`, `public/js/student.js`):**
  - **Fájlok:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `#open-nav-save-status` mentési állapotjelző külön, fix magasságú (`20px`) felső mikro-sorba került (`order: -1; flex: 1 0 100%; white-space: nowrap;`), a gombcsoportok `flex-wrap: nowrap`-ot kaptak, a **„Válasz törlése”** gomb pedig `display: none` helyett az `.is-hidden-slot` (`visibility: hidden; opacity: 0;`) osztállyal tartja meg a helyét — így kattintáskor és mentés közben egyetlen pixelt sem ugrik a felület.

* **Következetes gombszínek és a *Dolgozat beadása* gomb áthelyezése (`public/student.html`, `public/css/style.css`, `public/js/student.js`):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Az alsó `#open-nav-footer-bar` jobb oldalán kizárólag a **„Következő”** gomb maradt a többi dolgozatmóddal egységes, kiemelt **narancs** stílusban (`.quiz-btn-submit`), megelőzve a diákok reflexszerű, korai beadását.
  - A **„Dolgozat beadása”** gomb (`#btn-open-nav-submit`) átkerült a felső haladási kártya (`.quiz-progress-header`) jobb felső sarkába, közvetlenül a kérdéstérkép fölé, visszafogott **pasztell halványpiros** stílusban (`.open-nav-btn-submit-top`), egyértelműen jelezve a végleges lezárás jellegét.

---

## [1.37.7] – 2026-11-24

### Open Navigation (Szabad navigáció) – Igazolt végállapot védelme a betöltés közbeni tanári lezárásnál

A `v1.37.6` ellenőrzése (`Source/open_navigation_valasz_08.md`) során azonosított utolsó aszinkron átmenet javítása, SQLite-sémamódosítás nélkül (`13700`).

#### Javítva és megerősítve (Fixed and Hardened)
* **Igazolt végállapot elsőbbsége és korai mód-felismerés (`public/js/student.js`):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `joinQuiz()` már a sikeres belépéskor beállítja `isOpenNavigationMode`-ot, alaphelyzetbe állítja `openNavIsFinalized` és `openNavClosurePending` értékét (új munkamenet tiszta indulása), és rögzített kontextussal indítja a `startQuizInterface()`-t.
  - A `socket.on('session:finished')` az `activeSession.mode` / `currentParticipant.session_mode` alapján még a kezdeti kérdésbetöltés közben is felismeri az Open Navigation módot, beállítja `openNavClosurePending = true`-t, érvényteleníti a függő `quizInterfaceLoadSeq`-et, és elindítja a közös `syncOpenNavServerState({ requireFinal: true })` ellenőrzést.
  - Minden igazolt végállapot-átmenet növeli `quizInterfaceLoadSeq++`-t (a token és a résztvevő megőrzésével az élő pontfrissítéshez), a `startQuizInterface()` nyitott kitöltési ága pedig `openNavIsFinalized || openNavClosurePending` esetén visszatér, így a lezárás előtt elkészült aktív válasz nem nyithatja vissza a kérdésfelületet a nyugta mellé.

---

## [1.37.6] – 2026-11-24

### Open Navigation (Szabad navigáció) – Késői kérdésbetöltés munkamenet-védelme feloldás után

A `v1.37.5` ellenőrzése (`Source/open_navigation_valasz_07.md`) során feltárt egyetlen fennmaradó aszinkron életciklus-hiba javítása, SQLite-sémamódosítás nélkül (`13700`).

#### Javítva és megerősítve (Fixed and Hardened)
* **Kérdésbetöltés kötése a kezdeményező munkamenethez (`public/js/student.js`):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `startQuizInterface()` rögzíti a kiinduló kontextust (`captureOpenNavContext()`) és egy monoton betöltési sorszámot (`quizInterfaceLoadSeq`), és a `fetchJsonWithTimeout()` `await` pontja után – még minden token-kezelés, hibaablak és állapotírás előtt – ellenőrzi `isOpenNavContextValid(ctx)`-et, a sorszámot, valamint a válasz saját `session_id` és `participant.id` azonosítóit.
  - A `handleInvalidStudentSession()` növeli `quizInterfaceLoadSeq++`-t is, így a tanári feloldás azonnal érvényteleníti a folyamatban lévő kérdésbetöltést, és a késve érkező válasz nem nyithatja vissza a már feloldott résztvevő felületét.
  - A `tryRestoreSession()`, `syncTeacherPacedState()` és `race:started` hívók szintén rögzített munkamenet-generációval és kontextus-átadással indítják a betöltést; a betöltés közben lezárult munkamenet közvetlenül a jogosult nyugtára vagy összegzőre vált.

---

## [1.37.5] – 2026-11-24

### Open Navigation (Szabad navigáció) kiadási javítások: Második beadás modálgomb-szinkronja, élő pontfrissítés és pontos feloldási címzés

A `v1.37.4` felülvizsgálata (`Source/open_navigation_valasz_06.md`) alapján elvégzett három célzott javítás (plusz a `startQuizInterface()` és `showSummary()` időszámítási önellenőrzés), SQLite-sémamódosítás nélkül (`13700`).

#### Javítva és megerősítve (Fixed and Hardened)
* **Második diák beadása ugyanazon a böngészőlapon – egységes modálgomb-vezérlés (`public/js/student.js`):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Új `syncOpenNavConfirmModalControls()` függvény vezérli egyetlen forrásból a megerősítő modál gombjainak (`#btn-confirm-open-nav-submit`, `#btn-cancel-open-nav-submit`, `#btn-close-open-nav-modal`) `disabled` állapotát minden modálnyitáskor, frissítéskor, beadás indulásakor, hibaági visszatéréskor, végállapotnál és kilépéskor; nyitáskor és megszakításkor helyreállítja a billentyűzetfókuszt.

* **Tanári pontjavítás már beadott dolgozat nyitott értékelőlapján (`public/js/student.js`):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `participant:score_updated` esemény `forceSummaryRefresh: true` módban hívja a `syncOpenNavServerState()`-et (szigorú munkamenet- és résztvevő-egyezéssel, valamint összevont utólekéréssel párhuzamos pontjavítás esetén), így a nyitott értékelőlap teljes oldalfrissítés nélkül frissül, míg kikapcsolt visszajelzésnél változatlanul csak a szűrt nyugta marad.

* **Tanári feloldás (`participant:kicked`) pontos címzése és munkamenet-indítási hibatűrés (`src/routes/api.js`, `public/js/student.js`):**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Mindhárom szerveroldali feloldási kibocsátó (`seat-change`, `reset`, `unlock`) elküldi a `sessionId` mezőt is a `participantId` mellett; a kliens aktív résztvevőnél kizárólag a `participantId` (és ha jelen van, a `sessionId`) egyezése alapján léptet ki, így másik dolgozat feloldása vagy hiányos esemény nem érintheti az aktív munkamenetet.
  - A `startQuizInterface()` időkorlátos `fetchJsonWithTimeout()`-ot és résztvevőváltáskori állapot-takarítást kapott; a `showSummary()` kitöltési ideje elsősorban a hiteles szerveroldali `joined_at → finished_at` időbélyegekből számolódik.

---

## [1.37.4] – 2026-11-24

### Open Navigation (Szabad navigáció) munkamenet-elkülönítés és függő lezárásellenőrzés finomítása

A `v1.37.3` felülvizsgálata (`Source/open_navigation_valasz_05.md`) alapján elvégzett két kliensoldali folyamatjavítás, SQLite-sémamódosítás nélkül (`13700`).

#### Javítva és megerősítve (Fixed and Hardened)
* **Teljes munkamenet-elkülönítés ugyanazon a böngészőlapon (`public/js/student.js`):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `handleInvalidStudentSession()` (és a célzott `participant:kicked` ág) először érvényteleníti a régi kontextust (`openNavSessionEpoch++`, `questionViewSeq++`, `teacherPacedSyncSeq++`), majd alaphelyzetbe állítja az előző diák összes kliensoldali adatát (`studentSubmittedAnswers`, `answeredQuestionIds`, `currentQuiz`, `currentQuestions`, `earnedPoints`, `lastServerResults`, `quizStartTime`, `selectedStudent`, `teacherPaced*`, `openNav*`, időzítők és piszkozatok), párhuzamosság-védett belépési listabetöltéssel (`loginListsLoadPromise`).
  - A `participant:score_updated` `OPEN_NAVIGATION`-nél a közös `syncOpenNavServerState()`-et hívja, a `syncTeacherPacedState()` pedig `fetchJsonWithTimeout`-ot és szigorú `isOpenNavContextValid()` ellenőrzést használ.
  - A `showSummary()` értékelőlapja szerveres `data.answers` esetén kizárólag abból épül, így kihagyott kérdéshez nem örökölhető korábbi gyorsítótár-adat.

* **Függő lezárásellenőrzés és elavult figyelmeztetés elválasztása (`public/js/student.js`):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A mentési sor (`dispatchOpenNavDraftSave`) és a `flushAllOpenNavDrafts()` külön `closurePending` (`openNavClosurePending`) állapotként kezeli a lezárási kódokat (`SESSION_INACTIVE`, `PARTICIPANT_ALREADY_FINISHED`, `DEADLINE_EXCEEDED`), így átmeneti `503` státuszlekérésnél nem nyit „Mentési hiba” ablakot, hanem *„Lezárás ellenőrzése folyamatban”* jelzést és kézi újraellenőrzést mutat.
  - A `showCalmAlert()` művelet-címkét (`ownerTag = 'open_nav_submit'`) kapott; a végállapot (`showSummary`) közös átmenete `dismissCalmAlertByOwner('open_nav_submit')` hívással, régi callback futtatása nélkül csendben bezárja a beadáshoz tartozó elavult figyelmeztetést, és a fókuszt a nyugtára helyezi.

---

## [1.37.3] – 2026-11-24

### Open Navigation (Szabad navigáció) éles stabilizálás: Rövid válasz sorszámozás, választest-időkorlát, munkamenet-izoláció és pontos ABCD-véglegesítés

A `v1.37.2` felülvizsgálata (`Source/open_navigation_valasz_04.md`) alapján elvégzett kliens- és szerveroldali stabilizáló javítások, SQLite-sémamódosítás nélkül (`13700`).

#### Javítva és megerősítve (Fixed and Hardened)
* **Rövid válasz helyi szerkesztésének és mentésének szétválasztása (`public/js/student.js`):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A közös `recordOpenNavLocalEdit()` már a beírás/kijelölés/ürítés pillanatában növeli a kérdés helyi sorszámát (`localSeq`), a 400 ms-os debounce és a `flushShortDraftForQuestion()` pedig kizárólag a küldést (`dispatchOpenNavDraftSave`) indítja a kérdés saját `entry.localValue` értékéből; a korábbi nyugta nem jelöli idő előtt „mentett”-nek az újabb szöveget.

* **Kézi beadás és nyugta munkamenethez kötése, teljes választest-időkorlát és egységes belépés-visszatérés (`public/js/student.js`):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Közös `captureOpenNavContext()` / `isOpenNavContextValid()` ellenőrzés minden `await` után (mentés, `flush`, `POST /finish`, `GET /session-data`, JSON-beolvasás és hibaágak előtt) és végállapot-elsőbbség (`openNavIsFinalized`).
  - A `fetchJsonWithTimeout()` az `AbortController` időzítőjét a HTTP fejlécek és a teljes választest (`res.text()` + `JSON.parse()`) végéig aktívan tartja; a közös `openNavStatusCheckPromise` takarítása a saját Promise-referenciát ellenőrzi.
  - Új, egységes `handleInvalidStudentSession()` átmenet: igazolt API `401`/`404` esetén együtt törli a tárolt és memóriabeli tokent, leállítja az időzítőket/kéréseket, visszaállítja a belépési felületet és egyszer betölti a tantárgy- és osztálylistákat (`503 → 404` és aktív `404` esetén is).
  - A `session:finished` esemény utáni átmeneti hiba is a közös backoffos újrapróbálást használja (`requireFinal: true`), egyéni időkorlát nélküli dolgozatoknál is.

* **Végleges `ABCD` válasz pontos szövegének megőrzése (`src/db/sessionRepo.js`, `scratch/test_open_navigation.js`):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`scratch/test_open_navigation.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_open_navigation.js)
  - A `finalizeOpenNavigationParticipantInTx()` `ABCD` kérdéseknél a pillanatkép pontos, eredeti opciószövegét (szélső szóközökkel együtt) rögzíti az `answers.submitted_answer` oszlopba; a mátrix-lekérdezés (`draft_answer != ''`) egységes üresség-szemantikát használ; az ON-10 teszt a végleges `submitted_answer` pontos egyezését is ellenőrzi.

---

## [1.37.2] – 2026-11-24

### Open Navigation (Szabad navigáció) záró finomítások: Veszteségmentes opciómentés, 409 egyeztető sáv, hibatűrő helyreállítás és UTC nyugtaidőbélyeg

A `v1.37.1` felülvizsgálata (`Source/open_navigation_valasz_03.md`) alapján elvégzett öt célzott javítás, SQLite-sémaverzió-emelés nélkül (`13700`).

#### Javítva és megerősítve (Fixed and Hardened)
* **Veszteségmentes `ABCD` opciómentés és `SHORT` hosszkorlát (`src/db/sessionRepo.js`, `public/js/student.js`):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Az 500 UTF-16 kódegységes korlát és a trim kizárólag a `SHORT` kérdésekre érvényes; a hosszú (>500 karakteres) és szélső szóközös `ABCD` opciók módosítás nélkül, a pillanatkép pontos szövegével mentődnek, töltődnek vissza és értékelődnek ki.

* **Hibatűrő munkamenet-helyreállítás, backoffos határidő-ellenőrzés és tartalék nyugta (`public/student.html`, `public/js/student.js`):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `tryRestoreSession()` kizárólag igazolt `401`/`404` esetén törli a `sessionStorage` tokent; `5xx` (pl. `503`) vagy hálózati hiba esetén megőrzi a tokent és újrapróbálást kínál.
  - Időkorlátos `fetchWithTimeout()` (10 mp), növekvő késleltetésű + jitteres újrapróbálás (`scheduleOpenNavStatusRetry`) lejárat utáni átmeneti hibáknál is, végállapot-elsőbbség (`openNavIsFinalized`), valamint sikeres `POST /finish` utáni hibás `GET` esetén tartalék nyugta önálló **„Értékelőlap betöltése”** gombbal.

* **Verzióütközés (`409 Conflict`) egyértelmű egyeztetése (`public/student.html`, `public/js/student.js`):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Valódi eltérés esetén a kliens nem írja felül automatikusan a szerveren lévő értéket (sem új helyi szerkesztéssel, sem beadás előtti `flush`-sal), hanem megjeleníti az `#open-nav-conflict-banner` sávot a **„A mentett választ megtartom”** és **„A mostani válaszomat mentem”** gombokkal, és a feloldásig blokkolja a beadást.

* **Háttérmátrix hibatűrése és UTC ISO 8601 nyugtaidőbélyeg (`src/routes/api.js`, `src/services/diagnostics.js`, `public/js/student.js`):**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `scheduleMatrixUpdate()` időzített callbackje saját `try/catch`-et és `matrix.broadcast_failed` diagnosztikai eseményt kapott (válasz és token nélkül), és siker/hiba esetén is takarítja az időzítőt.
  - Közös `toUtcIsoTimestamp()` formázó az API-határon: a `finished_at` mezők explicit UTC ISO 8601 (`...Z`) formátumban érkeznek, így `Europe/Budapest` téli és nyári időszámításnál is pontos helyi idő jelenik meg a nyugtán.

* **Bővített elfogadási tesztek (`scratch/test_open_navigation.js`):**
  - **Fájl:** [`scratch/test_open_navigation.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_open_navigation.js)
  - **ON-10** (530+ karakteres és szélső szóközös `ABCD`, `SHORT` 499/500/501 UTF-16 emoji-próba) és **ON-11** (explicit UTC ISO 8601 + téli/nyári Budapest időbélyeg ellenőrzése).

---

## [1.37.1] – 2026-11-24

### Open Navigation (Szabad navigáció) felülvizsgálati javítások: Adatintegritás, atomi migráció, beadási nyugta és szigorított mentési sor

A `v1.37.0` kiadás szakmai felülvizsgálata (`Source/open_navigation_valasz_02.md`) alapján elvégzett teljes körű megbízhatósági, adatintegritási és kliensoldali javítások, SQLite-sémaverzió-emelés nélkül (`13700`).

#### Javítva és megerősítve (Fixed and Hardened)
* **Régi válaszbeküldő ág korai üzemmód-védelme (`src/db/sessionRepo.js`):**
  - **Fájl:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js)
  - A `submitAnswer()` közvetlenül a résztvevő betöltése után (és a tranzakció legelején is) elutasítja az `OPEN_NAVIGATION` módot `INVALID_SESSION_MODE` kóddal, minden duplikátumkeresés és határidő miatti állapotmódosítás előtt.

* **Teljesen atomi sémamigráció és `sqlite_sequence` megőrzése (`src/db/init.js`, `src/services/backup.js`):**
  - **Fájlok:** [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js), [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js)
  - Az összes migrációs lépés (oszlopbővítések, triggerek eldobása és visszaépítése, táblacserék, `answer_drafts`, indexek, `PRAGMA foreign_key_check`, kötelező objektumlista-ellenőrzés és `user_version`) egyetlen atomi tranzakcióba került, így kényszerített hiba esetén az összes eredeti védőtrigger és verzióbélyeg sértetlen marad.
  - A `sessions` és `participants` táblacserék megőrzik a korábbi `sqlite_sequence` értéket (`MAX(régi_seq, MAX(id))`), megelőzve a törölt azonosítók újraosztását. A ZIP-visszaállítás ellenőrzi az `answer_drafts` táblát és a zárási védőtriggereket is.

* **Szigorított piszkozatmentési szerződés, egységes beadási nyugta és diagnosztika (`src/db/sessionRepo.js`, `src/routes/api.js`, `src/services/diagnostics.js`):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js)
  - A `POST /api/student/save-draft` kötelezően megköveteli a pozitív egész `question_id`, a nem negatív egész `base_version` és a szöveges `draft_answer` mezőket; validálja az 500 karakteres `SHORT` hosszkorlátot és az `ABCD`/`TF` opció-egyezést; elkülöníti a `400` / `409` / `500` hibakódokat; a mátrix-értesítés hibája nem rontja el a sikeres adatbázis-mentést.
  - A `POST /api/student/finish` egységes `receipt` objektumot ad vissza (`is_finished`, `finished_at`, `show_feedback_on_end`); a `GET /api/student/session-data` lejáratkor a friss `finished_at` értékkel tér vissza, véglegesítési hiba esetén `500 AUTO_FINALIZE_FAILED` választ ad.
  - A `join` recovery kikapcsolt visszajelzésnél üres `answers: []` tömböt ad; a `getProjectorData()` `OPEN_NAVIGATION` módban elrejti a résztvevői pontszámokat és kérdésenkénti helyességet.

* **Külön beadási nyugta, `ReferenceError` javítás, monoton mentési sor és élő előnézet (`public/student.html`, `public/js/student.js`):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Kikapcsolt visszajelzéshez dedikált `#summary-receipt-view` beadási nyugta nézet (a korábbi eredményadatok teljes törlésével), valamint a `showSummary()` `percentage` `ReferenceError` javítása.
  - Kérdésenkénti monoton módosítási sorszám (`localSeq` / `ackedSeq`) és `openNavSessionEpoch` védelem: késleltetett válasz vagy `409 Conflict` nem írja felül az időközben beírt újabb helyi választ.
  - Szerverállapothoz kötött `syncOpenNavServerState()` (egyszerre max. 1 kérés), nyers ezredmásodperces időzítő-lejárat (`remainingMs <= 0`), `SESSION_INACTIVE` egységesítés, `connect` / `visibilitychange` szinkron, és élőben frissülő megerősítő modál billentyűzetfókusz-megőrzéssel.

* **Bővített elfogadási próbák (`scratch/test_open_navigation.js`):**
  - **Fájl:** [`scratch/test_open_navigation.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_open_navigation.js)
  - Korai `submit-answer` elutasítás aktív/lejárt/beadott állapotban, 2-piszkozatos részleges véglegesítés rollback-próbája, szigorú bemeneti validáció, `join`/kivetítő szűrés, `sqlite_sequence` megőrzés és kényszerített migrációs rollback-próba.

---

## [1.37.0] – 2026-11-24

### Open Navigation (Szabad navigáció) dolgozatmód – kattintható kérdéstérképpel, verziózott piszkozatmentéssel és atomi véglegesítéssel

Bevezetésre került a Socrative *Open Navigation* mintájára működő negyedik dolgozatmód (`OPEN_NAVIGATION`), amelyben a diákok szabadon mozoghatnak előre-hátra a kérdések között, bármikor módosíthatják vagy törölhetik a válaszukat, a kiértékelés pedig csak a dolgozat végleges beadásakor (vagy a tanári lezáráskor / időkorlát lejártakor) történik meg. SQLite-sémaverzió: `13700`.

#### Hozzáadva és módosítva (Added and Changed)
* **Adatbázis-séma és biztonságos migráció (`DATABASE_SCHEMA.sql`, `src/db/init.js`):**
  - **Fájlok:** [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js)
  - A `sessions.mode` `CHECK`-korlátozás bővült az `'OPEN_NAVIGATION'` móddal; létrejött a különálló `answer_drafts` piszkozattábla (`version`, `draft_answer NOT NULL DEFAULT ''`, `UNIQUE(participant_id, question_id)`), valamint a `participants(id, session_id)` egyedi index (`idx_participants_id_session`) a régebbi mentések összetett idegenkulcs-kompatibilitásához. Az `answers` immutabilitási triggerei változatlanok maradtak.
  - `CURRENT_SCHEMA_VERSION = 13700`: meglévő adatbázisoknál a `sessions` tábla újraépítése tranzakción kívüli `PRAGMA foreign_keys = OFF` / `finally`-visszaállítással, a függő triggerek eldobásával és visszaépítésével, `PRAGMA foreign_key_check` ellenőrzéssel és atomi verziórögzítéssel fut.

* **Szerveroldali piszkozatmentés, atomi véglegesítés és API (`src/db/sessionRepo.js`, `src/routes/api.js`, `src/services/diagnostics.js`):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js)
  - Új `POST /api/student/save-draft` végpont (`student.save_draft` diagnosztikai útvonal-támogatással) és ritkított élő mátrix-frissítés (`scheduleMatrixUpdate`, 350 ms).
  - Optimista verziózás (`base_version` ellenőrzés → `409 DRAFT_VERSION_CONFLICT` a szerver aktuális verziójával és értékével) és verziózott logikai ürítés (`draft_answer = ''`, `version = version + 1`) fizikai sor-törlés helyett.
  - Atomi véglegesítés (`finalizeOpenNavigationParticipantInTx`) sima `INSERT INTO answers` paranccsal (integritási hiba esetén teljes rollback, a piszkozatok és az `is_finished = 0` állapot megmarad). Lejárt `deadline_at` esetén a `save-draft` előbb szabályosan `COMMIT`-olja a véglegesítést, majd `400 DEADLINE_EXCEEDED` választ ad; a tanári `finishSession()` lezárás előtt minden aktív diák piszkozatát véglegesíti.
  - A `POST /api/student/submit-answer` elutasítja az `OPEN_NAVIGATION` módot (`400 INVALID_SESSION_MODE`); a `join` és `session-data` végpontok szigorúan maszkolják az értékelési mezőket aktív kitöltés közben, illetve `show_feedback_on_end = 0` esetén beadás után is.

* **Tanári és diák felület (`public/admin.html`, `public/js/admin.js`, `public/student.html`, `public/js/student.js`, `public/css/style.css`):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Tanári indítóablakban választható a *Szabad navigáció (Open Navigation)* mód; az élő mátrix beadás előtt halványkék piszkozat-cellákkal (`edit` ikon) jelzi a haladást, az archívumban türkiz módjelvény jelenik meg.
  - Diák felületen kattintható kérdéstérkép (`1..N`) külön színnel és ikonnal (*aktuális*, *mentve*, *mentés folyamatban*, *hiba*, *üres*), felső élő eredmény/jegy elrejtése, kérdésenként sorosított mentési lánc, `SHORT` 400 ms debounce + `blur` mentés, `ABCD`/`TF` **Válasz törlése** gomb.
  - Beadás előtti ellenőrző ablak a szerveren mentett válaszok számával és kattintható kihagyott kérdésgombokkal, függő/hibás mentések kötelező bevárásával és elveszett beadási válasz (`session-data`) visszaellenőrzésével.

* **Automatizált elfogadási tesztcsomag (`scratch/test_open_navigation.js`, `scratch/run_all_tests.js`):**
  - **Fájlok:** [`scratch/test_open_navigation.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_open_navigation.js), [`scratch/run_all_tests.js`](file:///d:/dev/Röpdolgozat%20program/scratch/run_all_tests.js)
  - 9 teljes elfogadási próba (**ON-01 – ON-09**): mód-kényszerítés, verzióütközés és logikai ürítés, élő mátrix, kézi beadás és szimulált DB-hibás rollback-próba, tanári felülbírálás, tanári lezáráskori automatikus véglegesítés, lejárt határidő, kikapcsolt visszajelzés szigorú API-szűrése, valamint valódi `v1.33.0 → v1.37.0` sémamigrációs próba.

---

## [1.36.0] – 2026-11-24

### Koordináta-alapú Socrative PDF-importáló, lokális egykérdéses mentés, dinamikus ABCD opciók és munkaállomás-kapszula javítások

Az első éles tantermi tapasztalatok (`Source/Kell.txt`) alapján elkészült teljes funkcionális és UX-javító kiadás, SQLite-sémamódosítás nélkül.

#### Hozzáadva és módosítva (Added and Changed)
* **Valódi koordináta-alapú Socrative PDF-importáló (`src/services/socrativePdfParser.js`):**
  - **Fájl:** [`src/services/socrativePdfParser.js`](file:///d:/dev/Röpdolgozat%20program/src/services/socrativePdfParser.js)
  - Teljes PDF CTM (`q`/`Q`/`cm`) mátrixveremre épülő `(X, Y)` oldalkoordinátás feldolgozás: megszűnt az opciók elcsúszása és a több kérdés egyetlen válaszba ömlesztése, oldalhatárokon átívelő kérdéseknél is.
  - Mindhárom kérdéstípus felismerése: **`ABCD`** (akár 5–6 opcióval is), **`TF`** (magyar `Igaz / Hamis` és angol Socrative `T / F`, `True / False` formátumok), valamint **`SHORT`** (beírós kérdések az összes elfogadott szinonimával).
  - A Socrative Answer Key zöld pipáinak (`.365 .745 .431`) pontos Y-párosítása a legközelebbi opcióhoz, így a helyes válaszok automatikusan bejelölődnek.
  - Garantáltan egyedi, folyamatos `1..N` `question_order` kiosztás: véglegesen megszűnt a `UNIQUE constraint failed: questions.quiz_id, questions.question_order` importálási hiba.

* **Lokális, egyetlen kérdést mentő *Mentés* gomb a tesztszerkesztőben (`src/db/quizRepo.js`, `src/routes/api.js`, `public/js/admin.js`):**
  - **Fájlok:** [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Új `PUT /api/admin/quizzes/:id/questions/:questionId` és `POST /api/admin/quizzes/:id/questions` végpontok (`quizRepo.saveSingleQuestion()`): a kérdéskártyán lévő pasztell zöld **Mentés** gomb kizárólag az adott kérdést validálja és menti le az adatbázisba, így az importált vagy még félkész többi kérdés nem blokkolja a javítást.

* **Tetszőleges számú feleletválasztós (`ABCD`) válaszlehetőség (`public/js/admin.js`):**
  - **Fájl:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A tesztszerkesztő alapértelmezetten 4 opciósort jelenít meg (meglévő vagy importált 5+ opciós kérdéseknél automatikusan az összeset), alatta a **„+ További válaszlehetőség hozzáadása”** gombbal bővíthető, a 2-nél több sor pedig a jobb oldali `×` gombbal eltávolítható.

* **„Tanári munkaállomás” kapszula és diák fejléc finomítása (`public/admin.html`, `public/js/admin.js`, `public/js/student.js`):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Bejelentkezés után is látható a **🖥️ Tanári munkaállomás** kapszula a tanári fejlécben a *Kilépés* gomb mellett; kijelentkezéskor a rendszer megőrzi a `?gep=tanar` jelölést (`/?gep=tanar&logout=1`), így a kapszula nem tűnik el, de a PIN-ablak nem ugrik fel azonnal újra.
  - A diák tesztfelület jobb oldali névkapszulájából kikerült a megduplázott gépszám – a gépszám kizárólag a bal oldali kapszulában jelenik meg.

---

## [1.35.3] – 2026-11-22

### Tesztszerkesztő UX-finomítás: Helyben mentés minden kérdéskártyán és pasztell fejlécgombok

Kényelmi és vizuális fejlesztés a tesztszerkesztőben a hosszabb (20–30 kérdéses) feladatsorok gyors, görgetés nélküli javításához.

#### Hozzáadva és módosítva (Added and Changed)
* **Kérdéskártyánkénti helyben mentés (`public/js/admin.js`, `public/css/style.css`):**
  - **Fájlok:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Minden kérdéskártya fejlécében az *Eltávolítás* gomb mellé bekerült egy azonos méretű, pasztell halványzöld **Mentés** gomb (`q-card-btn-save`) egyszínű Material `save` ikonnal; az *Eltávolítás* gomb egységes `close` ikont kapott.
  - A közös `saveQuizEditor()` függvény a kártyáról indítva elmenti a teljes feladatsort (validációval, duplakattintás-védelemmel és az új teszt-/kérdésazonosítók DOM-szinkronizálásával), miközben **nyitva hagyja a szerkesztőt** az aktuális kérdésnél. Az alsó *Feladatsor mentése* gomb továbbra is ment, bezárja a szerkesztőt és frissíti a listát.

* **Jól látható pasztell *Mégse* gomb a tesztszerkesztő fejlécében (`public/admin.html`, `public/css/style.css`):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A *Teszt szerkesztése* fejlécében lévő `#btn-close-editor` gomb pasztell halványpiros stílust (`q-editor-btn-cancel`) és egyszínű `close` ikont kapott.

---

## [1.35.2] – 2026-11-22

### Teacher Paced böngészős visszaellenőrzés javításai: Célzott élő pontfrissítés, idempotens válaszmegjelenítés, késői hibaágak védelme és indítóablak-alapérték

A valós Chrome-próbák során feltárt négy kliens- és API-oldali hiba célzott javítása, SQLite-sémamódosítás nélkül.

#### Javítva és megerősítve (Fixed and Hardened)
* **Célzott élő pontfrissítés és hiteles résztvevő-azonosítás (`src/routes/api.js`, `public/js/student.js`):**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `POST /api/admin/answers/:id/override` a `participant:score_updated` jelzést célzottan a diák saját `participant_${participant_id}` szobájába küldi.
  - A diákoldali `currentParticipant` állapotváltozó deklarálva és minden belépési, visszaállítási, összegzési és kilépési ágon karbantartva lett, így megszűnt a `ReferenceError`, és a `participant:score_updated` / `participant:kicked` kezelők szigorú `sessionId` + `participantId` egyeztetéssel, más módok visszajelzési beállításainak tiszteletben tartásával működnek.

* **Idempotens újraküldésnél a szerveren mentett saját válasz megjelenítése (`src/routes/api.js`, `public/js/student.js`, `scratch/test_teacher_paced.js`):**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`scratch/test_teacher_paced.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_teacher_paced.js)
  - A `POST /api/student/submit-answer` mindig visszaadja a ténylegesen mentett saját választ (`submittedAnswer`), kikapcsolt visszajelzés esetén is (az értékelési mezők szűrése változatlan). A diák felülete ebből állítja vissza a kijelölt csempét (`selected`, `aria-checked`) vagy a beírós mezőt, és ismétlésnél nem duplázza a pontot.

* **Késői beküldési válasz és hibaágak hatókörének védelme (`public/js/student.js`):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Bevezetésre került a monoton növekvő `questionViewSeq` nézetazonosító; a `submitAnswer()` minden aszinkron `await` után (hálózati hiba, hibás JSON, HTTP-elutasítás, séma-hiba és sikeres ág esetén is) ellenőrzi a kontextust, mielőtt gombot oldana fel, modalt nyitna, DOM-ot módosítana vagy törölné a `currentOperationId`-t.

* **Indítóablak visszajelzési alapértékének és késleltetett betöltésének javítása (`public/js/admin.js`):**
  - **Fájl:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Az indítóablak a mentett `classroom_settings.hide_immediate_feedback` alapján állítja be az alapértéket; teszt- és módváltáskor a tanár kézi választása megmarad; késve megérkező beállításoknál az érintetlen jelölőnégyzet automatikusan frissül; érintetlen jelölőnél a kliens kihagyja a `show_feedback_on_end` mezőt, így mindig a szerver mentett alapértéke érvényesül.

---

## [1.35.1] – 2026-11-22

### Kétlépcsős Teacher Paced lezárás: Összegzés kiosztása nyitva maradó részpontadással és élő diák pontfrissítéssel

A Tanári léptetés (Teacher Paced) módban kettévált a kérdéskör befejezése és a dolgozat végleges lezárása, így elírások esetén a tanulói összegzés megjelenése után is adható részpont a mátrixban, nulla SQLite-sémamódosítással.

#### Hozzáadva és módosítva (Added and Changed)
* **Kétlépcsős Teacher Paced lezárás (`src/db/sessionRepo.js`, `src/routes/api.js`, `public/admin.html`, `public/js/admin.js`, `public/js/student.js`):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Új `POST /api/admin/sessions/:id/complete-questions` végpont és `sessionRepo.completeTeacherPacedQuestions()` tranzakciós metódus: lezárja a kérdéskört (`current_question_index = totalQuestions`), minden résztvevőt készre (`is_finished = 1`) állít, a munkamenetet azonban `ACTIVE` állapotban hagyja, így a tanár továbbra is felülbírálhat válaszokat és adhat részpontot.
  - A léptetősáv *„Befejezés”* gombja külön megerősítő ablakot (`#modal-confirm-tp-complete`) nyit meg; megerősítés után a léptetősáv látható marad inaktív gombokkal, a diákok képernyőjén pedig azonnal megjelenik a személyes összegzés.
  - A végleges lezárást továbbra is a felső *„Dolgozat befejezése”* gomb végzi (`status = 'FINISHED'`), amely eltünteti a léptetősávot és végleg lezárja a pontozást.
  - Tanári kézi felülbíráláskor (`POST /api/admin/answers/:id/override`) a szerver `participant:score_updated` eseményt küld, így a már összegzést néző tanuló képernyőjén élőben frissül a javított pontszám és érdemjegy.

* **Elfogadási teszt bővítése (`scratch/test_teacher_paced.js`):**
  - **Fájl:** [`scratch/test_teacher_paced.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_teacher_paced.js)
  - Új **TP-08** teszteset a kétlépcsős lezárás, a köztes részpontadás és a végleges lezárás utáni módosítástiltás ellenőrzésére.

---

## [1.35.0] – 2026-11-22

### Tanári léptetés (Teacher Paced) dolgozatmód és halványkék, színtévesztő-barát diák válaszadási felület

Beépült a teljes körű **Teacher Paced (Tanári léptetés)** dolgozatmód nulla SQLite-sémamódosítással, valamint megújult a diák válaszadási vizuális nyelv a nyugodt, egyértelmű kiválasztás és a színtévesztő-barát kiértékelés érdekében.

#### Hozzáadva (Added)
* **Teacher Paced (Tanári léptetés) szerveroldali motor és REST-vezérlés (`src/db/sessionRepo.js`, `src/routes/api.js`, `src/sockets/liveHandler.js`, `src/services/diagnostics.js`):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`src/sockets/liveHandler.js`](file:///d:/dev/Röpdolgozat%20program/src/sockets/liveHandler.js), [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js)
  - A `startSession()` támogatja a `TEACHER_PACED` módot, szerveroldalon kényszeríti a kérdések eredeti sorrendjét (`shuffle_questions = 0`) és a korlátlan egyéni időt (`time_limit_min = 0`), induláskor az 1. kérdés (`current_question_index = 0`) nyitott.
  - Új `POST /api/admin/sessions/:id/question-index` végpont (`admin.teacher_step` diagnosztikai útvonallal) és `sessionRepo.setTeacherQuestionIndex()` tranzakciós, határellenőrzött léptető metódus optimista `fromIndex` (`409 Conflict`) ütközésvédelemmel több tanári géphez; a régi, validálatlan `teacher:next_question` Socket.IO írási ág kivezetve.
  - A `submitAnswer()` idempotens újraküldés-védelme megelőzi az aktív kérdés korlátozását (`QUESTION_NOT_ACTIVE`), a válaszadás nem zárja le automatikusan a diákot, a `POST /api/student/finish` pedig aktív `TEACHER_PACED` munkamenetben elutasított (`TEACHER_PACED_FINISH_FORBIDDEN`).
  - Stabil, **determinisztikus opciókeverés** (`shuffle_options = 1` esetén oldalfrissítéskor és visszalépéskor is változatlan `A/B/C/D` sorrend), aktív állapotban kizárólag az aktuális kérdés kiadása, kikapcsolt visszajelzésnél (`show_feedback_on_end = 0`) szivárgásmentes szűrés `session-data`-ban, `submit-answer`-ben és `join` recovery-ben, majd tanári lezárás után teljes értékelőlap és megoldások megjelenítése.
  - A `POST /api/student/submit-answer` bekapcsolt visszajelzésnél azonnal visszaadja a frissen számolt `results` objektumot, így a diák százalékos eredménye és érdemjegye már az *Ellenőrzés* gomb megnyomásakor frissül.

* **Tanári léptetősáv és archívum-módjelvény (`public/admin.html`, `public/js/admin.js`, `public/css/style.css`):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A dolgozatindító ablakban aktiválva a *Tanári léptetés (Teacher Paced – közös haladás)* mód és az *Azonnali visszajelzés és magyarázat megjelenítése* kapcsoló, automatikus kérdéskeverés- és időkorlát-tiltással.
  - Új tanári vezérlősáv az élő mátrix fölött (*Előző*, gyorsugró legördülő, *Következő* – amely az utolsó kérdésen megerősítő ablakkal nyíló piros *Befejezés* gombbá alakul –, kérdéselőnézet, *„X / Y diák válaszolt”* számláló és aktív kérdésoszlop kiemelése).
  - A *Korábbi dolgozatok* (`report-card`) kártyáin színes, ikonos módjelvény (*Tanári léptetés*, *Diák-tempó*, *Űrhajós csapatverseny*) mutatja a lezajlott dolgozat típusát.

* **Diák Teacher Paced felület és megújult válaszadási UX (`public/student.html`, `public/js/student.js`, `public/css/style.css`):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Verziózott, sorosított `syncTeacherPacedState()` szinkronizáció (`session:question_changed` és újracsatlakozás esetén), késői HTTP-válasz védelem, elrejtett felső *Kilépés* gomb, magyarázat megjelenítése bekapcsolt visszajelzésnél, valamint ugrásmentes, egysoros várakozó jelvény a láblécben.
  - Kiválasztási színváltás a narancsról **halványkékre** (`#eff6ff` háttér, `#3b82f6` keret, kék betűjel-korong) `ABCD`, `Igaz / Hamis` és beírós (`SHORT`, fókuszra kékülő) kérdéseknél, billentyűzetes kezelhetőséggel (`role="radiogroup"` / `role="radio"` / `:focus-visible`).
  - Válaszadás közben eltűnt a felesleges jobb oldali rádiókör; kiértékeléskor mindhárom kérdéstípusnál (`ABCD`, `Igaz / Hamis`, `SHORT`) tiszta, háttérkorong nélküli zöld `✓` vagy piros `✕` ikon segíti a színtévesztő tanulókat.

* **Automatizált elfogadási tesztcsomag (`scratch/test_teacher_paced.js`, `scratch/run_all_tests.js`):**
  - **Fájlok:** [`scratch/test_teacher_paced.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_teacher_paced.js), [`scratch/run_all_tests.js`](file:///d:/dev/Röpdolgozat%20program/scratch/run_all_tests.js)
  - 7 átfogó elfogadási teszt (**TP-01 – TP-07**) bekötve a teljes `npm test` regressziós csomagba.

---

## [1.34.5] – 2026-11-22

### Diagnosztikai záró csiszolás: Egységes tranzakciós elutasításkódok, hibás JSON célzott kezelése és `student.session_data` HTTP-naplózás

Apró, célzott hibabesorolási és peremeset-javítások a diagnosztikai alrendszer lezárásához, SQLite-sémamódosítás és HTTP-válaszváltozás nélkül.

#### Javítva és megerősítve (Fixed and Hardened)
* **Tranzakción belüli üzleti elutasítások egységesítése (`src/db/sessionRepo.js`, `src/routes/api.js`):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - A `submitAnswer()` tranzakción belüli résztvevő- (`PARTICIPANT_UNKNOWN`), lezárás- (`SESSION_INACTIVE`) és kérdésellenőrzés (`QUESTION_NOT_FOUND`) is strukturált `err.code` kódot kapott, így a dolgozathoz nem tartozó kérdés is pontosan `answer.rejected`-ként naplózódik adatbázishiba helyett.

* **Szintaktikailag hibás JSON célzott kezelése a diagnosztikai végponton (`server.js`):**
  - **Fájl:** [`server.js`](file:///d:/dev/Röpdolgozat%20program/server.js)
  - A `POST /api/student/diagnostics/events` hibakezelője a `413` mellett a `400` (`entity.parse.failed`) hibát is elkapja, és nyers hibaüzenet helyett egységes `{ code: 'INVALID_JSON' }` választ ad.

* **Diák munkamenet-visszatöltés HTTP-időtartam naplózása (`src/routes/api.js`):**
  - **Fájl:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - A `GET /api/student/session-data` végpont megkapta a `req.routeLogged = 'student.session_data'` jelölést, így az oldalfrissítés utáni visszatöltések futásideje is megjelenik a `http.finished` / `http.closed_early` eseményekben.

---

## [1.34.4] – 2026-11-22

### Diagnosztikai finomhangolás: Megszakítható export-előellenőrzés, üzleti hibakódok, teljes útvonallefedettség, `connect_error` ritkítás és aszinkron állapotlekérés

Célzott teljesítménybeli, esemény-elkülönítési és puffervédelmi finomítások a diagnosztikai alrendszerben, SQLite-sémamódosítás nélkül.

#### Javítva és megerősítve (Fixed and Hardened)
* **Megszakítható (`AbortSignal`) export-előellenőrzés (`src/services/diagnostics.js`, `src/routes/api.js`):**
  - **Fájlok:** [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - A `GET /api/admin/diagnostics/export` végpont `AbortController` jelet ad át az `inspectExport()` számára; kliensoldali megszakításnál az aktív fájlolvasás azonnal leáll és felszabadul.

* **Üzleti elutasítások és adatbázishibák szétválasztása (`src/db/sessionRepo.js`, `src/routes/api.js`):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - A `sessionRepo.submitAnswer()` strukturált `err.code` kóddal (`SESSION_INACTIVE`, `DEADLINE_EXCEEDED`, `RACE_NOT_STARTED`, `PARTICIPANT_UNKNOWN`) látja el az üzleti kivételeket, így a diagnosztikai naplóban ezek pontosan `answer.rejected`-ként válnak el a valódi `answer.failed` (`PERSISTENCE_CALL_FAILED`) hibáktól, a meglévő HTTP 400 válaszkód megőrzésével.

* **Fő dolgozatműveletek HTTP-időtartam naplózása (`src/routes/api.js`):**
  - **Fájl:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - A `student.join`, `admin.start_session`, `admin.start_race`, `admin.finish_session` és `admin.export_results` végpontok is megkapták a rögzített `req.routeLogged` azonosítót a `http.finished` / `http.closed_early` futásidő-naplózáshoz.

* **Kliensoldali `socket.connect_error` ritkítása (`public/js/student.js`):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Hibasorozatban legfeljebb 30 másodpercenként rögzül új `socket.connect_error` esemény a következő sikeres `connect`-ig, megvédve az 50 elemű klienspuffert a korábbi `answer.no_ack` események kiszorításától.

* **Aszinkron, nem blokkoló állapotlekérdezés (`src/services/diagnostics.js`, `src/routes/api.js`):**
  - **Fájlok:** [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - Új `getStatusAsync()` metódus (`fs.promises.readdir` / `stat`) a `GET /api/admin/diagnostics/status` végponthoz.

---

## [1.34.3] – 2026-11-21

### Éles tantermi felkészítés: Aszinkron diagnosztikai export-előellenőrzés és éles indítókonfiguráció

Teljesítménybeli és üzemeltetési finomhangolás az éles tantermi használathoz, SQLite-sémamódosítás nélkül.

#### Javítva és megerősítve (Fixed and Hardened)
* **Aszinkron, nem blokkoló export-előellenőrzés (`src/services/diagnostics.js`, `src/routes/api.js`):**
  - **Fájlok:** [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - Az `inspectExport()` átírásra került aszinkron `fs.promises` és `fs.createReadStream` (`for await`) alapra, így nagy naplóméretnél és aktív dolgozat közbeni tanári letöltésnél sem blokkolja a Node.js fő szálát.
  - A `GET /api/admin/diagnostics/export` végpont aszinkron módon várja meg az előellenőrzést, és megszakított klienskapcsolat esetén időben leáll.

* **Éles szerverindító frissítése (`start_server.bat`):**
  - **Fájl:** [`start_server.bat`](file:///d:/dev/Röpdolgozat%20program/start_server.bat)
  - Alapértelmezett `DIAGNOSTICS_ENABLED=true` beállítás (kívülről továbbra is felülbírálható), induláskori állapotkijelzés, valamint kommentelt sablon az egyedi `ADMIN_PIN` és `COOKIE_SECRET` éles beállításához.

---

## [1.34.2] – 2026-11-21

### DH 01 záró javítás: Átirányított helyreállítási mappák fizikai feloldása és rövidített diagnosztikai export egyértelmű jelzése

A [`Source/dh_01.md`](file:///d:/dev/Röpdolgozat%20program/Source/dh_01.md) két fennmaradó elfogadási feltételének végleges lezárása, SQLite-sémamódosítás nélkül.

#### Javítva és megerősítve (Fixed and Hardened)
* **Átirányított helyreállítási mappák tényleges fizikai céljának feloldása (`src/services/diagnostics.js`):**
  - **Fájl:** [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js)
  - A `validateDirectory()` a diagnosztikai cél mellett a `_restore_snapshots` és a `dbDir` alatti létező `temp_restore_*` gyökerek tényleges fizikai célját is feloldja (`resolvePhysicalPath()`), így Windows-csomópont (`junction`) esetén is elutasítja az átfedő célokat és leszármazottaikat.

* **Méretkorlát miatt rövidített export egyértelmű jelzése (`config.js`, `src/services/diagnostics.js`, `src/routes/api.js`, `public/js/admin.js`):**
  - **Fájlok:** [`config.js`](file:///d:/dev/Röpdolgozat%20program/config.js), [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Új konfigurációs opció (`DIAGNOSTICS_MAX_EXPORT_BYTES`, alapértelmezett 25 MiB) és előzetes `inspectExport()` vizsgálat.
  - A `GET /api/admin/diagnostics/export` végpont `X-Diagnostics-Export-Truncated: true|false` és `X-Diagnostics-Export-Max-Bytes` válaszfejléceket ad, rövidítés esetén pedig a fájlnévben is jelzi (`_reszleges.jsonl`).
  - A tanári felület letöltőgombja (`#btn-download-diagnostics`) `fetch` + `Blob` letöltéssel észleli a rövidítést, és egyértelmű figyelmeztetést (`showAdminAlert`) jelenít meg a tanárnak.

* **Célzott elfogadási próbák (`scratch/test_diagnostics.js`):**
  - **Fájl:** [`scratch/test_diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_diagnostics.js)
  - Kis méretkeretes (`350` bájt) HTTP export próba (`X-Diagnostics-Export-Truncated: true`, `_reszleges.jsonl`, érvényes JSONL sorok) és Windows-csomópontként létrehozott `_restore_snapshots` elutasításának automatizált igazolása.

---

## [1.34.1] – 2026-11-21

### DH 01 javítási kiadás: Sorosított diagnosztikai író, szigorított kliensszerződés, pontos 24 órás export, teljes útvonalvédelem és határidős leállás

Kiemelt stabilitási és adatvédelmi javítókiadás a [`Source/dh_01.md`](file:///d:/dev/Röpdolgozat%20program/Source/dh_01.md) diagnosztikai feltárás minden tételének orvoslására. A kiadás megszünteti a sikeresnek jelzett, de el nem végzett írás lehetőségét, kizárja a régi vagy csonka sorok kijutását a 24 órás tanári exportból, teljes leszármazotti szinten tiltja a helyreállítási munkakönyvtárak átfedését, UTF-8 bájtméréssel és többtételes `413` darabolással erősíti meg a böngészőpuffert, valamint együttes lezárási feltételre és pontos hibakód-kezelésre állítja át a kiszolgáló leállítását – továbbra is SQLite-sémamódosítás nélkül.

#### Javítva és megerősítve (Fixed and Hardened)
* **Egyetlen sorosított író és valós elszámolás (`src/services/diagnostics.js`, `public/admin.html`, `public/js/admin.js`):**
  - **Fájlok:** [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Egyetlen `drain`-vezérelt háttérpumpa (`triggerPump` / `_runPumpLoop`) végzi a sor ürítését; a függő (`inFlight`) tételek darabszáma és UTF-8 + LF bájtmérete is beleszámít a sor korlátjába.
  - A `totalWritten` kizárólag visszaigazolt írás után nő; a végleg elveszett (`droppedEventsCount`), az átmenetileg elutasított (`rejectedBatchEventsCount` – `503`) és a bizonytalan/hibás írású (`uncertainEventsCount`) események külön számlálódnak, és a tanári felületen az állapotkóddal (`statusCode`) együtt megjelennek.
  - Használhatatlan vagy lezárás alatt álló írónál az új tételeket tartalmazó klienscsomag `503` (`WRITER_UNAVAILABLE`) választ kap; stream hiba után a helyreállítás új naplófájlt nyit; a `flushAndClose()` strukturált `{ ok, reason }` eredménnyel zár.

* **Szigorított kliensoldali bemeneti szerződés és pontos, méretkorlátos 24 órás export (`src/services/diagnostics.js`, `src/routes/api.js`):**
  - **Fájlok:** [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - Különválasztott `sanitizeClientEntry`: kizárólag engedélyezett kliensesemények, zárt mezőlista, ellenőrzött UTC ISO `clientAt` és zárt `outcome`/`reasonCode` szótár fogadható el; szerveresemény vagy ismeretlen mező `400`-zal elutasított.
  - A `createExportStream()` rögzített indulási időponthoz viszonyítva, rekord szintű `receivedAt` alapján szűr az utolsó 24 órára, eldobja a fájlvégi csonka sorokat és az érvénytelen JSON-t, 25 MiB-os sorhatáros méretkorláttal és kliensmegszakítás-kezeléssel (`res.once('close', ...)`) működik; érvénytelen könyvtárnál az export `503`-mal tiltott.

* **Helyreállítási mappák teljes útvonal-ellenőrzése (`src/services/diagnostics.js`):**
  - **Fájl:** [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js)
  - Szegmensalapú, Windows kis-/nagybetű-érzéketlen fizikai útvonal-ellenőrzés (`resolvePhysicalPath`, `isEqualOrSubPath`), amely elutasítja a `publicDir`, `uploadsDir`, `_restore_snapshots`, `temp_restore_*` és ezek **összes leszármazottját**, a nem könyvtár (rendes fájl) célokat és a tiltott célra mutató Windows-csomópontokat (junction).

* **Kliensoldali UTF-8 csomagolás, `413` darabolás és szigorú visszaigazolás (`public/js/student.js`):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - `TextEncoder` alapú UTF-8 bájtmérés a `{ events: [...] }` burkolással együtt (max. 20 elem / 8 192 bájt), önmagában túlméretes elem eltávolítása, többtételes `413` esetén csomagméret-felezés.
  - `nextAllowedSyncAt` visszalépési időzítés `429`/`503` után, `401`-nél szüneteltetés újrahitelesítésig, `403`-nál kizárólag `DIAGNOSTICS_DISABLED` kódra történő törlés, `AbortController` + `syncVersion` védelem és `diagnosticsStorageFailed` memóriapuffer-fallback.
  - A `submitAnswer()` elkülöníti a hálózati/válasz-ellenőrzési ágat a UI feldolgozástól, és szigorúan ellenőrzi a válasz szerkezetét (`isValidSubmitAnswerResponse`).

* **Határidős leállás és tesztizoláció (`server.js`, `scratch/test_diagnostics.js`):**
  - **Fájlok:** [`server.js`](file:///d:/dev/Röpdolgozat%20program/server.js), [`scratch/test_diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_diagnostics.js)
  - Az automatikus `server.listen` csak közvetlen indításkor (`require.main === module`) fut, tesztekhez elkülönített `startServer()` érhető el.
  - A `gracefulShutdown()` együttesen várja az `io.close()` és az aktív kérések/műveletek befejezését (`server.closeIdleConnections()` mellett); határidő-túllépésnél bontja a megmaradt kapcsolatokat, `SHUTDOWN_DEADLINE` okkóddal rögzíti a `server.stopping` eseményt, és megőrzi a hibát jelző `process.exitCode = 1` értéket.
  - A bővített `scratch/test_diagnostics.js` tesztcsomag elszigetelten igazolja a lassú `drain` visszanyomást, a fájl-helyett-mappa és aktív stream hibákat, a 24 órás exportot, a helyreállítási alkönyvtárak tiltását és a gyermekfolyamatban futtatott normál, íráshibás és `SHUTDOWN_DEADLINE` leállásokat.

---

## [1.34.0] – 2026-11-21

### Beépítési terv 01: Helyi aszinkron diagnosztika és tantermi eseménynaplózó alrendszer

Kiemelt tantermi megbízhatósági és diagnosztikai kiadás a tantermi próba támogatására a `Source/Beepitesi_terv_01.md`, a `Source/Pontositasi_terv_01.md` és a véglegesített `Source/Beepitesi_terv_01_vegrehajtasi_terv_01.md` (v1.2) specifikációi alapján. Az új alrendszer segítségével a tanár a tantermi próba után közvetlenül a vezérlőpultról letölthető helyi naplóból visszakeresheti a hálózati mikromegszakadásokat, a válaszbeküldések szerveroldali perzisztálását, a böngészőoldali visszaigazolások feldolgozását és az újrapróbálkozások eredményét anélkül, hogy a rendszer relációs adatbázisához (`ropdolgozat.db`) hozzá kellene nyúlni.

Az alrendszer garantálja a nulla lebegőpontos blokkolást: az események átadása szinkron memóriasorba (`RingBufferQueue`) történik, a fizikai lemezre írás aszinkron adatfolyamban (`fs.createWriteStream`) fut backpressure és `drain` vezérléssel. Az OWASP adatminimalizálási irányelveknek megfelelően a naplóba semmilyen személyes adat (tanulónév, osztály), hitelesítő token, PIN, jelszó, kérdésszöveg vagy beadott válasz nem kerülhet. A diagnosztika konfigurációs kapcsolóval (`DIAGNOSTICS_ENABLED`) teljesen lekapcsolható, a könyvtárkezelés pedig fizikai elérési út szintjén el van szigetelve a webgyökértől, a képtártól és a rendszermentésektől.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Központi diagnosztikai szervizmodul (`src/services/diagnostics.js`):**
  - **Fájl:** [`src/services/diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/src/services/diagnostics.js)
  - `RingBufferQueue`: max. 2048 elem vagy 2 MiB in-memory kapacitás, atomi csomagátvétel (`204 No Content` vs. `503 Service Unavailable`).
  - `DeduplicationCache`: FIFO memóriagyűrű (1024 elem) a kliensoldali ismételt csomagok kiszűrésére.
  - `SlidingWindowRateLimiter`: résztvevőnkénti (6 csomag/perc) és globális (300 csomag/perc) sebességkorlátozás (`429 Too Many Requests`).
  - `DiagnosticsFileWriter`: napi (UTC) és méretalapú (5 MiB) rotáció, automatikus 7 napos megőrzés és 25 MiB össztárhely-takarítás szigorú fájlnév-maszkkal (`diagnostics-YYYY-MM-DD.log`).
  - Fizikai útvonal-validáció (`fs.realpathSync` és junction/symlink feloldás): kizárva az átfedés a `public/`, `data/uploads/` és a restore mappákkal.

* **Szerveroldali életciklus és kérésazonosítás (`server.js`, `src/routes/api.js`):**
  - **Fájlok:** [`server.js`](file:///d:/dev/Röpdolgozat%20program/server.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - `X-Request-Id` és monoton futásidőmérés (`process.hrtime.bigint()`) middleware minden bejövő kéréshez.
  - Korai 8 KiB-os diagnosztikai JSON body parser a globális parserek előtt az azonnali `413 Payload Too Large` elutasításhoz.
  - `answer.received`, `answer.persisted (saved/duplicate)`, `answer.rejected`, `answer.failed`, `http.finished` és `http.closed_early` események pontos korrelációja a meglévő HTTP státuszkódok megőrzésével.
  - Új tanári végpontok: `GET /api/admin/diagnostics/status` és `GET /api/admin/diagnostics/export` streamelt JSONL formátumban.
  - Egységes `gracefulShutdown(signal)` folyamat: Socket.IO és HTTP szerver közös lezárása (`io.close`), 5 másodperces türelmi idő az aktív kérések befejezésére, `server.stopping` esemény rögzítése és 2 másodperces leürítés (`flushAndClose`).

* **Kliensoldali eseménymodul és atomi pufferelés (`public/js/student.js`):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Kétszintű azonosító: `operationId` (ugyanazon válaszkísérlethez rögzített, retry esetén változatlan) és `requestId` (minden próbálkozáshoz új 32 hex karakteres azonosító `crypto.getRandomValues` alapon).
  - `sessionStorage` körpuffer (max. 50 esemény / 32 KiB / 2 órás TTL) memóriás fallbackkel és belső `syncVersion` verziószámmal a késve érkező válaszok elszigetelésére.
  - `answer.acknowledged`, `answer.response_error`, `answer.no_ack`, valamint Socket.io `disconnect`, `connect_error` és `reconnected` események követése.
  - Calm modál hibaüzenet kiegészítése a kérésazonosítóval és a bizonytalan mentés egyértelmű jelzésével.

* **Tanári vezérlőpult Beállítások kártya (`public/admin.html`, `public/js/admin.js`):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Új "Rendszerdiagnosztika és tantermi eseménynapló" kártya állapotjelző jelvénnyel (Aktív / Kikapcsolva / Konfigurációs hiba), szerverazonosítóval, eseményszámlálókkal és közvetlen JSONL letöltési gombbal.

* **Átfogó automatizált elfogadási tesztcsomag (T-01 – T-08):**
  - **Fájlok:** [`scratch/test_diagnostics.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_diagnostics.js), [`scratch/run_all_tests.js`](file:///d:/dev/Röpdolgozat%20program/scratch/run_all_tests.js)
  - Mind a 8 teszteset (normál beküldés, elakadt kérés, elveszett ack, visszacsatlakozás és puffer-életciklus, kapacitáshiány és sebességkorlát, adatvédelem és korai méretkorlát, könyvtár-elkülönítés, szabályos leállás) teljesen automatizáltan és elszigetelten lefut.

---

## [1.33.0] – 2026-11-21

### Report 22 megállapítások: Explicit SQLite időbélyeg-rögzítés tesztlétrehozáskor és megbízható tanári listarendezés régi mentések visszaállítása után

Kiemelt tantermi adatintegritási és felületkonzisztencia kiadás a független szakértői felülvizsgálat (Report 22) megállapításainak maradéktalan orvoslására. Amikor egy korábbi verziójú (v1.26-os) biztonsági mentésből kicsomagolt adatbázis sémamigrációja lefut, a `quizzes.created_at` és `quizzes.updated_at` mezők az SQLite `ALTER TABLE ADD COLUMN` megszorításai miatt `DEFAULT NULL` beállítással jönnek létre. Annak érdekében, hogy a mentés visszaállítása után a tanár által újonnan létrehozott, lemásolt vagy egyesített tesztek ne kapjanak üres (`NULL`) időbélyegeket, a központi tesztlétrehozó művelet (`quizRepo.createQuiz`) és a mintaadat-inicializálás mostantól az `INSERT INTO quizzes` utasításban közvetlenül és expliciten átadja a `created_at` és `updated_at` mezőket az SQLite beépített `CURRENT_TIMESTAMP` értékével. Ezzel garantált, hogy mind a friss telepítésű, mind a régi mentésből visszaállított adatbázisban az új tesztek érvényes, kitöltött időbélyeggel rögzülnek, és a tanári vezérlőpult tesztlistája (`ORDER BY q.updated_at DESC, q.id DESC`) az újonnan létrehozott teszteket megbízhatóan a lista legtetejére rendezi a korábbi tesztek elé.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Explicit `created_at` és `updated_at` rögzítés tesztbeszúráskor (Report 22):**
  - **Fájlok:** [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js)
  - A `createQuiz` eljárásban az `INSERT INTO quizzes` lekérdezés explicit `CURRENT_TIMESTAMP, CURRENT_TIMESTAMP` értékkel rögzíti a `created_at` és `updated_at` mezőket, kiszolgálva a közvetlen létrehozást, a duplikálást (`duplicateQuiz`), az összefésülést (`mergeQuizzes`) és a Socrative importot is.
  - Az `init.js` mintaadat-beszúrása szintén megkapta az explicit időbélyeg-rögzítést.

* **Új célzott integrációs és rendezési teszt (35. teszt) a tesztcsomagban (Report 22):**
  - **Fájl:** [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js)
  - 35. teszt: Időbélyeg nélküli v1.26 mentés visszaállítása után új teszt létrehozása igazolja, hogy mindkét időbélyeg kitöltött és érvényes, a régi teszt sértetlen maradt, és a tanári `quizRepo.getQuizzes()` lekérdezés az új tesztet megelőzve, a lista élén jeleníti meg.

---

## [1.32.0] – 2026-11-21

### Report 21 megállapítások: Fail-fast kötelező sémamigráció, írásvédett szerverindulás meglévő adatbázis esetén és szigorított üres adatbázis védelem a rendszer-visszaállításban

Kiemelt tantermi adatintegritási, indításbiztonsági és visszaállítás-védelmi kiadás a független szakértői felülvizsgálat (Report 21) megállapításainak maradéktalan orvoslására. A közös sémamigráció (`migrateDatabase`) mostantól szigorú hibakezelést (fail-fast elv) alkalmaz: a korábbi csendes hibaelnyelés helyett bármelyik kötelező migrációs lépés meghiúsulása esetén azonnal leállítja a folyamatot. Így a sérült vagy félkész adatbázis nem kaphatja meg az új sémaverziót (`user_version = 13200`), és a rendszer-visszaállítás (Restore) elutasítja az állományt az aktív adatok érintése nélkül. A meglévő időbélyeg-mezők (`created_at`, `updated_at`, `answered_at`) pótlása biztonságos, szabványos kétlépcsős eljárásra (`DEFAULT NULL` + `UPDATE ... = datetime('now')`) módosult, kiküszöbölve az SQLite `ALTER TABLE ADD COLUMN` korlátozásait. A normál szerverindulás meglévő adatbázis esetén először kizárólag olvasásra nyitja meg a fájlt: egy újabb vagy inkompatibilis adatbázis elutasítása még azelőtt megtörténik, hogy írható kapcsolat nyílna vagy a naplózási mód (`journal_mode = WAL`) módosítaná a fájl fejlécét vagy SHA-256 ellenőrző összegét. A restore előellenőrzési kapuja mostantól szigorúan elutasítja a 0 táblás, teljesen üres SQLite fájlokat, miközben az érvényes Okoskodó sémájú, de még rekordokat nem tartalmazó mentések visszaállítása továbbra is maradéktalanul támogatott.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Szigorú fail-fast sémamigráció és biztonságos mezőpótlás (Report 21 / 1. pont):**
  - **Fájlok:** [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js), [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js)
  - A `migrateDatabase` lépéseiből kivezetésre került a `console.error` alapú hibaelnyelés; meghiúsulás esetén kivétel dobódik, megakadályozva a `user_version` felülbélyegzését és a hibás adatbázis életbe lépését.
  - A `quizzes.created_at`, `quizzes.updated_at` és `answers.answered_at` mezők migrációja `DEFAULT NULL` és azonnali `UPDATE` kombinációjával történik.
  - A restore utóellenőrzési lépése kibővült a tényleges tanári és tanulói lekérdezések teljes mezőkészletének futtatásával.

* **Írásvédett indítási kompatibilitás-ellenőrzés (Report 21 / 2. pont):**
  - **Fájl:** [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js)
  - Meglévő adatbázisfájl esetén az `init.js` először `{ readonly: true, fileMustExist: true }` módban futtatja le a `validateDatabaseCompatibility`-t.
  - Ha az adatbázis újabb vagy idegen, a folyamat azonnal megáll: a fájl fejlécét és naplózási módját a rendszer nem módosítja, sem `-wal`, sem `-shm` fájl nem jön létre, a fájl SHA-256 hash-e bájtra érintetlen marad.

* **Explicit üres adatbázis szabályozás (Report 21 / 3. pont):**
  - **Fájlok:** [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js), [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js)
  - A `validateDatabaseCompatibility` támogatja az `allowEmpty` opciót: mentés visszaállításakor (`allowEmpty: false`) a 0 táblás üres SQLite fájlt azonnal elutasítja.
  - Az érvényes Okoskodó sémájú, de rekordok nélküli adatbázisok visszaállíthatósága változatlanul biztosított.

* **3 új integrációs és regressziós teszt (32–34. teszt) a tesztcsomagban (Report 21 / 1–3. fejezet):**
  - **Fájl:** [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js)
  - 32. teszt: Sikertelen sémamigráció fail-fast megállítása, fejléc-védelem (verziószám megőrzése), valamint az időbélyeg-hiányos v1.26 mentés sikeres migrációja és a tanári tesztlista hibátlan működése.
  - 33. teszt: Tényleges indítási folyamat elutasítása külön Node.js folyamatban: igazolva, hogy a főfájl SHA-256 hash-e és DELETE naplózási módja bájtra azonos marad, és nem keletkezik -wal/-shm.
  - 34. teszt: 0 táblás üres SQLite adatbázis azonnali elutasítása a restore pre-check által az aktív adatbázis hash-ének érintetlensége mellett.

---

## [1.31.0] – 2026-11-21

### Report 20 megállapítások: Központi sémapolitika és fejléc-kompatibilitás (application_id és user_version), újabb sémák és idegen alkalmazások elutasítása, valamint támogatott jelölés nélküli korábbi mentések migrációja

Kiemelt tantermi adatintegritási, formátumbiztonsági és visszaállítás-védelmi kiadás a független szakértői felülvizsgálat (Report 20) megállapításainak maradéktalan orvoslására. A rendszer-visszaállítás (Restore) és a normál szerverindítás mostantól egy közös, szigorú kompatibilitási eljárással (`validateDatabaseCompatibility`) dolgozik, amely még bármilyen írási vagy sémamódosítási művelet előtt kiolvassa és ellenőrzi az SQLite fejléc `PRAGMA application_id` és `PRAGMA user_version` mezőit. Egy jövőbeli, a futó szervernél újabb sémaverziójú (`user_version > CURRENT_SCHEMA_VERSION`), vagy idegen alkalmazásazonosítójú (`application_id !== 0 && application_id !== OKOS_APPLICATION_ID`) mentést vagy állományt a rendszer azonnal elutasít anélkül, hogy felülírná vagy lefelé degradálná (downgrade) a fejlécet, vagy módosítaná az aktív állományokat. Az `applyPragmas` függvényből és a `DATABASE_SCHEMA.sql` állományból kivezetésre került a fejléc automatikus és feltétel nélküli felülírása: a hivatalos formátumazonosító (`application_id = 1330335571`) és az aktuális sémaverzió (`user_version = 13100`) kizárólag a sikeres sémamigráció legvégén kerül beírásra. A jelölés nélküli régebbi (v1.26-os) mentések szerkezeti ujjlenyomatát a rendszer továbbra is automatikusan felismeri, sikeresen migrálja és a legfrissebb verzióra frissíti.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Központi sémapolitika és kompatibilitás-ellenőrzés (Report 20 / 1. pont):**
  - **Fájlok:** [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js), [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js), [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql)
  - Megvalósításra került a közös `validateDatabaseCompatibility` eljárás, amely az olvasási pre-check kapuban és a migráció legelején ellenőrzi az SQLite fejlécet és a magtáblák ujjlenyomatát.
  - Az `applyPragmas` kizárólag a kapcsolat futásidejű beállításait kezeli (`WAL`, `NORMAL`, `foreign_keys = ON`), nem ír verziót.
  - A `DATABASE_SCHEMA.sql` fájlból törlésre került a fix `PRAGMA application_id` és `user_version`.
  - A sémaverzió és formátumazonosító beírása kizárólag a `migrateDatabase` sikeres lefutása után történik meg.

* **Dokumentáció és verziójelölés pontosítása (Report 20 / 3. pont):**
  - **Fájl:** [`Source/Valasz_a_Report_19_Megallapitasokra.md`](file:///d:/dev/Röpdolgozat%20program/Source/Valasz_a_Report_19_Megallapitasokra.md)
  - Javításra került a szövegtörzsben szereplő `12900`-as sémaverzió-hivatkozás `13000`-re.

* **5 új és kibővített integrációs teszt (27–31. teszt) a tesztcsomagban (Report 20 / 1–2. fejezet):**
  - **Fájl:** [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js)
  - A 27. teszt kibővült az aktív adatbázis SHA-256 ellenőrző összegének változatlanság-ellenőrzésével.
  - 28. teszt: Újabb sémaverziójú mentés (`user_version = 13200`) elutasítása a pre-check által; igazolva, hogy a fejléc nem degradálódik, és az aktív adatbázis SHA-256 hash-e bitre azonos marad.
  - 29. teszt: Idegen alkalmazásazonosítójú (`application_id = 999999`) mentés elutasítása a pre-check által.
  - 30. teszt: Támogatott, jelölés nélküli v1.26 mentés felismerése, migrálása és sémaverzió-frissítése.
  - 31. teszt: Induláskori védelem közvetlen igazolása (`init.js`), elutasítás újabb sémaverzió esetén.

---

## [1.30.0] – 2026-11-21

### Report 19 megállapítások: Mentések előzetes azonosítása még a migráció előtt (kétlépcsős szerkezeti kapu), SQLite formátum- és alkalmazásvédelem (application_id), sorrendhelyes restore teszt és 100%-ban elszigetelt átmeneti tesztfájlok

Kiemelt tantermi adatintegritási és formátumbiztonsági kiadás a független szakértői felülvizsgálat (Report 19) megállapításainak maradéktalan orvoslására. A rendszer-visszaállítás (`restoreSystemBackup`) mostantól egy szigorú kétlépcsős szerkezeti kapuval dolgozik: még a migráció és bármilyen írási művelet előtt, kizárólag olvasásra nyitja meg a kicsomagolt adatbázist, és ellenőrzi az Okoskodó kötelező magtábláinak (`quizzes`, `questions`, `students`, `sessions`, `participants`, `answers`) és azok kritikus azonosító oszlopainak meglétét, valamint a hivatalos SQLite alkalmazásazonosítót (`application_id = 0x4f4b4f53`). Egy idegen, tévesen kiválasztott SQLite-adatbázist a rendszer azonnal, az aktív környezet érintése nélkül elutasít. A 24. regressziós teszt előkészítése sorrendhelyesre javult (bizonyítottan a mentésbe kerül a régi trigger, és a restore után megújul a snapshotos verzióra). A sérült mentések teszteléséhez használt átmeneti ZIP fájl (`corrupt_test.zip`) a forrásfából átkerült az elkülönített tesztkörnyezetbe (`path.dirname(testDbPath)`), így a teljes tesztfutás 100%-ban elszigetelt marad.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Kétlépcsős mentés-azonosítás a Restore eljárásban még a migráció előtt (Report 19 / 1. tétel):**
  - **Fájlok:** [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js), [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql)
  - A `restoreSystemBackup` eljárás elejére beépítésre került a read-only pre-check ellenőrzés (`PRAGMA integrity_check`, 6 magtábla és oszlop-ujjlenyomat vizsgálata).
  - Bevezetésre került a hivatalos SQLite formátumjelölés: `PRAGMA application_id = 1330335571;` ('OKOS') és `PRAGMA user_version = 13000;`.
  - Új integrációs teszt (27. teszt) igazolja az idegen SQLite adatbázis azonnali elutasítását a migráció előtt.

* **Sorrendhelyes restore trigger teszt és tesztállomány-izoláció (Report 19 / 2. és 3. tétel):**
  - **Fájl:** [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js)
  - A 24. tesztben a régi elavult trigger telepítése megelőzi a ZIP mentés készítését, igazolva a trigger restore utáni automatikus megújulását és a válasz 4.0 pontos rögzülését.
  - A 8. teszt `corrupt_test.zip` állománya az elszigetelt ideiglenes könyvtárba került.

---

## [1.29.0] – 2026-11-21

### Report 18 megállapítások: Restore utáni azonnali triggermegújítás, műveletenként egyedi rollback-másolatok, törölt sablon melletti történeti diákeredmény-megnyitás és 100%-ban elszigetelt központi tesztfuttató

Kiemelt tantermi adatintegritási, megbízhatósági és fejlesztői tesztelési kiadás a független szakértői felülvizsgálat (Report 18) megállapításainak maradéktalan orvoslására. A kicsomagolt adatbázison a közös `migrateDatabase` eljárás lefutatja a sémamigrációt és az SQLite triggerek újraépítését a fájlcsere előtt, így a korábbi verziójú (v1.26-os) mentésekből visszatöltött adatbázison is azonnal a v1.28+ snapshotos triggerek válnak aktívvá, megelőzve az elavult pontplafon miatti válaszmegtagadásokat. A visszagörgetési biztonsági mentések műveletenként teljesen egyedi, időbélyeges mappába (`_restore_snapshots/restore_op_<id>`) kerülnek: egy új restore kizárólag a saját ideiglenes könyvtárát takarítja el, megóvva az esetleges korábbi hibákból fennmaradt adatbázis- és képmásolatokat. A szerkesztői feladattárból törölt sablonok esetén a pillanatkép nélküli korábbi dolgozatok történeti kérdésadatai és eredményei a diákfelületen is hibátlanul elérhetők maradnak (`includeDeleted = true`), elhárítva a korábbi HTTP 500 belső szerverhibát. A teljes tesztcsomag (`npm test`) egy új központi futtatón (`scratch/run_all_tests.js`) keresztül valósul meg, amely az operációs rendszer ideiglenes könyvtárában (`os.tmpdir()`) teljesen elszigetelt környezetet biztosít a teszteknek. A tesztlefutás előtt és után a projekt éles adatbázisának ellenőrző összege garantáltan változatlan marad (`Checksum match: True`), tiszta projektmásolat esetén pedig nem hoz létre felesleges adatbázis-állományokat.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Közös sémamigráció a Restore-ban (Report 18 / 1. pont):**
  - **Fájlok:** [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js), [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql)
  - Az önálló `migrateDatabase(targetDb)` függvény tetszőleges SQLite adatbázis-kapcsolaton elvégzi az összes strukturális migrációt, eldobja a korábbi triggereket, és a `DATABASE_SCHEMA.sql` alapján telepíti a legfrissebb snapshotos triggereket.

* **Műveletenként egyedi helyreállítási másolatok és rollback-védelem (Report 18 / 2. pont):**
  - **Fájlok:** [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js)
  - A rendszer-visszaállítás a csere előtt műveletenként egyedi `_restore_snapshots/restore_op_<id>` könyvtárba menti az adatbázist és a képeket.
  - Sikeres művelet esetén kizárólag a saját mappa törlődik; egy korábbi hibából megőrzött mentést a következő restore nem ír felül és nem töröl. Kettős hiba esetén a könyvtárba `recovery_meta.json` metaadatfájl kerül a pontos hiba részleteivel.

* **Törölt sablon melletti történeti diákeredmény-megjelenítés (Report 18 / 3. pont):**
  - **Fájlok:** [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - A `quizRepo.getQuizById` kiegészült az `includeDeleted = false` paraméterrel: a feladattár és a szerkesztő kiszűri a törölt teszteket, míg a lezárt dolgozatok diákoldali megjelenítője feloldja a történeti kérdéseket.
  - A `GET /api/student/session-data` defenzív tartalékot kapott, amely megelőzi a null kvíz miatti HTTP 500 belső szerverhibát.

* **100%-ban elszigetelt központi tesztfuttató és 3 új integrációs teszt (Report 18 / 4. pont):**
  - **Fájlok:** [`scratch/run_all_tests.js`](file:///d:/dev/Röpdolgozat%20program/scratch/run_all_tests.js), [`scratch/test_merge_quizzes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_merge_quizzes.js), [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js), [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json)
  - A központi tesztfuttató `os.tmpdir()` alatti átmeneti munkakönyvtárban indítja a teszteket a `DB_PATH` és `UPLOADS_DIR` átadásával, majd a végén kitakarít.
  - 3 új automatizált teszt (24., 25., 26.) ellenőrzi a mentésből érkező régi trigger megújítását sabloncsökkentés mellett, a korábbi rollback-mentések megőrzését újabb restore esetén, valamint a törölt sablonhoz tartozó pillanatkép nélküli diákeredmény hibátlan megnyílását.

---

## [1.28.0] – 2026-11-21

### Report 17 megállapítások: Többpontos kérdések arányos felülbírálása, sablonból törölt kérdések idegenkulcs-védelme, törölt tesztek indítási blokkolása, korábbi mentések Restore sémamigrációja, megbízható rollback-mentésmegőrzés és Socket.IO szobavédelem

Kiemelt tantermi adatintegritási, hibatűrési és biztonsági kiadás a független szakértői felülvizsgálat (Report 17) megállapításainak maradéktalan orvoslására. A kézi felülbírálás (`overrideAnswer`) arányos pontszámítása mostantól a többpontos kérdéseknél is maradéktalanul érvényesíti a kérdés maximális pontértékét (pl. 4 pontos feladat felezése 2.0 pontot ad az 1.0/0.5 helyett). A Tesztszerkesztő sablonmódosítása (`updateQuiz`) a már futó vagy lezárt dolgozattal rendelkező kvízeknél a feladatsorból eltávolított kérdéseket nem törli fizikailag, hanem archiválja (`question_order >= 100000`), megóvva az `answers` tábla szigorú SQL RESTRICT idegen kulcsát a tanulói válaszbeküldéskor. A törölt (soft-deleted, `is_deleted = 1`) feladatsorok indítását mind a dolgozatindító (`startSession`), mind az egyedi tesztlekérdező (`getQuizById`) szigorúan elutasítja. A korábbi verziójú biztonsági mentések helyreállítása (Restore) kibővült az automatikus sémamigrációval: az elavult mentésekből kicsomagolt adatbázisban a rendszer automatikusan pótolja az `is_deleted`, `folder_id` és `instructions` mezőket, megelőzve az ismeretlen oszlop miatti lekérdezési hibákat. A Restore kétoldalú visszagörgetési biztonsága megerősítésre került: ha a visszatöltés vagy a rollback során hiba lépne fel, az átmeneti biztonsági mentések (.bak és képtárhely) szigorúan a lemezen maradnak a rendszergazda számára. A tanulói Socket.IO szobabelépés kötelező tokenellenőrzést kapott (megszűnt a token nélküli fallback belépés), a kivetítő felületéről pedig kivezetésre került a jogosulatlan adminisztrátori mátrix lekérés. A tesztcsomag teljes mértékben elszigetelt, független átmeneti adatbázisban és könyvtárban fut (`process.env.DB_PATH`, `process.env.UPLOADS_DIR`), 23 hibátlan integrációs teszttel garantálva a tantermi működést.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Kézi felülbírálás arányos pontozása és FK-védett kérdésarchiválás (Report 17 / 1.1 és 1.2):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js)
  - Az `overrideAnswer` alapértelmezett ágában a helyes válasz a kérdés tényleges maximális pontszámát (`newPoints = maxPoints`), a részpont pedig a felét (`newPoints = maxPoints / 2.0`) kapja, elhárítva a többpontos kérdések csonkítását.
  - Az `updateQuiz` ellenőrzi, hogy a feladatsorhoz tartozik-e már munkamenet. Ha igen, a kérdést nem törli a `questions` táblából, hanem magas sorszámmal archiválja, így a tanuló snapshot alapján leadott válasza nem ütközik `FOREIGN KEY constraint failed` hibába.
  - A `submitAnswer` a dolgozatkori pillanatképből hiányzó kérdések beküldését azonnal elutasítja.

* **Törölt tesztek indítási védelme (Report 17 / 1.3):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js)
  - A `startSession` szerveroldalon ellenőrzi, hogy a megadott teszt létezik-e és nincs-e soft-delete-elve (`quizCheck.is_deleted === 1`), azonnali hibaüzenettel megakadályozva a már törölt teszt indítását.
  - A `getQuizById` kizárja a törölt sablonokat (`COALESCE(q.is_deleted, 0) = 0`).

* **Előző verziójú mentések automatikus Restore sémamigrációja és megerősített rollback (Report 17 / 2.1 és 2.2):**
  - **Fájlok:** [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js)
  - A `restoreSystemBackup` kicsomagolás után automatikusan ellenőrzi és szükség esetén pótolja a hiányzó `quizzes.is_deleted`, `quizzes.folder_id` és `questions.instructions` oszlopokat, és tesztlekérdezéssel igazolja a működést a csere előtt.
  - A visszagörgetési logika pontos állapotkövetéssel (`restoreSuccess`, `isFullyRecovered`) dolgozik. Bármilyen hiba esetén a biztonsági másolatok a lemezen maradnak, a napló és a hibaüzenet pontos elérési utat biztosít a rendszergazdának.

* **Szigorított diák Socket.IO védelem és kivetítői tisztítás (Report 17 / 3. fejezet):**
  - **Fájlok:** [`src/sockets/liveHandler.js`](file:///d:/dev/Röpdolgozat%20program/src/sockets/liveHandler.js), [`public/js/projector.js`](file:///d:/dev/Röpdolgozat%20program/public/js/projector.js)
  - A `join:session` socket esemény kizárólag érvényes kriptográfiai token igazolása után lépteti be a tanulót a dolgozat szobájába; hiányzó vagy hibás token esetén hibaüzenetet küld.
  - A kivetítő felületről törlésre került a hibaági adminisztrátori `/api/admin/sessions/:id/matrix` végpont lekérése.

* **Izolált tesztkörnyezet és 3 új integrációs teszt (Report 17 / 4. fejezet):**
  - **Fájlok:** [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js)
  - A szintetikus regressziós tesztcsomag elszigetelt környezetben (`test_isolated_report17.db`, `test_uploads_report17`) fut, és kitakarítja maga után az átmeneti fájlokat.
  - 3 új automatizált teszt (21., 22., 23.) igazolja a többpontos kérdések arányos felülbírálását, a sablonból törölt kérdés hibátlan beküldését és a soft-deleted kvízek indításának elutasítását.

---

## [1.27.0] – 2026-11-20

### Report 16 megállapítások: Teljes körű dolgozatkori pillanatkép-érvényesítés a pontozásban, globális indítási adatszivárgás megszüntetése, fejléc-alapú diáktoken, Space Race explicit UTC időzítés, archívumvédett sablontörlés és kétoldalú atomi Restore rollback

Kiemelt tantermi adatintegritási, biztonsági és megbízhatósági kiadás a független szakértői felülvizsgálat (Report 16) megállapításainak maradéktalan orvoslására. A dolgozat indításakor a szerver a `session:started` globális eseményből levágja a feladatsor belső pillanatképét (`quiz_snapshot_json`) és a megoldókulcsokat, így a hálózatra kizárólag a nyilvános metaadatok kerülnek ki. A tanulói munkamenet azonosítója kivezetésre került a GET URL query paraméterekből, a kliens kizárólag a védett `x-session-token` kérésfejlécben kommunikál. A dolgozatkori feladat-pillanatkép 100%-osan érvényesül a szerveroldali életciklusban: a kérdéskiosztás (`joinSession`), a gépi pontozás (`submitAnswer`) és a tanári manuális felülbírálás (`overrideAnswer`) kizárólag a dolgozat indításakor rögzített snapshotból olvassa a kérdésszövegeket, opciókat, helyes válaszokat és maximális pontértékeket. Ezzel megszűnt a sablonszerkesztésből fakadó pontozási eltérés kockázata: ha a tanár egy futó dolgozat közben átírja a feladattárban a kérdést vagy a megoldókulcsot, a dolgozatot író tanuló a nála látható kérdés és a dolgozatkori pillanatkép szerint kap hibátlan értékelést. Az SQLite pontplafon és összetartozási triggerek felokosításra kerültek a snapshot támogatására. A Tesztszerkesztő sablontörlése (`deleteQuiz`) szétválasztásra került az archívumtól: lezárt dolgozattal rendelkező kvíz esetén a teszt soft-delete-tel (`is_deleted = 1`) rejtőzik el, megőrizve az archívumban lévő dolgozatokat, diákválaszokat és az illusztrációs képeket. A Space Race üres teremből indított rajtja explicit UTC ISO 8601 időbélyeggel és a `parseUtcDate` normalizálóval rögzül, kizárva a helyi időzónás eltolódást és a 0 másodperces késői belépési hibát. A rendszer-visszaállítás (Restore) kétoldalú biztonsági mentést kapott: adatbázis és feltöltött képek együttes rollbackje szavatolja, hogy meghiúsulás esetén se maradjon vegyes vagy sérült állomány. A Socrative PDF importőr a kulcs nélküli diák PDF ágban is üres kulcsot és kötelező felülvizsgálati jelölést ad, a dolgozatindítás pedig blokkolja a hiányos kvízeket.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Globális indítási adatszivárgás-védelem és fejléc-alapú diák hitelesítés (Report 16 / 1.1 és 1.2):**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`src/sockets/liveHandler.js`](file:///d:/dev/Röpdolgozat%20program/src/sockets/liveHandler.js)
  - A `POST /admin/sessions/start` végponton a `session:started` eseménybe kizárólag a `publicSession` szűrt objektum kerül, megakadályozva a megoldókulcsok globális kiszivárgását.
  - A diákfelület a munkamenet-lekérés során a `?token=...` query paramétert elhagyva kizárólag az `x-session-token` HTTP fejlécben továbbítja a tokent.
  - A diák Socket.IO kapcsolatok `join:session` eseménye szerveroldalon ellenőrzi a token érvényességét a tanulói szobába léptetés előtt.

* **100%-os feladat-pillanatkép érvényesítés és függetlenítés a szerkeszthető sablontól (Report 16 / 2.1):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js)
  - A `joinSession` a kérdések azonosítóit és sorrendjét a `session.quiz_snapshot_json`-ból veszi, garantálva, hogy a késve érkező tanuló is a dolgozatkori kérdéssort kapja meg.
  - A `submitAnswer` mind a kérdés adatait (szöveg, opciók, kulcs, magyarázat, pontérték), mind a teljes kérdésszámot a pillanatképből határozza meg, így a sablon futás alatti módosítása nem befolyásolja a kiértékelést.
  - Az `overrideAnswer` a snapshotban rögzített kérdés pontértékéhez viszonyítja a felülbírálási maximumot.
  - A `trg_validate_answer_question`, `trg_validate_answer_points_limit` és `trg_validate_answer_points_limit_update` triggerek a snapshot megléte esetén átadják az ellenőrzést az alkalmazásrétegnek, megelőzve a hamis abort hibákat.

* **Archívumvédett kvíztörlés és soft-delete sablonmegőrzés (Report 16 / 2.2):**
  - **Fájlok:** [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js), [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js)
  - A `quizzes` tábla kiegészült az `is_deleted INTEGER NOT NULL DEFAULT 0` oszloppal.
  - A `deleteQuiz` aktív dolgozat esetén tiltja a teszt törlését. Ha a kvízhez van lezárt dolgozat, a sablon soft-delete-et kap (`is_deleted = 1`), így kikerül a Tesztszerkesztőből, de az archívumban lévő dolgozatok, diákválaszok és illusztrációk maradéktalanul megőrződnek.

* **Space Race közös határidő explicit UTC ISO 8601 időkezeléssel (Report 16 / 3. fejezet):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js)
  - A `startRace` explicit `new Date().toISOString()` UTC stringet rögzít a `started_at` mezőben.
  - A `parseUtcDate` segédfüggvény garantálja, hogy a dátumszövegek UTC-ként legyenek értelmezve, elhárítva a helyi időzónás eltolódást és az üres teremből indított verseny késői csatlakozójának 0 másodperces lejárati anomáliáját.

* **Kétoldalú atomi Restore visszagörgetés adatbázisra és képekre (Report 16 / 4. fejezet):**
  - **Fájlok:** [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js)
  - A rendszer-visszaállítás a csere előtt átmeneti biztonsági mentést készít az `uploads` könyvtárról is (`_uploads_restore_bak`). Bármilyen hiba esetén mind az adatbázis (`.bak`), mind a képek automatikusan visszagördülnek az eredeti állapotukba.

* **Socrative PDF import és tiszta regressziós tesztcsomag (Report 16 / 5. és 6. fejezet):**
  - **Fájlok:** [`src/services/socrativePdfParser.js`](file:///d:/dev/Röpdolgozat%20program/src/services/socrativePdfParser.js), [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js)
  - A kulcs nélküli diák PDF ágban is üres kulcs (`correct_answer: ''`) és kötelező felülvizsgálati jelölés (`needs_review: true`) keletkezik.
  - A tesztcsomag szintetikus tanulókat biztosít üres adatbázis esetén is, és 3 új integrációs teszttel (18., 19., 20.) ellenőrzi a sablonmódosítás függetlenségét, az explicit UTC időzítést és a soft-delete archívumvédelmet.

---

## [1.26.0] – 2026-11-20

### Report 15 mélyítés: Dolgozatkori rögzített feladatverzió (Snapshot) és képvédelem, szerveroldali Socket.IO tanári hitelesítés, kivetítői adatszivárgás-védelem, szinkronizált lezárási esemény, 15 perces gépváltási engedélyek, üres termi Space Race közös határidő és atomi Restore sémamigrációval

Kiemelt tantermi adatintegritási, biztonsági és felügyeleti kiadás a független szakértői audit (Report 15) elmélyítési követelményei alapján. A dolgozat indításakor a rendszer a `sessions.quiz_snapshot_json` mezőbe rögzíti a feladatsor teljes, megváltoztathatatlan állapotát (kérdések szövege, sorrendje, opciói, helyes megoldásai, magyarázatai, pontértékei és képei). Ezzel a dolgozatok történeti integritása véglegesen elválik a dinamikus Tesztszerkesztőtől: a tanár a dolgozat lezárása után szabadon átírhatja a kérdéseket, módosíthatja a pontokat vagy törölhet feladatokat a sablonból, a korábban megírt dolgozatok tanulói nézete, archívuma, valamint az Excel, interaktív HTML, egyéni ZIP és PDF exportjai 100%-ban az eredeti dolgozatkori feladatsort és eredményeket jelenítik meg. Az automatikus képtakarító (`cleanQuizOrphanImages`) védelmet kapott a snapshotokban szereplő képekre, kizárva az archív illusztrációk törlését. A Socket.IO kommunikáció szerveroldali tanári hitelesítéssel egészült ki: a tanári szobához való csatlakozást és a védett műveleteket (`teacher:next_question`, `teacher:kick_participant`) a szerver közvetlenül az aláírt munkamenet-süti alapján ellenőrzi. A másodlagos kivetítő monitor (2. Monitor) külön szobába (`session_${id}_projector`) lép be, és egy dedikált, anonimizált végpontról (`GET /api/sessions/:id/projector-matrix`) kapja az adatokat: a hálózat a kivetítő felé egyetlen diáknevet, tanulói azonosítót, kérdés-megoldókulcsot vagy egyéni diákválaszt sem továbbít. A tanári dolgozatbefejezés (`finishSession`) szinkronizált eseményszórással minden érintett szobába kiküldi a lezárást, azonnal átváltva a diákok képernyőjét az értékelőlapra. A gépváltási engedélyek időbélyeggel ellátott, 15 perces automatikus lejárati időt kaptak. Space Race módban az idempotens rajtütemezés biztosítja, hogy üres termi rajt esetén a késve érkező tanuló is a közös, már ketyegő határidőhöz igazodjon, az ismételt rajtkattintás pedig nem indítja újra az időt. A Socrative PDF importőr a bizonytalan kulcsokat nem fogadja el automatikusan, a dolgozatindítás pedig szigorúan elutasítja a megoldókulcs nélküli tesztek indítását. A rendszer-visszaállítás (Restore) az ideiglenes könyvtárban lefolytatott automatikus sémamigrációval szavatolja a korábbi verziójú mentések zökkenőmentes helyreállítását.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Dolgozatkori rögzített feladatverzió (Snapshot) és képvédelem (Report 15 / 2. fejezet):**
  - **Fájlok:** [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - A `sessions` tábla kiegészült a `quiz_snapshot_json TEXT DEFAULT NULL` oszloppal.
  - A `startSession` a dolgozatindítás pillanatában legenerálja a feladatsor teljes JSON pillanatképét, és rögzíti az adatbázisban.
  - A `GET /api/student/session-data` és a `getLiveMatrixData` a rögzített snapshotból olvassa a kérdéseket, levágva a megoldókulcsot dolgozatírás közben, és a lezárás után abból állítja elő az egyéni és csoportos értékeléseket.
  - A `cleanQuizOrphanImages` megkeresi az adott kvízhez tartozó összes `quiz_snapshot_json` rekordot, és megvédi az azokban hivatkozott képeket a törléstől.

* **Szerveroldali Socket.IO tanári hitelesítés és kivetítői adatszivárgás-védelem (Report 15 / 1. fejezet):**
  - **Fájlok:** [`src/sockets/liveHandler.js`](file:///d:/dev/Röpdolgozat%20program/src/sockets/liveHandler.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/projector.js`](file:///d:/dev/Röpdolgozat%20program/public/js/projector.js)
  - A `liveHandler.js` a `join:session` során a kapcsolat HTTP cookie fejlécéből kinyert token alapján, az `auth.isValidToken` függvénnyel szigorúan ellenőrzi a tanári bejelentkezést; érvénytelen tokennel a tanári szobához való csatlakozást elutasítja.
  - A kivetítő számára létrejött a `session_${id}_projector` dedikált szoba és a publikus `GET /api/sessions/:id/projector-matrix` végpont. A `sessionRepo.getProjectorData` függvény garantálja, hogy a kivetítő felé semmilyen diáknév, diákazonosító, kérdés-megoldókulcs vagy egyéni válaszszöveg ne jusson ki a hálózatra.
  - A `broadcastMatrixUpdate` segédfüggvény révén a diákok válaszai és felülbírálásai egyszerre frissítik a tanári teljes mátrixot és a kivetítő anonimizált nézetét.

* **Szinkronizált lezárási esemény és azonnali képernyőváltás (Report 15 / 1. fejezet):**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `POST /admin/sessions/:id/finish` a `session:finished` eseményt egyszerre sugározza a diákok (`session_${id}_student`), a tanárok (`session_${id}_teacher`), a kivetítő (`session_${id}_projector`) és az alap szobába is.
  - A diákfelület a lezárási esemény vételekor azonnal meghívja a `finishQuiz()`-t és betölti az értékelőlapot.

* **15 perces lejárati idő a gépváltási engedélyekhez (Report 15 / 2. fejezet):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js)
  - Az `authorizeSeatChange` a felhatalmazási tokenbe beágyazza a létrehozási időbélyeget (`PENDING_SEAT_CHANGE:pcTag:timestamp:hex`).
  - A `joinSession` ellenőrzi az időbélyeget: ha az engedély 15 percnél régebbi, a bejelentkezést biztonsági okokból elutasítja.

* **Space Race üres termi rajt és késői belépő közös határideje (Report 15 / 1. fejezet):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js)
  - A `startRace` rögzíti az alkalom szintjén a rajt időpontját (`started_at = CURRENT_TIMESTAMP`).
  - Ha rajtkor még nem tartózkodott tanuló a szobában, az első késői csatlakozó a rajt idejétől ketyegő határidőt kapja meg, kizárva a plusz idő szerzésének lehetőségét.
  - A `startRace` idempotens: a tanár kétszeri rajtkattintása nem indítja újra az időt.
  - A félkész tanári léptetés (`TEACHER_PACED`) indítását a szerver érthető hibaüzenettel megtiltja.

* **Socrative PDF import kulcs-ellenőrzés és diák fejléc-hitelesítés (Report 15 / 3. fejezet):**
  - **Fájlok:** [`src/services/socrativePdfParser.js`](file:///d:/dev/Röpdolgozat%20program/src/services/socrativePdfParser.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A PDF parser bizonytalan kulcs esetén nem választ ki önkényesen alapértelmezett választ (pl. az A-t), hanem üres kulcsot és `needs_review: true` jelölést ad.
  - A `startSession` megköveteli az érvényes megoldókulcsot minden kérdésnél; kulcs nélküli kvízzel dolgozat nem indítható el.
  - A tanulói felület minden API kérésben az `x-session-token` kérésfejlécben is továbbítja a munkamenet-azonosítót.

* **Atomi Restore automatikus sémamigrációval az ideiglenes könyvtárban (Report 15 / 4. fejezet):**
  - **Fájlok:** [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js)
  - A `restoreSystemBackup` a kicsomagolt adatbázison az ideiglenes könyvtárban automatikusan lefolytatja a sémamigrációkat (pl. régebbi v1.22-es mentésekhez hozzáadja a `max_points` és `quiz_snapshot_json` oszlopokat), és csak sikeres integritás-vizsgálat után élesíti az adatbázist.

---

## [1.25.0] – 2026-11-20

### Report 14 tantermi átvilágítás: Space Race kérdés- és rajtvédelem, gépváltási és reset jelenlét feloldása, HTML exportok XSS védelme, tanári PIN brute-force védelem, atomi SQLite Backup & Restore garancia, Socket.IO szobamenedzsment és robusztus KRÉTA CSV import

Kiemelt tantermi biztonsági, versenyfelügyeleti, hálózati szinkronizációs és üzemeltetési kiadás az éles próba előtti átvilágítás (Report 14) alapján. A Space Race (Csapatverseny) közös rajtja szerveroldalon is teljes védelmet kapott: a tanulói felület a tanári indítás (`start-race`) előtt egyáltalán nem kapja meg a kérdéseket (`questions: []`), a rajt előtti válaszküldés szigorúan tiltott, az egyéni időkorlát pedig nem a várótermi belépéstől, hanem kizárólag a tanári rajt pillanatától indul el. A tantermi gépváltás (`authorize-seat-change`) és a téves névfoglalás törlése (`reset`) mostantól azonnal feloldja a memóriabeli és adatbázis-jelenlétet a célgépen, így az áthelyezett diák a lenyíló névsorban nem ragad benn foglaltként, a régi gép pedig célzott Socket.IO értesítésre automatikusan kilép a munkamenetből anélkül, hogy a többi tanulót megzavarná. Az interaktív csoportos HTML és az egyéni ZIP értékelőlap exportok teljes körű XSS és attribútum-tisztítást (`escapeHtml`) kaptak, valamint a ZIP fájlnevek egyediségi védelmet élveznek azonos nevű diákok esetén. A tanári belépési felület intelligens próbálkozáskorlátot (Rate Limiting) kapott az illetéktelen PIN próbálgatások (brute-force) ellen (5 sikertelen kísérlet után 1 perces zárolás lép életbe). A rendszermentés és -visszaállítás az SQLite Online Backup API-val konzisztens pillanatképet készít, a visszatöltés pedig előzetes integritás-, séma- és idegenkulcs-vizsgálattal, valamint hiba esetén automatikus biztonsági másolatra való visszagörgetéssel (Rollback) garantálja a 100%-os adatbiztonságot. A Socket.IO szobakezelés teljes tisztítást kapott csatornaváltásokkor (`leave:session`), hálózati mikromegszakadások után a kliensek automatikusan újra feliratkoznak és szinkronizálják az élő mátrixot és a Live Badge-eket, a KRÉTA CSV importáló pedig összetett idézőjelezett mezőket is hibátlanul feldolgoz.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Space Race közös rajt és kérdésvédelem (16. pont):**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `GET /api/student/session-data` végpont Space Race módban a rajt előtt üres kérdéslistát ad vissza (`questions: []`), megakadályozva a feladatok idő előtti megtekintését.
  - A `submitAnswer` a rajt előtt elutasítja a válaszküldési kísérleteket.
  - A `joinSession` a váróban várakozó diákoknak nem indítja el a visszaszámlálót (`deadline_at = null`), az időkorlát a tanári indítás (`startRace`) pillanatától ketyeg mindenkinek egységesen.
  - A `student.js` a `race:started` Socket.IO esemény fogadásakor frissen kéri le a feloldott kérdéseket és az elindított határidőt a szervertől.

* **Gépváltási és törlési események és jelenlét feloldása (06., 07. pont):**
  - **Fájlok:** [`src/services/presenceService.js`](file:///d:/dev/Röpdolgozat%20program/src/services/presenceService.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `getDbOccupiedStudentIds` a gépváltásra jóváhagyott (`PENDING_SEAT_CHANGE`) diákot nem tekinti foglaltnak, így az új célgépen a névsorban azonnal kattinthatóvá válik a neve.
  - A tanári jóváhagyáskor és resetkor lefut a `presenceService.releaseStudent`, és kimegy a frissített `students:occupied_updated` az osztálynak.
  - A `participant:kicked` esemény tartalmazza a célzott `participantId` és `studentId` mezőket, így a diákfelület kizárólag az érintett régi gépet lépteti ki.

* **HTML exportok XSS / escape védelme (08., 40. pont):**
  - **Fájlok:** [`src/services/exporter.js`](file:///d:/dev/Röpdolgozat%20program/src/services/exporter.js)
  - Bevezetésre került a szerveroldali `escapeHtml` segédfüggvény.
  - Az interaktív csoportos HTML és az egyéni tanulói HTML értékelőlapok minden szöveges és attribútum-mezője (tesztcím, tantárgy, évfolyam, diák neve, kérdésszöveg, válaszok) biztonságosan szűrésre kerül.
  - A ZIP fájlnevek a névütközések elkerülésére azonos diáknevek esetén automatikusan megkapják a résztvevő azonosítóját (`nev_id_ertekeles.html`).

* **Tanári bejelentkezési Rate Limiting (03. pont):**
  - **Fájlok:** [`src/middleware/auth.js`](file:///d:/dev/Röpdolgozat%20program/src/middleware/auth.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - Beépített brute-force védelem: 5 sikertelen PIN kísérlet után a rendszer automatikusan 60 másodpercre zárolja az adott IP-címről érkező bejelentkezéseket, HTTP 429-es státuszkóddal és hátralévő idő kijelzésével.

* **SQLite Online Backup és Atomi Rollback garancia (41., 42., 43. pont):**
  - **Fájlok:** [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - A mentés az SQLite hivatalos Online Backup API-ját használja, így az élő adatbázisról garantáltan konzisztens pillanatkép kerül a ZIP csomagba.
  - A visszaállítás (Restore) a kicsomagolt adatbázison `integrity_check`, `foreign_key_check` és kötelező táblamegléti vizsgálatot végez.
  - Bármilyen fájlcsere vagy képmásolási hiba esetén a rendszer automatikusan visszagörgeti a `.bak` másolatot a helyére és újranyitja a kapcsolatot, kizárva az adatbázis keveredését vagy elvesztését.

* **Socket.IO szobakezelés és újracsatlakozási szinkronizáció (20., 21., 24. pont):**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/js/projector.js`](file:///d:/dev/Röpdolgozat%20program/public/js/projector.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A tanár és a kivetítő csatornaváltásakor a rendszer explicit elhagyja az előző munkamenet szobáját (`leave:session`), megszüntetve a felesleges hálózati forgalmat és a korábbi dolgozatok eseményeinek keveredését.
  - Hálózati szakadás után az újracsatlakozáskor (`connect` esemény) az admin, a kivetítő és a diák kliens azonnal újraküldi a szoba-feliratkozást, és frissíti a Live Badge állapotokat, illetve az élő mátrixot.
  - A `participant:focus_lost` fókuszvesztési értesítés kizárólag az éppen aktív munkamenet képernyőjén jelenít meg tanári figyelmeztetést, és lezárt dolgozatban a szerver már nem rögzít felesleges fókuszvesztést.

* **Robusztus KRÉTA CSV import idézőjel-védelemmel (35. pont):**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - Bevezetésre került a beépített `parseCsvLine` RFC 4180 szabvány szerinti tokenizáló, amely megbízhatóan kezeli az idézőjelbe zárt mezőket, pontosvesszőt, vesszőt, tabulátort és a dupla idézőjeles escape-elést.

* **Idempotens válaszbeküldés teljessége hálózati mikromegszakadások ellen (19. pont):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js)
  - Duplikált válaszküldés (pl. kliens retry hálózati timeout esetén) esetén a szerver akkor is hiba nélkül, idempotensen adja vissza a korábbi mentett értékelést, helyes választ és magyarázatot, ha a diák a válasz leadásával már befejezte a dolgozatot (`isFinished = true`).

* **Diákfelület és időzítő szinkronizáció (22., 50. pont):**
  - **Fájlok:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Az időkorlát lejárásakor a kliens azonnal és automatikusan lezárja a dolgozatot a háttérben (`finishQuiz`), nem várakozva a modális ablak tanulói nyugtázására (22. pont).
  - A gépszám felismerése a tanulói munkaállomásokon mind a `?gep=X`, mind a `?pc=X` URL paramétert egyenértékűen támogatja (50. pont).

* **Képfeltöltés és médiafájlok szigorú védelme (09., 10., 13., 39. pont):**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`server.js`](file:///d:/dev/Röpdolgozat%20program/server.js), [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js)
  - Szigorú fehérlistás kiterjesztés- és MIME-típus ellenőrzés a kérdésképek feltöltésekor (JPG, PNG, GIF, WEBP, SVG).
  - Az `/uploads` statikus kiszolgálónál bevezetésre került az `X-Content-Type-Options: nosniff` fejléc, valamint SVG esetén szigorú `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` fejléc, megakadályozva a beágyazott szkriptek futását az alkalmazás eredetén közvetlen megnyitáskor is.
  - Minden dinamikus API végpont globális `Cache-Control: no-store, no-cache, must-revalidate` fejlécet kapott, védve a diák- és tanári adatokat a böngésző vagy proxy gyorsítótárazásától.
  - A közvetlen `/print-report.html` statikus elérés automatikusan átirányításra kerül a hitelesített `/print` útvonalra.
  - A szerver indulásakor automatikusan kitakarításra kerülnek a 24 óránál régebbi, elvetett ideiglenes képfeltöltések (`cleanExpiredTempImages`).

* **Átfogó tantermi regressziós tesztcsomag (Report 14 ellenőrzések):**
  - **Fájlok:** [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js)
  - 12 új szigorú automatizált integrációs teszt igazolja a Space Race közös rajtját, a gépváltást, a HTML XSS védelmet, a tanári PIN Rate Limitinget, az SQLite konzisztens mentést és visszaállítást, a KRÉTA CSV importot, az idempotens újrabeküldést és az elavult képek takarítását.

---

## [1.23.0] – 2026-11-20

### Report 14 tantermi átvilágítás: Socrative PDF megoldókulcs és kiértékelő szinkronizáció, időkorlátos lezárási rollback elhárítása, tanári léptetés mód letiltása, Socket.IO tanári mátrix elszigetelése és történeti jegyvédelem

Kiemelt tantermi stabilitási, biztonsági és adatintegritási kiadás az éles próba előtti független szakértői átvilágítás (Report 14) alapján. A Socrative PDF importáló és az automatikus kiértékelő teljes szinkronizációt kapott: a parser mostantól az opció tényleges válaszszövegét rögzíti megoldókulcsként, a pontozó pedig kétirányú intelligens kompatibilitási védelmet kapott az egybetűs ('A', 'B', 'C', 'D') és TF ('a'/'b') aliasok felismerésére. Megszűnt az egyéni időkorlát lejárati mentésének visszagördülése: az idő lejárta után a válasz elutasítása mellett a tanuló lezárt állapota tartósan megmarad az adatbázisban. A félkész „Tanári léptetés” működési mód az indítási ablakban ideiglenesen letiltásra került a tanári tévedések kizárása érdekében. A Socket.IO valós idejű adatszivárgás elhárult: a tanári élő mátrix és a tanulói fókuszvesztési értesítések kizárólag a tanári és kivetítői szobába (`session_${id}_teacher`) kerülnek kiküldésre, így a diákok nem láthatják a megoldásokat vagy mások válaszait a hálózaton. Ezenfelül a rendszer kőbe vésett történeti jegyvédelmet kapott: az új `sessions.max_points` mező beégeti a dolgozat lezáráskori maximális összpontszámát, így a tesztek későbbi szerkesztése, bővítése vagy módosítása a Tesztszerkesztőben soha többé nem változtathatja meg a korábban megírt dolgozatok KRÉTA jegyeit és százalékait az archívumban.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Socrative PDF megoldókulcs és kiértékelő szinkronizáció (37. pont):**
  - **Fájlok:** [`src/services/socrativePdfParser.js`](file:///d:/dev/Röpdolgozat%20program/src/services/socrativePdfParser.js), [`src/services/grader.js`](file:///d:/dev/Röpdolgozat%20program/src/services/grader.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js)
  - A PDF-ből kinyert feleletválasztós (ABCD) és igaz/hamis (TF) kérdések helyes válaszaként a megoldás tényleges szövege kerül mentésre a betűjel helyett.
  - A `grader.js` kétirányú kompatibilitási ellenőrzést kapott: a betűjeles megoldókulcsot és az opció szövegét automatikusan megfelelteti, TF esetén pedig az `'a'` (Igaz) és `'b'` (Hamis) aliasokat is támogatja.
  - A `sessionRepo.submitAnswer` átadja a kérdés opciólistáját a pontozónak a hibátlan illesztéshez.

* **Időkorlát lejárati mentés visszagördülésének elhárítása (14. pont):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js)
  - A határidő-ellenőrzés a válaszmentő tranzakción kívül fut le: lejáratkor az `is_finished = 1` és `finished_at` tartósan rögzül az adatbázisban a válaszelutasítás mellett, megelőzve a tranzakciós rollback hibát.

* **Tanári léptetés mód ideiglenes letiltása (15. pont):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html)
  - Az Új dolgozat indítása modális ablakban a nem támogatott `TEACHER_PACED` opció rejtésre és letiltásra került (`disabled`), kizárva a téves indítást.

* **Socket.IO tanári mátrix adatszivárgás elszigetelése (01. pont):**
  - **Fájlok:** [`src/sockets/liveHandler.js`](file:///d:/dev/Röpdolgozat%20program/src/sockets/liveHandler.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - Elkülönített szobák: a tanár és a kivetítő a `session_${id}_teacher`, a diákok a `session_${id}_student` szobához csatlakoznak.
  - A `matrix:updated` és `participant:focus_lost` események szigorúan csak a tanári szobába kerülnek kiküldésre, a diákok semmilyen bizalmas adatot nem kapnak a hálózaton.

* **Történeti jegyvédelem tesztszerkesztés után (25. pont):**
  - **Fájlok:** [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js)
  - Új `sessions.max_points REAL DEFAULT NULL` mező automatikus adatbázis-migrációval.
  - Dolgozat indításakor és befejezésekor a rendszer rögzíti az aktuális maximális pontszámot. Az archívum, a mátrix és az exportok ezt veszik alapul, így a tesztek utólagos szerkesztése nem módosítja a korábbi jegyeket.

* **Automatikus regressziós tesztcsomag:**
  - **Fájlok:** [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js), [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json)
  - Új célzott rendszerteszt a fenti pontok igazolására, integrálva az `npm test` tesztcsomagba (5/5 zöld tesztmodul).

---

## [1.22.0] – 2026-11-20

### Tesztek egyesítése (Merge) funkció a Tesztszerkesztőben, nem-destruktív kérdésmásolás ütközésmentes áthelyezéssel és összegző modális ablakkal, valamint tanári fejléc logó kezdőképernyő-navigáció

Kiemelt tanári kényelmi és tananyag-szervezési kiadás: a Tesztszerkesztő felületen megjelent a tesztek egyesítése („Merge”) lehetősége. A pedagógus két tetszőleges korábbi dolgozatból (például félévi vagy év végi összefoglalókhoz, témazárókhoz) egyetlen gombnyomással egy új, harmadik feladatsort hozhat létre. Az egyesítés teljesen nem-destruktív (az eredeti dolgozatok és feladataik érintetlenek maradnak), az összes kérdés (ABCD, TF, SHORT típusok, magyarázatok, instrukciók és pontszámok) folytonos sorszámozással kerül át a célkvízbe. A kérdésekhez csatolt ábrák és diagramok fájlütközésmentes biztonsági prefixeléssel másolódnak át az új teszt médiakönyvtárába. A funkció elérhető közvetlenül a tesztkártyák műveleti gombsorából (zöld `call_merge` gyorsgomb), valamint a szerkesztő fejlécében található **[ 🔀 Tesztek egyesítése ]** eszköztárgombbal. A műveletet támogató Calm modális ablak intelligens évfolyam-csoportosítással (`<optgroup>`), önmagával való egyesítés elleni védelemmel, automatikus címajánlással, célmappa-választással és dinamikus kérdésszám/összpontszám statisztikai összegzővel rendelkezik. A sikeres összevonást követően a rendszer azonnal megnyitja a szerkesztőben a frissen létrejött új dolgozatot. Emellett a tanári fejlécben található Okoskodó logó közvetlen kezdőképernyő-funkciót kapott: a logóra kattintva a felület bármelyik menüpontból azonnal a fő Eredménytábla fül tiszta, „Jelenleg nincs folyamatban lévő dolgozat” kezdőállapotára vált az **[ Új dolgozat indítása ]** gombbal.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Tesztek egyesítése (Merge) funkció és nem-destruktív kérdésmásolás:**
  - **Fájlok:** [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`scratch/test_merge_quizzes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_merge_quizzes.js)
  - Új `mergeQuizzes(quizId1, quizId2, options)` és `copyMergedQuizImages(sourceQuizIds, newQuizId)` adatbázis-szintű metódusok tranzakcióbiztos, ütközésmentes kérdés- és képmásolással.
  - Új `POST /api/admin/quizzes/merge` REST végpont szigorú tanári jogosultság-ellenőrzéssel, bemeneti validációval és hibaág-kezeléssel.
  - Új felületi Calm modális ablak (`#modal-merge-quizzes`) forrásteszt-választókkal, célmappa-kiválasztással, időkorláttal és dinamikus összegző dobozzal (`#merge-quiz-summary-box`), amely mutatja a leendő összpontszámot és a kérdések számát.
  - Új gyorsgomb minden tesztkártyán (`.quiz-btn-merge`, zöld kiemelés, `call_merge` ikon), amely előre kiválasztja az adott kvízt 1. kiindulási tesztként.
  - Új eszköztárgomb a Tesztszerkesztő fejlécében (`#btn-merge-quizzes`).
  - Automatikus navigáció: az új dolgozat létrehozása után az admin felület azonnal megnyitja azt a szerkesztőben.
  - Automatikus rendszerteszt (`scratch/test_merge_quizzes.js`), integrálva az `npm test` tesztcsomagba.

* **Tanári fejléc logó kezdőképernyő-navigáció („Nincs folyamatban lévő dolgozat”):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A felső fejlécben az Okoskodó márkalogó (`#admin-logo-link`) közvetlen eseménykezelőt kapott: kattintásra az adminisztrációs felület bármely fülről (pl. Tesztszerkesztő, Beállítások, Korábbi dolgozatok) azonnal az Eredménytábla fülre ugrik (`switchTab('tab-live')`).
  - A nézet visszaáll a letisztult „Jelenleg nincs folyamatban lévő dolgozat” kezdőállapotra (`showNoSessionView()`), a csatornakijelölés megszűnik a felső jelvénysávban, miközben az aktív dolgozatok továbbra is elérhetők maradnak a fejlécben.
  - A logó diszkrét hover átmenetet és pointer egérkurzort kapott.

---

## [1.21.0] – 2026-11-19

### Diákösszegző képernyő tágas kétoszlopos Calm Learner elrendezése, kördiagram tisztítása és pontszám kiemelése a körből, kattintható kérdésenkénti helyes válasz popover kitakarásmentes megjelenítéssel, valamint Új dolgozat indítása évfolyamszűrés és véletlenszerű válaszsorrend beállítás

Átfogó diákfelületi élményjavító és tantermi ergonómiai kiadás: a diákok dolgozat végi összegző képernyője tágas, kétoszlopos elrendezést kapott (`max-width: min(1500px, 96vw);`), amely megegyezik a kérdéskitöltő nézet kényelmes, levegős szélességével. A bal oldali oszlopban helyet kapott a személyre szabott megnyugtató fejléc, az érdemjegy, a kitöltési idő, valamint a letisztult SVG kördiagram. A kördiagramból kikerült a korábban a körívre ráúszó pontszám, így a kör közepén kizárólag a domináns, szellős százalékos érték szerepel, míg az elért pontszám egy kiemelt, meleg narancssárga chipként jelenik meg a kitöltési idő mellett. A jobb oldali kérdésáttekintő oszlopban a hibás vagy részpontos kérdések szövegének végén megjelent egy közvetlen, kattintható zöld segítség gomb (`?` ikon), amelyre kattintva egy elegáns, felfelé nyíló buborékban (popover) megtekinthető a helyes válasz és az opcionális tanári magyarázat. A felugró ablak garantáltan a kérdéscím felett helyezkedik el, így a tanuló által leadott `Válaszod: ...` sor 100%-ban látható marad a közvetlen összehasonlításhoz. A szerveroldali biztonság garantálja, hogy a megoldások szigorúan csak a dolgozat befejezése után jutnak el a klienshez. Emellett az Új dolgozat indítása modális ablakban intelligens, kétirányú évfolyamszűrés és csoportosított tesztválasztó (`<optgroup>`) segíti az azonos című feladatsorok megkülönböztetését, a Beállításokban pedig megjelent a „Véletlenszerű válaszsorrend diákokként” csúszka (`shuffle_options`), amely indításkor alapértelmezetten bekapcsolt állapotú.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Diákösszegző felület kétoszlopos tágas elrendezése és kördiagram tisztítása:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A dolgozat végi Calm Learner értékelő felület (`#summary-container`) a kérdéskitöltő képernyővel azonos méretű, tágas kétoszlopos elrendezést kapott (`grid-template-columns: 1fr 1fr; gap: 24px; max-width: min(1500px, 96vw);`).
  - A kördiagramban (`#summary-percent-val`) kizárólag a nagy százalékos szám kapott helyet (`1.95rem`), megszüntetve a feliratok körívbe lógását.
  - Az elért pontszám (`#final-score`, pl. `21.5 / 24 pont`) lekerült a körből az alsó sávba a kitöltési idő mellé egy önálló, figyelemfelhívó meleg narancssárga kártyaként (`.calm-summary-score-row`, `#fff7ed` háttér, finom narancs keret, csillag ikon), így nem szürke és azonnal felhívja a tanuló figyelmét.
  - Az érdemjegy doboza (`.calm-summary-col-grade`) a tartalomhoz igazodó szélességet és megnövelt betűméretet (`5.2rem` Hero szám és `1.85rem` szöveges minősítés) kapott.

* **Kattintható ? ikon és felugró helyes válasz popover a kérdésáttekintésben:**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A kérdések tételes áttekintésénél a hibás vagy részpontos kérdések esetén a kérdés szövegének végén, közvetlenül az utolsó szó után egy zöld, kattintható segítség gomb (`.calm-summary-help-btn`, `?` ikon) jelenik meg.
  - Kattintásra egy felfelé nyíló popover ablakban (`.calm-summary-tooltip-popover`) megjelenik a formázott helyes válasz és az opcionális magyarázat.
  - Kitakarásmentes és levágásmentes lebegő portál (Floating UI Portal): a popover a `<body>` közvetlen gyermekeként kapott helyet (`#summary-portal-popover`), így a görgethető lista `overflow: auto/hidden` szabályai soha nem vágják le a fejlécét. A pozicionálás pixelpontosan a megkattintott `?` gomb felett történik (`top: btnRect.top - popHeight - 8px`), így a `Válaszod: ...` sor 100%-ban látható marad, a kérdéslista görgetésekor vagy külső kattintásra pedig a popover automatikusan bezáródik.
  - Kattintásvezérelt működés: az ablak nem tűnik el véletlen egérmozdulatra, külső kattintásra pedig automatikusan bezáródik.
  - Puskázásgátló védelem: a `GET /api/student/session-data` végpont a helyes válaszokat szigorúan csak a dolgozat befejezése után adja át a tanuló kliensének.

* **Új dolgozat indítása évfolyamszűrés és véletlenszerű válaszsorrend beállítás:**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Az Új dolgozat modalban a tesztválasztó `<optgroup>` csoportosítást és évfolyamcímkét kapott az azonos című tesztek megkülönböztetésére, valamint kétirányú intelligens szinkronizációt az évfolyam beviteli mezővel.
  - A Beállítások felületen megjelent a „Véletlenszerű válaszsorrend diákokként” csúszka (`shuffle_options`), amely az Új dolgozat modalban alapértelmezetten aktív.

---

## [1.20.0] – 2026-11-19

### Socrative PDF közvetlen tesztimportálás beágyazott ábrákkal és megoldókulccsal, kérdésenkénti többsoros instrukciók és kétoszlopos szerkesztőkártya, modális ablakok kijelölésvédelme (satírozáskor történő bezáródás elhárítása), valamint a tesztkörnyezeti képtár elszigetelése

Jelentős funkcióbővítő és tanári ergonómiai kiadás: a Tesztszerkesztőben közvetlen Socrative PDF importáló funkció valósult meg, amely a letöltött feladatsorokból automatikusan kinyeri a kérdések szövegét, a feleletválasztós (ABCD) és igaz/hamis opciókat, a helyes megoldásokat, valamint a beágyazott képeket és ábrákat. A kérdésszerkesztő felületen megjelent a kérdésenként opcionálisan megadható „További instrukciók a kérdéshez” többsoros szövegmező (Enter sortörésekkel és intelligens típusspecifikus sablonokkal), a kérdéskártya pedig helytakarékos, ergonomikus kétoszlopos elrendezést kapott az instrukciók és a képcsatoló zóna számára. A felületen megszűnt a modális ablakok véletlen bezáródása szövegkijelölés („satírozás”) közben, miután a háttérkattintásos bezárás mostantól szigorúan ellenőrzi az egérlenyomás (`mousedown`) kiindulási pontját is. Ezenfelül a tesztfuttatások feltöltési könyvtára teljes elszigetelést kapott, így a tesztek futtatása nem veszélyezteti az éles képtárat.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Socrative PDF tesztimportáló modul:**
  - **Fájlok:** [`src/services/socrativePdfParser.js`](file:///d:/dev/Röpdolgozat%20program/src/services/socrativePdfParser.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`scratch/test_socrative_import.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_socrative_import.js)
  - Új `socrativePdfParser` szolgáltatás: a Socrative rendszerből exportált PDF fájlok bináris adatfolyamából és szövegfolyamából kinyeri a kvíz címét, a feladatok sorszámát és szövegét, az opciókat (ABCD, Igaz/Hamis), a zöld pipával megjelölt helyes válaszokat, valamint a kérdésekhez illesztett ábrákat (FlateDecode/DCTDecode képfolyamok felismerése és kimentése).
  - Új `POST /api/admin/quizzes/import-socrative-pdf` végpont Multer memóriapuffereléssel.
  - Új felületi gomb a Tesztszerkesztő fejlécében (**[ 📄 PDF importálása ]**) és hozzá tartozó modális ablak (`#modal-import-quiz-pdf`) tantárgy, célmappa, évfolyam és időkorlát kiválasztásával, folyamatjelzővel és automatikus szerkesztő-megnyitással.

* **Kérdésenkénti egyéni instrukciók és kétoszlopos kérdéskártya:**
  - **Fájlok:** [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js), [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Új `instructions TEXT DEFAULT ''` mező a `questions` táblában automatikus adatbázis-migrációval.
  - A kérdéskártyán a képcsatoló zóna nem foglalja el a teljes 100%-os szélességet: helyette modern, 2 oszlopos grid rács (`.q-instruction-image-row`, 1fr és 280px) jött létre, ahol a bal oldalon a többsoros instrukciós szövegmező (`textarea.q-instructions`), a jobb oldalon pedig a kép / Csere / Törlés blokk helyezkedik el.
  - Többsoros szerkesztés: a tanár az **Enter** billentyűvel tetszőleges sortöréseket vihet be (pl. feladatspecifikus szabályok pontokba szedése).
  - Intelligens típusváltás: a kérdéstípus módosításakor a rendszer automatikusan javasolja az új típus alapértelmezett instrukcióját (ABCD: *„Válaszd ki az egyetlen helyes megoldást!”*, TF: *„Döntsd el, hogy az állítás Igaz vagy Hamis!”*, SHORT: *„Írd be a helyes választ a szövegmezőbe!”*), ha a mezőt a tanár még nem szerkesztette egyedileg.
  - Diákfelületi megjelenítés: a kérdéscím alatti `#question-hint-text` elemben megjelenik a megadott formai instrukció a sortörések (`<br>`) és a kódkiemelés (`` `kód` ``) maradéktalan megtartásával.

#### Javítva (Fixed)
* **Modális ablakok kijelölésvédelme (Overlay Drag / Selection Dismissal):**
  - **Fájlok:** [`public/js/utils.js`](file:///d:/dev/Röpdolgozat%20program/public/js/utils.js)
  - Elhárítva a hiba, amely miatt a modális ablakok (pl. az *Új dolgozat indítása* ablak) váratlanul bezáródtak, amikor a tanár egy beviteli mezőben (pl. évfolyam) egérrel szöveget jelölt ki („satírozott”), és az egérkurzort a kijelölés során kihúzta a külső sötétített háttérre (`.modal-backdrop`).
  - A `window.addEventListener('mousedown')` segítségével a rendszer mostantól rögzíti az egérlenyomás kiinduló célpontját (`modalMouseDownTarget`), és a kattintásos bezárást kizárólag akkor engedélyezi, ha a lenyomás ÉS a felengedés is közvetlenül a háttéren történt.

* **Tesztkörnyezeti képtár elszigetelése:**
  - **Fájlok:** [`config.js`](file:///d:/dev/Röpdolgozat%20program/config.js), [`scratch/test_full_system.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_full_system.js), [`scratch/test_report12_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report12_fixes.js)
  - A tesztfuttató környezet a `process.env.UPLOADS_DIR` változóval külön ideiglenes könyvtárra (`data/uploads_test`) lett irányítva, megakadályozva, hogy az automatizált tesztek érintsék az éles `data/uploads/` könyvtár állományait.

---

## [1.19.0] – 2026-11-19

### Teljes rendszermentés visszaállítása (Restore) SQLite integritás-ellenőrzéssel és hot-reload mechanizmussal, Beállítások és mentés fül megújítása, 5-fokozatú értékelési határok és Calm Learner színskála harmonizáció, Eredménytáblai Anonim mód gyorskapcsoló, központi kérdéskeverés, tanári munkaállomás felismerése (?gep=tanar), valamint a mentési méretrobbanás elhárítása és modális megerősítés

Jelentős rendszerbiztonsági és tantermi ergonómiai kiadás: a tanári felületen megvalósult a teljes rendszermentések közvetlen visszatöltése (Restore) ZIP vagy `.okoskodobackup` fájlból automatikus SQLite integritás-ellenőrzéssel (`PRAGMA integrity_check`), vészhelyzeti `.bak` pillanatkép-készítéssel és futásidejű adatbázis Hot-Reload kapcsolattal. A Beállítások és mentés menüpont teljes felújításon esett át a Calm Learner dizájn szerint: a korábbi 1040 px-es korlát eltávolításával a felület teljes szélességében (1400 px) terül el, a KRÉTA 5-fokozatú értékelési határai szabadon testreszabhatók, színeik pedig maradéktalanul harmonizálva lettek a diákfelületi élő érdemjegy chippel. Az Élő Eredménytábla (mátrix) fejlécében megjelent egy egykattintásos Anonim mód gyorskapcsoló a tanulói nevek azonnali elrejtésére és felfedésére, a kérdéskeverés központilag vezérelhetővé vált, az azonnali diák-visszajelzés pedig opcionálisan letiltható a dolgozat végéig. Megvalósult a tanári munkaállomás automatikus azonosítása (`?gep=tanar`), amely intelligens átirányítással vagy automatikus PIN-bekéréssel gyorsítja a tanári belépést, és megszünteti a téves diákfeliratot. Emellett felszámolásra került a biztonsági mentések végtelen rekurzív méretrobbanása (~4.46 MB-ra normalizálva), az alapértelmezések visszaállítása pedig natív böngészős felugró helyett elegáns Calm Learner modális megerősítést kapott.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Teljes rendszermentés visszaállítása (System Backup Restore):**
  - **Fájlok:** [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Új `restoreSystemBackup(zipFilePath)` funkció: kicsomagolás platformfüggetlenül (`bsdtar` vagy PowerShell `Expand-Archive`), a benne lévő `ropdolgozat.db` kötelező integritás-ellenőrzése (`PRAGMA integrity_check`) az élesítés előtt.
  - Vészhelyzeti védelem: az éles adatbázisról automatikus pillanatkép készül (`ropdolgozat.db.bak`).
  - Adatbázis Hot-Reload: `src/db/init.js` Database példánya transzparens ES6 Proxy burkolást kapott (`__close` és `__reopen` metódusokkal), így az adatbázis- és képcsere a futó szerver újraindítása nélkül valósul meg.
  - Új `POST /api/admin/restore` végpont max. 500 MB-os csomagméretig Multer kezeléssel.
  - Megerősítő modális ablak (`#modal-confirm-restore`): a fájl kiválasztásakor megjelenik a fájlnév, a formázott méret és a figyelmeztetés; jóváhagyáskor töltésjelzővel indul a visszaállítás, majd automatikus oldalfrissítés történik.

* **Beállítások és mentés fül teljes felújítása és perzisztens tárolás:**
  - **Fájlok:** [`src/db/settingsRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/settingsRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Új `system_settings` SQLite tábla az értékelési határok és tantermi beállítások perzisztens megőrzésére (`GET /api/admin/settings`, `POST /api/admin/settings`, `POST /api/admin/settings/reset`).
  - A `.settings-container` felületéről törlésre került a mesterséges `max-width: 1040px` korlát, így 100%-os szélességgel, tökéletesen konzisztensen illeszkedik a tanári portál többi menüpontjához.
  - Alsó műveleti sáv: **[ ↺ Alapértelmezések visszaállítása ]** és **[ 💾 Beállítások mentése ]** azonnali validációval és visszajelző Toast értesítéssel.

* **Értékelési határok és Calm Learner színskála harmonizáció:**
  - **Fájlok:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A tanári beállítások 5-fokozatú határérték-csempéi és a diákoldali fejléc kapszula (`.quiz-metric-score.grade-*`) azonos Calm Learner színeket kaptak:
    - 5 (Jeles): Smaragdzöld (`#dcfce7` háttér, `#14532d` szöveg, `#16a34a` jelvény)
    - 4 (Jó): Türkiz / Teal (`#e0f2f1` háttér, `#00695c` szöveg, `#0d9488` jelvény)
    - 3 (Közepes): Meleg borostyánsárga (`#fef3c7` háttér, `#92400e` szöveg, `#d97706` jelvény)
    - 2 (Elégséges): Nyugodt, diszkrét szürke (`#f1f5f9` háttér, `#475569` szöveg, `#64748b` jelvény) – *a diákoldalon is megszüntetve a zavaró narancssárga kiemelést!*
    - 1 (Elégtelen): Lágy pasztell piros (`#fce8e6` háttér, `#991b1b` szöveg, `#dc2626` jelvény)
  - Szigorú kliens- és szerveroldali sorrend-ellenőrzés: `0 < 2 < 3 < 4 < 5 <= 100`.
  - Az új dolgozat indításakor a `sessionRepo.startSession()` automatikusan az elmentett egyéni ponthatárokat alkalmazza a jegyek számításához.

* **Anonim mód és Eredménytáblai gyorskapcsoló:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A korábbi megtévesztő „Projektor mód” elnevezés helyett tisztán **„Anonim mód”** került bevezetésre, amely a Beállításokban alapértelmezetten aktív (BE).
  - Az Élő Eredménytábla fejlécében (`matrixHeadRow`, `Tanuló neve` oszlop) megjelent a `.matrix-anon-wrap` csúszka szem ikonnal (`visibility_off`):
    - Bekapcsolt állapotban a nevek helyett `PC-X tanulója` vagy `1. diák`, `2. diák` maszk jelenik meg a táblán kivetítéskor.
    - A tanár egyetlen kattintással bármikor átbillentheti a csúszkát, felfedve a diákok valódi nevét.
    - A csúszka induló állapota a központi beállításból töltődik be.

* **Központi kérdéskeverés és azonnali visszajelzés-szabályozás:**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A Beállításokban a **Véletlenszerű kérdéssorrend diákokként** alapértelmezetten BE van kapcsolva, így az *Új dolgozat indítása* ablakban a „Kérdések keverése” jelölőnégyzet alapból bepipálva indul.
  - Az **Azonnali diák-visszajelzés tiltása a dolgozat végéig** opció bekapcsolásakor a diák az Ellenőrzés gomb megnyomásakor nem látja a helyes válasz zöld/piros kiemelését és a tanári magyarázatot (a szerver `submitAnswer` végpontja biztonsági okból nem küldi ki a megoldást), hanem közvetlenül a következő feladatra lép, és csak a teszt végleges beadásakor kap értékelést.
  - A szoftverben eleve nem létező hangkeltés miatt a felesleges **Csendes vizsgamód kapcsoló véglegesen eltávolításra került**.

* **Tanári munkaállomás felismerése (`?gep=tanar`) és dinamikus gépazonosító jelvény a diák belépőfelületen:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`telepítés.md`](file:///d:/dev/Röpdolgozat%20program/telepítés.md)
  - Megvalósult a tanári munkaállomás kényelmi és egyértelmű azonosítása a `?gep=tanar` (vagy `?gep=tanari`) URL paraméter segítségével.
  - A tanári gép asztali parancsikonjára kattintva a fejléc jobb felső részében automatikusan megjelenik a `🖥️ Tanári munkaállomás` jelvény, megszüntetve a korábbi megtévesztő „Diák munkaállomás” feliratot.
  - Automatikus belépési folyamat: ha a tanár korábban már bejelentkezett (24 órán belül érvényes hitelesítő süti), a felület azonnal átirányítja az `/admin` vezérlőpultra; ha még nincs bejelentkezve, azonnal megnyitja a Tanári belépés modális ablakot és a fókuszt a PIN-kód beviteli mezőre állítja.
  - A tanulói munkaállomásokon (`?gep=1..42`) a gép száma (`🖥️ X. gép`) mostantól már a bejelentkező kártya feletti fejlécben is látható, megkönnyítve a tantermi felügyeletet.
  - A rendszer dokumentációja (`telepítés.md`) kiegészült a tanári munkaállomás közvetlen asztali parancsikonjának beállításával.

#### Javítva (Fixed)
* **Biztonsági mentés rekurzív méretrobbanásának (9.5+ GB) és önmagába csomagolásának elhárítása:**
  - **Fájlok:** [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - A korábbi implementáció a teljes `data/uploads/` mappát rekurzívan csomagolta be a ZIP mentésbe. Amennyiben a mentési vagy feltöltési folyamat során a `data/uploads/temp/` könyvtárba egy ZIP fájl íródott (vagy korábbi mentés maradt ott), az `archiver` saját magát kezdte el a végtelen ciklusban becsomagolni, ami 9.5–30 GB-os méretrobbanást és letöltési lefagyást okozott egyetlen teszt esetén is.
  - A javítás során a `createSystemBackupStream()` szigorításra került: a csomagoló kizárólag a véglegesített kvízképek almappáját (`data/uploads/quizzes/`) és a `ropdolgozat.db` adatbázisfájlt fűzi be az archívumba.
  - A visszaállítási célú Multer átmeneti fájlfeltöltő az operációs rendszer független `os.tmpdir()` ideiglenes könyvtárába került, így teljesen függetlenné vált az alkalmazás adatkönyvtárától. A letöltött ZIP biztonsági mentés mérete a valós, optimális ~4.46 MB-os tartományban stabilizálódott.

* **Alapértelmezések visszaállítása böngészős alert/confirm helyett Calm Learner modális ablakkal:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A *„Beállítások és mentés”* menüpontban az *„Alapértelmezések visszaállítása”* gomb megnyomásakor korábban felugró idegen natív böngészős megerősítő ablak (`window.confirm()`) megszüntetésre került.
  - Helyére egy az alkalmazás stílusvilágával 100%-ban harmonizáló, új Calm Learner modális ablak (`#modal-confirm-reset-settings`) készült kerekített ikonjelvénnyel, amely részletesen és tételesen felsorolja a tanárnak a visszaállítandó gyári alapértékeket (KRÉTA határok: 90%, 75%, 55%, 30%; Anonim mód: BE; Kérdések keverése: BE; Azonnali visszajelzés tiltása: KI), kiküszöbölve a véletlen vagy nem szándékos visszaállításokat.

---

## [1.18.0] – 2026-11-19

### Kérdésekhez csatolható ábrák és képek feltöltése a Tesztszerkesztőben, kvízenkénti almappák és automatikus szemétgyűjtés, valamint diákfelületi kétkártyás elrendezés és beépített Lightbox képnagyító modál

Jelentős pedagógiai és vizuális funkcióbővítés: a Tesztszerkesztőben minden kérdéshez opcionális ábra vagy kép csatolható (PNG, JPG, WebP, SVG formátumban), azonnali előnézeti bélyegképpel, képcsere és képtörlés lehetőséggel. A feltöltött képek a fájlrendszeren szigorúan kvízenkénti elkülönített almappákban (`data/uploads/quizzes/quiz-{quiz_id}/`) tárolódnak, a korábban elárvult vagy kicserélt felesleges fájlokat pedig beépített szemétgyűjtő mechanizmus (`cleanQuizOrphanImages`) azonnal és véglegesen letakarítja a merevlemezről. A tanulói tesztkitöltési felületen az ábrás kérdések teljes méretű kétkártyás elrendezést kaptak: a kérdéskártya megőrzi megszokott tágas szélességét, a bal oldalán egy ugyanolyan méretű önálló kártyában jelenik meg a kép, felettük a haladási sávval, kattintásra pedig beépített Lightbox nagyító modál nyílik meg.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Kérdéshez csatolható ábrák és képek a Tesztszerkesztőben:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A kérdésszerkesztő kártyákon megjelent a `.q-image-section` képcsatoló zóna: egy kattintással indítható fájlválasztó (max. 5 MB szerveroldali limit, ajánlott max. 2 MB felirat), azonnali aszinkron feltöltés a szerverre (`POST /api/admin/upload-image`), bélyegkép előnézet, fájlnév megjelenítés, valamint egykattintásos **Csere** és **Törlés** vezérlők.
  - A kvíz mentésekor (`saveQuiz`) a kérdéshez tartozó kép relatív elérési útvonala automatikusan elmentésre kerül az adatbázisban.

* **Kvízenkénti struktúrált képtárolás és automatikus szemétgyűjtés (Garbage Collection):**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js)
  - A Multer feltöltés közvetlenül a kvíz saját almappájába ment (`data/uploads/quizzes/quiz-{quizId}/`), vagy még el nem mentett új tesztnél a `data/uploads/quizzes/temp/` átmeneti mappába.
  - A teszt mentésekor (`createQuiz`, `updateQuiz`) a `finalizeQuizTempImages()` függvény automatikusan átköltözteti az átmeneti vagy gyökérben lévő fájlokat a kvíz végleges almappájába, és frissíti a kérdések `image_path` hivatkozását.
  - A `cleanQuizOrphanImages()` funkció mentéskor megvizsgálja a kvíz mappájának tartalmát, és azokat a képeket, amelyeket a tanár időközben kicserélt vagy törölt (árva fájlok), automatikusan törli a lemezről, megelőzve a képek felhalmozódását.
  - Kvíz másolásakor (`duplicateQuiz`) a `copyQuizImages()` átmásolja a képeket az új kvíz almappájába és frissíti az adatbázist, kvíz törlésekor (`deleteQuiz`) pedig a `removeQuizImages()` felszámolja a kapcsolódó képmappát.

* **Diákfelületi teljes méretű kétkártyás elrendezés (Two-Card Split Layout):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Ábrás kérdés esetén a diákfelület munkaterülete kiterjed (`max-width: min(1500px, 96vw)`):
    - A jobb oldali kérdéskártya (`.quiz-main-card`) maradéktalanul megőrzi eredeti, megszokott kényelmes szélességét (~700 px) és a válaszlehetőségek szellős elrendezését.
    - A bal oldalon egy ugyanilyen önálló fehér kártya (`.quiz-image-card`) jelenik meg, benne a kérdés ábrájával és jobb alsó „Nagyítás” gyorsgombbal.
    - Felettük a haladási és állapotjelző sáv (`quiz-progress-header`) végigfut a teljes szélességben.
    - Kép nélküli kérdéseknél a felület automatikusan a jól bevált egyoszlopos 760 px-es nézetben marad.
    - 1024 px szélesség alatt a két kártya automatikusan egymás alá rendeződik.

* **Beépített Lightbox képnagyító modál:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A kérdés ábrájára vagy a Nagyítás gombra kattintva megnyílik a `#modal-image-lightbox` ablak, amely teljes méretben jeleníti meg az ábrát a részletek (térképek, kapcsolási rajzok, diagramok) vizsgálatához.
  - A nagyító bezárható az X gombbal, a háttérre kattintva, illetve a billentyűzet `Escape` gombjával.

---

## [1.17.0] – 2026-11-18

### Diákfelületi beágyazott élő érdemjegy és százalék kapszula érdemjegyhez igazodó Calm színskálával, teljes körű gomb- és dobozmodell-konzisztencia, elmozdulásmentes interakciók és egységes modális ablakok

Tantermi ergonómiai és vizuális konzisztenciát biztosító kiadás: a tanulói tesztkitöltési felület élő metrikája kompakt beágyazott kapszulát kapott, amelyben az érdemjegy szöveges minősítése helyett tiszta számmal jelenik meg, közvetlenül mellette pedig a százalékérték a tanuló érdemjegyéhez dinamikusan igazodó lágy pasztell színt vesz fel (a 90–100%-os sávban a helyes válasz hivatalos világoszöldjével). Az egész alkalmazás felületén megszüntetésre került az összes felesleges és inkonzisztens narancssárga neon `box-shadow` árnyék, a hover alatti ugrálás (`translateY`) és a kattintáskori torzítás (`scale`), valamint teljes mértékben egységesítésre kerültek az adminisztrációs eszköztár gombjai és a dolgozatindítási, lezárási modális párbeszédpanelek.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Beágyazott élő metrika kapszula a diákfelületen:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A korábbi két különálló chip helyett a százalékos érték (`.quiz-metric-score`) közvetlenül a szürke érdemjegy kapszula (`.quiz-metric-grade`) belsejébe költözött az érdemjegy száma mellé.
  - Az érdemjegy kiírásából törlésre került a felesleges szöveges minősítés (pl. `(elégséges)`), kizárólag a számérték jelenik meg (`Érdemjegy: 2`, kitöltés előtt `Érdemjegy: –`).

* **Dinamikus, Calm pasztell színskála a százalékos kapszulán:**
  - **Fájlok:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A százalékértéket mutató al-kapszula háttérszíne és szövegszíne a tanuló aktuális érdemjegyének megfelelően lágy pasztell átmenettel változik:
    - **Kezdéskor (0 megválaszolt kérdés):** semleges szürke (`#e2e8f0` háttér, `#475569` szöveg és ikon), megelőzve a tanulói szorongást az 1. kérdés megnyitásakor.
    - **5-ös (90–100%):** hivatalos helyes válasz zöld háttér (`var(--success-bg, #dcfce7)`) mély erdőzöld szöveggel (`#14532d`).
    - **4-es (75–89%):** lágy mentazöld (`#e0f2f1` háttér, `#00695c` tengerzöld szöveg).
    - **3-as (55–74%):** lágy borostyánsárga (`#fef3c7` háttér, `#92400e` sötétbarna szöveg).
    - **2-es (30–54%):** lágy barackos tónus (`#ffedd5` háttér, `#9a3412` terrakotta szöveg).
    - **1-es (0–29%):** finom púder-rózsás háttér (`#fce8e6` háttér, `#a51d24` mályvás-bordó szöveg – nem riasztó, nem agresszív piros).

#### Javítva (Fixed)
* **Diákfelületi narancssárga gombok árnyékmentesítése és egységesítése:**
  - **Fájlok:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A tanulói felület narancssárga gombjairól (`.quiz-btn-submit`, `.quiz-btn-next-compact`, `.quiz-btn-next`, `.calm-summary-btn-finish`, `.calm-btn-primary`) maradéktalanul eltávolításra került a korábbi harsány narancssárga neon `box-shadow` és a hover alatti árnyéknövekedés. Helyükre a rendszer egységes, diszkrét `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);` stílusa került.
  - Az aktív kattintási állapotból törlésre került a méretváltoztató `scale(0.98)`, helyette elmozdulásmentes `opacity: 0.92;` biztosítja a visszacsatolást.

* **Adminisztrációs eszköztár és modális ablakok stílusharmonizációja:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Az adminisztrációs felületen a korábbi *„Újabb indítása”* gomb neve hivatalosan **`Új dolgozat indítása`** lett, pixelpontosan azonos dobozmodellt és stílust kapva (`height: 42px; padding: 0 18px; font-size: 0.92rem; font-weight: 700; border-radius: 10px`).
  - Az eszköztár összes gombja (`.admin-toolbar-btn-secondary`, `.admin-empty-btn-start`, `.admin-toolbar-btn-danger`, `.admin-toolbar-btn-race`) egységes 42px magasságot és 20px ikont kapott.
  - A dolgozatindítási (`#modal-start-session`) és dolgozatbefejezési (`#modal-confirm-finish`) modális ablakok felülete egységesült: modern, kerek ikonjelvény (rakéta és hivatalos lakat ikon), jobb felső X bezáró gomb, tiszta gombhierarchia.
  - Megszűnt az összes Y irányú lebegés és elmozdulás (`translateY`) a gombokon, a Tesztszerkesztő mappakártyáin (`.folder-card`) és dolgozatkártyáin (`.quiz-card`).

---

## [1.16.0] – 2026-11-18

### Hivatalos osztálynévsorok KRÉTA import/exportja, vízszintes osztályválasztó és 2 oszlopos számozott nézet, lezárt dolgozatok archívum-függetlensége (`ON DELETE SET NULL`) és a diákfelület gombkonzisztenciája

Jelentős stabilitási, adatkezelési és tantermi felületi kiadás: megvalósult a hivatalos osztálynévsorok 1-kattintásos KRÉTA kompatibilis (.xlsx) exportja és importja, drag & drop feltöltéssel és részletes beépített útmutatóval. Az osztálynévsorok kezelőfelülete ergonomikus, nulla görgetéses vízszintes osztályválasztó sávot és 2 oszlopos, hivatalos KRÉTA sorszámozású névsort kapott, elrejtve a Digitális kultúrát még nem tanuló 1–2. évfolyamokat. Az adatbázis sémában a résztvevők hivatkozása `ON DELETE SET NULL` szabályt kapott, megszüntetve a lezárt dolgozatok névsorkötöttségét és feloldva a `FOREIGN KEY constraint failed` törlési akadályt. A diákfelületen a tesztkitöltés „Következő” és „Ellenőrzés” gombjai pixelpontosan megegyező méretet és ugrásmentes igazítást kaptak, az `init.js` indulási kódjából pedig véglegesen törlésre került a fiktív diákok automatikus újragenerálása.

#### Hozzáadva és megújítva (Added and Redesigned)
* **KRÉTA kompatibilis osztálynévsor export és import:**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`src/db/rosterRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/rosterRepo.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - `GET /api/admin/roster/export`: 1-kattintásos letöltés `.xlsx` fájlformátumban (A oszlop = Név, G oszlop = Osztály).
  - `POST /api/admin/roster/import`: Drag & Drop fájlfeltöltő modális ablak beépített KRÉTA útmutatóval, szigorúan az A oszlopot (tanuló neve) és G oszlopot (osztály) feldolgozva.
  - Az importálás tranzakcióban szinkronizálja az adott osztályok névsorát a KRÉTA fájl tartalmával.

* **Vízszintes osztályválasztó és 2 oszlopos számozott névsor:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Az osztályok a felület tetején vízszintes gombokként (`.roster-class-chip`) jelennek meg évfolyam-elválasztókkal (`.roster-grade-separator`), görgetés nélkül elérhetővé téve mind a 18 osztályt.
  - A tanulók névsora alapértelmezetten egy 2 oszlopos, számozott rácsban (`01.`, `02.` ...) tekinthető át a magyar ábécé szabályai (`localeCompare('hu')`) szerint.
  - A *„Szöveges szerkesztés”* gombbal bármikor megnyitható a vágólapos többsoros beillesztő mező, mentés után azonnal visszaváltva a számozott nézetre.

* **1–2. évfolyam intelligens elrejtése:**
  - **Fájlok:** [`src/db/rosterRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/rosterRepo.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A Digitális kultúra tantárgy 3. osztályos indulásához igazodva a rendszer automatikusan elrejti az 1–2. évfolyamos osztályokat mind a tanári adminisztrációban, mind a diák belépési legördülőjében.

* **Egységes 10px gombméret és lekerekítés a felületen:**
  - **Fájlok:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A Tesztszerkesztő eszköztár gombjai (*„Új mappa”*, *„Új teszt létrehozása”*), az üres állapot *„Új dolgozat indítása”* gombja és az adminisztrációs gombok megkapták az egységes `10px` (`var(--radius-md)`) lekerekítést és egységes magasságot.

#### Javítva (Fixed)
* **Lezárt dolgozatok archívum-függetlensége és a FOREIGN KEY hiba felszámolása:**
  - **Fájlok:** [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js), [`src/db/rosterRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/rosterRepo.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js)
  - A `participants.student_id` mező idegen kulcs szabálya `ON DELETE RESTRICT`-ről `ON DELETE SET NULL`-ra módosult, a lezárt résztvevőket védő trigger pedig felkészítésre került a törölt tanulók leválasztására.
  - A dolgozat osztálymegjelölése (`sessions.class_name`) lezáráskor közvetlenül beég az archívumba, így a lezárt dolgozatok eredményei, résztvevői és exportjai 100%-ban épek és önállóak maradnak akkor is, ha egy tanuló távozik az iskolából, vagy a tanár törli az osztályt a tiszta újraimportálás előtt.

* **Fiktív diákok automatikus újragenerálásának (seed) végleges törlése:**
  - **Fájlok:** [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js)
  - Törlésre került az a beépített indító kód, amely a szerver újraindulásakor a tanár tudta nélkül automatikusan újragenerálta a kitörölt 3.a és 6.a fiktív diákokat.

* **Tesztkitöltési gombok konzisztenciája és ugrásmentes elrendezése a diákfelületen:**
  - **Fájlok:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A teszt kitöltése közben megjelenő „Következő” gomb (`.quiz-btn-next-compact`) pixelpontosan megegyezik az „Ellenőrzés” gomb méreteivel (`height: 52px; min-width: 170px; padding: 0 28px; font-size: 1.2rem; border-radius: 10px`).
  - A visszajelző sáv transzparens, 0 paddingű konténerré alakult, így a „Következő” gomb közvetlenül a jobb szélre illeszkedik: megszűnt a korábbi 16px-es vízszintes és 10px-es függőleges ugrás az Ellenőrzés gombhoz képest.
  - A bal oldali visszajelző szövegről eltávolításra került a nem kívánt háttérszínezés és keret, így a státusz közvetlenül és tisztán jelenik meg.

---

## [1.15.0] – 2026-11-18

### Eredménytábla és Korábbi dolgozatok Calm Learner kártyás megújítása, valós KRÉTA osztályátlag, diszkrét gombszínek és tantermi morzsamenü navigáció

Átfogó tanári felület- és vizuális élményfejlesztési (Calm Learner UX) kiadás: a korábbi dolgozatok archívuma modern, szellős és szűrhető kártyás felületté alakult a Calm Learner designrendszer alapján. A kártyákon a nyers pontátlag helyett a valós KRÉTA érdemjegy-átlag és százalék (pl. *Átlag: 4.2 (84%)*) jelenik meg a tanulók valós osztálymegjelölésével. Az Eredménytábla fejlécében megszűnt a duplikált feliratozás az egységes lakat ikonos lezárás-kapszula javára. A veszélyes műveletek (dolgozattörlés, osztálytörlés) és a mentési funkciók finom pasztell hátterű, modern vizuális stílust és egységes Material ikonokat kaptak, az Osztálynévsorok felületén pedig dedikált morzsamenü navigáció és biztonsági modális jóváhagyás támogatja a tanári munkát.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Korábbi dolgozatok modern Calm Learner kártyás megjelenítése és osztályszűrő:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js)
  - A korábbi zsúfolt táblázat helyett tiszta, szellős kártyás elrendezés valósult meg a hivatalos Calm Learner terv alapján.
  - A kártyákon áttekinthető hierarchiában látható a dolgozat címe, a tantárgy, az indítás időpontja, a kitöltő diákok száma, az osztály megnevezése és az osztályátlag.
  - Dedikált keresőmező és dinamikus osztályválasztó legördülő lista segíti az archív dolgozatok közötti azonnali szűrést.
  - A korábbi különálló exportgombok helyett egyetlen, letisztult *„Exportálás”* gomb nyitja meg a meglévő modális letöltőközpontot (Excel, PDF, HTML, ZIP).

* **Valós KRÉTA osztályátlag, százalék és valós osztálymegnevezés:**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A kártyákon a korábbi nyers összpontszám-átlag helyett a dolgozat kérdéseinek maximális összpontszáma és a diákok leadott válaszai alapján a hivatalos KRÉTA ponthatárok szerinti osztályátlag és átlagos százalék jelenik meg (pl. *Átlag: 4.2 (84%)*), teljes összhangban a mátrix felületén látható KPI mutatókkal.
  - Az adatbázis-lekérdezésben a dolgozat osztályának megnevezése a résztvevő diákok osztályából automatikusan feloldásra kerül, így megszűnt a téves *„Egyéni/Nincs osztály”* felirat.

* **Finomhangolt pasztell gombszínek (`.btn-soft-danger` és `.btn-soft-success`) és egységes Material ikonok:**
  - **Fájlok:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Bevezetésre került az eredménytábla `0p` / `1 (elégtelen)` és `+ 1p` / `5 (jeles)` celláival harmonizáló enyhe hátterű, finom szegélyű gombstílus (`!important` nélkül).
  - A korábbi dolgozatok kártyáin a *„Törlés”* gomb, valamint a Hivatalos osztálynévsorok felületen az *„Osztály törlése”* gomb megkapta a diszkrét piros figyelmeztető stílust és a törlés ikont (`delete`).
  - A *„Névsor mentése”* gomb elavult emoji helyett hivatalos mentés ikont (`save`) és diszkrét zöld stílust (`.btn-soft-success`) kapott.

* **Hivatalos osztálynévsorok morzsamenü (Breadcrumbs) és modális törlés-megerősítés:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A Beállítások és mentés menüpontból elérhető Hivatalos osztálynévsorok felület dedikált morzsamenüt kapott (*Beállítások és biztonsági mentés > Hivatalos osztálynévsorok*), amellyel a tanár egyetlen kattintással visszatérhet az előző nézetbe.
  - Az osztályok törlésekor a böngészős natív alert/confirm ablak helyett az alkalmazás többi részével harmonizáló, elegáns modális jóváhagyó ablak jelenik meg.

#### Javítva (Fixed)
* **Kártyák lebegési (hover) simítása és szöveghullámzás megszüntetése:**
  - **Fájlok:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A kártyák fölé vitt egérkurzor esetén korábban tapasztalt minimális elmozdulás és szöveghomályosodás megszűnt: a függőleges transzformációs ugrás törlésre került, kizárólag a szegély és az árnyék vált finom átmenettel.

* **Eredménytábla fejléc duplikációjának felszámolása és egységes lezárás-jelvény:**
  - **Fájlok:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A dolgozat címe mögül törlésre került a felesleges `[LEZÁRT ARCHÍVUM]` felirat.
  - Az Eredménytábla fejlécében a lezárt dolgozatoknál mostantól a Korábbi dolgozatok kártyáin is használt diszkrét szürke, lakat ikonos kapszula (`🔒 Lezárva`) jelenik meg.

* **Felső menüpontok elnevezésének egységesítése:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html)
  - A felső menüsávban az *„Élő felügyelet (mátrix)”* felirat letisztult *„Eredménytábla”* névre, a *„Reports / Korábbi dolgozatok”* menüpont pedig *„Korábbi dolgozatok”* névre egyszerűsödött.

* **Projektverzió és gyorsítótár-érvénytelenítés (Cache-Busting):**
  - **Fájlok:** [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json), [`project-context.md`](file:///d:/dev/Röpdolgozat%20program/project-context.md), [`README.md`](file:///d:/dev/Röpdolgozat%20program/README.md), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/projector.html`](file:///d:/dev/Röpdolgozat%20program/public/projector.html)
  - A projektverzió egységesen `v1.15.0`-ra frissült.
  - Minden HTML felületen frissültek a stíluslapok és szkriptek cache-busting paraméterei (`?v=1.15.0`), garantálva, hogy a tanári gép és a 42 db tanulói kliensgép böngészője azonnal, beragadt gyorsítótár nélkül a legfrissebb CSS-t és JS-t töltse be.

---

## [1.14.0] – 2026-11-18

### Tesztszerkesztő hierarchikus mapparendszere, tesztáthelyezés, több helyes válasz (szinonimák), aktív dolgozat export központja, egységes export fejlécek és felületi letisztítás

Átfogó tanórai szervezési és kiértékelési kiadás: a Tesztszerkesztőben korlátlan mélységű, hierarchikus mapparendszer valósult meg morzsamenü navigációval és tesztáthelyezési lehetőséggel. A rövid szöveges válaszoknál bevezetésre került a több elfogadott helyes megoldás (szinonimák, alternatívák) toleráns gépi kiértékeléssel. A dolgozatindítás automatikusan betölti az előre megadott időkorlátot. A dolgozat exportálása közvetlenül az aktív munkamenet fejlécébe költözött kényelmes modális letöltőközponttal, a generált formátumok (KRÉTA Excel, interaktív HTML, egyéni ZIP értékelőlapok és nyomtatható A4 PDF) pedig egységes, reprezentatív fejlécet kaptak beágyazott Okoskodó logóval. A felesleges magyarázatsorok, pontszám-feliratok és reklámszövegek maradéktalanul törlésre kerültek mind a tanulói képernyőről, mind az exportokból.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Tesztszerkesztő hierarchikus mapparendszer és morzsamenü navigáció:**
  - **Fájlok:** [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js), [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - **Fastruktúra és korlátlan mélység:** A Tesztszerkesztő felületén megvalósult a hierarchikus mappakezelés (`quiz_folders` adatbázistábla és `quizzes.folder_id` idegen kulcs), így a tanár évfolyamok, témakörök vagy tantárgyak szerint rendszerezheti feladatsorait.
  - **Azonnali, helyi (in-place) mappalétrehozás:** Az eszköztárban elhelyezett *„Új mappa”* gombra kattintva a lista elején megjelenik egy szerkeszthető mappakártya beviteli mezővel és Létrehozás/Mégse gombokkal (Enter billentyűre is mentve).
  - **Morzsamenü (Breadcrumbs) és visszalépés:** A mappák közötti tájékozódást kattintható morzsamenü (*📁 Főmappa > 📁 6. évfolyam > 📁 Hálózatok*) és egyetlen kattintásos *„Szülőmappa”* visszalépő gomb segíti.
  - **Helyi mappaátnevezés és adatbiztonsági törlés:** A mappák a kártyájukon elhelyezett ceruza ikonnal közvetlenül in-place átnevezhetők. Mappa törlése esetén az adatbiztonsági garancia értelmében a mappában lévő tesztek és almappák nem vesznek el, hanem automatikusan felmozgatásra kerülnek a szülő mappába.
  - **Mappatámogatás a szerkesztőben és az indítóban:** A tesztszerkesztő űrlapon hierarchikus legördülő mezőben választható ki a célmappa, az adott mappában létrehozott új teszt alapértelmezetten abba a mappába kerül, az új dolgozat indításakor pedig a választólista a mappa nevét is feltünteti.

* **Teszt áthelyezése mappák között (4. kártyaikon és modális ablak):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A tesztkártyákon megjelent a 4. akciógomb (*📁 Áthelyezés mappába*). A gomb megnyomásakor a program minden alkalommal frissen lekéri a szerverről a teljes mappastruktúrát, majd egy dedikált modális ablakban felkínálja a célmappa kiválasztását (beleértve a Főmappát is), és egyetlen kattintással áthelyezi a tesztet.

* **Rövid válaszos kérdéseknél több elfogadott helyes válasz (szinonimák, alternatívák):**
  - **Fájlok:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`src/services/grader.js`](file:///d:/dev/Röpdolgozat%20program/src/services/grader.js), [`src/services/exporter.js`](file:///d:/dev/Röpdolgozat%20program/src/services/exporter.js)
  - **Dinamikus alternatívalista a Tesztszerkesztőben:** A rövid válasz (SHORT) típusú kérdéseknél a tanár tetszőleges számú elfogadott megoldást rögzíthet a *„További elfogadott válasz (szinonima) hozzáadása”* gombbal (pl. 1. *Internet Protocol*, 2. *IP*, 3. *IP-cím*).
  - **Intelligens, toleráns értékelés:** Bármelyik megadott változatot gépeli be a tanuló (kis- és nagybetűkre vagy felesleges szóközökre érzéketlenül), a rendszer azonnal teljes pontszámmal elfogadja azt.
  - **Kultúrált visszajelzés:** Hibás válasz esetén a tanuló képernyőjén és a tanulói értékelőlapokon az elfogadott lehetőségek természetes magyar kötőszóval jelennek meg (pl. *Internet Protocol vagy IP vagy IP-cím*).

* **Export menüpont áthelyezése közvetlenül az aktív dolgozat fejlécébe és letöltési modál:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A felső navigációs fejlécből (`admin-nav-tabs`) kikerült a különálló *„Export (.xlsx, .pdf, .html)”* fül, mivel a tanórai exportálás logikailag mindig a futó vagy megnyitott dolgozathoz kapcsolódik.
  - Az élő mátrix felső gombsorába (`admin-toolbar-actions`) bekerült egy kényelmes, azonnal elérhető *„Export”* gomb (`btn-live-export`), amely egy elegáns modális ablakban kínálja fel az aktív dolgozat Excel (.xlsx), nyomtatható A4 PDF, offline HTML mátrix és ZIP csomag formátumú letöltését.

* **Egységes fejléc és Okoskodó logó beágyazása minden exportált formátumban (.xlsx, .html, .zip, .pdf):**
  - **Fájlok:** [`src/services/exporter.js`](file:///d:/dev/Röpdolgozat%20program/src/services/exporter.js), [`public/print-report.html`](file:///d:/dev/Röpdolgozat%20program/public/print-report.html)
  - A PDF nyomtatási sablon elegáns megjelenéséhez igazodva mind a KRÉTA Excel (.xlsx), mind az interaktív offline csoportos HTML mátrix, mind pedig az egyéni ZIP értékelőlapok azonos, reprezentatív fejlécet kaptak.
  - **Okoskodó logó beágyazása:** Az Excel munkalap tetejére natívan beágyazásra került a hivatalos logó képe, a HTML fájlokban pedig offline Base64 adat-URL formájában jelenik meg, így hálózati kapcsolat nélkül is bárhol hibátlanul renderelődik.
  - **Egységes adathierarchia:** A bal oldalon a logó mellett a teszt címe, tantárgya és évfolyama, a jobb oldalon pedig a résztvevők létszáma, a tanuló neve, a gép száma és az aktuális dátum látható minden formátumban.

#### Javítva (Fixed)
* **Időkorlát automatikus betöltése az új dolgozat indításakor:**
  - **Fájlok:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A teszt indításakor felugró *„Új dolgozat indítása”* modális ablakban a kiválasztott feladatsor alapján automatikusan és dinamikusan beíródik a Tesztszerkesztőben előre meghatározott időkorlát (perc) az *„Egyéni időkorlát”* mezőbe (`quizzes.default_time_limit_min`), így a tanárnak nem szükséges azt manuálisan minden alkalommal begépelnie.

* **Tanulói visszajelző sáv letisztítása a (+1pont) felirattól:**
  - **Fájlok:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A *„Következő”* gomb mellett helyes válasz leadásakor megjelenő zöld pipás feliratból törlésre került a felesleges `(+1pont)` szövegezés, így a tanuló képernyőjén diszkrét, tiszta *„Helyes válasz!”* üzenet jelenik meg.

* **Kérdésszöveg címke letisztítása és kódkiemelés súgó tooltip ikon:**
  - **Fájlok:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A kérdéskártyákon a zavaró zárójeles felirat helyett letisztult *„Kérdés szövege:”* címke jelent meg.
  - A címke mellett egy finom kérdőjel ikon (`help`) kapott helyet, amely fölé víve az egeret egyértelmű súgóbuborék (tooltip) mutatja be a kód-, képlet- és billentyűparancs-kiemelés (visszahajló idézőjel: \`kód\`) használatát.

* **Visszajelző sáv duplikációjának felszámolása és Magyarázat mező elrejtése:**
  - **Fájlok:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Megszűnt az a jelenség, hogy a tanulói felület alsó sávjában a helyes megoldás kétszer jelent meg egymás alatt.
  - A Tesztszerkesztőben az opcionális *„Magyarázat”* beviteli mező elrejtésre került (`display: none`), megőrizve a struktúrát a későbbi esetleges visszakapcsoláshoz.
  - A tanulói felületen a visszajelző sáv kizárólag a letisztult, pontos helyes választ (`Helyes megoldás: [érték]`) jeleníti meg a *„Következő”* gomb mellett, megszüntetve a felesleges redundanciát.

* **Magyarázat (explanation) elrejtése a nyomtatási és ZIP exportokból is:**
  - **Fájlok:** [`public/print-report.html`](file:///d:/dev/Röpdolgozat%20program/public/print-report.html), [`src/services/exporter.js`](file:///d:/dev/Röpdolgozat%20program/src/services/exporter.js)
  - A Tesztszerkesztőhöz és a tanulói képernyőhöz hasonlóan a nyomtatható A4 PDF jelentésből és az egyéni ZIP értékelőlapokból is maradéktalanul eltávolításra került a felesleges *„Magyarázat:”* sor, helyette hibás válasznál kizárólag a hivatalos helyes megoldás jelenik meg természetes magyar kötőszóval formázva.

* **Nyomtatható A4 PDF export letisztítása a felesleges reklámszövegtől és kerettől:**
  - **Fájlok:** [`public/print-report.html`](file:///d:/dev/Röpdolgozat%20program/public/print-report.html), [`public/css/print.css`](file:///d:/dev/Röpdolgozat%20program/public/css/print.css)
  - Törlésre került a PDF első oldalán korábban megjelenő felesleges *„Nyomtatásra és PDF mentésre kész, Minden diák értékelőlapja...”* keretes szövegezés.
  - Az inline stílusok helyett tiszta CSS osztályok (`.print-toolbar.no-print`) kerültek bevezetésre, garantálva, hogy a PDF mentésben és a papírnyomtatásban a vezérlősáv és a gombok maradéktalanul rejtettek legyenek, így a PDF dokumentum azonnal a hivatalos tanulói értékelőlappal indul.

* **Projektverzió és kliensoldali gyorsítótár-frissítés (Cache-Busting):**
  - **Fájlok:** [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json), [`project-context.md`](file:///d:/dev/Röpdolgozat%20program/project-context.md), [`README.md`](file:///d:/dev/Röpdolgozat%20program/README.md), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/projector.html`](file:///d:/dev/Röpdolgozat%20program/public/projector.html)
  - A projektverzió egységesen `v1.14.0`-ra frissült.
  - Minden HTML felületen frissültek a stíluslapok és szkriptek cache-busting paraméterei (`?v=1.14.0`), garantálva, hogy a tanári gép és a 42 db tanulói kliensgép böngészője azonnal, beragadt gyorsítótár nélkül a legfrissebb CSS-t és JS-t töltse be.

---

## [1.13.0] – 2026-11-13

### Diákoldali Igaz–Hamis letisztítás, Mátrix nézet és eszköztár pixelpontos stabilizálása, összecsukható KPI mutatók, Tesztszerkesztő relációbiztos mentése és magyar helyesírási revízió

Átfogó diákoldali, tanári és adatintegritási stabilitási kiadás: az alsó tagozatos (3. osztályos) tanulók számára letisztultak az Igaz–Hamis kérdéskártyák a zavaró feliratoktól. A Tesztszerkesztő mentése relációbiztossá vált (in-place Smart Sync), megszüntetve az SQLite FOREIGN KEY hibákat. A tanári Mátrix nézetben végérvényesen megszűnt a táblázat és az eszköztár ugrálása a fix cellageometriának és az egységes 24 px-es státuszkapszuláknak köszönhetően. A 4 KPI mutatókártya összecsukhatóvá vált egyetlen kattintással a felső eszköztárból, a működési módok egységes magyar elnevezést kaptak, a rendszer felületei pedig teljes körű revízión estek át az MTA 12. kiadásának helyesírási szabályai szerint.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Tesztszerkesztő Socrative-stílusú számozott helyes válasz kizöldítés és mentési validáció:**
  - **Fájlok:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - **Redundancia és elgépelés felszámolása:** A korábbi, felesleges dupla munkát és elgépelési kockázatot hordozó *„Helyes válasz pontos értéke”* kézi másolómező maradéktalanul megszűnt.
  - **Számozott helyes válasz kizöldítés (ABCD):** A 4 válaszopció előtt 1, 2, 3, 4 számozású kör található. A tanár a helyes válasz számára kattintva zöldre váltja a kört (fehér pipával), a hozzá tartozó mező pedig diszkrét zöld kiemelést kap. A kizöldített opció értéke automatikusan a helyes válasz lesz.
  - **Igaz / Hamis (TF) egykattintásos kizöldítés:** Szöveges beírás helyett két tiszta gomb (*IGAZ* és *HAMIS*) jelenik meg, amelyekre rákattintva az adott állítás zölddé válik.
  - **Mentési integritás-validáció:** A rendszer határozottan blokkolja a feladatsor mentését és figyelmeztetést jelenít meg, ha bármelyik kérdésnél nincs megjelölve helyes válasz, ha a kijelölt opció mezője üres, vagy ha nincs legalább 2 kitöltött válaszlehetőség.

* **Tesztszerkesztő in-line kérdésbeszúrás, típusválasztó modál és Drag & Drop átrendezés:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - **In-line lebegő beszúró sáv:** Megszűnt a sok kérdés esetén fellépő kényelmetlen le- és felgörgetési kényszer: a kérdések között az egérmutató odavitelére megjelenik egy finom elválasztó vonal és egy kör alakú `+` gomb, amely pontosan az adott kérdések közé szúrja be az új feladatot. A feladatsor legelejére is egyetlen kattintással beszúrható új kérdés.
  - **Kérdéstípus-választó modális ablak:** A `+` jelre kattintva egy barátságos, tiszta modális ablak jelenik meg, ahol 3 nagy kártyával (Feleletválasztós, Igaz / Hamis, Rövid válasz) választható ki a kívánt kérdéstípus, és a kártya előre felparaméterezve közvetlenül a kívánt helyre illeszkedik be.
  - **Húzással történő átrendezés (Drag & Drop):** Minden kérdéskártya fejlécében 6 pontos fogantyú (`drag_indicator`) található, amellyel a kérdések sorrendje szabadon, valós időben átrendezhető 100% offline natív HTML5 eseményekkel.
  - **Azonnali automatikus újrasorszámozás:** Bármilyen átrendezés, beszúrás vagy törlés után a kérdések fejléce (`1. kérdés`, `2. kérdés`...) azonnal és hibátlanul frissül.

* **Diákoldali Igaz–Hamis (TF) gombok letisztítása az általános iskolai 3–8. osztály számára:**
  - **Fájlok:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html)
  - A harmadikos kisdiákokat megzavaró felesleges feliratok (A/B betűjelvények, „VÁLASZLEHETŐSÉG” címkék, rádiógomb-ikonok, like/dislike hüvelykujjak és a másodlagos „Az állítás igaz/hamis” leírások) maradéktalanul eltávolításra kerültek.
  - Helyüket két nagy méretű, tiszta, középre zárt és modern gombkártya vette át, kizárólag a lényeggel: **IGAZ** és **HAMIS**. Kiválasztáskor a kártya elegáns narancssárga kiemelést és finom árnyékot kap.

#### Javítva (Fixed)

* **Háttérgörgetés blokkolása és görgetési láncolás (Scroll Chaining) elleni védelem modális ablakoknál:**
  - **Fájlok:** [`public/js/utils.js`](file:///d:/dev/Röpdolgozat%20program/public/js/utils.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Megszűnt az a zavaró jelenség, hogy felugró modális ablakok (pl. az új kérdés típusválasztója, kérdésrészletező vagy megerősítő párbeszédpanelek) alatt az egérrel a háttérben elhelyezkedő fő tartalom görgethető maradt.
  - Bármely modális ablak megnyitásakor a háttér azonnal és automatikusan zárolja a görgetést (`.modal-open`, `overflow: hidden;`), a modálok bezáródásakor pedig feloldja azt.
  - A modális kártyák megkapták a modern `overscroll-behavior: contain;` védelmet is, amely garantálja, hogy a modál belsejében történő görgetés nem csap át a mögöttes tartalomra. A korábban beállított `scrollbar-gutter: stable;` révén a görgetősáv zárolásakor az oldal egyetlen képpontot sem mozdul el oldalirányba.

* **Diákoldali válasz-kiértékelés megújítása (közvetlen csempeszínezés és semleges, két soros visszajelző sáv):**
  - **Fájlok:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html)
  - **Közvetlen csempeszínezés:** Válaszbeküldéskor hibás válasz esetén a tanuló által megjelölt válaszcsempe halvány pirosas hátteret és diszkrét piros keretet kap (`.tile-wrong`, feleletválasztónál piros X ikonnal a rádiógombban), a helyes megoldás csempéje pedig egyidejűleg zöld kiemelést kap (`.tile-correct`, zöld pipa ikonnal). Helyes válasz esetén a megjelölt csempe zöld kiemelést kap. Rövid szöveges válasznál a beviteli mező színesedik a helyességnek megfelelően (`.input-correct`, `.input-wrong`).
  - **Semleges és rendezett alsó sáv:** A *„Következő”* gomb sora megszűnt harsányan elszíneződni; semleges, világos háttérszínt és szürke keretet kapott.
  - **Két soros szövegtördelés:** A helyes megoldás szövege és az esetleges tanári magyarázat rugalmasan két sorba tördelődik, így hosszabb válaszok esetén sem fedi el a *„Következő”* gombot, és nem lóg ki a képernyőről.

* **Tesztszerkesztő relációbiztos mentése (FOREIGN KEY hiba megszűntetése):**
  - **Fájlok:** [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js)
  - Megszűnt a tesztek szerkesztésekor és a *„Feladatsor mentése”* gomb megnyomásakor jelentkező `Mentési hiba: FOREIGN KEY constraint failed` hiba.
  - A korábbi primitív `DELETE FROM questions WHERE quiz_id = ?` helyett intelligens in-place szinkronizáció (Smart Sync / Upsert) valósult meg: a meglévő kérdések `UPDATE`-tel frissülnek (az azonosítójuk nem változik, a válaszok relációi épek maradnak), az új kérdések `INSERT`-tel kerülnek be, a korábban megválaszolt kérdések pedig nem sérülnek.
* **MTA 12. kiadása szerinti kis kezdőbetűsítés (Title Case felszámolása):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/projector.html`](file:///d:/dev/Röpdolgozat%20program/public/projector.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Megszüntetésre került az idegen hatású, angolos nagy kezdőbetűs írásmód (Title Case) a gombokon és menüfeliratokon.
  - Szabályos magyar alakok léptek érvénybe: *„Feladatsor mentése”* (a hibás *„Feladatsor Mentése”* helyett), *„Névsor mentése”*, *„Új teszt létrehozása”*, *„Új dolgozat indítása”*, *„Tanári bejelentkezés”*, *„Hivatalos osztálynévsorok”*, *„Új osztály rögzítése”*, *„Dolgozat címe”*, *„Export- és kiértékelési központ”*, *„Teljes egyéni értékelőlap-csomag (.zip)”*, *„Űrhajós csapatverseny”*, *„Space Race verseny”*, *„Anonim statisztika”*, *„Kérdésenkénti eredményesség (anonim)”*.
* **Projektverzió és kliensoldali gyorsítótár-frissítés (Cache-Busting):**
  - **Fájlok:** [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json), [`project-context.md`](file:///d:/dev/Röpdolgozat%20program/project-context.md), [`README.md`](file:///d:/dev/Röpdolgozat%20program/README.md), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/projector.html`](file:///d:/dev/Röpdolgozat%20program/public/projector.html)
  - A projektverzió egységesen `v1.13.0`-ra frissült.
  - Minden HTML felületen frissültek a stíluslapok és szkriptek cache-busting paraméterei (`?v=1.13.0`), garantálva, hogy a tanári gép és a 42 db tanulói kliensgép böngészője azonnal, beragadt gyorsítótár nélkül a legfrissebb CSS-t és JS-t töltse be.
* **Felesleges „Szerkeszthető” jelvény eltávolítása a tesztkártyákról:**
  - **Fájl:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A Tesztszerkesztő felületén a tesztkártyák fejlécéből eltávolításra került a redundáns zöld pötty és a „Szerkeszthető” státuszjelvény, mivel a dinamikus feladattárban minden feladatsor alapértelmezetten és korlátozás nélkül szabadon szerkeszthető.
* **Navigációs fül ikon- és szövegrögzítése (`admin.js`):**
  - **Fájlok:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html)
  - Megszűnt az a rejtett hiba, amely futásidőben dinamikusan felülírta a fejléc navigációs fülét: a JavaScript többé nem semmisíti meg a gomb belső HTML szerkezetét a hibás `📊 Élő Dolgozat (Mátrix)` emojira és Title Case szövegre.
  - A gomb mostantól stabilan megőrzi a terv szerinti Google Material Symbols `grid_view` rácsikont és a szabályos kis kezdőbetűs *„Élő felügyelet (mátrix)”* feliratot.
* **Mátrix érdemjegy oszlop stabilitása és kisbetűsítése:**
  - **Fájlok:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Megszűnt az érdemjegy módosulásakor (pl. 3-ról 2-re) jelentkező zavaró táblázatugrálás: a Jegy oszlop (`.col-grade`, fix `130px`) és a jegykapszula (`.admin-grade-badge`, fix `110px`) stabil méretezést kapott, így a hosszabb és rövidebb jegyek hajszálpontosan ugyanakkora helyet foglalnak el.
  - Az érdemjegyek szövege az MTA 12. kiadása szerint kisbetűs lett: *„5 (jeles)”*, *„4 (jó)”*, *„3 (közepes)”*, *„2 (elégséges)”*, *„1 (elégtelen)”*.
  - A táblázat összes metaadat-oszlopa (`.col-pc`, `.col-points`, `.col-pct`, `.col-grade`, `.col-focus`, `.col-actions`) dedikált osztályokat kapott, teljesen megszüntetve a táblázat ugrálását.
* **Mátrix kérdéscellák és pontszámfeliratok teljes ugrásmentesítése (`- 0.5p`):**
  - **Fájlok:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A kérdésoszlopok fejléce (`th.matrix-q-col`) és adatcellái (`td.col-question`) szigorúan fix `66px` szélességet kaptak, a bennük lévő jelvények (`.matrix-cell`) pedig egységes `58px` szélességet.
  - Ezzel végérvényesen megszűnt az oszlopok és sorok meglódulása / ugrálása tanári pontszám-felülbíráláskor: mindegy, hogy a cella üres (`–`), helyes (`1p`), hibás (`0p`) vagy részpontos (`- 0.5p`), a cella és az oszlop szélessége hajszálpontosan állandó marad.
* **Tanulói név előtti felesleges monogram-korong eltávolítása:**
  - **Fájl:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Törlésre került a Mátrix nézetben a tanulók neve elől a nem kívánt kezdőbetűs színes kör (`.admin-student-avatar`), így a tanulók neve tisztán és áttekinthetően olvasható.
* **Jelmagyarázat Narancs és Szürke kártyáinak vizuális harmonizálása:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A Narancs kártya megkapta a `- 0.5p` cellával harmonizáló narancssárga hátteret (`.bg-warning-soft`, `#fef3c7`), narancssárga keretet (`#fde68a`), narancssárga körben mínusz jel ikont (`remove_circle`) és a szabályos *„Részpont / felülbírálás”* alcímet.
  - A Szürke kártyán megszűnt a sima kör ikon (`radio_button_unchecked`) zavaró pirosas árnyalata: tiszta szürke színt (`#64748b`), tiszta szürke hátteret (`#f8fafc`) és szürke keretet (`#e2e8f0`) kapott.
* **Mátrix nézet fejlécének és kérdés-tooltipjeinek finomhangolása:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A Mátrix táblázat név oszlopából törlésre került a felesleges *„& státusz”* toldalék, így a fejléc tisztán *„Tanuló neve”* felirattal jelenik meg.
  - Az *„Összpont”* oszlopfelirat helyére a tömörebb, lényegretörő *„Pont”* került.
  - A kérdésszámok fölé víve az egeret (hover) a korábbi általános segédszöveg helyett közvetlenül a feltett kérdés teljes szövege jelenik meg felugró buborékként (tooltip).
* **Munkamenet státuszkapszulák pixelpontos magasságegyezése (`.admin-session-toolbar`):**
  - **Fájlok:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Megszűnt az eszköztár ugrálása és az alatta lévő metaadatsor lejjebb tolódása, amikor a tanár egy lezárt archív dolgozat és az élő dolgozat között váltogat.
  - A *„Lezárt dolgozat”* szürke kapszula (`.admin-session-finished-pill`) és a *„Kitöltés folyamatban”* zöld kapszula (`.admin-session-badge`) egységesen fix `24px` magasságot, `0.75rem` betűméretet és `0 12px` belső margót kapott.
* **Működési módok magyarítása a tanári és kivetítő felületeken:**
  - **Fájlok:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/js/projector.js`](file:///d:/dev/Röpdolgozat%20program/public/js/projector.js)
  - A korábbi nyers adatbázis-azonosítók helyett (pl. `Mód: STUDENT_PACED`) a felületek egységes, szabályos magyar feliratokkal jelenítik meg a működési módot: *„Diák-tempó”*, *„Űrhajós csapatverseny”*, *„Tanári léptetés”*.
* **Összecsukható KPI mutatók és egykattintásos gyorsgomb (`#btn-toggle-kpi`):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A tanári munkamenet-eszköztárban helyet kapott a *„KPI mutatók”* váltógomb, amellyel a 4 kompakt kártya (*Osztályátlag, Leadott dolgozatok, Legnehezebb feladat, Legjobb feladat*) egyetlen kattintással elrejthető vagy megjeleníthető.
  - Alapértelmezetten a kártyák rejtve vannak, így a Mátrix táblázat közvetlenül az eszköztár alatt kezdődik, rengeteg függőleges helyet felszabadítva a tanár számára; a tanár által választott nézetet a rendszer `localStorage`-ban megjegyzi.
* **Görgetősáv miatti oldalugrálás megszüntetése (Scrollbar Shift védelem):**
  - **Fájl:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A gyökér (`html`) elem megkapta a modern CSS3 `scrollbar-gutter: stable;` szabályát, amely folyamatosan fenntartja a helyet a függőleges görgetősáv számára. Ezzel teljesen megszűnt a tartalom oldalirányú rántása / ugrálása, amikor a tanár a hosszú névsoros Mátrix és a rövidebb fülek (pl. Reports, Kvízek) között váltogat.

---

## [1.12.0] – 2026-11-12

### Szabad és dinamikus Tesztszerkesztő, archívum-tisztítás, 1400 px-es fejléckompozíció, ikonos gombrendszer és univerzális Calm Learner modális ablakok

Átfogó adminisztrációs és tanári felületfrissítés: a korábbi merev kvíz-zárolási mechanizmus feloldásra került, a Tesztszerkesztő valódi, dinamikus feladattárrá vált. A `Reports / Korábbi dolgozatok` archívuma törlési képességet kapott a próba- és rontott dolgozatok eltávolítására. A fejléc elrendezése teljes szélességében igazodott a fő tartalom 1400 px-es rácsához, a navigációs fülek balra zártak. A tesztkártyák kompakt, egy sorban maradó ikongombokat kaptak (kellemes kék szerkesztéssel), a natív böngészős popupokat pedig egységes Calm Learner modális ablakok váltották fel.

#### Hozzáadva és megújítva (Added and Redesigned)
* **1400 px-es fejléc- és navigáció-igazítás:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A fejléc külső konténere (`.admin-header-clean`) önálló blokk-elemmé vált, megszüntetve a flex child miatti összehúzódást.
  - A fejléc belső konténere (`.admin-header-container`) `max-width: 1400px; width: 100%; margin: 0 auto; padding: 0 16px;` szabályozást kapott.
  - Az Okoskodó logó (`.admin-header-top-row`) és a navigációs fülek sora (`.admin-nav-tabs`) pixelre pontosan ott kezdődik a bal oldalon, ahol az alsó tartalom (`.admin-main-container`), és balra zárt (`justify-content: flex-start;`). A Kilépés gomb a lenti kártyák jobb szélével egy vonalba zár.

* **Szabad és dinamikus Tesztszerkesztő (Feladattár):**
  - **Fájlok:** [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql), [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Törlésre kerültek az automatikus és visszavonhatatlan zárolási triggerek (`trg_auto_lock_quiz_on_session`, `trg_lock_quiz_*`, `trg_lock_question_*`).
  - A meglévő kvízek zárolása feloldásra került, minden feladatsor szabadon szerkeszthető, bővíthető és törölhető.

* **Ikonos, helytakarékos és szintbe hozott tesztkártyák (`.quiz-cards-grid`, `.quiz-card`):**
  - **Fájlok:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A hosszú szöveges gombok helyett letisztult 36×36 px-es ikongombok: Szerkesztés (kellemes Calm kék `#0284c7`), Másolás (szürke `#f1f5f9`) és Törlés (diszkrét piros `#fee2e2`), magyar nyelvű tooltip-pel.
  - A gombok mindössze 124 px-et foglalnak el, így sosem törnek egymás alá.
  - Az alsó gombsor (`.quiz-card-actions`) `margin-top: auto;` igazítást kapott: a különböző címhosszúságú tesztdobozok ellenére a gombok mindig hajszálpontosan egy magasságban, egy egyenes vonalban állnak.

* **Korábbi dolgozatok törlése (`Reports / Korábbi dolgozatok`):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Új `DELETE /api/admin/sessions/:id` végpont a korábbi dolgozatok, próbamérések és szemét rekordok tranzakciós törlésére (`deleteSession`).
  - Új Calm Learner megerősítő modál (`#modal-confirm-delete-session`) a véletlen törlések megelőzésére.

* **Univerzális Calm Learner modális rendszer a böngészős alert/confirm helyett:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Elkészült és bekötésre került az 5 dedikált modális ablak: Dolgozat lezárása (`#modal-confirm-finish`), Név törlése (`#modal-confirm-delete-name`), Gépváltás (`#modal-confirm-seat-change`), Kvíz törlése (`#modal-confirm-delete-quiz`), valamint a Rendszerértesítő modál (`#modal-admin-alert`) a csúnya `alert()` helyett.

* **Mátrix alsó panelek:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A felesleges export doboz helyett megvalósult a terv szerinti 2 oszlopos rács: *Jelmagyarázat és értékelési küszöbök* (színes kártyákkal), valamint az *Értesítési központ* élő szerveridővel.

* **Kérdés részletező modális ablak (`#modal-question-detail`) és számozott Mátrix fejlécek:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js)
  - A korábbi zsúfolt `K1 (1P)`, `K2 (1P)` fejléc helyett kizárólag a letisztult kérdésszám (`1`, `2`, `3`...) jelenik meg interaktív, kiemelhető oszlopfejlécként (`.matrix-q-col`).
  - A kérdésszámra kattintva Calm Learner modális ablak nyílik meg a feltett kérdés formázott szövegével, ábrájával, a válaszopciókkal és a zöld pipával kiemelt helyes megoldással, valamint a tanulói válaszok összesített táblázatával és statisztikájával.
  - Eseménydelegáció (`matrixHeadRow.onclick`) garantálja a golyóálló működést újrarenderelés után is.

* **Lezárt dolgozatok végleges és megváltoztathatatlan pontszám-védelme:**
  - **Fájlok:** [`DATABASE_SCHEMA.sql`](file:///d:/dev/Röpdolgozat%20program/DATABASE_SCHEMA.sql), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A tanári felülbírálás (pl. elgépelés vagy rövid szöveges válasz méltányossági pontozása) kizárólag a folyamatban lévő, aktív dolgozat ideje alatt engedélyezett.
  - A tanár általi lezárás (`status = 'FINISHED'`) pillanatában a pontszámok és jegyek véglegesen megváltoztathatatlanná válnak:
    1. A kliensoldali Mátrixban a cellák zárolt állapotba kerülnek (`.cell-locked`, `pointer-events: none;`, kattintási eseménykezelő nélkül).
    2. A szerveroldali `overrideAnswer` azonnal hibát dob lezárt munkamenet esetén.
    3. Adatbázisszintű integritási trigger (`trg_prevent_answer_update_when_session_finished`) védi az adatokat a közvetlen SQL módosításokkal szemben is.

* **Dupla „Dolgozat lezárva” jelvénykapszula megszüntetése:**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A redundáns `#badge-session-finished` elem eltávolításra került a munkamenet eszköztárból; a dolgozat állapota egységesen, mindig pontosan egyetlen jelvénnyel (`#session-badge-channel`) jelenik meg (aktívnál zöld *„Kitöltés folyamatban”*, lezártnál piros *„⏹️ Dolgozat lezárva”*).

#### Javítva (Fixed)
* **Gépváltás gomb folyamatos láthatósága:** A gomb lezárt diák esetén sem tűnik el a DOM-ból, hanem diszkréten tiltott (`disabled`) állapotba kerül, megelőzve az ugráló felületet.
* **Éles adatbázis kitakarítása és tesztizoláció:** A 104 db automatikusan felhalmozódott tesztkvíz eltávolításra került az éles adatbázisból, az `npm test` pedig elkülönített, önmegsemmisítő teszt-adatbázison (`data/ropdolgozat_test.db`) fut.

---

## [1.11.0] – 2026-11-12

### Sík és kártyamentes Calm értékelő felület, érdemjegy-központú 3 oszlopos eredményelrendezés, tételes kérdésáttekintés belső görgetéssel és rögzített alsó műveleti sáv

A diákoldali dolgozat végi értékelő felület átfogó megújítása a bejelentkezési fázis tiszta, sík, dobozmentes dizájnfilozófiája szerint: a korábbi egyszerű befejezési kártya helyett teljes körű, pedagógiailag motiváló és sallangmentes értékelőlap (`#summary-container`) készült. Az eredményblokk az érdemjegyre fókuszáló 3 oszlopos kompozíciót kapott (kiemelt 4.8rem méretű érdemjegy, véletlenszerű pedagógiai idézet a tanuló nevének törésmentes rögzítésével, egysoros szürke hátterű kitöltési idő az új `14p 18mp` formátumban, valamint halványított, visszafogott SVG kördiagram). A kérdések tételes áttekintése fix fejléc mellett kizárólag belső vékony görgetősávval böngészhető a képernyő 100%-os magasságában (`100vh`), miközben a *„Kész, vissza a kezdőlapra”* befejezés gomb stabilan és mindig elérhetően a böngészőablak alján rögzül.

#### Hozzáadva és megújítva (Added and Redesigned)
* **Sík és kártyamentes Calm értékelő felület (`#summary-container`):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A korábbi szürke kártyás doboz (`.calm-card`) helyett a bejelentkezéshez hasonlóan tiszta fehér vászon, dobozok és határoló keretek nélkül (`border: none; background: transparent; padding: 0;`).
  - Eltávolításra kerültek a figyelmet elvonó felső színes kapszulák (a zöld *Dolgozat beküldve* és a *Tantárgy / dátum* jelvények), valamint a „Tudtad?” sárga információs blokk.
  - A fejléc megszólítása őszinte, a tanuló érdemjegyéhez igazodó üzenetet ad (pl. jelesnél *„Remek munka”*, elégségesnél *„Dolgozat leadva”*), miközben a tanuló neve garantáltan egy sorban marad (`.student-name-nowrap`).

* **Érdemjegy-központú 3 oszlopos eredményelrendezés (`.calm-summary-score-layout`):**
  - **1. oszlop (Megszerzett érdemjegy):** Hero méretű (`4.8rem`, `font-weight: 900`) érdemjegyszám a bal szélen, közvetlenül mellette a hivatalos KRÉTA szöveges minősítéssel (pl. `3 (közepes)` duplikációk nélkül).
  - **2. oszlop (Pedagógiai kontextus és kitöltési idő):** A jegyhez illeszkedő bátorító mondat (osztályzatonként 3-3 véletlenszerű pedagógiai variáció), alatta pedig az egysoros, diszkrét szürke hátterű (`#f4f4f5`) kitöltési idő az új `Xp Ymp` (pl. `14p 18mp`) formátumban, a redundáns tempójelzés elhagyásával.
  - **3. oszlop (Halványított kördiagram):** Finom, lágyabb hatású (`opacity: 0.75`), `120px × 120px` méretű SVG kördiagram semleges grafit színű százalékkal és diszkrét pontszámmal, tökéletes vizuális egyensúlyt biztosítva az érdemjegy elnyomása nélkül.

* **Tételes kérdésáttekintés belső görgetéssel (`#summary-questions-section`):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A kérdések fejléce (*„A kérdések áttekintése · X/Y helyes válasz”*) fixen rögzül a helyén, miközben a kérdések listája (`.calm-summary-q-list`) a rendelkezésre álló függőleges teret tölti ki dinamikusan (`flex: 1 1 auto; min-height: 0;`).
  - Belső, vékony diszkrét görgetősáv (`6px`, `scrollbar-width: thin;`), amely meggátolja a teljes oldal elgörgetését, kompakt kérdéskártyákkal (`10px 16px` padding), amelyekből egyszerre 4–5 kérdés is kényelmesen áttekinthető.
  - Tételes kiértékelés: kérdésszám, formázott kérdésszöveg (`formatCode`), a tanuló által leadott válasz és színes státuszjelvény (`Helyes (+X pont)`, `Részpont (+X pont)`, `0 pont`).

* **Rögzített alsó műveleti sáv (`.calm-summary-actions`):**
  - A *„Kész, vissza a kezdőlapra”* műveletgomb (`#btn-restart-student`) fixen a böngészőablak alján kapott helyet (`margin-top: auto;`), így 25 kérdéses teszt esetén sem kell lefelé lapozni a kilépéshez.
  - Mobilos nézetben (`max-width: 640px`) az elrendezés automatikusan kényelmes, függőleges folyamattá alakul.

* **Backend válasz- és időbélyeg-továbbítás:**
  - **Fájl:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - A `/api/student/session-data` végpont kiegészült a résztvevő leadott válaszaival (`answers` lista: `question_id`, `submitted_answer`, `is_correct`, `points_earned`, `eval_status`), valamint a `joined_at` és `finished_at` időadatokkal, biztosítva az értékelőlap azonnali, pontos felépítését.

---

## [1.10.0] – 2026-11-12

### Valós idejű ülésfoglalás és jelenlét-kezelés aktív teszt nélküli névvédelemmel, automatikus névsor-kiszürkítés és barátságos Calm figyelmeztető modál

Új memóriabeli tantermi jelenlét- és ülésfoglalás-kezelő motor (`presenceService`), amely valós időben szinkronizálja a tanulók névválasztását: amint egy diák kiválasztja a nevét az osztály névsorából a diákbelépő felületen, a név az összes többi gépen azonnal inaktívvá és szürkévé válik `(már bejelentkezett)` toldalékkal. A névfoglalás tanári dolgozatindítás nélkül („bármikor”) is működik, visszalépéskor, osztályváltáskor, kapcsolatbontáskor vagy böngészőlap bezárásakor pedig azonnal felszabadul. Ezen felül a tanulói felület összes natív böngészős `alert()` ablaka lecserélésre került a rendszer letisztult, modern Calm stílusú, dinamikus állapotjelvénnyel ellátott modál figyelmeztető párbeszédpanelére (`#modal-alert`).

#### Hozzáadva (Added)
* **Valós idejű ülésfoglalási és jelenléti motor (`presenceService`):**
  - **Fájlok:** [`src/services/presenceService.js`](file:///d:/dev/Röpdolgozat%20program/src/services/presenceService.js), [`src/sockets/liveHandler.js`](file:///d:/dev/Röpdolgozat%20program/src/sockets/liveHandler.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - Memóriabeli aktív ülésfoglalás-kezelés (`socketSeats`), amely a Socket.io kapcsolatokhoz rendeli a kiválasztott tanulókat (`student:claim_name`).
  - Azonnali elutasítás és védelem a párhuzamos névütközések ellen: ha egy tanulót már kiválasztottak egy másik gépen, a rendszer visszautasítja a kérést és tájékoztatja a felhasználót.
  - Automatikus felszabadítás (`student:release_name` és `disconnect`): a tanuló visszalépése, osztályváltása vagy a böngészőlap bezárása / gép kikapcsolása esetén a név azonnal felszabadul a hálózaton.
  - A tanári kirúgás és gépváltás (`releaseStudent`) szintén azonnal feloldja az érintett tanuló foglalását.
  - A `/api/classes/:className/students` végpont mostantól kiegészül a dinamikus `is_occupied: true/false` mezővel, így a névsor letöltésekor már a kezdeti állapotban is inaktívként jelennek meg a már foglalt diákok.

* **Barátságos Calm modál figyelmeztető ablak (`#modal-alert`):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Új, stílusban illeszkedő modál komponens a tanulói oldalon: `460px` maximális szélesség, `32px` belső margó, dinamikus ikon-jelvény (figyelmeztetés, hiba, információ, siker), cím, részletes üzenet és hangsúlyos **[ Rendben ]** műveletgomb.
  - A `showCalmAlert()` és `closeCalmAlert()` függvények segítségével az összes korábbi natív böngészős `alert()` hívás leváltásra került.

#### Módosítva és javítva (Changed and Fixed)
* **Diák névválasztó dinamikus állapota és inaktív stílusa:**
  - **Fájlok:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A névsor betöltésekor és a valós idejű `students:occupied_updated` események hatására a foglalt tanulók opciói `disabled = true` állapotba kerülnek, és a nevük mögé automatikusan bekerül a `(már bejelentkezett)` felirat.
  - A letiltott opciók (`.calm-select option:disabled`) szürke színű (`#94a3b8`), halvány háttérrel (`#f8fafc`) ellátott és dőlt betűs stílust kaptak a könnyű és egyértelmű felismerhetőségért (`!important` nélkül).
  - A saját gépen éppen kiválasztott tanuló neve nem szürkül ki saját maga előtt.
  - A belépési kísérlet során történt névütközésnél a felület automatikusan törli a hibás kiválasztást és újratölti az osztály névsorát.

---

## [1.9.0] – 2026-11-11

### Szellős és nagyított tesztmegoldó felület, teljes tesztre vetített érdemjegyszámítás és konzisztens modálkezelés

A tanulói tesztmegoldó felület és a felugró párbeszédpanelek átfogó vizuális és funkcionális megújítása: a dolgozat fejlécéből a felesleges kék tesztnév kapszula helyére a diák munkaállomás azonosítója került a bal oldalra, a folyamatjelző felől törlésre került a felesleges kérdéstípus-jelvény, a fejléc és a folyamatjelző kártya alatt 20 képpontos szellős térelválasztó rés jött létre, a kérdések és válaszkártyák megnövelt betűméretet és ergonomikus lapkaméretet kaptak, az élő érdemjegy és százalékszámítás a teljes teszt maximális összpontszámához lett igazítva, a főoldali bejelentkező és a tesztfelületi kilépési modáljai pedig egységesen nagyított méretet és mellékattintásos bezárhatóságot kaptak.

#### Hozzáadva és átrendezve (Added and Changed)
* **Tesztmegoldó fejléc és folyamatjelző sáv átrendezése:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A korábbi kék színű tesztnév kapszula (`#quiz-live-channel-badge`) törlésre került a fejlécből; a helyére a fejléc bal oldalára a „🖥️ Diák munkaállomás” jelvény (`#pc-badge`) került.
  - A folyamatjelző kártyáról törlésre került a redundáns kérdéstípus-jelvény (`#question-type-badge`, pl. Feleletválasztó / Igaz-hamis).
  - A fejléc alatt `20px`, a folyamatjelző kártya alatt szintén `20px` térköz jött létre (`margin-bottom: 20px;`), megszüntetve a komponensek egybefolyását.

* **Nagyított betű- és elemméretek a tesztmegoldás felületén:**
  - **Fájl:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Kérdésszöveg: `1.35rem` és vastagított (`font-weight: 800`) betűk, `38px`-es kérdésszámozó jelvénnyel.
  - Választós lapkák (ABCD): `min-height: 58px`, `1.2rem` betűméret, `38px`-es betűjelvények és `14px` belső margó.
  - Igaz / Hamis felület: `min-height: 115px`, `1.55rem` kiemelt betűméret.
  - Rövid válasz beviteli mező: `58px` magasság, `1.25rem` betűméret és `24px`-es ikon.
  - Válasz beküldése gomb: `52px` magasság, `1.2rem` betűméret és `170px` minimális szélesség.
  - Azonnali Socrative visszajelző sáv és Következő gomb: `52px` sáv, `1.05rem` / `1.1rem` szövegméret, `44px` magas gombbal.

* **Megnövelt és szellős modál ablakok:**
  - **Fájlok:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html)
  - A főoldali Tanári belépés és a tesztfelületi Kilépés megerősítése modálok maximális szélessége `400px`-ről `460px`-re, belső margójuk `28px`-ről `32px`-re nőtt.
  - Címsor: `1.45rem` és `800`-as vastagság, leíró szöveg: `1.05rem`, jelszó beviteli mező: `58px` magasság és `1.25rem` betűméret, műveleti jóváhagyó gomb: `54px` magasság és `1.15rem` méret, elutasító gomb: `48px` magasság és `1.05rem` méret.

#### Javítva (Fixed)
* **Élő KRÉTA érdemjegy és százalékszámítás igazítása a teljes dolgozathoz:**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - Az élő kiértékelés korábban az eddig megválaszolt kérdések számához viszonyította az eredményt (így az 1. helyes válasz után azonnal 100%-ot és 5-ös jegyet számolt).
  - A javítás után a számítás a feladatsorban elérhető maximális összpontszámhoz (`totalMaxPoints`) viszonyítva képzi a százalékot és a KRÉTA érdemjegyet (pl. 5 kérdésből álló teszt esetén 1 helyes válasz = $20\% \rightarrow \mathbf{1\text{-es}}$ érdemjegy).

* **Főoldali névválasztó fókusz háttérszínének egységesítése:**
  - **Fájl:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A `.calm-select:focus` állapota `var(--surface-low)` szürke színt kapott a korábbi fehér (`var(--surface-lowest)`) helyett, így a 2. fázisra váltáskor automatikusan fókuszba lépő névválasztó mező háttérszíne hajszálpontosan megegyezik a tantárgy és osztály mező színével.

* **Konzisztens modálkezelés a felületen:**
  - **Fájl:** [`public/js/utils.js`](file:///d:/dev/Röpdolgozat%20program/public/js/utils.js)
  - A főoldali Tanári belépés modál mostantól a Kilépés megerősítése modálhoz hasonlóan mellékattintással (az ablakon kívüli sötétített háttérre kattintva) is bezárható. Az adminisztrátori felület (`admin.html`) kötelező hitelesítési kapuja változatlanul védett maradt.

---

## [1.8.0] – 2026-11-11

### Kétlépéses diák-belépési varázsló, letisztult fehér sík felület, azonos magasságú stabil fázisok és megnövelt betűméretek

A diák belépési főoldalának alapvető újratervezése a túlzsúfoltság és a vizuális ugrálások megszüntetésére: a Tantárgy és Osztály kiválasztása szétvált a Névválasztástól egy intuitív kétlépéses folyamatra, a tartalom a böngészőablak tetejére került, a korábbi kártya- és kerethatás helyett tiszta fehér sík felület jött létre, az 1. és 2. lépés hajszálpontosan egyforma magasságúvá és elmozdulásmentessé vált az alsó gombigazítással, az elemek és betűk mérete jelentősen megnőtt a kisdiákok könnyebb olvashatóságáért, a gépjelzés a tesztírás fejlécébe költözött, a tanári belépés gomb pedig közvetlenül a böngészőablak jobb felső sarkában rögzült.

#### Hozzáadva (Added)
* **Kétlépéses belépési folyamat (fázisválasztó):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - **1. fázis (`#login-step-1`):** A kezdőképernyőn kizárólag a tantárgy és az osztály lenyíló listája jelenik meg az Okoskodó-logó alatt. A névválasztó, a dolgozat státuszjelzése és a belépés gomb helyett mindössze egy hangsúlyos **[ Következő ➔ ]** gomb látható.
  - **2. fázis (`#login-step-2`):** A „Következő” gombra kattintva jelenik meg a hivatalos névválasztó, az aktív dolgozat státuszdoboza (vagy a figyelmeztetés, ha nincs élő teszt), a csapatverseny színválasztója, valamint az alsó gombsorban a **[ ⬅ Vissza ]** és a **[ Belépés a dolgozatba ➔ ]** műveletgomb.

* **Előre lefoglalt, stabil státuszfelület a 2. fázisban:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `#session-info-box` előre lefoglalt magasságot (`min-height: 76px;`) kapott és azonnali állapotjelzést nyújt ahelyett, hogy késleltetve ugrana be a semmiből lefelé lökve a gombokat.

#### Módosítva és javítva (Changed and Fixed)
* **Az 1. és 2. lépés azonos magassága és a felületi rángatózás megszüntetése:**
  - **Fájl:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Mindkét belépési fázis (`#login-step-1` és `#login-step-2`) egységes flexbox elrendezést és azonos minimális magasságot (`min-height: 330px;`) kapott.
  - A műveleti gombok alsó igazítással (`margin-top: auto;`) rögzülnek a konténer legalján, így a gombok vízszintes alsó vonala és az alatta elhelyezkedő tájékoztató szöveg a két lépés közötti oda-vissza váltáskor hajszálpontosan ugyanazon a pozíción marad, egyetlen képpontot sem mozdul el.

* **Felső igazítás és fehér, sík felület a korábbi szürke kártya helyett:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A böngészőablak tetejétől mért korábbi ~200 képpontos üres hézag megszűnt: a tartalom a képernyő tetején kezdődik (`justify-content: flex-start;`).
  - A háttér tiszta fehér (`#ffffff`), a `#login-container` kerete és dobozárnyéka megszűnt, így sík felületként simul a háttérbe.

* **Számozás és felesleges feliratok eltávolítása:**
  - **Fájl:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html)
  - A mezőcímkék elől törlésre került a felesleges számozás (1-2-3-4), valamint elrejtésre került a felesleges „Üdvözlünk! Válaszd ki az adataidat...” felirat.

* **Megnövelt betű- és elemméretek az alsó tagozatos kisdiákok számára:**
  - **Fájl:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Mezőcímkék: `1.25rem`, vastag (`font-weight: 800`) betűk.
  - Lenyíló választómezők: `64px` magasság, `1.25rem` betűméret és `26px`-es ikonok.
  - Műveleti gombok: `64px` magasság, `1.25rem` betűméret és `28px`-es nyilak.
  - Dinamikus státuszdobozok és tájékoztatók: `1.15rem` - `1.2rem` betűméret, diszkrét lágy keret.

* **Gépazonosító és tanári belépés elrendezésének tisztítása:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A gépjelzés (`#pc-badge`) a bejelentkezési főoldalról átkerült a dolgozat dedikált fejlécébe, így kizárólag a tesztírás közben jelenik meg a diák neve mellett.
  - A tanári belépés gomb közvetlenül a böngészőablak jobb felső sarkában rögzült (`position: fixed; top: 16px; right: 20px;`).
  - Az Okoskodó-logó hajszálpontosan megőrizte eredeti vízszintes és függőleges pozícióját.

* **Rendszerszintű verziószámok és dokumentáció aktualizálása:**
  - **Fájlok:** [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json), [`project-context.md`](file:///d:/dev/Röpdolgozat%20program/project-context.md), [`README.md`](file:///d:/dev/Röpdolgozat%20program/README.md), [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/projector.html`](file:///d:/dev/Röpdolgozat%20program/public/projector.html)
  - A projektverzió egységesen `v1.8.0`-ra frissült cache-busting paraméterekkel (`?v=1.8.0`).

---

## [1.7.0] – 2026-11-11

### Calm Learner diák-tesztfelület (választós és igaz-hamis kérdések), élő csatornajelvény, görgetésmentes kompakt visszajelzés és megerősített kilépés

A diák tesztfelületének teljes körű korszerűsítése a Calm Learner arculati tervek alapján: a felesleges felső elemek (Okoskodó-logó és statikus „Tantárgy” kapszula) helyett az adminisztrátori felülettel azonos, tantárgyspecifikus élő csatornajelvény (`live-badge`), a 75 képpontos felső üres térköz felszámolása, a függőleges görgetést megszüntető, egysoros azonnali Socrative visszajelző sáv és rögzített kártyamagasság, a diák által kezdeményezhető megerősítő kérdéses dolgozat-befejezés (kilépés) üzembiztos eseménykezelése, valamint az MTA 12. kiadása szerinti kisbetűs KRÉTA érdemjegy-minősítések.

#### Hozzáadva (Added)
* **Élő csatornajelvény a diák fejlécében (Live Badge):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Dolgozatírás közben a korábbi felesleges logó és a semmitmondó, statikus pöttyös „Tantárgy” kapszula helyett a tanári adminisztrátori felület **Csatornák** sávjával teljesen megegyező, dinamikusan színezett élő csatornajelvény (`#quiz-live-channel-badge`) jelenik meg:
    - 🔵 **Digitális kultúra:** világoskék pont (`#38bdf8`) és csatornaszín.
    - 🟡 **Technika:** borostyánsárga pont (`#fbbf24`) és csatornaszín.
    - 🟣 **Fejlesztő foglalkozás:** lila pont (`#c084fc`) és csatornaszín.
  - A jelvény egyértelműen azonosítja a dolgozatot és évfolyamot: **`6. évf.` · `Kvíz címe`**.
  - A fejléc jobb oldalán a tanuló neve (gépszámmal), az időkorlát visszaszámlálója és a kilépés gomb kapott helyet.

* **Kompakt, egysoros azonnali Socrative visszajelző sáv (`.quiz-feedback-strip`):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A korábbi 270 képpont magas, oldalgörgetést okozó visszajelző doboz helyett a kérdéskártya alján egyetlen kompakt zóna (`.quiz-footer-zone`) jött létre.
  - Az „Ellenőrzés” gombra kattintás után a műveleti gomb helyét egyetlen, mindössze 42 px magas sáv veszi át: zöld pipa vagy piros iksz ikonnal, a helyes megoldás kiírásával, az egysoros magyarázattal és a kompakt **[ Következő ➔ ]** / **[ Befejezés 🏁 ]** gombbal.
  - Zéró függőleges görgetés: még az alacsonyabb felbontású iskolai monitorokon is 100%-ban görgetésmentesen jelenik meg a teljes dolgozat.

* **Dolgozat megszakítása megerősítő kérdéssel (kilépési modálablak):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/js/utils.js`](file:///d:/dev/Röpdolgozat%20program/public/js/utils.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A fejlécben elhelyezett **[ 🚪 Kilépés ]** gombra kattintva védelmi párbeszédpanel ugrik fel (*„Befejezed a dolgozatot? Az eddig megadott válaszaid rögzítésre és kiértékelésre kerülnek. Ha most kilépsz, a teszt számodra véget ér és nem folytathatod.”*).
  - A tanuló a **„Folytatom a dolgozatot”** (vagy az ablakon kívülre kattintva) visszatérhet a kérdéshez, míg a **„Kilépés és beadás”** gombbal véglegesítheti az addigi válaszait és átléphet a lezárt értékelőlapra.

#### Javítva (Fixed)
* **Kliensoldali eseménykezelők regisztrációjának sorrendje (a kilépés gomb némultsága):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `setupCommonUIListeners()` korábban a munkamenet-helyreállítás (`tryRestoreSession()`) után futott le, emiatt visszatöltéskor (`Session Recovery`) a kód azonnal kilépett (`if (restored) return;`), és a gombok eseménykezelői nem regisztrálódtak. Az eseménykezelők regisztrálása átkerült az `init()` legelső fázisába, garantálva a működést frissítés után is.

* **Felső 75 pixeles üres térköz megszüntetése dolgozatírás közben:**
  - **Fájlok:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A kezdőlap vertikálisan középre zárt elrendezése (`justify-content: center`) dolgozatírás közben felső igazításra vált (`.student-entry-wrapper.quiz-active { justify-content: flex-start; padding: 8px 16px; }`), így a teszt közvetlenül a böngésző tetején kezdődik.

* **Kérdéskártya méretstabilitása és vizuális ugrálásának megszüntetése:**
  - **Fájl:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A `.quiz-main-card` stabil magasságkeretet kapott (`min-height: 380px`), és az opciók (ABCD és igaz-hamis) térközei kompakttá váltak, így a kártya alján lévő gombok a kérdések és kiértékelések váltakozása közben nem ugrálnak el a tanuló egere alól.

* **Folyamatjelző csík és élő KRÉTA érdemjegy inicializálási anomáliája:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A folyamatjelző csík mostantól pontosan a válasz kiértékelésekor lép előre ahelyett, hogy a kérdés megválaszolása előtt már előrébb járna.
  - A HTML-ben korábban beégetett hibás `100%` és `5 (Jeles)` feliratok helyett az első kérdés megválaszolásáig kötőjel (`–`) jelenik meg.
  - A szöveges KRÉTA érdemjegyek az MTA 12. kiadásának és a magyar helyesírás szabályainak megfelelően kis kezdőbetűvel szerepelnek (`jeles`, `jó`, `közepes`, `elégséges`, `elégtelen`).

* **Munkamenet-adatok teljessége a diák API-ban:**
  - **Fájl:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - A `/api/student/session-data` végpont válasza kiegészült a `session` objektummal (`subject_name`, `grade_level`, `class_name`, `quiz_title`, `mode`, `grade_thresholds_json`), biztosítva a kliensoldali fejléc- és jegyszámítás függetlenségét.

* **Rendszerszintű verziószámok és dokumentáció aktualizálása:**
  - **Fájlok:** [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json), [`project-context.md`](file:///d:/dev/Röpdolgozat%20program/project-context.md), [`README.md`](file:///d:/dev/Röpdolgozat%20program/README.md), [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/projector.html`](file:///d:/dev/Röpdolgozat%20program/public/projector.html)
  - A projektverzió egységesen `v1.7.0`-ra frissült cache-busting paraméterekkel (`?v=1.7.0`).

---

## [1.6.0] – 2026-11-11

### Space Race tantermi közös rajt (RAJT gomb és lebegő űrhajós lobby), kompakt, tantárgyszínes élő státuszfülek és FOUT-mentes gyorsítótárazás

A tantermi versenyek szinkronizálását biztosító tantermi közös rajt (lobby + RAJT gomb) bevezetése, az adminisztrátori élő státuszfülek helytakarékos, tantárgyszínes átalakítása (zöld és piros színek mellőzésével), valamint a betűtípus-villogást (FOUT) és script-beragadást megszüntető gyorsítótár-architektúra.

#### Hozzáadva (Added)
* **Space Race tantermi közös rajt mechanizmus (lobby és RAJT gomb):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/projector.html`](file:///d:/dev/Röpdolgozat%20program/public/projector.html), [`public/js/projector.js`](file:///d:/dev/Röpdolgozat%20program/public/js/projector.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - **Diák-rajtállás (lobby):** Űrhajós verseny módban a diák belépése és színválasztása után nem nyílik meg azonnal a teszt, hanem egy barátságos, lebegő űrhajós várakozó képernyő fogadja a tanuló által választott csapatszínben (`.lobby-rocket-floating`).
  - **Tanári RAJT gomb:** A kivetítő képernyőn és az adminisztrátori felületen is megjelent a feltűnő narancssárga **[ 🚀 RAJT! Verseny indítása ]** gomb, amely valós időben (Socket.io `race:started`) egyszerre indítja el a versenyt az összes diáknál.
  - **Új végpont:** `POST /api/admin/sessions/:id/start-race` szigorú tanári hitelesítéssel.
  - **Késve érkező diákok intelligens kezelése:** Ha egy tanuló a rajt után csatlakozik, a rendszer azonnal az 1. kérdéshez irányítja a várakoztatás helyett.

#### Módosítva (Changed)
* **Adminfejléc: kompakt, tantárgyszínes élő státuszfülek (Live Badges):**
  - **Fájlok:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A zöld (helyes/élő) és piros (hibás/lezárt) színek teljes mellőzésével külön tantárgyi színkódok kerültek bevezetésre:
    - 🔵 **Digitális kultúra:** világoskék pont (`#38bdf8`), királykék kártya (`#0369a1`).
    - 🟠 **Technika:** borostyánsárga pont (`#fbbf24`), meleg bronz kártya (`#b45309`).
    - 🟣 **Fejlesztő foglalkozás:** lila pont (`#c084fc`), mélylila kártya (`#6b21a8`).
    - 🔘 **Egyéb:** türkiz pont (`#2dd4bf`), sötéttürkiz kártya (`#0f766e`).
  - A feliratok kompakttá váltak (pl. `6. évf. · Hálózatok (21)`), a teljes név egérráhúzásra jelenik meg, így akár 6–8 futó dolgozat is kényelmesen elfér görgetősáv nélkül.

* **Betűtípus-villogás (FOUT) és kliensoldali gyorsítótárazás optimalizálása:**
  - **Fájlok:** [`server.js`](file:///d:/dev/Röpdolgozat%20program/server.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/projector.html`](file:///d:/dev/Röpdolgozat%20program/public/projector.html)
  - A `font-display: swap` helyett a `font-display: block` került bevezetésre a helyi hálózaton azonnali Nunito Sans rendereléssel.
  - A szerver a betűkészleteket és arculati képeket tartósan cache-eli (30 nap), míg az alkalmazáskódra (`.js`, `.css`, `.html`) `no-cache, must-revalidate` szabály vonatkozik verziókövetési paraméterekkel (`?v=1.6.0`), megakadályozva a kód beragadását a klienseknél.

* **Space Race kártyák elrendezése:**
  - **Fájl:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html)
  - Mind a négy csapatszín kártya (kék, piros, zöld, sárga) megkapta a `calm-color-card` osztályt, így mindegyik konzisztensen két sorba törve (felül ikon, alul név) jelenik meg.

* **Rendszerszintű verziószámok és dokumentáció aktualizálása:**
  - **Fájlok:** [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json), [`project-context.md`](file:///d:/dev/Röpdolgozat%20program/project-context.md), [`README.md`](file:///d:/dev/Röpdolgozat%20program/README.md)
  - A projektverzió egységesen `v1.6.0`-ra frissült.

---

## [1.5.0] – 2026-11-11

### Főoldali „Calm Learner” arculat, 100%-ban offline helyi betűkészletek (Nunito Sans & Material Symbols), tantermi gépszám-kijelzés és Best Practice font-renderelés

A diákok vizsgadrukkját csökkentő, meleg és letisztult intézményi dizájn („Calm Learner”) megvalósítása külső keretrendszerek (Tailwind) nélkül, a 100% offline működést garantáló helyi betűkészlet-architektúra kialakítása, valamint a tantermi azonosítást segítő gépszámozási rendszer bevezetése.

#### Hozzáadva (Added)
* **100%-ban offline helyi betűkészletek és ikonkészlet integrációja:**
  - **Fájlok:** [`public/fonts/nunito-sans-latin.woff2`](file:///d:/dev/Röpdolgozat%20program/public/fonts/nunito-sans-latin.woff2), [`public/fonts/nunito-sans-latin-ext.woff2`](file:///d:/dev/Röpdolgozat%20program/public/fonts/nunito-sans-latin-ext.woff2), [`public/fonts/nunito-sans.ttf`](file:///d:/dev/Röpdolgozat%20program/public/fonts/nunito-sans.ttf), [`public/fonts/material-symbols-outlined.woff2`](file:///d:/dev/Röpdolgozat%20program/public/fonts/material-symbols-outlined.woff2), [`public/fonts/material-symbols-outlined.ttf`](file:///d:/dev/Röpdolgozat%20program/public/fonts/material-symbols-outlined.ttf)
  - A szigorúan zárt iskolai helyi hálózat (LAN) elvárásainak megfelelően a modern, kerekded Google Nunito Sans betűcsalád és a Google Material Symbols Outlined ikongyűjtemény a helyi kiszolgáló `public/fonts/` könyvtárába került letöltésre és beépítésre.
  - A rendszer egyetlen külső CDN-t, Google Fonts hivatkozást sem vesz igénybe; az összes kliensgép teljesen offline módban, azonnal betölti az arculati elemeket.

* **„Calm Learner” diák-főoldal és felhasználói élmény:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `Source/Terv/Főoldal` alapján átültetett arculat: meleg narancssárga márkahangsúly (`#ea580c`), nyugodt háttérszínek (`#fbf8fc`, `#f5f3f6`), 20 px lekerekítésű kártyák és finom kártyaárnyékok.
  - Szigorúan CSS-keretrendszerek (Tailwind) nélkül, tiszta Vanilla CSS3 és HTML5 technológiával, az `!important` szabály teljes mellőzésével.
  - **3 lépéses vizuális folyamatjelző (léptető):** Látványos, számozott körjelvényekkel jelölt lépések (1. tantárgy → 2. osztály → 3. diák neve), amelyek azonnali vizuális visszajelzést adnak a kitöltöttségről.
  - **Megnyugtató indítási sáv:** Diszkrét ikonnal kísért biztató üzenet a feszültségmentes dolgozatkezdéshez.
  - **Modernizált tanári belépési modál:** Kártya alapú felugró ablak jelszóelrejtő/felfedő szem-ikonnal, ESC és Enter billentyűk kezelésével.
  - **Calm Learner stílusú Space Race csapatválasztó:** 4 oszlopos színes kártyák (kék, piros, zöld, sárga) mikroanimációkkal és kiemeléssel.

#### Módosítva (Changed)
* **Fejléc optimalizálása – tantermi gépszám a tanév helyett:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A felhasználói kérésnek megfelelően a felső információs sávban az aktuális tanév helyett a tanuló gépszámának kijelzése jelenik meg (pl. `💻 12. számú gép`).
  - A kliens a gépszámot az URL paraméterből (`?pc=12`) vagy a helyi tárolóból olvassa be, így a tantermi 42 kliensgépen a parancsikonból vagy automatizmusból indított böngésző azonnal a helyes gépazonosítót mutatja.

* **Best Practice WOFF2 font-renderelés és öröklődés javítása:**
  - **Fájl:** [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Megszüntetésre került a WOFF2 subsetting csapda: a korábbi egyetlen `@font-face` blokk szétválasztásra került szabványos `latin` és `latin-ext` definíciókra pontos `unicode-range` tartományokkal. Ezzel elhárult a böngészők csendes visszaesése a Segoe UI rendszerbetűtípusra, és a felület minden szöveges eleme (kiemelten a `.calm-subtitle`) a Nunito Sans betűtípussal jelenik meg.
  - Beágyazásra került a teljes TTF formátum biztonsági tartalékként, valamint a globális `button, input, select, textarea { font-family: inherit; }` szabály, szavatolva az űrlapmezők egységes tipográfiáját.

* **Rendszerszintű verziószámok és dokumentáció aktualizálása:**
  - **Fájlok:** [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json), [`project-context.md`](file:///d:/dev/Röpdolgozat%20program/project-context.md), [`README.md`](file:///d:/dev/Röpdolgozat%20program/README.md)
  - A projektverzió egységesen `v1.5.0`-ra frissült, a könyvtárstruktúra pedig kibővült a `public/fonts/` helyi betűkészlet-tárral.

---

## [1.4.0] – 2026-11-10

### Vizuális arculatváltás (Okoskodó logó és figura favicon), szigorított környezeti követelmények és Zero-Install szerverüzembehelyezés (Windows Server 2016+)

A tantermi és szerveroldali megbízhatóság maximalizálása érdekében bevezetett új intézményi arculat, az intelligens önellenőrző szerverindítás és a zárt hálózatos Zero-Install telepítési eljárás összefoglalása.

#### Hozzáadva (Added)
* **Új vizuális arculat és grafikai elemek integrációja:**
  - **Fájlok:** [`public/img/logo.png`](file:///d:/dev/Röpdolgozat%20program/public/img/logo.png), [`public/img/favicon.png`](file:///d:/dev/Röpdolgozat%20program/public/img/favicon.png), [`public/favicon.ico`](file:///d:/dev/Röpdolgozat%20program/public/favicon.ico), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - A `Source/Logó/02.png` arculati terv alapján a felületek fejléceiben a korábbi általános SVG könyv-ikon helyét átvette az elegáns **„Okoskodó – röpdolgozat program”** logó.
  - A böngészőfülekhez és könyvjelzőkhöz precíz képanalízissel kivágott, önálló narancssárga diplomás izzó-figura készült (`256×256 px` PNG és szabványos gyökérszintű `.ico` formátumban), garantálva, hogy a fülön kizárólag az embléma látszódjon.
  - Az új favicon és logó beépítésre került az összes nézetbe: [`student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`projector.html`](file:///d:/dev/Röpdolgozat%20program/public/projector.html) és [`print-report.html`](file:///d:/dev/Röpdolgozat%20program/public/print-report.html).

* **Szigorú futtatókörnyezeti követelmények (`engines` blokk):**
  - **Fájl:** [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json)
  - Hivatalos `engines` direktíva rögzíti a követelményeket (`"node": ">=22.11.0"`, `"npm": ">=10.9.0"`), elejét véve a C++ natív modulok és régebbi vagy kísérleti Node verziók közötti ütközéseknek.

* **Intelligens, önellenőrző indítószkript:**
  - **Fájl:** [`start_server.bat`](file:///d:/dev/Röpdolgozat%20program/start_server.bat)
  - Beépített Node.js mikroszkripttel ellenőrzi, hogy a futtatókörnyezet eléri-e a minimum v22 LTS szintet, és nem megfelelő verzió esetén azonnal magyar figyelmeztetéssel leáll.
  - Automatikusan ellenőrzi a `node_modules` meglétét, és figyelmeztet, ha a csomagok nincsenek a mappában.
  - Automatikusan létrehozza a hiányzó `data` és `data\uploads` mappákat.
  - Szigorúan ellenőrzi az adatbázis-inicializálás és sémaérvényesítés hibakódját (`%errorlevel%`), és hiba esetén megállítja a futást.
  - A webszerver váratlan leállásakor részletes magyar tájékoztatást és kilépési hibakódot jelenít meg a csendes összeomlás helyett.

#### Módosítva (Changed)
* **Zéró-telepítéses (Zero-Install Best Practice) szerverüzembehelyezés:**
  - **Fájl:** [`telepítés.md`](file:///d:/dev/Röpdolgozat%20program/telepítés.md)
  - Teljes átdolgozás a tényleges intézményi célkörnyezethez: **Windows Server 2016** (valamint 2019 / 2022).
  - Elsődleges, kötelező szabvánnyá vált a kész `node_modules` mappa pendrive-os átmásolása: a szerveren **egyetlenegy `npm install` parancsot sem kell kiadni**, kizárva minden jogosultsági korlátot (`install-scripts blocked`), hálózati függőséget és C++ fordítási hibát.
  - Törlésre került a korábbi megtévesztő v20-as hivatkozás; kizárólag a hivatalos, előre fordított binárisokat tartalmazó **Node.js v22.x LTS** telepítő használata támogatott.

* **Rendszerszintű verziószámok és környezeti leírások aktualizálása:**
  - **Fájlok:** [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json), [`project-context.md`](file:///d:/dev/Röpdolgozat%20program/project-context.md), [`README.md`](file:///d:/dev/Röpdolgozat%20program/README.md)
  - A projektverzió egységesen `v1.4.0`-ra frissült, a működési környezet leírása pedig kiegészült a Windows Server 2016 specifikációval.

---

## [1.3.0] – 2026-11-10

### Egyetlen közös belépési kapu, kompakt, három lenyíló listás diákfelület és standard osztálynévsorok

A tantermi használhatóság egyszerűsítése érdekében bevezetett egységes belépési felület, a görgetésmentes, három lenyíló listás csatlakozási folyamat és az intézményi standard osztályok integrációjának összefoglalása.

#### Hozzáadva (Added)
* **Egyetlen közös felület a tanárnak és a diáknak (Single Entry Point):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A szerver fő címe (`http://<szerver_ip>:3000/`) vált a teljes tanterem egyetlen közös kapujává; a pedagógusnak és a diákoknak többé nem kell külön alútvonalakat megjegyezniük.
  - A közös fejléc jobb oldalára diszkrét **`🔐 Tanári belépés`** gomb és beépített jelszókérő modal ablak került.
  - Sikeres tanári bejelentkezést követően a rendszer automatikusan átirányít az adminisztrációs vezérlőpultra ([`/admin`](file:///d:/dev/Röpdolgozat%20program/public/admin.html)).

* **Kompakt, görgetésmentes, három lenyíló listás (`<select>`) diák-csatlakozási kártya:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A korábbi, sok helyet foglaló kártyás felület helyett egyetlen áttekinthető kártyára került a három kiválasztóelem:
    1. **Tantárgyválasztó lenyíló lista (`select-subject`):** az adatbázis tantárgyaival feltöltve, alapértelmezetten a **„Digitális kultúra”** aktív.
    2. **Osztályválasztó lenyíló lista (`select-class`):** az iskola mind a 15 standard osztályát tartalmazza (**3.a, 3.b, 3.c, 4.a, 4.b, 4.c, 5.a, 5.b, 5.c, 6.a, 6.b, 6.c, 7.a, 7.b, 7.c**); alapértelmezetten a **„3.a”** aktív.
    3. **Névválasztó lenyíló lista (`select-student`):** az alapértelmezett `3.a` hivatalos névsorát az oldal betöltésekor automatikusan lekéri és felkínálja, osztályváltáskor pedig azonnal frissíti a tanulók listáját.
  - A kiválasztás után aktiválódó **`🚀 Csatlakozás a dolgozathoz`** (`btn-join-session`) gomb biztosítja a teszt elindítását, Space Race módban a csapatszín választásával együtt.

* **Minta osztálynévsor a `3.a` osztályhoz:**
  - **Fájl:** [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js)
  - A `3.a` alapértelmezett osztályhoz 15 tanuló került rögzítésre az adatbázisban a meglévő `6.a` és `7.a` adatok érintetlenül hagyása mellett.

* **Automatikus indítás rögzítése a telepítési útmutatóban:**
  - **Fájl:** [`telepítés.md`](file:///d:/dev/Röpdolgozat%20program/telepítés.md)
  - Részletes leírás készült a **2.6. Lépés: Automatikus indítás beállítása a szerver újraindulásakor (Közös Indítópult)** pontban a parancsikon használatának kötelező szabályáról és a gyors másolási eljárásról.

#### Módosítva (Changed)
* **Kijelentkezési átirányítás:**
  - **Fájl:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - Az adminisztrációs felületről történő kijelentkezéskor a rendszer a tanárt automatikusan visszavezeti a közös főoldalra (`window.location.href = '/'`).

---

## [1.2.0] – 2026-11-07

### Korábbi dolgozatok archívuma (Reports), nyomtatható egyéni A4 PDF, hitelesítési és felületi finomhangolások

A tanári munkaállomás és a vizsgafelület éles tantermi használatra való felkészítése során elvégzett strukturális bővítések, hitelesítési javítások és vizuális egyértelműsítések összefoglalása.

#### Hozzáadva (Added)
* **Korábbi dolgozatok és eredmények archívuma (Reports-felület és API):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A tanári vezérlőpulton új **📑 Eredmények (Reports)** fül (`tab-reports`) került kialakításra, ahol a pedagógus időrendben áttekintheti az összes korábbi és folyamatban lévő dolgozatot.
  - Szerveroldali adatbázis-lekérdezés (`getAllSessions()`) és védett REST API végpont (`GET /api/admin/sessions`), amely visszaadja a dolgozatok alapadatait (dátum, tantárgy, évfolyam, dolgozat címe, osztály, létszám, lezárt vagy aktív állapot).
  - Kliensoldalon dinamikus keresőmező az azonnali szűréshez (dolgozat címe, tantárgy, osztály vagy évfolyam szerint), valamint közvetlen exportgombok a táblázat minden sorában: **👁️ Mátrix**, **📊 Excel**, **🌐 HTML**, **📦 ZIP** és **🖨️ PDF**.

* **Lezárt dolgozatok egyértelmű vizuális jelölése (lezárt archívumi mátrixnézet):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Amikor a tanár az Eredmények (Reports) fülről megnyitja egy lezárt dolgozat táblázatát (`switchSession`), a felület egyértelművé teszi az archív állapotot, megszüntetve a megtévesztő jelzéseket:
    - A fejléckapszula a zöld pulzáló `🟢 ÉLŐ` helyett diszkrét szürke hátterű **`⏹️ LEZÁRT ARCHÍVUM`** (`.live-badge.badge-finished`) jelvényre vált.
    - Az adminisztrációs navigációs fül felirata dinamikusan **`📊 Lezárt dolgozat (Mátrix)`** szövegre módosul.
    - A dolgozat címe kiegészül a `[LEZÁRT ARCHÍVUM]` megjelöléssel, az adatsávban pedig megjelenik a lezárás pontos ideje (`Befejezve: YYYY-MM-DD HH:MM`).
    - A piros `⏹️ Dolgozat befejezése (Finish)` gomb elrejtődik, helyette a **`⏹️ Dolgozat lezárva`** állapotjelző látható.
    - Egy élő csatornára kattintva vagy új dolgozat indításakor a felület maradéktalanul visszatér a zöld `🟢 ÉLŐ` és `📊 Élő dolgozat (Mátrix)` üzemmódba.

* **Részletes Windows Server 2022 üzembehelyezési és telepítési dokumentáció:**
  - **Fájl:** [`telepítés.md`](file:///d:/dev/Röpdolgozat%20program/telepítés.md)
  - Lépésről lépésre követhető, teljes körű rendszergazdai útmutató készült az éles tantermi környezet kialakításához: pendrive-os fájlmásolás, Node.js LTS környezet beállítása, Windows Defender tűzfalszabály létrehozása a 3000-es porthoz, automatikus indítás konfigurálása a rendszerindítási mappába (`shell:common startup`), valamint a tanulói munkaállomások asztali parancsikonjainak előkészítése.

#### Javítva (Fixed)
* **Nyomtatható A4 PDF-nézet dinamikus munkamenet-hozzárendelése (Print Report Fallback):**
  - **Fájlok:** [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/print-report.html`](file:///d:/dev/Röpdolgozat%20program/public/print-report.html)
  - **Hiba:** A nyomtatási gomb (`btnExportPrint`) statikusan a paraméter nélküli `/print` címre mutatott, így lezárt dolgozat megtekintésekor az új böngészőlapon a „Nincs diák ebben a dolgozatban.” figyelmeztetés fogadta a tanárt.
  - **Javítás:** A gomb hivatkozása a kiválasztott dolgozathoz dinamikusan hozzárendeli a munkamenet-azonosítót (`/print?sessionId=${sessionId}`), továbbá a `print-report.html` intelligens visszaesési (fallback) logikát kapott a megadott archív dolgozat diákjainak és eredményeinek megbízható betöltésére.

* **Kijelentkezési és felhatalmazási JSON-válasz javítása (SyntaxError JSON.parse elhárítása):**
  - **Fájlok:** [`src/middleware/auth.js`](file:///d:/dev/Röpdolgozat%20program/src/middleware/auth.js), [`public/js/utils.js`](file:///d:/dev/Röpdolgozat%20program/public/js/utils.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js)
  - **Hiba:** A `requireAdminAuth` köztesréteg `req.path.startsWith('/api/')` feltétele alútvonalakon hamis értéket adott, emiatt jogosulatlan állapotban az API végpontok HTML átirányítást küldtek a várt 401 JSON helyett. Ez a kliensoldali jelentésbetöltéskor `SyntaxError: JSON.parse: unexpected character at line 1 column 1` hibát okozott. Emellett az ablakon kívüli kattintás a bejelentkező modal ablakot is bezárta.
  - **Javítás:** A köztesréteg a globális `req.originalUrl` és `req.baseUrl` útvonalakat vizsgálja, 401-es hibakódnál tiszta JSON választ ad. A `utils.js` kizárja a `login-modal`-t az ablakon kívüli kattintásos bezárásból, a kijelentkezéskor pedig a vezérlőpult elemei rejtve maradnak a sikeres bejelentkezésig. A cookie törlése explicit `path: '/'` attribútumot kapott.

* **Kettőzött KRÉTA érdemjegy kiírásának elhárítása a tanulói képernyőn:**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - **Hiba:** A dolgozat befejezésekor a tanuló záróképernyőjén az érdemjegy duplán jelent meg, például: `Jó (4) (4)`.
  - **Javítás:** A szerveroldali `data.gradeText` változó már tartalmazza a zárójeles jegyet (`Jó (4)`), így a mögé fűzött extra numerikus jegy elhagyásra került.

---

## [1.1.0] – 2026-11-07

### Tantermi hálózati stabilizáció, kliensoldali hibajavítások és UX-bővítések

A kétgépes (fő tanári gép: `192.168.1.67` és tanulói kliensgép: `192.168.1.166`) éles helyi hálózati (LAN) tesztelése során azonosított és elhárított fejlesztések összefoglalása.

#### Javítva (Fixed)
* **Szöveges beviteli mező zárolásának feloldása (Short Answer Input Re-enabling):**
  - **Fájl:** [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - **Hiba:** Korábbi kérdések (ABCD vagy TF) beküldésekor a duplikált beküldés elleni védelem letiltotta a szöveges beviteli mezőt (`shortAnswerInput.disabled = true`). A következő kérdésre lépve a mező letiltott állapota megmaradt, így a diák nem tudott belekattintani és gépelni, aminek következtében a kék „Válasz beküldése és ellenőrzése” gomb sem aktiválódott.
  - **Javítás:** A kérdések alaphelyzetbe állításakor és a `SHORT` típus megjelenítésekor kötelezően feloldásra kerül a mező zárolása (`shortAnswerInput.disabled = false`).
  - **UX-kiegészítés:** Automatikus kurzorfókuszálás (`focus()`) a mező megjelenésekor, valamint az **Enter** billentyű lenyomására történő azonnali válaszbeküldés lehetősége.

* **Feleletválasztós (ABCD) opcióhiány elhárítása (Options Fallback):**
  - **Fájlok:** [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - **Hiba:** Ha egy kérdéshez az adatbázisban nem rögzítettek külön szöveges válaszopciókat (például tesztből importált vagy fiktív feladatsoroknál az `options_json` üres tömb maradt), a diák felületén nem jelentek meg válaszgombok.
  - **Javítás:** Mind a szerveroldali lekérdezésben, mind a kliensoldali megjelenítőben beépítésre került a tartalék védelem: hiányzó opciók esetén automatikusan létrejönnek a klasszikus **A**, **B**, **C**, **D** válaszgombok.

* **Többgépes hálózati kiszolgálás (Multi-Machine IPv4 Socket Binding):**
  - **Fájl:** [`server.js`](file:///d:/dev/Röpdolgozat%20program/server.js)
  - **Hiba:** A Node.js alapértelmezett socketnyitása Windows operációs rendszer alatt csak IPv6-os (`::`) illesztőre köthetett, ami miatt a másik helyi gépről érkező kérések időtúllépéssel (`ERR_CONNECTION_TIMED_OUT`) elutasításra kerültek.
  - **Javítás:** A szerverindítás explicit IPv4-es hálózati illesztőre kötéssel valósul meg: `server.listen(config.port, '0.0.0.0', ...)`.

* **A tanári vezérlőpult végtelen átirányítási ciklusának megszüntetése:**
  - **Fájl:** [`src/routes/views.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/views.js)
  - **Hiba:** Az `/admin` útvonalon alkalmazott szerveroldali köztesréteg (middleware) a süti hiányában a böngészőt folyamatosan átirányította (`/admin?login=1`), ami Firefox alatt végtelen 302-es hurkot okozott.
  - **Javítás:** A HTML sablon közvetlen kiszolgálása; a hitelesítést a kliensoldali PIN-kódos ablak és a védett API végpontok felügyelik.

#### Hozzáadva (Added)
* **Valós eredmények és KRÉTA érdemjegy megjelenítése a diák záróképernyőjén:**
  - **Fájlok:** [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `/api/student/session-data` végpont dinamikusan kiszámítja és átadja a tanuló eddig megszerzett összpontszámát (`total_points`), a kérdések összértékét (`max_points`), az elért százalékot (`percentage`), valamint a dolgozathoz rendelt ponthatárok szerinti hivatalos KRÉTA érdemjegyet (`grade`) és annak szöveges megfelelőjét (`grade_text`).
  - A korábbi statikus `0 / 0 pont` sablon helyett a tényleges minősítés jelenik meg a dolgozat befejezésekor.

* **Kezdőlapra visszatérés és tiszta munkamenet-váltás (New Session Reset):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A záróképernyő kiegészült egy **[ 🔄 Új belépés / Vissza a kezdőlapra ]** (`btn-restart-student`) gombbal.
  - Erre kattintva a tanulói felület kitörli az adott böngészőben tárolt munkamenet-tokent (`sessionStorage.removeItem('ropdolgozat_token')`), így a következő órán érkező új osztály vagy új tanuló a böngésző bezárása nélkül azonnal kiválaszthatja a nevét az új dolgozathoz.

---

## [1.0.0] – 2026-11-07

### Alapkiadás (Initial Production Release)

A rendszer első teljes körű, 100%-ban offline működésre felkészített alapváltozata.

#### Hozzáadva (Added)
* **Relációs adatbázis és integritási rendszer:**
  - SQLite WAL (Write-Ahead Logging) architektúra 7 alaptáblával: `subjects`, `students`, `quizzes`, `questions`, `sessions`, `participants`, `answers`.
  - 22 darab adatbázisszintű SQL trigger a csalásbiztos működésért (tartós tesztzárolás `quizzes.locked_at`, lezárt dolgozatok megváltoztathatatlansága, fizikai törlés elleni védelem, pontplafon-ellenőrzések).
* **Tantermi munkamenet és munkamenet-helyreállítás (Session Recovery):**
  - Hivatalos osztálynévsorból történő legördülő névválasztás (0 gépelés, 3 kattintás).
  - Kriptográfiai token alapú munkamenet-helyreállítás oldalfrissítés vagy véletlen böngészőbezárás esetén.
  - Tanári jóváhagyású, adatvesztés nélküli gépváltás (`authorizeSeatChange`) célgépes védelemmel (`targetPcNumber`).
  - Téves névfoglalás azonnali törlése (`resetParticipant`).
* **Valós idejű tanári vezérlőpult (Admin Dashboard):**
  - WebSocket (Socket.io) alapú élő mátrix 42 munkaállomás párhuzamos felügyeletére.
  - Valós idejű fókuszvesztés-számláló (puskázásgátló monitorozás).
  - Egykattintásos tanári pontszám- és státuszfelülbírálás (`overrideAnswer`) szigorú pontplafon-ellenőrzéssel.
* **Tantermi kivetítő (Space Race):**
  - Projektorra optimalizált csapatverseny felület valós idejű rakétaanimációval és anonim eredménytáblával.
* **KRÉTA- és archívumi exportok:**
  - Csoportos Excel munkafüzet (.xlsx) színes cellákkal és osztályátlaggal.
  - Önálló, offline, interaktív HTML-jelentés (.html) szűrőkkel és anonimizálással.
  - Egyéni tanulói értékelőlapok tömörített ZIP archívumban és nyomtatható A4-es PDF sablonban.
  - Teljes SQLite adatbázis-archiváló motor (`backup.js`).
