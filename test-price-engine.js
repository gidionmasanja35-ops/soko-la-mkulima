require("dotenv").config();

const {
  aggregatePrices,
  getAggregationSummary,
} = require("./price-sources/price-aggregator");

async function main() {
  console.log("\n=================================");
  console.log(" SOKO LA MKULIMA PRICE ENGINE");
  console.log("=================================\n");

  try {
    const result = await aggregatePrices();

    console.log("\n========== RESULT ==========\n");

    console.log("Master crops:", result.masterCropCount);
    console.log("Raw records:", result.rawRecordCount);
    console.log("Valid records:", result.normalizedRecordCount);
    console.log("Groups:", result.groupCount);
    console.log("Final prices:", result.aggregatedRecordCount);

    console.log("\nSources:");
    console.log("RATIN:", result.sources.RATIN);
    console.log("TanTrade:", result.sources.TanTrade);
    console.log("MIT:", result.sources.MIT);

    console.log("\n========== SUMMARY ==========\n");
    console.log(getAggregationSummary(result.records));

    console.log("\n========== SAMPLE DATA ==========\n");
    console.log(
      JSON.stringify(
        result.records.slice(0, 10),
        null,
        2
      )
    );

  } catch (error) {
    console.error("\nPRICE ENGINE ERROR:");
    console.error(error);
  }
}

main();