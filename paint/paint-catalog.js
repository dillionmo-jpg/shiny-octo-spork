const LOCATION_IDS = [100, 200, 300, 400, 500];

export const PAINTABLE_PART_CATEGORY_IDS = new Set([
  65,
  68,
  71,
  72,
  73,
  74,
  75,
  76,
  77,
  128,
  129,
  130,
  140,
  141,
  142,
  143,
  144,
  174,
]);

const PAINTABLE_PART_CATEGORIES = [
  [128, "Front Bumper"],
  [130, "Rear Bumper"],
  [129, "Side Skirts"],
  [71, "Hood"],
  [144, "Trunk"],
  [65, "Spoiler"],
  [68, "Roof Scoop"],
  [72, "Hood Center Effect"],
  [74, "Hood Front Effect"],
  [73, "Side Effect"],
  [75, "Eyelids"],
  [76, "Headlights"],
  [77, "Tail Lights"],
  [140, "Grille"],
  [141, "C-Pillar Effect"],
  [142, "Fender Effect"],
  [143, "Door Effect"],
  [174, "Convertible Top"],
];

const LOCATION_PRICE_MULTIPLIERS = new Map([
  [100, 1],
  [200, 1.25],
  [300, 1.5],
  [400, 1.9],
  [500, 2.5],
]);

