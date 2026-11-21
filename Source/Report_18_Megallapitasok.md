# Report 18 – A Report 17 javításainak visszaellenőrzése

**Okoskodó · v1.28.0 · Git `b3cff5b` · 2026. november 21.**

## Élesítési összegzés

A v1.28.0 az újonnan indított alkalmaknál javítja a többpontos kérdés kézi felülbírálását és a sablonból közben eltávolított kérdés válaszmentését. A törölt sablon újraindításának tiltása működik. A v1.26-os mentés visszaállítása után már megnyílik a tesztlista, és a sikertelen visszagörgetés első alkalommal megőrzi a helyreállítási másolatokat.

**A valódi névsorral és naplóba kerülő jegyekkel végzett éles próbát még nem javaslom.** Egy régi mentésből visszatöltött trigger elutasíthatja az új dolgozat helyes válaszát. A következő restore eltüntetheti az előző hibából megőrzött eredeti adatbázis-másolatot. A régi, pillanatkép nélküli eredmény pedig a sablon logikai törlése után elérhetetlenné válhat a diáknak.

| Prioritás | Megállapítás | Visszaellenőrzés |
|---|---|---|
| 1 · Kiadást blokkoló | A régi mentésből megmarad a korábbi pontozási trigger | A tesztlista működött, de az új dolgozat helyes válaszát az adatbázis elutasította. |
| 2 · Kiadást blokkoló | Egy új restore felülírhatja a függő helyreállítás adatbázis-másolatát | Kettős hiba után az eredeti másolat megmaradt. A következő restore után eltűnt. |
| 3 · Magas | Pillanatkép nélküli lezárt alkalom diákoldali eredménye | A sablon logikai törlése után a diák HTTP 500-at kapott, a tanári mátrix megnyílt. |
| 4 · Magas | A teljes tesztparancs elkülönítése | A 23 célzott ellenőrzés átment, de a teljes parancs a tiszta projektmásolatban létrehozta az alapértelmezett adatbázist is. |

Hatókör. A [Report 17](Report_17_Megallapitasok.md) és a [Report 17-re adott válasz](Valasz_a_Report_17_Megallapitasokra.md) állításait ellenőriztem a jelenlegi forráson. A futtatások elkülönített Windows x64 projektmásolatban, Node `24.14.0` alatt, szintetikus adatokkal történtek. Az éles Windows Server-csomag és a tantermi böngészők teljes működése külön átvételi próba.

## 1. A mentés visszaállítása után a pontozási séma elavult maradhat

### Megállapítás és bizonyíték

