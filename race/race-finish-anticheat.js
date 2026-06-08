import { getCatalogCar } from "../showroom/car-showroom.js";
import { calculateRacePerformance } from "./performance-model.js";
import {
  processReportMatchedTerms,
} from "../security/account-security-telemetry.js";

export const CLIENT_WIRE_METRIC_OFFSET = 1;
export const PERFECT_REACTION_TIME_SECONDS = 0.5;
const PERFECT_REACTION_TIME_SNAP_EPSILON = 0.0005;

export function snapPerfectReactionTime(value) {
  const reactionTime = Number(value);
  if (!Number.isFinite(reactionTime)) {
    return reactionTime;
  }

  if (
    reactionTime >= PERFECT_REACTION_TIME_SECONDS - PERFECT_REACTION_TIME_SNAP_EPSILON
    && reactionTime <= PERFECT_REACTION_TIME_SECONDS + PERFECT_REACTION_TIME_SNAP_EPSILON
  ) {
    return PERFECT_REACTION_TIME_SECONDS;
  }

  return Number(reactionTime.toFixed(3));
}

export function decodeLiveRaceReactionTime(value) {
  const wire = Number(value);
  if (!Number.isFinite(wire)) {
    return wire;
  }

  // Live rivals/KOTH send raw seconds (for example 0.500, 0.823, 1.142) without the +1 wire offset.
  return snapPerfectReactionTime(wire);
}

export function decodeClientWireMetric(value, offset = CLIENT_WIRE_METRIC_OFFSET) {
  const wire = Number(value);
  if (!Number.isFinite(wire)) {
    return wire;
  }

  return Number((wire - offset).toFixed(3));
}

export function decodeClientElapsedTime(value) {
  const wire = Number(value);
  if (!Number.isFinite(wire)) {
    return wire;
  }

  // Live rivals, KOTH, and tournaments send raw elapsed seconds on the wire.
  // Practice uses the same client physics clock, so do not subtract the +1
  // tournament RT offset here (that made live ET ~1 second faster than practice).
  return Number(wire.toFixed(3));
}

export function decodeClientReactionTime(value, offset = CLIENT_WIRE_METRIC_OFFSET) {
  const wire = Number(value);
  if (!Number.isFinite(wire)) {
    return wire;
  }

  // Tournament packets encode Math.floor(rt * 1000 + 1000) / 1000 (actual + 1).
  // Live rivals/KOTH often send raw seconds (~0.4-2.0) without that offset.
  // Only subtract the wire offset when the value clearly includes it.
  if (wire >= 1) {
    return snapPerfectReactionTime(wire - offset);
  }

  return snapPerfectReactionTime(wire);
}

