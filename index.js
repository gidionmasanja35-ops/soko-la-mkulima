// SOKO LA MKULIMA - Mfumo wa USSD kwa wakulima
// Faili hii ndiyo "ubongo" wa mfumo - inapokea maombi ya USSD na kujibu

const express = require("express");
const app = express();

// Hii inaruhusu server kusoma data inayotumwa na USSD Gateway
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---- DATA YA MFANO (baadaye itatoka kwenye database halisi) ----
const beiZaMazao = {
  mahindi: { Dodoma: 800, Mbeya: 750, Morogoro: 820 },
  mpunga: { Mbeya: 1200, Morogoro: 1300, Shinyanga: 1100 },
  maharage: { Dodoma: 1800, Songwe: 1700 },
};

// Hapa tutahifadhi matangazo ya wakulima (kwa muda, kwenye memory)
let matangazo = [];

// ---- ROUTE KUU YA USSD ----
// USSD Gateway (mfano Africa's Talking) itatuma POST request hapa
app.post("/ussd", (req, res) => {
  // Data inayotumwa na gateway kawaida ina: sessionId, phoneNumber, text
  const { sessionId, phoneNumber, text } = req.body;

  // "text" ina historia ya majibu yote ya mtumiaji, yametenganishwa na *
  // mfano: "" (mwanzo), "1", "1*mahindi", "1*mahindi*Dodoma"
  const majibu = text ? text.split("*") : [];
  let response = "";

  if (text === "" || text === undefined) {
    // HATUA YA 0: Menyu kuu
    response = `CON Karibu Soko la Mkulima
1. Angalia bei ya zao
2. Tangaza mazao yako
3. Tazama matangazo`;
  } else if (majibu[0] === "1") {
    // ANGALIA BEI
    if (majibu.length === 1) {
      response = `CON Chagua zao:
1. Mahindi
2. Mpunga
3. Maharage`;
    } else if (majibu.length === 2) {
      const zaoMap = { "1": "mahindi", "2": "mpunga", "3": "maharage" };
      const zao = zaoMap[majibu[1]];
      if (!zao) {
        response = "END Chaguo si sahihi. Jaribu tena.";
      } else {
        const mikoa = Object.keys(beiZaMazao[zao]);
        response = `CON Chagua mkoa:\n` + mikoa.map((m, i) => `${i + 1}. ${m}`).join("\n");
      }
    } else if (majibu.length === 3) {
      const zaoMap = { "1": "mahindi", "2": "mpunga", "3": "maharage" };
      const zao = zaoMap[majibu[1]];
      const mikoa = Object.keys(beiZaMazao[zao]);
      const mkoa = mikoa[parseInt(majibu[2]) - 1];
      const bei = beiZaMazao[zao][mkoa];
      response = `END Bei ya ${zao} mkoa wa ${mkoa} ni TZS ${bei} kwa kilo.`;
    }
  } else if (majibu[0] === "2") {
    // TANGAZA MAZAO
    if (majibu.length === 1) {
      response = `CON Andika jina la zao unalouza:`;
    } else if (majibu.length === 2) {
      response = `CON Andika idadi ya magunia:`;
    } else if (majibu.length === 3) {
      const zao = majibu[1];
      const idadi = majibu[2];
      matangazo.push({ zao, idadi, phoneNumber, tarehe: new Date() });
      response = `END Asante! Tangazo lako la ${zao} (magunia ${idadi}) limepokelewa.`;
    }
  } else if (majibu[0] === "3") {
    // TAZAMA MATANGAZO
    if (matangazo.length === 0) {
      response = "END Hakuna matangazo kwa sasa.";
    } else {
      const orodha = matangazo
        .slice(-5) // matangazo 5 ya mwisho
        .map((m) => `${m.zao} - magunia ${m.idadi}`)
        .join("\n");
      response = `END Matangazo ya hivi karibuni:\n${orodha}`;
    }
  } else {
    response = "END Chaguo si sahihi. Jaribu tena.";
  }

  // USSD Gateway inahitaji "Content-Type: text/plain"
  res.set("Content-Type", "text/plain");
  res.send(response);
});

// Route ndogo ya kuangalia kama server inafanya kazi
app.get("/", (req, res) => {
  res.send("Soko la Mkulima USSD server inafanya kazi vizuri!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server inaendesha kwenye http://localhost:${PORT}`);
});
