const axios = require("axios");
const { PDFParse } = require("pdf-parse");

const { matchRegion } = require("./region-matcher");
const { normalizeUnitName } = require("./unit-converter");

const SOURCE_NAME = "TanTrade";

const TANTRADE_PRICE_PAGE =
  "https://www.tantrade.go.tz/business-information/PRICE+DETAILS+APRIL";

const DEFAULT_PDF_URL =
  process.env.TANTRADE_PDF_URL || null;

// ============================================================
// TANTRADE REPORT CROP ORDER
// ============================================================
//
// Current TanTrade report structure:
//
// 1. Maize (Mahindi)
// 2. Rice (Mchele)
// 3. Sorghum (Mtama)
// 4. Bulrush Millet (Uwele)
// 5. Finger Millet (Ulezi)
// 6. Wheat Grain (Ngano)
// 7. Beans (Maharage)
// 8. Irish Potatoes (Viazi Mviringo)
//
// Each crop has:
// Min Price + Max Price
//
// IMPORTANT:
// The current PDF extraction puts the crop header AFTER
// many market rows, therefore we use the report column order
// instead of requiring a crop heading before every row.
// ============================================================

const TANTRADE_REPORT_CROPS = [
  {
    cropId: "mahindi",
    cropName: "Mahindi",
    aliases: [
      "maize",
      "maize grain",
      "mahindi",
    ],
  },
  {
    cropId: "mchele",
    cropName: "Mchele",
    aliases: [
      "rice",
      "rice grain",
      "mchele",
    ],
  },
  {
    cropId: "mtama",
    cropName: "Mtama",
    aliases: [
      "sorghum",
      "mtama",
    ],
  },
  {
    cropId: "uwele",
    cropName: "Uwele",
    aliases: [
      "bulrush millet",
      "bulrush",
      "uwele",
    ],
  },
  {
    cropId: "ulezi",
    cropName: "Ulezi",
    aliases: [
      "finger millet",
      "ulezi",
    ],
  },
  {
    cropId: "ngano",
    cropName: "Ngano",
    aliases: [
      "wheat grain",
      "wheat",
      "ngano",
    ],
  },
  {
    cropId: "maharage",
    cropName: "Maharage",
    aliases: [
      "beans",
      "bean",
      "maharage",
    ],
  },
  {
    cropId: "viazi mbatata",
    cropName: "Viazi Mbatata",
    aliases: [
      "irish potatoes",
      "irish potato",
      "potatoes",
      "potato",
      "viazi mviringo",
      "viazi mbatata",
    ],
  },
];

// ============================================================
// TANZANIA REGION ALIASES
// ============================================================

const REGION_ALIASES = [
  {
    id: "dar_es_salaam",
    name: "Dar es Salaam",
    aliases: [
      "Dar es Salaam",
      "Dar es Saalam",
      "Dar es salaam",
      "Dar es saalam",
    ],
  },
  {
    id: "kilimanjaro",
    name: "Kilimanjaro",
    aliases: ["Kilimanjaro"],
  },
  {
    id: "singida",
    name: "Singida",
    aliases: ["Singida"],
  },
  {
    id: "arusha",
    name: "Arusha",
    aliases: ["Arusha"],
  },
  {
    id: "dodoma",
    name: "Dodoma",
    aliases: ["Dodoma"],
  },
  {
    id: "morogoro",
    name: "Morogoro",
    aliases: ["Morogoro"],
  },
  {
    id: "mtwara",
    name: "Mtwara",
    aliases: ["Mtwara"],
  },
  {
    id: "lindi",
    name: "Lindi",
    aliases: ["Lindi"],
  },
  {
    id: "iringa",
    name: "Iringa",
    aliases: ["Iringa"],
  },
  {
    id: "mara",
    name: "Mara",
    aliases: ["Mara"],
  },
  {
    id: "tanga",
    name: "Tanga",
    aliases: ["Tanga"],
  },
  {
    id: "songwe",
    name: "Songwe",
    aliases: ["Songwe"],
  },
  {
    id: "tabora",
    name: "Tabora",
    aliases: ["Tabora"],
  },
  {
    id: "geita",
    name: "Geita",
    aliases: ["Geita"],
  },
  {
    id: "kagera",
    name: "Kagera",
    aliases: ["Kagera"],
  },
  {
    id: "katavi",
    name: "Katavi",
    aliases: ["Katavi"],
  },
  {
    id: "manyara",
    name: "Manyara",
    aliases: ["Manyara"],
  },
  {
    id: "mbeya",
    name: "Mbeya",
    aliases: ["Mbeya"],
  },
  {
    id: "ruvuma",
    name: "Ruvuma",
    aliases: ["Ruvuma"],
  },
  {
    id: "shinyanga",
    name: "Shinyanga",
    aliases: ["Shinyanga"],
  },
  {
    id: "mwanza",
    name: "Mwanza",
    aliases: ["Mwanza"],
  },
  {
    id: "pwani",
    name: "Pwani",
    aliases: ["Pwani"],
  },
  {
    id: "simiyu",
    name: "Simiyu",
    aliases: ["Simiyu"],
  },
  {
    id: "kigoma",
    name: "Kigoma",
    aliases: ["Kigoma"],
  },
  {
    id: "njombe",
    name: "Njombe",
    aliases: ["Njombe"],
  },
  {
    id: "rukwa",
    name: "Rukwa",
    aliases: ["Rukwa"],
  },
];

