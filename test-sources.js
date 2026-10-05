require("dotenv").config();

const { fetchRatinPrices } = require("./price-sources/ratin");
const { fetchTantradePrices } = require("./price-sources/tantrade");
const { fetchMitPrices } = require("./price-sources/mit");

async function main() {
  console.log("");
  console.log("======================================");
  console.log(" SOKO LA MKULIMA - SOURCE TEST");
  console.log("======================================");

  // ==================================================
  // ENVIRONMENT
  // ==================================================

  console.log("");
  console.log("ENV CHECK");
  console.log("--------------------------------------");

  console.log(
    "MIT_PDF_URL:",
    process.env.MIT_PDF_URL || "NOT SET"
  );

  console.log(
    "PRICE_SOURCE_PRIORITY:",
    process.env.PRICE_SOURCE_PRIORITY || "NOT SET"
  );

  console.log(
    "PRICE_MAX_AGE_DAYS:",
    process.env.PRICE_MAX_AGE_DAYS || "NOT SET"
  );

  // ==================================================
  // RATIN
  // ==================================================

  console.log("");
  console.log("======================================");
  console.log("1. RATIN");
  console.log("======================================");

  try {
    const result = await fetchRatinPrices();

    console.log("Type:", typeof result);
    console.log("Is Array:", Array.isArray(result));

    console.log(
      "Result:",
      JSON.stringify(result, null, 2)
    );

  } catch (error) {
    console.error(
      "RATIN ERROR:",
      error.message
    );

    console.error(error.stack);
  }

  // ==================================================
  // TANTRADE
  // ==================================================

  console.log("");
  console.log("======================================");
  console.log("2. TANTRADE");
  console.log("======================================");

  try {
    const result = await fetchTantradePrices();

    console.log("Type:", typeof result);
    console.log("Is Array:", Array.isArray(result));

    console.log(
      "Result:",
      JSON.stringify(result, null, 2)
    );

  } catch (error) {
    console.error(
      "TANTRADE ERROR:",
      error.message
    );

    console.error(error.stack);
  }

  // ==================================================
  // MIT
  // ==================================================

  console.log("");
  console.log("======================================");
  console.log("3. MIT");
  console.log("======================================");

  try {
    const result = await fetchMitPrices();

    console.log("Type:", typeof result);
    console.log("Is Array:", Array.isArray(result));

    console.log(
      "MIT success:",
      result?.success
    );

    console.log(
      "MIT records:",
      Array.isArray(result?.records)
        ? result.records.length
        : "NOT ARRAY"
    );

    console.log(
      "MIT rawCount:",
      result?.rawCount
    );

    console.log(
      "MIT normalizedCount:",
      result?.normalizedCount
    );

    if (
      Array.isArray(result?.records) &&
      result.records.length > 0
    ) {
      console.log("");
      console.log("FIRST MIT RECORD:");
      console.log(
        JSON.stringify(
          result.records[0],
          null,
          2
        )
      );
    } else {
      console.log("");
      console.log(
        "FULL MIT RESULT:"
      );

      console.log(
        JSON.stringify(
          result,
          null,
          2
        )
      );
    }

  } catch (error) {
    console.error(
      "MIT ERROR:",
      error.message
    );

    console.error(error.stack);
  }

  console.log("");
  console.log("======================================");
  console.log(" TEST FINISHED");
  console.log("======================================");
}

main().catch((error) => {
  console.error("");
  console.error("FATAL ERROR:");
  console.error(error);
});