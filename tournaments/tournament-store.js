import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const STORE_VERSION = 1;
const DEFAULT_TOURNAMENT_ID = 1;
const CENTRAL_TIME_ZONE = "America/Chicago";
const CPU_TOURNAMENT_ACCOUNT_BASE = 900000;
const CPU_TOURNAMENT_CAR_BASE = 6100;
const MAX_BRACKET_DIAL_IN_SECONDS = 20;
const storeMutationQueues = new Map();
const CPU_TOURNAMENT_NAMES = Object.freeze([
  "Apex Annie",
  "Boost Benny",
  "Clutch Carla",
  "Dialed Dan",
  "Elapsed Eddie",
  "Final Felicia",
  "Grid Greg",
  "Holeshot Hana",
  "Index Ivan",
  "Juiced Jules",
  "Launch Lenny",
  "Nitrous Nina",
  "Piston Pete",
  "Quarter Quinn",
  "Reaction Rex",
  "Shift Shelby",
  "Staged Stacy",
  "Torque Tony",
  "Tree Trina",
  "Wheels Wade",
  "Bracket Blake",
  "Cam Casey",
  "Gear Gia",
  "Lane Luis",
  "Pedal Piper",
  "Slip Sam",
  "Track Tori",
  "Valve Vince",
  "Winner Wes",
  "Yellow Yara",
  "Zero Zoe",
  "Finish Finn",
]);

function defaultTournament(now = new Date()) {
  const startTime = new Date(now.getTime() + 5 * 60 * 1000);

  return {
    id: DEFAULT_TOURNAMENT_ID,
    name: "Local Test Tournament",
    status: "qualifying",
    bracketSize: 32,
    entryFee: 0,
    prizeMoney: 50000,
    prizePoints: 0,
    trackLength: 1320,
    startsAt: startTime.toISOString(),
    entrants: 32,
    qualifyingResults: 12,
    readyAccountIds: 32,
    updatedAt: now.toISOString(),
  };
}

function emptyStore() {
  return {
    version: STORE_VERSION,
    tournaments: [defaultTournament()],
  };
}

function escapeXmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeMoney(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function normalizeTournamentNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function centralDisplayEpochSeconds(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(Number(value) || Date.now());
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Math.floor(Date.UTC(
    Number(byType.year),
    Number(byType.month) - 1,
    Number(byType.day),
    Number(byType.hour),
    Number(byType.minute),
    Number(byType.second),
  ) / 1000);
}

function normalizeTournamentRuntimeFields(tournament) {
  tournament.entrants = Array.isArray(tournament.entrants) ? tournament.entrants : [];
  tournament.qualifyingResults = Array.isArray(tournament.qualifyingResults) ? tournament.qualifyingResults : [];
  tournament.readyAccountIds = Array.isArray(tournament.readyAccountIds) ? tournament.readyAccountIds : [];
  tournament.bracketResults = Array.isArray(tournament.bracketResults) ? tournament.bracketResults : [];
  return tournament;
}

function tournamentBracketDialIn(tournament) {
  const dialFlag = Number(tournament?.bracketDialIn || 0);
  return Number.isFinite(dialFlag) && dialFlag > 0;
}

function normalizeBracketTime(value, fallback = 0) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return Math.min(Number(numericValue.toFixed(3)), MAX_BRACKET_DIAL_IN_SECONDS);
  }

  const fallbackValue = Number(fallback);
  return Number.isFinite(fallbackValue) && fallbackValue > 0
    ? Math.min(Number(fallbackValue.toFixed(3)), MAX_BRACKET_DIAL_IN_SECONDS)
    : 0;
}

