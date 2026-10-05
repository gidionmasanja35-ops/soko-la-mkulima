// price-sources/moa.js

const axios = require("axios");
const { PDFParse } = require("pdf-parse");

const { getCropById } = require("./master-crops");
const { matchRegion } = require("./region-matcher");
const { normalizeUnitName } = require("./unit-converter");

// ============================================================
// CONFIGURATION
// ============================================================

const SOURCE_NAME = "MOA";

const MOA_PRICE_PAGE = "https://www.kilimo.go.tz/publications/market-bulletin";

// Official fallback PDF currently being used
const FALLBACK_PDF_URL =
  "https://www.kilimo.go.tz/uploads/documents/sw-1791091825-Weekly%20Market%20Bulletin%2028%20Sept,%2002%20Oct%202026.pdf";

const DEFAULT_PDF_URL = process.env.MOA_PDF_URL || FALLBACK_PDF_URL;

// ============================================================
// MOA CROP ORDER
// ============================================================

const MOA_CROPS = [
  {
    cropId: "mahindi",
    cropName: "Mahindi",
    aliases: ["maize", "mahindi"],
  },

  {
    cropId: "mchele",
    cropName: "Mchele",
    aliases: ["rice", "mchele"],
  },

  {
    cropId: "maharage",
    cropName: "Maharage",
    aliases: ["beans", "bean", "maharage"],
  },

  {
    cropId: "mtama",
    cropName: "Mtama",
    aliases: ["sorghum", "mtama"],
  },

  {
    cropId: "uwele",
    cropName: "Uwele",
    aliases: ["bulrush millet", "bulrush", "uwele"],
  },

  {
    cropId: "ulezi",
    cropName: "Ulezi",
    aliases: ["finger millet", "ulezi"],
  },

  {
    cropId: "viazi mbatata",
    cropName: "Viazi Mbatata",
    aliases: [
      "round potato",
      "round potatoes",
      "potato",
      "potatoes",
      "viazi mviringo",
      "viazi mbatata",
    ],
  },
];

// ============================================================
// HELPERS
// ============================================================

function cleanText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value).replace(/,/g, "").replace(/\s/g, "").trim();

  if (
    !cleaned ||
    cleaned === "-" ||
    cleaned.toUpperCase() === "NA" ||
    cleaned.toUpperCase() === "N/A"
  ) {
    return null;
  }

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : null;
}

function isMissing(value) {
  if (value === null || value === undefined) {
    return true;
  }

  const text = normalizeText(value);

  return text === "" || text === "-" || text === "na" || text === "n/a";
}

// ============================================================
// DATE HELPERS
// ============================================================

const MONTHS = {
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
};

function buildDate(day, monthName, year) {
  const month = MONTHS[String(monthName).toLowerCase().trim()];

  if (!month) {
    return null;
  }

  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

function extractReportDate(text) {
  const normalized = cleanText(text);

  const rangeMatch = normalized.match(
    /(?:Weekly\s+Market\s+Bulletin[\s\S]{0,80}?)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+[–-]\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(20\d{2})/i,
  );

  if (rangeMatch) {
    const endDay = rangeMatch[3];
    const endMonth = rangeMatch[4];
    const year = rangeMatch[5];

    const date = buildDate(endDay, endMonth, year);

    if (date) {
      return date;
    }
  }

  const dateMatch = normalized.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)[,\s]+(20\d{2})/i,
  );

  if (dateMatch) {
    return buildDate(dateMatch[1], dateMatch[2], dateMatch[3]);
  }

  return null;
}

// ============================================================
// FIND LATEST PDF
// ============================================================

async function findLatestPdfUrl() {
  try {
    const response = await axios.get(MOA_PRICE_PAGE, {
      timeout: 30000,

      headers: {
        Accept: "text/html",
        "User-Agent": "Soko-la-Mkulima-Price-Sync",
      },
    });

    const html = String(response.data || "");

    const matches = [];

    const hrefRegex = /href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi;

    let match;

    while ((match = hrefRegex.exec(html)) !== null) {
      matches.push(match[1]);
    }

    const bulletinPdf = matches.find((url) =>
      /weekly[\s_-]*market[\s_-]*bulletin/i.test(url),
    );

    if (bulletinPdf) {
      return makeAbsoluteUrl(bulletinPdf);
    }

    if (matches.length > 0) {
      return makeAbsoluteUrl(matches[0]);
    }

    return null;
  } catch (error) {
    console.error("[MOA] Could not discover latest PDF:", error.message);

    return null;
  }
}

