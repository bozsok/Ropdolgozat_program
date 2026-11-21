# Válasz a Report 21 felülvizsgálati megállapításokra

**Okoskodó · v1.32.0 · 2026. november 21.**

Ez a dokumentum a független szakértői felülvizsgálat ([`Source/Report_21_Megallapitasok.md`](file:///d:/dev/Röpdolgozat%20program/Source/Report_21_Megallapitasok.md)) észrevételeire adott hivatalos fejlesztői válasz és a végrehajtott javítások tételes igazolása a magyar helyesírás szabályai (MTA 12. kiadása) szerint.

---

## Vezetői összefoglaló

A Report 21 mindhárom felvetését – a sikertelen migráció fail-fast kezelését, az induláskori írásvédelmet, valamint az üres adatbázis visszaállítási szabályozását – maradéktalanul rendeztük:

1. **Szigorú fail-fast sémamigráció és biztonságos mezőpótlás (Report 21 / 1. pont – Kiadást blokkoló):**  
   A sémamigrációs eljárásból (`migrateDatabase`) kivezettük a korábbi csendes hibaelnyelést (`console.error`). Bármely kötelező migrációs lépés meghiúsulása esetén a folyamat azonnal kivételt dob és leáll. Így a sérült vagy félkész adatbázis **soha nem kaphatja meg az aktuális `user_version` verzióbélyeget**, a rendszer-visszaállítás (Restore) elutasítja az állományt, és a rollback-védelem érintetlenül megőrzi az éles környezetet. A meglévő időbélyeg-oszlopok (`quizzes.created_at`, `quizzes.updated_at`, `answers.answered_at`) migrációját átalakítottuk a szabványos kétlépcsős eljárásra (`DEFAULT NULL` + `UPDATE ... = datetime('now')`), kiküszöbölve az SQLite `ALTER TABLE ADD COLUMN` nem konstans alapértékekre vonatkozó korlátozását. A restore utóellenőrzése immár a teljes tanári és tanulói lekérdezések futtatásával vizsgálja a kész séma épségét.

2. **Írásvédett szerverindulási kapu meglévő adatbázis esetén (Report 21 / 2. pont):**  
   Meglévő adatbázis esetén a kiszolgáló indításkor először kizárólag olvasásra nyitja meg a fájlt (`{ readonly: true, fileMustExist: true }`). A kompatibilitási ellenőrzés (`validateDatabaseCompatibility`) még azelőtt lefut, hogy a szerver írható kapcsolatot nyitna vagy a naplózási módot (`journal_mode = WAL`) beállítaná. Ha az adatbázis inkompatibilis (újabb séma vagy idegen alkalmazás), a folyamat azonnal megáll: a fájl naplózási módja, fejléce és SHA-256 ellenőrző összege 100%-ban bitre érintetlen marad, és nem jönnek létre `-wal` vagy `-shm` állományok.

3. **Explicit szabályozás az üres adatbázisokra (Report 21 / 3. pont):**  
   A `validateDatabaseCompatibility` explicit `allowEmpty` opciót kapott. Rendszer-visszaállítás során (`allowEmpty = false`) a mentési ZIP-ben lévő 0 táblás, teljesen üres SQLite fájlt a pre-check kapu azonnal elutasítja. Ezzel egyidejűleg a táblák létezése és a tárolt rekordok mennyisége szétválasztásra került: egy olyan szabályos Okoskodó mentés, amely tartalmazza a kötelező alaptáblákat, de még nem tartalmaz diákokat vagy dolgozatokat (üres tanterem), továbbra is hibátlanul visszatölthető. Friss telepítéskor a rendszer önállóan létrehozza a sémát.

---

## Tételes válaszok és műszaki megvalósítás

### 1. Sikertelen kötelező migráció kezelése és mezőpótlás (Report 21 / 1. fejezet)

* **Észrevétel és diagnózis:**  
  A korábbi megvalósításban a `migrateDatabase` migrációs blokkjai elnyelték az SQL hibákat. Az SQLite az `ALTER TABLE ADD COLUMN` parancsban elutasítja a `DEFAULT CURRENT_TIMESTAMP` kifejezést, mert az nem konstans érték. A catch blokk elnyelte a hibát, a `created_at` oszlop nem jött létre, a migráció legvégén lefutott a verzióbélyegzés, a restore utóellenőrzése pedig nem kérdezte le ezt a mezőt. Ennek következtében a tanári tesztlista (`quizRepo.getQuizzes`) `no such column: q.created_at` hibával meghiúsult.
* **Elvégzett javítások:**  
  1. A [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js) állományban a `created_at`, `updated_at` és `answered_at` mezők migrációját `DEFAULT NULL` konstans alapértékre és azonnali feltöltésre (`UPDATE ... SET ... = datetime('now') WHERE ... IS NULL`) cseréltük.
  2. A `migrateDatabase` minden lépéséből eltávolítottuk a csendes hibaelnyelést: hiba esetén azonnal kivételt dobunk (`throw new Error(...)`), megakadályozva a `user_version` felülírását.
  3. A [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js) utóellenőrzési lépése kibővült a `getQuizzes` teljes SELECT lekérdezésével (minden mező: `id`, `subject_id`, `folder_id`, `title`, `subject_grade`, `default_time_limit_min`, `locked_at`, `created_at`, `updated_at`, `question_count`, `total_points`), valamint a `participants` és `answers` táblák teljes oszlopkészletének futtatásával.

---

### 2. Írásvédett indulási kompatibilitás-ellenőrzés (Report 21 / 2. fejezet)

* **Észrevétel és diagnózis:**  
  Induláskor a szerver azonnal írható kapcsolatot nyitott és beállította a `journal_mode = WAL` módot. Ha a fájl újabb sémájú vagy `DELETE` naplózási módú volt, az indítás elutasítása előtt a naplózási mód már átváltott WAL-ra, módosítva a fájl fejlécét és SHA-256 ellenőrző összegét.
* **Elvégzett javítások:**  
  1. A [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js) betöltésekor, ha a `config.dbPath` fájl már létezik a lemezen, a rendszer először `{ readonly: true, fileMustExist: true }` kapcsolattal ellenőrzi a kompatibilitást a `validateDatabaseCompatibility` meghívásával.
  2. Kizárólag a sikeres olvasási vizsgálat után nyílik meg az írható kapcsolat és fut le az `applyPragmas`.
  3. Inkompatibilis adatbázis esetén a folyamat kivétellel leáll: a lemezen lévő fájl naplózási módja és ellenőrző összege bájtra pontosan változatlan marad, és nem jönnek létre segédfájlok (`-wal`, `-shm`).

---

### 3. Explicit üres adatbázis szabályozás (Report 21 / 3. fejezet)

* **Észrevétel és diagnózis:**  
  A `validateDatabaseCompatibility` 0 tábla esetén nem jelzett hibát, mert új telepítésnél ez természetes állapot. Mentés visszaállításakor viszont egy 0 táblás üres SQLite fájl nem érvényes Okoskodó mentés.
* **Elvégzett javítások:**  
  1. Bevezetésre került az `allowEmpty` opció a `validateDatabaseCompatibility`-ben. Mentés visszaállításakor (`context === 'mentés visszaállítása'`, `allowEmpty = false`) a rendszer azonnal elutasítja a 0 táblás állományokat.
  2. Megkülönböztetjük a séma hiányát az adatok hiányától: egy olyan mentés, amely tartalmazza a kötelező táblákat, de rekordokat nem (pl. üres névsorú iskola), érvényesnek minősül és sikeresen visszaállítható.

---

### 4. Verzióemelés

* A rendszer verziószáma hivatalosan **v1.32.0**-ra, az SQLite sémaverzió pedig **13200**-ra emelkedett.
* A módosítások átvezetésre kerültek a [`package.json`](file:///d:/dev/Röpdolgozat%20program/package.json), a [`project-context.md`](file:///d:/dev/Röpdolgozat%20program/project-context.md), a felhasználói felületek (`admin.html`, `student.html`, `projector.html`), valamint a [`CHANGELOG.md`](file:///d:/dev/Röpdolgozat%20program/CHANGELOG.md) állományokban.

---

## Elfogadási próbák és teszteredmények (32–34. tesztek)

A [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js) modulban automatizált regressziós tesztekkel fedtük le az összes érintett esetet:

* **32. teszt (Sikertelen sémamigráció megállítása és időbélyeg-migráció igazolása):**  
  - Szándékosan blokkolt sémamigráció esetén igazoltuk, hogy a `migrateDatabase` kivételt dob, a fejlécben lévő `user_version` nem frissül fel (megőrzi a korábbi verziószámot), és a restore nem cseréli le az adatbázist.
  - Szintetikus v1.26 adatbázist készítettünk `created_at` és `updated_at` nélkül: a restore és migráció hibátlanul lefutott, pótolta a mezőket, és a tényleges tanári tesztlista (`quizRepo.getQuizzes`) hiba nélkül megnyílt.
* **33. teszt (Tényleges indítási folyamat elutasítása fájlmódosítás és WAL váltás nélkül):**  
  - Külön Node.js gyermekfolyamatban futtattuk az `init.js` belépési pontját egy `DELETE` naplózási módú, újabb sémájú adatbázissal.
  - Igazoltuk, hogy a folyamat nem 0 kóddal kilépett, miközben a fájl SHA-256 ellenőrző összege és `DELETE` naplózási módja 100%-ban bitre érintetlen maradt, és sem `-wal`, sem `-shm` fájl nem jött létre.
* **34. teszt (Üres, 0 táblás SQLite mentés elutasítása a pre-checkben):**  
  - Igazoltuk, hogy a 0 táblás teljesen üres SQLite fájlt tartalmazó mentést a restore pre-check azonnal elutasítja, miközben az éles adatbázis hash-e változatlan marad.

Az elszigetelt tesztkörnyezetben futtatott `npm test` parancs mind a **34 célzott integrációs és regressziós teszten, valamint a 17 alaprendszer-teszten (összesen 51 teszten) 100%-os sikerrel, 0-s kilépési kóddal zárult**.
