# Beépítési terv 01 – Részletes végrehajtási terv (v1.2)
**Helyi diagnosztika és eseménynaplózás megvalósítása a tantermi próbához**

- **Dokumentum azonosítója:** `Source/Beepitesi_terv_01_vegrehajtasi_terv_01.md`
- **Kapcsolódó alapterv:** [Source/Beepitesi_terv_01.md](Beepitesi_terv_01.md)
- **Kapcsolódó pontosítási terv:** [Source/Pontositasi_terv_01.md](Pontositasi_terv_01.md)
- **Kiindulási állapot:** Okoskodó `v1.33.0` (commit: `614b8cd`)
- **Dátum:** 2026. november 21.
- **Készítette:** Rendszerfejlesztő (Antigravity) a felülvizsgálat és pontosítások teljes átvezetésével

---

## 1. Bevezetés és az alrendszer célkitűzése

A tantermi próba során előfordulhatnak olyan hálózati mikromegszakadások, lassulások vagy böngészőoldali rendellenességek, amelyek megzavarhatják a dolgozatírást. A tanárnak jelenleg nincs közvetlen eszköze arra, hogy utólag rekonstruálja:
1. Egy tanulói válaszbeküldés eljutott-e a szerverhez?
2. Megtörtént-e a válasz adatbázisba mentése a szerveroldali tranzakcióban?
3. Megkapta és sikeresen feldolgozta-e a tanulói böngésző a válasz-visszaigazolást?
4. Történt-e újrapróbálkozás, és az hogyan zárult?
5. Volt-e szerveroldali újraindulás vagy tömeges Socket.io kapcsolatbontás a kérdéses időablakban?

A végrehajtási terv a helyi diagnosztika kiszolgálói naplózását, böngészőoldali gyűjtését és tanári exportját írja le.

### 1.1. Alapvető tervezési garanciák
* **Adatbázis-séma érintetlensége:** Az alrendszer **nem igényel semmilyen SQLite sémamódosítást**, új táblát vagy migrációt. A működés 100%-ban független az alkalmazás relációs adatbázisától (`ropdolgozat.db`).
* **Kikapcsolhatóság (Opt-in működés):** A funkció alapértelmezetten vagy konfiguráció alapján (`config.diagnosticsEnabled = false`) teljesen lekapcsolható. Kikapcsolt állapotban semmilyen memóriapuffer vagy háttérfolyamat nem terheli a rendszert.
* **A dolgozatmenettől független fájlírás.** A beküldés és a csatlakozás korlátozott memóriasorba továbbítja az eseményt. A lemezíró aszinkron fut. Telített sor vagy íráshiba esetén a diagnosztika korlátozott állapotot jelez, a dolgozatművelet saját eredményét adja vissza.
* **Szigorú adatminimalizálás (OWASP Logging Cheat Sheet):** A naplóba **tilos bármilyen személyes vagy tanulmányi adatot menteni**. Diáknevek, osztályok, egyedi adatbázis-azonosítók (`student_id`, `participant_id`), tokenek, jelszavak, beadott válaszok szövege és pontszámok soha nem kerülhetnek a fájlba.

---

## 2. Érintett komponensek és beépítési térkép

Az alábbi táblázat tételesen összefoglalja a diagnosztikai alrendszer által érintett és újonnan létrehozandó fájlokat:

| Fájl | Típus | Felelősség és tervezett beépítési feladat |
| --- | --- | --- |
| `config.js` | Módosítás | `DIAGNOSTICS_ENABLED` (alapértelmezetten `false`), `DIAGNOSTICS_DIR` (alapértelmezetten `data/diagnostics`), puffer-, rotációs és sebességkorlátok beolvasása környezeti változókból. |
| `.gitignore` | Módosítás | `data/diagnostics/` mappa felvétele a kizárt állományok közé. |
| `src/services/diagnostics.js` | **Új fájl** | Központi diagnosztikai szerviz: eseményséma validálás, memóriasor (`RingBufferQueue`), aszinkron `WritableStream` író, atomi csomagátvétel (`204` vs. `503`), sebességkorlátozás (`429`), napi és méretalapú rotáció, takarítás, deduplikációs cache, állapotlekérdezés és exportáló adatfolyam. |
| `src/services/backup.js` | Módosítás / Ellenőrzés | Garantálni, hogy a `createSystemBackupStream()` és az adatbázis-visszaállítás fizikai elérési út szintjén sem érinti a `data/diagnostics/` könyvtárat. |
| `server.js` | Módosítás | Kiszolgáló indulásakor a logger inicializálása, `runId` generálás, `server.started` esemény, kérésazonosító middleware (`X-Request-Id`), **a 8 KiB-os diagnosztikai JSON parser korai felcsatolása a globális body parserek elé**, majd az aktív műveletek és a naplóíró összehangolt leállítása. |
| `src/routes/api.js` | Módosítás | 1. Korrelációs események beillesztése a `submit-answer` végpontba (`answer.received`, `answer.persisted`, `answer.rejected`, `answer.failed`) az eredeti HTTP 400-as válaszkód és finomított belső okkódok megtartásával.<br>2. `diagnosticsEnabled` állapot átadása a `student/join` és `student/session-data` válaszokban.<br>3. Új tanári végpontok: `GET /api/admin/diagnostics/status` és `GET /api/admin/diagnostics/export`. |
| `public/js/student.js` | Módosítás | Kliensoldali eseménymodul integrálása: `operationId` és `requestId` generálása (`crypto.getRandomValues`), `sessionStorage` alapú körpuffer (max. 50 esemény / 32 KiB / 2 órás TTL), Socket.io és fetch események elfogása, atomi ürítés (204 esetén csak az elküldött `eventId`-k törlése), háttérbeli szinkronizáció exponenciális visszalépéssel és jitterrel, Calm hibaablak kiegészítése a `requestId` előtagjával és a bizonytalan mentés jelzésével. |
| `public/admin.html` | Módosítás | Új "Rendszerdiagnosztika és eseménynapló" kártya beépítése a Beállítások fülre (`tab-backup`), állapotjelző badge-dzsel, indítási idővel, eldobott események számlálójával és letöltési gombbal. |
| `public/js/admin.js` | Módosítás | Diagnosztikai állapot aszinkron lekérése (`loadDiagnosticsStatus`), felületi elemek frissítése, közvetlen JSONL letöltés kezelése. |
| `scratch/test_diagnostics.js` | **Új fájl** | A 7. fejezet automatizálható ellenőrzései elszigetelt ideiglenes könyvtárban. A böngészős eseteket a 7. fejezetben megadott módon kell igazolni. |
| `scratch/run_all_tests.js` | Módosítás | `scratch/test_diagnostics.js` futtatásának bekötése a teljes regressziós csomagba. |