function tournamentStartsAtEpochSeconds(tournament) {
  const explicitEpoch = normalizeTournamentNumber(tournament?.startsAtEpoch, 0);
  if (explicitEpoch > 0) {
    return explicitEpoch;
  }

  const numericStartsAt = normalizeTournamentNumber(tournament?.startsAt, 0);
  if (numericStartsAt > 0 && numericStartsAt < 1_000_000_000_000) {
    return numericStartsAt;
  }

  const parsed = Date.parse(String(tournament?.startsAt || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function scheduledInstanceStartsAtEpoch(defaults) {
  const explicitEpoch = normalizeTournamentNumber(defaults?.startsAtEpoch, 0);
  if (explicitEpoch > 0) {
    return explicitEpoch;
  }

  const numericStartsAt = normalizeTournamentNumber(defaults?.startsAt, 0);
  if (numericStartsAt > 0 && numericStartsAt < 1_000_000_000_000) {
    return numericStartsAt;
  }

  const parsed = Date.parse(String(defaults?.startsAt || ""));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function shouldResetTournamentInstance(tournament, defaults) {
  if (!defaults || typeof defaults !== "object") {
    return false;
  }

  const incomingStartsAt = scheduledInstanceStartsAtEpoch(defaults);
  if (!incomingStartsAt) {
    return false;
  }

  const existingStartsAt = tournamentStartsAtEpochSeconds(tournament);
  if (!existingStartsAt) {
    return false;
  }

  if (incomingStartsAt !== existingStartsAt) {
    return true;
  }

  const status = String(tournament.status || "").toLowerCase();
  return status === "completed" || Boolean(tournament.completedAt);
}

function resetTournamentRuntimeState(tournament, defaults = {}) {
  Object.assign(tournament, defaults, {
    entrants: [],
    qualifyingResults: [],
    readyAccountIds: [],
    bracketResults: [],
    championAccountId: 0,
    runnerUpAccountId: 0,
    completedAt: null,
    updatedAt: new Date().toISOString(),
  });
}

function tournamentById(store, tournamentId = DEFAULT_TOURNAMENT_ID, defaults = null) {
  const id = Number(tournamentId || DEFAULT_TOURNAMENT_ID);
  let tournament = store.tournaments.find((item) => Number(item.id || 0) === id);

  if (!tournament) {
    tournament = {
      ...defaultTournament(),
      ...(defaults && typeof defaults === "object" ? defaults : {}),
      id,
    };
    store.tournaments.push(tournament);
  } else if (defaults && typeof defaults === "object") {
    if (shouldResetTournamentInstance(tournament, defaults)) {
      resetTournamentRuntimeState(tournament, defaults);
    } else {
      Object.assign(tournament, {
        ...defaults,
        entrants: tournament.entrants,
        qualifyingResults: tournament.qualifyingResults,
        readyAccountIds: tournament.readyAccountIds,
        bracketResults: tournament.bracketResults,
        updatedAt: tournament.updatedAt,
      });
    }
  }

  return normalizeTournamentRuntimeFields(tournament);
}

async function readStore(filePath) {
  try {
    const parsed = parseStoreContent(await readFile(filePath, "utf8"));
    parsed.version = Number(parsed.version || STORE_VERSION);
    parsed.tournaments = Array.isArray(parsed.tournaments) && parsed.tournaments.length > 0
      ? parsed.tournaments
      : [defaultTournament()];

    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return emptyStore();
    }

    throw error;
  }
}

function parseStoreContent(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    const trailingJsonMatch = String(error?.message || "").match(/after JSON at position (\d+)/);
    if (!trailingJsonMatch) {
      throw error;
    }

    return JSON.parse(content.slice(0, Number(trailingJsonMatch[1])));
  }
}

async function writeStore(filePath, store) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

async function mutateStore(filePath, mutator) {
  const previous = storeMutationQueues.get(filePath) || Promise.resolve();
  const current = previous.catch(() => {}).then(async () => {
    const store = await readStore(filePath);
    const result = await mutator(store);
    await writeStore(filePath, store);
    return result;
  });

  storeMutationQueues.set(filePath, current.catch(() => {}));

  try {
    return await current;
  } finally {
    if (storeMutationQueues.get(filePath) === current) {
      storeMutationQueues.delete(filePath);
    }
  }
}

function entrantKey(accountId) {
  return Number(accountId || 0);
}

function topQualifiers(tournament) {
  const resultByAccountId = new Map();
  const maxPlayers = Math.max(1, Number(tournament.bracketSize || 32));
  const usesBracketDialIn = tournamentBracketDialIn(tournament);

  for (const entrant of tournament.entrants) {
    resultByAccountId.set(Number(entrant.accountId || 0), {
      accountId: Number(entrant.accountId || 0),
      username: entrant.username || "Racer",
      accountCarId: Number(entrant.accountCarId || 0),
      elapsedTime: Number.POSITIVE_INFINITY,
      reactionTime: 0,
      bracketTime: normalizeBracketTime(entrant.bracketTime, 0),
      qualified: false,
    });
  }

  for (const result of tournament.qualifyingResults || []) {
    const accountId = Number(result.accountId || 0);
    const current = resultByAccountId.get(accountId) || {
      accountId,
      username: result.username || `Racer ${accountId}`,
      accountCarId: Number(result.accountCarId || 0),
      elapsedTime: Number.POSITIVE_INFINITY,
      reactionTime: 0,
      bracketTime: normalizeBracketTime(result.bracketTime || result.dialIn, 0),
      qualified: false,
    };
    const elapsedTime = Number(result.elapsedTime || 0);
    if (accountId && elapsedTime > 0 && elapsedTime < current.elapsedTime) {
      const currentBracketTime = normalizeBracketTime(current.bracketTime, 0);
      const resultBracketTime = normalizeBracketTime(result.bracketTime || result.dialIn, currentBracketTime);
      const resolvedBracketTime = currentBracketTime
        || resultBracketTime
        || (usesBracketDialIn ? normalizeBracketTime(elapsedTime, 0) : 0);
      resultByAccountId.set(accountId, {
        ...current,
        username: current.username || result.username || `Racer ${accountId}`,
        accountCarId: Number(result.accountCarId || current.accountCarId || 0),
        elapsedTime,
        reactionTime: Number(result.reactionTime || 0),
        bracketTime: resolvedBracketTime,
        qualified: true,
      });
    }
  }

  return Array.from(resultByAccountId.values())
    .filter((entry) => entry.qualified)
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.elapsedTime) ? left.elapsedTime : Number.POSITIVE_INFINITY;
      const rightTime = Number.isFinite(right.elapsedTime) ? right.elapsedTime : Number.POSITIVE_INFINITY;
      return leftTime - rightTime || String(left.username).localeCompare(String(right.username));
    })
    .slice(0, maxPlayers);
}

