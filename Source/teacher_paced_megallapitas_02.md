# Tanári léptetés – A v1.35.1 megvalósításának visszaellenőrzése

**Kiindulás** · Okoskodó v1.35.1, az `a08f19b` commit fölötti munkapéldány · 2026. november 22.

A teljes `npm test` és a nyolc Teacher-Paced integrációs eset sikeresen lefutott. A szervertesztek igazolták többek között az aktív kérdés szerinti mentést, a visszalépéses pótlást, az ismételt beküldés idempotenciáját, az értékelési adatok szűrését és a kétlépcsős lezárást. A tényleges diákoldalon külön, elkülönített Chrome-próbákban három felületi hiba jelent meg. A negyedik megállapítás a meglévő módok visszajelzési alapértékének kódellenőrzéséből származik.

**A kiadás feltétele** a négy tétel célzott lezárása a Tanári léptetés teljes osztályos használata előtt. A javítási terv megtartja a megvalósított kétlépcsős lezárást. A kérdéskör befejezésével a diák összegzést kap, a tanár a végleges lezárásig még adhat részpontot. A négy javításhoz nem szükséges SQLite-sémaváltozás. [Eredeti terv](teacher_paced_terv_01.md) · [Első megállapítások](teacher_paced_megallapitas_01.md) · [Teacher-Paced integrációs tesztek](../scratch/test_teacher_paced.js)

| Tétel | Megfigyelt hatás | Ellenőrzés |
| --- | --- | --- |
| 1. Élő pontfrissítés | A részpont mentése sikeres, a nyitott diákoldali összegzés nem frissül. | Chrome és az eltárolt pont ellenőrzése |
| 2. Ismételt beküldés | A kijelöltnek mutatott opció eltérhet a mentett választól. | Chrome és az eltárolt válasz ellenőrzése |
| 3. Késői válasz vagy hiba | Az előző kérdés hibája az új kérdés beküldőgombját módosíthatja. | Chrome, szabályozott késleltetéssel |
| 4. Visszajelzési alapérték | Az indítóablak felülírja a korábban mentett tantermi beállítást. | Kódellenőrzés |

## 1. A köztes értékelőlap élő pontfrissítése

### Mi történt?

Egy Tanári léptetés dolgozatban a tanár befejezte a kérdéskört, a diák képernyőjén megjelent az összegzés, majd a tanár az egyik válaszra `0,5` pontot adott. Az adatbázisban a `points_earned` mező értéke `0,5` lett. A böngészőben a pontfrissítés eseménye `ReferenceError: currentParticipant is not defined` hibát okozott, így a nyitott összegzés frissítése megszakadt.

