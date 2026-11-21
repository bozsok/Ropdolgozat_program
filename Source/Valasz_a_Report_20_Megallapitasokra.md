# Válasz a Report 20 felülvizsgálati megállapításokra

**Okoskodó · v1.31.0 · 2026. november 21.**

Ez a dokumentum a független szakértői felülvizsgálat ([`Source/Report_20_Megallapitasok.md`](file:///d:/dev/Röpdolgozat%20program/Source/Report_20_Megallapitasok.md)) észrevételeire adott hivatalos fejlesztői válasz és a végrehajtott javítások tételes igazolása a magyar helyesírás szabályai (MTA 12. kiadása) szerint.

---

## Vezetői összefoglaló

A Report 20 által feltárt nyitott kérdést – az SQLite fejléc-jelölések (`application_id`, `user_version`) figyelmen kívül hagyását és automatikus felülírását a visszaállítás (Restore) és a szerverindítás során – maradéktalanul elemeztük és a legszigorúbb Best Practice elvek szerint rendeztük:

1. **Központi kompatibilitási kapu (`validateDatabaseCompatibility`):**  
   Mind a rendszer-visszaállítás kicsomagolási előzetes ellenőrzésénél (pre-check), mind a migráció legelején és a normál szerverinduláskor egyetlen közös, szigorú eljárás vizsgálja az adatbázis fejlécét még bármilyen írási vagy sémamódosítási művelet előtt.
2. **Újabb sémaverzió védelme és a fejléc-degradáció (downgrade) elhárítása:**  
   Ha egy mentésfájlban vagy meglévő adatbázisban a sémaverzió magasabb, mint a futó szerver aktuális sémaverziója (`user_version > CURRENT_SCHEMA_VERSION`), a rendszer a műveletet azonnal elutasítja. A forrásfájl fejlécét nem írja át, és az aktív tantermi állományokat érintetlenül hagyja.
3. **Idegen alkalmazásazonosító azonnali elutasítása:**  
   Ha a beolvasott adatbázis `application_id`-ja nem `0` és nem az Okoskodó hivatalos azonosítója (`1330335571`, ASCII: `'OKOS'`), a rendszer a fájlt a migráció és bármilyen fájlművelet előtt elutasítja.
4. **Támogatott, jelölés nélküli régi mentések (v1.26):**  
   A korábbi, még fejléc-jelölés nélküli (`application_id = 0`, `user_version = 0`) Okoskodó mentéseket a rendszer a magtáblák és oszlopok ujjlenyomata alapján automatikusan felismeri, engedélyezi a sémamigrációt, és a sikeres lefutás után rögzíti az érvényes fejléc-azonosítókat.
5. **Egyetlen, védett beírási pont:**  
   Az `applyPragmas` függvényből és a `DATABASE_SCHEMA.sql` állományból kivezettük a fejléc feltétel nélküli felülírását. A hivatalos `application_id` és a friss `user_version = 13100` kizárólag a `migrateDatabase` sikeres befejezése után íródik be az adatbázisba. Megszakadó migráció esetén a fejléc megőrzi eredeti állapotát.
6. **Dokumentációs javítás:**  
   A Report 19 válaszdokumentumában javítottuk a sémaleírásban maradt `12900`-as hivatkozást `13000`-re.

---

## Tételes válaszok és műszaki megvalósítás

### 1. Az elfogadási döntésnek használnia kell a mentés jelöléseit (Report 20 / 1. fejezet)

* **Észrevétel:**  
  A korábbi megvalósításban a kicsomagolt adatbázis előzetes olvasási vizsgálata nem kérdezte le a `PRAGMA application_id` és `PRAGMA user_version` értékeket. Ezt követően a kapcsolatnyitáskor az `applyPragmas` a migráció előtt automatikusan beírta az `application_id`-t és a `13000` sémaverziót, felülírva és degradálva az újabb vagy idegen állományok fejlécét.
* **Műszaki diagnózis:**  
  A SQLite `application_id` (4 bájtos formátumazonosító) és `user_version` (sémaverzió) mezőit nem szabad vakon felülírni a kapcsolat megnyitásakor. Az ellenőrzésnek meg kell előznie a sémamigrációt és minden írási műveletet.
* **Elvégzett javítás:**  
  1. **Konstansok definiálása:**  
     A [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js) állományban központilag rögzítettük:  
     `const OKOS_APPLICATION_ID = 1330335571; // ASCII 'OKOS'`  
     `const CURRENT_SCHEMA_VERSION = 13100;   // v1.31.0 sémaverzió`
  2. **`validateDatabaseCompatibility` eljárás megalkotása:**  
     Közös eljárást vezettünk be, amely:  
     - Ellenőrzi a `PRAGMA integrity_check` épségét.  
     - Kiolvassa az `application_id`-t: ha `appId !== 0 && appId !== OKOS_APPLICATION_ID`, azonnal elutasítja az állományt.  
     - Kiolvassa a `user_version`-t: ha `userVersion > CURRENT_SCHEMA_VERSION`, azonnal kivételt dob: *„Inkompatibilis adatbázis: az adatbázis újabb sémaverziójú, mint a futó szoftver!”*.  
     - Ha az adatbázis már tartalmaz táblákat, ellenőrzi a kötelező Okoskodó magtáblák (`quizzes`, `questions`, `students`, `sessions`, `participants`, `answers`) és azok oszlopainak meglétét.  
  3. **`applyPragmas` megtisztítása:**  
     A kapcsolatnyitási beállítások közül eltávolítottuk az `application_id` és `user_version` írását. Az `applyPragmas` mostantól kizárólag a működéshez szükséges technikai pragma-kat állítja be: `journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`.
  4. **`DATABASE_SCHEMA.sql` megtisztítása:**  
     A sémafájlból töröltük a hardkódolt `PRAGMA application_id` és `PRAGMA user_version` parancsokat.
  5. **Egyetlen beírási pont a sikeres migráció végén:**  
     A `migrateDatabase` függvény legelején lefut a `validateDatabaseCompatibility`. Ha az ellenőrzés sikeres, lefutnak az SQL migrációk és triggerek, és **kizárólag a legutolsó lépésként** íródik be az `application_id = 1330335571` és a `user_version = 13100`. Hiba esetén a fejléc érintetlen marad.
  6. **Kétlépcsős Restore pre-check kapu:**  
     A [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js) eljárásban a kicsomagolt adatbázist a `validateDatabaseCompatibility` ellenőrzi még a migráció és a fájlcsere előtt. Az 5. lépésben a kicsomagolt adatbázis tesztelése igazolja a migráció utáni helyes fejlécet.

---

### 2. Elfogadási próbák igazolása (27–31. teszt)

A [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js) tesztmodulban mind az 5 specifikált esetet automatizált integrációs tesztekkel fedtük le:

* **27. teszt (Idegen SQLite adatbázis elutasítása és aktív adatok épsége):**  
  A pre-check kapu elutasította a más szerkezetű SQLite mentést (`chrome_history`). A teszt igazolja, hogy az aktív adatbázis SHA-256 ellenőrző összege a hiba előtt és után bitre megegyezik.
* **28. teszt (Újabb sémaverziójú mentés elutasítása és verzióvédelem):**  
  Szintetikus Okoskodó-mentést készítettünk `user_version = 13200` értékkel (újabb, mint a jelenlegi 13100). A restore a pre-check során azonnal elutasította. A forrásfájlban a `user_version` változatlanul `13200` maradt (nem degradálódott), az aktív adatbázis SHA-256 hash-e pedig érintetlen maradt.
* **29. teszt (Idegen alkalmazásazonosító elutasítása):**  
  Szintetikus adatbázis `application_id = 999999` értékkel. A restore azonnal elutasította a migráció előtt.
* **30. teszt (Támogatott, jelölés nélküli v1.26 mentés visszatöltése):**  
  `application_id = 0` és `user_version = 0` beállítású régi v1.26 mentést csomagoltunk be. A rendszer felismerte a szerkezeti ujjlenyomatot, sikeresen lefutott a restore és a migráció, az éles adatbázis fejlécében pedig megjelent az `application_id = 1330335571` és a `user_version = 13100`.
* **31. teszt (Induláskori kompatibilitás-védelem az `init.js`-ben):**  
  Közvetlenül teszteltük, hogy az indításkori kompatibilitási kapu újabb sémaverziójú (`user_version = 99999`) adatbázis esetén kivételt dob, és nem módosítja a fejlécet.

---

### 3. Dokumentációs pontosítás (Report 20 / 3. fejezet)

* A [`Source/Valasz_a_Report_19_Megallapitasokra.md`](file:///d:/dev/Röpdolgozat%20program/Source/Valasz_a_Report_19_Megallapitasokra.md#L35) fájl 35. sorában a sémaleírásban szereplő `12900`-as verziót javítottuk `13000`-re.
* A projekt verziószámát hivatalosan **v1.31.0**-ra léptettük a [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json), a [`project-context.md`](file:///d:/dev/Röpdolgozat%20program/project-context.md) és a kliensoldali felületek cache-buster paramétereiben (`admin.html`, `student.html`, `projector.html`).
* A [`CHANGELOG.md`](file:///d:/dev/Röpdolgozat%20program/CHANGELOG.md) állományban létrehoztuk az önálló `## [1.31.0] – 2026-11-21` kiadási szakaszt.

---

## Összegző teszteredmények

Az elszigetelt központi tesztfuttatóval végrehajtott `npm test` ellenőrzés során:
* 17 alaprendszer-teszt (`test_full_system.js`),
* célzott Report 12 tesztek (`test_report12_fixes.js`),
* Socrative importőr tesztek (`test_socrative_import.js`),
* tesztösszefésülési tesztek (`test_merge_quizzes.js`),
* valamint a **31 integrációs és regressziós teszt** (`test_report14_fixes.js`)

**100%-os sikerrel, 0-s kilépési kóddal zárult**, miközben az éles projektadatbázis (`data/ropdolgozat.db`) ellenőrző összege garantáltan változatlan maradt.
