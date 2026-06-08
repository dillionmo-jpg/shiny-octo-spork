const TRACK_FEET = 1320;
const DEFAULT_PHYSICS_HZ = 120;
const DEFAULT_DISPLAY_HZ = 75;
const DEFAULT_DURATION_SECONDS = 2;
const MAX_DURATION_SECONDS = 30;
const MAX_HZ = 480;
const MAX_VARIANCE_MS = 8;

const DEFAULT_INPUTS = Object.freeze([
  { tick: 0, type: "launch" },
]);

function boundedNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBuild(build = {}) {
  return {
    horsepower: Math.round(boundedNumber(build.horsepower ?? build.hp, 450, 50, 2500)),
    weight: Math.round(boundedNumber(build.weight, 2800, 800, 6000)),
    grip: round(boundedNumber(build.grip ?? build.gripCoefficient, 1, 0.5, 1.5), 3),
    tractionControl: round(boundedNumber(build.tractionControl, 0, 0, 1), 3),
    boostType: String(build.boostType || "").trim().toLowerCase(),
    nitrous: build.nitrous === true || build.nitrous === "true" || build.nitrous === "1" || build.nitrous === 1,
    damage: round(boundedNumber(build.damage, 0, 0, 1), 3),
  };
}

function stableHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicUnit(seed, build) {
  const signature = [
    seed,
    build.horsepower,
    build.weight,
    build.grip,
    build.tractionControl,
    build.boostType,
    build.nitrous ? 1 : 0,
    build.damage,
  ].join("|");
  return stableHash(signature) / 0xffffffff;
}

function buildTimingVariance({ seed = "dev-replay", build = {} } = {}) {
  const normalizedBuild = normalizeBuild(build);
  const hpPerPound = normalizedBuild.horsepower / normalizedBuild.weight;
  const powerRisk = Math.max(0, hpPerPound - 0.18) * 8;
  const gripRisk = Math.max(0, 1 - normalizedBuild.grip) * 4;
  const tractionRelief = normalizedBuild.tractionControl * 1.5;
  const boostRisk = normalizedBuild.boostType ? 0.8 : 0;
  const nitrousRisk = normalizedBuild.nitrous ? 0.7 : 0;
  const damageRisk = normalizedBuild.damage * 5;
  const rawMaxMs = 0.75 + powerRisk + gripRisk + boostRisk + nitrousRisk + damageRisk - tractionRelief;
  const maxMs = round(clamp(rawMaxMs, 0, MAX_VARIANCE_MS), 3);
  const appliedMs = round(deterministicUnit(seed, normalizedBuild) * maxMs, 3);

  return {
    seed: String(seed || "dev-replay"),
    mode: "positive",
    maxMs,
    appliedMs,
    build: normalizedBuild,
    factors: {
      hpPerPound: round(hpPerPound, 4),
      powerRisk: round(powerRisk, 3),
      gripRisk: round(gripRisk, 3),
      tractionRelief: round(tractionRelief, 3),
      boostRisk: round(boostRisk, 3),
      nitrousRisk: round(nitrousRisk, 3),
      damageRisk: round(damageRisk, 3),
    },
  };
}

function normalizeInputs(inputs, physicsHz) {
  const source = Array.isArray(inputs) && inputs.length > 0 ? inputs : DEFAULT_INPUTS;
  return source
    .map((input) => ({
      tick: Number.isFinite(Number(input?.tick))
        ? Math.max(0, Math.round(Number(input.tick)))
        : Math.max(0, Math.round(Number(input?.t || 0) * physicsHz)),
      type: String(input?.type || "").trim(),
      gear: Number(input?.gear || 0),
      on: Boolean(input?.on),
    }))
    .filter((input) => input.type)
    .sort((left, right) => left.tick - right.tick);
}

function accelerationFor(state) {
  const gearMult = [0, 1, 0.82, 0.68, 0.54, 0.44][state.gear] || 0.44;
  const aero = 0.00165 * state.velocity * state.velocity;
  const nos = state.nos ? 4.8 : 0;
  const launchGrip = state.time < 0.65 ? 0.78 + state.time * 0.32 : 1;
  return Math.max(1.2, (43 * gearMult + nos) * launchGrip - aero);
}

function applyInput(state, input) {
  if (input.type === "launch") {
    state.launched = true;
  } else if (input.type === "shift" && input.gear > 0) {
    state.gear = input.gear;
  } else if (input.type === "nos") {
    state.nos = input.on;
  }
}

