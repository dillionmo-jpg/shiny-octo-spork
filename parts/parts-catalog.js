import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
import {
  buildGraphicsCatalogParts,
  BUILT_IN_GRAPHIC_CATEGORY_IDS,
  GRAPHICS_SHOP_CUSTOM_CATEGORY_ID,
  GRAPHICS_SHOP_FULL_CATEGORY_ID,
  GRAPHICS_SHOP_GAUGE_CATEGORY_ID,
  GRAPHICS_SHOP_PANEL_CATEGORY_ID,
  GRAPHICS_SHOP_ROOT_CATEGORY_ID,
  GRAPHICS_SHOP_STORE_TYPE,
  GRAPHIC_SLOT_CONFIGS,
  GRAPHIC_SLOT_IDS,
  graphicSlotForPartId,
} from "../graphics/user-graphics.js";
import { moneyToPointPrice } from "../economy/point-pricing.js";
import { getCatalogCar, isReservedDefaultCatalogPart } from "../showroom/car-showroom.js";

const catalogCache = new Map();
const PARTS_LIST_REFERENCE_PATH = join(
  "backend-reference",
  "backend-lingo-reference",
  "Incorrect Reference backend",
  "Parts-List.json",
);
const PARTS_REBALANCE_REFERENCE_PATH = join(
  "backend-reference",
  "backend-lingo-reference",
  "Incorrect Reference backend",
  "organizing-parts-rebalanced.js",
);
const MASTER_PARTS_CATALOG_REFERENCE_PATH = join(
  "backend-reference",
  "backend-lingo-reference",
  "Incorrect Reference backend",
  "NITTO 1320 LEGENDS - MASTER PARTS CATALOG.txt",
);
const MASTER_PARTS_CATALOG_ROOT_REFERENCE_PATH = join(
  "backend-reference",
  "backend-lingo-reference",
  "NITTO 1320 LEGENDS - MASTER PARTS CATALOG.txt",
);
const MASTER_PARTS_CATALOG_SHOP_REFERENCE_PATH = join(
  "backend-reference",
  "backend-lingo-reference",
  "NITTO 1320 LEGENDS - MASTER PARTS CATALOG Parts Shop.txt",
);
const VALID_LOCATION_IDS = new Set([100, 200, 300, 400, 500]);
const DEFAULT_CLIENT_CAR_PACKAGES_ROOT = "C:\\Program Files (x86)\\Nitto 1320 Legends\\cache\\car\\packages";
const TORENO_LOCATION_ID = 100;
const NEWBURGE_LOCATION_ID = 200;
const CREEK_SIDE_LOCATION_ID = 300;
const HIDDEN_CATALOG_PART_IDS = new Set([
  // Twin Turbo kits — overpowered and not offered for sale.
  269,
  11187,
]);
const NON_PURCHASABLE_CATALOG_PART_IDS = new Set([]);

export function isHiddenCatalogPart(part) {
  const partId = Number(part?.i || 0);
  if (HIDDEN_CATALOG_PART_IDS.has(partId)) {
    return true;
  }

  const label = `${part?.n || ""} ${part?.mn || ""}`.toLowerCase();
  return label.includes("twin turbo kit");
}