function makeAbsoluteUrl(url) {
  if (!url) {
    return null;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  if (url.startsWith("/")) {
    return `https://www.kilimo.go.tz${url}`;
  }

  return new URL(url, MOA_PRICE_PAGE).toString();
}

// ============================================================
// DOWNLOAD PDF
// ============================================================

async function downloadPdf(pdfUrl) {
  if (!pdfUrl) {
    throw new Error("MOA PDF URL haijapatikana.");
  }

  const response = await axios.get(pdfUrl, {
    responseType: "arraybuffer",
    timeout: 60000,

    headers: {
      Accept: "application/pdf",
      "User-Agent": "Soko-la-Mkulima-Price-Sync",
    },
  });

  return Buffer.from(response.data);
}

// ============================================================
// PDF TEXT EXTRACTION
// ============================================================

async function extractPdfText(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("MOA PDF buffer si valid.");
  }

  const parser = new PDFParse({
    data: buffer,
  });

  try {
    const result = await parser.getText();

    const rawText = result.text || "";

    // ========================================================
    // DEBUG TABLE 2
    // ========================================================
    //
    // Hii inatuonyesha exactly jinsi pdf-parse
    // inavyosoma Table 2 kutoka kwenye PDF.
    //

    const debugLines = String(rawText)
      .split("\n")
      .map((line) => cleanText(line))
      .filter(Boolean);

    let insideTable2 = false;

    for (const line of debugLines) {
      const normalized = normalizeText(line);

      if (
        normalized.includes("table 2:") &&
        normalized.includes("regional weekly average")
      ) {
        insideTable2 = true;

        console.log("\n========================================");

        console.log("MOA TABLE 2 RAW TEXT");

        console.log("========================================\n");

        console.log("========== TABLE 2 START ==========\n");

        continue;
      }

      if (insideTable2 && normalized.includes("table 4:")) {
        console.log("\n========== TABLE 2 END ==========\n");

        break;
      }

      if (insideTable2) {
        console.log(line);
      }
    }

    return cleanText(rawText);
  } finally {
    await parser.destroy();
  }
}

// ============================================================
// REGION DETECTION
// ============================================================

function detectRegion(regionName) {
  if (!regionName) {
    return null;
  }

  const result = matchRegion(regionName);

  if (result && result.matched) {
    return result;
  }

  return null;
}

// ============================================================
// CROP VALIDATION
// ============================================================

function getMoaCrop(index) {
  const crop = MOA_CROPS[index];

  if (!crop) {
    return null;
  }

  const masterCrop = getCropById(crop.cropId);

  if (!masterCrop) {
    return null;
  }

  return {
    cropId: masterCrop.cropId || crop.cropId,

    cropName: masterCrop.cropName || crop.cropName,
  };
}

// ============================================================
// CURRENT PRICE TOKEN PARSER
// ============================================================

