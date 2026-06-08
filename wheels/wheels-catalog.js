import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wheelsModuleDir = dirname(fileURLToPath(import.meta.url));
const defaultDataRoot = resolve(wheelsModuleDir, "../../../data");

const FALLBACK_WHEEL_DESIGN_COUNT = 154;
const WHEEL_CATEGORY_ID = 14;
const TIRE_CATEGORY_ID = 13;

// LE edition and Tournament/Trophy wheel design IDs — completely locked/not purchasable by anyone
const LOCKED_LE_WHEEL_DESIGN_IDS = new Set([
  // LE (Limited Edition) wheels
  28,  // TRD RS 5.0 (LE - Scion tC 05 only)
  30,  // Acura NSX Race Edition OEM (LE)
  32,  // TRD Scion tC (LE)
  52,  // BBS LM Black/Red (LE CC Rewards)
  69,  // Volk Racing TE37 F-Zero Blue (LE CC Rewards)
  84,  // Volk Racing TE37 LE Red
  93,  // Volk Racing RE30 LE Red (LE CC Rewards)
  101, // Volk Racing TE37 LE Black/Red (LE CC Rewards)
  102, // Volk Racing CE28N LE Black/Red (LE CC Rewards)
  112, // Volk Racing TE37V LE Blue/Polished (LE CC Rewards?)
  120, // Volk Racing RE30 Blue (LE - F1 McLaren)
  // Tournament/Trophy wheels
  37,  // WD-40 Camaro Gold + Tourney (Top 10)
  41,  // TireBuyer R34 Stock + Tourney (Top 10)
  61,  // WD-40 Camaro Blue Stock + Tourney (Top 10)
  62,  // IVD Challenger + IVD 240SX Stock + Tourney (Top 10)
  103, // Tourney Wheels 103
  104, // Tourney Wheels 104
  105, // VTW Tourney Top 20
  108, // Tourney Wheels 108
  109, // VTW Tourney Top 10 - Versus the World
  111, // WD-40 SEMA Cares Volk TE37V Black/Yellow (Top 10)
  114, // Volk Racing TE37V Fluorescent Pink (Tourney Top 20)
  119, // IVD2 Tourney Top 10
  127, // SRT 13 Viper OEM + Tourney 127
  136, // Volk Racing GT-30 Gold (Avitron Tourney Winners)
  138, // Scion FR-S Race Edition + Tourney 138
  148, // VVZ Tourney (Duece Gold/Black)
  149, // VVZ Tourney (Duece Black/Black)
  150, // VVZ Tourney (Duece Red/Black)
  146, // Duece Graveyard Tourney Car Stock (Gold/Black)
]);

const LOCKED_WHEEL_NAME_PATTERN = /\bLE\b|\btourney\b|\btournament\b|\btrophy\b/i;

export function isLockedWheelDesignId(designId) {
  return LOCKED_LE_WHEEL_DESIGN_IDS.has(Number(designId));
}

export function isLockedWheelCatalogPart(part) {
  if (!part) {
    return false;
  }

  if (Number(part.lk || 0) === 1) {
    return true;
  }

  const categoryId = Number(part.pi || part.ci || 0);
  if (categoryId !== WHEEL_CATEGORY_ID) {
    return false;
  }

  const designId = Number(part.di || part.pdi || 0);
  if (isLockedWheelDesignId(designId)) {
    return true;
  }

  const label = `${part.n || ""} ${part.mn || ""} ${part.bn || ""}`;
  return LOCKED_WHEEL_NAME_PATTERN.test(label);
}

const FALLBACK_OEM_WHEEL_DESIGN_ID = 1;
const FALLBACK_OEM_WHEEL_SIZE = 17;

let catalogCarOemWheelOverrides = null;
let lockedWheelDesignFallbacks = null;

function loadCatalogCarOemWheelData(dataRoot = defaultDataRoot) {
  if (catalogCarOemWheelOverrides && lockedWheelDesignFallbacks) {
    return { overrides: catalogCarOemWheelOverrides, fallbacks: lockedWheelDesignFallbacks };
  }

  catalogCarOemWheelOverrides = new Map();
  lockedWheelDesignFallbacks = new Map([
    [84, 65], // Volk Racing TE37 LE Red -> TE37 Black
  ]);

  try {
    const parsed = JSON.parse(readFileSync(join(dataRoot, "catalog-car-oem-wheels.json"), "utf8"));
    for (const [catalogCarId, spec] of Object.entries(parsed.overrides || {})) {
      catalogCarOemWheelOverrides.set(Number(catalogCarId), spec);
    }
    for (const [designId, fallbackDesignId] of Object.entries(parsed.lockedDesignFallbacks || {})) {
      lockedWheelDesignFallbacks.set(Number(designId), Number(fallbackDesignId));
    }
  } catch {
    // Fall back to built-in defaults when data file is unavailable.
    catalogCarOemWheelOverrides = new Map([
      [122, { designId: 1, size: 15 }],
      [126, { designId: 128, size: 20 }],
      [69, { designId: 65, size: 20 }],
      [94, { designId: 65, size: 20 }],
    ]);
  }

  return { overrides: catalogCarOemWheelOverrides, fallbacks: lockedWheelDesignFallbacks };
}

