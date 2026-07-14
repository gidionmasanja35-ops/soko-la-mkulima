// SOKO LA MKULIMA - Mfumo wa USSD kwa wakulima
// Toleo hili linatumia DATABASE (PostgreSQL) badala ya data ya "hardcoded"
// ---- ROUTE KUU YA USSD ----
require("dotenv").config();
const axios = require("axios");
const express = require("express");
const { Pool } = require("pg");

const app = express(); // HAU PASWI KUSAHAU HUU MSTARI! Lazima uwe hapa.
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---- KAZI YA KUTUMA SMS (Africa's Talking) ----
async function tumaSMS(simu, ujumbe) {
  try {
    const username = process.env.AT_USERNAME; // "sandbox" ukiwa kwenye majaribio
    const apiKey = process.env.AT_API_KEY;

    if (!username || !apiKey) {
      console.log(
        "SMS haijatumwa - AT_USERNAME/AT_API_KEY hazijawekwa au hazisomeki",
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
    console.error("SMS Error ya ukweli:", smsErr.message);
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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
      // --- TANGAZA MAZAO (Imerekebishwa kuwepo na Automatic Confirmation) ---
      if (majibu.length === 1) {
        response = "CON Andika jina la zao unalouza:";
      } else if (majibu.length === 2) {
        response = "CON Andika idadi ya magunia:";
      } else if (majibu.length === 3) {
        response = "CON Weka bei kwa gunia (TZS):";
      } else if (majibu.length === 4) {
        response = "CON Andika mkoa uliopo sasa (mfano: Dodoma):";
      } else if (majibu.length === 5) {
        // Hapa mkulima amejaza data zote, sasa anapewa muhtasari ili athibitishe kabla haijahifadhiwa
        const zao = majibu[1];
        const idadi = majibu[2];
        const bei = majibu[3];
        const mkoa = majibu[4];

        response = `CON Thibitisha Tangazo Lako:\nZao: ${capitalize(zao)}\nIdadi: ${idadi} magunia\nBei: TZS ${bei}/gunia\nMkoa: ${mkoa}\n\n1. Kubali na Chapisha\n2. Ghairi Tangazo`;
      } else if (majibu.length === 6) {
        // Hapa ndipo mkulima amebonyeza 1 (Kubali) au 2 (Ghairi)
        const zao = majibu[1].toLowerCase().trim();
        const idadi = majibu[2].trim();
        const bei = majibu[3].trim();
        const mkoa = majibu[4].trim();
        const thibitisho = majibu[5].trim();

        let HaliYaTangazo = "pending";

        if (thibitisho === "1") {
          HaliYaTangazo = "accepted";
          response = `END Asante! Tangazo lako la ${capitalize(zao)} (magunia ${idadi} @ TZS ${bei}) limekubaliwa na kuwekwa sokoni kikamilifu.`;

          // Tuma SMS ya uthibitisho kwa mkulima kwa kuwa amekubali
          await tumaSMS(
            phoneNumber,
            `Tangazo lako la ${capitalize(zao)}\n${idadi} magunia @ TZS ${bei} limechapishwa Sokoni rasmi.`,
          );
        } else if (thibitisho === "2") {
          HaliYaTangazo = "rejected";
          response =
            "END Tangazo lako limeghairiwa na halitaonekana kwa wanunuzi.";
        } else {
          response = "END Chaguo si sahihi. Tangazo limefutwa.";
          res.set("Content-Type", "text/plain");
          return res.send(response);
        }

        // Ingiza data rasmi ikiwa na MKOA na ile STATUS ya ukweli ('accepted' au 'rejected')
        // 1. Hakikisha bei inasafishwa na inabadilishwa kuwa namba kamili (Integer)
        // Hii inaondoa herufi zote zisizokuwa namba (kama mkulima aliandika "30,000" au "30000 ")
        const beiSafi = parseInt(bei.replace(/[^0-9]/g, ""), 10) || 0;

        // 2. Safisha maandishi mengine yawe kwenye herufi ndogo na kuondoa nafasi zilizoachwa mwanzoni/mwishoni
        const zaoSafi = zao.toLowerCase().trim();
        const mkoaSafi = mkoa.trim();
        const idadiSafi = idadi.trim();

        await pool.query(
          "INSERT INTO matangazo (zao, idadi, bei, phone_number, mkoa, status, active) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [
            zaoSafi,
            idadiSafi,
            beiSafi,
            phoneNumber,
            mkoaSafi,
            HaliYaTangazo,
            HaliYaTangazo === "accepted", // Hii inaweka TRUE kama ni accepted, au FALSE kama ni pending
          ],
        );
      }
    } else if (majibu[0] === "3") {
      // --- TAZAMA MATANGAZO (Yaliyokubalika tu yaani 'accepted') ---
      const result = await pool.query(
        "SELECT zao, idadi, bei FROM matangazo WHERE status = 'accepted' ORDER BY tarehe DESC LIMIT 5",
      );

      if (result.rows.length === 0) {
        response = "END Hakuna matangazo yaliyothibitishwa kwa sasa.";
      } else {
        const orodha = result.rows
          .map(
            (m) =>
              `${capitalize(m.zao)} - magunia ${m.idadi} @ TZS ${m.bei || "?"}`,
          )
          .join("\n");
        response = `END Matangazo ya hivi karibuni:\n${orodha}`;
      }
    } else if (majibu[0] === "4") {
      // --- JISAJILI ---
      if (majibu.length === 1) {
        response = "CON Weka Jina Lako:";
      } else if (majibu.length === 2) {
        response = "CON Mkoa wako:";
      } else if (majibu.length === 3) {
        response = "CON Wilaya yako:";
      } else if (majibu.length === 4) {
        const jina = majibu[1];
        const mkoa = majibu[2];
        const wilaya = majibu[3];

        const tayari = await pool.query(
          "SELECT 1 FROM wakulima WHERE phone_number = $1",
          [phoneNumber],
        );

        if (tayari.rows.length > 0) {
          response = "END Tayari umesajiliwa.";
        } else {
          await pool.query(
            "INSERT INTO wakulima (jina, mkoa, wilaya, phone_number) VALUES ($1, $2, $3, $4)",
            [jina, mkoa, wilaya, phoneNumber],
          );
          response = "END Umesajiliwa Kikamilifu";
        }
      }
    } else if (majibu[0] === "5") {
      // --- MAOMBI YA UNUNUZI YA KIMKOA ---
      const mkulimaResult = await pool.query(
        "SELECT mkoa FROM wakulima WHERE phone_number = $1",
        [phoneNumber],
      );

      if (mkulimaResult.rows.length === 0) {
        response =
          "END Hujasajiliwa bado. Tafadhali jisajili kwanza (Chaguo la 4).";
      } else {
        const mkoaWaMkulima = mkulimaResult.rows[0].mkoa;

        // ILIVYOKUWA ZAMANI:
        // const maombiResult = await pool.query("SELECT * FROM buyer_requests WHERE mkoa ILIKE $1 ORDER BY id DESC LIMIT 5", ...);

        // ILIVYO SASA (Salama zaidi):
        const maombiResult = await pool.query(
          "SELECT * FROM buyer_requests WHERE mkoa ILIKE $1 ORDER BY id DESC LIMIT 5",
          [`%${mkoaWaMkulima}%`],
        );

        if (majibu.length === 1) {
          if (maombiResult.rows.length === 0) {
            response = `END Hakuna maombi mapya ya ununuzi kwa mkoa wa ${mkoaWaMkulima} kwa sasa.`;
          } else {
            const orodha = maombiResult.rows
              .map(
                (m, i) =>
                  `${i + 1}. ${capitalize(m.zao)} - magunia ${m.idadi || "?"}`,
              )
              .join("\n");
            response = `CON Maombi Mkoa wa ${mkoaWaMkulima}:\n${orodha}\nChagua namba:`;
          }
        } else if (majibu.length === 2) {
          const ombiTeule = maombiResult.rows[parseInt(majibu[1]) - 1];
          if (!ombiTeule) {
            response = "END Chaguo si sahihi. Jaribu tena.";
          } else {
            response = `CON ${capitalize(ombiTeule.zao)} - magunia ${ombiTeule.idadi || "?"}\n1. Kubali (Chukua Dili)\n2. Kataa`;
          }
        } else if (majibu.length === 3) {
          const ombiTeule = maombiResult.rows[parseInt(majibu[1]) - 1];
          if (!ombiTeule) {
            response = "END Chaguo si sahihi. Jaribu tena.";
          } else if (majibu[2] === "1") {
            await pool.query("DELETE FROM buyer_requests WHERE id = $1", [
              ombiTeule.id,
            ]);

            await tumaSMS(
              ombiTeule.phone_number,
              `Mkulima amekubali ombi lako la ${capitalize(ombiTeule.zao)} mkoani ${mkoaWaMkulima}.\nMpigie sasa: ${phoneNumber}`,
            );

            response =
              "END Hongera! Umekubali dili hili. Mnunuzi amejulishwa namba yako ya simu.";
          } else if (majibu[2] === "2") {
            response = "END Umekataa ombi. Unaweza kuangalia maombi mengine.";
          } else {
            response = "END Chaguo si sahihi. Jaribu tena.";
          }
        }
      }
    } else if (majibu[0] === "6") {
      // --- WASIFU WANGU ---
      const wasifu = await pool.query(
        "SELECT * FROM wakulima WHERE phone_number = $1 ORDER BY tarehe ASC LIMIT 1",
        [phoneNumber],
      );
      const matangazoYake = await pool.query(
        "SELECT COUNT(*) FROM matangazo WHERE phone_number = $1",
        [phoneNumber],
      );
      const maombiYake = await pool.query(
        "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1",
        [phoneNumber],
      );

      if (wasifu.rows.length === 0) {
        response = `END Hujasajiliwa bado.\nRudi kwenye menyu, chagua:\n4. Jisajili`;
      } else {
        const w = wasifu.rows[0];
        const matangazoIdadi = matangazoYake.rows[0].count;
        const maombiIdadi = maombiYake.rows[0].count;
        response = `END Wasifu Wako:\nJina: ${w.jina}\nMkoa: ${w.mkoa}\nWilaya: ${w.wilaya}\nMatangazo Yako: ${matangazoIdadi}\nMaombi: ${maombiIdadi}\nAnwani: soko-la-mkulima.onrender.com/mkulima/${phoneNumber}`;
      }
    } else if (majibu[0] === "7") {
      // --- HALI YA HEWA ---
      const mikoaTZ = {
        1: { jina: "Dar es Salaam", lat: -6.8, lon: 39.28 },
        2: { jina: "Dodoma", lat: -6.17, lon: 35.74 },
        3: { jina: "Mwanza", lat: -2.52, lon: 32.9 },
        4: { jina: "Arusha", lat: -3.37, lon: 36.68 },
        5: { jina: "Morogoro", lat: -6.82, lon: 37.66 },
        6: { jina: "Mbeya", lat: -8.9, lon: 33.46 },
        7: { jina: "Tanga", lat: -5.07, lon: 39.1 },
        8: { jina: "Iringa", lat: -7.77, lon: 35.69 },
      };

      if (majibu.length === 1) {
        const orodha = Object.entries(mikoaTZ)
          .map(([n, m]) => `${n}. ${m.jina}`)
          .join("\n");
        response = `CON Chagua mkoa wako:\n${orodha}`;
      } else if (majibu.length === 2) {
        const mkoa = mikoaTZ[majibu[1]];
        if (!mkoa) {
          response = "END Chaguo si sahihi. Jaribu tena.";
        } else {
          const apiKey = process.env.WEATHER_API_KEY;
          if (!apiKey) {
            response = "END Huduma ya hali ya hewa haipatikani kwa sasa.";
          } else {
            try {
              const weatherRes = await axios.get(
                `https://api.openweathermap.org/data/2.5/forecast?lat=${mkoa.lat}&lon=${mkoa.lon}&appid=${apiKey}&units=metric&cnt=2&lang=sw`,
              );
              const weatherData = weatherRes.data;

              if (weatherData.cod !== "200" && weatherData.cod !== 200) {
                response = "END Tatizo la kupata hali ya hewa. Jaribu tena.";
              } else {
                const leo = weatherData.list[0];
                const kesho = weatherData.list[1] || leo;
                const mvuaEmoji = (desc) => {
                  if (desc.includes("rain") || desc.includes("mvua"))
                    return "🌧";
                  if (desc.includes("cloud")) return "☁️";
                  if (desc.includes("storm")) return "⛈️";
                  return "☀️";
                };
                response = `END Hali ya Hewa - ${mkoa.jina}\n\nLeo:\n${mvuaEmoji(leo.weather[0].description)} ${leo.weather[0].description}\nJoto: ${Math.round(leo.main.temp)}°C\nUnyevu: ${leo.main.humidity}%\n\nKesho:\n${mvuaEmoji(kesho.weather[0].description)} ${kesho.weather[0].description}\nJoto: ${Math.round(kesho.main.temp)}°C`;
              }
            } catch (weatherErr) {
              console.error("Weather API Error:", weatherErr.message);
              response =
                "END Tatizo la mtandao wa hali ya hewa. Jaribu tena baadaye.";
            }
          }
        }
      }
    } else {
      response = "END Chaguo si sahihi. Jaribu tena.";
    }
  } catch (err) {
    console.error("Database error ya ukweli:", err.message);
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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1F2A24; }
    a { text-decoration: none; }

    /* NAV */
    nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      background: rgba(20, 67, 47, 0.97); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 40px;
    }
    .nav-brand { display: flex; align-items: center; gap: 10px; color: #fff; }
    .nav-brand h1 { font-size: 18px; }
    .nav-brand p { font-size: 11px; color: #A9C9B8; }
    .nav-links { display: flex; gap: 24px; align-items: center; }
    .nav-links a { color: #CFE3D8; font-size: 14px; }
    .nav-links a:hover { color: #fff; }
    .nav-links .btn-nav {
      background: var(--kijani); color: #fff; padding: 8px 20px;
      border-radius: 8px; font-weight: 600; font-size: 14px;
    }

    /* HERO */
    .hero {
      min-height: 100vh;
      background: linear-gradient(135deg, #0D2B1E 0%, #1B5E3F 50%, #2E8B57 100%);
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; text-align: center;
      padding: 100px 24px 60px; position: relative; overflow: hidden;
    }
    .hero::before {
      content: "";
      position: absolute; inset: 0;
      background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
    }
    .hero-badge {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(255,255,255,0.1); color: #A9C9B8;
      padding: 6px 16px; border-radius: 20px; font-size: 13px;
      border: 1px solid rgba(255,255,255,0.15); margin-bottom: 24px;
    }
    .hero h2 {
      font-size: clamp(32px, 6vw, 58px); color: #fff;
      line-height: 1.2; margin-bottom: 20px; font-weight: 800;
    }
    .hero h2 span { color: #6FCFA0; }
    .hero p {
      font-size: clamp(16px, 2vw, 20px); color: #C8E6D4;
      max-width: 600px; margin-bottom: 36px; line-height: 1.6;
    }
    .hero-btns { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; }
    .btn-primary {
      background: #fff; color: var(--kijani-giza);
      padding: 14px 32px; border-radius: 10px; font-weight: 700;
      font-size: 16px; transition: transform 0.2s;
    }
    .btn-primary:hover { transform: translateY(-2px); }
    .btn-secondary {
      background: rgba(255,255,255,0.12); color: #fff;
      padding: 14px 32px; border-radius: 10px; font-weight: 600;
      font-size: 16px; border: 1px solid rgba(255,255,255,0.25);
      transition: background 0.2s;
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.2); }
    .hero-stats {
      display: flex; gap: 48px; margin-top: 56px; flex-wrap: wrap;
      justify-content: center;
    }
    .hero-stat .num { font-size: 32px; font-weight: 800; color: #fff; }
    .hero-stat .lbl { font-size: 13px; color: #A9C9B8; margin-top: 2px; }

    /* FEATURES */
    .section { padding: 80px 40px; }
    .section-center { text-align: center; max-width: 800px; margin: 0 auto 48px; }
    .section-center .tag {
      display: inline-block; background: var(--kijani-mwanga); color: var(--kijani);
      padding: 4px 14px; border-radius: 20px; font-size: 13px;
      font-weight: 600; margin-bottom: 14px;
    }
    .section-center h3 { font-size: clamp(24px, 4vw, 36px); margin-bottom: 14px; }
    .section-center p { color: #6B7670; font-size: 16px; line-height: 1.6; }
    .features-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px; max-width: 1200px; margin: 0 auto;
    }
    .feature-card {
      background: #fff; border-radius: 16px; padding: 28px;
      border: 1px solid #E6EAE8; transition: box-shadow 0.2s, transform 0.2s;
    }
    .feature-card:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.08); transform: translateY(-3px); }
    .feature-icon {
      width: 52px; height: 52px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; margin-bottom: 16px;
    }
    .feature-card h4 { font-size: 17px; margin-bottom: 8px; }
    .feature-card p { color: #6B7670; font-size: 14px; line-height: 1.5; }

    /* HOW IT WORKS */
    .how-section { background: var(--kijani-giza); padding: 80px 40px; }
    .steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 24px; max-width: 1000px; margin: 0 auto; }
    .step { text-align: center; color: #CFE3D8; }
    .step-num {
      width: 48px; height: 48px; border-radius: 50%;
      background: var(--kijani); color: #fff; font-weight: 800; font-size: 20px;
      display: flex; align-items: center; justify-content: center; margin: 0 auto 14px;
    }
    .step h4 { color: #fff; margin-bottom: 8px; font-size: 16px; }
    .step p { font-size: 14px; line-height: 1.5; }

    /* USSD SECTION */
    .ussd-section {
      background: var(--bg); padding: 80px 40px;
      display: flex; align-items: center; justify-content: center; gap: 60px;
      flex-wrap: wrap;
    }
    .ussd-text { max-width: 480px; }
    .ussd-text .tag {
      display: inline-block; background: #FEF3E2; color: #B5760C;
      padding: 4px 14px; border-radius: 20px; font-size: 13px;
      font-weight: 600; margin-bottom: 14px;
    }
    .ussd-text h3 { font-size: 30px; margin-bottom: 14px; }
    .ussd-text p { color: #6B7670; line-height: 1.6; margin-bottom: 20px; }
    .check-list { list-style: none; }
    .check-list li { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 15px; }
    .check-list li::before { content: "✓"; color: var(--kijani); font-weight: 700; font-size: 16px; }
    .ussd-phone {
      background: #1a1a2e; border-radius: 32px; padding: 20px;
      min-width: 240px; max-width: 280px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .ussd-screen {
      background: #0a2a1a; border-radius: 18px; padding: 20px;
      font-family: 'Courier New', monospace; color: #6FCFA0; font-size: 14px;
      line-height: 1.8; min-height: 220px;
    }
    .ussd-dial {
      text-align: center; margin-top: 14px; color: #6FCFA0;
      font-size: 12px; font-family: monospace;
    }

    /* CTA */
    .cta-section {
      background: linear-gradient(135deg, var(--kijani-giza), var(--kijani));
      padding: 80px 40px; text-align: center; color: #fff;
    }
    .cta-section h3 { font-size: clamp(24px, 4vw, 38px); margin-bottom: 14px; }
    .cta-section p { color: #C8E6D4; font-size: 16px; margin-bottom: 32px; max-width: 520px; margin-left: auto; margin-right: auto; }

    /* FOOTER */
    footer {
      background: #0D2B1E; color: #6B9C7E; padding: 40px;
      display: flex; justify-content: space-between; align-items: center;
      flex-wrap: wrap; gap: 16px;
    }
    footer .brand { color: #fff; font-weight: 700; font-size: 16px; }
    footer p { font-size: 13px; }

    @media (max-width: 768px) {
      nav { padding: 14px 20px; }
      .nav-links { gap: 12px; }
      .nav-links a:not(.btn-nav) { display: none; }
      .section { padding: 60px 20px; }
      .how-section { padding: 60px 20px; }
      .ussd-section { padding: 60px 20px; gap: 40px; }
      .hero-stats { gap: 28px; }
    }
  </style>
</head>
<body>

  <!-- NAV -->
  <nav>
    <div class="nav-brand">
      <span style="font-size:24px">🌱</span>
      <div><h1>Soko la Mkulima</h1><p>Soko la Mazao Tanzania</p></div>
    </div>
    <div class="nav-links">
      <a href="/soko">Tazama Mazao</a>
      <a href="#jinsi">Jinsi Inavyofanya Kazi</a>
      <a href="/soko" class="btn-nav">Tafuta Wakulima →</a>
    </div>
  </nav>

  <!-- HERO -->
  <section class="hero">
    <div class="hero-badge">🌍 Inafanya kazi Tanzania nzima</div>
    <h2>Unganika na <span>Wakulima</span><br>wa Tanzania Moja kwa Moja</h2>
    <p>Tafuta wakulima, angalia bei za mazao, na tangaza mazao yako — kupitia simu ya kawaida au smartphone yako.</p>
    <div class="hero-btns">
      <a href="/soko" class="btn-primary">🔍 Tafuta Wakulima</a>
      <a href="#jinsi" class="btn-secondary">Jinsi Inavyofanya Kazi</a>
    </div>
    <div class="hero-stats">
      <div class="hero-stat"><div class="num">🌾</div><div class="lbl">Mazao Mbalimbali</div></div>
      <div class="hero-stat"><div class="num">📱</div><div class="lbl">Simu Yoyote</div></div>
      <div class="hero-stat"><div class="num">🇹🇿</div><div class="lbl">Tanzania Nzima</div></div>
      <div class="hero-stat"><div class="num">⚡</div><div class="lbl">Bure Kutumia</div></div>
    </div>
  </section>

  <!-- FEATURES -->
  <section class="section" style="background:#fff">
    <div class="section-center">
      <div class="tag">Vipengele</div>
      <h3>Kila Kitu Unachohitaji</h3>
      <p>Mfumo uliobuniwa mahsusi kwa wakulima na wanunuzi wa Tanzania</p>
    </div>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon" style="background:#E8F5EE">🌽</div>
        <h4>Tangaza Mazao Yako</h4>
        <p>Wakulima wanaweza kutangaza mazao yao kwa dakika chache — bei, idadi, na mkoa — kupitia USSD au app.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon" style="background:#EBF5FB">🔍</div>
        <h4>Tafuta Wanunuzi</h4>
        <p>Wanunuzi wanatafuta mazao kwa zao na mkoa, wanaona bei, na wanaunganika moja kwa moja na mkulima.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon" style="background:#FEF9E7">💰</div>
        <h4>Bei za Soko la Kweli</h4>
        <p>Angalia bei halisi za mazao kwa kila mkoa — mahindi, mpunga, maharage, na zaidi — zilizosasishwa mara kwa mara.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon" style="background:#FEF3E2">☀️</div>
        <h4>Hali ya Hewa</h4>
        <p>Pata taarifa za hali ya hewa kwa mkoa wako moja kwa moja kupitia USSD — mvua, joto, unyevu.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon" style="background:#FDEDEC">✓</div>
        <h4>Wakulima Waliokaguliwa</h4>
        <p>Wakulima waliokaguliwa (Verified) wanaonekana na alama maalum — wanunuzi wanaweza kuamini zaidi.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon" style="background:#F5EEF8">⭐</div>
        <h4>Ukadiriaji na Maoni</h4>
        <p>Baada ya muamala, wanunuzi wanampa mkulima nyota (1-5) — inasaidia wanunuzi wengine kuchagua vizuri.</p>
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section class="how-section" id="jinsi">
    <div class="section-center" style="color:#fff">
      <div class="tag" style="background:rgba(255,255,255,0.1);color:#6FCFA0">Jinsi Inavyofanya Kazi</div>
      <h3 style="color:#fff">Rahisi Kama 1-2-3</h3>
      <p style="color:#A9C9B8">Inapatikana kwa kila mtu — hata bila smartphone au intaneti</p>
    </div>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <h4>Jisajili</h4>
        <p>Piga *384*26213# kutoka simu yoyote, au tembelea tovuti hii kama una smartphone.</p>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <h4>Tangaza au Tafuta</h4>
        <p>Wakulima watangaze mazao yao. Wanunuzi watafute kwa zao na mkoa wanaotaka.</p>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <h4>Unganika</h4>
        <p>Mfumo unaunganisha mkulima na mnunuzi moja kwa moja — wawasiliane na kufanya biashara.</p>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <h4>Ukadiriaji</h4>
        <p>Baada ya biashara, toa ukadiriaji ili kusaidia wakulima wengine kujenga uaminifu.</p>
      </div>
    </div>
  </section>

  <!-- USSD SECTION -->
  <section class="ussd-section">
    <div class="ussd-text">
      <div class="tag">Bila Intaneti</div>
      <h3>Inafanya Kazi Kwenye<br>Simu Yoyote</h3>
      <p>Hata kama huna smartphone au intaneti — piga tu namba fupi yetu na ufanye biashara moja kwa moja kutoka simu yako ya kawaida.</p>
      <ul class="check-list">
        <li>Huhitaji intaneti wala data</li>
        <li>Inafanya kazi kwenye simu yoyote ya bei yoyote</li>
        <li>Vodacom, Tigo, Airtel — zote zinafanya kazi</li>
        <li>Lugha ya Kiswahili — rahisi kuelewa</li>
      </ul>
    </div>
    <div class="ussd-phone">
      <div class="ussd-screen">
        <div>Karibu Soko la</div>
        <div>Mkulima</div>
        <div>&nbsp;</div>
        <div>1. Mkulima</div>
        <div>2. Mnunuzi</div>
        <div>&nbsp;</div>
        <div style="color:#FFD700">▌</div>
      </div>
      <div class="ussd-dial">Piga: *384*26213#</div>
    </div>
  </section>

  <!-- CTA -->
  <section class="cta-section">
    <h3>Anza Leo — Ni Bure Kabisa</h3>
    <p>Jiunge na wakulima na wanunuzi wanaotumia Soko la Mkulima kufanya biashara nzuri Tanzania.</p>
    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
      <a href="/soko" class="btn-primary" style="background:#fff;color:#14432F">
        🔍 Tazama Wakulima Wote
      </a>
      <a href="tel:*384*26213%23" class="btn-secondary" style="border-color:rgba(255,255,255,0.4)">
        📱 Piga *384*26213#
      </a>
    </div>
  </section>

  <!-- FOOTER -->
  <footer>
    <div>
      <div class="brand">🌱 Soko la Mkulima</div>
      <p style="margin-top:4px">Kuunganisha Wakulima na Wanunuzi Tanzania</p>
    </div>
    <div style="display:flex;gap:24px;flex-wrap:wrap">
      <a href="/soko" style="color:#6B9C7E;font-size:14px">Tazama Mazao</a>
      <a href="#jinsi" style="color:#6B9C7E;font-size:14px">Jinsi Inavyofanya Kazi</a>
    </div>
    <p style="font-size:13px">© 2026 Soko la Mkulima. Haki zote zimehifadhiwa.</p>
  </footer>

</body>
</html>`);
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
      "SELECT 1 FROM mfumo_setup WHERE jina = 'database_setup'",
    );
    if (ipo.rows.length > 0) {
      return res
        .status(403)
        .send(
          "⚠️ Setup tayari ilishafanyika awali. Route hii sasa imefungwa kabisa.",
        );
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
      "INSERT INTO mfumo_setup (jina) VALUES ('database_setup')",
    );

    res.send(
      "✅ Database imetengenezwa kikamilifu! Route hii sasa imefungwa kiotomatiki, haitafanya kazi tena.",
    );
  } catch (err) {
    res.status(500).send("❌ Tatizo: " + err.message);
  }
});

// ---- UKURASA WA WASIFU WA MKULIMA (/mkulima/:simu) ----
app.get("/mkulima/:simu", async (req, res) => {
  try {
    const simu = decodeURIComponent(req.params.simu);
    const wasifu = await pool.query(
      "SELECT * FROM wakulima WHERE phone_number = $1 ORDER BY tarehe ASC LIMIT 1",
      [simu],
    );
    if (wasifu.rows.length === 0) {
      return res
        .status(404)
        .send(
          `<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Mkulima Hapatikani</h2><p>Namba hii haijasajiliwa.</p></body></html>`,
        );
    }
    const w = wasifu.rows[0];
    const matangazoResult = await pool.query(
      "SELECT * FROM matangazo WHERE phone_number = $1 AND active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY tarehe DESC",
      [simu],
    );
    const maombiResult = await pool.query(
      "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1",
      [simu],
    );
    const maombiKubaliwa = await pool.query(
      "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1 AND status = 'accepted'",
      [simu],
    );
    const matangazoRows =
      matangazoResult.rows
        .map(
          (m) =>
            `<div class="listing-card"><div class="crop-icon">🌾</div><div>
        <div class="crop-name">${capitalize(m.zao)}</div>
        <div class="crop-details">Magunia ${m.idadi}${m.bei ? ` • TZS ${Number(m.bei).toLocaleString()} / gunia` : ""}</div>
        <div class="crop-date">${new Date(m.tarehe).toLocaleDateString("sw-TZ")}</div>
      </div></div>`,
        )
        .join("") || `<p style="color:#6B7670">Hakuna matangazo ya sasa.</p>`;

    res.send(`<!DOCTYPE html><html lang="sw"><head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${w.jina} — Soko la Mkulima</title>
      <style>
        :root{--kijani:#2E8B57;--kijani-giza:#14432F;--kijani-mwanga:#E8F5EE;--bg:#F2F5F4}
        *{box-sizing:border-box}
        body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:#1F2A24}
        .header{background:var(--kijani-giza);color:#fff;padding:16px 24px;display:flex;align-items:center;gap:12px}
        .header h1{margin:0;font-size:18px}.header p{margin:2px 0 0;font-size:12px;color:#A9C9B8}
        .container{max-width:700px;margin:32px auto;padding:0 16px}
        .card{background:#fff;border-radius:16px;padding:28px;margin-bottom:20px;border:1px solid #E6EAE8;box-shadow:0 2px 8px rgba(0,0,0,0.05)}
        .profile-top{display:flex;align-items:center;gap:20px;margin-bottom:20px}
        .avatar{width:72px;height:72px;border-radius:50%;background:var(--kijani-mwanga);display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0}
        .profile-name{font-size:22px;font-weight:700;margin:0 0 4px}
        .profile-location{color:#6B7670;font-size:14px}
        .badge{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-top:8px}
        .badge-ok{background:#E1F5EC;color:#1B5E3F}.badge-pending{background:#FDF2E1;color:#B5760C}
        .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .stat{background:var(--kijani-mwanga);border-radius:10px;padding:14px;text-align:center}
        .stat .num{font-size:24px;font-weight:700;color:var(--kijani)}.stat .label{font-size:12px;color:#6B7670;margin-top:2px}
        .section-title{font-size:17px;font-weight:700;margin:24px 0 12px}
        .listing-card{background:#fff;border-radius:12px;padding:16px;margin-bottom:10px;border:1px solid #E6EAE8;display:flex;align-items:center;gap:14px}
        .crop-icon{font-size:28px}.crop-name{font-weight:600;font-size:15px}
        .crop-details{color:var(--kijani);font-size:13px;margin-top:2px}
        .crop-date{color:#6B7670;font-size:12px;margin-top:2px}
        .contact-card{background:var(--kijani-giza);color:#fff;border-radius:14px;padding:20px;text-align:center;margin-top:20px}
        .contact-card p{margin:0 0 14px;font-size:14px;color:#A9C9B8}
        .contact-btn{display:inline-block;background:#fff;color:var(--kijani-giza);font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px}
        .footer{text-align:center;color:#6B7670;font-size:12px;margin:32px 0 20px}
      </style></head><body>
      <div class="header"><span style="font-size:22px">🌱</span><div><h1>Soko la Mkulima</h1><p>Soko la Mazao Tanzania</p></div></div>
      <div class="container">
        <div class="card">
          <div class="profile-top">
            <div class="avatar">👨‍🌾</div>
            <div>
              <div class="profile-name">${w.jina}</div>
              <div class="profile-location">📍 ${w.mkoa}, ${w.wilaya}</div>
              ${w.verified ? `<span class="badge badge-ok">✓ Mkulima Aliyethibitishwa</span>` : `<span class="badge badge-pending">⏳ Bado Hajathibitishwa</span>`}
            </div>
          </div>
          <div class="stats">
            <div class="stat"><div class="num">${matangazoResult.rows.length}</div><div class="label">Matangazo</div></div>
            <div class="stat"><div class="num">${maombiResult.rows[0].count}</div><div class="label">Maombi Yaliyopokelewa</div></div>
            <div class="stat"><div class="num">${maombiKubaliwa.rows[0].count}</div><div class="label">Miamala Iliyofanikiwa</div></div>
          </div>
        </div>
        <div class="section-title">Mazao Yanayouzwa Sasa</div>
        ${matangazoRows}
        <div class="contact-card">
          <p>Una nia ya kununua mazao ya ${w.jina}?</p>
          <a href="tel:${w.phone_number}" class="contact-btn">📞 Piga Simu</a>
        </div>
        <div class="footer">Soko la Mkulima — Kuunganisha Wakulima na Wanunuzi Tanzania</div>
      </div></body></html>`);
  } catch (err) {
    res.status(500).send("Tatizo: " + err.message);
  }
});

// ---- UKURASA WA SOKO KUU (/soko) - orodha ya wakulima wote ----
// ============================================================
// ---- API ROUTES (JSON) - Kwa Flutter App ----
// ============================================================

// GET /api/takwimu - Takwimu za jumla
app.get("/api/takwimu", async (req, res) => {
  try {
    const wakulima = await pool.query("SELECT COUNT(*) FROM wakulima");
    const matangazo = await pool.query(
      "SELECT COUNT(*) FROM matangazo WHERE active = TRUE",
    );
    const mazao = await pool.query(
      "SELECT COUNT(DISTINCT zao) FROM matangazo WHERE active = TRUE",
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

// GET /api/matangazo?zao=mahindi&mkoa=Dodoma
// GET /api/matangazo?zao=mahindi&mkoa=Dodoma
app.get("/api/matangazo", async (req, res) => {
  try {
    const { zao, mkoa } = req.query;

    // Tumeondoa DISTINCT ON ili matangazo yote mapya yaonekane bila kupotea au kufichwa na ya zamani
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

    // Kusafisha zao kuwa herufi ndogo ili kulingana na database kikamilifu
    if (zao && zao.trim() !== "") {
      params.push(`%${zao.toLowerCase().trim()}%`);
      query += ` AND LOWER(m.zao) LIKE $${params.length}`;
    }

    // Kusafisha mkoa ulingane vizuri
    if (mkoa && mkoa.trim() !== "") {
      params.push(`%${mkoa.toLowerCase().trim()}%`);
      query += ` AND (LOWER(m.mkoa) LIKE $${params.length} OR LOWER(w.mkoa) LIKE $${params.length})`;
    }

    // Sasa hivi tunapanga kwa tarehe ya sasa hivi (Jipya zaidi linaanza juu kabisa)
    query += " ORDER BY m.tarehe DESC LIMIT 50";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error kubwa kwenye getMatangazo API:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mkulima/:simu - Wasifu wa mkulima mmoja
app.get("/api/mkulima/:simu", async (req, res) => {
  try {
    const simu = decodeURIComponent(req.params.simu);

    // 1. Vuta wasifu wa mkulima
    const wasifu = await pool.query(
      "SELECT * FROM wakulima WHERE phone_number = $1 ORDER BY tarehe ASC LIMIT 1",
      [simu],
    );
    if (wasifu.rows.length === 0) {
      return res.status(404).json({ error: "Mkulima hapatikani" });
    }

    // 2. Vuta matangazo yake yaliyothibitishwa tu (Imerekebishwa kutoka active = TRUE kwenda status = 'accepted')
    const matangazo = await pool.query(
      "SELECT * FROM matangazo WHERE phone_number = $1 AND status = 'accepted' ORDER BY tarehe DESC",
      [simu],
    );

    // 3. Hesabu ya maombi ya ununuzi
    const maombi = await pool.query(
      "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1",
      [simu],
    );

    // 4. Hesabu ya maombi yaliyokubaliwa
    const kubaliwa = await pool.query(
      "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1 AND status = 'accepted'",
      [simu],
    );

    // 5. Hesabu ya Rating (Nyota)
    const rating = await pool.query(
      "SELECT ROUND(AVG(nyota), 1) as wastani FROM ratings WHERE farmer_phone = $1",
      [simu],
    );

    // Kurudisha majibu kamili kwenda kwenye Flutter App
    res.json({
      ...wasifu.rows[0],
      matangazo: matangazo.rows,
      maombi_count: parseInt(maombi.rows[0].count),
      kubaliwa_count: parseInt(kubaliwa.rows[0].count),
      wastani_rating: rating.rows[0].wastani || "0.0", // Kama hana nyota iandike 0.0 badala ya null
    });
  } catch (err) {
    console.error("Error kwenye profile API:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bei - Bei za mazao
app.get("/api/bei", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM bei_mazao ORDER BY zao, mkoa",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mazao - Mazao yote yaliyopo (kwa dropdowns)
app.get("/api/mazao", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT DISTINCT zao FROM matangazo WHERE active = TRUE ORDER BY zao",
    );
    res.json(result.rows.map((r) => r.zao));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ombi - Tuma ombi la ununuzi
app.post("/api/ombi", async (req, res) => {
  try {
    // 1. Hakikisha tunasoma mkoa unaotoka kwenye Flutter App sasa hivi
    const { buyer_phone, farmer_phone, zao, idadi, mkoa } = req.body;

    // Angalia kama kuna farmer_phone (Ombi kwa mkulima maalum)
    if (farmer_phone && farmer_phone.trim() !== "") {
      await pool.query(
        "INSERT INTO purchase_requests (buyer_phone, farmer_phone, zao, idadi) VALUES ($1, $2, $3, $4)",
        [buyer_phone, farmer_phone, zao, idadi],
      );

      await tumaSMS(
        farmer_phone,
        `Mnunuzi anataka kununua\n${capitalize(zao)} yako.\nMpigie: ${buyer_phone}`,
      );
    } else {
      // 2. Ombi kwa mkoa mzima (Hapa ndipo Flutter yako inapoangukia)
      const mkoaSafi = mkoa ? mkoa.trim() : "Haijulikani";
      const idadiSafi = idadi ? idadi.trim() : "?";

      // Hifadhi kwenye jedwali la buyer_requests kama ulivyodesign
      await pool.query(
        "INSERT INTO buyer_requests (zao, idadi, mkoa, phone_number) VALUES ($1, $2, $3, $4)",
        [zao.toLowerCase().trim(), idadiSafi, mkoaSafi, buyer_phone],
      );

      // 3. Tafuta wakulima wa mkoa huo ili uwatumie SMS ya tahadhari (Alert)
      const wakulima = await pool.query(
        "SELECT phone_number FROM wakulima WHERE mkoa ILIKE $1 LIMIT 10",
        [`%${mkoaSafi}%`], // Inatafuta hata kama mteja ameandika kwa herufi kubwa au ndogo
      );

      // Tuma SMS kwa wakulima wote wa mkoa huo waliopatikana
      for (const w of wakulima.rows) {
        await tumaSMS(
          w.phone_number,
          `Fursa! Mnunuzi anahitaji ${idadiSafi} ya ${capitalize(zao)} mkoa wa ${mkoaSafi}.\nMpigie: ${buyer_phone}`,
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

// ---- MWISHO WA API ROUTES ----

// ============================================================
// ---- API ROUTES ZA JSON (zinatumika na Flutter App) ----
// ============================================================

// Takwimu za jumla
app.get("/api/takwimu", async (req, res) => {
  try {
    const wakulima = await pool.query("SELECT COUNT(*) FROM wakulima");
    const matangazo = await pool.query(
      "SELECT COUNT(*) FROM matangazo WHERE active = TRUE",
    );
    const mazao = await pool.query(
      "SELECT COUNT(DISTINCT zao) FROM matangazo WHERE active = TRUE",
    );
    res.json({
      wakulima: parseInt(wakulima.rows[0].count),
      matangazo: parseInt(matangazo.rows[0].count),
      mazao: parseInt(mazao.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Matangazo yote (na filter)
app.get("/api/matangazo", async (req, res) => {
  try {
    const { zao, mkoa } = req.query;
    let query = `
      SELECT DISTINCT ON (m.phone_number, m.zao)
        m.id, m.zao, m.idadi, m.bei, m.phone_number,
        (SELECT jina FROM wakulima w WHERE w.phone_number = m.phone_number ORDER BY tarehe ASC LIMIT 1) AS jina,
        (SELECT mkoa FROM wakulima w WHERE w.phone_number = m.phone_number ORDER BY tarehe ASC LIMIT 1) AS mkoa,
        (SELECT wilaya FROM wakulima w WHERE w.phone_number = m.phone_number ORDER BY tarehe ASC LIMIT 1) AS wilaya,
        (SELECT verified FROM wakulima w WHERE w.phone_number = m.phone_number ORDER BY tarehe ASC LIMIT 1) AS verified,
        (SELECT ROUND(AVG(nyota),1) FROM ratings r WHERE r.farmer_phone = m.phone_number) AS wastani_rating
      FROM matangazo m
      WHERE m.active = TRUE AND (m.expires_at IS NULL OR m.expires_at > NOW())
    `;
    const params = [];
    if (zao) {
      params.push(zao);
      query += ` AND m.zao = $${params.length}`;
    }
    if (mkoa) {
      params.push(mkoa);
      query += ` AND (SELECT mkoa FROM wakulima w WHERE w.phone_number = m.phone_number LIMIT 1) = $${params.length}`;
    }
    query += " ORDER BY m.phone_number, m.zao, m.tarehe DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wasifu wa mkulima mmoja
app.get("/api/mkulima/:simu", async (req, res) => {
  try {
    const simu = decodeURIComponent(req.params.simu);
    const wasifu = await pool.query(
      "SELECT * FROM wakulima WHERE phone_number = $1 ORDER BY tarehe ASC LIMIT 1",
      [simu],
    );
    if (wasifu.rows.length === 0)
      return res.status(404).json({ error: "Hapatikani" });

    const matangazo = await pool.query(
      "SELECT * FROM matangazo WHERE phone_number = $1 AND active = TRUE ORDER BY tarehe DESC",
      [simu],
    );
    const maombi = await pool.query(
      "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1",
      [simu],
    );
    const kubaliwa = await pool.query(
      "SELECT COUNT(*) FROM purchase_requests WHERE farmer_phone = $1 AND status = 'accepted'",
      [simu],
    );
    const rating = await pool.query(
      "SELECT ROUND(AVG(nyota),1) as wastani FROM ratings WHERE farmer_phone = $1",
      [simu],
    );

    res.json({
      ...wasifu.rows[0],
      matangazo: matangazo.rows,
      maombi_count: parseInt(maombi.rows[0].count),
      kubaliwa_count: parseInt(kubaliwa.rows[0].count),
      wastani_rating: rating.rows[0].wastani,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bei za mazao
app.get("/api/bei", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM bei_mazao ORDER BY zao, mkoa",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tuma ombi la ununuzi (kutoka Flutter)
app.post("/api/ombi", async (req, res) => {
  try {
    const { buyer_phone, zao, idadi, mkoa } = req.body;
    if (!buyer_phone || !zao || !idadi) {
      return res.status(400).json({ error: "Taarifa zinazohitajika hazipo" });
    }
    await pool.query(
      "INSERT INTO buyer_requests (zao, idadi, mkoa, phone_number) VALUES ($1, $2, $3, $4)",
      [zao, idadi, mkoa || "", buyer_phone],
    );
    // Julisha wakulima wa mkoa huo
    if (mkoa) {
      const wakulima = await pool.query(
        "SELECT phone_number FROM wakulima WHERE mkoa ILIKE $1 LIMIT 10",
        [mkoa],
      );
      for (const w of wakulima.rows) {
        await tumaSMS(
          w.phone_number,
          `Mnunuzi anahitaji ${idadi} ya ${capitalize(zao)}\nmkoa wa ${mkoa}.\nMpigie: ${buyer_phone}`,
        );
      }
    }
    res.json({ success: true, message: "Ombi limetumwa" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================

app.get("/soko", async (req, res) => {
  try {
    const zaoChaguzi = req.query.zao || "";
    const mkoaChaguzi = req.query.mkoa || "";

    // Pata ratings za kila mkulima
    const ratingsResult = await pool.query(`
      SELECT farmer_phone, ROUND(AVG(nyota), 1) as wastani, COUNT(*) as idadi
      FROM ratings GROUP BY farmer_phone
    `);
    const ratingsMap = {};
    ratingsResult.rows.forEach((r) => {
      ratingsMap[r.farmer_phone] = { wastani: r.wastani, idadi: r.idadi };
    });

    // Pata mazao yote na mikoa yote kwa filter dropdowns
    const mazaoResult = await pool.query(
      "SELECT DISTINCT zao FROM matangazo WHERE active = TRUE ORDER BY zao",
    );
    const mikoaResult = await pool.query(
      "SELECT DISTINCT mkoa FROM wakulima ORDER BY mkoa",
    );

    // Pata matangazo yote ukizingatia filter
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

    // Tengeneza HTML ya kadi za wakulima
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

    // Tengeneza options za filter
    const mazaoOptions = mazaoResult.rows
      .map(
        (r) =>
          `<option value="${r.zao}" ${zaoChaguzi === r.zao ? "selected" : ""}>${capitalize(r.zao)}</option>`,
      )
      .join("");
    const mikoaOptions = mikoaResult.rows
      .map(
        (r) =>
          `<option value="${r.mkoa}" ${mkoaChaguzi === r.mkoa ? "selected" : ""}>${r.mkoa}</option>`,
      )
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

          /* HEADER */
          .header{background:var(--kijani-giza);color:#fff;padding:16px 24px;display:flex;align-items:center;justify-content:space-between}
          .header-logo{display:flex;align-items:center;gap:12px}
          .header h1{font-size:20px}
          .header p{font-size:12px;color:#A9C9B8;margin-top:2px}
          .header-nav a{color:#A9C9B8;text-decoration:none;font-size:13px;margin-left:16px}
          .header-nav a:hover{color:#fff}

          /* RATING */
          .rating{font-size:13px;color:#F59E0B;margin-top:4px}
          .rating span{color:#6B7670;font-size:12px}

          /* HERO */
          .hero{background:linear-gradient(135deg,var(--kijani-giza) 0%,var(--kijani) 100%);color:#fff;padding:48px 24px;text-align:center}
          .hero h2{font-size:32px;margin-bottom:10px}
          .hero p{font-size:16px;color:#C8E6D4;margin-bottom:28px}
          .takwimu-hero{display:flex;justify-content:center;gap:40px;flex-wrap:wrap}
          .takwimu-hero div{text-align:center}
          .takwimu-hero .num{font-size:28px;font-weight:700}
          .takwimu-hero .lbl{font-size:13px;color:#A9C9B8}

          /* FILTER */
          .filter-bar{background:#fff;border-bottom:1px solid #E6EAE8;padding:16px 24px}
          .filter-inner{max-width:1100px;margin:0 auto;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
          .filter-inner select{padding:9px 14px;border:1px solid #E6EAE8;border-radius:8px;font-size:14px;background:#fff;cursor:pointer;min-width:160px}
          .filter-inner button{background:var(--kijani);color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
          .filter-inner a.reset{color:#6B7670;font-size:13px;text-decoration:none}

          /* GRID */
          .main{max-width:1100px;margin:28px auto;padding:0 20px}
          .matokeo-info{font-size:14px;color:#6B7670;margin-bottom:16px}
          .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}

          /* KADI */
          .kadi{background:#fff;border-radius:14px;padding:20px;border:1px solid #E6EAE8;box-shadow:0 1px 4px rgba(0,0,0,0.04);transition:box-shadow 0.2s}
          .kadi:hover{box-shadow:0 4px 16px rgba(0,0,0,0.08)}
          .kadi-juu{display:flex;align-items:center;gap:12px;margin-bottom:14px}
          .avatar{width:48px;height:48px;border-radius:50%;background:var(--kijani-mwanga);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
          .jina{font-weight:700;font-size:15px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
          .eneo{color:#6B7670;font-size:13px;margin-top:3px}
          .badge-ok{background:#E1F5EC;color:#1B5E3F;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
          .badge-pending{background:#FDF2E1;color:#B5760C;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
          .mazao-info{background:var(--kijani-mwanga);border-radius:10px;padding:12px;margin-bottom:14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
          .zao-badge{background:var(--kijani);color:#fff;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600}
          .idadi{font-size:13px;color:#1F2A24}
          .bei{font-size:13px;color:var(--kijani);font-weight:600;margin-left:auto}
          .kadi-vitendo{display:flex;gap:8px}
          .btn-wasifu{flex:1;text-align:center;background:var(--kijani-mwanga);color:var(--kijani);font-weight:600;padding:9px;border-radius:8px;text-decoration:none;font-size:13px}
          .btn-simu{flex:1;text-align:center;background:var(--kijani);color:#fff;font-weight:600;padding:9px;border-radius:8px;text-decoration:none;font-size:13px}

          /* HAKUNA */
          .hakuna{text-align:center;padding:60px 20px;color:#6B7670}
          .hakuna h3{margin:12px 0 8px}

          /* FOOTER */
          .footer{text-align:center;padding:32px;color:#6B7670;font-size:13px;border-top:1px solid #E6EAE8;margin-top:40px}
          .footer strong{color:var(--kijani)}

          @media(max-width:600px){
            .hero h2{font-size:24px}
            .takwimu-hero{gap:24px}
            .header-nav{display:none}
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-logo">
            <span style="font-size:26px">🌱</span>
            <div><h1>Soko la Mkulima</h1><p>Soko la Mazao Tanzania</p></div>
          </div>
          <div class="header-nav">
            <a href="/soko">Nyumbani</a>
            <a href="/soko?zao=mahindi">Mahindi</a>
            <a href="/soko?zao=mpunga">Mpunga</a>
            <a href="/soko?zao=maharage">Maharage</a>
          </div>
        </div>

        <!-- HERO -->
        <div class="hero">
          <h2>🌾 Tafuta Wakulima Tanzania</h2>
          <p>Unganika moja kwa moja na wakulima wanaouza mazao yako unayohitaji</p>
          <div class="takwimu-hero">
            <div>
              <div class="num">${matangazoResult.rows.length}</div>
              <div class="lbl">Matangazo Yaliyopatikana</div>
            </div>
            <div>
              <div class="num">${mikoaResult.rows.length}</div>
              <div class="lbl">Mikoa</div>
            </div>
            <div>
              <div class="num">${mazaoResult.rows.length}</div>
              <div class="lbl">Aina za Mazao</div>
            </div>
          </div>
        </div>

        <!-- FILTER -->
        <div class="filter-bar">
          <form class="filter-inner" method="GET" action="/soko">
            <select name="zao">
              <option value="">🌱 Mazao yote</option>
              ${mazaoOptions}
            </select>
            <select name="mkoa">
              <option value="">📍 Mikoa yote</option>
              ${mikoaOptions}
            </select>
            <button type="submit">Tafuta</button>
            ${zaoChaguzi || mkoaChaguzi ? `<a class="reset" href="/soko">✕ Futa Filter</a>` : ""}
          </form>
        </div>

        <!-- GRID YA WAKULIMA -->
        <div class="main">
          <div class="matokeo-info">
            Matangazo ${matangazoResult.rows.length} yamepatikana
            ${zaoChaguzi ? ` • Zao: <strong>${capitalize(zaoChaguzi)}</strong>` : ""}
            ${mkoaChaguzi ? ` • Mkoa: <strong>${mkoaChaguzi}</strong>` : ""}
          </div>
          <div class="grid">
            ${kadiZaWakulima}
          </div>
        </div>

        <div class="footer">
          <strong>Soko la Mkulima</strong> — Kuunganisha Wakulima na Wanunuzi Tanzania<br>
          Piga *384*26213# kutoka simu yoyote kujisajili au kutangaza mazao yako
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Tatizo: " + err.message);
  }
});
// Kuitumia mara MOJA: https://yoursite.onrender.com/migrate-v2?siri=SIRI_YAKO
app.get("/migrate-v2", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi. Siri si sahihi.");
  }
  try {
    await pool.query(
      `ALTER TABLE matangazo ADD COLUMN IF NOT EXISTS bei INTEGER`,
    );
    await pool.query(
      `ALTER TABLE matangazo ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`,
    );
    await pool.query(
      `ALTER TABLE matangazo ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '90 days')`,
    );
    await pool.query(
      `ALTER TABLE wakulima ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE`,
    );
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS purchase_requests (
        id SERIAL PRIMARY KEY,
        buyer_phone VARCHAR(20) NOT NULL,
        farmer_phone VARCHAR(20) NOT NULL,
        zao VARCHAR(100) NOT NULL,
        idadi VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        buyer_phone VARCHAR(20) NOT NULL,
        farmer_phone VARCHAR(20) NOT NULL,
        ombi_id INTEGER NOT NULL,
        nyota INTEGER NOT NULL CHECK (nyota BETWEEN 1 AND 5),
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        reference VARCHAR(100) UNIQUE NOT NULL,
        buyer_phone VARCHAR(20),
        farmer_phone VARCHAR(20),
        zao VARCHAR(100),
        amount DECIMAL(12, 2) NOT NULL,
        method VARCHAR(20) NOT NULL CHECK (method IN ('M-Pesa','Airtel Money','Tigo Pesa','Bank')),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
        tarehe TIMESTAMP DEFAULT NOW()
      );
    `);
    res.send(
      "✅ Migration v2 imefanikiwa! Safu mpya (bei, verified, active, buyer_requests, wanunuzi, purchase_requests) zimeongezwa.",
    );
  } catch (err) {
    res.status(500).send("❌ Tatizo: " + err.message);
  }
});

// Fungua: https://yoursite.onrender.com/admin?siri=SIRI_YAKO
app.get("/admin", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res
      .status(403)
      .send("Hairuhusiwi. Ongeza ?siri=SIRI_YAKO mwishoni mwa URL.");
  }
  try {
    const result = await pool.query(
      "SELECT * FROM bei_mazao ORDER BY zao, mkoa",
    );
    const wakulimaResult = await pool.query(
      "SELECT * FROM wakulima ORDER BY tarehe DESC",
    );
    const matangazoResult = await pool.query(
      "SELECT * FROM matangazo ORDER BY tarehe DESC",
    );
    const requestsResult = await pool.query(`
  SELECT *
  FROM purchase_requests
  ORDER BY tarehe DESC
  LIMIT 50
`);

    const wanunuziResult = await pool.query("SELECT COUNT(*) FROM wanunuzi");
    const mahitajiResult = await pool.query(`
      SELECT zao, COUNT(*) as idadi
      FROM buyer_requests
      GROUP BY zao
      ORDER BY idadi DESC
      LIMIT 6
    `);
    const mazaoAsilimiaResult = await pool.query(`
      SELECT zao, COUNT(*) as idadi
      FROM matangazo
      GROUP BY zao
      ORDER BY idadi DESC
      LIMIT 6
    `);
    // Mwenendo wa matangazo siku 7 zilizopita (kwa chati ya mstari)
    const wikiResult = await pool.query(`
      SELECT TO_CHAR(d.siku, 'DY') AS siku, COUNT(m.id) AS idadi
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') d(siku)
      LEFT JOIN matangazo m ON DATE(m.tarehe) = d.siku
      GROUP BY d.siku
      ORDER BY d.siku
    `);
    // ANALYTICS: Wakulima kwa Mkoa
    const wakulimaMkoaResult = await pool.query(`
      SELECT mkoa, COUNT(*) as idadi
      FROM wakulima GROUP BY mkoa ORDER BY idadi DESC LIMIT 8
    `);
    // ANALYTICS: Demand vs Supply
    const demandVsSupply = await pool.query(`
      SELECT
        COALESCE(s.zao, d.zao) AS zao,
        COALESCE(s.supply, 0) AS supply,
        COALESCE(d.demand, 0) AS demand
      FROM (
        SELECT zao, SUM(CAST(REGEXP_REPLACE(idadi, '[^0-9]', '', 'g') AS INTEGER)) AS supply
        FROM matangazo WHERE active = TRUE GROUP BY zao
      ) s
      FULL OUTER JOIN (
        SELECT zao, SUM(CAST(REGEXP_REPLACE(idadi, '[^0-9]', '', 'g') AS INTEGER)) AS demand
        FROM buyer_requests GROUP BY zao
      ) d ON s.zao = d.zao
      ORDER BY supply DESC LIMIT 6
    `);
    // ANALYTICS: Ratings
    const ratingsResult = await pool.query(`
      SELECT farmer_phone, ROUND(AVG(nyota),1) as wastani, COUNT(*) as idadi
      FROM ratings GROUP BY farmer_phone ORDER BY wastani DESC LIMIT 5
    `);
    // NOTIFICATIONS: mambo yanayohitaji umakini
    const keshoResult = await pool.query(`
      SELECT COUNT(*) FROM matangazo
      WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '1 day' AND active = TRUE
    `);
    const hawajaThitibishwaResult = await pool.query(
      "SELECT COUNT(*) FROM wakulima WHERE verified = FALSE",
    );
    const maombiMapyaResult = await pool.query(
      "SELECT COUNT(*) FROM purchase_requests WHERE status = 'pending'",
    );
    const wakulimaMpyaResult = await pool.query(
      "SELECT COUNT(*) FROM wakulima WHERE tarehe > NOW() - INTERVAL '24 hours'",
    );

    const safeSiri = encodeURIComponent(req.query.siri);
    const jumlaMatangazo = matangazoResult.rows.length;

    // ---- Rangi za chati (zinazoendana na sidebar ya kijani) ----
    const rangiPalette = [
      "#2E8B57",
      "#E67E22",
      "#3B82C4",
      "#8B5FBF",
      "#D7263D",
      "#1B5E3F",
    ];

    // ---- Donut chart ya "Mazao Yanayouzwa Zaidi" (CSS conic-gradient) ----
    let kasoro = 0;
    const donutSegments = mazaoAsilimiaResult.rows.map((r, i) => {
      const asilimia = jumlaMatangazo ? (r.idadi / jumlaMatangazo) * 100 : 0;
      const mwanzo = kasoro;
      kasoro += asilimia;
      return {
        zao: r.zao,
        idadi: r.idadi,
        asilimia,
        mwanzo,
        mwisho: kasoro,
        rangi: rangiPalette[i % rangiPalette.length],
      };
    });
    const donutGradient = donutSegments.length
      ? donutSegments
          .map((s) => `${s.rangi} ${s.mwanzo}% ${s.mwisho}%`)
          .join(", ")
      : "#e5e7eb 0% 100%";
    const donutLegend =
      donutSegments
        .map(
          (s) =>
            `<div class="legend-item"><span class="dot" style="background:${s.rangi}"></span>${capitalize(s.zao)} <b>${Math.round(s.asilimia)}%</b></div>`,
        )
        .join("") || "<div class='legend-item'>Hakuna data bado</div>";

    // ---- Bar chart ya "Mazao Yanayohitajika Zaidi" ----
    const idadiKubwaMahitaji = Math.max(
      1,
      ...mahitajiResult.rows.map((r) => parseInt(r.idadi)),
    );
    const mahitajiBars =
      mahitajiResult.rows
        .map((r, i) => {
          const upana = Math.round((r.idadi / idadiKubwaMahitaji) * 100);
          return `
        <div class="bar-row">
          <span class="bar-label">${capitalize(r.zao)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${upana}%; background:${rangiPalette[i % rangiPalette.length]}"></div></div>
          <span class="bar-value">${r.idadi}</span>
        </div>`;
        })
        .join("") || "<p class='hakuna'>Hakuna maombi bado.</p>";

    // ---- Line chart ya matangazo ya wiki (SVG safi) ----
    const wikiIdadi = wikiResult.rows.map((r) => parseInt(r.idadi));
    const wikiMax = Math.max(1, ...wikiIdadi);
    const chartW = 520,
      chartH = 160,
      pad = 30;
    const stepX = (chartW - pad * 2) / (wikiIdadi.length - 1 || 1);
    const points = wikiIdadi
      .map((v, i) => {
        const x = pad + i * stepX;
        const y = chartH - pad - (v / wikiMax) * (chartH - pad * 2);
        return `${x},${y}`;
      })
      .join(" ");
    const dots = wikiIdadi
      .map((v, i) => {
        const x = pad + i * stepX;
        const y = chartH - pad - (v / wikiMax) * (chartH - pad * 2);
        return `<circle cx="${x}" cy="${y}" r="4" fill="#2E8B57" />`;
      })
      .join("");
    const wikiLabels = wikiResult.rows
      .map((r) => `<span>${r.siku.trim()}</span>`)
      .join("");

    // ---- Majedwali ----
    const rows = result.rows
      .map(
        (r) => `
        <tr>
          <td>${capitalize(r.zao)}</td>
          <td>${r.mkoa}</td>
          <td>${Number(r.bei).toLocaleString()}</td>
          <td>
            <form method="POST" action="/admin/futa?siri=${safeSiri}" style="display:inline">
              <input type="hidden" name="id" value="${r.id}">
              <button class="btn-futa" type="submit">Futa</button>
            </form>
          </td>
        </tr>`,
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
          <td>${w.verified ? "<span class='badge badge-ok'>✓ Verified</span>" : "<span class='badge badge-pending'>Hajathibitishwa</span>"}</td>
          <td>
            ${
              w.verified
                ? ""
                : `<form method="POST" action="/admin/thibitisha?siri=${safeSiri}" style="display:inline">
                     <input type="hidden" name="id" value="${w.id}">
                     <button class="btn-thibitisha" type="submit">Thibitisha</button>
                   </form>`
            }
          </td>
        </tr>`,
      )
      .join("");

    const matangazoRows = matangazoResult.rows
      .slice(0, 8)
      .map(
        (m) => `
        <tr>
          <td><span class="crop-dot"></span>${capitalize(m.zao)}</td>
          <td>${m.idadi}</td>
          <td>${m.bei ? Number(m.bei).toLocaleString() : "-"}</td>
          <td>${m.phone_number}</td>
          <td>${new Date(m.tarehe).toLocaleDateString("sw-TZ")}</td>
        </tr>`,
      )
      .join("");

    const requestsRows = requestsResult.rows
      .slice(0, 8)
      .map(
        (b) => `
      <tr>
        <td>${capitalize(b.zao)}</td>
        <td>${b.idadi}</td>
        <td>${b.mkoa}</td>
        <td>${new Date(b.tarehe).toLocaleDateString("sw-TZ")}</td>
        <td>
          ${
            b.status === "accepted"
              ? "<span class='badge badge-success'>Accepted</span>"
              : b.status === "rejected"
                ? "<span class='badge badge-danger'>Rejected</span>"
                : "<span class='badge badge-pending'>Pending</span>"
          }
        </td>
      </tr>`,
      )
      .join("");

    res.send(`
      <!DOCTYPE html>
      <html lang="sw">
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Soko la Mkulima — Dashibodi</title>
      <style>
        :root {
          --kijani-giza: #14432F;
          --kijani: #2E8B57;
          --kijani-mwanga: #E8F5EE;
          --bg: #F2F5F4;
          --kadi: #FFFFFF;
          --maandishi: #1F2A24;
          --maandishi-pili: #6B7670;
          --mpaka: #E6EAE8;
          --bluu: #3B82C4;
          --chungwa: #E67E22;
          --zambarau: #8B5FBF;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          background: var(--bg);
          color: var(--maandishi);
          display: flex;
          min-height: 100vh;
        }

        /* ---- SIDEBAR ---- */
        .sidebar {
          width: 240px;
          background: var(--kijani-giza);
          color: #fff;
          padding: 24px 16px;
          flex-shrink: 0;
        }
        .brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 24px; border-bottom: 1px solid rgba(255,255,255,0.12); margin-bottom: 20px; }
        .brand .leaf { font-size: 26px; }
        .brand h1 { font-size: 16px; margin: 0; line-height: 1.2; }
        .brand p { font-size: 11px; margin: 2px 0 0; color: #A9C9B8; }
        .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; color: #CFE3D8; font-size: 14px; margin-bottom: 4px; }
        .nav-item.active { background: var(--kijani); color: #fff; font-weight: 600; }
        .sidebar-note { margin-top: 30px; background: rgba(255,255,255,0.07); border-radius: 10px; padding: 16px; font-size: 12px; line-height: 1.5; color: #CFE3D8; }

        /* ---- MAIN ---- */
        .main { flex: 1; padding: 28px 32px; max-width: 1280px; }
        .topbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .topbar h2 { margin: 0; font-size: 24px; }
        .topbar p { margin: 4px 0 0; color: var(--maandishi-pili); font-size: 14px; }

        /* ---- STAT CARDS ---- */
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-bottom: 24px; }
        .stat-card { background: var(--kadi); border-radius: 14px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid var(--mpaka); }
        .stat-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #fff; margin-bottom: 10px; }
        .stat-card .num { font-size: 26px; font-weight: 700; }
        .stat-card .label { font-size: 13px; color: var(--maandishi-pili); }

        /* ---- PANELS ---- */
        .panels { display: grid; grid-template-columns: 1.1fr 1.1fr 1fr; gap: 18px; margin-bottom: 24px; }
        .panel { background: var(--kadi); border-radius: 14px; padding: 20px; border: 1px solid var(--mpaka); }
        .panel h3 { margin: 0 0 14px; font-size: 15px; }

        /* Donut */
        .donut-wrap { display: flex; align-items: center; gap: 18px; }
        .donut { width: 130px; height: 130px; border-radius: 50%; flex-shrink: 0; }
        .donut::after { content: ""; display: block; width: 56px; height: 56px; background: var(--kadi); border-radius: 50%; margin: 37px; }
        .donut-outer { position: relative; width: 130px; height: 130px; }
        .legend-item { font-size: 13px; display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--maandishi-pili); }
        .legend-item b { color: var(--maandishi); margin-left: auto; }
        .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }

        /* Line chart */
        .wiki-labels { display: flex; justify-content: space-between; font-size: 11px; color: var(--maandishi-pili); margin-top: 4px; padding: 0 28px; }

        /* Bar chart */
        .bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .bar-label { width: 70px; font-size: 13px; flex-shrink: 0; }
        .bar-track { flex: 1; background: var(--kijani-mwanga); border-radius: 6px; height: 10px; overflow: hidden; }
        .bar-fill { height: 100%; border-radius: 6px; }
        .bar-value { font-size: 13px; color: var(--maandishi-pili); width: 28px; text-align: right; }
        .hakuna { color: var(--maandishi-pili); font-size: 13px; }

        /* ---- TABLES ---- */
        .table-section { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; font-size: 12px; color: var(--maandishi-pili); font-weight: 600; padding: 8px 10px; border-bottom: 1px solid var(--mpaka); }
        td { padding: 10px; font-size: 13px; border-bottom: 1px solid var(--mpaka); }
        .crop-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--kijani); display: inline-block; margin-right: 8px; }
        .badge { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .badge-ok { background: #E1F5EC; color: #1B5E3F; }
        .badge-pending { background: #FDF2E1; color: #B5760C; }
        .btn-thibitisha { background: var(--kijani); color: #fff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
        .btn-futa { background: #FBE7E9; color: #C0392B; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }

        /* ---- FORM SECTION ---- */
        .form-panel { background: var(--kadi); border-radius: 14px; padding: 20px; border: 1px solid var(--mpaka); margin-bottom: 24px; }
        .form-panel h3 { margin: 0 0 14px; font-size: 15px; }
        .form-panel form { display: flex; gap: 10px; flex-wrap: wrap; }
        .form-panel input { padding: 9px 12px; border: 1px solid var(--mpaka); border-radius: 8px; font-size: 13px; flex: 1; min-width: 140px; }
        .form-panel button { background: var(--kijani); color: #fff; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }

        h2.section-title { font-size: 18px; margin: 30px 0 14px; }

        /* NOTIFICATIONS */
        .notif-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-bottom: 8px; }
        .notif { display: flex; align-items: flex-start; gap: 14px; padding: 14px 16px; border-radius: 10px; border: 1px solid; }
        .notif-info { background: #EBF5FB; border-color: #AED6F1; }
        .notif-warning { background: #FEF9E7; border-color: #F9E79F; }
        .notif-danger { background: #FDEDEC; border-color: #F5B7B1; }
        .notif-icon { font-size: 22px; flex-shrink: 0; }
        .notif-title { font-weight: 700; font-size: 14px; margin-bottom: 3px; }
        .notif-msg { font-size: 13px; color: #555; }

        /* ANALYTICS */
        .analytics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 24px; }
        @media (max-width: 900px) { .analytics-grid { grid-template-columns: 1fr; } .notif-grid { grid-template-columns: 1fr; } }

        /* RIPOTI BUTTONS */
        .btn-ripoti { display:inline-block; background:#14432F; color:#fff; padding:10px 16px; border-radius:8px; text-decoration:none; font-size:13px; font-weight:600; }
        .btn-excel { background:#217346; }
        .btn-ripoti:hover { opacity:0.9; }

        @media (max-width: 1000px) {
          .stats, .panels, .table-section { grid-template-columns: 1fr; }
          .sidebar { display: none; }
        }
      </style>
      </head>
      <body>

        <aside class="sidebar">
          <div class="brand">
            <span class="leaf">🌱</span>
            <div>
              <h1>SOKO LA MKULIMA</h1>
              <p>Soko la Mazao Tanzania</p>
            </div>
          </div>
          <div class="nav-item active">📊 Dashibodi</div>
          <div class="nav-item">👨‍🌾 Wakulima (${wakulimaResult.rows.length})</div>
          <div class="nav-item">🛒 Wanunuzi (${wanunuziResult.rows[0].count})</div>
          <div class="nav-item">📢 Matangazo (${matangazoResult.rows.length})</div>
          <div class="nav-item">💬 Maombi ya Wanunuzi (${requestsResult.rows.length})</div>
          <div class="nav-item">💰 Bei za Mazao</div>

          <div class="sidebar-note">
            <b>Soko la Mkulima</b><br>
            Kuunganisha wakulima na wanunuzi kwa maendeleo ya kilimo.
          </div>
        </aside>

        <main class="main">
          <div class="topbar">
            <div>
              <h2>Dashibodi</h2>
              <p>Karibu kwenye mfumo wa Soko la Mkulima</p>
            </div>
          </div>

          <!-- STAT CARDS -->
          <div class="stats">
            <div class="stat-card">
              <div class="stat-icon" style="background:var(--kijani)">👨‍🌾</div>
              <div class="num">${wakulimaResult.rows.length}</div>
              <div class="label">Wakulima</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background:var(--bluu)">📢</div>
              <div class="num">${matangazoResult.rows.length}</div>
              <div class="label">Matangazo</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background:var(--chungwa)">🛒</div>
              <div class="num">${wanunuziResult.rows[0].count}</div>
              <div class="label">Wanunuzi</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background:var(--zambarau)">💬</div>
              <div class="num">${requestsResult.rows.length}</div>
              <div class="label">Maombi ya Wanunuzi</div>
            </div>
          </div>

          <!-- CHARTS -->
          <div class="panels">
            <div class="panel">
              <h3>Mazao Yanayouzwa Zaidi</h3>
              <div class="donut-wrap">
                <div class="donut" style="background: conic-gradient(${donutGradient})"></div>
                <div>${donutLegend}</div>
              </div>
            </div>

            <div class="panel">
              <h3>Matangazo - Siku 7 Zilizopita</h3>
              <svg viewBox="0 0 ${chartW} ${chartH}" width="100%" height="140">
                <polyline points="${points}" fill="none" stroke="#2E8B57" stroke-width="2.5" />
                ${dots}
              </svg>
              <div class="wiki-labels">${wikiLabels}</div>
            </div>

            <div class="panel">
              <h3>Mahitaji Makubwa (Wanunuzi)</h3>
              ${mahitajiBars}
            </div>
          </div>

          <!-- BEI FORM -->
          <div class="form-panel">
            <h3>Ongeza Bei Mpya</h3>
            <form method="POST" action="/admin/ongeza?siri=${safeSiri}">
              <input name="zao" placeholder="Zao (mfano: mahindi)" required>
              <input name="mkoa" placeholder="Mkoa (mfano: Dodoma)" required>
              <input name="bei" placeholder="Bei kwa kilo (TZS)" type="number" required>
              <button type="submit">+ Ongeza Bei</button>
            </form>
          </div>

          <!-- NOTIFICATIONS CENTER -->
          <h2 class="section-title">🔔 Kituo cha Taarifa</h2>
          <div class="notif-grid">
            ${
              parseInt(wakulimaMpyaResult.rows[0].count) > 0
                ? `
            <div class="notif notif-info">
              <span class="notif-icon">👨‍🌾</span>
              <div>
                <div class="notif-title">Wakulima Wapya (Saa 24)</div>
                <div class="notif-msg">${wakulimaMpyaResult.rows[0].count} wakulima wapya wamejisajili</div>
              </div>
            </div>`
                : ""
            }
            ${
              parseInt(maombiMapyaResult.rows[0].count) > 0
                ? `
            <div class="notif notif-warning">
              <span class="notif-icon">💬</span>
              <div>
                <div class="notif-title">Maombi Yanayosubiri</div>
                <div class="notif-msg">${maombiMapyaResult.rows[0].count} maombi ya ununuzi bado hayajajibiwa</div>
              </div>
            </div>`
                : ""
            }
            ${
              parseInt(keshoResult.rows[0].count) > 0
                ? `
            <div class="notif notif-danger">
              <span class="notif-icon">⏰</span>
              <div>
                <div class="notif-title">Matangazo Yanayokwisha Muda</div>
                <div class="notif-msg">${keshoResult.rows[0].count} matangazo yataisha ndani ya saa 24</div>
              </div>
            </div>`
                : ""
            }
            ${
              parseInt(hawajaThitibishwaResult.rows[0].count) > 0
                ? `
            <div class="notif notif-warning">
              <span class="notif-icon">✅</span>
              <div>
                <div class="notif-title">Uthibitisho Unahitajika</div>
                <div class="notif-msg">${hawajaThitibishwaResult.rows[0].count} wakulima hawajathibitishwa bado</div>
              </div>
            </div>`
                : ""
            }
            ${
              parseInt(wakulimaMpyaResult.rows[0].count) === 0 &&
              parseInt(maombiMapyaResult.rows[0].count) === 0 &&
              parseInt(keshoResult.rows[0].count) === 0 &&
              parseInt(hawajaThitibishwaResult.rows[0].count) === 0
                ? `
            <div class="notif notif-info">
              <span class="notif-icon">✅</span>
              <div><div class="notif-title">Kila kitu kiko sawa!</div><div class="notif-msg">Hakuna taarifa zinazohitaji umakini kwa sasa.</div></div>
            </div>`
                : ""
            }
          </div>

          <!-- ANALYTICS -->
          <h2 class="section-title">📊 Uchambuzi wa Kina</h2>
          <div class="analytics-grid">
            <!-- Wakulima kwa Mkoa -->
            <div class="panel">
              <h3>Wakulima kwa Mkoa</h3>
              ${(() => {
                const mkMax = Math.max(
                  1,
                  ...wakulimaMkoaResult.rows.map((r) => parseInt(r.idadi)),
                );
                return (
                  wakulimaMkoaResult.rows
                    .map(
                      (r, i) => `
                  <div class="bar-row">
                    <span class="bar-label" style="width:80px">${r.mkoa}</span>
                    <div class="bar-track"><div class="bar-fill" style="width:${Math.round((parseInt(r.idadi) / mkMax) * 100)}%;background:${["#2E8B57", "#E67E22", "#3B82C4", "#8B5FBF", "#D7263D", "#1B5E3F", "#F59E0B", "#06B6D4"][i % 8]}"></div></div>
                    <span class="bar-value">${r.idadi}</span>
                  </div>`,
                    )
                    .join("") || "<p class='hakuna'>Hakuna data bado.</p>"
                );
              })()}
            </div>

            <!-- Demand vs Supply -->
            <div class="panel">
              <h3>Demand vs Supply (Magunia)</h3>
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <tr>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #E6EAE8">Zao</th>
                  <th style="text-align:right;padding:8px;border-bottom:1px solid #E6EAE8;color:#2E8B57">Supply</th>
                  <th style="text-align:right;padding:8px;border-bottom:1px solid #E6EAE8;color:#E67E22">Demand</th>
                  <th style="text-align:right;padding:8px;border-bottom:1px solid #E6EAE8">Hali</th>
                </tr>
                ${
                  demandVsSupply.rows
                    .map((r) => {
                      const supply = parseInt(r.supply) || 0;
                      const demand = parseInt(r.demand) || 0;
                      const hali =
                        supply > demand
                          ? `<span style="color:#2E8B57">Ziada</span>`
                          : supply < demand
                            ? `<span style="color:#D7263D">Upungufu</span>`
                            : `<span style="color:#6B7670">Sawa</span>`;
                      return `<tr>
                    <td style="padding:8px;border-bottom:1px solid #E6EAE8">${capitalize(r.zao || "")}</td>
                    <td style="padding:8px;border-bottom:1px solid #E6EAE8;text-align:right;color:#2E8B57">${supply}</td>
                    <td style="padding:8px;border-bottom:1px solid #E6EAE8;text-align:right;color:#E67E22">${demand}</td>
                    <td style="padding:8px;border-bottom:1px solid #E6EAE8;text-align:right">${hali}</td>
                  </tr>`;
                    })
                    .join("") ||
                  "<tr><td colspan='4' style='padding:12px;color:#6B7670'>Hakuna data bado.</td></tr>"
                }
              </table>
            </div>

            <!-- Top Rated Farmers -->
            <div class="panel">
              <h3>Wakulima Waliokadiriwa Zaidi</h3>
              ${
                ratingsResult.rows.length === 0
                  ? "<p class='hakuna'>Hakuna ukadiriaji bado.</p>"
                  : ratingsResult.rows
                      .map(
                        (r, i) => `
                  <div class="bar-row" style="margin-bottom:14px">
                    <span style="font-size:18px;margin-right:8px">${["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i]}</span>
                    <div style="flex:1">
                      <div style="font-size:13px;font-weight:600">${r.farmer_phone}</div>
                      <div style="font-size:12px;color:#6B7670">${r.idadi} ukadiriaji</div>
                    </div>
                    <span style="color:#F59E0B;font-weight:700">⭐ ${r.wastani}</span>
                  </div>`,
                      )
                      .join("")
              }
            </div>
          </div>

          <!-- TABLES -->
          <div class="table-section">
            <div class="panel">
              <h3>Matangazo ya Hivi Karibuni</h3>
              <table>
                <tr><th>Zao</th><th>Magunia</th><th>Bei/Gunia</th><th>Simu</th><th>Tarehe</th></tr>
                ${matangazoRows || "<tr><td colspan='5'>Hakuna tangazo bado.</td></tr>"}
              </table>
            </div>
            <div class="panel">
              <h3>Maombi ya Wanunuzi ya Hivi Karibuni</h3>
              <table>
                <tr><th>Zao</th><th>Kiasi</th><th>Mkoa</th><th>Tarehe</th><th>Hali</th></tr>
                ${requestsRows || "<tr><td colspan='5'>Hakuna ombi bado.</td></tr>"}
              </table>
            </div>
          </div>

          <h2 class="section-title">💰 Rekodi za Malipo (Transactions)</h2>
          <div class="form-panel">
            <h3>Ongeza Muamala Mpya</h3>
            <form method="POST" action="/admin/transaction?siri=${safeSiri}">
              <input name="reference" placeholder="Reference (mfano: MPESA-12345)" required>
              <input name="buyer_phone" placeholder="Simu ya Mnunuzi">
              <input name="farmer_phone" placeholder="Simu ya Mkulima">
              <input name="zao" placeholder="Zao">
              <input name="amount" placeholder="Kiasi (TZS)" type="number" required>
              <select name="method" style="padding:9px;border:1px solid #E6EAE8;border-radius:8px;font-size:13px">
                <option>M-Pesa</option>
                <option>Airtel Money</option>
                <option>Tigo Pesa</option>
                <option>Bank</option>
              </select>
              <button type="submit">+ Rekodi</button>
            </form>
          </div>

          <h2 class="section-title">📥 Pakua Ripoti</h2>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">
            <a href="/ripoti/wakulima?siri=${safeSiri}" class="btn-ripoti">📄 Ripoti ya Wakulima (PDF)</a>
            <a href="/ripoti/matangazo?siri=${safeSiri}" class="btn-ripoti">📄 Ripoti ya Matangazo (PDF)</a>
            <a href="/ripoti/maombi?siri=${safeSiri}" class="btn-ripoti">📄 Ripoti ya Maombi (PDF)</a>
            <a href="/ripoti/wakulima-excel?siri=${safeSiri}" class="btn-ripoti btn-excel">📊 Wakulima (Excel/CSV)</a>
            <a href="/ripoti/matangazo-excel?siri=${safeSiri}" class="btn-ripoti btn-excel">📊 Matangazo (Excel/CSV)</a>
          </div>

          <h2 class="section-title">Bei za Mazao Zilizopo</h2>
          <div class="panel">
            <table>
              <tr><th>Zao</th><th>Mkoa</th><th>Bei (TZS)</th><th></th></tr>
              ${rows || "<tr><td colspan='4'>Hakuna bei bado.</td></tr>"}
            </table>
          </div>

          <h2 class="section-title">Wakulima Waliosajiliwa</h2>
          <div class="panel">
            <table>
              <tr><th>Jina</th><th>Mkoa</th><th>Wilaya</th><th>Simu</th><th>Hali</th><th></th></tr>
              ${wakulimaRows || "<tr><td colspan='6'>Hakuna mkulima aliyesajiliwa bado.</td></tr>"}
            </table>
          </div>

        </main>
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
  await pool.query("UPDATE wakulima SET verified = TRUE WHERE id = $1", [
    req.body.id,
  ]);
  res.redirect("/admin?siri=" + encodeURIComponent(req.query.siri));
});

app.post("/admin/ongeza", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi.");
  }
  const { zao, mkoa, bei } = req.body;
  await pool.query(
    "INSERT INTO bei_mazao (zao, mkoa, bei) VALUES ($1, $2, $3)",
    [zao.toLowerCase().trim(), mkoa.trim(), bei],
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

// ---- REKODI YA TRANSACTION ----
app.post("/admin/transaction", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi.");
  }
  const { reference, buyer_phone, farmer_phone, zao, amount, method } =
    req.body;
  try {
    await pool.query(
      "INSERT INTO transactions (reference, buyer_phone, farmer_phone, zao, amount, method) VALUES ($1,$2,$3,$4,$5,$6)",
      [
        reference,
        buyer_phone || null,
        farmer_phone || null,
        zao || null,
        amount,
        method,
      ],
    );
    res.redirect("/admin?siri=" + encodeURIComponent(req.query.siri));
  } catch (err) {
    res.status(500).send("Tatizo: " + err.message);
  }
});

// ---- RIPOTI ZA CSV (Excel-compatible) ----
app.get("/ripoti/:aina-excel", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi.");
  }
  const aina = req.params["aina-excel"] || req.params.aina;
  let data = [],
    headers = [],
    filename = "ripoti";

  if (aina === "wakulima") {
    const r = await pool.query(
      "SELECT jina, mkoa, wilaya, phone_number, verified, tarehe FROM wakulima ORDER BY tarehe DESC",
    );
    headers = ["Jina", "Mkoa", "Wilaya", "Simu", "Amethibitishwa", "Tarehe"];
    data = r.rows.map((w) => [
      w.jina,
      w.mkoa,
      w.wilaya,
      w.phone_number,
      w.verified ? "Ndiyo" : "Hapana",
      new Date(w.tarehe).toLocaleDateString("sw-TZ"),
    ]);
    filename = "wakulima";
  } else if (aina === "matangazo") {
    const r = await pool.query(
      "SELECT zao, idadi, bei, phone_number, active, tarehe FROM matangazo ORDER BY tarehe DESC",
    );
    headers = ["Zao", "Magunia", "Bei/Gunia", "Simu", "Hai", "Tarehe"];
    data = r.rows.map((m) => [
      m.zao,
      m.idadi,
      m.bei || "",
      m.phone_number,
      m.active ? "Ndiyo" : "Hapana",
      new Date(m.tarehe).toLocaleDateString("sw-TZ"),
    ]);
    filename = "matangazo";
  }

  const csv = [
    headers.join(","),
    ...data.map((row) => row.map((v) => `"${v}"`).join(",")),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  res.send("\uFEFF" + csv); // BOM ya UTF-8 ili Excel ione Kiswahili vizuri
});

// ---- RIPOTI ZA PDF ----
app.get("/ripoti/:aina", async (req, res) => {
  if (req.query.siri !== process.env.ADMIN_SECRET) {
    return res.status(403).send("Hairuhusiwi.");
  }
  const aina = req.params.aina;
  let title = "",
    rows = [],
    headers = [];

  if (aina === "wakulima") {
    title = "Ripoti ya Wakulima";
    const r = await pool.query(
      "SELECT jina, mkoa, wilaya, phone_number, verified, tarehe FROM wakulima ORDER BY tarehe DESC",
    );
    headers = ["Jina", "Mkoa", "Wilaya", "Simu", "Hali"];
    rows = r.rows.map((w) => [
      w.jina,
      w.mkoa,
      w.wilaya,
      w.phone_number,
      w.verified ? "✓ Verified" : "Hajathibitishwa",
    ]);
  } else if (aina === "matangazo") {
    title = "Ripoti ya Matangazo";
    const r = await pool.query(
      "SELECT zao, idadi, bei, phone_number, tarehe FROM matangazo ORDER BY tarehe DESC",
    );
    headers = ["Zao", "Magunia", "Bei/Gunia", "Simu", "Tarehe"];
    rows = r.rows.map((m) => [
      capitalize(m.zao),
      m.idadi,
      m.bei ? `TZS ${Number(m.bei).toLocaleString()}` : "-",
      m.phone_number,
      new Date(m.tarehe).toLocaleDateString("sw-TZ"),
    ]);
  } else if (aina === "maombi") {
    title = "Ripoti ya Maombi ya Wanunuzi";
    const r = await pool.query(
      "SELECT zao, idadi, mkoa, phone_number, tarehe FROM buyer_requests ORDER BY tarehe DESC",
    );
    headers = ["Zao", "Kiasi", "Mkoa", "Simu", "Tarehe"];
    rows = r.rows.map((b) => [
      capitalize(b.zao),
      b.idadi,
      b.mkoa,
      b.phone_number,
      new Date(b.tarehe).toLocaleDateString("sw-TZ"),
    ]);
  } else {
    return res.status(404).send("Ripoti hii haipatikani.");
  }

  const tarehe = new Date().toLocaleDateString("sw-TZ");
  const tableRows = rows
    .map(
      (row) => `
    <tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>
  `,
    )
    .join("");

  app.get("/api/admin/buyers", async (req, res) => {
    try {
      // Vuta maombi yote au wanunuzi wote ili admin awaone
      const result = await pool.query(
        "SELECT * FROM buyer_requests ORDER BY id DESC",
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/admin/verify-buyer/:id", async (req, res) => {
    const { id } = req.params;
    const { verified } = req.body; // Inapokea true au false kauli kutoka kwa Admin

    try {
      await pool.query(
        "UPDATE buyer_requests SET verified = $1 WHERE id = $2",
        [verified, id],
      );
      res.json({ message: `Hali ya mnunuzi imesasishwa kuwa ${verified}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const html = `
    <!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #1F2A24; padding: 40px; }
      h1 { color: #14432F; font-size: 22px; }
      .meta { color: #6B7670; font-size: 13px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { background: #14432F; color: #fff; padding: 10px 12px; text-align: left; }
      td { padding: 8px 12px; border-bottom: 1px solid #E6EAE8; }
      tr:nth-child(even) td { background: #F2F5F4; }
      .footer { margin-top: 32px; color: #6B7670; font-size: 12px; text-align: center; }
      @media print { .no-print { display:none; } }
    </style>
    </head><body>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <span style="font-size:28px">🌱</span>
      <div><h1 style="margin:0">${title}</h1><div class="meta">Soko la Mkulima Tanzania • Tarehe: ${tarehe} • Rekodi: ${rows.length}</div></div>
    </div>
    <p class="no-print" style="margin-bottom:16px">
      <button onclick="window.print()" style="background:#14432F;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Chapisha / Hifadhi PDF</button>
    </p>
    <table>
      <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
      ${tableRows || "<tr><td colspan='5' style='text-align:center;color:#6B7670'>Hakuna data bado.</td></tr>"}
    </table>
    <div class="footer">Soko la Mkulima — Kuunganisha Wakulima na Wanunuzi Tanzania</div>
    </body></html>
  `;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server inaendesha kwenye port ${PORT}`);
});
