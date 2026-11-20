# Report 17 – A Report 16 javításainak visszaellenőrzése

**Okoskodó · v1.27.0 · Git `cbd2817` · 2026. november 21.**

## Élesítési összegzés

A v1.27.0 megszüntette a globális dolgozatindítási eseményben korábban észlelt megoldókulcs-kiadást. A normál diák munkamenet-lekérése már fejlécben küldi a hitelesítőt, és a csatlakozott diák megkapta a tanári lezárás eseményét. Üres teremből indított Space Race esetén a magyar időzónás próba a megfelelő hátralévő időt mérte. A teljes `npm test` tiszta, elkülönített adatkönyvtárból 0-s kóddal zárt. A futó dolgozat sablonjában átírt megoldást az automatikus pontozó a célzott tesztben már figyelmen kívül hagyta, és a sablon logikai törlése megőrizte a lezárt alkalmat.

Valódi jegyekkel végzett próbát még nem javaslok. A rendes tanári felülbírálás hibás pontot adhat, és egy megjelenített feladatra nem mindig menthető válasz, ha a tanár közben törli a forrássablonból. Egy előző verziójú mentés visszatöltése után hibázott a tesztlista. A képek és az adatbázis együtt visszaálltak egy szimulált másolási hiba után, de a visszagörgetés saját hibája esetén a kód eltávolította a helyreállítási példányokat, és sikeres helyreállítást jelentett.

| Sorrend | Megállapítás | Státusz | Éles hatás |
|---|---|---|---|
| 1 | Kézi felülbírálás többpontos kérdésnél | **Kiadást blokkoló** | A normál tanári gomb hibás pontot rögzít. |
| 2 | A pillanatképben megőrzött, sablonból törölt kérdés | **Kiadást blokkoló** | A diák látja a kérdést, a helyes válasz mentése hibára fut. |
| 3 | Korábbi mentés sémakompatibilitása | **Magas** | A restore sikert jelezhet, miközben a tesztlista használhatatlan. |
| 4 | Hiba a visszagörgetés során | **Magas** | A képek és a visszaállításhoz szükséges másolatok is elveszhetnek. |
| 5 | Diák szobatagság, gépváltás, kivetítő és import | **Részben igazolt** | Néhány garancia szűkebb annál, amit a válaszfájl állít. |
| 6 | Tiszta tesztfutás és a projektadatok elkülönítése | **Futás igazolt, elkülönítés nyitott** | Projektmappából indítva a célzott szkript a projekt adatbázisát nyitja meg. |

Ez a jelentés a [Report 16 megállapításait](Report_16_Megallapitasok.md) és a [v1.27.0 megvalósítási válaszát](Valasz_a_Report_16_Megallapitasokra.md) követi. A futtatások szintetikus adatokkal, elkülönített másolatban, Windows x64 és Node `24.14.0` alatt történtek. A forrásból azonosított adatvédelmi és hozzáférési eltéréseknél a megfigyelt kódút szerepel. A működési próbák eredményei külön jelzik, mi történt ténylegesen a klienssel vagy a tárolt adattal. Az iskola Windows Server-csomagja és többgépes böngészős környezete külön átvételi helyszín.

## 1. Pontozás és az alkalomhoz rögzített kérdések

### 1.1 A tanári gomb figyelmen kívül hagyja a kiszámított pontmaximumot

