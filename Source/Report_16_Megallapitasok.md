# Report 16 – A Report 15 javításainak visszaellenőrzése

**Okoskodó · v1.26.0 · Git `d679e43` · 2026. november 20.**

## Élesítési összegzés

A v1.26.0-ban a tanári Socket.IO-szoba szerveroldali hitelesítést kapott, a szabályosan csatlakozott diák ismét megkapja a tanári lezárási eseményt, és egy v1.22 sémájú mentés visszaállítása után már működött az Eredmények lekérése. A feladatsor indításkori pillanatképe a diák és a tanár számára látható kérdések megőrzésének alapját is megteremti.

Valódi névsorral vagy naplóba kerülő jegyekkel az éles használatot még nem javaslom. A globális dolgozatindítási esemény a tanári szoba védelmétől függetlenül elküldi a feladatok megoldásait. Normál használatban helyes választ értékelt hibásnak a szerver egy futó dolgozat sablonjának szerkesztése után. Üres teremből indított időzített Space Race esetén a későn csatlakozó diák azonnal kifuthat az időből. A mentés visszaállításakor az adatbázis és a kérdésképek együtt történő visszagörgetése továbbra is hiányzik.

| Sorrend | Megállapítás | Státusz | Hatás |
|---|---|---|---|
| 1 | A dolgozatindítási esemény a teljes feladat-pillanatképet továbbítja | **Kritikus · nyitott** | A megoldókulcs a tanári szereptől függetlenül kikerülhet. |
| 2 | A pontozás és a feladatkiosztás továbbra is függ a szerkeszthető sablontól | **Kritikus · részben javítva** | A kiosztott kérdésre helyes válasz hibás pontot kaphat. A sablon törlése alkalmakat is töröl. |
| 3 | A Space Race üres teremből indított rajtja időzónafüggő | **Magas · részben javítva** | A késői belépő 0 másodpercet kaphat az elvárt idő helyett. |
| 4 | A visszaállítás rollbackje csak az adatbázist állítja vissza | **Magas · részben javítva** | Az eredeti adatbázis mellé részben lecserélt képfájlok maradhatnak. |
| 5 | PDF-import és gépváltás a tényleges tanári útvonalon | **Magas · részben javítva** | Bizonytalan megoldás kész kulcsként tárolódhat, a gépváltási engedély nincs a kijelölt átvevőhöz kötve. |
| 6 | Tiszta adatbázisos regressziós futás | **Magas · nyitott** | A teszt saját névsort nem készít, a projektből futtatva közvetlenül a projektadatbázist nyitja meg. |

A jelentés a [Report 15 javítási tervét](Report_15_Tovabbi_javitasok.md) követi, és a [v1.26.0 megvalósítási válaszát](Valasz_a_Report_15_Tovabbi_javitasokra.md) veti össze a forrással és a célzott próbákkal. Az **igazolt** minősítés mindig a megnevezett viselkedésre és környezetre vonatkozik. A futtatások szintetikus adatokkal, elkülönített másolatban történtek Windows x64 és Node `24.14.0` alatt. Az iskola célgépe és többgépes böngészős környezete külön átvételi helyszín.

## 1. Adatvédelem és élő állapot

### 1.1 A globális esemény bizalmas alkalomadatot visz ki

