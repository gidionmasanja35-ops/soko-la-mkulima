// price-sources/mit.js

const axios = require("axios");
const { PDFParse } = require("pdf-parse");

const {
  getCropById,
  getMasterCrops,
} = require("./master-crops");

const {
  normalizeUnit,
} = require("./unit-converter");

const SOURCE_NAME = "MIT";

const MIT_PRICE_PAGE =
  "https://www.viwanda.go.tz/documents/product-prices-domestic";

const DEFAULT_PDF_URL =
  process.env.MIT_PDF_URL || null;

// ============================================================
// HELPERS
// ============================================================

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseNumber(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();

  if (
    !cleaned ||
    cleaned.toUpperCase() === "NA"
  ) {
    return null;
  }

  const number = Number(cleaned);

  return Number.isFinite(number)
    ? number
    : null;
}

function isNA(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return true;
  }

  return (
    normalizeText(value) === "na" ||
    normalizeText(value) === "-"
  );
}

// ============================================================
// REPORT DATE
// ============================================================

function extractReportDate(text) {
  const normalized = cleanText(text);

  // Example:
  // 24 AGOSTI, 2026
  const swahiliMatch = normalized.match(
    /(\d{1,2})\s+AGOSTI[,\s]+(\d{4})/i
  );

  if (swahiliMatch) {
    const day = swahiliMatch[1];
    const year = swahiliMatch[2];

    return `${year}-08-${String(day).padStart(2, "0")}`;
  }

  // Example:
  // 24th August, 2026
  const englishMatch = normalized.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s+August[,\s]+(\d{4})/i
  );

  if (englishMatch) {
    const day = englishMatch[1];
    const year = englishMatch[2];

    return `${year}-08-${String(day).padStart(2, "0")}`;
  }

  // Generic yyyy-mm-dd
  const isoMatch = normalized.match(
    /\b(20\d{2})-(\d{2})-(\d{2})\b/
  );

  if (isoMatch) {
    return isoMatch[0];
  }

  return null;
}

// ============================================================
// MIT CROP ORDER
// ============================================================

/*
  This is the exact order used by the inspected MIT report.

  The PDF contains 8 crop columns:

  1. Maize (Mahindi)
  2. Rice (Mchele)
  3. Sorghum (Mtama)
  4. Bulrush Millet (Uwele)
  5. Finger Millet (Ulezi)
  6. Wheat Grain (Ngano)
  7. Beans (Maharage)
  8. Irish Potatoes (Viazi Mviringo)
*/

const MIT_REPORT_CROPS = [
  {
    id: "mahindi",
    name: "Mahindi",
  },
  {
    id: "mchele",
    name: "Mchele",
  },
  {
    id: "mtama",
    name: "Mtama",
  },
  {
    id: "uwеле",
    name: "Uwele",
  },
  {
    id: "ulezi",
    name: "Ulezi",
  },
  {
    id: "ngano",
    name: "Ngano",
  },
  {
    id: "maharage",
    name: "Maharage",
  },
  {
    id: "viazi mbatata",
    name: "Viazi Mviringo",
  },
];

// Fix Unicode typo defensively.
MIT_REPORT_CROPS[3].id = "uwele";

// ============================================================
// UNIT
// ============================================================

function detectReportUnit(text) {
  const normalized = normalizeText(text);

  if (
    normalized.includes(
      "kilo 100"
    ) ||
    normalized.includes(
      "kilo100"
    ) ||
    normalized.includes(
      "100kg"
    ) ||
    normalized.includes(
      "100 kg"
    )
  ) {
    return "100kg";
  }

  if (
    normalized.includes("ton")
  ) {
    return "ton";
  }

  if (
    normalized.includes("kg")
  ) {
    return "kg";
  }

  return "unknown";
}

// ============================================================
// REGION NORMALIZATION
// ============================================================

