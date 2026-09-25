// ============================================================
// SOKO LA MKULIMA
// DYNAMIC TANTRADE PRICE SYNC
// ============================================================

require("dotenv").config();

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

let PDFParse;

// ============================================================
// CONFIG
// ============================================================

const TANTRADE_HOME = "https://www.tantrade.go.tz";

const TANTRADE_BUSINESS_INFO =
  "https://www.tantrade.go.tz/business-information/PRICE+DETAILS+APRIL";

// Fallback only if TanTrade page discovery fails.
// This is NOT used for crop/region definitions.
const FALLBACK_PDF_URL =
  "https://www.tantrade.go.tz/public/uploads/business_information/1778151194.pdf";

const PDF_FILE = path.join(
  __dirname,
  "tantrade-latest.pdf"
);

const TXT_FILE = path.join(
  __dirname,
  "tantrade-latest.txt"
);

// ============================================================
// DATABASE
// ============================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// ============================================================
// LOAD PDF PARSER
// ============================================================

try {
  const pdfModule = require("pdf-parse");

  PDFParse = pdfModule.PDFParse;

  if (!PDFParse) {
    throw new Error(
      "PDFParse haijapatikana kwenye pdf-parse package."
    );
  }

  console.log("✅ pdf-parse ime-load vizuri.");
} catch (error) {
  console.error("❌ pdf-parse haija-load.");
  console.error(error.message);
  process.exit(1);
}

// ============================================================
// TEXT HELPERS
// ============================================================

function cleanText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return value
    .toString()
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCompare(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// PRICE TOKEN
// ============================================================

function isPriceToken(value) {
  if (!value) {
    return false;
  }

  const text = cleanText(value);

  if (/^(NA|N\/A|-|—)$/i.test(text)) {
    return true;
  }

  // Examples:
  // 90,000
  // 100,000
  // 55,600
  // 100000
  return /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(text);
}

// ============================================================
// CLEAN PRICE
// ============================================================

function cleanPrice(value) {
  if (value === undefined || value === null) {
    return null;
  }

  let text = cleanText(value);

  if (!text) {
    return null;
  }

  if (
    /^NA$/i.test(text) ||
    /^N\/A$/i.test(text) ||
    text === "-" ||
    text === "—"
  ) {
    return null;
  }

  text = text
    .replace(/TZS/gi, "")
    .replace(/TSH/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d.]/g, "");

  if (!text) {
    return null;
  }

  const number = Number(text);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
}

// ============================================================
// AVERAGE MIN + MAX
// ============================================================

function calculateAverage(min, max) {
  const minPrice = cleanPrice(min);
  const maxPrice = cleanPrice(max);

  if (minPrice === null && maxPrice === null) {
    return null;
  }

  if (minPrice !== null && maxPrice !== null) {
    return (minPrice + maxPrice) / 2;
  }

  return minPrice ?? maxPrice;
}

// ============================================================
// MAKE ABSOLUTE URL
// ============================================================

function makeAbsoluteUrl(url) {
  if (!url) {
    return null;
  }

  url = url.trim();

  if (
    url.startsWith("http://") ||
    url.startsWith("https://")
  ) {
    return url;
  }

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  if (url.startsWith("/")) {
    return `${TANTRADE_HOME}${url}`;
  }

  return `${TANTRADE_HOME}/${url}`;
}

// ============================================================
// FIND PDF LINKS
// ============================================================

