// ============================================================
// SOKO LA MKULIMA
// DAILY PRICE SYNC (WIZARA YA VIWANDA NA BIASHARA)
// ============================================================

require("dotenv").config(); //[cite: 5]
const axios = require("axios"); //[cite: 5]
const cheerio = require("cheerio");
const { Pool } = require("pg"); //[cite: 5]

const MIT_MARKET_URL = "https://www.viwanda.go.tz/documents/product-prices-domestic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, //[cite: 5]
  ssl: {
    rejectUnauthorized: false, //[cite: 5]
  },
});

function cleanText(value) {
  if (!value) return "";
  return value.toString().replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();
}

function cleanPrice(value) {
  if (!value) return null;
  let text = cleanText(value).replace(/,/g, "").replace(/[^\d.]/g, "");
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : null;
}

async function fetchDailyPrices() {
  console.log("🔎 Inachukua bei za mazao kutoka wizarani...");

  const response = await axios.get(MIT_MARKET_URL, {
    headers: { "User-Agent": "Mozilla/5.0 Soko-la-Mkulima-Bot" },
    timeout: 30000,
  });

  const $ = cheerio.load(response.data);
  const records = [];

  $("table#daily-prices-table tbody tr").each((index, element) => {
    const cols = $(element).find("td");

    if (cols.length >= 4) {
      const crop = cleanText($(cols[0]).text()).toLowerCase();
      const region = cleanText($(cols[1]).text());
      const price100kg = cleanPrice($(cols[2]).text());

      if (crop && region && price100kg) {
        const pricePerKg = Number((price100kg / 100).toFixed(2));

        records.push({
          zao: crop,
          mkoa: region,
          bei: pricePerKg,
          unit: "TZS/kg",
        });
      }
    }
  });

  return records;
}

async function syncPricesToDatabase() {
  const today = new Date().toISOString().split("T")[0];
  const records = await fetchDailyPrices();

  if (records.length === 0) {
    console.log("⚠️ Hakuna data mpya iliyopatikana leo.");
    return { inserted: 0, updated: 0 };
  }

  let inserted = 0;
  let updated = 0;

  for (const item of records) {
    const existing = await pool.query(
      `SELECT id FROM bei_mazao WHERE LOWER(TRIM(zao)) = LOWER(TRIM($1)) AND LOWER(TRIM(mkoa)) = LOWER(TRIM($2)) LIMIT 1`,
      [item.zao, item.mkoa]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE bei_mazao 
         SET bei = $1, unit = 'TZS/kg', source = 'Ministry of Industry & Trade', source_url = $2, data_date = $3, updated_at = NOW() 
         WHERE id = $4`,
        [item.bei, MIT_MARKET_URL, today, existing.rows[0].id]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO bei_mazao (zao, mkoa, bei, unit, source, source_url, data_date, updated_at) 
         VALUES ($1, $2, $3, 'TZS/kg', 'Ministry of Industry & Trade', $4, $5, NOW())`,
        [item.zao, item.mkoa, item.bei, MIT_MARKET_URL, today]
      );
      inserted++;
    }
  }

  return { inserted, updated };
}

module.exports = { syncPricesToDatabase };