---

## 3. Adatmodellek, Eseménysémák és OWASP Adatminimalizálás

A naplófájl formátuma szigorúan **JSON Lines (JSONL)**: minden sor egyetlen, önálló, érvényes JSON objektum, amelyet soremelés (`\n`) zár le.

### 3.1. Eseményrekord kötelező és opcionális mezői

```typescript
interface DiagnosticLogEntry {
  schemaVersion: number;       // Fix: 1 (sémaverzió a jövőbeli kompatibilitáshoz)
  appVersion: string;          // Pl.: "1.33.0"
  receivedAt: string;          // Szerveroldali UTC időbélyeg (ISO 8601, pl. "2026-11-21T09:15:03.123Z")
  clientAt?: string;           // Kliensoldali tájékoztató jellegű UTC időbélyeg (csak ha forrás = student_browser)
  runId: string;               // Szerverpéldány egyedi azonosítója (32 hex karakter)
  source: 'server' | 'student_browser'; // Az esemény eredete
  event: string;               // Zárt eseménykód (pl. "answer.persisted", "socket.disconnected")
  route?: string;              // Rögzített útvonal-azonosító (pl. "student.submit_answer", "student.join")
  requestId?: string;          // Adott HTTP kísérlet azonosítója (32 hex karakter)
  operationId?: string;        // Felhasználói művelet azonosítója (ugyanazon válasz retry kísérleteit köti össze)
  eventId?: string;            // Kliensesemény globális egyedi azonosítója (32 hex karakter)
  outcome?: string;            // Zárt kimeneteli kód (pl. "saved", "duplicate", "ok", "error", "no_ack")
  reasonCode?: string;         // Strukturált hibakód (pl. "PERSISTENCE_CALL_FAILED", "TOKEN_MISSING", "TIMEOUT")
  httpStatus?: number;         // HTTP válaszkód (pl. 200, 204, 400, 401, 403, 404, 413, 429, 500, 503)
  durationMs?: number;         // Monoton órával mért szerveroldali vagy hálózati futási idő (egész ezredmásodperc)
}
```

### 3.2. Megengedett események és értékkészletek (Zárt szótár)

A naplózó réteg kizárólag az alábbi zárt szótárból fogad el eseményeket és kódokat; minden egyéb ismeretlen mezőt és eseményt a sémaellenőrző azonnal eldob:

#### 1. Szerveroldali események (`source: "server"`)
- `server.started`: A Node.js HTTP szerver sikeres portnyitásakor (`runId`).
- `server.stopping`: Az aktív műveletek lezárása után, közvetlenül a napló ürítése előtt. Határidőre kényszerített lezárásnál külön rögzített okkód jelöli a körülményt.
- `answer.received`: Bejövő `POST /api/student/submit-answer` kérés belépési pontján (még a hitelesítés és adategyeztetés előtt).
- `answer.persisted`: A `sessionRepo.submitAnswer()` tranzakció sikeres lefutása után, a mátrixértesítés és a kliensválasz összeállítása előtt.
  - `outcome: "saved"`: Új válaszrekord sikeresen mentve.
  - `outcome: "duplicate"`: A válasz már korábban rögzítve volt (`alreadySubmitted: true`).
- `answer.rejected`: A kérés strukturált üzleti elutasításakor.
  - `reasonCode`: `TOKEN_MISSING`, `QUESTION_ID_MISSING`, `PARTICIPANT_UNKNOWN`, valamint biztosan azonosítható üzleti ágaknál `SESSION_INACTIVE` és `DEADLINE_EXCEEDED`. A tényleges HTTP-státusz külön mező, a lezárás és a határidő jelenlegi elutasítása a beküldési végponton `400`.
- `answer.failed`: A beküldési útvonal kivételkezelőjében (`catch` ág).
  - `reasonCode: "PERSISTENCE_CALL_FAILED"`: Ha maga a `submitAnswer()` adatbázishívás dobott hibát.
  - `reasonCode: "AFTER_PERSISTENCE_FAILED"`: Ha a mentés sikeres volt, de a válasz előkészítése (pl. `getSessionById`, mátrix broadcast) hibásodott meg.
  - `httpStatus`: Szigorúan megőrzi az alkalmazás meglévő HTTP státuszkódját (400).
- `http.finished`: A szerverválasz `finish` eseményekor, jelezve a válasz átadását az operációs rendszer hálózati rétegének (`durationMs`, `httpStatus`).
- `http.closed_early`: A szerverkapcsolat `close` eseményekor, ha előtte nem futott le `finish` (idő előtti kliensoldali kapcsolatbontás). Kérésenként szigorúan egy HTTP végállapot jön létre.

#### 2. Kliensoldali események (`source: "student_browser"`)
- `answer.acknowledged`: A böngésző sikeres HTTP státuszt kapott, és az érvényes, sikeres JSON választ hiánytalanul feldolgozta. Ha a JSON parse hibázik, ez az esemény nem képződhet le!
- `answer.response_error`: A szerver HTTP hibastátuszt adott (pl. 400, 401, 404, 500) vagy a válasz JSON feldolgozhatatlan.
- `answer.no_ack`: A kérés hálózati hiba (`TypeError: Failed to fetch`) vagy időtúllépés miatt nem kapott visszaigazolást. A böngésző rögzíti, hogy a mentés szerveroldali állapota még bizonytalan.
- `socket.disconnected`: A Socket.io kapcsolat megszakadt (oka pl.: `transport close`, `ping timeout`).
- `socket.reconnected`: A Socket.io sikeresen újracsatlakozott a korábbi kapcsolatvesztés után (kizárólag akkor rögzül, ha már volt korábbi sikeres kapcsolat).
- `socket.connect_error`: Sikertelen kapcsolódási kísérlet a WebSocket rétegen.

### 3.3. Szigorúan TILTOTT adatok (OWASP Audit Checklist)

