// price-sources/price-aggregator.js

const { fetchRatinPrices } = require("./ratin");
const { fetchTantradePrices } = require("./tantrade");
const { fetchMitPrices } = require("./mit");
const { fetchMoaPrices } = require("./moa");

const { getMasterCrops, getCropById } = require("./master-crops");

const {
  normalizeUnit,
  canConvertToKg,
  convertToKg,
  convertPrice,
} = require("./unit-converter");

// ============================================================
// CONFIGURATION
// ============================================================

const DEFAULT_SOURCE_PRIORITY = ["MOA", "TanTrade", "MIT", "RATIN"];

const SOURCE_MAX_AGE_DAYS = Number(process.env.PRICE_MAX_AGE_DAYS || 30);

const REQUIRE_KNOWN_UNIT =
  String(process.env.PRICE_REQUIRE_KNOWN_UNIT || "true").toLowerCase() ===
  "true";

const ALLOW_STALE_DATA =
  String(process.env.PRICE_ALLOW_STALE_DATA || "false").toLowerCase() ===
  "true";

// ============================================================
// HELPERS
// ============================================================

function cleanString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeSourceName(source) {
  return cleanString(source).toLowerCase();
}

function getSourcePriority() {
  const configured = cleanString(process.env.PRICE_SOURCE_PRIORITY);

  if (!configured) {
    return DEFAULT_SOURCE_PRIORITY;
  }

  const values = configured
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length ? values : DEFAULT_SOURCE_PRIORITY;
}

function getPriorityScore(source) {
  const priority = getSourcePriority();

  const index = priority.findIndex(
    (item) => normalizeSourceName(item) === normalizeSourceName(source),
  );

  if (index === -1) {
    return 999;
  }

  return index;
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function daysSince(dateValue) {
  const date = parseDate(dateValue);

  if (!date) {
    return Infinity;
  }

  const now = new Date();

  const diff = now.getTime() - date.getTime();

  return diff / (1000 * 60 * 60 * 24);
}

function isFresh(record) {
  if (!record.dataDate) {
    return false;
  }

  const age = daysSince(record.dataDate);

  return age <= SOURCE_MAX_AGE_DAYS;
}

// ============================================================
// PRICE VALIDATION
// ============================================================

function isValidPrice(price) {
  const number = Number(price);

  // Zero is not considered a usable market price.
  // If a source gives 0, treat it as missing/invalid.
  return Number.isFinite(number) && number > 0;
}

// ============================================================
// SOURCE RESULT UNWRAPPER
// ============================================================

/*
  Different source modules may return different formats.

  Example 1:

  [
    { cropId: "mahindi", ... }
  ]

  Example 2:

  {
    success: true,
    records: [
      { cropId: "mahindi", ... }
    ]
  }

  MIT and TanTrade currently use Example 2.

  This function makes the aggregator support both.
*/

function unwrapSourceRecords(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (result && Array.isArray(result.records)) {
    return result.records;
  }

  return [];
}

// ============================================================
// NORMALIZE RECORD
// ============================================================

function normalizeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const cropId = cleanString(record.cropId).toLowerCase();

  const crop = getCropById(cropId);

  // Source crop must exist in master catalog
  if (!crop) {
    return null;
  }

  const source = cleanString(record.source);

  if (!source) {
    return null;
  }

  const price = Number(record.price);

  if (!isValidPrice(price)) {
    return null;
  }

  const unit = normalizeUnit(record.unit || "unknown");

  /*
    We do not silently assume a unit.
  */

  if (REQUIRE_KNOWN_UNIT && !canConvertToKg(unit)) {
    return null;
  }

  const dataDate = record.dataDate || null;

  const regionId = cleanString(record.regionId || record.regionName)
    .toLowerCase()
    .replace(/\s+/g, "_");

  const regionName = cleanString(record.regionName || record.regionId);

  const market = cleanString(record.market) || null;

  const priceType = cleanString(record.priceType) || null;

  const minPrice = isValidPrice(record.minPrice)
    ? Number(record.minPrice)
    : null;

  const maxPrice = isValidPrice(record.maxPrice)
    ? Number(record.maxPrice)
    : null;

  const normalized = {
    source,

    cropId: crop.id,

    cropName: crop.name,

    regionId,

    regionName,

    market,

    price,

    minPrice,

    maxPrice,

    unit,

    priceType,

    dataDate,

    sourceUrl: record.sourceUrl || null,

    updatedAt: record.updatedAt || new Date().toISOString(),

    fresh: isFresh({
      dataDate,
    }),

    sourcePriority: getPriorityScore(source),

    raw: record.raw || null,
  };

  return normalized;
}