export function isNonPurchasableCatalogPart(part) {
  const partId = Number(part?.i || 0);
  if (NON_PURCHASABLE_CATALOG_PART_IDS.has(partId)) {
    return true;
  }

  return isHiddenCatalogPart(part);
}
const FIXED_TORENO_PART_IDS = new Set([276]);
const FIXED_NEWBURGE_PART_IDS = new Set([10014, 10079, 10329, 10849]);
const FIXED_CREEK_SIDE_PART_IDS = new Set([10960]);
const GARAGE_BIN_STORE_TYPE = "9";
const TIRE_CATEGORY_ID = 13;
const WHEEL_CATEGORY_ID = 14;
const GEAR_RATIO_CATEGORY_ID = 22;
const EXTERIOR_ASSET_CATEGORIES = [
  { categoryId: 65, files: [{ view: "f", file: "spoiler.swf" }, { view: "b", file: "spoiler.swf" }] },
  { categoryId: 71, files: [{ view: "f", file: "hood.swf" }] },
  { categoryId: 74, files: [{ view: "f", file: "hoodFrontEffect.swf" }] },
  { categoryId: 75, files: [{ view: "f", file: "eyelids.swf" }] },
  { categoryId: 76, files: [{ view: "f", file: "lights.swf" }] },
  { categoryId: 77, files: [{ view: "b", file: "tailLights.swf" }] },
  { categoryId: 128, files: [{ view: "f", file: "bumper.swf" }] },
  { categoryId: 129, files: [{ view: "f", file: "skirt.swf" }, { view: "b", file: "skirt.swf" }] },
  { categoryId: 130, files: [{ view: "b", file: "bumperRear.swf" }] },
  { categoryId: 140, files: [{ view: "f", file: "grille.swf" }] },
  { categoryId: 141, files: [{ view: "f", file: "fenderEffect.swf" }, { view: "b", file: "fenderEffect.swf" }] },
  { categoryId: 73, files: [{ view: "f", file: "sideEffect.swf" }, { view: "b", file: "sideEffect.swf" }] },
  { categoryId: 144, files: [{ view: "b", file: "trunk.swf" }] },
  { categoryId: 160, files: [{ view: "f", file: "decalLoader.swf" }] },
  { categoryId: 161, files: [{ view: "f", file: "decalLoader.swf" }, { view: "b", file: "decalLoader.swf" }] },
  { categoryId: 162, files: [{ view: "f", file: "decalLoader.swf" }] },
  { categoryId: 163, files: [{ view: "b", file: "decalLoader.swf" }] },
];
const EXTERIOR_ASSET_CATEGORY_IDS = new Set(EXTERIOR_ASSET_CATEGORIES.map((category) => category.categoryId));
const GENERATED_EXTERIOR_CATEGORY_IDS = new Set([
  65, 71, 73, 74, 75, 76, 77, 128, 129, 130, 140, 141, 144,
]);
const FORCED_INDUCTION_CATEGORY_IDS = new Set([62, 61, 87, 86, 137, 18, 23, 81, 82]);
const TUNING_AIR_FLOW_CATEGORY_IDS = new Set([47, 48, 96, 97, 81, 82, 86, 87, 137]);
const TUNING_FUEL_FLOW_CATEGORY_IDS = new Set([49, 51, 52, 54, 201, 202, 2165, 2167, 2168, 2169, 2170]);
const TUNING_EXHAUST_FLOW_CATEGORY_IDS = new Set([55, 56, 57, 59, 61, 62, 63]);
const AIR_FUEL_METER_CATEGORY_ID = 134;
const AIR_FUEL_CONTROLLER_CATEGORY_ID = 26;
const AIR_FUEL_CONTROLLER_DESIGN_ID = 5;
const ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID = 173;
const SHIFT_LIGHT_CATEGORY_ID = 15;
const GEAR_RATIO_LEAF_NAMES = new Set(["gear box", "gearbox", "transmission", "transmissions"]);
const GEAR_RATIO_DISPLAY_LEAF_NAMES = new Set(["gear box", "gearbox"]);
const GRAPHICS_PANEL_MENU_ORDER = Object.freeze([
  { slotId: 163, name: "Back Panels" },
  { slotId: 162, name: "Front Panels" },
  { slotId: 160, name: "Hood Panels" },
  { slotId: 161, name: "Side Panels" },
]);
const RAW_FALLBACK_EXCLUDED_CATEGORY_IDS = new Set([
  2,
  19,
  ...GENERATED_EXTERIOR_CATEGORY_IDS,
]);
const RAW_FALLBACK_EXCLUDED_BRAND_KEYS = new Set([
  "hellionpowersystems",
  "xmotorsports",
]);
const GENERATED_GAUGE_GRAPHIC_PARTS = Object.freeze([
  { id: 917201, name: "Gauge Graphics 1", designId: 1, price: 0, points: 500, location: 100 },
  { id: 917202, name: "Gauge Graphics 2", designId: 2, price: 0, points: 500, location: 100 },
  { id: 917203, name: "Gauge Graphics 3", designId: 3, price: 0, points: 600, location: 100 },
  { id: 917204, name: "Gauge Graphics 4", designId: 4, price: 0, points: 650, location: 100 },
  { id: 917205, name: "Gauge Graphics 5", designId: 5, price: 0, points: 700, location: 100 },
  { id: 917206, name: "Gauge Graphics 6", designId: 6, price: 0, points: 750, location: 100 },
  { id: 917207, name: "Gauge Graphics 7", designId: 7, price: 0, points: 850, location: 100 },
  { id: 917208, name: "Gauge Graphics 8", designId: 8, price: 0, points: 950, location: 100 },
  { id: 917209, name: "Gauge Graphics 9", designId: 9, price: 0, points: 1000, location: 100 },
  { id: 917210, name: "Gauge Graphics 10", designId: 10, price: 0, points: 5000, location: 500 },
]);
const GENERATED_SHIFT_LIGHT_PARTS = Object.freeze([
  { id: 915001, name: "Basic Shift Light", designId: 1, price: 350, points: 9, location: 100 },
  { id: 915002, name: "Programmable Shift Light", designId: 2, price: 900, points: 23, location: 300 },
  { id: 915003, name: "Pro Shift Light Indicator", designId: 3, price: 1450, points: 36, location: 500 },
]);
const GENERATED_COMPATIBILITY_PARTS = Object.freeze([
  { categoryId: 2, name: "Universal Appearance Hardware", type: "c", brand: "Universal", price: 150, points: 4, designId: 1 },
  { categoryId: 16, name: "Starter Exhaust System", brand: "Universal", price: 650, points: 16, designId: 1, ef: 12 },
  { categoryId: 17, name: "Street Head Package", brand: "Universal", price: 1500, points: 38, designId: 1, hp: 12, tq: 8 },
  { categoryId: 19, name: "Basic Gauge Controller Kit", brand: "Universal", price: 450, points: 11, designId: 1 },
  { categoryId: 21, name: "Starter Nitrous System", brand: "Universal", price: 1200, points: 30, designId: 1, hp: 25, tq: 18 },
  { categoryId: 39, name: "Replacement Engine Block", brand: "Universal", price: 2200, points: 55, designId: 1 },
  { categoryId: 45, name: "Replacement Valve Set", brand: "Universal", price: 700, points: 18, designId: 1 },
  { categoryId: 68, name: "Universal Roof Scoop", type: "c", brand: "Aftermarket", price: 500, points: 13, designId: 1 },
  { categoryId: 72, name: "Universal Hood Center Effect", type: "c", brand: "Aftermarket", price: 500, points: 13, designId: 1 },
  { categoryId: 102, name: "Single Nitrous Bottle", brand: "Nitrous Express", price: 850, points: 21, designId: 1 },
  { categoryId: 135, name: "Replacement Connecting Rod Set", brand: "Universal", price: 1100, points: 28, designId: 1, tq: 5 },
  { categoryId: 136, name: "Replacement Head Gasket", brand: "Universal", price: 350, points: 9, designId: 1 },
  { categoryId: 142, name: "Universal Fender Effect", type: "c", brand: "Aftermarket", price: 550, points: 14, designId: 1 },
  { categoryId: 143, name: "Universal Door Effect", type: "c", brand: "Aftermarket", price: 550, points: 14, designId: 1 },
  { categoryId: 145, name: "Universal Paint Accent", type: "c", brand: "Aftermarket", price: 400, points: 10, designId: 1 },
  { categoryId: 153, name: "Rotary Engine Block", brand: "Rotary Works", price: 2200, points: 55, designId: 1 },
  { categoryId: 154, name: "Apex Seal Set", brand: "Rotary Works", price: 900, points: 23, designId: 1 },
  { categoryId: 155, name: "Rotor Set", brand: "Rotary Works", price: 1400, points: 35, designId: 1 },
  { categoryId: 156, name: "Rotor Housing Set", brand: "Rotary Works", price: 1800, points: 45, designId: 1 },
  { categoryId: 157, name: "Corner and Side Seal Set", brand: "Rotary Works", price: 700, points: 18, designId: 1 },
  { categoryId: 158, name: "Street Carburetor", brand: "Universal", price: 900, points: 23, designId: 1, hp: 8, tq: 6, af: 18 },
  { categoryId: 165, name: "Synthetic Oil Service", brand: "Royal Purple", price: 250, points: 6, designId: 1 },
  { categoryId: 167, name: "Fluid Service Kit", brand: "Universal", price: 180, points: 5, designId: 1 },
  { categoryId: 168, name: "Performance Oil Filter", brand: "Royal Purple", price: 120, points: 3, designId: 1 },
  { categoryId: 169, name: "Performance Coolant", brand: "Mishimoto", price: 160, points: 4, designId: 1 },
  { categoryId: 170, name: "Traction Compound", brand: "Nitto", price: 150, points: 4, designId: 1 },
  { categoryId: 190, name: "Replacement Piston Set", brand: "Universal", price: 1200, points: 30, designId: 1, hp: 5 },
  { categoryId: 205, name: "Nitrous Fogger Kit", brand: "Nitrous Express", price: 950, points: 24, designId: 1, hp: 15, tq: 12 },
  { categoryId: 1143, name: "Street Brake Rotor Kit", type: "c", brand: "Universal", price: 900, points: 23, designId: 1 },
  { categoryId: 1145, name: "Universal Wheel Set", type: "c", brand: "Universal", price: 1200, points: 30, designId: 1 },
  { partId: 992003, categoryId: AIR_FUEL_CONTROLLER_CATEGORY_ID, name: "CPR Air/Fuel Controller", brand: "CPR", price: 1200, points: 30, designId: 1 },
  { partId: 992004, categoryId: 175, name: "CPR Lightweight Battery", brand: "CPR", price: 900, points: 23, designId: 1, wt: -4 },
  { partId: 992005, categoryId: 23, name: "CPR Boost Controller", brand: "CPR", price: 1400, points: 35, designId: 1 },
  { partId: 992006, categoryId: 174, name: "CPR ECU Tune", brand: "CPR", price: 1600, points: 40, designId: 1, hp: 10, tq: 8 },
  { partId: 992010, categoryId: 178, name: "CPR Spark Plug Set", brand: "CPR", price: 220, points: 6, designId: 1, hp: 2 },
  { partId: 992011, categoryId: 179, name: "CPR Traction Control", brand: "CPR", price: 1800, points: 45, designId: 1 },
  { partId: 992014, categoryId: 181, name: "CPR Camshaft", brand: "CPR", price: 2200, points: 55, designId: 1, hp: 20, tq: 12 },
  { partId: 992016, categoryId: 183, name: "CPR Crankshaft", brand: "CPR", price: 2600, points: 65, designId: 1, tq: 20 },
  { partId: 992017, categoryId: 185, name: "CPR Cylinder Head", brand: "CPR", price: 3000, points: 75, designId: 1, hp: 24, tq: 16 },
  { partId: 992018, categoryId: 47, name: "CPR Intake Manifold", brand: "CPR", price: 1300, points: 33, designId: 1, hp: 12, tq: 8, af: 24 },
  { partId: 992019, categoryId: 187, name: "CPR Oil Cooler", brand: "CPR", price: 850, points: 21, designId: 1 },
  { partId: 992020, categoryId: 189, name: "CPR Oil Pump", brand: "CPR", price: 750, points: 19, designId: 1 },
  { partId: 992022, categoryId: 192, name: "CPR Valve Spring Set", brand: "CPR", price: 650, points: 16, designId: 1, hp: 5 },
  { partId: 992031, categoryId: 57, name: "CPR Catalytic Converter", brand: "CPR", price: 800, points: 20, designId: 1, ef: 16 },
  { partId: 992032, categoryId: 63, name: "CPR Thermal Wrap", brand: "CPR", price: 180, points: 5, designId: 1, ef: 4 },
  { partId: 992035, categoryId: 55, name: "CPR Muffler", brand: "CPR", price: 650, points: 16, designId: 1, ef: 14 },
  { partId: 992037, categoryId: 59, name: "CPR Downpipe", brand: "CPR", price: 850, points: 21, designId: 1, ef: 18 },
  { partId: 992038, categoryId: 61, name: "CPR Turbo Manifold", brand: "CPR", price: 1200, points: 30, designId: 1, ef: 22 },
  { partId: 992045, categoryId: 204, name: "CPR Nitrous Jet Set", brand: "CPR", price: 300, points: 8, designId: 1, hp: 10, tq: 7 },
  { partId: 992062, categoryId: 2162, name: "CPR Clutch", brand: "CPR", price: 1100, points: 28, designId: 1 },
  { partId: 992063, categoryId: 2163, name: "CPR Flywheel", brand: "CPR", price: 950, points: 24, designId: 1, wt: -6 },
  { partId: 992064, categoryId: 2164, name: "CPR Differential", brand: "CPR", price: 1600, points: 40, designId: 1 },
  { partId: 992066, categoryId: 201, name: "CPR Fuel Cooler", brand: "CPR", price: 550, points: 14, designId: 1, ff: 8 },
  { partId: 992067, categoryId: 54, name: "CPR Fuel Regulator", brand: "CPR", price: 500, points: 13, designId: 1, ff: 12 },
  { partId: 992068, categoryId: 49, name: "CPR Fuel Pump", brand: "CPR", price: 800, points: 20, designId: 1, ff: 18 },
  { partId: 992069, categoryId: 51, name: "CPR Fuel Rail", brand: "CPR", price: 700, points: 18, designId: 1, ff: 16 },
  { partId: 992070, categoryId: 52, name: "CPR Injector Set", brand: "CPR", price: 1200, points: 30, designId: 1, ff: 22 },
  { partId: 992073, categoryId: 48, name: "CPR Throttle Body", brand: "CPR", price: 900, points: 23, designId: 1, af: 18 },
  { partId: 992074, categoryId: 18, name: "CPR Blow Off Valve", brand: "CPR", price: 650, points: 16, designId: 1 },
  { partId: 992075, categoryId: 86, name: "CPR Intercooler", brand: "CPR", price: 1400, points: 35, designId: 1, af: 28 },
  { partId: 992076, categoryId: 137, name: "CPR Turbo Piping", brand: "CPR", price: 750, points: 19, designId: 1, af: 16 },
]);
const REAL_LIFE_PART_ID_START = 980000;
const REAL_LIFE_PART_TARGET_COUNT = 463;
const REAL_LIFE_PART_FAMILIES = Object.freeze([
  { id: "i4", label: "I4/V4", displacement: "2.0L", weightBias: -18, powerBias: 0.82, priceBias: 0.82 },
  { id: "i6", label: "I6", displacement: "3.0L", weightBias: 5, powerBias: 1.02, priceBias: 1 },
  { id: "v6", label: "V6", displacement: "3.6L", weightBias: 18, powerBias: 1.06, priceBias: 1.04 },
  { id: "v8", label: "V8", displacement: "6.2L", weightBias: 55, powerBias: 1.28, priceBias: 1.24 },
  { id: "universal", label: "Universal", displacement: "", weightBias: 0, powerBias: 1, priceBias: 0.95 },
]);
const REAL_LIFE_ENGINE_FAMILIES = new Set(["i4", "i6", "v6", "v8"]);
const REAL_LIFE_PART_TIERS = Object.freeze([
  { id: "street", label: "Street", rank: 1, price: 1, power: 1 },
  { id: "sport", label: "Sport", rank: 2, price: 1.7, power: 1.55 },
  { id: "pro", label: "Pro", rank: 3, price: 2.6, power: 2.25 },
  { id: "race", label: "Race", rank: 4, price: 3.8, power: 3.05 },
  { id: "extreme", label: "Extreme", rank: 5, price: 5.4, power: 4.1 },
]);
const REAL_LIFE_PART_SPECS = Object.freeze([
  { categoryId: 133, categoryName: "Engine Swap", brands: ["Honda K-Series", "Toyota 2JZ", "GM LS", "Ford Coyote", "Nissan RB"], models: ["K24A2", "2JZ-GTE", "LS3", "5.0 Aluminator", "RB26DETT"], price: 8500, hp: 185, tq: 145, wt: 65, families: ["i4", "i6", "v6", "v8"] },
  { categoryId: 96, categoryName: "Air Filter", brands: ["K&N", "AEM", "HKS", "Airaid", "Injen"], models: ["High-Flow", "DryFlow", "Super Mega Flow", "Synthaflow", "Power-Flow"], price: 120, hp: 2, tq: 1, wt: -1, flow: "af", flowBase: 8 },
  { categoryId: 47, categoryName: "Intake Manifold", brands: ["Skunk2", "Holley", "Edelbrock", "FAST", "Brian Tooley Racing"], models: ["Ultra Street", "Hi-Ram", "Victor Jr", "LSXR", "Equalizer"], price: 850, hp: 9, tq: 6, wt: 2, flow: "af", flowBase: 18 },
  { categoryId: 48, categoryName: "Throttle Body", brands: ["BBK", "Skunk2", "Holley", "Nick Williams", "AEM"], models: ["Power Plus", "Alpha", "Sniper EFI", "Drive-By-Wire", "Induction"], price: 360, hp: 5, tq: 3, wt: 0, flow: "af", flowBase: 12 },
  { categoryId: 49, categoryName: "Fuel Pump", brands: ["Walbro", "DeatschWerks", "Aeromotive", "AEM", "Fuelab"], models: ["255LPH", "DW300", "Stealth", "High Flow", "Prodigy"], price: 230, hp: 0, tq: 0, wt: 1, flow: "ff", flowBase: 16 },
  { categoryId: 52, categoryName: "Injector Set", brands: ["Injector Dynamics", "DeatschWerks", "Bosch Motorsport", "Fuel Injector Clinic", "Siemens Deka"], models: ["ID1050x", "DW95", "EV14", "FIC1000", "Shorty"], price: 520, hp: 2, tq: 1, wt: 0, flow: "ff", flowBase: 22 },
  { categoryId: 59, categoryName: "Headers", brands: ["Kooks", "Stainless Works", "DC Sports", "Hedman", "Pacesetter"], models: ["Long Tube", "Works Race", "Ceramic", "Elite", "Armor Coat"], price: 760, hp: 8, tq: 7, wt: -3, flow: "ef", flowBase: 18 },
  { categoryId: 55, categoryName: "Muffler", brands: ["MagnaFlow", "Borla", "Flowmaster", "GReddy", "HKS"], models: ["Street Series", "S-Type", "Super 44", "Revolution RS", "Hi-Power"], price: 340, hp: 3, tq: 2, wt: -2, flow: "ef", flowBase: 10 },
  { categoryId: 87, categoryName: "Turbo Kit", brands: ["Garrett", "BorgWarner", "Precision Turbo", "HKS", "GReddy"], models: ["G25", "EFR", "PT Gen2", "GTIII", "Tuner Turbo"], price: 2400, hp: 22, tq: 18, wt: 26, flow: "af", flowBase: 28, boost: true },
  { categoryId: 81, categoryName: "Supercharger", brands: ["Vortech", "ProCharger", "Whipple", "Magnuson", "Edelbrock"], models: ["V-3 Si", "P-1SC-1", "Twin Screw", "TVS2300", "E-Force"], price: 3200, hp: 38, tq: 34, wt: 34, flow: "af", flowBase: 30, boost: true },
  { categoryId: 86, categoryName: "Intercooler", brands: ["Mishimoto", "Garrett", "HKS", "GReddy", "CSF"], models: ["Race Core", "Bar Plate", "R-Type", "Spec-LS", "Dual Pass"], price: 620, hp: 5, tq: 4, wt: 12, flow: "af", flowBase: 22 },
  { categoryId: 174, categoryName: "ECU Tune", brands: ["Hondata", "HP Tuners", "Cobb", "EcuTek", "AEM"], models: ["FlashPro", "VCM Suite", "Accessport", "RaceROM", "Infinity"], price: 700, hp: 8, tq: 7, wt: 0 },
  { categoryId: 181, categoryName: "Camshaft", brands: ["Brian Crower", "Comp Cams", "Texas Speed", "Skunk2", "Tomei"], models: ["Stage 2", "XFI", "Chopacabra", "Pro Series", "Poncams"], price: 620, hp: 10, tq: 5, wt: 0 },
  { categoryId: 190, categoryName: "Piston Set", brands: ["Wiseco", "JE Pistons", "CP-Carrillo", "Mahle Motorsport", "Manley"], models: ["BoostLine", "Ultra Series", "Bullet", "PowerPak", "Platinum"], price: 760, hp: 5, tq: 3, wt: -2 },
  { categoryId: 185, categoryName: "Cylinder Head", brands: ["AFR", "Trick Flow", "Dart", "Katech", "Mast Motorsports"], models: ["Mongoose", "Twisted Wedge", "PRO1", "CNC Ported", "Black Label"], price: 1800, hp: 18, tq: 12, wt: 8, flow: "af", flowBase: 18 },
  { categoryId: 183, categoryName: "Crankshaft", brands: ["Callies", "Eagle", "Scat", "Manley", "Brian Crower"], models: ["Compstar", "4340 Forged", "Ultra Lite", "Turbo Tuff", "Stroker"], price: 1250, hp: 0, tq: 14, wt: 10 },
  { categoryId: 182, categoryName: "Connecting Rods", brands: ["Manley", "Eagle", "Carrillo", "Brian Crower", "K1 Technologies"], models: ["H-Beam", "ESP", "Pro-H", "Sportsman", "4340 Billet"], price: 720, hp: 0, tq: 8, wt: -1 },
  { categoryId: 2162, categoryName: "Clutch", brands: ["Exedy", "ACT", "SPEC", "McLeod", "Centerforce"], models: ["Stage 1", "HDSS", "Stage 2+", "RST", "DYAD"], price: 560, hp: 0, tq: 6, wt: -3 },
  { categoryId: 2163, categoryName: "Flywheel", brands: ["Fidanza", "ACT", "Competition Clutch", "SPEC", "Exedy"], models: ["Aluminum", "Streetlite", "Ultra Lightweight", "Billet Steel", "Hyper Single"], price: 420, hp: 0, tq: 3, wt: -9 },
  { categoryId: 59, categoryName: "Downpipe", brands: ["MAPerformance", "Invidia", "Cobb", "AMS", "GReddy"], models: ["Race", "N1", "Catted", "Widemouth", "MX"], price: 480, hp: 7, tq: 5, wt: -2, flow: "ef", flowBase: 16 },
]);
const GENERATED_COMPATIBILITY_CATEGORY_IDS = new Set(
  GENERATED_COMPATIBILITY_PARTS.map((part) => Number(part.categoryId)),
);
const CPR_MENU_TRIGGER_CATEGORY_REMAP = new Map([
  [2003, AIR_FUEL_CONTROLLER_CATEGORY_ID],
  [2004, 175],
  [2005, 23],
  [2006, 174],
  [2010, 178],
  [2011, 179],
  [2013, 1813],
  [2014, 181],
  [2016, 183],
  [2017, 185],
  [2018, 47],
  [2019, 187],
  [2020, 189],
  [2022, 192],
  [2031, 57],
  [2032, 63],
  [2035, 55],
  [2037, 59],
  [2038, 61],
  [2045, 204],
  [2062, 2162],
  [2063, 2163],
  [2064, 2164],
  [2065, 2165],
  [2066, 2166],
  [2067, 2167],
  [2068, 2168],
  [2069, 2169],
  [2070, 2170],
  [2073, 2173],
  [2074, 2174],
  [2075, 2175],
  [2076, 2176],
  [2077, 2177],
  [2078, 2178],
]);

