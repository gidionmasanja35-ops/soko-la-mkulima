// price-sources/master-crops.js
//
// MASTER CROP CATALOG
// -------------------
// Hii ndiyo orodha kuu ya mazao inayotumiwa na price engine.
// Source za nje kama RATIN, TanTrade na MIT hazitaongeza zao
// moja kwa moja kwenye app. Zao la source lazima limatch hapa kwanza.

const MASTER_CROPS = [
  // ============================================================
  // NAFAKA (CEREALS)
  // ============================================================

  {
    id: "mahindi",
    name: "mahindi",
    category: "Nafaka",
    aliases: [
      "maize",
      "corn",
      "maize grain",
      "corn grain",
    ],
  },

  {
    id: "mpunga",
    name: "mpunga",
    category: "Nafaka",
    aliases: [
      "paddy",
           "paddy rice",
      "rice paddy",
      "mpunga mbichi",
    ],
  },

  {
    id: "mchele",
    name: "mchele",
    category: "Nafaka",
    aliases: [
      "rice",
      "milled rice",
      "rice grain",
      "white rice",
    ],
  },

  {
    id: "mtama",
    name: "mtama",
    category: "Nafaka",
    aliases: [
      "sorghum",
      "sorghum grain",
    ],
  },

  {
    id: "uwele",
    name: "uwele",
    category: "Nafaka",
    aliases: [
      "finger millet",
      "millet",
      "finger-millet",
    ],
  },

  {
    id: "ngano",
    name: "ngano",
    category: "Nafaka",
    aliases: [
      "wheat",
      "wheat grain",
    ],
  },

  {
    id: "wimbi",
    name: "wimbi",
    category: "Nafaka",
    aliases: [
      "bulrush millet",
      "pearl millet",
      "millet grain",
    ],
  },


  // ============================================================
  // KUNDE (LEGUMES)
  // ============================================================

  {
    id: "maharage",
    name: "maharage",
    category: "Kunde",
    aliases: [
      "beans",
      "bean",
      "common beans",
      "dry beans",
      "dry bean",
    ],
  },

  {
    id: "kunde",
    name: "kunde",
    category: "Kunde",
    aliases: [
      "cowpeas",
      "cow pea",
      "cowpea",
      "black eyed peas",
      "black-eyed peas",
    ],
  },

  {
    id: "choroko",
    name: "choroko",
    category: "Kunde",
    aliases: [
      "green gram",
      "green grams",
      "mung beans",
      "mung bean",
      "moong",
    ],
  },

  {
    id: "mbaazi",
    name: "mbaazi",
    category: "Kunde",
    aliases: [
      "pigeon peas",
      "pigeon pea",
      "cajanus",
    ],
  },

  {
    id: "njugu mawe",
    name: "njugu mawe",
    category: "Kunde",
    aliases: [
      "round nuts",
      "bambara nuts",
      "bambara groundnuts",
      "bambara nut",
    ],
  },

  {
    id: "soya",
    name: "soya",
    category: "Kunde",
    aliases: [
      "soy",
      "soybean",
      "soybeans",
      "soya bean",
      "soya beans",
    ],
  },

  {
    id: "dengu",
    name: "dengu",
    category: "Kunde",
    aliases: [
      "lentils",
      "lentil",
      "green lentils",
    ],
  },


  // ============================================================
  // MIZIZI NA MICHENZA
  // ============================================================

  {
    id: "mhogo",
    name: "mhogo",
    category: "Mizizi na Michenza",
    aliases: [
      "cassava",
      "cassava root",
      "cassava roots",
    ],
  },

  {
    id: "viazi vitamu",
    name: "viazi vitamu",
    category: "Mizizi na Michenza",
    aliases: [
      "sweet potatoes",
      "sweet potato",
    ],
  },

  {
    id: "viazi mbatata",
    name: "viazi mbatata",
    category: "Mizizi na Michenza",
    aliases: [
      "potatoes",
      "potato",
      "irish potatoes",
      "irish potato",
      "round potatoes",
      "round potato",
    ],
  },


  // ============================================================
  // MAFUTA NA BIASHARA
  // ============================================================

  {
    id: "ufuta",
    name: "ufuta",
    category: "Mafuta",
    aliases: [
      "sesame",
      "sesame seeds",
      "sesame seed",
    ],
  },

  {
    id: "karanga",
    name: "karanga",
    category: "Mafuta",
    aliases: [
      "groundnuts",
      "groundnut",
      "peanuts",
      "peanut",
    ],
  },

  {
    id: "alizeti",
    name: "alizeti",
    category: "Mafuta",
    aliases: [
      "sunflower",
      "sunflower seed",
      "sunflower seeds",
    ],
  },

  {
    id: "michikichi",
    name: "michikichi",
    category: "Mafuta",
    aliases: [
      "palm",
      "palm oil",
      "palm nuts",
      "palm kernel",
    ],
  },

  {
    id: "nazi",
    name: "nazi",
    category: "Mafuta",
    aliases: [
      "coconut",
      "coconuts",
      "coconut fruit",
    ],
  },

  {
    id: "pamba",
    name: "pamba",
    category: "Mafuta",
    aliases: [
      "cotton",
      "cotton seed",
      "cotton seeds",
    ],
  },


  // ============================================================
  // MBOGA (VEGETABLES)
  // ============================================================

  {
    id: "nyanya",
    name: "nyanya",
    category: "Mboga",
    aliases: [
      "tomatoes",
      "tomato",
    ],
  },

  {
    id: "vitunguu maji",
    name: "vitunguu maji",
    category: "Mboga",
    aliases: [
      "onions",
      "onion",
      "bulb onions",
      "bulb onion",
    ],
  },

  {
    id: "sukuma wiki",
    name: "sukuma wiki",
    category: "Mboga",
    aliases: [
      "kale",
      "collard greens",
    ],
  },

  {
    id: "kabichi",
    name: "kabichi",
    category: "Mboga",
    aliases: [
      "cabbage",
      "cabbages",
    ],
  },

  {
    id: "bamia",
    name: "bamia",
    category: "Mboga",
    aliases: [
      "okra",
      "lady fingers",
      "ladyfinger",
    ],
  },

  {
    id: "mchicha",
    name: "mchicha",
    category: "Mboga",
    aliases: [
      "amaranth",
      "spinach",
      "amaranth leaves",
    ],
  },

  {
    id: "pilipili hoho",
    name: "pilipili hoho",
    category: "Mboga",
    aliases: [
      "sweet pepper",
      "sweet peppers",
      "bell pepper",
      "bell peppers",
      "capsicum",
    ],
  },

  {
    id: "pilipili kali",
    name: "pilipili kali",
    category: "Mboga",
    aliases: [
      "chili",
      "chilli",
      "chili pepper",
      "chilli pepper",
      "hot pepper",
      "hot peppers",
    ],
  },

  {
    id: "karoti",
    name: "karoti",
    category: "Mboga",
    aliases: [
      "carrots",
      "carrot",
    ],
  },

  {
    id: "bilinganya",
    name: "bilinganya",
    category: "Mboga",
    aliases: [
      "eggplant",
      "eggplants",
      "aubergine",
      "aubergines",
    ],
  },

  {
    id: "tango",
    name: "tango",
    category: "Mboga",
    aliases: [
      "cucumber",
      "cucumbers",
    ],
  },

  {
    id: "boga",
    name: "boga",
    category: "Mboga",
    aliases: [
      "pumpkin",
      "pumpkins",
      "squash",
    ],
  },

  {
    id: "kitunguu saumu",
    name: "kitunguu saumu",
    category: "Mboga",
    aliases: [
      "garlic",
      "garlic bulb",
      "garlic bulbs",
    ],
  },


  // ============================================================
  // MATUNDA (FRUITS)
  // ============================================================

  {
    id: "parachichi",
    name: "parachichi",
    category: "Matunda",
    aliases: [
      "avocado",
      "avocados",
    ],
  },

  {
    id: "ndizi",
    name: "ndizi",
    category: "Matunda",
    aliases: [
      "banana",
      "bananas",
    ],
  },

  {
    id: "embe",
    name: "embe",
    category: "Matunda",
    aliases: [
      "mango",
      "mangoes",
    ],
  },

  {
    id: "machungwa",
    name: "machungwa",
    category: "Matunda",
    aliases: [
      "orange",
      "oranges",
    ],
  },

  {
    id: "papai",
    name: "papai",
    category: "Matunda",
    aliases: [
      "papaya",
      "papayas",
    ],
  },

  {
    id: "nanasi",
    name: "nanasi",
    category: "Matunda",
    aliases: [
      "pineapple",
      "pineapples",
    ],
  },

  {
    id: "pesheni",
    name: "pesheni",
    category: "Matunda",
    aliases: [
      "passion",
      "passion fruit",
      "passion fruits",
      "passionfruit",
    ],
  },

  {
    id: "pera",
    name: "pera",
    category: "Matunda",
    aliases: [
      "guava",
      "guavas",
    ],
  },

  {
    id: "fenesi",
    name: "fenesi",
    category: "Matunda",
    aliases: [
      "jackfruit",
      "jack fruit",
    ],
  },

  {
    id: "limau",
    name: "limau",
    category: "Matunda",
    aliases: [
      "lemon",
      "lemons",
    ],
  },

  {
    id: "zabibu",
    name: "zabibu",
    category: "Matunda",
    aliases: [
      "grape",
      "grapes",
    ],
  },

  {
    id: "tikiti maji",
    name: "tikiti maji",
    category: "Matunda",
    aliases: [
      "watermelon",
      "watermelons",
    ],
  },

  {
    id: "stafeli",
    name: "stafeli",
    category: "Matunda",
    aliases: [
      "soursop",
      "soursops",
      "graviola",
    ],
  },

  {
    id: "korosho",
    name: "korosho",
    category: "Matunda",
    aliases: [
      "cashew",
      "cashews",
      "cashew nuts",
      "cashew nut",
    ],
  },

  {
    id: "kahawa",
    name: "kahawa",
    category: "Matunda",
    aliases: [
      "coffee",
      "coffee beans",
      "coffee bean",
    ],
  },

  {
    id: "chenza",
    name: "chenza",
    category: "Matunda",
    aliases: [
      "tangerine",
      "tangerines",
      "mandarin",
      "mandarins",
    ],
  },

  {
    id: "zambarau",
    name: "zambarau",
    category: "Matunda",
    aliases: [
      "plum",
      "plums",
      "purple plum",
    ],
  },
];


// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get all master crops.
 */
function getMasterCrops() {
  return MASTER_CROPS;
}


/**
 * Find a master crop by its ID.
 */
function getCropById(id) {
  if (!id) return null;

  const normalized = String(id)
    .trim()
    .toLowerCase();

  return MASTER_CROPS.find(
    (crop) => crop.id.toLowerCase() === normalized
  ) || null;
}


/**
 * Get all crop IDs.
 */
function getCropIds() {
  return MASTER_CROPS.map((crop) => crop.id);
}


/**
 * Get crops belonging to a category.
 */
function getCropsByCategory(category) {
  if (!category) return [];

  const normalized = String(category)
    .trim()
    .toLowerCase();

  return MASTER_CROPS.filter(
    (crop) => crop.category.toLowerCase() === normalized
  );
}


/**
 * Get aliases for a specific crop.
 */
function getCropAliases(id) {
  const crop = getCropById(id);

  if (!crop) return [];

  return [
    crop.name,
    ...crop.aliases,
  ];
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  MASTER_CROPS,
  getMasterCrops,
  getCropById,
  getCropIds,
  getCropsByCategory,
  getCropAliases,
};