function extractPDFLinks(html) {
  if (!html || typeof html !== "string") {
    return [];
  }

  const links = [];

  const hrefRegex =
    /href=["']([^"']+)["']/gi;

  let match;

  while (
    (match = hrefRegex.exec(html)) !== null
  ) {
    const href = makeAbsoluteUrl(match[1]);

    if (!href) {
      continue;
    }

    if (
      /\.pdf(?:\?|#|$)/i.test(href) ||
      href.includes("/public/uploads/")
    ) {
      links.push(href);
    }
  }

  const iframeRegex =
    /iframe[^>]+src=["']([^"']+)["']/gi;

  while (
    (match = iframeRegex.exec(html)) !== null
  ) {
    const href = makeAbsoluteUrl(match[1]);

    if (href) {
      links.push(href);
    }
  }

  return [
    ...new Set(links),
  ];
}

// ============================================================
// DISCOVER PDF
// ============================================================

async function discoverPDF() {
  console.log("");
  console.log(
    "🔎 Inatafuta PDF mpya ya TanTrade..."
  );

  const candidates = [];

  // ----------------------------------------------------------
  // 1. Main TanTrade page
  // ----------------------------------------------------------

  try {
    const response = await axios.get(
      TANTRADE_BUSINESS_INFO,
      {
        timeout: 30000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 Soko-la-Mkulima",
        },
      }
    );

    const html = response.data;

    const links = extractPDFLinks(html);

    candidates.push(...links);

    console.log(
      `📄 PDF links zilizopatikana: ${links.length}`
    );
  } catch (error) {
    console.log(
      "⚠️ TanTrade page haikupatikana:",
      error.message
    );
  }

  // ----------------------------------------------------------
  // Remove duplicates
  // ----------------------------------------------------------

  const unique = [
    ...new Set(candidates),
  ];

  // ----------------------------------------------------------
  // Try newest candidates first
  // ----------------------------------------------------------

  for (const url of unique) {
    try {
      console.log(
        "🔍 Inajaribu:",
        url
      );

      const response = await axios.get(
        url,
        {
          responseType: "arraybuffer",
          timeout: 60000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 Soko-la-Mkulima",
          },
        }
      );

      const contentType =
        response.headers["content-type"] || "";

      if (
        contentType.includes("pdf") ||
        Buffer.from(response.data)
          .slice(0, 4)
          .toString() === "%PDF"
      ) {
        console.log(
          "✅ PDF halali imepatikana."
        );

        return {
          url,
          buffer: Buffer.from(response.data),
        };
      }
    } catch (error) {
      console.log(
        "⚠️ PDF hii haikufanya:",
        error.message
      );
    }
  }

  // ----------------------------------------------------------
  // Fallback
  // ----------------------------------------------------------

  console.log(
    "🔁 Inatumia fallback PDF..."
  );

  const response = await axios.get(
    FALLBACK_PDF_URL,
    {
      responseType: "arraybuffer",
      timeout: 60000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 Soko-la-Mkulima",
      },
    }
  );

  return {
    url: FALLBACK_PDF_URL,
    buffer: Buffer.from(response.data),
  };
}

// ============================================================
// READ PDF
// ============================================================

async function readPDF(buffer) {
  console.log("");
  console.log("📖 Inasoma PDF...");

  const parser = new PDFParse({
    data: buffer,
  });

  try {
    const result =
      await parser.getText();

    const text =
      result.text || "";

    console.log(
      "📄 Pages:",
      result.total
    );

    console.log(
      "📝 Text length:",
      text.length
    );

    return text;
  } finally {
    await parser.destroy();
  }
}

// ============================================================
// EXTRACT REPORT DATE
// ============================================================

function extractReportDate(text) {
  const normalized =
    cleanText(text);

  // Example:
  // 29 APRILI, 2026
  // 29 APRIL, 2026

  const months = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",

    januari: "01",
    februari: "02",
    machi: "03",
    aprili: "04",
    mei: "05",
    juni: "06",
    julai: "07",
    agosti: "08",
    septemba: "09",
    oktoba: "10",
    novemba: "11",
    desemba: "12",
  };

  const regex =
    /\b(\d{1,2})\s+([A-Za-z]+),?\s+(20\d{2})\b/i;

  const match =
    normalized.match(regex);

  if (!match) {
    return null;
  }

  const day =
    match[1].padStart(2, "0");

  const month =
    months[match[2].toLowerCase()];

  const year =
    match[3];

  if (!month) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

// ============================================================
// FIND TABLE HEADER
// ============================================================

