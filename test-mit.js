require("dotenv").config();

const {
  fetchMitPrices,
} = require("./price-sources/mit");

async function main() {
  console.log("\n==============================");
  console.log(" MIT PRICE TEST");
  console.log("==============================\n");

  console.log(
    "MIT_PDF_URL:",
    process.env.MIT_PDF_URL
  );

  try {
    const result = await fetchMitPrices();

    console.log("\n========== TYPE ==========\n");

    console.log(
      "Type:",
      typeof result
    );

    console.log(
      "Is Array:",
      Array.isArray(result)
    );

    console.log("\n========== FULL RESULT ==========\n");

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

  } catch (error) {
    console.error("\nMIT ERROR:");
    console.error(error);
  }
}

main();