function bracketResultKey(round, matchIndex) {
  return `${Number(round || 0)}:${Number(matchIndex || 0)}`;
}

function bracketRoundCount(tournament) {
  const bracketSize = Math.max(2, Number(tournament?.bracketSize || 32));
  return Math.max(1, Math.round(Math.log2(bracketSize)));
}

export { bracketRoundCount };

function matchesInBracketRound(tournament, round) {
  const bracketSize = Math.max(2, Number(tournament?.bracketSize || 32));
  const normalizedRound = Math.max(0, Number(round || 0));
  return Math.max(1, Math.floor(bracketSize / (2 ** (normalizedRound + 1))));
}

function getBracketMatchWinner(tournament, round, matchIndex) {
  const key = bracketResultKey(round, matchIndex);
  const result = (tournament?.bracketResults || []).find(
    (item) => bracketResultKey(item.round, item.matchIndex) === key,
  );
  return Number(result?.winnerAccountId || 0) || 0;
}

function qualifierEntryForAccount(tournament, accountId) {
  const normalizedAccountId = Number(accountId || 0);
  if (!normalizedAccountId) {
    return null;
  }

  const qualified = topQualifiers(tournament).find(
    (entry) => Number(entry.accountId || 0) === normalizedAccountId,
  );
  if (qualified) {
    return qualified;
  }

  const entrant = tournament.entrants.find(
    (entry) => Number(entry.accountId || 0) === normalizedAccountId,
  );
  if (!entrant) {
    return null;
  }

  return {
    accountId: normalizedAccountId,
    username: entrant.username || "Racer",
    accountCarId: Number(entrant.accountCarId || 0),
    elapsedTime: Number.POSITIVE_INFINITY,
    reactionTime: 0,
    bracketTime: normalizeBracketTime(entrant.bracketTime, 0),
  };
}

