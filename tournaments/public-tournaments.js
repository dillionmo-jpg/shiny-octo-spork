import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isScheduleEventEligible } from "./tournament-eligibility.js";

const CENTRAL_TIME_ZONE = "America/Chicago";
export const LIVE_TOURNAMENT_TEST_INTERVAL_SECONDS = 20 * 60;
export const LIVE_TOURNAMENT_TEST_VISIBLE_COUNT = 20;
export const LIVE_TOURNAMENT_TEST_NO_PRIZES = false;
export const LIVE_TOURNAMENT_TEST_FIRST_START_CENTRAL_LABEL = "2026-05-25 12:35 PM America/Chicago";
export const LIVE_TOURNAMENT_TEST_FIRST_START_UTC_MS = Date.UTC(2026, 4, 25, 17, 35, 0);
const TOURNAMENT_TEST_ANCHOR_UTC_MS = LIVE_TOURNAMENT_TEST_FIRST_START_UTC_MS;
const DEFAULT_EVENT_DURATION_SECONDS = 60 * 60;
const DEFAULT_QUALIFYING_DURATION_SECONDS = 30 * 60;
export const LIVE_TOURNAMENT_COUNTDOWN_WINDOW_SECONDS = 2 * 60;
export const LIVE_TOURNAMENT_MIN_BRACKET_DURATION_SECONDS = 5 * 60;
export const TOURNAMENT_LOGO_ASSET_IDS = Object.freeze([
  1, 2, 3, 11, 12, 21, 22, 23, 24, 25, 26, 27, 28, 31, 37, 41, 53, 58, 59, 62, 63, 64, 65, 66,
  67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108,
  109, 110, 112, 113, 114, 115,
]);
export const TOURNAMENT_LIST_DETAIL_ASSET_IDS = Object.freeze([0, 1, 2, 3]);
export const TOURNAMENT_BACKGROUND_ASSET_IDS = Object.freeze(["blue", "green", "purple", "red", "yellow"]);
export const TOURNAMENT_PRIZE_ASSET_IDS = Object.freeze([1, 2, 22]);
const STATUS_LABELS = Object.freeze({
  0: "Finished",
  1: "Upcoming",
  2: "Live",
});

const moduleDir = dirname(fileURLToPath(import.meta.url));
const scheduleSeedPath = resolve(moduleDir, "../../../data/live-tournament-schedule.seed.json");
const scheduleSeed = JSON.parse(readFileSync(scheduleSeedPath, "utf8"));

function freezeEvent(event) {
  return Object.freeze({
    ...event,
    carNames: Object.freeze(Array.isArray(event.carNames) ? [...event.carNames] : []),
    supportedCarNames: Object.freeze(Array.isArray(event.supportedCarNames) ? [...event.supportedCarNames] : []),
  });
}

function baseSeedEvents() {
  return [
    ...(Array.isArray(scheduleSeed.events) ? scheduleSeed.events : []),
    ...(Array.isArray(scheduleSeed.blockedEvents) ? scheduleSeed.blockedEvents : []),
  ];
}

function syntheticAssetTournament(logoId, index) {
  const listDetailId = TOURNAMENT_LIST_DETAIL_ASSET_IDS[index % TOURNAMENT_LIST_DETAIL_ASSET_IDS.length];
  const backgroundId = TOURNAMENT_BACKGROUND_ASSET_IDS[index % TOURNAMENT_BACKGROUND_ASSET_IDS.length];
  const prizeAssetId = TOURNAMENT_PRIZE_ASSET_IDS[index % TOURNAMENT_PRIZE_ASSET_IDS.length];
  return {
    id: 900000000 + Number(logoId),
    scheduleId: 9000 + Number(logoId),
    dayOffset: 0,
    time: "00:00",
    name: `Open Tournament ${logoId}`,
    title: "OPEN TOURNAMENT",
    requirement: "Open tournament. Any eligible car may enter.",
    carNames: [],
    supportedCarNames: [],
    naturallyAspirated: false,
    requiredBoostType: "",
    requiredLocation: "",
    minStreetCredit: null,
    maxStreetCredit: null,
    logoId,
    detailImageId: listDetailId,
    backgroundId,
    prizeAssetId,
    roomId: 2,
    maxPlayers: 32,
    purse: 50000,
    firstPrize: 50000,
    secondPrize: 30000,
    roundPrize: 0,
    entryType: "f",
    entryCost: 0,
    bracketDialIn: 0,
    durationSeconds: DEFAULT_EVENT_DURATION_SECONDS,
    qualifyingDurationSeconds: DEFAULT_QUALIFYING_DURATION_SECONDS,
  };
}

function applyTestEventOverrides(event) {
  if (!LIVE_TOURNAMENT_TEST_NO_PRIZES) {
    return event;
  }

  return {
    ...event,
    purse: 0,
    firstPrize: 0,
    secondPrize: 0,
    roundPrize: 0,
    entryCost: 0,
  };
}

