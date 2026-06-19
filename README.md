# Soko la Mkulima - Mfumo wa USSD

Hii ni mfano wa mfumo wa USSD unaowawezesha wakulima kuangalia bei za mazao
na kutangaza mazao yao kwa wanunuzi, kupitia simu ya kawaida (hauhitaji intaneti
upande wa mtumiaji).

## VITU UNAVYOHITAJI KABLA YA KUANZA

1. **Node.js** imesakinishwa kwenye kompyuta yako
   - Pakua kutoka https://nodejs.org (chagua toleo la LTS)
   - Thibitisha kwa kuandika kwenye terminal: `node --version`

2. **Akaunti ya Africa's Talking** (bure kwa majaribio/sandbox)
   - Jisajili kwenye https://account.africastalking.com
   - Hii ndiyo itakayokupa namba fupi ya USSD ya majaribio (k.m. *384*XXXXX#)

3. **Ngrok** (kuruhusu Africa's Talking kufikia server yako wakati bado iko
   kwenye kompyuta yako, kabla hujaipandisha kwenye intaneti/hosting)
   - Pakua kutoka https://ngrok.com

## HATUA ZA KUENDESHA

### Hatua 1: Pakua faili hizi
Hakikisha una folder yenye faili mbili: `index.js` na `package.json`

### Hatua 2: Fungua Terminal/Command Prompt kwenye folder hii
```bash
cd njia/kuelekea/soko-la-mkulima
```

### Hatua 3: Sakinisha "express" (library ya kutengeneza server)
```bash
npm install express
```
Hii itatengeneza folder ya `node_modules` - usiifute, inahitajika.

### Hatua 4: Endesha server
```bash
node index.js
```
Ukifanikiwa utaona: `Server inaendesha kwenye http://localhost:3000`

### Hatua 5: Jaribu kama inafanya kazi
Fungua browser, nenda http://localhost:3000
Ukiona "Soko la Mkulima USSD server inafanya kazi vizuri!" - umefanikiwa!

### Hatua 6: Unganisha na Africa's Talking (kujaribu USSD halisi)
1. Fungua terminal nyingine (acha ile ya server ikiwa inaendelea kufanya kazi)
2. Endesha: `ngrok http 3000`
3. Itakupa URL ya muda mfano: `https://abc123.ngrok.io`
4. Nenda kwenye dashboard ya Africa's Talking -> USSD -> weka URL hiyo
   pamoja na `/ussd` mwishoni, mfano: `https://abc123.ngrok.io/ussd`
5. Sasa unaweza kupiga namba ya USSD waliyokupa kwenye simulator yao ya
   sandbox na kuona menyu yako ikifanya kazi!

## MUUNDO WA CODE (index.js)

- `beiZaMazao` - hapa ndipo bei za mazao zimehifadhiwa (kwa sasa ni data ya
  mfano - baadaye unaweza kuziunganisha na database halisi kama MySQL au
  MongoDB)
- `matangazo` - orodha ya matangazo ya wakulima
- `app.post("/ussd", ...)` - hii ndiyo "moyo" wa mfumo, inapokea kila
  hatua ya menyu na kuamua nini cha kuonyesha

## HATUA ZINAZOFUATA (baada ya hii kufanya kazi)

1. Badilisha data ya bei kutoka "hardcoded" kwenda database halisi
2. Ongeza menyu ya "Wanunuzi" - watu wanaotafuta kununua mazao
3. Weka mfumo kwenye hosting halisi (Render.com, Railway.app - zina free
   tier nzuri kwa kuanzia) ili isihitaji kompyuta yako kuwa wazi muda wote
4. Ongeza namba fupi halisi (siyo ya sandbox) - hii inahitaji malipo kidogo
   kwa Africa's Talking au Beem
