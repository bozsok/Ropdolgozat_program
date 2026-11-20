# Okoskodó – éles tantermi próba előtti átvilágítás

**2026. november 20. · v1.22.0 · Git 343337d**

## Vezetői összefoglaló

A jelenlegi állapotban az első próbát szintetikus névsorral és próbakérdésekkel érdemes megtartani. Valódi névsorral vagy KRÉTA-ba kerülő jegyekkel a tanári Socket.IO-adatok hozzáférése, az értékelési előzmények változása, az egyéni határidő lezárása és a megbízható visszaállítás érdemel elsőbbséget. A tanári léptetés külön kiadási döntést igényel, mert a felületen választható, a hozzá tartozó működés azonban hiányos.

| Első döntés | Bizonyíték | Első éles elfogadási feltétel |
|---|---|---|
| Tanári és diák adatfolyamok | A Socket.IO a teljes tanári mátrixot a diákokkal közös szobába is küldi. A tanári szerepet a kliens jelenti be. | Szerveroldali szerep- és munkamenet-ellenőrzés, ellenőrzött adatkészlet mindhárom megjelenítő számára. |
| Feladattár és történeti értékelés | A dolgozat a szerkeszthető kvízt olvassa. A mentett válasz megmaradhat, miközben a hozzá tartozó szöveg, kulcs vagy pontmaximum megváltozik. | Az újra megnyitott és újra exportált alkalom ugyanazt a kérdést, pontmaximumot és jegyet adja. |
| Határidő és közös rajt | A lejáratkor végzett befejezés a hibával együtt visszagördül. A verseny váróterme mögött a szerver már kiadja a feladatokat és a belépéstől számolja az időt. | A szerver tartósan lezárja a lejárt munkát, a közös rajt előtt a verseny feladatai és válaszadása zártak. |
| Importált feladatok pontozása | A Socrative PDF-import betűjelet tárolhat helyes válaszként, a diákfelület és a pontozó válaszszöveggel dolgozik. | Egy érintetlenül importált, megoldókulcsos mintán a tényleges diákválaszok a kulccsal egyező pontot kapnak. |
| Mentés és visszaállítás | A ZIP az élő adatbázisfájlt olvassa. A visszaállítás több lépésből áll, részleges hibára nincs automatikus visszaállás. | Sikeres mentés–visszaállítás próba az iskolai Windows-csomagon, ellenőrzött képekkel, előzményekkel és helyreállítási idővel. |
| Üzembe helyezés és személyes adatok | A konfiguráció ismert tartalék titkokat ad. Az üzemeltetési és alkalmazásbeállítások még több ponton különböző állapotot írnak le. A Git fájllistájában tanulói exportok vannak. | Végleges PIN és titok, hozzáférési kör, tiszta telepítési csomag és adatok nélküli próba. |

## Hatókör és értelmezés

A vizsgálat kiterjedt a Node/Express kiszolgálóra, a HTTP- és Socket.IO-folyamatokra, a SQLite-sémára, migrációkra és adattárakra, a diák-, tanári-, kivetítő- és nyomtatási nézetre, a pontozásra, a névsor- és kvízimportokra, a fájlkezelésre, az exportokra, a Windows-indításra és a regressziós szkriptekre. A követelményeket a `project-context.md`, `PRD.md`, `AI_RULES.md`, `README.md`, `telepítés.md`, a változási napló és az előző audit releváns döntései alapján értelmeztem. A hivatkozott sorszámok a vizsgált munkapéldányhoz tartoznak.

- **Kód** – a forrásból közvetlenül következő megállapítás. A biztonsági megállapításokat forrásolvasással ellenőriztem.
- **Futtatás** – a mellékelt szkriptekből vagy a normál funkciók izolált, szintetikus próbájából kapott eredmény.
- **Döntés** – tantermi vagy adatkezelési szabály, amelyhez több legitim megoldás tartozik.
- **Mérendő** – a célgépen, böngészőben vagy meghatározott terhelés mellett igazolandó feltételezés.

Az offline LAN, a build nélküli frontend, az egyfolyamatos SQLite és a gépelés nélküli diákbelépés a felülvizsgálat alapfeltétele. A formatív visszajelzés, a szabad tesztszerkesztés és az archívum törlésének lehetősége dokumentált termékdöntés. A jelentés ezek mellékhatásait és a szerveroldali megvalósítás eltéréseit vizsgálja. A létező adatbázis és a tanulói fájlok tartalmát nem használtam. A `Source` előzetes, részben még nem commitolt átrendezését érintetlenül hagytam.

## 1. Biztonság és hozzáférés

### 01 · Kritikus · Kód – A teljes élő mátrix átlépi a tanári hozzáférési határt

`src/sockets/liveHandler.js:7–25`, `src/routes/api.js:594–636, 719–725, 896–900, 958–964`, `src/db/sessionRepo.js:815–904`.

A HTTP mátrix tanári hitelesítést igényel, a Socket.IO-t ez a middleware nem védi. A szobába lépés szerveroldali szerep- és tagságellenőrzés nélkül történik, a kliens által közölt tanári szerep alapján teljes mátrixot küld. A válaszbeküldés, belépés, rajt és felülbírálás ráadásul olyan szobára küldi ugyanazt az adatot, amelyhez a rendes diákfelület is csatlakozik. Az eseményben kérdések, helyes válaszok, magyarázatok, tanulónevek, beadott válaszok, pontok és kapcsolódó metaadatok szerepelnek. A kód a közvetlen mátrixlekérésnél a lezárt alkalmakat sem szűri. Az azonnali formatív értékelés szándékából ez a teljes adatátadás nem következik.