function normalizeRegion(region) {
  const value = cleanText(region);

  const normalized =
    normalizeText(value);

  const aliases = {
    "dar es salaam": "Dar es Salaam",
    "dar es saalam": "Dar es Salaam",

    "kilimanjaro": "Kilimanjaro",
    "singida": "Singida",
    "arusha": "Arusha",
    "dodoma": "Dodoma",
    "morogoro": "Morogoro",
    "mtwara": "Mtwara",
    "lindi": "Lindi",
    "iringa": "Iringa",
    "mara": "Mara",
    "tanga": "Tanga",
    "songwe": "Songwe",
    "tabora": "Tabora",
    "geita": "Geita",
    "kagera": "Kagera",
    "katavi": "Katavi",
    "mbeya": "Mbeya",
    "ruvuma": "Ruvuma",
    "shinyanga": "Shinyanga",
    "mwanza": "Mwanza",
    "pwani": "Pwani",
    "simiyu": "Simiyu",
    "kigoma": "Kigoma",
    "njombe": "Njombe",
    "rukwa": "Rukwa",
  };

  return (
    aliases[normalized] ||
    value
  );
}

// ============================================================
// CREATE RECORD
// ============================================================

function createPriceRecord({
  cropId,
  regionName,
  market,
  minPrice,
  maxPrice,
  unit,
  dataDate,
}) {
  const crop =
    getCropById(cropId);

  if (!crop) {
    return null;
  }

  // Both values missing = no price
  if (
    minPrice === null &&
    maxPrice === null
  ) {
    return null;
  }

  /*
    MIT gives a Min Price + Max Price range.

    We keep both values.

    `price` is the midpoint only when both
    min and max exist.

    This is explicitly marked as:
    wholesale_range_midpoint
  */

  let price = null;

  if (
    minPrice !== null &&
    maxPrice !== null
  ) {
    price =
      Number(
        (
          (minPrice + maxPrice) /
          2
        ).toFixed(2)
      );
  } else if (
    minPrice !== null
  ) {
    price = minPrice;
  } else {
    price = maxPrice;
  }

  return {
    source: SOURCE_NAME,

    cropId: crop.id,

    cropName: crop.name,

    regionId:
      normalizeText(regionName)
        .replace(/\s+/g, "_"),

    regionName:
      normalizeRegion(regionName),

    market:
      market || null,

    price,

    minPrice,

    maxPrice,

    unit:
      normalizeUnit(unit),

    priceType:
      "wholesale_range_midpoint",

    dataDate,

    sourceUrl:
      DEFAULT_PDF_URL ||
      MIT_PRICE_PAGE,

    updatedAt:
      new Date().toISOString(),
  };
}

// ============================================================
// PARSE NUMBERS FROM ROW
// ============================================================

