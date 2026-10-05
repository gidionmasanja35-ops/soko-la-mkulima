require("dotenv").config();

const {
  fetchAllSources,
} = require("./price-sources/price-aggregator");

async function main() {
  console.log("");
  console.log("======================================");
  console.log(" AGGREGATOR SOURCE DIRECT TEST");
  console.log("======================================");

  try {
    const result = await fetchAllSources();

    console.log("");
    console.log("========== SOURCE COUNTS ==========");

    console.log(
      "RATIN:",
      result.ratin.length
    );

    console.log(
      "TanTrade:",
      result.tantrade.length
    );

    console.log(
      "MIT:",
      result.mit.length
    );

    console.log("");
    console.log("========== FIRST RECORDS ==========");

    if (result.tantrade.length > 0) {
      console.log("");
      console.log("FIRST TANTRADE RECORD:");
      console.log(
        JSON.stringify(
          result.tantrade[0],
          null,
          2
        )
      );
    }

    if (result.mit.length > 0) {
      console.log("");
      console.log("FIRST MIT RECORD:");
      console.log(
        JSON.stringify(
          result.mit[0],
          null,
          2
        )
      );
    }

    console.log("");
    console.log("======================================");
    console.log(" TEST FINISHED");
    console.log("======================================");

  } catch (error) {
    console.error("");
    console.error("========== ERROR ==========");
    console.error(error.message);
    console.error(error.stack);
  }
}

main();