function activeScheduleEvents() {
  return (Array.isArray(scheduleSeed.events) ? scheduleSeed.events : [])
    .filter((event) => Number(event.scheduleId || 0) < 9000)
    .filter(isScheduleEventEligible)
    .map(applyTestEventOverrides);
}

export const LIVE_TOURNAMENT_SCHEDULE = Object.freeze(
  activeScheduleEvents().map(freezeEvent),
);

export const BLOCKED_LIVE_TOURNAMENT_SCHEDULE = Object.freeze(
  (Array.isArray(scheduleSeed.blockedEvents) ? scheduleSeed.blockedEvents : []).map(freezeEvent),
);

function parseCentralParts(date) {
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
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function getTournamentCycleDurationMs() {
  return Math.max(1, LIVE_TOURNAMENT_SCHEDULE.length) * LIVE_TOURNAMENT_TEST_INTERVAL_SECONDS * 1000;
}

function getTournamentCycleStartMs(nowMs) {
  const cycleDurationMs = getTournamentCycleDurationMs();
  const cycleIndex = Math.floor((nowMs - TOURNAMENT_TEST_ANCHOR_UTC_MS) / cycleDurationMs);
  return TOURNAMENT_TEST_ANCHOR_UTC_MS + cycleIndex * cycleDurationMs;
}

function getTournamentStatus(event, nowSeconds) {
  if (nowSeconds < event.startsAt) {
    return 1;
  }
  if (nowSeconds < event.endsAt) {
    return 2;
  }
  return 0;
}

function isLiveTournamentVisible(event, nowSeconds) {
  return event.endsAt > nowSeconds
    && nowSeconds >= event.startsAt - LIVE_TOURNAMENT_COUNTDOWN_WINDOW_SECONDS;
}

function formatCentralTournamentTimeLabel(startsAtMs) {
  const date = new Date(startsAtMs);
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const byType = Object.fromEntries([...dateParts, ...timeParts].map((part) => [part.type, part.value]));
  return `${byType.weekday} ${byType.month}/${byType.day} ${byType.hour}:${byType.minute} Central`;
}

function normalizePositiveSeconds(value, fallbackSeconds) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : fallbackSeconds;
}

function tournamentRequiresDialIn(entry = {}) {
  const title = `${entry.title || ""} ${entry.name || ""}`;
  return /\bbracket\b/i.test(title);
}

function instantiateEvent(entry, cycleStartMs, slotIndex = 0) {
  const startsAtMs = cycleStartMs + slotIndex * LIVE_TOURNAMENT_TEST_INTERVAL_SECONDS * 1000;
  const startsAt = Math.floor(startsAtMs / 1000);
  const durationSeconds = Math.min(
    normalizePositiveSeconds(entry.durationSeconds, DEFAULT_EVENT_DURATION_SECONDS),
    LIVE_TOURNAMENT_TEST_INTERVAL_SECONDS,
  );
  const qualifyingDurationSeconds = Math.min(
    normalizePositiveSeconds(entry.qualifyingDurationSeconds, DEFAULT_QUALIFYING_DURATION_SECONDS),
    Math.max(
      60,
      durationSeconds - LIVE_TOURNAMENT_MIN_BRACKET_DURATION_SECONDS,
    ),
  );

  return {
    ...entry,
    startsAt,
    qualifyingEndsAt: startsAt + qualifyingDurationSeconds,
    endsAt: startsAt + durationSeconds,
    timeLabel: formatCentralTournamentTimeLabel(startsAtMs),
    bracketDialIn: tournamentRequiresDialIn(entry) ? 1 : 0,
  };
}

function normalizedNowMs(now) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(nowMs) ? nowMs : Date.now();
}

export function getScheduledLiveTournamentEvents({ now = Date.now(), includePreviousCycle = true } = {}) {
  const nowMs = normalizedNowMs(now);
  const nowSeconds = Math.floor(nowMs / 1000);
  const baseCycleStartMs = getTournamentCycleStartMs(nowMs);
  const cycleDurationMs = getTournamentCycleDurationMs();
  const cycleStarts = includePreviousCycle
    ? [baseCycleStartMs - cycleDurationMs, baseCycleStartMs, baseCycleStartMs + cycleDurationMs]
    : [baseCycleStartMs, baseCycleStartMs + cycleDurationMs];

  return cycleStarts
    .flatMap((cycleStartMs) => LIVE_TOURNAMENT_SCHEDULE.map((entry, index) => instantiateEvent(entry, cycleStartMs, index)))
    .sort((left, right) => left.startsAt - right.startsAt)
    .map((event) => ({
      ...event,
      status: getTournamentStatus(event, nowSeconds),
    }));
}

export function getCurrentLiveTournamentEvent({ now = Date.now() } = {}) {
  const nowMs = normalizedNowMs(now);
  const nowSeconds = Math.floor(nowMs / 1000);
  const events = getScheduledLiveTournamentEvents({ now: nowMs, includePreviousCycle: true });
  return events.find((event) => nowSeconds >= event.startsAt && nowSeconds < event.endsAt)
    || events.find((event) => event.startsAt >= nowSeconds)
    || events[events.length - 1]
    || null;
}

