// SOKO LA MKULIMA - Mfumo wa USSD kwa wakulima
// Toleo hili linatumia DATABASE (PostgreSQL) badala ya data ya "hardcoded"

const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Kuunganisha na database (DATABASE_URL inatoka kwenye Environment Variable ya Render)
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
1. Angalia Bei za Zao
2. Tangaza Mazao Yako
3. Tazama Matangazo
4. Jisajili`;
    } else if (majibu[0] === "1") {
      // ANGALIA BEI
      if (majibu.length === 1) {
        const result = await pool.query(
          "SELECT DISTINCT zao FROM bei_mazao ORDER BY zao"
        );
        const mazao = result.rows.map((r) => r.zao);
        response =
          "CON Chagua zao:\n" +
          mazao.map((z, i) => `${i + 1}. ${capitalize(z)}`).join("\n");
      } else if (majibu.length === 2) {
        const result = await pool.query(
          "SELECT DISTINCT zao FROM bei_mazao ORDER BY zao"
        );
        const mazao = result.rows.map((r) => r.zao);
        const zao = mazao[parseInt(majibu[1]) - 1];

        if (!zao) {
          response = "END Chaguo si sahihi. Jaribu tena.";
        } else {
          const mikoaResult = await pool.query(
            "SELECT mkoa FROM bei_mazao WHERE zao = $1 ORDER BY mkoa",
            [zao]
          );
          const mikoa = mikoaResult.rows.map((r) => r.mkoa);
          response =
            "CON Chagua mkoa:\n" +
            mikoa.map((m, i) => `${i + 1}. ${m}`).join("\n");
        }
      } else if (majibu.length === 3) {
        const zaoResult = await pool.query(
          "SELECT DISTINCT zao FROM bei_mazao ORDER BY zao"
        );
        const mazao = zaoResult.rows.map((r) => r.zao);
        const zao = mazao[parseInt(majibu[1]) - 1];

        const mikoaResult = await pool.query(
          "SELECT mkoa, bei FROM bei_mazao WHERE zao = $1 ORDER BY mkoa",
          [zao]
        );
        const chaguo = mikoaResult.rows[parseInt(majibu[2]) - 1];

        if (!chaguo) {
          response = "END Chaguo si sahihi. Jaribu tena.";
        } else {
          response = `END Bei ya ${zao} mkoa wa ${chaguo.mkoa} ni TZS ${chaguo.bei} kwa kilo.`;
        }
      }
    } else if (majibu[0] === "2") {
      // TANGAZA MAZAO
      if (majibu.length === 1) {
        response = "CON Andika jina la zao unalouza:";
      } else if (majibu.length === 2) {
        response = "CON Andika idadi ya magunia:";
      } else if (majibu.length === 3) {
        const zao = majibu[1];
        const idadi = majibu[2];

        await pool.query(
          "INSERT INTO matangazo (zao, idadi, phone_number) VALUES ($1, $2, $3)",
          [zao, idadi, phoneNumber]
        );

        response = `END Asante! Tangazo lako la ${zao} (magunia ${idadi}) limepokelewa.`;
      }
    } else if (majibu[0] === "3") {
      // TAZAMA MATANGAZO (5 ya mwisho)
      const result = await pool.query(
        "SELECT zao, idadi FROM matangazo ORDER BY tarehe DESC LIMIT 5"
      );

      if (result.rows.length === 0) {
        response = "END Hakuna matangazo kwa sasa.";
      } else {
        const orodha = result.rows
          .map((m) => `${m.zao} - magunia ${m.idadi}`)
          .join("\n");
        response = `END Matangazo ya hivi karibuni:\n${orodha}`;
      }
    } else if (majibu[0] === "4") {
      // JISAJILI - usajili wa mkulima
      if (majibu.length === 1) {
        response = "CON Weka Jina Lako";
      } else if (majibu.length === 2) {
        response = "CON Mkoa wako";
      } else if (majibu.length === 3) {
        response = "CON Wilaya yako";
      } else if (majibu.length === 4) {
        const jina = majibu[1];
        const mkoa = majibu[2];
        const wilaya = majibu[3];

        await pool.query(
          "INSERT INTO wakulima (jina, mkoa, wilaya, phone_number) VALUES ($1, $2, $3, $4)",
          [jina, mkoa, wilaya, phoneNumber]
        );

        response = "END Umesajiliwa Kikamilifu";
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

// Kazi ndogo ya kuandika herufi kubwa mwanzoni mwa neno
function capitalize(neno) {
  return neno.charAt(0).toUpperCase() + neno.slice(1);
}

app.get("/", (req, res) => {
  res.send("Soko la Mkulima USSD server inafanya kazi vizuri! (Toleo la Database)");
});

// ROUTE YA MUDA: kutengeneza majedwali ya database (sasa imefungwa na "siri")
// Kuitumia: https://yoursite.onrender.com/setup-database?siri=SIRI_YAKO
app.get("/setup-database", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi. Siri si sahihi.");
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS matangazo (
        id SERIAL PRIMARY KEY,
        zao VARCHAR(100) NOT NULL,
        idadi VARCHAR(50) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS wakulima (
        id SERIAL PRIMARY KEY,
        jina VARCHAR(100) NOT NULL,
        mkoa VARCHAR(50) NOT NULL,
        wilaya VARCHAR(50) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query("DELETE FROM bei_mazao");
    await pool.query(`
      INSERT INTO bei_mazao (zao, mkoa, bei) VALUES
      ('mahindi', 'Dodoma', 800),
      ('mahindi', 'Mbeya', 750),
      ('mahindi', 'Morogoro', 820),
      ('mpunga', 'Mbeya', 1200),
      ('mpunga', 'Morogoro', 1300),
      ('mpunga', 'Shinyanga', 1100),
      ('maharage', 'Dodoma', 1800),
      ('maharage', 'Songwe', 1700);
    `);

    res.send("✅ Database imetengenezwa kikamilifu! Sasa unaweza kufuta route hii kwenye code.");
  } catch (err) {
    res.status(500).send("❌ Tatizo: " + err.message);
  }
});

// ---- UKURASA WA ADMIN: kuona na kubadilisha bei bila kuandika code ----
// Fungua: https://yoursite.onrender.com/admin?siri=SIRI_YAKO
app.get("/admin", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi. Ongeza ?siri=SIRI_YAKO mwishoni mwa URL.");
  }
  try {
    const result = await pool.query("SELECT * FROM bei_mazao ORDER BY zao, mkoa");
    const safeSiri = encodeURIComponent(req.query.siri);

    const rows = result.rows
      .map(
        (r) => `
        <tr>
          <td>${r.zao}</td>
          <td>${r.mkoa}</td>
          <td>${r.bei}</td>
          <td>
            <form method="POST" action="/admin/futa?siri=${safeSiri}" style="display:inline">
              <input type="hidden" name="id" value="${r.id}">
              <button type="submit">Futa</button>
            </form>
          </td>
        </tr>`
      )
      .join("");

    res.send(`
      <html>
      <head>
        <title>Admin - Soko la Mkulima</title>
        <style>
          body { font-family: sans-serif; max-width: 700px; margin: 40px auto; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          input { padding: 6px; margin-right: 5px; }
          button { padding: 6px 12px; }
        </style>
      </head>
      <body>
        <h2>Simamia Bei za Mazao</h2>

        <h3>Ongeza bei mpya</h3>
        <form method="POST" action="/admin/ongeza?siri=${safeSiri}">
          <input name="zao" placeholder="Zao (mfano: mahindi)" required>
          <input name="mkoa" placeholder="Mkoa (mfano: Dodoma)" required>
          <input name="bei" placeholder="Bei (mfano: 800)" type="number" required>
          <button type="submit">Ongeza</button>
        </form>

        <h3>Bei zilizopo</h3>
        <table>
          <tr><th>Zao</th><th>Mkoa</th><th>Bei (TZS)</th><th></th></tr>
          ${rows}
        </table>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Tatizo: " + err.message);
  }
});

app.post("/admin/ongeza", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi.");
  }
  const { zao, mkoa, bei } = req.body;
  await pool.query(
    "INSERT INTO bei_mazao (zao, mkoa, bei) VALUES ($1, $2, $3)",
    [zao.toLowerCase().trim(), mkoa.trim(), bei]
  );
  res.redirect("/admin?siri=" + encodeURIComponent(req.query.siri));
});

app.post("/admin/futa", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi.");
  }
  await pool.query("DELETE FROM bei_mazao WHERE id = $1", [req.body.id]);
  res.redirect("/admin?siri=" + encodeURIComponent(req.query.siri));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server inaendesha kwenye port ${PORT}`);
});