function parseCurrentValues(valueText) {
  const tokens = String(valueText || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const values = [];

  for (const token of tokens) {
    if (isMissing(token)) {
      values.push(null);
      continue;
    }

    const value = parseNumber(token);

    if (value !== null) {
      values.push(value);
    }
  }

  while (values.length < 7) {
    values.push(null);
  }

  return values.slice(0, 7);
}

// ============================================================
// REGION ROW PARSER
// ============================================================

function parseRegionalRows(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);

  const regionNames = [
    "Dar es Salaam",
    "Kilimanjaro",
    "Shinyanga",
    "Morogoro",
    "Dodoma",
    "Arusha",
    "Lindi",
    "Tanga",
    "Iringa",
    "Ruvuma",
    "Tabora",
    "Rukwa",
    "Kigoma",
    "Mwanza",
    "Mara",
    "Manyara",
    "Njombe",
    "Mbeya",
    "Geita",
    "Simiyu",
  ];

  // Longest names first
  regionNames.sort((a, b) => b.length - a.length);

  const records = [];

  let insideTable = false;

  let pendingRegion = null;

  let pendingValues = [];

  // ----------------------------------------------------------
  // Find region anywhere in line
  // ----------------------------------------------------------

  function findRegionInLine(line) {
    const normalizedLine = normalizeText(line);

    for (const regionName of regionNames) {
      const normalizedRegion = normalizeText(regionName);

      if (normalizedLine.includes(normalizedRegion)) {
        return regionName;
      }
    }

    return null;
  }

  // ----------------------------------------------------------
  // Extract numeric and missing values
  // ----------------------------------------------------------

  function extractValueTokens(line) {
    const tokens = String(line || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const values = [];

    for (const token of tokens) {
      if (isMissing(token)) {
        values.push(null);
        continue;
      }

      const number = parseNumber(token);

      if (number !== null) {
        values.push(number);
      }
    }

    return values;
  }

  // ----------------------------------------------------------
  // Save one region
  // ----------------------------------------------------------

  function saveRegion(regionName, values) {
    if (!regionName || !Array.isArray(values)) {
      return;
    }

    const finalValues = values.slice(0, 7);

    while (finalValues.length < 7) {
      finalValues.push(null);
    }

    const region = detectRegion(regionName);

    if (!region) {
      console.warn(`[MOA] Region not matched: ${regionName}`);

      return;
    }

    // Prevent duplicate regions
    const alreadyExists = records.some(
      (item) => item.region && item.region.regionId === region.regionId,
    );

    if (alreadyExists) {
      return;
    }

    records.push({
      region,
      values: finalValues,
    });
  }

  // ----------------------------------------------------------
  // Check whether line is a table header
  // ----------------------------------------------------------

  function isLikelyHeader(line) {
    const normalized = normalizeText(line);

    return (
      normalized === "region" ||
      normalized === "week" ||
      normalized.includes("regional weekly average") ||
      normalized.includes("mahindi") ||
      normalized.includes("mchele") ||
      normalized.includes("maharage") ||
      normalized.includes("mtama") ||
      normalized.includes("uwele") ||
      normalized.includes("ulezi") ||
      normalized.includes("round potato")
    );
  }

  // ==========================================================
  // MAIN LOOP
  // ==========================================================

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const normalized = normalizeText(line);

    // --------------------------------------------------------
    // START TABLE 2
    // --------------------------------------------------------

    if (
      normalized.includes("table 2:") &&
      normalized.includes("regional weekly average")
    ) {
      insideTable = true;

      continue;
    }

    if (!insideTable) {
      continue;
    }

    // --------------------------------------------------------
    // STOP AT TABLE 3
    // --------------------------------------------------------

    if (records.length >= regionNames.length) {
      break;
    }

    // --------------------------------------------------------
    // PENDING REGION
    // --------------------------------------------------------

    if (pendingRegion) {
      const nextRegion = findRegionInLine(line);

      /*
        If another region appears before
        we have collected seven values,
        save current region and process
        the new region.
      */

      if (
        nextRegion &&
        normalizeText(nextRegion) !== normalizeText(pendingRegion)
      ) {
        saveRegion(pendingRegion, pendingValues);

        pendingRegion = null;
        pendingValues = [];

        // Do not continue.
        // Process this line as new region.
      } else {
        if (!isLikelyHeader(line)) {
          const values = extractValueTokens(line);

          if (values.length > 0) {
            pendingValues.push(...values);
          }
        }

        if (pendingValues.length >= 7) {
          saveRegion(pendingRegion, pendingValues);

          pendingRegion = null;
          pendingValues = [];
        }

        continue;
      }
    }

    // --------------------------------------------------------
    // FIND REGION
    // --------------------------------------------------------

    const regionName = findRegionInLine(line);

    if (!regionName) {
      continue;
    }

    const normalizedRegion = normalizeText(regionName);

    // --------------------------------------------------------
    // Remove region + current
    // --------------------------------------------------------

    const regionCurrentRegex = new RegExp(
      `^${normalizedRegion.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      )}\\s+current\\s*`,
      "i",
    );

    let valueText = line.replace(regionCurrentRegex, "").trim();

    // If only region remains
    if (normalizeText(valueText) === normalizedRegion) {
      valueText = "";
    }

    // --------------------------------------------------------
    // Fallback:
    // Find "current" manually
    // --------------------------------------------------------

    if (!valueText && normalized.includes("current")) {
      const currentIndex = normalized.indexOf("current");

      const currentPrefix = line.substring(0, currentIndex);

      if (normalizeText(currentPrefix).includes(normalizedRegion)) {
        valueText = line.substring(currentIndex + "current".length).trim();
      }
    }

    // --------------------------------------------------------
    // Extract values from same line
    // --------------------------------------------------------

    let values = extractValueTokens(valueText);

    // --------------------------------------------------------
    // CASE 1:
    // Region + all values same line
    // --------------------------------------------------------

    if (values.length >= 7) {
      saveRegion(regionName, values);

      continue;
    }

    // --------------------------------------------------------
    // CASE 2:
    // Region on one line,
    // prices on following lines
    // --------------------------------------------------------

    pendingRegion = regionName;

    pendingValues = values;

    if (pendingValues.length >= 7) {
      saveRegion(pendingRegion, pendingValues);

      pendingRegion = null;
      pendingValues = [];
    }
  }

  // ----------------------------------------------------------
  // SAVE LAST PENDING REGION
  // ----------------------------------------------------------

  if (pendingRegion && pendingValues.length > 0) {
    saveRegion(pendingRegion, pendingValues);
  }

  return records;
}