const COLORS_BY_LOCATION = new Map([
  // Location 100: 15 unique colors (Classic basics)
  [100, [
    "1A1A1A", // Jet Black
    "F5F5F5", // Off White
    "4A4A4A", // Dark Gray
    "B0B0B0", // Light Gray
    "8B0000", // Dark Red
    "DC143C", // Crimson
    "191970", // Midnight Blue
    "4169E1", // Royal Blue
    "006400", // Dark Green
    "228B22", // Forest Green
    "DAA520", // Goldenrod
    "FF8C00", // Dark Orange
    "800080", // Purple
    "FF1493", // Deep Pink
    "20B2AA", // Light Sea Green
    "101820",
    "243447",
    "3B5B92",
    "5C6BC0",
    "6D4C41",
    "7E57C2",
    "8D6E63",
    "9FA8DA",
    "B71C1C",
    "C62828",
    "D32F2F",
    "E53935",
    "F4511E",
    "FF7043",
    "FFB300",
    "FDD835",
    "C0CA33",
    "7CB342",
    "43A047",
    "00897B",
    "00ACC1",
    "039BE5",
    "1E88E5",
    "3949AB",
    "5E35B1",
    "FF0000",
    "00FF00",
    "0000FF",
    "FFFF00",
    "FF00FF",
    "00FFFF",
    "FFFFFF",
    "000000",
    "C00000",
    "00C000",
    "0000C0",
    "C0C000",
    "C000C0",
    "00C0C0",
    "E60012",
    "009944",
    "0047AB",
    "FFD400",
    "EC008C",
    "00AEEF",
    "ED1C24",
    "39B54A",
    "2E3192",
    "FFF200",
    "D4145A",
    "00A99D",
  ]],
  // Location 200: 15 unique colors (Earthy tones)
  [200, [
    "2F4F4F", // Dark Slate Gray
    "708090", // Slate Gray
    "A0522D", // Sienna
    "8B4513", // Saddle Brown
    "556B2F", // Dark Olive Green
    "6B8E23", // Olive Drab
    "BC8F8F", // Rosy Brown
    "F4A460", // Sandy Brown
    "D2691E", // Chocolate
    "CD853F", // Peru
    "DEB887", // Burlywood
    "F5DEB3", // Wheat
    "FFF8DC", // Cornsilk
    "FAEBD7", // Antique White
    "FFE4C4", // Bisque
    "2E1F1A",
    "4B2E1F",
    "6F4E37",
    "8C5A3C",
    "A97142",
    "C08A52",
    "D4A373",
    "E6B980",
    "F2CC8F",
    "FAEDCD",
    "7F5539",
    "9C6644",
    "B08968",
    "C4A484",
    "DDB892",
    "EAD7C3",
    "5E503F",
    "6C584C",
    "7D6B57",
    "8E7D63",
    "9F8F6F",
    "B0A17B",
    "C1B387",
    "D2C59F",
    "E3D7BB",
    "3A2415",
    "4E342E",
    "5D4037",
    "795548",
    "8D6E55",
    "A1887F",
    "BCAAA4",
    "D7CCC8",
    "EFEBE9",
    "6B4423",
    "7B3F00",
    "954535",
    "A0521D",
    "B87333",
    "C19A6B",
    "D2B48C",
    "E5C29F",
    "F1D7B6",
    "C2B280",
    "A67B5B",
    "8A6F48",
    "6E4F2A",
    "4A3728",
    "9B7653",
    "BC987E",
    "EED9C4",
  ]],
  // Location 300: 15 unique colors (Cool tones)
  [300, [
    "483D8B", // Dark Slate Blue
    "6A5ACD", // Slate Blue
    "7B68EE", // Medium Slate Blue
    "9370DB", // Medium Purple
    "8A2BE2", // Blue Violet
    "9400D3", // Dark Violet
    "9932CC", // Dark Orchid
    "BA55D3", // Medium Orchid
    "DDA0DD", // Plum
    "EE82EE", // Violet
    "DA70D6", // Orchid
    "C71585", // Medium Violet Red
    "DB7093", // Pale Violet Red
    "FF69B4", // Hot Pink
    "FFC0CB", // Pink
    "102A43",
    "243B53",
    "334E68",
    "486581",
    "627D98",
    "829AB1",
    "9FB3C8",
    "BCCCDC",
    "D9E2EC",
    "EAF2F8",
    "0F4C5C",
    "136F63",
    "1F7A8C",
    "2892D7",
    "3D5A80",
    "577590",
    "6C91BF",
    "7FB069",
    "8FCB9B",
    "98C1D9",
    "A9D6E5",
    "BDE0FE",
    "CDB4DB",
    "D0F4DE",
    "E4C1F9",
    "001F54",
    "034078",
    "1282A2",
    "0A1128",
    "001D3D",
    "003566",
    "0077B6",
    "0096C7",
    "00B4D8",
    "48CAE4",
    "76E4F7",
    "ADE8F4",
    "D6F6FF",
    "2B2D42",
    "102542",
    "24B8B4",
    "7DFFF2",
    "7400B8",
    "6930C3",
    "5E60CE",
    "5390D9",
    "4EA8DE",
    "48BFE3",
    "56CFE1",
    "64DFDF",
    "72EFDD",
  ]],
  // Location 400: 15 unique colors (Warm tones)
  [400, [
    "B22222", // Fire Brick
    "A52A2A", // Brown
    "E9967A", // Dark Salmon
    "FA8072", // Salmon
    "FFA07A", // Light Salmon
    "FFD700", // Gold
    "F0E68C", // Khaki
    "BDB76B", // Dark Khaki
    "EEE8AA", // Pale Goldenrod
    "ADFF2F", // Green Yellow
    "7FFF00", // Chartreuse
    "7CFC00", // Lawn Green
    "32CD32", // Lime Green
    "00FA9A", // Medium Spring Green
    "00FF7F", // Spring Green
    "5D2A42",
    "7F1D1D",
    "9A031E",
    "AE2012",
    "BB3E03",
    "CA6702",
    "EE9B00",
    "C97B63",
    "E29578",
    "FFB4A2",
    "FFCDB2",
    "FFD6A5",
    "F4A261",
    "E76F51",
    "B56576",
    "6D597A",
    "EAAC8B",
    "F28482",
    "F6BD60",
    "F7EDE2",
    "F5CAC3",
    "84A59D",
    "F28444",
    "C8553D",
    "8C1C13",
    "FF6B35",
    "F7931E",
    "FFB703",
    "FB8500",
    "E85D04",
    "DC2F02",
    "D00000",
    "9D0208",
    "6A040F",
    "370617",
    "FFADAD",
    "FFD6D6",
    "FFE066",
    "F9C74F",
    "F9844A",
    "F3722C",
    "F94144",
    "C1121F",
    "780000",
    "FFBA08",
    "FAA307",
    "F48C06",
    "E85D00",
    "D0001D",
    "A4161A",
    "BA181B",
  ]],
  // Location 500: 15 unique colors (Premium exotic)
  [500, [
    "00CED1", // Dark Turquoise
    "48D1CC", // Medium Turquoise
    "40E0D0", // Turquoise
    "AFEEEE", // Pale Turquoise
    "E0FFFF", // Light Cyan
    "5F9EA0", // Cadet Blue
    "4682B4", // Steel Blue
    "87CEEB", // Sky Blue
    "87CEFA", // Light Sky Blue
    "1E90FF", // Dodger Blue
    "00BFFF", // Deep Sky Blue
    "ADD8E6", // Light Blue
    "B0C4DE", // Light Steel Blue
    "B0E0E6", // Powder Blue
    "E6E6FA", // Lavender
    "003049",
    "005F73",
    "0A9396",
    "14B8A6",
    "2DD4BF",
    "38BDF8",
    "4CC9F0",
    "4895EF",
    "4361EE",
    "3A0CA3",
    "560BAD",
    "7209B7",
    "9D4EDD",
    "B5179E",
    "F72585",
    "06D6A0",
    "118AB2",
    "073B4C",
    "90E0EF",
    "CAF0F8",
    "A8DADC",
    "457B9D",
    "1D3557",
    "2A9D8F",
    "264653",
    "001219",
    "005F8F",
    "0077A3",
    "0081A7",
    "00A7A5",
    "02C39A",
    "38A3A5",
    "57CC99",
    "80ED99",
    "C7F9CC",
    "003B73",
    "0074B7",
    "60A3D9",
    "BFD7ED",
    "0B132B",
    "1C2541",
    "3A506B",
    "5BC0BE",
    "6FFFE9",
    "003554",
    "006494",
    "0582CA",
    "00A6FB",
    "1B4965",
    "5FA8D3",
    "BEE9E8",
  ]],
]);