export function canonicalPartsShopCategoryId(categoryId) {
  const id = Number(categoryId);
  const mapped = CPR_MENU_TRIGGER_CATEGORY_REMAP.get(id);
  if (mapped !== undefined) {
    return mapped;
  }

  if (id >= 2000 && id < 2100) {
    return id + 200;
  }

  return id;
}

// Legacy and generated parts can share one physical install slot but use different category ids.
const INSTALL_SLOT_EQUIVALENT_GROUPS = [
  [24, 2162],
  [39, 184],
  [136, 186],
];

const INSTALL_SLOT_CANONICAL_BY_ID = new Map(
  INSTALL_SLOT_EQUIVALENT_GROUPS.flatMap((group) => {
    const canonicalId = Math.min(...group);
    return group.map((categoryId) => [categoryId, canonicalId]);
  }),
);

export function canonicalInstallSlotId(categoryId) {
  const remappedCategoryId = canonicalPartsShopCategoryId(Number(categoryId || 0));
  if (!remappedCategoryId) {
    return 0;
  }

  return INSTALL_SLOT_CANONICAL_BY_ID.get(remappedCategoryId) ?? remappedCategoryId;
}

export function isCprMenuTriggerCategoryId(categoryId) {
  const id = Number(categoryId);
  return id >= 2000 && id < 2100;
}

export function isLegacyCprMenuCategoryId(categoryId) {
  return isCprMenuTriggerCategoryId(categoryId);
}

function applyCprMenuTriggerCategoryRemap(parts) {
  return parts.map((part) => {
    const categoryId = Number(part?.pi ?? part?.ci ?? 0);
    const canonicalCategoryId = canonicalPartsShopCategoryId(categoryId);
    if (canonicalCategoryId === categoryId) {
      return part;
    }

    return {
      ...part,
      pi: canonicalCategoryId,
      ci: canonicalCategoryId,
      categoryID: canonicalCategoryId,
    };
  });
}

const GENERATED_COMPATIBILITY_LOCATION_BY_CATEGORY_ID = new Map([
  [2, 100],
  [16, 200],
  [17, 200],
  [19, 100],
  [21, 200],
  [39, 200],
  [45, 200],
  [68, 100],
  [72, 100],
  [102, 200],
  [135, 300],
  [136, 300],
  [142, 100],
  [143, 100],
  [145, 100],
  [153, 300],
  [154, 300],
  [155, 300],
  [156, 300],
  [157, 300],
  [158, 200],
  [165, 100],
  [167, 100],
  [168, 100],
  [169, 100],
  [170, 200],
  [190, 300],
  [205, 300],
  [1143, 300],
  [1145, 300],
  [AIR_FUEL_CONTROLLER_CATEGORY_ID, 200],
  [174, 200],
  [175, 300],
  [179, 200],
  [23, 200],
  [18, 200],
  [2162, 300],
  [2163, 300],
  [2164, 300],
  [2165, 300],
  [2166, 200],
  [2167, 200],
  [2168, 200],
  [2169, 200],
  [2170, 200],
]);

function generatedCompatibilityLocation(categoryId) {
  return GENERATED_COMPATIBILITY_LOCATION_BY_CATEGORY_ID.get(Number(categoryId)) || 300;
}

const MASTER_LEAF_INSTALL_CATEGORY_IDS = new Map([
  ["engines", 133],
  ["additives", 20],
  ["coolant", 20],
  ["radiators", 2177],
  ["thermostat", 2178],
  ["thermostats", 2178],
  ["boost controller", 23],
  ["full engine management", 134],
  ["bottles", 203],
  ["jets", 204],
  ["foggers", 204],
  ["clutch", 24],
  ["flywheel", 22],
  ["gear box", 22],
  ["transmission", 22],
  ["transmissions", 22],
  ["motor mounts", 1141],
  ["springs shocks", 1142],
  ["sway bars", 1144],
  ["torsion bars", 114],
  ["air fuel meter", 134],
  ["engine diagnostic tool", ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID],
  ["battery", 175],
  ["ecu", 174],
  ["spark plug cables", 177],
  ["spark plugs", 178],
  ["traction control", 179],
  ["cam gears", 1813],
  ["camshaft", 181],
  ["cams", 181],
  ["connecting rods", 182],
  ["crankshaft", 183],
  ["cylinder block", 184],
  ["cylinder heads", 185],
  ["head gaskets", 186],
  ["intake manifold", 47],
  ["oil coolers", 187],
  ["oil filters", 188],
  ["oil pump", 189],
  ["pistons", 44],
  ["rotary engine", 191],
  ["rotary engine blocks", 153],
  ["apex seals", 154],
  ["rotors", 155],
  ["rotor housings", 156],
  ["corner and side seals", 157],
  ["throttle bodies", 48],
  ["valve springs", 192],
  ["valves", 193],
  ["catalytic converters", 57],
  ["headers", 59],
  ["muffler", 55],
  ["piping", 56],
  ["exhaust thermo wrap", 63],
  ["turbo down pipe", 61],
  ["turbo exhaust manifold", 62],
  ["spoilers", 65],
  ["hoods", 71],
  ["hood front effect", 74],
  ["eyelids", 75],
  ["headlights", 76],
  ["tail lights", 77],
  ["grille", 140],
  ["grilles", 140],
  ["side scoops", 141],
  ["side trim effects", 73],
  ["front bumper", 128],
  ["front bumpers", 128],
  ["side skirts", 129],
  ["rear bumper", 130],
  ["rear bumpers", 130],
  ["trunk", 144],
  ["trunks", 144],
  ["hood graphics", 160],
  ["side graphics", 161],
  ["front graphics", 162],
  ["rear graphics", 163],
  ["turbo", 87],
  ["supercharger", 81],
  ["supercharger pulley", 82],
  ["blow off valves", 18],
  ["intercoolers", 86],
  ["turbo piping", 137],
  ["fuel pump", 49],
  ["fuel cell", 2165],
  ["fuel coolers", 201],
  ["fuel filters", 202],
  ["fuel rail", 51],
  ["injectors", 52],
  ["fuel pressure regulator", 54],
  ["air filters", 96],
  ["intake pipes", 97],
  ["bottles", 203],
  ["jets", 204],
  ["foggers", 204],
  ["seats", 1451],
  ["belts and harnesses", 1452],
]);

const CATEGORY_NAMES = new Map([
  [2, "Appearance Misc"],
  [TIRE_CATEGORY_ID, "Tires"],
  [WHEEL_CATEGORY_ID, "Wheels"],
  [SHIFT_LIGHT_CATEGORY_ID, "Shift Lights"],
  [16, "Open Exhaust & Turbo Manifolds"],
  [17, "Camshafts"],
  [18, "Blow Off Valves"],
  [19, "Gauges & Controllers"],
  [20, "Cooling"],
  [21, "Nitrous Systems"],
  [22, "Gear Box"],
  [23, "Boost Controllers"],
  [24, "Clutches"],
  [AIR_FUEL_CONTROLLER_CATEGORY_ID, "Air/Fuel Controllers"],
  [39, "Engine Blocks"],
  [44, "Low Compression Pistons"],
  [45, "Valves"],
  [47, "Intake Manifolds"],
  [48, "Throttle Bodies"],
  [49, "Fuel Pumps"],
  [51, "Fuel Rails"],
  [52, "Injectors"],
  [54, "Fuel Pressure Regulators"],
  [55, "Mufflers"],
  [56, "Exhaust Piping"],
  [57, "Catalytic Converters"],
  [59, "Headers & Manifolds"],
  [61, "Downpipes"],
  [62, "Turbo Exhaust Manifolds"],
  [63, "Thermal Wrap"],
  [65, "Spoilers"],
  [68, "Roof Scoops"],
  [71, "Hoods"],
  [73, "Side Trim"],
  [74, "Hood Effects"],
  [75, "Eyelids"],
  [76, "Headlights"],
  [77, "Tail Lights"],
  [81, "Superchargers"],
  [86, "Intercoolers"],
  [87, "Turbo Kits"],
  [96, "Air Intakes"],
  [97, "Intake Pipes"],
  [102, "Nitrous Bottles"],
  [114, "Chassis Arms"],
  [128, "Front Bumpers"],
  [129, "Side Skirts"],
  [130, "Rear Bumpers"],
  [133, "Engine Swaps"],
  [134, "Air/Fuel Meters"],
  [135, "Connecting Rods"],
  [136, "Head Gaskets"],
  [137, "Turbo Piping"],
  [140, "Grilles"],
  [141, "Side Scoops"],
  [142, "Fender Effects"],
  [143, "Door Effects"],
  [144, "Trunks"],
  [145, "Paint Accents"],
  [146, "Custom Graphics"],
  [147, "Full Graphics"],
  [148, "Hood Graphics"],
  [149, "Side Graphics"],
  [150, "Front Graphics"],
  [151, "Back Graphics"],
  [153, "Rotary Engine Blocks"],
  [154, "Apex Seals"],
  [155, "Rotors"],
  [156, "Rotor Housings"],
  [157, "Corner and Side Seals"],
  [158, "Carburetors"],
  [160, "Hood Panels"],
  [161, "Side Panels"],
  [162, "Front Panels"],
  [163, "Back Panels"],
  [165, "Oil Service"],
  [167, "Fluid Service"],
  [168, "Oil Filters"],
  [169, "Coolant"],
  [170, "Traction Compound"],
  [GRAPHICS_SHOP_GAUGE_CATEGORY_ID, "Gauge Graphics"],
  [ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID, "Engine Diagnostic Tools"],
  [174, "ECU Tunes"],
  [175, "Batteries"],
  [177, "Plug Wires"],
  [178, "Spark Plugs"],
  [179, "Traction Control"],
  [181, "Camshafts"],
  [182, "Connecting Rods"],
  [183, "Crankshafts"],
  [184, "Engine Blocks"],
  [185, "Cylinder Heads"],
  [186, "Head Gaskets"],
  [187, "Oil Coolers"],
  [188, "Oil Filters"],
  [189, "Oil Pumps"],
  [190, "Pistons"],
  [191, "Rotary Parts"],
  [192, "Valve Springs"],
  [193, "Valves"],
  [201, "Fuel Coolers"],
  [202, "Fuel Filters"],
  [203, "Nitrous Bottles"],
  [204, "Nitrous Jets"],
  [205, "Foggers"],
  [1141, "Motor Mounts"],
  [1142, "Suspension"],
  [1143, "Rotors & Housings"],
  [1144, "Anti-Sway Bars"],
  [1145, "Wheel Sets"],
  [1451, "Seats"],
  [1452, "Harnesses"],
  [2003, "Air/Fuel Control"],
  [2004, "Batteries"],
  [2005, "Boost Controllers"],
  [2006, "ECU"],
  [2010, "Spark Plugs"],
  [2011, "Traction Control"],
  [1813, "Cam Gears"],
  [2162, "Clutches"],
  [2163, "Flywheels"],
  [2164, "Differentials"],
  [2165, "Fuel Cells"],
  [2166, "Fuel Coolers"],
  [2167, "Fuel Regulators"],
  [2168, "Fuel Pumps"],
  [2169, "Fuel Rails"],
  [2170, "Injectors"],
  [2173, "Throttle Bodies"],
  [2174, "Blow Off Valves"],
  [2175, "Intercoolers"],
  [2176, "Turbo Piping"],
  [2177, "Radiators"],
  [2178, "Thermostats"],
]);