export function getVisibleLiveTournamentEvents({ now = Date.now(), limit = LIVE_TOURNAMENT_TEST_VISIBLE_COUNT } = {}) {
  const nowMs = normalizedNowMs(now);
  const nowSeconds = Math.floor(nowMs / 1000);
  const maxVisible = Math.max(1, Number(limit || LIVE_TOURNAMENT_TEST_VISIBLE_COUNT));

  const visible = getScheduledLiveTournamentEvents({ now: nowMs, includePreviousCycle: true })
    .filter((event) => isLiveTournamentVisible(event, nowSeconds))
    .sort((left, right) => left.startsAt - right.startsAt);

  const liveEvents = visible.filter((event) => Number(event.status) === 2);
  if (liveEvents.length > 0) {
    return liveEvents.slice(0, 1);
  }

  return visible.slice(0, maxVisible);
}

export function findActiveScheduledLiveTournament(tournamentId, { now = Date.now() } = {}) {
  const nowMs = normalizedNowMs(now);
  const nowSeconds = Math.floor(nowMs / 1000);
  const normalizedId = Number(tournamentId || 0);
  if (!normalizedId) {
    return null;
  }

  return getScheduledLiveTournamentEvents({ now: nowMs, includePreviousCycle: true })
    .find((event) => (
      Number(event.id || 0) === normalizedId
      && Number(event.scheduleId || 0) < 9000
      && nowSeconds >= event.startsAt
      && nowSeconds < event.endsAt
    )) || null;
}

export function buildLiveTournamentStoreDefaults(scheduledEvent) {
  if (!scheduledEvent) {
    return null;
  }

  return {
    name: scheduledEvent.name,
    status: scheduledEvent.status === 2 ? "qualifying" : "scheduled",
    statusLabel: getStatusLabel(scheduledEvent),
    bracketSize: scheduledEvent.maxPlayers,
    entryFee: scheduledEvent.entryCost,
    prizeMoney: scheduledEvent.firstPrize,
    prizePoints: 0,
    trackLength: 1320,
    startsAt: new Date(scheduledEvent.startsAt * 1000).toISOString(),
    startsAtEpoch: scheduledEvent.startsAt,
    qualifyingEndsAt: scheduledEvent.qualifyingEndsAt,
    endsAt: scheduledEvent.endsAt,
    statusCode: scheduledEvent.status,
    scheduleId: scheduledEvent.scheduleId,
    detailImageId: scheduledEvent.detailImageId,
    logoId: scheduledEvent.logoId,
    prizeAssetId: scheduledEvent.prizeAssetId,
    backgroundId: scheduledEvent.backgroundId,
    entryType: scheduledEvent.entryType,
    entryCost: scheduledEvent.entryCost,
    firstPrize: scheduledEvent.firstPrize,
    secondPrize: scheduledEvent.secondPrize,
    roundPrize: scheduledEvent.roundPrize,
    bracketDialIn: scheduledEvent.bracketDialIn,
    requirement: scheduledEvent.requirement,
    description: scheduledEvent.title,
  };
}

function formatCash(value) {
  const amount = Number(value || 0);
  return `$${amount.toLocaleString("en-US")}`;
}

function getStatusLabel(event) {
  return STATUS_LABELS[Number(event?.status)] || "Scheduled";
}

function serializeTournamentEvent(event) {
  if (!event) {
    return null;
  }

  return {
    id: event.id,
    scheduleId: event.scheduleId,
    name: event.name,
    title: event.title,
    status: event.status,
    statusLabel: getStatusLabel(event),
    timeLabel: event.timeLabel,
    startsAt: event.startsAt,
    qualifyingEndsAt: event.qualifyingEndsAt,
    endsAt: event.endsAt,
    firstPrize: event.firstPrize,
    secondPrize: event.secondPrize,
    firstPrizeLabel: formatCash(event.firstPrize),
    secondPrizeLabel: formatCash(event.secondPrize),
    requirement: event.requirement,
    carNames: event.carNames || [],
    supportedCarNames: event.supportedCarNames || [],
    logoId: event.logoId,
    detailImageId: event.detailImageId,
    backgroundId: event.backgroundId,
    prizeAssetId: event.prizeAssetId,
    entryType: event.entryType,
    entryCost: event.entryCost,
    maxPlayers: event.maxPlayers,
    bracketDialIn: event.bracketDialIn,
  };
}

export function buildPublicTournaments({ now = Date.now(), limit = LIVE_TOURNAMENT_TEST_VISIBLE_COUNT } = {}) {
  const nowMs = normalizedNowMs(now);
  const generatedAt = new Date(nowMs).toISOString();
  const events = getVisibleLiveTournamentEvents({ now: nowMs, limit }).map(serializeTournamentEvent);
  const current = serializeTournamentEvent(getCurrentLiveTournamentEvent({ now: nowMs })) || events[0] || null;

  return {
    ok: true,
    source: "generated:public-tournaments",
    generatedAt,
    current,
    events,
  };
}