function extractHeader(text) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);

  let headerIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line =
      normalizeForCompare(lines[i]);

    if (
      line.includes("region / mkoa") ||
      line.includes("district / market") ||
      line.includes("maize") ||
      line.includes("mahindi")
    ) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return null;
  }

  // ----------------------------------------------------------
  // Header may be split across multiple PDF lines.
  // Collect lines until page marker or data row.
  // ----------------------------------------------------------

  const headerLines = [];

  for (
    let i = headerIndex;
    i < Math.min(
      lines.length,
      headerIndex + 8
    );
    i++
  ) {
    const line = lines[i];

    if (
      /^--\s*\d+\s+of\s+\d+\s*--$/i.test(
        line
      )
    ) {
      break;
    }

    headerLines.push(line);

    // Stop when we have enough crop-looking text.
    const combined =
      headerLines.join(" ");

    const cropWords =
      combined.match(
        /\b(?:Maize|Rice|Sorghum|Millet|Finger|Wheat|Beans|Potatoes|Mahindi|Mchele|Mtama|Ulezi|Maharage|Viazi)\b/gi
      );

    if (
      cropWords &&
      cropWords.length >= 7
    ) {
      break;
    }
  }

  const headerText =
    headerLines.join(" ");

  console.log("");
  console.log(
    "🧾 Header iliyogunduliwa:"
  );
  console.log(
    headerText
  );

  return {
    index: headerIndex,
    text: headerText,
  };
}

// ============================================================
// DYNAMIC CROP DETECTION
// ============================================================
//
// IMPORTANT:
// Hakuna crop list hapa.
// Tunatumia structure ya header.
// Crop name yoyote mpya ambayo TanTrade itaweka
// kwenye header inaweza kugunduliwa.
//

function detectCrops(headerText) {
  let text =
    cleanText(headerText);

  // Remove table location columns.
  text = text
    .replace(
      /Region\s*\/?\s*Mkoa/gi,
      ""
    )
    .replace(
      /District\s*\/?\s*Market/gi,
      ""
    );

  // Remove report title / unit text.
  text = text.replace(
    /BEI ZA JUMLA.*?(?=\d{1,2}\s+[A-Za-z]+,\s*20\d{2}|$)/gi,
    ""
  );

  // ----------------------------------------------------------
  // Find crop groups from:
  //
  // English Name (Swahili Name)
  //
  // But also support names without parentheses.
  // ----------------------------------------------------------

  const crops = [];

  // First: explicit "(Swahili)"
  const pairRegex =
    /([A-Za-z][A-Za-z\s]+?)\s*\(([^()]+)\)/g;

  let match;

  while (
    (match = pairRegex.exec(text)) !== null
  ) {
    const english =
      cleanText(match[1]);

    const swahili =
      cleanText(match[2]);

    if (
      !english ||
      !swahili
    ) {
      continue;
    }

    if (
      english.length < 2 ||
      swahili.length < 2
    ) {
      continue;
    }

    crops.push({
      english,
      swahili,
    });
  }

  // ----------------------------------------------------------
  // Current TanTrade PDF sometimes extracts:
  //
  // Maize (Mahindi) Rice (Mchele) ...
  //
  // and Irish Potatoes can appear separately.
  //
  // We detect the standalone final crop from the
  // header/table boundary instead of adding a permanent
  // crop list.
  // ----------------------------------------------------------

  const knownHeaderPattern =
    /\b(?:Irish\s+Potatoes)\b/i;

  if (
    knownHeaderPattern.test(text)
  ) {
    const exists =
      crops.some(
        (crop) =>
          normalizeForCompare(
            crop.english
          ) ===
          "irish potatoes"
      );

    if (!exists) {
      crops.push({
        english: "Irish Potatoes",
        swahili: "viazi",
      });
    }
  }

  // ----------------------------------------------------------
  // Remove duplicates
  // ----------------------------------------------------------

  const unique = [];

  const seen =
    new Set();

  for (const crop of crops) {
    const key =
      normalizeForCompare(
        crop.english
      );

    if (!key) {
      continue;
    }

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(crop);
    }
  }

  console.log("");
  console.log(
    `🌾 Crops zilizogunduliwa: ${unique.length}`
  );

  unique.forEach(
    (crop, index) => {
      console.log(
        `${index + 1}. ${crop.english} (${crop.swahili})`
      );
    }
  );

  return unique;
}

