# Válasz a Report 18 felülvizsgálati megállapításokra

**Okoskodó · v1.28.0 · 2026. november 21.**

Ez a dokumentum a független szakértői felülvizsgálat ([`Source/Report_18_Megallapitasok.md`](file:///d:/dev/Röpdolgozat%20program/Source/Report_18_Megallapitasok.md)) észrevételeire adott hivatalos fejlesztői válasz és a végrehajtott javítások tételes igazolása a magyar helyesírás szabályai (MTA 12. kiadása) szerint.

---

## Vezetői összefoglaló

A Report 18 által feltárt valamennyi hiányosságot maradéktalanul elemeztük és javítottuk:
1. **Restore utáni azonnali triggermegújítás:** A rendszer-visszaállítás (`restoreSystemBackup`) mostantól a közös `migrateDatabase` eljárással automatikusan megújítja az adatbázis sémáját és triggereit még a fájlcsere előtt. Így a korábbi (v1.26-os) mentésekből visszatöltött adatbázison azonnal az új, pillanatkép-védett triggerek válnak aktívvá, megelőzve a pontplafon elavult korlátozásaiból fakadó válaszmegtagadásokat.
2. **Elkülönített, műveletenként egyedi helyreállítási másolatok:** A restore során az eredeti adatbázisról és képekről készülő biztonsági snapshotok mostantól műveletenként egyedi, időbélyeggel és azonosítóval védett mappába (`_restore_snapshots/restore_op_<id>`) kerülnek. Egy új restore kizárólag a saját mappáját takarítja el; egy korábbi hibából megőrzött példányt soha nem ír felül és nem töröl.
3. **Pillanatkép nélküli történeti dolgozatok diákoldali védelme:** A `quizRepo.getQuizById` kiegészült az `includeDeleted` kapcsolóval. Ha a tanár a feladattárban töröl egy régebbi sablont, a korábbi (pillanatkép nélküli) dolgozatok diákoldali és tanári nézete egyaránt hibátlanul megnyílik (megszűnt a HTTP 500 belső szerverhiba).
4. **100%-ban elszigetelt tesztfuttató (`npm test`):** Létrehoztuk a [`scratch/run_all_tests.js`](file:///d:/dev/Röpdolgozat%20program/scratch/run_all_tests.js) központi tesztfuttatót, amely az operációs rendszer ideiglenes könyvtárában (`os.tmpdir()`) futtatja a teljes integrációs és regressziós tesztcsomagot. A futás előtt és után a projekt éles adatbázisának (`data/ropdolgozat.db`) ellenőrző összege (checksum) bájtra azonos marad (`Checksum match: True`), és nem jönnek létre felesleges tesztfájlok a projektben.

---

## Tételes válaszok és műszaki megvalósítás

### 1. A mentés visszaállítása után a pontozási séma elavult maradhat (Report 18 / 1. pont – Kiadást blokkoló)

* **Észrevétel:**  
  A v1.26-os mentés visszaállítása után a tesztlista megnyílt, de egy 4 pontos kérdés indítása után, ha a tanár a sablonban 1 pontra mérsékelte a feladatot, a diák 4 pontos helyes válaszát az elavult SQLite trigger elutasította.
* **Műszaki diagnózis:**  
  A `restoreSystemBackup` pótolta a hiányzó oszlopokat, de nem futtatta le a triggerek eldobását és a `DATABASE_SCHEMA.sql` frissítését a kicsomagolt adatbázison. Így az adatbázis megőrizte a régi `trg_validate_answer_points_limit` triggert, amely nem ismerte a dolgozatkori snapshotot.
* **Elvégzett javítás:**  
  1. Az [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js) fájlban létrehoztuk az önálló `migrateDatabase(targetDb)` függvényt, amely tetszőleges SQLite adatbázis-kapcsolaton elvégzi az összes strukturális migrációt, eldobja az elavult triggereket, és újraépíti a legfrissebb sémát és triggereket a `DATABASE_SCHEMA.sql` alapján.
  2. A [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js) `restoreSystemBackup` eljárása még a kicsomagolt ideiglenes adatbázison meghívja a `db.migrateDatabase(migrateDb)` függvényt, majd a sémateszt során ellenőrzi a kötelező triggerek (`trg_validate_answer_points_limit`, `trg_validate_answer_points_limit_update`, `trg_validate_answer_question`) meglétét is.
* **Igazolás (24. teszt):**  
  A szintetikus tesztben szimuláltuk a v1.26-os mentést és a régi triggert, majd a restore lefutása után elindítottunk egy 4 pontos dolgozatot, és a sablont 1 pontra csökkentettük. A tanuló beküldte a választ: a pontozás 4.0 ponttal, `CORRECT` státusszal, adatbázishiba nélkül sikeresen lezajlott.

---

### 2. A megőrzött rollback-példány felülírási kockázata (Report 18 / 2. pont – Kiadást blokkoló)

* **Észrevétel:**  
  Kettős hiba esetén a mentési másolat megmaradt, de egy ezt követő új restore ugyanazt a `.bak` útvonalat használta, majd a sikeres lefutás végén törölte azt, megsemmisítve az eredeti mentést.
* **Műszaki diagnózis:**  
  A korábbi megvalósítás fix `config.dbPath + '.bak'` elérési utat használt az adatbázishoz, így az egymást követő restore műveletek felülírták egymás mentéseit.
* **Elvégzett javítás:**  
  1. A [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js) eljárásban bevezettük a műveletenként teljesen egyedi helyreállítási könyvtárat:  
     `_restore_snapshots/restore_op_<timestamp>_<random>/`
  2. Ebben a mappában együtt tárolódik az adatbázis (`ropdolgozat_backup.db`) és a képtárhely (`uploads/`).
  3. Kettős hiba esetén a rendszer a könyvtárba egy `recovery_meta.json` metaadatfájlt ír a hiba részleteivel és időbélyegével, és megőrzi a teljes mappát.
  4. Sikeres restore esetén a `finally` blokk **kizárólag a jelenlegi művelet saját könyvtárát** takarítja el, az előző hibákból megőrzött másolatokhoz nem nyúl hozzá.
* **Igazolás (25. teszt):**  
  A teszt során létrehoztunk egy előző hibából származó védett mentési könyvtárat és adatbázis-másolatot. Ezt követően elindítottunk egy újabb, sikeres restore-t. A teszt igazolta, hogy az újabb restore sikeresen befejeződött, kitakarította a saját mappáját, miközben a korábbi védett könyvtár és fájl tartalma érintetlen maradt a lemezen.

---

### 3. Pillanatkép nélküli régi alkalom diákoldali eredménye törölt sablon esetén (Report 18 / 3. pont – Magas)

* **Észrevétel:**  
  Pillanatkép nélküli régi lezárt alkalomnál a sablon logikai törlése (`is_deleted = 1`) után a diákfelület HTTP 500 hibát adott, miközben a tanári mátrix megnyílt.
* **Műszaki diagnózis:**  
  A [`src/routes/api.js`](file:///d:/dev/Röpdolgozat%20program/src/routes/api.js) `GET /api/student/session-data` végpontján a snapshot hiányában tartalékként hívott `quizRepo.getQuizById(participant.quiz_id, true)` a `WHERE COALESCE(q.is_deleted, 0) = 0` feltétel miatt `null` értékkel tért vissza, ami a diák kérdéslistájának feldolgozásakor `TypeError: Cannot read properties of null (reading 'questions')` kivételt okozott.
* **Elvégzett javítás:**  
  1. A [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js) `getQuizById` függvényét felokosítottuk egy harmadik paraméterrel: `getQuizById(quizId, isStudentView = false, includeDeleted = false)`.
  2. Az `api.js` diák végpontján a történeti tartalék lekérés `includeDeleted = true` értékkel fut, így a már lezajlott vagy futó dolgozatokhoz tartozó kérdések akkor is megjelennek a diáknak, ha a tanár a feladattárból törölte a sablont.
  3. Beépítettünk egy defenzív biztonsági tartalékot: ha a kvízadatok valamilyen adatbázis-sérülés miatt egyáltalán nem lennének fellelhetők, a szerver akkor sem omlik össze HTTP 500-zal, hanem tiszta struktúrával jeleníti meg a diák rögzített pontjait és jegyét.
* **Igazolás (26. teszt):**  
  Pillanatkép nélküli lezárt dolgozatnál a sablon törlése után a teszt igazolta, hogy a szerkesztői nézet kiszűri a törölt tesztet (`null`), míg a diákoldali történeti lekérdezés és a tanári mátrix hibátlanul megnyílik, és a tanuló 2.0 pontos (100%-os) eredménye maradéktalanul megjelenik.

---

### 4. A teljes tesztparancs (`npm test`) függetlenítése a projektadatoktól (Report 18 / 4. pont – Magas)

* **Észrevétel:**  
  A korábbi tesztparancsban a `scratch/test_merge_quizzes.js` nem állított be környezeti változót, így a tesztfutás az éles `data/ropdolgozat.db` adatbázist nyitotta meg és módosította, friss klónban pedig létrehozta azt.
* **Műszaki diagnózis:**  
  A tesztek különálló folyamatokként, egységes ideiglenes munkakörnyezet nélkül futottak le.
* **Elvégzett javítás:**  
  1. Elkészítettük a [`scratch/run_all_tests.js`](file:///d:/dev/Röpdolgozat%20program/scratch/run_all_tests.js) központi tesztfuttatót.
  2. A futtató minden indításkor egyedi ideiglenes könyvtárat hoz létre a rendszer átmeneti tárolójában (`os.tmpdir()`), és a `DB_PATH`, illetve `UPLOADS_DIR` környezeti változókat erre az elszigetelt helyre irányítja.
  3. A [`scratch/test_merge_quizzes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_merge_quizzes.js) és a többi tesztfájl felkészült a `process.env.DB_PATH` és `process.env.UPLOADS_DIR` tiszteletben tartására.
  4. A lefutás után a központi futtató maradéktalanul kitakarítja az ideiglenes mappát.
  5. A `package.json` tesztparancsa frissült: `"test": "node scratch/run_all_tests.js"`.
* **Igazolás:**  
  A tesztfutás előtt és után ellenőriztük a `data/ropdolgozat.db` SHA-256 ellenőrző összegét:  
  `Checksum match: True`  
  A projekt `data` mappájában semmilyen új adatbázis vagy átmeneti tesztfájl nem jön létre.

---

## Összegző teszteredmények

Az `npm test` parancs futtatásával:
* 17 alaprendszer-teszt (`test_full_system.js`),
* a célzott Report 12 tesztek (`test_report12_fixes.js`),
* a Socrative PDF importőr tesztek (`test_socrative_import.js`),
* a tesztösszefésülési tesztek (`test_merge_quizzes.js`),
* valamint a **26 integrációs és regressziós teszt** (`test_report14_fixes.js`)

**100%-os sikerrel, 0-s hibakóddal lefutott**, elszigetelt környezetben, az éles projektadatok teljes érintetlensége mellett.
