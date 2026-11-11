# Változási napló (CHANGELOG)

Minden lényeges módosítás, hibajavítás és funkcióbővítés ebben a fájlban kerül rögzítésre a [Keep a Changelog](https://keepachangelog.com/hu/1.0.0/) ajánlásai, a [Szemantikus verziószámozás](https://semver.org/lang/hu/) (SemVer) irányelvei, valamint a magyar helyesírás szabályai (MTA 12. kiadása) szerint.

---

## [1.5.0] – 2026-11-11

### Főoldali „Calm Learner” arculat, 100% offline helyi betűkészletek (Nunito Sans & Material Symbols), tantermi gépszám-kijelzés és Best Practice font-renderelés

A diákok vizsgadrukkját csökkentő, meleg és letisztult intézményi dizájn („Calm Learner”) megvalósítása külső keretrendszerek (Tailwind) nélkül, a 100% offline működést garantáló helyi betűkészlet-architektúra kialakítása, valamint a tantermi azonosítást segítő gépszámozási rendszer bevezetése.

#### Hozzáadva (Added)
* **100% Offline helyi betűkészletek és ikonkészlet integrációja:**
  - **Fájlok:** [`public/fonts/nunito-sans-latin.woff2`](file:///d:/dev/Röpdolgozat%20program/public/fonts/nunito-sans-latin.woff2), [`public/fonts/nunito-sans-latin-ext.woff2`](file:///d:/dev/Röpdolgozat%20program/public/fonts/nunito-sans-latin-ext.woff2), [`public/fonts/nunito-sans.ttf`](file:///d:/dev/Röpdolgozat%20program/public/fonts/nunito-sans.ttf), [`public/fonts/material-symbols-outlined.woff2`](file:///d:/dev/Röpdolgozat%20program/public/fonts/material-symbols-outlined.woff2), [`public/fonts/material-symbols-outlined.ttf`](file:///d:/dev/Röpdolgozat%20program/public/fonts/material-symbols-outlined.ttf)
  - A szigorúan zárt iskolai helyi hálózat (LAN) elvárásainak megfelelően a modern, kerekded Google Nunito Sans betűcsalád és a Google Material Symbols Outlined ikongyűjtemény a helyi kiszolgáló `public/fonts/` könyvtárába került letöltésre és beépítésre.
  - A rendszer egyetlen külső CDN-t, Google Fonts hivatkozást sem vesz igénybe; az összes kliensgép teljesen offline módban, azonnal betölti az arculati elemeket.

* **„Calm Learner” diák főoldal és felhasználói élmény:**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js)
  - A `Source/Terv/Főoldal` alapján átültetett arculat: meleg narancssárga márkahangsúly (`#ea580c`), nyugodt háttérszínek (`#fbf8fc`, `#f5f3f6`), 20 px lekerekítésű kártyák és finom kártyaárnyékok.
  - Szigorúan CSS-keretrendszerek (Tailwind) nélkül, tiszta Vanilla CSS3 és HTML5 technológiával, az `!important` szabály teljes mellőzésével.
  - **3 lépéses vizuális folyamatjelző (Stepper):** Látványos, számozott körjelvényekkel jelölt lépések (1. Tantárgy → 2. Osztály → 3. Diák neve), amelyek azonnali vizuális visszajelzést adnak a kitöltöttségről.
  - **Megnyugtató indítási sáv:** Diszkrét ikonnal kísért biztató üzenet a feszültségmentes dolgozatkezdéshez.
  - **Modernizált tanári belépési modál:** Kártya alapú felugró ablak jelszóelrejtő/felfedő szem-ikonnal, ESC és Enter billentyűk kezelésével.
  - **Calm Learner stílusú Space Race csapatválasztó:** 4 oszlopos színes kártyák (Kék, Piros, Zöld, Sárga) mikroanimációkkal és kiemeléssel.

#### Módosítva (Changed)
* **Fejléc optimalizálása – Tantermi gépszám a tanév helyett:**
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

### Egyetlen közös belépési kapu, kompakt 3 lenyíló listás diákfelület és standard osztálynévsorok

A tantermi használhatóság egyszerűsítése érdekében bevezetett egységes belépési felület, a görgetésmentes 3 lenyíló listás csatlakozási folyamat és az intézményi standard osztályok integrációjának összefoglalása.

#### Hozzáadva (Added)
* **Egyetlen közös felület a tanárnak és a diáknak (Single Entry Point):**
  - **Fájlok:** [`public/student.html`](file:///d:/dev/Röpdolgozat%20program/public/student.html), [`public/js/student.js`](file:///d:/dev/Röpdolgozat%20program/public/js/student.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A szerver fő címe (`http://<szerver_ip>:3000/`) vált a teljes tanterem egyetlen közös kapujává; a pedagógusnak és a diákoknak többé nem kell külön alútvonalakat megjegyezniük.
  - A közös fejléc jobb oldalára diszkrét **`🔐 Tanári belépés`** gomb és beépített jelszókérő modal ablak került.
  - Sikeres tanári bejelentkezést követően a rendszer automatikusan átirányít az adminisztrációs vezérlőpultra ([`/admin`](file:///d:/dev/Röpdolgozat%20program/public/admin.html)).

* **Kompakt, görgetésmentes 3 lenyíló listás (`<select>`) diák csatlakozási kártya:**
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
* **Korábbi dolgozatok és eredmények archívuma (Reports felület és API):**
  - **Fájlok:** [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js), [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js)
  - A tanári vezérlőpulton új **📑 Eredmények (Reports)** fül (`tab-reports`) került kialakításra, ahol a pedagógus időrendben áttekintheti az összes korábbi és folyamatban lévő dolgozatot.
  - Szerveroldali adatbázis-lekérdezés (`getAllSessions()`) és védett REST API végpont (`GET /api/admin/sessions`), amely visszaadja a dolgozatok alapadatait (dátum, tantárgy, évfolyam, dolgozat címe, osztály, létszám, lezárt vagy aktív állapot).
  - Kliensoldalon dinamikus keresőmező az azonnali szűréshez (dolgozat címe, tantárgy, osztály vagy évfolyam szerint), valamint közvetlen exportgombok a táblázat minden sorában: **👁️ Mátrix**, **📊 Excel**, **🌐 HTML**, **📦 ZIP** és **🖨️ PDF**.

* **Lezárt dolgozatok egyértelmű vizuális jelölése (Lezárt Archívum Mátrix nézet):**
  - **Fájlok:** [`public/admin.html`](file:///d:/dev/Röpdolgozat%20program/public/admin.html), [`public/js/admin.js`](file:///d:/dev/Röpdolgozat%20program/public/js/admin.js), [`public/css/style.css`](file:///d:/dev/Röpdolgozat%20program/public/css/style.css)
  - Amikor a tanár az Eredmények (Reports) fülről megnyitja egy lezárt dolgozat táblázatát (`switchSession`), a felület egyértelművé teszi az archív állapotot, megszüntetve a megtévesztő jelzéseket:
    - A fejléckapszula a zöld pulzáló `🟢 ÉLŐ` helyett diszkrét szürke hátterű **`⏹️ LEZÁRT ARCHÍVUM`** (`.live-badge.badge-finished`) jelvényre vált.
    - Az adminisztrációs navigációs fül felirata dinamikusan **`📊 Lezárt Dolgozat (Mátrix)`** szövegre módosul.
    - A dolgozat címe kiegészül a `[LEZÁRT ARCHÍVUM]` megjelöléssel, az adatsávban pedig megjelenik a lezárás pontos ideje (`Befejezve: YYYY-MM-DD HH:MM`).
    - A piros `⏹️ Dolgozat befejezése (Finish)` gomb elrejtődik, helyette a **`⏹️ Dolgozat lezárva`** állapotjelző látható.
    - Egy élő csatornára kattintva vagy új dolgozat indításakor a felület maradéktalanul visszatér a zöld `🟢 ÉLŐ` és `📊 Élő Dolgozat (Mátrix)` üzemmódba.

* **Részletes Windows Server 2022 üzembe helyezési és telepítési dokumentáció:**
  - **Fájl:** [`telepítés.md`](file:///d:/dev/Röpdolgozat%20program/telepítés.md)
  - Lépésről lépésre követhető, teljes körű rendszergazdai útmutató készült az éles tantermi környezet kialakításához: pendrive-os fájlmásolás, Node.js LTS környezet beállítása, Windows Defender tűzfalszabály létrehozása a 3000-es porthoz, automatikus indítás konfigurálása a rendszerindítási mappába (`shell:common startup`), valamint a tanulói munkaállomások asztali parancsikonjainak előkészítése.

#### Javítva (Fixed)
* **Nyomtatható A4 PDF nézet dinamikus munkamenet-hozzárendelése (Print Report Fallback):**
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