function colorsForLocation(locationId) {
  return COLORS_BY_LOCATION.get(Number(locationId)) || [];
}

function escapeXmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAttributes(attributes) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}='${escapeXmlAttribute(value)}'`)
    .join(" ");
}

function renderNode(name, attributes = {}, content = "") {
  const renderedAttributes = renderAttributes(attributes);
  const openTag = renderedAttributes ? `<${name} ${renderedAttributes}` : `<${name}`;

  return content ? `${openTag}>${escapeXmlAttribute(content)}</${name}>` : `${openTag}/>`;
}

function multiplierForLocation(locationId) {
  return LOCATION_PRICE_MULTIPLIERS.get(Number(locationId)) || 1;
}

function paintMoneyPrice(basePrice, locationId) {
  return Math.round(Number(basePrice || 0) * multiplierForLocation(locationId));
}

function paintPointPrice(moneyPrice) {
  return Math.max(1, Math.round(Number(moneyPrice || 0) / 40));
}

function renderPaintCategory(locationId, categoryId, name, basePrice) {
  const moneyPrice = paintMoneyPrice(basePrice, locationId);

  return renderNode("c", {
    i: categoryId,
    l: locationId,
    p: moneyPrice,
    pp: paintPointPrice(moneyPrice),
  }, name);
}

export function normalizePaintColor(color) {
  return String(color || "")
    .replace(/[^0-9a-f]/gi, "")
    .toUpperCase()
    .slice(0, 6);
}

export function buildPaintCategoriesXml() {
  const nodes = [];

  for (const locationId of LOCATION_IDS) {
    nodes.push(renderPaintCategory(locationId, -2, "Full Car", 2500));
    nodes.push(renderPaintCategory(locationId, -1, "Main Body", 750));

    for (const [categoryId, name] of PAINTABLE_PART_CATEGORIES) {
      nodes.push(renderPaintCategory(locationId, categoryId, name, 350));
    }
  }

  return `<n id='getpaintcats'>${nodes.join("")}</n>`;
}

export function buildPaintsXml() {
  const nodes = [];

  for (const locationId of LOCATION_IDS) {
    for (const color of colorsForLocation(locationId)) {
      nodes.push(renderNode("p", {
        l: locationId,
        c: color,
      }));
    }
  }

  return `<n id='getpaints'>${nodes.join("")}</n>`;
}

export function isKnownPaintColor(color) {
  const normalized = normalizePaintColor(color);

  return LOCATION_IDS.some((locationId) => colorsForLocation(locationId).includes(normalized));
}

export function parsePaintJobs(value) {
  return String(value || "")
    .split(",")
    .map((entry) => {
      const [rawPartCategoryId, rawColor] = String(entry || "").split("~");
      const partCategoryId = Number(rawPartCategoryId);
      const color = normalizePaintColor(rawColor);

      return {
        partCategoryId,
        color,
      };
    })
    .filter((job) => (
      Number.isInteger(job.partCategoryId)
      && (job.partCategoryId === -2 || job.partCategoryId === -1 || PAINTABLE_PART_CATEGORY_IDS.has(job.partCategoryId))
      && job.color.length === 6
    ));
}

export function paintPriceForJobs(jobs, paymentType, locationId = 100) {
  const paysWithPoints = String(paymentType || "").toLowerCase() === "p";

  return jobs.reduce((total, job) => {
    const basePrice = job.partCategoryId === -2 ? 2500 : job.partCategoryId === -1 ? 750 : 350;
    const moneyPrice = paintMoneyPrice(basePrice, locationId);

    return total + (paysWithPoints ? paintPointPrice(moneyPrice) : moneyPrice);
  }, 0);
}
