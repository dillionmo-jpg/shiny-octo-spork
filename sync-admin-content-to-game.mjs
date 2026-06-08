import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contentDir = path.join(root, 'data', 'content');
const catalogDir = path.join(root, 'src', 'catalog-data');
const backupDir = path.join(root, 'data', 'content-sync-backups');

const cityNames = new Map([
  [100, 'Toreno'],
  [200, 'Newburge'],
  [300, 'Creek Side'],
  [400, 'Vista Heights'],
  [500, 'Diamond Pointe'],
]);

function fail(message) {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    if (fallback !== null) return fallback;
    fail(`Missing ${path.relative(root, filePath)}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Could not parse ${path.relative(root, filePath)}: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupDir, `${path.basename(filePath)}.${stamp}.bak`);
  fs.copyFileSync(filePath, dest);
  console.log(`[backup] ${path.relative(root, filePath)} -> ${path.relative(root, dest)}`);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rounded(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(4));
}

function attrEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickTopSpeed(hp, category) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('exotic')) return 200;
  if (hp >= 500) return 190;
  if (hp >= 350) return 170;
  if (hp >= 250) return 155;
  if (hp >= 170) return 140;
  return 120;
}

function estimatePartCash(part) {
  const hp = Math.max(0, toNumber(part.horsepowerDelta));
  const tq = Math.max(0, toNumber(part.torqueDelta));
  const grip = Math.max(0, toNumber(part.gripDelta));
  const weightBenefit = Math.max(0, -toNumber(part.weightDeltaLbs));
  const city = toNumber(part.cityId, 100);
  const grade = String(part.grade || 'C').toUpperCase();
  const category = Number(part.categoryId || 0);

  let base = 250 + hp * 90 + tq * 45 + grip * 250 + weightBenefit * 35;

  if ([81, 87, 86, 137, 2074].includes(category)) base += 2500;
  if ([21, 203, 204, 205].includes(category)) base += 1800;
  if ([181, 182, 183, 184, 185, 186, 190, 192, 193].includes(category)) base += 1000;
  if ([23, 26, 134, 173, 174, 175, 176, 177, 178, 179].includes(category)) base += 750;
  if ([22, 24, 2201, 2202, 2063, 2064].includes(category)) base += 1000;

  base *= ({ 100: 1.0, 200: 1.25, 300: 1.55, 400: 1.9, 500: 2.35 }[city] || 1.0);
  base *= ({ C: 1.0, B: 1.35, A: 1.8, S: 2.35 }[grade] || 1.0);

  return Math.max(100, Math.round(base / 50) * 50);
}

function buildLegacyCars(cars, enginesById) {
  const seenIds = new Set();
  const output = [];
  const stockRecords = [];
  const runtimeRecords = [];
  const warnings = [];

  for (const car of cars) {
    if (car?.enabled === false) continue;
    const legacyId = String(car.legacyCatalogId ?? '').trim();
    if (!legacyId || legacyId === 'null' || legacyId === 'undefined') {
      warnings.push(`Skipped ${car.displayName || car.id}: missing legacyCatalogId`);
      continue;
    }
    if (seenIds.has(legacyId)) {
      warnings.push(`Skipped duplicate legacyCatalogId ${legacyId}: ${car.displayName || car.id}`);
      continue;
    }
    seenIds.add(legacyId);

    const engine = enginesById.get(String(car.engineId || '')) || {};
    const hp = toNumber(engine.horsepower ?? car.legacy?.specs?.horsepower ?? car.legacy?.spec?.horsepower, 0);
    const tq = toNumber(engine.torque ?? car.legacy?.specs?.torque ?? car.legacy?.spec?.torque, Math.round(hp * 0.9));
    const weight = toNumber(car.curbWeightLbs ?? car.legacy?.specs?.weight ?? car.legacy?.spec?.weight, 3200);
    const engineText = String(engine.displayName || car.legacy?.specs?.engine || car.engineId || '').trim();
    const drivetrain = String(car.drivetrain || car.legacy?.specs?.drive || car.legacy?.spec?.drivetrain || 'RWD').trim();
    const transmission = String(car.transmission || car.legacy?.specs?.transmission || car.legacy?.spec?.transmission || '5-Speed Manual').trim();
    const displayName = String(car.displayName || [car.year, car.make, car.model, car.subModel].filter(Boolean).join(' ') || car.id).trim();
    const category = String(car.category || car.legacy?.category || 'Sports Cars').trim();
    const cityId = String(car.cityId || car.legacy?.locationId || 100);
    const topSpeed = toNumber(car.legacy?.specs?.topSpeed, pickTopSpeed(hp, category));
    const yearPrefix = car.year ? `${car.year} ` : '';
    const layout = String(car.vehicleLayout || `${category} / ${drivetrain}`).trim();
    const description = String(car.description || car.legacy?.description || `${displayName} uses a ${engineText} rated at ${hp} horsepower and ${tq} lb-ft of torque. It is available in ${cityNames.get(Number(cityId)) || 'the dealership'} as a ${layout}.`).trim();

    output.push({
      id: legacyId,
      name: displayName,
      locationId: cityId,
      category,
      brand: String(car.make || car.legacy?.brand || '').trim(),
      description,
      specs: {
        horsepower: hp,
        torque: tq,
        engine: engineText,
        transmission,
        drive: drivetrain,
        weight,
        topSpeed,
      },
      images: Array.isArray(car.legacy?.images) ? car.legacy.images : [],
      spec: {
        horsepower: hp,
        torque: tq,
        engine: engineText,
        drivetrain,
        transmission,
        weight,
        redLine: toNumber(engine.redlineRpm, toNumber(car.legacy?.spec?.redLine, 7200)),
        baseHorsepower: hp,
        baseTorque: tq,
        baseWeight: weight,
        estimatedEt: car.zeroToSixtySeconds ? String(car.zeroToSixtySeconds) : undefined,
      },
    });

    runtimeRecords.push({
      id: legacyId,
      name: displayName,
      category,
      spec: {
        horsepower: hp,
        torque: tq,
        engine: engineText,
        drivetrain,
        drive: drivetrain,
        transmission,
        weight,
        baseHorsepower: hp,
        baseTorque: tq,
        baseWeight: weight,
        redLine: toNumber(engine.redlineRpm, toNumber(car.legacy?.spec?.redLine, 7200)),
        estimatedEt: car.zeroToSixtySeconds ? String(car.zeroToSixtySeconds) : undefined,
        bodyType: category,
      },
    });

    stockRecords.push({
      makeModel: displayName,
      year: car.year ?? null,
      make: car.make || '',
      model: car.model || '',
      engine: engineText,
      engineConfig: '',
      inductionSystem: engine.induction || '',
      horsepower: hp,
      torque: tq,
      weightLbs: weight,
      transmission,
      drivetrain,
    });
  }

  output.sort((a, b) => Number(a.id) - Number(b.id));
  stockRecords.sort((a, b) => String(a.makeModel).localeCompare(String(b.makeModel)));
  runtimeRecords.sort((a, b) => Number(a.id) - Number(b.id));
  return { output, stockRecords, runtimeRecords, warnings };
}

function buildPartsCatalogXml(parts) {
  const nodes = [];
  const warnings = [];
  for (const part of parts) {
    if (part?.enabled === false) continue;
    const legacy = part.legacy || {};
    const partId = String(part.legacyPartId ?? legacy.i ?? '').trim();
    if (!partId) {
      warnings.push(`Skipped part without legacyPartId: ${part.name || part.id}`);
      continue;
    }

    const isOem = Boolean(part.isOem) || String(part.brand || part.brandKey || '').toLowerCase() === 'oem' || /^OEM\b/i.test(String(part.name || ''));
    let cash = toNumber(part.priceCash ?? legacy.p, 0);
    let points = toNumber(part.pricePoints ?? legacy.pp, 0);
    if (isOem) {
      cash = 0;
      points = 0;
    } else {
      if (cash <= 0) cash = estimatePartCash(part);
      if (points <= 0) points = Math.max(1, Math.round(cash * 0.25));
    }

    const attrs = {
      i: partId,
      pi: String(part.categoryId ?? legacy.pi ?? ''),
      t: String(part.type ?? legacy.t ?? 'e'),
      n: String(part.name ?? legacy.n ?? `Part ${partId}`),
      p: String(cash),
      pp: String(points),
      g: String(part.grade ?? legacy.g ?? 'C'),
      di: String(part.displayOrder ?? legacy.di ?? '1'),
      b: String(part.brandKey ?? legacy.b ?? slug(part.brand) ?? ''),
      bn: String(part.brand ?? legacy.bn ?? ''),
      mn: String(part.model ?? legacy.mn ?? part.name ?? ''),
      l: String(part.cityId ?? legacy.l ?? '100'),
      mo: String(legacy.mo ?? '0'),
      hp: String(isOem ? 0 : rounded(part.horsepowerDelta ?? legacy.hp ?? 0)),
      tq: String(isOem ? 0 : rounded(part.torqueDelta ?? legacy.tq ?? 0)),
      wt: String(isOem ? 0 : rounded(part.weightDeltaLbs ?? legacy.wt ?? 0)),
      cc: String(legacy.cc ?? part.cc ?? '0'),
      ps: String(legacy.ps ?? part.ps ?? ''),
    };

    if (legacy.ci !== undefined) attrs.ci = String(legacy.ci);
    if (legacy.pdi !== undefined) attrs.pdi = String(legacy.pdi);
    if (legacy.slr !== undefined) attrs.slr = String(legacy.slr);
    if (legacy.rl !== undefined) attrs.rl = String(legacy.rl);

    const orderedKeys = ['i','pi','ci','t','n','p','pp','g','di','pdi','b','bn','mn','l','mo','hp','tq','wt','cc','ps','slr','rl'];
    const attrText = orderedKeys
      .filter((key) => attrs[key] !== undefined && attrs[key] !== null)
      .map((key) => `${key}='${attrEscape(attrs[key])}'`)
      .join(' ');
    nodes.push(`<p ${attrText}/>`);
  }
  return { xml: `<p>${nodes.join('')}</p>\n`, warnings };
}

if (!fs.existsSync(contentDir)) {
  fail(`Missing ${path.relative(root, contentDir)}. Edit/save content in /admin first, or copy your JSON files there.`);
}
if (!fs.existsSync(catalogDir)) {
  fail(`Missing ${path.relative(root, catalogDir)}. Run this from the project root beside package.json.`);
}

const cars = readJson(path.join(contentDir, 'cars.json'), []);
const engines = readJson(path.join(contentDir, 'engines.json'), []);
const parts = readJson(path.join(contentDir, 'performance-parts.json'), []);

if (!Array.isArray(cars)) fail('data/content/cars.json must be an array.');
if (!Array.isArray(engines)) fail('data/content/engines.json must be an array.');
if (!Array.isArray(parts)) fail('data/content/performance-parts.json must be an array.');

const enginesById = new Map(engines.map((engine) => [String(engine.id || ''), engine]));
const { output: legacyCars, stockRecords, runtimeRecords, warnings: carWarnings } = buildLegacyCars(cars, enginesById);
const { xml: partsXml, warnings: partWarnings } = buildPartsCatalogXml(parts);

const carsCatalogPath = path.join(catalogDir, 'cars-catalog.json');
const carStockSpecsPath = path.join(catalogDir, 'car-stock-specs.json');
const partsCatalogPath = path.join(catalogDir, 'parts-catalog.xml');
const carRuntimeDataPath = path.join(catalogDir, 'car-runtime-data.json');

backupFile(carsCatalogPath);
backupFile(carStockSpecsPath);
backupFile(partsCatalogPath);
backupFile(carRuntimeDataPath);

writeJson(carsCatalogPath, legacyCars);
writeJson(carStockSpecsPath, { records: stockRecords });
writeJson(carRuntimeDataPath, runtimeRecords);
fs.writeFileSync(partsCatalogPath, partsXml, 'utf8');

console.log(`[write] ${path.relative(root, carsCatalogPath)} (${legacyCars.length} cars)`);
console.log(`[write] ${path.relative(root, carStockSpecsPath)} (${stockRecords.length} stock spec records)`);
console.log(`[write] ${path.relative(root, carRuntimeDataPath)} (${runtimeRecords.length} runtime records)`);
console.log(`[write] ${path.relative(root, partsCatalogPath)} (${parts.length} source parts)`);

for (const warning of [...carWarnings, ...partWarnings].slice(0, 30)) {
  console.warn(`[warning] ${warning}`);
}
const extraWarnings = carWarnings.length + partWarnings.length - Math.min(30, carWarnings.length + partWarnings.length);
if (extraWarnings > 0) {
  console.warn(`[warning] ${extraWarnings} additional warnings not shown.`);
}

console.log('');
console.log('Next steps:');
console.log('1. Stop the running server with Ctrl+C.');
console.log('2. Start it again with Start Local JSON Server.bat.');
console.log('3. Reopen or reload the game client showroom/parts shop.');
