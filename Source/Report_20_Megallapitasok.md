# Report 20 – A Report 19 javításainak visszaellenőrzése

**Okoskodó · v1.30.0 · Git `db621b6` · 2026. november 21.**

## Élesítési összegzés

A v1.30.0 az ellenőrzött, idegen szerkezetű SQLite-adatbázist már a migráció előtt elutasította. A v1.26 sémájú, jelölés nélküli mentés továbbra is visszaállítható, és a régi trigger frissítése után működik a rögzített feladat szerinti pontozás. A két párhuzamos tesztfutás elkülönített könyvtárakból sikeresen lefutott.

**A séma verziójának ellenőrzése még nyitott.** Egy újabb sémájúnak jelölt, szintetikus Okoskodó-mentést a restore elfogadott, majd az eredeti verziójelölést a v1.30.0 értékére írta át. A visszaállítási kompatibilitást addig részben igazoltnak tekinteném, amíg az újabb vagy más alkalmazáshoz tartozó fájl az éles állapot érintése előtt biztosan elutasításra kerül.

| Tétel | Állapot | Bizonyíték |
|---|---|---|
| Más szerkezetű SQLite-adatbázis elutasítása | **Igazolt a vizsgált mintán** | A művelet az előzetes ellenőrzésnél leállt. A működő adatbázis és a tesztfájl ellenőrző összege változatlan maradt. |
| Támogatott, jelölés nélküli régi mentés | **Igazolt a v1.26 sémával** | Szerver-újraindítás nélkül elment a rögzített, 4 pontos helyes válasz a sablon 1 pontra módosítása után. |
| Újabb vagy eltérő alkalmazásazonosítójú mentés | **Nyitott** | Az újabb verzió elfogadása és átjelölése futtatással igazolt. Az alkalmazásazonosító ellenőrzése a forrásból hiányzik. |
| A régi trigger a tesztmentésben | **Igazolt** | A javított 24. tesztben a régi trigger a ZIP létrehozása előtt kerül az adatbázisba. |
| Tesztfájlok elkülönítése | **Igazolt a két párhuzamos futásban** | Külön ideiglenes könyvtárak, két 0-s kilépési kód, érintetlen szintetikus alapértelmezett adatbázis. |

A jelentés a [Report 19 megállapításait](Report_19_Megallapitasok.md) és a [v1.30.0 fejlesztői válaszát](Valasz_a_Report_19_Megallapitasokra.md) követi. A próbák szintetikus adatokkal, elkülönített Windows x64 másolatban, Node `24.14.0` alatt futottak. A tényleges iskolai Windows Server-csomag és a többgépes böngészős működés külön átvételi próba.

## 1. Az elfogadási döntésnek használnia kell a mentés jelöléseit

### Megállapítás és bizonyíték