// ============================================================
// NORMALIZE ALL RECORDS
// ============================================================

function normalizeRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map(normalizeRecord).filter(Boolean);
}

// ============================================================
// GROUP KEY
// ============================================================

function makeGroupKey(record) {
  const crop = cleanString(record.cropId).toLowerCase();

  const region = cleanString(record.regionId).toLowerCase();

  const market = cleanString(record.market).toLowerCase();

  return [crop, region, market].join("|");
}

// ============================================================
// SOURCE MATCH SCORE
// ============================================================

function calculateRecordScore(record) {
  let score = 0;

  // ----------------------------------------------------------
  // 1. Source priority
  // ----------------------------------------------------------

  const priority = Number(record.sourcePriority);

  if (Number.isFinite(priority)) {
    score += priority * 10;
  } else {
    score += 1000;
  }

  // ----------------------------------------------------------
  // 2. Freshness
  // ----------------------------------------------------------

  if (record.fresh) {
    score -= 30;
  } else {
    score += 30;
  }

  // ----------------------------------------------------------
  // 3. Exact region
  // ----------------------------------------------------------

  if (record.regionName) {
    score -= 10;
  }

  // ----------------------------------------------------------
  // 4. Market information
  // ----------------------------------------------------------

  if (record.market) {
    score -= 5;
  }

  // ----------------------------------------------------------
  // 5. Known unit
  // ----------------------------------------------------------

  if (record.unit && record.unit !== "unknown") {
    score -= 10;
  }

  // ----------------------------------------------------------
  // 6. Price type
  // ----------------------------------------------------------

  if (record.priceType) {
    score -= 2;
  }

  // Lower score = better candidate

  return score;
}

// ============================================================
// SELECT BEST RECORD
// ============================================================
// ============================================================
// SELECT BEST RECORD
// ============================================================

function selectBestRecord(records) {
  if (!Array.isArray(records) || !records.length) {
    return null;
  }

  // ----------------------------------------------------------
  // 1. Validate all records
  // ----------------------------------------------------------

  const validRecords = records
    .filter((record) => {
      // Price must be valid
      if (!isValidPrice(record.price)) {
        return false;
      }

      // Unit must be known when required
      if (REQUIRE_KNOWN_UNIT && !canConvertToKg(record.unit)) {
        return false;
      }

      return true;
    })
    .map((record) => ({
      ...record,

      selectionScore: calculateRecordScore(record),
    }));

  // ----------------------------------------------------------
  // 2. No valid records
  // ----------------------------------------------------------

  if (!validRecords.length) {
    return null;
  }

  // ----------------------------------------------------------
  // 3. Prefer fresh records
  // ----------------------------------------------------------

  const freshRecords = validRecords.filter((record) => record.fresh);

  let candidates = freshRecords.length > 0 ? freshRecords : validRecords;

  // ----------------------------------------------------------
  // 4. Sort records
  // ----------------------------------------------------------
  /*
    IMPORTANT PRIORITY:

    1. Fresh data
    2. Newest dataDate
    3. Better matching/quality score
    4. Source priority

    This means:

    MIT
    24 Aug 2026

    beats

    TanTrade
    29 Apr 2026

    when both records are otherwise valid.

    Source priority is NOT allowed to make
    an older record beat a newer record.
  */

  candidates.sort((a, b) => {
    // --------------------------------------------------------
    // A. Freshness
    // --------------------------------------------------------

    if (Boolean(a.fresh) !== Boolean(b.fresh)) {
      return a.fresh ? -1 : 1;
    }

    // --------------------------------------------------------
    // B. Newest source data
    // --------------------------------------------------------

    const aDate = parseDate(a.dataDate)?.getTime() || 0;

    const bDate = parseDate(b.dataDate)?.getTime() || 0;

    if (aDate !== bDate) {
      return bDate - aDate;
    }

    // --------------------------------------------------------
    // C. Selection / matching quality
    // --------------------------------------------------------

    if (a.selectionScore !== b.selectionScore) {
      return a.selectionScore - b.selectionScore;
    }

    // --------------------------------------------------------
    // D. Source priority
    // --------------------------------------------------------
    /*
      If everything else is equal,
      calculateRecordScore() decides the
      preferred source.
    */

    return 0;
  });

  // ----------------------------------------------------------
  // 5. Select best record
  // ----------------------------------------------------------

  const selected = candidates[0];

  // ----------------------------------------------------------
  // 6. Mark freshness status
  // ----------------------------------------------------------

  return {
    ...selected,

    stale: !selected.fresh,

    dataStatus: selected.fresh ? "fresh" : "stale",
  };
}

