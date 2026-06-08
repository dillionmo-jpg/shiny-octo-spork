import { tireTractionForPartId } from "../wheels/wheels-catalog.js";

const TIRE_CATEGORY_ID = 13;
const BASE_STATIC_GRIP = 1.8;
const BOOST_EFFECT_SCALE = 0.1375;
const BOOST_FLOW_FOR_REDLINE_RAMP = Number(((1 / 0.0075) * BOOST_EFFECT_SCALE).toFixed(3));
const BOOST_SOURCE_STATIC_POWER_SCALE = BOOST_EFFECT_SCALE;
const BOOST_SYSTEM_STATIC_POWER_SCALE = 0.165;
const NATURAL_RUNTIME_HPI = 0.01;
const FORCED_INDUCTION_RUNTIME_HPI = 0.02;
const CLIENT_DYNO_TORQUE_SAMPLE_STEP = 4;
const CLIENT_DYNO_RPM_STEP = 100;
const CLIENT_DYNO_BOOST_RAMP_SCALE = 7.5 / 100;
const CLIENT_DYNO_TURBO_BOOST_LAG_SCALE = 0.7;
const CLIENT_DYNO_TURBO_BOOST_RANGE_SCALE = 1.7;
const TURBO_SYSTEM_SLOT_IDS = [18, 23, 61, 62, 86, 87, 137];
const SUPERCHARGER_SYSTEM_SLOT_IDS = [81, 82];
const TURBO_BOOST_SOURCE_SLOT_IDS = new Set([87]);
const SUPERCHARGER_BOOST_SOURCE_SLOT_IDS = new Set([81]);
const AIRFLOW_SLOT_IDS = new Set([47, 48, 55, 56, 57, 59, 61, 62, 86, 96, 97, 137]);
const FUEL_SLOT_IDS = new Set([49, 51, 52, 54, 201, 202, 2065]);
const TUNE_SLOT_IDS = new Set([23, 174]);
const ENGINE_SLOT_ID = 133;
const PISTON_SLOT_IDS = new Set([44, 190]);
const COMPRESSION_DELTA_SLOT_IDS = new Set([17, 136, 185, 186]);
const NITROUS_BOTTLE_SLOT_IDS = new Set([102, 203]);
const NITROUS_SHOT_SLOT_IDS = new Set([21, 204, 205, 2045]);
const TRACTION_CONTROL_SLOT_IDS = new Set([179, 2011]);
const SHIFT_LIGHT_SLOT_IDS = new Set([15]);
const GAUGE_GRAPHIC_SLOT_IDS = new Set([172]);
const DEFAULT_COMPRESSION_RATIO = 10;
const MIN_COMPRESSION_RATIO = 7;
const MAX_COMPRESSION_RATIO = 13.5;

// HP caps per engine family. Prevents small-displacement economy cars from reaching
// supercar ET while still allowing competitive builds on proper platforms.
// "soft" = diminishing returns begin here. "hard" = absolute ceiling.
// Engine-swapped cars use the SWAP engine family cap (the installed engine, not the chassis).
const ENGINE_FAMILY_HP_CAPS = Object.freeze({
  I4:  { soft: 450,  hard: 650 },   // Built turbo I4s top out around 600-650 on street tires
  I5:  { soft: 500,  hard: 700 },   // Focus RS / Volvo 5-cyl turbo territory
  H4:  { soft: 500,  hard: 700 },   // STI EJ platform caps ~650 reliably
  I6:  { soft: 700,  hard: 1000 },  // 2JZ / RB26 are proven 1000hp platforms
  V6:  { soft: 600,  hard: 850 },   // VQ / Ecoboost territory
  H6:  { soft: 600,  hard: 800 },   // Porsche flat-6 — 800hp is wild but achievable
  V8:  { soft: 900,  hard: 1400 },  // LS / Hemi / Coyote — proven big power
  V10: { soft: 900,  hard: 1300 },  // Viper V10 — huge displacement
  V12: { soft: 1000, hard: 1500 },  // McLaren F1 / exotics
  R2:  { soft: 500,  hard: 750 },   // 13B rotary — bridge ported 700+ is legendary
  R3:  { soft: 700,  hard: 1000 },  // 20B 3-rotor
});
const DEFAULT_HP_CAP = Object.freeze({ soft: 600, hard: 900 });

/**
 * Applies a soft HP cap with diminishing returns above the soft threshold
 * and a hard ceiling. Returns the capped value.
 *
 * Between soft and hard: each HP above soft gives progressively less credit.
 * Uses a quadratic falloff so the first few HP above soft are almost 1:1 but
 * it tapers off toward the hard cap.
 * Above hard: brick wall.
 */
function applyEngineFamilyHpCap(rawHp, engineFamily) {
  const family = String(engineFamily || "").toUpperCase();
  const cap = ENGINE_FAMILY_HP_CAPS[family] || DEFAULT_HP_CAP;

  if (rawHp <= cap.soft) {
    return rawHp;
  }

  if (rawHp >= cap.hard) {
    return cap.hard;
  }

  // Diminishing returns zone: the excess above soft is compressed
  // using a curve that starts at ~75% credit and tapers to 0% at hard cap.
  const softRange = cap.hard - cap.soft;
  const excess = rawHp - cap.soft;
  const progress = excess / softRange; // 0..1 (how far between soft and hard)
  // Quadratic taper: gives (1 - progress^2) of the excess as credit
  const diminished = excess * (1 - progress * progress) * 0.75;

  return Math.round(cap.soft + diminished);
}

const DEFAULT_BOOST_PROFILES = {
  N: { type: "N", stockBoost: 0, boostSetting: 0, maxPsi: 10, source: "naturally-aspirated" },
  T: { type: "T", stockBoost: 8, xmlStockBoost: 0, boostSetting: 8, maxPsi: 12, source: "generic-turbo" },
  S: { type: "S", stockBoost: 6, xmlStockBoost: 0, boostSetting: 6, maxPsi: 6, source: "generic-supercharger" },
};