function resolveBracketMatchParticipants(tournament, round, matchIndex) {
  const normalizedRound = Number(round || 0);
  const normalizedMatchIndex = Number(matchIndex || 0);

  if (normalizedRound <= 0) {
    const qualifiers = topQualifiers(tournament);
    const left = qualifiers[normalizedMatchIndex * 2] || null;
    const right = qualifiers[normalizedMatchIndex * 2 + 1] || null;
    return {
      left,
      right,
      leftSeed: normalizedMatchIndex * 2 + 1,
      rightSeed: normalizedMatchIndex * 2 + 2,
    };
  }

  const leftWinnerId = getBracketMatchWinner(tournament, normalizedRound - 1, normalizedMatchIndex * 2);
  const rightWinnerId = getBracketMatchWinner(
    tournament,
    normalizedRound - 1,
    normalizedMatchIndex * 2 + 1,
  );

  return {
    left: leftWinnerId ? qualifierEntryForAccount(tournament, leftWinnerId) : null,
    right: rightWinnerId ? qualifierEntryForAccount(tournament, rightWinnerId) : null,
    leftSeed: normalizedMatchIndex * 2 + 1,
    rightSeed: normalizedMatchIndex * 2 + 2,
  };
}

export function findOpenBracketMatchForAccount(tournament, accountId) {
  const targetAccountId = Number(accountId || 0);
  if (!targetAccountId) {
    return null;
  }

  for (let round = 0; round < bracketRoundCount(tournament); round += 1) {
    const matchCount = matchesInBracketRound(tournament, round);
    for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
      if (getBracketMatchWinner(tournament, round, matchIndex)) {
        continue;
      }

      const participants = resolveBracketMatchParticipants(tournament, round, matchIndex);
      const leftId = Number(participants.left?.accountId || 0);
      const rightId = Number(participants.right?.accountId || 0);
      if (!leftId || !rightId) {
        continue;
      }

      if (leftId === targetAccountId || rightId === targetAccountId) {
        return {
          round,
          matchIndex,
          left: participants.left,
          right: participants.right,
          leftSeed: participants.leftSeed,
          rightSeed: participants.rightSeed,
        };
      }
    }
  }

  return null;
}

export function listNewlyReadyBracketMatches(tournament, completedRound, completedMatchIndex) {
  const nextRound = Number(completedRound || 0) + 1;
  if (nextRound >= bracketRoundCount(tournament)) {
    return [];
  }

  const nextMatchIndex = Math.floor(Number(completedMatchIndex || 0) / 2);
  if (getBracketMatchWinner(tournament, nextRound, nextMatchIndex)) {
    return [];
  }

  const participants = resolveBracketMatchParticipants(tournament, nextRound, nextMatchIndex);
  const leftId = Number(participants.left?.accountId || 0);
  const rightId = Number(participants.right?.accountId || 0);
  if (!leftId || !rightId) {
    return [];
  }

  return [{
    round: nextRound,
    matchIndex: nextMatchIndex,
    left: participants.left,
    right: participants.right,
    leftSeed: participants.leftSeed,
    rightSeed: participants.rightSeed,
  }];
}

