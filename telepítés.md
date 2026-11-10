# Részletes Telepítési és Üzembe Helyezési Útmutató (telepítés.md)

> **Rendszer:** Röpdolgozat program – 100% Offline Iskolai Helyi Hálózatos Dolgozatíró Rendszer  
> **Célkörnyezet:** 1 db Windows Server 2022 központi szervergép + 42 db Windows 10 tanulói kliensgép + tanári munkaállomások  
> **Dokumentum célja:** Lépésről lépésre követhető, teljes körű útmutató a rendszer pendrive-ra másolásához, a szervergépre történő átviteléhez, konfigurálásához és éles tantermi indításához.

---

## 1. Előkészületek a Fejlesztői (Jelenlegi) Számítógépen

Mielőtt a szervergéphez lépsz, készíts elő egy pendrive-ot.

### 1.1. Letöltendő telepítő a pendrive-ra (Ajánlott lépés)
Ha a Windows Server 2022 szervergép zárt hálózaton van, és nincs közvetlen internetkapcsolata, a jelenlegi internetes gépeden töltsd le a Node.js hivatalos telepítőjét a pendrive gyökerébe:
* **Hivatalos letöltési cím:** [https://nodejs.org](https://nodejs.org)
* **Szükséges változat:** **Node.js LTS (v20.x vagy v22.x) Windows x64 telepítő (.msi)** (például `node-v20.18.0-x64.msi`).

---

### 1.2. Milyen állományokat KELL átmásolni a pendrive-ra?

A jelenlegi fejlesztői mappából (`d:\dev\Röpdolgozat program\`) másold át az alábbi mappákat és fájlokat a pendrive-ra (például egy `Ropdolgozat` nevű mappába):

```text
📁 Ropdolgozat/
├── 📁 public/                 # Teljes kliensoldali webfelület (HTML, CSS, JS, ikonok)
├── 📁 src/                    # Teljes szerveroldali forráskód (adatbázis, útvonalak, szolgáltatások)
├── 📁 data/                   # Adatmappa
│   └── 📁 uploads/            # Képek mappája (a .gitkeep fájllal)
├── 📄 server.js               # A központi Express és Socket.io webszerver
├── 📄 config.js               # Konfigurációs beállítások (port: 3000, PIN, elérési utak)
├── 📄 package.json            # Függőségek és indítási szkriptek leírója
├── 📄 package-lock.json       # Csomagverziók zárolt leírása
├── 📄 start_server.bat        # Windows indítószkript (dupla kattintással indítható)
├── 📄 DATABASE_SCHEMA.sql     # Adatbázisséma és triggerek definíciója
├── 📄 README.md               # Rendszerleírás és dokumentáció
├── 📄 CHANGELOG.md            # Verziótörténet és változási napló
└── 📄 telepítés.md            # Ez a részletes telepítési útmutató
```

---

### 1.3. Mit NEM SZABAD átmásolni a pendrive-ra?

* ❌ **`node_modules/` mappa:**  
  *Ha a szervernek van internetkapcsolata:* Ne másold át! A szerveren lefutó `npm install` parancs közvetlenül a szerver környezetéhez fordítja le a natív modulokat (mint a `better-sqlite3`).  
  *Kivétel (100% internet nélküli szerver esetén):* Ha a szerverre egyáltalán nem köthető internet, és mindkét gépen pontosan ugyanaz a 64 bites Windows és Node.js fut, a `node_modules` mappa is átmásolható, de az online `npm install` a hivatalos és tiszta módszer.
* ❌ **`scratch/` mappa:** A fejlesztői tesztszkriptek és ideiglenes fájlok nem szükségesek az éles szerverre.
* ❌ **`.git/` rejtett mappa:** Verziókezelő belső adatai nem kellenek a futáshoz.

---

### 1.4. Döntés az adatbázisról (`data/ropdolgozat.db`)

* **1. Lehetőség – Tiszta indítás (Ajánlott éles környezetben):**  
  Ne másold át a `ropdolgozat.db` fájlt. A szerveren az első indításkor lefutó `npm run init-db` parancs egy tiszta, üres, éles adatbázist hoz létre a hivatalos tantárgyakkal és a minta osztálynévsorral.
* **2. Lehetőség – Meglévő tesztadatok átvitele:**  
  Ha a jelenlegi gépen már rögzítettél feladatsorokat vagy osztálynévsorokat, amelyeket azonnal használni szeretnél, akkor a `data/ropdolgozat.db` fájlt is másold át a pendrive-ra a `data/` mappába.

---

## 2. Telepítés és Beállítás a Windows Server 2022 Gépen

Lépj a Windows Server 2022 kiszolgálóhoz, és csatlakoztasd a pendrive-ot.

### 2.1. Lépés: Mappa létrehozása és fájlok másolása
1. Nyisd meg a Fájlkezelőt a szerveren.
2. Hozz létre egy egyszerű, ékezet- és szóközmentes mappát egy meghajtó gyökerében:  
   👉 **`C:\Ropdolgozat\`** (vagy `D:\Ropdolgozat\`).
3. Másold át a pendrive tartalmát ebbe a mappába.

---

### 2.2. Lépés: A Node.js keretrendszer feltelepítése
1. Indítsd el a pendrive-ról a **Node.js LTS telepítőt** (`node-v...-x64.msi`).
2. A telepítővarázslóban fogadd el a feltételeket, és hagyd meg az alapértelmezett beállításokat (*Next ➔ Next ➔ Install*).
3. A telepítés végén kattints a *Finish* gombra.
4. **Ellenőrzés:**  
   Nyiss egy Parancssort (CMD) vagy PowerShellt, és írd be:
   ```cmd
   node -v
   npm -v
   ```
   Ha mindkét parancs kiírja a verziószámot (például `v20.18.0` és `10.8.2`), a Node.js sikeresen települt.

---

### 2.3. Lépés: Csomagok telepítése és adatbázis előkészítése
1. Nyiss egy Parancssort vagy PowerShellt a szerver célmappájában:
   ```cmd
   cd C:\Ropdolgozat
   ```
2. **Függőségek telepítése (ha a szervernek van internete):**
   ```cmd
   npm install
   ```
   *(Ez a parancs automatikusan felépíti a `node_modules` mappát és lefordítja a helyi SQLite meghajtót).*
3. **Adatbázis inicializálása (amennyiben tiszta indítást választottál):**
   ```cmd
   npm run init-db
   ```
   Kimenetként megjelenik: `✓ Adatbázis sikeresen inicializálva!`.

---

### 2.4. Lépés: Windows Tűzfalszabály létrehozása (3000-es port engedélyezése)
A Windows Server szigorú bejövő tűzfala alapértelmezetten blokkolja az idegen gépek hálózati csatlakozását. Engedélyezni kell a 3000-es portot, hogy a 42 tanulói gép és a tanári munkaállomások elérhessék a felületeket.

1. A szerveren kattints a Start menüre, gépeld be: `PowerShell`.
2. Kattints rá jobb gombbal, és válaszd a **Futtatás rendszergazdaként** lehetőséget.
3. Másold be és futtasd le a következő parancsot:
   ```powershell
   New-NetFirewallRule -DisplayName "Ropdolgozat Szerver (Port 3000)" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```
4. A parancs sikeres lefutásakor megjelenik az engedélyezett szabály összefoglalója (`Enabled: True`, `Action: Allow`).

---

### 2.5. Lépés: A Szerver IP-címének feljegyzése
A Parancssorban vagy PowerShellben futtasd le:
```cmd
ipconfig
```
Keresd meg az aktív helyi hálózati kártyát (például *Ethernet adapter*), és jegyezd fel az **IPv4 Address** (IPv4-cím) értékét.  
*(Példa: `192.168.1.100` vagy `10.0.0.10`).*  
> [!IMPORTANT]
> Az iskolai hálózatban a szervergépnek statikus (fix) IP-címmel kell rendelkeznie, hogy a gép újraindításakor se változzon meg a címe!

---

### 2.6. Lépés: Automatikus indítás beállítása a szerver újraindulásakor (Közös Indítópult)
Annak érdekében, hogy a szervergép újraindulása vagy áramszünet után a dolgozatíró rendszer automatikusan és emberi beavatkozás nélkül elinduljon:

1. Nyomd le a billentyűzeten a **Win + R** billentyűkombinációt (Futtatás ablak).
2. Másold be és nyomj Entert:
   ```cmd
   shell:common startup
   ```
   *(Ez megnyitja a Windows közös, minden felhasználóra érvényes Indítópult mappáját: `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp`).*
3. Hozz létre ebben a mappában egy parancsikont a `start_server.bat` fájlhoz:
   - **1. módszer (Kézi parancsikon):**  
     Kattints jobb gombbal az üres területre ➔ *Új* ➔ *Parancsikon* ➔ Célhely: 👉 **`C:\Ropdolgozat\start_server.bat`** ➔ Név: **„Röpdolgozat Szerver Indítása”**.
   - **2. módszer (A leggyorsabb trükk):**  
     A `C:\Ropdolgozat\` mappában kattints jobb gombbal a `start_server.bat` fájlra ➔ **Másolás** (`Ctrl + C`), majd az Indítópult mappában kattints jobb gombbal az üres területre ➔ **„Parancsikon beillesztése”**.
   > [!WARNING]
   > **Fontos szabály:** Kifejezetten TILOS magát a `start_server.bat` fájlt átmásolni az Indítópultba! Csak a parancsikont szabad idehelyezni, hogy a szerver a saját alkalmazásmappájában (`C:\Ropdolgozat\`) induljon el az adatbázissal és a modulokkal együtt.
4. Ezzel a beállítással a Windows Server minden bekapcsolásakor vagy újraindulásakor a webszerver automatikusan elindul a háttérben, így a diákok azonnal csatlakozni tudnak.

---

## 3. A Rendszer Indítása és Ellenőrzése a Szerveren

1. Nyisd meg a `C:\Ropdolgozat\` mappát.
2. Kattints duplán a **`start_server.bat`** parancsfájlra.
3. Megnyílik egy fekete parancssor ablak, amelyben az alábbi felirat jelenik meg:
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
4. A szervergépen nyiss meg egy böngészőt, és ellenőrizd a működést:
   * Nyisd meg a `http://localhost:3000/admin` címet.
   * Írd be az alapértelmezett PIN-kódot: **`admin123`**.
   * Sikeres belépés után megjelenik a tanári vezérlőpult és az élő mátrix.

---

## 4. Tantermi Gépek Előkészítése (Diákok és Tanár)

### 4.1. Diák munkaállomások előkészítése (1–42. gép)
A szaktanteremben mind a 42 tanulói számítógépen készíts egy asztali parancsikont a böngészőhöz.

1. **Parancsikon létrehozása:**
   * Kattints jobb gombbal a diák gép Asztalán ➔ *Új* ➔ *Parancsikon*.
2. **Cél megadása (a szerver feljegyzett IP-címével és a gép sorszámával):**
   * Az 1. gépen:  
     `http://<szerver_ip>:3000/?gep=1`
   * A 2. gépen:  
     `http://<szerver_ip>:3000/?gep=2`
   * ...
   * A 42. gépen:  
     `http://<szerver_ip>:3000/?gep=42`
3. **Parancsikon elnevezése:**  
   Adj neki tetszetős, egyértelmű nevet, például: **„Röpdolgozat”**.
4. **Ikon beállítása (opcionális):**  
   Tulajdonságok ➔ *Ikoncsere* ➔ válassz egy megfelelő iskolai ikont.

> [!TIP]
> **Tantermi kioszk mód (opcionális):**  
> Ha meg akarod akadályozni, hogy a tanulók elnavigáljanak más oldalakra, a böngésző kioszk módban is indítható a parancsikonból:  
> `chrome.exe --kiosk http://<szerver_ip>:3000/?gep=1` vagy `msedge.exe --kiosk http://<szerver_ip>:3000/?gep=1 --edge-kiosk-type=fullscreen`.

---

### 4.2. Tanári gépek elérése
A tanár a tantermi tanári asztali gépről vagy laptopról bármelyik böngészőből elérheti a rendszert a helyi hálózaton:
* **Privát Tanári Vezérlőpult:**  
  `http://<szerver_ip>:3000/admin` *(PIN: `admin123`)*
* **Tantermi Kivetítő / Projektor (Space Race csapatverseny és anonim statisztika):**  
  `http://<szerver_ip>:3000/projector`

---

## 5. Hibaelhárítási Útmutató (Gyakori Kérdések)

### 1. A diák gépen a böngésző kiírja: „A webhely nem érhető el” (ERR_CONNECTION_TIMED_OUT)
* **Ok:** A Windows Server tűzfala blokkolja a bejövő kapcsolatokat, vagy elgépelted az IP-címet.
* **Megoldás:**
  1. Ellenőrizd a parancsikonban az IP-címet és a portot (`http://` előtag kötelező!).
  2. Futtasd le újra a [2.4. pontban](#24-lépés-windows-tűzfalszabály-létrehozása-3000-es-port-engedélyezése) megadott PowerShell tűzfalszabályt a szerveren rendszergazdaként.
  3. Próbáld meg pingelni a szervert a diák gépről: `ping <szerver_ip>`.

### 2. Hogyan indítható el a szerver úgy, hogy a Windows Server újraindulásakor automatikusan elinduljon?
* **1. Egyszerű módszer (Windows Feladatütemező):**  
  A szerver Feladatütemezőjében (Task Scheduler) hozz létre egy alapszintű feladatot, amely a számítógép indulásakor (*At startup*) rendszergazdai jogosultsággal elindítja a `C:\Ropdolgozat\start_server.bat` fájlt.
* **2. Háttérszolgáltatásként (Windows Service):**  
  Nyiss rendszergazdai Parancssort a szerveren, és az ingyenes `nssm` segédprogrammal vagy a `pm2` csomaggal pár másodperc alatt valódi háttérszolgáltatásként regisztrálható:
  ```cmd
  npm install -g pm2
  npm install -g pm2-windows-service
  pm2-service-install
  pm2 start server.js --name "ropdolgozat"
  pm2 save
  ```

### 3. Hogyan módosítható a tanári PIN-kód?
A szerveren nyisd meg a `C:\Ropdolgozat\config.js` fájlt, és keresd meg az `adminPin` sort:
```javascript
adminPin: process.env.ADMIN_PIN || 'admin123',
```
Írd át az `'admin123'` szöveget a kívánt saját jelszóra, majd indítsd újra a szervert.