// ============================================================
// TEXT HELPERS
// ============================================================

function cleanPdfText(text) {
  if (!text) {
    return "";
  }

  return String(text)
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeText(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[()]/g, "")
    .trim();
}

// ============================================================
// NUMBER HELPERS
// ============================================================

function parseNumber(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  let text = String(value)
    .trim();

  if (!text) {
    return null;
  }

  text = text
    .replace(/,/g, "")
    .replace(/\s+/g, "");

  const number = Number(text);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}

function isNA(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return true;
  }

  const text = String(value)
    .trim()
    .toLowerCase();

  return (
    text === "" ||
    text === "na" ||
    text === "n/a" ||
    text === "-" ||
    text === "--" ||
    text === "—"
  );
}

// ============================================================
// PRICE TOKEN EXTRACTION
// ============================================================
//
// IMPORTANT:
// We include NA because a TanTrade row can contain:
//
// 16 price positions
//
// where some positions are:
//
// NA NA
//
// The old parser only counted numbers and therefore lost
// the correct column positions.
// ============================================================

function extractPriceTokens(text) {
  if (!text) {
    return [];
  }

  const matches = String(text).match(
    /NA|N\/A|--|—|(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/gi
  );

  if (!matches) {
    return [];
  }

  return matches.map((value) => {
    if (isNA(value)) {
      return null;
    }

    return parseNumber(value);
  });
}

// ============================================================
// REGION MATCHING
// ============================================================

function findRegionInText(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return null;
  }

  let best = null;

  for (const region of REGION_ALIASES) {
    for (const alias of region.aliases) {
      const index = normalized
        .toLowerCase()
        .indexOf(alias.toLowerCase());

      if (index === -1) {
        continue;
      }

      if (
        !best ||
        index < best.index ||
        alias.length > best.alias.length
      ) {
        best = {
          region,
          alias,
          index,
        };
      }
    }
  }

  if (!best) {
    return null;
  }

  let matched = null;

  try {
    matched = matchRegion(best.alias);
  } catch (error) {
    matched = null;
  }

  if (
    matched &&
    matched.matched
  ) {
    return {
      regionId:
        matched.regionId ||
        best.region.id,

      regionName:
        matched.regionName ||
        best.region.name,

      alias: best.alias,

      index: best.index,
    };
  }

  return {
    regionId: best.region.id,
    regionName: best.region.name,
    alias: best.alias,
    index: best.index,
  };
}

// ============================================================
// MARKET EXTRACTION
// ============================================================