Az alkalom indításakor a szerver rögzíti a teljes kvízt a `quiz_snapshot_json` mezőben. Ez a belső rekord szolgáltatja a tanári oldalhoz szükséges adatokat is. Az indítási esemény ezt az egész rekordot küldi a kapcsolódó klienseknek. A mező tartalmazza a kérdésszöveget, opciókat, helyes válaszokat és magyarázatokat. Az eltérés a forrásból közvetlenül következik. A tanári szobába belépéskor végzett sütiellenőrzés ezen a globális adatküldésen kívül esik. [Alkalomindítási végpont](../src/routes/api.js#L607) · [Rekordlekérdezés](../src/db/sessionRepo.js#L189) · [Pillanatkép létrehozása](../src/db/sessionRepo.js#L250) · [Tanári szobavédelem](../src/sockets/liveHandler.js#L20)

**Javítási irány.** A globális értesítés saját, kifejezetten nyilvános mezőlistát kapjon. Az alkalmazás alkalmonként vagy szerepkörönként célzott adatot küldjön, ahol ahhoz hitelesített kapcsolat kell. A tanári mátrix, a kivetítő és a diákfolyamat külön adatszerkezetet használjon. Érdemes a teljes szoba- és HTTP-adatfolyamot ugyanazzal az elvvel átvenni, mert az adatbázisséma később tovább bővülhet.

**Elfogadás.** A normál globális indítási értesítésből megállapítható, melyik alkalom indult, és kizárólag az előre meghatározott mezőket tartalmazza. Az adatban sem közvetlenül, sem beágyazott objektumban vagy JSON-szövegben nincs megoldókulcs, magyarázat, tanulói eredmény vagy másik szerepkörnek szánt adat. A Space Race rajt előtt a diákfolyamat és a nyilvános kivetítő sem mutat előre bizalmas feladattartalmat.

### 1.2 Tanári szoba, kivetítő és szerepek

A tanári jogosultság ellenőrzése megjelent a csatlakozásnál és a két korábbi tanári eseménynél. Az engedély a kapcsolat megnyitásakor kapott sütire épül. A meglévő tanári szobatagságot a kijelentkezés vagy lejárat nem vonja vissza automatikusan. A diák szobatagságot az eseménykezelő még nem köti igazolt diák hitelesítőhöz és a saját alkalomhoz. A korábbi tanári léptető esemény megmaradt, miközben az új `TEACHER_PACED` alkalom indítását a szerver már elutasítja. [Socket.IO eseménykezelők](../src/sockets/liveHandler.js#L10) · [Tanári mód tiltása](../src/db/sessionRepo.js#L224) · [Kérdésindex módosítása](../src/db/sessionRepo.js#L1112)

A külön kivetítői adatút elhagyja a diákneveket, a kérdésopciókat, a kulcsot és a beadott válaszok szövegét. A szerver ettől még résztvevőnként küld pontot és csapatszínt, válaszonként pedig kérdésazonosítót és helyességet. A csapat- és kérdésszintű összevonást a böngésző végzi. A publikus végpont a kérdésszöveget is visszaadja. A kivetítő normál kérésének hibájánál a kliens megpróbálja betölteni a teljes tanári mátrixot, ha rendelkezik tanári sütivel. [Kivetítő adatkészlete](../src/db/sessionRepo.js#L1080) · [Kivetítő betöltése](../public/js/projector.js#L163)

**Javítási irány és elfogadás.** A tanári és a diák szobatagság legyen a szerveren igazolt, az adott alkalomra érvényes és visszavonható. A nem támogatott tanári műveletet vezesd ki, vagy korlátozd a tényleges üzemmódjára. A kivetítő szerveroldalon előállított összesítést kapjon. A tesztben szerepeljen valós szintetikus résztvevő leadott válasszal, külön tanári, diák- és kivetítői klienssel. Ellenőrizd azt is, mit lát az egyetlen résztvevős csapat közönsége, valamint mi történik kijelentkezéskor és a kivetítői lekérés hibájánál.

### 1.3 Lezárási esemény és visszatérés

A korábbi szobanévhiba javult. A visszaellenőrzésben normál diák Socket.IO-kliens a tanári lezáráskor pontosan **egy** `session:finished` eseményt kapott. A lekapcsolódott böngésző ilyen eseményt nem feltétlenül kap meg. Az ő esetét az újbóli állapotlekérésnek kell kezelnie. A visszaellenőrzés a számítógépes esemény átvételét igazolta. A böngészős képernyőváltás, a lejárt résztvevő lezárása további válasz nélkül és az összesítő újratöltése külön eset. [Tanári lezárás](../src/routes/api.js#L635) · [Diák eseményfigyelők](../public/js/student.js#L242) · [Kliensidőzítő](../public/js/student.js#L1910)

**Elfogadás.** Egy diák végig csatlakozik, egy másik lezáráskor offline, majd visszajön, a harmadiknál az egyéni határidő bezárt fül mellett telik le. A visszatérő képernyő a szerver aktuális állapotát mutatja. A rendszer csak a szabály szerint engedélyezett eredményt és megoldást jeleníti meg.

## 2. A feladat-pillanatkép és az értékelés

### 2.1 A megjelenítés és a pontozás más kérdésverziót használ

A tanári mátrix és a diák HTTP-adatválasza tudja használni az indításkor elmentett kérdéseket. A diák összesítője már a rögzített `max_points` értéket részesíti előnyben, ami előrelépés az előző változathoz képest. A diák csatlakozásakor kiosztott azonosítólista, a válaszok értékelése és ismétlése, a megválaszolandó kérdések száma és a kézi felülbírálás pontmaximuma továbbra is érintheti az aktuális `questions` táblát. A pontmaximumot ellenőrző SQLite-triggerek szintén abból olvasnak. [Kiosztás](../src/db/sessionRepo.js#L449) · [Válaszmentés](../src/db/sessionRepo.js#L673) · [Felülbírálás](../src/db/sessionRepo.js#L848) · [Pontmaximum triggerek](../DATABASE_SCHEMA.sql#L286) · [Diák összesítő](../src/routes/api.js#L959)

**Futtatási eredmény.** Az elkülönített normál HTTP-próbában a tanár a futó dolgozat forrássablonjában a `2+2` kérdést `2+3`-ra, a kulcsot `4`-ről `5`-re módosította. A diák HTTP-adatválaszában a `2+2` maradt meg. A `4` beküldése sikeresen elment, `WRONG` értékeléssel. A teszt így közvetlenül igazolja, hogy a megőrzött kérdések és a szerveri pontozás eltérhetnek.

### 2.2 A sablon törlése és a történeti állományok megőrzése

A képtakarító most figyelembe veszi az adott kvízhez tartozó pillanatképek fájlneveit. A teszt ezt egy fájl megmaradásával ellenőrzi. A tesztben a hivatkozás másik kvízmappára mutat, mint ahová a próbafájlt elhelyezi, ezért ebből önmagában nem következik, hogy a kép URL-je az alkalmazásból működik. A teljes kvíztörlés továbbra is törli a kapcsolódó válaszokat, résztvevőket és alkalmakat, majd eltávolítja a képeket. Régi mentésből vagy migrációból származó üres pillanatképnél a futtató kód visszaeshet az aktuális sablonra. Az eredeti kérdéssor bizonyíték nélküli visszaállítása ilyen esetben bizonytalan. [Képtakarítás](../src/db/quizRepo.js#L222) · [Kvíztörlés](../src/db/quizRepo.js#L666) · [Képmegőrzési teszt](../scratch/test_report14_fixes.js#L445) · [Sémamigráció](../src/db/init.js#L80)

**Javítási irány.** Vezess át egy példányonként rögzített feladatverziót a kiosztáson, az értékelésen, a tárolási megszorításokon, a lezáráson és a riporton. A referencia lehet külön alkalmi kérdéstábla vagy más olyan tárolás, amelynek stabil azonosítóit és pontplafonját az adatbázis is ellenőrizni tudja. A szabályt a sablontól független képhivatkozásokra is terjeszd ki. A sablon eltávolítása és a lezárt eredmény törlése külön döntés legyen. A vissza nem állítható történeti adatoknál az archívum jelölje, meddig bizonyítható az eredeti eredmény.

**Elfogadás.** Ugyanabból a sablonból induljon egy régi és egy új alkalom. Az első alatt változzon a kérdés, a megoldókulcs, a pontérték, a sorrend és a kép, később kerüljön ki a sablon a feladattárból. Vizsgáld az első alkalom korán és későn belépő diákját, az ismételt választ, a kézi részpontot és a lezárt riportot. A pedagógiai szabály szerint engedélyezett kézi módosítástól eltekintve a jegy és a megoldás minden nézetben az alkalomhoz rögzített változatot kövesse. Ellenőrizd az XLSX, HTML, ZIP és nyomtatási nézetet, valamint a tényleges kép-URL-t.

## 3. Space Race közös határidő

Rajt előtt az egyéni idő nem indul el, és az ismételt rajt a meglevő állapot alapján már visszatér. A rajt az SQLite `CURRENT_TIMESTAMP` értékét írja a `started_at` mezőbe. Üres váró esetén az első késői belépő az időzónajelölés nélküli dátumszöveget a Node helyi időként értelmezi. Az eltolt időpontból számolt határidő a jelenre kerekedhet. A futtatási próbában `Europe/Budapest` mellett egy éppen elrajtolt, 10 perces alkalom első diákja **0 másodperc hátralévő időt** kapott. A tesztben szereplő „határidő nem null” feltétel ezt elfogadja. [Késői belépés határideje](../src/db/sessionRepo.js#L472) · [Közös rajt](../src/db/sessionRepo.js#L1045) · [Automatikus ellenőrzés](../scratch/test_report14_fixes.js#L506)

**Javítási irány.** A rajtot és az előre kiszámolt, közös határidőt alkalomszinten tárold számszerű időbélyegként vagy explicit UTC időzónás ISO-értékként. A rajt előtti és utáni csatlakozók, valamint a már bent lévők ugyanazt a rögzített határidőt kapják. Az idő lejártakor a termékszabály döntse el, hogy az új belépő befejezett állapotba kerül vagy az alkalom már nem fogadja. A második rajt ne módosítsa a határidőt és ne indítson új felületi rajtot.

**Elfogadás.** Tízperces próba üres teremből, az első diák néhány másodperccel később érkezik, és a rajttól mért tényleges maradékot kapja. A második résztvevő határideje bájtra egyezik az elsőével. A teszt ezt ismételt rajt, alkalmazás-újraindítás, valamint magyar téli és nyári időben is ellenőrzi. A próba írja ki a tényleges hátralévő időt és hasonlítsa egy előre meghatározott tartományhoz.

## 4. Gépváltás, visszajelzés és diák hitelesítő

**Gépváltás.** Az új engedély 15 perces lejáratát a célzott adattárteszt igazolta. A tanári gomb továbbra is kérésadat nélkül hagyja jóvá a váltást. A szerver a megadott gépszámot használhatja szűrésre, de azt a böngésző közli. Az átvétel a függő állapot beolvasása után külön SQL-műveletben rotálja a tokent. Az aktuális állapot, az egyszer használatos átvételi jogosultság és a rotáció így nincs egy feltételes, közös művelethez kötve. A régi formátumú függő engedélynek külön kompatibilitási ága van időbélyeg nélkül. [Tanári gépváltás](../public/js/admin.js#L1158) · [Átvétel és rotáció](../src/db/sessionRepo.js#L352) · [Engedély létrehozása](../src/db/sessionRepo.js#L613)

**Diák hitelesítő és eredmény.** A kérésfejléc használata megjelent, de a normál kliens a munkamenet-lekérés URL-jében is küldi a tokent. A szerver először az URL-paramétert nézi. A korábbi visszajelzési döntés szintén külön átvételt igényel. A záró megoldások jogosultsága és a saját eredményben kiadott pontok két külön kérdés. A szerver és a felület egyeztetett átmenete szükséges válaszadás után, saját beadáskor és a tanári lezáráskor. [Kliens kérés](../public/js/student.js#L990) · [Szerver tokenfeldolgozás](../src/routes/api.js#L944) · [Visszajelzés](../src/routes/api.js#L1032)

**Elfogadás.** A gépváltást a tényleges tanári gombtól próbáld, korábban mentett válasszal. Egy kijelölt tanuló rövid életű átvételi igazolással egyszer folytathatja a dolgozatot, ugyanazzal a kérdéssorral és határidővel. A régi gép jelzést kap és elveszti írási jogosultságát. A normál munkamenet-lekérés csak a fejlécben küldi a hitelesítőt. A rejtett visszajelzés adatválaszai kövessék a tanár által választott tantermi szabályt.

## 5. Import és pontozás

**Socrative.** Az új indítási ellenőrzés leállítja az üres megoldókulcsú kvízt. A parser egyik kulcsot kereső ágában az üres találat felülvizsgálati jelzést kap. A kulcs nélküli PDF másik ágában azonban még alapértelmezett választ készít, így a létrejött kvíz átjuthat az üres kulcsot ellenőrző kapun. Az opciószövegek prefixegyezése és a betűjeles értelmezés továbbra is bizonytalan lehet. A parser `needs_review` jelzőjére nincs önálló, megőrzött tárolási mező. Az indítás az ürességet vizsgálja. [PDF-parser kulcsos ág](../src/services/socrativePdfParser.js#L311) · [Kulcs nélküli ág](../src/services/socrativePdfParser.js#L407) · [Kérdésmentés](../src/db/quizRepo.js#L364) · [Indítási ellenőrzés](../src/db/sessionRepo.js#L250)

**Betűjel és opciószöveg.** A korábbi kompatibilitási ág változatlanul a pontozás közben dönti el, hogy egy értéket szó szerinti szövegként vagy az eredeti opció pozíciójaként kezel. Szintetikus pontozópróbában egy tényleges `A` szövegű opció mellett az első, eltérő szövegű opció is helyesnek minősülhetett. Ez a félreértés az opciósorrend keverésekor is megmaradhat. [Pontozó](../src/services/grader.js#L38)

**Javítási irány és elfogadás.** Az import és a kézi szerkesztő egyértelmű opcióazonosítót tároljon, külön a megjelenő szövegtől. Régi betűjeles kulcsnál a migráció vagy import döntsön egyetlen értelmezésről. A bizonytalan kulcs legyen tartósan felülvizsgálatra jelölve, és blokkolja az indítást. Próbáld ezt valódi Socrative kulcsos és kulcs nélküli PDF-mintával, ABCD, igaz–hamis, szó szerinti egybetűs opció és hasonló kezdetű opciószövegek esetén. A visszaellenőrzés időpontjában a korábbi szkript két hivatkozott PDF-mintája nem állt rendelkezésre a `Source` mappában. A teljes PDF-import útvonal így nyitott próba marad. [Socrative tesztszkript](../scratch/test_socrative_import.js#L14)

## 6. Mentés, visszaállítás és régi adatok

Az új előkészítés a kicsomagolt adatbázison létrehozza a hiányzó `max_points` és `quiz_snapshot_json` mezőt. Elkülönített, v1.22 sémájú tesztmentést így sikerült visszatölteni és utána az Eredmények lekérdezését lefuttatni. Ez igazolja a korábban reprodukált hiányzó oszlop hibájának javítását. A két új oszlop létrehozása önmagában nem állítja elő a régi vizsga eredeti feladatverzióját, és csak a kipróbált sémára ad bizonyítékot. [Restore-migráció és ellenőrzés](../src/services/backup.js#L108)

A futó rendszer cseréjénél az adatbázis meglévő fájljáról készül visszaállítási másolat. A képek külön, a már élő feltöltési mappába kerülnek. A szimulált második képfájl-másolási hiba után az adatbázisban az eredeti kvízcím jelent meg, míg az egyik kép új, a másik régi tartalommal maradt. A belső rollback ág elnyelt hibái esetén a felhasználói üzenet az eredeti állapot helyreállítását állíthatja akkor is, ha az újranyitás sem sikerült. [Fájlcsere és visszagörgetés](../src/services/backup.js#L151)

**Javítási irány.** A mentés és a visszaállítás egy adatbázis–képkészlet párost kezeljen. A visszatöltött állapotot előbb külön helyen migráld, ellenőrizd a tábláit, oszlopait és képhivatkozásait, majd nyisd meg próbaként. A régi adatbázis és a régi képkészlet maradjon együttesen visszahozható a csere végéig. A sikeres mentéshez konzisztens SQLite-pillanatkép kell. A jelenlegi nyers fájlmásolási tartalékág és az időben külön csomagolt képállomány külön ellenőrzést igényel. [Mentés készítése](../src/services/backup.js#L13)

**Elfogadás.** Futtass sikeres mentés–visszaállítást mai és támogatott régi csomaggal, képes feladatokkal, névsorral és lezárt eredménnyel. Ezt kövesse kontrollált hiba a másolás első és egy későbbi lépésénél. Az eredeti kérdésképek tartalma egyezzen, az adatbázis nyíljon meg, az Eredmények működjön, és a kezelő a tényleges visszaállási állapotot lássa. A hibás csomag éles csere előtti elutasítása és a csere közbeni visszagörgetés legyen két külön próba.

## 7. Teszteredmények és a kiadási dokumentum pontosítása

| Ellenőrzés | Eredmény | Mire terjed ki |
|---|---|---|
| `npm test`, tiszta környezet | **1-es kilépési kód** | A célzott szkript ötödik ellenőrzésénél nincs `sampleStudents[0]`. A korábbi szkriptek után is előáll az üres névsor. |
| Report 14/15 célzott szkript, két szintetikus tanulóval | **0-s kilépési kód** | A 17 ellenőrzés a beállított adatokkal lefutott. Az öt új feliratnál a konkrét állításokat kell értékelni. |
| Tanári lezárás valódi helyi Socket.IO-klienssel | **Siker** | A szabályosan csatlakozott diák egy lezárási eseményt kapott. |
| Sablonszerkesztés futó dolgozat alatt | **Igazolt pontozási eltérés** | Az eredeti feladat látható, a helyes válasz a szerkesztett kulcs miatt hibás értékelést kapott. |
| Üres váróból indított verseny magyar időzónával | **Igazolt időzítési hiba** | A tízperces verseny azonnal csatlakozó első diákja 0 másodpercet kapott. |
| Visszatöltés v1.22 sémával | **Siker a kipróbált mintán** | Migráció után az Eredmények lekérdezése működött. |
| Szimulált hiba képmásolás közben | **Igazolt részleges visszaállás** | Az adatbázis helyreállt, a képkészlet vegyes maradt. |

A célzott szkript közvetlenül a projekt `data/ropdolgozat.db` fájlját is megnyitja, és meghatározott évfolyamú alkalmakat törölhet. A fejlesztői és az éles adatbázis védelméhez az összes adatbázis-kapcsolat ugyanarra a teszt által létrehozott ideiglenes példányra mutasson. A teszt saját maga hozzon létre névsort és képeket, várja meg az aszinkron mentés befejezését, és a csomagot ténylegesen zárja le, mielőtt ellenőrzi vagy eltávolítja. [Tesztszkript adatbázis-kezelése](../scratch/test_report14_fixes.js#L1) · [Mentési teszt](../scratch/test_report14_fixes.js#L338)

Az öt új teszt közül a pillanatkép-teszt a mátrix kérdésszámát és összpontját ellenőrzi, de nem ad le választ a módosítás után. A kivetítő teszt résztvevőnkénti mezőket ellenőriz, miközben a használt alkalomhoz nincs beléptetett diák. A rajtteszt csak a `deadline_at` meglétét nézi. A gépváltási próba a lejáratot vizsgálja. A kulcsteszt üres mezőre készül, így a PDF betöltésekor tévesen kitöltött mezőt nem fedi. Ezeket a tesztlefedettségi határokat érdemes a válaszfájlban is átvezetni. [Új célzott tesztek](../scratch/test_report14_fixes.js#L445)

## 8. Következő átvételi kör

1. Zárd le a globális indítási esemény adatkiadását. Vedd át külön klienssel a tanár, diák és kivetítő adatkészletét.
2. Kösd a kiosztást, pontozást, befejezést, kézi javítást és exportot ugyanahhoz a feladatverzióhoz. Ezzel egy körben tisztázd a sablon törlésének hatását a lezárt alkalmakra.
3. Rögzítsd a közös rajt határidejét időzónától függetlenül, és ellenőrizd a késői csatlakozást.
4. Ellenőrizd a mentési csomag adatbázisát és képeit együtt. A sikeres és a megszakított visszaállítást egyaránt igazold.
5. Tartsd nyitva a Socrative tényleges PDF-importját és a böngészős gépváltást a teljes útvonal kipróbálásáig.
6. Futtasd a teljes csomagot tiszta szintetikus adatkönyvtárból. A cél Windows Serveren vedd át az offline indulást, a két tanári kliens és a kivetítő működését, a böngészős újracsatlakozást, a névsorimportot és a tényleges tantermi kliensszámot.

A [Report 15 válaszában](Valasz_a_Report_15_Tovabbi_javitasokra.md) a lezárási esemény és a kipróbált régi séma migrációja megjelölhető igazoltként, a bizonyított körülmények megnevezésével. Az adatfolyamok teljes elszigetelése, a pontozás történeti hitelessége, a Space Race késői belépése és a teljes visszagörgetés addig maradjon nyitott vagy részleges, amíg a fenti elfogadási próbák le nem zárultak.
