# Változási napló (CHANGELOG)

Minden lényeges módosítás, hibajavítás és funkcióbővítés ebben a fájlban kerül rögzítésre a [Keep a Changelog](https://keepachangelog.com/hu/1.0.0/) ajánlásai, a [Szemantikus verziószámozás](https://semver.org/lang/hu/) (SemVer) irányelvei, valamint a magyar helyesírás szabályai (MTA 12. kiadása) szerint.

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
