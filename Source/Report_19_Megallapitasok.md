# Report 19 – A Report 18 javításainak visszaellenőrzése

**Okoskodó · v1.29.0 · Git `5ab0eba` · 2026. november 21.**

## Élesítési összegzés

A Report 18 három korábban reprodukált alkalmazáshibája a célzott próbákon javult. Egy v1.26 sémájú mentés visszaállítása után a négypontos diákválasz újraindítás nélkül elment. A megszakadt helyreállításból megőrzött adatbázis és képek egy következő restore után is változatlanok maradtak. A törölt sablonhoz tartozó, pillanatkép nélküli régi alkalom eredménye a diák HTTP-végpontján megnyílt. A teljes `npm test` két ellenőrzött futása során az alapértelmezett projektadatbázis védett maradt.

**A fennmaradó élesítési feltétel a mentések azonosítása az adatbázis módosítása előtt.** A jelenlegi sorrend a támogatott mentést helyesen frissíti, de a kötelező alkalmazástáblák ellenőrzését csak azután futtatja, hogy a migráció már létrehozhatta őket. Valódi adatok előtt ellenőrizd, hogy a rosszul kiválasztott vagy nem támogatott mentést a restore az aktív állapot érintése előtt elutasítja.

| Prioritás | Tétel | Állapot |
|---|---|---|
| 1 · Magas | A mentés alkalmazás- és sémakompatibilitásának előzetes ellenőrzése | Nyitott, forrásból azonosított eltérés. |
| 2 · Közepes | A 24. teszt valóban elavult triggert tartalmazó mentést használjon | A működés külön próbán igazolt. A tárolt regressziós teszt előkészítése pontatlan. |
| 3 · Közepes | Az összes futás közben létrejövő tesztállomány elkülönítése | Az adatbázis-izoláció igazolt. Egy teszt átmeneti ZIP-je a közös projektkönyvtárban jön létre. |
| 4 · Alacsony | A válaszfájl a vizsgált kiadás verzióját jelölje | A dokumentum fejlécében v1.28.0, a vizsgált csomagban v1.29.0 szerepel. |

Kiindulás a [Report 18](Report_18_Megallapitasok.md) és a [rá adott fejlesztői válasz](Valasz_a_Report_18_Megallapitasokra.md). A visszaellenőrzés szintetikus adatokkal, elkülönített projektmásolatban, Windows x64 és Node `24.14.0` környezetben történt. A visszaállítási próbák a megnevezett mentésekre és hibákra vonatkoznak. A többgépes tantermi próba és a tényleges Windows Server-telepítési csomag külön átvételi helyszín.

## 1. A mentés azonosítása a migráció előtt

### Forrásalapú megállapítás

