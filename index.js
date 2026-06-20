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

// ---- KAZI YA KUTUMA SMS (Africa's Talking) ----
// Inahitaji: AT_USERNAME na AT_API_KEY kwenye Environment Variables za Render
async function tumaSMS(simu, ujumbe) {
  try {
    const username = process.env.AT_USERNAME; // "sandbox" ukiwa kwenye majaribio
    const apiKey = process.env.AT_API_KEY;

    if (!username || !apiKey) {
      console.log("SMS haijatumwa - AT_USERNAME/AT_API_KEY hazijawekwa");
      return;
    }

    // Sandbox na live zina anwani tofauti za API
    const url =
      username === "sandbox"
        ? "https://api.sandbox.africastalking.com/version1/messaging"
        : "https://api.africastalking.com/version1/messaging";

    const body = new URLSearchParams({
      username,
      to: simu,
      message: ujumbe,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        apiKey,
      },
      body: body.toString(),
    });

    const data = await res.json();
    console.log("SMS imetumwa:", JSON.stringify(data));
  } catch (err) {
    // Tatizo la SMS halizuii mfumo mzima kuendelea kufanya kazi
    console.error("Tatizo la kutuma SMS:", err.message);
  }
}

// ---- ROUTE KUU YA USSD ----
app.post("/ussd", async (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  const majibu = text ? text.split("*") : [];
  let response = "";

  try {
    if (text === "" || text === undefined) {
      // HATUA YA 0: Menyu ya juu kabisa - Mkulima au Mnunuzi
      response = `CON Karibu Soko la Mkulima
1. Mkulima
2. Mnunuzi`;
    } else if (majibu[0] === "1") {
      // ============ UPANDE WA MKULIMA ============
      if (majibu.length === 1) {
        response = `CON Karibu Mkulima
1. Angalia Bei za Zao
2. Tangaza Mazao Yako
3. Tazama Matangazo
4. Jisajili`;
      } else if (majibu[1] === "1") {
        // ANGALIA BEI
        if (majibu.length === 2) {
          const result = await pool.query(
            "SELECT DISTINCT zao FROM bei_mazao ORDER BY zao"
          );
          const mazao = result.rows.map((r) => r.zao);
          response =
            "CON Chagua zao:\n" +
            mazao.map((z, i) => `${i + 1}. ${capitalize(z)}`).join("\n");
        } else if (majibu.length === 3) {
          const result = await pool.query(
            "SELECT DISTINCT zao FROM bei_mazao ORDER BY zao"
          );
          const mazao = result.rows.map((r) => r.zao);
          const zao = mazao[parseInt(majibu[2]) - 1];

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
        } else if (majibu.length === 4) {
          const zaoResult = await pool.query(
            "SELECT DISTINCT zao FROM bei_mazao ORDER BY zao"
          );
          const mazao = zaoResult.rows.map((r) => r.zao);
          const zao = mazao[parseInt(majibu[2]) - 1];

          const mikoaResult = await pool.query(
            "SELECT mkoa, bei FROM bei_mazao WHERE zao = $1 ORDER BY mkoa",
            [zao]
          );
          const chaguo = mikoaResult.rows[parseInt(majibu[3]) - 1];

          if (!chaguo) {
            response = "END Chaguo si sahihi. Jaribu tena.";
          } else {
            response = `END Bei ya ${zao} mkoa wa ${chaguo.mkoa} ni TZS ${chaguo.bei} kwa kilo.`;
          }
        }
      } else if (majibu[1] === "2") {
        // TANGAZA MAZAO
        if (majibu.length === 2) {
          response = "CON Andika jina la zao unalouza:";
        } else if (majibu.length === 3) {
          response = "CON Andika idadi ya magunia:";
        } else if (majibu.length === 4) {
          response = "CON Weka bei kwa gunia (TZS):";
        } else if (majibu.length === 5) {
          const zao = majibu[2];
          const idadi = majibu[3];
          const bei = majibu[4];

          await pool.query(
            "INSERT INTO matangazo (zao, idadi, bei, phone_number) VALUES ($1, $2, $3, $4)",
            [zao, idadi, bei, phoneNumber]
          );

          // Tuma SMS ya uthibitisho kwa mkulima
          await tumaSMS(
            phoneNumber,
            `Tangazo lako la ${capitalize(zao)}\n${idadi} magunia @ TZS ${bei} limepokelewa.`
          );

          response = `END Asante! Tangazo lako la ${zao} (magunia ${idadi} @ TZS ${bei}) limepokelewa.`;
        }
      } else if (majibu[1] === "3") {
        // TAZAMA MATANGAZO (5 ya mwisho, yanayofanya kazi tu)
        const result = await pool.query(
          "SELECT zao, idadi, bei FROM matangazo WHERE active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY tarehe DESC LIMIT 5"
        );

        if (result.rows.length === 0) {
          response = "END Hakuna matangazo kwa sasa.";
        } else {
          const orodha = result.rows
            .map((m) => `${m.zao} - magunia ${m.idadi} @ TZS ${m.bei || "?"}`)
            .join("\n");
          response = `END Matangazo ya hivi karibuni:\n${orodha}`;
        }
      } else if (majibu[1] === "4") {
        // JISAJILI - usajili wa mkulima
        if (majibu.length === 2) {
          response = "CON Weka Jina Lako";
        } else if (majibu.length === 3) {
          response = "CON Mkoa wako";
        } else if (majibu.length === 4) {
          response = "CON Wilaya yako";
        } else if (majibu.length === 5) {
          const jina = majibu[2];
          const mkoa = majibu[3];
          const wilaya = majibu[4];

          const tayari = await pool.query(
            "SELECT 1 FROM wakulima WHERE phone_number = $1",
            [phoneNumber]
          );

          if (tayari.rows.length > 0) {
            response = "END Tayari umesajiliwa.";
          } else {
            await pool.query(
              "INSERT INTO wakulima (jina, mkoa, wilaya, phone_number) VALUES ($1, $2, $3, $4)",
              [jina, mkoa, wilaya, phoneNumber]
            );
            response = "END Umesajiliwa Kikamilifu";
          }
        }
      } else {
        response = "END Chaguo si sahihi. Jaribu tena.";
      }
    } else if (majibu[0] === "2") {
      // ============ UPANDE WA MNUNUZI ============
      if (majibu.length === 1) {
        response = `CON Karibu Mnunuzi
1. Tafuta Mazao
2. Omba Zao
3. Jisajili`;
      } else if (majibu[1] === "1") {
        // ---- TAFUTA MAZAO (search yaliyopo) ----
        if (majibu.length === 2) {
          const result = await pool.query(
            "SELECT DISTINCT zao FROM matangazo WHERE active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY zao"
          );
          const mazao = result.rows.map((r) => r.zao);

          if (mazao.length === 0) {
            response = "END Hakuna mazao yaliyotangazwa kwa sasa.";
          } else {
            response =
              "CON Tafuta zao:\n" +
              mazao.map((z, i) => `${i + 1}. ${capitalize(z)}`).join("\n");
          }
        } else if (majibu.length === 3) {
          const zaoResult = await pool.query(
            "SELECT DISTINCT zao FROM matangazo WHERE active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY zao"
          );
          const mazao = zaoResult.rows.map((r) => r.zao);
          const zao = mazao[parseInt(majibu[2]) - 1];

          if (!zao) {
            response = "END Chaguo si sahihi. Jaribu tena.";
          } else {
            const matokeoResult = await pool.query(
              `SELECT m.idadi, m.bei, m.phone_number, w.jina, w.mkoa, w.wilaya, w.verified
               FROM matangazo m
               LEFT JOIN wakulima w ON m.phone_number = w.phone_number
               WHERE m.zao = $1 AND m.active = TRUE AND (m.expires_at IS NULL OR m.expires_at > NOW())
               ORDER BY m.tarehe DESC
               LIMIT 5`,
              [zao]
            );

            if (matokeoResult.rows.length === 0) {
              response = `END Hakuna mkulima mwenye ${zao} kwa sasa.`;
            } else {
              const orodha = matokeoResult.rows
                .map((r) => {
                  const eneo = r.mkoa ? `${r.mkoa}, ${r.wilaya}` : "Eneo halijulikani";
                  const jina = r.jina || "Mkulima";
                  const tiki = r.verified ? " ✓Verified" : "";
                  const beiTxt = r.bei ? ` @ TZS ${r.bei}` : "";
                  return `${jina}${tiki} - magunia ${r.idadi}${beiTxt} - ${eneo} - ${r.phone_number}`;
                })
                .join("\n");
              response = `END Wakulima wenye ${zao}:\n${orodha}`;

              // Tuma SMS kwa kila mkulima aliyepatikana - mnunuzi ameonyesha nia
              for (const r of matokeoResult.rows) {
                await tumaSMS(
                  r.phone_number,
                  `Mnunuzi mpya ameonyesha\nnia ya kununua ${capitalize(zao)} yako.`
                );
              }
            }
          }
        } else {
          response = "END Chaguo si sahihi. Jaribu tena.";
        }
      } else if (majibu[1] === "2") {
        // ---- OMBA ZAO (Buyer Request - "biggest missing feature") ----
        if (majibu.length === 2) {
          response = "CON Unahitaji zao gani?";
        } else if (majibu.length === 3) {
          response = "CON Kiasi gani (mfano: 500 magunia)?";
        } else if (majibu.length === 4) {
          response = "CON Mkoa gani?";
        } else if (majibu.length === 5) {
          const zao = majibu[2];
          const idadi = majibu[3];
          const mkoa = majibu[4];

          await pool.query(
            "INSERT INTO buyer_requests (zao, idadi, mkoa, phone_number) VALUES ($1, $2, $3, $4)",
            [zao, idadi, mkoa, phoneNumber]
          );

          // Tafuta wakulima wenye eneo hilo, tuwajulishe (hadi 10)
          const wakulimaResult = await pool.query(
            "SELECT phone_number FROM wakulima WHERE mkoa ILIKE $1 LIMIT 10",
            [mkoa]
          );
          for (const w of wakulimaResult.rows) {
            await tumaSMS(
              w.phone_number,
              `Mnunuzi anahitaji ${idadi} ya ${capitalize(zao)}\nmkoa wa ${mkoa}.\nMpigie: ${phoneNumber}`
            );
          }

          response = "END Ombi lako limepokelewa! Wakulima wa eneo hilo wamejulishwa.";
        }
      } else if (majibu[1] === "3") {
        // ---- JISAJILI - usajili wa mnunuzi ----
        if (majibu.length === 2) {
          response = "CON Weka Jina Lako";
        } else if (majibu.length === 3) {
          response = "CON Mkoa wako";
        } else if (majibu.length === 4) {
          response = "CON Wilaya yako";
        } else if (majibu.length === 5) {
          const jina = majibu[2];
          const mkoa = majibu[3];
          const wilaya = majibu[4];

          const tayari = await pool.query(
            "SELECT 1 FROM wanunuzi WHERE phone_number = $1",
            [phoneNumber]
          );

          if (tayari.rows.length > 0) {
            response = "END Tayari umesajiliwa.";
          } else {
            await pool.query(
              "INSERT INTO wanunuzi (jina, mkoa, wilaya, phone_number) VALUES ($1, $2, $3, $4)",
              [jina, mkoa, wilaya, phoneNumber]
            );
            response = "END Umesajiliwa Kikamilifu";
          }
        }
      } else {
        response = "END Chaguo si sahihi. Jaribu tena.";
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

// ROUTE YA MUDA: kutengeneza majedwali ya database (sasa imefungwa na "siri" + inafanya kazi MARA MOJA tu)
// Kuitumia: https://yoursite.onrender.com/setup-database?siri=SIRI_YAKO
app.get("/setup-database", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi. Siri si sahihi.");
  }
  try {
    // Jedwali dogo la kukumbuka kama setup imeshafanyika
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mfumo_setup (
        jina VARCHAR(50) PRIMARY KEY,
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);

    // Angalia kama tayari imeshafanyika kabla
    const ipo = await pool.query(
      "SELECT 1 FROM mfumo_setup WHERE jina = 'database_setup'"
    );
    if (ipo.rows.length > 0) {
      return res
        .status(403)
        .send("⚠️ Setup tayari ilishafanyika awali. Route hii sasa imefungwa kabisa.");
    }

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

    // Weka bei za mfano TU kama bei_mazao ipo tupu (haifuti bei zilizopo)
    const idadiBei = await pool.query("SELECT COUNT(*) FROM bei_mazao");
    if (parseInt(idadiBei.rows[0].count) === 0) {
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
    }

    // Weka alama kuwa setup imekamilika - haitafanyika tena
    await pool.query(
      "INSERT INTO mfumo_setup (jina) VALUES ('database_setup')"
    );

    res.send(
      "✅ Database imetengenezwa kikamilifu! Route hii sasa imefungwa kiotomatiki, haitafanya kazi tena."
    );
  } catch (err) {
    res.status(500).send("❌ Tatizo: " + err.message);
  }
});

// ROUTE YA MIGRATION (v2): kuongeza safu mpya - bei, verified, active, na buyer_requests
// Kuitumia mara MOJA: https://yoursite.onrender.com/migrate-v2?siri=SIRI_YAKO
app.get("/migrate-v2", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi. Siri si sahihi.");
  }
  try {
    await pool.query(`ALTER TABLE matangazo ADD COLUMN IF NOT EXISTS bei INTEGER`);
    await pool.query(`ALTER TABLE matangazo ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE matangazo ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '90 days')`);
    await pool.query(`ALTER TABLE wakulima ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS buyer_requests (
        id SERIAL PRIMARY KEY,
        zao VARCHAR(100) NOT NULL,
        idadi VARCHAR(50) NOT NULL,
        mkoa VARCHAR(50) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wanunuzi (
        id SERIAL PRIMARY KEY,
        jina VARCHAR(100) NOT NULL,
        mkoa VARCHAR(50) NOT NULL,
        wilaya VARCHAR(50) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);
    res.send("✅ Migration v2 imefanikiwa! Safu mpya (bei, verified, active, buyer_requests, wanunuzi) zimeongezwa.");
  } catch (err) {
    res.status(500).send("❌ Tatizo: " + err.message);
  }
});


// Fungua: https://yoursite.onrender.com/admin?siri=SIRI_YAKO
app.get("/admin", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi. Ongeza ?siri=SIRI_YAKO mwishoni mwa URL.");
  }
  try {
    const result = await pool.query("SELECT * FROM bei_mazao ORDER BY zao, mkoa");
    const wakulimaResult = await pool.query(
      "SELECT * FROM wakulima ORDER BY tarehe DESC"
    );
    const matangazoResult = await pool.query(
      "SELECT * FROM matangazo ORDER BY tarehe DESC"
    );
    const requestsResult = await pool.query(
      "SELECT * FROM buyer_requests ORDER BY tarehe DESC LIMIT 50"
    );
    const wanunuziResult = await pool.query(
      "SELECT COUNT(*) FROM wanunuzi"
    );
    const mahitajiResult = await pool.query(`
      SELECT zao, COUNT(*) as idadi
      FROM buyer_requests
      GROUP BY zao
      ORDER BY idadi DESC
      LIMIT 10
    `);
    const mazaoAsilimiaResult = await pool.query(`
      SELECT zao, COUNT(*) as idadi
      FROM matangazo
      GROUP BY zao
      ORDER BY idadi DESC
    `);
    const safeSiri = encodeURIComponent(req.query.siri);

    const jumlaMatangazo = matangazoResult.rows.length;
    const asilimiaRows = mazaoAsilimiaResult.rows
      .map((r) => {
        const asilimia = jumlaMatangazo
          ? Math.round((r.idadi / jumlaMatangazo) * 100)
          : 0;
        return `<li>${capitalize(r.zao)}: ${asilimia}% (${r.idadi})</li>`;
      })
      .join("");

    const mahitajiRows = mahitajiResult.rows
      .map((r) => `<li>${capitalize(r.zao)}: ${r.idadi} maombi</li>`)
      .join("");

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

    const wakulimaRows = wakulimaResult.rows
      .map(
        (w) => `
        <tr>
          <td>${w.jina}</td>
          <td>${w.mkoa}</td>
          <td>${w.wilaya}</td>
          <td>${w.phone_number}</td>
          <td>${w.verified ? "✓ Verified" : "Hajathibitishwa"}</td>
          <td>
            ${
              w.verified
                ? ""
                : `<form method="POST" action="/admin/thibitisha?siri=${safeSiri}" style="display:inline">
                     <input type="hidden" name="id" value="${w.id}">
                     <button type="submit">Thibitisha</button>
                   </form>`
            }
          </td>
        </tr>`
      )
      .join("");

    const matangazoRows = matangazoResult.rows
      .map(
        (m) => `
        <tr>
          <td>${m.zao}</td>
          <td>${m.idadi}</td>
          <td>${m.bei || "-"}</td>
          <td>${m.phone_number}</td>
          <td>${new Date(m.tarehe).toLocaleDateString("sw-TZ")}</td>
        </tr>`
      )
      .join("");

    const requestsRows = requestsResult.rows
      .map(
        (b) => `
        <tr>
          <td>${b.zao}</td>
          <td>${b.idadi}</td>
          <td>${b.mkoa}</td>
          <td>${b.phone_number}</td>
          <td>${new Date(b.tarehe).toLocaleDateString("sw-TZ")}</td>
        </tr>`
      )
      .join("");

    res.send(`
      <html>
      <head>
        <title>Admin - Soko la Mkulima</title>
        <style>
          body { font-family: sans-serif; max-width: 900px; margin: 40px auto; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          input { padding: 6px; margin-right: 5px; }
          button { padding: 6px 12px; }
          h2 { margin-top: 50px; }
          .idadi { color: #666; font-size: 14px; margin-top: -10px; }
          .takwimu { display: flex; gap: 30px; background: #f5f5f5; padding: 20px; border-radius: 8px; }
          .takwimu div { font-size: 28px; font-weight: bold; }
          .takwimu span { display: block; font-size: 14px; font-weight: normal; color: #555; }
        </style>
      </head>
      <body>
        <h1>Admin - Soko la Mkulima</h1>

        <h2>Takwimu za Soko</h2>
        <div class="takwimu">
          <div>${wakulimaResult.rows.length}<span>Wakulima</span></div>
          <div>${wanunuziResult.rows[0].count}<span>Wanunuzi</span></div>
          <div>${matangazoResult.rows.length}<span>Matangazo</span></div>
          <div>${requestsResult.rows.length}<span>Maombi ya Wanunuzi</span></div>
        </div>
        <h3>Mazao Yanayouzwa Zaidi (na Wakulima)</h3>
        <ul>${asilimiaRows || "<li>Hakuna data bado.</li>"}</ul>

        <h3>Mazao Yanayohitajika Zaidi (na Wanunuzi)</h3>
        <ul>${mahitajiRows || "<li>Hakuna data bado.</li>"}</ul>

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

        <h2>Wakulima Waliosajiliwa</h2>
        <p class="idadi">Jumla: ${wakulimaResult.rows.length}</p>
        <table>
          <tr><th>Jina</th><th>Mkoa</th><th>Wilaya</th><th>Namba ya Simu</th><th>Hali</th><th></th></tr>
          ${wakulimaRows || "<tr><td colspan='6'>Hakuna mkulima aliyesajiliwa bado.</td></tr>"}
        </table>

        <h2>Matangazo ya Mazao</h2>
        <p class="idadi">Jumla: ${matangazoResult.rows.length}</p>
        <table>
          <tr><th>Zao</th><th>Idadi (Magunia)</th><th>Bei/Gunia</th><th>Namba ya Simu</th><th>Tarehe</th></tr>
          ${matangazoRows || "<tr><td colspan='5'>Hakuna tangazo bado.</td></tr>"}
        </table>

        <h2>Maombi ya Wanunuzi (Buyer Requests)</h2>
        <p class="idadi">Jumla: ${requestsResult.rows.length}</p>
        <table>
          <tr><th>Zao</th><th>Kiasi</th><th>Mkoa</th><th>Namba ya Simu</th><th>Tarehe</th></tr>
          ${requestsRows || "<tr><td colspan='5'>Hakuna ombi bado.</td></tr>"}
        </table>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Tatizo: " + err.message);
  }
});

app.post("/admin/thibitisha", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi.");
  }
  await pool.query("UPDATE wakulima SET verified = TRUE WHERE id = $1", [req.body.id]);
  res.redirect("/admin?siri=" + encodeURIComponent(req.query.siri));
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
