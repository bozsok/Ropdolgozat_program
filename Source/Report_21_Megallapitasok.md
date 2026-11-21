# Report 21 – A Report 20 javításainak visszaellenőrzése

**Okoskodó · v1.31.0 · Git `760453d` · 2026. november 21.**

## Élesítési összegzés

A Report 20-ban megfigyelt visszacímkézési hiba a restore vizsgált útvonalán javult. Az újabbnak jelölt mentést a szerver elutasította, és a mentési ZIP, az aktív adatbázis és a tesztkép ellenőrző összege megmaradt. A támogatott, jelölés nélküli v1.26 séma visszaállítható volt, és utána megnyílt a tesztlista. A teljes `npm test` 0-s kóddal zárt, a 31 célzott ellenőrzéssel együtt.

**Elsőbbséget a sikertelen migráció kezelésének adnék.** A próbában egy sikertelen oszlopmigráció után a restore sikert jelzett és aktuális verzióval jelölte meg az adatbázist. A tanári tesztlista utána hibára futott. Két további kérdés az indulás előtti fájlvédelem és az üres SQLite-adatbázis restore előtti elutasítása. Valódi adatokkal végzett átvétel előtt ezeket is ellenőrizni kell.

| Sorrend | Megállapítás | Bizonyíték | Státusz |
|---|---|---|---|
| 1 | Sikertelen kötelező migráció után a restore sikert jelenthet | A hiányzó oszlop pótlása hibázott, a verzió mégis `13100` lett, a tesztlista pedig hibázott. | **Kiadást blokkoló** |
| 2 | Normál induláskor az elutasított fájl már módosulhat | A tényleges indítófolyamat elutasította az újabb sémát, de a naplózási mód és az adatbázis fájlhash-e megváltozott. | **Nyitott** |
| 3 | Az üres SQLite-adatbázis átjuthat a restore előellenőrzésén | A közös validátor elfogadta az üres adatbázist. A visszaállítás élesítő részéig ezt az esetet nem futtattam. | **Nyitott** |

A vizsgálat a [Report 20 megállapításaira](Report_20_Megallapitasok.md) és a [v1.31.0 fejlesztői válaszára](Valasz_a_Report_20_Megallapitasokra.md) vonatkozik. A próbák elkülönített Windows x64 projektmásolatban, Node `24.14.0` alatt, szintetikus adatbázissal futottak. Az iskolai Windows Serveren való telepítés és a többgépes böngészős átvétel külön ellenőrzés.

## 1. Sikertelen migráció után hibás állapot léphet életbe

### Megállapítás és futtatási eredmény