A restore beolvassa a csomagban talált SQLite-adatbázist, majd a kicsomagolt példányon meghívja az indulással közös `migrateDatabase` függvényt. Ez létrehozhatja a hiányzó alkalmazástáblákat, indexeket és triggereket. A restore csak utána ellenőrzi az integritást, az idegen kulcsokat és a kötelező táblák, illetve három trigger meglétét. Így a kötelező objektumok egy része az előkészítés eredményeként is megjelenhet. Egy tévesen kiválasztott, ép SQLite-adatbázis ezért a kód alapján átmehet ezen a szerkezeti kapun. A megállapítás forrásolvasáson alapul. A sikeres futtatási próba ismert, támogatott v1.26 sémával készült. [Restore ellenőrzési sorrendje](../src/services/backup.js#L108) · [Közös migráció és sémalétrehozás](../src/db/init.js#L59)

### Javasolt javítás

1. **Az eredeti sémát olvasd be először.** A kicsomagolt adatbázist csak olvasásra nyisd meg. A migráció előtt állapítsd meg, hogy melyik alkalmazás és melyik támogatott séma hozta létre. Új mentéseknél az SQLite `application_id` az alkalmazás azonosítására, a `user_version` a séma verziójához használható. A két mező a formátum felismertetését segíti, és kiegészíti a szerkezeti ellenőrzést. [SQLite application_id](https://sqlite.org/pragma.html#pragma_application_id) · [SQLite user_version](https://sqlite.org/pragma.html#pragma_user_version)
2. **A korábbi kiadásokat ismert sémajellemzőkkel támogasd.** A jelölés nélküli, már kiadott mentéseknél ellenőrizd a formátumot megkülönböztető táblák, kulcsok, oszlopok és kapcsolatok megfelelő kombinációját. A korábbi verzió természetes hiányosságaihoz legyen egyértelmű kompatibilitási szabály. Az ismeretlen, hiányos vagy újabb, még nem támogatott sémát a módosítás előtt utasítsd el. Új mentés létrehozásakor és egy régi, felismert séma sikeres migrációjakor alkalmazd az aktuális jelölést.
3. **A közös migráció maradjon meg, a sikerhez két ellenőrzés tartozzon.** Az első ellenőrzés az eredeti fájl alkalmazás- és verziókompatibilitását állapítja meg. Ezután a közös migráció a készülő példányon fut. A második ellenőrzés a migrált adatbázis integritását, idegen kulcsait és az alkalmazás működéséhez szükséges sémát vizsgálja. Az aktuális adatbázis és képtár cseréje csak mindkét sikeres ellenőrzés után kezdődjön el. [SQLite integrity_check](https://sqlite.org/pragma.html#pragma_integrity_check) · [SQLite foreign_key_check](https://sqlite.org/pragma.html#pragma_foreign_key_check)

### Elfogadási próba

| Mentési eset | Elvárt eredmény |
|---|---|
| A vizsgált v1.26 séma régi triggerrel | Felismerhető és migrálható. Közvetlenül a restore után működik a tesztlista, az archívum és a rögzített feladat szerinti pontozás. |
| Aktuális Okoskodó-mentés | A kompatibilitási ellenőrzés átmegy. A kiválasztott eredmény és a hozzá tartozó képfájl megnyitható. |
| Ép, más alkalmazáshoz tartozó SQLite-adatbázis | Érthető inkompatibilitási hiba már a migráció előtt. Az aktuális adatbázis és képtár változatlan marad. |
| Nem támogatott verzió vagy hiányos korábbi séma | A kezelő azonosítható okot kap. A meglévő eredmények és képek továbbra is elérhetők. |

Az elutasítás ellenőrzése a felületi üzenet mellett az aktuális adatbázis és képek tartalmának összevetését is tartalmazza. A kompatibilitási tájékoztató külön sorolja fel a ténylegesen kipróbált régi sémákat és a nem támogatott eseteket.

## 2. A régi trigger a visszatöltött tesztmentésben legyen

A 24. teszt a vizsgálni kívánt pontozási helyzetet jól választotta meg. A futtatás előbb azonban létrehozza a mentési ZIP-et, és csak utána telepíti a régi triggert a futó adatbázisba. A visszaállított ZIP így a már aktuális triggert tartalmazza. A teszt sikere önmagában nem mutatja meg, hogy a restore képes-e a mentésből érkező elavult trigger frissítésére. [24. teszt](../scratch/test_report14_fixes.js#L847) · [A mentés és a trigger módosításának sorrendje](../scratch/test_report14_fixes.js#L869)

**Javasolt javítás.** A teszt egy elkülönített példányból készítsen mentést, amelyben a korábbi trigger a csomagolás előtt jelen van. A mentés előkészítésénél ellenőrizd a régi állapotot. A visszatöltés után szerver-újraindítás nélkül futtasd le a valódi válaszmentést. A tanár a négypontos, már kiosztott kérdés sablonértékét csökkenti, a szerver pedig az alkalom szerint továbbra is négy pontot ment. Az állítást a tárolt válasz és az eredmény is igazolja.

**Visszaellenőrzési eredmény.** A külön próbában a v1.26 sémájú ZIP ténylegesen a régi triggert tartalmazta. A restore lecserélte a triggert, és a helyes válasz négy ponttal elment. A szükséges módosítás itt a meglévő regressziós bizonyíték pontosítása.

## 3. A tesztfájlok teljes elkülönítése

A központi `npm test` futtató külön ideiglenes adatbázisra és feltöltési könyvtárra irányítja a teszteket. Üres projektmásolatban nem jött létre az alapértelmezett `data/ropdolgozat.db`. A második futásnál egy előre létrehozott szintetikus adatbázis SHA-256 ellenőrző összege változatlan maradt. Az első futás utáni fájllista és tartalomellenőrzés a másolt projektben megegyezett a kiindulással. Ez az induláskori és befejezéskori állapotot igazolja. [Központi tesztfuttató](../scratch/run_all_tests.js#L11)

A hibás mentést vizsgáló ellenőrzés közben a szkript továbbra is a közös `scratch/corrupt_test.zip` útvonalra ír, majd onnan törli az állományt. Párhuzamos futások ugyanazt az útvonalat érinthetik, megszakított futás után pedig ott maradhat a fájl. [A tesztállomány helye](../scratch/test_report14_fixes.js#L364)

**Javasolt javítás.** A futtató osszon ki futásonként egyedi gyökérkönyvtárat, például a Node `fs.mkdtemp` API-jával. A gyermekfolyamatok az adatbázis, a képek és a ZIP-ek számára is innen kapjanak útvonalat. A hibásmentés-fixture ugyanabba az ideiglenes területbe kerüljön, mint a többi tesztarchívum. A futtató csak a saját könyvtárát takarítsa a fájlkezelők és streamek lezárása után. [Node.js ideiglenes könyvtár](https://nodejs.org/docs/latest-v22.x/api/fs.html#fspromisesmkdtempprefix-options)

**Elfogadás.** Két párhuzamos `npm test` futás külön tesztállományokat használ és mindkettő sikeres. Futás közben sem keletkezik közös írható ZIP a projektben. Sikertelen futásnál a teszt saját takarítása lefut, és egyik futás sem érinti a másik könyvtárát vagy az alapértelmezett projektadatbázist.

## 4. A visszaellenőrzés eredményei és a kiadás jelölése

| Report 18 megállapítása | Igazolt eredmény |
|---|---|
| Visszaállítás után elavult pontozási trigger | A v1.26 sémájú mentéssel a vizsgált eset javult. A négy pont újraindítás nélkül elment. |
| A későbbi restore felülírja a korábbi helyreállítási példányt | Szimulált kettős hiba után az eredeti adatbázis-másolat, a képmásolat és a metaadat SHA-256 ellenőrző összege a következő sikeres restore után is egyezett. |
| Pillanatkép nélküli diák eredménye logikai törlés után | A tényleges HTTP-végpont két pontot és 100%-ot adott. A tanári mátrix megnyílt, az új indítást a szerver elutasította, kikapcsolt visszajelzésnél a kérdésadatban nem jelent meg a megoldás. |
| A teljes tesztparancs alapértelmezett adatbázist érint | Mindkét `npm test` futás 0-s kóddal zárt, a 26 célzott ellenőrzéssel. Az alapértelmezett adatbázis védelme igazolt. A közös átmeneti ZIP külön javítandó. |

[Műveletenkénti helyreállítási könyvtár](../src/services/backup.js#L156) · [Történeti diákeredmény](../src/routes/api.js#L1000) · [Tesztparancs](../package.json#L9)

A fejlesztői válasz fejlécében **v1.28.0**, a futtatott csomagban és a kiadási naplóban **v1.29.0** szerepel. A visszaellenőrzési jegyzőkönyvet a csomag verziójához és a Git-azonosítóhoz érdemes kötni. A 24. teszt leírását is igazítsd ahhoz, hogy a régi trigger a visszatöltött csomagban legyen. [Válaszfájl verziójelölése](Valasz_a_Report_18_Megallapitasokra.md) · [Csomagverzió](../package.json#L3) · [Változási napló](../CHANGELOG.md#L7)

## Következő átvételi sorrend

1. Tedd a támogatott mentési formátum és séma azonosítását a migráció elé. Ellenőrizd, hogy elutasításkor az aktív adatbázis és képtár változatlan.
2. Rögzítsd a tényleges régi mentéssel végzett pontozási próbát a regressziós csomagban.
3. Vidd át a hibásmentés-próba ZIP-jét a futásonként elkülönített könyvtárba, és ellenőrizd a párhuzamos futásokat.
4. Az iskolai Windows Server-csomagon szintetikus adatokkal vedd át a normál tanári–diák folyamatot és egy teljes mentés–visszaállítást.

A Report 18 konkrét pontozási, másolatmegőrzési és történeti megjelenítési javításai a megnevezett esetekben lezárhatók. Valódi tanulói adatok előtt a mentés előzetes azonosítása és a célkörnyezeti átvétel marad a kiadási döntés feltétele.