// ============================================================
// CONVERT PRICE TO KG
// ============================================================
function addKgEquivalent(record) {
  if (!record) {
    return null;
  }

  // ----------------------------------------------------------
  // 1. Check whether unit is known
  // ----------------------------------------------------------

  if (!record.unit || !canConvertToKg(record.unit)) {
    return {
      ...record,

      pricePerKg: null,

      kgEquivalentAvailable: false,
    };
  }

  // ----------------------------------------------------------
  // 2. Convert PRICE to price per KG
  // ----------------------------------------------------------
  /*
    IMPORTANT:

    convertToKg() is for converting QUANTITY.

    Example:
      convertToKg(5, "100kg")
      => 500 kg

    It must NOT be used to convert price.

    For price we use convertPrice():

      95,000 TZS / 100kg
      => 950 TZS/kg
  */

  const pricePerKg = convertPrice(record.price, record.unit, "kg");

  // ----------------------------------------------------------
  // 3. Validate converted price
  // ----------------------------------------------------------

  if (
    pricePerKg === null ||
    pricePerKg === undefined ||
    !Number.isFinite(Number(pricePerKg))
  ) {
    return {
      ...record,

      pricePerKg: null,

      kgEquivalentAvailable: false,
    };
  }

  // ----------------------------------------------------------
  // 4. Return normalized record
  // ----------------------------------------------------------

  return {
    ...record,

    pricePerKg: Number(pricePerKg),

    kgEquivalentAvailable: true,
  };
}

// ============================================================
// GROUP SOURCE RECORDS
// ============================================================

function groupRecords(records) {
  const groups = new Map();

  for (const record of records) {
    const key = makeGroupKey(record);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(record);
  }

  return groups;
}

// ============================================================
// BUILD AGGREGATED RECORD
// ============================================================

function buildAggregatedRecord(records) {
  if (!records.length) {
    return null;
  }

  const selected = selectBestRecord(records);

  if (!selected) {
    return null;
  }

  const selectedWithKg = addKgEquivalent(selected);

  return {
    cropId: selected.cropId,

    cropName: selected.cropName,

    regionId: selected.regionId,

    regionName: selected.regionName,

    market: selected.market,

    price: selected.price,

    minPrice: selected.minPrice,

    maxPrice: selected.maxPrice,

    unit: selected.unit,

    priceType: selected.priceType,

    dataDate: selected.dataDate,

    source: selected.source,

    sourceUrl: selected.sourceUrl,

    updatedAt: selected.updatedAt,

    pricePerKg: selectedWithKg.pricePerKg,

    kgEquivalentAvailable: selectedWithKg.kgEquivalentAvailable,

    selectionScore: selected.selectionScore,

    availableSources: records.map((record) => ({
      source: record.source,

      price: record.price,

      minPrice: record.minPrice,

      maxPrice: record.maxPrice,

      unit: record.unit,

      priceType: record.priceType,

      dataDate: record.dataDate,

      sourceUrl: record.sourceUrl,

      fresh: record.fresh,
    })),
  };
}

// ============================================================
// FETCH ALL SOURCES
// ============================================================

async function fetchAllSources(options = {}) {
  const results = {
    moa: [],
    ratin: [],
    tantrade: [],
    mit: [],
  };

  try {
    const moa = await fetchMoaPrices(options.moa || {});

    results.moa = unwrapSourceRecords(moa);

    console.log(`[PRICE-AGGREGATOR] MOA records: ${results.moa.length}`);
  } catch (error) {
    console.error("[PRICE-AGGREGATOR] MOA error:", error.message);
  }

  // ----------------------------------------------------------
  // RATIN
  // ----------------------------------------------------------

  try {
    const ratin = await fetchRatinPrices(options.ratin || {});

    results.ratin = unwrapSourceRecords(ratin);

    console.log(`[PRICE-AGGREGATOR] RATIN records: ${results.ratin.length}`);
  } catch (error) {
    console.error("[PRICE-AGGREGATOR] RATIN error:", error.message);
  }

  // ----------------------------------------------------------
  // TANTRADE
  // ----------------------------------------------------------

  try {
    const tantrade = await fetchTantradePrices(options.tantrade || {});

    results.tantrade = unwrapSourceRecords(tantrade);

    console.log(
      `[PRICE-AGGREGATOR] TanTrade records: ${results.tantrade.length}`,
    );
  } catch (error) {
    console.error("[PRICE-AGGREGATOR] TanTrade error:", error.message);
  }

  // ----------------------------------------------------------
  // MIT
  // ----------------------------------------------------------

  try {
    const mit = await fetchMitPrices(options.mit || {});

    results.mit = unwrapSourceRecords(mit);

    console.log(`[PRICE-AGGREGATOR] MIT records: ${results.mit.length}`);
  } catch (error) {
    console.error("[PRICE-AGGREGATOR] MIT error:", error.message);
  }

  return results;
}

