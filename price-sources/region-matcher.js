/**
 * REGION MATCHER
 * --------------------------------------------------
 * Converts different region names from RATIN,
 * TanTrade and MIT into one canonical Tanzania
 * region name.
 *
 * Example:
 * "DSM"            -> "Dar es Salaam"
 * "Dar Es Salam"   -> "Dar es Salaam"
 * "Dar-Es-Salaam"  -> "Dar es Salaam"
 * "Dodoma Region"  -> "Dodoma"
 */

const TANZANIA_REGIONS = [
  {
    id: "arusha",
    name: "Arusha",
    aliases: [
      "arusha",
      "arusha region",
      "arusha mjini",
      "arusha city",
    ],
  },

  {
    id: "dar_es_salaam",
    name: "Dar es Salaam",
    aliases: [
      "dar es salaam",
      "dar es salam",
      "dar-es-salaam",
      "dar-es-salam",
      "dar",
      "dsm",
      "dar city",
      "dar es salaam region",
    ],
  },

  {
    id: "dodoma",
    name: "Dodoma",
    aliases: [
      "dodoma",
      "dodoma region",
      "dodoma mjini",
      "dodoma city",
    ],
  },

  {
    id: "geita",
    name: "Geita",
    aliases: [
      "geita",
      "geita region",
    ],
  },

  {
    id: "iringa",
    name: "Iringa",
    aliases: [
      "iringa",
      "iringa region",
      "iringa mjini",
      "iringa city",
    ],
  },

  {
    id: "kagera",
    name: "Kagera",
    aliases: [
      "kagera",
      "kagera region",
      "bukoba",
      "bukoba mjini",
      "bukoba city",
    ],
  },

  {
    id: "katavi",
    name: "Katavi",
    aliases: [
      "katavi",
      "katavi region",
    ],
  },

  {
    id: "kigoma",
    name: "Kigoma",
    aliases: [
      "kigoma",
      "kigoma region",
      "kigoma mjini",
      "kigoma city",
    ],
  },

  {
    id: "kilimanjaro",
    name: "Kilimanjaro",
    aliases: [
      "kilimanjaro",
      "kilimanjaro region",
      "moshi",
      "moshi mjini",
      "moshi city",
    ],
  },

  {
    id: "lindi",
    name: "Lindi",
    aliases: [
      "lindi",
      "lindi region",
      "lindi mjini",
      "lindi city",
    ],
  },

  {
    id: "manyara",
    name: "Manyara",
    aliases: [
      "manyara",
      "manyara region",
      "babati",
      "babati mjini",
      "babati city",
    ],
  },

  {
    id: "mara",
    name: "Mara",
    aliases: [
      "mara",
      "mara region",
      "musoma",
      "musoma mjini",
      "musoma city",
    ],
  },

  {
    id: "mbeya",
    name: "Mbeya",
    aliases: [
      "mbeya",
      "mbeya region",
      "mbeya mjini",
      "mbeya city",
    ],
  },

  {
    id: "morogoro",
    name: "Morogoro",
    aliases: [
      "morogoro",
      "morogoro region",
      "morogoro mjini",
      "morogoro city",
    ],
  },

  {
    id: "mtwara",
    name: "Mtwara",
    aliases: [
      "mtwara",
      "mtwara region",
      "mtwara mjini",
      "mtwara city",
    ],
  },

  {
    id: "mwanza",
    name: "Mwanza",
    aliases: [
      "mwanza",
      "mwanza region",
      "mwanza mjini",
      "mwanza city",
    ],
  },

  {
    id: "njombe",
    name: "Njombe",
    aliases: [
      "njombe",
      "njombe region",
      "njombe mjini",
      "njombe city",
    ],
  },

  {
    id: "pemba_north",
    name: "Pemba North",
    aliases: [
      "pemba north",
      "north pemba",
      "pemba kaskazini",
      "pemba north region",
    ],
  },

  {
    id: "pemba_south",
    name: "Pemba South",
    aliases: [
      "pemba south",
      "south pemba",
      "pemba kusini",
      "pemba south region",
    ],
  },

  {
    id: "pwani",
    name: "Pwani",
    aliases: [
      "pwani",
      "pwani region",
      "coast",
      "coast region",
      "kibaha",
      "kibaha mjini",
      "kibaha city",
    ],
  },

  {
    id: "rukwa",
    name: "Rukwa",
    aliases: [
      "rukwa",
      "rukwa region",
      "sumbawanga",
      "sumbawanga mjini",
      "sumbawanga city",
    ],
  },

  {
    id: "ruvuma",
    name: "Ruvuma",
    aliases: [
      "ruvuma",
      "ruvuma region",
      "songea",
      "songea mjini",
      "songea city",
    ],
  },

  {
    id: "shinyanga",
    name: "Shinyanga",
    aliases: [
      "shinyanga",
      "shinyanga region",
      "shinyanga mjini",
      "shinyanga city",
    ],
  },

  {
    id: "simiyu",
    name: "Simiyu",
    aliases: [
      "simiyu",
      "simiyu region",
      "bariadi",
      "bariadi mjini",
      "bariadi city",
    ],
  },

  {
    id: "singida",
    name: "Singida",
    aliases: [
      "singida",
      "singida region",
      "singida mjini",
      "singida city",
    ],
  },

  {
    id: "songwe",
    name: "Songwe",
    aliases: [
      "songwe",
      "songwe region",
      "tunduma",
      "tunduma mjini",
      "tunduma city",
    ],
  },

  {
    id: "tabora",
    name: "Tabora",
    aliases: [
      "tabora",
      "tabora region",
      "tabora mjini",
      "tabora city",
    ],
  },

  {
    id: "tanga",
    name: "Tanga",
    aliases: [
      "tanga",
      "tanga region",
      "tanga mjini",
      "tanga city",
    ],
  },

  {
    id: "zanzibar_north",
    name: "Zanzibar North",
    aliases: [
      "zanzibar north",
      "north zanzibar",
      "zanzibar kaskazini",
      "zanzibar north region",
    ],
  },

  {
    id: "zanzibar_south",
    name: "Zanzibar South",
    aliases: [
      "zanzibar south",
      "south zanzibar",
      "zanzibar kusini",
      "zanzibar south region",
    ],
  },

  {
    id: "zanzibar_west",
    name: "Zanzibar West",
    aliases: [
      "zanzibar west",
      "west zanzibar",
      "zanzibar mjini",
      "zanzibar magharibi",
      "zanzibar west region",
    ],
  },
];

