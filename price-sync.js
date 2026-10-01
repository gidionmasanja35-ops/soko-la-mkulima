// ============================================================
// SOKO LA MKULIMA
// DAILY PRICE SYNC (WIZARA YA VIWANDA NA BIASHARA)
// ============================================================

require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");
const { Pool } = require("pg");

const MIT_MARKET_URL = "https://www.viwanda.go.tz/documents/product-prices-domestic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
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

// 1. TAFUTA PDF LINK YA HIVI KARIBUNI KUTOKA TOVUTI YA WIZARA
async function getLatestPdfUrl() {
  console.log("🔎 Inafungua ukurasa wa Wizara kutafuta PDF ya hivi karibuni...");
  
  const response = await axios.get(MIT_MARKET_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Soko-la-Mkulima-Bot" },
    timeout: 30000,
  });

  const $ = cheerio.load(response.data);
  let pdfUrl = "";

  $("a").each((i, el) => {
    const href = $(el).attr("href");
    if (href && (href.toLowerCase().includes(".pdf") || href.toLowerCase().includes("download"))) {
      pdfUrl = href.startsWith("http") ? href : `https://www.viwanda.go.tz${href.startsWith("/") ? "" : "/"}${href}`;
      return false; // Chukua ya kwanza kabisa (ya karibuni zaidi)
    }
  });

  return pdfUrl;
}

// 2. SOMA MAANDISHI YALIYOPO NDANI YA PDF NA CHUKUA MAZAO NA BEI
async function fetchDailyPrices() {
  const pdfUrl = await getLatestPdfUrl();

  if (!pdfUrl) {
    console.log("⚠️ Hakuna link ya PDF iliyopatikana kwenye ukurasa wa Wizara.");
    return [];
  }

  console.log(`📄 Imepata PDF URL: ${pdfUrl}`);
  console.log("📥 Inapakua file la PDF kutoka wizarani...");

  const pdfBuffer = await axios.get(pdfUrl, {
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0 Soko-la-Mkulima-Bot" },
    timeout: 30000,
  });

  console.log("📑 Inasoma na kuchanganua takwimu ndani ya PDF...");
  
  // Dynamic import ya pdf-parse kuondoa migogoro ya CommonJS/ESM
  const pdfModule = await import("pdf-parse");
  const parsePdf = pdfModule.default || pdfModule;
  const pdfData = await parsePdf(pdfBuffer.data);
  const pdfText = pdfData.text;

  const records = [];
  const lines = pdfText.split("\n");

  const validRegions = ["arusha", "dar es salaam", "dodoma", "geita", "iringa", "kagera", "katavi", "kigoma", "kilimanjaro", "lindi", "manyara", "mara", "mbeya", "morogoro", "mtwara", "mwanza", "njombe", "pemba", "pwani", "rukwa", "ruvuma", "shinyanga", "simiyu", "singida", "tabora", "tanga", "unguja"];

  for (let line of lines) {
    const cleanedLine = cleanText(line);
    if (!cleanedLine) continue;

    const parts = cleanedLine.split(/\s+|\t+|,/);

    if (parts.length >= 3) {
      const possiblePrice = cleanPrice(parts[parts.length - 1]);
      
      if (possiblePrice && possiblePrice > 100) {
        let region = "";
        let crop = "";

        for (let r of validRegions) {
          if (cleanedLine.toLowerCase().includes(r)) {
            region = r.charAt(0).toUpperCase() + r.slice(1);
            break;
          }
        }

        if (region) {
          crop = parts[0].toLowerCase();
          const pricePerKg = possiblePrice > 5000 ? Number((possiblePrice / 100).toFixed(2)) : possiblePrice;

          records.push({
            zao: crop,
            mkoa: region,
            bei: pricePerKg,
            unit: "TZS/kg",
          });
        }
      }
    }
  }

  return records;
}

// 3. HIFADHI / UPDATE KWENYE DATABASE
async function syncPricesToDatabase() {
  const today = new Date().toISOString().split("T")[0];
  const records = await fetchDailyPrices();

  if (records.length === 0) {
    console.log("⚠️ Hakuna data mpya zilizoweza kusomwa kutoka kwenye PDF leo.");
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