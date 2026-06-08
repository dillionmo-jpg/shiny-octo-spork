import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { samplePlateNumber } from "../license/license-catalog.js";
import { resolveCatalogCarOemWheel, wheelClientDisplayName } from "../wheels/wheels-catalog.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const dataRoot = resolve(moduleDir, "../../../data");
const dealerSeedPath = resolve(dataRoot, "dealer-car-canonical.seed.json");
const partsListPath = resolve(dataRoot, "parts-list.json");
const updatedCslLocationsPath = resolve(dataRoot, "updated-csl-locations.json");

const LOCATION_NAME_BY_ID = {
  100: "Toreno",
  200: "Newburge",
  300: "Creek Side",
  400: "Vista Heights",
  500: "Diamond Point",
};

function loadUpdatedCslLocations() {
  try {
    const parsed = JSON.parse(readFileSync(updatedCslLocationsPath, "utf8"));
    return new Map(
      Object.entries(parsed.locations || {}).map(([catalogCarId, value]) => [
        Number(catalogCarId),
        {
          locationId: Number(value.locationId),
          locationName: String(value.locationName || LOCATION_NAME_BY_ID[value.locationId] || ""),
        },
      ]),
    );
  } catch {
    return new Map();
  }
}

const UPDATED_CSL_LOCATIONS = loadUpdatedCslLocations();

const STOCK_WHEEL = {
  wheelId: 1,
  partId: 1001,
  size: 20,
};

const STOCK_TIRE = {
  designId: 1,
  partId: 1300,
  size: 5,
};

const ENGINE_CATEGORY_ID = 133;
const STOCK_ENGINE_PART_ID_BASE = 700000;
const BLOCKED_PERFORMANCE_PART_IDS = new Set([
  269,
  11187,
]);
const ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID = 173;
const ENGINE_DIAGNOSTIC_TOOL_PART_IDS = new Set([10960]);
const TRACTION_CONTROL_CLIENT_ICON_CATEGORY_ID = 166;
const TRACTION_CONTROL_PART_CATEGORY_IDS = new Set([179, 2011]);
const HELLION_MUSTANG_CATALOG_CAR_ID = 94;
const PREMIUM_RX7_CATALOG_CAR_ID = 17;
const DRAG_SPEC_CAMARO_CATALOG_CAR_ID = 86;
const SPECIAL_DEFAULT_PART_BRANDS = new Set(["hellionpowersystems", "xmotorsports"]);
const HELLION_PERFORMANCE_EXCLUDED_CATEGORY_IDS = new Set([
  2, 65, 71, 73, 74, 75, 76, 77, 128, 129, 130, 140, 141, 144, 160, 161, 162, 163,
]);
const STOCK_OEM_DEFAULT_PART_IDS = new Set([
  10028, 10030, 10137, 10138, 10139, 10140, 10215, 10253, 10254, 10827,
  10927, 10948, 10949, 10951, 10973,
]);

// DEPRECATED: Global paint swatches replaced with per-car OEM colors
// Each car now has its own authentic factory color palette in dealer-car-canonical.seed.json
const FALLBACK_PAINT_SWATCHES = [
  { paintId: 1, colorCode: "FAFAFA", colorName: "White" },
  { paintId: 2, colorCode: "0F0F0F", colorName: "Black" },
  { paintId: 3, colorCode: "DC2626", colorName: "Red" },
  { paintId: 4, colorCode: "C0C0C0", colorName: "Silver" },
  { paintId: 5, colorCode: "1E40AF", colorName: "Blue" },
  { paintId: 6, colorCode: "FACC15", colorName: "Yellow" },
  { paintId: 7, colorCode: "52525B", colorName: "Gray" },
  { paintId: 8, colorCode: "F97316", colorName: "Orange" },
];

const LOCATION_TIERS = [
  { locationId: 100, maxPrice: 30000 },
  { locationId: 200, maxPrice: 55000 },
  { locationId: 300, maxPrice: 90000 },
  { locationId: 400, maxPrice: 175000 },
  { locationId: 500, maxPrice: 999999 },
];

const BRAND_COLORS = [
  "CC3333",
  "FF9900",
  "FFD24D",
  "55CC55",
  "3399FF",
  "9977CC",
  "CC55CC",
  "55CCCC",
];