A restore most már pótolja a hiányzó `quizzes.is_deleted` oszlopot, és a vizsgált v1.26-os adatbázisséma sikeresen visszatölthető. A normál indulás frissíti az összetartozást és a pontmaximumot védő triggereket. A restore előkészítése a hiányzó oszlopokat pótolja, majd egy listázási próbalekérdezést futtat. A visszatöltött adatbázis újranyitása így megtarthatja a régi triggerdefiníciókat. [Restore előkészítése](../src/services/backup.js#L108) · [Listázási próbalekérdezés](../src/services/backup.js#L159) · [Indulási triggerfrissítés](../src/db/init.js#L155)

**Futtatási eredmény.** A v1.26 sémájú mentés visszaállítása után a tesztlista újraindítás nélkül megnyílt. Ezután egy négypontos kérdésből dolgozatot indítottam, majd a tanár a sablonban egy pontra csökkentette a kérdés értékét. A diák a kiosztott, eredeti kérdés helyes válaszát adta meg. Az alkalmazás az alkalom szerint négy pontot számolt, az SQLite régi triggere az élő sablon egypontos maximuma miatt elutasította a beszúrást. Válaszrekord nem jött létre.

### Javasolt megoldás

1. **Közös, verziózott migráció.** Az indulás és a restore ugyanazt a migrációs függvényt futtassa a kapott adatbázis-kapcsolaton. A migrációk oszlopokra, táblákra, indexekre, triggerekre és a szükséges adatátalakításokra terjedjenek ki. A sémaverziót az alkalmazás kezelheti a SQLite `PRAGMA user_version` mezőjében. A régi, verziójelölés nélküli mentéseket ismert szerkezeti jellemzők alapján azonosítsd. Ismeretlen vagy újabb sémához adj érthető kompatibilitási hibát. [SQLite PRAGMA user_version](https://sqlite.org/pragma.html#pragma_user_version)
2. **A migráció hibája állítsa meg az élesítést.** A csere előtt, külön munkaterületen futtasd a migrációt és utána ellenőrizd az integritást, az idegen kulcsokat és a kötelező adatbázis-objektumokat. A migráció csak sikeres befejezés után növelje a sémaverziót. A tesztlista és az archívum próbalekérdezése mellett a pontozási trigger viselkedését is ellenőrizze egy eldobható példányon futó regressziós teszt.
3. **Az alkalmi kérdés adatai legyenek döntők.** A restore sürgős javításához elegendő az aktuális triggerek szabályos telepítése a visszaállított példányra. Hosszabb távon a válasz adatbázisszinten az alkalom saját, rögzített kérdésére hivatkozzon. Így az összetartozás és a pontplafon a szerkeszthető feladatsablon változásaitól függetlenül ellenőrizhető.

**Elfogadás.** A v1.26-os és az aktuális séma mentése visszatölthető. Közvetlenül utána, szerver-újraindítás nélkül működik a tesztlista, az archívum és a válaszmentés. A sablon pontértékének csökkentése után a már indult alkalom helyes válasza négy ponttal mentődik. A teszt igazolja, hogy az alkalmazás pontplafonja is érvényben marad.

## 2. A megőrzött rollback-példányt a következő restore felülírhatja

### Megállapítás és bizonyíték

A képmappához műveletenként eltérő mentési útvonal készül. Az adatbázis visszaállítási másolata viszont mindig a futó adatbázis nevéből képzett, azonos `.bak` fájl. A sikeres restore takarítása ezt a fájlt törli. Az egyes műveletek azonos adatbázis-mentési útvonala miatt egy későbbi próbálkozás az előző hibából megőrzött példányra írhat. [Adatbázis és képek helyreállítási másolata](../src/services/backup.js#L171) · [Sikertelen visszagörgetés](../src/services/backup.js#L260) · [Sikeres restore takarítása](../src/services/backup.js#L280)

| Próba | Eredmény |
|---|---|
| A beérkező képek másolása megszakadt | Az eredeti adatbázis és mindkét eredeti képfájl visszaállt. |
| A beérkező képmásolás és az adatbázis visszamásolása is hibázott | A rendszer helyesen sikertelen visszagörgetést jelzett. Megmaradt az eredeti adatbázis-másolat, a képmásolat és a hibaüzenetben az útvonaluk. Az aktív adatbázis már a beérkező állapotot tartalmazta. |
| A kettős hiba után új, sikeres restore indult | Az új művelet ugyanazt a `.bak` útvonalat használta, majd törölte a fájlt. Az előző hibából megőrzött eredeti adatbázis-másolat eltűnt. |

### Javasolt megoldás

- **Műveletenként egyedi helyreállítási könyvtár.** Az adatbázis-másolat és a hozzá tartozó teljes képkészlet ugyanabba az egyedi, csak az adott művelethez tartozó könyvtárba kerüljön. Jegyezd fel a művelet azonosítóját, a sémaverziót és az ellenőrzés eredményét. A könyvtár a kiszolgált és a felhasználói feltöltési útvonalakon kívül legyen. Egy új restore kizárólag a saját könyvtárát takaríthassa. Az egyedi útvonalhoz használható a Node `fs.mkdtemp` függvénye. [Node.js fájlrendszer API](https://nodejs.org/docs/latest-v22.x/api/fs.html#fspromisesmkdtempprefix-options)
- **Konzisztens előkészítés és egyértelmű állapot.** Egyszerre csak egy restore futhasson, karbantartási állapotban. Az eredeti SQLite-adatbázisról az Online Backup API-val készíts pillanatképet, a hozzá tartozó képekkel összehangolva. A beérkező adatbázist és képeket külön helyen készítsd elő. A művelet állapota legyen visszakereshető újraindítás után is. Hiba esetén a felület külön jelezze a sikeres visszagörgetést és a még helyreállítást igénylő állapotot. [SQLite Online Backup API](https://sqlite.org/backup.html)
- **Függő helyreállítás védelme.** A legegyszerűbb tantermi szabály, hogy függő helyreállításnál a szerver addig nem enged új restore-t, amíg a kezelő az eredeti állapotot nem ellenőrizte vagy a megőrzött példányt külön nem biztosította. A fizikai fájlcserét csak akkor nevezd atominak, ha áramszünet vagy folyamatleállás után is igazoltan visszaáll egy összetartozó adatbázis–képkészlet pár.

**Elfogadás.** Kettős hiba után az eredeti adatbázis és képfájlok megőrzött példányai olvashatók. A következő restore elutasítható függő helyreállítás miatt, vagy önálló műveletként másik könyvtárban indul. Mindkét esetben az előző példányok útvonala és tartalma változatlan. Újraindítás után az üzemeltető ugyanazt a függő állapotot és a hozzá tartozó másolatokat látja.

## 3. A régi diák eredménynézete függ a szerkesztői kvízszűréstől

### Megállapítás és bizonyíték

A szerkesztői `getQuizById` már kiszűri a logikailag törölt kvízt. Ez helyes az új dolgozat indításakor. Egy pillanatkép nélküli régi alkalom diákoldali eredményoldala azonban ugyanezt a lekérdezést használja. A hiányzónak tekintett kvíz után a kód a `quiz.questions` mezőt olvassa. [Szerkesztői kvízszűrés](../src/db/quizRepo.js#L76) · [Diák munkamenet történeti tartalékága](../src/routes/api.js#L969) · [Kérdések feldolgozása](../src/routes/api.js#L1000)

**Futtatási eredmény.** Szintetikus adattal modelleztem egy korábbi, pillanatkép nélküli lezárt alkalmat. A sablon logikai törlése előtt a diák eredménye megnyílt. Törlés után a diák HTTP 500-at kapott, miközben a tanári mátrix továbbra is megnyílt. Az új, pillanatképes alkalom eredménye ugyanezen lépések mellett elérhető maradt, a törölt sablon újraindítását a szerver elutasította.

### Javasolt megoldás

Legyen külön, **az alkalomhoz kötött történeti olvasási út**. A régi alkalomhoz a szerver hitelesített résztvevőből vagy jogosult tanári kérésből oldja fel az alkalmazható történeti adatokat, akkor is, ha a sablon már nem jelenik meg a feladattárban. A szerkesztői listán és indításkor maradjon érvényben a törölt sablon tiltása. Ha az eredeti kérdésverziót a korábbi adatmodell nem őrizte meg, a felület jelezze az elérhető adatok korlátját és jelenítse meg a megbízhatóan tárolt eredményt. Hiányzó történeti adatot kezelj egyértelmű alkalmazásállapotként.

**Elfogadás.** Pillanatképes és pillanatkép nélküli lezárt alkalommal is próbáld ki a sablon elrejtését. A jogosult diák eredménye és a tanári mátrix megnyílik, a tárolt eredmény megmarad, az új alkalom indítása tiltott. A történeti olvasás kövesse a beállított visszajelzési szabályokat. Ellenőrizd a diákoldalt és az elérhető tanári exportokat is.

## 4. A teljes tesztparancs még nem független a projektadatoktól

A Report 17 szkript az adatbázis betöltése előtt elkülönített elérési utakat állít be. Ezzel a korábbi közvetlen projektadatbázis-használat ennél a szkriptnél megszűnt. A teljes `npm test` az egyesítési tesztet is futtatja. Ez környezeti átirányítás nélkül tölti be az adattárat, és az alapértelmezett adatbázisban hoz létre és töröl kvízeket. A tiszta projektmásolatban a futás létrehozta a `data/ropdolgozat.db` fájlt. Ugyanebben a futásban mind a 23 célzott ellenőrzés sikeres volt. [Tesztparancs](../package.json#L9) · [Célzott teszt elkülönítése](../scratch/test_report14_fixes.js#L1) · [Egyesítési teszt adatbázishasználata](../scratch/test_merge_quizzes.js#L1)

**Javasolt megoldás.** A teljes tesztparancs egy közös futtatón keresztül kapjon futásonként egyedi, ideiglenes munkakönyvtárat. Minden írható tesztadatbázis, képmappa, ZIP és napló ide kerüljön. A környezeti beállítás történjen az adattárak betöltése előtt, és a szkriptek használják az átadott elérési utakat. Minden teszt maga hozza létre a szükséges szintetikus adatokat. A takarítás a kapcsolatok és streamek lezárása után a teszt futása által létrehozott könyvtárra korlátozódjon. [Node.js ideiglenes könyvtár](https://nodejs.org/docs/latest-v22.x/api/fs.html#fspromisesmkdtempprefix-options)

**Elfogadás.** A teljes `npm test` új, üres projektmásolatból fut. Az alapértelmezett `data/ropdolgozat.db` nem jön létre. Előre létező projektadatbázis esetén a futás előtt és után a fájlellenőrző összeg egyezik. Két párhuzamos tesztfutás külön adatokkal működik, és egymás könyvtárát nem módosítja.

## 5. Igazolt javítások és következő átvétel

| Report 17 megállapítása | Visszaellenőrzött állapot |
|---|---|
| Kézi felülbírálás | A tanári felület által használt HTTP-végpont négypontos kérdésnél 2, 4 és 0 pontot mentett részben helyes, helyes és hibás értékelésre. |
| Futó dolgozatból megőrzött kérdés | A sablonból eltávolított kérdést a később belépő diák megkapta, helyes válaszát a kiszolgáló mentette. |
| Törölt sablon indítása | A szerver elutasította az új indítást. A pillanatképes lezárt alkalom tanári és diákoldali nézete működött. |
| Diák Socket.IO-szoba és lezárás | Érvényes tokenű diák megkapta a lezárást. A token nélküli beléptetés korábbi tartalékága kikerült a kódból. |
| Kivetítő | A tanári mátrixot betöltő kliensoldali tartalékág megszűnt. |

[Tanári pontozás](../src/db/sessionRepo.js#L950) · [Kérdésmegőrzés](../src/db/quizRepo.js#L508) · [Indítási ellenőrzés](../src/db/sessionRepo.js#L244) · [Socket.IO szerepkezelés](../src/sockets/liveHandler.js#L49) · [Kivetítő adatlekérése](../public/js/projector.js#L163)

### A következő átvételi kör sorrendje

1. **Régi mentésből való helyreállítás.** Közös migráció, majd valós válaszmentés a helyreállított adatbázison. Erre épüljön a korábbi mentések támogatási állítása.
2. **Kettős hiba és újrapróbálkozás.** Ellenőrizd a mentési pár megőrzését sikeres és sikertelen következő művelet, illetve folyamat-újraindítás után.
3. **Történeti diák eredmény.** Vedd át a régi és új alkalmak megnyitását logikai törlés után, a visszajelzés beállításaival együtt.
4. **Elkülönített tesztcsomag és célkörnyezet.** Futtasd az összes tesztet az éles állományok használata nélkül. Az iskola Windows Server-csomagján szintetikus névsorral próbáld ki a böngészős tanári–diák–kivetítő folyamatot és a teljes mentés–visszaállítást.

A pontozás és a logikai törlés új alkalmakra vonatkozó javításai igazoltként szerepelhetnek a válaszfájlban. A restore sémakompatibilitása, a mentési példányok élettartama, a régi diák eredménynézete és a teljes tesztparancs izolációja maradjon nyitott a megfelelő elfogadási próbák teljesüléséig.
