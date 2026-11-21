# Válasz a Report 22 felülvizsgálati megállapításokra

**Okoskodó · v1.33.0 · 2026. november 21.**

Ez a dokumentum a független szakértői felülvizsgálat ([`Source/Report_22_Megallapitasok.md`](file:///d:/dev/Röpdolgozat%20program/Source/Report_22_Megallapitasok.md)) észrevételeire adott hivatalos fejlesztői válasz és a végrehajtott javítások tételes igazolása a magyar helyesírás szabályai (MTA 12. kiadása) szerint.

---

## Vezetői összefoglaló

A Report 22 által feltárt peremhelyzetet – az időbélyeg-oszlopok nélküli korábbi (v1.26-os) mentések visszaállítása után létrehozott tesztek üres időbélyegeit és a tanári lista ebből adódó sorrendi elcsúszását – maradéktalanul elemeztük és a legszigorúbb Best Practice elvek szerint rendeztük:

1. **A probléma gyökere:**  
   Amikor egy korábbi mentésből visszatöltött adatbázis sémamigrációja lefut, a `quizzes.created_at` és `quizzes.updated_at` mezők az SQLite `ALTER TABLE ADD COLUMN` korlátozásai miatt `DEFAULT NULL` oszlopként jönnek létre. Bár a meglévő sorokat a migráció kitöltötte, az ezt követően beszúrt új tesztek a táblaséma `DEFAULT NULL` alapértékét kapták, mivel a [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js) `createQuiz` művelete eddig nem adott meg explicit értéket ezen oszlopokhoz az `INSERT INTO quizzes` parancsban.
2. **Központi, relációbiztos javítás:**  
   A `quizRepo.createQuiz` eljárásban az `INSERT INTO quizzes` lekérdezést kiegészítettük a `created_at` és `updated_at` mezőkkel, amelyekhez az SQLite beépített `CURRENT_TIMESTAMP` konstansát rendeltük hozzá közvetlenül a beszúráskor.
3. **Minden létrehozási útvonal azonnali védelme:**  
   Mivel a feladatsor másolása (`duplicateQuiz`), az egyesítés (`mergeQuizzes`) és a Socrative kvízimportőr is ezen a közös `createQuiz` függvényen keresztül fut, az összes funkció garantáltan kitöltött időbélyegeket generál.
4. **Helyes tanári listarendezés:**  
   A tanári vezérlőpult tesztlistája (`ORDER BY q.updated_at DESC, q.id DESC`) mostantól minden környezetben – a friss telepítésen és a migrált korábbi mentéseken egyaránt – megbízhatóan a lista legelejére rendezi az újonnan létrehozott teszteket a meglévő tesztek elé.

---

## Tételes válasz és műszaki megvalósítás

### Explicit időbélyeg-rögzítés tesztbeszúráskor (Report 22)

* **Érintett fájlok:**  
  [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js#L352-L355), [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js#L411-L415)
* **Megvalósítás:**  
  A `createQuiz` függvényben az előkészített SQL utasítás:
  ```javascript
  const insertQuiz = db.prepare(`
    INSERT INTO quizzes (
      subject_id, folder_id, title, subject_grade, default_time_limit_min,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  ```
  Hasonlóan frissítésre került a [`src/db/init.js`](file:///d:/dev/Röpdolgozat%20program/src/db/init.js) induláskori mintateszt-beszúrása is.

---

## Elfogadási próbák és teszteredmények (35. teszt)

A [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js) tesztmodul kibővült a **35. integrációs teszttel**:

1. **Szintetikus régi mentés visszaállítása:**  
   Olyan v1.26 adatbázist hoztunk létre, amelyből hiányzott a `quizzes.created_at` és `quizzes.updated_at` mező, és tartalmazott egy meglévő tesztet rögzített korábbi időponttal (`2026-01-01 10:00:00`).
2. **Mentés visszaállítása és új teszt létrehozása:**  
   A `backup.restoreSystemBackup` eljárással visszatöltöttük az állományt, majd meghívtuk a közös `quizRepo.createQuiz` műveletet.
3. **Eredmények ellenőrzése:**  
   - A régi teszt adatai és korábbi időbélyege sértetlenek maradtak.
   - Az új teszt `created_at` és `updated_at` mezői érvényes, kitöltött időbélyeget kaptak (nem `NULL`).
   - A tanári `quizRepo.getQuizzes()` lekérdezésben az újonnan létrehozott teszt megelőzte a régit, és a lista legelső helyén jelent meg.

A teljes tesztcsomag (`npm test`) mind a **35 célzott integrációs és regressziós teszten, valamint a 17 alaprendszer-teszten (összesen 52 teszten) 100%-os sikerrel, 0-s kilépési kóddal zárult**.