export function renderTournamentsXml(tournaments) {
  const serverTime = centralDisplayEpochSeconds();
  const nodes = (Array.isArray(tournaments) ? tournaments : [])
    .map((tournament) => {
      const id = Number(tournament.id || DEFAULT_TOURNAMENT_ID);
      const entrants = Array.isArray(tournament.entrants) ? tournament.entrants.length : 0;
      const maxPlayers = normalizeTournamentNumber(tournament.bracketSize || tournament.maxPlayers, 32);
      const rawStartsAt = normalizeTournamentNumber(
        tournament.startsAt,
        Math.floor(Date.parse(tournament.startsAt || "") / 1000) || Math.floor(Date.now() / 1000),
      );
      const rawQualifyingEndsAt = normalizeTournamentNumber(tournament.qualifyingEndsAt, 0);
      const rawEndsAt = normalizeTournamentNumber(tournament.endsAt, 0);
      const status = normalizeTournamentNumber(tournament.statusCode ?? tournament.status ?? 1, 1);
      const startsAt = centralDisplayEpochSeconds(rawStartsAt * 1000);
      const qualifyingEndsAt = centralDisplayEpochSeconds(rawQualifyingEndsAt * 1000);
      const endsAt = centralDisplayEpochSeconds(rawEndsAt * 1000);
      const countdownEndsAt = status === 1 ? startsAt : qualifyingEndsAt || endsAt;
      const scheduleId = normalizeTournamentNumber(tournament.scheduleId, id);
      const detailImageId = normalizeTournamentNumber(tournament.detailImageId, 0);
      const logoId = normalizeTournamentNumber(tournament.logoId, 1);
      const prizeAssetId = normalizeTournamentNumber(tournament.prizeAssetId, 2);
      const backgroundId = escapeXmlAttribute(tournament.backgroundId || "green");
      const entryType = escapeXmlAttribute(tournament.entryType || "f");
      const entryCost = normalizeMoney(tournament.entryCost ?? tournament.entryFee);
      const firstPrize = normalizeMoney(tournament.firstPrize ?? tournament.prizeMoney);
      const secondPrize = normalizeMoney(tournament.secondPrize);
      const roundPrize = normalizeMoney(tournament.roundPrize);
      const bracketDialIn = normalizeTournamentNumber(tournament.bracketDialIn, 0);
      const entryRequirement = escapeXmlAttribute(tournament.requirement || tournament.entryRequirement || "");
      const description = escapeXmlAttribute(tournament.description || tournament.title || tournament.name || "");

      return (
        `<t i='${id}' id='${id}' tid='${id}' ` +
        `n='${escapeXmlAttribute(tournament.name || "Local Tournament")}' ` +
        `s='${status}' st='${escapeXmlAttribute(tournament.statusLabel || tournament.status || "qualifying")}' ` +
        `c='${entrants}' rc='${entrants}' m='${maxPlayers}' mp='${maxPlayers}' ` +
        `e='${entryCost}' cst='${entryCost}' ct='${entryType}' et='${entryType}' ` +
        `p='${firstPrize}' fp='${firstPrize}' firstPrize='${firstPrize}' fprize='${firstPrize}' ` +
        `sp='${secondPrize}' secondPrize='${secondPrize}' sprize='${secondPrize}' ` +
        `rp='${roundPrize}' roundPrize='${roundPrize}' rprize='${roundPrize}' pp='${normalizeMoney(tournament.prizePoints)}' ` +
        `ut='${startsAt}' d='${startsAt}' de='${countdownEndsAt}' ` +
        `l='${normalizeMoney(tournament.trackLength, 1320)}' it='${detailImageId}' di='${detailImageId}' ` +
        `li='${logoId}' pi='${prizeAssetId}' cs='${backgroundId}' b='${bracketDialIn}' sid='${scheduleId}'>` +
        `<entryReq><![CDATA[${entryRequirement}]]></entryReq><descr><![CDATA[${description}]]></descr></t>`
      );
    })
    .join("");

  return `<tournaments ut='${serverTime}'>${nodes}</tournaments>`;
}

export function renderTournamentInfoXml(tournament) {
  const startsAt = Math.floor(Date.parse(tournament?.startsAt || "") / 1000) || Math.floor(Date.now() / 1000);
  const entrants = Array.isArray(tournament?.entrants) ? tournament.entrants.length : 0;

  return (
    `<i tid='${Number(tournament?.id || DEFAULT_TOURNAMENT_ID)}' ` +
    `n='${escapeXmlAttribute(tournament?.name || "Local Tournament")}' ` +
    `ut='${startsAt}' s='1' li='${entrants}' it='${normalizeMoney(tournament?.entryFee)}' ` +
    `p='${normalizeMoney(tournament?.prizeMoney)}' pp='${normalizeMoney(tournament?.prizePoints)}'/>`
  );
}

