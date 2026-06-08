import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { config } from "../src/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const PARTS_CATALOG_PATH = path.join(ROOT_DIR, "src", "catalog-data", "parts-catalog.xml");
const WHEELS_CATALOG_PATH = path.join(ROOT_DIR, "src", "catalog-data", "wheels-catalog.json");
const REPORT_PATH = path.join(ROOT_DIR, "tmp", "part-enrichment", "reconcile-parts-catalog-report.json");

const XML_FIELD_ORDER = [
  "i",
  "pi",
  "t",
  "n",
  "p",
  "pp",
  "g",
  "di",
  "pdi",
  "b",
  "bn",
  "mn",
  "l",
  "mo",
  "hp",
  "tq",
  "wt",
  "cc",
  "ps",
];

const WHEEL_CATEGORY_ID = "14";
const TIRE_CATEGORY_ID = "13";
const NON_OUTPUT_HP_TQ_CATEGORY_IDS = new Set([
  "20",
  "22",
  "23",
  "24",
  "49",
  "51",
  "52",
  "54",
  "63",
  "67",
  "134",
  "175",
  "176",
  "177",
  "178",
  "179",
  "187",
  "188",
  "189",
  "200",
  "201",
  "202",
  "671",
  "672",
  "1141",
  "1142",
  "1143",
  "1144",
  "1145",
  "1146",
  "1451",
  "1452",
  "1453",
  "1454",
  "2003",
  "2004",
  "2005",
  "2010",
  "2011",
  "2019",
  "2020",
  "2032",
  "2062",
  "2063",
  "2064",
  "2065",
  "2066",
  "2067",
  "2068",
  "2069",
  "2070",
  "2074",
  "2077",
  "2078",
]);
const NON_OUTPUT_HP_TQ_NAME_PATTERN = /\b(?:battery|seat|harness|belt|coolant|lubricant|radiator|thermostat|oil (?:cooler|filter|pump)|fuel (?:cell|cooler|filter|pump|rail|pressure regulator)|engine mounts?|motor mounts?|spring (?:&|and) shock|springs? and shocks?|shock absorber|coilovers?|suspension|sway bar|control arm|torsion bar|air\/?fuel (?:meter|controller)|rpm gauge|boost controller|traction control|spark plugs?|plug cables?|coil pack|power cables|red cables|sport boss cables|blow-?off valve|b\.?o\.?v|bov|oem ecu|side skirt|side scoop|graphic wrap|thermo-?wrap|inferno-wrap|holiday[^']*wrap|thanksgiving[^']*wrap|decal|tailgate|front fascia|rear fascia|rear panel|wheel|rims?)\b/i;
const PHYSICAL_ZERO_CATEGORY_IDS = new Set([
  "134", // meters
  "160",
  "161",
  "162",
  "163",
  "2003", // meters/controllers
]);

function hasArg(name) {
  return process.argv.includes(name);
}

