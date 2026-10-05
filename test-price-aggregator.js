require("dotenv").config();

const {
  aggregatePrices,
} = require("./price-sources/price-aggregator");

async function main() {
  console.log("");
  console.log("========================================");
  console.log("PRICE SOURCE SELECTION TEST");
  console.log("========================================");
  console.log("");

  try {
    const result = await aggregatePrices();

    console.log("");
    console.log("========================================");
    console.log("GENERAL RESULT");
    console.log("========================================");

    console.log("Success:", result.success);
    console.log("Raw:", result.rawRecordCount);
    console.log("Normalized:", result.normalizedRecordCount);
    console.log("Groups:", result.groupCount);
    console.log("Final:", result.aggregatedRecordCount);

    console.log("");
    console.log("========================================");
    console.log("SOURCE SUMMARY");
    console.log("========================================");

    console.log(
      JSON.stringify(
        result.sources,
        null,
        2
      )
    );

    // ========================================================
    // DAR ES SALAAM
    // ========================================================

    console.log("");
    console.log("========================================");
    console.log("DAR ES SALAAM - SELECTED PRICES");
    console.log("========================================");

    const dar = (result.records || [])
      .filter(
        (r) =>
          String(r.regionName || "")
            .toLowerCase()
            .trim() === "dar es salaam"
      )
      .map((r) => ({
        crop: r.cropName,
        selectedSource: r.source,
        price: r.price,
        pricePerKg: r.pricePerKg,
        unit: r.unit,
        date: r.dataDate,
        score: r.selectionScore,
        availableSources:
          (r.availableSources || [])
            .map(
              (s) =>
                `${s.source}: ${s.price} ${s.unit} (${s.dataDate})`
            )
            .join(" | "),
      }));

    console.table(dar);

    // ========================================================
    // CHECK SOURCE OVERLAP
    // ========================================================

    console.log("");
    console.log("========================================");
    console.log("SOURCE OVERLAP CHECK");
    console.log("========================================");

    const overlap = (result.records || [])
      .filter(
        (r) =>
          r.availableSources &&
          r.availableSources.length > 1
      )
      .map((r) => ({
        crop: r.cropName,
        region: r.regionName,
        selected: r.source,
        selectedPrice: r.price,
        selectedDate: r.dataDate,
        sources:
          r.availableSources
            .map(
              (s) =>
                `${s.source}=${s.price}/${s.unit}/${s.dataDate}`
            )
            .join(" | "),
      }));

    console.log(
      "Groups with multiple sources:",
      overlap.length
    );

    console.table(
      overlap.slice(0, 30)
    );

    // ========================================================
    // SPECIFIC TESTS
    // ========================================================

    console.log("");
    console.log("========================================");
    console.log("SPECIFIC TESTS");
    console.log("========================================");

    const tests = [
      {
        crop: "mahindi",
        region: "dar es salaam",
      },
      {
        crop: "mchele",
        region: "dar es salaam",
      },
      {
        crop: "maharage",
        region: "dar es salaam",
      },
      {
        crop: "mtama",
        region: "dar es salaam",
      },
      {
        crop: "uwele",
        region: "dar es salaam",
      },
      {
        crop: "viazi mbatata",
        region: "dar es salaam",
      },
    ];

    for (const test of tests) {
      const found = (result.records || []).find(
        (r) =>
          String(r.cropId || "")
            .toLowerCase() === test.crop &&
          String(r.regionName || "")
            .toLowerCase() === test.region
      );

      if (!found) {
        console.log(
          `❌ ${test.crop} / ${test.region}: NOT FOUND`
        );
        continue;
      }

      console.log("");
      console.log(
        `🌾 ${test.crop} - ${test.region}`
      );

      console.log(
        "Selected:",
        found.source
      );

      console.log(
        "Price:",
        found.price,
        found.unit
      );

      console.log(
        "Price/kg:",
        found.pricePerKg
      );

      console.log(
        "Date:",
        found.dataDate
      );

      console.log(
        "Score:",
        found.selectionScore
      );

      console.log(
        "Available sources:"
      );

      for (
        const source
        of found.availableSources || []
      ) {
        console.log(
          `  - ${source.source}: ${source.price} ${source.unit} | ${source.dataDate}`
        );
      }
    }

    console.log("");
    console.log("========================================");
    console.log("SELECTION TEST FINISHED");
    console.log("========================================");
    console.log("");

  } catch (error) {
    console.error("");
    console.error("❌ TEST FAILED");
    console.error(error);
    console.error("");
  }
}

main();