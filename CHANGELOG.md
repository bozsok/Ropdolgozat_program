# Változási napló (CHANGELOG)

Minden lényeges módosítás, hibajavítás és funkcióbővítés ebben a fájlban kerül rögzítésre a [Keep a Changelog](https://keepachangelog.com/hu/1.0.0/) ajánlásai, a [Szemantikus verziószámozás](https://semver.org/lang/hu/) (SemVer) irányelvei, valamint a magyar helyesírás szabályai (MTA 12. kiadása) szerint.

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
