// ============================================================
// SOKO LA MKULIMA
// DAILY PRICE SYNC (WIZARA YA VIWANDA NA BIASHARA)
// ============================================================

require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");
const PDFParser = require("pdf2json");
const { Pool } = require("pg");

const MIT_MARKET_URL = "https://www.viwanda.go.tz/documents/product-prices-domestic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const VALID_REGIONS = [
  "arusha", "dar es salaam", "dodoma", "geita", "iringa", "kagera", 
  "katavi", "kigoma", "kilimanjaro", "lindi", "manyara", "mara", 
  "mbeya", "morogoro", "mtwara", "mwanza", "njombe", "pemba", 
  "pwani", "rukwa", "ruvuma", "shinyanga", "simiyu", "singida", 
  "tabora", "tanga", "unguja", "zanzibar"
];

// Orodha ya mazao makuu yanayopatikana kwenye ripoti za Wizara (Columns order/keywords)
const DEFAULT_CROPS = [
  "mahindi", "mpunga", "mchele", "maharage", "nyanya", 
  "vitunguu", "viazi lishe", "viazi mringo", "kaloti", "ndizi"
];

function cleanText(value) {
  if (!value) return "";
  return decodeURIComponent(value)
    .replace(/\r?\n|\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPrice(value) {
  if (!value) return null;
  const raw = cleanText(value).replace(/,/g, "").replace(/[^\d.]/g, "");
  const number = Number(raw);
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
      return false; // Chukua ya kwanza kabisa (ya hivi karibuni)
    }
  });

  return pdfUrl;
}

// Helper Function ya kusoma PDF Structured Page JSON kupitia pdf2json
function parsePdfStructure(pdfBuffer) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(this, 1);

    pdfParser.on("pdfParser_dataError", (errData) => reject(errData.parserError));
    pdfParser.on("pdfParser_dataReady", (pdfData) => resolve(pdfData));

    pdfParser.parseBuffer(pdfBuffer);
  });
}

// 2. SOMA MAANDISHI YALIYOPO NDANI YA PDF NA CHUKUA MAZAO NA BEI ZA MIKOA YOTE
async function fetchDailyPrices() {
  const pdfUrl = await getLatestPdfUrl();

  if (!pdfUrl) {
    console.log("⚠️️ Hakuna link ya PDF iliyopatikana kwenye ukurasa wa Wizara.");
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
  
  const pdfData = await parsePdfStructure(pdfBuffer.data);
  const records = [];

  for (const page of pdfData.Pages || []) {
    // Kusanya maandishi yote na coordinates zao (y, x)
    const texts = (page.Texts || []).map((t) => ({
      x: t.x,
      y: t.y,
      text: cleanText(t.R?.[0]?.T || ""),
    })).filter((t) => t.text.length > 0);

    // Kundi la maandishi yaliyo kwenye mstari mmoja wa Y (karibu na Y margin ya 0.4)
    const lineGroups = [];
    for (const t of texts) {
      let group = lineGroups.find((g) => Math.abs(g.y - t.y) < 0.4);
      if (!group) {
        group = { y: t.y, items: [] };
        lineGroups.push(group);
      }
      group.items.push(t);
    }

    // Panga mistari kuanzia juu kwenda chini na kushoto kwenda kulia
    lineGroups.sort((a, b) => a.y - b.y);

    for (const group of lineGroups) {
      group.items.sort((a, b) => a.x - b.x);
      const fullLineText = group.items.map((i) => i.text).join(" ");
      const lowerLineText = fullLineText.toLowerCase();

      // Angalia kama mstari una mkoa ulioidhinishwa
      const matchedRegionName = VALID_REGIONS.find((r) =>
        new RegExp(`\\b${r}\\b`, "i").test(lowerLineText)
      );

      if (matchedRegionName) {
        const regionFormatted =
          matchedRegionName.charAt(0).toUpperCase() + matchedRegionName.slice(1);

        // Kusanya namba zote za bei zilizopo kwenye mstari huu
        const pricesInLine = group.items
          .map((i) => cleanPrice(i.text))
          .filter((p) => p !== null && p > 100);

        // Mfano: Kama zimepatikana bei nyingi kwenye mstari wa mkoa, zipange kwa meza ya mazao
        pricesInLine.forEach((price, idx) => {
          const cropName = DEFAULT_CROPS[idx] || `zao_${idx + 1}`;
          // Wizara huweka bei kwa Gunia (~100kg), tuiweke kwa TZS/kg
          const pricePerKg = price > 5000 ? Number((price / 100).toFixed(2)) : price;

          records.push({
            zao: cropName,
            mkoa: regionFormatted,
            bei: pricePerKg,
            unit: "TZS/kg",
          });
        });
      }
    }
  }

  console.log(`📊 Zimepatikana kumbukumbu ${records.length} kutoka kwenye PDF.`);
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