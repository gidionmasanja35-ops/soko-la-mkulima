// ============================================================
// SOKO LA MKULIMA
// AUTOMATIC PRICE SYNC
//
// Sources:
//   - MOA
//   - TanTrade
//   - MIT
//   - RATIN
//
// Flow:
//
// Sources
//    ↓
// Price Aggregator
//    ↓
// price-sync.js
//    ↓
// bei_mazao
//
// IMPORTANT:
//
// bei_mazao INAHIFADHI HISTORY.
//
// Unique identity:
//
// source + zao + mkoa + data_date
//
// Therefore:
//
// MOA + mahindi + Dar + 2026-10-02
// MIT + mahindi + Dar + 2026-08-24
// TanTrade + mahindi + Dar + 2026-04-29
//
// zinaweza kuwepo zote.
//
// ============================================================

require("dotenv").config();

const { Pool } = require("pg");

const { aggregatePrices } = require("./price-sources/price-aggregator");

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
// CLEAN TEXT
// ============================================================

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().replace(/\s+/g, " ");
}

// ============================================================
// CLEAN NUMBER
// ============================================================

function cleanNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
}

// ============================================================
// NORMALIZE UNIT
// ============================================================

function normalizeUnit(unit) {
  const value = cleanText(unit).toLowerCase();

  if (!value) {
    return "kg";
  }

  if (value === "kg" || value === "kgs" || value.includes("kilogram")) {
    return "kg";
  }

  if (value === "100kg" || value === "100 kg" || value.includes("100kg")) {
    return "100kg";
  }

  if (value === "ton" || value === "tonne" || value === "tonnes") {
    return "ton";
  }

  if (value === "quintal") {
    return "quintal";
  }

  if (value === "g" || value === "gram" || value === "grams") {
    return "g";
  }

  if (value === "gunia") {
    return "gunia";
  }

  if (value === "bag") {
    return "bag";
  }

  return value;
}

// ============================================================
// GET DATA DATE
// ============================================================

function getDataDate(record) {
  if (record.dataDate) {
    return String(record.dataDate).split("T")[0];
  }

  if (record.data_date) {
    return String(record.data_date).split("T")[0];
  }

  if (record.tarehe) {
    return String(record.tarehe).split("T")[0];
  }

  return new Date().toISOString().split("T")[0];
}

// ============================================================
// GET PRICE
// ============================================================

function getPrice(record) {
  return cleanNumber(
    record.price ??
      record.bei ??
      record.pricePerKg ??
      record.price_per_kg ??
      record.kgEquivalent,
  );
}

// ============================================================
// GET CROP NAME
// ============================================================

function getCropName(record) {
  return cleanText(
    record.cropName ?? record.crop_name ?? record.zao ?? record.cropId,
  );
}

// ============================================================
// GET REGION NAME
// ============================================================

function getRegionName(record) {
  return cleanText(record.regionName ?? record.region_name ?? record.mkoa);
}

// ============================================================
// GET SOURCE
// ============================================================

function getSource(record) {
  return cleanText(
    record.source ?? record.sourceName ?? "Government Market Data",
  );
}

// ============================================================
// GET SOURCE URL
// ============================================================

function getSourceUrl(record) {
  return cleanText(record.sourceUrl ?? record.source_url ?? "");
}

// ============================================================
// GET PRICE PER KG
// ============================================================
//
// Aggregator ikitoa pricePerKg / kgEquivalent,
// tunaitumia moja kwa moja.
//
// Hatubuni conversion kama unit haijulikani.
//
// ============================================================

function getPricePerKg(record) {
  const kgEquivalent = cleanNumber(
    record.kgEquivalent ?? record.pricePerKg ?? record.price_per_kg,
  );

  if (kgEquivalent) {
    return kgEquivalent;
  }

  const price = getPrice(record);

  if (!price) {
    return null;
  }

  const unit = normalizeUnit(record.unit);

  // ----------------------------------------------------------
  // KG
  // ----------------------------------------------------------

  if (unit === "kg") {
    return price;
  }

  // ----------------------------------------------------------
  // 100 KG
  // ----------------------------------------------------------

  if (unit === "100kg" || unit === "quintal") {
    return Number((price / 100).toFixed(2));
  }

  // ----------------------------------------------------------
  // TON
  // ----------------------------------------------------------

  if (unit === "ton") {
    return Number((price / 1000).toFixed(2));
  }

  // ----------------------------------------------------------
  // GRAM
  // ----------------------------------------------------------

  if (unit === "g") {
    return Number((price * 1000).toFixed(2));
  }

  // ----------------------------------------------------------
  // UNKNOWN UNIT
  //
  // Don't invent conversion.
  // ----------------------------------------------------------

  return null;
}

// ============================================================
// ENSURE DATABASE COLUMNS
// ============================================================

async function ensurePriceColumns() {
  await pool.query(`
    ALTER TABLE IF EXISTS bei_mazao

    ADD COLUMN IF NOT EXISTS
      unit VARCHAR(20)
      DEFAULT 'kg';
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS bei_mazao

    ADD COLUMN IF NOT EXISTS
      source TEXT
      DEFAULT 'Government Market Data';
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS bei_mazao

    ADD COLUMN IF NOT EXISTS
      source_url TEXT;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS bei_mazao

    ADD COLUMN IF NOT EXISTS
      data_date DATE;
  `);

  await pool.query(`
    ALTER TABLE IF EXISTS bei_mazao

    ADD COLUMN IF NOT EXISTS
      updated_at TIMESTAMP
      DEFAULT NOW();
  `);
}