const NORMAL_CATEGORY_TREE = [
  ["Performance", [
    ["Engines", [
      ["Engine Swaps", [133]],
    ]],
    ["Air & Intake", [
      ["Air Filters", [96]],
      ["Intake Pipes", [97]],
      ["Manifold & Throttle", [47, 48]],
    ]],
    ["Exhaust", [
      ["Catalytic Converters", [57]],
      ["Mufflers & Piping", [55, 56]],
      ["Headers & Downpipes", [59, 61, 62]],
      ["Heat Management", [63]],
    ]],
    ["Forced Induction", [
      ["Turbo System", [
        ["Turbo Kits", [87]],
        ["Intercoolers", [86, 2175]],
        ["Piping", [137, 2176]],
        ["Controls & Valves", [23, 18, 2174]],
      ]],
      ["Supercharger System", [
        ["Superchargers", [81]],
        ["Pulleys", [82]],
      ]],
      ["Nitrous System", [
        ["Shot Kits", [21]],
        ["Bottles", [102, 203]],
        ["Jets & Foggers", [204, 205]],
      ]],
    ]],
    ["Fuel System", [
      ["Delivery", [49, 51, 52, 54, 2168, 2169, 2170, 2167]],
      ["Support", [201, 202, 2165, 2166]],
      ["Carburetion", [158]],
    ]],
    ["Cooling & Oil", [
      ["Coolant", [20]],
      ["Radiators", [2177]],
      ["Thermostats", [2178]],
      ["Oil System", [187, 188, 189]],
    ]],
    ["Drivetrain", [
      ["Gear Box", [22]],
      ["Clutches", [24, 2162]],
      ["Flywheels", [2163]],
      ["Differentials", [2164]],
    ]],
  ]],
    ["Engine Internals", [
      ["Bottom End", [
        ["Blocks", [39, 184]],
        ["Crank & Rods", [135, 182, 183]],
        ["Pistons", [190, 44]],
      ]],
      ["Top End", [
        ["Heads & Gaskets", [136, 185, 186]],
        ["Cams & Gears", [181, 1813]],
        ["Valvetrain", [45, 192, 193]],
      ]],
      ["Rotary Family", [
        ["Rotary Engine Blocks", [153]],
        ["Apex Seals", [154]],
        ["Rotors", [155]],
        ["Rotor Housings", [156]],
        ["Corner and Side Seals", [157]],
      ]],
      ["Mounting", [
        ["Motor Mounts", [1141]],
      ]],
    ]],
  ["Electronics", [
    ["Engine Management", [
      ["Air/Fuel Control", [AIR_FUEL_CONTROLLER_CATEGORY_ID, 134]],
      ["Gauges & Meters", [19]],
      ["Shift Lights", [SHIFT_LIGHT_CATEGORY_ID]],
      ["ECU Tunes", [174]],
      ["Traction Control", [179]],
    ]],
    ["Ignition", [
      ["Plug Wires", [177]],
      ["Spark Plugs", [178]],
    ]],
    ["Power", [
      ["Batteries", [175]],
    ]],
  ]],
  ["Suspension & Safety", [
    ["Suspension", [
      ["Chassis", [114]],
      ["Springs & Shocks", [1142]],
      ["Sway Bars", [1144]],
    ]],
    ["Brakes & Wheels", [
      ["Brakes", [1143]],
      ["Wheels", [1145]],
    ]],
    ["Interior Safety", [
      ["Seats", [1451]],
      ["Harnesses", [1452]],
    ]],
  ]],
  ["Maintenance", [
    ["Service", [165, 167, 168, 169]],
    ["Traction", [170]],
  ]],
  ["Exterior", [
    ["Body Kits", [
      ["Front Bumpers", [128]],
      ["Side Skirts", [129]],
      ["Rear Bumpers", [130]],
    ]],
    ["Panels", [
      ["Hoods", [71, 74]],
      ["Trunks & Hatches", [144]],
      ["Roof & Grilles", [68, 140]],
      ["Side Trim", [73]],
    ]],
    ["Lighting", [
      ["Headlights", [75, 76]],
      ["Tail Lights", [77]],
    ]],
    ["Aero & Trim", [
      ["Spoilers", [65]],
      ["Scoops", [141]],
    ]],
    ["Misc Styling", [
      ["Appearance Misc", [2]],
    ]],
  ]],
];
const BODY_KIT_CATEGORY_IDS = new Set([128, 129, 130]);
const EXTERIOR_MISC_RECLASS_RULES = Object.freeze([
  [/back graphics|rear graphics/i, 151],
  [/front graphics/i, 150],
  [/side graphics/i, 149],
  [/hood graphics/i, 148],
  [/graphics pack|full graphics/i, 147],
  [/custom graphics/i, 146],
  [/rear bumper|back bumper|rear fascia|kevlar diffuser|domination rear/i, 130],
  [/front bumper|front lip|front fascia|carbon fiber lip|front valance|domination front/i, 128],
  [/tailgate|cf tailgate/i, 144],
  [/harness/i, 1452],
  [/presidents' day pack|holiday hustle|quarter mile courtship|sema cares|thanksgiving graphic/i, 151],
  [/carbon fiber combo/i, 147],
  [/\bbumper\b|cf bumper|max design bumper/i, 128],
  [/side skirt/i, 129],
  [/trunk|hatch|boot lid|cf trunk|carbon fiber trunk/i, 144],
  [/hood front effect|hood effect/i, 74],
  [/\bhood\b|air ram|scoop hood|vented hood|cf hood|carbon fiber hood/i, 71],
  [/grille|grill|shadowline/i, 140],
  [/tail light|taillight|rear light/i, 77],
  [/headlight|head light|grey light/i, 76],
  [/eyelid/i, 75],
  [/spoiler|\bwing\b/i, 65],
  [/side scoop|fender scoop|fender trim/i, 141],
  [/roof scoop/i, 68],
  [/side trim|mirror trim|trim effect|cf mirror|carbon fiber mirror/i, 73],
  [/\bseat/i, 1451],
]);
const GAUGE_MISC_RECLASS_RULES = Object.freeze([
  [/\b(?:1[4-9]|2[0-2])"\b|advanti|volk racing|cragar|konig|weld racing|pacer 241|b sport lm/i, 14],
  [/sport pipe|competition pipe|power pipe|turbine tube|cyclone|schlucht|toguemaster|pipe kit|muffler|cat-back|exhaust|downpipe|super flow/i, 55],
  [/dynasty supreme flo|rumble series/i, 55],
  [/thermal wrap|inferno-wrap/i, 63],
  [/\bt5 pump\b|\bt6 pump\b|\boil pump\b/i, 189],
  [/race series pump|fuel pump/i, 49],
  [/\bflyweel\b|\bflywheel\b/i, 2163],
  [/\bhead\b|portflo/i, 185],
  [/spring and shock|spring & shock/i, 1142],
  [/air\/fuel controller/i, AIR_FUEL_CONTROLLER_CATEGORY_ID],
  [/evo-manage|engine management system/i, 174],
  [/boost controller|\d+\s*psi\b/i, 23],
  [/e boost|boost.*controller/i, 23],
  [/road power series|\bbattery\b/i, 175],
  [/power cables|red cables|sport boss cables|\bcables\b/i, 177],
  [/coil pack/i, 178],
  [/rear panel/i, 163],
  [/reinforced seals kit/i, 154],
  [/engine swap|\bamc v8\b/i, 133],
  [/super high flow kit|high flow kit/i, 96],
  [/t359|turbo system/i, 87],
  [/fr-50|fuel regulator/i, 54],
  [/tripp.*fire|visions fire/i, 21],
  [/claw|6 pad|coreforce|ichiban drag|domination 1050|axe racing performance|t-grip|mnk racing race|zintek|x motorsports pro|x motorsports heavy duty|golden carbon fiber/i, 2162],
  [/full race/i, 16],
  [/nagoya works kr/i, 182],
  [/ls1.*toreno|\d\.\d{3}.*toreno/i, 22],
  [/graf designs carbon/i, 2],
  [/xtreme throttle/i, 48],
  [/pro series 1200|rpm gauge|gauge with|gauge controller kit/i, 19],
]);

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

function collectCategoryIdsFromTree(tree, rootName) {
  const root = tree.find(([name]) => name === rootName);
  const categoryIds = new Set();

  function visit(items) {
    for (const item of items || []) {
      if (Array.isArray(item)) {
        visit(item[1]);
      } else if (Number.isFinite(Number(item))) {
        categoryIds.add(Number(item));
      }
    }
  }

  visit(root?.[1] || []);
  return categoryIds;
}

const PERFORMANCE_CATEGORY_IDS = collectCategoryIdsFromTree(NORMAL_CATEGORY_TREE, "Performance");

function shouldScaleEconomyPointPrice(part) {
  const categoryId = Number(part?.ci ?? part?.pi ?? 0);
  return PERFORMANCE_CATEGORY_IDS.has(categoryId) || BODY_KIT_CATEGORY_IDS.has(categoryId);
}

function applyEconomyPointPrices(parts) {
  return parts.map((part) => {
    if (!shouldScaleEconomyPointPrice(part)) {
      return part;
    }

    // Engine swaps (category 133) use fixed point pricing — never scale from money
    const categoryId = Number(part?.ci ?? part?.pi ?? 0);
    if (categoryId === 133) {
      return { ...part, pp: part.pp || 1750 };
    }

    return {
      ...part,
      pp: FIXED_TORENO_PART_IDS.has(Number(part.i))
        ? Number(part.pp || 0)
        : moneyToPointPrice(part.p),
    };
  });
}

function renderPart(part) {
  const attributes = {
    i: part.i,
    pi: part.pi,
    ci: part.ci ?? part.pi,
    pcid: part.pcid,
    categoryID: part.categoryID,
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
    mo: part.mo ?? 0,
    hp: part.hp ?? 0,
    tq: part.tq ?? 0,
    wt: part.wt ?? 0,
    cc: part.cc ?? 0,
    ps: part.ps,
    fe: part.fe,
    ug: part.ug,
    afm: part.afm,
    aft: part.aft,
    af: part.af,
    ff: part.ff,
    ef: part.ef,
    eef: part.eef,
    stockBoost: part.stockBoost,
    boostSetting: part.boostSetting,
    maxPsi: part.maxPsi,
  };

  const variations = Array.isArray(part.variations)
    ? part.variations
      .map((variation) => renderNode("v", {
        i: variation.i,
        di: variation.di,
      }, escapeXmlAttribute(variation.n || `Variation ${variation.di || variation.i}`)))
      .join("")
    : "";

  return renderNode("p", attributes, variations);
}

export function buildPartsXml(parts) {
  return `<p>${parts.map(renderPart).join("")}</p>`;
}

async function readPartsList({ projectRoot, dataRoot }) {
  const candidates = [
    join(dataRoot, "parts-list.json"),
    join(projectRoot, PARTS_LIST_REFERENCE_PATH),
  ];
  const missingCandidates = [];

  for (const candidate of candidates) {
    try {
      const text = await readFile(candidate, "utf8");
      return {
        parts: JSON.parse(text.replace(/^\uFEFF/, "")),
        sourcePath: candidate,
        missingCandidates,
      };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      missingCandidates.push(candidate);
    }
  }

  return { parts: [], sourcePath: "", missingCandidates };
}

async function readMasterPartsCatalog({ projectRoot, dataRoot }) {
  const candidates = [
    join(dataRoot, "master-parts-catalog.txt"),
    join(dataRoot, "NITTO 1320 LEGENDS - MASTER PARTS CATALOG.txt"),
    join(dataRoot, "NITTO 1320 LEGENDS - MASTER PARTS CATALOG Parts Shop.txt"),
    join(projectRoot, MASTER_PARTS_CATALOG_SHOP_REFERENCE_PATH),
    join(projectRoot, MASTER_PARTS_CATALOG_ROOT_REFERENCE_PATH),
    join(projectRoot, MASTER_PARTS_CATALOG_REFERENCE_PATH),
  ];
  const missingCandidates = [];

  for (const candidate of candidates) {
    try {
      return {
        text: await readFile(candidate, "utf8"),
        sourcePath: candidate,
        missingCandidates,
      };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      missingCandidates.push(candidate);
    }
  }

  return { text: "", sourcePath: "", missingCandidates };
}

function parseMasterPartsCatalog(text) {
  const partEntriesById = new Map();
  const sections = [];
  let currentSection = null;
  let currentLeaf = null;
  let nextSectionId = 930000;
  let nextLeafId = 931000;

  function getSection(name) {
    if (!currentSection || currentSection.name !== name) {
      currentSection = {
        id: nextSectionId++,
        parentId: 0,
        name,
        leaves: [],
      };
      sections.push(currentSection);
    }

    return currentSection;
  }

  function getLeaf(name) {
    const section = currentSection || getSection("Parts");
    const normalizedName = String(name || section.name).trim() || section.name;

    if (!currentLeaf || currentLeaf.section !== section || currentLeaf.name !== normalizedName) {
      currentLeaf = {
        id: nextLeafId++,
        parentId: section.id,
        section,
        name: normalizedName,
        partIds: [],
      };
      section.leaves.push(currentLeaf);
    }

    return currentLeaf;
  }

  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const [lineIndex, line] of lines.entries()) {
    const trimmed = line.trim();

    if (!trimmed || /^=+$/.test(trimmed) || /^NITTO\b/i.test(trimmed)) {
      continue;
    }

    const partMatch = trimmed.match(/^-\s+(.*?)\s*\[([^\]]+)\]\s*$/);
    if (partMatch) {
      const partName = partMatch[1].trim();
      if (/^\(?no parts listed\)?$/i.test(partName)) {
        continue;
      }

      const leaf = currentLeaf || getLeaf(currentSection?.name || "Parts");
      const partIds = partMatch[2]
        .split(",")
        .map((value) => Number(String(value).trim()))
        .filter((value) => Number.isFinite(value) && value > 0);

      for (const partId of partIds) {
        partEntriesById.set(partId, {
          partId,
          name: partName,
          sectionName: currentSection?.name || "Parts",
          leafName: leaf.name,
          categoryId: leaf.id,
          line: lineIndex + 1,
        });
        leaf.partIds.push(partId);
      }
      continue;
    }

    if (/^-\s+\(?no parts listed\)?$/i.test(trimmed)) {
      continue;
    }

    const indent = line.match(/^\s*/)?.[0]?.length || 0;
    if (indent === 0) {
      currentSection = getSection(trimmed);
      currentLeaf = null;
    } else {
      currentLeaf = getLeaf(trimmed);
    }
  }

  return {
    sections,
    partEntriesById,
  };
}

function normalizeMasterLeafName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isAirFuelControllerPart(part, masterEntry) {
  const text = `${part?.n || ""} ${part?.mn || ""} ${masterEntry?.name || ""}`.toLowerCase();

  return text.includes("air") && text.includes("fuel") && text.includes("controller");
}

function isAirFuelMeterPart(part, masterEntry) {
  const text = `${part?.n || ""} ${part?.mn || ""} ${masterEntry?.name || ""}`.toLowerCase();

  return text.includes("air") && text.includes("fuel") && text.includes("meter")
    && !text.includes("controller");
}

function isGearRatioPart(part, masterEntry) {
  const leafName = normalizeMasterLeafName(masterEntry?.leafName);
  const text = `${part?.n || ""} ${part?.mn || ""} ${masterEntry?.name || ""}`.toLowerCase();

  return GEAR_RATIO_LEAF_NAMES.has(leafName)
    || /\b(?:gear\s*box|gearbox|transmission)\b/.test(text);
}

