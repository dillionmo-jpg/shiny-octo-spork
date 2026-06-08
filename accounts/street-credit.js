export const DEFAULT_STREET_CREDIT = 0;

// --- Base SC rewards by race type ---
const BASE_REWARDS = Object.freeze({
  friendly: Object.freeze({ winnerReward: 8, loserPenalty: 2 }),
  cash: Object.freeze({ winnerReward: 25, loserPenalty: 6 }),
  pinks: Object.freeze({ winnerReward: 80, loserPenalty: 20 }),
});

// Legacy exports for compatibility
export const RACE_STREET_CREDIT_BIG_MONEY_WAGER = 100000;
export const RACE_STREET_CREDIT_REWARDS = BASE_REWARDS;
export const RACE_STREET_CREDIT_WIN_REWARD = BASE_REWARDS.pinks.winnerReward;
export const RACE_STREET_CREDIT_LOSS_PENALTY = BASE_REWARDS.pinks.loserPenalty;

// --- Wager scaling ---
// SC scales with the wager amount: higher bets = more SC at stake
function wagerMultiplier(wager) {
  const amount = Math.max(0, Number(wager) || 0);
  if (amount <= 0) return 1;
  if (amount < 5000) return 1;
  if (amount < 20000) return 1.25;
  if (amount < 50000) return 1.5;
  if (amount < 100000) return 2;
  if (amount < 250000) return 2.5;
  return 3;
}

// --- Spectator scaling ---
// More spectators = more SC (the crowd amplifies reputation)
function spectatorMultiplier(spectatorCount) {
  const count = Math.max(0, Math.floor(Number(spectatorCount) || 0));
  if (count <= 1) return 1;
  if (count <= 3) return 1.15;
  if (count <= 6) return 1.3;
  if (count <= 10) return 1.5;
  if (count <= 20) return 1.75;
  return 2;
}

// --- Cheer/Boo scaling ---
// Net positive cheers boost the winner's gain; net boos boost the loser's penalty
function cheerMultiplier(cheers, boos) {
  const netCheers = Math.max(0, (Number(cheers) || 0) - (Number(boos) || 0));
  if (netCheers <= 0) return 1;
  if (netCheers <= 2) return 1.1;
  if (netCheers <= 5) return 1.25;
  return 1.4;
}

function booMultiplier(cheers, boos) {
  const netBoos = Math.max(0, (Number(boos) || 0) - (Number(cheers) || 0));
  if (netBoos <= 0) return 1;
  if (netBoos <= 2) return 1.1;
  if (netBoos <= 5) return 1.25;
  return 1.4;
}

// --- SC Gap scaling ---
// Beating someone with higher SC gives bonus; beating someone much lower gives less
function scGapMultiplier(winnerSc, loserSc) {
  const gap = (Number(loserSc) || 0) - (Number(winnerSc) || 0);
  // Positive gap = winner had less SC (underdog win) — big bonus
  if (gap >= 5000) return 4;
  if (gap >= 2000) return 3;
  if (gap >= 1000) return 2.5;
  if (gap >= 500) return 2;
  if (gap >= 200) return 1.5;
  if (gap >= 0) return 1;
  // Negative gap = winner had more SC (expected win, less reward)
  if (gap >= -200) return 0.9;
  if (gap >= -500) return 0.8;
  if (gap >= -1000) return 0.65;
  if (gap >= -2000) return 0.5;
  return 0.4;
}

function scGapLossPenaltyMultiplier(winnerSc, loserSc) {
  const gap = (Number(winnerSc) || 0) - (Number(loserSc) || 0);
  // Positive gap = loser lost to someone much higher (less penalty)
  if (gap >= 2000) return 0.5;
  if (gap >= 1000) return 0.65;
  if (gap >= 500) return 0.8;
  if (gap >= 0) return 1;
  // Negative gap = loser lost to someone lower (more penalty)
  if (gap >= -500) return 1.1;
  if (gap >= -1000) return 1.25;
  if (gap >= -2000) return 1.5;
  return 1.75;
}

/**
 * Calculate scaled SC reward/penalty for a race.
 *
 * @param {object} options
 * @param {number} options.wager - Money wagered
 * @param {boolean} options.pinkSlip - Pink slip race
 * @param {number} options.spectatorCount - Number of spectators watching
 * @param {number} options.cheers - Cheer votes for the winner
 * @param {number} options.boos - Boo votes against the loser
 * @param {number} options.winnerSc - Winner's current SC
 * @param {number} options.loserSc - Loser's current SC
 */