const OEM_BOOST_PROFILES_BY_CATALOG_CAR_ID = new Map([
  // Turbo cars
  [2,   { type: "T", stockBoost: 16, xmlStockBoost: 0, boostSetting: 16, maxPsi: 21, source: "oem:2004-evo8-4g63t" }],
  [14,  { type: "T", stockBoost: 10, xmlStockBoost: 0, boostSetting: 10, maxPsi: 14.7, source: "oem:1996-toyota-supra-2jzgte" }],
  [15,  { type: "T", stockBoost: 14, xmlStockBoost: 0, boostSetting: 14, maxPsi: 18, source: "oem:2004-neon-srt4" }],
  [16,  { type: "T", stockBoost: 10, xmlStockBoost: 0, boostSetting: 10, maxPsi: 14, source: "oem:1998-rx7-fd-13brew" }],
  [21,  { type: "T", stockBoost: 12, xmlStockBoost: 0, boostSetting: 12, maxPsi: 16, source: "oem:2009-gtr-vr38dett" }],
  [23,  { type: "T", stockBoost: 15, xmlStockBoost: 0, boostSetting: 15, maxPsi: 19, source: "oem:2008-mazdaspeed3-l3vdt" }],
  [33,  { type: "T", stockBoost: 12, xmlStockBoost: 0, boostSetting: 12, maxPsi: 16, source: "oem:2009-solstice-gxp-lnf" }],
  [35,  { type: "T", stockBoost: 9, xmlStockBoost: 0, boostSetting: 9, maxPsi: 12, source: "oem:1996-300zx-tt-vg30dett" }],
  [38,  { type: "T", stockBoost: 10, xmlStockBoost: 0, boostSetting: 10, maxPsi: 14, source: "oem:2002-r34-gtr-rb26dett" }],
  [52,  { type: "T", stockBoost: 19, xmlStockBoost: 0, boostSetting: 19, maxPsi: 24, source: "oem:2009-cobalt-ss-lnf" }],
  [61,  { type: "T", stockBoost: 11, xmlStockBoost: 0, boostSetting: 11, maxPsi: 12, source: "oem:1994-toyota-mr2-3sgte" }],
  [64,  { type: "T", stockBoost: 13, xmlStockBoost: 0, boostSetting: 13, maxPsi: 17, source: "oem:2010-gti-tsi" }],
  [72,  { type: "T", stockBoost: 15, xmlStockBoost: 0, boostSetting: 15, maxPsi: 18, source: "oem:1987-grand-national-lc2" }],
  [84,  { type: "T", stockBoost: 13, xmlStockBoost: 0, boostSetting: 13, maxPsi: 17, source: "oem:2006-jetta-gli-fsi" }],
  [87,  { type: "T", stockBoost: 18, xmlStockBoost: 0, boostSetting: 18, maxPsi: 23, source: "oem:2011-evox-4b11t" }],
  [88,  { type: "T", stockBoost: 12, xmlStockBoost: 0, boostSetting: 12, maxPsi: 16, source: "oem:1998-eclipse-gsx-4g63t" }],
  [89,  { type: "T", stockBoost: 14, xmlStockBoost: 0, boostSetting: 14, maxPsi: 18, source: "oem:2003-sti-ej207" }],
  [90,  { type: "T", stockBoost: 14, xmlStockBoost: 0, boostSetting: 14, maxPsi: 18, source: "oem:2010-mp412c-m838t" }],
  [91,  { type: "T", stockBoost: 14, xmlStockBoost: 0, boostSetting: 14, maxPsi: 18, source: "oem:2011-sti-ej257" }],
  [92,  { type: "T", stockBoost: 14, xmlStockBoost: 0, boostSetting: 14, maxPsi: 18, source: "oem:2007-sti-ej257" }],
  [125, { type: "T", stockBoost: 10, xmlStockBoost: 0, boostSetting: 10, maxPsi: 14, source: "oem:1995-r33-gtr-rb26dett" }],
  [127, { type: "T", stockBoost: 17, xmlStockBoost: 0, boostSetting: 17, maxPsi: 22, source: "oem:2010-focus-rs-duratec" }],
  [128, { type: "T", stockBoost: 16, xmlStockBoost: 0, boostSetting: 16, maxPsi: 20, source: "oem:2013-genesis-theta2t" }],
  [137, { type: "T", stockBoost: 16, xmlStockBoost: 0, boostSetting: 16, maxPsi: 20, source: "oem:2013-veloster-turbo" }],
  [138, { type: "T", stockBoost: 16, xmlStockBoost: 0, boostSetting: 16, maxPsi: 20, source: "oem:2014-fiesta-st-ecoboost" }],
  [140, { type: "T", stockBoost: 12, xmlStockBoost: 0, boostSetting: 12, maxPsi: 16, source: "oem:2010-panamera-turbo" }],
  [141, { type: "T", stockBoost: 18, xmlStockBoost: 0, boostSetting: 18, maxPsi: 24, source: "oem:1986-rs200-bdt" }],
  [142, { type: "T", stockBoost: 15, xmlStockBoost: 0, boostSetting: 15, maxPsi: 19, source: "oem:2010-mazdaspeed3-l3vdt" }],
  [149, { type: "T", stockBoost: 10, xmlStockBoost: 0, boostSetting: 10, maxPsi: 14, source: "oem:2010-taurus-sho-ecoboost" }],
  // Supercharged cars
  [5,   { type: "S", stockBoost: 8, xmlStockBoost: 0, boostSetting: 8, maxPsi: 10, source: "oem:2006-ford-gt-sc" }],
  [42,  { type: "S", stockBoost: 10, xmlStockBoost: 0, boostSetting: 10, maxPsi: 12, source: "oem:2009-zr1-ls9" }],
  [66,  { type: "S", stockBoost: 10, xmlStockBoost: 0, boostSetting: 10, maxPsi: 12, source: "oem:2009-zr1-ls9" }],
  [68,  { type: "S", stockBoost: 9, xmlStockBoost: 0, boostSetting: 9, maxPsi: 11, source: "oem:2011-gt500-trinity" }],
  [78,  { type: "S", stockBoost: 8, xmlStockBoost: 0, boostSetting: 8, maxPsi: 10, source: "oem:2001-lightning-sc" }],
  [118, { type: "S", stockBoost: 10, xmlStockBoost: 0, boostSetting: 10, maxPsi: 12, source: "oem:2007-slr-722gt" }],
]);