const TIRE_PART_IDS = new Set([1300, 1301, 1302, 1303, 1304, 1305]);
export const WHEEL_SIZES = [15, 16, 17, 18, 19, 20];
const STOCK_TIRE_SIZE = 5;

const LOCATION_TIERS = [
  { level: 100, name: "Toreno" },
  { level: 200, name: "Newburge" },
  { level: 300, name: "Creek Side" },
  { level: 400, name: "Vista Heights" },
  { level: 500, name: "Diamond Point" },
];

const TIRES = [
  { id: 1300, name: "Nitto NT450", price: 300, prestigePrice: 3, grade: "C", level: 100, designId: 1, size: STOCK_TIRE_SIZE, traction: 0.9 },
  { id: 1301, name: "Nitto NT555", price: 650, prestigePrice: 6, grade: "C", level: 100, designId: 2, size: 5, traction: 1 },
  { id: 1302, name: "Nitto NT555R", price: 1400, prestigePrice: 14, grade: "B", level: 200, designId: 3, size: 8, traction: 1.65 },
  { id: 1303, name: "Nitto NT05", price: 2800, prestigePrice: 28, grade: "B", level: 300, designId: 4, size: 10, traction: 1.15 },
  { id: 1304, name: "Hoosier Drag Slicks", price: 5200, prestigePrice: 52, grade: "S", level: 400, designId: 5, size: 12, traction: 5 },
  { id: 1305, name: "Nitto Invo Max", price: 9000, prestigePrice: 90, grade: "A", level: 500, designId: 6, size: 15, traction: 1.08 },
];

const WHEEL_BRANDS = [
  { name: "AdvantRacing", slug: "advantracing" },
  { name: "D Sport", slug: "dsport" },
  { name: "Cragar", slug: "cragar" },
  { name: "Drifz", slug: "drifz" },
  { name: "Gram Lights", slug: "gramlights" },
  { name: "HRE", slug: "hre" },
  { name: "ICW Racing", slug: "icwracing" },
  { name: "Import vs Domestic", slug: "importvsdomestic" },
  { name: "Konig", slug: "konig" },
  { name: "MAAS Modular", slug: "maasmodular" },
  { name: "O.E. Performance", slug: "oeperformance" },
  { name: "Pacer", slug: "pacer" },
  { name: "RacingHart", slug: "racinghart" },
  { name: "SSR Wheels", slug: "ssrwheels" },
  { name: "Volk Racing", slug: "volkracing" },
  { name: "Weld Racing", slug: "weldracing" },
  { name: "Yokohama Wheel Design", slug: "yokohamawheeldesign" },
];

const catalogCache = new Map();

function escapeXmlAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("'", "&apos;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function readWheelLookup(dataRoot) {
  try {
    const text = await readFile(join(dataRoot, "wheel-lookup.json"), "utf8");
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values.map((value) => value.trim());
}

async function readWheelNames(dataRoot) {
  try {
    const text = await readFile(join(dataRoot, "wheel-brand-model.csv"), "utf8");
    const rows = text.trim().split(/\r?\n/).slice(1);

    return new Map(rows.map((line) => {
      const [brandName, modelName, designId] = parseCsvLine(line);
      return [Number(designId || 0), {
        brandName,
        modelName,
        brandSlug: slugifyBrand(brandName),
      }];
    }).filter(([designId]) => Number.isInteger(designId) && designId > 0));
  } catch {
    return new Map();
  }
}

async function readAvailableWheelDesignIds(assetRoot) {
  try {
    const files = await readdir(join(assetRoot, "cache", "car", "wheel"));
    const designIds = files
      .map((fileName) => fileName.match(/^wheelR_(\d+)\.swf$/i)?.[1])
      .filter(Boolean)
      .map(Number)
      .filter((designId) => Number.isInteger(designId) && designId > 0);

    return [...new Set(designIds)].sort((left, right) => left - right);
  } catch {
    return [];
  }
}

function fallbackDesignIds(count) {
  return Array.from({ length: count }, (_, index) => index + 1);
}

function sampleWheelByDesignId(lookup) {
  const samples = Array.isArray(lookup.sampleWheels) ? lookup.sampleWheels : [];
  return new Map(samples.map((wheel) => [Number(wheel.designId || 0), wheel]));
}

function slugifyBrand(brandName) {
  return String(brandName || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    || "unknown";
}

function wheelBaseName(sample, brand, modelIndex) {
  if (sample?.name) {
    return String(sample.name).replace(/\s+\d+\s*"$/i, "").trim();
  }

  return `${brand.name} Series ${modelIndex + 1}`;
}

function nextWheelPartId(partId) {
  let candidate = partId;
  while (TIRE_PART_IDS.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

function gradeForIndex(index) {
  if (index >= 120) {
    return "S";
  }
  if (index >= 80) {
    return "A";
  }
  if (index >= 40) {
    return "B";
  }
  return "C";
}

function levelForDesignIndex(index) {
  return LOCATION_TIERS[Math.min(Math.floor(index / WHEEL_BRANDS.length), LOCATION_TIERS.length - 1)].level;
}

function tierForLevel(level) {
  return LOCATION_TIERS.find((tier) => tier.level === level) || LOCATION_TIERS[0];
}

function bucketLabelsForLevel(level) {
  if (Number(level) === 500) {
    return ["A", "B", "C", "D"];
  }

  if (Number(level) === 300 || Number(level) === 400) {
    return ["A", "B", "C"];
  }

  return ["A", "B"];
}

function buildWheelDesignMeta(designIds) {
  const meta = designIds.map((designId, index) => ({
    designId,
    index,
    level: levelForDesignIndex(index),
    sizeCount: WHEEL_SIZES.length,
  }));
  const tierCounts = new Map();

  for (const item of meta) {
    tierCounts.set(item.level, (tierCounts.get(item.level) || 0) + item.sizeCount);
  }

  return { meta, tierCounts };
}

function wheelBucketName({ level, tierPartIndex, tierCounts }) {
  const tier = tierForLevel(level);
  const tierCount = tierCounts.get(level) || 1;
  const bucketLabels = bucketLabelsForLevel(level);
  const bucketSize = Math.ceil(tierCount / bucketLabels.length);
  const bucketIndex = Math.min(Math.floor(tierPartIndex / bucketSize), bucketLabels.length - 1);
  const bucket = bucketLabels[bucketIndex];

  return `${tier.name} Rims ${bucket}`;
}

function wheelBucketSortRank(bucketName) {
  const tierIndex = LOCATION_TIERS.findIndex((tier) => String(bucketName).startsWith(`${tier.name} Rims `));
  const suffix = String(bucketName).match(/\s([A-Z])$/)?.[1] || "A";
  const bucketOffset = Math.max(0, suffix.charCodeAt(0) - "A".charCodeAt(0));

  return tierIndex >= 0 ? tierIndex * 10 + bucketOffset : 999;
}

function displayModelName(brandName, modelName) {
  const normalizedBrand = String(brandName || "").trim();
  const normalizedModel = String(modelName || "").trim();

  if (!normalizedBrand) {
    return normalizedModel;
  }

  if (normalizedModel.toLowerCase().startsWith(normalizedBrand.toLowerCase())) {
    return normalizedModel;
  }

  return `${normalizedBrand} ${normalizedModel}`;
}

function renderPart(attributes) {
  const rendered = Object.entries(attributes)
    .map(([key, value]) => `${key}='${escapeXmlAttribute(value)}'`)
    .join(" ");

  return `<p ${rendered}/>`;
}

function buildTireParts() {
  return TIRES.map((tire) => ({
    i: tire.id,
    pi: TIRE_CATEGORY_ID,
    t: "c",
    n: tire.name,
    p: tire.price,
    pp: tire.prestigePrice,
    g: tire.grade,
    di: tire.designId,
    pdi: tire.designId,
    b: "nitto",
    bn: "Nitto",
    mn: tire.name.replace(/^Nitto\s+/i, ""),
    l: tire.level,
    mo: 0,
    hp: 0,
    tq: 0,
    wt: 0,
    cc: 0,
    ps: tire.size,
    ar: tire.traction,
  }));
}

export function tireTractionForPartId(partId, fallback = 1) {
  const tire = TIRES.find((item) => Number(item.id) === Number(partId));
  const traction = Number(tire?.traction);

  return Number.isFinite(traction) && traction > 0 ? traction : fallback;
}

function buildWheelParts({ designIds, lookup, wheelNamesByDesignId }) {
  const samplesByDesignId = sampleWheelByDesignId(lookup);
  const { meta: designMeta, tierCounts } = buildWheelDesignMeta(designIds);
  const tierIndexes = new Map();
  const wheels = [];
  let partId = 1000;

  for (const { designId, index, level, sizeCount } of designMeta) {
    const brand = WHEEL_BRANDS[index % WHEEL_BRANDS.length];
    const sample = samplesByDesignId.get(designId);
    const canonicalName = wheelNamesByDesignId.get(designId);
    const modelIndex = Math.floor(index / WHEEL_BRANDS.length);
    const tierPartIndex = tierIndexes.get(level) || 0;
    tierIndexes.set(level, tierPartIndex + sizeCount);
    const modelName = canonicalName?.modelName
      || (sample?.modelName && !/^\d+$/.test(String(sample.modelName))
      ? sample.modelName
      : wheelBaseName(sample, brand, modelIndex));
    const brandName = canonicalName?.brandName || sample?.brandName || brand.name;
    const modelMenuName = displayModelName(brandName, modelName);
    const wheelDisplayName = modelMenuName;
    const grade = gradeForIndex(index);
    const bucketName = wheelBucketName({ level, tierPartIndex, tierCounts });

    for (const size of WHEEL_SIZES.slice(0, sizeCount)) {
      partId = nextWheelPartId(partId);
      const price = 500 + (size - 15) * 225 + modelIndex * 750 + index * 15;
      const locked = isLockedWheelDesignId(designId)
        || LOCKED_WHEEL_NAME_PATTERN.test(`${wheelDisplayName} ${brandName}`);
      wheels.push({
        i: partId,
        pi: WHEEL_CATEGORY_ID,
        t: "c",
        n: `${size} ${wheelDisplayName}`,
        p: locked ? 0 : price,
        pp: locked ? 0 : Math.max(1, Math.floor(price / 100)),
        g: grade,
        di: designId,
        pdi: designId,
        b: canonicalName?.brandSlug || sample?.brandSlug || brand.slug,
        bn: brandName,
        mn: modelMenuName,
        l: level,
        mo: 0,
        lk: locked ? 1 : 0,
        hp: 0,
        tq: 0,
        wt: (size - 15) * 2,  // larger wheels are heavier: 15"=0, 16"=+2, 17"=+4, 18"=+6, 19"=+8, 20"=+10
        cc: 0,
        ps: size,
        loc: bucketName,
      });
      partId += 1;
    }
  }

  return wheels
    .sort((left, right) => (
      String(left.bn).localeCompare(String(right.bn), undefined, { numeric: true })
      || wheelBucketSortRank(left.loc) - wheelBucketSortRank(right.loc)
      || String(left.mn).localeCompare(String(right.mn), undefined, { numeric: true })
      || Number(left.ps || 0) - Number(right.ps || 0)
      || Number(left.i || 0) - Number(right.i || 0)
    ));
}

export function buildWheelsTiresCatalogXmlForLevel(catalog, locationLevel) {
  const normalizedLevel = [100, 200, 300, 400, 500].includes(Number(locationLevel))
    ? Number(locationLevel)
    : 100;
  const filteredParts = catalog.parts.filter((part) => (
    Number(part.l || 0) <= normalizedLevel
    && !isLockedWheelCatalogPart(part)
  ));
  const xml = `<p>${filteredParts.map(renderPart).join("")}</p>`;
  return { xml, filteredParts };
}

export async function buildWheelsTiresCatalog({ assetRoot, dataRoot }) {
  const cacheKey = `${assetRoot}|${dataRoot}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const lookup = await readWheelLookup(dataRoot);
  const wheelNamesByDesignId = await readWheelNames(dataRoot);
  const fallbackCount = Number(lookup.counts?.wheelDesignIds || FALLBACK_WHEEL_DESIGN_COUNT);
  const availableDesignIds = await readAvailableWheelDesignIds(assetRoot);
  const wheelNameDesignIds = [...wheelNamesByDesignId.keys()].sort((left, right) => left - right);
  const designIds = availableDesignIds.length > 0
    ? availableDesignIds
    : (wheelNameDesignIds.length > 0 ? wheelNameDesignIds : fallbackDesignIds(fallbackCount));
  const tires = buildTireParts();
  const wheels = buildWheelParts({ designIds, lookup, wheelNamesByDesignId });
  const parts = [...tires, ...wheels];
  const xml = `<p>${parts.map(renderPart).join("")}</p>`;
  const catalog = {
    xml,
    parts,
    partsById: new Map(parts.map((part) => [Number(part.i), part])),
    tireCount: tires.length,
    wheelCount: wheels.length,
    designCount: designIds.length,
  };

  catalogCache.set(cacheKey, catalog);
  return catalog;
}

export function clampWheelSize(size) {
  const requestedSize = Number(size || FALLBACK_OEM_WHEEL_SIZE);
  if (!Number.isFinite(requestedSize) || requestedSize <= 0) {
    return FALLBACK_OEM_WHEEL_SIZE;
  }

  return WHEEL_SIZES.reduce((closest, candidate) => (
    Math.abs(candidate - requestedSize) < Math.abs(closest - requestedSize) ? candidate : closest
  ));
}

let wheelNamesByDesignIdSync = null;

function loadWheelNamesSync(dataRoot = defaultDataRoot) {
  if (wheelNamesByDesignIdSync) {
    return wheelNamesByDesignIdSync;
  }

  try {
    const text = readFileSync(join(dataRoot, "wheel-brand-model.csv"), "utf8");
    const rows = text.trim().split(/\r?\n/).slice(1);
    wheelNamesByDesignIdSync = new Map(rows.map((line) => {
      const [brandName, modelName, designId] = parseCsvLine(line);
      return [Number(designId || 0), { brandName, modelName }];
    }).filter(([designId]) => Number.isInteger(designId) && designId > 0));
  } catch {
    wheelNamesByDesignIdSync = new Map([
      [FALLBACK_OEM_WHEEL_DESIGN_ID, { brandName: "OEM", modelName: "OEM Wheels" }],
    ]);
  }

  return wheelNamesByDesignIdSync;
}

export function wheelClientDisplayName({ designId, size } = {}) {
  const normalizedDesignId = Number(designId || FALLBACK_OEM_WHEEL_DESIGN_ID);
  const normalizedSize = clampWheelSize(size);
  const canonical = loadWheelNamesSync().get(normalizedDesignId);
  const modelMenuName = canonical
    ? displayModelName(canonical.brandName, canonical.modelName)
    : "OEM Wheels";

  return `${normalizedSize} ${modelMenuName}`;
}

export function resolveCatalogCarOemWheel({
  catalogCarId = 0,
  wheelDesignId,
  wheelSize,
  dataRoot = defaultDataRoot,
} = {}) {
  const { overrides, fallbacks } = loadCatalogCarOemWheelData(dataRoot);
  const carId = Number(catalogCarId || 0);
  const override = overrides.get(carId);
  let designId = Number(wheelDesignId ?? override?.designId ?? FALLBACK_OEM_WHEEL_DESIGN_ID);
  let size = Number(wheelSize ?? override?.size ?? FALLBACK_OEM_WHEEL_SIZE);

  if (override) {
    designId = Number(override.designId ?? designId);
    size = Number(override.size ?? size);
  }

  if (isLockedWheelDesignId(designId)) {
    designId = Number(fallbacks.get(designId) || FALLBACK_OEM_WHEEL_DESIGN_ID);
  }

  size = clampWheelSize(size);

  return { designId, size };
}

export function buildWheelPartLookup(wheelsCatalog) {
  const byDesignSize = new Map();
  const byDesign = new Map();

  for (const part of wheelsCatalog?.parts || []) {
    if (Number(part.pi) !== WHEEL_CATEGORY_ID) {
      continue;
    }

    const designId = Number(part.di || part.pdi || 0);
    const size = Number(part.ps || 0);
    byDesignSize.set(`${designId}:${size}`, part);

    if (!byDesign.has(designId)) {
      byDesign.set(designId, part);
    }
  }

  return { byDesignSize, byDesign };
}

export function findOemWheelPartForCatalogCar(wheelsCatalog, {
  catalogCarId = 0,
  wheelDesignId,
  wheelSize,
} = {}) {
  const { designId, size } = resolveCatalogCarOemWheel({
    catalogCarId,
    wheelDesignId,
    wheelSize,
  });
  const lookup = buildWheelPartLookup(wheelsCatalog);
  const exact = lookup.byDesignSize.get(`${designId}:${size}`);
  if (exact && !isLockedWheelCatalogPart(exact)) {
    return exact;
  }

  const sameDesign = lookup.byDesign.get(designId);
  if (sameDesign && !isLockedWheelCatalogPart(sameDesign)) {
    return sameDesign;
  }

  const fallback = lookup.byDesignSize.get(`${FALLBACK_OEM_WHEEL_DESIGN_ID}:${size}`)
    || lookup.byDesign.get(FALLBACK_OEM_WHEEL_DESIGN_ID)
    || null;

  if (fallback && !isLockedWheelCatalogPart(fallback)) {
    return fallback;
  }

  throw new Error(`Unable to resolve OEM wheel for catalogCarId=${catalogCarId}`);
}
