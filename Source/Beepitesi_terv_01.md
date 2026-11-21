# Beépítési terv 01 – Helyi diagnosztika a tantermi próbához

**Kiindulás:** Okoskodó v1.33.0, `614b8cd` · **Dátum:** 2026. november 21.

## 1. Cél és az első kiadás határa

Egy próba után a tanár egy helyi fájlból vissza tudja keresni, hogy egy beküldés eljutott-e a kiszolgálóhoz, mi történt a mentésével, feldolgozta-e a böngésző a visszaigazolást, és mi derült ki az újrapróbálkozáskor. Emellett látható legyen az egyszerre jelentkező kapcsolati hibák, lassulások és szerverújraindulások időrendje. Ehhez három elem kell: kiszolgálói fájlnapló, korlátozott diákoldali eseménypuffer és tanári export.

Az első kiadás hagyja meg a dolgozat küldési, értékelési, újrapróbálkozási és lezárási szabályait. A diagnosztika külön kapcsolóval álljon le, SQLite-sémaváltás nélkül. Próbához tudatosan kapcsold be. A kliens a friss, sikeres szerverválaszból ismerje meg a kapcsoló állapotát, például a sikeres csatlakozás vagy munkamenet-visszatöltés válaszának egy új, opcionális `diagnosticsEnabled` mezőjéből. A kikapcsolás szerveroldalon azonnal tiltsa a további gyűjtést a beállítás alkalmazásakor. Már nyitott kliens a következő kiszolgálói jelzésig helyben gyűjthet, ezért a puffer élettartama is legyen korlátozott.

## 2. Beépítési pontok