A migráció több kötelező lépés hibáját naplózza, majd folytatja a feldolgozást. A végén a sémafájlt lefuttatja és beírja az aktuális `user_version` értéket. A restore utóellenőrzése megnézi az integritást, az idegen kulcsokat és néhány kötelező objektumot. A tesztlista előpróbája csak a kvízazonosítót és a törlési jelzőt érinti. A tényleges tesztlista viszont a `created_at` és az `updated_at` oszlopot is olvassa. [Oszlopmigráció és hibakezelés](../src/db/init.js#L165) · [Sémaverzió beírása](../src/db/init.js#L362) · [Restore utóellenőrzése](../src/services/backup.js#L127) · [A tesztlista lekérdezése](../src/db/quizRepo.js#L22)

Az elkülönített próbában egy hiányos, de ép és adatot tartalmazó régi sémát állítottam vissza. A `quizzes.created_at` oszlop hiányzott. Hozzáadását a SQLite elutasította a `DEFAULT CURRENT_TIMESTAMP` miatt. A függvény naplózta a hibát, továbbment, és beírta a `13100` verziót. A restore sikeresnek jelentette magát, a következő tesztlistázás pedig `no such column: q.created_at` hibát adott. A korábbi, ép v1.26 sémájú mentés sikeres visszaállítása ezzel együtt igazolt. [SQLite ALTER TABLE ADD COLUMN](https://sqlite.org/lang_altertable.html#altertabaddcol)

### Javasolt javítás

1. **A kötelező migráció hibája állítsa meg a műveletet.** A migrációs lépés adjon át olyan hibát, amely tartalmazza a lépés nevét és a SQLite eredeti okát. A restore maradjon az ideiglenes példánynál, a normál indulás jelezzen sikertelenséget. A szerver a félkész sémát ne nyissa meg normál használatra.
2. **Használj a SQLite által támogatott, adatmegőrző oszlopmigrációt.** Ha az oszlop hozzáadható egyszerű alapértékkel, külön, dokumentált lépésben töltsd vissza a történeti értékeket. Ha a végleges megszorítások vagy az alapérték miatt táblacsere kell, a SQLite dokumentált táblarekonstrukciós eljárását kövesd. Őrizd meg az azonosítókat, idegen kulcsokat, indexeket és triggereket. A hiányzó eredeti időbélyeghez a termékszabály kezelje ismeretlenként vagy egyértelműen pótlólag rögzített értékként. [SQLite ALTER TABLE és táblarekonstrukció](https://sqlite.org/lang_altertable.html)
3. **A verzió a befejezett migrációt jelölje.** Ahol a migrációs műveletek ezt lehetővé teszik, a sémaváltás, a kötelező ellenőrzések és a verzió beállítása tartozzon ugyanahhoz a tranzakcióhoz. A kapcsolat vagy idegenkulcs-ellenőrzés állapotát változtató PRAGMA-k sorrendjét a SQLite szabályai szerint kezeld. Restore esetén a migrált példány a tényleges alkalmazáslekérdezések ellenőrzése után cserélheti le az aktív fájlt. [SQLite tranzakciók](https://sqlite.org/lang_transaction.html) · [SQLite idegenkulcs-ellenőrzés](https://sqlite.org/pragma.html#pragma_foreign_key_check)

**Elfogadás.** A kötelező migráció hibájánál a restore egyértelmű hibát jelez, az aktív adatbázis és a hozzá tartozó képek változatlanok maradnak. Egy sikeresen migrált régi mintán a valódi tesztlistázás, az archívum megnyitása és a válaszmentés működik szerver-újraindítás nélkül. A teszt a hibás futásban azt is ellenőrizze, hogy a félkész példány nem kapott új sémaverziót.

## 2. Az induláskori ellenőrzés előtt írás történhet

### Megállapítás és futtatási eredmény

A modul írható adatbázis-kapcsolatot nyit, majd meghívja az `applyPragmas` függvényt. Ez tartalmazza a `journal_mode = WAL` beállítást. A kompatibilitás vizsgálatára később, a migráció elején kerül sor. A 31. teszt közvetlenül a validátort hívja, és azt ellenőrzi, hogy az elutasított adatbázis sémaverziója megmarad. Ez a teszt a normál indulás sorrendjét nem járja végig. [Indulási sorrend](../src/db/init.js#L19) · [Migráció eleji ellenőrzés](../src/db/init.js#L131) · [A 31. teszt](../scratch/test_report14_fixes.js#L1259)

Külön folyamatban a tényleges `init.js` belépési pontot futtattam `13200` sémaverziójú, `DELETE` naplózási módú adatbázissal. A folyamat hibával leállt, és a sémaverzió megmaradt. A naplózási mód közben `WAL`-ra váltott, a főfájl SHA-256 ellenőrző összege megváltozott. A SQLite naplózási módjának átállítását ezért az írással járó lépések közé kell sorolni. [SQLite journal_mode](https://sqlite.org/pragma.html#pragma_journal_mode)

### Javasolt javítás

- Meglévő adatbázist az indulási előellenőrzés csak olvasásra nyisson meg. Csak az elfogadott fájlt nyisd meg írható kapcsolattal, és utána állítsd be a naplózási módot, illetve futtasd a migrációt. A sémaverzió és az alkalmazásazonosító ellenőrzése előzze meg a fájl módosítását. A fájl létrehozását az új telepítés külön útvonala kezelje.
- Az elfogadási teszt külön folyamatban indítsa a tényleges kiszolgálói belépési pontot, elkülönített adatbázissal és képtárral. Ellenőrizze a kilépési kódot, az üzenetet, a sémaverziót, a naplózási módot és a főfájl tartalmát. A kapcsolódó `-wal` és `-shm` állományok létrejöttét vagy változását is figyelje.

**Elfogadás.** Újabb sémájú vagy idegen alkalmazásazonosítójú meglévő adatbázis esetén az indítófolyamat hibával leáll, a fájl ellenőrző összege és a naplózási mód változatlan. Támogatott régi fájllal a migráció működik. Tiszta telepítéskor a kiszolgáló a szokásos módon hozza létre az adatbázist.

## 3. Az üres adatbázis elfogadása függjön a művelettől

### Megállapítás és bizonyíték

A közös validátor a kötelező táblákat és oszlopokat csak akkor vizsgálja, ha már talál táblát. A közvetlen próbában egy üres, jelölés nélküli SQLite-adatbázist elfogadott. Az új telepítésnek ez megfelelő kezdőállapot. A restore ugyanazt a validátort hívja, külön sémajelenlét-követelmény nélkül. A forrás alapján egy üres adatbázis átmehet az előellenőrzésen, majd a közös migráció létrehozhatja a később ellenőrzött táblákat. Ebben az esetben a teljes restore és a fájlcsere nem futott le a próbában. [Üres adatbázis kezelése](../src/db/init.js#L56) · [Restore előellenőrzése](../src/services/backup.js#L108)

### Javasolt javítás és elfogadás

Használj közös sémapolitikát, **a művelethez tartozó explicit feltételekkel**. Az új adatbázis létrehozásakor engedélyezhető az üres állapot. Restore-nál a mentésnek már az eredeti, olvasásra megnyitott állapotában tartalmaznia kell a támogatott Okoskodó-séma azonosításához szükséges objektumokat. A táblák létezése és a táblákban tárolt adatok mennyisége külön ellenőrzés. Egy szabályosan létrehozott, még üres névsorú Okoskodó-mentés továbbra is visszatölthető.

Az elfogadási próbában egy séma nélküli SQLite-fájl restore-ja a csere előtt elutasítást kap. Az aktív adatbázis, a képtár és meglévő helyreállítási példányok tartalma változatlan. Ugyanebben a tesztcsoportban az adat nélküli, de érvényes Okoskodó-séma mentése sikeres, és a friss telepítés továbbra is önállóan létrehozza a szükséges táblákat.

## 4. Igazolt javítások és javasolt átvételi sorrend

| Ellenőrzés | Eredmény |
|---|---|
| Újabb sémájú mentés visszaállítása | Elutasítva. A mentési ZIP, az aktív adatbázis és a tesztkép ellenőrző összege változatlan volt. |
| Jelölés nélküli v1.26 séma | Sikeresen migrálódott, és a tényleges tesztlista lekérdezése működött. |
| Teljes `npm test` | 0-s kilépési kód. Mind a 31 célzott ellenőrzés lefutott, az alapértelmezett projektadatbázis nem jött létre a tiszta másolatban. |

[Restore-kompatibilitás](../src/services/backup.js#L108) · [Újabb sémájú mentés tesztje](../scratch/test_report14_fixes.js#L1049) · [Régi séma tesztje](../scratch/test_report14_fixes.js#L1143) · [Tesztparancs](../package.json#L9)

1. **Sikertelen migráció kezelése.** A kötelező oszlopmigráció hibája állítsa meg a restore-t, és a kész sémát ellenőrizze a tényleges tanári tesztlista lekérdezése.
2. **Írás előtti indulási ellenőrzés.** A tényleges indítófolyamat elutasítási próbája mérje az adatbázis teljes tartalmát és a naplózási állapotot.
3. **Külön szabály az üres bemenetre.** Az üres telepítési állapot és a séma nélküli restore legyen két külön, automatizált eset. Maradjon meg a jelölés nélküli, támogatott v1.26 mentés pozitív próbája.
4. **Tantermi átvétel.** Az előző javítások után az iskola tényleges Windows Server-csomagján szintetikus névsorral fusson végig az indítás, a dolgozatírás, a mentés és a helyreállítás.

A Report 20-ra adott válaszban a restore fejlécvédelme és a v1.26 kompatibilitása a kipróbált mintákkal igazoltként rögzíthető. Az indulás előtti teljes fájlvédelem, a migrációs hibák kezelésének garanciája és az üres restore szabálya maradjon nyitott a fenti próbák teljesüléséig.