export function raceStreetCreditRewardForStake({
  wager = 0,
  pinkSlip = false,
  spectatorCount = 0,
  cheers = 0,
  boos = 0,
  winnerSc = 0,
  loserSc = 0,
} = {}) {
  // Determine base reward tier
  let base;
  if (pinkSlip) {
    base = BASE_REWARDS.pinks;
  } else if (Number(wager) > 0) {
    base = BASE_REWARDS.cash;
  } else {
    base = BASE_REWARDS.friendly;
  }

  // Apply multipliers
  const wagerMult = wagerMultiplier(wager);
  const specMult = spectatorMultiplier(spectatorCount);
  const cheerMult = cheerMultiplier(cheers, boos);
  const booMult = booMultiplier(cheers, boos);
  const scGapWinMult = scGapMultiplier(winnerSc, loserSc);
  const scGapLossMult = scGapLossPenaltyMultiplier(winnerSc, loserSc);

  const winnerReward = Math.min(500, Math.max(1, Math.round(
    base.winnerReward * wagerMult * specMult * cheerMult * scGapWinMult
  )));
  const loserPenalty = Math.min(250, Math.max(1, Math.round(
    base.loserPenalty * wagerMult * specMult * booMult * scGapLossMult
  )));

  return { winnerReward, loserPenalty };
}

// --- Rank levels ---

function divideStreetCreditStages(minInclusive, maxExclusive, stageCount = 4) {
  const min = Math.max(0, Math.floor(Number(minInclusive) || 0));
  const max = Math.max(min + 1, Math.floor(Number(maxExclusive) || 0));
  const span = max - min;

  return Object.freeze(Array.from({ length: stageCount }, (_, index) => (
    min + Math.ceil((span * (index + 1)) / stageCount)
  )));
}

export const STREET_CREDIT_LEVELS = Object.freeze([
  {
    id: "Noob",
    name: "Noob",
    sc: 100,
    color: "777777",
    stages: divideStreetCreditStages(0, 100),
  },
  {
    id: "Novice",
    name: "Novice",
    sc: 1000,
    color: "66CCFF",
    stages: divideStreetCreditStages(100, 1000),
  },
  {
    id: "Rookie",
    name: "Rookie",
    sc: 2000,
    color: "00CC00",
    stages: divideStreetCreditStages(1000, 2000),
  },
  {
    id: "Pro",
    name: "Pro",
    sc: 5000,
    color: "FFD700",
    stages: divideStreetCreditStages(2000, 5000),
  },
  {
    id: "Champion",
    name: "Champion",
    sc: 10000,
    color: "FF0000",
    stages: divideStreetCreditStages(5000, 10000),
  },
  {
    id: "Legend",
    name: "Legend",
    sc: 999999999,
    color: "FF0000",
    stages: divideStreetCreditStages(10000, 100000),
  },
]);

// --- Utility functions ---

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

export function normalizeStreetCredit(value, fallback = DEFAULT_STREET_CREDIT) {
  const number = Number(value);
  if (Number.isFinite(number) && number >= 0) {
    return Math.floor(number);
  }

  return Math.max(0, Math.floor(Number(fallback) || DEFAULT_STREET_CREDIT));
}

export function accountStreetCredit(account, fallback = DEFAULT_STREET_CREDIT) {
  return normalizeStreetCredit(account?.streetCredit ?? account?.sc, fallback);
}

export function streetCreditLevelForValue(value) {
  const streetCredit = normalizeStreetCredit(value);
  return STREET_CREDIT_LEVELS.find((level) => streetCredit < Number(level.sc || 0)) || STREET_CREDIT_LEVELS.at(-1);
}

export function streetCreditRankName(value) {
  const level = streetCreditLevelForValue(value);
  return level?.name || level?.id || "";
}

export function streetCreditLeaderboardFlag(value) {
  const streetCredit = normalizeStreetCredit(value);
  let flag = 0;

  for (const level of STREET_CREDIT_LEVELS) {
    for (const stageThreshold of level.stages) {
      if (streetCredit < stageThreshold) {
        return flag;
      }
      flag += 1;
    }
  }

  return Math.max(0, flag - 1);
}

export function buildStreetCreditLevelNodesXml() {
  return STREET_CREDIT_LEVELS
    .map((level) => {
      const rankName = level.name || level.id;
      const stages = level.stages.map((stage, index) => renderNode("x", {
        sc: stage,
        id: `Stage ${index + 1}`,
        n: rankName,
        r: rankName,
        rank: rankName,
        level: rankName,
        stage: index + 1,
      })).join("");

      return renderNode("x", {
        sc: level.sc,
        id: level.id,
        n: rankName,
        r: rankName,
        rank: rankName,
        level: rankName,
        c: level.color,
      }, stages);
    })
    .join("");
}

export function buildStreetCreditLevelsXml() {
  return renderNode("s", {}, buildStreetCreditLevelNodesXml());
}

export function buildStreetCreditLevelsBootstrapNode() {
  const levelsXml = buildStreetCreditLevelNodesXml();

  return [
    renderNode("n", { id: "sclevels" }, levelsXml),
    renderNode("n", { id: "scLevels" }, levelsXml),
  ].join("");
}
