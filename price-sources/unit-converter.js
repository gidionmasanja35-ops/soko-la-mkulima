/**
 * UNIT CONVERTER
 * --------------------------------------------------
 * Normalizes price units from RATIN, TanTrade and MIT.
 *
 * IMPORTANT:
 * We only convert when the conversion is known.
 *
 * Examples:
 *   kg       -> kg
 *   kilogram -> kg
 *   tonne    -> ton
 *   100 kg   -> 100kg
 *   gunia    -> gunia
 *
 * We DO NOT assume:
 *   1 gunia = 100 kg
 *
 * because bag/gunia sizes can differ by commodity/source.
 */

/**
 * Canonical units used by our price engine.
 */
const UNITS = {
  KG: "kg",
  G: "g",
  TON: "ton",
  QUINTAL: "quintal",
  HUNDRED_KG: "100kg",
  BAG: "bag",
  GUNIA: "gunia",
  LITRE: "litre",
  PIECE: "piece",
  BUNCH: "bunch",
  UNKNOWN: "unknown",
};

/**
 * Normalize unit text.
 */
function normalizeUnit(value) {
  if (!value) return "";

  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[()]/g, " ")
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Convert source unit into canonical unit.
 */
function normalizeUnitName(value) {
  const unit = normalizeUnit(value);

  if (!unit) {
    return UNITS.UNKNOWN;
  }

  // Kilogram
  if (
    unit === "kg" ||
    unit === "kgs" ||
    unit === "kilo" ||
    unit === "kilos" ||
    unit === "kilogram" ||
    unit === "kilograms"
  ) {
    return UNITS.KG;
  }

  // Gram
  if (
    unit === "g" ||
    unit === "gram" ||
    unit === "grams"
  ) {
    return UNITS.G;
  }

  // Tonne / Ton
  if (
    unit === "ton" ||
    unit === "tons" ||
    unit === "tonne" ||
    unit === "tonnes" ||
    unit === "metric ton" ||
    unit === "metric tonne" ||
    unit === "metric tons" ||
    unit === "metric tonnes"
  ) {
    return UNITS.TON;
  }

  // Quintal
  if (
    unit === "quintal" ||
    unit === "quintals"
  ) {
    return UNITS.QUINTAL;
  }

  // 100 kg
  if (
    unit === "100 kg" ||
    unit === "100kg" ||
    unit === "per 100 kg" ||
    unit === "per 100kg" ||
    unit === "100 kilograms" ||
    unit === "100 kilogram"
  ) {
    return UNITS.HUNDRED_KG;
  }

  // Bag
  if (
    unit === "bag" ||
    unit === "bags"
  ) {
    return UNITS.BAG;
  }

  // Gunia
  if (
    unit === "gunia" ||
    unit === "magunia"
  ) {
    return UNITS.GUNIA;
  }

  // Litre
  if (
    unit === "l" ||
    unit === "ltr" ||
    unit === "litre" ||
    unit === "litres" ||
    unit === "liter" ||
    unit === "liters"
  ) {
    return UNITS.LITRE;
  }

  // Piece
  if (
    unit === "pc" ||
    unit === "pcs" ||
    unit === "piece" ||
    unit === "pieces"
  ) {
    return UNITS.PIECE;
  }

  // Bunch
  if (
    unit === "bunch" ||
    unit === "bunches"
  ) {
    return UNITS.BUNCH;
  }

  return UNITS.UNKNOWN;
}

/**
 * How many kilograms are represented by ONE unit.
 *
 * Examples:
 *
 *   1 kg       = 1 kg
 *   1 g        = 0.001 kg
 *   1 100kg    = 100 kg
 *   1 quintal  = 100 kg
 *   1 ton      = 1000 kg
 *
 * IMPORTANT:
 * This table represents QUANTITY conversion,
 * not PRICE conversion.
 */
const CONVERSIONS_TO_KG = {
  g: 0.001,
  kg: 1,
  "100kg": 100,
  quintal: 100,
  ton: 1000,
};

/**
 * Check whether a unit can safely be converted to kg.
 */
function canConvertToKg(unit) {
  const normalized = normalizeUnitName(unit);

  return Object.prototype.hasOwnProperty.call(
    CONVERSIONS_TO_KG,
    normalized
  );
}

/**
 * Convert a quantity to kilograms.
 *
 * Example:
 *
 * convertToKg(2, "ton")
 * => 2000
 *
 * convertToKg(5, "100kg")
 * => 500
 *
 * convertToKg(1, "gunia")
 * => null
 */
function convertToKg(quantity, unit) {
  const numericQuantity = Number(quantity);

  if (!Number.isFinite(numericQuantity)) {
    return null;
  }

  const normalizedUnit = normalizeUnitName(unit);

  const factor = CONVERSIONS_TO_KG[normalizedUnit];

  if (factor === undefined) {
    return null;
  }

  return Number(
    (numericQuantity * factor).toFixed(6)
  );
}

/**
 * Convert kilograms to another supported unit.
 *
 * Example:
 *
 * 1000 kg -> 1 ton
 * 100 kg  -> 1 quintal
 */