const SHOWROOM_MENU_GROUPS = [
  {
    id: 10000,
    name: "OE Cars",
    color: "55AACC",
    brands: [
      { id: 10010, name: "Acura", carIds: [1, 6, 20, 28] },
      { id: 10090, name: "Infiniti", carIds: [4, 51] },
      { id: 20030, name: "Mitsubishi", carIds: [2, 27, 40, 87, 88] },
      { id: 10060, name: "Ford", carIds: [3, 5, 26, 32, 45, 54, 68, 71, 78, 131, 138, 144] },
      { id: 10040, name: "Chevrolet", carIds: [7, 18, 34, 36, 46, 48, 52, 66, 82, 83, 100, 108] },
      { id: 10070, name: "Honda", carIds: [8, 9, 30, 31, 37, 44, 74, 76, 94, 105] },
      { id: 10050, name: "Dodge", carIds: [10, 15, 59, 60, 63, 75, 81, 97, 103, 109, 124, 139] },
      { id: 20080, name: "Scion", carIds: [13, 22, 95, 113, 133] },
      { id: 20100, name: "Toyota", carIds: [14, 61, 65, 99, 114, 115, 122, 145] },
      { id: 20010, name: "Mazda", carIds: [16, 24, 73, 107] },
      { id: 20040, name: "Nissan", carIds: [21, 25, 35, 38, 39, 41, 42, 47, 53, 55, 69, 70, 102, 106, 110, 111, 112, 125] },
      { id: 20060, name: "Pontiac", carIds: [33, 43, 49, 50, 56, 85, 135] },
      { id: 20110, name: "Volkswagen", carIds: [58, 62, 64, 67, 77, 84] },
      { id: 10020, name: "Buick", carIds: [72] },
      { id: 20050, name: "Plymouth", carIds: [79, 80, 134] },
      { id: 20090, name: "Subaru", carIds: [12, 89, 91, 92] },
      { id: 10080, name: "Hyundai", carIds: [128, 137] },
      { id: 10030, name: "Cadillac", carIds: [] },
      { id: 10100, name: "Lexus", carIds: [] },
      { id: 20020, name: "Mazdaspeed", carIds: [23, 142] },
      { id: 20070, name: "Porsche", carIds: [136, 140, 148, 158] },
      { id: 20120, name: "McLaren", carIds: [90] },
    ],
  },
  {
    id: 30000,
    name: "Premium Cars",
    color: "CCAA55",
    brands: [
      { id: 30010, name: "AMC", carIds: [117] },
      { id: 30020, name: "Ford", carIds: [127, 141, 143, 149] },
      { id: 30030, name: "Mazda", carIds: [17, 19, 57, 120] },
      { id: 30040, name: "McLaren", carIds: [101, 123] },
      { id: 30050, name: "Porsche", carIds: [150, 160] },
      { id: 30060, name: "Acura", carIds: [29] },
      { id: 30070, name: "Chevy", carIds: [86] },
      { id: 30080, name: "Dodge", carIds: [104] },
    ],
  },
  {
    id: 40000,
    name: "Trophy Cars",
    color: "CC55CC",
    brands: [
      { id: 40010, name: "Acura", carIds: [] },
      { id: 40020, name: "Chevy", carIds: [39] },
      { id: 40030, name: "Dodge", carIds: [70, 116, 129, 155, 156] },
      { id: 40040, name: "Ford", carIds: [69, 94, 126, 146, 147] },
      { id: 40050, name: "Mazda", carIds: [] },
      { id: 40060, name: "Nissan", carIds: [26, 40, 42, 71, 153] },
      { id: 40070, name: "Scion", carIds: [20, 30, 119] },
      { id: 40080, name: "Subaru", carIds: [11, 111, 112] },
      { id: 40090, name: "Misc", carIds: [98, 102, 110, 118, 121, 159] },
    ],
  },
];

const LOCKED_PREMIUM_OR_TROPHY_SHOWROOM_CAR_IDS = new Set(
  SHOWROOM_MENU_GROUPS
    .filter((group) => group.name === "Premium Cars" || group.name === "Trophy Cars")
    .flatMap((group) => group.brands.flatMap((brand) => brand.carIds))
    .map(Number),
);

