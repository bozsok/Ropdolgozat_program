# Okoskodó – további javítások a Report 14 után

**2026. november 20. · v1.25.0 · Git `b3f0a98`**

A v1.25.0 külön Socket.IO-szobába helyezi a tanári mátrixot, javítja a lejárt válasz kezelését, rögzíti a pontmaximumot az új alkalmaknál, és az SQLite Online Backup API-jával készít adatbázis-pillanatképet. A következő javítási kör célja, hogy ezek a garanciák a teljes tantermi folyamatban is érvényesüljenek. Az első próbához szintetikus névsort és próbakérdéseket használj. Valódi névsor és naplóba kerülő jegyek előtt teljesüljenek az alábbi elfogadási feltételek.

Kiindulásként használd a [Report 14-et](Report_14_Eles_proba_elotti_atvilagitas.md) és a [v1.25.0 javításairól készült válaszfájlt](Valasz_a_Report_14_atvilagitasra.md). A sorszámok az eredeti audit tételeire utalnak.

| Sorrend | Javítási kör | Akkor tekinthető késznek |
|---|---|---|
| 1 | Socket.IO-jogosultság és lezárási esemény | A három szerepkör csak a saját adatait kapja. A tanári lezárás megjelenik a csatlakozott és a visszacsatlakozó diák képernyőjén. |
| 2 | Rögzített feladatverzió és egységes eredmény | A sablon átírása után a korábbi alkalom kérdései, kulcsai, pontjai és jegyei minden nézetben megegyeznek. |
| 3 | Socrative import és pontozás | A bizonytalan kulcs ellenőrzésre vár, a megerősített kulcs minden kérdéstípusnál egyértelműen értékelhető. |
| 4 | Visszaállítás és gépváltás | A visszaállítás előre ellenőrzött és megszakításból helyreállítható. Gépváltáskor a jóváhagyott tanuló a meglévő válaszaival folytatja. |
| 5 | Izolált regressziós és tantermi próba | A teljes tesztparancs tiszta adatkönyvtárból fut. A megerősített folyamatok az iskola tényleges Windows-csomagján és böngészőiben is működnek. |

## 1. Socket.IO-jogosultság és élő állapot

### Tanári, diák- és kivetítői adatfolyam · Report 14 / 01–02, 11, 18

A tanári mátrix külön szobába kerül, de a belépéskor a jogosultságot továbbra is a kliens által közölt szerep határozza meg. A kivetítő szintén a teljes mátrixot kapja, bár csak összesítéseket jelenít meg. A visszajelzés elrejtése mellett a diák adatlekérése részpontokat, értékelést és összesítést továbbra is visszaadhat.

- A szerver a tanári munkamenetből állapítsa meg a tanári jogosultságot. Ellenőrizze a szobához csatlakozást és az érzékeny műveleteket, beleértve az érvényességet és a kijelentkezést. A tanári léptetés és kiléptetés korábbi eseménykezelőit érdemes kivezetni vagy ugyanazzal a szerveroldali jogosultságvizsgálattal védeni.
- A diák munkamenetét az érvényes diák hitelesítőből kösse az adott alkalomhoz és résztvevőhöz. A kivetítő külön összesített adatot kapjon, név, egyéni válaszok és teljes megoldókulcs nélkül. A megosztható anonim HTML-exportnál az azonosítókat már generáláskor távolítsd el.
- Rögzítsd a visszajelzés három állapotát. Mi látható válaszadás után, saját beadás után, illetve az egész alkalom lezárása után? Ugyanazt a szabályt alkalmazza a beküldés, az ismétlés, a helyreállítás, az összesítő és az élő adatfolyam. Az azonnali formatív visszajelzés megmaradhat választható pedagógiai módként.