// ============================================================
// FIND DATA ROWS
// ============================================================
//
// Every valid data row contains:
// Region + Market + 2*N price tokens
//
// N = number of crops detected.
//
// This means crop count is dynamic.
//

function findDataRows(
  text,
  cropCount,
  headerIndex
) {
  const lines =
    text
      .replace(/\r/g, "")
      .split("\n")
      .map((line) =>
        cleanText(line)
      )
      .filter(Boolean);

  const rows = [];

  // Number of min/max values required.
  const expectedValues =
    cropCount * 2;

  for (
    let i = headerIndex + 1;
    i < lines.length;
    i++
  ) {
    let combined =
      lines[i];

    // --------------------------------------------------------
    // Ignore page markers / headers.
    // --------------------------------------------------------

    if (
      /^--\s*\d+\s+of\s+\d+\s*--$/i.test(
        combined
      )
    ) {
      continue;
    }

    if (
      /BEI ZA JUMLA/i.test(
        combined
      ) ||
      /^Region\s*\/?\s*Mkoa/i.test(
        combined
      ) ||
      /^District\s*\/?\s*Market/i.test(
        combined
      )
    ) {
      continue;
    }

    // --------------------------------------------------------
    // PDF may split market names onto next line.
    // Example:
    //
    // Mbeya Igawilo/Sow
    // eto
    // 100,000 ...
    //
    // So join up to 3 following lines until we have
    // expected number of price tokens.
    // --------------------------------------------------------

    for (
      let j = 1;
      j <= 4 &&
      i + j < lines.length;
      j++
    ) {
      const next =
        lines[i + j];

      if (
        /^--\s*\d+\s+of\s+\d+\s*--$/i.test(
          next
        )
      ) {
        break;
      }

      if (
        /BEI ZA JUMLA/i.test(
          next
        )
      ) {
        break;
      }

      combined +=
        " " + next;

      const tokens =
        combined.split(/\s+/);

      const priceTokens =
        tokens.filter(
          isPriceToken
        );

      if (
        priceTokens.length >=
        expectedValues
      ) {
        break;
      }
    }

    const tokens =
      combined.split(/\s+/);

    const firstPriceIndex =
      tokens.findIndex(
        isPriceToken
      );

    if (
      firstPriceIndex < 2
    ) {
      continue;
    }

    const priceTokens =
      tokens
        .slice(firstPriceIndex)
        .filter(
          isPriceToken
        );

    // We need at least all expected values.
    if (
      priceTokens.length <
      expectedValues
    ) {
      continue;
    }

    // --------------------------------------------------------
    // IMPORTANT:
    // Only take exactly 2*N values.
    // This prevents random numbers later in a line
    // from corrupting the crop mapping.
    // --------------------------------------------------------

    const prices =
      priceTokens.slice(
        0,
        expectedValues
      );

    const locationTokens =
      tokens.slice(
        0,
        firstPriceIndex
      );

    if (
      locationTokens.length <
      2
    ) {
      continue;
    }

    rows.push({
      locationTokens,
      prices,
      raw: combined,
    });

    // Skip consumed continuation lines.
    let consumed = 0;

    for (
      let j = 1;
      j <= 4 &&
      i + j < lines.length;
      j++
    ) {
      const next =
        lines[i + j];

      const test =
        combined.includes(
          next
        );

      if (test) {
        consumed = j;
      }
    }

    if (consumed > 0) {
      i += consumed;
    }
  }

  return rows;
}

// ============================================================
// EXTRACT REGION + MARKET
// ============================================================
//
// Hatuna region list.
// Kwa kuwa bei zinaanza baada ya location,
// tunachukua tokens kabla ya bei.
//
// Kwa PDF hii:
// token ya kwanza = region
// tokens zinazofuata = market.
//
// Ikiwa region ina maneno mengi, tutahitaji kutambua
// kutoka structure ya PDF. Kwa sasa tunatumia
// first token kama region na rest kama market,
// isipokuwa "Dar es salaam".
//

