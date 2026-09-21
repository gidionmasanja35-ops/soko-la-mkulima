// SOKO LA MKULIMA - Mfumo wa USSD kwa wakulima
// Toleo hili linatumia DATABASE (PostgreSQL) badala ya data ya "hardcoded"
// ---- ROUTE KUU YA USSD ----
require("dotenv").config();
const axios = require("axios");
const express = require("express");
const { Pool } = require("pg");
const { GoogleAuth } = require("google-auth-library");
const app = express(); // HAU PASWI KUSAHAU HUU MSTARI! Lazima uwe hapa.
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Kazi ya kusaidia kubadilisha herufi ya kwanza kuwa kubwa
function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Utambulisho wa USSD Sessions
const ussdSessions = {};

// 1. Leta file lako la admin.js (hakikisha njia/path ipo sahihi)
const adminRoutes = require("./admin"); 

// 2. Unganisha router ya admin ili ipatikane kupitia mfano: /admin
app.use("/admin", adminRoutes);

// FCM V1 NOTIFICATION FUNCTION (Inatuma moja kwa moja kwa Wanunuzi)
async function tumaNotificationKwaWanunuzi({ zao, idadi, bei, mkoa }) {
  try {
    let credentials;
    
    // 1. Jaribu kusoma credentials kutoka Render Environment Variable
    if (process.env.FIREBASE_CREDENTIALS) {
      credentials = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    }

    const auth = new GoogleAuth({
      credentials: credentials, // Inatumia file/object la credentials badala ya ku-guess
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    const projectId = "soko-la-mkulima"; // AU process.env.FIREBASE_PROJECT_ID

    const response = await axios.post(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        message: {
          topic: "buyers",
          notification: {
            title: "🌾 Zao Jipya Limepatikana!",
            body: `${capitalize(zao)} — ${idadi} magunia @ TZS ${bei}/gunia, ${mkoa}`,
          },
          data: {
            type: "new_crop",
            zao: String(zao),
            idadi: String(idadi),
            bei: String(bei),
            mkoa: String(mkoa),
          },
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    console.log(
      "✅ FCM V1 Notification imetumwa moja kwa moja kwa buyers:",
      response.data
    );
  } catch (error) {
    console.error(
      "❌ Hitilafu wakati wa kutuma FCM notification:",
      error.response ? error.response.data : error.message
    );
  }
}

// ---- KAZI YA KUTUMA SMS (Africa's Talking) ----
async function tumaSMS(simu, ujumbe) {
  try {
    const username = process.env.AT_USERNAME; // "sandbox" ukiwa kwenye majaribio
    const apiKey = process.env.AT_API_KEY;

    if (!username || !apiKey) {
      console.log(
        "SMS haijatumwa - AT_USERNAME/AT_API_KEY hazijawekwa au hazisomeki"
      );
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

    const smsRes = await axios.post(url, body, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey: apiKey,
      },
    });

    console.log("SMS Matokeo:", smsRes.data);
  } catch (smsErr) {
    console.error("SMS Error - Status:", smsErr.response?.status);
    console.error("SMS Error - Body:", JSON.stringify(smsErr.response?.data));
    console.error("SMS Error - Message:", smsErr.message);
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// =====================================================
// DATABASE STARTUP MIGRATION
// =====================================================

async function runStartupMigration() {
  try {
    console.log("🔄 Inakagua database schema...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mazao (
        id SERIAL PRIMARY KEY,
        simu_mkulima VARCHAR(20) NOT NULL,
        zao VARCHAR(100),
        idadi_magunia INT,
        bei_kwa_gunia NUMERIC,
        mkoa VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database schema ipo tayari!");
  } catch (error) {
    console.error("❌ Migration imefeli:", error);
  }
}

runStartupMigration();

// 2. USSD Endpoint / Route
app.post("/ussd", async (req, res) => {
  let { sessionId, serviceCode, phoneNumber, text } = req.body;
  let response = "";

  try {
    const textArray = text ? text.split("*") : [];
    const level = textArray.length;

    // Utambulisho wa USSD Sessions
    if (!ussdSessions[sessionId]) {
      ussdSessions[sessionId] = {};
    }

    if (text === "") {
      response = `CON Karibu Soko la Mkulima
1. Weka Zao
2. Angalia Bei
3. Wasifu Wangu`;
    } 
    else if (level === 5 && textArray[0] === "2") {
      ussdSessions[sessionId].mkoa = textArray[4];
      const s = ussdSessions[sessionId];
      response = `CON Thibitisha Taarifa:
Zao: ${s.zao}
Idadi: ${s.idadi} Magunia
Bei: TZS ${s.bei}/gunia
Eneo: ${s.mkoa}

1. Thibitisha
2. Ghairi`;
    } 
    else if (level === 6 && textArray[0] === "2") {
      const confirmation = textArray[5];
      if (confirmation === "1") {
        const s = ussdSessions[sessionId];
        if (s) {
          await pool.query(
            "INSERT INTO mazao (simu_mkulima, zao, idadi_magunia, bei_kwa_gunia, mkoa) VALUES ($1, $2, $3, $4, $5)",
            [phoneNumber, s.zao, s.idadi, s.bei, s.mkoa]
          );

          // Tuma Notification kwa Wanunuzi kupitia Firebase
          if (typeof tumaNotificationKwaWanunuzi === "function") {
            tumaNotificationKwaWanunuzi({
              zao: s.zao,
              idadi: s.idadi,
              bei: s.bei,
              mkoa: s.mkoa,
            });
          }

          delete ussdSessions[sessionId];
          response = "END Tangazo lako limewasilishwa kikamilifu! Wanunuzi wataarifiwa.";
        } else {
          response = "END Session imeisha. Tafadhali anza tena.";
        }
      } else if (confirmation === "2") {
        delete ussdSessions[sessionId];
        response = "END Ombi lako limeghairiwa.";
      } else {
        delete ussdSessions[sessionId];
        response = "END Chaguo si sahihi. Tangazo limefutwa.";
      }
    } 
    // ----------------------------------------------------
    // OPTION 3: Wasifu Wangu
    // ----------------------------------------------------
    else if (text === "3") {
      const result = await pool.query(
        "SELECT COUNT(*) as jumla FROM mazao WHERE simu_mkulima = $1",
        [phoneNumber]
      );
      const jumla = result.rows[0].jumla;
      response = `END Wasifu wa Mkulima (${phoneNumber}):\nUmetangaza mazao mara ${jumla}.\nTembelea tovuti yetu kuangalia kwa undani.`;
    } 
    else {
      response = "END Chaguo si sahihi. Tafadhali jaribu tena.";
    }
  } catch (err) {
    console.error("USSD Error:", err);
    response = "END Imeshindikana kuchakata ombi lako. Jaribu tena baadae.";
  }

  res.set("Content-Type", "text/plain");
  res.send(response);
});

// ==========================================
// WEB ROUTES & API
// ==========================================

// Home Page
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM mazao ORDER BY id DESC");
    res.render("index", { mazao: result.rows });
  } catch (err) {
    console.error("Home Page Error:", err);
    res.status(500).send("Server Error");
  }
});

// Profile ya Mkulima
app.get("/mkulima/:simu", async (req, res) => {
  const simu = req.params.simu;
  try {
    const result = await pool.query(
      "SELECT * FROM mazao WHERE simu_mkulima = $1 ORDER BY id DESC",
      [simu]
    );

    let html = `
    <!DOCTYPE html>
    <html lang="sw">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Wasifu wa Mkulima - ${simu}</title>
      <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f9; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; border: 1px solid #ddd; text-align: left; }
        th { background-color: #27ae60; color: white; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .back-btn { display: inline-block; margin-top: 15px; padding: 10px 15px; background: #3498db; color: white; text-decoration: none; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Mazao Yaliyotangazwa na Mkulima: ${simu}</h1>
        ${
          result.rows.length === 0
            ? "<p>Mkulima huyu hajasihi tangazo lolote kwa sasa.</p>"
            : `
            <table>
              <thead>
                <tr>
                  <th>Zao</th>
                  <th>Idadi (Magunia)</th>
                  <th>Bei kwa Gunia (TZS)</th>
                  <th>Mkoa</th>
                  <th>Tarehe</th>
                </tr>
              </thead>
              <tbody>
                ${result.rows
                  .map(
                    (row) => `
                  <tr>
                    <td>${row.zao}</td>
                    <td>${row.idadi_magunia}</td>
                    <td>${row.bei_kwa_gunia}</td>
                    <td>${row.mkoa}</td>
                    <td>${new Date(row.created_at || Date.now()).toLocaleDateString()}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          `
        }
        <a href="/" class="back-btn">Rudi Nyumbani</a>
      </div>
    </body>
    </html>`;

    res.send(html);
  } catch (err) {
    console.error("Error fetching farmer profile:", err);
    res.status(500).send("Server Error");
  }
});

// ============================================================
// ---- API ROUTES (JSON) - Kwa Flutter App ----
// ============================================================

// GET /api/takwimu
app.get("/api/takwimu", async (req, res) => {
  try {
    const wakulima = await pool.query("SELECT COUNT(*) FROM wakulima");
    const matangazo = await pool.query(
      "SELECT COUNT(*) FROM matangazo WHERE active = TRUE"
    );
    const mazao = await pool.query(
      "SELECT COUNT(DISTINCT zao) FROM matangazo WHERE active = TRUE"
    );
    const wanunuzi = await pool.query("SELECT COUNT(*) FROM wanunuzi");
    res.json({
      wakulima: parseInt(wakulima.rows[0].count),
      matangazo: parseInt(matangazo.rows[0].count),
      mazao: parseInt(mazao.rows[0].count),
      wanunuzi: parseInt(wanunuzi.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/matangazo
app.get("/api/matangazo", async (req, res) => {
  try {
    const { zao, mkoa } = req.query;

    let query = `
      SELECT 
        m.id, m.zao, m.idadi, m.bei, m.phone_number, m.tarehe, m.mkoa AS matangazo_mkoa,
        w.jina, w.mkoa AS mkulima_mkoa, w.wilaya,
        (SELECT ROUND(AVG(r.nyota), 1) FROM ratings r WHERE r.farmer_phone = m.phone_number) AS wastani_rating
      FROM matangazo m
      LEFT JOIN wakulima w ON m.phone_number = w.phone_number
      WHERE m.status = 'accepted'
    `;

    const params = [];

    if (zao && zao.trim() !== "") {
      params.push(`%${zao.toLowerCase().trim()}%`);
      query += ` AND LOWER(m.zao) LIKE $${params.length}`;
    }

    if (mkoa && mkoa.trim() !== "") {
      params.push(`%${mkoa.toLowerCase().trim()}%`);
      query += ` AND (LOWER(m.mkoa) LIKE $${params.length} OR LOWER(w.mkoa) LIKE $${params.length})`;
    }

    query += " ORDER BY m.tarehe DESC LIMIT 50";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error kubwa kwenye getMatangazo API:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mkulima/:simu
app.get("/api/mkulima/:simu", async (req, res) => {
  try {
    const simu = decodeURIComponent(req.params.simu);

    const wasifu = await pool.query(
      "SELECT * FROM wakulima WHERE phone_number = $1 ORDER BY tarehe ASC LIMIT 1",
      [simu]
    );
    if (wasifu.rows.length === 0) {
      return res.status(404).json({ error: "Mkulima hapatikani" });
    }

    const matangazo = await pool.query(
      "SELECT * FROM matangazo WHERE phone_number = $1 AND status = 'accepted' ORDER BY tarehe DESC",
      [simu]
    );

    const maombi = await pool.query(
      "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1",
      [simu]
    );

    const kubaliwa = await pool.query(
      "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1 AND status = 'accepted'",
      [simu]
    );

    const rating = await pool.query(
      "SELECT ROUND(AVG(nyota), 1) as wastani FROM ratings WHERE farmer_phone = $1",
      [simu]
    );

    res.json({
      ...wasifu.rows[0],
      matangazo: matangazo.rows,
      maombi_count: parseInt(maombi.rows[0].count),
      kubaliwa_count: parseInt(kubaliwa.rows[0].count),
      wastani_rating: rating.rows[0].wastani || "0.0",
    });
  } catch (err) {
    console.error("Error kwenye profile API:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bei
app.get("/api/bei", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM bei_mazao ORDER BY zao, mkoa"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mazao
app.get("/api/mazao", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT DISTINCT zao FROM matangazo WHERE active = TRUE ORDER BY zao"
    );
    res.json(result.rows.map((r) => r.zao));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ombi
app.post("/api/ombi", async (req, res) => {
  try {
    const { buyer_phone, farmer_phone, zao, idadi, mkoa } = req.body;

    if (farmer_phone && farmer_phone.trim() !== "") {
      await pool.query(
        "INSERT INTO purchase_requests (buyer_phone, farmer_phone, zao, idadi) VALUES ($1, $2, $3, $4)",
        [buyer_phone, farmer_phone, zao, idadi]
      );

      await tumaSMS(
        farmer_phone,
        `Mnunuzi anataka kununua\n${capitalize(zao)} yako.\nMpigie: ${buyer_phone}`
      );
    } else {
      const mkoaSafi = mkoa ? mkoa.trim() : "Haijulikani";
      const idadiSafi = idadi ? idadi.trim() : "?";

      await pool.query(
        "INSERT INTO buyer_requests (zao, idadi, mkoa, phone_number) VALUES ($1, $2, $3, $4)",
        [zao.toLowerCase().trim(), idadiSafi, mkoaSafi, buyer_phone]
      );

      const wakulima = await pool.query(
        "SELECT phone_number FROM wakulima WHERE mkoa ILIKE $1 LIMIT 10",
        [`%${mkoaSafi}%`]
      );

      for (const w of wakulima.rows) {
        await tumaSMS(
          w.phone_number,
          `Fursa! Mnunuzi anahitaji ${idadiSafi} ya ${capitalize(zao)} mkoa wa ${mkoaSafi}.\nMpigie: ${buyer_phone}`
        );
      }
    }

    res.json({
      success: true,
      message: "Ombi limetumwa na wakulima wamejulishwa!",
    });
  } catch (err) {
    console.error("Error kwenye /api/ombi:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// UKURASA WA SOKO KUU (/soko)
app.get("/soko", async (req, res) => {
  try {
    const zaoChaguzi = req.query.zao || "";
    const mkoaChaguzi = req.query.mkoa || "";

    const ratingsResult = await pool.query(`
      SELECT farmer_phone, ROUND(AVG(nyota), 1) as wastani, COUNT(*) as idadi
      FROM ratings GROUP BY farmer_phone
    `);
    const ratingsMap = {};
    ratingsResult.rows.forEach((r) => {
      ratingsMap[r.farmer_phone] = { wastani: r.wastani, idadi: r.idadi };
    });

    let query = `
      SELECT DISTINCT ON (m.phone_number, m.zao)
        m.id, m.zao, m.idadi, m.bei, m.phone_number, m.tarehe,
        w.jina, w.mkoa, w.wilaya, w.verified
      FROM matangazo m
      LEFT JOIN wakulima w ON m.phone_number = w.phone_number
      WHERE m.active = TRUE AND (m.expires_at IS NULL OR m.expires_at > NOW())
    `;
    const params = [];

    if (zaoChaguzi) {
      params.push(zaoChaguzi);
      query += ` AND m.zao = $${params.length}`;
    }
    if (mkoaChaguzi) {
      params.push(mkoaChaguzi);
      query += ` AND w.mkoa = $${params.length}`;
    }
    query += " ORDER BY m.phone_number, m.zao, m.tarehe DESC";

    const matangazoResult = await pool.query(query, params);

    const kadiZaWakulima =
      matangazoResult.rows.length === 0
        ? `<div class="hakuna">
           <div style="font-size:48px">🌾</div>
           <h3>Hakuna matangazo yanayolingana na utafutaji wako</h3>
           <p>Jaribu kubadilisha zao au mkoa</p>
         </div>`
        : matangazoResult.rows
            .map((m) => {
              const jina = m.jina || "Mkulima";
              const eneo = m.mkoa
                ? `${m.mkoa}, ${m.wilaya || ""}`
                : "Eneo halijulikani";
              const bei = m.bei
                ? `TZS ${Number(m.bei).toLocaleString()} / gunia`
                : "Bei kwa mazungumzo";
              const verified = m.verified
                ? `<span class="badge-ok">✓ Verified</span>`
                : `<span class="badge-pending">Hajathibitishwa</span>`;
              const cropEmoji =
                {
                  mahindi: "🌽",
                  mpunga: "🌾",
                  maharage: "🫘",
                  mtama: "🌾",
                  ufuta: "🌿",
                  karanga: "🥜",
                }[m.zao?.toLowerCase()] || "🌱";

              const rating = ratingsMap[m.phone_number];
              const ratingHTML = rating
                ? `<div class="rating">⭐ ${rating.wastani} <span>(${rating.idadi} ukadiriaji)</span></div>`
                : `<div class="rating" style="color:#ccc">Bado hajakadiriwa</div>`;

              return `
            <div class="kadi">
              <div class="kadi-juu">
                <div class="avatar">👨‍🌾</div>
                <div>
                  <div class="jina">${jina} ${verified}</div>
                  <div class="eneo">📍 ${eneo}</div>
                  ${ratingHTML}
                </div>
              </div>
              <div class="mazao-info">
                <span class="zao-badge">${cropEmoji} ${capitalize(m.zao)}</span>
                <span class="idadi">Magunia ${m.idadi}</span>
                <span class="bei">${bei}</span>
              </div>
              <div class="kadi-vitendo">
                <a href="/mkulima/${encodeURIComponent(m.phone_number)}" class="btn-wasifu">
                  👤 Angalia Wasifu
                </a>
                <a href="tel:${m.phone_number}" class="btn-simu">
                  📞 Piga Simu
                </a>
              </div>
            </div>`;
            })
            .join("");

    res.send(`
      <!DOCTYPE html>
      <html lang="sw">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Soko la Mkulima — Tafuta Wakulima Tanzania</title>
        <style>
          :root{--kijani:#2E8B57;--kijani-giza:#14432F;--kijani-mwanga:#E8F5EE;--bg:#F2F5F4}
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:#1F2A24}
          .header{background:var(--kijani-giza);color:#fff;padding:16px 24px;display:flex;align-items:center;justify-content:space-between}
          .header h1{font-size:20px}
          .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;max-width:1100px;margin:28px auto;padding:0 20px}
          .kadi{background:#fff;border-radius:14px;padding:20px;border:1px solid #E6EAE8}
          .kadi-juu{display:flex;align-items:center;gap:12px;margin-bottom:14px}
          .avatar{width:48px;height:48px;border-radius:50%;background:var(--kijani-mwanga);display:flex;align-items:center;justify-content:center;font-size:22px}
          .jina{font-weight:700;font-size:15px}
          .eneo{color:#6B7670;font-size:13px}
          .badge-ok{background:#E1F5EC;color:#1B5E3F;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
          .badge-pending{background:#FDF2E1;color:#B5760C;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
          .mazao-info{background:var(--kijani-mwanga);border-radius:10px;padding:12px;margin-bottom:14px;display:flex;gap:8px;align-items:center}
          .zao-badge{background:var(--kijani);color:#fff;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600}
          .kadi-vitendo{display:flex;gap:8px}
          .btn-wasifu{flex:1;text-align:center;background:var(--kijani-mwanga);color:var(--kijani);font-weight:600;padding:9px;border-radius:8px;text-decoration:none;font-size:13px}
          .btn-simu{flex:1;text-align:center;background:var(--kijani);color:#fff;font-weight:600;padding:9px;border-radius:8px;text-decoration:none;font-size:13px}
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Soko la Mkulima</h1>
        </div>
        <div class="grid">
          ${kadiZaWakulima}
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Tatizo: " + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ina-run kwenye port ${PORT}`);
});