function extractPriceValues(row) {
  /*
    MIT row format:

    Dar es salaam Ilala
    90,000 100,000
    230,000 320,000
    110,000 130,000
    ...

    Each row should contain:
    8 crops × (Min + Max) = 16 values

    IMPORTANT:
    We tokenize the row instead of using a global regex
    so we don't accidentally extract partial digits from
    other text.
  */

  const tokens = String(row || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const values = [];

  for (const token of tokens) {
    const cleanToken = token
      .replace(/\s/g, "")
      .trim();

    // Missing value
    if (isNA(cleanToken)) {
      values.push(null);
      continue;
    }

    /*
      Accept:
        90,000
        100,000
        250000
        57,031
        120000.50
    */

    const isPriceToken =
      /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(cleanToken) ||
      /^\d+(?:\.\d+)?$/.test(cleanToken);

    if (!isPriceToken) {
      continue;
    }

    const number = parseNumber(cleanToken);

    if (number !== null) {
      values.push(number);
    }
  }

  return values;
}


// ============================================================
// DETECT REGION
// ============================================================

const KNOWN_REGIONS = [
  "Dar es salaam",
  "Dar es saalam",
  "Kilimanjaro",
  "Singida",
  "Arusha",
  "Dodoma",
  "Morogoro",
  "Mtwara",
  "Lindi",
  "Iringa",
  "Mara",
  "Tanga",
  "Songwe",
  "Tabora",
  "Geita",
  "Kagera",
  "Katavi",
  "Mbeya",
  "Ruvuma",
  "Shinyanga",
  "Mwanza",
  "Pwani",
  "Simiyu",
  "Kigoma",
  "Njombe",
  "Rukwa",
];

function detectRegionAndMarket(line) {
  const cleanLine =
    cleanText(line);

  const normalizedLine =
    normalizeText(cleanLine);

  let matchedRegion = null;

  for (const region of KNOWN_REGIONS) {
    const normalizedRegion =
      normalizeText(region);

    if (
      normalizedLine.startsWith(
        normalizedRegion
      )
    ) {
      matchedRegion = region;
      break;
    }
  }

  if (!matchedRegion) {
    return null;
  }

  /*
    MIT PDF row format:

    Region + Market + prices

    Example:

    Kagera Bukoba 70,000 72,000 160,000 280,000 ...

    The market should be:
    Bukoba

    NOT:
    Bukoba 70,000 72,000 160,000 ...
  */

  const afterRegion =
    cleanLine
      .slice(
        matchedRegion.length
      )
      .trim();

  /*
    Find the first price or NA.

    Example:

    Bukoba 70,000 72,000 ...

    First value = 70,000

    Therefore everything before 70,000
    is the market name.
  */

  const firstValueMatch =
    afterRegion.match(
      /\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\b|NA/i
    );

  let market = afterRegion;

  if (firstValueMatch) {
    market =
      afterRegion
        .slice(
          0,
          firstValueMatch.index
        )
        .trim();
  }

  /*
    Clean extra spaces before saving.
  */

  market =
    cleanText(market);

  return {
    regionName:
      normalizeRegion(
        matchedRegion
      ),

    market:
      market || null,
  };
}

// ============================================================
// PARSE MIT TABLE
// ============================================================

function parseMitText(text) {
  const cleaned =
    String(text || "")
      .replace(/\r/g, "");

  const lines =
    cleaned
      .split("\n")
      .map(cleanText)
      .filter(Boolean);

  const dataDate =
    extractReportDate(cleaned);

  const unit =
    detectReportUnit(cleaned);

  console.log(
    "[MIT] Detected date:",
    dataDate
  );

  console.log(
    "[MIT] Detected unit:",
    unit
  );

  const records = [];

  /*
    Each data row has:

    Region + Market + 16 values

    16 values =
    8 crops × (min + max)
  */

  for (const line of lines) {
    const location =
      detectRegionAndMarket(line);

    if (!location) {
      continue;
    }

    const values =
      extractPriceValues(line);

    /*
      Must have 16 values for
      the 8 crop columns.

      Some rows may have fewer
      because the PDF extraction
      can omit NA values.
    */

    if (
      values.length !== 16
    ) {
      console.log(
        "[MIT] Skipping row with",
        values.length,
        "values:",
        line
      );

      continue;
    }

    for (
      let i = 0;
      i < MIT_REPORT_CROPS.length;
      i++
    ) {
      const crop =
        MIT_REPORT_CROPS[i];

      const minIndex =
        i * 2;

      const maxIndex =
        minIndex + 1;

      const minPrice =
        values[minIndex];

      const maxPrice =
        values[maxIndex];

      const record =
        createPriceRecord({
          cropId:
            crop.id,

          regionName:
            location.regionName,

          market:
            location.market,

          minPrice,

          maxPrice,

          unit,

          dataDate,
        });

      if (record) {
        records.push(record);
      }
    }
  }

  return records;
}

// ============================================================
// DOWNLOAD PDF
// ============================================================

async function downloadMitPdf(
  pdfUrl = DEFAULT_PDF_URL
) {
  if (!pdfUrl) {
    throw new Error(
      "MIT_PDF_URL haijawekwa."
    );
  }

  console.log(
    "[MIT] Downloading PDF..."
  );

  const response =
    await axios.get(
      pdfUrl,
      {
        responseType:
          "arraybuffer",

        timeout:
          60000,

        headers: {
          "User-Agent":
            "Soko-la-Mkulima/1.0",
        },
      }
    );

  return Buffer.from(
    response.data
  );
}

// ============================================================
// EXTRACT PDF TEXT
// ============================================================

async function extractMitPdfText(
  buffer
) {
  const parser =
    new PDFParse({
      data: buffer,
    });

  try {
    const result =
      await parser.getText();

    return result.text || "";
  } finally {
    await parser.destroy();
  }
}

// ============================================================
// FETCH PDF TEXT
// ============================================================

async function fetchMitPdfText(
  pdfUrl = DEFAULT_PDF_URL
) {
  const buffer =
    await downloadMitPdf(
      pdfUrl
    );

  return extractMitPdfText(
    buffer
  );
}

// ============================================================
// NORMALIZE RECORD
// ============================================================

function normalizeMitRecord(
  record
) {
  if (!record) {
    return null;
  }

  const crop =
    getCropById(
      record.cropId
    );

  if (!crop) {
    return null;
  }

  return {
    source:
      SOURCE_NAME,

    cropId:
      crop.id,

    cropName:
      crop.name,

    regionId:
      record.regionId,

    regionName:
      record.regionName,

    market:
      record.market || null,

    price:
      Number(record.price),

    minPrice:
      record.minPrice !== null
        ? Number(record.minPrice)
        : null,

    maxPrice:
      record.maxPrice !== null
        ? Number(record.maxPrice)
        : null,

    unit:
      normalizeUnit(
        record.unit
      ),

    priceType:
      record.priceType,

    dataDate:
      record.dataDate,

    sourceUrl:
      record.sourceUrl,

    updatedAt:
      record.updatedAt ||
      new Date().toISOString(),
  };
}

function normalizeMitRecords(
  records
) {
  return records
    .map(normalizeMitRecord)
    .filter(Boolean);
}

// ============================================================
// VALIDATE
// ============================================================

function validateMitRecords(
  records
) {
  return records.filter(
    (record) => {
      if (!record.cropId) {
        return false;
      }

      if (!record.regionName) {
        return false;
      }

      if (
        record.price === null ||
        !Number.isFinite(
          Number(record.price)
        )
      ) {
        return false;
      }

      return true;
    }
  );
}

// ============================================================
// MAIN FETCH FUNCTION
// ============================================================

async function fetchMitPrices(
  options = {}
) {
  const pdfUrl =
    options.pdfUrl ||
    DEFAULT_PDF_URL;

  const fetchedAt =
    new Date().toISOString();

  if (!pdfUrl) {
    return {
      source:
        SOURCE_NAME,

      success: false,

      records: [],

      rawCount: 0,

      normalizedCount: 0,

      message:
        "MIT_PDF_URL haijawekwa.",

      sourceUrl:
        MIT_PRICE_PAGE,

      fetchedAt,
    };
  }

  try {
    console.log(
      "[MIT] Fetching:",
      pdfUrl
    );

    const text =
      await fetchMitPdfText(
        pdfUrl
      );

    console.log(
      "[MIT] Extracted text length:",
      text.length
    );

    const rawRecords =
      parseMitText(text);

    const normalizedRecords =
      normalizeMitRecords(
        rawRecords
      );

    const validRecords =
      validateMitRecords(
        normalizedRecords
      );

    return {
      source:
        SOURCE_NAME,

      success: true,

      records:
        validRecords,

      rawCount:
        rawRecords.length,

      normalizedCount:
        validRecords.length,

      sourceUrl:
        pdfUrl,

      fetchedAt,

      message:
        validRecords.length
          ? null
          : "PDF imefunguka lakini hakuna price rows zilizopatikana.",
    };
  } catch (error) {
    console.error(
      "[MIT] Fetch error:",
      error.message
    );

    return {
      source:
        SOURCE_NAME,

      success: false,

      records: [],

      rawCount: 0,

      normalizedCount: 0,

      sourceUrl:
        pdfUrl,

      fetchedAt,

      message:
        error.message,
    };
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  fetchMitPrices,

  fetchMitPdfText,

  downloadMitPdf,

  extractMitPdfText,

  parseMitText,

  normalizeMitRecord,

  normalizeMitRecords,

  validateMitRecords,

  extractReportDate,

  detectReportUnit,
};