function loadDealerSeed() {
  const parsed = JSON.parse(readFileSync(dealerSeedPath, "utf8"));
  const dealerCars = Array.isArray(parsed.dealerCars) ? parsed.dealerCars : [];

  return dealerCars
    .filter((car) => Number(car.id) > 0 && Number(car.isActive ?? 1) === 1)
    .map((car) => ({
      id: Number(car.id),
      name: String(car.name || `Car ${car.id}`),
      modelYear: Number(car.modelYear || 0),
      price: Number(car.moneyPrice || 0),
      moneyPrice: Number(car.moneyPrice || 0),
      pointPrice: Number(car.pointPrice ?? Math.max(1, Math.round(Number(car.moneyPrice || 0) / 40))),
      bonusItemId: Number(car.bonusItemId || 0),
      horsepower: Number(car.horsepower || 0),
      torque: Number(car.torque || 0),
      weight: Number(car.weight || 0),
      zeroToSixty: Number(car.zeroToSixty || 0),
      ...(() => {
        const cslLocation = UPDATED_CSL_LOCATIONS.get(Number(car.id));
        const locationId = Number(cslLocation?.locationId || car.locationId || 100);
        return {
          locationId,
          locationName: String(
            cslLocation?.locationName
            || car.locationName
            || LOCATION_NAME_BY_ID[locationId]
            || "",
          ),
        };
      })(),
      brandCategoryId: Number(car.brandCategoryId || 0),
      brandCategoryName: String(car.brandCategoryName || "Other"),
      engineFamily: String(car.engineFamily || ""),
      engineCode: String(car.engineCode || ""),
      stockEngine: String(car.stockEngine || ""),
      stockEngineCode: String(car.stockEngineCode || ""),
      transmission: String(car.transmission || ""),
      inductionSystem: String(car.inductionSystem || ""),
      boostType: String(car.boostType || ""),
      stockBoost: Number(car.stockBoost || 0),
      boostSetting: Number(car.boostSetting || 0),
      maxPsi: Number(car.maxPsi || 0),
      compressionRatio: Number(car.compressionRatio || car.compression || 0),
      drivetrain: String(car.drivetrain || ""),
      carType: String(car.carType || ""),
      isLimited: Number(car.isLimited || 0),
      ...(() => {
        const oemWheel = resolveCatalogCarOemWheel({
          catalogCarId: Number(car.id),
          wheelDesignId: car.wheelDesignId,
          wheelSize: car.wheelSize,
        });
        return {
          wheelDesignId: oemWheel.designId,
          wheelSize: oemWheel.size,
        };
      })(),
      peakRpm: Number(car.peakRpm || 0),
      redlineRpm: Number(car.redlineRpm || 0),
      revLimiterRpm: Number(car.revLimiterRpm || 0),
      torqueCurve: Array.isArray(car.torqueCurve) ? car.torqueCurve.map(Number) : null,
      sortOrder: Number(car.sortOrder ?? car.id),
      oemColors: Array.isArray(car.oemColors) ? car.oemColors : null,
      defaultColorIndex: Number(car.defaultColorIndex ?? 0),
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
}

export const FULL_CAR_CATALOG = loadDealerSeed();

function stockEngineNameForCar(car) {
  return car.stockEngine || car.stockEngineCode || `${car.name} Stock Engine`;
}

function buildStockEngineCatalog(cars) {
  const engines = [];
  const carEngineIds = new Map();

  for (const car of cars) {
    const engineName = stockEngineNameForCar(car);
    const engineCode = car.stockEngineCode || car.engineCode || "";
    const engine = {
      id: STOCK_ENGINE_PART_ID_BASE + Number(car.id),
      name: engineName,
      code: engineCode,
      family: car.engineFamily || "",
      brandName: car.brandCategoryName || "Factory",
      horsepower: Number(car.horsepower || 0),
      torque: Number(car.torque || 0),
      weight: Number(car.stockEngineWeight || 0),
      locationId: Number(car.locationId || 100),
    };

    engines.push(engine);
    carEngineIds.set(Number(car.id), engine.id);
  }

  return {
    engines,
    carEngineIds,
    enginesById: new Map(engines.map((engine) => [Number(engine.id), engine])),
  };
}

export const STOCK_ENGINE_CATALOG = buildStockEngineCatalog(FULL_CAR_CATALOG);

const SHOWROOM_MENU_ASSIGNMENTS = new Map();

function compareDisplayName(left, right) {
  return String(left?.name || "").localeCompare(String(right?.name || ""), undefined, { numeric: true })
    || Number(left?.id || 0) - Number(right?.id || 0);
}

function compareShowroomCars(left, right) {
  const leftParentId = SHOWROOM_MENU_ASSIGNMENTS.get(Number(left.id)) || left.brandCategoryId || 0;
  const rightParentId = SHOWROOM_MENU_ASSIGNMENTS.get(Number(right.id)) || right.brandCategoryId || 0;

  return Number(leftParentId) - Number(rightParentId) || compareDisplayName(left, right);
}

function buildShowroomMenuCategories() {
  const catalogIds = new Set(FULL_CAR_CATALOG.map((car) => Number(car.id)));

  for (const group of SHOWROOM_MENU_GROUPS) {
    for (const brand of group.brands) {
      for (const carId of brand.carIds) {
        if (catalogIds.has(Number(carId))) {
          SHOWROOM_MENU_ASSIGNMENTS.set(Number(carId), brand.id);
        }
      }
    }
  }

  const categories = [];
  for (const [groupIndex, group] of SHOWROOM_MENU_GROUPS.entries()) {
    const brands = group.brands
      .map((brand) => ({
        ...brand,
        activeCarIds: brand.carIds.filter((carId) => SHOWROOM_MENU_ASSIGNMENTS.get(Number(carId)) === brand.id),
      }))
      .filter((brand) => brand.activeCarIds.length > 0);

    if (brands.length === 0) {
      continue;
    }

    categories.push({
      id: group.id,
      parentId: 0,
      childCount: brands.length,
      name: group.name,
      color: group.color || BRAND_COLORS[groupIndex % BRAND_COLORS.length],
    });

    for (const [brandIndex, brand] of brands.entries()) {
      categories.push({
        id: brand.id,
        parentId: group.id,
        childCount: 0,
        name: brand.name,
        color: BRAND_COLORS[(groupIndex + brandIndex) % BRAND_COLORS.length],
      });
    }
  }

  const fallbackCars = FULL_CAR_CATALOG.filter((car) => !SHOWROOM_MENU_ASSIGNMENTS.has(Number(car.id)));
  if (fallbackCars.length > 0) {
    const fallbackGroupId = 90000;
    const fallbackBrandId = 90010;

    categories.push({
      id: fallbackGroupId,
      parentId: 0,
      childCount: 1,
      name: "Other Cars",
      color: "999999",
    });
    categories.push({
      id: fallbackBrandId,
      parentId: fallbackGroupId,
      childCount: 0,
      name: "Unsorted",
      color: "AAAAAA",
    });

    for (const car of fallbackCars) {
      SHOWROOM_MENU_ASSIGNMENTS.set(Number(car.id), fallbackBrandId);
    }
  }

  return categories;
}

const DEALER_CATEGORIES = buildShowroomMenuCategories();

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

  return content ? `${openTag}>${content}</${name}>` : `${openTag}/>`;
}

function loadPartsList() {
  try {
    const parsed = JSON.parse(readFileSync(partsListPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizedPartBrand(part) {
  return String(part?.b || part?.bn || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizedPartSlotId(part) {
  return Number(part?.ci ?? part?.categoryID ?? part?.pi ?? 0);
}

function defaultPartScore(part) {
  return Number(part?.hp || 0) * 100000
    + Number(part?.tq || 0) * 1000
    - Math.max(0, Number(part?.wt || 0))
    + Number(part?.l || 0)
    + Number(part?.i || 0) / 100000;
}

function isHellionDefaultPart(part) {
  return normalizedPartBrand(part) === "hellionpowersystems"
    && !HELLION_PERFORMANCE_EXCLUDED_CATEGORY_IDS.has(normalizedPartSlotId(part));
}

function isXMotorsportsDefaultPart(part) {
  return normalizedPartBrand(part) === "xmotorsports";
}

function renderDefaultCatalogPartXml(part) {
  return renderNode("p", {
    ai: 0,
    i: part.i,
    pi: part.pi,
    ci: part.ci ?? part.pi,
    pcid: part.pcid ?? part.pi,
    categoryID: part.categoryID ?? part.ci ?? part.pi,
    t: part.t,
    pt: part.pt ?? part.t,
    n: part.n,
    p: part.p,
    pp: part.pp,
    g: part.g,
    di: part.di,
    pdi: part.pdi ?? part.di,
    b: part.b,
    bn: part.bn,
    mn: part.mn,
    l: part.l,
    in: 1,
    mo: part.mo ?? 0,
    hp: part.hp ?? 0,
    tq: part.tq ?? 0,
    wt: part.wt ?? 0,
    cc: part.cc ?? 0,
    ps: part.ps,
    fe: part.fe,
    ug: part.ug,
    ar: part.ar,
    afm: part.afm,
    aft: part.aft,
    af: part.af,
    ff: part.ff,
    ef: part.ef,
    eef: part.eef,
    stockBoost: part.stockBoost,
    boostSetting: part.boostSetting,
    maxPsi: part.maxPsi,
    flow: part.ff ?? part.ef ?? part.af ?? part.eef,
  });
}

function renderStockOemDefaultPartXml(part) {
  return renderDefaultCatalogPartXml({
    ...part,
    hp: 0,
    tq: 0,
    wt: 0,
  });
}

function buildDefaultPartsBySlot(parts, predicate) {
  const defaultsBySlot = new Map();

  for (const part of parts) {
    const partId = Number(part?.i || 0);
    const slotId = normalizedPartSlotId(part);
    if (!partId || !slotId || !predicate(part)) {
      continue;
    }

    const existing = defaultsBySlot.get(slotId);
    if (!existing || defaultPartScore(part) >= defaultPartScore(existing)) {
      defaultsBySlot.set(slotId, part);
    }
  }

  return [...defaultsBySlot.values()]
    .sort((left, right) => normalizedPartSlotId(left) - normalizedPartSlotId(right) || Number(left.i || 0) - Number(right.i || 0));
}

const SPECIAL_DEFAULT_PARTS_BY_CAR_ID = (() => {
  const parts = loadPartsList();
  const hellionDefaults = buildDefaultPartsBySlot(parts, isHellionDefaultPart);
  const xMotorsportsDefaults = buildDefaultPartsBySlot(parts, isXMotorsportsDefaultPart);

  return new Map([
    [HELLION_MUSTANG_CATALOG_CAR_ID, hellionDefaults],
    [PREMIUM_RX7_CATALOG_CAR_ID, xMotorsportsDefaults],
    [DRAG_SPEC_CAMARO_CATALOG_CAR_ID, xMotorsportsDefaults],
  ]);
})();

const STOCK_OEM_DEFAULT_PARTS = (() => {
  const parts = loadPartsList();

  return parts
    .filter((part) => STOCK_OEM_DEFAULT_PART_IDS.has(Number(part?.i || 0)))
    .sort((left, right) => Number(left.i || 0) - Number(right.i || 0));
})();

export function isReservedDefaultCatalogPart(part) {
  return SPECIAL_DEFAULT_PART_BRANDS.has(normalizedPartBrand(part));
}

function xmlAttribute(xml, name) {
  const pattern = new RegExp(`\\b${name}=(['"])(.*?)\\1`);
  const match = String(xml || "").match(pattern);

  return match ? match[2] : "";
}

function setXmlAttribute(xml, name, value) {
  const source = String(xml || "");
  const escapedValue = escapeXmlAttribute(value);
  const pattern = new RegExp(`\\b${name}=(['"])(.*?)\\1`);

  if (pattern.test(source)) {
    return source.replace(pattern, `${name}='${escapedValue}'`);
  }

  return source.replace(/\/>$/, ` ${name}='${escapedValue}'/>`);
}

function xmlCategoryCandidates(xml) {
  return ["ci", "categoryID", "pi", "pcid"]
    .map((name) => Number(xmlAttribute(xml, name) || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function isInstalledXmlNode(xml) {
  return Number(xmlAttribute(xml, "in") || 0) === 1;
}

function isTractionControlPartXml(partXml) {
  return isInstalledXmlNode(partXml)
    && xmlCategoryCandidates(partXml).some((categoryId) => TRACTION_CONTROL_PART_CATEGORY_IDS.has(categoryId));
}

function hasTractionControlIconCompatXml(partsXml) {
  const compatPattern = /<(?:p|tc)\b[^>]*\/>/g;

  return [...String(partsXml || "").matchAll(compatPattern)]
    .some((match) => isInstalledXmlNode(match[0])
      && xmlCategoryCandidates(match[0]).includes(TRACTION_CONTROL_CLIENT_ICON_CATEGORY_ID));
}

function renderTractionControlIconCompatXml(partsXml) {
  const partNodes = [...String(partsXml || "").matchAll(/<p\b[^>]*\/>/g)].map((match) => match[0]);
  if (!partNodes.some(isTractionControlPartXml) || hasTractionControlIconCompatXml(partsXml)) {
    return "";
  }

  // The race UI still keys the green TC icon off legacy category 166.
  return renderNode("tc", {
    ci: TRACTION_CONTROL_CLIENT_ICON_CATEGORY_ID,
    categoryID: TRACTION_CONTROL_CLIENT_ICON_CATEGORY_ID,
    pi: TRACTION_CONTROL_CLIENT_ICON_CATEGORY_ID,
    pcid: TRACTION_CONTROL_CLIENT_ICON_CATEGORY_ID,
    n: "Traction Control",
    in: 1,
  });
}

function renderGaragePartsXmlForClient(catalogCarId, partsXml) {
  const installedPartsXml = ensureStockEngineInstalled(catalogCarId, partsXml);

  return `${installedPartsXml}${renderTractionControlIconCompatXml(installedPartsXml)}`;
}

function isBlockedPerformancePartXml(partXml) {
  const partId = Number(xmlAttribute(partXml, "i") || 0);
  const label = `${xmlAttribute(partXml, "n")} ${xmlAttribute(partXml, "mn")}`.toLowerCase();

  return BLOCKED_PERFORMANCE_PART_IDS.has(partId) || label.includes("twin turbo kit");
}

export function stripBlockedPerformanceParts(partsXml = "") {
  return String(partsXml || "").replace(/<p\b[^>]*\/>/g, (partXml) => (
    isBlockedPerformancePartXml(partXml) ? "" : partXml
  ));
}

function isEnginePartXml(partXml) {
  const categoryId = Number(
    xmlAttribute(partXml, "ci")
    || xmlAttribute(partXml, "pi")
    || xmlAttribute(partXml, "pcid")
    || 0,
  );
  const partType = String(xmlAttribute(partXml, "t") || xmlAttribute(partXml, "pt") || "").toLowerCase();

  return categoryId === ENGINE_CATEGORY_ID && partType !== "c";
}

function partXmlSlotId(partXml) {
  return Number(xmlAttribute(partXml, "ci") || xmlAttribute(partXml, "categoryID") || xmlAttribute(partXml, "pi") || 0);
}

function ensureSpecialDefaultPartsInstalled(catalogCarId, partsXml = "") {
  const defaults = SPECIAL_DEFAULT_PARTS_BY_CAR_ID.get(Number(catalogCarId));
  if (!defaults?.length) {
    return String(partsXml || "");
  }

  const installedSlots = new Set(
    [...String(partsXml || "").matchAll(/<p\b[^>]*\/>/g)]
      .map((match) => partXmlSlotId(match[0]))
      .filter((slotId) => slotId > 0),
  );
  let output = String(partsXml || "");

  for (const part of defaults) {
    const slotId = normalizedPartSlotId(part);
    if (!slotId || installedSlots.has(slotId)) {
      continue;
    }

    output += renderDefaultCatalogPartXml(part);
    installedSlots.add(slotId);
  }

  return output;
}

function ensureStockOemDefaultPartsInstalled(partsXml = "") {
  const installedPartIds = new Set(
    [...String(partsXml || "").matchAll(/<p\b[^>]*\/>/g)]
      .map((match) => Number(xmlAttribute(match[0], "i") || 0))
      .filter((partId) => partId > 0),
  );
  const installedSlots = new Set(
    [...String(partsXml || "").matchAll(/<p\b[^>]*\/>/g)]
      .map((match) => partXmlSlotId(match[0]))
      .filter((slotId) => slotId > 0),
  );
  let output = String(partsXml || "");

  for (const part of STOCK_OEM_DEFAULT_PARTS) {
    const partId = Number(part?.i || 0);
    const slotId = normalizedPartSlotId(part);
    if (!partId || !slotId || installedPartIds.has(partId) || installedSlots.has(slotId)) {
      continue;
    }

    output += renderStockOemDefaultPartXml(part);
    installedPartIds.add(partId);
    installedSlots.add(slotId);
  }

  return output;
}

function isFactoryStockEngineXml(partXml) {
  const partId = Number(xmlAttribute(partXml, "i") || 0);
  const installId = Number(xmlAttribute(partXml, "ai") || 0);
  const brandId = String(xmlAttribute(partXml, "b") || "").toLowerCase();

  return isEnginePartXml(partXml)
    && (brandId === "factory" || installId === 0 || (partId >= STOCK_ENGINE_PART_ID_BASE && partId < STOCK_ENGINE_PART_ID_BASE + 10000));
}

function isAirFuelControllerXml(partXml) {
  const explicitKind = String(xmlAttribute(partXml, "afm") || "").toLowerCase();
  const explicitType = Number(xmlAttribute(partXml, "aft") || 0);
  const text = `${xmlAttribute(partXml, "n")} ${xmlAttribute(partXml, "mn")}`.toLowerCase();

  return explicitKind === "controller"
    || explicitType === 2
    || (text.includes("air") && text.includes("fuel") && text.includes("controller"));
}

function isAirFuelMeterXml(partXml) {
  const explicitKind = String(xmlAttribute(partXml, "afm") || "").toLowerCase();
  const explicitType = Number(xmlAttribute(partXml, "aft") || 0);
  const text = `${xmlAttribute(partXml, "n")} ${xmlAttribute(partXml, "mn")}`.toLowerCase();

  return explicitKind === "meter"
    || explicitType === 1
    || (text.includes("air") && text.includes("fuel") && text.includes("meter"));
}

function isEngineDiagnosticToolXml(partXml) {
  const partId = Number(xmlAttribute(partXml, "i") || 0);
  const text = `${xmlAttribute(partXml, "n")} ${xmlAttribute(partXml, "mn")}`.toLowerCase();

  return ENGINE_DIAGNOSTIC_TOOL_PART_IDS.has(partId)
    || text.includes("evo-manage")
    || text.includes("diagnostic tool");
}

function normalizeAirFuelControllerXml(partsXml) {
  return String(partsXml || "").replace(/<p\b[^>]*\/>/g, (partXml) => {
    if (isEngineDiagnosticToolXml(partXml)) {
      let output = setXmlAttribute(partXml, "pi", ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID);
      output = setXmlAttribute(output, "ci", ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID);
      output = setXmlAttribute(output, "pcid", ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID);
      output = setXmlAttribute(output, "categoryID", ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID);

      return output;
    }

    if (isAirFuelControllerXml(partXml)) {
      let output = setXmlAttribute(partXml, "pi", 26);
      output = setXmlAttribute(output, "ci", 26);
      output = setXmlAttribute(output, "pcid", 26);
      output = setXmlAttribute(output, "categoryID", 26);
      output = setXmlAttribute(output, "afm", "controller");
      output = setXmlAttribute(output, "aft", 2);

      return output;
    }

    if (isAirFuelMeterXml(partXml)) {
      let output = setXmlAttribute(partXml, "pi", 134);
      output = setXmlAttribute(output, "ci", 134);
      output = setXmlAttribute(output, "pcid", 134);
      output = setXmlAttribute(output, "categoryID", 134);
      output = setXmlAttribute(output, "afm", "meter");
      output = setXmlAttribute(output, "aft", 1);

      return output;
    }

      return partXml;
  });
}

export function getStockEnginePartForCar(catalogCarId) {
  const engineId = STOCK_ENGINE_CATALOG.carEngineIds.get(Number(catalogCarId));

  return engineId ? STOCK_ENGINE_CATALOG.enginesById.get(engineId) || null : null;
}

export function renderStockEnginePartXml(catalogCarId) {
  const car = getCatalogCar(catalogCarId);
  const engine = getStockEnginePartForCar(catalogCarId);

  if (!car || !engine) {
    return "";
  }

  return renderNode("p", {
    ai: 0,
    i: engine.id,
    pi: ENGINE_CATEGORY_ID,
    ci: ENGINE_CATEGORY_ID,
    pcid: ENGINE_CATEGORY_ID,
    categoryID: ENGINE_CATEGORY_ID,
    t: "e",
    pt: "e",
    n: engine.name,
    p: 0,
    pp: 0,
    g: "C",
    di: car.id,
    pdi: car.id,
    b: "factory",
    bn: engine.brandName || "Factory",
    mn: engine.code || engine.name,
    l: car.locationId,
    in: 1,
    mo: 0,
    hp: engine.horsepower,
    tq: engine.torque,
    wt: engine.weight,
    cc: 0,
    eef: Math.max(1, Number(((Number(engine.horsepower || 0) + Number(engine.torque || 0)) / 20).toFixed(3))),
    flow: Math.max(1, Number(((Number(engine.horsepower || 0) + Number(engine.torque || 0)) / 20).toFixed(3))),
  });
}

export function ensureStockEngineInstalled(catalogCarId, partsXml = "") {
  const source = normalizeAirFuelControllerXml(stripBlockedPerformanceParts(partsXml));
  const stockEngineXml = renderStockEnginePartXml(catalogCarId);
  let hasEngine = false;
  let refreshedStockEngine = false;
  const refreshedSource = source.replace(/<p\b[^>]*\/>/g, (partXml) => {
    if (!isEnginePartXml(partXml)) {
      return partXml;
    }

    hasEngine = true;
    if (!refreshedStockEngine && isFactoryStockEngineXml(partXml)) {
      refreshedStockEngine = true;
      return stockEngineXml;
    }

    return partXml;
  });

  const withStockEngine = hasEngine ? refreshedSource : `${refreshedSource}${stockEngineXml}`;
  const withSpecialDefaults = ensureSpecialDefaultPartsInstalled(catalogCarId, withStockEngine);

  return ensureStockOemDefaultPartsInstalled(withSpecialDefaults);
}

function garageCarsForRepair(account) {
  const cars = [];
  const seen = new Set();

  for (const car of [account?.starterCar, ...(Array.isArray(account?.garageCars) ? account.garageCars : [])]) {
    if (!car) {
      continue;
    }

    const accountCarId = Number(car.accountCarId || 0);
    if (accountCarId > 0 && seen.has(accountCarId)) {
      continue;
    }
    if (accountCarId > 0) {
      seen.add(accountCarId);
    }

    cars.push(car);
  }

  return cars;
}

export function repairGarageCarEngineParts(storedCar) {
  if (!storedCar) {
    return false;
  }

  const catalogCarId = Number(storedCar.catalogCarId || storedCar.ci || 0);
  if (!catalogCarId) {
    return false;
  }

  const before = String(storedCar.partsXml || "");
  const after = ensureStockEngineInstalled(catalogCarId, before);
  if (after === before) {
    return false;
  }

  storedCar.partsXml = after;
  return true;
}

export function repairAccountGarageEngines(account) {
  let changed = false;

  for (const car of garageCarsForRepair(account)) {
    if (repairGarageCarEngineParts(car)) {
      changed = true;
    }
  }

  return changed;
}

export function getCatalogCar(catalogCarId) {
  return FULL_CAR_CATALOG.find((car) => Number(car.id) === Number(catalogCarId)) || null;
}

export function getCatalogCarName(catalogCarId) {
  return getCatalogCar(catalogCarId)?.name || "Unknown";
}

export function getCatalogCarPrice(catalogCarId) {
  return Number(getCatalogCar(catalogCarId)?.moneyPrice || 0);
}

export function getCatalogCarPointPrice(catalogCarId) {
  const car = getCatalogCar(catalogCarId);

  return car ? Number(car.pointPrice || 0) : -1;
}

export function getShowroomMenuGroupNameForCar(catalogCarId) {
  const normalizedCarId = Number(catalogCarId);

  for (const group of SHOWROOM_MENU_GROUPS) {
    for (const brand of group.brands) {
      if (brand.carIds.includes(normalizedCarId)) {
        return group.name;
      }
    }
  }

  return "Other Cars";
}

export function isShowroomCarLocked(catalogCarId) {
  return LOCKED_PREMIUM_OR_TROPHY_SHOWROOM_CAR_IDS.has(Number(catalogCarId));
}

export function getShowroomLocationIdForPrice(price) {
  const normalizedPrice = Number(price) || 0;
  const tier = LOCATION_TIERS.find((item) => normalizedPrice <= item.maxPrice);

  return tier?.locationId || 500;
}

export function getShowroomLocationIdForCar(catalogCarId) {
  return Number(getCatalogCar(catalogCarId)?.locationId || getShowroomLocationIdForPrice(getCatalogCarPrice(catalogCarId)));
}

export function getCatalogCarSellValue(catalogCarId) {
  const car = getCatalogCar(catalogCarId);
  const purchasePrice = Number(car?.moneyPrice || car?.price || 0);

  if (purchasePrice <= 0 && Number(car?.pointPrice || 0) > 0) {
    return 0;
  }

  if (purchasePrice > 0) {
    return Math.max(1, Math.floor(purchasePrice * 0.35));
  }

  const locationId = getShowroomLocationIdForCar(catalogCarId);
  const fallbackSellValues = new Map([
    [100, 5000],
    [200, 10000],
    [300, 15000],
    [400, 20000],
    [500, 25000],
  ]);

  return fallbackSellValues.get(locationId) || 5000;
}

export function normalizeCarColor(color) {
  return String(color || "C0C0C0").replace(/[^0-9a-f]/gi, "").toUpperCase().slice(0, 6) || "C0C0C0";
}

function pointPriceForCar(car) {
  return Number(car?.pointPrice || 0) || Math.max(1, Math.round(Number(car?.moneyPrice || car?.price || 0) / 40));
}

function passengerCountForCar(car) {
  if (/sedan|wagon|hatch|truck|suv/i.test(car.carType) || /charger|impala|accord|galant|sentra|altima|cobalt|dart|leaf|jetta|cube/i.test(car.name)) {
    return 4;
  }
  return 2;
}

function engineLabelForCar(car) {
  return car.stockEngine || car.engineFamily || "Stock";
}

function drivetrainLabelForCar(car) {
  return car.drivetrain || "RWD";
}

function typeLabelForCar(car) {
  return car.carType || "Coupe";
}

function transmissionLabelForCar(car) {
  return car.transmission || "Manual";
}

function powerLabelForCar(car) {
  const horsepower = Number(car.horsepower || 0);
  const torque = Number(car.torque || 0);

  if (horsepower > 0 && torque > 0) {
    return `${horsepower} hp / ${torque} tq`;
  }
  if (horsepower > 0) {
    return `${horsepower} hp`;
  }
  return "Stock tune";
}

function estimateQuarterMile(car) {
  if (Number(car.zeroToSixty || 0) > 0) {
    return Number(car.zeroToSixty).toFixed(1);
  }

  const horsepower = Number(car.horsepower || 0);
  const weight = Number(car.weight || 0);

  if (horsepower > 0 && weight > 0) {
    const estimate = 5.825 * Math.cbrt(weight / horsepower);
    return Math.max(8.0, Math.min(18.5, estimate)).toFixed(1);
  }

  if (car.moneyPrice >= 175000) {
    return "10.8";
  }
  if (car.moneyPrice >= 90000) {
    return "11.8";
  }
  if (car.moneyPrice >= 55000) {
    return "12.6";
  }
  if (car.moneyPrice >= 30000) {
    return "13.7";
  }
  return "15.1";
}

function renderPaintSwatches(car) {
  // Use car-specific OEM colors if available, otherwise use fallback
  const swatches = car?.oemColors || FALLBACK_PAINT_SWATCHES;
  
  return swatches.map((swatch) => renderNode("p", {
    i: swatch.paintId,
    cd: swatch.colorCode,
  })).join("");
}

export function renderStockWheelXml(car = {}) {
  const catalogCar = getCatalogCar(car.catalogCarId || car.ci || car.id);
  const wheelDesignId = Number(car.wheelDesignId || catalogCar?.wheelDesignId || STOCK_WHEEL.wheelId);
  const wheelSize = Number(car.wheelSize || catalogCar?.wheelSize || STOCK_WHEEL.size);

  return renderNode("ws", {}, renderNode("w", {
    wid: wheelDesignId,
    id: Number(car.wheelPartId || STOCK_WHEEL.partId),
    ws: wheelSize,
    n: wheelClientDisplayName({ designId: wheelDesignId, size: wheelSize }),
  }));
}

export function buildCarCategoryXml() {
  const categories = DEALER_CATEGORIES
    .map((category) => renderNode("c", {
      i: category.id,
      pi: category.parentId,
      c: category.childCount,
      p: 0,
      n: category.name,
      cl: category.color,
    }))
    .join("");

  return renderNode("cats", {}, categories);
}

function renderShowroomCar(car, selectedCarId) {
  // Use car's default OEM color from its palette
  const defaultColorIndex = Number(car.defaultColorIndex ?? 0);
  const oemColors = car?.oemColors || FALLBACK_PAINT_SWATCHES;
  const defaultColor = oemColors[defaultColorIndex] || oemColors[0] || FALLBACK_PAINT_SWATCHES[0];
  const color = defaultColor.colorCode;
  
  const locked = isShowroomCarLocked(car.id) ? 1 : 0;
  const displayMoneyPrice = locked ? 0 : car.moneyPrice;
  const displayPointPrice = locked ? 0 : pointPriceForCar(car);

  return renderNode("c", {
    ai: 0,
    id: car.id,
    i: car.id,
    ci: car.id,
    sel: Number(car.id) === Number(selectedCarId) ? 1 : 0,
    pi: SHOWROOM_MENU_ASSIGNMENTS.get(Number(car.id)) || car.brandCategoryId,
    pn: "",
    l: car.locationId,
    lid: car.locationId,
    cid: car.locationId,
    b: 0,
    n: car.name,
    c: car.name,
    p: displayMoneyPrice,
    pr: displayMoneyPrice,
    pp: displayPointPrice,
    cp: displayMoneyPrice,
    lk: locked,
    ae: 0,
    cc: color,
    g: "",
    ii: 0,
    wid: car.wheelDesignId || STOCK_WHEEL.wheelId,
    ws: car.wheelSize || STOCK_WHEEL.size,
    rh: 0,
    ts: STOCK_TIRE.size,
    mo: Number(car.isLimited || 0),
    cbl: 0,
    cb: 0,
    po: 0,
    poc: 0,
    led: "",
    le: 0,
    lea: 999,
    les: 0,
    lec: 999,
    let: 0,
    eo: engineLabelForCar(car),
    dt: drivetrainLabelForCar(car),
    np: passengerCountForCar(car),
    ct: typeLabelForCar(car),
    et: powerLabelForCar(car),
    tt: transmissionLabelForCar(car),
    sw: Number(car.weight || 0),
    st: estimateQuarterMile(car),
    y: car.modelYear || "",
  }, renderPaintSwatches(car));
}

export function buildDealerShowroomXml(locationId = 100) {
  const selectedCarId = FULL_CAR_CATALOG.find((car) => Number(car.locationId) === Number(locationId))?.id
    || FULL_CAR_CATALOG[0]?.id
    || 0;
  const cars = [...FULL_CAR_CATALOG]
    .sort(compareShowroomCars)
    .map((car) => renderShowroomCar(car, selectedCarId))
    .join("");

  return renderNode("cars", {
    i: 0,
    dc: selectedCarId,
    l: Number(locationId) || 100,
  }, cars);
}

const SUSPENSION_CATEGORY_IDS = new Set([114, 1142]);

function installedRideHeight(partsXml) {
  const parts = [...String(partsXml || "").matchAll(/<p\b[^>]*\/>/g)].map((m) => m[0]);

  for (const partXml of parts) {
    const ci = Number(xmlAttribute(partXml, "ci") || xmlAttribute(partXml, "pi") || 0);
    if (SUSPENSION_CATEGORY_IDS.has(ci)) {
      const ps = Number(xmlAttribute(partXml, "ps") || 0);
      if (ps > 0) return ps;
    }
  }

  return 0;
}

export function renderOwnedGarageCarXml(account, storedCar, { selected = false } = {}) {
  const catalogCarId = Number(storedCar?.catalogCarId || storedCar?.ci || storedCar?.id || 1);
  const catalogCar = getCatalogCar(catalogCarId) || getCatalogCar(1);
  const accountCarId = Number(storedCar?.accountCarId || storedCar?.i || account?.id || 1);
  const locationId = Number(storedCar?.locationId || account?.locationId || catalogCar?.locationId || 100) || 100;
  const color = normalizeCarColor(storedCar?.color || storedCar?.cc);
  const wheelXml = renderStockWheelXml({ ...storedCar, catalogCarId });
  const partsXml = renderGaragePartsXmlForClient(catalogCarId, storedCar?.partsXml || "");
  const plateId = Number(storedCar?.plateId || 1) || 1;
  const plateNumber = String(storedCar?.plateNumber || samplePlateNumber(plateId));
  const accountId = Number(account?.id || storedCar?.accountId || storedCar?.aid || storedCar?.uid || 0);
  const username = escapeXmlAttribute(account?.username || storedCar?.username || storedCar?.u || storedCar?.un || "");
  // `lk` is race lock (used-car lot). Build/tuning lock (`isLocked`) must not set this.
  const lockFlag = Number(storedCar?.usedCarListingId || 0) > 0 ? 1 : 0;
  const rideHeight = installedRideHeight(storedCar?.partsXml || "");

  return renderNode("c", {
    ai: 0,
    aid: accountId,
    uid: accountId,
    pid: accountId,
    accountid: accountId,
    playerid: accountId,
    id: accountCarId,
    i: accountCarId,
    ci: catalogCar.id,
    sel: selected ? 1 : 0,
    pi: plateId,
    pn: plateNumber,
    l: locationId,
    lid: locationId,
    cid: locationId,
    b: 0,
    n: catalogCar.name,
    c: catalogCar.name,
    u: username,
    un: username,
    user: username,
    username,
    userName: username,
    owner: username,
    ownername: username,
    ownerName: username,
    on: username,
    ou: username,
    p: catalogCar.moneyPrice,
    pr: catalogCar.moneyPrice,
    pp: pointPriceForCar(catalogCar),
    cp: catalogCar.moneyPrice,
    lk: lockFlag,
    ae: 0,
    cc: color,
    g: "",
    ii: 0,
    wid: Number(storedCar?.wheelDesignId || catalogCar.wheelDesignId || STOCK_WHEEL.wheelId),
    ws: Number(storedCar?.wheelSize || catalogCar.wheelSize || STOCK_WHEEL.size),
    rh: rideHeight,
    ts: Number(storedCar?.tireSize || STOCK_TIRE.size),
    mo: 0,
    cbl: 0,
    cb: 0,
    po: 0,
    poc: 0,
    led: "",
    le: 0,
    lea: 999,
    les: 0,
    lec: 999,
    let: 0,
    eo: engineLabelForCar(catalogCar),
    dt: drivetrainLabelForCar(catalogCar),
    np: passengerCountForCar(catalogCar),
    ct: typeLabelForCar(catalogCar),
    et: Number(storedCar?.engineTypeId || 1),
    tt: "Manual",
    sw: Number(catalogCar.weight || 0),
    st: estimateQuarterMile(catalogCar),
    y: catalogCar.modelYear || "",
  }, `${wheelXml}${partsXml}`);
}
