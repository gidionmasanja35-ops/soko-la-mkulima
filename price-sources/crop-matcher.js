const {
  MASTER_CROPS,
  getCropById,
} = require("./master-crops");

/**
 * Normalize crop name before matching.
 *
 * Example:
 * "Irish Potatoes" -> "irish potatoes"
 * "Sorghum Grain"  -> "sorghum grain"
 * "MAIZE"          -> "maize"
 */
function normalizeCropName(value) {
  if (!value) return "";

  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[()]/g, " ")
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Remove common words that do not change the actual crop.
 *
 * Example:
 * "maize grain" -> "maize"
 * "coffee beans" -> "coffee"
 */
function cleanCropName(value) {
  let name = normalizeCropName(value);

  const removableWords = [
    "grain",
    "grains",
    "seed",
    "seeds",
    "bean",
    "beans",
    "fruit",
    "fruits",
    "root",
    "roots",
    "fresh",
    "dry",
    "dried",
    "whole",
    "raw",
    "milled",
    "bulb",
  ];

  const words = name.split(" ");

  const cleaned = words.filter(
    (word) => !removableWords.includes(word)
  );

  return cleaned.join(" ").trim();
}

/**
 * Build searchable aliases for every master crop.
 */
function buildCropIndex() {
  const index = new Map();

  for (const crop of MASTER_CROPS) {
    const values = [
      crop.id,
      crop.name,
      ...(crop.aliases || []),
    ];

    for (const value of values) {
      const normalized = normalizeCropName(value);

      if (normalized) {
        index.set(normalized, crop.id);
      }

      const cleaned = cleanCropName(value);

      if (cleaned) {
        index.set(cleaned, crop.id);
      }
    }
  }

  return index;
}

const CROP_INDEX = buildCropIndex();

/**
 * Exact crop matching.
 *
 * Returns:
 * {
 *   matched: true,
 *   cropId: "mtama",
 *   cropName: "mtama",
 *   confidence: 1,
 *   matchType: "exact"
 * }
 */
function matchExactCrop(sourceName) {
  const normalized = normalizeCropName(sourceName);

  if (!normalized) {
    return null;
  }

  const cropId = CROP_INDEX.get(normalized);

  if (!cropId) {
    return null;
  }

  const crop = getCropById(cropId);

  if (!crop) {
    return null;
  }

  return {
    matched: true,
    cropId: crop.id,
    cropName: crop.name,
    confidence: 1,
    matchType: "exact",
    sourceName,
  };
}

/**
 * Clean-name matching.
 *
 * Example:
 * "Maize Grain" -> "maize"
 * "Sorghum Grain" -> "sorghum"
 */
function matchCleanCrop(sourceName) {
  const cleaned = cleanCropName(sourceName);

  if (!cleaned) {
    return null;
  }

  const cropId = CROP_INDEX.get(cleaned);

  if (!cropId) {
    return null;
  }

  const crop = getCropById(cropId);

  if (!crop) {
    return null;
  }

  return {
    matched: true,
    cropId: crop.id,
    cropName: crop.name,
    confidence: 0.95,
    matchType: "cleaned",
    sourceName,
  };
}

/**
 * Check whether one name contains another.
 *
 * This is deliberately conservative.
 * We do NOT automatically accept every partial match.
 */
function matchPartialCrop(sourceName) {
  const normalized = normalizeCropName(sourceName);

  if (!normalized) {
    return null;
  }

  const possibleMatches = [];

  for (const crop of MASTER_CROPS) {
    const aliases = [
      crop.id,
      crop.name,
      ...(crop.aliases || []),
    ];

    for (const alias of aliases) {
      const normalizedAlias = normalizeCropName(alias);

      if (!normalizedAlias) continue;

      if (
        normalized === normalizedAlias ||
        normalized.includes(` ${normalizedAlias} `) ||
        normalized.startsWith(`${normalizedAlias} `) ||
        normalized.endsWith(` ${normalizedAlias}`)
      ) {
        possibleMatches.push({
          crop,
          alias: normalizedAlias,
        });
      }
    }
  }

  // Remove duplicate crop matches
  const unique = [];

  for (const item of possibleMatches) {
    if (!unique.some((x) => x.crop.id === item.crop.id)) {
      unique.push(item);
    }
  }

  /**
   * Only accept partial matching when exactly
   * one master crop is found.
   *
   * This prevents ambiguous mappings.
   */
  if (unique.length !== 1) {
    return null;
  }

  const crop = unique[0].crop;

  return {
    matched: true,
    cropId: crop.id,
    cropName: crop.name,
    confidence: 0.85,
    matchType: "partial",
    sourceName,
  };
}

/**
 * Main crop matcher.
 *
 * Order:
 * 1. Exact match
 * 2. Cleaned match
 * 3. Conservative partial match
 * 4. No match
 */
function matchCrop(sourceName) {
  if (!sourceName) {
    return {
      matched: false,
      cropId: null,
      cropName: null,
      confidence: 0,
      matchType: "empty",
      sourceName,
    };
  }

  // 1. Exact
  const exact = matchExactCrop(sourceName);

  if (exact) {
    return exact;
  }

  // 2. Cleaned
  const cleaned = matchCleanCrop(sourceName);

  if (cleaned) {
    return cleaned;
  }

  // 3. Conservative partial
  const partial = matchPartialCrop(sourceName);

  if (partial) {
    return partial;
  }

  // 4. No match
  return {
    matched: false,
    cropId: null,
    cropName: null,
    confidence: 0,
    matchType: "unmatched",
    sourceName,
  };
}

/**
 * Match many crop names at once.
 */
function matchCrops(sourceNames = []) {
  if (!Array.isArray(sourceNames)) {
    return [];
  }

  return sourceNames.map((name) => matchCrop(name));
}

/**
 * Return only crops that successfully matched
 * the master catalog.
 */
function filterMatchedCrops(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter((item) => item && item.matched === true);
}

/**
 * Return unmatched crop names.
 *
 * Useful when checking RATIN/TanTrade/MIT data
 * and finding names that need new aliases.
 */
function getUnmatchedCrops(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && item.matched === false)
    .map((item) => item.sourceName)
    .filter(Boolean);
}

module.exports = {
  normalizeCropName,
  cleanCropName,
  matchExactCrop,
  matchCleanCrop,
  matchPartialCrop,
  matchCrop,
  matchCrops,
  filterMatchedCrops,
  getUnmatchedCrops,
};