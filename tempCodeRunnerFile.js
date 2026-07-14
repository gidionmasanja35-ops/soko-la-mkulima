// SOKO LA MKULIMA - Mfumo wa USSD kwa wakulima
// Toleo lililoboreshwa: Automatic Acceptance & Admin Tracking

const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Kuunganisha na database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ---- ROUTE KUU YA USSD ----
app.post("/ussd", async (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  const majibu = text ? text.split("*") : [];
  let response = "";

  try {
    if (text === "" || text === undefined) {
      // HATUA YA 0: Menyu kuu
      response = `CON Karibu Soko la Mkulima
1. Angalia bei ya zao
2. Tangaza mazao yako
3. Tazama matangazo`;
    } else if (majibu[0] === "1") {
      // --- ANGALIA BEI ---
      if (majibu.length === 1) {
        const result = await pool.query(
          "SELECT DISTINCT zao FROM bei_mazao ORDER BY zao",
        );
        const mazao = result.rows.map((r) => r.zao);
        response =
          "CON Chagua zao:\n" +
          mazao.map((z, i) => `${i + 1}. ${capitalize(z)}`).join("\n");
      } else if (majibu.length === 2) {
        const result = await pool.query(
          "SELECT DISTINCT zao FROM bei_mazao ORDER BY zao",
        );
        const mazao = result.rows.map((r) => r.zao);
        const zao = mazao[parseInt(majibu[1]) - 1];

        if (!zao) {
          response = "END Chaguo si sahihi. Jaribu tena.";
        } else {
          const mikoaResult = await pool.query(
            "SELECT mkoa FROM bei_mazao WHERE zao = $1 ORDER BY mkoa",
            [zao],
          );
          const mikoa = mikoaResult.rows.map((r) => r.mkoa);
          response =
            "CON Chagua mkoa:\n" +
            mikoa.map((m, i) => `${i + 1}. ${m}`).join("\n");
        }
      } else if (majibu.length === 3) {
        const zaoResult = await pool.query(
          "SELECT DISTINCT zao FROM bei_mazao ORDER BY zao",
        );
        const mazao = zaoResult.rows.map((r) => r.zao);
        const zao = mazao[parseInt(majibu[1]) - 1];

        const mikoaResult = await pool.query(
          "SELECT mkoa, bei FROM bei_mazao WHERE zao = $1 ORDER BY mkoa",
          [zao],
        );
        const chaguo = mikoaResult.rows[parseInt(majibu[2]) - 1];

        if (!chaguo) {
          response = "END Chaguo si sahihi. Jaribu tena.";
        } else {
          response = `END Bei ya ${zao} mkoa wa ${chaguo.mkoa} ni TZS ${chaguo.bei} kwa kilo.`;
        }
      }
    } else if (majibu[0] === "2") {
      // --- TANGAZA MAZAO NA THIBITISHA BEI (AUTOMATIC) ---
      if (majibu.length === 1) {
        response = "CON Andika jina la zao unalouza (mfano: mahindi):";
      } else if (majibu.length === 2) {
        response = "CON Andika idadi ya magunia:";
      } else if (majibu.length === 3) {
        // Mkulima ameweka zao na idadi, sasa tunamwomba mkoa ili tupate bei elekezi
        response = "CON Andika mkoa uliopo (mfano: Dodoma):";
      } else if (majibu.length === 4) {
        const zao = majibu[1].toLowerCase().trim();
        const idadi = majibu[2].trim();
        const mkoa = majibu[3].trim();

        // Tafuta bei ya mfano kutoka kwenye bei_mazao
        const beiResult = await pool.query(
          "SELECT bei FROM bei_mazao WHERE zao = $1 AND LOWER(mkoa) = LOWER($2) LIMIT 1",
          [zao, mkoa],
        );

        // Kama bei haipo, weka bei ya kawaida (Default mfano 800)
        const beiKilo = beiResult.rows.length > 0 ? beiResult.rows[0].bei : 800;
        const beiGunia = beiKilo * 100; // Mfano gunia 1 ni kilo 100

        // Muombe mkulima athibitishe kama anakubali bei hiyo elekezi ya soko
        response = `CON Bei ya ${capitalize(zao)} ${mkoa} ni TZS ${beiKilo}/kilo (TZS ${beiGunia}/gunia). Je, unakubali kuuza kwa bei hii?
1. Ndio, Nakubali
2. Hapana, Kataa`;
      } else if (majibu.length === 5) {
        const zao = majibu[1].toLowerCase().trim();
        const idadi = majibu[2].trim();
        const mkoa = majibu[3].trim();
        const thibitisho = majibu[4].trim();

        // Tafuta bei tena kwa ajili ya kuihifadhi
        const beiResult = await pool.query(
          "SELECT bei FROM bei_mazao WHERE zao = $1 AND LOWER(mkoa) = LOWER($2) LIMIT 1",
          [zao, mkoa],
        );
        const beiKilo = beiResult.rows.length > 0 ? beiResult.rows[0].bei : 800;
        const beiGunia = beiKilo * 100;

        let HaliYatangazo = "pending";
        if (thibitisho === "1") {
          HaliYatangazo = "accepted";
          response = `END Asante! Tangazo lako la ${capitalize(zao)} limechapishwa rasmi Sokoni.`;
        } else if (thibitisho === "2") {
          HaliYatangazo = "rejected";
          response = `END Tangazo lako limegaghiriwa kwa sababu umekataa bei ya soko.`;
        } else {
          response = `END Chaguo si sahihi. Tangazo lako limebaki kama Pending.`;
        }

        // Ingiza kwenye database ikiwa na STATUS halisi na BEI
        await pool.query(
          "INSERT INTO matangazo (zao, idadi, bei, phone_number, mkoa, status) VALUES ($1, $2, $3, $4, $5, $6)",
          [zao, idadi, beiGunia, phoneNumber, mkoa, HaliYatangazo],
        );
      }
    } else if (majibu[0] === "3") {
      // --- TAZAMA MATANGAZO (Yaliyokubalika tu yaani 'accepted') ---
      const result = await pool.query(
        "SELECT zao, idadi, mkoa FROM matangazo WHERE status = 'accepted' ORDER BY tarehe DESC LIMIT 5",
      );

      if (result.rows.length === 0) {
        response = "END Hakuna matangazo yaliyothibitishwa kwa sasa.";
      } else {
        const orodha = result.rows
          .map((m) => `${capitalize(m.zao)} (${m.mkoa}) - magunia ${m.idadi}`)
          .join("\n");
        response = `END Matangazo ya hivi karibuni:\n${orodha}`;
      }
    } else {
      response = "END Chaguo si sahihi. Jaribu tena.";
    }
  } catch (err) {
    console.error("Database error:", err.message);
    response = "END Samahani, kuna tatizo la mfumo. Jaribu tena baadaye.";
  }

  res.set("Content-Type", "text/plain");
  res.send(response);
});

