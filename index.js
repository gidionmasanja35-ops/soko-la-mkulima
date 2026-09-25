// SOKO LA MKULIMA - Mfumo wa USSD kwa wakulima
// Toleo hili linatumia DATABASE (PostgreSQL) badala ya data ya "hardcoded"
// ---- ROUTE KUU YA USSD ----
require("dotenv").config();
const axios = require("axios");
const express = require("express");
const { Pool } = require("pg");
const { GoogleAuth } = require("google-auth-library");

// =====================================================
// AUTOMATIC TANTRADE PRICE SYNC - NEW
// =====================================================
const cron = require("node-cron");
const { execFile } = require("child_process");
const path = require("path");

const app = express(); // HAU PASWI KUSAHAU HUU MSTARI! Lazima uwe hapa.

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 1. Kutengeneza connection pool ya PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// 2. Leta file lako la admin
const adminModule = require("./admin");

// 3. Unganisha router na ipitishie 'pool'
app.use("/", adminModule(pool));

// FCM V1 NOTIFICATION FUNCTION (Inatuma moja kwa moja kwa Wanunuzi)
// FCM V1 NOTIFICATION FUNCTION (Inatuma moja kwa moja kwa Wanunuzi)
async function tumaNotificationKwaWanunuzi({ zao, idadi, bei, mkoa }) {
  try {
    let credentials;

    // 1. Jaribu kusoma credentials kutoka Render Environment Variable
    if (process.env.FIREBASE_CREDENTIALS) {
      credentials = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    }

    const auth = new GoogleAuth({
      credentials: credentials,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    const projectId = "soko-la-mkulima";

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
    const username = process.env.AT_USERNAME;
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
    console.error(
      "SMS Error - Body:",
      JSON.stringify(smsErr.response?.data)
    );
    console.error("SMS Error - Message:", smsErr.message);
  }
}


// =====================================================
// DATABASE STARTUP MIGRATION
// =====================================================

async function runStartupMigration() {
  try {
    console.log("🔄 Inakagua database schema...");

    // =====================================================
    // 1. MKULIMA VERIFICATION
    // =====================================================
    await pool.query(`
      ALTER TABLE IF EXISTS wakulima
      ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
    `);

    // Hakikisha records za zamani hazibaki NULL
    await pool.query(`
      UPDATE wakulima
      SET verified = FALSE
      WHERE verified IS NULL;
    `);

    // =====================================================
    // 2. BUYER REQUEST STATUS
    // =====================================================
    await pool.query(`
      ALTER TABLE IF EXISTS buyer_requests
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
    `);

    await pool.query(`
      UPDATE buyer_requests
      SET status = 'pending'
      WHERE status IS NULL;
    `);

    // =====================================================
    // 3. MATANGAZO
    // =====================================================
    await pool.query(`
      ALTER TABLE IF EXISTS matangazo
      ADD COLUMN IF NOT EXISTS bei INTEGER;
    `);

    await pool.query(`
      ALTER TABLE IF EXISTS matangazo
      ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
    `);

    await pool.query(`
      ALTER TABLE IF EXISTS matangazo
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP
      DEFAULT (NOW() + INTERVAL '90 days');
    `);

    // =====================================================
    // 4. BEI ZA MAZAO
    // =====================================================
    // Hii ndiyo sehemu mpya kwa ajili ya
    // automatic government market prices.

    await pool.query(`
      ALTER TABLE IF EXISTS bei_mazao
      ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT 'kg';
    `);

    await pool.query(`
      ALTER TABLE IF EXISTS bei_mazao
      ADD COLUMN IF NOT EXISTS source TEXT
      DEFAULT 'Government Market Data';
    `);

    await pool.query(`
      ALTER TABLE IF EXISTS bei_mazao
      ADD COLUMN IF NOT EXISTS source_url TEXT;
    `);

    await pool.query(`
      ALTER TABLE IF EXISTS bei_mazao
      ADD COLUMN IF NOT EXISTS data_date DATE;
    `);

    await pool.query(`
      ALTER TABLE IF EXISTS bei_mazao
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `);

    // =====================================================
    // 5. JAZA DATA ZA ZAMANI
    // =====================================================

    // Bei zilizokuwepo zamani zilikuwa za kilo,
    // hivyo tunaziwekea unit = kg.
    await pool.query(`
      UPDATE bei_mazao
      SET unit = 'kg'
      WHERE unit IS NULL;
    `);

    // Records za zamani ziwekwe kama Admin/Manual
    // kwa sababu hazikutoka kwenye automatic government sync.
    await pool.query(`
      UPDATE bei_mazao
      SET source = 'Manual/Admin'
      WHERE source IS NULL;
    `);

    // Tumia tarehe ya zamani ya record kama data_date
    // kama data_date haikuwepo.
    await pool.query(`
      UPDATE bei_mazao
      SET data_date = tarehe::date
      WHERE data_date IS NULL
        AND tarehe IS NOT NULL;
    `);

    // Hakikisha updated_at ipo kwa records za zamani.
    await pool.query(`
      UPDATE bei_mazao
      SET updated_at = COALESCE(updated_at, tarehe, NOW())
      WHERE updated_at IS NULL;
    `);

    console.log("✅ Database schema imekaguliwa vizuri.");
    console.log("✅ bei_mazao iko tayari kwa automatic price sync.");

  } catch (error) {
    console.error("❌ Startup migration error:", error.message);
  }
}

// =====================================================
// AUTOMATIC TANTRADE PRICE SYNC
// =====================================================

let priceSyncRunning = false;

function runPriceSync() {
  if (priceSyncRunning) {
    console.log(
      "⏳ Price Sync tayari inaendelea - run mpya imerukwa."
    );
    return;
  }

  priceSyncRunning = true;

  const scriptPath = path.join(__dirname, "price-sync.js");

  console.log(
    "🚀 Automatic TanTrade Price Sync inaanza..."
  );

  execFile(
    process.execPath,
    [scriptPath],
    {
      cwd: __dirname,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    },
    (error, stdout, stderr) => {
      priceSyncRunning = false;

      if (stdout && stdout.trim()) {
        console.log("📊 PRICE SYNC OUTPUT:");
        console.log(stdout);
      }

      if (stderr && stderr.trim()) {
        console.error("⚠️ PRICE SYNC STDERR:");
        console.error(stderr);
      }

      if (error) {
        console.error(
          "❌ Automatic Price Sync imefeli:",
          error.message
        );
        return;
      }

      console.log(
        "✅ Automatic Price Sync imekamilika."
      );
    }
  );
}

// =====================================================
// RUN PRICE SYNC AFTER DATABASE STARTUP
// =====================================================

runStartupMigration()
  .then(() => {
    runPriceSync();
  })
  .catch((error) => {
    console.error(
      "❌ Startup/Price Sync error:",
      error.message
    );
  });

// =====================================================
// DAILY PRICE SYNC - 06:00 TANZANIA TIME
// =====================================================

cron.schedule(
  "0 6 * * *",
  () => {
    console.log(
      "⏰ 06:00 - Scheduled TanTrade Price Sync inaanza..."
    );

    runPriceSync();
  },
  {
    timezone: "Africa/Dar_es_Salaam",
  }
);


app.post("/ussd", async (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  const majibu = text ? text.split("*") : [];
  let response = "";

  try {
    if (text === "" || text === undefined) {
      // HATUA YA 0: Menyu ya juu kabisa
      response = `CON Karibu Soko la Mkulima\n1. Angalia Bei za Zao\n2. Tangaza Mazao Yako\n3. Tazama Matangazo\n4. Jisajili\n5. Maombi ya Ununuzi\n6. Wasifu Wangu\n7. Hali ya Hewa`;
    } else if (majibu[0] === "1") {
      // --- ANGALIA BEI ---
      if (majibu.length === 1) {
        const result = await pool.query(
          "SELECT DISTINCT zao FROM bei_mazao ORDER BY zao",
        );

        const mazao = result.rows.map((r) => r.zao);

        response =
          "CON Chagua zao:\n" +
          mazao
            .map((z, i) => `${i + 1}. ${capitalize(z)}`)
            .join("\n");

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
            mikoa
              .map((m, i) => `${i + 1}. ${m}`)
              .join("\n");
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

        const chaguo =
          mikoaResult.rows[parseInt(majibu[2]) - 1];

        if (!chaguo) {
          response =
            "END Chaguo si sahihi. Jaribu tena.";
        } else {
          response = `END Bei ya ${zao} mkoa wa ${chaguo.mkoa} ni TZS ${chaguo.bei} kwa kilo.`;
        }
      }

    } else if (majibu[0] === "2") {
      // --- TANGAZA MAZAO ---

      if (majibu.length === 1) {
        response =
          "CON Andika jina la zao unalouza:";

      } else if (majibu.length === 2) {
        response =
          "CON Andika idadi ya magunia:";

      } else if (majibu.length === 3) {
        response =
          "CON Weka bei kwa gunia (TZS):";

      } else if (majibu.length === 4) {
        response =
          "CON Andika mkoa uliopo sasa (mfano: Dodoma):";

      } else if (majibu.length === 5) {
        const zao = majibu[1];
        const idadi = majibu[2];
        const bei = majibu[3];
        const mkoa = majibu[4];

        response =
          `CON Thibitisha Tangazo Lako:\n` +
          `Zao: ${capitalize(zao)}\n` +
          `Idadi: ${idadi} magunia\n` +
          `Bei: TZS ${bei}/gunia\n` +
          `Mkoa: ${mkoa}\n\n` +
          `1. Kubali na Chapisha\n` +
          `2. Ghairi Tangazo`;

      } else if (majibu.length === 6) {
        const zao = majibu[1].toLowerCase().trim();
        const idadi = majibu[2].trim();
        const bei = majibu[3].trim();
        const mkoa = majibu[4].trim();
        const thibitisho = majibu[5].trim();

        let HaliYaTangazo = "pending";

        if (thibitisho === "1") {
          HaliYaTangazo = "accepted";

          response =
            `END Asante! Tangazo lako la ${capitalize(zao)} ` +
            `(magunia ${idadi} @ TZS ${bei}) limekubaliwa ` +
            `na kuwekwa sokoni kikamilifu.`;

          await tumaSMS(
            phoneNumber,
            `Tangazo lako la ${capitalize(zao)}\n${idadi} magunia @ TZS ${bei} limechapishwa Sokoni rasmi.`,
          );

        } else if (thibitisho === "2") {
          HaliYaTangazo = "rejected";

          response =
            "END Tangazo lako limeghairiwa na halitaonekana kwa wanunuzi.";

        } else {
          response =
            "END Chaguo si sahihi. Tangazo limefutwa.";

          res.set(
            "Content-Type",
            "text/plain"
          );

          return res.send(response);
        }

        const beiSafi =
          parseInt(
            bei.replace(/[^0-9]/g, ""),
            10
          ) || 0;

        const zaoSafi =
          zao.toLowerCase().trim();

        const mkoaSafi =
          mkoa.trim();

        const idadiSafi =
          idadi.trim();

        await pool.query(
          "INSERT INTO matangazo (zao, idadi, bei, phone_number, mkoa, status, active) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [
            zaoSafi,
            idadiSafi,
            beiSafi,
            phoneNumber,
            mkoaSafi,
            HaliYaTangazo,
            HaliYaTangazo === "accepted",
          ],
        );

        if (HaliYaTangazo === "accepted") {
          await tumaNotificationKwaWanunuzi({
            zao: zaoSafi,
            idadi: idadiSafi,
            bei: beiSafi,
            mkoa: mkoaSafi,
          });
        }
      }

    } else if (majibu[0] === "3") {
      // --- TAZAMA MATANGAZO ---

      const result = await pool.query(
        "SELECT zao, idadi, bei FROM matangazo WHERE status = 'accepted' ORDER BY tarehe DESC LIMIT 5",
      );

      if (result.rows.length === 0) {
        response =
          "END Hakuna matangazo yaliyothibitishwa kwa sasa.";
      } else {
        const orodha = result.rows
          .map(
            (m) =>
              `${capitalize(m.zao)} - magunia ${m.idadi} @ TZS ${m.bei || "?"}`,
          )
          .join("\n");

        response =
          `END Matangazo ya hivi karibuni:\n${orodha}`;
      }

    } else if (majibu[0] === "4") {
      // --- JISAJILI ---

      if (majibu.length === 1) {
        response =
          "CON Weka Jina Lako:";

      } else if (majibu.length === 2) {
        response =
          "CON Mkoa wako:";

      } else if (majibu.length === 3) {
        response =
          "CON Wilaya yako:";

      } else if (majibu.length === 4) {
        const jina = majibu[1];
        const mkoa = majibu[2];
        const wilaya = majibu[3];

        const tayari = await pool.query(
          "SELECT 1 FROM wakulima WHERE phone_number = $1",
          [phoneNumber],
        );

        if (tayari.rows.length > 0) {
          response =
            "END Tayari umesajiliwa.";
        } else {
          await pool.query(
            "INSERT INTO wakulima (jina, mkoa, wilaya, phone_number) VALUES ($1, $2, $3, $4)",
            [
              jina,
              mkoa,
              wilaya,
              phoneNumber,
            ],
          );

          response =
            "END Umesajiliwa Kikamilifu";
        }
      }

    } else if (majibu[0] === "5") {
      // --- MAOMBI YA UNUNUZI ---

      const mkulimaResult = await pool.query(
        "SELECT mkoa FROM wakulima WHERE phone_number = $1",
        [phoneNumber],
      );

      if (mkulimaResult.rows.length === 0) {
        response =
          "END Hujasajiliwa bado. Tafadhali jisajili kwanza (Chaguo la 4).";
      } else {
        const mkoaWaMkulima =
          mkulimaResult.rows[0].mkoa;

        const maombiResult = await pool.query(
          "SELECT * FROM buyer_requests WHERE mkoa ILIKE $1 AND COALESCE(status, 'pending') = 'pending' ORDER BY id DESC LIMIT 5",
          [`%${mkoaWaMkulima}%`],
        );

        if (majibu.length === 1) {
          if (maombiResult.rows.length === 0) {
            response =
              `END Hakuna maombi mapya ya ununuzi kwa mkoa wa ${mkoaWaMkulima} kwa sasa.`;
          } else {
            const orodha =
              maombiResult.rows
                .map(
                  (m, i) =>
                    `${i + 1}. ${capitalize(m.zao)} - magunia ${m.idadi || "?"}`,
                )
                .join("\n");

            response =
              `CON Maombi Mkoa wa ${mkoaWaMkulima}:\n${orodha}\nChagua namba:`;
          }

        } else if (majibu.length === 2) {
          const index =
            parseInt(majibu[1]) - 1;

          const ombiTeule =
            maombiResult.rows[index];

          if (!ombiTeule) {
            response =
              "END Chaguo si sahihi. Jaribu tena.";
          } else {
            response =
              `CON ${capitalize(ombiTeule.zao)} - magunia ${ombiTeule.idadi || "?"}\n1. Kubali (Chukua Dili)\n2. Kataa`;
          }

        } else if (majibu.length === 3) {
          const index =
            parseInt(majibu[1]) - 1;

          const ombiTeule =
            maombiResult.rows[index];

          if (!ombiTeule) {
            response =
              "END Ombi hili halipatikani au limeshajibiwa.";

          } else if (majibu[2] === "1") {

            await pool.query(
              "UPDATE buyer_requests SET status = 'accepted' WHERE id = $1",
              [ombiTeule.id],
            );

            await tumaSMS(
              ombiTeule.phone_number,
              `Mkulima amekubali ombi lako la ${capitalize(ombiTeule.zao)}.\nMpigie sasa: ${phoneNumber}`,
            );

            response =
              "END Hongera! Umekubali dili hili. Ombi limeondolewa kwenye orodha na Mnunuzi amejulishwa.";

          } else if (majibu[2] === "2") {

            await pool.query(
              "UPDATE buyer_requests SET status = 'rejected' WHERE id = $1",
              [ombiTeule.id],
            );

            await tumaSMS(
              ombiTeule.phone_number,
              `Samahani, mkulima amekataa ombi lako la ${capitalize(ombiTeule.zao)}.`,
            );

            response =
              "END Umekataa ombi hili. Limeondolewa kwenye orodha yako.";

          } else {
            response =
              "END Chaguo si sahihi. Jaribu tena.";
          }
        }
      }

    } else if (majibu[0] === "6") {
      // --- WASIFU WANGU ---

      const wasifu = await pool.query(
        "SELECT * FROM wakulima WHERE phone_number = $1 ORDER BY tarehe ASC LIMIT 1",
        [phoneNumber],
      );

      const matangazoYake =
        await pool.query(
          "SELECT COUNT(*) FROM matangazo WHERE phone_number = $1",
          [phoneNumber],
        );

      const maombiYake =
        await pool.query(
          "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1",
          [phoneNumber],
        );

      if (wasifu.rows.length === 0) {
        response =
          `END Hujasajiliwa bado.\nRudi kwenye menyu, chagua:\n4. Jisajili`;
      } else {
        const w = wasifu.rows[0];

        const matangazoIdadi =
          matangazoYake.rows[0].count;

        const maombiIdadi =
          maombiYake.rows[0].count;

        response =
          `END Wasifu Wako:\n` +
          `Jina: ${w.jina}\n` +
          `Mkoa: ${w.mkoa}\n` +
          `Wilaya: ${w.wilaya}\n` +
          `Matangazo Yako: ${matangazoIdadi}\n` +
          `Maombi: ${maombiIdadi}\n` +
          `Anwani: soko-la-mkulima.onrender.com/mkulima/${phoneNumber}`;
      }

    } else if (majibu[0] === "7") {
      // --- HALI YA HEWA ---

      const mikoaTZ = {
        1: {
          jina: "Dar es Salaam",
          lat: -6.8,
          lon: 39.28
        },
        2: {
          jina: "Dodoma",
          lat: -6.17,
          lon: 35.74
        },
        3: {
          jina: "Mwanza",
          lat: -2.52,
          lon: 32.9
        },
        4: {
          jina: "Arusha",
          lat: -3.37,
          lon: 36.68
        },
        5: {
          jina: "Morogoro",
          lat: -6.82,
          lon: 37.66
        },
        6: {
          jina: "Mbeya",
          lat: -8.9,
          lon: 33.46
        },
        7: {
          jina: "Tanga",
          lat: -5.07,
          lon: 39.1
        },
        8: {
          jina: "Iringa",
          lat: -7.77,
          lon: 35.69
        },
      };

      if (majibu.length === 1) {
        const orodha =
          Object.entries(mikoaTZ)
            .map(
              ([n, m]) =>
                `${n}. ${m.jina}`
            )
            .join("\n");

        response =
          `CON Chagua mkoa wako:\n${orodha}`;

      } else if (majibu.length === 2) {
        const mkoa =
          mikoaTZ[majibu[1]];

        if (!mkoa) {
          response =
            "END Chaguo si sahihi. Jaribu tena.";
        } else {
          const apiKey =
            process.env.WEATHER_API_KEY;

          if (!apiKey) {
            response =
              "END Huduma ya hali ya hewa haipatikani kwa sasa.";
          } else {
            try {
              const weatherRes =
                await axios.get(
                  `https://api.openweathermap.org/data/2.5/forecast?lat=${mkoa.lat}&lon=${mkoa.lon}&appid=${apiKey}&units=metric&cnt=2&lang=sw`,
                );

              const weatherData =
                weatherRes.data;

              if (
                weatherData.cod !== "200" &&
                weatherData.cod !== 200
              ) {
                response =
                  "END Tatizo la kupata hali ya hewa. Jaribu tena.";
              } else {
                const leo =
                  weatherData.list[0];

                const kesho =
                  weatherData.list[1] || leo;

                const mvuaEmoji =
                  (desc) => {
                    if (
                      desc.includes("rain") ||
                      desc.includes("mvua")
                    )
                      return "🌧";

                    if (
                      desc.includes("cloud")
                    )
                      return "☁️";

                    if (
                      desc.includes("storm")
                    )
                      return "⛈️";

                    return "☀️";
                  };

                response =
                  `END Hali ya Hewa - ${mkoa.jina}\n\n` +
                  `Leo:\n` +
                  `${mvuaEmoji(leo.weather[0].description)} ${leo.weather[0].description}\n` +
                  `Joto: ${Math.round(leo.main.temp)}°C\n` +
                  `Unyevu: ${leo.main.humidity}%\n\n` +
                  `Kesho:\n` +
                  `${mvuaEmoji(kesho.weather[0].description)} ${kesho.weather[0].description}\n` +
                  `Joto: ${Math.round(kesho.main.temp)}°C`;
              }

            } catch (weatherErr) {
              console.error(
                "Weather API Error:",
                weatherErr.message
              );

              response =
                "END Tatizo la mtandao wa hali ya hewa. Jaribu tena baadaye.";
            }
          }
        }
      }

    } else {
      response =
        "END Chaguo si sahihi. Jaribu tena.";
    }

  } catch (err) {
    console.error(
      "Database error ya ukweli:",
      err.message
    );

    response =
      "END Samahani, kuna tatizo la mfumo. Jaribu tena baadaye.";
  }

  res.set(
    "Content-Type",
    "text/plain"
  );

  res.send(response);
});

// Kazi ndogo ya kuandika herufi kubwa mwanzoni mwa neno
function capitalize(neno) {
  if (!neno) return "";

  return (
    neno.charAt(0).toUpperCase() +
    neno.slice(1)
  );
}

// HOME PAGE
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="sw">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Soko la Mkulima — Unganika na Wakulima Tanzania</title>

  <style>
    :root {
      --kijani: #2E8B57;
      --kijani-giza: #14432F;
      --kijani-mwanga: #E8F5EE;
      --chungwa: #E67E22;
      --bg: #F2F5F4;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #1F2A24;
    }

    a {
      text-decoration: none;
    }

    nav {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      background: rgba(20, 67, 47, 0.97);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 40px;
    }

    .nav-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #fff;
    }

    .nav-brand h1 {
      font-size: 18px;
    }

    .nav-brand p {
      font-size: 11px;
      color: #A9C9B8;
    }

    .nav-links {
      display: flex;
      gap: 24px;
      align-items: center;
    }

    .nav-links a {
      color: #CFE3D8;
      font-size: 14px;
    }

    .nav-links a:hover {
      color: #fff;
    }

    .nav-links .btn-nav {
      background: var(--kijani);
      color: #fff;
      padding: 8px 20px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
    }

    .hero {
      min-height: 100vh;
      background:
        linear-gradient(
          135deg,
          #0D2B1E 0%,
          #1B5E3F 50%,
          #2E8B57 100%
        );
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 100px 24px 60px;
      position: relative;
      overflow: hidden;
    }

    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,0.1);
      color: #A9C9B8;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 13px;
      border: 1px solid rgba(255,255,255,0.15);
      margin-bottom: 24px;
    }

    .hero h2 {
      font-size: clamp(32px, 6vw, 58px);
      color: #fff;
      line-height: 1.2;
      margin-bottom: 20px;
      font-weight: 800;
    }

    .hero h2 span {
      color: #6FCFA0;
    }

    .hero p {
      font-size: clamp(16px, 2vw, 20px);
      color: #C8E6D4;
      max-width: 600px;
      margin-bottom: 36px;
      line-height: 1.6;
    }

    .hero-btns {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      justify-content: center;
    }

    .btn-primary {
      background: #fff;
      color: var(--kijani-giza);
      padding: 14px 32px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 16px;
      transition: transform 0.2s;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
    }

    .btn-secondary {
      background: rgba(255,255,255,0.12);
      color: #fff;
      padding: 14px 32px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 16px;
      border: 1px solid rgba(255,255,255,0.25);
      transition: background 0.2s;
    }

    .btn-secondary:hover {
      background: rgba(255,255,255,0.2);
    }

    .hero-stats {
      display: flex;
      gap: 48px;
      margin-top: 56px;
      flex-wrap: wrap;
      justify-content: center;
    }

    .hero-stat .num {
      font-size: 32px;
      font-weight: 800;
      color: #fff;
    }

    .hero-stat .lbl {
      font-size: 13px;
      color: #A9C9B8;
      margin-top: 2px;
    }

    footer {
      background: #0D2B1E;
      color: #6B9C7E;
      padding: 40px;
      display: flex;
      justify-space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
  </style>
</head>

<body>

  <nav>
    <div class="nav-brand">
      <span style="font-size:24px">🌱</span>

      <div>
        <h1>Soko la Mkulima</h1>
        <p>Soko la Mazao Tanzania</p>
      </div>
    </div>

    <div class="nav-links">
      <a href="/soko">Tazama Mazao</a>
      <a href="/soko" class="btn-nav">
        Tafuta Wakulima →
      </a>
    </div>
  </nav>

  <section class="hero">

    <div class="hero-badge">
      🌍 Inafanya kazi Tanzania nzima
    </div>

    <h2>
      Unganika na <span>Wakulima</span><br>
      wa Tanzania Moja kwa Moja
    </h2>

    <p>
      Tafuta wakulima, angalia bei za mazao,
      na tangaza mazao yako — kupitia simu ya
      kawaida au smartphone yako.
    </p>

    <div class="hero-btns">
      <a href="/soko" class="btn-primary">
        🔍 Tafuta Wakulima
      </a>
    </div>

    <div class="hero-stats">

      <div class="hero-stat">
        <div class="num">🌾</div>
        <div class="lbl">Mazao Mbalimbali</div>
      </div>

      <div class="hero-stat">
        <div class="num">📱</div>
        <div class="lbl">Simu Yoyote</div>
      </div>

      <div class="hero-stat">
        <div class="num">🇹🇿</div>
        <div class="lbl">Tanzania Nzima</div>
      </div>

    </div>

  </section>

  <footer>

    <div>
      <div class="brand">
        🌱 Soko la Mkulima
      </div>

      <p style="margin-top:4px">
        Kuunganisha Wakulima na Wanunuzi Tanzania
      </p>
    </div>

    <p style="font-size:13px">
      © 2026 Soko la Mkulima. Haki zote zimehifadhiwa.
    </p>

  </footer>

</body>
</html>`);
});

// ---- UKURASA WA WASIFU WA MKULIMA (/mkulima/:simu) ----
app.get("/mkulima/:simu", async (req, res) => {
  try {
    const simu =
      decodeURIComponent(req.params.simu);

    const wasifu = await pool.query(
      "SELECT * FROM wakulima WHERE phone_number = $1 ORDER BY tarehe ASC LIMIT 1",
      [simu],
    );

    if (wasifu.rows.length === 0) {
      return res
        .status(404)
        .send(
          `<html>
          <body style="font-family:sans-serif;text-align:center;padding:60px">
            <h2>Mkulima Hapatikani</h2>
            <p>Namba hii haijasajiliwa.</p>
          </body>
          </html>`,
        );
    }

    const w = wasifu.rows[0];

    const matangazoResult =
      await pool.query(
        "SELECT * FROM matangazo WHERE phone_number = $1 AND active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY tarehe DESC",
        [simu],
      );

    const maombiResult =
      await pool.query(
        "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1",
        [simu],
      );

    const maombiKubaliwa =
      await pool.query(
        "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1 AND status = 'accepted'",
        [simu],
      );

    const matangazoRows =
      matangazoResult.rows
        .map(
          (m) =>
            `<div class="listing-card">
              <div class="crop-icon">🌾</div>
              <div>
                <div class="crop-name">
                  ${capitalize(m.zao)}
                </div>

                <div class="crop-details">
                  Magunia ${m.idadi}
                  ${m.bei
                    ? ` • TZS ${Number(m.bei).toLocaleString()} / gunia`
                    : ""}
                </div>

                <div class="crop-date">
                  ${new Date(m.tarehe).toLocaleDateString("sw-TZ")}
                </div>
              </div>
            </div>`,
        )
        .join("") ||
      `<p style="color:#6B7670">
        Hakuna matangazo ya sasa.
      </p>`;

    res.send(`<!DOCTYPE html>
<html lang="sw">
<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>
    ${w.jina} — Soko la Mkulima
  </title>

  <style>

    :root{
      --kijani:#2E8B57;
      --kijani-giza:#14432F;
      --kijani-mwanga:#E8F5EE;
      --bg:#F2F5F4
    }

    *{
      box-sizing:border-box
    }

    body{
      margin:0;
      font-family:'Segoe UI',system-ui,sans-serif;
      background:var(--bg);
      color:#1F2A24
    }

    .header{
      background:var(--kijani-giza);
      color:#fff;
      padding:16px 24px;
      display:flex;
      align-items:center;
      gap:12px
    }

    .header h1{
      margin:0;
      font-size:18px
    }

    .header p{
      margin:2px 0 0;
      font-size:12px;
      color:#A9C9B8
    }

    .container{
      max-width:700px;
      margin:32px auto;
      padding:0 16px
    }

    .card{
      background:#fff;
      border-radius:16px;
      padding:28px;
      margin-bottom:20px;
      border:1px solid #E6EAE8;
      box-shadow:0 2px 8px rgba(0,0,0,0.05)
    }

    .profile-top{
      display:flex;
      align-items:center;
      gap:20px;
      margin-bottom:20px
    }

    .avatar{
      width:72px;
      height:72px;
      border-radius:50%;
      background:var(--kijani-mwanga);
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:32px;
      flex-shrink:0
    }

    .profile-name{
      font-size:22px;
      font-weight:700;
      margin:0 0 4px
    }

    .profile-location{
      color:#6B7670;
      font-size:14px
    }

    .badge{
      display:inline-flex;
      align-items:center;
      gap:5px;
      padding:4px 12px;
      border-radius:20px;
      font-size:12px;
      font-weight:600;
      margin-top:8px
    }

    .badge-ok{
      background:#E1F5EC;
      color:#1B5E3F
    }

    .badge-pending{
      background:#FDF2E1;
      color:#B5760C
    }

    .stats{
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:12px
    }

    .stat{
      background:var(--kijani-mwanga);
      border-radius:10px;
      padding:14px;
      text-align:center
    }

    .stat .num{
      font-size:24px;
      font-weight:700;
      color:var(--kijani)
    }

    .stat .label{
      font-size:12px;
      color:#6B7670;
      margin-top:2px
    }

    .section-title{
      font-size:17px;
      font-weight:700;
      margin:24px 0 12px
    }

    .listing-card{
      background:#fff;
      border-radius:12px;
      padding:16px;
      margin-bottom:10px;
      border:1px solid #E6EAE8;
      display:flex;
      align-items:center;
      gap:14px
    }

    .crop-icon{
      font-size:28px
    }

    .crop-name{
      font-weight:600;
      font-size:15px
    }

    .crop-details{
      color:var(--kijani);
      font-size:13px;
      margin-top:2px
    }

    .crop-date{
      color:#6B7670;
      font-size:12px;
      margin-top:2px
    }

    .contact-card{
      background:var(--kijani-giza);
      color:#fff;
      border-radius:14px;
      padding:20px;
      text-align:center;
      margin-top:20px
    }

    .contact-card p{
      margin:0 0 14px;
      font-size:14px;
      color:#A9C9B8
    }

    .contact-btn{
      display:inline-block;
      background:#fff;
      color:var(--kijani-giza);
      font-weight:700;
      padding:12px 28px;
      border-radius:8px;
      text-decoration:none;
      font-size:15px
    }

    .footer{
      text-align:center;
      color:#6B7670;
      font-size:12px;
      margin:32px 0 20px
    }

  </style>

</head>

<body>

  <div class="header">
    <span style="font-size:22px">🌱</span>

    <div>
      <h1>Soko la Mkulima</h1>
      <p>Soko la Mazao Tanzania</p>
    </div>
  </div>

  <div class="container">

    <div class="card">

      <div class="profile-top">

        <div class="avatar">
          👨‍🌾
        </div>

        <div>

          <div class="profile-name">
            ${w.jina}
          </div>

          <div class="profile-location">
            📍 ${w.mkoa}, ${w.wilaya}
          </div>

          ${
            w.verified
              ? `<span class="badge badge-ok">
                  ✓ Mkulima Aliyethibitishwa
                </span>`
              : `<span class="badge badge-pending">
                  ⏳ Bado Hajathibitishwa
                </span>`
          }

        </div>

      </div>

      <div class="stats">

        <div class="stat">
          <div class="num">
            ${matangazoResult.rows.length}
          </div>
          <div class="label">
            Matangazo
          </div>
        </div>

        <div class="stat">
          <div class="num">
            ${maombiResult.rows[0].count}
          </div>
          <div class="label">
            Maombi Yaliyopokelewa
          </div>
        </div>

        <div class="stat">
          <div class="num">
            ${maombiKubaliwa.rows[0].count}
          </div>
          <div class="label">
            Miamala Iliyofanikiwa
          </div>
        </div>

      </div>

    </div>

    <div class="section-title">
      Mazao Yanayouzwa Sasa
    </div>

    ${matangazoRows}

    <div class="contact-card">

      <p>
        Una nia ya kununua mazao ya ${w.jina}?
      </p>

      <a
        href="tel:${w.phone_number}"
        class="contact-btn"
      >
        📞 Piga Simu
      </a>

    </div>

    <div class="footer">
      Soko la Mkulima — Kuunganisha Wakulima na Wanunuzi Tanzania
    </div>

  </div>

</body>
</html>`);
  } catch (err) {
    res
      .status(500)
      .send("Tatizo: " + err.message);
  }
});

// ============================================================
// ---- API ROUTES (JSON) - Kwa Flutter App ----
// ============================================================

// GET /api/takwimu
app.get("/api/takwimu", async (req, res) => {
  try {

    const wakulima =
      await pool.query(
        "SELECT COUNT(*) FROM wakulima"
      );

    const matangazo =
      await pool.query(
        "SELECT COUNT(*) FROM matangazo WHERE active = TRUE"
      );

    const mazao =
      await pool.query(
        "SELECT COUNT(DISTINCT zao) FROM matangazo WHERE active = TRUE"
      );

    const wanunuzi =
      await pool.query(
        "SELECT COUNT(*) FROM wanunuzi"
      );

    res.json({
      wakulima:
        parseInt(
          wakulima.rows[0].count
        ),

      matangazo:
        parseInt(
          matangazo.rows[0].count
        ),

      mazao:
        parseInt(
          mazao.rows[0].count
        ),

      wanunuzi:
        parseInt(
          wanunuzi.rows[0].count
        ),
    });

  } catch (err) {
    res
      .status(500)
      .json({
        error: err.message
      });
  }
});

// GET /api/matangazo
app.get("/api/matangazo", async (req, res) => {
  try {

    const { zao, mkoa } =
      req.query;

    let query = `
      SELECT 
        m.id,
        m.zao,
        m.idadi,
        m.bei,
        m.phone_number,
        m.tarehe,
        m.mkoa AS matangazo_mkoa,
        w.jina,
        w.mkoa AS mkulima_mkoa,
        w.wilaya,
        (
          SELECT ROUND(
            AVG(r.nyota), 1
          )
          FROM ratings r
          WHERE r.farmer_phone = m.phone_number
        ) AS wastani_rating

      FROM matangazo m

      LEFT JOIN wakulima w
        ON m.phone_number = w.phone_number

      WHERE m.status = 'accepted'
    `;

    const params = [];

    if (
      zao &&
      zao.trim() !== ""
    ) {

      params.push(
        `%${zao.toLowerCase().trim()}%`
      );

      query +=
        ` AND LOWER(m.zao) LIKE $${params.length}`;
    }

    if (
      mkoa &&
      mkoa.trim() !== ""
    ) {

      params.push(
        `%${mkoa.toLowerCase().trim()}%`
      );

      query +=
        ` AND (
          LOWER(m.mkoa) LIKE $${params.length}
          OR LOWER(w.mkoa) LIKE $${params.length}
        )`;
    }

    query +=
      " ORDER BY m.tarehe DESC LIMIT 50";

    const result =
      await pool.query(
        query,
        params
      );

    res.json(result.rows);

  } catch (err) {

    console.error(
      "Error kubwa kwenye getMatangazo API:",
      err.message
    );

    res
      .status(500)
      .json({
        error: err.message
      });
  }
});

// GET /api/mkulima/:simu
app.get("/api/mkulima/:simu", async (req, res) => {
  try {

    const simu =
      decodeURIComponent(
        req.params.simu
      );

    const wasifu =
      await pool.query(
        "SELECT * FROM wakulima WHERE phone_number = $1 ORDER BY tarehe ASC LIMIT 1",
        [simu],
      );

    if (
      wasifu.rows.length === 0
    ) {

      return res
        .status(404)
        .json({
          error:
            "Mkulima hapatikani"
        });
    }

    const matangazo =
      await pool.query(
        "SELECT * FROM matangazo WHERE phone_number = $1 AND status = 'accepted' ORDER BY tarehe DESC",
        [simu],
      );

    const maombi =
      await pool.query(
        "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1",
        [simu],
      );

    const kubaliwa =
      await pool.query(
        "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1 AND status = 'accepted'",
        [simu],
      );

    const rating =
      await pool.query(
        "SELECT ROUND(AVG(nyota), 1) as wastani FROM ratings WHERE farmer_phone = $1",
        [simu],
      );

    res.json({
      ...wasifu.rows[0],

      matangazo:
        matangazo.rows,

      maombi_count:
        parseInt(
          maombi.rows[0].count
        ),

      kubaliwa_count:
        parseInt(
          kubaliwa.rows[0].count
        ),

      wastani_rating:
        rating.rows[0].wastani ||
        "0.0",
    });

  } catch (err) {

    console.error(
      "Error kwenye profile API:",
      err.message
    );

    res
      .status(500)
      .json({
        error: err.message
      });
  }
});

// GET /api/bei
app.get("/api/bei", async (req, res) => {
  try {

    const result =
      await pool.query(
        "SELECT * FROM bei_mazao ORDER BY zao, mkoa",
      );

    res.json(
      result.rows
    );

  } catch (err) {

    res
      .status(500)
      .json({
        error: err.message
      });
  }
});

// GET /api/mazao
app.get("/api/mazao", async (req, res) => {
  try {

    const result =
      await pool.query(
        "SELECT DISTINCT zao FROM matangazo WHERE active = TRUE ORDER BY zao",
      );

    res.json(
      result.rows.map(
        (r) => r.zao
      )
    );

  } catch (err) {

    res
      .status(500)
      .json({
        error: err.message
      });
  }
});

// POST /api/ombi
app.post("/api/ombi", async (req, res) => {
  try {

    const {
      buyer_phone,
      farmer_phone,
      zao,
      idadi,
      mkoa
    } = req.body;

    if (
      farmer_phone &&
      farmer_phone.trim() !== ""
    ) {

      await pool.query(
        "INSERT INTO purchase_requests (buyer_phone, farmer_phone, zao, idadi) VALUES ($1, $2, $3, $4)",
        [
          buyer_phone,
          farmer_phone,
          zao,
          idadi
        ],
      );

      await tumaSMS(
        farmer_phone,
        `Mnunuzi anataka kununua\n${capitalize(zao)} yako.\nMpigie: ${buyer_phone}`,
      );

    } else {

      const mkoaSafi =
        mkoa
          ? mkoa.trim()
          : "Haijulikani";

      const idadiSafi =
        idadi
          ? idadi.trim()
          : "?";

      await pool.query(
        "INSERT INTO buyer_requests (zao, idadi, mkoa, phone_number) VALUES ($1, $2, $3, $4)",
        [
          zao.toLowerCase().trim(),
          idadiSafi,
          mkoaSafi,
          buyer_phone
        ],
      );

      const wakulima =
        await pool.query(
          "SELECT phone_number FROM wakulima WHERE mkoa ILIKE $1 LIMIT 10",
          [`%${mkoaSafi}%`],
        );

      for (
        const w of wakulima.rows
      ) {

        await tumaSMS(
          w.phone_number,
          `Fursa! Mnunuzi anahitaji ${idadiSafi} ya ${capitalize(zao)} mkoa wa ${mkoaSafi}.\nMpigie: ${buyer_phone}`,
        );
      }
    }

    res.json({
      success: true,
      message:
        "Ombi limetumwa na wakulima wamejulishwa!",
    });

  } catch (err) {

    console.error(
      "Error kwenye /api/ombi:",
      err.message
    );

    res
      .status(500)
      .json({
        error: err.message
      });
  }
});

// UKURASA WA SOKO KUU (/soko)
app.get("/soko", async (req, res) => {
  try {

    const zaoChaguzi =
      req.query.zao || "";

    const mkoaChaguzi =
      req.query.mkoa || "";

    const ratingsResult =
      await pool.query(`
        SELECT
          farmer_phone,
          ROUND(AVG(nyota), 1) as wastani,
          COUNT(*) as idadi
        FROM ratings
        GROUP BY farmer_phone
      `);

    const ratingsMap = {};

    ratingsResult.rows.forEach(
      (r) => {
        ratingsMap[r.farmer_phone] = {
          wastani: r.wastani,
          idadi: r.idadi
        };
      }
    );

    const mazaoResult =
      await pool.query(
        "SELECT DISTINCT zao FROM matangazo WHERE active = TRUE ORDER BY zao",
      );

    const mikoaResult =
      await pool.query(
        "SELECT DISTINCT mkoa FROM wakulima ORDER BY mkoa",
      );

    let query = `
      SELECT DISTINCT ON
        (m.phone_number, m.zao)

        m.id,
        m.zao,
        m.idadi,
        m.bei,
        m.phone_number,
        m.tarehe,

        w.jina,
        w.mkoa,
        w.wilaya,
        w.verified

      FROM matangazo m

      LEFT JOIN wakulima w
        ON m.phone_number = w.phone_number

      WHERE
        m.active = TRUE
        AND (
          m.expires_at IS NULL
          OR m.expires_at > NOW()
        )
    `;

    const params = [];

    if (zaoChaguzi) {

      params.push(
        zaoChaguzi
      );

      query +=
        ` AND m.zao = $${params.length}`;
    }

    if (mkoaChaguzi) {

      params.push(
        mkoaChaguzi
      );

      query +=
        ` AND w.mkoa = $${params.length}`;
    }

    query +=
      " ORDER BY m.phone_number, m.zao, m.tarehe DESC";

    const matangazoResult =
      await pool.query(
        query,
        params
      );

    const kadiZaWakulima =
      matangazoResult.rows.length === 0

        ? `<div class="hakuna">
             <div style="font-size:48px">
               🌾
             </div>

             <h3>
               Hakuna matangazo yanayolingana
               na utafutaji wako
             </h3>

             <p>
               Jaribu kubadilisha zao au mkoa
             </p>
           </div>`

        : matangazoResult.rows
            .map((m) => {

              const jina =
                m.jina ||
                "Mkulima";

              const eneo =
                m.mkoa
                  ? `${m.mkoa}, ${m.wilaya || ""}`
                  : "Eneo halijulikani";

              const bei =
                m.bei
                  ? `TZS ${Number(
                      m.bei
                    ).toLocaleString()} / gunia`
                  : "Bei kwa mazungumzo";

              const verified =
                m.verified
                  ? `<span class="badge-ok">
                       ✓ Verified
                     </span>`
                  : `<span class="badge-pending">
                       Hajathibitishwa
                     </span>`;

              const cropEmoji =
                {
                  mahindi: "🌽",
                  mpunga: "🌾",
                  maharage: "🫘",
                  mtama: "🌾",
                  ufuta: "🌿",
                  karanga: "🥜",
                }[
                  m.zao?.toLowerCase()
                ] || "🌱";

              const rating =
                ratingsMap[
                  m.phone_number
                ];

              const ratingHTML =
                rating

                  ? `<div class="rating">
                       ⭐ ${rating.wastani}
                       <span>
                         (${rating.idadi} ukadiriaji)
                       </span>
                     </div>`

                  : `<div
                       class="rating"
                       style="color:#ccc"
                     >
                       Bado hajakadiriwa
                     </div>`;

              return `
                <div class="kadi">

                  <div class="kadi-juu">

                    <div class="avatar">
                      👨‍🌾
                    </div>

                    <div>

                      <div class="jina">
                        ${jina} ${verified}
                      </div>

                      <div class="eneo">
                        📍 ${eneo}
                      </div>

                      ${ratingHTML}

                    </div>

                  </div>

                  <div class="mazao-info">

                    <span class="zao-badge">
                      ${cropEmoji}
                      ${capitalize(m.zao)}
                    </span>

                    <span class="idadi">
                      Magunia ${m.idadi}
                    </span>

                    <span class="bei">
                      ${bei}
                    </span>

                  </div>

                  <div class="kadi-vitendo">

                    <a
                      href="/mkulima/${encodeURIComponent(
                        m.phone_number
                      )}"
                      class="btn-wasifu"
                    >
                      👤 Angalia Wasifu
                    </a>

                    <a
                      href="tel:${m.phone_number}"
                      class="btn-simu"
                    >
                      📞 Piga Simu
                    </a>

                  </div>

                </div>
              `;
            })
            .join("");

    res.send(`
      <!DOCTYPE html>

      <html lang="sw">

      <head>

        <meta charset="UTF-8">

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >

        <title>
          Soko la Mkulima —
          Tafuta Wakulima Tanzania
        </title>

        <style>

          :root{
            --kijani:#2E8B57;
            --kijani-giza:#14432F;
            --kijani-mwanga:#E8F5EE;
            --bg:#F2F5F4
          }

          *{
            box-sizing:border-box;
            margin:0;
            padding:0
          }

          body{
            font-family:
              'Segoe UI',
              system-ui,
              sans-serif;
            background:var(--bg);
            color:#1F2A24
          }

          .header{
            background:var(--kijani-giza);
            color:#fff;
            padding:16px 24px;
            display:flex;
            align-items:center;
            justify-content:space-between
          }

          .header h1{
            font-size:20px
          }

          .grid{
            display:grid;
            grid-template-columns:
              repeat(
                auto-fill,
                minmax(300px,1fr)
              );
            gap:18px;
            max-width:1100px;
            margin:28px auto;
            padding:0 20px
          }

          .kadi{
            background:#fff;
            border-radius:14px;
            padding:20px;
            border:1px solid #E6EAE8
          }

          .kadi-juu{
            display:flex;
            align-items:center;
            gap:12px;
            margin-bottom:14px
          }

          .avatar{
            width:48px;
            height:48px;
            border-radius:50%;
            background:var(--kijani-mwanga);
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:22px
          }

          .jina{
            font-weight:700;
            font-size:15px
          }

          .eneo{
            color:#6B7670;
            font-size:13px
          }

          .badge-ok{
            background:#E1F5EC;
            color:#1B5E3F;
            padding:2px 8px;
            border-radius:20px;
            font-size:11px;
            font-weight:600
          }

          .badge-pending{
            background:#FDF2E1;
            color:#B5760C;
            padding:2px 8px;
            border-radius:20px;
            font-size:11px;
            font-weight:600
          }

          .mazao-info{
            background:var(--kijani-mwanga);
            border-radius:10px;
            padding:12px;
            margin-bottom:14px;
            display:flex;
            gap:8px;
            align-items:center
          }

          .zao-badge{
            background:var(--kijani);
            color:#fff;
            padding:4px 12px;
            border-radius:20px;
            font-size:13px;
            font-weight:600
          }

          .kadi-vitendo{
            display:flex;
            gap:8px
          }

          .btn-wasifu{
            flex:1;
            text-align:center;
            background:var(--kijani-mwanga);
            color:var(--kijani);
            font-weight:600;
            padding:9px;
            border-radius:8px;
            text-decoration:none;
            font-size:13px
          }

          .btn-simu{
            flex:1;
            text-align:center;
            background:var(--kijani);
            color:#fff;
            font-weight:600;
            padding:9px;
            border-radius:8px;
            text-decoration:none;
            font-size:13px
          }

        </style>

      </head>

      <body>

        <div class="header">
          <h1>
            Soko la Mkulima
          </h1>
        </div>

        <div class="grid">
          ${kadiZaWakulima}
        </div>

      </body>

      </html>
    `);

  } catch (err) {

    res
      .status(500)
      .send(
        "Tatizo: " + err.message
      );
  }
});


const PORT = process.env.PORT || 3000;

