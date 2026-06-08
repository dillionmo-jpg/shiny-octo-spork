export const ENGINE_DAMAGE_COMPONENTS = Object.freeze([
  "piston",
  "rod",
  "valve",
  "headGasket",
  "engineBlock",
  "oil",
  "oilFilter",
  "coolant",
]);

const RACE_DAMAGE_METRIC_MAP = Object.freeze({
  piston: "pistonDamage",
  rod: "rodDamage",
  valve: "valveDamage",
  headGasket: "headGasketDamage",
  engineBlock: "engineBlockDamage",
  oil: "oilDamage",
  oilFilter: "oilFilterDamage",
  coolant: "coolantDamage",
  nitrousRemaining: "nitrousRemaining",
  raceGas: "raceGas",
});

function boundedEngineStateNumber(value, fallback = 0, { min = 0, max = 100 } = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  const bounded = Math.min(max, Math.max(min, numericValue));
  return Number(bounded.toFixed(3));
}

export function formatEngineStateValue(value, fallback = 0) {
  const rounded = boundedEngineStateNumber(value, fallback);
  return String(Number.isInteger(rounded) ? rounded : Number(rounded.toFixed(3)));
}

export function normalizeEngineDamageState(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const state = {};
  for (const key of [...ENGINE_DAMAGE_COMPONENTS, "nitrousRemaining", "raceGas"]) {
    const fallback = key === "nitrousRemaining" ? 100 : 0;
    state[key] = boundedEngineStateNumber(source[key], fallback);
  }
  return state;
}

export function buildEngineDamageStateFromRaceMetrics(metrics = {}) {
  const state = {};
  for (const [damageKey, metricKey] of Object.entries(RACE_DAMAGE_METRIC_MAP)) {
    const fallback = damageKey === "nitrousRemaining" ? 100 : 0;
    state[damageKey] = boundedEngineStateNumber(metrics?.[metricKey], fallback);
  }
  return state;
}

export function resetEngineDamageState(damageState = {}, damageKeys = []) {
  const normalized = normalizeEngineDamageState(damageState);
  for (const key of damageKeys) {
    if (Object.hasOwn(normalized, key)) {
      normalized[key] = key === "nitrousRemaining" ? 100 : 0;
    }
  }
  return normalized;
}

export function mergeEngineDamageState(existingDamage = {}, incomingDamage = {}) {
  return {
    ...normalizeEngineDamageState(existingDamage),
    ...normalizeEngineDamageState(incomingDamage),
  };
}

const MECHANICAL_DAMAGE_KEYS = Object.freeze([
  ...ENGINE_DAMAGE_COMPONENTS,
]);

export function clientReportedMechanicalEngineDamage(damageState = {}) {
  const normalized = normalizeEngineDamageState(damageState);
  return MECHANICAL_DAMAGE_KEYS.some((key) => Number(normalized[key] || 0) > 0);
}

export function normalizeStoredNitrousPercent(value, tankSize = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 100;
  }

  if (numericValue <= 100) {
    return boundedEngineStateNumber(numericValue, 100);
  }

  const numericTankSize = Number(tankSize);
  if (Number.isFinite(numericTankSize) && numericTankSize > 0) {
    return boundedEngineStateNumber((numericValue / numericTankSize) * 100, 100);
  }

  return 100;
}

export function resolveNitrousRemainingMass({
  storedValue,
  tankSize = 0,
  fallbackMass = 0,
} = {}) {
  const numericTankSize = Number(tankSize);
  if (!Number.isFinite(numericTankSize) || numericTankSize <= 0) {
    return 0;
  }

  const numericStored = Number(storedValue);
  if (!Number.isFinite(numericStored)) {
    return Number(Number(fallbackMass || 0).toFixed(3));
  }

  if (numericStored <= 100) {
    return Number((numericTankSize * (numericStored / 100)).toFixed(3));
  }

  return Number(Math.min(numericTankSize, numericStored).toFixed(3));
}

export function applyRaceEngineDamageState(
  existingDamage = {},
  incomingDamage = {},
  { accumulateMechanical = false, nitrousTankSize = 0 } = {},
) {
  const existing = normalizeEngineDamageState(existingDamage);
  const incoming = normalizeEngineDamageState(incomingDamage);
  const next = { ...existing };

  for (const key of MECHANICAL_DAMAGE_KEYS) {
    if (!(key in incoming)) {
      continue;
    }

    next[key] = accumulateMechanical
      ? boundedEngineStateNumber(Number(existing[key] || 0) + Number(incoming[key] || 0), 0)
      : incoming[key];
  }

  if (Object.hasOwn(incomingDamage, "nitrousRemaining")) {
    next.nitrousRemaining = normalizeStoredNitrousPercent(
      incoming.nitrousRemaining,
      nitrousTankSize,
    );
  }

  if (Object.hasOwn(incomingDamage, "raceGas")) {
    next.raceGas = incoming.raceGas;
  }

  return next;
}
