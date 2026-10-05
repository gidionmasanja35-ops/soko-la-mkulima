// test-moa.js

require("dotenv").config();

const {
  fetchMoaPrices,
} = require("./price-sources/moa");

async function main() {
  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "SOKO LA MKULIMA - MOA PRICE TEST"
  );
  console.log(
    "========================================"
  );
  console.log("");

  try {
    const result =
      await fetchMoaPrices();

    console.log("");
    console.log(
      "========== SUMMARY =========="
    );

    console.log(
      "Success:",
      result.success
    );

    console.log(
      "Source:",
      result.source
    );

    console.log(
      "Date:",
      result.dataDate
    );

    console.log(
      "Regional rows:",
      result.regionalRowCount
    );

    console.log(
      "Price records:",
      result.recordCount
    );

    console.log("");

    console.log(
      "========== DAR ES SALAAM =========="
    );

    const dar =
      result.records.filter(
        (record) =>
          record.regionName ===
          "Dar es Salaam"
      );

    console.table(
      dar.map(
        (record) => ({
          crop:
            record.cropName,

          price:
            record.price,

          unit:
            record.unit,

          type:
            record.priceType,

          date:
            record.dataDate,
        })
      )
    );

    console.log("");
    console.log(
      "========== SAMPLE RECORD =========="
    );

    console.log(
      JSON.stringify(
        result.records[0],
        null,
        2
      )
    );

  } catch (error) {
    console.error("");
    console.error(
      "[MOA TEST ERROR]"
    );

    console.error(
      error.message
    );

    process.exitCode = 1;
  }
}

main();