function convertFromKg(quantityKg, targetUnit) {
  const numericKg = Number(quantityKg);

  if (!Number.isFinite(numericKg)) {
    return null;
  }

  const normalizedUnit = normalizeUnitName(targetUnit);

  switch (normalizedUnit) {
    case UNITS.G:
      return numericKg * 1000;

    case UNITS.KG:
      return numericKg;

    case UNITS.HUNDRED_KG:
    case UNITS.QUINTAL:
      return numericKg / 100;

    case UNITS.TON:
      return numericKg / 1000;

    default:
      return null;
  }
}

/**
 * Convert a quantity from one unit to another.
 *
 * Example:
 *
 * convertUnit(2, "ton", "kg")
 * => 2000
 *
 * convertUnit(500, "kg", "100kg")
 * => 5
 *
 * convertUnit(2, "gunia", "kg")
 * => null
 */
function convertUnit(quantity, fromUnit, toUnit) {
  const numericQuantity = Number(quantity);

  if (!Number.isFinite(numericQuantity)) {
    return null;
  }

  const from = normalizeUnitName(fromUnit);
  const to = normalizeUnitName(toUnit);

  // Same unit
  if (from === to) {
    return numericQuantity;
  }

  // Convert source quantity to KG
  const quantityKg = convertToKg(
    numericQuantity,
    from
  );

  if (quantityKg === null) {
    return null;
  }

  // Convert KG to target
  return convertFromKg(
    quantityKg,
    to
  );
}

/**
 * Normalize a price record.
 *
 * This does NOT change the actual price.
 * It only gives the price engine information
 * about the unit.
 */
function normalizePriceUnit(unit) {
  const normalizedUnit = normalizeUnitName(unit);

  return {
    originalUnit: unit || null,
    unit: normalizedUnit,
    known: normalizedUnit !== UNITS.UNKNOWN,
    canConvertToKg: canConvertToKg(normalizedUnit),
  };
}

/**
 * Validate price unit.
 */
function validatePriceUnit(unit) {
  const normalizedUnit = normalizeUnitName(unit);

  if (normalizedUnit === UNITS.UNKNOWN) {
    return {
      valid: false,
      unit: UNITS.UNKNOWN,
      reason: "Unit haijulikani",
    };
  }

  return {
    valid: true,
    unit: normalizedUnit,
    reason: null,
  };
}

/**
 * Convert PRICE from one unit basis to another.
 *
 * IMPORTANT:
 * Price conversion is different from quantity conversion.
 *
 * Example:
 *
 * 95,000 TZS / 100kg
 *
 * There are 100 kg in one source unit.
 *
 * Therefore:
 *
 * 95,000 / 100
 * = 950 TZS/kg
 *
 * Another example:
 *
 * 500,000 TZS / ton
 *
 * 1 ton = 1000 kg
 *
 * Therefore:
 *
 * 500,000 / 1000
 * = 500 TZS/kg
 */
function convertPrice(
  price,
  sourceUnit,
  targetUnit
) {
  const numericPrice = Number(price);

  if (!Number.isFinite(numericPrice)) {
    return null;
  }

  const source = normalizeUnitName(sourceUnit);
  const target = normalizeUnitName(targetUnit);

  // Same unit: no conversion required.
  if (source === target) {
    return Number(
      numericPrice.toFixed(2)
    );
  }

  /**
   * Number of kilograms represented by ONE
   * source unit.
   *
   * Examples:
   *
   * 1 kg    -> 1 kg
   * 1 100kg -> 100 kg
   * 1 ton   -> 1000 kg
   */
  const sourceKg = convertToKg(
    1,
    source
  );

  if (sourceKg === null || sourceKg <= 0) {
    return null;
  }

  /**
   * Number of kilograms represented by ONE
   * target unit.
   */
  const targetKg = convertToKg(
    1,
    target
  );

  if (targetKg === null || targetKg <= 0) {
    return null;
  }

  /**
   * PRICE conversion.
   *
   * If:
   *
   * 95,000 TZS / 100kg
   *
   * sourceKg = 100
   *
   * targetKg = 1
   *
   * price = 95,000
   *
   * result:
   *
   * 95,000 × (1 / 100)
   * = 950 TZS/kg
   *
   * General formula:
   *
   * convertedPrice =
   * price × targetKg / sourceKg
   */
  const convertedPrice =
    numericPrice *
    (targetKg / sourceKg);

  return Number(
    convertedPrice.toFixed(2)
  );
}

/**
 * Get information about a unit.
 */
function getUnitInfo(unit) {
  const normalized = normalizeUnitName(unit);

  const kgEquivalent = canConvertToKg(normalized)
    ? convertToKg(1, normalized)
    : null;

  return {
    originalUnit: unit || null,
    unit: normalized,
    known: normalized !== UNITS.UNKNOWN,
    canConvertToKg:
      kgEquivalent !== null,
    kgEquivalent,
  };
}

module.exports = {
  UNITS,

  normalizeUnit,
  normalizeUnitName,

  canConvertToKg,

  convertToKg,
  convertFromKg,
  convertUnit,

  normalizePriceUnit,
  validatePriceUnit,
  convertPrice,

  getUnitInfo,
};