// ============================================================
// SAVE ONE PRICE
// ============================================================
//
// IMPORTANT:
//
// HATUFANYI:
//
// SELECT crop + region
// UPDATE existing row
//
// Kwa sababu hiyo inaweza ku-overwrite source nyingine.
//
// Tunatumia:
//
// source + zao + mkoa + data_date
//
// ============================================================

async function savePrice(record) {
  const zao = getCropName(record);

  const mkoa = getRegionName(record);

  const bei = getPricePerKg(record);

  const source = getSource(record);

  const sourceUrl = getSourceUrl(record);

  const dataDate = getDataDate(record);

  // ----------------------------------------------------------
  // VALIDATION
  // ----------------------------------------------------------

  if (!zao) {
    return {
      saved: false,
      reason: "missing_crop",
    };
  }

  if (!mkoa) {
    return {
      saved: false,
      reason: "missing_region",
    };
  }

  if (!bei) {
    return {
      saved: false,
      reason: "missing_price",
    };
  }

  if (!source) {
    return {
      saved: false,
      reason: "missing_source",
    };
  }

  // ----------------------------------------------------------
  // DATABASE UPSERT
  // ----------------------------------------------------------

  await pool.query(
    `
    INSERT INTO bei_mazao
    (
      zao,
      mkoa,
      bei,
      tarehe,
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
      $4::date,
      'kg',
      $5,
      $6,
      $4::date,
      NOW()
    )

  ON CONFLICT
(
  LOWER(TRIM(source)),
  LOWER(TRIM(zao)),
  LOWER(TRIM(mkoa)),
  data_date
)

    DO UPDATE SET

      bei =
        EXCLUDED.bei,

      tarehe =
        EXCLUDED.tarehe,

      unit =
        EXCLUDED.unit,

      source_url =
        EXCLUDED.source_url,

      updated_at =
        NOW()
    `,

    [zao, mkoa, bei, dataDate, source, sourceUrl || null],
  );

  return {
    saved: true,

    action: "upserted",
  };
}

// ============================================================
// SYNC AGGREGATED PRICES
// ============================================================

async function syncPricesToDatabase() {
  console.log("");

  console.log("============================================================");

  console.log("SOKO LA MKULIMA - DATABASE PRICE SYNC");

  console.log("============================================================");

  console.log("");

  try {
    // --------------------------------------------------------
    // 1. Ensure columns
    // --------------------------------------------------------

    console.log("[DB] Checking bei_mazao columns...");

    await ensurePriceColumns();

    console.log("[DB] bei_mazao iko tayari.");

    // --------------------------------------------------------
    // 2. Run aggregator
    // --------------------------------------------------------

    console.log("");

    console.log("[AGGREGATOR] Starting...");

    const result = await aggregatePrices();

    if (!result) {
      throw new Error("Price aggregator returned no result.");
    }

    // --------------------------------------------------------
    // 3. Get final records
    // --------------------------------------------------------

    const records =
      result.records ?? result.aggregatedRecords ?? result.prices ?? [];

    if (!Array.isArray(records)) {
      throw new Error(
        "Price aggregator did not return an array of final records.",
      );
    }

    console.log(`[AGGREGATOR] Final records received: ${records.length}`);

    if (records.length === 0) {
      console.log("[SYNC] Hakuna price records zilizopatikana.");

      return {
        success: false,

        inserted: 0,

        updated: 0,

        skipped: 0,
      };
    }

    // --------------------------------------------------------
    // 4. SAVE RECORDS
    // --------------------------------------------------------

    let inserted = 0;

    let updated = 0;

    let skipped = 0;

    const skipReasons = {};

    for (const record of records) {
      try {
        const saveResult = await savePrice(record);

        if (!saveResult.saved) {
          skipped++;

          skipReasons[saveResult.reason] =
            (skipReasons[saveResult.reason] || 0) + 1;

          continue;
        }

        if (saveResult.action === "upserted") {
          updated++;
        }
      } catch (error) {
        skipped++;

        console.error("[SYNC] Failed to save record:", {
          crop: getCropName(record),

          region: getRegionName(record),

          source: getSource(record),

          error: error.message,
        });
      }
    }

    // --------------------------------------------------------
    // 5. SUMMARY
    // --------------------------------------------------------

    console.log("");

    console.log("============================================================");

    console.log("PRICE DATABASE SYNC COMPLETE");

    console.log("============================================================");

    console.log(`Final records: ${records.length}`);

    console.log(`Inserted:      ${inserted}`);

    console.log(`Updated:       ${updated}`);

    console.log(`Skipped:       ${skipped}`);

    if (Object.keys(skipReasons).length > 0) {
      console.log("");

      console.log("Skip reasons:");

      console.log(skipReasons);
    }

    console.log("============================================================");

    console.log("");

    return {
      success: true,

      inserted,

      updated,

      skipped,

      finalRecords: records.length,

      skipReasons,
    };
  } catch (error) {
    console.error("");

    console.error("❌ PRICE DATABASE SYNC FAILED");

    console.error(error.message);

    console.error("");

    return {
      success: false,

      inserted: 0,

      updated: 0,

      skipped: 0,

      error: error.message,
    };
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  syncPricesToDatabase,
};

// ============================================================
// DIRECT RUN
//
// Run:
//
// node price-sync.js
//
// ============================================================

if (require.main === module) {
  syncPricesToDatabase()
    .then(async (result) => {
      console.log("Sync result:");

      console.log(result);

      await pool.end();

      if (!result.success) {
        process.exitCode = 1;
      }
    })

    .catch(async (error) => {
      console.error(error);

      await pool.end();

      process.exitCode = 1;
    });
}