function extractMarketFromRow(
  rowText,
  regionInfo
) {
  if (
    !rowText ||
    !regionInfo
  ) {
    return null;
  }

  const afterRegion =
    rowText
      .slice(
        regionInfo.index +
          regionInfo.alias.length
      )
      .trim();

  if (!afterRegion) {
    return null;
  }

  // Find the first price/NA token.
  const priceStart =
    afterRegion.search(
      /NA|N\/A|--|—|(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/i
    );

  let market;

  if (priceStart >= 0) {
    market =
      afterRegion
        .slice(0, priceStart)
        .trim();
  } else {
    market = afterRegion;
  }

  return (
    market
      .replace(/\s+/g, " ")
      .trim() || null
  );
}

// ============================================================
// REPORT DATE
// ============================================================

function extractReportDate(text) {
  if (!text) {
    return null;
  }

  const normalized =
    normalizeText(text);

  // Swahili month names.
  const months = {
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

  const swahiliMatch =
    normalized.match(
      /(\d{1,2})\s+([A-Za-z]+)[,\s]+(20\d{2})/i
    );

  if (swahiliMatch) {
    const day =
      String(
        swahiliMatch[1]
      ).padStart(2, "0");

    const monthName =
      swahiliMatch[2]
        .toLowerCase();

    const year =
      swahiliMatch[3];

    if (months[monthName]) {
      return `${year}-${months[monthName]}-${day}`;
    }
  }

  // English month names.
  const englishMonths = {
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

  const englishMatch =
    normalized.match(
      /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)[,\s]+(20\d{2})/i
    );

  if (englishMatch) {
    const day =
      String(
        englishMatch[1]
      ).padStart(2, "0");

    const monthName =
      englishMatch[2]
        .toLowerCase();

    const year =
      englishMatch[3];

    if (
      englishMonths[
        monthName
      ]
    ) {
      return (
        `${year}-` +
        `${englishMonths[monthName]}-` +
        `${day}`
      );
    }
  }

  // ISO date fallback.
  const isoMatch =
    normalized.match(
      /\b(20\d{2})-(\d{2})-(\d{2})\b/
    );

  if (isoMatch) {
    return isoMatch[0];
  }

  return null;
}

// ============================================================
// REPORT UNIT
// ============================================================

function detectReportUnit(text) {
  const normalized =
    normalizeText(text)
      .toLowerCase();

  // TanTrade current report:
  // TZS / KILO 100
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
    normalized.includes(
      "ton"
    )
  ) {
    return "ton";
  }

  if (
    normalized.includes(
      "kg"
    )
  ) {
    return "kg";
  }

  return "unknown";
}

// ============================================================
// CREATE PRICE RECORD
// ============================================================
//
// TanTrade gives a Min/Max range.
//
// We keep:
//   minPrice
//   maxPrice
//
// and use the midpoint as `price`.
//
// This is explicitly marked:
//   wholesale_range_midpoint
// ============================================================

function createPriceRecord({
  crop,
  region,
  market,
  minPrice,
  maxPrice,
  unit,
  dataDate,
}) {
  if (!crop) {
    return null;
  }

  if (!region) {
    return null;
  }

  const hasMin =
    Number.isFinite(
      Number(minPrice)
    );

  const hasMax =
    Number.isFinite(
      Number(maxPrice)
    );

  if (
    !hasMin &&
    !hasMax
  ) {
    return null;
  }

  let price = null;

  if (
    hasMin &&
    hasMax
  ) {
    price =
      Number(
        (
          (
            Number(minPrice) +
            Number(maxPrice)
          ) / 2
        ).toFixed(2)
      );
  } else if (hasMin) {
    price =
      Number(minPrice);
  } else {
    price =
      Number(maxPrice);
  }

  return {
    source: SOURCE_NAME,

    cropId:
      crop.cropId,

    cropName:
      crop.cropName,

    regionId:
      region.regionId,

    regionName:
      region.regionName,

    market:
      market || null,

    price,

    minPrice:
      hasMin
        ? Number(minPrice)
        : null,

    maxPrice:
      hasMax
        ? Number(maxPrice)
        : null,

    unit:
      normalizeUnitName(unit),

    priceType:
      "wholesale_range_midpoint",

    dataDate:
      dataDate || null,

    sourceUrl:
      DEFAULT_PDF_URL ||
      TANTRADE_PRICE_PAGE,

    updatedAt:
      new Date().toISOString(),
  };
}

// ============================================================
// DOWNLOAD PDF
// ============================================================

async function downloadTantradePdf(
  pdfUrl
) {
  if (!pdfUrl) {
    throw new Error(
      "TANTRADE_PDF_URL haijawekwa."
    );
  }

  const response =
    await axios.get(
      pdfUrl,
      {
        responseType:
          "arraybuffer",

        timeout:
          60000,

        headers: {
          Accept:
            "application/pdf",

          "User-Agent":
            "Soko-la-Mkulima-Price-Sync/1.0",
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

async function extractPdfText(
  buffer
) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error(
      "PDF buffer si valid."
    );
  }

  const parser =
    new PDFParse({
      data: buffer,
    });

  try {
    const result =
      await parser.getText();

    return cleanPdfText(
      result.text || ""
    );
  } finally {
    await parser.destroy();
  }
}

// ============================================================
// FETCH PDF TEXT
// ============================================================

async function fetchTantradePdfText(
  pdfUrl = DEFAULT_PDF_URL
) {
  const buffer =
    await downloadTantradePdf(
      pdfUrl
    );

  const text =
    await extractPdfText(
      buffer
    );

  return {
    text,
    pdfUrl,
  };
}

// ============================================================
// PARSE SINGLE ROW
// ============================================================
//
// Expected logical row:
//
// Dar es salaam Ilala
// 90,000 100,000
// 230,000 300,000
// ...
//
// PDF extraction can split it into:
//
// Dar es
// salaam Ilala 90,000 ...
//
// or:
//
// Geita Nyankumb
// u 95,000 ...
//
// Therefore this function works on a reconstructed row.
// ============================================================

function parseTantradeRow(
  rowText,
  dataDate,
  unit = "unknown",
  cropColumns = TANTRADE_REPORT_CROPS
) {
  if (!rowText) {
    return [];
  }

  const text =
    normalizeText(rowText);

  const region =
    findRegionInText(text);

  if (!region) {
    return [];
  }

  const market =
    extractMarketFromRow(
      text,
      region
    );

  const values =
    extractPriceTokens(text);

  // Current report has 8 crops x 2 prices = 16 positions.
  if (values.length < 16) {
    return [];
  }

  const records = [];

  for (
    let i = 0;
    i < cropColumns.length;
    i++
  ) {
    const crop =
      cropColumns[i];

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
        crop,
        region,
        market,
        minPrice,
        maxPrice,
        unit,
        dataDate,
      });

    if (record) {
      records.push(record);
    }
  }

  return records;
}

// ============================================================
// FIND REGION START INSIDE EXTRACTED PDF LINE
// ============================================================
//
// This is important for lines such as:
//
// Maize (Mahindi) ... Beans (Maharage) Mbeya Igawilo/Sow
//
// We discard the header part and start the row at Mbeya.
// ============================================================

function extractRegionStart(line) {
  const text =
    normalizeText(line);

  const region =
    findRegionInText(text);

  if (!region) {
    return null;
  }

  return {
    text:
      text.slice(
        region.index
      ),

    region,
  };
}

// ============================================================
// PARSE TANTRADE TEXT
// ============================================================
//
// IMPORTANT DIFFERENCE FROM OLD VERSION:
//
// OLD:
//
// crop heading
// ↓
// rows
//
// CURRENT PDF:
//
// rows
// ↓
// crop header
//
// Therefore we do NOT depend on currentCrop.
//
// We reconstruct each market row and map its 16 price
// positions against TANTRADE_REPORT_CROPS.
// ============================================================

function parseTantradeText(
  text,
  dataDate = null
) {
  const cleaned =
    cleanPdfText(text);

  if (!cleaned) {
    return [];
  }

  const lines =
    cleaned
      .split("\n")
      .map((line) =>
        line.trim()
      )
      .filter(Boolean);

  const detectedDate =
    dataDate ||
    extractReportDate(
      cleaned
    );

  const detectedUnit =
    detectReportUnit(
      cleaned
    );

  const records = [];

  let buffer = "";

  for (const originalLine of lines) {
    const line =
      normalizeText(
        originalLine
      );

    if (!line) {
      continue;
    }

    // --------------------------------------------------------
    // If this line contains a region, start/restart the row
    // from the region.
    // --------------------------------------------------------

    const regionStart =
      extractRegionStart(
        line
      );

    if (regionStart) {
      // If the existing buffer already has a complete row,
      // parse it before starting the next row.
      const existingValues =
        extractPriceTokens(
          buffer
        );

      if (
        buffer &&
        existingValues.length >= 16
      ) {
        const rowRecords =
          parseTantradeRow(
            buffer,
            detectedDate,
            detectedUnit
          );

        records.push(
          ...rowRecords
        );

        buffer = "";
      }

      // Start a fresh row exactly at the region.
      buffer =
        regionStart.text;
    } else {
      // Continue an incomplete row.
      if (buffer) {
        buffer +=
          " " + line;
      } else {
        // This could be the first half of a split region,
        // e.g. "Dar es".
        buffer = line;
      }
    }

    // --------------------------------------------------------
    // Check whether the logical row is complete.
    // --------------------------------------------------------

    const values =
      extractPriceTokens(
        buffer
      );

    if (values.length >= 16) {
      const rowRecords =
        parseTantradeRow(
          buffer,
          detectedDate,
          detectedUnit
        );

      if (rowRecords.length) {
        records.push(
          ...rowRecords
        );
      }

      buffer = "";
    }
  }

  // ----------------------------------------------------------
  // Parse final buffered row if any.
  // ----------------------------------------------------------

  if (buffer) {
    const values =
      extractPriceTokens(
        buffer
      );

    if (values.length >= 16) {
      const rowRecords =
        parseTantradeRow(
          buffer,
          detectedDate,
          detectedUnit
        );

      records.push(
        ...rowRecords
      );
    }
  }

  return records;
}

// ============================================================
// VALIDATION
// ============================================================

function validateTantradeRecords(
  records
) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.filter(
    (record) => {
      if (!record) {
        return false;
      }

      if (!record.cropId) {
        return false;
      }

      if (!record.regionId) {
        return false;
      }

      if (
        !Number.isFinite(
          Number(record.price)
        )
      ) {
        return false;
      }

      if (
        !record.unit ||
        record.unit === "unknown"
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

async function fetchTantradePrices(
  options = {}
) {
  const pdfUrl =
    options.pdfUrl ||
    DEFAULT_PDF_URL;

  if (!pdfUrl) {
    return {
      source:
        SOURCE_NAME,

      success:
        false,

      records: [],

      rawCount:
        0,

      normalizedCount:
        0,

      sourceUrl:
        TANTRADE_PRICE_PAGE,

      fetchedAt:
        new Date().toISOString(),

      message:
        "TANTRADE_PDF_URL haijawekwa.",
    };
  }

  try {
    console.log(
      "[TanTrade] Downloading PDF..."
    );

    const {
      text,
    } =
      await fetchTantradePdfText(
        pdfUrl
      );

    console.log(
      "[TanTrade] Extracted text length:",
      text.length
    );

    const dataDate =
      options.dataDate ||
      extractReportDate(
        text
      );

    const unit =
      detectReportUnit(
        text
      );

    console.log(
      "[TanTrade] Detected date:",
      dataDate
    );

    console.log(
      "[TanTrade] Detected unit:",
      unit
    );

    const parsed =
      parseTantradeText(
        text,
        dataDate
      );

    const records =
      validateTantradeRecords(
        parsed
      );

    console.log(
      "[TanTrade] Parsed records:",
      parsed.length
    );

    console.log(
      "[TanTrade] Valid records:",
      records.length
    );

    return {
      source:
        SOURCE_NAME,

      success:
        true,

      records,

      rawCount:
        parsed.length,

      normalizedCount:
        records.length,

      sourceUrl:
        pdfUrl,

      dataDate,

      unit,

      fetchedAt:
        new Date().toISOString(),

      message:
        records.length === 0
          ? "TanTrade PDF ilipakuliwa lakini hakuna records zilizopatikana."
          : null,
    };
  } catch (error) {
    console.error(
      "[TanTrade] ERROR:",
      error.message
    );

    return {
      source:
        SOURCE_NAME,

      success:
        false,

      records: [],

      rawCount:
        0,

      normalizedCount:
        0,

      sourceUrl:
        pdfUrl,

      fetchedAt:
        new Date().toISOString(),

      message:
        error.message ||
        "TanTrade sync failed",
    };
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  SOURCE_NAME,

  TANTRADE_PRICE_PAGE,

  TANTRADE_REPORT_CROPS,

  cleanPdfText,

  normalizeText,

  parseNumber,

  isNA,

  extractPriceTokens,

  extractReportDate,

  detectReportUnit,

  findRegionInText,

  extractMarketFromRow,

  createPriceRecord,

  downloadTantradePdf,

  extractPdfText,

  fetchTantradePdfText,

  parseTantradeRow,

  parseTantradeText,

  validateTantradeRecords,

  fetchTantradePrices,
};