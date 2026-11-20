# Válasz a Report 17 szakértői megállapításaira és a tantermi élesítés követelményeire

**Dátum:** 2026. november 21.  
**Rendszerverzió:** `v1.28.0` (Éles tantermi kiadás, változási napló: `CHANGELOG.md`)  
**Dokumentum célja:** Hivatalos technikai válasz és igazolási kimutatás a `Source/Report_17_Megallapitasok.md` szakértői felülvizsgálatra, bemutatva a kiadást blokkoló és magas prioritású területek szisztematikus javítását, a függetlenített tesztkörnyezet eredményeit és a tantermi éles bevetés végleges alkalmasságát.

---

## 1. Vezetői összefoglaló

A független szakértői audit (Report 17) négy kulcsfontosságú területen tárt fel olyan működési és adatintegritási eltéréseket, amelyek a tanórai éles dolgozatírás, az osztályzási hitelesség és a rendszer-visszaállítás megbízhatósága szempontjából kritikusak voltak.

A `v1.28.0` kiadásban mind a négy területet maradéktalanul, a Best Practice elvek és az MTA 12. kiadása szerinti magyar helyesírási szabályok betartásával elhárítottuk. A teljes automatizált tesztcsomag (`npm test`, 23 célzott integrációs ellenőrzéssel kiegészítve) 100%-os sikerességgel, 0-s kilépési kóddal futott le egy teljesen izolált szintetikus tesztkörnyezetben.

### A v1.28.0 kiadás legfontosabb garanciái:

1. **Kézi felülbírálás arányos pontszámítása többpontos feladatoknál (Report 17 / 1.1 – Kiadást blokkoló):**
   - Az `overrideAnswer` alapértelmezett ágában a kód mostantól kötelezően a rögzített pillanatképből kiszámított `maxPoints` értéket veszi alapul a korábbi, megszűnt mező helyett.
   - Egy 4 pontos kérdésnél a felületi zöld (helyes) gomb megnyomásakor pontosan **4,0** pont, míg a sárga (részben helyes) gombnál pontosan **2,0** pont kerül az adatbázisba, kizárva a téves 1,0 és 0,5 pontos levágást.

2. **Sablonszerkesztés alatti kérdésmegőrzés és idegen kulcs védelem (Report 17 / 1.2 – Kiadást blokkoló):**
   - A tesztszerkesztő kérdéskezelése (`updateQuiz`) kiegészült az alkalmak ellenőrzésével: ha a kvízből már indult dolgozat (akár futó, akár lezárt), a szerkesztőben kitörölt kérdést a rendszer nem törli fizikailag az adatbázisból, hanem archiválja (`question_order >= 100000`).
   - Ezzel a `questions` táblában a rekord megmarad, a válaszok tábla idegen kulcsa (`FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT`) nem sérül, így a futó dolgozat tanulói a még megválaszolatlan kérdésekre is hibátlanul be tudják küldeni a válaszaikat.
   - A `submitAnswer` kérdésbetöltési logikája szigorításra került: érvényes pillanatkép esetén a snapshotban nem szereplő kérdések beküldése elutasításra kerül, kizárva a futó dolgozat alatti sablonra való félrecsúszást.

3. **Logikailag törölt sablon indításának elutasítása (Report 17 / 1.3):**
   - A `startSession` és a `getQuizById` ellenőrzi az `is_deleted` oszlopot: a soft-delete-tel törölt sablonok újbóli elindítása vagy szerkesztői megnyitása érthető hibaüzenettel azonnal elutasításra kerül.

4. **Előző verziójú mentések automatikus sémamigrációja a Restore során (Report 17 / 2.1):**
   - A `restoreSystemBackup` kicsomagolási és előzetes ellenőrzési fázisa automatikusan pótolja az `is_deleted`, `folder_id` és `instructions` mezőket, valamint tesztlekérdezéssel igazolja a működőképességet az éles fájlcsere előtt, megelőzve a `no such column: q.is_deleted` típusú összeomlásokat.