function parseXmlAttributes(attributeSource = "") {
  const attrs = {};
  const attrPattern = /([A-Za-z0-9_:-]+)=['"]([^'"]*)['"]/g;

  for (const match of String(attributeSource || "").matchAll(attrPattern)) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

export function installedPartAttributes(partsXml = "") {
  return [...String(partsXml || "").matchAll(/<p\s+([^>]*?)\/?>/g)]
    .map((match) => parseXmlAttributes(match[1]));
}

function numberAttribute(attrs, key, fallback = 0) {
  const value = Number(attrs?.[key]);

  return Number.isFinite(value) ? value : fallback;
}

function textCompressionRatio(part, fallbackRatio = DEFAULT_COMPRESSION_RATIO) {
  const text = `${part?.n || ""} ${part?.mn || ""}`;
  const normalizedText = text.toLowerCase();
  const ratioMatch = text.match(/([+-]?\d+(?:\.\d+)?)\s*:\s*1\b/i);

  if (ratioMatch) {
    const parsed = Number(ratioMatch[1]);
    if (Number.isFinite(parsed)) {
      const ratio = parsed < 0 ? Number(fallbackRatio || DEFAULT_COMPRESSION_RATIO) + parsed : parsed;
      if (ratio >= MIN_COMPRESSION_RATIO && ratio <= MAX_COMPRESSION_RATIO) {
        return ratio;
      }
    }
  }

  if (normalizedText.includes("low compression") || normalizedText.includes("fi low compression")) {
    return 8.5;
  }

  if (normalizedText.includes("high compression")) {
    return 11.5;
  }

  return 0;
}

function partCompressionRatio(part, fallbackRatio = DEFAULT_COMPRESSION_RATIO) {
  const explicitCompression = Number(part?.cc);
  if (Number.isFinite(explicitCompression) && explicitCompression !== 0) {
    const ratio = explicitCompression >= MIN_COMPRESSION_RATIO
      ? explicitCompression
      : Number(fallbackRatio || DEFAULT_COMPRESSION_RATIO) + explicitCompression;

    return clampNumber(ratio, MIN_COMPRESSION_RATIO, MAX_COMPRESSION_RATIO);
  }

  return textCompressionRatio(part, fallbackRatio);
}

function partCompressionDelta(part) {
  const explicitCompression = Number(part?.cc);
  if (Number.isFinite(explicitCompression) && explicitCompression !== 0) {
    return clampNumber(explicitCompression, -1.5, 1.5);
  }

  const text = `${part?.n || ""} ${part?.mn || ""}`.toLowerCase();
  if (text.includes("thick") || text.includes("boost gasket")) {
    return -0.3;
  }
  if (text.includes("thin") || text.includes("race gasket")) {
    return 0.3;
  }

  return 0;
}

function installedTireStick(installedParts, targetCar) {
  const installedTires = installedParts
    .filter((attrs) => Number(attrs.ci || attrs.pi || 0) === TIRE_CATEGORY_ID)
    .map((attrs) => {
      const xmlTraction = numberAttribute(attrs, "ar", Number.NaN);
      return Number.isFinite(xmlTraction)
        ? xmlTraction
        : tireTractionForPartId(attrs.i, Number.NaN);
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  if (installedTires.length > 0) {
    return Math.max(...installedTires);
  }

  return tireTractionForPartId(targetCar?.tirePartId);
}

function raceGripCoefficient(tireStick) {
  const grip = Number(tireStick);

  return Number.isFinite(grip) && grip > 0
    ? Number((BASE_STATIC_GRIP * grip).toFixed(3))
    : BASE_STATIC_GRIP;
}

function boostAirHpi(boostProfile, supportRatio) {
  const boostSetting = Number(boostProfile?.boostSetting || 0);
  const support = Number.isFinite(Number(supportRatio)) ? Math.max(0.75, Math.min(1.2, Number(supportRatio))) : 1;

  return boostSetting > 0 ? Number(((boostSetting / 100) * support * BOOST_EFFECT_SCALE).toFixed(3)) : 0;
}

function boostFlowFromPower(horsepower, boostProfile) {
  const baseFlow = Number((Number(horsepower || 0) * 0.02859).toFixed(3));
  const hasBoost = Number(boostProfile?.boostSetting || 0) > 0;
  const minBoostFlow = hasBoost
    ? Number((Number(boostProfile.boostSetting) * 0.75 * BOOST_EFFECT_SCALE).toFixed(3))
    : 0;

  return Math.max(baseFlow, minBoostFlow, hasBoost ? BOOST_FLOW_FOR_REDLINE_RAMP : 0);
}

function runtimeHpi({ boostType }) {
  return boostType === "N" ? NATURAL_RUNTIME_HPI : FORCED_INDUCTION_RUNTIME_HPI;
}

function clientDynoBoostState(performance, rpm) {
  const boostSetting = Math.max(0, Number(performance?.boostSetting || 0));
  const boostType = performance?.boostType || "N";
  const boostLag = boostType === "T" ? boostSetting * CLIENT_DYNO_TURBO_BOOST_LAG_SCALE : 0;
  const boostRange = boostType === "T" ? boostSetting * CLIENT_DYNO_TURBO_BOOST_RANGE_SCALE : boostSetting;
  const redlineRpm = Math.max(1, Number(performance?.redlineRpm || 0));
  const turboFlow = Math.max(0, Number(performance?.boostFlow || 0));
  const spoolBaseRpm = Math.max(1, turboFlow * 0.0075 * redlineRpm);
  const normalizedRpm = clampNumber(Number(rpm || 0) / spoolBaseRpm, 0, 1);
  const maxPsi = Math.max(0, Number(performance?.maxPsi || 0));
  const boostPsi = Math.max(0, maxPsi > 0
    ? Math.min(maxPsi, normalizedRpm * boostRange - boostLag)
    : normalizedRpm * boostRange - boostLag);

  return {
    boostPsi,
    boostRamp: Math.max(0, boostPsi * CLIENT_DYNO_BOOST_RAMP_SCALE),
  };
}

function clientDynoCompressionPowerDelta(performance, boostPsi) {
  const compressionLevel = Number(performance?.compressionLevel || 0);

  if (!Number.isFinite(compressionLevel) || compressionLevel <= 0) {
    return 0;
  }

  return ((compressionLevel * 2) - Number(boostPsi || 0)) / 100;
}

function clientDynoPowerFactor(performance, rpm) {
  const { boostPsi, boostRamp } = clientDynoBoostState(performance, rpm);
  const hpi = Number(performance?.runtimeHpi || 0);
  const airhpi = Number(performance?.airhpi || 0);
  const turboFlow = Math.max(0, Number(performance?.boostFlow || 0));
  const maxPsi = Math.max(0, Number(performance?.maxPsi || 0));
  const overallAirFlowLimit = Math.max(0, Number(performance?.overallAirFlowLimit || 0));
  const fuelFlowLimit = Math.max(0, Number(performance?.fuelFlowLimit || 0));
  const chipSetting = Number(performance?.chipSetting || 0);
  const boostAirDemand = maxPsi > 0 ? (boostPsi / maxPsi) * turboFlow : turboFlow;
  const airFlowLimit = Math.min(boostAirDemand, overallAirFlowLimit);
  const unusedAirFlow = Math.abs(overallAirFlowLimit - boostAirDemand);
  const fueledAirFlow = Math.min(airFlowLimit + chipSetting, fuelFlowLimit);
  const airFuelMeter = fueledAirFlow - airFlowLimit;
  let airFuelDelta = Math.abs(airFuelMeter);

  if (airFuelDelta < boostAirDemand) {
    airFuelDelta = boostAirDemand;
  }

  let ecuTune = 0;
  if (airFlowLimit > fueledAirFlow) {
    ecuTune = Math.min(10, airFuelDelta * 2.5) / 100;
  } else {
    const richRatio = airFuelDelta > 0 ? boostAirDemand / airFuelDelta : 0;
    ecuTune = (richRatio < 0.1 ? 0 : richRatio) / 100;
  }

  const unusedAirAdjustment = unusedAirFlow / 2;
  const systemPower = airhpi - (unusedAirAdjustment / 100);
  const boostCreatedPower = (boostRamp * (airFlowLimit - unusedAirAdjustment)) / 100;
  const compressionPowerDelta = clientDynoCompressionPowerDelta(performance, boostPsi);
  const totalPower = hpi + boostCreatedPower + systemPower + ecuTune + compressionPowerDelta;

  return 1 + totalPower;
}

export function estimateClientDynoTorqueCurve(performance, { sampleStep = CLIENT_DYNO_TORQUE_SAMPLE_STEP } = {}) {
  const torqueCurve = Array.isArray(performance?.torqueCurve) ? performance.torqueCurve : [];
  const safeSampleStep = Math.max(1, Number(sampleStep || CLIENT_DYNO_TORQUE_SAMPLE_STEP));
  const dynoCurve = [];

  for (let index = 0; index < torqueCurve.length; index += safeSampleStep) {
    const torque = Number(torqueCurve[index]);
    if (!Number.isFinite(torque)) {
      dynoCurve.push(0);
      continue;
    }

    const rpm = index * CLIENT_DYNO_RPM_STEP;
    dynoCurve.push(Number((torque * clientDynoPowerFactor(performance, rpm)).toFixed(3)));
  }

  return dynoCurve;
}

function dynoCurvePeaks(torqueCurve = [], rpmStep = CLIENT_DYNO_RPM_STEP) {
  return torqueCurve.reduce((peaks, torque, index) => {
    const numericTorque = Number(torque);
    if (!Number.isFinite(numericTorque)) {
      return peaks;
    }

    const rpm = index * rpmStep;
    const horsepower = rpm > 0 ? (numericTorque * rpm) / 5252 : 0;
    const nextPeaks = { ...peaks };

    if (numericTorque > nextPeaks.torque.value) {
      nextPeaks.torque = { value: numericTorque, index, rpm };
    }
    if (horsepower > nextPeaks.horsepower.value) {
      nextPeaks.horsepower = { value: horsepower, index, rpm };
    }

    return nextPeaks;
  }, {
    horsepower: { value: 0, index: 0, rpm: 0 },
    torque: { value: 0, index: 0, rpm: 0 },
  });
}

function dynoSampleAlignedIndex(index, direction, maxIndex) {
  const safeIndex = clampNumber(Math.round(Number(index || 0)), 1, maxIndex);
  let aligned;
  if (direction === "up") {
    aligned = Math.ceil(safeIndex / CLIENT_DYNO_TORQUE_SAMPLE_STEP) * CLIENT_DYNO_TORQUE_SAMPLE_STEP;
  } else if (direction === "down") {
    aligned = Math.floor(safeIndex / CLIENT_DYNO_TORQUE_SAMPLE_STEP) * CLIENT_DYNO_TORQUE_SAMPLE_STEP;
  } else {
    aligned = Math.round(safeIndex / CLIENT_DYNO_TORQUE_SAMPLE_STEP) * CLIENT_DYNO_TORQUE_SAMPLE_STEP;
  }

  return clampNumber(aligned || CLIENT_DYNO_TORQUE_SAMPLE_STEP, CLIENT_DYNO_TORQUE_SAMPLE_STEP, maxIndex);
}

function nearestUsableTorquePeakIndex({ peaks, targetHorsepower, targetTorque, maxIndex }) {
  const maxTorqueRpm = targetTorque > 0 ? (targetHorsepower * 5252) / targetTorque : 0;
  const preferredIndex = dynoSampleAlignedIndex(Number(peaks?.torque?.index || 1), "down", maxIndex);

  if ((preferredIndex * CLIENT_DYNO_RPM_STEP) <= maxTorqueRpm) {
    return preferredIndex;
  }

  return dynoSampleAlignedIndex(Math.floor(maxTorqueRpm / CLIENT_DYNO_RPM_STEP), "down", maxIndex);
}

function nearestUsableHorsepowerPeakIndex({ peaks, targetHorsepower, targetTorque, maxIndex }) {
  const minHorsepowerRpm = targetTorque > 0 ? (targetHorsepower * 5252) / targetTorque : 0;
  const preferredIndex = dynoSampleAlignedIndex(Number(peaks?.horsepower?.index || 1), "down", maxIndex);

  if ((preferredIndex * CLIENT_DYNO_RPM_STEP) >= minHorsepowerRpm) {
    return preferredIndex;
  }

  const nextAligned = preferredIndex + CLIENT_DYNO_TORQUE_SAMPLE_STEP;
  if (nextAligned <= maxIndex && (nextAligned * CLIENT_DYNO_RPM_STEP) >= minHorsepowerRpm) {
    return nextAligned;
  }

  return dynoSampleAlignedIndex(Math.ceil(minHorsepowerRpm / CLIENT_DYNO_RPM_STEP), "up", maxIndex);
}

export function calibrateClientDynoTorqueCurve(performance = {}) {
  const torqueCurve = Array.isArray(performance?.torqueCurve) ? performance.torqueCurve : [];
  if (torqueCurve.length === 0) {
    return [];
  }

  const targetHorsepower = Math.max(1, Number(performance?.horsepower || performance?.hp || 0));
  const targetTorque = Math.max(1, Number(performance?.torque || performance?.tq || 0));
  const redlineRpm = Math.max(4500, Number(performance?.redlineRpm || 6500));
  const maxIndex = torqueCurve.length - 1;

  // Compute what the client will display after applying its power factor
  const clientCurve = torqueCurve.map((torque, index) => {
    const rpm = index * CLIENT_DYNO_RPM_STEP;
    return Number(torque || 0) * clientDynoPowerFactor(performance, rpm);
  });

  // Find the raw peaks in the client curve
  const peaks = dynoCurvePeaks(clientCurve);

  // Determine where the torque and HP peaks should land
  const torquePeakIndex = nearestUsableTorquePeakIndex({
    peaks,
    targetHorsepower,
    targetTorque,
    maxIndex,
  });
  const horsepowerPeakIndex = nearestUsableHorsepowerPeakIndex({
    peaks,
    targetHorsepower,
    targetTorque,
    maxIndex,
  });

  // Calculate the torque value needed at the HP peak RPM to produce the target HP
  const horsepowerPeakRpm = horsepowerPeakIndex * CLIENT_DYNO_RPM_STEP;
  const torqueAtHpPeak = horsepowerPeakRpm > 0
    ? (targetHorsepower * 5252) / horsepowerPeakRpm
    : targetTorque;

  // Scale the curve proportionally to hit both targets while preserving shape.
  // We use a two-region scale: below HP peak we scale toward targetTorque at the
  // TQ peak, and at/above HP peak we scale toward torqueAtHpPeak.
  const rawTqPeakValue = peaks.torque.value || targetTorque;
  const rawHpPeakTqValue = clientCurve[horsepowerPeakIndex] || rawTqPeakValue;
  const torqueScale = rawTqPeakValue > 0 ? targetTorque / rawTqPeakValue : 1;
  const hpScale = rawHpPeakTqValue > 0 ? torqueAtHpPeak / rawHpPeakTqValue : 1;

  // Build the desired client curve by smoothly blending between the two scales.
  // This preserves the original curve shape (rise → peak → fall) and avoids the
  // flat HP plateau that the old horsepowerCap approach created.
  const blendStart = Math.max(0, torquePeakIndex);
  const blendEnd = Math.min(maxIndex, horsepowerPeakIndex);
  const blendRange = Math.max(1, blendEnd - blendStart);

  const desiredClientCurve = clientCurve.map((torque, index) => {
    if (torque <= 0) return 0;

    let scale;
    if (index <= blendStart) {
      scale = torqueScale;
    } else if (index >= blendEnd) {
      scale = hpScale;
    } else {
      // Smooth cosine blend between TQ scale and HP scale
      const progress = (index - blendStart) / blendRange;
      const blend = 0.5 - 0.5 * Math.cos(progress * Math.PI);
      scale = torqueScale * (1 - blend) + hpScale * blend;
    }

    return Math.max(0, torque * scale);
  });

  // Ensure the TQ peak hits the target exactly
  desiredClientCurve[torquePeakIndex] = targetTorque;

  // Ensure the HP peak hits the target exactly
  desiredClientCurve[horsepowerPeakIndex] = torqueAtHpPeak;

  // Smooth out harsh transitions using multiple passes of weighted averaging.
  // More passes with a wider window eliminates the spikes created by forced peaks.
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 2; i < desiredClientCurve.length - 2; i++) {
      // Protect the exact peak indices on first 2 passes only
      if (pass < 2 && (i === torquePeakIndex || i === horsepowerPeakIndex)) continue;
      const p2 = desiredClientCurve[i - 2];
      const p1 = desiredClientCurve[i - 1];
      const curr = desiredClientCurve[i];
      const n1 = desiredClientCurve[i + 1];
      const n2 = desiredClientCurve[i + 2];
      // Check for local discontinuity (>5% jump vs neighbors)
      const avgNeighbor = (p1 + n1) / 2;
      const jumpRatio = avgNeighbor > 0 ? Math.abs(curr - avgNeighbor) / avgNeighbor : 0;
      if (jumpRatio > 0.05) {
        // 5-point weighted gaussian-like smooth
        desiredClientCurve[i] = (p2 + p1 * 2 + curr * 4 + n1 * 2 + n2) / 10;
      }
    }
  }

  // Soft HP cap: instead of a hard cap that creates a flat plateau, apply a
  // gentle rolloff when approaching the HP limit. This produces a natural peak.
  const hpCapTolerance = 1.03; // Allow 3% overshoot before applying rolloff
  for (let i = 0; i < desiredClientCurve.length; i++) {
    const rpm = i * CLIENT_DYNO_RPM_STEP;
    if (rpm <= 0) continue;
    const impliedHp = (desiredClientCurve[i] * rpm) / 5252;
    if (impliedHp > targetHorsepower * hpCapTolerance) {
      // Soft limit: asymptotically approach the cap
      const overshoot = impliedHp / (targetHorsepower * hpCapTolerance);
      const softened = targetHorsepower * hpCapTolerance / Math.pow(overshoot, 0.5);
      desiredClientCurve[i] = (softened * 5252) / rpm;
    }
  }

  // Apply falloff past redline — use a gradual cosine-based fade starting
  // slightly before redline to avoid a harsh knee at the exact redline RPM.
  const redlineIndex = Math.round(redlineRpm / CLIENT_DYNO_RPM_STEP);
  const fadeStartIndex = Math.max(0, redlineIndex - 3); // Start fading 300rpm before redline
  const fadeEndIndex = Math.min(desiredClientCurve.length - 1, redlineIndex + 15);
  for (let i = fadeStartIndex; i < desiredClientCurve.length; i++) {
    if (i <= fadeStartIndex) continue;
    const fadeProgress = clampNumber((i - fadeStartIndex) / Math.max(1, fadeEndIndex - fadeStartIndex), 0, 1);
    // Smooth cosine fade from 1.0 down to ~0.15
    const fadeFactor = 1 - fadeProgress * 0.85 * (0.5 - 0.5 * Math.cos(fadeProgress * Math.PI));
    desiredClientCurve[i] *= Math.max(0.1, fadeFactor);
  }

  // Convert back to base torque values by dividing out the power factor
  return torqueCurve.map((torque, index) => {
    const rpm = index * CLIENT_DYNO_RPM_STEP;
    const powerFactor = clientDynoPowerFactor(performance, rpm);
    if (!Number.isFinite(powerFactor) || powerFactor <= 0) {
      return Number(torque || 0);
    }

    return Number((desiredClientCurve[index] / powerFactor).toFixed(3));
  });
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function estimateTorqueCurve({ horsepower, torque, redlineRpm, peakRpm }) {
  const normalizedHorsepower = Math.max(1, Number(horsepower || 150));
  const normalizedTorque = Math.max(1, Number(torque || horsepower || 150));
  const safeRedline = Math.max(4500, Number(redlineRpm || 6500));
  const calculatedHpPeakRpm = Math.round((normalizedHorsepower * 5252) / normalizedTorque);
  const requestedPeakRpm = Number(peakRpm || 0);
  const hpPeakRpm = clampNumber(
    Math.max(requestedPeakRpm || 0, calculatedHpPeakRpm || 0, Math.round(safeRedline * 0.72)),
    3000,
    safeRedline - 200,
  );
  const torquePeakRpm = clampNumber(Math.round(hpPeakRpm * 0.82), 2200, hpPeakRpm - 400);
  const maxIndex = 100;
  const curve = [];

  // Build a smooth bell-shaped torque curve using cosine interpolation.
  // The curve rises smoothly from idle to peak torque, holds briefly, then
  // falls off naturally past the HP peak toward redline.
  for (let index = 0; index <= maxIndex; index += 1) {
    const rpm = Math.max(700, index * 100);
    let value;

    if (rpm <= torquePeakRpm) {
      // Rise phase: smooth cosine ramp from ~45% at idle to 100% at torque peak
      const riseProgress = clampNumber((rpm - 700) / Math.max(1, torquePeakRpm - 700), 0, 1);
      const smoothRise = 0.5 - 0.5 * Math.cos(riseProgress * Math.PI); // S-curve 0→1
      value = normalizedTorque * (0.45 + smoothRise * 0.55);
    } else if (rpm <= hpPeakRpm) {
      // Plateau/slight decline between torque peak and HP peak
      const plateauProgress = (rpm - torquePeakRpm) / Math.max(1, hpPeakRpm - torquePeakRpm);
      // Torque drops slightly (3-8%) from peak to HP peak — natural behavior
      const dropFraction = 0.03 + plateauProgress * 0.05;
      value = normalizedTorque * (1 - dropFraction);
    } else {
      // Fall phase: smooth falloff past HP peak toward redline and beyond
      const fallRange = safeRedline - hpPeakRpm + 1500;
      const fallProgress = clampNumber((rpm - hpPeakRpm) / Math.max(1, fallRange), 0, 1);
      // Use cosine for a smooth knee instead of linear drop
      const smoothFall = 0.5 - 0.5 * Math.cos(fallProgress * Math.PI); // 0→1
      const peakExitTorque = normalizedTorque * 0.92; // value at start of fall
      value = peakExitTorque * (1 - smoothFall * 0.85);
    }

    // Enforce HP ceiling: torque cannot imply more than target HP at any RPM
    if (rpm > torquePeakRpm) {
      const maxTorqueForHp = (normalizedHorsepower * 5252) / rpm;
      value = Math.min(value, maxTorqueForHp);
    }

    curve.push(Math.max(12, Number(value.toFixed(1))));
  }

  return curve;
}

function inferRedlineRpm(catalogCar, engineDescriptor) {
  const engine = String(engineDescriptor || catalogCar?.stockEngine || catalogCar?.engineFamily || "").toLowerCase();
  const explicitRedline = Number(catalogCar?.redlineRpm || 0);

  if (explicitRedline > 0) {
    return explicitRedline;
  }
  if (engine.includes("renesis") || engine.includes("rotary") || engine.includes("20b")) {
    return 9000;
  }
  if (engine.includes("13b")) {
    return 7000;
  }
  if (engine.includes("hemi")) {
    return 5600;
  }
  if (engine.includes("v10")) {
    return 6200;
  }
  if (engine.includes("v8")) {
    return 6500;
  }
  if (engine.includes("v6")) {
    return 6600;
  }
  if (engine.includes("turbo") || /\btt\b/.test(engine)) {
    return 7000;
  }
  if (engine.includes("vtec") || engine.includes("1.8l")) {
    return 7800;
  }

  return 6800;
}

function inferCylinderCount(catalogCar, engineDescriptor) {
  const engine = String(engineDescriptor || catalogCar?.stockEngine || catalogCar?.engineFamily || "").toLowerCase();
  const family = String(catalogCar?.engineFamily || "").toLowerCase();

  if (engine.includes("20b") || engine.includes("3-rotor")) {
    return 3;
  }
  if (engine.includes("13b") || engine.includes("rotary") || family.includes("r2")) {
    return 2;
  }
  if (engine.includes("v10")) {
    return 10;
  }
  if (engine.includes("v8") || engine.includes("hemi") || family.includes("v8")) {
    return 8;
  }
  if (engine.includes("v6") || engine.includes("i6") || family.includes("v6")) {
    return 6;
  }
  if (engine.includes("i3") || family.includes("i3")) {
    return 3;
  }

  return 4;
}

function gearRatiosForCar(catalogCar) {
  const drivetrain = String(catalogCar?.drivetrain || "RWD").toUpperCase();
  const carType = String(catalogCar?.carType || "").toLowerCase();
  const weight = Number(catalogCar?.weight || 0);
  const engine = String(catalogCar?.stockEngine || catalogCar?.engineFamily || "").toLowerCase();

  if (drivetrain === "FWD") {
    return { f: 3.462, g: 1.947, h: 1.286, i: 0.972, j: 0.78, k: 0.65, l: 4.06 };
  }
  if (drivetrain === "AWD") {
    return { f: 3.454, g: 1.947, h: 1.296, i: 0.972, j: 0.738, k: 0.615, l: 3.7 };
  }
  if (carType === "truck" || weight >= 4800) {
    return { f: 3.587, g: 2.022, h: 1.384, i: 1, j: 0.861, k: 0.73, l: 3.73 };
  }
  if (engine.includes("v8") && weight >= 3600) {
    return { f: 2.66, g: 1.78, h: 1.3, i: 1, j: 0.72, k: 0, l: 3.55 };
  }

  return { f: 3.587, g: 2.022, h: 1.384, i: 1, j: 0.861, k: 0.73, l: 3.55 };
}

function normalizeGearRatio(value, fallback) {
  const ratio = Number(value);

  return Number.isFinite(ratio) && ratio >= 0 && ratio <= 10
    ? Number(ratio.toFixed(3))
    : fallback;
}

function savedGearRatiosForCar(targetCar, defaultRatios) {
  const saved = targetCar?.gearRatios || targetCar?.dynoGearRatios || {};

  return {
    f: normalizeGearRatio(saved.f ?? saved.g1 ?? saved.first, defaultRatios.f),
    g: normalizeGearRatio(saved.g ?? saved.g2 ?? saved.second, defaultRatios.g),
    h: normalizeGearRatio(saved.h ?? saved.g3 ?? saved.third, defaultRatios.h),
    i: normalizeGearRatio(saved.i ?? saved.g4 ?? saved.fourth, defaultRatios.i),
    j: normalizeGearRatio(saved.j ?? saved.g5 ?? saved.fifth, defaultRatios.j),
    k: normalizeGearRatio(saved.k ?? saved.g6 ?? saved.sixth, defaultRatios.k),
    l: normalizeGearRatio(saved.l ?? saved.fd ?? saved.finalDrive, defaultRatios.l),
  };
}

function catalogBoostType(catalogCar) {
  const explicitType = String(
    catalogCar?.boostType
      || catalogCar?.engineType
      || catalogCar?.engineTypeLabel
      || "",
  ).trim().toUpperCase();
  const inductionSystem = String(catalogCar?.inductionSystem || "").trim().toUpperCase();

  if (["T", "TC", "TURBO", "TURBOCHARGED"].includes(explicitType)
    || ["T", "TC", "TURBO", "TURBOCHARGED"].includes(inductionSystem)) {
    return "T";
  }
  if (["S", "SC", "SUPERCHARGED"].includes(explicitType)
    || ["S", "SC", "SUPERCHARGED"].includes(inductionSystem)) {
    return "S";
  }

  return "";
}

/**
 * Determines the effective engine family for HP cap purposes.
 * If the engine has been swapped, uses the swap engine's family.
 * Otherwise uses the catalog car's native engine family.
 */
function resolveEffectiveEngineFamily({ enginePart, engineDescriptor, catalogCar, factoryStockEngine }) {
  // If factory stock engine, use the catalog car's family directly
  if (factoryStockEngine) {
    return String(catalogCar?.engineFamily || "I4");
  }

  // Engine swap — infer family from the installed engine's name/descriptor
  const desc = String(engineDescriptor || enginePart?.n || enginePart?.mn || "").toLowerCase();

  // Check for specific swap families from REAL_LIFE_PART_SPECS engine swaps
  if (desc.includes("ls") || desc.includes("coyote") || desc.includes("hemi") || desc.includes("v8")
    || desc.includes("aluminator") || desc.includes("big block") || desc.includes("small block")) {
    return "V8";
  }
  if (desc.includes("2jz") || desc.includes("rb26") || desc.includes("i6") || desc.includes("inline-6")
    || desc.includes("inline 6")) {
    return "I6";
  }
  if (desc.includes("vq") || desc.includes("v6") || desc.includes("ecoboost") && desc.includes("3.5")) {
    return "V6";
  }
  if (desc.includes("v10")) {
    return "V10";
  }
  if (desc.includes("v12")) {
    return "V12";
  }
  if (desc.includes("rotary") || desc.includes("13b") || desc.includes("renesis")) {
    return "R2";
  }
  if (desc.includes("20b") || desc.includes("3-rotor")) {
    return "R3";
  }
  if (desc.includes("ej2") || desc.includes("flat-4") || desc.includes("h4") || desc.includes("fa20")) {
    return "H4";
  }
  if (desc.includes("flat-6") || desc.includes("h6") || desc.includes("mezger")) {
    return "H6";
  }

  // Fallback: use catalog car's engine family (swap didn't change displacement class)
  return String(catalogCar?.engineFamily || "I4");
}

function resolveBoostType({ targetCar, catalogCar, installedParts }) {
  const engineTypeId = Number(targetCar?.engineTypeId || 0);
  const engineDescriptor = [
    catalogCar?.stockEngine,
    catalogCar?.stockEngineCode,
    catalogCar?.engineFamily,
    ...installedParts.map((attrs) => attrs.n || attrs.mn || ""),
  ].join(" ").toLowerCase();
  const installedSlots = new Set(installedParts.map((attrs) => Number(attrs.ci || attrs.pi || 0)));

  if (engineTypeId === 2 || TURBO_SYSTEM_SLOT_IDS.some((slotId) => installedSlots.has(slotId))) {
    return "T";
  }
  if (engineTypeId === 3 || SUPERCHARGER_SYSTEM_SLOT_IDS.some((slotId) => installedSlots.has(slotId))) {
    return "S";
  }
  const catalogType = catalogBoostType(catalogCar);
  if (catalogType) {
    return catalogType;
  }
  if (engineDescriptor.includes("supercharged")) {
    return "S";
  }
  if (engineDescriptor.includes("turbo") || /\btt\b/.test(engineDescriptor)) {
    return "T";
  }

  return "N";
}

function explicitBoostValue(part, keys) {
  for (const key of keys) {
    const value = Number(part?.[key]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return 0;
}

function boostPsiFromName(part) {
  const text = `${part?.n || ""} ${part?.mn || ""}`;
  const match = text.match(/(\d+(?:\.\d+)?)\s*psi\b/i);

  return match ? Math.max(0, Number(match[1]) || 0) : 0;
}

function boostSourcePartsForType(installedParts, boostType) {
  const sourceSlots = boostType === "T"
    ? TURBO_BOOST_SOURCE_SLOT_IDS
    : boostType === "S"
      ? SUPERCHARGER_BOOST_SOURCE_SLOT_IDS
      : new Set();

  return installedParts.filter((part) => sourceSlots.has(partSlotId(part)));
}

function boostProfileFromInstalledParts({ boostType, installedParts, fallbackProfile }) {
  const boostParts = boostSourcePartsForType(installedParts, boostType);
  if (boostParts.length === 0) {
    return null;
  }

  const bestPart = boostParts
    .map((part) => ({
      part,
      maxPsi: explicitBoostValue(part, ["maxPsi", "boostLimit", "boostMax", "psi"]) || boostPsiFromName(part),
      score: partPowerScore(part),
    }))
    .sort((left, right) => {
      const leftMax = left.maxPsi || 0;
      const rightMax = right.maxPsi || 0;
      return rightMax - leftMax || right.score - left.score;
    })[0];

  const maxPsi = bestPart?.maxPsi > 0
    ? bestPart.maxPsi
    : Number(fallbackProfile?.maxPsi || 0);
  const stockBoost = explicitBoostValue(bestPart?.part, ["stockBoost", "baseBoost", "defaultBoost"])
    || Number(fallbackProfile?.stockBoost || fallbackProfile?.boostSetting || 0);
  const boostSetting = explicitBoostValue(bestPart?.part, ["boostSetting", "defaultBoost"])
    || stockBoost
    || Number(fallbackProfile?.boostSetting || 0);

  return {
    ...fallbackProfile,
    type: boostType,
    stockBoost: Number(Math.min(stockBoost, maxPsi || stockBoost).toFixed(3)),
    boostSetting: Number(Math.min(boostSetting, maxPsi || boostSetting).toFixed(3)),
    maxPsi: Number(maxPsi.toFixed(3)),
    source: `${fallbackProfile?.source || "boost"}:part:${bestPart?.part?.i || "unknown"}`,
  };
}

function boostProfileWithCatalogDefaults({ boostType, catalogCar, fallbackProfile }) {
  if (boostType === "N") {
    return fallbackProfile;
  }

  const maxPsi = explicitBoostValue(catalogCar, ["maxPsi", "boostLimit", "boostMax", "psi"]);
  const stockBoost = explicitBoostValue(catalogCar, ["stockBoost", "baseBoost", "defaultBoost"]);
  const boostSetting = explicitBoostValue(catalogCar, ["boostSetting", "defaultBoost"]) || stockBoost;

  if (maxPsi <= 0 && stockBoost <= 0 && boostSetting <= 0) {
    return fallbackProfile;
  }

  const profileMaxPsi = maxPsi || Number(fallbackProfile?.maxPsi || 0);
  const profileStockBoost = stockBoost || Number(fallbackProfile?.stockBoost || fallbackProfile?.boostSetting || 0);
  const profileBoostSetting = boostSetting || profileStockBoost || Number(fallbackProfile?.boostSetting || 0);

  return {
    ...fallbackProfile,
    type: boostType,
    stockBoost: Number(Math.min(profileStockBoost, profileMaxPsi || profileStockBoost).toFixed(3)),
    boostSetting: Number(Math.min(profileBoostSetting, profileMaxPsi || profileBoostSetting).toFixed(3)),
    maxPsi: Number(profileMaxPsi.toFixed(3)),
    source: `${fallbackProfile?.source || "boost"}:catalog`,
  };
}

function resolveBoostProfile({ boostType, catalogCar, installedParts }) {
  const installedSlots = new Set(installedParts.map((attrs) => Number(attrs.ci || attrs.pi || 0)));
  const hasTurboSystem = TURBO_SYSTEM_SLOT_IDS.some((slotId) => installedSlots.has(slotId));
  const hasSuperchargerSystem = SUPERCHARGER_SYSTEM_SLOT_IDS.some((slotId) => installedSlots.has(slotId));
  const oemProfile = OEM_BOOST_PROFILES_BY_CATALOG_CAR_ID.get(Number(catalogCar?.id || 0));
  const fallbackProfile = boostProfileWithCatalogDefaults({
    boostType,
    catalogCar,
    fallbackProfile: DEFAULT_BOOST_PROFILES[boostType] || DEFAULT_BOOST_PROFILES.N,
  });
  const installedProfile = boostProfileFromInstalledParts({ boostType, installedParts, fallbackProfile });

  if (installedProfile) {
    return installedProfile;
  }

  if (!hasTurboSystem && !hasSuperchargerSystem && oemProfile?.type === boostType) {
    return oemProfile;
  }

  return fallbackProfile;
}

function partSlotId(part) {
  return Number(part?.ci || part?.categoryID || part?.pi || part?.pcid || 0);
}

export function isStockOemDefaultPart(part) {
  return Number(part?.ai || 0) === 0 && String(part?.b || "").toLowerCase() === "oem";
}

export function isGearRatioSetupPart(part) {
  return String(part?.b || part?.bn || "").toLowerCase() === "setup"
    || Number(part?.i || 0) === 10837;
}

export function allowsCustomGearRatios(part) {
  if (!part) {
    return false;
  }

  if (isGearRatioSetupPart(part)) {
    return true;
  }

  return !isStockOemDefaultPart(part);
}

function hasTractionControl(installedParts) {
  return installedParts.some((part) => TRACTION_CONTROL_SLOT_IDS.has(partSlotId(part)));
}

function boostStaticPowerScale(part, boostType) {
  const slotId = partSlotId(part);

  if (boostType === "T") {
    if (TURBO_BOOST_SOURCE_SLOT_IDS.has(slotId)) {
      return BOOST_SOURCE_STATIC_POWER_SCALE;
    }
    if (TURBO_SYSTEM_SLOT_IDS.includes(slotId)) {
      return BOOST_SYSTEM_STATIC_POWER_SCALE;
    }
  }

  if (boostType === "S") {
    if (SUPERCHARGER_BOOST_SOURCE_SLOT_IDS.has(slotId)) {
      return BOOST_SOURCE_STATIC_POWER_SCALE;
    }
    if (SUPERCHARGER_SYSTEM_SLOT_IDS.includes(slotId)) {
      return BOOST_SYSTEM_STATIC_POWER_SCALE;
    }
  }

  return 1;
}

function isFactoryStockEnginePart(enginePart, catalogCarId) {
  if (!enginePart) {
    return true;
  }

  const partId = Number(enginePart.i || 0);
  const generatedStockEnginePartId = 700000 + Number(catalogCarId || 0);
  if (generatedStockEnginePartId > 700000 && partId === generatedStockEnginePartId) {
    return true;
  }

  return String(enginePart.b || "").toLowerCase() === "factory";
}

function partPowerScore(part) {
  return Math.max(0, numberAttribute(part, "hp", 0)) + Math.max(0, numberAttribute(part, "tq", 0)) * 0.35;
}

function airFuelMeterKind(part) {
  const explicitKind = String(part?.afm || "").toLowerCase();
  const explicitType = Number(part?.aft);

  if (explicitKind === "controller" || explicitType === 2) {
    return "controller";
  }
  if (explicitKind === "meter" || explicitType === 1) {
    return "meter";
  }

  const text = `${part?.n || ""} ${part?.mn || ""}`.toLowerCase();
  if (text.includes("air") && text.includes("fuel") && text.includes("controller")) {
    return "controller";
  }
  if (text.includes("air") && text.includes("fuel") && text.includes("meter")) {
    return "meter";
  }

  return "";
}

function airFuelMeterCapabilityFromParts(installedParts) {
  return installedParts.reduce((capability, part) => {
    const kind = airFuelMeterKind(part);

    if (kind === "controller") {
      return Math.max(capability, 2);
    }
    if (kind === "meter") {
      return Math.max(capability, 1);
    }

    return capability;
  }, 0);
}

export function installedAirFuelMeterCapability(partsXml = "") {
  return airFuelMeterCapabilityFromParts(installedPartAttributes(partsXml));
}

export function installedShiftLightCapability(partsXml = "") {
  return installedPartAttributes(partsXml)
    .some((part) => SHIFT_LIGHT_SLOT_IDS.has(partSlotId(part)));
}

export function installedGaugeControlsId(partsXml = "") {
  const gaugePart = installedPartAttributes(partsXml)
    .find((part) => GAUGE_GRAPHIC_SLOT_IDS.has(partSlotId(part)));
  const controlsId = Number(gaugePart?.di || gaugePart?.pdi || 0);

  return Number.isFinite(controlsId) && controlsId > 0 ? controlsId : 0;
}

function nitrousShotStrength(part) {
  const slotId = partSlotId(part);
  if (!NITROUS_SHOT_SLOT_IDS.has(slotId)) {
    return 0;
  }

  const text = `${part?.n || ""} ${part?.mn || ""}`;
  const match = text.match(/(\d+(?:\.\d+)?)\s*shot/i);
  if (match) {
    return Math.max(0, Number(match[1]) || 0);
  }

  return numberAttribute(part, "hp", 0);
}

function isNitrousShotPart(part) {
  return NITROUS_SHOT_SLOT_IDS.has(partSlotId(part));
}

function nitrousBottleCapacity(part) {
  const slotId = partSlotId(part);
  if (!NITROUS_BOTTLE_SLOT_IDS.has(slotId)) {
    return 0;
  }

  const text = `${part?.n || ""} ${part?.mn || ""}`.toLowerCase();
  const bottleCountMatch = text.match(/(\d+)\s*bottle/);
  const bottleCount = bottleCountMatch
    ? Math.max(1, Number(bottleCountMatch[1]) || 1)
    : text.includes("single")
      ? 1
      : 1;
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*lb/);
  const bottleSize = sizeMatch ? Math.max(0, Number(sizeMatch[1]) || 0) : 10;

  return Number((bottleCount * bottleSize).toFixed(3));
}

function installedNitrousSetup(installedParts) {
  const shotStrength = installedParts.reduce(
    (maxShot, part) => Math.max(maxShot, nitrousShotStrength(part)),
    0,
  );
  const tankSize = installedParts.reduce(
    (maxCapacity, part) => Math.max(maxCapacity, nitrousBottleCapacity(part)),
    0,
  );
  const availableShot = shotStrength > 0 && tankSize > 0 ? shotStrength : 0;
  const availableTank = availableShot > 0 ? tankSize : 0;

  return {
    nitrousShot: availableShot,
    nitrousRemaining: availableTank,
    nitrousTankSize: availableTank,
  };
}

function addSupportByCategory(installedParts, boostType = "N") {
  let airflowBonus = 0;
  let fuelBonus = 0;
  let tuneBonus = 0;

  for (const part of installedParts) {
    const slotId = partSlotId(part);
    const score = partPowerScore(part) * boostStaticPowerScale(part, boostType);
    const priceTier = Math.min(8, Math.max(0, Number(part.p || part.pp || 0) / 1000));

    if (AIRFLOW_SLOT_IDS.has(slotId)) {
      airflowBonus += 2 + score * 0.45 + priceTier;
    }
    if (FUEL_SLOT_IDS.has(slotId)) {
      fuelBonus += 3 + score * 0.5 + priceTier;
    }
    if (TUNE_SLOT_IDS.has(slotId) || airFuelMeterKind(part) === "controller") {
      tuneBonus += 1 + score * 0.25 + priceTier * 0.5;
    }
  }

  return {
    airflowBonus: Number(airflowBonus.toFixed(3)),
    fuelBonus: Number(fuelBonus.toFixed(3)),
    tuneBonus: Number(Math.min(12, tuneBonus).toFixed(3)),
  };
}

function boostAirDemand({ boostProfile, boostFlow }) {
  const maxPsi = Number(boostProfile?.maxPsi || 0);
  const boostSetting = Number(boostProfile?.boostSetting || 0);

  if (maxPsi <= 0 || boostSetting <= 0) {
    return 0;
  }

  return Number(((boostSetting / maxPsi) * boostFlow).toFixed(3));
}

function boostProfileWithSavedTune(boostProfile, targetCar, boostType) {
  const profile = { ...boostProfile };
  const savedBoost = Number(targetCar?.dynoBoostSetting ?? targetCar?.boostSetting ?? targetCar?.boostPsi);

  if (boostType !== "N" && Number.isFinite(savedBoost)) {
    const maxPsi = Math.max(0, Number(profile.maxPsi || 0));
    profile.boostSetting = Math.min(Math.max(0, savedBoost), maxPsi || savedBoost);
    profile.source = `${profile.source || "boost"}:saved`;
  }

  return profile;
}

function chipSettingForCar(targetCar, tuneBonus, installedParts) {
  const savedChipSetting = Number(
    targetCar?.dynoAirFuelSetting
      ?? targetCar?.chipSetting
      ?? targetCar?.airFuelSetting,
  );

  if (airFuelMeterCapabilityFromParts(installedParts) < 2) {
    return 0;
  }

  // Only apply a chip setting if the player has explicitly tuned it on the dyno.
  // Previously this defaulted to -5 which changed the graph shape and confused
  // players who hadn't touched the air/fuel controller yet.
  return Number.isFinite(savedChipSetting) ? savedChipSetting : 0;
}

function effectiveCompressionSetup({ catalogCar, enginePart, nonEngineParts }) {
  const engineCompression = partCompressionRatio(enginePart, DEFAULT_COMPRESSION_RATIO);
  const catalogCompression = Number(catalogCar?.compressionRatio || catalogCar?.compression || 0);
  let ratio = engineCompression || (
    Number.isFinite(catalogCompression) && catalogCompression > 0
      ? catalogCompression
      : DEFAULT_COMPRESSION_RATIO
  );

  for (const part of nonEngineParts) {
    const slotId = partSlotId(part);
    if (PISTON_SLOT_IDS.has(slotId)) {
      const pistonRatio = partCompressionRatio(part, ratio);
      if (pistonRatio > 0) {
        ratio = pistonRatio;
      }
    }
  }

  const delta = nonEngineParts.reduce((sum, part) => (
    COMPRESSION_DELTA_SLOT_IDS.has(partSlotId(part))
      ? sum + partCompressionDelta(part)
      : sum
  ), 0);
  ratio = clampNumber(ratio + delta, MIN_COMPRESSION_RATIO, MAX_COMPRESSION_RATIO);

  return {
    ratio: Number(ratio.toFixed(3)),
    level: Number((ratio - DEFAULT_COMPRESSION_RATIO).toFixed(3)),
    delta: Number(delta.toFixed(3)),
  };
}

function compressionPowerMultiplier({ compressionLevel, boostType, boostSetting }) {
  const level = Number(compressionLevel || 0);
  if (!Number.isFinite(level) || level === 0) {
    return 1;
  }

  if (boostType === "N") {
    return Number(clampNumber(1 + level * 0.025, 0.9, 1.12).toFixed(4));
  }

  const boost = Math.max(0, Number(boostSetting || 0));
  const lowCompressionSupport = Math.max(0, -level) * 0.018;
  const highCompressionPenalty = Math.max(0, level) * (0.012 + Math.min(boost, 40) * 0.0008);

  return Number(clampNumber(1 + lowCompressionSupport - highCompressionPenalty, 0.88, 1.08).toFixed(4));
}

function hasInstalledCompressionModifier(nonEngineParts) {
  return nonEngineParts.some((part) => {
    const slotId = partSlotId(part);

    if (PISTON_SLOT_IDS.has(slotId)) {
      return partCompressionRatio(part, DEFAULT_COMPRESSION_RATIO) !== DEFAULT_COMPRESSION_RATIO;
    }

    if (COMPRESSION_DELTA_SLOT_IDS.has(slotId)) {
      return partCompressionDelta(part) !== 0;
    }

    return false;
  });
}

export function calculateRacePerformance({ account, targetCar, catalogCar }) {
  const catalogCarId = Number(targetCar?.catalogCarId || targetCar?.ci || 0);
  const partAttrs = installedPartAttributes(targetCar?.partsXml || "");
  const enginePart = partAttrs.find((attrs) => partSlotId(attrs) === ENGINE_SLOT_ID);
  const nonEngineParts = partAttrs.filter((attrs) => partSlotId(attrs) !== ENGINE_SLOT_ID);
  const performanceParts = nonEngineParts.filter((attrs) => !isStockOemDefaultPart(attrs));
  const factoryStockEngine = isFactoryStockEnginePart(enginePart, catalogCarId);
  const stockEnginePowerScale = 1;
  const unscaledBaseHorsepower = numberAttribute(enginePart, "hp", Number(catalogCar?.horsepower || 170));
  const unscaledBaseTorque = numberAttribute(enginePart, "tq", Number(catalogCar?.torque || 150));
  const baseHorsepower = unscaledBaseHorsepower * stockEnginePowerScale;
  const baseTorque = unscaledBaseTorque * stockEnginePowerScale;
  const engineDescriptor = enginePart?.n || enginePart?.mn || catalogCar?.stockEngine || catalogCar?.engineFamily || "";
  const boostType = resolveBoostType({ targetCar, catalogCar, installedParts: partAttrs });
  const addedHorsepower = performanceParts.filter((attrs) => !isNitrousShotPart(attrs)).reduce(
    (sum, attrs) => sum + numberAttribute(attrs, "hp", 0) * boostStaticPowerScale(attrs, boostType),
    0,
  );
  const addedTorque = performanceParts.filter((attrs) => !isNitrousShotPart(attrs)).reduce(
    (sum, attrs) => sum + numberAttribute(attrs, "tq", 0) * boostStaticPowerScale(attrs, boostType),
    0,
  );
  const weightDelta = performanceParts.reduce((sum, attrs) => sum + numberAttribute(attrs, "wt", 0), 0);
  const rawHorsepower = Math.max(1, baseHorsepower + addedHorsepower);
  const rawTorque = Math.max(1, baseTorque + addedTorque);
  const weight = Math.max(1200, Number(catalogCar?.weight || 2800) + weightDelta);
  const redlineRpm = Math.max(4500, inferRedlineRpm(catalogCar, engineDescriptor));
  const revLimiterRpm = Math.max(redlineRpm + 100, Number(catalogCar?.revLimiterRpm || redlineRpm + 200));
  const boostProfile = boostProfileWithSavedTune(
    resolveBoostProfile({ boostType, catalogCar: { ...catalogCar, id: catalogCarId }, installedParts: partAttrs }),
    targetCar,
    boostType,
  );
  const compression = effectiveCompressionSetup({ catalogCar, enginePart, nonEngineParts: performanceParts });
  const compressionMultiplier = compressionPowerMultiplier({
    compressionLevel: compression.level,
    boostType,
    boostSetting: boostProfile.boostSetting,
  });
  const torqueCompressionMultiplier = Number((1 + (compressionMultiplier - 1) * 0.75).toFixed(4));
  const uncappedHorsepower = Math.max(1, Math.round(rawHorsepower * compressionMultiplier));
  const uncappedTorque = Math.max(1, Math.round(rawTorque * torqueCompressionMultiplier));

  // Determine effective engine family for HP cap (swap engine overrides chassis family)
  const effectiveEngineFamily = resolveEffectiveEngineFamily({ enginePart, engineDescriptor, catalogCar, factoryStockEngine });
  const horsepower = applyEngineFamilyHpCap(uncappedHorsepower, effectiveEngineFamily);
  // Scale torque proportionally if HP was capped
  const torque = uncappedHorsepower > 0 && horsepower < uncappedHorsepower
    ? Math.max(1, Math.round(uncappedTorque * (horsepower / uncappedHorsepower)))
    : uncappedTorque;
  const hpWasCapped = horsepower < uncappedHorsepower;
  const catalogHorsepower = Math.round(Number(catalogCar?.horsepower || 0));
  const catalogTorque = Math.round(Number(catalogCar?.torque || 0));
  const useCatalogTorqueCurve = Array.isArray(catalogCar?.torqueCurve)
    && catalogCar.torqueCurve.length > 0
    && factoryStockEngine
    && !hasInstalledCompressionModifier(performanceParts)
    && Math.abs(horsepower - catalogHorsepower) <= 5
    && Math.abs(torque - catalogTorque) <= 5;
  const xmlStockBoost = Number(boostProfile.xmlStockBoost ?? boostProfile.stockBoost ?? 0);
  const effectiveBoostSetting = boostType === "N"
    ? boostProfile.boostSetting
    : Number((Number(boostProfile.boostSetting || 0) * BOOST_EFFECT_SCALE).toFixed(3));
  const boostFlow = boostFlowFromPower(horsepower, boostProfile);
  const currentBoostAirDemand = boostAirDemand({
    boostProfile: { ...boostProfile, boostSetting: effectiveBoostSetting },
    boostFlow,
  });
  const baseEngineAirDemand = Number((Math.max(horsepower * 0.02859, currentBoostAirDemand) || 0).toFixed(3));
  const { airflowBonus, fuelBonus, tuneBonus } = addSupportByCategory(performanceParts, boostType);
  const chipSetting = chipSettingForCar(targetCar, tuneBonus, partAttrs);
  const clientAirflowTarget = Math.max(
    boostType === "N" ? boostFlow : boostFlow,
    currentBoostAirDemand,
    baseEngineAirDemand,
  );
  const overallAirFlowLimit = Number((
    clientAirflowTarget + Math.min(airflowBonus, clientAirflowTarget * 0.06)
  ).toFixed(3));
  const fuelFlowLimit = Number((Math.max(
    overallAirFlowLimit * 5.5,
    baseEngineAirDemand * 1.12,
  ) + Math.min(fuelBonus, overallAirFlowLimit * 0.4)).toFixed(3));
  const supportRatio = baseEngineAirDemand > 0 ? overallAirFlowLimit / baseEngineAirDemand : 1;
  const nitrousSetup = installedNitrousSetup(partAttrs);
  const tireStick = installedTireStick(partAttrs, targetCar);
  const gripCoefficient = raceGripCoefficient(tireStick);
  const tractionControl = hasTractionControl(partAttrs);
  const torqueCurve = useCatalogTorqueCurve
    ? catalogCar.torqueCurve.map(Number)
    : estimateTorqueCurve({
        horsepower,
        torque,
        redlineRpm,
        peakRpm: catalogCar?.peakRpm,
      });
  const defaultGearRatios = gearRatiosForCar(catalogCar);
  const gearRatios = savedGearRatiosForCar(targetCar, defaultGearRatios);

  return {
    accountId: Number(account?.id || 0),
    catalogCarId,
    partAttrs,
    horsepower,
    torque,
    factoryStockEngine,
    stockEnginePowerScale,
    unscaledBaseHorsepower,
    unscaledBaseTorque,
    rawHorsepower,
    rawTorque,
    compressionRatio: compression.ratio,
    compressionLevel: compression.level,
    compressionDelta: compression.delta,
    compressionMultiplier,
    torqueCompressionMultiplier,
    weight,
    redlineRpm,
    revLimiterRpm,
    boostType,
    boostSource: boostProfile.source,
    stockBoost: boostProfile.stockBoost,
    xmlStockBoost,
    boostSetting: boostProfile.boostSetting,
    effectiveBoostSetting,
    maxPsi: boostProfile.maxPsi,
    boostEffectScale: boostType === "N" ? 1 : BOOST_EFFECT_SCALE,
    boostFlow,
    runtimeHpi: runtimeHpi({ boostType }),
    airhpi: boostAirHpi(boostProfile, supportRatio),
    overallAirFlowLimit,
    fuelFlowLimit,
    chipSetting,
    airFuelMeterCapability: airFuelMeterCapabilityFromParts(partAttrs),
    airDemand: baseEngineAirDemand,
    airflowBonus,
    fuelBonus,
    tuneBonus,
    tirePartId: Number(targetCar?.tirePartId || 0),
    tireStick,
    gripCoefficient,
    tractionControl,
    torqueCurve,
    gearRatios,
    defaultGearRatios,
    ...nitrousSetup,
    cylinderCount: inferCylinderCount(catalogCar, engineDescriptor),
    effectiveEngineFamily,
    hpWasCapped,
    uncappedHorsepower,
  };
}