/**
 * Normalize region name.
 *
 * Example:
 * "DAR-ES-SALAAM" -> "dar es salaam"
 */
function normalizeRegionName(value) {
  if (!value) return "";

  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[()]/g, " ")
    .replace(/[,_/\\-]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Remove common words that are not part of
 * the actual region name.
 */
function cleanRegionName(value) {
  let name = normalizeRegionName(value);

  const removableWords = [
    "region",
    "regions",
    "province",
    "area",
    "zone",
    "municipality",
    "municipal",
    "city",
    "town",
  ];

  const words = name.split(" ");

  const cleaned = words.filter(
    (word) => !removableWords.includes(word)
  );

  return cleaned.join(" ").trim();
}

/**
 * Build region index.
 */
function buildRegionIndex() {
  const index = new Map();

  for (const region of TANZANIA_REGIONS) {
    const values = [
      region.id,
      region.name,
      ...(region.aliases || []),
    ];

    for (const value of values) {
      const normalized = normalizeRegionName(value);

      if (normalized) {
        index.set(normalized, region.id);
      }

      const cleaned = cleanRegionName(value);

      if (cleaned) {
        index.set(cleaned, region.id);
      }
    }
  }

  return index;
}

const REGION_INDEX = buildRegionIndex();

/**
 * Get region by ID.
 */
function getRegionById(id) {
  if (!id) return null;

  const normalized = normalizeRegionName(id);

  return (
    TANZANIA_REGIONS.find(
      (region) =>
        region.id === normalized ||
        normalizeRegionName(region.name) === normalized
    ) || null
  );
}

/**
 * Exact region match.
 */
function matchExactRegion(sourceName) {
  const normalized = normalizeRegionName(sourceName);

  if (!normalized) {
    return null;
  }

  const regionId = REGION_INDEX.get(normalized);

  if (!regionId) {
    return null;
  }

  const region = getRegionById(regionId);

  if (!region) {
    return null;
  }

  return {
    matched: true,
    regionId: region.id,
    regionName: region.name,
    confidence: 1,
    matchType: "exact",
    sourceName,
  };
}

/**
 * Cleaned region match.
 *
 * Example:
 * "Dodoma Region" -> "Dodoma"
 */
function matchCleanRegion(sourceName) {
  const cleaned = cleanRegionName(sourceName);

  if (!cleaned) {
    return null;
  }

  const regionId = REGION_INDEX.get(cleaned);

  if (!regionId) {
    return null;
  }

  const region = getRegionById(regionId);

  if (!region) {
    return null;
  }

  return {
    matched: true,
    regionId: region.id,
    regionName: region.name,
    confidence: 0.95,
    matchType: "cleaned",
    sourceName,
  };
}

/**
 * Main region matcher.
 */
function matchRegion(sourceName) {
  if (!sourceName) {
    return {
      matched: false,
      regionId: null,
      regionName: null,
      confidence: 0,
      matchType: "empty",
      sourceName,
    };
  }

  // 1. Exact match
  const exact = matchExactRegion(sourceName);

  if (exact) {
    return exact;
  }

  // 2. Cleaned match
  const cleaned = matchCleanRegion(sourceName);

  if (cleaned) {
    return cleaned;
  }

  // 3. No match
  return {
    matched: false,
    regionId: null,
    regionName: null,
    confidence: 0,
    matchType: "unmatched",
    sourceName,
  };
}

/**
 * Match many regions.
 */
function matchRegions(sourceNames = []) {
  if (!Array.isArray(sourceNames)) {
    return [];
  }

  return sourceNames.map((name) => matchRegion(name));
}

/**
 * Return only successfully matched regions.
 */
function filterMatchedRegions(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter(
    (item) => item && item.matched === true
  );
}

/**
 * Return unmatched region names.
 */
function getUnmatchedRegions(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter(
      (item) =>
        item && item.matched === false
    )
    .map((item) => item.sourceName)
    .filter(Boolean);
}

/**
 * Get all canonical Tanzania regions.
 */
function getTanzaniaRegions() {
  return TANZANIA_REGIONS;
}

module.exports = {
  TANZANIA_REGIONS,
  normalizeRegionName,
  cleanRegionName,
  getRegionById,
  matchExactRegion,
  matchCleanRegion,
  matchRegion,
  matchRegions,
  filterMatchedRegions,
  getUnmatchedRegions,
  getTanzaniaRegions,
};