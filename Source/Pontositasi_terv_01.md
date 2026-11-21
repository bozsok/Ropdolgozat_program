# Pontosítási terv 01 – Helyi diagnosztika

**Kiindulás:** Okoskodó v1.33.0, `614b8cd` · **Dátum:** 2026. november 21.

Ez a dokumentum a végrehajtási terv felülvizsgálatának öt pontosítását rögzíti. Az első a végpont bekötését érinti. A többi a csomagátvétel, a napló értelmezhetősége, a böngészőpuffer és a leállás működési feltételeit rögzíti. A megvalósítás során a dolgozat mentési és értékelési szabályai, valamint a meglévő HTTP-válaszok maradjanak változatlanok. [Beépítési alapterv](Beepitesi_terv_01.md) · [Áttekintett végrehajtási terv](Beepitesi_terv_01_vegrehajtasi_terv_01.md)

## 1. A 8 KiB-os korlát a kérés első feldolgozásakor érvényesüljön

**Megállapítás.** A végrehajtási terv közvetlenül a diagnosztikai API-útvonal elé teszi a szűkebb `express.json()` feldolgozót. A jelenlegi `server.js` azonban az API-router előtt globálisan feldolgozza a JSON-kéréseket. Ha a kérés ezen már átment, a routerhez kapcsolt második feldolgozó átugorja. Így a tervezett 8 KiB-os korlát és a T-06 próba elvárása eltér a tényleges bekötés működésétől. [Végrehajtási terv 5.3/B](Beepitesi_terv_01_vegrehajtasi_terv_01.md#L264) · [Jelenlegi middleware-sorrend](../server.js#L31)

**Átvezetés.** A `POST /api/student/diagnostics/events` egyetlen bekötése kerüljön a globális body parserek elé, például külön, célzottan felcsatolt routerrel. A kérésazonosító middleware ennél a végpontnál is fusson a body parser előtt, hogy a feldolgozási hibához is legyen azonosító. A diagnosztikai útvonal a saját, 8 192 bájtos JSON-keretével dolgozzon. A megszorítást a body parser érvényesítse, majd az alkalmazás ellenőrizze a szerkezetet és a legfeljebb 20 eseményt. Az útvonalhoz tartozó hibaválaszok rögzített kódokat adjanak. A többi API-végpont használja a meglévő feldolgozót.

**Ellenőrzés.** A futó alkalmazáson, érvényes tanulói tokennel vizsgálj határon belüli és 8 192 bájtot meghaladó érvényes JSON-kérést. Az utóbbi adjon `413`-at még a csomagátvétel előtt. Ha a teszt a megengedett méret mellett akarja vizsgálni a 20 eseményes korlátot, a 21 elemű minta férjen bele a bájtkeretbe.

## 2. A `204` a teljes diagnosztikai csomag átvételét jelentse

**Megállapítás.** Az író memóriasora telítődéskor eldobhat eseményeket. A böngésző `204` után törli a kiküldött csomagot. Ha az átvétel eseményenként történik, majd a végpont minden esetben `204`-et küld, a csomag egy része csendben kieshet. Az újrapróbálkozás is elveszhet, ha az esemény azelőtt kerül a deduplikációs nyilvántartásba, hogy helyet kapott volna a sorban. [Végrehajtási terv 5.2](Beepitesi_terv_01_vegrehajtasi_terv_01.md#L195) · [Végrehajtási terv 5.3/B](Beepitesi_terv_01_vegrehajtasi_terv_01.md#L264)

**Átvezetés.**

1. Ellenőrizd a hitelesítést, a végpontra érvényes küldési korlátokat és a teljes csomag sémáját. Csak engedélyezett mezőkből építsd fel a naplórekordot. Az eseménytípust, az okkódot és a mezőhosszakat is ellenőrizd.
2. Vedd ki a deduplikációs időablakban már ismert azonosítókat és a csomagon belüli ismétléseket. A megmaradt rekordoknál számold ki a teljes helyigényt darabban és UTF-8 bájtban, a végleges naplósorok alapján.
3. Egyetlen szinkron memóriaműveletben dönts a teljes csomagról. Ha az összes új sor befér, add hozzá őket, majd jelöld az azonosítóikat ismertnek. Ha nem férnek be, a csomagból egyetlen új sor és azonosító se kerüljön a sorba vagy a deduplikációs nyilvántartásba.
4. `204` akkor jár, ha az összes esemény sorba került vagy már ismert. Ez memóriába történt átvételi igazolás. A lemezre írás későbbi lépés. Telített vagy átmenetileg nem fogadó íróhoz `503` tartozik. A küldési gyakoriság túllépése `429`, a hibás séma `400`, a hibás token `401`, a túlméretes kérés `413`. Kikapcsoláskor a meglévő tervezett `403` és `DIAGNOSTICS_DISABLED` kód érvényes.

Kiindulásnak résztvevőnként 6, rendszerszinten 300 csomag per perc használható, időben elévülő és darabszámban korlátozott memóriás számlálóval. Ezek javasolt kezdőértékek. A várható tantermi létszámmal próbáld ki őket. A számláló kulcsa maradjon memóriában. A korlát kizárólag a diagnosztikai végpontra vonatkozzon.

**Ellenőrzés.** Hozz létre olyan próbahelyzetet, amelyben a csomagból csak néhány sor férne be. Az első küldés adjon `503`-at, a böngésző tartsa meg a csomagot. Felszabadult kapacitásnál ugyanaz a csomag kapjon `204`-et, és az új események egyszer jelenjenek meg. Eközben a tényleges dolgozatbeküldés változatlanul működjön. Külön vizsgáld a `429`-es visszalépést is.

## 3. Különüljön el a mentés, a HTTP-lezárás és a kliens visszaigazolása

| Naplójelzés | Rögzítés feltétele | Jelentése |
| --- | --- | --- |
| `answer.received` | A beküldési handler belépési pontján. | A kérés eljutott a beküldési művelethez. |
| `answer.persisted` | A `sessionRepo.submitAnswer()` sikeres visszatérése után, a mátrixértesítés és a válasz összeállítása előtt. | `saved` új mentésnél. `duplicate`, ha a meglévő választ adta vissza a repository. |
| `http.finished` | A szerverválasz `finish` eseményekor. | A válasz átadása az operációs rendszernek megtörtént. |
| `http.closed_early` | `close` eseménykor, ha előtte nem érkezett `finish`. Kérésenként egy HTTP-végállapot legyen. | A szerveroldali válasz lezárása megszakadt. |
| `answer.acknowledged` | A böngészőben sikeres HTTP-státusz és érvényes, sikeres alkalmazásválasz feldolgozása után. | A kliens a visszaigazolást feldolgozta. |
| `answer.response_error` / `answer.no_ack` | HTTP-hiba vagy végig beérkezett, de érvénytelen válasz esetén `response_error`. Hálózati megszakadás vagy már létező időkorlát miatt használható visszaigazolás nélkül maradt kérésnél `no_ack`. | A böngésző által észlelt eredmény. A mentési állapotot a kapcsolódó szerveresemény mutatja. |

A `httpStatus` mező a ténylegesen kiküldött státuszt tartalmazza. Ha a fejlécek elküldése előtt szakadt meg a kapcsolat, elhagyható. A jelenlegi beküldési végpont a kivételágban `400`-at ad. A tervben szereplő példa kedvéért ne kapjon más HTTP-kódot. A mentés előtti hiba és a már sikeres mentést követő válaszelőkészítési hiba kapjon eltérő diagnosztikai okkódot, például `PERSISTENCE_CALL_FAILED` és `AFTER_PERSISTENCE_FAILED`. Az ismert üzleti elutasításnál használj kódban biztosan azonosítható ágat. A nyers kivételszöveg maradjon ki a diagnosztikai fájlból. [Végrehajtási terv 3.2](Beepitesi_terv_01_vegrehajtasi_terv_01.md#L77) · [Jelenlegi válaszbeküldés](../src/routes/api.js#L1145) · [Node.js válaszesemények](https://nodejs.org/api/http.html#class-httpserverresponse)

**Ellenőrzés.** Normál beküldésnél keresd vissza mindhárom pontot ugyanazzal a kérésazonosítóval. Elveszett visszaigazolásnál az első kérésnél legyen `saved` és kliensoldali `no_ack`. A retry kapjon új `requestId`-t, tartsa meg az `operationId`-t, és adjon `duplicate` eredményt. Az adatbázisban egy válasz maradjon. Érvénytelen JSON válasznál a sikeres HTTP-kód önmagában ne adjon `answer.acknowledged` eseményt.

## 4. A böngészőpuffer élettartama és törlése legyen meghatározott

**Átvezetés.**

- Tartsd meg az 50 eseményes és 32 KiB-os korlátot, és állítsd vissza az alapterv kétórás lejáratát. Betöltéskor és ürítés előtt távolítsd el a lejárt sorokat. Új munkamenetre váltáskor és a naplózás kikapcsolásáról kapott szerverjelzéskor ürítsd a puffert. Oldalfrissítés után a puffer csak azonos munkamenet sikeres helyreállításakor legyen felhasználható.
- Ürítéskor rögzítsd a csomag `eventId`-jait. `204` után kizárólag ezeket töröld. A közben pufferelt események maradjanak meg. Munkamenetváltás vagy kikapcsolás után a korábbi küldés késve érkező eredménye ne módosítsa az új puffer állapotát.
- `429`, `503` és hálózati hiba esetén tartsd meg a még érvényes csomagot, és időzítsd újra. A kapcsolat helyreállása, az időzítő és a normál kérés sikere ugyanazon ürítési folyamatot indítsa. Egyszerre legfeljebb egy feltöltés fusson. Már az összeállításkor számítsd bele a teljes JSON-kérés méretét, a csomag burkolómezőivel együtt. Hibás `400`-as csomagot dobj el. `413` esetén kisebb adagra bontható a csomag, az önmagában is túlméretes eseményt pedig el kell dobni. Érvénytelen hitelesítésnél állítsd le az ürítést a munkamenet újbóli ellenőrzéséig.
- A diák számára látható beküldési hibaüzenetbe kerüljön bele a `requestId` vagy jól kereshető rövid előtagja. Visszaigazolás hiányában jelezze a felület, hogy a mentés eredménye még bizonytalan. A diagnosztikai puffer hibája esetén maradjon használható az eredeti beküldési folyamat.

**Ellenőrzés.** A tényleges `student.js`-t futtató böngészőben ellenőrizd a frissítés utáni helyreállítást, a munkamenetváltást, a két órán túli mintát, valamint azt, hogy egy folyamatban lévő feltöltés közben érkezett új esemény megmarad. Sikertelen beküldésnél a látható azonosító alapján lehessen a kapcsolódó sorokat megkeresni az exportban. [Végrehajtási terv 5.4](Beepitesi_terv_01_vegrehajtasi_terv_01.md#L283) · [Alapterv pufferfeltételei](Beepitesi_terv_01.md#L69) · [A jelenlegi diákoldali hibaág](../public/js/student.js#L1387)

## 5. Naplókönyvtár és szabályos leállás

**Könyvtár.** A `path.resolve()` az útvonal szövegét oldja fel, ezért önmagában nem igazolja a mentésektől és a webkiszolgálástól való elkülönítést. Amikor a kiszolgáló használni kezdi a naplókönyvtárat, ellenőrizd a tényleges célját, Windows alatt a csomópontok és az átirányítások feloldásával együtt. Új mappánál előbb a létező szülő tényleges célját ellenőrizd, majd a létrehozott mappát is. Keresztezés esetén a diagnosztika jelezzen konfigurációs hibát, az alkalmazás folytassa a működést. A mappa legyen külön a statikus webgyökértől és a visszaállítással kezelt állományoktól. A mentés és visszaállítás ellenőrzése terjedjen ki a ténylegesen beállított képtárra és helyreállítási könyvtárra. [Végrehajtási terv 6. fejezet](Beepitesi_terv_01_vegrehajtasi_terv_01.md#L394) · [Képtár visszaállítása](../src/services/backup.js#L273)

**Leállás.** A két jelzés ugyanazt az egyszer végrehajtható leállási folyamatot indítsa. Állítsd le az új kérések fogadását, és a HTTP-, illetve Socket.IO-kapcsolatokat az alkalmazás életciklusához igazítva zárd le. Határidőn belül várd meg az aktív műveleteket. Ezután rögzítsd a leállási állapotot, ürítsd ki a naplóíró sorát, és zárd le a fájlfolyamot. Normál esetben hagyd a folyamatot természetesen kilépni. Határidőn túli megszakításnál a napló vége hiányos lehet, ezért a közvetlen `process.exit(0)` helyett a kilépési viselkedés jelezze, hogy az ürítés nem fejeződött be. [Végrehajtási terv 5.3/A](Beepitesi_terv_01_vegrehajtasi_terv_01.md#L242) · [Node.js folyamatleállítás](https://nodejs.org/api/process.html#processexitcode)

**Ellenőrzés.** Ideiglenes könyvtárakkal vizsgáld a statikus mappába, a képtárba és az oda mutató átirányításon át megadott célokat. A normál mentésbe ne kerüljön napló, és a visszaállítás hagyja érintetlenül a külön naplómappát. Leállítási próbában legyen egyszerre aktív beküldés és várakozó diagnosztikai esemény. Ellenőrizd a válasz megőrzését, a naplófájl rendezett lezárását és azt is, hogy az író hibája vagy várakozása esetén a leállás a megadott határidőn belül befejeződik.

## Átvezetési és elfogadási sorrend

1. Módosítsd a végrehajtási terv 5.3/B pontjában a végpont bekötését, majd az 5.2 és 5.3 pontban vezesd át a teljes csomagra vonatkozó átvételt és az események jelentését.
2. Egészítsd ki az 5.4 pontban a puffer életciklusát és a tanárnak megadható azonosítót. A leállás sorrendje az 5.3/A, a tényleges naplóútvonal ellenőrzése a 6. fejezet része legyen.
3. A meglevő T-01–T-06 tesztkeretet tartsd meg. A T-01–T-04 legalább egy futtatása használja a tényleges diákoldali JavaScriptet. A szerveres integrációs teszt továbbra is alkalmas a hitelesítés, a méretkorlát és a mentési eredmény gyors ellenőrzésére. A T-05-ben szerepeljen a részcsomagra elég kapacitás és a helyes `503`, a T-06-ban a kérés feldolgozásakor érvényesített `413`. [Végrehajtási terv 7. fejezet](Beepitesi_terv_01_vegrehajtasi_terv_01.md#L409)
4. Az első teljes osztályos próbához az exportból legyen megkülönböztethető a normál mentés, a szerverig el sem jutó kérés és a mentés után elveszett visszaigazolás. A célzott próbák mellett fusson le az `npm test`, és naplózási hiba mellett is végig lehessen vinni a mintadolgozatot.