export function renderTop32Xml(tournament) {
  const nodes = topQualifiers(tournament)
    .map((entry, index) => {
      const elapsedTime = Number.isFinite(entry.elapsedTime) ? entry.elapsedTime.toFixed(3) : "0";
      const reactionTime = Number(entry.reactionTime || 0).toFixed(3);
      const bracketTime = Number(entry.bracketTime || 0).toFixed(3);
      return (
        `<r p='${index + 1}' i='${entry.accountId}' aid='${entry.accountId}' ` +
        `acid='${entry.accountCarId}' n='${escapeXmlAttribute(entry.username)}' u='${escapeXmlAttribute(entry.username)}' ` +
        `t='${elapsedTime}' et='${elapsedTime}' rt='${reactionTime}' bt='${bracketTime}'/>`
      );
    })
    .join("");

  return `<top32>${nodes}</top32>`;
}

function renderTournamentTreePlayerXml(entry, seed, { won = false } = {}) {
  const accountId = Number(entry?.accountId || 0);
  const accountCarId = Number(entry?.accountCarId || 0);
  const username = escapeXmlAttribute(entry?.username || "");
  const bracketTime = Number(entry?.bracketTime || 0);
  const elapsedTime = Number.isFinite(entry?.elapsedTime) ? entry.elapsedTime.toFixed(3) : "0.000";
  const reactionTime = Number(entry?.reactionTime || 0).toFixed(3);
  const winFlag = won ? 1 : 0;

  return (
    `<p i='${accountId}' aid='${accountId}' id='${accountId}' ` +
    `u='${username}' n='${username}' ` +
    `c='${accountCarId}' cid='${accountCarId}' acid='${accountCarId}' ` +
    `bt='${Number.isFinite(bracketTime) ? bracketTime.toFixed(3) : "0.000"}' ` +
    `et='${elapsedTime}' rt='${reactionTime}' sc='0' k='${Number(seed || 0)}' w='${winFlag}'/>`
  );
}

export function renderTournamentTreeXml(tournament) {
  const qualifiers = topQualifiers(tournament);
  const maxPlayers = Math.max(1, Number(tournament.bracketSize || 32));
  const matches = [];

  for (let index = 0; index < maxPlayers; index += 2) {
    const left = qualifiers[index] || null;
    const right = qualifiers[index + 1] || null;
    const matchIndex = Math.floor(index / 2);
    const winnerId = getBracketMatchWinner(tournament, 0, matchIndex);
    const matchWon = winnerId > 0 ? 1 : 0;
    matches.push(
      `<m i='${matchIndex}' w='${matchWon}'>` +
      renderTournamentTreePlayerXml(left, index + 1, {
        won: winnerId > 0 && Number(left?.accountId || 0) === winnerId,
      }) +
      renderTournamentTreePlayerXml(right, index + 2, {
        won: winnerId > 0 && Number(right?.accountId || 0) === winnerId,
      }) +
      `</m>`,
    );
  }

  return `<tree><r i='0'>${matches.join("")}</r></tree>`;
}

export function renderTournamentRaceStartXml(tournament, accountId, { timeToStage = 43 } = {}) {
  const selectedMatch = findOpenBracketMatchForAccount(tournament, accountId);
  if (!selectedMatch) {
    return "";
  }

  const leftBracketTime = Number(selectedMatch.left?.bracketTime || 0);
  const rightBracketTime = Number(selectedMatch.right?.bracketTime || 0);
  const racePot = normalizeMoney(tournament?.prizeMoney, 0);

  return (
    `<r r='${Number(selectedMatch.round || 0)}' rnd='${Number(selectedMatch.round || 0)}' ` +
    `m='${selectedMatch.matchIndex}' t='${Number(timeToStage || 43)}' ` +
    `r1id='${Number(selectedMatch.left?.accountId || 0)}' r1cid='${Number(selectedMatch.left?.accountCarId || 0)}' ` +
    `r2id='${Number(selectedMatch.right?.accountId || 0)}' r2cid='${Number(selectedMatch.right?.accountCarId || 0)}' ` +
    `b1='${Number.isFinite(leftBracketTime) ? leftBracketTime.toFixed(3) : "0.000"}' ` +
    `b2='${Number.isFinite(rightBracketTime) ? rightBracketTime.toFixed(3) : "0.000"}' ` +
    `sc1='0' sc2='0' k1='${selectedMatch.leftSeed}' k2='${selectedMatch.rightSeed}' bt='${racePot}'/>`
  );
}