function displayFrameAt(time, physicsSamples, displayIndex) {
  const lastSample = physicsSamples.at(-1);
  if (time >= lastSample.time) {
    return {
      frame: displayIndex,
      time: round(lastSample.time, 6),
      sourceTick: lastSample.tick,
      nextTick: lastSample.tick,
      physicsAlpha: 0,
      interpolated: false,
      distance: lastSample.distance,
      velocity: lastSample.velocity,
    };
  }

  const sourceIndex = Math.max(0, Math.min(physicsSamples.length - 2, Math.floor(time / (physicsSamples[1].time || 1))));
  const current = physicsSamples[sourceIndex];
  const next = physicsSamples[sourceIndex + 1];
  const span = Math.max(0.000001, next.time - current.time);
  const alpha = Math.max(0, Math.min(1, (time - current.time) / span));

  return {
    frame: displayIndex,
    time: round(time, 6),
    sourceTick: current.tick,
    nextTick: next.tick,
    physicsAlpha: round(alpha, 3),
    interpolated: alpha > 0 && alpha < 1,
    distance: round(current.distance + (next.distance - current.distance) * alpha, 6),
    velocity: round(current.velocity + (next.velocity - current.velocity) * alpha, 6),
  };
}

export function buildDevRaceReplay({
  physicsHz = DEFAULT_PHYSICS_HZ,
  displayHz = DEFAULT_DISPLAY_HZ,
  durationSeconds = DEFAULT_DURATION_SECONDS,
  inputs = DEFAULT_INPUTS,
  seed = "dev-replay",
  build = {},
} = {}) {
  const safePhysicsHz = Math.round(boundedNumber(physicsHz, DEFAULT_PHYSICS_HZ, 1, MAX_HZ));
  const safeDisplayHz = Math.round(boundedNumber(displayHz, DEFAULT_DISPLAY_HZ, 1, MAX_HZ));
  const safeDurationSeconds = boundedNumber(durationSeconds, DEFAULT_DURATION_SECONDS, 0.1, MAX_DURATION_SECONDS);
  const physicsStep = 1 / safePhysicsHz;
  const displayStep = 1 / safeDisplayHz;
  const physicsTicks = Math.round(safeDurationSeconds * safePhysicsHz);
  const displayTicks = Math.round(safeDurationSeconds * safeDisplayHz);
  const normalizedInputs = normalizeInputs(inputs, safePhysicsHz);
  const state = {
    time: 0,
    distance: 0,
    velocity: 0,
    gear: 1,
    nos: false,
    launched: false,
  };
  const physicsSamples = [];
  let inputIndex = 0;
  let baseEt = null;

  for (let tick = 0; tick <= physicsTicks; tick += 1) {
    while (inputIndex < normalizedInputs.length && normalizedInputs[inputIndex].tick <= tick) {
      applyInput(state, normalizedInputs[inputIndex]);
      inputIndex += 1;
    }

    physicsSamples.push({
      tick,
      time: round(state.time, 6),
      distance: round(state.distance, 6),
      velocity: round(state.velocity, 6),
      gear: state.gear,
      nos: state.nos,
    });

    if (tick >= physicsTicks) {
      break;
    }

    const acceleration = state.launched ? accelerationFor(state) : 0;
    const previousDistance = state.distance;
    const previousTime = state.time;
    state.velocity += acceleration * physicsStep;
    const nextDistance = state.distance + state.velocity * physicsStep;
    if (baseEt === null && nextDistance >= TRACK_FEET) {
      const distanceSpan = Math.max(0.000001, nextDistance - previousDistance);
      const finishAlpha = clamp((TRACK_FEET - previousDistance) / distanceSpan, 0, 1);
      baseEt = previousTime + physicsStep * finishAlpha;
    }
    state.distance = Math.min(TRACK_FEET, nextDistance);
    state.time += physicsStep;
  }

  const displayFrames = [];
  for (let frame = 0; frame <= displayTicks; frame += 1) {
    displayFrames.push(displayFrameAt(frame * displayStep, physicsSamples, frame));
  }

  const variance = buildTimingVariance({ seed, build });
  const roundedBaseEt = baseEt === null ? null : round(baseEt, 6);
  const finalEt = roundedBaseEt === null
    ? null
    : Number((roundedBaseEt + variance.appliedMs / 1000).toFixed(3));

  return {
    physicsHz: safePhysicsHz,
    displayHz: safeDisplayHz,
    physicsStepMs: round(1000 / safePhysicsHz, 3),
    displayStepMs: round(1000 / safeDisplayHz, 3),
    durationSeconds: round(safeDurationSeconds, 3),
    inputs: normalizedInputs,
    timing: {
      baseEt: roundedBaseEt,
      finalEt,
    },
    variance,
    physicsSamples,
    displayFrames,
  };
}