| Fájl | Feladat |
| --- | --- |
| [config.js](../config.js#L19) | `DIAGNOSTICS_ENABLED` és opcionális `DIAGNOSTICS_DIR` beolvasása. Az alapértelmezett könyvtár helyi, külön diagnosztikai mappa. |
| [src/services/backup.js](../src/services/backup.js#L13) | Ellenőrizd, hogy a diagnosztikai mappa az exportált és visszaállított adatbázis, illetve képtár útvonalain kívül marad. |
| Új `src/services/diagnostics.js` | Eseményséma, sorba állítás, aszinkron írás, forgatás, állapot és biztonságos export előkészítése. |
| [server.js](../server.js#L26) | Logger előkészítése a kiszolgáló indulásakor. Célzott HTTP műveletek, indulási esemény, globális hibakezelés és a meglévő leállási folyamatba illesztett naplóürítés. |
| [src/routes/api.js](../src/routes/api.js#L1145) | A válaszbeküldés pontjain szerveres események. Új kliensesemény-fogadó és tanári export végpont. |
| [src/db/sessionRepo.js](../src/db/sessionRepo.js#L892) | A meglévő mentési és duplikációkezelési határ referenciája. A router a `submitAnswer()` visszatérése után naplózza az eredményt. |
| [public/js/student.js](../public/js/student.js#L289) | Kapcsolati események, korrelációs azonosító, válasz-visszaigazolás és háttérben ürülő kis puffer. Külön modulba tehető, ha így önállóan tesztelhető. |
| [public/admin.html](../public/admin.html#L710) és [public/js/admin.js](../public/js/admin.js) | A Beállítások alatt diagnosztikai állapot és letöltés. |
| [scratch/run_all_tests.js](../scratch/run_all_tests.js) | A célzott tesztfájl bekötése saját ideiglenes adatbázissal, képtárral és naplókönyvtárral. |

## 3. Események és azonosítók

Egy JSON-objektum kerüljön minden sorba. A naplózó építsen fel új objektumot az engedélyezett mezőkből. A kérés, a nyers hibaobjektum és a kliensobjektum teljes átmásolása érzékeny mezőket és korlátlan szöveget juttathatna a fájlba. A megengedett értékeket, hosszhatárokat és típusokat közös sémában rögzítsd. [OWASP eseménymezők és kizárandó adatok](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#event-attributes)

| Mező | Tartalom |
| --- | --- |
| `schemaVersion`, `appVersion` | Az eseményséma külön verziója és a futó csomag verziója. |
| `receivedAt`, `clientAt` | Szerver által adott UTC idő ISO 8601 formátumban, illetve opcionális kliensidő. A kliensóra tájékoztató adat. |
| `runId`, `source`, `event` | Indulásonként új szerverazonosító, `server` vagy `student_browser`, valamint zárt eseménynévlista. |
| `route` | Opcionális, rögzített útvonalnév, például `student.submit_answer` vagy `admin.finish_session`. |
| `requestId`, `operationId` | Az adott HTTP-próbálkozás azonosítója, illetve ugyanazon felhasználói beküldés ismétléseit összekötő azonosító. A kapcsolódó mezők eseményenként opcionálisak. |
| `eventId` | Klienseseményenként külön azonosító. Ugyanaz marad a diagnosztikai csomag újraküldésekor. |
| `outcome`, `reasonCode`, `httpStatus`, `durationMs` | Rögzített kódkészlet és releváns numerikus értékek. Az időtartamot monoton órával mérd. A szerver a saját státuszkódját maga állapítsa meg. |

Az azonosítók 16 véletlen bájtból képzett, 32 karakteres kisbetűs hexasztringek legyenek. A böngészőben a helyi hálózati HTTP-címen is használható `crypto.getRandomValues()` alkalmas erre. Ha a generálás hibázik, maga a dolgozatbeküldés így is induljon el. A szerver kizárólag a pontos formátumú értéket fogadja el, hiányzó vagy érvénytelen kérésazonosítóhoz sajátot generál, és a választ `X-Request-Id` fejlécben adja vissza. Ezek az értékek korrelációra szolgálnak. A jogosultságot és az ismételt válaszok kezelését a meglévő mechanizmusok adják. [Web Cryptography szabvány](https://w3c.github.io/webcrypto/#Crypto-method-getRandomValues)

```json
{"schemaVersion":1,"appVersion":"1.33.0","receivedAt":"2026-11-21T09:15:03.123Z","runId":"7aa81f435c364d0c9075724d1b76f429","source":"server","event":"answer.persisted","requestId":"b74fea09cec6469db118aafa04b02f31","operationId":"53dbf333f6cc4e95a674d24fb3f18290","outcome":"saved","durationMs":24}
```

### 3.1 Szerveroldali események

- **`server.started` és `server.stopping`.** Az első a sikeres portnyitáskor készüljön, a második szabályos leálláskor, ha van alkalom rögzíteni. A váratlan folyamatleállásnál hiányozhat a lezáró sor. Új `runId` jelzi a következő indulást. Az indítást megakadályozó, nagyon korai hibákhoz maradjon elérhető az indítófolyamat szokásos hibanaplója is.
- **`answer.received`.** A beküldési útvonal elején, a hitelesítés előtt. A token, kérdésazonosító és a teljes body kihagyandó. Ha a JSON-feldolgozás már korábban elutasította a kérést, az a HTTP-szintű eseményben jelenhet meg.
- **`answer.persisted`.** Közvetlenül a `sessionRepo.submitAnswer()` sikeres visszatérése után, a mátrixértesítés és a válasz összeállítása előtt. `saved` új mentésnél, `duplicate` a meglévő `alreadySubmitted` eredménynél. A beszúrás SQL-sora önmagában kevés ehhez, mert a tranzakció további műveletei még hibázhatnak.
- **`answer.rejected` és `answer.failed`.** Az ismert elutasítási ágakhoz saját rögzített kódot adj, például `TOKEN_MISSING`, `PARTICIPANT_UNKNOWN`, `QUESTION_ID_MISSING`. A kivételnél különböztesd meg a mentési hívás hibáját a sikeres mentést követő válasz-előkészítési hibától. Besorolhatatlan kivételhez használj semleges kódot. A hibaüzenet szabad szövegéből történő besorolás törékeny.
- **`http.finished` és `http.closed_early`.** A kiválasztott útvonalakhoz rögzíts időtartamot és HTTP-státuszt, amikor értelmezhető. Egy kéréshez egy végállapot készüljön. A `finish` kiszolgálói esemény a válasz átadását jelzi az operációs rendszernek. A böngésző általi feldolgozáshoz kliensesemény kell. A `close` eseményt akkor kezeld idő előtti zárásként, ha `finish` addig nem történt. [Node.js HTTP-válasz eseményei](https://nodejs.org/api/http.html#class-httpserverresponse)
- **Dolgozatműveletek.** Az első körben a tanári indítás, Space Race rajt, lezárás, a diák csatlakozása és az eredményexport kapjon HTTP-szintű eredmény- és időtartam-naplózást. Rögzített útvonalnév kerüljön a fájlba konkrét URL és query string helyett. A sikeres mentés külön jelzése elsősorban a válaszbeküldésnél szükséges. [Tanári útvonalak](../src/routes/api.js#L607) · [Diákcsatlakozás](../src/routes/api.js#L910) · [Eredményexport](../src/routes/api.js#L1247)

### 3.2 Böngészőoldali események

- **`answer.acknowledged`**, ha a böngésző érvényes sikeres választ feldolgozott. Elegendő az eredménykód és a két korrelációs azonosító. A helyes megoldást, a diák válaszát és a pontot hagyd ki.
- **`answer.response_error`**, ha HTTP-hibát vagy feldolgozhatatlan választ kapott. **`answer.no_ack`**, ha a hálózati hívás visszaigazolás nélkül fejeződött be. A böngésző a `no_ack` alapján csak a saját állapotát ismeri.
- **`socket.disconnected`, `socket.reconnected`, `socket.connect_error`**. Újracsatlakozást csak korábbi sikeres kapcsolat után jelölj. A kliensoldali ok legyen zárt értékkészletből választva. Egy hibasorozatban vond össze az ismétlődő jelzéseket. Az újracsatlakozás és a dolgozatállapot tényleges helyreállása eltérő esemény. A naplózás bekötése hagyja meg a meglévő alkalmazáslogikát. [Jelenlegi kliensoldali kapcsolati kezelés](../public/js/student.js#L289) · [Socket.IO kapcsolatvesztés](https://socket.io/docs/v4/tutorial/handling-disconnections)

Az első küldéshez készüljön egy `operationId`. Minden próbálkozás külön `requestId`-t kapjon. A kliens adja át őket az `X-Operation-Id` és az `X-Request-Id` fejlécekben. Visszaigazolás nélküli hibánál a meglévő kézi újrapróbálkozás használja ugyanazt a műveletazonosítót, amíg ugyanaz az aktív kérdés van a képernyőn. Egyértelmű válasz, kérdésváltás, munkamenetváltás vagy befejezés zárja le a műveletet. Az aktív műveletazonosító tartható memóriában. Oldalfrissítés után az új kattintás külön műveletként jelenhet meg. Ha a felület a hiba mellett rövid azonosítót jelenít meg, egyező előtag esetén az időpont és a nézet segít a találatok szűkítésében. Az exportban a teljes azonosító szerepeljen.

## 4. Fájlírás, megőrzés és hibakezelés

1. **Tárolás.** Alapértelmezésként javasolt a `data/diagnostics/` könyvtár. Ellenőrizd a feloldott elérési utat és létező könyvtárnál a tényleges célját. A mappa kerüljön a statikus webgyökéren, a képtáron és a mentésből visszaállított útvonalakon kívül. Add a `.gitignore`-hoz. A fájlokat csak a kiszolgálót futtató fiók és a kijelölt gépkezelők érhessék el az operációs rendszeren.
2. **Írás.** Egy szerverfolyamaton belül egyetlen aszinkron író kezelje a sorrendet és a fájlcserét. A dolgozat útvonala csak a memóriasorba helyezze az eseményt. Kerüld a szinkron fájlírást és az eseményenkénti lemezre kényszerítést. A sor első korlátja lehet 2 048 esemény vagy 2 MiB, amelyiket előbb eléri. Telítődéskor az új diagnosztikai esemény eldobható, számlálható, és a tanári állapot jelezze a hiányos gyűjtést. Stream használatakor a `write()` jelzése és a `drain` szabályozza a további ürítést. [Node.js Writable stream](https://nodejs.org/api/stream.html#class-streamwritable)
3. **Forgatás.** Kiindulásnak UTC-napváltás vagy 5 MiB fájlméret, legfeljebb 7 napos megőrzés és 25 MiB összméret. Az író csak a saját, szigorú névmintájú naplófájljait forgassa és törölje. Induláskor és forgatáskor alkalmazd a korlátokat. Egy aktív naplókönyvtárhoz egy író tartozzon. Párhuzamos tesztpéldányok külön könyvtárat kapjanak.
4. **Lemezhiba és leállás.** Íráshibánál adj ritkított, rögzített szövegű konzoljelzést, és jelöld a diagnosztikát korlátozottként. A helyreállítást ritkított próbálkozással ellenőrizd. A dolgozat normál útvonala közben folytatódjon. Szabályos leálláskor adj rövid, például két másodperces ürítési időt. A hirtelen áramkimaradásnál elveszhet a sor vége. A napló diagnosztikai segítség, a válasz mentésének végső ellenőrzését az alkalmazás adatbázisa adja. [OWASP naplózási hibák ellenőrzése](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#verification)

## 5. Klienspuffer és fogadó végpont

1. **Puffer.** Fülenkénti `sessionStorage`, hibánál memóriás puffer. Kiindulásként legfeljebb 50 esemény, 32 KiB és két óra, a legrégebbi elem essen ki először. A puffer átvészelheti az oldal frissítését. Ürítsd a munkamenet váltásakor és a diagnosztika kikapcsolásáról kapott jelzéskor. A tárolás kizárólag a 3. fejezet engedélyezett mezőit kezelje. A hitelesítési tokent a meglévő alkalmazásállapotból vedd a küldéshez, és ne másold a pufferbe.
2. **Útvonal.** `POST /api/student/diagnostics/events`, legfeljebb 20 eseménnyel és 8 KiB kérésmérettel. Az alkalmazás globális JSON-feldolgozója a router előtt fut, ezért a célzott méretkorlátot előtte vagy külön, korábban felcsatolt routerben érvényesítsd. A tanulói tokent a meglévő résztvevő-ellenőrzéssel validáld. A tokent, tanulói azonosítót és a kliens IP-címét hagyd ki a diagnosztikai fájlból. A kliensből származó eseményeket kötelezően kliensforrásként jelöld. A még nem hitelesített diákoldali hibákhoz az első körben a tanár feljegyzése és a szerver csatlakozási naplója ad támpontot. [Middleware-sorrend](../server.js#L26) · [Meglévő tanulói tokenellenőrzés](../src/routes/api.js#L1145)
3. **Korlát és válasz.** A szerver ellenőrizze a típusokat, a mezőlistát és a kódértékeket, valamint alkalmazzon résztvevőnkénti és globális, korlátozott méretű memóriás küldési korlátot. `204` csak akkor, ha a teljes csomagot átvette a korlátozott sor, vagy az eseményei már ismertek. Ez átvételi jelzés, a lemezre írás később történik. Hibás formátum `400`, túl nagy csomag `413`, érvénytelen token `401`, túl gyakori kérés `429`, átmenetileg nem fogadott csomag `503`. Kikapcsolt gyűjtéshez használj dokumentált `403` választ és rögzített `DIAGNOSTICS_DISABLED` kódot.
4. **Ürítés és ismétlés.** Egyszerre egy küldés fusson a háttérben. Indítsd meg visszacsatlakozáskor és időnként sikeres normál kérés után. Hálózati hiba, `429` vagy `503` esetén használj növekvő késleltetést kis véletlen eltéréssel, plafonnal, és tartsd meg a csomagot. `204` után csak a visszaigazolt csomag elemeit vedd ki. A végleg elutasított hibás csomagot dobd el, a kliens tárhelyét pedig ürítsd a letiltás jelzésére. A szerver korlátozott időablakban és memóriában szűrje az ismételt `eventId`-kat. Újraindítás után maradhat ismételt naplósor, ezért visszakereséskor is legyen azonosítható.

## 6. Tanári export és adatminimalizálás

- A **Beállítások → Diagnosztika** mutassa a gyűjtés állapotát, az aktuális szerverindulás idejét, az eldobott események számát és a letöltés gombját. Az állapot és a letöltés ugyanazt a `requireAdminAuth` védelmet használja, mint a mentés. Adj `Cache-Control: no-store` fejlécet a válaszokhoz. [Tanári hitelesítés](../src/middleware/auth.js#L43) · [Meglévő mentési végpont](../src/routes/api.js#L1281)
- Javasolt külön végpontok `GET /api/admin/diagnostics/status` és `GET /api/admin/diagnostics/export`. Az export fix, például az utolsó 24 órát lefedő, méretkorlátos JSONL-pillantkép legyen. Az aktív fájlnál csak teljes sorok kerüljenek a mentésbe. A fájlnevet a szerver állítsa elő. A kliens ne adhasson meg fájlnevet vagy elérési utat. Kikapcsolt gyűjtés mellett a meglévő naplók a megőrzési időn belül továbbra is exportálhatók a tanárnak.
- A naplóban nincs szükség diáknevekre, osztálynévre, diák- és résztvevőazonosítókra, válaszokra, megoldásokra, pontokra, PIN-re, sütire, tokenre, nyers fejlécekre, teljes URL-re vagy nyers hibaveremre. A letöltés helyi kezelést igényel. Ha egy hibát továbbadnak, az érintett időablak és események kivonata legyen az első választás. A rövid megőrzés és a helyi hozzáférés-korlátozás az exportált példányoknál is fontos. [OWASP kizárandó adatok](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#data-to-exclude)

## 7. Kivitelezési sorrend és elfogadási próbák

1. **Szervernapló és alapkorreláció.** Készítsd el az eseménysémát és az írót. Kösd be a beküldés szerveres pontjait és az indulási eseményt. A mentés utáni naplóbejegyzés a tényleges tranzakciós eredményt kövesse.
2. **Böngésző és fogadó végpont.** Kösd össze a beküldési azonosítókat, majd végezd el a puffer, a korlátok és a hitelesítés tesztelését. Az új próba közben figyeld meg, hogy a normál dolgozatkezelés azonos eredményt ad bekapcsolt és kikapcsolt gyűjtéssel.
3. **Tanári export és tantermi próba.** Először néhány tesztgéppel, majd tét nélküli, teljes létszámú próbán használd. Futtasd az `npm test` csomagot a célzott integrációs tesztekkel együtt. A próbához használt adatbázis, a képtár és a naplófájlok külön mappába kerüljenek.

| Próba | Elfogadási feltétel |
| --- | --- |
| Normál beküldés | Az exportban azonos a szerver és a böngésző kérésazonosítója. A mentés és a kliens által feldolgozott sikeres válasz is visszakereshető. |
| Kérés elakad még a szerver előtt | Az elkülönített próbakliens blokkolja a kérést, majd helyreállítja a kapcsolatot. A kliensesemény megjelenik, az adott kéréshez nincs szerveres fogadási vagy mentési sor. Az ellenőrzés a tesztállományban a válasz hiányát is igazolja. |
| Mentés után elvész az első visszaigazolás | Tesztkliens vagy tesztproxy a valódi kiszolgálói művelet után eldobja a választ. Az első próbálkozásnál látszik a mentés és a kliens `no_ack` eseménye. Az újrapróbálkozás új kérésazonosítót kap, azonos műveletazonosítóval. A meglévő válasz ismétlésként jelenik meg, és az adatbázisban egyetlen válasz marad. |
| Megszakítás és visszatérés | A rövid kapcsolatvesztés és a visszacsatlakozás visszakereshető. A puffer később ürül, a diagnosztikai csomag ismétlése a deduplikációs időablakon belül nem sokszorozza meg a sorokat. |
| Lemez- és tárhelyhiba | Nem írható könyvtár, megtelt memóriasor vagy tiltott kliensoldali tárolás mellett is sikerül a normál beküldés és a dolgozat lezárása. A tanár láthatja, ha a kiszolgálói napló hiányos. |
| Adatvédelem és korlát | Tanári hitelesítés nélkül az export elutasított. Túllépett méret, túl sok esemény és ismeretlen mező kezelése determinisztikus. A vizsgálathoz adott jelölőszövegek, teszt-PIN, token és válasz szövege hiányzik a fájlból és az exportból. A forgatás és a megőrzés tesztje csak az ideiglenes könyvtár naplófájljait érinti. |

## 8. Hogyan olvasd az első próba naplóját?

1. A tanár jegyezze fel az időpontot, az érintett nézetet, a műveletet és a kijelzett hibakódot vagy kérésazonosítót. A diagnosztikai exportot érdemes közvetlenül a próba után lementeni.
2. Keresd ki a `requestId` alapján az adott próbálkozást, majd az `operationId` alapján a hozzá tartozó ismétléseket. Ha van `answer.persisted` és utána `answer.no_ack`, a mentés megtörtént, miközben a böngésző nem tudta visszaigazolni. Ha csak kliensesemény van, vizsgáld meg a napló állapotát és a szerverindulásokat is. A szerveres sor hiánya hiányos napló mellett bizonytalan eredmény.
3. Több, egy időben megjelenő kapcsolatvesztésnél vizsgáld a hálózatot és a tanári gép állapotát. Lassulásnál vesd össze a szerver- és kliensoldali időtartamokat. Új `runId` esetén nézd meg, történt-e újraindítás az érintett időablakban.

Az első kiadás akkor kész a teljes osztályos próbára, ha a fenti három beküldési eset a tanári exportból értelmezhető, a normál válaszmentési tesztek sikeresek, és a napló kikapcsolt vagy hibás állapotában is végigvihető egy teljes mintadolgozat.