export class LocalTournamentStore {
  constructor({ dataRoot }) {
    this.filePath = join(dataRoot, "tournaments.local.json");
  }

  async listTournaments() {
    const store = await readStore(this.filePath);
    return store.tournaments;
  }

  async getTournament(tournamentId = DEFAULT_TOURNAMENT_ID) {
    const store = await readStore(this.filePath);
    return tournamentById(store, tournamentId);
  }

  async joinTournament({ tournamentId = DEFAULT_TOURNAMENT_ID, account, accountCarId, bracketTime = 0, defaults = null }) {
    return mutateStore(this.filePath, async (store) => {
      const tournament = tournamentById(store, tournamentId, defaults);
      const accountId = entrantKey(account?.id);

      if (!accountId) {
        return { ok: false, reason: "missing-account", code: 0 };
      }

      const existing = tournament.entrants.find((entrant) => entrantKey(entrant.accountId) === accountId);
      const existingBracketTime = normalizeBracketTime(existing?.bracketTime, 0);
      const incomingCarId = Number(accountCarId || 0);
      const preservedCarId = Number(existing?.accountCarId || 0);
      const resolvedAccountCarId = preservedCarId > 0
        ? preservedCarId
        : (
          incomingCarId
          || Number(account?.defaultCarAccountCarId || account?.starterCar?.accountCarId || 0)
        );
      const incomingBracketTime = normalizeBracketTime(bracketTime, 0);
      const resolvedBracketTime = existingBracketTime > 0 && incomingBracketTime <= 0
        ? existingBracketTime
        : normalizeBracketTime(bracketTime, existingBracketTime);
      const entrant = {
        accountId,
        username: account?.username || "Racer",
        accountCarId: resolvedAccountCarId,
        bracketTime: resolvedBracketTime,
        joinedAt: new Date().toISOString(),
      };

      if (existing) {
        Object.assign(existing, entrant);
      } else if (tournament.entrants.length < Number(tournament.bracketSize || 32)) {
        tournament.entrants.push(entrant);
      } else {
        return { ok: false, reason: "full", code: -2 };
      }

      tournament.updatedAt = new Date().toISOString();

      return { ok: true, tournament, entrant };
    });
  }

  async leaveTournament({ tournamentId = DEFAULT_TOURNAMENT_ID, accountId }) {
    return mutateStore(this.filePath, async (store) => {
      const tournament = tournamentById(store, tournamentId);
      const normalizedAccountId = entrantKey(accountId);
      tournament.entrants = tournament.entrants.filter(
        (entrant) => entrantKey(entrant.accountId) !== normalizedAccountId,
      );
      tournament.readyAccountIds = tournament.readyAccountIds.filter(
        (id) => entrantKey(id) !== normalizedAccountId,
      );
      tournament.updatedAt = new Date().toISOString();
      return { ok: true, tournament };
    });
  }

  async markReady({ tournamentId = DEFAULT_TOURNAMENT_ID, accountId }) {
    return mutateStore(this.filePath, async (store) => {
      const tournament = tournamentById(store, tournamentId);
      const normalizedAccountId = entrantKey(accountId);
      if (normalizedAccountId && !tournament.readyAccountIds.some((id) => entrantKey(id) === normalizedAccountId)) {
        tournament.readyAccountIds.push(normalizedAccountId);
      }
      tournament.updatedAt = new Date().toISOString();
      return { ok: true, tournament };
    });
  }