A restore a kicsomagolt adatbázist előzetesen csak olvasásra nyitja meg. Ellenőrzi az integritást, a magtáblákat és a kiválasztott oszlopokat. Ebben az ágban az `application_id` és a `user_version` értékét nem olvassa be. Ezután az `applyPragmas` a migráció előtt beírja az Okoskodó azonosítóját és a `13000` sémaverziót. A sémafájl ugyanezeket az értékeket szintén beállítja. Egy újabb, eltérő tartalmi szabályokat használó séma akkor is átmehet a táblák és oszlopok ellenőrzésén, ha megőrizte a jelenlegi mezőneveket. [Előzetes restore-ellenőrzés](../src/services/backup.js#L108) · [Kapcsolat beállításai](../src/db/init.js#L17) · [A sémafájl jelölései](../DATABASE_SCHEMA.sql#L7)

**Futtatási eredmény.** Egy szintetikus Okoskodó-mentés SQLite fejlécében a `user_version` értéke `13100` volt. A v1.30.0 sikeres visszaállítást jelzett, és a visszatöltött adatbázisban `13000` szerepelt. Ez a próba a verziójelölés figyelmen kívül hagyását és felülírását igazolja. A szintetikus példány a jelenlegi táblaszerkezetet használta, ezért a próba nem modellezte egy későbbi tényleges séma minden adateltérését.

A normál indítás szintén a migráció előtt hívja meg a jelöléseket író függvényt. A telepített adatbázis sémáját ezért az alkalmazás indulásakor is az első módosítás előtt kell azonosítani. [Adatbázis megnyitása](../src/db/init.js#L14) · [Inicializálás](../src/db/init.js#L223)

### Javasolt javítás

1. **Az alkalmazás- és sémaverzió olvasása legyen az első lépés.** Meglévő adatbázison a mezőket olvasási módban kérdezd le, a fejlécbe írás és a séma módosítása előtt. Ugyanaz az elfogadási szabály működjön induláskor és restore-nál. A SQLite az `application_id` mezőt az alkalmazásfájl-formátum jelölésére adja, a `user_version` értelmezését pedig az alkalmazásra bízza. [SQLite application_id](https://sqlite.org/pragma.html#pragma_application_id) · [SQLite user_version](https://sqlite.org/pragma.html#pragma_user_version)
2. **Ismert bemenethez engedj dokumentált migrációt.** Egy aktuális, helyes alkalmazásazonosítójú adatbázis menjen át a meglévő tartalmi ellenőrzéseken. Jelölt régebbi sémához legyen dokumentált migrációs út. A jelölés nélküli régi adatbázisoknál maradjon meg az ismert korábbi szerkezet felismerése. Egy eltérő, nem nulla alkalmazásazonosító, egy újabb sémaverzió vagy egy ismeretlen régi szerkezet esetén álljon meg a folyamat az eredeti értékek megtartásával.
3. **A verzió beírásának egyetlen helye legyen.** Az `applyPragmas` csak a kapcsolat működéséhez szükséges beállításokat kezelje. A sémaverziót egyetlen sémapolitika határozza meg, és az aktuális értéket az új adatbázis sikeres létrehozása vagy a támogatott migráció sikeres befejezése után írja be. A sémaverzió változása követheti a tényleges adatbázis-változásokat. A csomag verziószáma ettől külön azonosító maradhat.
4. **A jóváhagyott restore továbbra is kétlépcsős legyen.** Először az eredeti mentés azonosítása történik, majd a migráció után a kész példány integritás- és működési ellenőrzése. Az aktív adatbázis és a képtár cseréjét csak a második siker után indítsd. Az inkompatibilitási üzenet jelezze, ha a mentés másik alkalmazásból vagy újabb, itt még nem támogatott kiadásból érkezett.

### Elfogadási próbák

| Eset | Restore | Indulás meglévő adatbázissal |
|---|---|---|
| v1.26 séma, jelölés nélkül | A régi séma felismerhető és migrálható. A négypontos válasz közvetlenül utána működik. | A támogatott régi példány frissül és működik. |
| Aktuális, helyesen jelölt adatbázis | A csomag átmegy az előzetes és a migráció utáni ellenőrzéseken. | A kiszolgáló normálisan indul, a séma azonosítója változatlan. |
| Ismert Okoskodó-azonosító, a támogatottnál újabb séma | Elutasítás a migráció és a fájlcsere előtt. | Érthető hiba, az adatbázis verziója és tartalma változatlan. |
| Másik alkalmazás azonosítója vagy ismeretlen régi szerkezet | Elutasítás, az aktív adatbázis és képtár érintetlen. | A kiszolgáló nem állítja működő állapotba a megadott adatbázist. Az eredeti jelölések megmaradnak. |
| Hibával megszakadó támogatott migráció | A meglévő aktív adatbázis és képtár továbbra is használható. | Sikertelen indulás vagy dokumentált helyreállítás. A félbemaradt példány nem kap friss sémaverziót. |

Az elutasítási próbáknál ellenőrizd a hibajelzés mellett az aktív adatbázis és a képtár tartalmát is. A vizsgált fájlok állapotát kezelés előtt és után hasonlítsd össze. A jelenlegi 27. teszt az inkompatibilitási hibát igazolja. Érdemes ezt az aktív állományok változatlanságának közvetlen ellenőrzésével és az újabb verziójú mentés esetével kiegészíteni. [A 27. teszt](../scratch/test_report14_fixes.js#L1006)

## 2. A Report 19 igazolt javításai

### Idegen adatbázis elutasítása és a régi pontozás megőrzése

Egy más szerkezetű, ép SQLite-adatbázis visszatöltését a szerver az előzetes ellenőrzésnél elutasította. Az aktív, szintetikus adatbázis és a feltöltött tesztfájl SHA-256 ellenőrző összege megegyezett az elutasítás előtt és után. Az aktív állapot cseréjéhez szükséges helyreállítási előkészítés nem indult el. [Előzetes ellenőrzés](../src/services/backup.js#L108)

A 24. regressziós teszt előkészítése javult. A teszt már a ZIP létrehozása előtt telepíti és ellenőrzi a régi triggert. A visszaállítás után ellenőrzi az új trigger jelenlétét és a tényleges pontozást. Külön próba a jelölés nélküli v1.26 sémával ugyanezt igazolta. A már kiosztott kérdés helyes válasza **4 ponttal** ment el annak ellenére, hogy az élő sablont a tanár **1 pontra** módosította. [A 24. teszt előkészítése](../scratch/test_report14_fixes.js#L868) · [Restore utáni ellenőrzés](../scratch/test_report14_fixes.js#L898)

### Párhuzamos tesztfutás és a tesztállományok elkülönítése

A hibásmentés-próba ZIP-je a közös `scratch` mappa helyett a futás saját tesztadatbázisa melletti könyvtárba kerül. Egy elkülönített projektmásolatból két párhuzamos tesztfuttatót indítottam. Mindkettő külön ideiglenes könyvtárat használt, mindkettőnél lefutott a 27 célzott ellenőrzés, és mindkettő 0-s kóddal zárt. A szintetikus alapértelmezett adatbázis ellenőrző összege és a `data` könyvtár állománylistája változatlan maradt. A `scratch` könyvtár megfigyelése nem jelzett fájlváltozást. [Központi tesztfuttató](../scratch/run_all_tests.js#L11) · [Hibásmentés-próba útvonala](../scratch/test_report14_fixes.js#L364)

## 3. Dokumentációs pontosítás

| Hely | Tényleges állapot | Javítandó állítás |
|---|---|---|
| Report 18 válaszának fejléce | **v1.29.0**, helyes. | A Report 19 válaszában a korábbi fejléc javításaként **v1.29.0** szerepeljen következetesen. |
| Report 19 válaszának fejléce | **v1.30.0**, egyezik a csomaggal. | A fejléc megtartható. |
| Report 19 válaszának sémaleírása | Az aktuális kód `user_version = 13000` értéket ír. | A szövegben szereplő `12900` javítandó. Az elfogadási ellenőrzés állítását a jelölések tényleges beolvasása után lehet lezárni. |

[Report 18 válasza](Valasz_a_Report_18_Megallapitasokra.md#L3) · [Report 19 válaszának sémaleírása](Valasz_a_Report_19_Megallapitasokra.md#L35) · [Report 19 válaszának verziópontosítása](Valasz_a_Report_19_Megallapitasokra.md#L76) · [Csomagverzió](../package.json#L3)

## Következő átvétel

A Report 19-ben jelzett tesztelési tételek a vizsgált körülmények között lezárhatók. A következő kör első feladata a közös mentés- és sémaellenőrzés bevezetése a restore és a normál indulás elején. Az újabb sémájú és idegen alkalmazásazonosítójú eset elutasítását, valamint a támogatott jelölés nélküli v1.26 mentés visszatölthetőségét egyaránt igazolni kell. Utána az iskola tényleges telepítési csomagján szintetikus névsorral vedd át a tanórai használatot és a teljes mentés–visszaállítást.