A diagnosztikai fájlba és az exportba **SZIGORÚAN TILOS** az alábbi adatok beírása:
1. **Személyes adatok:** Tanuló teljes neve, osztálya (`class_name`), gépazonosítója (`pc_number`).
2. **Relációs azonosítók:** `student_id`, `participant_id`, `session_id`, `quiz_id`, `question_id`.
3. **Titkok és hitelesítők:** `session_token`, tanári PIN (`adminPin`), munkamenet-sütik (`ropdolgozat_admin_auth`).
4. **Pedagógiai tartalmak:** Kérdések szövege, tanuló által beküldött válasz szövege (`submitted_answer`), helyes válasz (`correct_answer`), magyarázat (`explanation`), szerzett pontszám (`points_earned`), százalék és érdemjegy.
5. **Környezeti és hálózati profil:** Kliens valós IP címe, `User-Agent` fejléc, böngésző ujjlenyomat, nyers kivétel-verem (stack trace) és szabad szöveges hibaüzenet.

---

## 4. Rendszerarchitektúra és Megvalósítási Részletek

```
+-----------------------------------------------------------------------------------+
|                              DIÁK BÖNGÉSZŐ (Frontend)                             |
|                                                                                   |
|  [ Felhasználói válasz ] ---> Generál: operationId (változatlan retry esetén)     |
|                                Generál: requestId (minden HTTP próbálkozáshoz új) |
|                                                                                   |
|  [ Eseményfigyelők ] ---> sessionStorage Körpuffer (max. 50 elem / 32 KiB / 2 óra)|
|    - fetch eredmények         | (2 órán túli elemek automatikus kiesése)          |
|    - Socket.io események      v                                                   |
|                         [ Aszinkron Szinkronizáló ]                               |
|                               | (POST /api/student/diagnostics/events)            |
|                               | Atomi csomagürítés (204 után csak az elküldött    |
|                               | eventId-k törlése, új események megmaradnak)      |
+-------------------------------|---------------------------------------------------+
                                | HTTP (max. 8 KiB JSON csomag, legfeljebb 20 elem)
                                v
+-----------------------------------------------------------------------------------+
|                           OKOSKODÓ SZERVER (Node.js)                              |
|                                                                                   |
|  1. [ Request ID Middleware ] ---> X-Request-Id fejléc képzés és továbbadás       |
|  2. [ Korai Diagnosztikai Body Parser ] ---> express.json({ limit: '8192b' })     |
|     (Közvetlenül a globális parserek ELŐTT, azonnali 413 túlméret esetén)         |
|  3. [ Globális Body Parserek ] ---> express.json(), urlencoded()                  |
|                                                                                   |
|  [ API Végpontok ]                                                                |
|    - /api/student/submit-answer                                                   |
|    - /api/student/diagnostics/events (Atomi csomagkezelés, 204 vs 503)            |
|                               |                                                   |
|                               v                                                   |
|              +----------------------------------+                                 |
|              | DiagnosticsService (Központi)    |                                 |
|              +----------------------------------+                                 |
|                               |                                                   |
|          +--------------------+--------------------+                              |
|          |                                         |                              |
|          v                                         v                              |
|  [ RingBuffer Memóriasor ]              [ Deduplication Cache ]                   |
|  (Max. 2048 elem / 2 MiB)               (FIFO gyűrű: 1024 db eventId)             |
|  Atomi ellenőrzés: ha az ÖSSZES új sor  Csak akkor rögzül az eventId, ha a teljes |
|  befér, mind bekerül; ha NEM, EGY SEM!  csomag befért a sorba!                    |
|          |                                                                        |
|          v Aszinkron fájlírás (drain vezérelt Node.js Writable stream)         |
|  [ DiagnosticsFileWriter ]                                                        |
|    - Fizikai elérési út ellenőrzése (fs.realpathSync, keresztezés tiltása)        |
|    - Napi rotáció: data/diagnostics/diagnostics-YYYY-MM-DD.log                    |
|    - Méretrotáció (5 MiB): diagnostics-YYYY-MM-DD.1.log                           |
|    - Automatikus takarítás: Max. 7 nap és Max. 25 MiB összméret                   |
+-----------------------------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------------------------+
|                        TANÁRI VEZÉRLŐPULT (Admin Dashboard)                       |
|                                                                                   |
|  [ Beállítások -> Diagnosztika kártya ]                                           |
|    - GET /api/admin/diagnostics/status (Állapot, eldobott események száma)        |
|    - GET /api/admin/diagnostics/export (Utolsó 24 óra letöltése JSONL formátumban)|
+-----------------------------------------------------------------------------------+
```

---

## 5. Fájlonkénti és Funkciónkénti Végrehajtási Specifikáció

### 5.1. `config.js` és `.gitignore` konfiguráció

#### Feladat a `config.js` fájlban:
Bővíteni a konfigurációs objektumot a diagnosztikai környezeti változók kezelésével:
```javascript
// Diagnosztikai alrendszer beállításai (Report Beépítési terv 01 & Pontosítási terv 01)
diagnosticsEnabled: process.env.DIAGNOSTICS_ENABLED === 'true' || false,
diagnosticsDir: process.env.DIAGNOSTICS_DIR || path.join(__dirname, 'data', 'diagnostics'),
diagnosticsMaxQueueSize: parseInt(process.env.DIAGNOSTICS_MAX_QUEUE_SIZE || '2048', 10),
diagnosticsMaxQueueBytes: parseInt(process.env.DIAGNOSTICS_MAX_QUEUE_BYTES || '2097152', 10), // 2 MiB
diagnosticsMaxFileSizeBytes: parseInt(process.env.DIAGNOSTICS_MAX_FILE_BYTES || '5242880', 10), // 5 MiB
diagnosticsMaxTotalSizeBytes: parseInt(process.env.DIAGNOSTICS_MAX_TOTAL_BYTES || '26214400', 10), // 25 MiB
diagnosticsRetentionDays: parseInt(process.env.DIAGNOSTICS_RETENTION_DAYS || '7', 10),
diagnosticsRateLimitParticipantPerMin: parseInt(process.env.DIAGNOSTICS_RATE_LIMIT_PARTICIPANT || '6', 10),
diagnosticsRateLimitGlobalPerMin: parseInt(process.env.DIAGNOSTICS_RATE_LIMIT_GLOBAL || '300', 10)
```

#### Feladat a `.gitignore` fájlban:
Biztosítani, hogy a naplófájlok soha ne kerüljenek Git verziókövetés alá:
```gitignore
# Helyi diagnosztikai naplók
data/diagnostics/
```

---

### 5.2. `src/services/diagnostics.js` (Új központi modul)

A modul 4 belső komponenst tartalmaz:

#### 1. `RingBufferQueue` (Memóriabeli eseménysor atomi átvétellel)
- **Célja:** Korlátozott kapacitású, lemezírásra várakozás nélküli eseményátadás.
- **Kapacitása:** Maximum 2048 esemény vagy 2 MiB becsült méret.
- **Atomi csomagátvétel (`canAcceptBatch` és `enqueueBatch`):**
  - Mielőtt a memóriasorhoz adnánk egy csomagot, a szerviz kiszámítja a még nem ismert események darabszámát és végleges JSONL formátumú UTF-8 bájtméretét.
  - Ha a teljes új sorozat befér a rendelkezésre álló keretbe (darabszám ÉS bájtkeret szerint):
    - Az összes új esemény a sorba kerül.
    - Az azonosítóik rögzítésre kerülnek a deduplikációs nyilvántartásban.
    - A hívó megkapja az elfogadás igazolását -> HTTP `204 No Content`.
  - Ha a sorozat akár csak egyetlen bájttal vagy elemmel túllépné a kapacitást:
    - **Egyetlen új sor sem kerül a sorba!**
    - **Egyetlen új `eventId` sem kerül a deduplikációs cache-be!**
    - A hívó elutasítási jelzést kap -> HTTP `503 Service Unavailable`.
  - Ezzel kizárt a csendes adatvesztés és a sikertelen csomagok téves deduplikálása.

#### 2. `DeduplicationCache` (Kliens események deduplikációja)
- **Célja:** Ha a diák böngészője egy hálózati bizonytalanság miatt újra elküldi a diagnosztikai csomagot, a szerver ne írja be többször ugyanazt a klienseseményt.
- **Méret:** Legutóbbi 1024 darab `eventId` nyilvántartása memóriában (FIFO gyűrű), maximum 10 perces lejárattal.
- **Garantált működés:** Csak akkor kerül be egy `eventId`, ha a hozzá tartozó esemény ténylegesen helyet kapott a memóriasorban.

#### 3. `DiagnosticsFileWriter` (Aszinkron adatfolyam-író és rotáció)
- **Célja:** Egyetlen központi `fs.createWriteStream` használatával sorosítani a lemezre írást.
- **Stream vezérlés:** Figyeli a `stream.write()` visszatérési értékét. Ha a belső puffer megtelt, megvárja a `drain` eseményt a következő sorok kiírása előtt (backpressure kezelés).
- **Fizikai elérési út és kereszteződés ellenőrzése:**
  - A 6. fejezet egységes útvonal-ellenőrzését használd a fájl megnyitása, forgatása és exportja előtt. Konfigurációs hiba esetén az állapot jelezze a diagnosztika elérhetetlenségét, a dolgozatműveletek maradjanak elérhetők.
- **Rotációs stratégia:**
  1. **Napi rotáció:** Minden nap UTC éjfélkor automatikusan új fájlt nyit: `diagnostics-YYYY-MM-DD.log`.
  2. **Méretrotáció:** Ha az aktuális napi fájl eléri az 5 MiB-ot, lezárja és sorszámozza: `diagnostics-YYYY-MM-DD.1.log`, `diagnostics-YYYY-MM-DD.2.log`, stb.
  3. **Takarítás (Pruning):** Új fájl nyitásakor és szerverinduláskor beolvassa a könyvtárat:
     - Szigorú regex maszk: `/^diagnostics-\d{4}-\d{2}-\d{2}(\.\d+)?\.log$/` (idegen fájlokhoz szigorúan TILOS nyúlni!).
     - Törli a 7 napnál régebbi naplófájlokat.
     - Ha a megmaradt fájlok összmérete meghaladja a 25 MiB-ot, a legrégebbi fájlokat törli addig, amíg az összméret 25 MiB alá nem csökken.
- **Hibaizoláció:** Íráshiba esetén ritkított (throttled, max. 1 percben egyszeri) konzolfigyelmeztetést ad, belső `isDegraded` zászlót állít, és a dolgozatmenet zavartalanul folytatódik.

#### 4. `DiagnosticsService` (Publikus API és Sebességkorlátozás)
- **Sebességkorlátozás (Rate Limiting):**
  - Két szintű csúszóablakos számláló memóriában (60 másodperces elévüléssel):
    - Résztvevőnkénti korlát: max. 6 csomag / perc (token hash kulcs alapján).
    - Rendszerszintű globális korlát: max. 300 csomag / perc.
  - Túllépéskor: azonnali HTTP `429 Too Many Requests`.
- `logEvent(entry)`: Szerveresemény felvétele a sorba (sémaellenőrzés, érzékeny mezők csonkolása, időbélyegzés).
- `handleClientBatch(events, participantToken)`: Kliensoldali eseménycsomag feldolgozása atomi döntéssel (`204`, `400`, `429`, `503`).
- `getStatus()`: Tanári állapot lekérdezése (`enabled`, `isDegraded`, `runId`, `startedAt`, `droppedEventsCount`, `totalWritten`, `diskSizeBytes`, `exportAvailable`). Íráshibát jelölj előre meghatározott állapotkóddal.
- `createExportStream(hours = 24)`: Az utolsó 24 óra logfájljaiból összefűzött, csak teljes sorokat tartalmazó olvasható adatfolyam (`ReadableStream`) előállítása.
- `flushAndClose(timeoutMs = 2000)`: A még sorban lévő események leürítése, majd az aktív fájlfolyam lezárása. Az eredmény jelezze a sikeres lezárást, az íráshibát vagy a határidő túllépését. A művelet állítsa le a naplózó időzítőit is.

---

### 5.3. Szerveroldali integráció (`server.js` és `src/routes/api.js`)

#### A) `server.js` módosításai és Middleware-sorrend:
1. **Szerverazonosító generálása:** Induláskor egy 32 karakteres véletlen hexadecimális azonosító képzése (`runId`), amely a folyamat életciklusához kötött:
   ```javascript
   const crypto = require('crypto');
   const runId = crypto.randomBytes(16).toString('hex');
   ```
2. **Kérésazonosító és időmérés middleware (Közvetlenül az Express app legelején):**
   - Minden bejövő kérésnél ellenőrzi az `X-Request-Id` fejlécet. Ha érvényes (32 karakter hex), megtartja; ha hiányzik vagy hibás, újat generál: `crypto.randomBytes(16).toString('hex')`.
   - Visszaadja a kliensnek az `X-Request-Id` válaszfejlécben.
   - Figyeli a válasz lezárását (`res.on('finish')`) és az idő előtti megszakadást (`res.on('close')`), és rögzíti a monoton futásidőt (`process.hrtime.bigint()`).