  async recordQualifyingResult({
    tournamentId = DEFAULT_TOURNAMENT_ID,
    accountId,
    accountCarId,
    username,
    bracketTime,
    elapsedTime,
    reactionTime,
  }) {
    return mutateStore(this.filePath, async (store) => {
      const tournament = tournamentById(store, tournamentId);
      const normalizedAccountId = entrantKey(accountId);

      if (!normalizedAccountId) {
        return { ok: false, reason: "missing-account", code: 0 };
      }

      const entrant = tournament.entrants.find((item) => entrantKey(item.accountId) === normalizedAccountId);
      const recordedAccountCarId = Number(accountCarId || entrant?.accountCarId || 0);
      const usesBracketDialIn = tournamentBracketDialIn(tournament);
      const normalizedElapsedTime = Number(elapsedTime || 0);
      let recordedBracketTime = normalizeBracketTime(bracketTime, normalizeBracketTime(entrant?.bracketTime, 0));
      if (usesBracketDialIn && recordedBracketTime <= 0 && normalizedElapsedTime > 0) {
        recordedBracketTime = normalizeBracketTime(normalizedElapsedTime, 0);
      }

      if (entrant) {
        entrant.accountCarId = recordedAccountCarId || Number(entrant.accountCarId || 0);
        entrant.bracketTime = recordedBracketTime;
      }

      tournament.qualifyingResults.push({
        accountId: normalizedAccountId,
        username: entrant?.username || username || `Racer ${normalizedAccountId}`,
        accountCarId: recordedAccountCarId,
        elapsedTime: Number(elapsedTime || 0),
        reactionTime: Number(reactionTime || 0),
        bracketTime: recordedBracketTime,
        recordedAt: new Date().toISOString(),
      });
      tournament.updatedAt = new Date().toISOString();

      return { ok: true, tournament };
    });
  }

  async recordBracketMatchResult({
    tournamentId = DEFAULT_TOURNAMENT_ID,
    round = 0,
    matchIndex = 0,
    winnerAccountId,
    loserAccountId = 0,
    winnerAccountCarId = 0,
    loserAccountCarId = 0,
  }) {
    return mutateStore(this.filePath, async (store) => {
      const tournament = tournamentById(store, tournamentId);
      const normalizedWinnerId = entrantKey(winnerAccountId);
      if (!normalizedWinnerId) {
        return { ok: false, reason: "missing-winner", code: 0 };
      }

      const key = bracketResultKey(round, matchIndex);
      const existingIndex = tournament.bracketResults.findIndex(
        (item) => bracketResultKey(item.round, item.matchIndex) === key,
      );
      const result = {
        round: Number(round || 0),
        matchIndex: Number(matchIndex || 0),
        winnerAccountId: normalizedWinnerId,
        loserAccountId: Number(loserAccountId || 0),
        winnerAccountCarId: Number(winnerAccountCarId || 0),
        loserAccountCarId: Number(loserAccountCarId || 0),
        recordedAt: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        tournament.bracketResults[existingIndex] = {
          ...tournament.bracketResults[existingIndex],
          ...result,
        };
      } else {
        tournament.bracketResults.push(result);
      }

      tournament.updatedAt = new Date().toISOString();
      return { ok: true, tournament, result };
    });
  }

  async finalizeTournament({
    tournamentId = DEFAULT_TOURNAMENT_ID,
    championAccountId,
    runnerUpAccountId = 0,
  }) {
    return mutateStore(this.filePath, async (store) => {
      const tournament = tournamentById(store, tournamentId);
      const normalizedChampionId = entrantKey(championAccountId);

      if (!normalizedChampionId) {
        return { ok: false, reason: "missing-champion", code: 0 };
      }

      if (String(tournament.status || "").toLowerCase() === "completed" || tournament.completedAt) {
        return { ok: false, reason: "already-completed", code: 0, tournament };
      }

      tournament.status = "completed";
      tournament.statusCode = 0;
      tournament.statusLabel = "Finished";
      tournament.championAccountId = normalizedChampionId;
      tournament.runnerUpAccountId = Number(runnerUpAccountId || 0);
      tournament.completedAt = new Date().toISOString();
      tournament.updatedAt = new Date().toISOString();

      return { ok: true, tournament };
    });
  }
}