// ============================================================
// CREATE PRICE RECORD
// ============================================================

function createPriceRecord({ crop, region, price, dataDate, sourceUrl }) {
  if (!crop) {
    return null;
  }

  if (!region) {
    return null;
  }

  if (
    price === null ||
    price === undefined ||
    !Number.isFinite(Number(price)) ||
    Number(price) <= 0
  ) {
    return null;
  }

  return {
    source: SOURCE_NAME,

    cropId: crop.cropId,

    cropName: crop.cropName,

    regionId: region.regionId,

    regionName: region.regionName,

    market: null,

    price: Number(price),

    minPrice: Number(price),

    maxPrice: Number(price),

    unit: normalizeUnitName("kg"),

    priceType: "wholesale_average",

    dataDate: dataDate,

    sourceUrl: sourceUrl || MOA_PRICE_PAGE,

    updatedAt: new Date().toISOString(),
  };
}

// ============================================================
// PARSE MOA PDF
// ============================================================

function parseMoaPdf({ text, pdfUrl }) {
  const dataDate = extractReportDate(text);

  if (!dataDate) {
    throw new Error("MOA report date haikuweza kutambuliwa.");
  }

  const regionalRows = parseRegionalRows(text);

  const records = [];

  for (const row of regionalRows) {
    for (let i = 0; i < 7; i++) {
      const price = row.values[i];

      // "-" means no data.
      // Never fabricate a price.
      if (price === null) {
        continue;
      }

      const crop = getMoaCrop(i);

      if (!crop) {
        continue;
      }

      const record = createPriceRecord({
        crop,

        region: row.region,

        price,

        dataDate,

        sourceUrl: pdfUrl,
      });

      if (record) {
        records.push(record);
      }
    }
  }

  return {
    success: true,

    source: SOURCE_NAME,

    sourceUrl: pdfUrl,

    dataDate,

    records,

    regionalRowCount: regionalRows.length,

    recordCount: records.length,
  };
}

// ============================================================
// MAIN FETCH FUNCTION
// ============================================================

async function fetchMoaPrices(options = {}) {
  console.log("[MOA] Starting MOA price fetch...");

  // ----------------------------------------------------------
  // 1. Try configured PDF first
  // ----------------------------------------------------------

  let pdfUrl = options.pdfUrl || process.env.MOA_PDF_URL || null;

  // ----------------------------------------------------------
  // 2. Discover latest official PDF
  // ----------------------------------------------------------

  if (!pdfUrl) {
    pdfUrl = await findLatestPdfUrl();
  }

  // ----------------------------------------------------------
  // 3. Fallback
  // ----------------------------------------------------------

  if (!pdfUrl) {
    pdfUrl = DEFAULT_PDF_URL;
  }

  console.log(`[MOA] PDF: ${pdfUrl}`);

  // ----------------------------------------------------------
  // 4. Download PDF
  // ----------------------------------------------------------

  const buffer = await downloadPdf(pdfUrl);

  // ----------------------------------------------------------
  // 5. Extract text
  // ----------------------------------------------------------

  const text = await extractPdfText(buffer);

  // ----------------------------------------------------------
  // 6. Parse
  // ----------------------------------------------------------

  const result = parseMoaPdf({
    text,
    pdfUrl,
  });

  console.log(`[MOA] Report date: ${result.dataDate}`);

  console.log(`[MOA] Regional rows: ${result.regionalRowCount}`);

  console.log(`[MOA] Price records: ${result.recordCount}`);

  return result;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  SOURCE_NAME,
  MOA_PRICE_PAGE,
  DEFAULT_PDF_URL,

  fetchMoaPrices,
  findLatestPdfUrl,
  extractReportDate,
  parseMoaPdf,
};