// ============================================================
// AGGREGATE ALL SOURCES
// ============================================================

async function aggregatePrices(options = {}) {
  console.log("[PRICE-AGGREGATOR] Starting price aggregation...");

  const masterCrops = getMasterCrops();

  console.log(`[PRICE-AGGREGATOR] Master crops: ${masterCrops.length}`);

  const sourceResults = await fetchAllSources(options);

  // ----------------------------------------------------------
  // Combine all raw records
  // ----------------------------------------------------------

  const allRawRecords = [
    ...sourceResults.moa,
    ...sourceResults.ratin,
    ...sourceResults.tantrade,
    ...sourceResults.mit,
  ];

  console.log(`[PRICE-AGGREGATOR] Raw records: ${allRawRecords.length}`);

  // ----------------------------------------------------------
  // Normalize
  // ----------------------------------------------------------

  const normalizedRecords = normalizeRecords(allRawRecords);

  console.log(
    `[PRICE-AGGREGATOR] Valid normalized records: ${normalizedRecords.length}`,
  );

  // ----------------------------------------------------------
  // Group
  // ----------------------------------------------------------

  const groups = groupRecords(normalizedRecords);

  console.log(`[PRICE-AGGREGATOR] Groups: ${groups.size}`);

  // ----------------------------------------------------------
  // Build final records
  // ----------------------------------------------------------

  const aggregated = [];

  for (const records of groups.values()) {
    const record = buildAggregatedRecord(records);

    if (record) {
      aggregated.push(record);
    }
  }

  console.log(`[PRICE-AGGREGATOR] Final records: ${aggregated.length}`);

  return {
    success: true,

    masterCropCount: masterCrops.length,

    rawRecordCount: allRawRecords.length,

    normalizedRecordCount: normalizedRecords.length,

    groupCount: groups.size,

    aggregatedRecordCount: aggregated.length,

    sources: {
      MOA: sourceResults.moa.length,
      RATIN: sourceResults.ratin.length,
      TanTrade: sourceResults.tantrade.length,
      MIT: sourceResults.mit.length,
    },

    records: aggregated,

    generatedAt: new Date().toISOString(),
  };
}

// ============================================================
// GET PRICES FOR SPECIFIC CROP
// ============================================================

function filterByCrop(records, cropId) {
  if (!cropId) {
    return records;
  }

  const normalized = String(cropId).trim().toLowerCase();

  return records.filter((record) => record.cropId === normalized);
}

// ============================================================
// GET PRICES FOR SPECIFIC REGION
// ============================================================

function filterByRegion(records, regionId) {
  if (!regionId) {
    return records;
  }

  const normalized = String(regionId).trim().toLowerCase();

  return records.filter((record) => record.regionId === normalized);
}

// ============================================================
// SUMMARY
// ============================================================

function getAggregationSummary(records) {
  const summary = {
    total: records.length,

    crops: new Set(),

    regions: new Set(),

    sources: new Set(),
  };

  for (const record of records) {
    if (record.cropId) {
      summary.crops.add(record.cropId);
    }

    if (record.regionId) {
      summary.regions.add(record.regionId);
    }

    if (record.source) {
      summary.sources.add(record.source);
    }
  }

  return {
    total: summary.total,

    uniqueCrops: summary.crops.size,

    uniqueRegions: summary.regions.size,

    sources: [...summary.sources],
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  aggregatePrices,

  fetchAllSources,

  normalizeRecord,
  normalizeRecords,

  groupRecords,
  selectBestRecord,
  buildAggregatedRecord,

  filterByCrop,
  filterByRegion,

  getAggregationSummary,

  getSourcePriority,

  unwrapSourceRecords,
};