**Elfogadás.** Külön tanári, diák- és kivetítői klienssel ellenőrizd a saját adatkészleteket, egy eltérő alkalomhoz tartozó jogosultság elutasítását, a kijelentkezést és az újracsatlakozást. Rejtett visszajelzésnél az adatválaszok is kövessék a kiválasztott szabályt. [Élő eseménykezelő](../src/sockets/liveHandler.js#L10) · [Diák munkamenet-adatok](../src/routes/api.js#L920)

### Lezárás, újracsatlakozás és közös rajt · Report 14 / 14–16, 19–22

A visszaellenőrzésben a tanár lezárta az alkalmat, az adatbázis `FINISHED` állapotba került, a normál diák Socket.IO-kliens mégis nulla lezárási eseményt kapott. A lezárás a régi szobanévre megy. A lejárt válasz tartós lezárása már működik, de a szervernek olyan tanulót is le kell tudnia zárni, akinek a kliensét közben bezárták.

- A lezárási értesítést küldd az érintett, jogosult szobákba. A kliens újracsatlakozáskor kérje le a szerver aktuális állapotát. Későn érkező HTTP-válasz csak akkor frissítse a képernyőt, ha még az aktuális alkalomhoz tartozik.
- A szerveri határidő legyen irányadó az állapot átmeneténél. Tedd tartóssá a lezárást akkor is, ha a lejárat után már nincs újabb válaszkísérlet. A kijelző használja a szerver által közölt aktuális időt. Elveszett HTTP-válasz ismétlésekor a kliens kapja vissza a ténylegesen mentett választ és az aktuális befejezettséget.
- Space Race esetén tárold a közös rajt idejét és a határidőt az alkalom szintjén. Az ismételt rajt ne indítsa újra az időt. Az első késői csatlakozó akkor is a már rögzített határidőt kapja, ha rajtkor üres volt a terem. A tanári léptetés addig szerveroldalon is legyen nem indítható, amíg a mód nincs végigvezetve.

**Elfogadás.** A tanári lezárás jelenjen meg egy közben kapcsolódó, egy már csatlakozott és egy hálózati megszakításból visszatérő diák számára is. Ellenőrizd az eltérő kliensórát, az egyéni lejáratot bezárt böngésző mellett, a kétszeri rajtkattintást és az üres váróból indított versenyt. [Tanári lezárás](../src/routes/api.js#L623) · [Válaszmentés](../src/db/sessionRepo.js#L642) · [Közös rajt](../src/db/sessionRepo.js#L991)

## 2. Feladatverzió, történeti jegy és résztvevő

### Dolgozat indításakor rögzített feladatsor · Report 14 / 17, 25–27, 30–32, 34

Az új `max_points` mező a tanári mátrix nevezőjét rögzíti, miközben a diák összesítője az aktuális kvízből számol. Szintetikus próbában a lezárt dolgozat sablonjának szerkesztése után a tanári eredmény 50% maradt, a diáké 25%-ra változott. A meglévő lezárt alkalmaknál az új mező értéke üres lehet. A kérdésszöveg, megoldókulcs és pontérték továbbra is változhat a futó vagy lezárt alkalom nézeteiben.

- Indításkor rögzítsd az alkalom kérdéseit, stabil kérdésazonosítóit, sorrendjét, opcióit, megoldásait, magyarázatait és pontértékeit. Rögzítsd a ponthatárokat, valamint őrizd meg a rögzített feladatok képeit az alkalom élettartamáig. A szerkesztőben módosított sablonból az ezt követő indítások kapjanak új feladatverziót.
- A szerver a kiosztott kérdéskészlethez ellenőrizze a beküldést és a befejezettséget. A diák összesítő, mátrix, archívum és minden export ugyanabból a rögzített adatkészletből, azonos kerekítési és részpontszabállyal számoljon.
- A régi alkalmakhoz ellenőrzött migrációs szabály kell. Ha az eredeti feladatsor már nem rekonstruálható, jelöld a történeti korlátot. A mai sablonból számolt érték visszatöltése önmagában nem állítja helyre az eredeti eredményt.
- Egységesítsd a bemenetvalidálást. A kézi pont valódi véges szám legyen. Döntsd el a nulla pontos kérdés és a részleges beadás támogatását. A kijelölt tantárgy, évfolyam, kvíz és indítható mód összhangját a szerver ellenőrizze.

**Elfogadás.** Készíts két alkalmat ugyanabból a sablonból. Módosíts közben pontot, kulcsot, sorrendet és képet, majd törölj egy feladatot a sablonból. A már indult alkalom diák- és tanári nézete, valamint XLSX-, HTML-, ZIP- és nyomtatható kimenete őrizze a saját verzióját. Külön ellenőrizd a korábbi verzióval létrehozott archívumot és a ponthatárhoz közeli tört pontszámokat. [Alkalomindítás](../src/db/sessionRepo.js#L211) · [Kvízszerkesztés](../src/db/quizRepo.js#L383) · [Diák eredmény](../src/routes/api.js#L960)

### Első belépés, azonos nevű diákok és gépváltás · Report 14 / 05–07, 23, 29

A gépváltás után a név felszabadul, a régi kliens célzott üzenetet kap. A normál tanári gomb célgép nélkül ad engedélyt. A gépszám a böngésző által küldött adat. A részvétel és helyreállítás továbbra is részben a névre támaszkodik, az adatbázis pedig alkalmon belül egyedinek követeli a nevet.

- Tartsd meg a névválasztást. A szerver az elküldött választás azonosítójából töltse be a hivatalos nevet és osztályt, majd ellenőrizze az alkalomhoz tartozást. Az egyediség stabil résztvevői azonosítón alapuljon. Az alkalomba a belépéskori nevet és osztályt is rögzítsd.
- Gépváltáshoz adj rövid életű, egyszer használható átvételi engedélyt. Felhasználásakor egy tranzakcióban ellenőrizd és fogyaszd el az engedélyt, majd cseréld le a diák hitelesítőjét. A gépszám jelenhet meg tanári tájékoztatásként. A téves név törlése továbbra is külön művelet legyen.
- A párhuzamos tantárgyaknál tisztázd a foglaltság hatókörét. A szerver és a legördülő lista ugyanazt a szabályt használja, különösen az egyénileg befejezett tanulónál és napokig nyitott alkalomnál.

**Elfogadás.** Két azonos nevű diák két külön résztvevőként írhat az engedélyezett körben. Gépváltás után az új gép az eredeti válaszokkal és határidővel folytatja, a régi munkamenet érvényét veszti, a többi diák képernyője változatlan. [Tanári gépváltás](../public/js/admin.js#L1158) · [Résztvevői adattár](../src/db/sessionRepo.js#L330) · [Résztvevői séma](../DATABASE_SCHEMA.sql#L124)

## 3. Import és pontozás

### Egyértelmű Socrative-kulcs · Report 14 / 36–38

A PDF-import már szöveges megoldást tárol. A hiányzó vagy bizonytalan kulcshoz még választhat alapértelmezett opciót. A betűjeles kompatibilitási ágban futtatással igazolt eset, hogy a ténylegesen `A` szövegű opció és az első opció szövege egyaránt helyesnek minősülhet.

- Az import során az opció azonosítója és a megjelenített szövege legyen külön mező. A betűjeles régi kulcsot egyértelműen az import vagy a migráció fordítsa át. A pontozó ugyanazt a tárolt értéket értelmezze minden megjelenítési sorrendnél.
- Hiányzó vagy többértelmű kulcsot és bizonytalan kép-hozzárendelést jelölj a tanári előnézetben. A feladat felülvizsgálatáig az alkalom legyen indításra alkalmatlan. A fájlméret mellett a kibontott méretre, oldalszámra és képméretekre is legyen korlát.

**Elfogadás.** Valódi, szintetikus tartalmú Socrative PDF-ből ellenőrizd az ABCD és TF kérdéseket, a kevert opciókat, az azonos kezdetű válaszszövegeket, a tényleges egybetűs opciót, a kulcs nélküli exportot és a képek helyét. A biztos kulcs tanári újramentés nélkül működjön. A bizonytalan eset tanári ellenőrzést igényeljen. [PDF-parser](../src/services/socrativePdfParser.js#L311) · [Pontozó](../src/services/grader.js#L38)

### KRÉTA-névsor és fájlkezelés · Report 14 / 09–10, 35, 38–40

- A CSV import a teljes rekordot értelmezze, az idézőjeles többsoros mezőkkel együtt. A tanár mentés előtt lássa az osztályonkénti hozzáadást és eltávolítást. Hibás formátum, fejléc vagy részleges beolvasás állítsa meg a cserét. Mintaellenőrzéskor magát a feltöltési végpontot használd.
- Az API `no-store` fejléce megvan. A diák hitelesítőjét a normál kliens kérésfejlécben küldje. A feltöltött kép típusát a tényleges tartalom alapján ellenőrizd. A képfájlok véglegesítésekor a siker feltétele legyen, hogy minden mentett kérdéshivatkozás feloldható.
- Az exportot közös, képpel, részponttal és üres válasszal ellátott dolgozattal vedd át. Azonos név, idézőjel és kódjelek esetén is maradjon teljes és olvasható. Rögzítsd az eltérést, ha az XLSX csak pontot tartalmaz, vagy az egyéni lapból kimarad az ábra.

**Elfogadás.** Érvényes és hibás importfájloknál a névsor csak jóváhagyott módon változik. Hiányos képes kvíz mentése érthető hibát ad, a már használt képek az újraexportálásnál is megvannak. [Névsorimport](../src/routes/api.js#L242) · [Exportok](../src/services/exporter.js#L202)

## 4. Mentés, visszaállítás és éles telepítés

### Régi mentés, képek és sikertelen fájlcsere · Report 14 / 41–44

A v1.22 sémájú, érvényes mentést a v1.25.0 elfogadta. Utána az Eredmények lekérése a hiányzó `sessions.max_points` miatt hibára futott. A jelenlegi `.bak` visszaállítás az adatbázisra vonatkozik, a képmappát külön másolja. A beépített próba hibás archívum elutasítását fedi a csere előtt.

- A mentés az SQLite-pillanatképet és az ahhoz tartozó képkészletet együtt rögzítse. Ha a konzisztens pillanatkép készítése nem sikerül, a mentési kérés jelezzen hibát. A stream hibája és a letöltés megszakadása legyen megfigyelhető, az ideiglenes állományok takarításával együtt.
- Visszaállítás előtt külön munkaterületen ellenőrizd a csomag tartalmát, a sémaverziót, a kötelező oszlopokat és a képreferenciákat. A támogatott régi mentést még a csere előtt migráld és nyisd meg próbaként. Inkompatibilis mentésnél adj egyértelmű hibát.
- A csere és a visszagörgetés ugyanazt az adatbázis–képmappa párost kezelje. A sikeres visszaállítás feltétele a megnyitható, ellenőrzött új állapot. Sikertelen rollback külön hibaállapot legyen. A művelet után a kapcsolódó kliensek kapjanak új szerverállapotot.

**Elfogadás.** Visszatöltés tesztkönyvtárba mai és támogatott régi mentéssel, képes feladatokkal és lezárt eredményekkel. Ezt kövesse vezérelt fájlműveleti hiba a csere közben. A helyreállás után az eredeti adatbázis, az eredeti képek és az Eredmények nézet együtt működjenek. [Backup és restore](../src/services/backup.js#L13) · [Sémamigráció](../src/db/init.js#L80)

### Telepítési feltételek és elfogadott üzemeltetési kockázatok · Report 14 / 03–04, 12, 45–54

- A PIN-próbálkozások korlátozása mellé állíts be telepítésenként saját PIN-t és sütialáíró titkot. Döntsd el és ellenőrizd a belső hálózat hozzáférési határát. A feltöltések tanári hitelesítése csökkenti a csomaghiba kitettségét. A Multer foltozását külön kezeld a kiadási csomagban.
- A telepítési leírás a ténylegesen kipróbált Windows-, Node- és natív SQLite-modul kombinációt rögzítse. A BAT jelenleg legalább 22-es főverziót vizsgál. A bejelentkezés nélküli indulást és hiba utáni újraindulást a tényleges szerveren ellenőrizd.
- Állíts össze futtatási fájllistát, külön a fejlesztői adatoktól és jegyzetektől. Az üres névsort kezeld a telepítés szabályos kezdőállapotaként. Az adatköltöztetés ellenőrzött mentésből történjen. Az iskolai próba terjedjen ki a belső névfeloldásra, a több kliens egyidejű válaszadására, a betűkészlet betöltésére, a billentyűzetes használatra és a kivetítőre.

**Elfogadás.** Tiszta, internetkapcsolat nélküli telepítés a kiadási csomagból. A szerver bejelentkezés nélkül indul és a kijelölt kliensekről elérhető. A szintetikus névsorral végzett próba végén a létszám, a mentett válaszok, a riportok és a visszaállított adatok egyeznek. [Windows-indító](../start_server.bat#L14) · [Telepítési útmutató](../telep%C3%ADt%C3%A9s.md)

## 5. Tesztelés és a válaszfájl státuszai

Az izolált `npm test` a Report 14 szkript ötödik ellenőrzésénél leállt, mert tiszta DB-ben nincs mintatanuló. Két mesterséges tanulóval a Report 14 szkript végigfutott. A szkript jelenleg közvetlenül a projekt `data/ropdolgozat.db` fájlját is megnyitja. A javítás során a futtató készítsen saját ideiglenes DB-t, névsort és feltöltési mappát, várja meg az aszinkron mentési ellenőrzés végét, majd csak a saját tesztadatait takarítsa. [Report 14 tesztszkript](../scratch/test_report14_fixes.js#L10)

A következő visszaellenőrzésnél érdemes a már működő regressziókat külön megtartani. Ilyen a lejárt válasz tartós lezárása, a Space Race rajt előtti tiltása, a HTML-escape, a PIN-próbálkozások korlátja és az ismételt válaszbeküldés. A végponti vagy böngészős tesztet futtasd a tényleges útvonalon, ha a javítás API-t, Socket.IO-t vagy UI-t érint. Az adattárteszt jól mutatja a tárolási viselkedést, a tanórai folyamatot a kapcsolódó klienssel lehet igazolni.

A válaszfájlban az **01., 06., 20., 25–27., 36–37. és 41–43. pontok** kapjanak nyitott vagy részleges státuszt, amíg a hozzájuk tartozó elfogadási próba nem teljesül. A hálózati topológia, a gépindítás, a böngésző és a célterhelés státusza legyen **célkörnyezetben ellenőrizendő**. Az élesre kész minősítéshez a fenti próbák eredményét és a vállalt tantermi döntéseket rögzítsd a válaszfájlban.