function normalizedBrandKey(part) {
  return String(part?.b || part?.bn || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizedRawFallbackCategoryId(part) {
  const categoryId = Number(part?.ci || part?.pi || 0);

  return Number.isFinite(categoryId) && categoryId > 0 ? categoryId : 0;
}

function isRawFallbackCatalogPart(part, masterCatalog) {
  const partId = Number(part?.i || 0);
  const categoryId = normalizedRawFallbackCategoryId(part);

  return partId > 0
    && !isHiddenCatalogPart(part)
    && !masterCatalog?.partEntriesById?.has(partId)
    && categoryId > 0
    && !RAW_FALLBACK_EXCLUDED_CATEGORY_IDS.has(categoryId)
    && !RAW_FALLBACK_EXCLUDED_BRAND_KEYS.has(normalizedBrandKey(part))
    && String(part?.n || "").trim()
    && Number(part?.p || 0) > 0;
}

function rawFallbackCatalogParts(parts, masterCatalog) {
  return parts
    .filter((part) => isRawFallbackCatalogPart(part, masterCatalog))
    .map((part) => {
      const categoryId = normalizedRawFallbackCategoryId(part);
      const designId = Number(part.di || part.pdi || 1) || 1;

      return {
        ...part,
        pi: categoryId,
        ci: categoryId,
        categoryID: categoryId,
        di: designId,
        pdi: designId,
        n: part.n,
        mn: part.mn || part.n,
      };
    });
}

function renderedLeafName(leaf) {
  const renderedId = Number(leaf?.renderedId || 0);

  return renderedId === AIR_FUEL_CONTROLLER_CATEGORY_ID || renderedId === AIR_FUEL_METER_CATEGORY_ID
    ? categoryName(renderedId)
    : leaf.name;
}

function swfContentBytes(buffer) {
  const signature = buffer.subarray(0, 3).toString("ascii");

  if (signature === "CWS") {
    return Buffer.concat([Buffer.from("FWS"), buffer.subarray(3, 8), inflateSync(buffer.subarray(8))]);
  }

  return buffer;
}

function swfRectEndOffset(buffer, offset) {
  const bitCount = buffer[offset] >> 3;
  const bitLength = 5 + bitCount * 4;

  return offset + Math.ceil(bitLength / 8);
}

function readUInt16LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

function readUInt32LE(buffer, offset) {
  return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0;
}

function placeObject2Details(buffer, offset, length) {
  if (length < 3) {
    return null;
  }

  const flags = buffer[offset];
  const depth = readUInt16LE(buffer, offset + 1);

  return {
    depth,
    characterId: flags & 0x02 ? readUInt16LE(buffer, offset + 3) : 0,
  };
}

function placeObjectDetails(buffer, offset, length) {
  if (length < 4) {
    return null;
  }

  return {
    characterId: readUInt16LE(buffer, offset),
    depth: readUInt16LE(buffer, offset + 2),
  };
}

function timelineFrames(buffer, offset, endOffset = buffer.length) {
  const activeDepths = new Map();
  const frames = [];
  const placedCharacterIds = [];
  let frameNumber = 1;

  while (offset + 2 <= endOffset) {
    const header = readUInt16LE(buffer, offset);
    offset += 2;

    const tagCode = header >> 6;
    let length = header & 0x3f;
    if (length === 0x3f) {
      length = readUInt32LE(buffer, offset);
      offset += 4;
    }

    if (tagCode === 4) {
      const placeObject = placeObjectDetails(buffer, offset, length);
      if (placeObject) {
        activeDepths.set(placeObject.depth, placeObject.characterId);
        placedCharacterIds.push(placeObject.characterId);
      }
    } else if (tagCode === 26 || tagCode === 70) {
      const placeObject = placeObject2Details(buffer, offset, length);
      if (placeObject) {
        activeDepths.set(placeObject.depth, placeObject.characterId || activeDepths.get(placeObject.depth) || 0);
        if (placeObject.characterId) {
          placedCharacterIds.push(placeObject.characterId);
        }
      }
    } else if (tagCode === 5 && length >= 4) {
      activeDepths.delete(readUInt16LE(buffer, offset + 2));
    } else if (tagCode === 28 && length >= 2) {
      activeDepths.delete(readUInt16LE(buffer, offset));
    } else if (tagCode === 1) {
      const activeCharacterIds = [...activeDepths.values()].filter(Boolean);
      frames.push({
        frameNumber,
        activeCount: activeCharacterIds.length,
        activeCharacterIds,
      });
      frameNumber += 1;
    }

    offset += length;
    if (tagCode === 0) {
      break;
    }
  }

  return { frames, placedCharacterIds };
}

function visibleDesignIds(buffer) {
  const content = swfContentBytes(buffer);
  let offset = swfRectEndOffset(content, 8) + 4;
  const rootOffset = offset;
  const renderableDefinitionIds = new Set();
  const sprites = new Map();
  const renderableTagCodes = new Set([2, 6, 20, 21, 22, 32, 35, 36, 46, 83, 84, 90]);

  while (offset + 2 <= content.length) {
    const header = readUInt16LE(content, offset);
    offset += 2;

    const tagCode = header >> 6;
    let length = header & 0x3f;
    if (length === 0x3f) {
      length = readUInt32LE(content, offset);
      offset += 4;
    }

    if (tagCode === 39 && length >= 4) {
      const spriteId = readUInt16LE(content, offset);
      sprites.set(spriteId, timelineFrames(content, offset + 4, offset + length).frames);
    } else if (renderableTagCodes.has(tagCode) && length >= 2) {
      renderableDefinitionIds.add(readUInt16LE(content, offset));
    }

    offset += length;
    if (tagCode === 0) {
      break;
    }
  }

  const rootTimeline = timelineFrames(content, rootOffset);
  const designIds = new Set();
  const renderableMemo = new Map();

  function isRenderableCharacter(characterId, seenCharacterIds = new Set()) {
    if (renderableDefinitionIds.has(characterId)) {
      return true;
    }
    if (renderableMemo.has(characterId)) {
      return renderableMemo.get(characterId);
    }
    if (seenCharacterIds.has(characterId)) {
      return false;
    }

    const spriteFrames = sprites.get(characterId);
    if (!spriteFrames) {
      renderableMemo.set(characterId, false);
      return false;
    }

    seenCharacterIds.add(characterId);
    const isRenderable = spriteFrames.some((frame) => frame.activeCharacterIds.some(
      (childCharacterId) => isRenderableCharacter(childCharacterId, seenCharacterIds),
    ));
    seenCharacterIds.delete(characterId);
    renderableMemo.set(characterId, isRenderable);

    return isRenderable;
  }

  for (const spriteId of rootTimeline.placedCharacterIds) {
    const spriteFrames = sprites.get(spriteId);
    if (!spriteFrames || !spriteFrames.length) {
      continue;
    }

    for (const frame of spriteFrames) {
      if (frame.activeCharacterIds.some((characterId) => isRenderableCharacter(characterId))) {
        designIds.add(frame.frameNumber);
      }
    }
  }

  if (!designIds.size) {
    for (const frame of rootTimeline.frames) {
      if (frame.activeCharacterIds.some((characterId) => isRenderableCharacter(characterId))) {
        designIds.add(frame.frameNumber);
      }
    }
  }

  return designIds;
}

async function visibleDesignIdsForCatalogCar({ assetRoot, catalogCarId, view, file }) {
  const normalizedCatalogCarId = Number(catalogCarId || 0);
  const candidates = [
    join(String(assetRoot || ""), "cache", "car", "packages", `${normalizedCatalogCarId}${view}`, file),
    join(String(assetRoot || ""), "car", "packages", `${normalizedCatalogCarId}${view}`, file),
    join(String(assetRoot || ""), "packages", `${normalizedCatalogCarId}${view}`, file),
    join(DEFAULT_CLIENT_CAR_PACKAGES_ROOT, `${normalizedCatalogCarId}${view}`, file),
  ];

  for (const candidate of candidates) {
    try {
      return visibleDesignIds(await readFile(candidate));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return new Set();
}

async function visibleDesignIdsForCategory({ assetRoot, catalogCarId, category }) {
  const designIdSets = await Promise.all(category.files.map((assetFile) => visibleDesignIdsForCatalogCar({
    assetRoot,
    catalogCarId,
    view: assetFile.view,
    file: assetFile.file,
  })));

  return new Set(designIdSets.flatMap((designIds) => [...designIds]));
}

function visualPartPreference(part, categoryId) {
  const id = Number(part.i || 0);
  const name = String(part.n || "");

  if (id >= categoryId * 100 && id < (categoryId + 1) * 100) {
    return 0;
  }
  if (!/\(\d+\)$/i.test(name)) {
    return 1;
  }

  return 2;
}

function bestVisualPartsByDesignId(parts, categoryId) {
  const bestParts = new Map();

  for (const part of parts) {
    if (Number(part.ci || part.pi) !== Number(categoryId)) {
      continue;
    }

    const designId = Number(part.di || part.pdi || 0);
    if (designId < 2) {
      continue;
    }

    const existing = bestParts.get(designId);
    if (!existing || visualPartPreference(part, categoryId) < visualPartPreference(existing, categoryId)) {
      bestParts.set(designId, part);
    }
  }

  return bestParts;
}

function generatedVisualPart({ sourcePart, catalogCarId, categoryId, designId }) {
  const variantNumber = designId - 1;
  const generatedId = Number(sourcePart?.i || (800000 + Number(catalogCarId) * 10000 + categoryId * 100 + variantNumber));

  return {
    ...(sourcePart || {}),
    i: generatedId,
    pi: categoryId,
    ci: categoryId,
    t: sourcePart?.t || "e",
    pt: sourcePart?.pt || sourcePart?.t || "e",
    n: `Aftermarket ${variantNumber}`,
    mn: `Aftermarket ${variantNumber}`,
    b: "aftermarket",
    bn: "Aftermarket",
    di: designId,
    pdi: designId,
    l: NEWBURGE_LOCATION_ID,
    p: Number(sourcePart?.p || 0),
    pp: Number(sourcePart?.pp || 0),
    g: sourcePart?.g || "C",
    mo: Number(sourcePart?.mo || 0),
    hp: Number(sourcePart?.hp || 0),
    tq: Number(sourcePart?.tq || 0),
    wt: Number(sourcePart?.wt || 0),
    cc: Number(sourcePart?.cc || 0),
  };
}

async function filterExteriorAssetsForCatalogCar(parts, { assetRoot, catalogCarId }) {
  const normalizedCatalogCarId = Number(catalogCarId || 0);
  if (!normalizedCatalogCarId) {
    return parts;
  }

  const passthroughParts = parts.filter((part) => !EXTERIOR_ASSET_CATEGORY_IDS.has(Number(part.ci || part.pi)));
  const exteriorSourceParts = parts.filter((part) => EXTERIOR_ASSET_CATEGORY_IDS.has(Number(part.ci || part.pi)));
  const generatedParts = [];

  for (const category of EXTERIOR_ASSET_CATEGORIES) {
    if (GRAPHIC_SLOT_IDS.has(category.categoryId)) {
      continue;
    }

    const designIds = [...await visibleDesignIdsForCategory({
      assetRoot,
      catalogCarId: normalizedCatalogCarId,
      category,
    })]
      .filter((designId) => designId > 1)
      .sort((left, right) => left - right);

    const partsByDesignId = bestVisualPartsByDesignId(exteriorSourceParts, category.categoryId);
    for (const designId of designIds) {
      const generatedPart = generatedVisualPart({
        sourcePart: partsByDesignId.get(designId),
        catalogCarId: normalizedCatalogCarId,
        categoryId: category.categoryId,
        designId,
      });

      generatedParts.push(generatedPart);
    }
  }

  return [...passthroughParts, ...generatedParts];
}

async function loadPartsRebalanceSystem({ projectRoot, dataRoot }) {
  const candidates = [
    join(dataRoot, "organizing-parts-rebalanced.js"),
    join(projectRoot, PARTS_REBALANCE_REFERENCE_PATH),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      const module = await import(pathToFileURL(candidate).href);
      return module.default;
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ERR_MODULE_NOT_FOUND") {
        continue;
      }
      throw error;
    }
  }

  return null;
}

function isNormalShopPart(part) {
  return Number(part.pi) < 2000;
}

function normalizePartForRebalance(part, sourceIndex) {
  return {
    ...part,
    sourceIndex,
    id: Number(part.i),
    name: String(part.n || ""),
    categoryId: Number(part.pi),
    cityId: Number(part.l || 100),
    type: String(part.t || ""),
  };
}

function rebalancedLocationBySourceIndex(parts, rebalanceSystem) {
  if (!rebalanceSystem) {
    return new Map();
  }

  const normalParts = [];
  for (const [sourceIndex, part] of parts.entries()) {
    if (isNormalShopPart(part)) {
      normalParts.push(normalizePartForRebalance(part, sourceIndex));
    }
  }

  const rebalancedParts = typeof rebalanceSystem.rebalanceAll === "function"
    ? rebalanceSystem.rebalanceAll(normalParts)
    : normalParts.map((part) => rebalanceSystem.normalizePart?.(part) || part);
  const locationBySourceIndex = new Map();

  for (const part of rebalancedParts || []) {
    const sourceIndex = Number(part.sourceIndex);
    const locationId = Number(part.cityId ?? part.l);
    if (sourceIndex >= 0 && VALID_LOCATION_IDS.has(locationId)) {
      locationBySourceIndex.set(sourceIndex, locationId);
    }
  }

  return locationBySourceIndex;
}

export function inferExteriorMiscCategoryId(part) {
  const text = `${part?.n || ""} ${part?.mn || ""}`.toLowerCase();
  for (const [pattern, categoryId] of EXTERIOR_MISC_RECLASS_RULES) {
    if (pattern.test(text)) {
      return categoryId;
    }
  }

  return 2;
}

function applyExteriorMiscReclassification(parts) {
  return parts.map((part) => {
    if (Number(part?.pi) !== 2) {
      return part;
    }

    const categoryId = inferExteriorMiscCategoryId(part);
    if (categoryId === 2) {
      return part;
    }

    return {
      ...part,
      pi: categoryId,
      ci: categoryId,
      categoryID: categoryId,
    };
  });
}

export function inferGaugeMiscCategoryId(part) {
  const text = `${part?.n || ""} ${part?.mn || ""}`.toLowerCase();

  for (const [pattern, categoryId] of EXTERIOR_MISC_RECLASS_RULES) {
    if (pattern.test(text)) {
      return categoryId;
    }
  }

  for (const [pattern, categoryId] of GAUGE_MISC_RECLASS_RULES) {
    if (pattern.test(text)) {
      return categoryId;
    }
  }

  return 19;
}

function applyGaugeMiscReclassification(parts) {
  return parts.map((part) => {
    if (Number(part?.pi) !== 19) {
      return part;
    }

    const categoryId = inferGaugeMiscCategoryId(part);
    if (categoryId === 19) {
      return part;
    }

    return {
      ...part,
      pi: categoryId,
      ci: categoryId,
      categoryID: categoryId,
    };
  });
}

function applyRebalancedLocations(parts, rebalanceSystem) {
  const locationBySourceIndex = rebalancedLocationBySourceIndex(parts, rebalanceSystem);

  return parts.map((part, sourceIndex) => {
    if (FIXED_TORENO_PART_IDS.has(Number(part.i))) {
      return {
        ...part,
        l: TORENO_LOCATION_ID,
      };
    }
    if (FIXED_NEWBURGE_PART_IDS.has(Number(part.i))) {
      return {
        ...part,
        l: NEWBURGE_LOCATION_ID,
      };
    }
    if (FIXED_CREEK_SIDE_PART_IDS.has(Number(part.i))) {
      return {
        ...part,
        l: CREEK_SIDE_LOCATION_ID,
      };
    }

    const locationId = locationBySourceIndex.get(sourceIndex);
    if (locationBySourceIndex.size === 0 || !isNormalShopPart(part) || !locationId) {
      return part;
    }

    return {
      ...part,
      l: locationId,
    };
  });
}

function applyGearRatioSetupDisplayNames(parts) {
  return parts.map((part) => {
    if (Number(part?.pi) !== GEAR_RATIO_CATEGORY_ID) {
      return part;
    }

    if (String(part?.b || "").toLowerCase() !== "setup") {
      return part;
    }

    return {
      ...part,
      n: "Gear Ratios",
      mn: "Gear Ratios",
    };
  });
}

function partCountsByCategory(parts) {
  const counts = new Map();

  for (const part of parts) {
    const categoryId = Number(part.pi ?? part.ci ?? 0);
    if (!categoryId) {
      continue;
    }
    counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
  }

  return counts;
}

function leafMenuLabel(groupName, categoryId, bucketSize) {
  const canonicalName = categoryName(categoryId);
  const shopLabel = categoryShopLabel(categoryId, canonicalName);

  if (bucketSize === 1 && groupName && groupName !== canonicalName) {
    return groupName;
  }

  return shopLabel;
}

function finalizeCategoryPartCounts(categories, counts) {
  return categories.map((category) => ({
    ...category,
    partCount: counts.get(Number(category.id)) || 0,
  }));
}

function flattenTree(tree, {
  storeType,
  counts,
  parentId = 0,
  idMapper = (id) => id,
  startGeneratedId,
}) {
  const categories = [];
  let nextGeneratedId = startGeneratedId ?? (storeType === "2" ? 920000 : 900000);

  function addCategory({ id, renderedParentId, name, childCount, depth }) {
    const renderedId = Number(idMapper(id));
    categories.push({
      id: renderedId,
      parentId: renderedParentId,
      name,
      storeType,
      childCount,
      color: categoryColor(renderedId, depth),
      partCount: counts.get(renderedId) || 0,
    });
    return renderedId;
  }

  function addGroup(name, renderedParentId, childCount, depth) {
    const groupId = nextGeneratedId++;
    addCategory({
      id: groupId,
      renderedParentId,
      name,
      childCount,
      depth,
    });
    return groupId;
  }

  function attachLeafCategories(categoryIds, renderedParentId, groupName, depth) {
    for (const categoryId of categoryIds) {
      addCategory({
        id: Number(categoryId),
        renderedParentId,
        name: leafMenuLabel(groupName, Number(categoryId), categoryIds.length),
        childCount: 0,
        depth,
      });
    }
  }

  function visit(nodes, renderedParentId, depth) {
    for (const [name, children] of nodes) {
      const childItems = Array.isArray(children) ? children : [];
      const numericIds = childItems.filter((item) => typeof item === "number").map(Number);
      const nestedNodes = childItems.filter((item) => Array.isArray(item));

      if (numericIds.length > 0 && nestedNodes.length === 0) {
        attachLeafCategories(numericIds, renderedParentId, name, depth);
        continue;
      }

      if (numericIds.length === 0 && nestedNodes.length === 1) {
        visit(nestedNodes, renderedParentId, depth);
        continue;
      }

      if (numericIds.length === 0 && nestedNodes.length > 0) {
        const groupId = addGroup(name, renderedParentId, nestedNodes.length, depth);
        visit(nestedNodes, groupId, depth + 1);
        continue;
      }

      if (numericIds.length > 0 && nestedNodes.length > 0) {
        const groupId = addGroup(name, renderedParentId, nestedNodes.length + numericIds.length, depth);
        attachLeafCategories(numericIds, groupId, name, depth + 1);
        visit(nestedNodes, groupId, depth + 1);
        continue;
      }

      addGroup(name, renderedParentId, 0, depth);
    }
  }

  visit(tree, parentId, 0);
  return categories;
}

function categoryName(categoryId) {
  return CATEGORY_NAMES.get(Number(categoryId)) || `Category ${categoryId}`;
}

const CATEGORY_SHOP_LABELS = new Map([
  [24, "Street Clutches"],
  [2162, "Performance Clutches"],
  [2175, "Upgrade Intercoolers"],
  [39, "Stock Engine Blocks"],
  [184, "Performance Engine Blocks"],
  [136, "Head Gaskets"],
  [186, "Replacement Head Gaskets"],
]);

function categoryShopLabel(categoryId, fallbackName = "") {
  return CATEGORY_SHOP_LABELS.get(Number(categoryId)) || fallbackName || categoryName(categoryId);
}

function categoryColor(categoryId, depth) {
  const colors = ["CCCCCC", "66CCFF", "66CC66", "FFCC66", "CC99FF"];

  return colors[(Number(categoryId) + depth) % colors.length];
}

function generatedGaugeGraphicParts() {
  return GENERATED_GAUGE_GRAPHIC_PARTS.map((part) => ({
    i: part.id,
    pi: GRAPHICS_SHOP_GAUGE_CATEGORY_ID,
    ci: GRAPHICS_SHOP_GAUGE_CATEGORY_ID,
    pcid: GRAPHICS_SHOP_GAUGE_CATEGORY_ID,
    categoryID: GRAPHICS_SHOP_GAUGE_CATEGORY_ID,
    t: "c",
    pt: "c",
    n: part.name,
    mn: part.name,
    p: part.price,
    pp: part.points,
    g: "C",
    di: part.designId,
    pdi: part.designId,
    b: "graphics",
    bn: "Gauge Graphics",
    l: part.location,
    mo: 0,
    hp: 0,
    tq: 0,
    wt: 0,
    cc: 0,
  }));
}

function generatedShiftLightParts() {
  return GENERATED_SHIFT_LIGHT_PARTS.map((part) => ({
    i: part.id,
    pi: SHIFT_LIGHT_CATEGORY_ID,
    ci: SHIFT_LIGHT_CATEGORY_ID,
    pcid: SHIFT_LIGHT_CATEGORY_ID,
    categoryID: SHIFT_LIGHT_CATEGORY_ID,
    t: "e",
    pt: "e",
    n: part.name,
    mn: part.name,
    p: part.price,
    pp: part.points,
    g: "C",
    di: part.designId,
    pdi: part.designId,
    b: "Electrical",
    bn: "Shift Lights",
    l: part.location,
    mo: 0,
    hp: 0,
    tq: 0,
    wt: 0,
    cc: 0,
  }));
}

function generatedCompatibilityParts() {
  return GENERATED_COMPATIBILITY_PARTS.map((part) => {
    const categoryId = Number(part.categoryId);
    const designId = Number(part.designId || 1);
    const type = part.type || "e";

    return {
      i: Number(part.partId || (990000 + categoryId)),
      pi: categoryId,
      ci: categoryId,
      pcid: categoryId,
      categoryID: categoryId,
      t: type,
      pt: type,
      n: part.name,
      mn: part.name,
      p: Number(part.price || 0),
      pp: Number(part.points || 0),
      g: part.grade || "C",
      di: designId,
      pdi: designId,
      b: String(part.brand || "compat").toLowerCase().replace(/[^a-z0-9]+/g, "") || "compat",
      bn: part.brand || "Compatibility",
      l: Number(part.location || generatedCompatibilityLocation(categoryId)),
      mo: 0,
      hp: Number(part.hp || 0),
      tq: Number(part.tq || 0),
      wt: Number(part.wt || 0),
      cc: Number(part.cc || 0),
      ug: part.ug,
      af: part.af,
      ff: part.ff,
      ef: part.ef,
    };
  });
}

function realLifeFamiliesForSpec(spec) {
  const familyIds = new Set(spec.families || REAL_LIFE_PART_FAMILIES.map((family) => family.id));

  return REAL_LIFE_PART_FAMILIES.filter((family) => familyIds.has(family.id));
}

function normalizedCatalogCarGeneratedFamily(catalogCarId) {
  const catalogCar = getCatalogCar(catalogCarId);
  const family = String(catalogCar?.engineFamily || "").toLowerCase();
  const descriptor = `${family} ${catalogCar?.stockEngine || ""} ${catalogCar?.stockEngineCode || ""}`.toLowerCase();

  if (family === "i4" || family === "v4" || family === "h4" || /\b(i4|v4|h4)\b/.test(descriptor)) {
    return "i4";
  }
  if (family === "i6" || /\bi6\b/.test(descriptor)) {
    return "i6";
  }
  if (family === "v6" || /\bv6\b/.test(descriptor)) {
    return "v6";
  }
  if (family === "v8" || /\bv8\b/.test(descriptor)) {
    return "v8";
  }

  return "";
}

function generatedRealLifePartName({ brand, model, tier, family, categoryName }) {
  const familyLabel = family.id === "universal" ? "Universal" : family.label;

  return `${brand} ${model} ${tier.label} ${familyLabel} ${categoryName}`;
}

function generatedRealLifeFlowValue(spec, tier, family) {
  const baseFlow = Number(spec.flowBase || 0);
  if (!baseFlow) {
    return undefined;
  }

  return Number((baseFlow * tier.power * Math.max(0.7, family.powerBias)).toFixed(3));
}

function generatedRealLifeEngineFlow(horsepower, torque) {
  return Math.max(1, Number(((Number(horsepower || 0) + Number(torque || 0)) / 20).toFixed(3)));
}

function generatedRealLifePartRecord({
  offset,
  spec,
  family,
  tier,
  brand,
  model,
}) {
  const categoryId = Number(spec.categoryId);
  const type = spec.type || "e";
  const familyPowerScale = family.id === "universal" ? 0.72 : family.powerBias;
  const familyPriceScale = family.id === "universal" ? family.priceBias : family.priceBias;
  const horsepower = Math.round(Number(spec.hp || 0) * tier.power * familyPowerScale);
  const torque = Math.round(Number(spec.tq || 0) * tier.power * familyPowerScale);
  const weight = Math.round(Number(spec.wt || 0) + Number(family.weightBias || 0) + (tier.rank - 1) * 2);
  const rawPrice = Math.round(Number(spec.price || 1) * tier.price * familyPriceScale);
  const location = tier.rank <= 2 ? 100 : tier.rank === 3 ? 300 : 500;
  const locationMaxPrice = location === 100 ? 5000 : location === 300 ? 12000 : 15000;
  const isEngineSwap = Number(spec.categoryId) === 133;
  const price = isEngineSwap ? 0 : Math.min(rawPrice, locationMaxPrice);
  const pointPrice = isEngineSwap
    ? 1750 // Engine swaps: flat 1750 points, no money allowed
    : Math.max(1, Math.round(price / 40));
  const flowValue = generatedRealLifeFlowValue(spec, tier, family);
  const boostPsi = spec.boost ? Number((6 + tier.rank * 2.5 + (family.id === "v8" ? 1 : 0)).toFixed(1)) : undefined;
  const name = generatedRealLifePartName({
    brand,
    model,
    tier,
    family,
    categoryName: spec.categoryName,
  });

  return {
    i: REAL_LIFE_PART_ID_START + offset,
    pi: categoryId,
    ci: categoryId,
    pcid: categoryId,
    categoryID: categoryId,
    t: type,
    pt: type,
    n: name,
    mn: name,
    p: Math.max(0, price),
    pp: pointPrice,
    g: tier.rank >= 4 ? "A" : tier.rank >= 3 ? "B" : "C",
    di: tier.rank,
    pdi: tier.rank,
    b: String(brand || "realparts").toLowerCase().replace(/[^a-z0-9]+/g, "") || "realparts",
    bn: brand,
    l: location,
    mo: 0,
    hp: horsepower,
    tq: torque,
    wt: weight,
    cc: Number(spec.cc || 0),
    compatFamily: family.id,
    tier: tier.id,
    tierRank: tier.rank,
    af: spec.flow === "af" ? flowValue : undefined,
    ff: spec.flow === "ff" ? flowValue : undefined,
    ef: spec.flow === "ef" ? flowValue : undefined,
    eef: categoryId === 133 ? generatedRealLifeEngineFlow(horsepower, torque) : undefined,
    stockBoost: spec.boost ? Math.max(0, Number((boostPsi * 0.45).toFixed(1))) : undefined,
    boostSetting: spec.boost ? boostPsi : undefined,
    maxPsi: spec.boost ? Number((boostPsi + 4).toFixed(1)) : undefined,
  };
}

function generatedRealLifeParts({ catalogCarId } = {}) {
  const parts = [];
  const selectedFamily = normalizedCatalogCarGeneratedFamily(catalogCarId);

  for (const spec of REAL_LIFE_PART_SPECS) {
    for (const family of realLifeFamiliesForSpec(spec)) {
      if (!REAL_LIFE_ENGINE_FAMILIES.has(family.id) && Number(spec.categoryId) === 133) {
        continue;
      }
      if (selectedFamily && family.id !== "universal" && family.id !== selectedFamily) {
        continue;
      }

      for (const tier of REAL_LIFE_PART_TIERS) {
        const brandIndex = (parts.length + tier.rank) % spec.brands.length;
        const modelIndex = (parts.length + REAL_LIFE_PART_TIERS.length - tier.rank) % spec.models.length;
        parts.push(generatedRealLifePartRecord({
          offset: parts.length,
          spec,
          family,
          tier,
          brand: spec.brands[brandIndex],
          model: spec.models[modelIndex],
        }));
      }
    }
  }

  const generated = parts.slice(0, REAL_LIFE_PART_TARGET_COUNT);
  if (!selectedFamily && generated.length !== REAL_LIFE_PART_TARGET_COUNT) {
    throw new Error(`Expected ${REAL_LIFE_PART_TARGET_COUNT} generated real-life parts, received ${generated.length}`);
  }

  return generated;
}

function buildGeneratedElectricalCatalogParts({ catalogCarId } = {}) {
  return [
    ...generatedGaugeGraphicParts(),
    ...generatedShiftLightParts(),
    ...generatedCompatibilityParts(),
    ...generatedRealLifeParts({ catalogCarId }),
  ];
}

function buildGraphicsMenuCategories(counts) {
  const configBySlotId = new Map(GRAPHIC_SLOT_CONFIGS.map((config) => [Number(config.slotId), config]));
  const panelLeaves = GRAPHICS_PANEL_MENU_ORDER
    .map(({ slotId, name }, index) => ({
      id: slotId,
      parentId: GRAPHICS_SHOP_PANEL_CATEGORY_ID,
      name,
      storeType: GRAPHICS_SHOP_STORE_TYPE,
      childCount: 0,
      color: categoryColor(slotId, index + 2),
      partCount: counts.get(Number(slotId)) || 0,
      config: configBySlotId.get(Number(slotId)),
    }))
    .filter((category) => category.config && counts.has(Number(category.id)))
    .map(({ config: _config, ...category }) => category);

  if (panelLeaves.length === 0) {
    return [];
  }

  const panelPartCount = panelLeaves.reduce((total, category) => total + Number(category.partCount || 0), 0);
  const builtInGraphicsLeaves = [
    { id: GRAPHICS_SHOP_CUSTOM_CATEGORY_ID, name: "Full Graphics" },
    { id: 148, name: "Hood Graphics" },
    { id: 149, name: "Side Graphics" },
    { id: 150, name: "Front Graphics" },
    { id: 151, name: "Back Graphics" },
  ].map((category, index) => ({
    id: category.id,
    parentId: GRAPHICS_SHOP_ROOT_CATEGORY_ID,
    name: category.name,
    storeType: GRAPHICS_SHOP_STORE_TYPE,
    childCount: 0,
    color: categoryColor(category.id, index + 1),
    partCount: counts.get(Number(category.id)) || 0,
  }));

  return [
    {
      id: GRAPHICS_SHOP_ROOT_CATEGORY_ID,
      parentId: 0,
      name: "Graphics",
      storeType: GRAPHICS_SHOP_STORE_TYPE,
      childCount: builtInGraphicsLeaves.length + 2,
      color: categoryColor(GRAPHICS_SHOP_ROOT_CATEGORY_ID, 0),
      partCount: 0,
    },
    ...builtInGraphicsLeaves,
    {
      id: GRAPHICS_SHOP_GAUGE_CATEGORY_ID,
      parentId: GRAPHICS_SHOP_ROOT_CATEGORY_ID,
      name: "Gauge Graphics",
      storeType: GRAPHICS_SHOP_STORE_TYPE,
      childCount: 0,
      color: categoryColor(GRAPHICS_SHOP_GAUGE_CATEGORY_ID, 1),
      partCount: counts.get(Number(GRAPHICS_SHOP_GAUGE_CATEGORY_ID)) || 0,
    },
    {
      id: GRAPHICS_SHOP_PANEL_CATEGORY_ID,
      parentId: GRAPHICS_SHOP_ROOT_CATEGORY_ID,
      name: "Panel",
      storeType: GRAPHICS_SHOP_STORE_TYPE,
      childCount: panelLeaves.length,
      color: categoryColor(GRAPHICS_SHOP_PANEL_CATEGORY_ID, 1),
      partCount: panelPartCount,
    },
    ...panelLeaves,
  ];
}

function renderCategory(category) {
  const categoryId = Number(category.id || 0);

  return renderNode("c", {
    i: categoryId,
    pi: category.parentId,
    n: category.name,
    s: category.storeType,
    c: category.childCount,
    cl: category.color,
    p: category.partCount,
    pp: 0,
    r: FORCED_INDUCTION_CATEGORY_IDS.has(categoryId) ? 1 : 0,
  }, "<r/><c/>");
}

function isPartsShopCategoryId(categoryId) {
  const id = Number(categoryId);
  if (!id || isCprMenuTriggerCategoryId(id)) {
    return false;
  }

  return !GRAPHICS_SHOP_REQUEST_CATEGORY_IDS.has(id)
    && !BUILT_IN_GRAPHIC_CATEGORY_IDS.has(id)
    && !GRAPHIC_SLOT_IDS.has(id);
}

export function buildPartsShopCategoryXml(parts) {
  const counts = partCountsByCategory(parts);
  const normalCategories = finalizeCategoryPartCounts(
    flattenTree(NORMAL_CATEGORY_TREE, { storeType: "0", counts }),
    counts,
  );
  const knownIds = new Set(normalCategories.map((category) => Number(category.id)));
  const uncategorizedLeaves = [...counts.keys()]
    .filter((categoryId) => isPartsShopCategoryId(categoryId))
    .filter((categoryId) => !knownIds.has(categoryId))
    .sort((left, right) => left - right)
    .map((categoryId) => ({
      id: categoryId,
      parentId: 900999,
      name: categoryName(categoryId),
      storeType: "0",
      childCount: 0,
      color: categoryColor(categoryId, 1),
      partCount: counts.get(categoryId) || 0,
    }));
  const uncategorizedParent = uncategorizedLeaves.length > 0
    ? [{
      id: 900999,
      parentId: 0,
      name: "Other Parts",
      storeType: "0",
      childCount: uncategorizedLeaves.length,
      color: "AAAAAA",
      partCount: 0,
    }]
    : [];

  return `<p>${[...normalCategories, ...uncategorizedParent, ...uncategorizedLeaves].map(renderCategory).join("")}</p>`;
}

export function buildFullCategoryXml(parts) {
  const counts = partCountsByCategory(parts);
  const normalCategories = finalizeCategoryPartCounts(
    flattenTree(NORMAL_CATEGORY_TREE, { storeType: "0", counts }),
    counts,
  );
  const graphicsCategories = finalizeCategoryPartCounts(
    buildGraphicsMenuCategories(counts),
    counts,
  );
  const knownIds = new Set([...normalCategories, ...graphicsCategories].map((category) => Number(category.id)));
  const uncategorizedLeaves = [...counts.keys()]
    .filter((categoryId) => isPartsShopCategoryId(categoryId))
    .filter((categoryId) => !knownIds.has(categoryId))
    .sort((left, right) => left - right)
    .map((categoryId) => ({
      id: categoryId,
      parentId: 900999,
      name: categoryName(categoryId),
      storeType: "0",
      childCount: 0,
      color: categoryColor(categoryId, 1),
      partCount: counts.get(categoryId) || 0,
    }));
  const uncategorizedParent = uncategorizedLeaves.length > 0
    ? [{
      id: 900999,
      parentId: 0,
      name: "Other Parts",
      storeType: "0",
      childCount: uncategorizedLeaves.length,
      color: "AAAAAA",
      partCount: 0,
    }]
    : [];

  return `<p>${[...normalCategories, ...graphicsCategories, ...uncategorizedParent, ...uncategorizedLeaves].map(renderCategory).join("")}</p>`;
}

function buildMasterCategoryXml(masterCatalog, parts) {
  const counts = partCountsByCategory(parts);
  const partsById = new Map(parts.map((part) => [Number(part.i), part]));
  const categories = [];

  function renderedLeafId(leaf) {
    if (GEAR_RATIO_DISPLAY_LEAF_NAMES.has(normalizeMasterLeafName(leaf.name))) {
      return GEAR_RATIO_CATEGORY_ID;
    }

    const leafPart = leaf.partIds
      .map((partId) => partsById.get(Number(partId)))
      .find((part) => part && !isGraphicsShopCatalogPart(part));

    return Number(leafPart?.pi || leaf.id);
  }

  function shouldRenderMasterLeaf(leaf) {
    if (GRAPHIC_SLOT_IDS.has(Number(leaf.renderedId))) {
      return false;
    }

    return counts.has(Number(leaf.renderedId))
      || GEAR_RATIO_LEAF_NAMES.has(normalizeMasterLeafName(leaf.name));
  }

  for (const [sectionIndex, section] of masterCatalog.sections.entries()) {
    const leaves = section.leaves
      .map((leaf) => ({
        ...leaf,
        renderedId: renderedLeafId(leaf),
      }))
      .filter(shouldRenderMasterLeaf);
    if (leaves.length === 0) {
      continue;
    }

    categories.push({
      id: section.id,
      parentId: 0,
      name: section.name,
      storeType: "0",
      childCount: leaves.length,
      color: categoryColor(section.id, sectionIndex),
      partCount: 0,
    });

    for (const [leafIndex, leaf] of leaves.entries()) {
      categories.push({
        id: leaf.renderedId,
        parentId: section.id,
        name: renderedLeafName(leaf),
        storeType: "0",
        childCount: 0,
        color: categoryColor(leaf.renderedId, leafIndex + 1),
        partCount: counts.get(Number(leaf.renderedId)) || 0,
      });
    }
  }

  const existingCategoryIds = new Set(categories.map((category) => Number(category.id)));
  function appendMissingGeneratedLeaves({
    categoryIds,
    parentCategory,
    createParentCategory,
    includeEmpty = false,
  }) {
    const leafSource = includeEmpty ? [...categoryIds] : [...counts.keys()];
    const missingLeaves = leafSource
      .map((categoryId) => Number(categoryId))
      .filter((categoryId) => categoryIds.has(categoryId))
      .filter((categoryId) => !existingCategoryIds.has(Number(categoryId)))
      .sort((left, right) => left - right);

    if (missingLeaves.length === 0) {
      return;
    }

    const resolvedParentCategory = parentCategory || createParentCategory();
    if (!parentCategory) {
      categories.push(resolvedParentCategory);
      existingCategoryIds.add(Number(resolvedParentCategory.id));
    }

    for (const [leafIndex, categoryId] of missingLeaves.entries()) {
      categories.push({
        id: categoryId,
        parentId: resolvedParentCategory.id,
        name: categoryName(categoryId),
        storeType: "0",
        childCount: 0,
        color: categoryColor(categoryId, leafIndex + 1),
        partCount: counts.get(Number(categoryId)) || 0,
      });
      existingCategoryIds.add(Number(categoryId));
    }

    resolvedParentCategory.childCount = categories
      .filter((category) => Number(category.parentId || 0) === Number(resolvedParentCategory.id || 0))
      .length;
  }

  const exteriorRoot = categories.find((category) => (
    Number(category.parentId || 0) === 0
    && /exterior|appearance/i.test(String(category.name || ""))
  ));
  appendMissingGeneratedLeaves({
    categoryIds: GENERATED_EXTERIOR_CATEGORY_IDS,
    parentCategory: exteriorRoot,
    includeEmpty: true,
    createParentCategory: () => ({
      id: 930007,
      parentId: 0,
      name: "Exterior Appearance",
      storeType: "0",
      childCount: 0,
      color: categoryColor(930007, 0),
      partCount: 0,
    }),
  });

  const electricalRoot = categories.find((category) => (
    Number(category.parentId || 0) === 0
    && /electrical|electronics|ignition/i.test(String(category.name || ""))
  ));
  appendMissingGeneratedLeaves({
    categoryIds: new Set([SHIFT_LIGHT_CATEGORY_ID]),
    parentCategory: electricalRoot,
    includeEmpty: true,
    createParentCategory: () => ({
      id: 930015,
      parentId: 0,
      name: "Electrical",
      storeType: "0",
      childCount: 0,
      color: categoryColor(930015, 0),
      partCount: 0,
    }),
  });

  appendMissingGeneratedLeaves({
    categoryIds: GENERATED_COMPATIBILITY_CATEGORY_IDS,
    includeEmpty: false,
    createParentCategory: () => ({
      id: 930090,
      parentId: 0,
      name: "Compatibility Parts",
      storeType: "0",
      childCount: 0,
      color: categoryColor(930090, 0),
      partCount: 0,
    }),
  });

  for (const category of buildGraphicsMenuCategories(counts)) {
    const categoryId = Number(category.id);
    const isGraphicsShopGaugeLeaf = categoryId === GRAPHICS_SHOP_GAUGE_CATEGORY_ID
      && Number(category.parentId || 0) === GRAPHICS_SHOP_ROOT_CATEGORY_ID;
    if (existingCategoryIds.has(categoryId) && !isGraphicsShopGaugeLeaf) {
      continue;
    }

    categories.push(category);
    existingCategoryIds.add(categoryId);
  }

  for (const [categoryId, name, color] of [
    [WHEEL_CATEGORY_ID, "Wheels", "BBBBBB"],
    [TIRE_CATEGORY_ID, "Tires", "999999"],
  ]) {
    if (!existingCategoryIds.has(categoryId)) {
      categories.push({
        id: categoryId,
        parentId: 0,
        name,
        storeType: GARAGE_BIN_STORE_TYPE,
        childCount: 0,
        color,
        partCount: Math.max(1, counts.get(categoryId) || 0),
      });
    }
  }

  return `<p>${categories.map(renderCategory).join("")}</p>`;
}

function applyMasterPartsCatalog(parts, masterCatalog) {
  if (!masterCatalog?.partEntriesById?.size) {
    return parts;
  }

  const rawPartById = new Map(parts.map((part) => [Number(part.i), part]));
  const inferredInstallCategoryByLeaf = new Map();

  for (const masterEntry of masterCatalog.partEntriesById.values()) {
    const rawPart = rawPartById.get(Number(masterEntry.partId));
    const rawCategoryId = Number(rawPart?.ci || rawPart?.pi || 0);
    if (!rawCategoryId) {
      continue;
    }

    const leafKey = `${masterEntry.sectionName}\u0000${masterEntry.leafName}`;
    const counts = inferredInstallCategoryByLeaf.get(leafKey) || new Map();
    counts.set(rawCategoryId, (counts.get(rawCategoryId) || 0) + 1);
    inferredInstallCategoryByLeaf.set(leafKey, counts);
  }

  for (const [leafKey, counts] of inferredInstallCategoryByLeaf) {
    const [categoryId] = [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0] || [0];
    inferredInstallCategoryByLeaf.set(leafKey, categoryId);
  }

  return parts
    .map((part) => {
      const masterEntry = masterCatalog.partEntriesById.get(Number(part.i));
      if (!masterEntry) {
        return null;
      }
      const leafKey = `${masterEntry.sectionName}\u0000${masterEntry.leafName}`;
      const leafName = normalizeMasterLeafName(masterEntry.leafName);
      const inferredInstallCategoryId = MASTER_LEAF_INSTALL_CATEGORY_IDS.get(
        leafName,
      ) || inferredInstallCategoryByLeaf.get(leafKey) || Number(part.ci || part.pi);
      const airFuelController = isAirFuelControllerPart(part, masterEntry);
      const airFuelMeter = isAirFuelMeterPart(part, masterEntry);
      const gearRatioPart = isGearRatioPart(part, masterEntry);
      const gearRatioDisplayLeaf = GEAR_RATIO_DISPLAY_LEAF_NAMES.has(leafName);
      const installCategoryId = Number(inferredInstallCategoryId) === AIR_FUEL_METER_CATEGORY_ID
        && airFuelController
        ? AIR_FUEL_CONTROLLER_CATEGORY_ID
        : gearRatioPart
          ? GEAR_RATIO_CATEGORY_ID
          : inferredInstallCategoryId;
      let displayCategoryId = masterEntry.categoryId;
      if (gearRatioDisplayLeaf) {
        displayCategoryId = GEAR_RATIO_CATEGORY_ID;
      } else if (airFuelController) {
        displayCategoryId = AIR_FUEL_CONTROLLER_CATEGORY_ID;
      } else if (airFuelMeter) {
        displayCategoryId = AIR_FUEL_METER_CATEGORY_ID;
      } else if (FORCED_INDUCTION_CATEGORY_IDS.has(Number(installCategoryId))) {
        displayCategoryId = installCategoryId;
      }
      const designId = Number(installCategoryId) === AIR_FUEL_CONTROLLER_CATEGORY_ID
        && airFuelController
        ? AIR_FUEL_CONTROLLER_DESIGN_ID
        : part.di;

      return {
        ...part,
        pi: displayCategoryId,
        ci: installCategoryId,
        categoryID: installCategoryId,
        di: designId,
        pdi: designId,
        n: masterEntry.name,
        mn: masterEntry.name,
        masterCategoryId: masterEntry.categoryId,
        masterSection: masterEntry.sectionName,
        masterCategory: masterEntry.leafName,
        masterLine: masterEntry.line,
      };
    })
    .filter(Boolean);
}

function tuningFlowValue(part) {
  const horsepower = Math.max(0, Number(part.hp || 0));
  const torque = Math.max(0, Number(part.tq || 0));
  const price = Math.max(0, Number(part.p || part.pp || 0));
  const designId = Math.max(1, Number(part.di || part.pdi || 1));
  const value = horsepower + torque * 0.35 + Math.min(25, price / 250) + designId * 0.5;

  return Math.max(1, Number(value.toFixed(3)));
}

function applyTuningFlowAttributes(parts) {
  return parts.map((part) => {
    const categoryId = Number(part.ci || part.pi || 0);
    const attributes = {};

    if (TUNING_AIR_FLOW_CATEGORY_IDS.has(categoryId)) {
      attributes.af = part.af ?? tuningFlowValue(part);
    }
    if (TUNING_FUEL_FLOW_CATEGORY_IDS.has(categoryId)) {
      attributes.ff = part.ff ?? tuningFlowValue(part);
    }
    if (TUNING_EXHAUST_FLOW_CATEGORY_IDS.has(categoryId)) {
      attributes.ef = part.ef ?? tuningFlowValue(part);
    }
    if (categoryId === 133) {
      attributes.eef = part.eef ?? Math.max(1, Number(((Number(part.hp || 0) + Number(part.tq || 0)) / 20).toFixed(3)));
    }

    return Object.keys(attributes).length > 0 ? { ...part, ...attributes } : part;
  });
}

function dedupePartsById(parts) {
  const partsById = new Map();

  for (const part of parts) {
    const partId = Number(part.i);
    if (!partsById.has(partId)) {
      partsById.set(partId, part);
    }
  }

  return [...partsById.values()];
}

function appendUniqueParts(parts, extraParts) {
  const nextParts = [...parts];
  const seenPartIds = new Set(nextParts.map((part) => Number(part.i || 0)));

  for (const part of extraParts) {
    const partId = Number(part?.i || 0);
    if (!partId || seenPartIds.has(partId)) {
      continue;
    }

    seenPartIds.add(partId);
    nextParts.push(part);
  }

  return nextParts;
}

function isGraphicsShopCatalogPart(part) {
  const categoryId = Number(part?.ci || part?.pi || 0);

  return GRAPHIC_SLOT_IDS.has(categoryId)
    || BUILT_IN_GRAPHIC_CATEGORY_IDS.has(categoryId)
    || categoryId === GRAPHICS_SHOP_GAUGE_CATEGORY_ID
    || graphicSlotForPartId(part?.i) > 0;
}

const GRAPHICS_SHOP_REQUEST_CATEGORY_IDS = new Set([
  GRAPHICS_SHOP_ROOT_CATEGORY_ID,
  GRAPHICS_SHOP_CUSTOM_CATEGORY_ID,
  GRAPHICS_SHOP_FULL_CATEGORY_ID,
  GRAPHICS_SHOP_PANEL_CATEGORY_ID,
  GRAPHICS_SHOP_GAUGE_CATEGORY_ID,
  ...BUILT_IN_GRAPHIC_CATEGORY_IDS,
  ...GRAPHIC_SLOT_IDS,
]);

export function isGraphicsShopCatalogRequest(params, session = null) {
  if (!params) {
    return false;
  }

  const resolvedStoreType = resolveCatalogStoreType(params);
  if (resolvedStoreType === 2) {
    return true;
  }
  if (resolvedStoreType === 0) {
    return false;
  }

  const mode = String(params.get("m") ?? params.get("mode") ?? "").trim().toLowerCase();
  if (mode === "graphics" || mode === "2") {
    return true;
  }

  const requestType = String(params.get("t") ?? params.get("type") ?? "").trim().toLowerCase();
  if (requestType === "graphics" || requestType === "2") {
    return true;
  }

  const shopName = String(params.get("sn") ?? params.get("shopname") ?? params.get("nh") ?? "").trim().toLowerCase();
  if (shopName.includes("graphics")) {
    return true;
  }

  const categoryId = Number(
    params.get("pi")
    || params.get("pcid")
    || params.get("cat")
    || params.get("category")
    || params.get("ci")
    || 0,
  );
  if (GRAPHICS_SHOP_REQUEST_CATEGORY_IDS.has(categoryId)) {
    return true;
  }

  const groupId = Number(params.get("gid") || params.get("grpid") || params.get("pg") || 0);
  if (GRAPHICS_SHOP_REQUEST_CATEGORY_IDS.has(groupId)) {
    return true;
  }

  return isSessionGraphicsShopCatalogActive(session);
}

export function filterPartsForGraphicsShop(parts) {
  return parts.filter((part) => isGraphicsShopCatalogPart(part));
}

export function buildGraphicsOnlyCategoryXml(parts) {
  const counts = partCountsByCategory(parts);
  const graphicsCategories = finalizeCategoryPartCounts(
    buildGraphicsMenuCategories(counts),
    counts,
  ).filter((category) => String(category.storeType) === GRAPHICS_SHOP_STORE_TYPE);

  return `<p>${graphicsCategories.map(renderCategory).join("")}</p>`;
}

const CATALOG_STORE_TYPE_PARAM_KEYS = [
  "st",
  "store",
  "s",
  "storeType",
  "shopType",
  "ps",
  "pt",
  "pst",
  "shop",
  "sc",
  "stype",
];

function resolveCatalogStoreType(params) {
  if (!params) {
    return null;
  }

  for (const key of CATALOG_STORE_TYPE_PARAM_KEYS) {
    const value = String(params.get(key) ?? "").trim().toLowerCase();
    if (value === "2" || value === "graphics") {
      return 2;
    }
    if (value === "0" || value === "parts" || value === "performance") {
      return 0;
    }
  }

  return null;
}

export function resolveCatalogStoreTypeFromParams(params) {
  return resolveCatalogStoreType(params);
}

export function markSessionGraphicsShopCatalog(session) {
  if (!session) {
    return;
  }

  session.graphicsShopCatalogActive = true;
  session.graphicsShopCatalogActiveAt = Date.now();
}

export function clearSessionGraphicsShopCatalog(session) {
  if (!session) {
    return;
  }

  session.graphicsShopCatalogActive = false;
  session.graphicsShopCatalogActiveAt = 0;
}

function isSessionGraphicsShopCatalogActive(session) {
  if (!session?.graphicsShopCatalogActive) {
    return false;
  }

  const ageMs = Date.now() - Number(session.graphicsShopCatalogActiveAt || 0);
  return ageMs >= 0 && ageMs < 5 * 60 * 1000;
}

export async function buildPartsCatalog({
  projectRoot,
  dataRoot,
  assetRoot,
  catalogCarId,
} = {}) {
  const cacheKey = `${projectRoot}|${dataRoot}|${assetRoot || ""}|${Number(catalogCarId || 0)}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const rebalanceSystem = await loadPartsRebalanceSystem({ projectRoot, dataRoot });
  const masterCatalogSource = await readMasterPartsCatalog({ projectRoot, dataRoot });
  const masterCatalog = parseMasterPartsCatalog(masterCatalogSource.text);
  const partsListSource = await readPartsList({ projectRoot, dataRoot });
  const rawParts = partsListSource.parts
    .filter((part) => Number(part.i) > 0 && Number(part.pi) > 0)
    .filter((part) => !isHiddenCatalogPart(part));
  const usesMasterCatalog = masterCatalog.partEntriesById.size > 0;
  const rebalancedParts = applyGaugeMiscReclassification(
    applyExteriorMiscReclassification(
      applyCprMenuTriggerCategoryRemap(
        applyRebalancedLocations(rawParts, rebalanceSystem),
      ),
    ),
  );
  const catalogParts = usesMasterCatalog
    ? appendUniqueParts(
      applyMasterPartsCatalog(rebalancedParts, masterCatalog),
      rawFallbackCatalogParts(rebalancedParts, masterCatalog),
    )
    : rebalancedParts;
  const visualParts = await filterExteriorAssetsForCatalogCar(
    applyTuningFlowAttributes(dedupePartsById(catalogParts)),
    { assetRoot, catalogCarId },
  );
  const parts = applyGearRatioSetupDisplayNames(applyEconomyPointPrices(appendUniqueParts(
    visualParts.filter((part) => !isGraphicsShopCatalogPart(part)),
    [
      ...buildGraphicsCatalogParts({ assetRoot, catalogCarId }),
      ...buildGeneratedElectricalCatalogParts({ catalogCarId }),
    ],
  )))
    .sort((left, right) => (
      Number(left.l || 0) - Number(right.l || 0)
      || Number(left.pi || 0) - Number(right.pi || 0)
      || String(left.bn || "").localeCompare(String(right.bn || ""), undefined, { numeric: true })
      || String(left.n || "").localeCompare(String(right.n || ""), undefined, { numeric: true })
      || Number(left.i || 0) - Number(right.i || 0)
    ));
  const shopParts = applyCprMenuTriggerCategoryRemap(
    parts.filter((part) => !isReservedDefaultCatalogPart(part)),
  );
  const catalog = {
    parts: shopParts,
    partsById: new Map(parts.map((part) => [Number(part.i), part])),
    shopPartsById: new Map(shopParts.map((part) => [Number(part.i), part])),
    xml: buildPartsXml(shopParts),
    categoryXml: usesMasterCatalog
      ? buildMasterCategoryXml(masterCatalog, shopParts)
      : buildFullCategoryXml(shopParts),
    metadata: {
      partsListSourcePath: partsListSource.sourcePath,
      masterCatalogSourcePath: masterCatalogSource.sourcePath,
      categorySource: usesMasterCatalog ? "master-catalog" : "structured-fallback",
      missingPartsListCandidates: partsListSource.missingCandidates,
      missingMasterCatalogCandidates: masterCatalogSource.missingCandidates,
    },
  };

  catalogCache.set(cacheKey, catalog);
  return catalog;
}