A felülbírálás lekérdezése az élő kérdés pontértékét `db_max_points` néven adja vissza. Abból és az alkalmi pillanatképből a függvény kiszámítja a `maxPoints` értéket. Az egyedi pontszámot ellenőrző ág ezt használja. A tanári mátrix normál gombja csak az értékelési státuszt küldi, ezért az alapértelmezett pontozási ág fut. Ez még a korábbi `answer.max_points` mezőt olvassa. A hiányzó értéknél teljes pontra 1-et, részpontra ennek felét használja. [Tanári felülbírálás kérése](../public/js/admin.js#L1141) · [Pontmaximum kiválasztása](../src/db/sessionRepo.js#L952) · [Alapértelmezett pontozási ág](../src/db/sessionRepo.js#L1000)

**Futtatási eredmény.** Egy 4 pontos kérdés helyes diákválasza először 4 pontot kapott. A normál tanári műveletet követő adattárhívásnál `PARTIAL` esetén **0,5**, `CORRECT` esetén **1** pont került az adatbázisba. A tanári felületen használt félpontos szabály szerint **2**, illetve **4** pont lett volna a helyes eredmény. A hiba akkor is előáll, ha közben a sablon változatlan marad.

**Javítási irány.** A státuszból számolt pont és az egyedi pontszám ellenőrzése ugyanazt, az adott alkalomhoz tartozó kérdéspontot használja. A nulla pont kezeléséről legyen explicit szabály, mert az egy pontra visszaeső alapérték ilyen kérdésnél is felülírhatja az eredeti jelentést. Az adatbázis-rekord, a mátrix és a százalék ugyanabból a mentett értékből frissüljön.

**Elfogadás.** A tanári mátrix valódi gombjával próbálj ki 1, 4 és tört pontértékű kérdést. Négypontos kérdésnél a hibás, részben helyes és helyes állapot sorrendben 0, 2 és 4 pontot adjon. Futtasd le a sablon pontértékének módosítása előtt és után is, valamint egy egyedi pontszám túllépésével. A megjelenített pont egyezzen a tárolttal és az exportált értékkel.

### 1.2 A pillanatkép megőrzi a kérdés adatait, az idegen kulcs továbbra is a sablon kérdésére mutat

A kiosztás már az alkalom pillanatképéből tudja venni a kérdésazonosítókat. A sablonszerkesztés ugyanakkor fizikailag törli az eltávolított kérdést, ha még nem mutat rá válaszrekord. A válasz táblában a `question_id` továbbra is a szerkeszthető `questions` tábla sorára hivatkozik. A módosított triggerek pillanatkép esetén kihagyják a régi tábla alapján végzett összetartozási és pontmaximum-ellenőrzést. Ettől a megmaradó idegen kulcs továbbra is megköveteli a fizikai kérdéssort. [Kérdéskiosztás](../src/db/sessionRepo.js#L469) · [Kérdés eltávolítása](../src/db/quizRepo.js#L508) · [Válasz idegen kulcsa](../DATABASE_SCHEMA.sql#L168) · [Pontplafon triggerek](../DATABASE_SCHEMA.sql#L288)

**Futtatási eredmény.** Egy kétkérdéses teszt elindult. A még megválaszolatlan első kérdést a kvízszerkesztés eltávolította a sablonból. A később belépő diák a rögzített azonosító alapján ezt a kérdést továbbra is megkapta. A helyes válasz mentése `FOREIGN KEY constraint failed` hibával megszakadt. A jelenlegi 18. regressziós teszt a létező kérdéssor szövegét, kulcsát és pontértékét módosítja. Ebben a már javított esetben a kérdéssor megmarad. [A meglévő regressziós próba](../scratch/test_report14_fixes.js#L596)

**További forrásalapú eltérés.** A válaszmentés akkor is az élő sablonra eshet vissza, ha a pillanatkép megvan, de a keresett kérdés hiányzik belőle. Közben a befejezettség a pillanatkép kérdésszámát az összes mentett válasz számával hasonlítja össze. A pillanatkép nélküli régi alkalom és az érvényes pillanatképben nem szereplő kérdés külön eset. [A kérdés betöltése és a tartalékág](../src/db/sessionRepo.js#L829) · [Befejezettség számítása](../src/db/sessionRepo.js#L909)

**Javítási irány.** Rövid távon tartsd meg a kérdéssort, amíg egy alkalom pillanatképe vagy egy válasz hivatkozik rá. Tartós megoldásként a válasz hivatkozzon az alkalom saját, rögzített kérdésére. A szerver és az adatbázis ennek a kérdésnek a tagságát és pontplafonját ellenőrizze. Érvényes pillanatképnél a hiányzó kérdés legyen egyértelmű elutasítás, az élő sablon csak a dokumentált, pillanatkép nélküli régi alkalmaknál maradjon kompatibilitási út.

**Elfogadás.** Futó alkalom közben törölj egy még megválaszolatlan kérdést a sablonból, és adj hozzá egy újat. A korábban és később belépők ugyanazt a rögzített feladatsort kapják. Az alkalom eredeti kérdése megválaszolható, az új sablonkérdés nem része annak az alkalomnak. A befejezettséget csak a kiosztott feladatokból számolja a szerver. Az új alkalom az új sablont használja.

### 1.3 A logikailag törölt sablon elrejthető, de továbbra is indítható

Aktív dolgozat mellett a teljes sablontörlés tiltott. A később logikailag törölt sablon eltűnik a listából, a célzott próbában a lezárt alkalom és a válasz megmaradt. Az egyedi kvízlekérés és az alkalomindítás még nem vizsgálja az `is_deleted` mezőt. Külön próbában a megőrzött azonosítóra a szerver új alkalmat hozott létre. Ez elavult tanári nézetből megmaradt választásnál is számíthat. [Listaszűrés](../src/db/quizRepo.js#L42) · [Kvízlekérés](../src/db/quizRepo.js#L76) · [Alkalom indítása](../src/db/sessionRepo.js#L231) · [Logikai törlés](../src/db/quizRepo.js#L666)

**Elfogadás.** A törölt sablonra épülő lezárt eredmény megnyitható, újra exportálható és képeivel együtt ellenőrizhető. Ugyanennek a sablonnak az azonosítójára a normál tanári indítási végpont érthető hibát ad. A régi archívumhoz továbbra is hozzáfér a tanár.

## 2. Visszaállítás és hibatűrés

### 2.1 Egy v1.26 sémájú mentés átmegy az ellenőrzésen, a tesztlista mégis hibázik

A normál indítási migráció létrehozza a `quizzes.is_deleted` oszlopot. A restore előkészítése a korábban bevezetett `sessions.max_points` és `sessions.quiz_snapshot_json` mezőket pótolja, az új oszlopot azonban nem. Az integritás- és idegenkulcs-ellenőrzés, illetve a kötelező táblák megléte nem igazolja, hogy a v1.27.0 futtatásához szükséges oszlopok és triggerek megvannak. [Indulási migráció](../src/db/init.js#L69) · [Restore-migráció és ellenőrzés](../src/services/backup.js#L108) · [Tesztlista lekérdezése](../src/db/quizRepo.js#L22)

**Futtatási eredmény.** Érvényes, szintetikus v1.26 sémájú mentés visszatöltése sikert jelzett. Az újraindítás nélküli következő tesztlistázás `no such column: q.is_deleted` hibát adott. Az előző verzióval készült mentés így visszaállíthatónak látszik, miközben a tanári felület sérült állapotba kerül.

**Elfogadás.** Az indulás és a restore ugyanazt a teljes sémamigrációt használja. A visszatöltött példányt a fájlcsere előtt ellenőrizze működés közben a kód, legalább a tesztlista, az archívum, a beállítások és egy lezárt alkalom képállományai alapján. Mai és korábbi, dokumentáltan támogatott mentés után a felület újraindítás nélkül működjön. Inkompatibilis csomag a fájlcsere előtt kapjon egyértelmű hibát.

### 2.2 A kétoldalú rollback az első hibát kezeli, a helyreállítás saját hibáját nem

Az új eljárás a képek ideiglenes másolatát is elkészíti. A beolvasott képeket külön másolja a működő feltöltési könyvtárba. Hiba esetén megpróbálja visszahozni az adatbázist és a képeket. A hibás képi rollbacket naplózza, az adatbázis újranyitásának hibáját elnyeli. A válasz ettől függetlenül sikeres helyreállítást állíthat, a takarítási ág pedig eltávolítja a visszaállításhoz készített példányokat. [Képek mentése](../src/services/backup.js#L153) · [Visszagörgetés és takarítás](../src/services/backup.js#L193)

**Futtatási eredmények elkülönített adatokkal:**

| Szimulált hiba | Adatbázis | Képek és helyreállítási példányok | Jelzett állapot |
|---|---|---|---|
| A második beérkező kép másolása megszakad | Az eredeti kvízcím visszaállt | Mindkét eredeti kép tartalma visszaállt | A restore sikertelen, az eredeti állapot helyreállt |
| A beérkező másolás és az eredeti képek visszamásolása is hibázik | Az eredeti kvízcím visszaállt | Az eredeti képek hiányoztak. A képmentés és az adatbázis `.bak` példánya eltűnt | A restore sikertelen, az eredeti állapot helyreállt |

**Javítási irány.** Az eredeti adatbázis és képfák visszaállítási példányai maradjanak érintetlenek, amíg vagy az új állapot, vagy az eredeti állapot tényleges működése nincs ellenőrizve. A sikertelen rollbacket külön állapot és üzenet jelezze, a helyreállítási fájl helyével az üzemeltető naplójában. Az adatbázis és a képfák együtt legyenek átválthatók. A futó és új állapot előkészítése külön helyen történjen, így kisebb a részlegesen cserélt állapot esélye.

**Elfogadás.** Próbálj ki sikeres visszatöltést, csere előtti elutasítást, csere közbeni hibát és külön hibát a visszagörgetésnél. Utóbbinál a rendszer pontosan jelezze, mi maradt helyreállítandó, és őrizze meg a szükséges példányokat. Sikeres helyreállításnál ellenőrizd, hogy a kiválasztott kvíz, lezárt eredmény és képek együttesen az eredeti vagy a visszatöltött állapotot adják.

## 3. Az élő és importálási javítások állapota

| Terület | Mit igazolt a visszaellenőrzés? | Mi maradt nyitva? |
|---|---|---|
| **Globális dolgozatindítás és lezárás** | Valódi helyi Socket.IO-klienssel a globális esemény csak a kijelölt metaadatmezőket kapta. A normál, hitelesített diák kapcsolat megkapta a tanári lezárást. | A hálózati megszakításból visszatérő böngésző teljes képernyőváltása külön tantermi próba. |
| **Diák hitelesítő és szobatagság** | A diák munkamenetének normál HTTP-lekérése fejlécben kapott hitelesítővel működött. A kliens a kérés URL-jéből eltávolította a tokent. | A szerver továbbra is elfogadja a régi URL-paramétert. A személyes szobához ellenőrzött token kell, a közös diákszobába az ellenőrzési ág sikertelensége után is megtörténik a beléptetés. |
| **Kivetítő** | A külön adatkészletből a kód elhagyja a neveket, a megoldókulcsot és a válaszszöveget. | A hálózati válasz továbbra is résztvevőnkénti pontot és válaszonkénti helyességet tartalmaz. Tanári sütivel a normál kivetítői kérés hibája esetén a kliens még megpróbálja betölteni a tanári mátrixot. [Adatkészlet](../src/db/sessionRepo.js#L1186) · [Tartalék betöltés](../public/js/projector.js#L163) |
| **Space Race** | Budapest időzónával az üres teremből indított tízperces próba az első belépőnél 600 másodpercet mért. A második résztvevő határideje bájtra egyezett. | Az újraindítás, a késés valós böngészős megjelenítése és a határidő után érkező diák kezelése nem része ennek a próbának. |
| **Gépváltás** | A korábbi 15 perces lejárati teszt továbbra is átmegy. | A tanári gomb továbbra is általános engedélyt ad. A kód és a célzott felhasználás atomi elfogyasztása a tényleges gépváltási folyamatban nyitott. |
| **Socrative PDF** | A kulcs nélküli ág már üres megoldást és felülvizsgálati jelzést állít elő. Az üres kulcsú kvíz indítását a meglévő teszt blokkoltnak igazolja. | A valódi PDF-ekkel végigvitt import hiányzik. A ténylegesen `A` szövegű opció és a pozícióként értett `A` kompatibilitási ága változatlanul kétértelmű. |

Az indítási és diákszoba-javítások forráshelyei a [dolgozatindítási végpont](../src/routes/api.js#L607), a [diák munkamenet-lekérés](../src/routes/api.js#L957), a [Socket.IO csatlakozás](../src/sockets/liveHandler.js#L20) és a [tanári lezárás](../src/routes/api.js#L649). A közös időzítést a [rajt](../src/db/sessionRepo.js#L1150) és az [időzítési teszt](../scratch/test_report14_fixes.js#L646) mutatja. A gépváltás és az import következő elfogadásához a [normál tanári gomb](../public/js/admin.js#L1158), az [engedélyezés](../src/db/sessionRepo.js#L632), a [PDF feldolgozása](../src/services/socrativePdfParser.js#L407) és a [betűjeles pontozás](../src/services/grader.js#L53) tartozik.

**Elfogadás.** A tanári, diák és kivetítő normál kapcsolata kapja meg a saját adatát. A diák alkalomhoz kötött szobatagsága kövesse az ellenőrzés eredményét. Az elfogadott vagy megszüntetett URL-token-kompatibilitás kerüljön bele az üzemeltetési dokumentációba. Két diákböngészővel ellenőrizd a tanári engedéllyel történő gépváltást, az elutasított vagy lejárt engedélyt és a korábbi válasz megőrzését. A Socrative átvételhez valódi, szintetikus tartalmú megoldókulcsos és kulcs nélküli PDF szükséges, egybetűs válaszlehetőséggel is.

## 4. Tesztfuttatás és a projektadatok védelme

Az `npm test` a vizsgált változatban tiszta másolatból eljutott a végéig. A célzott szkript mind a 20 jelzett ellenőrzése lefutott. Az új, 18–20. teszt ellenőrzi a gépi pontozást meglévő kérdéssor átírása után, az üres teremre számolt határidőt és a lezárt alkalom megőrzését sablon törlésekor. A tanári gomb alapértelmezett pontszámát, a pillanatképben maradt kérdéssor fizikai törlését és a visszagörgetés saját hibáját a jelentésben szereplő külön próbák fedték le. [Új tesztek](../scratch/test_report14_fixes.js#L596) · [Mentési teszt](../scratch/test_report14_fixes.js#L344)

A célzott szkript a projektmappában futtatva továbbra is közvetlenül megnyitja a `data/ropdolgozat.db` állományt. Induláskor meghatározott évfolyamok alkalmait törölheti, meglévő névsorhoz hozzáférhet, üres névsornál pedig oda tesz be szintetikus tanulókat. A tiszta adatkönyvtárból sikeresen lefutó teszt és a projektadatoktól automatikusan elszigetelt teszt külön követelmény. [A teszt adatbázisának megnyitása](../scratch/test_report14_fixes.js#L11)

**Elfogadás.** A teljes csomag saját ideiglenes adatbázist és feltöltési mappát hoz létre, a szintetikus névsort maga készíti el, és csak a saját adatait takarítja. A restore-próba ténylegesen végigviszi a csomag létrehozását és felhasználását. Legyen külön ellenőrzés a pontozásra, a sablonból eltávolított kérdésre, a régi mentés migrálására és a visszagörgetési hibára.

## 5. Javasolt javítási és átvételi sorrend

1. **Kézi pontozás és rögzített kérdések.** Vedd át a többpontos kérdés normál tanári felülbírálását, illetve az alkalom alatt a sablonból eltávolított, még megválaszolatlan kérdés beküldését. A pontozás, válaszmentés és export egyezzen.
2. **Korábbi mentés és sikertelen rollback.** A v1.26-os minta restore után azonnal használható legyen. Két külön hibaszituációban igazold az eredeti adatok visszaállását, illetve a megőrzött helyreállítási példányokat és a pontos hibajelzést.
3. **Hozzáférés és teljes kliensfolyamat.** Zárd le a diákszobába történő beléptetés szabályát, a tanári gépváltást és a böngészős újracsatlakozást. A globális indítás mezőlistája maradjon regressziós feltétel.
4. **Tesztek és iskolai próba.** A javított tesztfuttató ne érje el a projektadatbázist. A célcsomagon szintetikus névsorral próbáld ki a normál tanórai dolgozatot, az időzített Space Race-t, a tanári felülbírálást, a Socrative-importot, az exportokat és a visszaállítást.

A [Report 16-ra adott válaszban](Valasz_a_Report_16_Megallapitasokra.md) a globális adatküldés mezőszűrése, az üres terem időzítése és a tiszta tesztfutás a megnevezett körülményekkel igazoltként szerepelhet. A pontozás, a régi mentés és a visszagörgetés továbbra is részleges. A visszaellenőrzés alapján a szintetikus tantermi próba mehet tovább. Valódi jegyek előtt a fenti négy, futtatással igazolt működési hibát kell lezárni.
