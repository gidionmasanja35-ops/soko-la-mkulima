/**
 * RATIN PRICE SOURCE
 * --------------------------------------------------
 * Responsible for obtaining RATIN market prices and
 * converting them into our internal price format.
 *
 * IMPORTANT:
 * - Do not invent prices.
 * - Do not assume an undocumented API endpoint.
 * - Do not bypass authentication/subscription.
 * - Unmatched crops/regions are rejected.
 */

const axios = require("axios");

const {
  matchCrop,
} = require("./crop-matcher");

const {
  matchRegion,
} = require("./region-matcher");

const {
  normalizeUnitName,
} = require("./unit-converter");

const RATIN_PUBLIC_URL =
  "https://ratin.net/ratinapp/frontend/millerprices.php";

/**
 * RATIN source metadata.
 */
const SOURCE_NAME = "RATIN";

const SOURCE_URL = RATIN_PUBLIC_URL;

/**
 * Create a standard internal price record.
 */
function createPriceRecord({
  crop,
  region,
  market,
  price,
  unit,
  priceType,
  dataDate,
  sourceUrl,
}) {
  return {
    source: SOURCE_NAME,

    cropId: crop.cropId,
    cropName: crop.cropName,

    regionId: region.regionId,
    regionName: region.regionName,

    market: market || null,

    price: Number(price),

    unit: normalizeUnitName(unit),

    priceType: priceType || null,

    dataDate: dataDate || null,

    sourceUrl: sourceUrl || SOURCE_URL,

    updatedAt: new Date().toISOString(),
  };
}

/**
 * Validate a raw RATIN price record.
 *
 * RATIN data should provide:
 * - commodity
 * - country/district
 * - town
 * - price
 * - unit
 * - date
 */
function normalizeRatinRecord(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const sourceCrop =
    raw.commodity ||
    raw.crop ||
    raw.product ||
    "";

  const sourceRegion =
    raw.region ||
    raw.district ||
    raw.countryDistrict ||
    "";

  const market =
    raw.market ||
    raw.town ||
    raw.city ||
    "";

  const price =
    raw.price ??
    raw.priceLocal ??
    raw.localPrice;

  const unit =
    raw.unit ||
    raw.priceUnit ||
    "";

  const priceType =
    raw.priceType ||
    raw.type ||
    null;

  const dataDate =
    raw.date ||
    raw.dataDate ||
    null;

  /**
   * Crop matching.
   */
  const crop = matchCrop(sourceCrop);

  if (!crop.matched) {
    return null;
  }

  /**
   * Region matching.
   */
  const region = matchRegion(sourceRegion);

  if (!region.matched) {
    return null;
  }

  /**
   * Price validation.
   */
  const numericPrice = Number(price);

  if (
    !Number.isFinite(numericPrice) ||
    numericPrice < 0
  ) {
    return null;
  }

  /**
   * Unit must be known.
   */
  const normalizedUnit =
    normalizeUnitName(unit);

  if (normalizedUnit === "unknown") {
    return null;
  }

  return createPriceRecord({
    crop,
    region,
    market,
    price: numericPrice,
    unit: normalizedUnit,
    priceType,
    dataDate,
    sourceUrl:
      raw.sourceUrl || SOURCE_URL,
  });
}

/**
 * Normalize an array of RATIN records.
 */
function normalizeRatinRecords(records = []) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .map(normalizeRatinRecord)
    .filter(Boolean);
}

/**
 * Fetch data from a configured RATIN API.
 *
 * We deliberately require the API URL to be supplied
 * through environment configuration.
 *
 * This prevents us from inventing an API endpoint.
 */
async function fetchFromRatinApi() {
  const apiUrl =
    process.env.RATIN_API_URL;

  if (!apiUrl) {
    return {
      success: false,
      configured: false,
      records: [],
      message:
        "RATIN_API_URL haijawekwa.",
    };
  }

  try {
    const response = await axios.get(
      apiUrl,
      {
        timeout: 30000,

        headers: {
          Accept: "application/json",
        },
      }
    );

    const data = response.data;

    /**
     * Support common API response formats.
     */
    let rawRecords = [];

    if (Array.isArray(data)) {
      rawRecords = data;
    } else if (
      Array.isArray(data.data)
    ) {
      rawRecords = data.data;
    } else if (
      Array.isArray(data.results)
    ) {
      rawRecords = data.results;
    } else if (
      Array.isArray(data.records)
    ) {
      rawRecords = data.records;
    }

    const records =
      normalizeRatinRecords(
        rawRecords
      );

    return {
      success: true,
      configured: true,
      records,
      rawCount: rawRecords.length,
      normalizedCount: records.length,
      message: null,
    };
  } catch (error) {
    return {
      success: false,
      configured: true,
      records: [],
      rawCount: 0,
      normalizedCount: 0,
      message:
        error.message ||
        "RATIN request failed",
    };
  }
}

/**
 * Fetch RATIN prices.
 *
 * This is the public function the aggregator
 * will eventually call.
 */
async function fetchRatinPrices() {
  const result =
    await fetchFromRatinApi();

  return {
    source: SOURCE_NAME,

    sourceUrl: SOURCE_URL,

    success: result.success,

    configured:
      result.configured,

    records:
      result.records,

    rawCount:
      result.rawCount || 0,

    normalizedCount:
      result.normalizedCount || 0,

    message:
      result.message || null,

    fetchedAt:
      new Date().toISOString(),
  };
}

/**
 * Export functions.
 */
module.exports = {
  SOURCE_NAME,
  SOURCE_URL,

  createPriceRecord,

  normalizeRatinRecord,
  normalizeRatinRecords,

  fetchFromRatinApi,
  fetchRatinPrices,
};