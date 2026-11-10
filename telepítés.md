# Részletes Telepítési és Üzembe Helyezési Útmutató (telepítés.md)

> **Rendszer:** Okoskodó – 100% Offline Iskolai Helyi Hálózatos Dolgozatíró Rendszer  
> **Célkörnyezet:** 1 db Windows Server (Windows Server 2016 / 2019 / 2022) központi kiszolgáló + 42 db Windows 10 tanulói kliensgép + tanári munkaállomások  
> **Üzembe helyezési elv:** **Zero-Install Best Practice (Pre-packaged Deployment)** – A szerveren nem futtatunk internetes csomagtelepítést (`npm install`), kizárva minden verzió- és fordítási hibát!

---

## 1. Előkészületek a Fejlesztői (Internetes) Számítógépen

Mielőtt a szervergéphez lépsz, készíts elő egy legalább 4–8 GB-os pendrive-ot.

### 1.1. A megfelelő Node.js telepítő letöltése a pendrive-ra
Mivel az iskolai szerver zárt hálózaton működik és nincs közvetlen internetkapcsolata, a fejlesztői gépen töltsd le a hivatalos Node.js telepítőt a pendrive gyökerébe:
* **Hivatalos letöltési cím:** [https://nodejs.org](https://nodejs.org)
* **Kötelező változat:** **Node.js v22.x LTS Windows x64 telepítő (.msi)** (például `node-v22.13.0-x64.msi` vagy a legfrissebb v22 LTS kiadás).
> [!IMPORTANT]
> **Szigorú verziókövetelmény:** Kifejezetten tilos régebbi (pl. v20) vagy kísérleti (pl. v25, v26) verziót használni! A nagy teljesítményű beágyazott SQLite adatbázis-motor kizárólag a **Node.js v22.x LTS** verzióval garantálja a hibamentes, előre lefordított futást.

---

### 1.2. Milyen állományokat KELL átmásolni a pendrive-ra? (Zero-Install Best Practice)

A fejlesztői gépen a rendszer már le van tesztelve, és a `node_modules` mappában ott találhatók a Windows x64 környezethez előre előkészített binárisok.

Másold át a teljes projektkönyvtárat a pendrive-ra egy `Ropdolgozat` nevű mappába:

```text
📁 Ropdolgozat/
├── 📁 node_modules/           # KÉSZRE CSOMAGOLT MODULOK (Át kell másolni! Zero-Install elv)
├── 📁 public/                 # Teljes kliensoldali webfelület (HTML, CSS, JS, képek, favicon)
├── 📁 src/                    # Teljes szerveroldali forráskód (adatbázis, útvonalak, API)
├── 📁 data/                   # Adatbázis mappa
│   └── 📁 uploads/            # Képek mappája (a .gitkeep fájllal)
├── 📄 server.js               # A központi Express és Socket.io webszerver
├── 📄 config.js               # Konfigurációs beállítások (port: 3000, PIN, elérési utak)
├── 📄 package.json            # Függőségek és környezeti követelmények (Node >= 22.11.0)
├── 📄 package-lock.json       # Verziózárolt csomagleíró
├── 📄 start_server.bat        # Önellenőrző, diagnosztikai Windows indítószkript
├── 📄 DATABASE_SCHEMA.sql     # Adatbázisséma és integritási triggerek definíciója
├── 📄 README.md               # Rendszerleírás és dokumentáció
├── 📄 CHANGELOG.md            # Verziótörténet és változási napló
└── 📄 telepítés.md            # Ez a részletes telepítési útmutató
```

---

### 1.3. Mit NEM SZABAD átmásolni a pendrive-ra?

* ❌ **`scratch/` mappa:** A fejlesztői tesztszkriptek és ideiglenes kísérleti fájlok nem valók az éles szerverre.
* ❌ **`.git/` rejtett mappa:** A Git verziókezelő belső tárolója nem szükséges a futáshoz.

> [!TIP]
> **Miért kötelező a `node_modules` átmásolása?**  
> Mert a fejlesztői géped és az iskolai Windows Server 2016 is azonos, 64 bites Windows architektúrát (`win32-x64`) használ. A készre fordított csomagok átvitelével a szerveren **egyetlenegy `npm install` parancsot sem kell kiadnod**, így kizártak a Python, Visual Studio Build Tools hiányából fakadó fordítási hibák és a letiltott telepítőszkriptek (`install-scripts blocked`)!

---

### 1.4. Döntés az adatbázisról (`data/ropdolgozat.db`)

* **1. Lehetőség – Tiszta éles indítás (Ajánlott):**  
  Ne másold át a fejlesztői `ropdolgozat.db` fájlt. A szerveren az első indításkor a `start_server.bat` automatikusan létrehozza a tiszta adatbázist a hivatalos tantárgyakkal és a minta osztálynévsorral.
* **2. Lehetőség – Meglévő adatok és tesztek átvitele:**  
  Amennyiben a fejlesztői gépen már rögzítettél feladatsorokat vagy osztálynévsorokat, amelyeket azonnal használni szeretnél, a `data/ropdolgozat.db` fájlt is másold át a pendrive-ra a `data/` almappába.

---

## 2. Telepítés és Beállítás a Windows Server 2016 Gépen

Csatlakoztasd a pendrive-ot a Windows Server 2016 kiszolgálóhoz.

### 2.1. Lépés: Mappa másolása a kiszolgáló gyökerébe
1. Nyisd meg a Fájlkezelőt a szerveren.
2. Másold át a pendrive-ról a teljes `Ropdolgozat` mappát közvetlenül a `C:\` meghajtó gyökerébe:  
   👉 **`C:\Ropdolgozat\`**

---

### 2.2. Lépés: A Node.js v22 LTS telepítése
1. Indítsd el a pendrive-ról a **Node.js v22.x LTS telepítőt** (`node-v22...-x64.msi`).
2. A telepítővarázslóban fogadd el a licencfeltételeket, és hagyd meg az alapértelmezett beállításokat (*Next ➔ Next ➔ Install*).
3. A folyamat végén kattints a *Finish* gombra.
4. **Ellenőrzés:**  
   Nyiss egy Parancssort (CMD) vagy PowerShellt, és futtasd:
   ```cmd
   node -v
   ```
   *Elvárt kimenet:* `v22.x.x` (például `v22.13.0` vagy `v22.22.2`).

---

### 2.3. Lépés: Zéró-telepítéses indítás (Nincs szükség npm install-ra!)
Mivel a `node_modules` mappát előre felkészítve átmásoltad a pendrive-ról:
- **NEM kell `npm install`-t futtatni!**
- **NEM kell internet a szerverre!**
- A rendszer azonnal indításra kész.

---

### 2.4. Lépés: Windows Tűzfalszabály létrehozása (3000-es port engedélyezése)
A Windows Server 2016 szigorú bejövő tűzfala alapértelmezetten elutasít minden idegen gépről érkező csatlakozást. A 3000-es portot egyetlen paranccsal engedélyezni kell:

1. Kattints a Start menüre, gépeld be: `PowerShell`.
2. Kattints rá jobb gombbal, és válaszd a **Futtatás rendszergazdaként** lehetőséget.
3. Másold be és futtasd le a következő parancsot:
   ```powershell
   New-NetFirewallRule -DisplayName "Okoskodó Szerver (Port 3000)" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```
4. A parancs sikeres lefutásakor megjelenik a megerősítés (`Enabled: True`, `Action: Allow`).

---

### 2.5. Lépés: A Szerver IP-címének feljegyzése
A Parancssorban vagy PowerShellben futtasd:
```cmd
ipconfig
```
Keresd meg a helyi hálózati csatolót (*Ethernet adapter*), és jegyezd fel az **IPv4 Address** értékét (például `192.168.1.100` vagy `10.0.0.15`).

> [!IMPORTANT]
> Az iskolai hálózatban a szervergépnek statikus (fix) belső IP-címmel kell rendelkeznie, hogy a szerver újraindulásakor se változzon meg a diákok parancsikonjaiban szereplő cím!

---

### 2.6. Lépés: Automatikus indítás beállítása a szerver bekapcsolásakor (Közös Indítópult)
Ahhoz, hogy a dolgozatíró rendszer a szervergép újraindulásakor automatikusan, emberi beavatkozás nélkül elinduljon:

1. Nyomd le a billentyűzeten a **Win + R** billentyűkombinációt (Futtatás ablak).
2. Írd be és nyomj Entert:
   ```cmd
   shell:common startup
   ```
   *(Ez megnyitja a Windows Server közös Indítópult mappáját: `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp`).*
3. Hozz létre ebben a mappában egy **parancsikont**:
   - A `C:\Ropdolgozat\` mappában kattints jobb gombbal a `start_server.bat` fájlra ➔ **Másolás** (`Ctrl + C`).
   - Az Indítópult mappában kattints jobb gombbal az üres területre ➔ **„Parancsikon beillesztése”** (Paste shortcut).
   - Nevezd át a parancsikont erre: **„Okoskodó Szerver Indítása”**.

> [!WARNING]
> **Kritikus szabály:** Kifejezetten tilos magát a `start_server.bat` fájlt áthelyezni az Indítópultba! Csak a parancsikont szabad odailleszteni, hogy a program a saját mappájában (`C:\Ropdolgozat\`) induljon el.

---

## 3. A Rendszer Indítása és Ellenőrzése a Szerveren

1. Lépj be a `C:\Ropdolgozat\` könyvtárba.
2. Kattints duplán a **`start_server.bat`** parancsfájlra.
3. Az új, önellenőrző indítószkript másodpercek alatt végrehajtja a diagnosztikát:
   - Megvizsgálja, hogy a Node.js telepítve van-e és eléri-e a minimum v22-es verziót.
   - Ellenőrzi a `node_modules` meglétét.
   - Automatikusan létrehozza a `data` és `data\uploads` mappákat, ha nem léteztek.
   - Inicializálja és ellenőrzi az SQLite adatbázis sémaintegritását.
   - Elindítja a webszervert.
4. Megjelenik a bekeretezett sikeres indítási képernyő:
   ```text
   ================================================================
     Röpdolgozat program szerver elindult a(z) 3000-es porton!
   ----------------------------------------------------------------
     Helyi elérés (Localhost):   http://localhost:3000
     Hálózati elérés (LAN IP):   http://<szerver_ip>:3000
   ----------------------------------------------------------------
     Tanári vezérlőpult:         http://localhost:3000/admin
     Kivetítő monitor:           http://localhost:3000/projector
   ================================================================
   ```
5. Nyisd meg a böngészőt a szerveren, és nyisd meg a `http://localhost:3000/admin` címet.  
   *(Alapértelmezett tanári PIN: **`admin123`**).*

---

## 4. Tantermi Gépek Előkészítése (Diákok és Tanár)

### 4.1. Diák munkaállomások előkészítése (1–42. gép)
A szaktanterem 42 tanulói számítógépén készíts egy asztali parancsikont a böngészőhöz.

1. **Parancsikon létrehozása:**  
   Jobb klikk a diák gép Asztalán ➔ *Új* ➔ *Parancsikon*.
2. **Cél megadása (a szerver IP-címével és a gép azonosítójával):**
   * 1. gép: `http://<szerver_ip>:3000/?gep=1`
   * 2. gép: `http://<szerver_ip>:3000/?gep=2`
   * ...
   * 42. gép: `http://<szerver_ip>:3000/?gep=42`
3. **Parancsikon elnevezése:** **„Okoskodó – Röpdolgozat”**.
4. **Ikon:** Választható hozzá a böngésző ikonja, vagy az alkalmazás saját narancssárga ikonja.

> [!TIP]
> **Tantermi kioszk mód (opcionális teljes képernyő):**  
> Ha el akarod kerülni, hogy a diákok elnavigáljanak, a parancsikon céljába beírható a böngésző kioszk kapcsolója:  
> `chrome.exe --kiosk http://<szerver_ip>:3000/?gep=1` vagy `msedge.exe --kiosk http://<szerver_ip>:3000/?gep=1 --edge-kiosk-type=fullscreen`.

### 4.2. Tanári vezérlő és kivetítő monitor elérése
A tanár a tantermi gépről vagy laptopról bármelyik böngészőből eléri a felületeket:
* **Privát Tanári Vezérlőpult:** `http://<szerver_ip>:3000/admin` *(PIN: `admin123`)*
* **Tantermi Kivetítő (Projektor):** `http://<szerver_ip>:3000/projector`

---

## 5. Hibaelhárítási Útmutató (Gyakori Kérdések és Esetek)

### 1. A `start_server.bat` indításkor hibát jelez: „Nem megfelelő Node.js verzió”
* **Ok:** A szerveren régebbi Node.js (pl. v20) vagy nem támogatott verzió van fent.
* **Megoldás:** Töröld le a régi verziót a Windows Programok telepítése és törlése menüjében, és telepítsd fel a pendrive-ról a hivatalos **Node.js v22.x LTS (x64)** telepítőt.

### 2. A diák gépen a böngésző kiírja: „A webhely nem érhető el” (ERR_CONNECTION_TIMED_OUT)
* **Ok:** A Windows Server 2016 tűzfala zárva van a 3000-es porton, vagy elgépelted a szerver IP-címét.
* **Megoldás:**
  1. Ellenőrizd az IP-címet a szerveren (`ipconfig`).
  2. Futtasd le újra a [2.4. pontban](#24-lépés-windows-tűzfalszabály-létrehozása-3000-es-port-engedélyezése) megadott PowerShell tűzfalparancsot rendszergazdaként.
  3. Teszteld le a diák gépről a hálózati elérhetőséget: `ping <szerver_ip>`.

### 3. A diák véletlenül bezárta a böngészőt dolgozat közben
* **Megoldás:** Nincs adatvesztés. A diák újra rákattint az Asztalon lévő parancsikonra (`/?gep=X`), a rendszer azonnal felismeri a tanulót a token alapján, és ott folytatja a dolgozatot, ahol abbahagyta.

### 4. Hogyan módosítható a tanári belépési PIN-kód?
A szerveren nyisd meg a `C:\Ropdolgozat\config.js` fájlt:
```javascript
adminPin: process.env.ADMIN_PIN || 'admin123',
```
Írd át az `'admin123'` szöveget a saját jelszavadra, majd mentsd el a fájlt.
