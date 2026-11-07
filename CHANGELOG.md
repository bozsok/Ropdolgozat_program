# Változási napló (CHANGELOG)

Minden lényeges módosítás, hibajavítás és funkcióbővítés ebben a fájlban kerül rögzítésre a [Keep a Changelog](https://keepachangelog.com/hu/1.0.0/) ajánlásai, a [Szemantikus verziószámozás](https://semver.org/lang/hu/) (SemVer) irányelvei, valamint a magyar helyesírás szabályai (MTA 12. kiadása) szerint.

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