function parseAttrs(rawAttrs) {
  const attrs = {};
  for (const match of String(rawAttrs || "").matchAll(/(\w+)='([^']*)'/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function parsePartsXml(xml) {
  return [...String(xml || "").matchAll(/<p\b([^>]*)\/>/g)].map((match) => parseAttrs(match[1]));
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stringNumber(value, fallback = 0) {
  return String(numberValue(value, fallback));
}

function attrText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&apos;/g, "")
    .replace(/&quot;/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function cleanName(value) {
  return String(value || "")
    .replace(/\((\d+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function existingTextScore(part = {}) {
  const text = `${part.n || ""} ${part.bn || ""} ${part.mn || ""}`.toLowerCase();
  let score = 0;
  if (part.n && !/^\w+-\d+$/.test(part.n)) {
    score += 1;
  }
  if (part.bn && !["generic", "exterior", "setup", "stock"].includes(part.bn.toLowerCase())) {
    score += 2;
  }
  if (part.mn && !/^\d+$/.test(part.mn) && !["engine", "intake", "exhaust", "drivetrain"].includes(part.mn.toLowerCase())) {
    score += 1;
  }
  if (/aem|injen|skunk|comp|garrett|vortech|haltech|walbro|sparco|volk|hre|carbon|kevlar|titanium/.test(text)) {
    score += 2;
  }
  return score;
}

function rowTextScore(row = {}) {
  const text = `${row.name || ""} ${row.brand_name || ""} ${row.model_name || ""}`.toLowerCase();
  let score = 0;
  if (row.name && !/^\w+-\d+$/.test(row.name)) {
    score += 1;
  }
  if (row.brand_name && !["generic", "exterior", "setup", "stock"].includes(row.brand_name.toLowerCase())) {
    score += 2;
  }
  if (row.model_name && !/^\d+$/.test(String(row.model_name))) {
    score += 1;
  }
  if (/aem|injen|skunk|comp|garrett|vortech|haltech|walbro|sparco|volk|hre|carbon|kevlar|titanium/.test(text)) {
    score += 2;
  }
  return score;
}

function dbRowToPart(row) {
  const brandName = cleanName(row.brand_name || "");
  const modelName = cleanName(row.model_name || "");
  const name = cleanName(row.name || modelName || String(row.id));
  const brandId = normalizeSlug(row.brand_id || brandName || "generic") || "generic";
  return {
    i: String(row.id),
    pi: String(row.category_id || 0),
    t: String(row.part_type || "e"),
    n: name,
    p: stringNumber(row.price),
    pp: stringNumber(row.points_price),
    g: String(row.grade || "C"),
    di: stringNumber(row.display_id, 1),
    pdi: stringNumber(row.display_id, 1),
    b: brandId,
    bn: brandName || "Generic",
    mn: modelName || name,
    l: stringNumber(row.location_id, 100),
    mo: "0",
    hp: stringNumber(row.hp_gain),
    tq: stringNumber(row.tq_gain),
    wt: stringNumber(row.weight_loss),
    cc: stringNumber(row.cc),
    ps: String(row.part_size || ""),
  };
}

function jsonPartToSourcePart(part) {
  const normalized = {};
  for (const field of XML_FIELD_ORDER) {
    if (field in part) {
      normalized[field] = String(part[field] ?? "");
    }
  }
  if (Array.isArray(part.legacyIds)) {
    normalized.legacyIds = part.legacyIds.map((legacyId) => String(legacyId));
  }
  return normalized;
}

function resolveTireIdConflicts(tires, usedIds) {
  const reservedIds = new Set(usedIds);
  for (const tire of tires) {
    const currentId = String(tire.i || "");
    if (!currentId || !reservedIds.has(currentId)) {
      reservedIds.add(currentId);
      continue;
    }

    const legacyIds = new Set([currentId, ...(tire.legacyIds || []).map((legacyId) => String(legacyId))]);
    let nextId = String(10000 + numberValue(currentId, 0));
    while (reservedIds.has(nextId)) {
      nextId = String(numberValue(nextId, 0) + 1);
    }

    tire.i = nextId;
    tire.legacyIds = [...legacyIds];
    reservedIds.add(nextId);
  }
  return tires;
}

function mergeDbRowWithExisting(row, existingById) {
  const dbPart = dbRowToPart(row);
  const candidates = existingById.get(String(row.id)) || [];
  const existing = candidates
    .slice()
    .sort((left, right) => existingTextScore(right) - existingTextScore(left))[0];

  if (!existing) {
    return dbPart;
  }

  const merged = { ...dbPart };
  if (existingTextScore(existing) >= rowTextScore(row)) {
    for (const key of ["n", "b", "bn", "mn"]) {
      merged[key] = existing[key] ?? merged[key];
    }
  }

  for (const key of ["hp", "tq", "wt", "cc", "ps"]) {
    const dbValue = numberValue(dbPart[key], 0);
    const sourceValue = numberValue(existing[key], 0);
    if (dbValue === 0 && sourceValue !== 0) {
      merged[key] = String(sourceValue);
    }
  }

  return merged;
}

function tierFor(part) {
  const gradeTier = { C: 1, B: 2, A: 3, S: 4 }[String(part.g || "C").toUpperCase()] || 1;
  const displayTier = Math.max(numberValue(part.di, 1), numberValue(part.pdi, 1));
  const priceTier = Math.min(6, Math.max(1, Math.ceil(Math.max(numberValue(part.p, 0), numberValue(part.pp, 0) * 100) / 1500)));
  return Math.min(6, Math.max(1, gradeTier, Math.ceil(displayTier / 2), priceTier));
}

function textFor(part) {
  return `${part.n || ""} ${part.bn || ""} ${part.mn || ""}`.toLowerCase();
}

function setStat(part, key, value, reason, changes) {
  const oldValue = numberValue(part[key], 0);
  if (oldValue !== 0 || !Number.isFinite(value) || value === 0) {
    return;
  }
  part[key] = String(Math.round(value));
  changes.push(`${key}:${part[key]}:${reason}`);
}

function forceStat(part, key, value, reason, changes) {
  if (!Number.isFinite(value)) {
    return;
  }
  const oldValue = numberValue(part[key], 0);
  const nextValue = Math.round(value);
  if (oldValue === nextValue) {
    return;
  }
  part[key] = String(nextValue);
  changes.push(`${key}:${oldValue}->${part[key]}:${reason}`);
}

function parseSize(part) {
  const explicit = numberValue(part.ps, 0) || numberValue(part.part_size, 0);
  if (explicit) {
    return explicit;
  }
  const match = textFor(part).match(/\b(1[3-9]|2[0-2])(?:\s*"?|&quot;)/);
  return match ? Number(match[1]) : 0;
}

function parseShot(part) {
  const match = textFor(part).match(/\b(\d{2,3})\s*shot\b/);
  return match ? Number(match[1]) : 0;
}

function parsePsi(part) {
  const match = textFor(part).match(/\b(\d{1,2})\s*psi\b/);
  return match ? Number(match[1]) : 0;
}

function parseDisplacementCc(part) {
  const match = textFor(part).match(/\+([0-9]+(?:\.[0-9]+)?)\s*l\b/);
  return match ? Math.round(Number(match[1]) * 1000) : 0;
}

function parseInjectorCc(part) {
  const match = textFor(part).match(/\b(\d{3,4})\s*cc\b/);
  return match ? Number(match[1]) : 0;
}

function isNonOutputHpTqPart(part) {
  const pi = String(part.pi || "");
  return NON_OUTPUT_HP_TQ_CATEGORY_IDS.has(pi) || NON_OUTPUT_HP_TQ_NAME_PATTERN.test(textFor(part));
}

function enrichNonOutputEnginePart(part, changes) {
  const text = textFor(part);
  const tier = tierFor(part);
  const injectorCc = parseInjectorCc(part);

  forceStat(part, "hp", 0, "non-output-support", changes);
  forceStat(part, "tq", 0, "non-output-support", changes);

  if (injectorCc) {
    setStat(part, "cc", injectorCc, "injector-flow-label", changes);
  }

  if (/battery/.test(text)) {
    setStat(part, "wt", -8 - tier * 3, "lightweight-battery", changes);
    return;
  }

  if (/seat|racing seat|cf seat|carbon fiber seat/.test(text)) {
    setStat(part, "wt", /carbon|cf|kevlar|light/.test(text) ? -25 : -12, "seat-weight", changes);
    return;
  }

  if (/flywheel|lightweight|ultra-light|ultralight/.test(text)) {
    setStat(part, "wt", -5 - tier * 4, "lightweight-drivetrain", changes);
  }
}

function enrichEnginePart(part, changes) {
  const text = textFor(part);
  const tier = tierFor(part);
  const pi = String(part.pi || "");
  const shot = parseShot(part);
  const psi = parsePsi(part);

  if (isNonOutputHpTqPart(part)) {
    enrichNonOutputEnginePart(part, changes);
    return;
  }

  if (shot) {
    setStat(part, "hp", shot, "nitrous-shot", changes);
    setStat(part, "tq", shot, "nitrous-shot", changes);
    setStat(part, "wt", Math.min(40, 16 + Math.round(shot / 10)), "nitrous-bottle-weight", changes);
    return;
  }

  if (/bottle/.test(text) || ["102", "203"].includes(pi)) {
    setStat(part, "wt", /carbon|cf|kevlar|light/.test(text) ? 8 : 12, "nitrous-bottle-weight", changes);
    return;
  }

  if (/intercooler/.test(text) || ["86", "2075"].includes(pi)) {
    forceStat(part, "hp", /h[89]\d|super|elite/.test(text) ? 19 : 10, "intercooler-efficiency", changes);
    forceStat(part, "tq", 0, "intercooler-torque-neutral", changes);
    return;
  }

  if (/turbo|supercharger|forced induction|blower/.test(text) || ["61", "81", "87", "2037", "2038", "2074", "2075", "2076"].includes(pi)) {
    const hp = psi ? Math.max(60, psi * 7) : 55 + tier * 32;
    setStat(part, "hp", hp, "forced-induction", changes);
    setStat(part, "tq", hp * 0.78, "forced-induction", changes);
    setStat(part, "wt", /piping|down ?pipe|manifold/.test(text) ? 6 + tier * 2 : 18 + tier * 4, "forced-induction-hardware", changes);
    return;
  }

  if (/ecu|chip|tune|controller|boost controller|air.?fuel|traction control/.test(text) || ["174", "2005", "2006", "2011"].includes(pi)) {
    setStat(part, "hp", 6 + tier * 7, "engine-management", changes);
    setStat(part, "tq", 4 + tier * 6, "engine-management", changes);
    return;
  }

  if (/intake|filter|throttle|individual throttle/.test(text) || ["47", "48", "96", "2018", "2073"].includes(pi)) {
    setStat(part, "hp", 5 + tier * 6, "airflow-intake", changes);
    setStat(part, "tq", 3 + tier * 4, "airflow-intake", changes);
    return;
  }

  if (/exhaust|header|muffler|pipe|catalytic|downpipe|wrap/.test(text) || ["16", "56", "57", "59", "60", "2031", "2032", "2035"].includes(pi)) {
    setStat(part, "hp", 4 + tier * 5, "exhaust-flow", changes);
    setStat(part, "tq", 3 + tier * 4, "exhaust-flow", changes);
    if (/titanium|carbon|kevlar|light/.test(text)) {
      setStat(part, "wt", -6 - tier * 3, "lightweight-exhaust", changes);
    }
    return;
  }

  if (/cam|valve|head\b|gasket|spring/.test(text) || ["17", "18", "19", "45", "181", "186", "193", "2013", "2014", "2017", "2022"].includes(pi)) {
    setStat(part, "hp", 3 + tier * 6, "valvetrain", changes);
    setStat(part, "tq", 2 + tier * 3, "valvetrain", changes);
    return;
  }

  if (/fuel|injector|rail|regulator|pump/.test(text) || ["49", "51", "52", "54", "202", "2065", "2066", "2067", "2068", "2069", "2070"].includes(pi)) {
    setStat(part, "hp", 3 + tier * 4, "fuel-system", changes);
    setStat(part, "tq", 2 + tier * 3, "fuel-system", changes);
    return;
  }

  if (/block|piston|rod|crank|sleeve|engine/.test(text) || ["39", "44", "133", "135", "182", "183", "184", "190", "2016"].includes(pi)) {
    setStat(part, "hp", 2 + tier * 4, "engine-internals", changes);
    setStat(part, "tq", 2 + tier * 4, "engine-internals", changes);
    const cc = parseDisplacementCc(part);
    if (cc) {
      setStat(part, "cc", cc, "displacement-label", changes);
    }
    return;
  }

  if (/clutch|flywheel|gearbox|differential|axle/.test(text) || ["22", "24", "2062", "2063", "2064"].includes(pi)) {
    setStat(part, "tq", 4 + tier * 5, "drivetrain", changes);
    if (/flywheel|lightweight|ultra-light|ultralight/.test(text)) {
      setStat(part, "wt", -5 - tier * 4, "lightweight-drivetrain", changes);
    }
    return;
  }

  if (/radiator|coolant|thermostat|oil|cooler|plugs|cables|ignition|battery/.test(text) || ["20", "177", "178", "187", "188", "189", "2004", "2010", "2019", "2020", "2077", "2078"].includes(pi)) {
    setStat(part, "hp", 1 + tier * 3, "supporting-engine-hardware", changes);
    if (/battery/.test(text)) {
      setStat(part, "wt", -8 - tier * 3, "lightweight-battery", changes);
    }
  }
}

function enrichChassisPart(part, changes) {
  const text = textFor(part);
  const tier = tierFor(part);
  const pi = String(part.pi || "");
  const size = parseSize(part);

  if (pi === WHEEL_CATEGORY_ID) {
    if (size) {
      part.ps = String(size);
      setStat(part, "wt", -(size - 15) * 2, "wheel-size-weight", changes);
    } else if (!part.ps) {
      part.ps = "15";
      changes.push("ps:15:wheel-default-size");
    }
    return;
  }

  if (pi === TIRE_CATEGORY_ID) {
    if (/slick/.test(text)) {
      part.ps = part.ps && part.ps !== "0" ? part.ps : "20";
    } else if (/drag|radial/.test(text)) {
      part.ps = part.ps && part.ps !== "0" ? part.ps : "10";
    } else if (!part.ps || part.ps === "0") {
      part.ps = "2";
    }
    return;
  }

  if (/graphic|decal|sticker|paint/.test(text) || PHYSICAL_ZERO_CATEGORY_IDS.has(pi)) {
    return;
  }

  if (/headlight|tail ?light|eyelid|corner light|altezza/.test(text) || ["75", "76", "77"].includes(pi)) {
    setStat(part, "wt", /carbon|cf|smoked|projector|led/.test(text) ? 1 : 2, "lighting-trim-weight", changes);
    return;
  }

  if (/battery/.test(text) || pi === "2004") {
    setStat(part, "wt", -8 - tier * 3, "lightweight-battery", changes);
    return;
  }

  if (/seat|racing seat|cf seat|carbon fiber seat/.test(text) || pi === "1451") {
    setStat(part, "wt", /carbon|cf|kevlar|light/.test(text) ? -25 : -12, "seat-weight", changes);
    return;
  }

  if (/hood/.test(text) || pi === "71") {
    setStat(part, "wt", /carbon|cf|kevlar|light|vented/.test(text) ? -28 : -10, "hood-weight", changes);
    return;
  }

  if (/trunk|hatch/.test(text) || pi === "144") {
    setStat(part, "wt", /carbon|cf|kevlar|light|superlite/.test(text) ? -22 : -8, "trunk-weight", changes);
    return;
  }

  if (/bumper|side skirt|side.?skirt|body kit/.test(text) || ["128", "129", "130"].includes(pi)) {
    setStat(part, "wt", /carbon|cf|kevlar|light|superlite/.test(text) ? -8 : 2, "body-panel-weight", changes);
    return;
  }

  if (/spoiler|wing/.test(text) || pi === "65") {
    setStat(part, "wt", /carbon|cf|kevlar|light/.test(text) ? -2 : 4, "aero-add-on-weight", changes);
    return;
  }

  if (/spring|shock|coilover|suspension|control arm|torsion|mount|sway/.test(text) || ["114", "1141", "1142", "1144"].includes(pi)) {
    setStat(part, "wt", /oem|stock/.test(text) ? 0 : -4 - tier * 2, "chassis-suspension-weight", changes);
    return;
  }

  if (/grille|scoop|trim|mirror/.test(text) || ["73", "140", "141"].includes(pi)) {
    setStat(part, "wt", /carbon|cf|kevlar|light/.test(text) ? -2 : 1, "small-body-add-on-weight", changes);
  }
}

function enrichPart(part) {
  const before = { hp: part.hp, tq: part.tq, wt: part.wt, cc: part.cc, ps: part.ps };
  const changes = [];
  if (part.t === "e" || part.t === "m") {
    enrichEnginePart(part, changes);
  } else if (part.t === "c") {
    enrichChassisPart(part, changes);
  }
  return {
    id: part.i,
    name: part.n,
    category_id: part.pi,
    type: part.t,
    before,
    after: { hp: part.hp, tq: part.tq, wt: part.wt, cc: part.cc, ps: part.ps },
    changes,
  };
}

function formatPartXml(part) {
  const attrs = XML_FIELD_ORDER
    .filter((field) => field in part)
    .map((field) => `${field}='${attrText(part[field])}'`)
    .join(" ");
  return `<p ${attrs}/>`;
}

function sortPart(left, right) {
  const leftId = numberValue(left.i, 0);
  const rightId = numberValue(right.i, 0);
  return leftId - rightId || String(left.i).localeCompare(String(right.i));
}

async function fetchAllPartsCatalogRows() {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("game_parts_catalog")
      .select("id,category_id,part_type,name,price,points_price,grade,display_id,brand_id,brand_name,model_name,location_id,hp_gain,tq_gain,weight_loss,cc,part_size")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) {
      throw new Error(`Failed to fetch game_parts_catalog: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < 1000) {
      break;
    }
  }
  return rows;
}

async function syncLiveFromSource(parts, wheelParts) {
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
  const rows = [...parts, ...wheelParts].map((part) => ({
    id: numberValue(part.i),
    category_id: numberValue(part.pi),
    part_type: String(part.t || "e"),
    name: String(part.n || ""),
    price: numberValue(part.p),
    points_price: numberValue(part.pp),
    grade: String(part.g || "C"),
    display_id: numberValue(part.di, 1),
    brand_id: String(part.b || "generic"),
    brand_name: String(part.bn || "Generic"),
    model_name: String(part.mn || part.n || ""),
    location_id: numberValue(part.l, 100),
    hp_gain: numberValue(part.hp),
    tq_gain: numberValue(part.tq),
    weight_loss: numberValue(part.wt),
    cc: String(part.cc || "0"),
    part_size: String(part.ps || ""),
  }));

  for (let offset = 0; offset < rows.length; offset += 500) {
    const batch = rows.slice(offset, offset + 500);
    const { error } = await supabase
      .from("game_parts_catalog")
      .upsert(batch, { onConflict: "id" });
    if (error) {
      throw new Error(`Failed to sync game_parts_catalog batch ${offset}: ${error.message}`);
    }
  }
  return rows.length;
}

function buildExistingById(sourceParts) {
  const byId = new Map();
  for (const part of sourceParts) {
    const list = byId.get(String(part.i)) || [];
    list.push(part);
    byId.set(String(part.i), list);
  }
  return byId;
}

async function main() {
  const writeSource = hasArg("--write-source");
  const syncLive = hasArg("--sync-live");
  const rows = await fetchAllPartsCatalogRows();
  const sourceParts = parsePartsXml(fs.readFileSync(PARTS_CATALOG_PATH, "utf8"));
  const wheelsCatalog = JSON.parse(fs.readFileSync(WHEELS_CATALOG_PATH, "utf8"));
  const existingById = buildExistingById(sourceParts);
  const liveNonWheelRows = rows.filter((row) => String(row.category_id) !== WHEEL_CATEGORY_ID && String(row.category_id) !== TIRE_CATEGORY_ID);
  const liveWheelRows = rows.filter((row) => String(row.category_id) === WHEEL_CATEGORY_ID || String(row.category_id) === TIRE_CATEGORY_ID);
  const hasLiveTires = liveWheelRows.some((row) => String(row.category_id) === TIRE_CATEGORY_ID);
  const liveIds = new Set(rows.map((row) => String(row.id)));
  const sourceTireParts = hasLiveTires
    ? []
    : resolveTireIdConflicts((wheelsCatalog.tires || []).map(jsonPartToSourcePart), liveIds);

  const sourcePartsNext = liveNonWheelRows
    .map((row) => mergeDbRowWithExisting(row, existingById))
    .sort(sortPart);
  const wheelPartsNext = liveWheelRows
    .map((row) => dbRowToPart(row))
    .concat(sourceTireParts)
    .sort(sortPart);

  const enrichment = [...sourcePartsNext, ...wheelPartsNext].map(enrichPart);
  const enrichedChanges = enrichment.filter((entry) => entry.changes.length > 0);
  const allZeroPriced = [...sourcePartsNext, ...wheelPartsNext]
    .filter((part) => numberValue(part.p) > 0)
    .filter((part) => ["hp", "tq", "wt", "cc", "ps"].every((key) => numberValue(part[key]) === 0))
    .map((part) => ({ id: part.i, pi: part.pi, t: part.t, n: part.n, p: part.p }));

  const report = {
    generated_at: new Date().toISOString(),
    write_source: writeSource,
    sync_live: syncLive,
    live_rows: rows.length,
    source_rows_before: sourceParts.length,
    source_unique_ids_before: new Set(sourceParts.map((part) => String(part.i))).size,
    source_rows_after: sourcePartsNext.length,
    wheel_rows_after: wheelPartsNext.length,
    duplicate_source_ids_removed: sourceParts.length - new Set(sourceParts.map((part) => String(part.i))).size,
    enriched_change_count: enrichedChanges.length,
    priced_all_zero_after_count: allZeroPriced.length,
    priced_all_zero_after: allZeroPriced.slice(0, 200),
    enrichment_changes: enrichedChanges,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  if (writeSource) {
    fs.writeFileSync(PARTS_CATALOG_PATH, `<p>${sourcePartsNext.map(formatPartXml).join("")}</p>\n`);
    wheelsCatalog.wheels = wheelPartsNext.filter((part) => part.pi === WHEEL_CATEGORY_ID);
    wheelsCatalog.tires = wheelPartsNext.filter((part) => part.pi === TIRE_CATEGORY_ID);
    fs.writeFileSync(WHEELS_CATALOG_PATH, `${JSON.stringify(wheelsCatalog, null, 2)}\n`);
  }

  let syncedRows = 0;
  if (syncLive) {
    syncedRows = await syncLiveFromSource(sourcePartsNext, wheelPartsNext);
  }

  console.log(JSON.stringify({
    report_path: REPORT_PATH,
    live_rows: rows.length,
    source_rows_before: sourceParts.length,
    source_rows_after: sourcePartsNext.length,
    wheel_rows_after: wheelPartsNext.length,
    enriched_change_count: enrichedChanges.length,
    priced_all_zero_after_count: allZeroPriced.length,
    wrote_source: writeSource,
    synced_rows: syncedRows,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