A szerver az eredmény sikeres módosítása után `participant:score_updated` eseményt küld a diákok közös szobájába. A kliens a résztvevő ellenőrzéséhez a `currentParticipant` nevet olvassa, amelynek nincs deklarált változója. Ugyanez az azonosító szerepel a már meglévő `participant:kicked` eseménykezelőben is. A résztvevő azonosítását közös, ténylegesen felépített állapotból kell megoldani. [Szerveres pontfrissítés](../src/routes/api.js#L805) · [Diákoldali eseménykezelők](../public/js/student.js#L632) · [Állapot-visszaolvasás](../public/js/student.js#L1511)

### Javasolt javítás

1. **Tarts nyilván hiteles munkamenet- és résztvevőazonosítót.** A sikeres belépési válaszból és a munkamenet visszaállításakor is rögzítsd `participant.id` értékét az aktív munkamenet mellett. A lezárt dolgozat közvetlen visszatöltése is állítsa be ezt, mielőtt az összegzés megnyílik. Kilépéskor, másik felhasználóra vagy munkamenetre váltáskor és érvénytelen munkamenet esetén töröld a régi kötést. Önálló név vagy gépszám alapján ne azonosíts résztvevőt. [Belépés](../public/js/student.js#L1389) · [Visszatöltés](../public/js/student.js#L1456)
2. **A célzott pontfrissítés a résztvevő saját szobájába érkezzen.** A hitelesített diák feliratkozásakor a szerver már csatlakoztatja a kliens socketjét a `participant_${participant.id}` szobához. A mentett módosítás után a pontfrissítési jelzés ezt használhatja, miközben a meglévő tanári és kivetítői összesítés a saját szobájába jut. Az eseményhez elég a `sessionId` és a `participantId`. A kliens mindkettőt egyeztesse, mielőtt állapotot tölt vissza. Pontszámot a hiteles állapotlekérdezés adjon. [Résztvevői szoba](../src/sockets/liveHandler.js#L49)
3. **A frissítést az aktuális nézethez igazítsd.** Tanári léptetés köztes vagy lezárt összegzésében kérd le az új értékelést, és a szerver válaszából frissítsd a részpontot, az összpontot és a kapcsolódó értékelést. Egy korábbi munkamenetből késve megérkező frissítés maradjon hatástalan. A pontfrissítés ne kényszerítse a többi dolgozatmódot a Teacher-Paced összegzés beállításaira. Ugyanaz a résztvevő-azonosítás tegye működőképessé a gépváltási vagy feloldási esemény megfelelő célzását is.
4. **A tárolt módosítás legyen a frissítés feltétele.** Sikertelen felülbírálásnál ne küldj frissítési jelzést. Végleges lezárás után a meglévő módosítástiltás maradjon érvényben. [Pontozási művelet](../src/db/sessionRepo.js#L984) · [Kétlépcsős szerverteszt](../scratch/test_teacher_paced.js#L473)

### Elfogadási próba

- Indíts legalább két diákböngészővel egy rövid Tanári léptetés dolgozatot. Az egyik diák adjon mentett választ. A tanár fejezze be a kérdéskört és ellenőrizze, hogy a munkamenet még javítható.
- Adj az egyik diák válaszára részpontot. A mentett és a már nyitott összegzésben látható pont egyezzen, kézi oldalfrissítés nélkül. A másik diák értékelőlapja maradjon a saját adatainál. A kliens konzoljában ne keletkezzen futásidejű kivétel.
- Ismételd meg közvetlenül az összegzés újranyitása után és a diák visszacsatlakozását követően. Végleges lezárás után a felülbírálás kapjon elutasítást.

## 2. Az ismételt beküldésnél a ténylegesen mentett választ jelenítsd meg

### Mi történt?

A diák az „Alpha” opciót küldte el. A szerver elmentette, a Chrome-próba azonban szándékosan nem adta át az első visszaigazolást a diákoldali kódnak. A diák „Beta” választással újrapróbálkozott. A szerver az idempotens ágban az eredeti mentést adta vissza, az adatbázisban „Alpha” maradt, a képernyőn mégis „Beta” volt kijelölve. Így a kirajzolt csempe és az ahhoz társított értékelés ellentmondhat egymásnak.

A repository már visszaadja a tárolt válaszobjektumot. A HTTP-válaszban az ismétlés jelzője és a tárolt értékelés szerepel, a mentett saját válasz viszont hiányzik. A kliens helyi mentett válaszobjektumát a második kérés `submittedValue` értékéből állítja össze. [Idempotens szerverág](../src/db/sessionRepo.js#L730) · [Beküldési válasz](../src/routes/api.js#L1464) · [Kliensoldali válaszobjektum](../public/js/student.js#L2133)

### Javasolt javítás

1. **Add vissza a saját, ténylegesen tárolt választ.** A `submit-answer` sikeres válaszában egy új, egyértelmű mező, például `submittedAnswer` kapja a `submission.answer.submitted_answer` értékét. Új mentés és idempotens ismétlés ugyanazt a mezőt adja. Ez a diák saját válasza. Kikapcsolt azonnali visszajelzésnél a megoldás, magyarázat, pont és helyesség mezőinek jelenlegi szűrése továbbra is érvényes.
2. **Ugyanebből építsd a helyi állapotot és a megjelenítést.** A Teacher-Paced kliens a szervertől kapott mentett értéket használja a mentett válasz gyorsítótárában, a zárolt csempén vagy szövegmezőben és az azonnali értékelés mellett. ABCD és Igaz/Hamis esetén állítsd vissza a mentett opció kijelölését és az `aria-checked` állapotot. Rövid szöveges válasznál a mentett szöveg kerüljön a zárolt mezőbe. A megjelenítési betűjel csak az adott diák stabil opciósorrendjében képzett felirat.
3. **Hiányos visszaigazolásnál olvasd vissza a szerver állapotát.** Ha ismétlésnél a mentett válasz nem érkezik meg vagy hibás típusú, a Teacher-Paced kliens kérje le az aktuális állapotot. Ha közben a tanár már másik kérdésen áll, a régi válasz frissítése nem állíthatja át az új kérdés kijelölését. Következő tanári visszalépéskor a közös állapotlekérdezés állítsa helyre a régi kérdést. [Válaszellenőrzés](../public/js/student.js#L373) · [Mentett válasz kirajzolása](../public/js/student.js#L1926)
4. **Az ismétlés csak egy mentés maradjon.** A második `200` válasz nem új pontszerzés. A felület a szerver összesítését vagy a kérdéshez tartozó korábbi mentést használja, és ismétléskor ne adjon újra pontot a helyi kijelzéshez.

### Elfogadási próba

1. Valódi böngészővel küldj be egy választ. A tesztkliens a kiszolgálói mentés után ejtse el a visszaigazolást.
2. Ugyanazon a kérdésen válassz másik opciót, és küldd el újra. A válasz legyen idempotens. Az adatbázisban pontosan egy rekord maradjon az első értékkel, és a böngésző ugyanazt az első értéket jelölje.
3. Ismételd meg kikapcsolt azonnali visszajelzéssel. A böngésző mutassa az eredeti saját választ, az értékelés a kapcsoló szerinti időpontig maradjon rejtett.
4. Oldalfrissítés és tanári visszalépés után a megjelölt érték továbbra is egyezzen a mentett rekorddal. Azonos ismétlés után az összpontszám is egyezzen a szerverrel.

## 3. Késői beküldési válasz és hiba hatókörének védelme

### Mi történt?

Az előző kérdés HTTP-beküldése még folyamatban volt, amikor a tanár átlépett a következő kérdésre. A böngésző megjelenítette az új kérdést, melyhez még nem választottam opciót. Ezután az előző HTTP-hívás hálózati hibáját adtam vissza a kliensnek. Az új kérdés „Válasz beküldése” gombja választás nélkül engedélyezett állapotba került. A tényleges új válaszmentéshez a választás ellenőrzése továbbra is szükséges, a hiba a rossz képernyőállapotot és a korábbi kérdéshez tartozó üzenetet okozta.

A sikeres válasz feldolgozásánál már van kérdés- és munkamenet-ellenőrzés. A hálózati kivétel, a JSON-feldolgozási hiba, a HTTP-elutasítás és az érvénytelen válaszszerkezet több ága korábban visszaállítja a közös gombot vagy megjelenít egy üzenetet. A sikeres ág is a hatókör ellenőrzése előtt törli a közös műveletazonosítót. [Beküldés indítása és hibaágak](../public/js/student.js#L1967) · [Sikeres ág hatóköre](../public/js/student.js#L2108)

### Javasolt javítás

1. **Rögzítsd a beküldés kontextusát.** A kérés indításakor jegyezd meg az aktuális munkamenetet, résztvevőt, kérdésazonosítót és azt a felületi állapotot, amelyből a küldés indult. Egy kérdésre visszalépve ugyanaz a kérdésazonosító ismét megjelenhet. Az előző kérdésképernyő és a mostani példány elkülönítéséhez használhatsz egyszerű, növekvő helyi állapotazonosítót. A több HTTP-próbálkozást összekötő diagnosztikai műveletazonosító külön feladatot lát el.
2. **Minden felületi módosítás előtt alkalmazd ugyanazt a hatókör-ellenőrzést.** Ide tartozik a gomb visszakapcsolása, a modal megnyitása, a kijelölés, a fókusz, a pontok és a várakozó sáv frissítése, valamint a műveletazonosító törlése. Az ellenőrzést az aszinkron várakozások után végezd el. Késői eredmény továbbra is naplózható a küldéskor rögzített kérés- és műveletazonosítókkal.
3. **Az eltérő helyzeteket kezeld egyértelműen.** A régi kérdés sikeres mentése az eredeti kérdéshez tartozik. Ha ugyanahhoz a munkamenethez tartozik, a háttérben tárolt kérdésszintű adat frissíthető. A régi kérdés hálózati hibája az új kérdés kijelölését és gombját hagyja a jelenlegi állapotában. Ha a szerver az éppen még látható kérdést `QUESTION_NOT_ACTIVE` kóddal utasítja el, a kliens tájékoztassa a diákot, és kérje le a szerver aktuális állapotát. Ha a felület már továbblépett, a régi hiba ne indítson olyan újrarajzolást, amely eltünteti az új kérdésen tett választást.
4. **Az ismétlés lehetősége a jelenlegi kérdéshez tartozzon.** Az aktuális kérdés valódi, bizonytalan kimenetelű hálózati hibájánál maradjon elérhető a meglévő kézi újrapróbálkozás és ugyanaz a műveletazonosító. Az elavult kérés ne oldja fel egy új kérdés folyamatban lévő beküldésének zárolását. A tanári lezárás és a kérdésváltás eseménye is állapotváltásnak számít.

### Elfogadási próba

| Eset | Elvárt eredmény |
| --- | --- |
| Régi kérés hálózati hibája a következő kérdés megjelenése után | Az új kérdésnél kijelölés nélkül a beküldőgomb letiltva marad. A régi kéréshez tartozó felugró üzenet nem takarja el az új kérdést. |
| Régi HTTP-elutasítás, hibás JSON vagy hibás válaszformátum | Az új kérdés választása, gombja és megjelenése változatlan. |
| Sikeres, későn visszaérkező mentés | A korábban mentett válasz megmarad. Az új kérdés felülete és annak beküldése a saját állapotát követi. |
| A tanár visszalép ugyanarra a kérdésre | A kliens a szerverről visszaolvasott mentést mutatja. Egy korábbi kérdésképernyő késői hibája nem módosíthatja az újrarajzolt nézetet. |
| Az aktuális kérés hibázik, léptetés nélkül | A diák érthető hibajelzést kap, és a kérdésre újra próbálkozhat. |

A sorrendeket tényleges böngészős próbában, a válasz megérkezésének célzott késleltetésével vizsgáld. Az adatbázisban külön ellenőrizd, hogy pontosan azok a válaszok szerepelnek, amelyek mentése véglegesült.

## 4. Az indítóablak a mentett visszajelzési alapértéket használja

### Mi történik a kódban?

Az indítóablak `syncStartQuizTimeLimit()` függvénye feltétel nélkül bekapcsolja az `startShowFeedback` jelölőnégyzetet. Ez a függvény az indítóablak megnyitásakor és tesztválasztáskor is meghívódik. Az indítás minden módhoz explicit `show_feedback_on_end` értéket küld, ezért a szerver csak kihagyott vagy `null` értéknél használható tantermi alapértéke nem érvényesül. A tanár kézi átállítása egy következő tesztválasztáskor is elveszhet. [Indítómezők frissítése](../public/js/admin.js#L1576) · [Tesztválasztás](../public/js/admin.js#L1622) · [Indítási csomag](../public/js/admin.js#L1640) · [Szerveroldali alapérték](../src/db/sessionRepo.js#L275)

### Javasolt javítás

1. **Az indítóablak nyitásakor állítsd be az alapértéket.** Az érvényesen betöltött `classroom_settings.hide_immediate_feedback` fordítottja legyen az „Azonnali visszajelzés” jelölőnégyzet értéke. Ha az alapbeállítás elrejtés, a jelölőnégyzet üresen indul. A globális beállítás és az adott indításra választott érték külön állapot.
2. **A tesztválasztás és a módváltás őrizze meg a tanár választását.** Az időkorlát és a kérdéskeverés frissítése ne állítsa vissza a visszajelzési jelölőt. A Teacher-Paced szerveroldali időkorlát- és sorrendkényszerítés ettől független.
3. **Sikertelen beállításbetöltésnél a szerver alapértéke maradjon érvényes.** Ha a tanár ezen az indításon még nem adott külön értéket, hagyd ki a `show_feedback_on_end` mezőt, vagy add át `null` értékkel a meglévő szerződés szerint. Ha tudatosan átállította, küldj explicit `0` vagy `1` értéket. Egy előre bepipált mező feltételezett értéke ne kerüljön a kérésbe.
4. **Az explicit választás csak az adott indításhoz tartozzon.** A mentett tantermi alapértéket a tanár továbbra is a Beállítások felületén módosíthassa. A Teacher-Paced lezárás utáni értékelés értelmezése maradjon a mód saját szabálya.

### Elfogadási próba

- Kapcsold be az azonnali visszajelzés elrejtését a tantermi beállításokban. Nyisd meg mindkét indítógombbal az ablakot, és ellenőrizd az induló jelölést. Diák-tempó és Űrhajós csapatverseny esetén az érintetlen alapértékkel indított munkamenet továbbra is elrejtett visszajelzéssel induljon.
- Állítsd át a jelölőt az adott indításhoz, válts tesztet és módot, majd indíts. A tényleges kérésben és a tárolt munkamenetben a tanár választása legyen. Következő megnyitáskor a mentett tantermi alapérték jelenjen meg.
- Alkalmazz kontrollált beállításbetöltési hibát. Érintetlen jelölőnél a szerver alapértéke érvényesüljön, kézi választásnál a megadott érték.
- Tanári léptetésben is vizsgáld mindkét visszajelzési állást. Kikapcsolva a diák a kérdéskör befejezéséig ne lásson megoldást vagy pontot.

## Megvalósítás és lezárás

1. **Először a felület és a szerver adatainak egyezését állítsd helyre.** Vezesd be a mentett saját válasz visszaadását, és javítsd az élő pontfrissítés résztvevő-azonosítását. Mindkettő futtatható a meglévő HTTP- és Socket.IO-útvonalakon.
2. **Utána egységesítsd a késői kérések kezelését.** A sikeres és hibás válaszágak ugyanazt az állapotellenőrzést használják. Ezzel együtt ellenőrizd újra az eredeti válasz helyreállítását, amikor közben léptetés érkezik.
3. **Állítsd helyre az indítás visszajelzési alapértékét.** Ez a javítás érinti a korábbi módok indítási viselkedését is, ezért mindhárom módban ellenőrizd.
4. **Futtasd a teljes regressziós csomagot és a fenti célzott böngészős próbákat.** A szervertesztek mellé az élő pontváltozás megjelenését, a mentett és a megjelölt válasz egyezését, a késői hiba elszigetelését és az indítóablak alapértékét külön eredményként rögzítsd. A kétlépcsős lezárás próbája a végleges lezárás utáni módosítástiltást is igazolja. [Meglévő Teacher-Paced tesztek](../scratch/test_teacher_paced.js#L473) · [Teljes tesztfuttató](../scratch/run_all_tests.js)

A négy tétel lezárható, ha mindegyik célzott próba sikeres és a teljes automatizált csomag zöld. Az első teljes osztályos Tanári léptetés próba ezek után tét nélkül, az iskola tényleges hálózatán járja végig az indítást, a léptetést, a visszalépést, az összegzés kiosztását, a részpontadást és a végleges lezárást.
