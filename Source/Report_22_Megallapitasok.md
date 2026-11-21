# Report 22 – Új tesztek időbélyegei régi mentés visszaállítása után

**Okoskodó v1.32.0 · Vizsgált változat `e7a9578`**

## Javítandó tétel

**Egy javítás szükséges a régi mentések támogatásának lezárásához.** Ha egy visszaállított adatbázis eredetileg nem tartalmazta a `quizzes.created_at` és a `quizzes.updated_at` oszlopot, a visszaállítás után létrehozott tesztek üres időbélyegeket kapnak. Ez a tanári tesztlista sorrendjét is érinti. Frissen létrehozott adatbázissal a tantermi próba elindítható. Ha a próbához ilyen régi mentést használnak, előbb ezt a tételt kell javítani.

## Bizonyíték és ok

Az elkülönített próbában visszaállítottam egy szintetikus régi mentést, amelyből mindkét időbélyeg-oszlop hiányzott. A migráció feltöltötte a mentésből érkező teszt időbélyegeit. Ezután a szokásos `createQuiz` művelettel létrehoztam egy új tesztet. Az új rekord `created_at` és `updated_at` mezője egyaránt `NULL` lett, és a tanári lista az új tesztet a régi mögé sorolta.

A migráció az oszlopokat `DEFAULT NULL` beállítással adja hozzá, majd egyszeri frissítéssel tölti ki a már ott lévő sorokat. A közös tesztlétrehozási művelet a beszúráskor nem ad értéket ezeknek az oszlopoknak, ezért az új rekord a migrált séma alapértékét kapja. A lista elsősorban `updated_at DESC`, másodsorban `id DESC` szerint rendez. [Oszlopok hozzáadása](../src/db/init.js#L181) · [Teszt létrehozása](../src/db/quizRepo.js#L345) · [Listázási sorrend](../src/db/quizRepo.js#L65)

## Javasolt javítás

A közös `createQuiz` művelet a teszt beszúrásakor adjon explicit SQLite `CURRENT_TIMESTAMP` értéket a `created_at` és az `updated_at` mezőnek, ugyanabban az `INSERT` műveletben. Így az időbélyegek a létrehozás részeként rögzülnek a friss és a migrált sémán is. A másolás és az egyesítés is ezen a közös útvonalon hozza létre az új tesztet. [Másolás](../src/db/quizRepo.js#L538) · [Egyesítés](../src/db/quizRepo.js#L605)

## Elfogadási próba

1. Állíts vissza a tényleges mentés-visszaállítási művelettel egy régi sémájú mintát, amelyből hiányzik a két időbélyeg-oszlop, és amelyben már van egy teszt.
2. Hozz létre egy új tesztet a közös `createQuiz` művelettel. Ellenőrizd, hogy a régi teszt megmaradt, és az új teszt mindkét időbélyege érvényes, kitöltött érték.
3. A tényleges `getQuizzes` eredményében az új teszt szerepeljen a korábbi előtt. A rendezési ellenőrzéshez használj rögzített, korábbi időpontot a meglévő tesztnél, hogy az eredmény független legyen a futás időzítésétől.
4. Futtasd az `npm test` csomagot a regressziós próbával együtt.

**A tétel lezárható, ha a célzott próba és a teljes tesztcsomag sikeres.** Az előző futásban a teljes csomag már sikeresen lefutott. Az induláskori írásvédelem és az üres mentések kezelése lezárt tétel. [A Report 21-re adott fejlesztői válasz](Valasz_a_Report_21_Megallapitasokra.md)
