import { readFileSync } from "node:fs";

import { installedPartAttributes } from "./performance-model.js";

const ENGINE_DURABILITY_CATALOG = JSON.parse(
  readFileSync(new URL("./engine-durability-catalog.json", import.meta.url), "utf8"),
);

const DURABILITY_KEYS = [
  "piston",
  "rod",
  "valve",
  "headGasket",
  "engineBlock",
  "oil",
  "oilFilter",
  "radiator",
  "coolant",
];

function clampDurability(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Number(numericValue.toFixed(3))));
}

function partSlotId(part) {
  return String(Number(part?.ci || part?.pi || part?.categoryId || 0));
}

function partIds(part) {
  return [part?.i, part?.di, part?.pdi, part?.partId, part?.id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function applyDurabilityValues(profile, values, { override = false } = {}) {
  if (!values || typeof values !== "object") {
    return;
  }

  for (const key of DURABILITY_KEYS) {
    if (!(key in values)) {
      continue;
    }

    const durability = clampDurability(values[key]);
    profile[key] = override ? durability : Math.max(profile[key] ?? 0, durability);
  }
}

export function deriveEngineDurabilityProfile({ partsXml = "", damageState = {} } = {}) {
  const profile = {};
  applyDurabilityValues(profile, ENGINE_DURABILITY_CATALOG.base || {}, { override: true });

  for (const part of installedPartAttributes(partsXml)) {
    applyDurabilityValues(profile, ENGINE_DURABILITY_CATALOG.categories?.[partSlotId(part)]);

    for (const id of partIds(part)) {
      applyDurabilityValues(profile, ENGINE_DURABILITY_CATALOG.partIds?.[id], { override: true });
    }
  }

  for (const key of DURABILITY_KEYS) {
    profile[key] = clampDurability((profile[key] ?? 0) - Number(damageState?.[key] || 0));
  }

  return profile;
}