function capitalize(neno) {
  return neno.charAt(0).toUpperCase() + neno.slice(1);
}

app.get("/", (req, res) => {
  res.send("Server ya Soko la Mkulima ipo hai!");
});

// --- REKEBISHA DATABASE YOTE MARA MOJA ---
app.get("/setup-database", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi.");
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bei_mazao (
        id SERIAL PRIMARY KEY,
        zao VARCHAR(50) NOT NULL,
        mkoa VARCHAR(50) NOT NULL,
        bei INTEGER NOT NULL,
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);

    // Tunatengeneza upya matangazo iwe na column ya 'status' na 'mkoa' na 'bei'
    await pool.query("DROP TABLE IF EXISTS matangazo;");
    await pool.query(`
      CREATE TABLE matangazo (
        id SERIAL PRIMARY KEY,
        zao VARCHAR(100) NOT NULL,
        idadi VARCHAR(50) NOT NULL,
        bei INTEGER NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        mkoa VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);

    res.send("✅ Database imesafishwa na kusetiwa upya kwa mafanikio!");
  } catch (err) {
    res.status(500).send("❌ Tatizo: " + err.message);
  }
});

// ---- UKURASA WA ADMIN (BEI + MATANGAZO YOTE AUTOMATIC) ----
app.get("/admin", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi.");
  }
  try {
    const beiResult = await pool.query(
      "SELECT * FROM bei_mazao ORDER BY zao, mkoa",
    );
    const matangazoResult = await pool.query(
      "SELECT * FROM matangazo ORDER BY tarehe DESC",
    );
    
    // 1. VUTA DATA YA MAOMBI YA WANUNUZI (BUYER REQUESTS) KUTOKA DATABASE
    const maombiResult = await pool.query(
      "SELECT * FROM buyer_requests ORDER BY tarehe DESC LIMIT 20",
    );

    const safeSiri = encodeURIComponent(req.query.siri);

    const beiRows = beiResult.rows
      .map(
        (r) => `
        <tr>
          <td>${r.zao}</td><td>${r.mkoa}</td><td>${r.bei}</td>
          <td>
            <form method="POST" action="/admin/futa?siri=${safeSiri}" style="display:inline">
              <input type="hidden" name="id" value="${r.id}"><button type="submit" style="color:red; cursor:pointer;">Futa</button>
            </form>
          </td>
        </tr>`,
      )
      .join("");

    const matangazoRows = matangazoResult.rows
      .map((m) => {
        let rangi = "#f59e0b"; // Njano kwa pending
        if (m.status === "accepted") rangi = "#10b981"; // Kijani
        if (m.status === "rejected") rangi = "#ef4444"; // Nyekundu

        return `
        <tr>
          <td>${m.phone_number}</td><td>${capitalize(m.zao)}</td><td>${m.idadi}</td><td>TZS ${m.bei}</td><td>${m.mkoa}</td>
          <td style="color: white; background-color: ${rangi}; font-weight: bold; text-align: center;">
            ${m.status.toUpperCase()}
          </td>
        </tr>`;
      })
      .join("");

    // 2. TENGENEZA SAFA (ROWS) ZA HTML KWA AJILI YA MAOMBI YA WANUNUZI
    const maombiRows = maombiResult.rows
      .map(
        (m) => `
        <tr>
          <td>${m.phone_number}</td>
          <td>${capitalize(m.zao)}</td>
          <td>${m.idadi}</td>
          <td>${m.mkoa}</td>
          <td>${new Date(m.tarehe).toLocaleDateString("sw-TZ")}</td>
        </tr>`,
      )
      .join("");

    res.send(`
      <html>
      <head><title>Admin Dashboard</title>
        <style>
          body { font-family: sans-serif; max-width: 1000px; margin: 40px auto; padding: 0 20px; background-color: #f9fafb; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 40px; background-color: #white; }
          th, td { border: 1px solid #ccc; padding: 10px; text-align: left; }
          th { background-color: #f3f4f6; }
          input { padding: 6px; margin-right: 5px; }
          button { padding: 6px 12px; cursor: pointer; }
          .container { background: #ffffff; padding: 25px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🌱 Simamia Mfumo wa Soko la Mkulima</h2>
          <hr style="margin-bottom: 25px;" />
          
          <h3>1. Bei za Mazao Elekezi</h3>
          <form method="POST" action="/admin/ongeza?siri=${safeSiri}">
            <input name="zao" placeholder="Zao" required>
            <input name="mkoa" placeholder="Mkoa" required>
            <input name="bei" placeholder="Bei" type="number" required>
            <button type="submit">Ongeza Bei</button>
          </form>
          <table>
            <tr><th>Zao</th><th>Mkoa</th><th>Bei (TZS/Kilo)</th><th>Kitendo</th></tr>
            ${beiRows}
          </table>

          <h3>2. Maombi ya Ununuzi ya Jumla (Kutoka Flutter kwenda USSD namba 5)</h3>
          <table>
            <tr style="background-color: #e5e7eb;">
              <th>Namba ya Mnunuzi</th>
              <th>Zao Linalohitajika</th>
              <th>Idadi (Magunia)</th>
              <th>Mkoa Husika</th>
              <th>Tarehe ya Ombi</th>
            </tr>
            ${maombiRows ? maombiRows : '<tr><td colspan="5" style="text-align:center; color:#6b7280;">Hakuna maombi ya jumla kutoka kwa wanunuzi kwa sasa.</td></tr>'}
          </table>

          <h3>3. Hali ya Matangazo ya Wakulima (Orodha ya USSD)</h3>
          <table>
            <tr><th>Namba ya Mkulima</th><th>Zao</th><th>Idadi (Magunia)</th><th>Bei ya Gunia</th><th>Mkoa</th><th>Hali (Status)</th></tr>
            ${matangazoRows}
          </table>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Tatizo: " + err.message);
  }
});

app.post("/admin/ongeza", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET)
    return res.status(403).send("Hairuhusiwi.");
  const { zao, mkoa, bei } = req.body;
  await pool.query(
    "INSERT INTO bei_mazao (zao, mkoa, bei) VALUES ($1, $2, $3)",
    [zao.toLowerCase().trim(), mkoa.trim(), bei],
  );
  res.redirect("/admin?siri=" + encodeURIComponent(req.query.siri));
});

app.post("/admin/futa", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET)
    return res.status(403).send("Hairuhusiwi.");
  await pool.query("DELETE FROM bei_mazao WHERE id = $1", [req.body.id]);
  res.redirect("/admin?siri=" + encodeURIComponent(req.query.siri));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server inaendesha kwenye port ${PORT}`);
});