3. **KORAI DIAGNOSZTIKAI BODY PARSER (A Pontosítási terv 1. pontja szerint):**
   - A `POST /api/student/diagnostics/events` végpontot **még a globális `app.use(express.json())` ELŐTT** kell felcsatolni egy célzott 8 192 bájtos parserrel:
   ```javascript
   // 1. Request ID kezelés minden kéréshez
   app.use(requestIdMiddleware);

   // 2. Diagnosztikai eseményfogadó szigorú 8 KiB korláttal a globális body parserek ELŐTT
   app.post('/api/student/diagnostics/events',
     express.json({ limit: '8192b' }),
     diagnosticsHandler
   );

   // 3. Globális middleware-ek a többi normál kéréshez
   app.use(cookieParser(config.cookieSecret));
   app.use(express.json());
   app.use(express.urlencoded({ extended: true }));
   ```
   - Ezzel garantált, hogy a 8 KiB-nál nagyobb diagnosztikai kérés azonnal HTTP `413 Payload Too Large` hibát kap a body parser szintjén, és a hibaválasz is megkapja a `requestId` fejlécet.
4. **Szabályos leállás (Graceful Shutdown a Pontosítási terv 5. pontja szerint):**
   1. A `SIGINT` és a `SIGTERM` ugyanazt az egyszer indítható `gracefulShutdown(signal)` folyamatot hívja. Leállási állapotban az új alkalmazáskérések kapjanak rövid `503` választ. A korábban indult műveletek naplózása folytatódjon.
   2. Indítsd el a Socket.IO és a HTTP-szerver közös lezárását egyetlen `io.close()` hívással. A Socket.IO lezárja a mögöttes HTTP-szervert is. A normál ágon várd meg a lezárás befejezését és az aktív alkalmazásműveletek végét. A `finish` vagy az idő előtti `close` egyszer zárja le a HTTP-válasz megfigyelését, a hozzá tartozó esemény sorba állítása után. Ha a kapcsolat lezárása után egy aszinkron művelet még dolgozik, annak befejezését külön kövesd. Kiinduló határidő az aktív műveletekre 5 másodperc. [Socket.IO lezárás](https://socket.io/docs/v4/server-api/#serverclosecallback)
   3. Ha a határidő lejár, zárd le a megmaradt kapcsolatokat, és a `server.stopping` eseményhez rendeld a `SHUTDOWN_DEADLINE` okkódot. A `server.stopping` eseményt mindkét ágon a kapcsolati várakozás után vedd fel, majd hívd a `flushAndClose(2000)` műveletet. Siker esetén az eseménysor leürült, a fájlfolyam lezárult, és a naplózó időzítői leálltak. A határidők kiinduló értékek. A tesztben rövidebb időkkel is ellenőrizhető ugyanez a sorrend.
   4. Normál esetben hagyd a folyamatot természetesen kilépni. Lejárat vagy íráshiba esetén állíts be hibát jelző kilépési kódot, és zárd le vagy szakítsd meg a megmaradt erőforrásokat is. A `process.exitCode` a kilépés eredményét adja meg. A határidőt a kapcsolatok, időzítők és fájlfolyamok tényleges lezárása érvényesíti. Kikapcsolt diagnosztikánál ugyanez a kapcsolati sorrend fusson pufferürítés nélkül. [Node.js folyamatleállítás](https://nodejs.org/api/process.html#processexitcode)

#### B) `src/routes/api.js` módosításai:
1. **`POST /api/student/submit-answer` eseménynaplózása:**
   - **Belépéskor:** azonnal rögzíti az `answer.received` eseményt (`requestId`, `operationId`).
   - **Elutasításkor:** `answer.rejected` strukturált `reasonCode`-dal (`TOKEN_MISSING`, `QUESTION_ID_MISSING`, `PARTICIPANT_UNKNOWN`, `SESSION_INACTIVE`, `DEADLINE_EXCEEDED`).
   - **Sikeres tranzakció után:** közvetlenül a `sessionRepo.submitAnswer()` után, még a mátrix értesítés előtt:
     ```javascript
     diagnosticsService.logEvent({
       source: 'server',
       event: 'answer.persisted',
       requestId: req.requestId,
       operationId: req.headers['x-operation-id'],
       outcome: submission.alreadySubmitted ? 'duplicate' : 'saved',
       durationMs: calculateDuration(req.startTime)
     });
     ```
   - **Kivételkezelés (`catch` ág):** Szigorúan **megőrzi az alkalmazás meglévő HTTP 400-as válaszkódját**, de a diagnosztikai naplóban megkülönbözteti az okot:
     - `reasonCode: "PERSISTENCE_CALL_FAILED"`: Ha a repository hívása kivétellel leállt, és az okhoz nincs biztosabb, elkülönített üzleti kód.
     - `reasonCode: "AFTER_PERSISTENCE_FAILED"`: Ha a mentés lefutott, de a válasz-összeállítás hibázott.
2. **`POST /api/student/join` és `GET /api/student/session-data`:**
   - A válasz JSON objektumát kiegészíti a `diagnosticsEnabled: config.diagnosticsEnabled` mezővel.
3. **Új végpontok a tanári felülethez:**
   - `GET /api/admin/diagnostics/status`: `requireAdminAuth` védelem alatt, visszaadja az állapotot és a metrikákat.
   - `GET /api/admin/diagnostics/export`: `requireAdminAuth` védelem alatt, közvetlen adatfolyam-letöltés:
     ```javascript
     res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
     res.setHeader('Content-Disposition', `attachment; filename="okoskodo_diagnostics_${timestamp}.jsonl"`);
     res.setHeader('Cache-Control', 'no-store');
     const exportStream = diagnosticsService.createExportStream(24);
     exportStream.pipe(res);
     ```

---

### 5.4. Kliensoldali integráció (`public/js/student.js`)

A tanulói felületen a meglévő üzleti és értékelési logika maradéktalanul megmarad. A diagnosztikai réteg kiegészítő funkcióként épül be a Pontosítási terv 4. pontjának szigorú követelményei szerint:

#### 1. Azonosítók kezelése és generálása:
- `generateHexId()`: 16 bájtos (32 karakter hex) azonosító `crypto.getRandomValues()` alapon.
- **`operationId` életciklusa:** Az első tényleges beküldéskor a felület létrehoz egy `operationId`-t.
  - Ha a kérés elakad (hálózati megszakadás vagy timeout), és a diák újra a [Válasz beküldése] gombra kattint ugyanannál a kérdésnél, az `operationId` **változatlan marad**!
  - Egyértelmű válasz, kérdésváltás, munkamenetváltás vagy befejezés lezárja a műveletet. A következő önálló beküldés új azonosítót kap. Oldalfrissítés után az aktív műveletazonosító elveszhet.
- **`requestId` életciklusa:** Minden egyes `fetch` kísérlet (az újrapróbálkozások is) teljesen új `requestId`-t kap.
- A kérés mindkettőt elküldi a fejlécekben: `X-Operation-Id` és `X-Request-Id`.

#### 2. Kliensoldali Körpuffer és Életciklus-kezelés (`sessionStorage`):
- Kulcs: `ropdolgozat_diagnostics_buffer`.
- Korlátok: Maximum 50 esemény, maximum 32 KiB, és **maximum 2 órás élettartam (TTL = 7 200 000 ms)**.
- Minden esemény tárolja a helyi kliens időbélyeget (`clientAt`). Betöltéskor és minden ürítés előtt a 2 óránál régebbi események automatikusan törlődnek.
- **Munkamenet-függőség és törlés:**
  - A tárolt puffer kapjon helyi hatókört, például a sikeresen visszaigazolt dolgozat- és résztvevőazonosító párját. Ez kizárólag helyi metaadat. A feltöltött események és az export ebből semmit nem tartalmaznak. A nyers token és a tokenből képzett érték kimarad a diagnosztikai tárból. Feltöltéskor a hitelesítéshez az aktuális tokent a meglévő alkalmazásállapotból vedd át.
  - Kilépéskor vagy másik dolgozatba, illetve másik résztvevőként történő belépéskor töröld a korábbi puffert. A késleltetett újrapróbálkozásokat állítsd le, a folyamatban lévő feltöltést lehetőség szerint szakítsd meg.
  - Ha a szerver jelzi, hogy a diagnosztika ki van kapcsolva (`403` vagy `diagnosticsEnabled: false`), a puffer azonnal törlődik és a gyűjtés leáll.
  - Oldalfrissítés után a korábbi események csak sikeres munkamenet-helyreállítást és egyező helyi hatókört követően tölthetők fel. Sikertelen vagy eltérő helyreállításkor töröld a korábbi puffert.
- Ha a `sessionStorage` nem elérhető (pl. tiltott böngészőtárhely), automatikusan memóriabeli JavaScript tömbre vált vissza.

#### 3. Események elkapása és kiértékelése:
- **`submitAnswer` futásakor:**
  - `answer.acknowledged` sikeres HTTP-státusznál és a beküldés sikerét jelző, feldolgozott alkalmazásválasznál készül. Érvénytelen vagy a sikerformátumnak meg nem felelő JSON-nál `answer.response_error` készül.
  - Ha a szerver HTTP hibakódot adott: rögzíti az `answer.response_error` eseményt a HTTP státusszal.
  - Ha a fetch kivételt dobott (hálózati megszakadás): rögzíti az `answer.no_ack` eseményt.
- **Calm modál hibaüzenet kiegészítése (UX):**
  - Hálózati vagy beküldési hiba esetén a felugró ablakban megjelenik a kérés azonosítója (pl. `Kérés azonosító: #b74fea...`), és a szöveg egyértelműen jelzi: *"A válasz mentésének eredménye bizonytalan a hálózati megszakadás miatt. Kérlek, próbáld újra!"*
- **Socket.io események:**
  - `socket.on('disconnect')`: rögzíti a `socket.disconnected` eseményt a bontás okával (`reason`).
  - `socket.on('connect')`: rögzíti a `socket.reconnected` eseményt (ha nem ez a legelső csatlakozás).
  - `socket.on('connect_error')`: rögzíti a `socket.connect_error` eseményt.

#### 4. Háttérbeli atomi szinkronizáló folyamat:
- **Ürítési feltételek:**
  - Socket visszacsatlakozáskor (`connect`).
  - Sikeres válaszbeküldést követően a háttérben.
  - Periodikusan 30 másodpercenként (ha van pufferelt elem).
- **Atomi csomagürítés:**
  - Szigorúan egyszerre legfeljebb 1 darab háttérküldés futhat (`isSyncing` zár).
  - A szinkronizáló összeállítja a csomagot (max. 20 elem és a teljes JSON kérés max. 8 KiB), és feljegyzi a küldött `eventId`-k listáját. A küldés egy memóriában tartott verziószámot is kap, amely pufferürítéskor, munkamenetváltáskor és kikapcsoláskor változik. Csak a jelenlegi verzióhoz tartozó háttérválasz vagy időzítő módosíthatja a puffert és az ürítés állapotát. Ez a korábbi küldés késve érkező `204` vagy `403` válaszára is érvényes.
  - **HTTP `204 No Content` esetén:** KIZÁRÓLAG azokat az eseményeket törli a helyi tárból, amelyek az elküldött csomagban szerepeltek. Ha a küldés közben új események képződtek a kliensen, azok érintetlenül megmaradnak a pufferben!
  - **HTTP `429`, `503` vagy hálózati hiba esetén:** A csomagot a pufferben tartja, és újraütemezi az ürítést exponenciális hátrálással (1s, 2s, 4s, 8s, max. 16s) és véletlenszerű jitterrel (0..500ms).
  - **HTTP `400` esetén:** A hibás csomagot eldobja, megelőzve a végtelen ciklusos próbálkozást.
  - **HTTP `413` esetén:** Kisebb méretű adagra bontja a csomagot, az önmagában túlméretes eseményt eldobja.
  - **HTTP `401` esetén:** Felfüggeszti a szinkronizációt a munkamenet újbóli hitelesítéséig.
  - **HTTP `403` (`DIAGNOSTICS_DISABLED`) esetén:** Azonnal törli a teljes helyi puffert, és leállítja a gyűjtést.

---

### 5.5. Tanári felület (`public/admin.html` és `public/js/admin.js`)

#### A) Felületi elhelyezés (`public/admin.html`):
A Beállítások fülön (`tab-backup`), közvetlenül a "Biztonsági mentés és adatkezelés" kártya mellé egy új kártya kerül beillesztésre:
```html
<!-- 2. SZEKCIÓ: RENDSZERDIAGNOSZTIKA ÉS ESEMÉNYNAPLÓ -->
<div class="card settings-card" style="margin-top: 24px;">
  <div class="settings-card-header">
    <div class="settings-card-icon" style="background-color: var(--secondary-fixed, #e8def8); color: var(--on-secondary-fixed, #1d192b);">
      <span class="material-symbols-outlined">troubleshoot</span>
    </div>
    <div>
      <h3 class="settings-card-title">Rendszerdiagnosztika és tantermi eseménynapló</h3>
      <p class="settings-card-subtitle">Helyi hálózati események, kapcsolatbontások és válaszbeküldési előzmények ellenőrzése.</p>
    </div>
  </div>

  <div class="settings-backup-grid">
    <div class="settings-action-tile">
      <div class="settings-action-tile-top">
        <div class="settings-action-tile-icon" style="background-color: var(--surface-variant, #e7e0ec); color: var(--primary);">
          <span class="material-symbols-outlined">summarize</span>
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <h4 class="settings-action-tile-title" style="margin: 0;">Diagnosztikai állapot</h4>
            <span id="diagnostics-status-badge" class="report-badge" style="background-color: #ecfdf5; color: #047857; font-weight: 700;">
              Bekapcsolva (Aktív)
            </span>
          </div>
          <p id="diagnostics-status-desc" class="settings-action-tile-desc">
            Szerverfutás azonosító: <code id="diag-run-id">-</code> | Indult: <span id="diag-started-at">-</span><br>
            Naplózott események: <strong id="diag-total-events">0</strong> db | Eldobott események: <strong id="diag-dropped-events">0</strong> db
          </p>
        </div>
      </div>
      <div class="settings-action-tile-bottom" style="display: flex; gap: 12px;">
        <a href="/api/admin/diagnostics/export" id="btn-download-diagnostics" class="btn btn-secondary" target="_blank">
          <span class="material-symbols-outlined">download</span>
          <span>Eseménynapló letöltése (.jsonl)</span>
        </a>
        <button id="btn-refresh-diagnostics" type="button" class="btn btn-outlined">
          <span class="material-symbols-outlined">refresh</span>
          <span>Frissítés</span>
        </button>
      </div>
    </div>
  </div>
</div>
```

#### B) Logika (`public/js/admin.js`):
- A `loadSettings()` függvény meghívja a `loadDiagnosticsStatus()` segédfüggvényt.
- Lekérdezi a `GET /api/admin/diagnostics/status` végpontot.
- Frissíti az állapotjelző jelvényt (Zöld: Bekapcsolva, Szürke: Kikapcsolva, Piros: Telített/Degradált).
- Beállítja a `btn-download-diagnostics` gomb állapotát (ha ki van kapcsolva és nincs exportálható adat, inaktívvá teszi).

---

## 6. Biztonsági mentés és fájlrendszeri garanciák

Az alapértelmezett `data/diagnostics/` használható a `data/ropdolgozat.db` mellett. Az adatbázis szülőmappája működési terület, amelyből a diagnosztika saját alkönyvtárat használhat.

1. **Fizikai feloldás.** Az ellenőrzés a tényleges konfigurációs értékekből induljon. Létező útnál használd az `fs.realpathSync()` eredményét a szimbolikus linkek és Windows-csomópontok feloldására. Még nem létező útvonalnál keresd meg és oldd fel a legközelebbi létező szülőt, majd illeszd hozzá a hiányzó részt. A tervezett célt a létrehozás előtt ellenőrizd, a létrehozott könyvtárat használat előtt ismét oldd fel és ellenőrizd.
2. **Átfedés.** A diagnosztikai könyvtár legyen külön a `config.publicDir` webgyökértől, a teljes `config.uploadsDir` képtártól és az adatbázis mellett létrehozott `_restore_snapshots` könyvtártól. Azonos, szülő- vagy alkönyvtári kapcsolat mindhárom esetben tiltott. Ne legyen maga az adatbázis szülőmappája vagy annak őse, és ne egyezzen visszaállításhoz fenntartott `temp_restore_*` munkakönyvtárral vagy annak alkönyvtárával. Az összehasonlítás útvonalszegmensekkel történjen. A szokásos Windows-köteten a kis- és nagybetűs írásmód csak betűméretben eltérő változatait kezeld azonosként.
3. **Írás és export.** A naplózó fájlműveletei a validált könyvtárra és a saját névmintájú rendes naplófájlokra korlátozódjanak. Érvénytelen cél esetén tiltsd az onnan történő írást és exportot, és a tanári diagnosztikai állapot mutassa a konfigurációs hibát. Az alkalmazás indulása és a dolgozatkezelés folytatódjon.
4. **Mentés és visszaállítás.** A rendszermentés az adatbázis pillanatképét és a képtár `quizzes` alkönyvtárát csomagolja. A visszaállítás adatbázist, képtárat és saját helyreállítási könyvtárakat kezel. A helyesen elkülönített naplómappa kívül marad mindkét műveleten. Az elfogadási próba a ténylegesen konfigurált útvonalakkal ellenőrizze ezt. [Mentés és visszaállítás](../src/services/backup.js)

---

## 7. Tesztelési és Minőségbiztosítási Terv

Egy új tesztfájl készül: `scratch/test_diagnostics.js`. A tesztcsomag a meglévő elszigetelési mintát követi: teljesen független `isolatedDir` mappát hoz létre a Windows `%TEMP%` könyvtárában egyedi DB-vel és egyedi diagnosztikai mappával.

A tesztprogram a szerveroldali eseteket és határokat automatizáltan ellenőrzi. A T-01–T-04 minden esetét legalább egyszer a tényleges `public/js/student.js`-t futtató böngészővel is végre kell hajtani. Ez böngészőautomatizálással vagy rögzített lépésekkel végzett kézi elfogadási próbával teljesíthető. Az utóbbi eredményét a helyi export és a tesztadatbázis alapján jegyezd fel.

| Sorszám | Teszteset | Végrehajtás és Ellenőrzési Módszer | Elfogadási Kritérium |
| --- | --- | --- | --- |
| **T-01** | Normál válaszbeküldés | Tesztkliens beküldi az 1. kérdés válaszát valós `requestId`-val és `operationId`-val a kliensmodulon keresztül. | Az exportban megtalálható az `answer.received`, `answer.persisted (outcome: "saved")`, `http.finished` és a kliensoldali `answer.acknowledged` esemény pontosan ugyanazzal a `requestId`-val és `operationId`-val. Az adatbázisban pontosan 1 db válasz szerepel. |
| **T-02** | Szerver előtt elakadt kérés | A tesztkörnyezet szimulál egy megszakadt hálózati kapcsolatot (a kérés nem jut el a szerverig). | A kliens puffere rögzíti az `answer.no_ack` eseményt. Amikor a kapcsolat helyreáll, az esemény beürül a szerverre. A szervernapon NEM szerepel sem `answer.received`, sem `answer.persisted`. Az adatbázisban 0 db válasz található. |
| **T-03** | Mentés után elveszett visszaigazolás | A tesztproxy átengedi a kérést, a szerver menti a választ, de a HTTP választ eldobja a kliens felé. A kliens `no_ack`-ot rögzít, majd a meglévő `operationId`-val és ÚJ `requestId`-val megismétli a beküldést. | A szervernapon az 1. `requestId`-ra `answer.persisted (outcome: "saved")` jelenik meg. A 2. `requestId`-ra `answer.persisted (outcome: "duplicate")` látható azonos `operationId` mellett. Az adatbázisban pontosan 1 db válasz rekord marad (idempotencia). Érvénytelen JSON válasz esetén a kliens nem jegyez `answer.acknowledged`-et. |
| **T-04** | Visszacsatlakozás és a puffer életciklusa | Kapcsolatbontás és visszatérés, oldalfrissítés ugyanazzal a munkamenettel, majd munkamenetváltás függő feltöltés közben. Vizsgáld a kétórás lejáratot is. | A kapcsolat eseményei bekerülnek a naplóba, az ismételt csomag az időablakon belül egyszer szerepel. A régi küldés késve érkező `204` vagy `403` válasza nem érinti az új puffert. Az azonos munkamenet még érvényes sorai frissítés után elküldhetők. A tárolt diagnosztikai rekordokban és metaadatokban nincs nyers token vagy abból képzett érték. |
| **T-05** | Kapacitáshiány, küldési korlát és íráshiba | Külön esetként csak részcsomagra hagyj helyet, érd el a küldési korlátot, majd tesztpéldányban válts ki fájlírási hibát az író hibaágán. | Részkapacitásnál `503` és nulla új sor vagy deduplikációs bejegyzés. A kliens megőrzi a csomagot és később `204`-et kap. `429` után megtartja a csomagot és késleltet. Fájlírási hibánál a tanári állapot jelzi a hibát, az eldobott események számlálhatók, a normál válaszmentés és dolgozatlezárás sikeres. |
| **T-06** | Adatvédelem és korai méretkorlát (`413`) | 8 192 bájtot meghaladó JSON kérés küldése a diagnosztikai végpontra, valamint a megengedett bájtméretű, de 21 elemet tartalmazó csomag küldése. | A 8 KiB-ot meghaladó kérés **azonnal HTTP 413 hibát kap a korai body parser szintjén** (még a kérés feldolgozása előtt), a válasz tartalmazza az `X-Request-Id`-t. A 21 elemű csomag 400-as hibát kap. A keletkezett `.log` állományokban regex vizsgálattal igazolt, hogy egyetlen tanulónév, token, jelszó, PIN, kérdésszöveg vagy válasz sem szerepel. Jogosulatlan export kísérlet 401/403-mal elutasítva. |
| **T-07** | Könyvtár és visszaállítás elkülönítése | Ideiglenes mappával próbáld az alapértelmezett elrendezést, az átfedő célokat és egy tiltott helyre mutató Windows-csomópontot vagy szimbolikus linket. Készíts mentést, majd állítsd vissza. | Az adatbázis melletti `diagnostics` alkönyvtár működik. Az átfedő és átirányított célokat a naplózó elutasítja, a dolgozatkezelés elérhető marad. A ZIP-ben nincs napló, a visszaállítás után a naplókönyvtár tartalma változatlan. |
| **T-08** | Szabályos és határidős leállás | Külön szerverfolyamatban indíts leállást aktív HTTP-művelettel és várakozó naplósorral. Ismételd meg késleltetett művelettel, illetve hibázó íróval. | A normál ágon a már futó kérés befejeződik, utolsó eseménye a leállási sor előtt kerül a lezárt fájlba. Az ismételt leállítási jelzés egyszeri folyamatot eredményez. Lejárat vagy íráshiba esetén a folyamat a tesztben előírt határidőn belül, hibát jelző kóddal kilép. |

---

## 8. Kivitelezési ütemterv és ellenőrzési pontok (Mérföldkövek)

A megvalósítás sorrendje a naplóírótól a tantermi elfogadási próbáig:

1. **Mérföldkő 1 – Infrastruktúra és Központi Szerviz:**
   - `config.js` és `.gitignore` frissítése.
   - `src/services/diagnostics.js` megírása az atomi `RingBufferQueue`-val, aszinkron íróval, napi rotációval, fizikai elérési út ellenőrzéssel és sebességkorlátozóval.
   - Egységteszt a logger izolált működésére.
2. **Mérföldkő 2 – Szerveroldali Útvonalak és Események:**
   - `server.js`: `X-Request-Id` middleware, korai 8 KiB diagnosztikai JSON parser a globális parserek előtt, majd szabályos leállás külön aktívművelet-határidővel és legfeljebb 2 másodperces naplóürítéssel és fájllezárással.
   - `src/routes/api.js`: `submit-answer` korreláció (megtartva a meglévő HTTP 400 státuszt), `diagnosticsEnabled` mező átadása a `join` és `session-data` válaszokban, tanári status és export végpontok.
3. **Mérföldkő 3 – Tanulói Kliens Modul:**
   - `public/js/student.js`: `operationId`/`requestId` életciklus, tokenmentes munkamenet-hatókör és lejáró `sessionStorage` puffer, kapcsolat- és beküldési események, az azonos verziójú feltöltés biztonságos ürítése. A beküldési hibaüzenet mutassa a `requestId` előtagját és jelezze a bizonytalan mentést, amikor visszaigazolás hiányzik.
4. **Mérföldkő 4 – Tanári Kezelőfelület:**
   - `public/admin.html` és `public/js/admin.js`: diagnosztikai kártya, állapotlekérés, JSONL export gomb.
5. **Mérföldkő 5 – Automatizált Tesztelés és Verifikáció:**
   - A 7. fejezet szerinti T-01–T-08 elfogadási próbák végrehajtása, beleértve a tényleges böngészős útvonalat, a fájlírási hibát, a könyvtár-elkülönítést és a leállást.
   - `scratch/run_all_tests.js` teljes integrációs tesztcsomag futtatása (mind az 52 korábbi + az új tesztek hibátlan zöld futása).
   - CHANGELOG.md és verziószám frissítése `v1.34.0`-ra.

---

> A v1.2-es dokumentum a megvalósítás kiindulópontja. A tantermi használatra való készültséget a működő változaton elvégzett elfogadási próbák igazolják.