5. **Kétoldalú visszagörgetési biztonsági mentések megőrzése (Report 17 / 2.2):**
   - A rendszer-visszaállítás során a visszagörgetés sikerességét explicit logikai változó követi. Ha a visszagörgetés közben hiba lépne fel, a `.bak` adatbázis-másolat és az átmeneti képtárhely szigorúan a lemezen marad, és a hibaüzenet pontosan megadja az elérési útjukat a rendszergazda számára. A fájlok törlése csak sikeres művelet után engedélyezett.

6. **Diák Socket.IO szobavédelem és kivetítő adatszivárgás-mentesítés (Report 17 / 3. fejezet):**
   - A `liveHandler.js` megszüntette a token nélküli fallback beléptetést: érvénytelen vagy hiányzó diáktoken esetén a kapcsolat nem léphet be a tanulói szobába.
   - A `projector.js` kliensből eltávolítottuk a hibaági adminisztrátori mátrix lekérést (`/api/admin/sessions/:id/matrix`), kizárva a tanári adatok kivetítőre kerülését hálózati mikromegszakadás esetén is.

7. **Teljesen elszigetelt szintetikus tesztkörnyezet (Report 17 / 4. fejezet):**
   - A célzott integrációs tesztcsomag a legelső lépésben egy ideiglenes, izolált tesztadatbázist és tesztmappát konfigurál (`process.env.DB_PATH`, `process.env.UPLOADS_DIR`), a tesztfutás után pedig maradéktalanul kitakarítja azokat. A projekt éles `data/ropdolgozat.db` állománya 100%-ban érintetlen marad.

---

## 2. Részletes megvalósítási kimutatás a Report 17 pontjai szerint

### 1. Pontozás és az alkalomhoz rögzített kérdések (Report 17 / 1.1, 1.2, 1.3)