export function parseRaceAnticheatEnforcement(value, fallback = "log") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["off", "log", "block"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

// Performance bounds are heuristic — allow this much slack before logging a warning.
const PERFORMANCE_ELAPSED_TIME_GRACE_SECONDS = 1.25;
const PERFORMANCE_TRAP_SPEED_GRACE_MPH = 8;

export function parseRaceFinishTrapSpeed(parts = [], fallback = 0) {
  const trapSpeed = Number(parts?.[2]);
  return Number.isFinite(trapSpeed) ? trapSpeed : fallback;
}

export function parseRaceFinishPacket(parts = []) {
  const packet = Array.isArray(parts) ? parts : [];
  return {
    wireElapsedTime: Number(packet[1]),
    trapSpeed: parseRaceFinishTrapSpeed(packet, 0),
    carData: String(packet[4] || ""),
    carMd5: String(packet[5] || ""),
    cpResult: String(packet[11] || ""),
    cwResult: String(packet[12] || ""),
    cwcResult: String(packet[13] || ""),
    cheatEngine: String(packet[16] || ""),
    processScan: String(packet[18] || ""),
    windowScan: String(packet[19] || ""),
    windowClassScan: String(packet[20] || ""),
  };
}

function finishScanTelemetry(packet = {}) {
  return {
    cp: String(packet.cpResult || packet.processScan || ""),
    cw: String(packet.cwResult || packet.windowScan || ""),
    cwc: String(packet.cwcResult || packet.windowClassScan || ""),
    ce: String(packet.cheatEngine || ""),
  };
}

export function evaluateFinishProcessSuspicion(packet = {}) {
  const telemetry = finishScanTelemetry(packet);
  const matchedTerms = processReportMatchedTerms(telemetry);
  // Race finishes should only foul on known cheat signatures. The generic
  // cheat-engine flag is too noisy on legitimate clients and was fouling races.
  const confirmedCheat = matchedTerms.length > 0;
  return {
    suspicious: confirmedCheat,
    confirmedCheat,
    matchedTerms,
    telemetry,
  };
}

export function estimateRacePerformanceBounds(performance = {}) {
  const horsepower = Math.max(1, Number(performance.horsepower || 0));
  const weight = Math.max(1200, Number(performance.weight || 2800));
  const powerToWeight = horsepower / weight;
  const nitrousBonus = Number(performance.nitrousShot || 0) > 0 ? 1.1 : 0;

  const estimatedMinElapsed = Math.max(
    6,
    14.5 - (11 * powerToWeight) - nitrousBonus,
  );
  const minElapsedTime = Number(Math.max(5.0, estimatedMinElapsed - 2.0).toFixed(3));
  const maxElapsedTime = 45;
  const maxTrapSpeed = Number(Math.min(
    225,
    72 + (150 * (powerToWeight ** 0.38)) + 18 + (nitrousBonus * 8),
  ).toFixed(2));

  return {
    horsepower,
    weight,
    powerToWeight,
    minElapsedTime,
    maxElapsedTime,
    maxTrapSpeed,
    nitrousBonus,
  };
}

export function buildRacePerformanceContext(account, targetCar) {
  if (!account || !targetCar) {
    return null;
  }

  const catalogCar = getCatalogCar(
    Number(targetCar.catalogCarId || targetCar.ci || 0),
  );
  if (!catalogCar) {
    return null;
  }

  const performance = calculateRacePerformance({
    account,
    targetCar,
    catalogCar,
  });

  return {
    performance,
    bounds: estimateRacePerformanceBounds(performance),
  };
}

export function evaluateRacePerformanceViolation({
  elapsedTime = 0,
  trapSpeed = 0,
  bounds = null,
} = {}) {
  if (!bounds) {
    return { violated: false, skipped: true, reason: "no-performance-bounds" };
  }

  const et = Number(elapsedTime);
  const trap = Number(trapSpeed);
  const issues = [];

  const elapsedThreshold = Number((bounds.minElapsedTime - PERFORMANCE_ELAPSED_TIME_GRACE_SECONDS).toFixed(3));
  if (Number.isFinite(et) && et > 0 && et < elapsedThreshold) {
    issues.push({
      reason: "impossible-elapsed-time",
      elapsedTime: et,
      minElapsedTime: bounds.minElapsedTime,
      elapsedThreshold,
      horsepower: bounds.horsepower,
      weight: bounds.weight,
    });
  }

  if (Number.isFinite(et) && et > bounds.maxElapsedTime) {
    issues.push({
      reason: "invalid-elapsed-time",
      elapsedTime: et,
      maxElapsedTime: bounds.maxElapsedTime,
    });
  }

  const trapSpeedThreshold = Number((bounds.maxTrapSpeed + PERFORMANCE_TRAP_SPEED_GRACE_MPH).toFixed(2));
  if (Number.isFinite(trap) && trap > trapSpeedThreshold) {
    issues.push({
      reason: "impossible-trap-speed",
      trapSpeed: trap,
      maxTrapSpeed: bounds.maxTrapSpeed,
      trapSpeedThreshold,
      horsepower: bounds.horsepower,
      weight: bounds.weight,
    });
  }

  if (!issues.length) {
    return { violated: false };
  }

  return {
    violated: true,
    reason: issues[0].reason,
    issues,
    bounds,
  };
}

export function evaluateRaceFinishAnticheat({
  parts = [],
  elapsedTime = 0,
  trapSpeed = 0,
  account = null,
  targetCar = null,
  enforcement = "log",
} = {}) {
  const mode = parseRaceAnticheatEnforcement(enforcement, "log");
  if (mode === "off") {
    return { ok: true, foul: false, skipped: true, reason: "enforcement-off" };
  }

  const packet = parseRaceFinishPacket(parts);
  const issues = [];

  const processCheck = evaluateFinishProcessSuspicion(packet);
  if (processCheck.confirmedCheat) {
    issues.push({
      reason: "suspicious-process-report",
      blocking: true,
      matchedTerms: processCheck.matchedTerms,
    });
  }

  const performanceContext = buildRacePerformanceContext(account, targetCar);
  const performanceCheck = evaluateRacePerformanceViolation({
    elapsedTime,
    trapSpeed,
    bounds: performanceContext?.bounds || null,
  });
  if (performanceCheck.violated) {
    issues.push({
      reason: performanceCheck.reason,
      blocking: false,
      details: performanceCheck.issues || [],
      bounds: performanceCheck.bounds || null,
    });
  }

  if (!issues.length) {
    return {
      ok: true,
      foul: false,
      packet,
      performance: performanceContext?.performance || null,
      bounds: performanceContext?.bounds || null,
    };
  }

  const blockingIssues = issues.filter((issue) => issue.blocking);
  const shouldFoul = mode === "block" && blockingIssues.length > 0;
  const shouldLog = mode !== "off";

  const result = {
    ok: !shouldFoul,
    foul: shouldFoul,
    logged: shouldLog,
    reason: (blockingIssues[0] || issues[0]).reason,
    issues,
    blockingIssues,
    packet,
    processCheck,
    performance: performanceContext?.performance || null,
    bounds: performanceContext?.bounds || null,
  };

  if (!shouldFoul) {
    return {
      ...result,
      ok: true,
      foul: false,
    };
  }

  return result;
}
