# Tanári léptetés – Megállapítások és elfogadási feltételek

**Kiindulás** · Okoskodó v1.34.5, `a08f19b` · 2026. november 22.

A Tanári léptetés mód beépíthető a jelenlegi sémába. A `sessions.mode` megengedi a `TEACHER_PACED` értéket, a `current_question_index` pedig tárolja az aktuális pozíciót. A lényegi munka a dolgozat életciklusának, a közös kérdésállapotnak és a diákoldali adatnézetnek a kialakítása. Az indítás most szándékosan elutasítja ezt a módot. A felületi opciót a teljes működés elkészülte után érdemes aktiválni. [Beépítési terv](teacher_paced_terv_01.md) · [Adatbázisséma](../DATABASE_SCHEMA.sql#L101) · [Indítási ellenőrzés](../src/db/sessionRepo.js#L231)

## 1. Javasolt termékdöntések

| Kérdés | Javasolt működés az első kiadásban |
| --- | --- |
| Ki irányítja a haladást és a lezárást? | A tanár nyitja meg az aktuális kérdést, és ő zárja le a dolgozatot. Az első kérdés induláskor nyitott. A vissza- és előrelépés, illetve a gyorsugrás aktív dolgozatban engedélyezett. |
| Lehet-e pótolni visszalépésnél? | Igen. Amíg a tanár az adott kérdésen áll, az arra még nem válaszoló diák pótolhat. A már mentett válasz zárolt marad. |
| Kell-e egyéni időkorlát? | Az első kiadásban a Tanári léptetés mód időkorlátja `0`. A tanár közösen zárja le a dolgozatot. A korábbi módok megtartják a saját időszabályaikat. |
| Mit jelent az „Azonnali visszajelzés”? | Bekapcsolva a mentést követően a diák látja a saját értékelését, a megoldást és a magyarázatot. Kikapcsolva a tanári lezárásig a saját mentett választ és az átvétel jelzését látja. A lezárás után mindkét állásban megjelenhet a személyes értékelőlap. Ez a Tanári léptetéshez javasolt termékszabály. |
| Milyen legyen a kiválasztott csempe? | Halványkék kijelölés és kék rádiópötty. A pipa és az X az értékelés megjelenésekor jelenjen meg, szöveges értékeléssel együtt. |

## 2. A tanári lezárás legyen az életciklus határa

**Megállapítás.** A jelenlegi szerver minden kérdés megválaszolásakor automatikusan beállítja a résztvevő `is_finished` mezőjét. A kliens visszatöltéskor ilyen résztvevőnek az értékelőlapot nyitja meg. A diák saját lezárási végpontot is hívhat. Az algoritmus tehát akkor is befejezettnek tekinthetné a diákot, ha a Tanári léptetés felületéről csak a „Befejezés” gombot rejtenénk el. Az egyéni határidő a jelenlegi általános ágban csatlakozáskor indul, ezért eltérő időpontban zárhatna le diákokat. [Automatikus befejezés](../src/db/sessionRepo.js#L919) · [Határidő számítása](../src/db/sessionRepo.js#L506) · [Diákoldali lezárás](../src/routes/api.js#L1318) · [Visszatöltés](../public/js/student.js#L1392)

**Javaslat.** Tanári módban a válaszok száma haladási adat legyen. A mentés után `is_finished` és `finished_at` továbbra is a tényleges lezárást jelölje. A rajt előtti beállításnál a kérdéskeverést és az egyéni időkorlátot a szerver is kényszerítse `0`-ra. Aktív Tanári léptetés módban a diák lezárási kérése ne módosítsa az állapotot. A tanári lezárás a meglévő `finishSession()` műveleten keresztül zárja le a dolgozatot és a résztvevőket. A kliens a lezárási jelzés vagy a visszatöltött lezárt állapot alapján olvassa be az eredményét. A megválaszolatlan feladatok és a teljes dolgozati pontszám maradjanak benne a megszokott értékelésben. [Tanári lezárás](../src/db/sessionRepo.js#L333) · [Összesítő felület](../public/js/student.js#L2033)

**Elfogadás.** Egykérdéses dolgozatban a válasz elmenthető, a diák várakozó állapotú, és frissítés után is ugyanazt látja. Az értékelőlap csak a tanári lezárással válik elérhetővé. Az első kérdést kihagyó diák visszalépés után még menthet rá választ, a már válaszoló diák mentése pedig sértetlen.

## 3. A léptetés és a válaszmentés ugyanazt az állapotot használja

**Megállapítás.** A meglévő `teacher:next_question` Socket.IO-kezelő ellenőrzi a tanári jogosultságot, majd közvetlenül írja az indexet. Az író függvény a bevitelből számot képez, de nem ellenőrzi az aktív állapotot, a módot és a felső határt. A kimenő értesítés a kérésből kapott indexet adja tovább munkamenet-azonosító nélkül. [Socket.IO-kezelő](../src/sockets/liveHandler.js#L73) · [Jelenlegi indexírás](../src/db/sessionRepo.js#L1228)

**Javaslat.**

1. A védett `POST /api/admin/sessions/:id/question-index` legyen az egyetlen tanári írási út. Vezesd ki a használaton kívüli Socket.IO írási kezelőt, és tartsd meg a kimenő értesítést. A szerver ellenőrizze a létező, aktív Tanári léptetés módú dolgozatot és a valódi egész számú indexet. A felső határt az indításkori `quiz_snapshot_json` kérdéssora adja. A tanári vezérlősáv előnézete és a kérdésszám ugyanebből a sorrendből jöjjön.
2. Két tanári felület egyidejű használatánál az előre- és visszalépés küldje el a kijelzett kiinduló indexet is. Ha közben egy másik tanár lépett, a szerver jelezzen ütközést és adja vissza az aktuális állapotot. A kliens frissítse a nézetet. Azonos index megismétlése kezelhető művelet nélküli sikernek. Csak sikeresen mentett változást sugározz a megfelelő szobákba `{ sessionId, questionIndex }` adattal. Az esemény és a HTTP-válasz a szerver által elfogadott értéket tartalmazza.
3. Új válasznál a `submitAnswer()` az aktív indexet és az ahhoz tartozó kérdésazonosítót a mentés tranzakcióján belül ellenőrizze. A tanári léptetés és a diákbeküldés sorrendjét az adatbázisban véglegesített műveletek adják. Ha a tanár léptetése kerül előre, az előző kérdés új válasza `400 / QUESTION_NOT_ACTIVE` elutasítást kapjon. Ha a mentés előbb véglegesült, őrizd meg. Az üzleti elutasítás kerüljön az `answer.rejected` naplóba. [Válaszmentés](../src/db/sessionRepo.js#L713) · [Üzleti hibakódok](../src/routes/api.js#L1213) · [SQLite-tranzakciók](https://sqlite.org/lang_transaction.html)
4. Az idempotens ág az új beküldések korlátozása előtt ellenőrizze, van-e már mentett válasz az adott diák és kérdés párjára. Ilyenkor a kanonikus mentett eredményt adja vissza `alreadySubmitted: true` jelzéssel, az adott pillanatban engedélyezett visszajelzési mezőkkel. A kliens a mentett választ állítsa vissza. Az ismételt HTTP-kérés törzsének választása eltérhet a már eltárolt választól.

Az élő mátrix számlálója a megnyitott kérdésre választ mentő csatlakozott résztvevőket mutassa. A számláló nevezője ugyanabból a résztvevői körből érkezzen. A hiányzó válasz és a mentett, de hibás válasz külön állapot. A kivetítő csak a hozzá illő adatokat kapja. [Élő mátrix](../src/db/sessionRepo.js#L1040) · [Kivetítő-adatok](../src/db/sessionRepo.js#L1196)

## 4. A visszatérés és a késői HTTP-válasz kezelése

**Megállapítás.** A kliens Socket.IO-visszacsatlakozáskor újra feliratkozik a szobára. A kérdésváltás közben érkező beküldési válasz viszont az éppen kirajzolt csempékre is hatással lehet, mert a jelenlegi kód közvetlenül a dokumentum aktív csempéit zárolja. [Kapcsolódás](../public/js/student.js#L677) · [Beküldés utáni felület](../public/js/student.js#L1864)

**Javaslat.** A diák és a tanári felület az adatbázisból visszaolvasott kiszolgálói állapothoz igazodjon. A Socket.IO esemény legyen jelzés az aktuális állapot frissítésére. Belépéskor, oldalfrissítéskor és visszacsatlakozáskor a diák kérje le az aktuális indexet, a dolgozat állapotát, az aktív kérdést és a hozzá tartozó mentett saját választ. A kliens hagyja figyelmen kívül a másik munkamenet eseményeit, és az egymást átfedő frissítésekből csak a jelenlegi munkamenet legfrissebb kérésének eredményét alkalmazza. Ha frissítés közben újabb léptetés érkezik, fusson szükség szerint következő frissítés is. [Socket.IO kapcsolatvesztés](https://socket.io/docs/v4/tutorial/handling-disconnections)

Beküldés indításakor rögzítsd a munkamenet- és kérdésazonosítót. A késői visszaigazolás az ahhoz tartozó mentett állapotot frissítse. Másik kérdésre léptetve a látható csempéket és a beküldés gombját a jelenlegi kérdés állapota határozza meg. `QUESTION_NOT_ACTIVE` esetén jelenjen meg rövid tájékoztatás, és következzen állapotfrissítés. Lezárt állapotnál az értékelőlap egyszer nyíljon meg, akkor is, ha a tanár a klienskapcsolat megszakadása közben zárt.

## 5. A diákoldali API csak az aktuális tanulói állapotot adja ki

**Megállapítás.** A jelenlegi `GET /api/student/session-data` általánosan a teljes kérdéssort adja vissza. A megoldások elrejtése mellett is vannak pontszám- és helyességi mezők a mentett saját válaszokban, valamint összesítő adatok a válaszban. A válaszopciók sorrendje a lekérések során újrakeveredhet. A Tanári léptetés módhoz az adatnézetet és a visszajelzési feltételt szerveroldalon kell szabályozni. [Kérdéseket és pontokat előállító végpont](../src/routes/api.js#L963) · [Beküldés visszajelzése](../src/routes/api.js#L1255)

| Állapot | Javasolt diákoldali adattartalom |
| --- | --- |
| Aktív, még nincs válasz az aktuális kérdésre | Dolgozatállapot, aktuális index, összes kérdés száma, aktuális kérdés és opciói. |
| Aktív, válasz elmentve, azonnali visszajelzés bekapcsolva | Az aktuális kérdés zárolva, saját mentett válasz, valamint az arra vonatkozó értékelés, megoldás és magyarázat. |
| Aktív, válasz elmentve, azonnali visszajelzés kikapcsolva | Az aktuális kérdés zárolva, saját mentett válasz és mentési állapot. A pont-, helyességi, megoldás- és magyarázatmezők, valamint az azokból következtetést engedő összesítők a lezárásig el vannak rejtve. |
| Tanár által lezárva | A résztvevőhöz tartozó értékelőlap és a lezáráskori megoldások, a jóváhagyott termékszabály szerint. |

Az aktív módban célszerű külön `currentQuestion` és `totalQuestions` mezővel dolgozni. A teljes listára épülő `renderQuestion(index)` hívást az új adatalakhoz igazítsd. A globális index a haladást jelöli. Az aktuális kérdés azonosítója köti össze a megjelenítést és a választ. A tanári felületen külön maradjon elérhető a teljes rögzített kérdéssor a gyorsugráshoz.

A Tanári léptetéshez javasolt `show_feedback_on_end` értelmezést egy helyen tedd egyértelművé. A beküldés, visszatöltés és lezárt értékelőlap ugyanazt a szabályt alkalmazza. A `POST /api/student/join` helyreállításnál és gépváltásnál jelenleg értékelési mezőket is visszaküld a mentett válaszokkal. Ezen az útvonalon is érvényesítsd a Tanári léptetés adatnézetét, vagy a belépés után a közös, szűrt állapotlekérdezésből építsd fel a felületet. [Belépés és helyreállítás](../src/routes/api.js#L914) · [Korábbi válaszok gépváltáskor](../src/db/sessionRepo.js#L418)

Opcionális válaszkeverésnél egy diák és kérdés párjának rendje a dolgozat idején legyen stabil. Választható determinisztikus, stabil résztvevő- és kérdésazonosítóra épülő permutáció. Ehhez nem kell új oszlop. A mentés a tényleges választ azonosítsa, a betűk a megjelenítés sorrendjét jelöljék. Újranyitáskor a mentett választ a hozzá tartozó opcióhoz kell visszakötni. [Jelenlegi opciókeverés](../src/routes/api.js#L1034)

## 6. Válaszcsempe és várakozási állapot

Egyszeres választásnál előnyben részesítendő a felirattal ellátott natív rádiógomb. Egyedi csempék esetén a kiválasztás legyen billentyűzettel kezelhető, jól látható fókuszállapottal és a segítő technológiák számára közölt kijelöléssel. A kék pötty a kiválasztást, a „Válasz beküldve” felirat a sikeres mentést, a pipa vagy X és az értékelőszöveg pedig a kiértékelést jelzi. Ha a kiértékelés rejtett, a lezárt csempén a semleges kiválasztási jelölés maradjon. A várakozó szöveg állapotüzenetként legyen érzékelhető, és ne mozgassa feleslegesen a billentyűfókuszt. Az ABCD és Igaz/Hamis megjelenést mindhárom módban ellenőrizd. [Jelenlegi csempestílus](../public/css/style.css#L4177) · [W3C rádiógombminta](https://www.w3.org/WAI/ARIA/apg/patterns/radio/)

## 7. Elfogadási próbák és megvalósítási sorrend

| Próba | Elvárt bizonyíték |
| --- | --- |
| Indítás és sorrend | A szerver kikényszeríti a kérdéskeverés és az egyéni időkorlát kikapcsolását. Két diák ugyanazt az első és következő kérdést kapja. A dolgozat indítása után a sablon módosítása nem változtat a rögzített sorrenden. |
| Jogosultság, mód és határ | Jogosultság nélküli léptetés elutasított. Lezárt és más módú dolgozat indexe nem változik. Negatív, tört és tartományon túli index elutasított. Két tanári nézet ütközés után az aktuális állapotra frissül. |
| Mentés és visszalépés | Nyitott kérdésre menthető válasz. Korábbi vagy későbbi inaktív kérdés új válasza elutasított. Visszalépéskor az eddig kihagyott válasz pótolható. Az ismételt beküldés egyszer szerepel az adatbázisban, és a korábban mentett választ adja vissza. |
| Léptetés beküldés közben | Kontrollált késleltetéssel vizsgáld mindkét sorrendet. A korábban véglegesített mentés megmarad. A késve érkező válasz nem zárolja az új kérdés felületét. |
| Egyetlen kérdés és tanári lezárás | Mentés után, akár böngészőfrissítéssel, a diák a kérdésen marad. A tanári lezárás után jelenik meg az eredmény. A pontszám és az export egyezik a tárolt adatokkal. |
| Késői belépés és kapcsolatvesztés | Későn belépő diák az aktuális kérdést kapja. A megszakítás alatt történt léptetés vagy lezárás visszakapcsolódáskor helyesen jelenik meg. A válaszopciók sorrendje frissítés után is egyezik. |
| Visszajelzés kikapcsolva | Vizsgáld a nyers diákoldali API-választ is, beleértve a munkamenet folytatását és a gépváltást. Az aktív állapot csak az aktuális kérdést adja. Mentés után a kliens visszaállítja a saját választ, a rejtett értékelési adatok kizárólag a tanári lezárást követően érhetők el. |
| Regresszió és használhatóság | A meglévő `npm test` és az új Teacher-Paced integrációs próbák sikeresek. A három mód felülete tényleges böngészőben, egérrel és billentyűzettel is ellenőrzött. |

Elsőként a szerveroldali indítást, léptetést, tranzakciós válaszvédelmet és lezárást kell beépíteni. Ezekre épüljön a diákoldali API és a böngészős állapotkezelés. A tanári vezérlősáv és az indítási opció ezekkel együtt váljon elérhetővé. Az általános csempeszínezés külön ellenőrizhető mindhárom módban. A teljes osztályos használat előtt egy rövid, tét nélküli próba járja végig a belépéstől a lezárt eredményig tartó folyamatot.