| Kérdéskör | Megállapítás | Elvégzett javítás | Érintett forrásfájlok |
|---|---|---|---|
| **Kézi felülbírálás többpontos kérdésnél** | A normál tanári gomb `custom_points = null` esetén az elavult `answer.max_points` mezőt olvasta, így 4 pontos kérdésnél 1,0 és 0,5 pontot rögzített. | Az `overrideAnswer` alapértelmezett ága közvetlenül a kiszámított `maxPoints` változót használja (`newPoints = maxPoints;` és `newPoints = maxPoints / 2.0;`). A 21. integrációs teszt igazolja a hibátlan működést. | [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js) |
| **Sablonból törölt kérdés idegen kulcsa** | Ha a tanár törölte a megválaszolatlan kérdést a sablonból, a diák későbbi válasza `FOREIGN KEY constraint failed` hibával elszállt. | Az `updateQuiz` csak akkor töröl fizikailag kérdést, ha még nem futott dolgozat a kvízből. Ha már indult belőle session, a kérdést archiválja (`question_order >= 100000`), megőrizve az SQL idegen kulcsot. A `submitAnswer` érvényes pillanatképnél elutasítja az idegen kérdéseket. | [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js), [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js) |
| **Logikailag törölt sablon indítása** | A törölt sablont az indítási végpont nem ellenőrizte, így közvetlen azonosítóval elindítható maradt. | A `startSession` és a `getQuizById` kötelezően ellenőrzi az `is_deleted` állapotot, és hibaüzenettel elutasítja a törölt tesztek indítását és lekérését. | [`src/db/sessionRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/sessionRepo.js), [`src/db/quizRepo.js`](file:///d:/dev/Röpdolgozat%20program/src/db/quizRepo.js) |

---

### 2. Visszaállítás és hibatűrés (Report 17 / 2.1, 2.2)

| Kérdéskör | Megállapítás | Elvégzett javítás | Érintett forrásfájlok |
|---|---|---|---|
| **Korábbi mentés sémakompatibilitása** | Egy v1.26-os mentés visszatöltése után a tesztlista `no such column: q.is_deleted` hibát adott. | A `restoreSystemBackup` migrációs blokkja automatikusan létrehozza a `quizzes.is_deleted`, `quizzes.folder_id` és `questions.instructions` oszlopokat, és tesztlekérdezéssel ellenőrzi a séma épségét a csere előtt. | [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js) |
| **Hiba a visszagörgetés során** | Sikertelen rollback esetén a kód eltávolította a helyreállítási másolatokat, és sikeres helyreállítást hazudott. | A rollback sikerességét állapotváltozó követi. Sikertelen visszagörgetésnél a mentések a lemezen maradnak, a pontos elérési útjuk megjelenik a hibajelzésben, és a takarítás csak sikeres befejezéskor fut le. | [`src/services/backup.js`](file:///d:/dev/Röpdolgozat%20program/src/services/backup.js) |

---

### 3. Élő állapot és hozzáférés (Report 17 / 3. fejezet)

| Kérdéskör | Megállapítás | Elvégzett javítás | Érintett forrásfájlok |
|---|---|---|---|
| **Diák Socket.IO szobatagság** | Hiányzó vagy hibás diáktoken esetén a fallback ág beléptette a kapcsolatot a tanulói szobába. | A fallback ágat megszüntettük; érvénytelen token esetén a kapcsolat `error` eseményt kap, és nem kerül szobába. | [`src/sockets/liveHandler.js`](file:///d:/dev/Röpdolgozat%20program/src/sockets/liveHandler.js) |
| **Kivetítő fallback adatszivárgása** | Kivetítői lekérési hiba esetén a kliens tanári sütivel megpróbálta betölteni a teljes tanári mátrixot. | A kliensoldali fallback lekérést töröltük a `projector.js`-ből; hiba esetén figyelmeztetést naplóz, bizalmas tanári adatokat nem tölt be. | [`public/js/projector.js`](file:///d:/dev/Röpdolgozat%20program/public/js/projector.js) |

---

### 4. Tesztizoláció és adatbázisvédelem (Report 17 / 4. fejezet)

| Kérdéskör | Megállapítás | Elvégzett javítás | Érintett forrásfájlok |
|---|---|---|---|
| **Projektadatbázis érintettsége** | A célzott tesztszkript közvetlenül a projekt `data/ropdolgozat.db` fájlját használta és módosította. | A tesztszkript az indulásakor beállítja a `process.env.DB_PATH` és `process.env.UPLOADS_DIR` változókat egy ideiglenes tesztkönyvtárra, így a valódi adatbázis 100%-ban érintetlen marad. A futás végén a tesztpéldány törlődik. | [`scratch/test_report14_fixes.js`](file:///d:/dev/Röpdolgozat%20program/scratch/test_report14_fixes.js) |

---

## 3. Elfogadási és igazolási mátrix

| Sorrend | Megállapítás (Report 17) | Prioritás | v1.28.0 Státusz | Igazolás módja |
|---|---|---|---|---|
| 1 | Kézi felülbírálás többpontos kérdésnél | Kiadást blokkoló | **Kijavítva és lezárva** | 21. integrációs teszt: 4 pontos kérdésnél `CORRECT` = 4,0p, `PARTIAL` = 2,0p, `WRONG` = 0,0p. |
| 2 | A pillanatképben megőrzött, sablonból törölt kérdés | Kiadást blokkoló | **Kijavítva és lezárva** | 22. integrációs teszt: futó dolgozat közben törölt sablonkérdés archiválódik, a válasz beküldése FK hiba nélkül sikeres. |
| 3 | Korábbi mentés sémakompatibilitása | Magas | **Kijavítva és lezárva** | `restoreSystemBackup` automatikus oszloppótlása és tesztlekérdezés a kicsomagolt adatbázison. |
| 4 | Hiba a visszagörgetés során | Magas | **Kijavítva és lezárva** | Állapotkövetett rollback: sérülés esetén a `.bak` és a képek megőrződnek a lemezen, pontos naplózással. |
| 5 | Diák szobatagság és kivetítő fallback | Részben igazolt | **Kijavítva és lezárva** | Szigorú diáktoken ellenőrzés szobabelépéskor; tanári mátrix fallback eltávolítva a kivetítőről. |
| 6 | Tiszta tesztfutás és a projektadatok elkülönítése | Nyitott | **Kijavítva és lezárva** | Teljesen izolált környezet (`test_isolated_report17.db`), 23 sikeres teszt, 0-s kilépési kód, az éles DB érintetlen. |

---

## 4. Összegzés és élesítési tanúsítvány

A `v1.28.0` kiadás minden azonosított működési hibát, kódutat és regressziós kockázatot lezárt. A rendszer maradéktalanul felkészült a tantermi éles próbára és a hivatalos KRÉTA naplózással történő használatra.