Javítási irányként a szerver hitelesítsen minden érzékeny csatlakozást és eseményt, a tanári munkamenet lejáratát és visszavonását is érvényesítse. A tanári mátrix külön jogosultságú adatkészletet és szobát kapjon. A kivetítőnek elég az összesítés, a diáknak a saját alkalma állapota. A Socket.IO a kapcsolat middleware-ét kapcsolatonként egyszer futtatja, ezért a kapcsolat megnyitása és a későbbi művelet jogosultsága két ellenőrzési pont. [Socket.IO middleware](https://socket.io/docs/v4/middlewares)

### 02 · Magas · Kód – Tanári Socket.IO-műveletek szerepellenőrzés nélkül

`src/sockets/liveHandler.js:28–61, 99–105`, `src/db/sessionRepo.js:936–956`, `server.js:17–29`.

A tanári léptetés csak az azonosító és az index jelenlétét nézi, majd eseményt sugároz. A kiléptető esemény ugyancsak hitelesítés nélkül érhető el, de ma egy nem exportált `getParticipantById` hívásánál megáll, ezért az aktuális kódból nem következik működő távoli törlés. A hiányzó függvény egyszerű javítása jogosultsági védelem nélkül destruktív műveletet tenne elérhetővé. A szobakapcsolat és a résztvevő együtt ellenőrizendő. Több esemény a paramétert azonnal destrukturálja a típus ellenőrzése előtt, így az érvénytelen üzenetek kezelése folyamatstabilitási kockázat. A wildcard CORS a böngészős pollingnál tágítja az eredetek körét. Az eredetellenőrzés önmagában nem ad szerepjogosultságot. [Socket.IO szerverbeállítások](https://socket.io/docs/v4/server-options)

### 03 · Magas · Kód – Nyilvános alapkonfiguráció és megosztott tanári munkamenet

`config.js:4–8, 24–26`, `src/middleware/auth.js:5–35, 72–95`, `src/routes/api.js:71–91`.

A dokumentált tartalék PIN és a kódban lévő állandó tartalék aláírókulcs környezeti beállítás hiányában életbe lép. A bejelentkezésen nincs próbálkozáskorlát vagy fokozatos várakozás. A tanári token aláírt és időkorlátos, a kijelentkezés azonban csak az aktuális böngésző sütijét törli. Központi visszavonás és egyéni művelet-hozzárendelés nincs. Minden PIN-t ismerő tanár ugyanazzal a hatáskörrel pontozhat, törölhet, menthet és visszaállíthat. A megosztott PIN kis tanári körben tudatos egyszerűsítés lehet, de a jegyfelülbírálás és a restore műveleti naplója akkor is értékes. Éles konfigurációban legyen kötelező az erős PIN és a telepítésenként véletlen titok, a próbálkozások korlátozása és a kijelentkezés munkamenetre gyakorolt hatásának rögzítése.

### 04 · Magas · Kód és döntés – A helyi hálózat a szállítási és hozzáférési határ

`server.js:13–23, 77–78`, `src/middleware/auth.js:78–83`, `telepítés.md`, 2.4. szakasz.

A folyamat minden IPv4 interfészen HTTP-t szolgál ki. A leírt tűzfalszabály nem szűkíti a forrás-alhálózatot vagy a hálózati profilt. A tanári bejelentkezés, a diák munkamenet-adatai, a válaszok és azonosító tokenek így titkosítatlanul utaznak a helyi hálózaton. Az offline működés és a belső TLS összeegyeztethető, ha a célgépek megbíznak a helyi hitelesítőben. Ha az első szintetikus próbán marad a HTTP, a szegmentált hálózat és a szűkített tűzfalszabály csökkenti az elérhető felületet. Külön ellenőrizendő, milyen szerverinterfészek és klienshálózatok érik el a portot ténylegesen.

### 05 · Magas · Kód és döntés – A névválasztás és a részvételi jogosultság összemosódik

`src/routes/api.js:98–125, 703–742`, `src/db/sessionRepo.js:319–328, 437–464`, `DATABASE_SCHEMA.sql:28–36, 123–144`.

A névsor nyilvános végpontja teljes nevet, azonosítót és foglaltságot ad. A belépés a kliens által küldött nevet menti, az azonosítóhoz tartozó nevet, osztályt és a dolgozat csatornájához tartozást nem egyezteti a hivatalos névsorral. Az idegen kulcs az azonosító meglétét ellenőrzi. Egy név első kiválasztása a modellen belül nem bizonyítja a tanuló személyazonosságát. A gépelés nélküli tantermi élmény megőrizhető azzal, hogy a szerverhez kötött hallgatói névsorigazolás és a tanári órai felügyelet szerepe egyértelmű. A teljes névsor láthatóságáról, az egyetlen osztályra vagy az egész évfolyamra megnyitott alkalomról és a saját név első foglalásának védelméről külön döntés szükséges.

### 06 · Magas · Kód – A Report 13 célgépes gépváltása a normál felületen nem érvényesül

`public/js/admin.js:1131–1137, 1205–1211`, `src/routes/api.js:644–658`, `src/db/sessionRepo.js:324–373, 538–569`, `public/js/student.js:928–939`.

A tanári gomb nem küld célgépet, ezért a szerver általános engedélyt rögzít. A válaszok megmaradnak, a régi token lecserélődik. A célgépet használó ág a böngésző saját gépszámállítását hasonlítja össze, ez a szám munkaállomás-hitelesítésre alkalmatlan. Az engedélyhez nincs időtartam, a rotáció feltételében a korábbi ideiglenes állapot nincs egyetlen atomi ellenőrzéshez kötve. Egy tanár által átadott rövid életű, egyszer használható átvételi kód megtarthatja a már bevált elkülönítést a gépváltás és a téves név törlése között. A Report 12 szkript a célgépet közvetlen adattárhívással adja át, ezért a gomb tényleges alapértelmezését nem fedi le.

### 07 · Magas · Kód – A gépváltási és téves névfoglalási állapot nem érkezik meg a megfelelő képernyőkre

`src/routes/api.js:644–691`, `src/services/presenceService.js:19–28, 133–144`, `public/js/student.js:242–298, 865–908`.

A HTTP műveletek más nevű eseményt küldenek, mint amelyre a tanulói felület reagál. Az engedélyezési és reset útvonal nem használja a memóriabeli névfoglalás feloldását, a foglaltsági lekérdezés pedig aktívnak tekinti a gépváltásra váró résztvevőt is. Így a célgépen a név a normál legördülő útvonalon foglaltnak látszhat, a régi gép pedig a következő szerverkérésig a meglévő képernyőn maradhat. A külön Socket.IO-kilépési esemény diákkezelője nem ellenőrzi, hogy az üzenet a saját résztvevőt érinti. A teljes útvonalat két valódi böngészővel kell elfogadni, leadott válasszal, a régi képernyő és a névsor állapotának megfigyelésével.

### 08 · Magas · Kód – Az exportált HTML adatot közvetlenül jelölőnyelvbe illeszt

`src/services/exporter.js:202–215, 244–290, 322–396`, `src/routes/api.js:987–1007`, `public/print-report.html:93–144`.

A csoportos HTML sablon a címet, évfolyamot és nevet szöveg- és attribútumkontextusba illeszti escape nélkül. A ZIP-ben lévő egyéni HTML ugyanezt teszi a kérdéssel, megoldással és a tanuló beírt szöveges válaszával. Ez megnyitáskor az export tartalmának módosulását és a böngészőben aktív tartalom megjelenését okozhatja. Az egyéni fájl megnyitási környezetétől függ a többi következmény. Már hétköznapi HTML-jelölők, például a tananyagban szereplő `<` és idézőjel is hibás megjelenést vagy sérült attribútumot okozhat. A nyomtatható sablon a fő feliratoknál már escape-el. A generátorok kontextushelyes szöveg- és attribútumkezelése, valamint az egyéni fájl szkriptmentes kialakítása közvetlenül kezeli az eltérést.

### 09 · Magas · Kód – A nyilvánosan kiszolgált feltöltések között aktív formátum is van

`src/routes/api.js:32–65, 501–507`, `server.js:37–48`.

A képfeltöltés kiterjesztésen és a feltöltő által küldött MIME-típuson futtat szöveges mintát, a szerver nem dekódolja vagy validálja az állományt. SVG engedélyezett, és a feltöltött fájl közvetlen URL-je az alkalmazás eredetéről elérhető. Képbe ágyazás és önálló dokumentumként megnyitás eltérő böngészős kontextus. A feltöltés tanári jogosultságú, ezért ez elsősorban átvett tananyag, mentés vagy megosztott URL esetén számít. Érdemes pontos formátumlistát, tényleges dekódolást, SVG esetén elkülönített kiszolgálást vagy tisztítást, valamint méret- és pixelszámkorlátot használni. A publikus képútvonalat a vizsgafeladatok bizalmassági szabályával össze kell hangolni.

### 10 · Közepes · Kód – A diák hitelesítő a címsorhoz és a böngészőlap életciklusához kötődik

`public/js/student.js:228–233, 967–1009, 1039–1045, 1536–1542`, `src/routes/api.js:737–742, 750–759, 950–966`.

A diák adatlekérés URL-paramétert használ, miközben a szerver fejléces tokent is elfogad. A teljes URL üzemeltetési hozzáférési naplóba vagy böngésződiagnosztikába kerülhet. A szervernek nincs explicit `no-store` szabálya a személyes diák- és tanári válaszokra. A `sessionStorage` lapfrissítéskor működik, a lezárt lapból normál új parancsikon-indításnál a korábbi token nem áll rendelkezésre. Ez érthető a következő órán ugyanazt a gépet használó új tanuló miatt, de ütközik a telepítési útmutató böngészőbezárásra adott biztos helyreállítási ígéretével. Fejléces token, jól definiált helyreállítási szabály és a szükséges mezőkre leszűkített belépési/befejezési válaszok érdemelnek ellenőrzést. [MDN – sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)

### 11 · Közepes · Kód és döntés – Az anonim megjelenítés mögött név szerinti adatok maradnak

`public/js/projector.js:134–163, 170–242`, `src/services/exporter.js:273–311`.

A kivetítő teljes tanári adatkészletből képez összesítést. A csoportos HTML névelrejtése után a név a fájlban és a DOM attribútumaiban marad, a kereső továbbra is a név alapján szűr. A kivetítéshez és a fájl kiadásához két külön termékszabály szükséges. A vizuális névelrejtés kivetítőn hasznos, név nélküli megosztható fájl esetén a generált kimenetnek eleve el kell távolítania az azonosítókat.

### 12 · Magas · Kód és gyártói tájékoztató – A telepített Multer régi sérülékeny ágon van

`package-lock.json`, `src/routes/api.js:22–65, 210, 441, 501, 1054`.

A ténylegesen telepített és a lockfájlban lévő Multer `1.4.5-lts.2` beleesik a gyártó által jelzett, szolgáltatásmegtagadást okozó CVE-2025-47935 és CVE-2026-3520 verziótartományába. Az itteni feltöltési útvonalakon a tanári middleware előbb fut, így a csomagszintű közlemény anonim elérhetőségét nem szabad automatikusan az alkalmazásra vetíteni. A csomagban ellenőrzött Engine.IO `6.6.11`, Socket.IO parser `4.2.7` és `ws 8.21.3` újabb a kiválasztott Socket.IO közleményekben szereplő első javított verzióknál. Ez célzott gyártói ellenőrzés. A teljes tranzitív függőségi fa érvényességét mérni szükséges a kiadási csomag összeállításakor, az offline szerveren telepítés nélkül. [Multer CVE-2025-47935](https://github.com/expressjs/multer/security/advisories/GHSA-44fp-w29j-9vj5) · [Multer CVE-2026-3520](https://github.com/expressjs/multer/security/advisories/GHSA-5528-5vmv-3xc2) · [Socket.IO gyártói tájékoztatók](https://github.com/socketio/socket.io/security)

### 13 · Közepes · Kód – Az admin és a nyomtatási oldal statikus belépési pontjai eltérnek

`server.js:36–52, 54–60`, `src/routes/views.js:9–27`, `public/print-report.html:45–76`.

A szerver a `public` könyvtárat a nézetútvonalak előtt szolgálja ki. A `/print` védett útvonala mellett a HTML-sablon önmagában elérhető. A sablon mátrixlekérése külön tanári ellenőrzés mögött van, ezért ez önmagában nem bizonyít adatkiadást. Ugyanez a különbség fontos a nyilvános tanári bejelentkező sablon és a tanári API-k között. Az alkalmazás által visszaadott belső hibaüzenetek, az eltérő JSON-hibaformák és a hiányzó egységes tartalmi fejlécek külön másodlagos keményítési feladatok. A nyomtatási nézet jogosultsági szabályát a közvetlen és a rövid útvonalon egyformán érdemes értelmezni.

## 2. Dolgozatmódok, időzítés és kliensállapot

### 14 · Magas · Kód és futtatás – A lejárat elutasítja a választ, a lezárást visszagörgeti

`src/db/sessionRepo.js:619–660, 729–732`, `src/routes/api.js:750–759, 878–918`, `public/js/student.js:1900–1923`.

A válaszmentési tranzakció lejáratkor beállítja az `is_finished` mezőt, majd hibát dob ugyanabban a tranzakcióban. A hiba a frissített befejezési állapotot is visszagörgeti. Az elkülönített próba elutasította a lejárt résztvevő válaszát, miközben a mátrix befejezetlenként mutatta, nulla mentett válasszal. A lekérdezés sem véglegesíti a lejárt állapotot. A kód pontos egyenlőségnél még elfogadhatja a választ, a dokumentált szabály szigorúan korábbi beérkezést kíván. A tartós lezárást és az elutasított válasz státuszát együtt kell megtervezni. A komment `BEGIN IMMEDIATE`-et ígér, a kód a tranzakció normál `tx()` hívását használja. Ez külön vizsgálandó, ha két adatbázis-kapcsolat írhat egyszerre.

### 15 · Magas · Kód – A tanári léptetés felületen választható, a haladás az önálló módé

`public/admin.html:1030–1035`, `src/sockets/liveHandler.js:34–38`, `public/js/student.js:242–299, 1367–1379, 1507–1517`, `src/db/sessionRepo.js:619–670`.

A szerver eseménye nem menti a kérdésindexet. A tanári felületen a mód kiválasztása megvan, a tényleges léptető művelethez és a diákoldali esemény követéséhez nem találtam végigvezetett útvonalat. A diák ugyanazzal a következő kérdés logikával halad, és a szerver nem köti a beküldést egy tanár által megnyitott kérdéshez. Előbb a mód elvárt négy állapotát kell rögzíteni (rajt, léptetés, késői belépés, újracsatlakozás). Ha a tanári léptetés kimarad az első kiadásból, a felület ígéretét és a dokumentációt ehhez kell igazítani.

### 16 · Magas · Kód és döntés – A Space Race rajtja csak részben közös

`src/db/sessionRepo.js:429–434, 619–670, 910–916`, `src/routes/api.js:594–601, 831–861`, `public/js/student.js:258–275, 1059–1090`.

A UI rajt előtti várót mutat, a lekérdezés már ekkor tartalmazza a kérdéseket. A válaszmentés nem ellenőrzi a rajtállapotot. Az egyéni határidő csatlakozáskor indul, így a korábban csapatot választó diák kevesebb tényleges válaszidőt kaphat. Az indító művelet az aktív állapotot nézi, a Space Race módot és az ismételt rajtot külön nem ellenőrzi. A közös rajt választása tantermi szempontból következetes, ha a szerver nyitja a kérdéseket és ugyanettől kezdve számol időt. A későn érkező diák és az újrarajtolás szabályát ugyanekkor érdemes dönteni.

### 17 · Magas · Kód – Válaszadás és befejezés csak részben kötődik a kiosztott kérdésekhez

`src/db/sessionRepo.js:410–427, 521–528, 619–727`, `src/routes/api.js:878–893, 950–966`.

A válaszmentés a kvízhez tartozást vizsgálja, a résztvevő rögzített kérdéslistáját, a törlés után megőrzött kérdések kizárását, a leadási sorrendet és a mód szerinti jogosultságot nem. A befejezés a kvíz aktuálisan látható kérdéseinek számát az összes mentett válasszal veti össze. A saját lezárási API külön ellenőrzés nélkül befejezheti az adott résztvevőt hiányzó válaszok mellett. A részleges leadás lehet pedagógiai döntés. A szervernek a rögzített kiosztást és az engedélyezett leadási állapotot kell közös alapként kezelnie.

### 18 · Magas · Kód – A visszajelzés kapcsolója és a szerver tényleges adatai eltérnek

`src/db/sessionRepo.js:234–242, 355–395, 722–728`, `src/routes/api.js:795–829, 863–868, 903–915`, `public/js/student.js:1367–1379, 1680–1885`.

A `show_feedback_on_end` mező egyszerre ad alapot az azonnali és a záró visszajelzéshez. Elrejtéskor a válaszbeküldés nullázza az egyes mezőket, de a tanuló adatlekérése továbbra is kiadja az egyes értékeléseket, pontokat és összesítést, a belépési helyreállítás szintén visszaad értékelési adatokat. Engedélyezéskor az egész kérdéssor megoldása egyénileg befejezett résztvevőnek kiadható akkor is, amikor mások még írnak. A `project-context.md` azonnali formatív javítást dokumentál, az `AI_RULES.md` a teljes alkalom lezárásához köti a helyes válaszokat. Az egyes beállításokhoz külön, egyértelmű adatszabály kell a leadás előtti, egyéni beadás utáni és tanári lezárás utáni állapotban.

### 19 · Közepes · Kód – Elveszett HTTP-válasznál az ismételt beküldés más adatot ad

`src/db/sessionRepo.js:633–644, 722–728`, `src/routes/api.js:903–915`, `public/js/student.js:1338–1379, 1391–1409`.

A már rögzített első válasz megmarad, ami jó adatbázis-garancia. Az ismételt beküldésből hiányzik az első válaszág `isFinished`, `correctAnswer` és `explanation` adata. A böngésző az aktuálisan megadott választ menti a memóriájába, még akkor is, ha a szerver korábban egy másik szöveget fogadott el. Hálózati bizonytalanság esetén az ismétlésnek ugyanazt a kanonikus választ, befejezettséget és az adott visszajelzési módnak megfelelő adatot kell visszaadnia.

### 20 · Magas · Kód – Socket.IO-kimaradás után a böngészők nem építik újra az élő állapotot

`public/js/student.js:242–298, 970–1010`, `public/js/admin.js:307–328, 388–398`, `public/js/projector.js:104–163`.

Az aktív szobába a kliensek megnyitáskor vagy váltáskor iratkoznak fel. A diák újracsatlakozáskor csak a névfoglaltságot kéri a belépőképernyőn. A tanári és kivetítő kódban sincs általános újracsatlakozási pillanatkép-betöltés. A hálózaton eltűnt rajt vagy lezárás után a felület a korábbi állapotban maradhat. A tanári és kivetítő váltás a korábban felvett szobát sem engedi el, így több alkalom eseményei érkezhetnek ugyanarra a kapcsolatra. Az alkalmazásnak kapcsolódáskor újra fel kell vennie az aktuális tagságot és újra le kell kérnie a szerver állapotát. [Socket.IO kézbesítési garanciák](https://socket.io/docs/v4/delivery-guarantees/)

### 21 · Közepes · Kód – A felület rossz sorrendben érkező adatoktól vagy idegen eseménytől visszaválthat

`public/js/admin.js:311–327, 388–426`, `public/js/student.js:279–297, 810–874`, `public/js/projector.js:104–159`.

A párhuzamos tantárgy-, osztály- vagy alkalomváltások korábbi HTTP-válaszait nem köti kérésazonosító az aktuális kiválasztáshoz. Tanári nézetben az újabb már megjelenített állapotot egy régebbi kérés késői befejezése felülírhatja. A fókuszvesztés és a rajt tanári értesítése a korábban felvett szobák miatt idegen alkalomról is megjelenhet. A másik tanár lezárását követően az aktív sáv frissül, az éppen megnyitott panelhez külön lezárási állapotkezelés hiányzik. A kérés és esemény érvényességét a kiválasztott alkalomhoz kell kötni.

### 22 · Közepes · Kód – Az időzítő a diák gépének óráját és a modál nyugtázását használja

`public/js/student.js:1324, 1523–1558, 1755–1764, 1897–1938`, `src/db/sessionRepo.js:429–434, 652–659`.

A határidő a szerveren képződik, de a hátralévő időt a kliens saját órájából számítja. A lefelé kerekítés a szerveri határidő előtt jelenítheti meg a nullát. A tanulói befejezés a lejárati ablak nyugtázási függvényébe került, és az első időzítőfrissítés az intervallumazonosító beállítása előtt fut. A `finishQuiz` sikertelen POST esetén is megpróbálja az összesítőt megmutatni. Az elfogadási próba tartalmazzon eltérő kliensórát, háttérbe tett böngészőt és határidőkor megszakadt hálózatot. A szerver által megadott időeltérés és az önálló szerveroldali állapotváltás külön kezeli a megjelenítést és a mentést.

### 23 · Közepes · Kód és döntés – A jelenlét osztályszintű, a dolgozat csatornaszintű

`src/services/presenceService.js:19–52, 61–105, 114–145`, `public/js/student.js:286–298, 865–908`.

Az adatbázisos foglaltság minden aktív tantárgyi alkalom résztvevőit egyesíti osztály szerint, beleértve az egyénileg befejezett diákot is. Ugyanaz a tanuló így egy másik tantárgy legördülő listájában foglaltnak látszhat, amíg egy napokig nyitott alkalom aktív. A memóriabeli névválasztás hosszabb ideig megmaradhat élő kapcsolatnál. Az adatbázisos és a memóriabeli állapot különböző élettartamú, a HTTP-belépés pedig a memóriabeli foglalást nem ellenőrzi. Először azt kell eldönteni, hogy egy tanuló foglaltsága osztályra, gépre vagy alkalomra vonatkozik.

### 24 · Közepes · Kód és döntés – A csapatpontok és a fókuszvesztés csak részleges jelzőszámok

`public/js/projector.js:185–221`, `src/routes/api.js:923–945`, `src/db/sessionRepo.js:506–515`, `public/js/student.js:1926–1938`.

A Space Race összes pontot és létszámot jelenít meg, a rakéta helye a csapattagok számából számolt maximummal arányos. Későbbi belépés változtathat ezen a maximumon és a helyezés érzetén. A csapatkiosztás önkéntes, a szerver nem kényszerít kiegyenlítést vagy egységes színlistát. A fókuszesemény a dokumentum láthatóságát figyeli, nem bizonyítja, hogy a tanuló mit csinált. A szerver a résztvevő befejezettségét nem ellenőrzi a növelés előtt, a lezárt alkalom esetében a trigger lehet a végső védvonal. A két jelzés célját és értelmezését a tanári felületen is érdemes egyértelművé tenni.

## 3. Adatintegritás, szerkesztés és jegyek

### 25 · Kritikus · Kód és futtatás – Az archívumban változhat a lezárt dolgozat jelentése és jegye

`src/db/quizRepo.js:356–480`, `src/db/sessionRepo.js:81–129, 185–201, 815–895`, `src/routes/api.js:795–821`, `project-context.md`, 1.4. szakasz.

A válaszrekord és az eredeti gépi pontszám valóban védett, a kapcsolódó kérdés címkéje, szövege, sorrendje, kulcsa, magyarázata, pontértéke és képe szerkeszthető. A tanári mátrix és az export az aktuális kvízadatot és újraszámolt nevezőt használja, a diákoldali eredmény ugyancsak élő kvízből számol. Az elkülönített próbában egy lezárt dolgozat forrássablonján a maximális pont 1-ről 2-re változott. A mentett egy pont megmaradt, a tanári eredmény 100%-ról 50%-ra és ötösről kettesre változott. A válaszolt kérdés modellje akár más tartalmú kérdéssé is átalakítható ugyanazzal az azonosítóval. Ez a dokumentált szabad feladattár és a dokumentált történeti jegymegőrzés ütközése. Dolgozat indításakor rögzített feladatverzióval vagy változatlan pillanatképpel a tanári szerkesztés és a történeti hitelesség együtt biztosítható.

### 26 · Magas · Kód – Futó dolgozatban a kiosztás és a javítókulcs eltérhet

`src/db/quizRepo.js:377–475`, `src/db/sessionRepo.js:413–427, 663–710`, `src/routes/api.js:762–801`.

A már belépett tanuló rögzített kérdésazonosítókat kap, a később belépő már az új feladatsort. Ha a meglévő kérdést közben szerkesztik, a tanuló a régi szöveg alapján válaszolhat, miközben a szerver az új megoldással értékel. Törlésnél a kérdés eltűnhet a helyreállított nézetből, vagy a már letöltött felületen látszik, de a szerver elutasítja. Új kérdésnél a befejezés számítása az aktuális teljes kérdésszámot nézi. Ez a 25. pont történeti problémájától külön, már órán is okozhat eltérő feltételeket két tanulónak.

### 27 · Magas · Kód – Az eltávolított kérdések szűrése és az azonosítók megfeleltetése eltér

`src/db/quizRepo.js:98–146, 377–428, 462–475`, `src/db/sessionRepo.js:81–89, 413–418, 709–710, 821–842`, `public/js/admin.js:3100–3166`.

A megőrzött kérdéseket az adatbázis a sorszám magas tartományával különíti el. Az új kiosztás és kvíznézet szűri őket, az archívum listájának pontmaximuma és a tanári mátrix megőrzi őket ugyanabból a kvízből az összes alkalomra. Ezzel egy régi kérdés új dolgozat nevezőjébe is bekerülhet. Az index szerinti kompatibilitási megfeleltetés akkor fut, ha új szerkesztőelemhez nincs azonosító. A korábbi rekordok lekérdezése ezen a ponton nincs explicit sorrendbe állítva. Új, beszúrt vagy áthelyezett elemnél az index nem stabil kérdésazonosító. Külön regresszió kell régi kliens mentésére, beszúrásra, átrendezésre és történeti kérdés megtartására.

### 28 · Magas · Kód és döntés – Kvíz törlése alkalmakat töröl, aktív alkalom is törölhető

`src/db/quizRepo.js:620–634`, `src/db/sessionRepo.js:922–933`, `src/routes/api.js:420–427, 580–589`, `public/js/admin.js:2046–2078, 3714–3734`.

A kvíz törlése a kérdések mellett a kapcsolódó résztvevőket, válaszokat és aktív vagy lezárt alkalmakat is törli. A dolgozattörlés beolvassa a státuszt, külön aktív védelmet nem alkalmaz. Törlés után a kliensoldali aktív képernyők nem kapnak azonos hatású munkamenet-lezárást. A törlési jog szándékos. A döntési felülethez tartozik, hogy a tanár lássa a kapcsolódó alkalmak számát és jellegét, és mi történjen egy futó dolgozat adataival. A feladattár törlését és az értékelési előzmények törlését érdemes két kifejezett hatásként kezelni.

### 29 · Magas · Kód – Az azonos nevű, külön osztálybeli diákok összeütközhetnek

`DATABASE_SCHEMA.sql:28–36, 123–144`, `src/db/sessionRepo.js:319–328, 289–303`, `src/db/rosterRepo.js:89–121, 149–198`.

Az évfolyamcsatornába több osztály kerülhet. A résztvevő egyediségét a dolgozat és név párosa adja, a helyreállítás pedig azonosítóra vagy névre keres. Azonos nevű, eltérő azonosítójú tanulók nem képeznek két független résztvevőt ugyanabban az alkalomban. A névsorban egy osztályon belül is eldöntendő, miként különböztethetők meg. Névsor törlésekor a diákazonosító nullázható. Az osztálynév csak a lezáráskor a még elérhető névsorból kerül a dolgozatba, így óra közbeni névsorfrissítés elveszítheti az eredeti osztály kapcsolatát. A név és osztály aláírt vagy rögzített részvételi pillanatképe azonosítóval együtt oldaná meg a két esetet.

### 30 · Közepes · Kód – Számként értelmezhető bemenet nem azonos a szám típusú bemenettel

`src/db/sessionRepo.js:258–268, 762–795`, `src/db/quizRepo.js:308–342, 412–420`, `src/services/grader.js:25–32`, `src/db/settingsRepo.js:69–100`.

A kézi pontozás véges értéket kér, de előbb `Number`-rel konvertál. Bizonyos karakterláncok, logikai értékek és tömbök így számmá válhatnak. A Report 13 típusra vonatkozó feltétele emiatt csak részben teljesül. A nulla pontos kérdés séma szerint lehetséges, a kvíz mentése és a kiértékelő viszont nullánál egy pontra vált. A felülbírálás külön ága nulla pontnál az `is_correct` értékét olyan módon állíthatja, amely ellentétes a `CORRECT` sémafeltétellel. Az indítás bejövő ponthatárait és időkorlátját is ugyanazzal a validációval kellene ellenőrizni, mint a beállításokat. Döntendő, hogy a nulla pontos kérdés támogatott vagy visszautasítandó.

### 31 · Közepes · Kód és döntés – A pontosság és a részpont jelentése nézetenként változhat

`src/services/grader.js:9–15, 85–140`, `src/db/sessionRepo.js:882–894`, `src/routes/api.js:795–801`, `src/services/exporter.js:378–388`, `public/print-report.html:117–135`.

A tanári mátrix a kerekítetlen összegből számol százalékot, a diák adatvégpontja előbb két tizedesre kerekíti a pontot. Tört pontok és ponthatárok mellett egy százalék vagy jegy eltérhet. A ZIP és a nyomtatási értékelés az `is_correct` kétértékű jelzőjéből képez helyes/hibás feliratot, így a `PARTIAL` könnyen teljesen helyesnek tűnhet. A rövid válasz normalizálása pedagógiai kompromisszum. Kisbetűsítés és szóköz-egységesítés hasznos köznyelvi válaszoknál, viszont kód, azonosító vagy képlet esetén a kis- és nagybetű, a szóköz és az alternatívaválasz-elválasztó jelentést hordozhat. Pontküszöbön és különböző kérdéstípusokkal ugyanazt az értékelést kell elvárni minden kimenettől.

### 32 · Közepes · Kód – Hiányzó és elavult adatok felismerése több helyen gyenge

`src/db/sessionRepo.js:208–268`, `src/db/quizRepo.js:297–348, 356–378, 701–763`, `public/js/admin.js:1387–1408, 3130–3180`.

Egy üres kvíz adattárszinten létrehozható, az indítás a létező kvíz hivatkozásán túl kevés tartalmi összhangot ellenőriz. A tantárgy, évfolyam és kvíz összetartozása főként kliensoldali választékszűrés. A szerkesztés nem küld elvárt verziót, ezért két tanár régi állapotból mentve észrevétlenül felülírhatja egymás munkáját. Néhány módosító vagy törlő adattárművelet a változott sorok számától függetlenül sikert jelezhet. A szerver oldja fel az azonosítókat, ellenőrizze az állapotot és legyen egyértelmű válasza az eltűnt vagy közben módosult adatra.

### 33 · Közepes · Kód – Az SQLite-init migrál és mintát tölt minden induláskor

`src/db/init.js:52–186, 186–277`, `start_server.bat:55–71`.

Az inicializálás oszlopok meglétéből következtet a migrációra, egyes hibákat naplózva továbbhalad, az alkalmazás két triggerét induláskor eldobja és a sémából újraalkotja. A `user_version` vagy más egységes sémaverzió hiánya nehezíti a megszakadt és régi telepítés megkülönböztetését. Az indítófájl előbb külön inicializálást futtat, a kiszolgáló modulimportja pedig újra futtatja. A beépített kvíz akkor is megjelenhet újra a következő indításkor, ha a tanár tudatosan eltávolította az összes tesztet. A minta előállítását és a verziózott sémaváltást külön életciklusban érdemes kezelni. Migráció után a szerkezeti és idegenkulcs-ellenőrzés adjon megfigyelhető eredményt.

### 34 · Közepes · Kód és döntés – Dátumok és átlagok eltérő fogalmakat képviselnek

`src/db/sessionRepo.js:41–149, 258–269, 283–305`, `public/js/admin.js:416, 3788–3805`, `src/services/exporter.js:64–73, 202–208, 322–328`, `public/print-report.html:104`.

Az archivált listában a válasz nélküli résztvevők kimaradnak a jegy- és százalékátlagból. Egyéni eredménynél ugyanez a résztvevő nulla pontot és jegyet kaphat. A nyers SQL átlag és a későbbi JS százalék-/jegyátlag külön mező, eltérő pontossággal. Az SQLite által generált UTC időt a tanári felület több helyen karakterláncként rövidíti, miközben a riport dátuma letöltéskor a helyi nap. A mérés dátuma, a kiállítás napja, valamint a belépett, válaszolt és leadott tanulók köre legyen külön és név szerint azonosítható. Ellenőrizni kell a magyar téli és nyári időt, illetve két külön napon letöltött azonos jelentést.

## 4. Import, feltöltés, export és mentés

### 35 · Magas · Kód – Névsorimport a részben beolvasott osztály meglévő tagjait törölheti

`src/routes/api.js:210–287`, `src/db/rosterRepo.js:149–198`, `public/js/admin.js:3500–3541`.

Az első munkalapról az A és G oszlopot olvassa. A CSV szöveges feldarabolása az idézőjeleket, az idézőjelen belüli határolót, a többsoros cellát és az egyéb kódolásokat nem kezeli. A `.xls` kiterjesztés ugyanabba az XLSX olvasóba kerül. A hiányos vagy részleges importálásnál az érintett osztály névsora alapból lecserélődik, így egy rossz oszlop vagy elszórt feldolgozási hiba érvényes tagot távolíthat el. Az előnézetben osztályonként látszódhatna a hozzáadás, megőrzés és eltávolítás, a tényleges fájlformátum- és fejlécellenőrzés után. KRÉTA-exportnál több munkalapos, idézőjeles és részleges mesterséges állomány szükséges az elfogadáshoz.

### 36 · Magas · Kód – A Socrative-import bizonytalan megoldókulccsal és kép-hozzárendeléssel is sikeres lehet

`src/services/socrativePdfParser.js:67–119, 151–179, 195–278, 284–350, 356–406`, `src/routes/api.js:441–498`, `scratch/test_socrative_import.js:14–53, 96–136`.

A parser a Socrative-export adott szerkezetét keresi. A kulcs nélküli vagy nem egyértelmű választ tartalmazó exporthoz az algoritmus alapértelmezett választ adhat, a kulcsos ág pedig szövegegyezés mellett prefixet is elfogad. Az ábrák hozzárendeléséhez oldalonként darabszámot és pozíciót használó heurisztika fut. A vizsgált projektmappában a két hivatkozott valódi PDF-fixture hiányzott. A teszt ilyenkor a képfinalizálás műpróbáját futtatja, a valódi PDF értelmezését nem. Az import előnézetében a bizonytalan megfeleltetéseket és a hiányzó kulcsokat tanári felülvizsgálatra kell jelölni, különösen KRÉTA-jegyet eredményező feladatsornál.

### 37 · Kritikus az érintett importált kvízeknél · Kód és futtatás – A PDF-kulcs és a pontozó külön formátumot használ

`src/services/socrativePdfParser.js:311–350, 392–400`, `src/routes/api.js:481–488`, `src/db/quizRepo.js:329–343`, `public/js/student.js:1232–1278`, `src/services/grader.js:38–79`.

Az ABCD import a megoldókulcsból betűjelet ír a `correct_answer` mezőbe, miközben a lehetőségek értéke a teljes szöveg. Igaz/hamis típusnál a parser `A` vagy `B` értéket tárol, a böngésző `Igaz` vagy `Hamis` értéket küld. A pontozó a választ közvetlenül a tárolt értékkel hasonlítja, az igaz/hamis aliasai között nincs `A` és `B`. A tiszta pontozófüggvénnyel ellenőrzött mindhárom ilyen párosítás nulla pontot adott, a helyes válaszszöveghez illeszkedő kontroll egy pontot. A parser közvetlenül menti a kvízt. A javításnál a parser és a kézi szerkesztő használjon azonos válaszformátumot, és ellenőrizni kell a korábban importált kvízeket és a belőlük már született eredményeket. A végső elfogadáshoz valódi Socrative mintából jöjjön létre a kvíz, majd tanári újramentés nélkül kapjon helyes pontot az eredeti diákválasz.

### 38 · Közepes · Kód – A bemeneti fájlméret nem korlátozza a feldolgozás erőforrásait

`src/routes/api.js:22–29, 219–222, 447–465`, `src/services/socrativePdfParser.js:13–20, 83–119, 139–145, 207–210`.

A 15 MB-os feltöltési határ a tömörített PDF/XLSX méretére vonatkozik. A PDF-kód szinkron bont, PNG-t szinkron épít, és a dimenziók alapján foglal memóriát. A korlát külön nem védi a kibontott adatméretet, a kép pixelszámát, oldalszámot vagy teljes munkát. Az importált XLSX szintén tartalmazhat nagy kibontott munkafüzetet. Egy nagy, akár jóhiszemű tananyag feldolgozása lefoglalhatja a dolgozatokat kiszolgáló folyamatot. Működési feltételként az iskolai használathoz elég lehet az import órán kívül, hosszabb távon a feldolgozási limitek és elkülönítés mérhetőbbek.

### 39 · Magas · Kód – A kép és a kérdésrekord eltérő időpontban válik véglegessé

`src/db/quizRepo.js:178–254, 255–283, 348–350, 478–480, 492–512, 518–544, 604–614`, `src/routes/api.js:452–487, 501–507`.

A kvíz tranzakciója képek véglegesítése előtt commitol. Az ideiglenes mozgatások és az egyesített kvíz képmásolása külön műveletek, több hiba csak a szervernaplóba kerül. A tanári UI így sikeresnek láthat hiányos mentést. Kvíz elvetése vagy sikertelen import után ideiglenes képek maradhatnak. A backup az ideiglenes mappát szándékosan kihagyja, ezért ilyen hivatkozás visszaállítás után néma képvesztéssé válhat. A folyamatnak szüksége van a kész állapot ellenőrzésére, hibajelzésre és a fel nem használt képek életciklusára. A duplikálás és egyesítés elfogadási próbája két azonos fájlnevet, egy hiányzó képet és a forrás későbbi törlését is fedje le.

### 40 · Közepes · Kód – Az exportformátumok más információt és felületi ígéretet adnak

`src/services/exporter.js:131–196, 258–314, 377–396`, `public/print-report.html:93–137`, `project-context.md`, 1.3. szakasz.

Az Excel kérdéscellái pontszöveget tartalmaznak, a leírt diákválasz és osztályátlag nem jelenik meg a csoportos munkalapon. A csoportos HTML névre szűr és nevet rejt, oszlop szerinti rendezést nem kínál. A ZIP és a nyomtatási nézet a kérdésképet és a többsoros instrukciót nem jeleníti meg, így egy ábrára épülő feladat értékelése nehezen olvasható. A válasz nélkül hagyott kérdés vizuálisan hibásként jelenhet meg. A ZIP-fájlnév tisztított névből képződik, ezért külön résztvevőknél egyező fájlnevek lehetnek. A formátumonként elérhető adatok, a dátum és a kritikus értékelési státuszok egyeztetéséhez egy képes, részpontos, üres válaszos referencia-dolgozat használható.

### 41 · Magas · Kód – Az élő fájl ZIP-be mentése nem biztosít közös pillanatképet

`src/services/backup.js:12–33`, `src/routes/api.js:1010–1019`.

A kód WAL checkpointot hív, de az eredmény foglaltsági mezőjét nem vizsgálja. Sikertelen checkpoint esetén is továbbhalad. Az Archiver később olvassa az élő főfájlt és a képmappát. Párhuzamos kérdés- vagy képmódosításnál az adatbázis és az ábra külön időpontot képviselhet. Ez a nyugodt, egyszálú próba letöltésétől külön helyzet. Az SQLite online mentési API konzisztens adatbázis-pillanatképet ad, amelyet a hozzá tartozó állománylista és fájlok rögzítésével kell egy közös mentéssé tenni. A letöltési siker mércéje a helyreállíthatóság, a ZIP létrejötte önmagában kevés. [SQLite Online Backup API](https://sqlite.org/backup.html)

### 42 · Kritikus · Kód – Részleges restore után a régi és új állapot keveredhet

`src/services/backup.js:81–131`, `src/db/init.js:25–45`, `src/routes/api.js:1054–1069`.

A meglévő főfájlról készül `.bak`, az adatbázis bezárása után a kód felülírja a főfájlt, majd külön törli a kísérőfájlokat és külön másolja a képeket. Fájlzárolás, kevés szabad hely vagy hibás képállomány közben a folyamat megállhat egy lecserélt adatbázisnál vagy zárt kapcsolatnál. A `.bak` képfák nélkül készül, a kód hibakezelése nem állítja vissza automatikusan. A képmappát összeolvasztja a korábbival, így az új archívumban hiányzó régi fájlok megmaradnak. Az izolált kis próba működött. A lényegi kockázat az éles, többfájlos csere közbeni hiba. Előellenőrzött munkaterület, karbantartási állapot, atomi vagy visszagörgethető csere és ellenőrzött újranyitás ad egyértelmű hibahatárt.

### 43 · Magas · Kód – A restore ellenőrzése az SQLite-fájl alapintegritására koncentrál

`src/services/backup.js:56–91, 113–124`, `src/db/init.js:28–34`, `src/db/settingsRepo.js:4–11`, `src/routes/api.js:27–29, 1054–1069`.

A restore a megadott SQLite-fájl `integrity_check` eredményét nézi. Az alkalmazásséma verzióját, a kötelező táblákat, az idegen kulcsokat és a képreferenciákat nem egyezteti. A hot reload új kapcsolatot és PRAGMA-kat állít be, a normál inicializálási migrációkat és a modulbetöltéskor létrehozott beállítástáblát nem futtatja újra. A folyamat memóriájában maradnak a Socket.IO szobák és névfoglalások, a visszatöltött adatbázisban pedig a mentéskori aktív munkamenetek és tokenek. A visszaállítás módját és az érintett kliensek újrahitelesítését ezért együtt kell meghatározni. A szinkron külső kicsomagolásnak külön csomagméret-, kibontási és futásidőhatára sincs a kódban. Ellenőrzött fájllista, sémakompatibilitás és karbantartási ablak szükséges.

### 44 · Közepes · Kód – Letöltési hibák és lemezterület keveset látszanak a kezelőnek

`src/routes/api.js:976–1020, 1054–1069`, `src/services/backup.js:20–33, 61–69`, `src/services/exporter.js:329–399`.

A ZIP választ pipe és finalize adja. A generálás későbbi stream-hibája és a kliens megszakadása nincs ugyanúgy kezelve, mint egy szinkron hiba. A restore akár 500 MB-os feltöltést fogad, majd külön lemezterületet igényel a kibontáshoz és a biztonsági másolathoz. A feltöltés és a kibontás külön helyre kerülhet. Tanári visszajelzésre és visszakereshető szervernaplóra van szükség sikertelen streamnél, lemezfoglalásnál és helyreállításnál.

## 5. Windows-üzemeltetés, adatkezelés és használhatóság

### 45 · Magas · Kód és dokumentáció – Az offline csomag Node- és ABI-követelménye nincs egységesítve

`package.json:12–15`, `start_server.bat:14–44`, `TECH_STACK.md`, 2.1. szakasz, `telepítés.md`, 1.1–1.3. szakasz.

A technológiai leírás Node 20-at és 22-t említ, a csomag `>=22.11.0`-t, a telepítés kizárólag 22.x-et és Windows x64-et, a BAT csak a legalább 22-es főverziót. A jelenlegi modulfa helyileg Node 24.14.0 alatt működött. A better-sqlite3 natív addon miatt ezt nem lehet automatikusan átvinni a cél Node 22-re. Az ugyanazon Windows x64 architektúra kevés, a tényleges Node ABI-t és modulbetöltést kell kipróbálni. A BOM vagy aláírt csomaglista rögzítse a cél Node-verziót, a lockfile-t, a natív modult és az offline indítópróba eredményét.

### 46 · Magas · Kód és dokumentáció – Újraindulás után az Indítópult felhasználói belépést feltételez

`telepítés.md`, 2.6. szakasz, `TECH_STACK.md`, 4. szakasz, `start_server.bat:57–81`, `server.js:77–95`.

A közös Windows Indítópult a bejelentkező felhasználóhoz kötődik. A leírás emberi beavatkozás nélküli rendszerindítást ígér, miközben a BAT hibánál vagy kilépésnél `pause`-t használ, az alkalmazásban nincs felügyelt újraindítás vagy készültségi végpont. Szerverboothoz külön indulási trigger vagy szolgáltatás, hiba esetén újraindítási szabály és ellenőrizhető napló kell. A célgépen teljes újraindítás után belépés nélkül kell ellenőrizni, hogy a diák parancsikon működik. [Microsoft – program indítása rendszerbootkor](https://learn.microsoft.com/en-us/windows/win32/taskschd/starting-an-executable-on-system-boot)

### 47 · Magas · Kód és dokumentáció – Tiszta telepítéskor a diáknévsor üres

`src/db/init.js:186–273`, `DATABASE_SCHEMA.sql:28–36`, `telepítés.md`, 1.4. és 3. szakasz.

A tiszta adatbázis létrehozta a mintakvízt, az osztálylista üres maradt az izolált HTTP-próbán. A régi teljes teszt első listája ugyancsak üres, mielőtt a szkript saját névsort ad hozzá. A dokumentált beépített mintaosztályra számító bemutató itt megáll. A tényleges éles névsort szükséges importálni, a szintetikus első próbához külön tesztnévsort célszerű előkészíteni.

### 48 · Magas · Kód és döntés – A fejlesztői adatcsomag és az éles telepítő határa nincs rögzítve

`.gitignore:7–17`, `Source/Tanulók/` és `Source/Belépéshez.txt` a Git fájllistájában, `telepítés.md`, 1.2–1.4. szakasz.

Az útmutató egyszerre ír teljes projektmappáról és minta telepítési fáról. A kizárási példában a `Source` nincs nevesítve. A Git követ a megnevezése alapján KRÉTA-tanulói exportot és belépési információt tartalmazó fájlokat. A fájlnevek alapján nem dönthető el, hogy valós névsor és használatban lévő hozzáférési adat van-e bennük. Éles csomagot explicit engedélyezett állománylistából érdemes előállítani. Ha a forrásfájlok személyes adatot vagy aktív titkot tartalmaznak, a Git-történet és biztonsági másolatok hozzáférése külön feladat. A riportban nincs tanulói adat vagy hitelesítő érték.

### 49 · Magas · Kód és dokumentáció – A fejlesztői DB sima másolása friss adatot hagyhat el

`src/db/init.js:17–20`, `telepítés.md`, 1.4. szakasz, `AI_RULES.md`, SQLite fejezet.

A projekt adatkönyvtárában a vizsgálat elején a fő DB mellett WAL és SHM is létezett. A telepítési leírás a fő DB másolását írja elő, a futó forrásfolyamat lezárásának vagy SQLite-pillanatképnek a feltétele nélkül. WAL módban ez elhagyhat commitolt módosításokat. Ugyanennek a konfigurációnak a `synchronous=NORMAL` választása kisebb írási késést céloz. SQLite szerint áramszünet vagy rendszerszintű összeomlás elveszíthet friss tranzakciót, miközben a konzisztencia megmarad. A dolgozat pontjainál az iskola vállalható adatvesztési ablakáról és mentési gyakoriságáról dönteni kell. [SQLite synchronous beállítás](https://sqlite.org/pragma.html#pragma_synchronous)

### 50 · Közepes · Kód és mérendő – A szerver név szerinti elérése és a gépszám külön beállítás

`Source/Fontos.txt`, `telepítés.md`, 2.5. és 4.1. szakasz, `public/js/student.js:190–227`.

A tanulói parancsikonban a stabil belső DNS-név előnyös, ha a célhálózat valóban feloldja. A rövid Windows gépnév és a `.local` nem garantált minden alhálózaton és beállításnál. Egy belső DNS-ben kezelt teljes név és megbízható címregisztráció, vagy DHCP-foglalás tesztelhető megoldás. A jegyzetben javasolt `?pc=` más paraméter, mint a kliens jelenlegi `?gep=` bemenete. A gépnév-változó és a gépszám előállítását a telepítő vagy iskolai csoportházirend feladataként kell kezelni. Az átálláskor az új hostnév külön böngészőeredetet jelent a cache, a sütik és a diák lapállapota számára. [Microsoft – Windows névfeloldás](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wpo/f00add7f-a321-4a5f-a5d8-1748e748cd44) · [Microsoft – dinamikus DNS](https://learn.microsoft.com/en-us/windows-server/networking/dns/dynamic-update)

### 51 · Közepes · Kód és mérendő – A betűkészlet késése és az eszközök cache-e

`public/student.html:8–11`, `public/css/style.css:9–44`, `server.js:36–48`, `Source/Fontos.txt`.

A Nunito Sans WOFF2 két előtöltése és a 30 napos cache beállítása megvan. A CSS `font-display: block`-ot használ, amely betöltési állapotot szabályoz, a cache hiányát önmagában sem a helyi forrás, sem a betűváltás látványa nem igazolja. Az ikonfont WOFF2 körülbelül 1,14 MB, a Nunito két szelete együtt körülbelül 59 KB. A forrásban az ikonfont így külön mérendő hideg indulási tényező. A 30 napos `immutable` változatlan nevű fájlokon a javított erőforrás frissítését késleltetheti. Érdemes megmérni a hideg, meleg és kényszerített újratöltést a célböngészőben, azonos hostnéven, a cache tipikus használatával. A méretcsökkentés, verziózott fájlnév és a készlet valódi felhasználása együtt értelmezendő. [MDN – font-display](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/font-display)

### 52 · Közepes · Kód és mérendő – A mátrix minden válasznál újraépül és terjed

`src/routes/api.js:721–725, 896–900, 958–963`, `src/db/sessionRepo.js:815–904`, `public/js/admin.js:316–318`, `public/js/projector.js:116–119`.

Válaszonként szinkron SQLite-lekérdezések és teljes mátrix-küldés fut. A kvíz növekedésével egy válasz feldolgozásának költsége a többi résztvevő adataival is nő. Az exportok és importok szintén ugyanazt a Node-folyamatot terhelik. A valós kockázatot a 22 vagy 42 gépes, tanári és kivetítő ablakkal végzett egyidejű normál válaszleadás mutatja meg. Addig nincs igazolt kapacitásprobléma és nincs igazolt 42 klienses kapacitás. Az eseményenként változó mezők és újracsatlakozáskor lekérhető teljes pillanatkép csökkentené az adatterhelést.

### 53 · Közepes · Kód és mérendő – Billentyűzet, méretezés és teremhasználat

`public/student.html:277–296`, `public/js/student.js:916–923`, `public/js/utils.js`, `public/css/style.css`, `Source/Fontos.txt`.

A Space Race csapatszín-kártyák kattintásos `div` elemek, a választásnak saját billentyűzetes útja nincs. Az elérhetőségi ellenőrzés érintse a modál fókuszát, kilépését, választás visszajelzését, valamint a pontállapotok színen kívüli közlését. A kompakt fejlécjelvény a négy vagy több aktív alkalomnál csak a célfelbontáson értékelhető, különösen hosszú tesztcímmel. A csapatszínek egyforma kétsoros törése ugyancsak a tényleges böngészőszélességgel, nagyítással és helyi betűkészlettel ellenőrizhető. A helyi ikonfont az offline követelményt betartja, az `AI_RULES.md` kizárólag inline SVG-t vagy Unicode-ot megengedő megfogalmazása mégis ellentmond a jelenlegi, dokumentált felülettervnek.

### 54 · Közepes · Kód – A két tanári böngésző szerkesztési és bejelentkezési állapota kevéssé visszakövethető

`public/js/admin.js:267–275, 388–402, 1114–1128, 3133–3187`, `src/db/sessionRepo.js:738–809`.

Tanári felülbírálásnál az eredeti pont rögzített, a legutóbbi módosítás ideje megmarad. A korábbi javítások sorrendje és a műveletet végző személy nincs tárolva. Két tanár párhuzamos kattintása esetén az utolsó mentés nyer. Hálózati hibánál a felülbírálás kezelője a konzolra ír, kijelentkezéskor a felület hálózati hiba után is visszanavigálhat. A megosztott tanári használat elfogadásának része a látható műveleti eredmény, a frissítés és az érdemi napló minimális köre.

### 55 · Alacsony · Kód – Jelentős működési szabályok párhuzamos helyeken vannak

`public/js/admin.js`, `public/js/student.js`, `src/routes/api.js`, `src/services/grader.js`, `src/db/settingsRepo.js`, `config.js`.

A tanári és diákfájl több nagy, egyben kezelt felületet kapcsol össze. Külön kliens-, szerver- és exportsablon-ágban szerepel a pontformázás és visszajelzés, több szerverfájlban vannak alapértelmezett ponthatárok. Ez már megfigyelhető eltéréseket okoz az előző pontokban. A build nélküli szerkezeten belül maradhat a Vanilla JS. A nagyobb megtérülést egyetlen szerveroldali értékelési szabály, szerepkörös adattípusok és vékony nézetek adják.

## 6. Lefuttatott ellenőrzések és a bizonyíték határai

Az ellenőrzések Windows x64 alatt, Node `24.14.0` és npm `11.9.0` környezetben futottak. A tesztszkriptek az operációs rendszer ideiglenes könyvtárába másolt kódot, külön adatbázist és külön feltöltési mappát használtak. Erre azért volt szükség, mert néhány szkript alapértelmezett projektadatbázist nyit, másik a fix nevű tesztadatbázist vagy képmappát töröl. A meglévő éles és tesztadatbázisokat így érintetlenül hagytam. A 29 JavaScript-forrás és tesztszkript átment a `node --check` ellenőrzésen.

| Ellenőrzés | Eredmény és értelmezés |
|---|---|
| `test_full_system.js` | Siker. A szkript 17 lépést jelent és főként az adattárakat fedi le. Az első osztálylista üres, az osztályt a szkript adja hozzá. |
| `test_report12_fixes.js` | Siker. Pontplafon, negatív érték, nulla részpont, végtelen érték, közvetlen adattáras célgépes átvétel, névreset és lezárási védelem. A második kapcsolat `UPDATE`-je az első lezárás után fut. Ez az utólagos írás védelmét igazolja, valóban egy időben induló két tranzakciót nem. |
| `test_socrative_import.js` | Nulla kilépési kód. A két hivatkozott PDF hiányában csak a generált PNG-vel futó kvízkép-folyamat teljesült. A szkript sikerüzenete túl általános. |
| `test_merge_quizzes.js` | Siker. Két kvíz, helyes sorrend, az eredetik megmaradnak, önmagával egyesítés tiltva. A szkript nem ad ábrát a két forráskvízhez, így a képnévütközést és hibás képmásolást nem fedi. |
| `test_presence.js`, `test_roster_archive_independence.js` | Siker. A memóriás alapfoglalás, illetve a lezárt alkalom névsorváltozástól való tesztelt függetlensége működött. A böngészős gépváltást és az aktív alkalom közbeni névsorváltozást ezek nem fedik. |
| `test_report10_fixes.js`, `test_report11_fixes.js` | Siker. A vizsgált adatbázis-triggerek, pontkorlátok, lezárt válasz és új résztvevő védelme működött. A tesztek főként az adatbázist és az adattárat fedik. |
| `test_report09_fixes.js` | 1-es kilépési kód az első állításnál, mert a régi teszt kvízzárolást vár. A jelenlegi termék azóta dokumentáltan szerkeszthető kvízt használ. Ez a tesztelvárás elavult, az aktív és történeti adatok következetlensége ettől független megállapítás. |
| Normál HTTP-próba | A három alapoldal, a kiválasztott helyi erőforrások, a tanári belépés, a szintetikus névsor mentése, dolgozatindítás, diákbelépés, kérdéslekérés, válaszmentés, tanári lezárás és a nyomtatási útvonal válaszolt. Az XLSX, HTML, ZIP és backup letöltés nem üres választ adott. Az exportok alakját forrásból vetettem össze. A próbát helyi loopback címre korlátoztam. |
| Mentés és visszaállítás | Elkészült és visszaállt egy elkülönített névsor és egy képes kvíz. A PNG bájtra egyezett, az SQLite `integrity_check` és `foreign_key_check` átment. Ez a jó esetet fedi a jelenlegi fejlesztői Windows-környezetben. |
| PDF-válasz formátumának ellenőrzése | A helyesnek szánt válaszszöveg és az importáló betűjele együtt hibás minősítést kapott a közvetlen pontozófüggvényben. Az azonos szövegű kontroll helyes minősítést kapott. |
| Jegymegőrzés és határidő célzott próbája | Mindkét működési eltérés reprodukálódott külön tesztadatbázisban. A lezárt jegy megváltozott a sablon pontmaximumának szerkesztése után, a késői válasz elutasítása pedig befejezetlenül hagyta a résztvevőt. |

A `package.json` jelenlegi `test` parancsában a fenti első négy szkript szerepel. A további öttel együtt nyolc szkript nulla, egy szkript 1-es kóddal zárt. A böngészős rajt, a billentyűzetes kezelés, a nyomtatási oldaltörések, a Windows Server 22.x Node-csomag, a párhuzamos 22/42 gépes terhelés és az iskolai hálózat újraindulási viselkedése továbbra is célkörnyezeti próba tárgya. A függőségi vizsgálatban a lokális csomagfa és a vonatkozó gyártói közlemények szerepeltek.

### A jelenlegi alapok, amelyekre érdemes támaszkodni

- Az aktív csatorna SQLite részleges egyedi indexe adatbázisszinten megakadályozza két azonos tantárgy–évfolyam alkalom egyidejű aktív állapotát. A válaszok összetett idegen kulcsa, egyedisége, pontplafonja és eredeti pontjának védelme integritási kontrollt ad. `DATABASE_SCHEMA.sql:115–118, 149–169, 176–310`.
- A kliens HTTP-kérdésnézetének mezőlistája alapból kihagyja a megoldást és magyarázatot. A normál helyreállítás kriptográfiai tokent igényel. A tanári HTTP írások és exportok külön middleware-t használnak. Ezekhez a meglévő kontrollokhoz lehet igazítani a többi adatfolyamot. `src/db/quizRepo.js:132–144`, `src/db/sessionRepo.js:343–377, 410–411`, `src/middleware/auth.js:43–59`.
- A tanári lezárás tranzakciója együtt váltja a résztvevőket és a dolgozat státuszát. A lezárt válaszok módosításvédelme és a névsormentés tranzakciója a tesztekben is ellenőrzött alap. `src/db/sessionRepo.js:283–313`, `src/db/rosterRepo.js:89–121`.
- A kiszolgált főoldalak erőforrásai helyiek. A jelenlegi felépítés tantermi offline működését egy megerősített helyi kiszolgálás, visszaállítás és üzemeltetési csomag támogatja, külön frontend build bevezetése nélkül. `server.js:36–52`, `public/*.html`.

## 7. Élesítési sorrend és tantermi elfogadás

| Sorrend | Próba vagy döntés | Sikerfeltétel |
|---|---|---|
| 1 | Adatáramlás három külön szerepkörrel | Tanári, diák és kivetítő hitelesítési szabálya szerveroldalon érvényes. Egyik diák sem kapja más diák válaszait vagy a saját beállítás szerint még rejtett kulcsot. A kapcsolódás és a munkamenet lejárata külön is ellenőrzött. |
| 2 | Történeti értékelés rögzítése és importált kulcs | A tanár aktív, majd lezárt alkalom mellett szerkeszti az eredeti sablont. A régi alkalom kérdése, maxpontja, beszámított válasza és jegye változatlan. Egy új és korábban importált kvíz ABCD és TF kulcsa a tanári megoldókulccsal egyezik. |
| 3 | Egyéni határidő és hálózat | Válasz határidő előtt és után, eltérő kliensóra, hálózat megszakítása válasz közben, azonos kérdés újraküldése. Egy válasz marad, a lejárt résztvevő a szerveren és a tanári nézeten lezárul. |
| 4 | Önálló mód, tanári léptetés, Space Race | Önálló módban a beállított haladás működik. A tanári mód csak megnyitott kérdést értékel és követi a tanárt. Space Race-ben a rajt közös, az időszabály egységes, a késői belépés, csapatválasztás és újracsatlakozás dokumentált. Az első éles kiadásban csak az igazolt módok legyenek választhatók. |
| 5 | Téves név és gépváltás két diákböngészőn | Téves név törlése után szabályos belépés lehetséges. A jóváhagyott gépváltás azonos válaszokkal folytatódik, egyszer hajtható végre, a régi kliens már nem írhat, a másik résztvevő képernyője nem változik. |
| 6 | Több csatorna, két tanár és kivetítő | Két tanár egyszerre dolgozik. Külön tantárgyi alkalmak és azonos nevű szintetikus tanulók szerepelnek. A kivetítő csak a kiválasztott alkalmat jeleníti meg. Késői HTTP-válasz és újracsatlakozás után is a kezelt alkalom adata marad látható. |
| 7 | Import, Excel, HTML, ZIP, nyomtatás | Szintetikus KRÉTA és jóváhagyott Socrative minták, képes, részpontos és megválaszolatlan feladatok. Az adatok összevethetők, idézőjelek és kódjelek megmaradnak, a csomagban tanulónként egyértelmű fájl van. Edge, Chrome és a tanári Excel-környezet elfogadja a kimenetet. |
| 8 | Mentés és visszaállítás a telepítési csomagon | Egy friss mentés külön célkönyvtárba visszatölthető, a névsor, lezárt jegy, válasz, képfájl és beállítás megvan. Megszakított állapotnál előáll a korábbi használható állapot. A művelet ideje és szabad lemezszükséglete mérhető. |
| 9 | 1, majd 22, illetve 42 tanulói gép a tényleges cél szerint | Dokumentált Windows- és Node-verzió, valódi tantermi böngészők, több egy időben leadott válasz és megfigyelt tanári frissítés. Feljegyzendő a válasz- és újracsatlakozási késés, hibás vagy duplikált mentések száma, a mátrix frissülése és az adatbázis állapota. |
| 10 | Újraindítás, DNS, hozzáférés és vizuális ellenőrzés | Indulás bejelentkezés nélkül, kliensparancsikon feloldása, elérhető és tiltott hálózati szegmensek, hideg és meleg fontbetöltés, négy aktív jelvény, billentyűzetes folyamat és kivetítő olvashatóság. |

A kipróbálás sorrendjében a szintetikus osztály legyen az első. Éles tanulói adat vagy értékelés akkor kerüljön a rendszerbe, amikor az első nyolc pont alkalmazott követelményeinek a célkörnyezet megfelel, és a kapacitáspróba az iskola tényleges kliensszámával teljesült.