function extractLocation(
  locationTokens
) {
  if (
    !locationTokens ||
    locationTokens.length < 2
  ) {
    return null;
  }

  let region;
  let market;

  const first =
    locationTokens[0];

  const lower =
    first.toLowerCase();

  // ----------------------------------------------------------
  // Multi-word Dar es Salaam
  // ----------------------------------------------------------

  if (
    lower === "dar" &&
    locationTokens.length >= 4 &&
    locationTokens[1]
      .toLowerCase() === "es" &&
    locationTokens[2]
      .toLowerCase()
      .startsWith("sala")
  ) {
    region =
      locationTokens
        .slice(0, 3)
        .join(" ");

    market =
      locationTokens
        .slice(3)
        .join(" ");
  } else {
    region = first;

    market =
      locationTokens
        .slice(1)
        .join(" ");
  }

  region =
    cleanText(region);

  market =
    cleanText(market);

  // ----------------------------------------------------------
  // Reject obvious non-data rows.
  // ----------------------------------------------------------

  const bad =
    normalizeForCompare(
      `${region} ${market}`
    );

  if (
    bad.includes("region") ||
    bad.includes("mkoa") ||
    bad.includes("district") ||
    bad.includes("market") ||
    bad.includes("bei za jumla") ||
    bad.includes("tzs / kilo")
  ) {
    return null;
  }

  if (
    /^\d+$/.test(region)
  ) {
    return null;
  }

  return {
    region,
    market,
  };
}

// ============================================================
// NORMALIZE CROP FOR DATABASE
// ============================================================
//
// This is NOT used to decide which crops exist.
// It only converts the published crop name into
// the existing Swahili names used by the application.
//
// Unknown crop => generated safe database name.
//

function normalizeCropForDatabase(
  crop
) {
  const english =
    cleanText(crop.english);

  const swahili =
    cleanText(crop.swahili);

  const text =
    normalizeForCompare(
      swahili || english
    );

  // Common published names.
  if (
    text === "mahindi" ||
    text === "maize"
  ) {
    return "mahindi";
  }

  if (
    text === "mchele" ||
    text === "rice"
  ) {
    return "mchele";
  }

  if (
    text === "mtama" ||
    text === "sorghum"
  ) {
    return "mtama";
  }

  if (
    text.includes("bulrush")
  ) {
    return "uwele";
  }

  if (
    text === "ulezi" ||
    text.includes("finger millet")
  ) {
    return "ulezi";
  }

  if (
    text.includes("wheat") ||
    text === "ngano"
  ) {
    return "ngano";
  }

  if (
    text.includes("bean") ||
    text === "maharage"
  ) {
    return "maharage";
  }

  if (
    text.includes("potato") ||
    text === "viazi"
  ) {
    return "viazi";
  }

  // ----------------------------------------------------------
  // Unknown crop:
  // Use Swahili if available, otherwise English.
  // ----------------------------------------------------------

  const result =
    swahili || english;

  return result
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// BUILD RECORDS
// ============================================================

function buildRecords(
  rows,
  crops
) {
  const records = [];

  for (
    const row of rows
  ) {
    const location =
      extractLocation(
        row.locationTokens
      );

    if (!location) {
      continue;
    }

    for (
      let i = 0;
      i < crops.length;
      i++
    ) {
      const min =
        row.prices[i * 2];

      const max =
        row.prices[
          i * 2 + 1
        ];

      const average100kg =
        calculateAverage(
          min,
          max
        );

      if (
        average100kg === null
      ) {
        continue;
      }

      // TanTrade = TZS / 100 KG
      // Soko la Mkulima = TZS / KG
      const pricePerKg =
        Number(
          (
            average100kg / 100
          ).toFixed(2)
        );

      records.push({
        zao:
          normalizeCropForDatabase(
            crops[i]
          ),

        crop_english:
          crops[i].english,

        mkoa:
          location.region,

        market:
          location.market,

        bei:
          pricePerKg,

        unit:
          "TZS/kg",
      });
    }
  }

  return records;
}

// ============================================================
// REMOVE DUPLICATES
// ============================================================

function aggregateRegionalPrices(
  records
) {
  const map =
    new Map();

  for (
    const record of records
  ) {
    if (
      !record.zao ||
      !record.mkoa ||
      !record.bei
    ) {
      continue;
    }

    const key =
      [
        normalizeForCompare(
          record.zao
        ),
        normalizeForCompare(
          record.mkoa
        ),
      ].join("|");

    if (
      !map.has(key)
    ) {
      map.set(key, []);
    }

    map
      .get(key)
      .push(record.bei);
  }

  const regional = [];

  for (
    const [
      key,
      prices,
    ] of map.entries()
  ) {
    const [
      zao,
      mkoa,
    ] = key.split("|");

    const average =
      prices.reduce(
        (sum, price) =>
          sum + price,
        0
      ) / prices.length;

    regional.push({
      zao,
      mkoa,
      bei:
        Number(
          average.toFixed(2)
        ),
    });
  }

  return regional;
}

// ============================================================
// DATABASE PREPARATION
// ============================================================

async function prepareDatabase() {
  console.log("");
  console.log(
    "🗄️ Inaandaa bei_mazao..."
  );

  await pool.query(`
    ALTER TABLE bei_mazao
    ADD COLUMN IF NOT EXISTS unit TEXT
  `);

  await pool.query(`
    ALTER TABLE bei_mazao
    ADD COLUMN IF NOT EXISTS source TEXT
  `);

  await pool.query(`
    ALTER TABLE bei_mazao
    ADD COLUMN IF NOT EXISTS source_url TEXT
  `);

  await pool.query(`
    ALTER TABLE bei_mazao
    ADD COLUMN IF NOT EXISTS data_date DATE
  `);

  await pool.query(`
    ALTER TABLE bei_mazao
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
  `);

  console.log(
    "✅ Database iko tayari."
  );
}

// ============================================================
// SAVE TO DATABASE
// ============================================================

async function savePrices(
  regionalPrices,
  sourceUrl,
  reportDate
) {
  console.log("");
  console.log(
    "💾 Ina-save prices..."
  );

  let inserted = 0;
  let updated = 0;

  for (
    const item of regionalPrices
  ) {
    const existing =
      await pool.query(
        `
        SELECT id
        FROM bei_mazao
        WHERE LOWER(TRIM(zao)) =
              LOWER(TRIM($1))
          AND LOWER(TRIM(mkoa)) =
              LOWER(TRIM($2))
        LIMIT 1
        `,
        [
          item.zao,
          item.mkoa,
        ]
      );

    if (
      existing.rows.length
    ) {
      await pool.query(
        `
        UPDATE bei_mazao
        SET
          bei = $1,
          unit = 'TZS/kg',
          source = 'TanTrade',
          source_url = $2,
          data_date = $3,
          updated_at = NOW()
        WHERE id = $4
        `,
        [
          item.bei,
          sourceUrl,
          reportDate,
          existing.rows[0].id,
        ]
      );

      updated++;
    } else {
      await pool.query(
        `
        INSERT INTO bei_mazao
        (
          zao,
          mkoa,
          bei,
          unit,
          source,
          source_url,
          data_date,
          updated_at
        )
        VALUES
        (
          $1,
          $2,
          $3,
          'TZS/kg',
          'TanTrade',
          $4,
          $5,
          NOW()
        )
        `,
        [
          item.zao,
          item.mkoa,
          item.bei,
          sourceUrl,
          reportDate,
        ]
      );

      inserted++;
    }

    console.log(
      `✅ ${item.zao} | ${item.mkoa} | TZS ${item.bei}/kg`
    );
  }

  return {
    inserted,
    updated,
  };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    "🌾 SOKO LA MKULIMA"
  );
  console.log(
    "🚀 DYNAMIC TANTRADE PRICE SYNC"
  );
  console.log(
    "=============================================="
  );

  try {
    // --------------------------------------------------------
    // DB
    // --------------------------------------------------------

    await pool.query(
      "SELECT NOW()"
    );

    console.log(
      "✅ Database connection iko sawa."
    );

    await prepareDatabase();

    // --------------------------------------------------------
    // PDF
    // --------------------------------------------------------

    const pdf =
      await discoverPDF();

    console.log("");
    console.log(
      "⬇️ Ina-download TanTrade PDF..."
    );

    console.log(
      pdf.url
    );

    fs.writeFileSync(
      PDF_FILE,
      pdf.buffer
    );

    console.log(
      "✅ PDF imehifadhiwa:",
      PDF_FILE
    );

    // --------------------------------------------------------
    // Read PDF
    // --------------------------------------------------------

    const text =
      await readPDF(
        pdf.buffer
      );

    fs.writeFileSync(
      TXT_FILE,
      text,
      "utf8"
    );

    console.log(
      "✅ Text imehifadhiwa:",
      TXT_FILE
    );

    // --------------------------------------------------------
    // Date
    // --------------------------------------------------------

    const reportDate =
      extractReportDate(
        text
      );

    console.log("");

    if (reportDate) {
      console.log(
        `📅 Report date: ${reportDate}`
      );
    } else {
      console.log(
        "⚠️ Report date haikupatikana kwenye PDF."
      );
    }

    // --------------------------------------------------------
    // Header
    // --------------------------------------------------------

    console.log("");
    console.log(
      "🔄 Inaparsing dynamic table..."
    );

    const header =
      extractHeader(
        text
      );

    if (!header) {
      throw new Error(
        "Header ya TanTrade haikupatikana."
      );
    }

    const crops =
      detectCrops(
        header.text
      );

    if (
      crops.length === 0
    ) {
      throw new Error(
        "Hakuna mazao yaliyogunduliwa kutoka TanTrade header."
      );
    }

    // --------------------------------------------------------
    // Rows
    // --------------------------------------------------------

    const rows =
      findDataRows(
        text,
        crops.length,
        header.index
      );

    console.log("");
    console.log(
      `📊 Possible rows: ${rows.length}`
    );

    // --------------------------------------------------------
    // Raw records
    // --------------------------------------------------------

    const rawRecords =
      buildRecords(
        rows,
        crops
      );

    console.log(
      `📊 Raw records: ${rawRecords.length}`
    );

    if (
      rawRecords.length === 0
    ) {
      throw new Error(
        "Hakuna price records zilizopatikana."
      );
    }

    // --------------------------------------------------------
    // Regional averages
    // --------------------------------------------------------

    const regionalPrices =
      aggregateRegionalPrices(
        rawRecords
      );

    console.log(
      `📊 Regional prices: ${regionalPrices.length}`
    );

    if (
      regionalPrices.length === 0
    ) {
      throw new Error(
        "Hakuna regional prices zilizopatikana."
      );
    }

    // --------------------------------------------------------
    // Safety check
    // --------------------------------------------------------

    const invalid =
      regionalPrices.filter(
        (item) =>
          !item.zao ||
          item.zao.includes(
            "tzs"
          ) ||
          item.zao.includes(
            "kilo"
          ) ||
          item.zao.includes(
            "bei"
          )
      );

    if (
      invalid.length > 0
    ) {
      console.log("");
      console.log(
        "⚠️ Records zisizo salama zimepatikana:"
      );

      console.table(
        invalid
      );

      throw new Error(
        "Parser imegundua records zisizo sahihi. Database haija-update."
      );
    }

    // --------------------------------------------------------
    // Save
    // --------------------------------------------------------

    const result =
      await savePrices(
        regionalPrices,
        pdf.url,
        reportDate
      );

    console.log("");
    console.log(
      "=============================================="
    );
    console.log(
      `🆕 Inserted: ${result.inserted}`
    );
    console.log(
      `🔄 Updated: ${result.updated}`
    );
    console.log(
      "=============================================="
    );

    console.log("");
    console.log(
      "🎉 TANTRADE DYNAMIC SYNC IMEKAMILIKA"
    );
    console.log(
      "=============================================="
    );

  } catch (error) {
    console.log("");
    console.error(
      "❌ SYNC IMESHINDWA:"
    );

    console.error(
      error.message
    );

    console.log("");
    console.log(
      "⚠️ Database haija-update na invalid records."
    );

    process.exitCode = 1;
  } finally {
    await pool.end();

    console.log("");
    console.log(
      "🔌 Database connection imefungwa."
    );
  }
}

// ============================================================
// START
// ============================================================

main();