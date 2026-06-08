import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  getCatalogCarSellValue,
  getCatalogCar,
  getCatalogCarPointPrice,
  getCatalogCarPrice,
  getShowroomLocationIdForCar,
  ensureStockEngineInstalled,
  isShowroomCarLocked,
  normalizeCarColor,
  repairAccountGarageEngines,
} from "../showroom/car-showroom.js";
import { canonicalInstallSlotId, isNonPurchasableCatalogPart } from "../parts/parts-catalog.js";
import {
  PAINTABLE_PART_CATEGORY_IDS,
  isKnownPaintColor,
  normalizePaintColor,
  paintPriceForJobs,
} from "../paint/paint-catalog.js";
import {
  getLicensePlate,
  licensePriceForPayment,
  normalizePlateNumber,
  samplePlateNumber,
} from "../license/license-catalog.js";
import { allowsCustomGearRatios, calculateRacePerformance, isStockOemDefaultPart } from "../race/performance-model.js";
import {
  RACE_STREET_CREDIT_LOSS_PENALTY,
  RACE_STREET_CREDIT_WIN_REWARD,
  accountStreetCredit,
  normalizeStreetCredit,
} from "./street-credit.js";
import {
  ENGINE_DAMAGE_COMPONENTS,
  normalizeEngineDamageState,
  applyRaceEngineDamageState,
} from "../race/engine-state.js";
import { isLockedWheelCatalogPart, buildWheelsTiresCatalog, findOemWheelPartForCatalogCar, resolveCatalogCarOemWheel } from "../wheels/wheels-catalog.js";
import {
  addSecurityBanEntries,
  applyAccountSecurityTelemetry,
  buildAdminSecurityReport,
  currentMachineKey,
  evaluateLoginSecurity,
  evaluateLoginTelemetrySecurity,
  normalizeSecurityTelemetry,
  removeSecurityBanEntries,
} from "../security/account-security-telemetry.js";
import { config } from "../../config.js";
import { createBalanceAuditLog } from "./balance-audit-log.js";
import { economyFlagFieldsFromAlert } from "./balance-audit-alerts.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(moduleDir, "../../..");
let wheelsCatalogPromise = null;

function getWheelsCatalog() {
  if (!wheelsCatalogPromise) {
    wheelsCatalogPromise = buildWheelsTiresCatalog({
      assetRoot: join(backendRoot, "assets"),
      dataRoot: join(backendRoot, "data"),
    });
  }

  return wheelsCatalogPromise;
}

async function applyCatalogOemWheelsToGarageCar(car) {
  if (!car) {
    return car;
  }

  const wheelsCatalog = await getWheelsCatalog();
  const catalogCar = getCatalogCar(car.catalogCarId);
  const oemPart = findOemWheelPartForCatalogCar(wheelsCatalog, {
    catalogCarId: car.catalogCarId,
    wheelDesignId: car.wheelDesignId || catalogCar?.wheelDesignId,
    wheelSize: car.wheelSize || catalogCar?.wheelSize,
  });

  car.wheelPartId = Number(oemPart.i);
  car.wheelDesignId = Number(oemPart.di || oemPart.pdi || 1);
  car.wheelSize = Number(oemPart.ps || 17);
  car.partsXml = upsertInstalledPartXml(
    car.partsXml || "",
    WHEEL_CATEGORY_ID,
    renderInstalledCatalogPartXml(oemPart, 0),
  );

  return car;
}

const STORE_VERSION = 1;
const INSTALLED_PARTS_SLOT_DEDUPE_MIGRATION_KEY = "installedPartsSlotDedupeV1";
const PASSWORD_KEY_LENGTH = 32;
const ACCOUNT_CREATION_IP_CUTOFF_MS = Date.parse(
  process.env.NITTO_ACCOUNT_CREATION_IP_CUTOFF || "2026-06-01T16:41:49.000Z",
);
const CLIENT_SAFE_AVATAR_MAX_WIDTH = 100;
const CLIENT_SAFE_AVATAR_MAX_HEIGHT = 100;
const AVATAR_CLIENT_RENDER_VERSION = 1;
const TIRE_CATEGORY_ID = 13;
const WHEEL_CATEGORY_ID = 14;
const GEAR_RATIO_CATEGORY_ID = 22;
const STOCK_TIRE_SIZE = 5;
const STOCK_WHEEL_PART_ID = 1001;
const STOCK_TIRE_PART_ID = 1300;
const REPAIR_TIER_WORN_MAX_PERCENT = 15;
const REPAIR_TIER_STRESSED_MAX_PERCENT = 50;
const REPAIR_RATE_WORN = 0.4;       // $0.40 per percent (0-15%)
const REPAIR_RATE_STRESSED = 0.7;   // $0.70 per percent (16-50%)
const REPAIR_RATE_BROKEN = 1.2;     // $1.20 per percent (51-100%)
function tieredRepairCost(damagePercent) {
  const d = Math.max(0, Math.min(100, damagePercent));
  if (d <= 0) return 0;
  let cost = 0;
  const wornPortion = Math.min(d, REPAIR_TIER_WORN_MAX_PERCENT);
  cost += wornPortion * REPAIR_RATE_WORN;
  if (d > REPAIR_TIER_WORN_MAX_PERCENT) {
    const stressedPortion = Math.min(d, REPAIR_TIER_STRESSED_MAX_PERCENT) - REPAIR_TIER_WORN_MAX_PERCENT;
    cost += stressedPortion * REPAIR_RATE_STRESSED;
  }
  if (d > REPAIR_TIER_STRESSED_MAX_PERCENT) {
    const brokenPortion = d - REPAIR_TIER_STRESSED_MAX_PERCENT;
    cost += brokenPortion * REPAIR_RATE_BROKEN;
  }
  return Math.ceil(cost);
}
const FLUID_REFILL_COST_PER_PERCENT = 0.08;
const NITROUS_REFILL_COST_PER_PERCENT = 0.5;
const FLUID_REFILL_KEYS = new Set(["oil", "oilFilter", "coolant", "raceGas"]);
const ENGINE_TYPE_NATURAL = 1;
const ENGINE_TYPE_TURBO = 2;
const ENGINE_TYPE_SUPERCHARGER = 3;
const DEFAULT_PLATE_ID = 1;
const HEADER_CATEGORY_ID = 59;
const NITROUS_SHOT_CATEGORY_ID = 204;
const NITROUS_SHOT_CATEGORY_IDS = new Set([21, 204, 205, 2045]);
const NITROUS_BOTTLE_CATEGORY_IDS = new Set([102, 203]);
const OIL_FLUID_CATEGORY_IDS = new Set([165, 187, 189, 2019, 2020]);
const OIL_FILTER_FLUID_CATEGORY_IDS = new Set([168, 188]);
const COOLANT_FLUID_CATEGORY_IDS = new Set([20, 169, 2077, 2078]);
const ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID = 173;
const ENGINE_DIAGNOSTIC_TOOL_PART_IDS = new Set([10960]);
const TRACTION_CONTROL_CATEGORY_ID = 179;
const TRACTION_CONTROL_CATEGORY_IDS = new Set([TRACTION_CONTROL_CATEGORY_ID, 2011]);
const storeOperationQueues = new Map();
const storeWriteQueues = new Map();
const TURBO_SYSTEM_CATEGORY_IDS = [62, 61, 87, 86, 137, 18];
const SUPERCHARGER_SYSTEM_CATEGORY_IDS = [81, 82];
const BOOST_SOURCE_CATEGORY_IDS = new Set([87, 81]);
const FORCED_INDUCTION_SYSTEM_CATEGORY_IDS = new Set([
  ...TURBO_SYSTEM_CATEGORY_IDS,
  ...SUPERCHARGER_SYSTEM_CATEGORY_IDS,
]);
const FORCED_INDUCTION_LAUNCH_CATEGORY_IDS = new Set([62, 61, 87, 86, 137, 81, 82]);
const SYSTEM_CATEGORY_LABELS = new Map([
  [HEADER_CATEGORY_ID, "Headers"],
  [62, "Turbo Exhaust Manifold"],
  [61, "Turbo Down Pipe"],
  [87, "Turbochargers"],
  [86, "Intercoolers"],
  [137, "Turbo Piping"],
  [18, "Blow Off Valves"],
  [23, "Boost Controller"],
  [81, "Superchargers"],
  [82, "Supercharger Pulleys"],
]);
export const STARTER_CATALOG_CAR_IDS = Object.freeze([3, 1, 13]);
export const DEFAULT_STARTER_CATALOG_CAR_ID = 3;
export const DEFAULT_STARTER_CAR_NAME = "Ford Mustang GT";
export const DEFAULT_STARTING_MONEY = 50000;
export const DEFAULT_STARTING_POINTS = 500;
export const DEFAULT_LOCATION_ID = 100;
export const TEAM_ROLE = Object.freeze({
  LEADER: 1,
  CO_LEADER: 2,
  DEALER: 3,
  MEMBER: 4,
});

const TEAM_APP_STATUS = Object.freeze({
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
});
const TEAM_TRANSACTION_TYPE = Object.freeze({
  DISPERSE: 1,
  WITHDRAW: 2,
  DEPOSIT: 3,
});
const DEFAULT_TEAM_BACKGROUND_COLOR = "7D7D7D";
const MAX_TEAM_TRANSACTION_HISTORY = 50;
// The client can echo a stale quit packet immediately after accepting an invite.
const RECENT_TEAM_JOIN_QUIT_GRACE_MS = 3 * 1000;

const LOCATION_MOVE_COSTS = new Map([
  [100, { money: 0, points: 0, streetCredit: 0 }],
  [200, { money: 10000, points: 100, streetCredit: 0 }],
  [300, { money: 50000, points: 500, streetCredit: 0 }],
  [400, { money: 150000, points: 1500, streetCredit: 0 }],
  [500, { money: 500000, points: 5000, streetCredit: 0 }],
]);

function emptyStore() {
  return {
    version: STORE_VERSION,
    nextAccountId: 1,
    nextGarageCarId: 1,
    nextSparePartId: 1,
    nextUsedCarListingId: 1,
    nextUsedCarTradeId: 1,
    nextRemarkId: 1,
    nextMailId: 1,
    nextTeamId: 1,
    nextTeamApplicationId: 1,
    nextTeamTransactionId: 1,
    accounts: [],
    usedCarListings: [],
    usedCarTrades: [],
    mail: [],
    remarks: [],
    buddies: [],
    buddyRequests: [],
    teams: [],
    raceHistory: [],
    raceLogs: [],
  };
}

const MAX_RACE_HISTORY_ENTRIES = 50000;
const MAX_RACE_LOG_ENTRIES = 25000;

function raceElapsedMilliseconds(value) {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  return numericValue < 100 ? Math.round(numericValue * 1000) : Math.round(numericValue);
}

function appendRaceHistoryEntries(store, entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  store.raceHistory = Array.isArray(store.raceHistory) ? store.raceHistory : [];
  store.raceHistory.push(...entries);

  if (store.raceHistory.length > MAX_RACE_HISTORY_ENTRIES) {
    store.raceHistory = store.raceHistory.slice(-MAX_RACE_HISTORY_ENTRIES);
  }
}

function appendRaceLogEntry(store, entry) {
  if (!entry) {
    return;
  }

  store.raceLogs = Array.isArray(store.raceLogs) ? store.raceLogs : [];
  store.raceLogs.push(entry);

  if (store.raceLogs.length > MAX_RACE_LOG_ENTRIES) {
    store.raceLogs = store.raceLogs.slice(-MAX_RACE_LOG_ENTRIES);
  }
}

function avatarTimestamp(avatar) {
  const timestamp = Date.parse(avatar?.updatedAt || "");

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 0;
  }

  const width = Number(avatar?.width || 0);
  const height = Number(avatar?.height || 0);
  const clientSafe = (width <= 0 || height <= 0)
    || (width <= CLIENT_SAFE_AVATAR_MAX_WIDTH && height <= CLIENT_SAFE_AVATAR_MAX_HEIGHT);

  return Math.floor(timestamp / 1000) + (clientSafe ? 0 : AVATAR_CLIENT_RENDER_VERSION);
}

function normalizeUsername(username) {
  return String(username ?? "").trim().replace(/\s+/g, " ");
}

function usernameKey(username) {
  return normalizeUsername(username).toLowerCase();
}

const RESERVED_USERNAME_KEYS = new Set([
  "admin",
  "administrator",
  "system",
  "moderator",
  "mod",
  "guide",
  "support",
  "staff",
  "gm",
  "owner",
  "nitto",
  "server",
]);

function validAccountUsername(username) {
  return username.length >= 3
    && username.length <= 16
    && /^[a-z0-9](?:[a-z0-9 ]*[a-z0-9])?$/i.test(username)
    && !username.includes("  ")
    && !RESERVED_USERNAME_KEYS.has(usernameKey(username));
}

function normalizeBalance(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function debitSelectedBalance(account, { paysWithPoints, money, points, price }) {
  if (paysWithPoints) {
    account.points = points - price;
    return { balance: account.points, paymentType: "p" };
  }

  account.money = money - price;
  return { balance: account.money, paymentType: "m" };
}

function cleanTeamName(name) {
  return String(name ?? "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\s+/g, " ");
}

function teamNameKey(name) {
  return cleanTeamName(name).toLowerCase();
}

function validTeamName(name) {
  return name.length >= 2
    && name.length <= 32
    && /^[A-Za-z0-9][A-Za-z0-9 '&.-]*$/.test(name);
}

function normalizeTeamRole(role, fallback = TEAM_ROLE.MEMBER) {
  const numericRole = Number(role);
  if (Object.values(TEAM_ROLE).includes(numericRole)) {
    return numericRole;
  }
  return fallback;
}

function isTeamManagerRole(role) {
  const numericRole = normalizeTeamRole(role, 0);
  return numericRole === TEAM_ROLE.LEADER || numericRole === TEAM_ROLE.CO_LEADER;
}

function normalizeTeamAmount(value) {
  const amount = Math.floor(Number(value || 0));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function normalizeTeamDealerMaxBet(value, fallback = 0) {
  const maxBet = Math.floor(Number(value ?? fallback));
  return Number.isFinite(maxBet) && maxBet >= 0 && maxBet <= 100 ? maxBet : null;
}

function accountTeamId(account) {
  return Number(account?.teamId || account?.team_id || 0) || 0;
}

function accountTeamRole(account) {
  return normalizeTeamRole(account?.teamRole || account?.team_role || 0, 0);
}

function setAccountTeamMembership(account, team, role) {
  const teamId = Number(team?.id || 0);
  const teamName = cleanTeamName(team?.name || "");
  account.teamId = teamId;
  account.team_id = teamId;
  account.teamName = teamName;
  account.team_name = teamName;
  account.teamRole = normalizeTeamRole(role);
  account.team_role = account.teamRole;
  account.teamJoinedAt = account.teamJoinedAt || new Date().toISOString();
}

function clearAccountTeamMembership(account) {
  account.teamId = 0;
  account.team_id = 0;
  account.teamName = "";
  account.team_name = "";
  account.teamRole = 0;
  account.team_role = 0;
  delete account.teamJoinedAt;
}

function formatTeamTransactionDate(value = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function ensureTeamCollections(team) {
  team.members = Array.isArray(team.members) ? team.members : [];
  team.applications = Array.isArray(team.applications) ? team.applications : [];
  team.transactions = Array.isArray(team.transactions) ? team.transactions : [];
  return team;
}

function teamMemberForAccount(team, accountId) {
  const normalizedAccountId = Number(accountId || 0);
  if (!team || !normalizedAccountId) {
    return null;
  }
  ensureTeamCollections(team);
  return team.members.find((member) => Number(member?.accountId || member?.id || 0) === normalizedAccountId) || null;
}

function findTeamContext(store, accountId) {
  const normalizedAccountId = Number(accountId || 0);
  const account = store.accounts.find((item) => Number(item.id || 0) === normalizedAccountId) || null;
  if (!account) {
    return { account: null, team: null, member: null };
  }

  const configuredTeamId = accountTeamId(account);
  let team = configuredTeamId
    ? store.teams.find((item) => Number(item?.id || 0) === configuredTeamId) || null
    : null;
  let member = team ? teamMemberForAccount(team, normalizedAccountId) : null;

  if (!team || !member) {
    team = store.teams.find((item) => teamMemberForAccount(item, normalizedAccountId)) || null;
    member = team ? teamMemberForAccount(team, normalizedAccountId) : null;
  }

  return { account, team, member };
}

function normalizeTeamRecord(team, store) {
  const accountsById = new Map(store.accounts.map((account) => [Number(account.id || 0), account]));
  const normalizedTeam = ensureTeamCollections({
    ...team,
    id: Number(team?.id || 0),
    name: cleanTeamName(team?.name || ""),
    nameKey: team?.nameKey || teamNameKey(team?.name || ""),
    score: Number(team?.score || 0),
    teamFund: normalizeBalance(team?.teamFund ?? team?.team_fund, 0),
    backgroundColor: String(team?.backgroundColor || team?.background_color || DEFAULT_TEAM_BACKGROUND_COLOR),
    createdAt: String(team?.createdAt || team?.created_at || ""),
    wins: Number(team?.wins || 0),
    losses: Number(team?.losses || 0),
    recruitmentType: String(team?.recruitmentType || team?.recruitment_type || "open"),
    requirements: String(team?.requirements || team?.teamReq || ""),
    leaderComments: String(team?.leaderComments || ""),
    vip: Number(team?.vip || 0),
  });

  normalizedTeam.members = normalizedTeam.members
    .map((member) => {
      const accountId = Number(member?.accountId || member?.id || 0);
      if (!accountId) {
        return null;
      }
      const account = accountsById.get(accountId);
      return {
        accountId,
        username: account?.username || member?.username || "",
        role: normalizeTeamRole(member?.role || member?.teamRole),
        joinedAt: String(member?.joinedAt || normalizedTeam.createdAt || ""),
        contribution: normalizeBalance(member?.contribution, 0),
        dealerMaxBet: normalizeBalance(member?.dealerMaxBet, -1),
        score: accountStreetCredit(account || { streetCredit: member?.score || 0 }),
      };
    })
    .filter(Boolean);
  normalizedTeam.team_fund = normalizedTeam.teamFund;
  normalizedTeam.background_color = normalizedTeam.backgroundColor;
  normalizedTeam.created_at = normalizedTeam.createdAt;
  normalizedTeam.recruitment_type = normalizedTeam.recruitmentType;

  return normalizedTeam;
}

function recordTeamTransaction(store, team, transactionInput = {}) {
  const transactionId = store.nextTeamTransactionId;
  const createdAt = Date.now();
  store.nextTeamTransactionId += 1;
  ensureTeamCollections(team);
  team.transactions = [
    {
      id: transactionId,
      type: Number(transactionInput.type || 0),
      username: String(transactionInput.username || ""),
      amount: Math.abs(Number(transactionInput.amount || 0)),
      date: String(transactionInput.date || formatTeamTransactionDate(createdAt)),
      createdAt,
    },
    ...team.transactions,
  ].slice(0, MAX_TEAM_TRANSACTION_HISTORY);
}

function escapeXmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInstalledCatalogPartXml(catalogPart, installId) {
  const rawInstallCategoryId = Number(catalogPart.ci || catalogPart.pi);
  const installCategoryId = normalizedPartSlotId(rawInstallCategoryId);
  const parentCategoryId = catalogPart.pi;
  const partType = catalogPart.pt || catalogPart.t;
  const flow = tuningFlowAttribute(catalogPart);
  const attrs = {
    ai: installId,
    i: catalogPart.i,
    pi: parentCategoryId,
    ci: installCategoryId,
    pcid: parentCategoryId,
    categoryID: installCategoryId,
    t: catalogPart.t,
    pt: partType,
    n: catalogPart.n,
    p: catalogPart.p,
    pp: catalogPart.pp,
    g: catalogPart.g,
    di: catalogPart.di,
    pdi: catalogPart.pdi || catalogPart.di,
    b: catalogPart.b,
    bn: catalogPart.bn,
    mn: catalogPart.mn,
    l: catalogPart.l,
    in: 1,
    mo: catalogPart.mo,
    hp: catalogPart.hp,
    tq: catalogPart.tq,
    wt: catalogPart.wt,
    cc: catalogPart.cc,
    ps: catalogPart.ps,
    fe: catalogPart.fe,
    ug: catalogPart.ug,
    ar: catalogPart.ar,
    afm: catalogPart.afm,
    aft: catalogPart.aft,
    af: catalogPart.af,
    ff: catalogPart.ff,
    ef: catalogPart.ef,
    eef: catalogPart.eef,
    stockBoost: catalogPart.stockBoost,
    boostSetting: catalogPart.boostSetting,
    maxPsi: catalogPart.maxPsi,
    flow,
  };

  const keys = ["ai", "i", "pi", "ci", "pcid", "categoryID", "t", "pt", "n", "p", "pp", "g", "di", "pdi", "b", "bn", "mn", "l", "in", "mo", "hp", "tq", "wt", "cc", "ps", "fe", "ug", "ar", "afm", "aft", "af", "ff", "ef", "eef", "stockBoost", "boostSetting", "maxPsi", "flow"];
  const rendered = keys
    .filter((key) => attrs[key] !== undefined && attrs[key] !== null && attrs[key] !== "")
    .map((key) => `${key}='${escapeXmlAttribute(attrs[key])}'`)
    .join(" ");

  return `<p ${rendered}/>`;
}

function tuningFlowAttribute(part) {
  return part?.ff ?? part?.ef ?? part?.af ?? part?.eef;
}

function addClientPartAliases(xml) {
  let output = String(xml || "");
  const parentCategoryId = getXmlAttribute(output, "pi");
  const installCategoryId = getXmlAttribute(output, "ci") || parentCategoryId;
  const flow = getXmlAttribute(output, "ff")
    || getXmlAttribute(output, "ef")
    || getXmlAttribute(output, "af")
    || getXmlAttribute(output, "eef");

  if (parentCategoryId) {
    output = setXmlAttribute(output, "pcid", parentCategoryId);
  }
  if (installCategoryId) {
    output = setXmlAttribute(output, "categoryID", installCategoryId);
  }
  if (flow) {
    output = setXmlAttribute(output, "flow", flow);
  }

  return output;
}

function upsertInstalledPartXml(partsXml, slotId, partXml) {
  const normalizedSlotId = normalizedPartSlotId(slotId);
  const keptPartsXml = collectPartXmlEntries(partsXml)
    .filter((entry) => normalizedPartSlotIdFromAttrs(entry.attrs) !== normalizedSlotId)
    .map((entry) => entry.raw)
    .join("");

  return `${keptPartsXml}${partXml}`;
}

function normalizedPartSlotId(slotId) {
  const numericSlotId = Number(slotId || 0);

  if (TRACTION_CONTROL_CATEGORY_IDS.has(numericSlotId)) {
    return TRACTION_CONTROL_CATEGORY_ID;
  }

  if (NITROUS_SHOT_CATEGORY_IDS.has(numericSlotId)) {
    return NITROUS_SHOT_CATEGORY_ID;
  }

  return canonicalInstallSlotId(numericSlotId);
}

function normalizedPartSlotIdFromAttrs(attrs = {}) {
  const candidateSlotIds = [attrs.ci, attrs.categoryID, attrs.pi, attrs.pcid]
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const tractionControlSlotId = candidateSlotIds.find((value) => TRACTION_CONTROL_CATEGORY_IDS.has(value));
  if (tractionControlSlotId) {
    return TRACTION_CONTROL_CATEGORY_ID;
  }

  const nitrousSlotId = candidateSlotIds.find((value) => NITROUS_SHOT_CATEGORY_IDS.has(value));

  return nitrousSlotId ? NITROUS_SHOT_CATEGORY_ID : normalizedPartSlotId(candidateSlotIds[0] || 0);
}

function normalizedPartSlotIdFromXml(xml) {
  return normalizedPartSlotIdFromAttrs(parseXmlAttributes(xml));
}

function collectPartXmlEntries(partsXml) {
  return [...String(partsXml || "").matchAll(/<p\b[^>]*\/>/g)].map((match) => ({
    raw: match[0],
    attrs: parseXmlAttributes(match[0]),
  }));
}

function parseXmlAttributes(xml) {
  const attrs = {};
  for (const match of String(xml || "").matchAll(/\b([A-Za-z_][A-Za-z0-9_-]*)=(['"])(.*?)\2/g)) {
    attrs[match[1]] = match[3];
  }
  return attrs;
}

function findInstalledPartEntryBySlot(partsXml, slotId) {
  const normalizedSlotId = normalizedPartSlotId(slotId);

  return collectPartXmlEntries(partsXml)
    .find((entry) => normalizedPartSlotIdFromAttrs(entry.attrs) === normalizedSlotId) || null;
}

function installedPartMatchesCatalogPart(installedPartEntry, catalogPart) {
  const existingPartId = Number(installedPartEntry?.attrs?.i || 0);
  const purchasedPartId = Number(catalogPart?.i || 0);
  if (!existingPartId || existingPartId !== purchasedPartId) {
    return false;
  }

  const slotId = normalizedPartSlotId(catalogPart?.ci || catalogPart?.pi);
  if ([160, 161, 162, 163].includes(slotId)) {
    const existingDesignId = String(installedPartEntry?.attrs?.di || installedPartEntry?.attrs?.pdi || "");
    const purchasedDesignId = String(catalogPart?.di || catalogPart?.pdi || "");
    const existingFileExt = String(installedPartEntry?.attrs?.fe || "");
    const purchasedFileExt = String(catalogPart?.fe || "");

    return existingDesignId === purchasedDesignId && existingFileExt === purchasedFileExt;
  }

  return true;
}

function findInstalledPartEntryByInstallId(partsXml, installId) {
  const normalizedInstallId = String(installId || "");

  return collectPartXmlEntries(partsXml)
    .find((entry) => String(entry.attrs.ai || "") === normalizedInstallId) || null;
}

function removeInstalledPartEntryByInstallId(partsXml, installId) {
  const normalizedInstallId = String(installId || "");

  return collectPartXmlEntries(partsXml)
    .filter((entry) => String(entry.attrs.ai || "") !== normalizedInstallId)
    .map((entry) => entry.raw)
    .join("");
}

function getXmlAttribute(xml, name) {
  const pattern = new RegExp(`\\b${name}=(['"])(.*?)\\1`);
  const match = String(xml || "").match(pattern);

  return match ? match[2] : "";
}

function setXmlAttribute(xml, name, value) {
  const source = String(xml || "");
  const escapedValue = escapeXmlAttribute(value);
  const pattern = new RegExp(`\\b${name}=(['"])(.*?)\\1`);

  if (pattern.test(source)) {
    return source.replace(pattern, `${name}='${escapedValue}'`);
  }

  return source.replace(/\/>$/, ` ${name}='${escapedValue}'/>`);
}

function firstNumericAttribute(attrs, keys) {
  for (const key of keys) {
    const value = Number(attrs?.[key]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return 0;
}

function boostPsiFromPartName(attrs) {
  const text = `${attrs?.n || ""} ${attrs?.mn || ""}`;
  const match = text.match(/(\d+(?:\.\d+)?)\s*psi\b/i);

  return match ? Math.max(0, Number(match[1]) || 0) : 0;
}

function fallbackMaxPsiForBoostSlot(slotId) {
  if (Number(slotId) === 87) {
    return 47;
  }
  if (Number(slotId) === 81) {
    return 20;
  }

  return 0;
}

function fallbackStockBoostForBoostSlot(slotId, maxPsi) {
  const fallback = Number(slotId) === 87 ? 8 : Number(slotId) === 81 ? 6 : 0;

  return maxPsi > 0 ? Math.min(fallback, maxPsi) : fallback;
}

function boostDefaultsFromPartAttrs(attrs) {
  const slotId = normalizedPartSlotId(attrs?.ci || attrs?.pi || 0);
  if (!BOOST_SOURCE_CATEGORY_IDS.has(slotId)) {
    return null;
  }

  const maxPsi = firstNumericAttribute(attrs, ["maxPsi", "boostLimit", "boostMax", "psi"])
    || boostPsiFromPartName(attrs)
    || fallbackMaxPsiForBoostSlot(slotId);
  const stockBoost = firstNumericAttribute(attrs, ["stockBoost", "baseBoost", "defaultBoost", "boostSetting"])
    || fallbackStockBoostForBoostSlot(slotId, maxPsi);

  return {
    slotId,
    maxPsi: Number(maxPsi.toFixed(3)),
    stockBoost: Number(Math.min(stockBoost, maxPsi || stockBoost).toFixed(3)),
  };
}

function syncDynoBoostSettingFromInstalledBoostPart(targetCar) {
  const boostSource = collectPartXmlEntries(targetCar?.partsXml || "")
    .map((entry) => ({
      entry,
      defaults: boostDefaultsFromPartAttrs(entry.attrs),
    }))
    .filter((item) => item.defaults)
    .sort((left, right) => right.defaults.maxPsi - left.defaults.maxPsi)[0];

  if (!boostSource) {
    if (!hasInstalledForcedInduction(targetCar?.partsXml || "")) {
      targetCar.dynoBoostSetting = 0;
    }
    return;
  }

  // Set boost to the part's max PSI so the player gets full benefit of the
  // new turbo/supercharger immediately. Previously this was stockBoost which
  // caused "power not holding" — players would install a bigger turbo and
  // lose their tuned boost setting, getting reset to a low stock value.
  const currentBoost = Number(targetCar.dynoBoostSetting || 0);
  const newMaxPsi = boostSource.defaults.maxPsi;
  const newStockBoost = boostSource.defaults.stockBoost;

  // If the player had a boost setting within the old part's range, carry it
  // forward clamped to the new part's max. Otherwise use the new part's max.
  if (currentBoost > 0 && currentBoost <= newMaxPsi) {
    targetCar.dynoBoostSetting = currentBoost;
  } else {
    targetCar.dynoBoostSetting = newMaxPsi;
  }
}

function normalizeCarAfterPartInventoryChange(targetCar) {
  if (!targetCar) {
    return;
  }

  targetCar.partsXml = ensureStockEngineInstalled(
    targetCar.catalogCarId,
    targetCar.partsXml || "",
  );

  if (!hasInstalledForcedInduction(targetCar.partsXml)) {
    targetCar.engineTypeId = ENGINE_TYPE_NATURAL;
    targetCar.dynoBoostSetting = 0;
  }

  syncDynoBoostSettingFromInstalledBoostPart(targetCar);
  const catalogCar = getCatalogCar(targetCar.catalogCarId);
  const installedWheel = findInstalledPartEntryBySlot(targetCar.partsXml, WHEEL_CATEGORY_ID);
  const installedTire = findInstalledPartEntryBySlot(targetCar.partsXml, TIRE_CATEGORY_ID);
  const installedGearRatioPart = findInstalledPartEntryBySlot(targetCar.partsXml, GEAR_RATIO_CATEGORY_ID);

  if (!installedWheel) {
    const oemWheel = resolveCatalogCarOemWheel({
      catalogCarId: targetCar.catalogCarId,
      wheelDesignId: catalogCar?.wheelDesignId,
      wheelSize: catalogCar?.wheelSize,
    });
    targetCar.wheelPartId = STOCK_WHEEL_PART_ID;
    targetCar.wheelDesignId = oemWheel.designId;
    targetCar.wheelSize = oemWheel.size;
  }

  if (!installedTire) {
    targetCar.tirePartId = STOCK_TIRE_PART_ID;
    targetCar.tireDesignId = 1;
    targetCar.tireSize = STOCK_TIRE_SIZE;
  }

  const hasSavedGearRatios = Boolean(
    targetCar?.gearRatios && Object.keys(targetCar.gearRatios).length > 0,
  );
  if (
    !hasSavedGearRatios
    && (!installedGearRatioPart || !allowsCustomGearRatios(installedGearRatioPart.attrs))
  ) {
    delete targetCar.gearRatios;
    delete targetCar.dynoGearRatios;
  }

  targetCar.engineDamage = filterRaceDamageForInstalledFluids(
    targetCar,
    normalizeEngineDamageState(targetCar.engineDamage),
  );
}

function getSparePartSellValueFromXml(partXml) {
  const price = Number(getXmlAttribute(partXml, "p") || 0);

  return Number.isFinite(price) && price > 0 ? Math.floor(price * 0.4) : 0;
}

function getSparePartPointSellValueFromXml(partXml) {
  const price = Number(getXmlAttribute(partXml, "pp") || 0);

  return Number.isFinite(price) && price > 0 ? Math.floor(price * 0.4) : 0;
}

function renderPartForBin(partXml, partsById, overrides = {}) {
  let xml = String(partXml || "");
  const partId = Number(getXmlAttribute(xml, "i") || 0);
  const catalogPart = partsById?.get?.(partId);

  if (catalogPart) {
    const rawSlotId = Number(catalogPart.ci || catalogPart.pi);
    const slotId = normalizedPartSlotId(rawSlotId);
    const parentCategoryId = FORCED_INDUCTION_SYSTEM_CATEGORY_IDS.has(slotId) ? slotId : catalogPart.pi;
    xml = setXmlAttribute(
      xml,
      "pi",
      parentCategoryId,
    );
    xml = setXmlAttribute(xml, "ci", slotId);
    for (const key of ["mo", "hp", "tq", "wt", "cc", "ps", "ar", "stockBoost", "boostSetting", "maxPsi"]) {
      if (catalogPart[key] !== undefined && catalogPart[key] !== null && catalogPart[key] !== "") {
        xml = setXmlAttribute(xml, key, catalogPart[key]);
      }
    }
    for (const key of ["afm", "aft", "af", "ff", "ef", "eef"]) {
      if (catalogPart[key] !== undefined && catalogPart[key] !== null && catalogPart[key] !== "") {
        xml = setXmlAttribute(xml, key, catalogPart[key]);
      }
    }
    const flow = tuningFlowAttribute(catalogPart);
    if (flow !== undefined && flow !== null && flow !== "") {
      xml = setXmlAttribute(xml, "flow", flow);
    }
  } else if (Number(getXmlAttribute(xml, "ci") || getXmlAttribute(xml, "pi") || 0) === 133) {
    const horsepower = Number(getXmlAttribute(xml, "hp") || 0);
    const torque = Number(getXmlAttribute(xml, "tq") || 0);
    const engineFlow = Math.max(1, Number(((horsepower + torque) / 20).toFixed(3)));
    xml = setXmlAttribute(xml, "eef", engineFlow);
    xml = setXmlAttribute(xml, "flow", engineFlow);
  }

  if (ENGINE_DIAGNOSTIC_TOOL_PART_IDS.has(partId)) {
    xml = setXmlAttribute(xml, "pi", ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID);
    xml = setXmlAttribute(xml, "ci", ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID);
    xml = setXmlAttribute(xml, "pcid", ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID);
    xml = setXmlAttribute(xml, "categoryID", ENGINE_DIAGNOSTIC_TOOL_CATEGORY_ID);
  }

  for (const [key, value] of Object.entries(overrides)) {
    xml = setXmlAttribute(xml, key, value);
  }

  return addClientPartAliases(xml);
}

function renderInstalledPartsForBin(installedPartsXml = "", partsById) {
  return collectPartXmlEntries(installedPartsXml)
    .map((entry) => renderPartForBin(entry.raw, partsById))
    .join("");
}

function renderSparePartXml(sparePart, partsById) {
  let xml = String(sparePart?.partXml || "");
  if (!xml) {
    return "";
  }

  return renderPartForBin(xml, partsById, {
    ai: sparePart.id,
    in: 0,
    p: getSparePartSellValueFromXml(sparePart.partXml),
    pp: getSparePartPointSellValueFromXml(sparePart.partXml),
  });
}

function renderPartsBinXml(installedPartsXml = "", spareParts = [], partsById) {
  const installedXml = renderInstalledPartsForBin(installedPartsXml, partsById);
  const spareXml = spareParts
    .map((sparePart) => renderSparePartXml(sparePart, partsById))
    .filter((partXml) => {
      const slotId = Number(getXmlAttribute(partXml, "ci") || getXmlAttribute(partXml, "pi") || 0);
      return !FORCED_INDUCTION_SYSTEM_CATEGORY_IDS.has(slotId)
        || FORCED_INDUCTION_LAUNCH_CATEGORY_IDS.has(slotId);
    })
    .filter(Boolean)
    .join("");

  return `<n2>${installedXml}${spareXml}</n2>`;
}

function normalizeAccountSpares(account) {
  account.spareParts = Array.isArray(account.spareParts) ? account.spareParts : [];
  return account.spareParts;
}

function updateInstalledPartColors(partsXml, shouldPaint, color) {
  return String(partsXml || "").replace(/<p\b[^>]*\/>/g, (partXml) => {
    const categoryId = Number(getXmlAttribute(partXml, "ci") || getXmlAttribute(partXml, "pi"));
    const installed = Number(getXmlAttribute(partXml, "in") || 0) === 1;

    return installed && shouldPaint(categoryId) ? setXmlAttribute(partXml, "cc", color) : partXml;
  });
}

function clearInstalledPartColors(partsXml, shouldClear) {
  return String(partsXml || "").replace(/<p\b[^>]*\/>/g, (partXml) => {
    const categoryId = Number(getXmlAttribute(partXml, "ci") || getXmlAttribute(partXml, "pi"));
    const installed = Number(getXmlAttribute(partXml, "in") || 0) === 1;

    return installed && shouldClear(categoryId) ? setXmlAttribute(partXml, "cc", 0) : partXml;
  });
}

function garageCarsFor(account) {
  return [
    account?.starterCar,
    ...(Array.isArray(account?.garageCars) ? account.garageCars : []),
  ].filter(Boolean);
}

function economySnapshot(account) {
  return {
    money: normalizeBalance(account?.money, DEFAULT_STARTING_MONEY),
    points: normalizeBalance(account?.points, DEFAULT_STARTING_POINTS),
    garageCarCount: garageCarsFor(account).length,
  };
}

function recordBalanceAudit(auditLog, account, source, before, after, meta = {}) {
  if (!auditLog || !account) {
    return;
  }

  const moneyDelta = after.money - before.money;
  const pointsDelta = after.points - before.points;
  const garageCarsDelta = after.garageCarCount - before.garageCarCount;
  if (moneyDelta === 0 && pointsDelta === 0 && garageCarsDelta === 0) {
    return;
  }

  void auditLog.record({
    accountId: Number(account.id || 0),
    username: String(account.username || ""),
    source: String(source || "unknown"),
    accountCreatedAt: String(account.createdAt || ""),
    moneyBefore: before.money,
    moneyAfter: after.money,
    moneyDelta,
    pointsBefore: before.points,
    pointsAfter: after.points,
    pointsDelta,
    garageCarsBefore: before.garageCarCount,
    garageCarsAfter: after.garageCarCount,
    garageCarsDelta,
    creationIp: String(account.creationIpAddress || ""),
    ...meta,
  });
}

function findGarageCar(account, accountCarId) {
  const requestedCarId = Number(accountCarId || 0);

  if (requestedCarId > 0) {
    return garageCarsFor(account).find((car) => Number(car.accountCarId || 0) === requestedCarId) || null;
  }

  const defaultCarId = Number(account?.defaultCarAccountCarId || 0);
  if (defaultCarId > 0) {
    return garageCarsFor(account).find((car) => Number(car.accountCarId || 0) === defaultCarId) || null;
  }

  return garageCarsFor(account).find((car) => car.selected) || account?.starterCar || garageCarsFor(account)[0] || null;
}

function defaultGarageCarFields(input = {}) {
  const catalogCar = getCatalogCar(input.catalogCarId);
  const oemWheel = resolveCatalogCarOemWheel({
    catalogCarId: Number(input.catalogCarId) || DEFAULT_STARTER_CATALOG_CAR_ID,
    wheelDesignId: input.wheelDesignId || catalogCar?.wheelDesignId,
    wheelSize: input.wheelSize || catalogCar?.wheelSize,
  });

  return {
    accountCarId: Number(input.accountCarId || 0),
    catalogCarId: Number(input.catalogCarId) || DEFAULT_STARTER_CATALOG_CAR_ID,
    locationId: Number(input.locationId) || DEFAULT_LOCATION_ID,
    selected: Boolean(input.selected),
    color: normalizeCarColor(input.color),
    wheelPartId: Number(input.wheelPartId) || STOCK_WHEEL_PART_ID,
    wheelDesignId: oemWheel.designId,
    wheelSize: oemWheel.size,
    tirePartId: Number(input.tirePartId) || 1300,
    tireDesignId: Number(input.tireDesignId) || 1,
    tireSize: Number(input.tireSize) || STOCK_TIRE_SIZE,
    plateId: Number(input.plateId || DEFAULT_PLATE_ID),
    plateNumber: String(input.plateNumber || samplePlateNumber(input.plateId || DEFAULT_PLATE_ID)),
    partsXml: ensureStockEngineInstalled(
      Number(input.catalogCarId) || DEFAULT_STARTER_CATALOG_CAR_ID,
      input.partsXml || "",
    ),
  };
}

function normalizeStarterCatalogCarId(catalogCarId) {
  const requestedCarId = Number(catalogCarId || 0);
  return STARTER_CATALOG_CAR_IDS.includes(requestedCarId) ? requestedCarId : DEFAULT_STARTER_CATALOG_CAR_ID;
}

function markSelectedCar(account, accountCarId) {
  const selectedCarId = Number(accountCarId || 0);

  for (const car of garageCarsFor(account)) {
    car.selected = Number(car.accountCarId || 0) === selectedCarId;
  }

  account.defaultCarAccountCarId = selectedCarId || Number(account.starterCar?.accountCarId || account.id || 0);
}

function cloneGarageCar(car) {
  return JSON.parse(JSON.stringify(car || {}));
}

function garageCarBuildLocked(car) {
  return Boolean(car?.isLocked);
}

function lockedGarageCarMutationResult() {
  return { ok: false, code: -9, reason: "car-locked" };
}

function clearUsedCarListingFields(car) {
  if (!car) {
    return car;
  }

  delete car.usedCarListingId;
  delete car.usedCarListedAt;
  delete car.usedCarAskingPrice;
  delete car.usedCarCurrencyType;
  delete car.usedCarAllowTrades;
  delete car.usedCarPrivateListing;
  delete car.lk;
  return car;
}

function removeGarageCarFromAccount(account, accountCarId) {
  const targetCarId = Number(accountCarId || 0);
  if (!targetCarId) {
    return null;
  }

  const removedCar = findGarageCar(account, targetCarId);
  if (!removedCar) {
    return null;
  }

  if (Number(account.starterCar?.accountCarId || 0) === targetCarId) {
    account.garageCars = Array.isArray(account.garageCars) ? account.garageCars : [];
    account.starterCar = account.garageCars.shift() || null;
  } else {
    account.garageCars = Array.isArray(account.garageCars)
      ? account.garageCars.filter((car) => Number(car.accountCarId || 0) !== targetCarId)
      : [];
  }

  const remainingCars = garageCarsFor(account);
  if (remainingCars.length > 0) {
    const currentDefaultCarId = Number(account.defaultCarAccountCarId || 0);
    const defaultStillExists = remainingCars.some((car) => Number(car.accountCarId || 0) === currentDefaultCarId);
    markSelectedCar(account, defaultStillExists ? currentDefaultCarId : remainingCars[0]?.accountCarId);
  } else {
    account.defaultCarAccountCarId = 0;
  }

  return removedCar;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(String(password), salt, PASSWORD_KEY_LENGTH).toString("hex");

  return {
    algorithm: "scrypt",
    salt,
    key,
  };
}

export function verifyPassword(password, passwordHash) {
  if (!passwordHash || passwordHash.algorithm !== "scrypt") {
    return false;
  }

  const actual = Buffer.from(passwordHash.key, "hex");
  const expected = scryptSync(String(password), passwordHash.salt, actual.length);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeNextGarageCarId(store) {
  const highestCarId = store.accounts.reduce((highest, account) => {
    const starterCarId = Number(account?.starterCar?.accountCarId || 0);
    const garageCarIds = Array.isArray(account?.garageCars)
      ? account.garageCars.map((car) => Number(car?.accountCarId || 0))
      : [];

    return Math.max(highest, starterCarId, ...garageCarIds);
  }, 0);
  const configuredNextId = Number(store.nextGarageCarId || 0);

  return Math.max(configuredNextId, highestCarId + 1, 1);
}

function normalizeNextSparePartId(store) {
  const highestPartId = store.accounts.reduce((highest, account) => {
    const sparePartIds = Array.isArray(account?.spareParts)
      ? account.spareParts.map((part) => Number(part?.id || 0))
      : [];

    return Math.max(highest, ...sparePartIds);
  }, 0);
  const configuredNextId = Number(store.nextSparePartId || 0);

  return Math.max(configuredNextId, highestPartId + 1, 1);
}

function normalizeNextUsedCarListingId(store) {
  const highestListingId = Array.isArray(store.usedCarListings)
    ? store.usedCarListings.reduce((highest, listing) => Math.max(highest, Number(listing?.id || 0)), 0)
    : 0;
  const configuredNextId = Number(store.nextUsedCarListingId || 0);

  return Math.max(configuredNextId, highestListingId + 1, 1);
}

function normalizeNextUsedCarTradeId(store) {
  const highestTradeId = Array.isArray(store.usedCarTrades)
    ? store.usedCarTrades.reduce((highest, trade) => Math.max(highest, Number(trade?.id || 0)), 0)
    : 0;
  const configuredNextId = Number(store.nextUsedCarTradeId || 0);

  return Math.max(configuredNextId, highestTradeId + 1, 1);
}

function normalizeNextRemarkId(store) {
  const highestRemarkId = Array.isArray(store.remarks)
    ? store.remarks.reduce((highest, remark) => Math.max(highest, Number(remark?.id || 0)), 0)
    : 0;
  const configuredNextId = Number(store.nextRemarkId || 0);

  return Math.max(configuredNextId, highestRemarkId + 1, 1);
}

function normalizeNextMailId(store) {
  const highestMailId = Array.isArray(store.mail)
    ? store.mail.reduce((highest, mail) => Math.max(highest, Number(mail?.id || 0)), 0)
    : 0;
  const configuredNextId = Number(store.nextMailId || 0);

  return Math.max(configuredNextId, highestMailId + 1, 1);
}

function normalizeNextTeamId(store) {
  const highestTeamId = Array.isArray(store.teams)
    ? store.teams.reduce((highest, team) => Math.max(highest, Number(team?.id || 0)), 0)
    : 0;
  const configuredNextId = Number(store.nextTeamId || 0);

  return Math.max(configuredNextId, highestTeamId + 1, 1);
}

function normalizeNextTeamApplicationId(store) {
  const highestApplicationId = Array.isArray(store.teams)
    ? store.teams.reduce((highest, team) => {
      const applications = Array.isArray(team?.applications) ? team.applications : [];
      return applications.reduce((innerHighest, application) => (
        Math.max(innerHighest, Number(application?.id || 0))
      ), highest);
    }, 0)
    : 0;
  const configuredNextId = Number(store.nextTeamApplicationId || 0);

  return Math.max(configuredNextId, highestApplicationId + 1, 1);
}

function normalizeNextTeamTransactionId(store) {
  const highestTransactionId = Array.isArray(store.teams)
    ? store.teams.reduce((highest, team) => {
      const transactions = Array.isArray(team?.transactions) ? team.transactions : [];
      return transactions.reduce((innerHighest, transaction) => (
        Math.max(innerHighest, Number(transaction?.id || 0))
      ), highest);
    }, 0)
    : 0;
  const configuredNextId = Number(store.nextTeamTransactionId || 0);

  return Math.max(configuredNextId, highestTransactionId + 1, 1);
}

function allocateGarageCarId(store) {
  store.nextGarageCarId = normalizeNextGarageCarId(store);
  const accountCarId = store.nextGarageCarId;
  store.nextGarageCarId += 1;

  return accountCarId;
}

function allocateSparePartId(store) {
  store.nextSparePartId = normalizeNextSparePartId(store);
  const sparePartId = store.nextSparePartId;
  store.nextSparePartId += 1;

  return sparePartId;
}

function allocateTeamId(store) {
  store.nextTeamId = normalizeNextTeamId(store);
  const teamId = store.nextTeamId;
  store.nextTeamId += 1;

  return teamId;
}

function allocateUsedCarListingId(store) {
  store.nextUsedCarListingId = normalizeNextUsedCarListingId(store);
  const listingId = store.nextUsedCarListingId;
  store.nextUsedCarListingId += 1;

  return listingId;
}

function allocateUsedCarTradeId(store) {
  store.nextUsedCarTradeId = normalizeNextUsedCarTradeId(store);
  const tradeId = store.nextUsedCarTradeId;
  store.nextUsedCarTradeId += 1;

  return tradeId;
}

function allocateRemarkId(store) {
  store.nextRemarkId = normalizeNextRemarkId(store);
  const remarkId = store.nextRemarkId;
  store.nextRemarkId += 1;

  return remarkId;
}

function allocateMailId(store) {
  store.nextMailId = normalizeNextMailId(store);
  const mailId = store.nextMailId;
  store.nextMailId += 1;

  return mailId;
}

function addSparePartFromInstalledXml(store, account, partXml) {
  const partId = Number(getXmlAttribute(partXml, "i") || 0);
  const installId = String(getXmlAttribute(partXml, "ai") || "");

  if (!partId || installId === "0") {
    return null;
  }

  const sparePart = {
    id: allocateSparePartId(store),
    partId,
    partXml: setXmlAttribute(partXml, "in", 0),
    createdAt: new Date().toISOString(),
  };

  normalizeAccountSpares(account).push(sparePart);

  return sparePart;
}

function addSparePartFromCatalogPart(store, account, catalogPart, installId) {
  if (!catalogPart?.i) {
    return null;
  }

  return addSparePartFromInstalledXml(
    store,
    account,
    renderInstalledCatalogPartXml(catalogPart, installId || 0),
  );
}

function dedupeInstalledPartsBySlot({
  store,
  account,
  car,
  partsById = null,
  moveDuplicatesToSpares = true,
}) {
  if (!car) {
    return { changed: false, partsXml: "", duplicatesRemoved: 0 };
  }

  const entries = collectPartXmlEntries(car.partsXml);
  const keptBySlot = new Map();
  let changed = false;
  let duplicatesRemoved = 0;

  for (const entry of entries) {
    const normalizedXml = partsById?.get
      ? renderPartForBin(entry.raw, partsById, { in: getXmlAttribute(entry.raw, "in") || 1 })
      : entry.raw;
    const slotId = normalizedPartSlotIdFromXml(normalizedXml);

    if (partsById?.get && normalizedXml !== entry.raw) {
      changed = true;
    }

    if (!slotId) {
      keptBySlot.set(`missing-${keptBySlot.size}`, normalizedXml);
      continue;
    }

    const existingXml = keptBySlot.get(slotId);
    if (existingXml) {
      if (moveDuplicatesToSpares && store && account) {
        addSparePartFromInstalledXml(store, account, existingXml);
      }
      duplicatesRemoved += 1;
      changed = true;
    }
    keptBySlot.set(slotId, normalizedXml);
  }

  const partsXml = [...keptBySlot.values()].join("");
  if (partsXml !== String(car.partsXml || "")) {
    car.partsXml = partsXml;
    changed = true;
  }

  return { changed, partsXml, duplicatesRemoved };
}

function normalizeInstalledPartsForCatalog(store, account, car, partsById) {
  if (!partsById?.get || !car) {
    return { changed: false, partsXml: String(car?.partsXml || "") };
  }

  return dedupeInstalledPartsBySlot({ store, account, car, partsById });
}

function ensureCurrentWheelTirePartsInstalled(car, partsById) {
  if (!partsById?.get || !car) {
    return { changed: false, partsXml: String(car?.partsXml || "") };
  }

  let partsXml = String(car.partsXml || "");
  let changed = false;
  const currentParts = [
    { slotId: WHEEL_CATEGORY_ID, partId: car.wheelPartId },
    { slotId: TIRE_CATEGORY_ID, partId: car.tirePartId },
  ];

  for (const { slotId, partId } of currentParts) {
    if (findInstalledPartEntryBySlot(partsXml, slotId)) {
      continue;
    }

    const catalogPart = partsById.get(Number(partId || 0));
    if (!catalogPart) {
      continue;
    }

    partsXml = upsertInstalledPartXml(
      partsXml,
      slotId,
      renderInstalledCatalogPartXml(catalogPart, 0),
    );
    changed = true;
  }

  if (changed) {
    car.partsXml = partsXml;
  }

  return { changed, partsXml };
}

function syncCurrentWheelTireFieldsFromInstalledParts(car) {
  if (!car) {
    return false;
  }

  let changed = false;
  const installedWheel = findInstalledPartEntryBySlot(car.partsXml, WHEEL_CATEGORY_ID);
  const installedTire = findInstalledPartEntryBySlot(car.partsXml, TIRE_CATEGORY_ID);

  if (installedWheel?.attrs) {
    const wheelPartId = Number(installedWheel.attrs.i || 0);
    if (wheelPartId > 0 && Number(car.wheelPartId || 0) !== wheelPartId) {
      car.wheelPartId = wheelPartId;
      changed = true;
    }
    car.wheelDesignId = Number(installedWheel.attrs.di || installedWheel.attrs.pdi || car.wheelDesignId || 1);
    car.wheelSize = Number(installedWheel.attrs.ps || car.wheelSize || 17);
  }

  if (installedTire?.attrs) {
    const tirePartId = Number(installedTire.attrs.i || 0);
    if (tirePartId > 0 && Number(car.tirePartId || 0) !== tirePartId) {
      car.tirePartId = tirePartId;
      changed = true;
    }
    car.tireDesignId = Number(installedTire.attrs.di || installedTire.attrs.pdi || car.tireDesignId || 1);
    car.tireSize = Number(installedTire.attrs.ps || car.tireSize || STOCK_TIRE_SIZE);
  }

  return changed;
}

function normalizeSparePartsForCatalog(account, partsById) {
  if (!partsById?.get) {
    return false;
  }

  const spareParts = normalizeAccountSpares(account);
  let changed = false;

  for (const sparePart of spareParts) {
    const normalizedXml = renderPartForBin(sparePart.partXml, partsById, {
      in: getXmlAttribute(sparePart.partXml, "in") || 0,
    });
    if (normalizedXml !== sparePart.partXml) {
      sparePart.partXml = normalizedXml;
      changed = true;
    }
  }

  return changed;
}

function systemCategoryIdsForEngineType(engineTypeId) {
  const normalizedEngineTypeId = Number(engineTypeId || 0);
  if (normalizedEngineTypeId === ENGINE_TYPE_NATURAL) {
    return [HEADER_CATEGORY_ID];
  }
  if (normalizedEngineTypeId === ENGINE_TYPE_TURBO) {
    return TURBO_SYSTEM_CATEGORY_IDS;
  }
  if (normalizedEngineTypeId === ENGINE_TYPE_SUPERCHARGER) {
    return SUPERCHARGER_SYSTEM_CATEGORY_IDS;
  }
  return [];
}

function installedForcedInductionCategoryIds(partsXml) {
  const installedSlots = new Set(
    collectPartXmlEntries(partsXml)
      .map((entry) => Number(entry.attrs.ci || entry.attrs.pi || 0))
      .filter((slotId) => FORCED_INDUCTION_SYSTEM_CATEGORY_IDS.has(slotId)),
  );

  if (SUPERCHARGER_SYSTEM_CATEGORY_IDS.some((slotId) => installedSlots.has(slotId))) {
    return SUPERCHARGER_SYSTEM_CATEGORY_IDS;
  }
  if (TURBO_SYSTEM_CATEGORY_IDS.some((slotId) => installedSlots.has(slotId))) {
    return TURBO_SYSTEM_CATEGORY_IDS;
  }
  return [];
}

function hasInstalledForcedInduction(partsXml) {
  return installedForcedInductionCategoryIds(partsXml).length > 0;
}

function hasInstalledNitrous(partsXml) {
  const entries = collectPartXmlEntries(partsXml);
  const hasBottle = entries.some((entry) => NITROUS_BOTTLE_CATEGORY_IDS.has(normalizedPartSlotIdFromAttrs(entry.attrs)));
  const hasShot = entries.some((entry) => NITROUS_SHOT_CATEGORY_IDS.has(normalizedPartSlotIdFromAttrs(entry.attrs)));
  return hasBottle && hasShot;
}

function hasInstalledFluidCategory(partsXml, categoryIds) {
  return collectPartXmlEntries(partsXml).some((entry) => categoryIds.has(normalizedPartSlotIdFromAttrs(entry.attrs)));
}

function filterRaceDamageForInstalledFluids(targetCar, damageState) {
  const filteredDamage = { ...(damageState || {}) };
  const partsXml = targetCar?.partsXml || "";

  if (!hasInstalledFluidCategory(partsXml, OIL_FLUID_CATEGORY_IDS)) {
    delete filteredDamage.oil;
  }
  if (!hasInstalledFluidCategory(partsXml, OIL_FILTER_FLUID_CATEGORY_IDS)) {
    delete filteredDamage.oilFilter;
  }
  if (!hasInstalledFluidCategory(partsXml, COOLANT_FLUID_CATEGORY_IDS)) {
    delete filteredDamage.coolant;
  }
  if (!hasInstalledNitrous(partsXml)) {
    delete filteredDamage.nitrousRemaining;
  }

  return filteredDamage;
}

function activeSystemCategoryIdsForCar(car) {
  return systemCategoryIdsForEngineType(car?.engineTypeId);
}

function canReplaceActiveSystemPart(car, categoryId) {
  return activeSystemCategoryIdsForCar(car).includes(Number(categoryId || 0));
}

function removeInstalledPartEntryBySlot(partsXml, slotId) {
  const normalizedSlotId = normalizedPartSlotId(slotId);

  return collectPartXmlEntries(partsXml)
    .filter((entry) => normalizedPartSlotIdFromAttrs(entry.attrs) !== normalizedSlotId)
    .map((entry) => entry.raw)
    .join("");
}

function renderSystemPartDescription(partXml) {
  const hp = Number(getXmlAttribute(partXml, "hp") || 0);
  const tq = Number(getXmlAttribute(partXml, "tq") || 0);
  const wt = Number(getXmlAttribute(partXml, "wt") || 0);
  const values = [];

  if (hp) {
    values.push(`${hp > 0 ? "+" : ""}${hp} hp`);
  }
  if (tq) {
    values.push(`${tq > 0 ? "+" : ""}${tq} tq`);
  }
  if (wt) {
    values.push(`${wt > 0 ? "+" : ""}${wt} lb`);
  }

  return values.join(", ");
}

function renderSystemPartsXml(targetCar, spareParts, engineTypeId, partsById) {
  const slotIds = systemCategoryIdsForEngineType(engineTypeId);
  const partsBySlot = new Map(slotIds.map((slotId) => [Number(slotId), []]));

  for (const slotId of slotIds) {
    const installedPart = findInstalledPartEntryBySlot(targetCar?.partsXml || "", slotId);
    if (installedPart?.raw) {
      partsBySlot.get(Number(slotId))?.push(renderPartForBin(installedPart.raw, partsById));
    }
  }

  for (const sparePart of spareParts) {
    const normalizedXml = renderSparePartXml(sparePart, partsById);
    const slotId = Number(getXmlAttribute(normalizedXml, "ci") || getXmlAttribute(normalizedXml, "pi") || 0);
    if (!partsBySlot.has(slotId)) {
      continue;
    }
    partsBySlot.get(slotId)?.push(normalizedXml.replace(/\/>$/, `>${escapeXmlAttribute(renderSystemPartDescription(normalizedXml))}</p>`));
  }

  const parentId = Number(engineTypeId || 0) === ENGINE_TYPE_NATURAL
    ? 16
    : Number(engineTypeId || 0) === ENGINE_TYPE_SUPERCHARGER ? 180 : 181;
  const categoriesXml = slotIds.map((slotId) => (
    `<c i='${Number(slotId)}' n='${escapeXmlAttribute(SYSTEM_CATEGORY_LABELS.get(Number(slotId)) || "System Parts")}' pi='${parentId}' c='0'>`
    + `${(partsBySlot.get(Number(slotId)) || []).join("")}</c>`
  )).join("");

  return `<n2>${categoriesXml}</n2>`;
}

function normalizeUsedCarCurrencyType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "p" || normalized === "point" || normalized === "points" ? "points" : "money";
}

function normalizeUsedCarPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? Math.floor(price) : 0;
}

function usedCarListingExpiresAt(daysDuration = 7) {
  const days = Math.min(Math.max(Number(daysDuration) || 7, 1), 30);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function usedCarListingActive(listing, now = Date.now()) {
  if (!listing || String(listing.status || "active") !== "active") {
    return false;
  }

  const expiresAt = Date.parse(listing.expiresAt || "");
  return !Number.isFinite(expiresAt) || expiresAt > now;
}

function usedCarListingPrivate(listing) {
  return String(listing?.privatePassword || "").length > 0 || Boolean(listing?.privateListing);
}

function activeUsedCarListingForCar(store, account, car) {
  const accountId = Number(account?.id || 0);
  const accountCarId = Number(car?.accountCarId || car?.i || 0);
  const listingId = Number(car?.usedCarListingId || 0);

  if (!accountId || !accountCarId || !Array.isArray(store?.usedCarListings)) {
    return null;
  }

  return store.usedCarListings.find((listing) => (
    usedCarListingActive(listing)
    && Number(listing.sellerAccountId || 0) === accountId
    && (
      (listingId > 0 && Number(listing.id || 0) === listingId)
      || Number(listing.accountCarId || 0) === accountCarId
    )
  )) || null;
}

function carHasActiveUsedCarListing(store, account, car) {
  return Boolean(activeUsedCarListingForCar(store, account, car));
}

function usedCarTradeStatusCode(status) {
  switch (String(status || "pending").toLowerCase()) {
    case "pending":
      return 1;
    case "accepted":
      return 2;
    case "declined":
      return 3;
    case "sold":
      return 4;
    case "traded":
      return 5;
    case "expired":
      return 6;
    case "cancelled":
    case "canceled":
    case "retracted":
      return 7;
    default:
      return 1;
  }
}

function usedCarTradePending(trade) {
  return String(trade?.status || "pending").toLowerCase() === "pending";
}

function usedCarPendingTradeCountForListing(store, listingId) {
  const normalizedListingId = Number(listingId || 0);
  if (!normalizedListingId || !Array.isArray(store?.usedCarTrades)) {
    return 0;
  }

  return store.usedCarTrades.filter((trade) => (
    usedCarTradePending(trade)
    && Number(trade.targetListingId || 0) === normalizedListingId
  )).length;
}

function hydrateUsedCarListingRecord(store, listing) {
  if (!listing) {
    return null;
  }

  const sellerAccount = store.accounts.find((account) => Number(account.id || 0) === Number(listing.sellerAccountId || 0));
  if (!sellerAccount) {
    return null;
  }

  const sellerCar = findGarageCar(sellerAccount, listing.accountCarId)
    || listing.carSnapshot
    || null;
  if (!sellerCar) {
    return null;
  }

  return {
    ...listing,
    sellerAccount,
    car: sellerCar,
    pendingTradeCount: usedCarListingActive(listing)
      ? usedCarPendingTradeCountForListing(store, listing.id)
      : 0,
  };
}

function hydrateUsedCarListing(store, listingId) {
  const listing = store.usedCarListings.find((item) => Number(item.id || 0) === Number(listingId || 0));
  if (!usedCarListingActive(listing)) {
    return null;
  }

  return hydrateUsedCarListingRecord(store, listing);
}

function hydrateUsedCarTrade(store, trade) {
  const offeredListing = hydrateUsedCarListing(store, trade?.offeredListingId);
  const targetListing = hydrateUsedCarListing(store, trade?.targetListingId);

  if (!offeredListing || !targetListing) {
    return null;
  }

  return {
    ...trade,
    statusCode: usedCarTradeStatusCode(trade?.status),
    offeredListing,
    targetListing,
  };
}

function createInstalledPartId(offset = 0) {
  return Math.floor(Date.now() % 1000000000) + Number(offset || 0);
}

async function readStore(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    const parsed = JSON.parse(text);
    const store = {
      ...emptyStore(),
      ...parsed,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      usedCarListings: Array.isArray(parsed.usedCarListings) ? parsed.usedCarListings : [],
      usedCarTrades: Array.isArray(parsed.usedCarTrades) ? parsed.usedCarTrades : [],
      mail: Array.isArray(parsed.mail) ? parsed.mail : [],
      remarks: Array.isArray(parsed.remarks) ? parsed.remarks : [],
      buddies: Array.isArray(parsed.buddies) ? parsed.buddies : [],
      buddyRequests: Array.isArray(parsed.buddyRequests) ? parsed.buddyRequests : [],
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      raceHistory: Array.isArray(parsed.raceHistory) ? parsed.raceHistory : [],
      raceLogs: Array.isArray(parsed.raceLogs) ? parsed.raceLogs : [],
    };

    store.nextGarageCarId = normalizeNextGarageCarId(store);
    store.nextSparePartId = normalizeNextSparePartId(store);
    store.nextUsedCarListingId = normalizeNextUsedCarListingId(store);
    store.nextUsedCarTradeId = normalizeNextUsedCarTradeId(store);
    store.nextRemarkId = normalizeNextRemarkId(store);
    store.nextMailId = normalizeNextMailId(store);
    store.nextTeamId = normalizeNextTeamId(store);
    store.nextTeamApplicationId = normalizeNextTeamApplicationId(store);
    store.nextTeamTransactionId = normalizeNextTeamTransactionId(store);

    return store;
  } catch (error) {
    if (error.code === "ENOENT") {
      return emptyStore();
    }
    throw error;
  }
}

async function writeStore(filePath, store) {
  const previousWrite = storeWriteQueues.get(filePath) || Promise.resolve();
  const nextWrite = previousWrite.catch(() => { }).then(async () => {
    await mkdir(dirname(filePath), { recursive: true });

    const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomBytes(6).toString("hex")}.tmp`;
    const text = `${JSON.stringify(store, null, 2)}\n`;

    JSON.parse(text);

    try {
      await writeFile(tempPath, text, { encoding: "utf8", flag: "wx" });
      await rename(tempPath, filePath);
    } catch (error) {
      await unlink(tempPath).catch(() => { });
      throw error;
    }
  });

  storeWriteQueues.set(filePath, nextWrite);

  try {
    await nextWrite;
  } finally {
    if (storeWriteQueues.get(filePath) === nextWrite) {
      storeWriteQueues.delete(filePath);
    }
  }
}

async function enqueueStoreOperation(filePath, task) {
  const previousOperation = storeOperationQueues.get(filePath) || Promise.resolve();
  const nextOperation = previousOperation.catch(() => { }).then(task);

  storeOperationQueues.set(filePath, nextOperation);

  try {
    return await nextOperation;
  } finally {
    if (storeOperationQueues.get(filePath) === nextOperation) {
      storeOperationQueues.delete(filePath);
    }
  }
}

function serializedStoreInstance(store) {
  return new Proxy(store, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function" || property === "constructor") {
        return value;
      }

      return (...args) => enqueueStoreOperation(target.filePath, () => value.apply(target, args));
    },
  });
}

function validateCreateAccount(input) {
  const username = normalizeUsername(input.username);
  const password = String(input.password ?? "");
  const confirmPassword = String(input.confirmPassword ?? password);
  const email = String(input.email ?? "").trim();
  const birthYear = String(input.birthYear ?? "").trim();

  if (username.length < 3 || username.length > 16) {
    return { ok: false, code: -6, reason: "invalid-username-length" };
  }
  if (!validAccountUsername(username)) {
    return { ok: false, code: -4, reason: "invalid-username" };
  }
  if (password.length < 1 || password.length > 32) {
    return { ok: false, code: -7, reason: "invalid-password-length" };
  }
  if (/\s/.test(password)) {
    return { ok: false, code: -5, reason: "invalid-password" };
  }
  if (password !== confirmPassword) {
    return { ok: false, code: -8, reason: "password-mismatch" };
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, code: -2, reason: "invalid-email" };
  }

  const birthYearNumber = Number(birthYear);
  if (birthYear && (!Number.isInteger(birthYearNumber) || birthYearNumber < 1900)) {
    return { ok: false, code: -11, reason: "invalid-birth-year" };
  }

  return {
    ok: true,
    username,
    password,
    email,
    birthYear,
  };
}

function normalizeTrackedIpAddress(remoteAddress) {
  const normalized = String(remoteAddress || "").trim().replace(/^::ffff:/, "");
  return normalized === "127.0.0.1" || normalized === "::1" ? "" : normalized;
}

function isPostResetAccountCreation(account) {
  const createdAtMs = Date.parse(account?.createdAt || "");
  return Number.isFinite(createdAtMs) && createdAtMs >= ACCOUNT_CREATION_IP_CUTOFF_MS;
}

function normalizeManualBadgeEntries(badges) {
  const byId = new Map();
  for (const badge of Array.isArray(badges) ? badges : []) {
    const badgeId = Math.trunc(Number(typeof badge === "object" ? badge.id : badge));
    if (!Number.isFinite(badgeId) || badgeId <= 0) {
      continue;
    }
    byId.set(badgeId, {
      id: badgeId,
      visible: typeof badge === "object" ? badge.visible !== false : true,
      count: Math.max(1, Math.trunc(Number(typeof badge === "object" ? badge.count : 1) || 1)),
    });
  }

  return Array.from(byId.values()).sort((left, right) => left.id - right.id);
}

export class LocalAccountStore {
  constructor({ dataRoot, logger = null }) {
    this.filePath = join(dataRoot, "accounts.local.json");
    this.logger = logger;
    this.balanceAudit = createBalanceAuditLog({
      dataRoot,
      logger,
      alertConfig: config,
      discordConfig: config,
      onAlert: (alert) => this.flagAccountForEconomyAudit(alert),
    });
    return serializedStoreInstance(this);
  }

  auditAccountEconomy(account, source, before, meta = {}) {
    recordBalanceAudit(this.balanceAudit, account, source, before, economySnapshot(account), meta);
  }

  async flagAccountForEconomyAudit(alert = {}) {
    if (!config.auditAlertAutoFlag) {
      return { ok: true, skipped: true, reason: "auto-flag-disabled" };
    }

    const accountId = Number(alert.accountId || 0);
    if (!accountId) {
      return { ok: false, reason: "missing-account-id" };
    }

    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === accountId);
    if (!account) {
      return { ok: false, reason: "account-not-found" };
    }

    account.security = account.security && typeof account.security === "object" ? account.security : {};
    Object.assign(account.security, economyFlagFieldsFromAlert(alert));
    account.security.economyAlerts = Array.isArray(account.security.economyAlerts)
      ? account.security.economyAlerts
      : [];
    account.security.economyAlerts.push({
      at: account.security.economyFlaggedAt,
      reason: account.security.economyFlagReason,
      source: account.security.economyFlagSource,
      moneyDelta: account.security.economyFlagMoneyDelta,
      pointsDelta: account.security.economyFlagPointsDelta,
      garageCarsDelta: account.security.economyFlagGarageCarsDelta,
    });
    if (account.security.economyAlerts.length > 20) {
      account.security.economyAlerts = account.security.economyAlerts.slice(-20);
    }
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    this.logger?.warn("Account auto-flagged for suspicious economy", {
      accountId: account.id,
      username: account.username,
      reason: alert.reason,
      source: alert.source,
      moneyDelta: alert.moneyDelta,
      pointsDelta: alert.pointsDelta,
    });

    return { ok: true, account };
  }

  async createAccount(input) {
    const validated = validateCreateAccount(input);
    if (!validated.ok) {
      return validated;
    }

    const store = await readStore(this.filePath);
    const key = usernameKey(validated.username);

    if (store.accounts.some((account) => account.usernameKey === key)) {
      return { ok: false, code: -3, reason: "username-exists" };
    }

    const creationIpAddress = normalizeTrackedIpAddress(input.remoteAddress);
    if (
      creationIpAddress &&
      store.accounts.some((account) => (
        isPostResetAccountCreation(account) &&
        normalizeTrackedIpAddress(account.creationIpAddress) === creationIpAddress
      ))
    ) {
      return { ok: false, code: -12, reason: "ip-account-exists" };
    }

    const now = new Date().toISOString();
    const accountId = store.nextAccountId;
    const starterCarId = allocateGarageCarId(store);
    const starterCatalogCarId = normalizeStarterCatalogCarId(input.catalogCarId);
    const streetCredit = normalizeStreetCredit(input.streetCredit ?? input.sc);
    const requestedMoney = normalizeBalance(input.money, DEFAULT_STARTING_MONEY);
    const requestedPoints = normalizeBalance(input.points, DEFAULT_STARTING_POINTS);
    const account = {
      id: accountId,
      username: validated.username,
      usernameKey: key,
      passwordHash: hashPassword(validated.password),
      email: validated.email,
      zipCode: String(input.zipCode ?? "").trim(),
      birthYear: validated.birthYear,
      gender: String(input.gender ?? "").trim().toLowerCase().startsWith("f") ? "f" : "m",
      facebookCreate: String(input.facebookCreate ?? "false").toLowerCase() === "true",
      locationId: Number(input.locationId) || DEFAULT_LOCATION_ID,
      money: DEFAULT_STARTING_MONEY,
      points: DEFAULT_STARTING_POINTS,
      membership: 0,
      streetCredit,
      sc: streetCredit,
      defaultCarAccountCarId: starterCarId,
      starterCar: defaultGarageCarFields({
        accountCarId: starterCarId,
        catalogCarId: starterCatalogCarId,
        locationId: Number(input.locationId) || DEFAULT_LOCATION_ID,
        selected: true,
        color: input.color,
        wheelPartId: Number(input.wheelPartId) || 1001,
      }),
      garageCars: [],
      spareParts: [],
      creationIpAddress,
      createdAt: now,
      updatedAt: now,
    };

    await applyCatalogOemWheelsToGarageCar(account.starterCar);

    store.accounts.push(account);
    store.nextAccountId += 1;
    await writeStore(this.filePath, store);

    this.auditAccountEconomy(account, "createAccount", {
      money: 0,
      points: 0,
      garageCarCount: 0,
    }, {
      starterCatalogCarId,
      creationIpAddress: creationIpAddress || "",
      requestedMoney: requestedMoney !== DEFAULT_STARTING_MONEY ? requestedMoney : undefined,
      requestedPoints: requestedPoints !== DEFAULT_STARTING_POINTS ? requestedPoints : undefined,
    });

    return {
      ok: true,
      account,
    };
  }

  async loginOrCreate(input) {
    const username = normalizeUsername(input.username);
    const password = String(input.password ?? "");
    const store = await readStore(this.filePath);
    const existingAccount = store.accounts.find((account) => account.usernameKey === usernameKey(username));

    if (existingAccount) {
      if (!verifyPassword(password, existingAccount.passwordHash)) {
        return { ok: false, code: 0, reason: "invalid-password" };
      }

      const { team, member } = findTeamContext(store, existingAccount.id);
      if (team && member) {
        setAccountTeamMembership(existingAccount, team, member.role);
      }

      return {
        ok: true,
        account: existingAccount,
        created: false,
      };
    }

    if (!validAccountUsername(username)) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }
    if (password.length < 1 || password.length > 32) {
      return { ok: false, code: -7, reason: "invalid-password-length" };
    }
    if (/\s/.test(password)) {
      return { ok: false, code: -5, reason: "invalid-password" };
    }

    const created = await this.createAccount({
      username,
      password,
      email: `${usernameKey(username)}@nitto.local`,
      remoteAddress: input.remoteAddress,
    });

    if (!created.ok) {
      return created;
    }

    return {
      ...created,
      created: true,
    };
  }

  async findByUsername(username) {
    const store = await readStore(this.filePath);
    const key = usernameKey(username);

    return store.accounts.find((account) => account.usernameKey === key) || null;
  }

  async findById(accountId) {
    const store = await readStore(this.filePath);

    return store.accounts.find((account) => Number(account.id) === Number(accountId)) || null;
  }

  async updateManualBadges({ accountId, badges = [], reason = "", actor = "admin" }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: -100, reason: "account-not-found" };
    }

    const previousBadges = normalizeManualBadgeEntries(account.badges_json || account.badgesJson || account.manualBadges || account.badges || []);
    const nextBadges = normalizeManualBadgeEntries(badges);
    const now = new Date().toISOString();

    account.manualBadges = nextBadges;
    account.badges_json = JSON.stringify(nextBadges.map((badge) => ({
      id: badge.id,
      v: badge.visible ? 1 : 0,
      n: badge.count,
    })));
    account.updatedAt = now;

    if (!Array.isArray(store.adminAudit)) {
      store.adminAudit = [];
    }
    store.adminAudit.push({
      id: `audit-${Date.now()}-${randomBytes(4).toString("hex")}`,
      at: now,
      action: "admin.badges.update",
      actor: String(actor || "admin"),
      targetAccountId: Number(account.id || 0),
      targetUsername: account.username || "",
      reason: String(reason || ""),
      before: { manualBadges: previousBadges },
      after: { manualBadges: nextBadges },
    });

    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      before: previousBadges,
      after: nextBadges,
    };
  }

  async awardTournamentReward({ accountId, money = 0, points = 0 }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: -100, reason: "account-not-found" };
    }

    const moneyAward = Math.max(0, Math.floor(Number(money || 0)));
    const pointsAward = Math.max(0, Math.floor(Number(points || 0)));
    const before = economySnapshot(account);

    account.money = normalizeBalance(account.money, DEFAULT_STARTING_MONEY) + moneyAward;
    account.points = normalizeBalance(account.points, DEFAULT_STARTING_POINTS) + pointsAward;
    account.updatedAt = new Date().toISOString();

    await writeStore(this.filePath, store);
    this.auditAccountEconomy(account, "awardTournamentReward", before, {
      moneyAward,
      pointsAward,
    });

    return {
      ok: true,
      account,
      moneyAward,
      pointsAward,
      moneyBalance: account.money,
      pointsBalance: account.points,
    };
  }

  async incrementManualBadge({ accountId, badgeId, amount = 1 }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: -100, reason: "account-not-found" };
    }

    const normalizedBadgeId = Math.trunc(Number(badgeId || 0));
    const incrementBy = Math.max(1, Math.trunc(Number(amount || 1)));
    if (!normalizedBadgeId) {
      return { ok: false, code: -1, reason: "invalid-badge" };
    }

    const badges = normalizeManualBadgeEntries(
      account.badges_json || account.badgesJson || account.manualBadges || account.badges || [],
    );
    const existing = badges.find((badge) => badge.id === normalizedBadgeId);
    if (existing) {
      existing.count += incrementBy;
    } else {
      badges.push({ id: normalizedBadgeId, visible: true, count: incrementBy });
    }

    account.manualBadges = badges;
    account.badges_json = JSON.stringify(badges.map((badge) => ({
      id: badge.id,
      v: badge.visible ? 1 : 0,
      n: badge.count,
    })));
    account.updatedAt = new Date().toISOString();

    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      badgeId: normalizedBadgeId,
      count: badges.find((badge) => badge.id === normalizedBadgeId)?.count || incrementBy,
    };
  }

  async awardLiveTournamentPlacement({
    championAccountId,
    runnerUpAccountId = 0,
    firstPrize = 0,
    secondPrize = 0,
    prizePoints = 0,
  }) {
    const championId = Number(championAccountId || 0);
    const runnerUpId = Number(runnerUpAccountId || 0);
    const results = {
      ok: true,
      champion: null,
      runnerUp: null,
    };

    if (championId > 0) {
      const championReward = await this.awardTournamentReward({
        accountId: championId,
        money: firstPrize,
        points: prizePoints,
      });
      if (!championReward.ok) {
        return championReward;
      }

      const championBadge = await this.incrementManualBadge({
        accountId: championId,
        badgeId: 1,
        amount: 1,
      });
      results.champion = {
        account: championBadge.ok ? championBadge.account : championReward.account,
        moneyAward: championReward.moneyAward,
        pointsAward: championReward.pointsAward,
        badgeCount: championBadge.count || 0,
      };
    }

    if (runnerUpId > 0) {
      const runnerUpReward = await this.awardTournamentReward({
        accountId: runnerUpId,
        money: secondPrize,
        points: 0,
      });
      if (!runnerUpReward.ok) {
        return runnerUpReward;
      }

      const runnerUpBadge = await this.incrementManualBadge({
        accountId: runnerUpId,
        badgeId: 19,
        amount: 1,
      });
      results.runnerUp = {
        account: runnerUpBadge.ok ? runnerUpBadge.account : runnerUpReward.account,
        moneyAward: runnerUpReward.moneyAward,
        badgeCount: runnerUpBadge.count || 0,
      };
    }

    return results;
  }

  async transferRaceWager({ winnerAccountId, loserAccountId, amount = 0 }) {
    const store = await readStore(this.filePath);
    const winnerId = Number(winnerAccountId || 0);
    const loserId = Number(loserAccountId || 0);
    const wager = Math.max(0, Math.floor(Number(amount || 0)));

    if (!winnerId || !loserId || winnerId === loserId || wager <= 0) {
      return { ok: false, code: -1, reason: "invalid-transfer" };
    }

    const winnerAccount = store.accounts.find((item) => Number(item.id) === winnerId);
    const loserAccount = store.accounts.find((item) => Number(item.id) === loserId);
    if (!winnerAccount || !loserAccount) {
      return { ok: false, code: -100, reason: "account-not-found" };
    }

    const winnerBalance = normalizeBalance(winnerAccount.money, DEFAULT_STARTING_MONEY);
    const loserBalance = normalizeBalance(loserAccount.money, DEFAULT_STARTING_MONEY);
    if (loserBalance < wager) {
      return {
        ok: false,
        code: -101,
        reason: "insufficient-funds",
        winnerAccount,
        loserAccount,
        winnerBalance,
        loserBalance,
      };
    }

    const winnerBefore = economySnapshot(winnerAccount);
    const loserBefore = economySnapshot(loserAccount);

    winnerAccount.money = winnerBalance + wager;
    loserAccount.money = loserBalance - wager;
    const now = new Date().toISOString();
    winnerAccount.updatedAt = now;
    loserAccount.updatedAt = now;

    await writeStore(this.filePath, store);
    this.auditAccountEconomy(winnerAccount, "transferRaceWager:win", winnerBefore, {
      loserAccountId: loserId,
      wager,
    });
    this.auditAccountEconomy(loserAccount, "transferRaceWager:loss", loserBefore, {
      winnerAccountId: winnerId,
      wager,
    });

    return {
      ok: true,
      winnerAccount,
      loserAccount,
      wager,
      winnerBalance: winnerAccount.money,
      loserBalance: loserAccount.money,
      winnerDelta: wager,
      loserDelta: -wager,
    };
  }

  async settleTeamRivalsResult({ winnerTeamId, loserTeamId, amount = 0 } = {}) {
    const store = await readStore(this.filePath);
    const winnerId = Number(winnerTeamId || 0);
    const loserId = Number(loserTeamId || 0);
    const wager = Math.max(0, Math.floor(Number(amount || 0)));

    if (!winnerId || !loserId || winnerId === loserId) {
      return { ok: false, code: -1, reason: "invalid-transfer" };
    }

    const winnerTeam = store.teams.find((team) => Number(team?.id || 0) === winnerId);
    const loserTeam = store.teams.find((team) => Number(team?.id || 0) === loserId);
    if (!winnerTeam || !loserTeam) {
      return { ok: false, code: -100, reason: "team-not-found" };
    }

    const winnerBalance = normalizeBalance(winnerTeam.teamFund ?? winnerTeam.team_fund, 0);
    const loserBalance = normalizeBalance(loserTeam.teamFund ?? loserTeam.team_fund, 0);
    const canTransfer = wager > 0 && loserBalance >= wager;
    const now = new Date().toISOString();

    winnerTeam.wins = Number(winnerTeam.wins || 0) + 1;
    loserTeam.losses = Number(loserTeam.losses || 0) + 1;
    winnerTeam.updatedAt = now;
    loserTeam.updatedAt = now;

    if (canTransfer) {
      winnerTeam.teamFund = winnerBalance + wager;
      loserTeam.teamFund = loserBalance - wager;
    } else {
      winnerTeam.teamFund = winnerBalance;
      loserTeam.teamFund = loserBalance;
    }

    winnerTeam.team_fund = winnerTeam.teamFund;
    loserTeam.team_fund = loserTeam.teamFund;

    await writeStore(this.filePath, store);

    return {
      ok: true,
      winnerTeam,
      loserTeam,
      winnerTeamId: winnerId,
      loserTeamId: loserId,
      wager,
      transferred: canTransfer,
      reason: canTransfer ? "settled" : (wager > 0 ? "insufficient-team-funds" : "no-wager"),
      winnerBalance: winnerTeam.teamFund,
      loserBalance: loserTeam.teamFund,
      winnerDelta: canTransfer ? wager : 0,
      loserDelta: canTransfer ? -wager : 0,
    };
  }

  async settleRaceStreetCredit({
    winnerAccountId,
    loserAccountId,
    winnerReward = RACE_STREET_CREDIT_WIN_REWARD,
    loserPenalty = RACE_STREET_CREDIT_LOSS_PENALTY,
    raceWager = 0,
  }) {
    const store = await readStore(this.filePath);
    const winnerId = Number(winnerAccountId || 0);
    const loserId = Number(loserAccountId || 0);
    const reward = Math.max(0, Math.floor(Number(winnerReward || 0)));
    const penalty = Math.max(0, Math.floor(Number(loserPenalty || 0)));

    if (!winnerId || !loserId || winnerId === loserId || (reward <= 0 && penalty <= 0)) {
      return { ok: false, code: -1, reason: "invalid-transfer" };
    }

    const winnerAccount = store.accounts.find((item) => Number(item.id) === winnerId);
    const loserAccount = store.accounts.find((item) => Number(item.id) === loserId);
    if (!winnerAccount || !loserAccount) {
      return { ok: false, code: -100, reason: "account-not-found" };
    }

    const winnerBalance = accountStreetCredit(winnerAccount);
    const loserBalance = accountStreetCredit(loserAccount);
    const appliedPenalty = Math.min(penalty, loserBalance);
    const wager = Math.max(0, Math.floor(Number(raceWager || 0)));

    winnerAccount.streetCredit = winnerBalance + reward;
    loserAccount.streetCredit = Math.max(0, loserBalance - appliedPenalty);
    winnerAccount.sc = winnerAccount.streetCredit;
    loserAccount.sc = loserAccount.streetCredit;
    if (wager >= 100000) {
      winnerAccount.highestRaceWager = Math.max(Math.floor(Number(winnerAccount.highestRaceWager || 0)), wager);
      loserAccount.highestRaceWager = Math.max(Math.floor(Number(loserAccount.highestRaceWager || 0)), wager);
    }
    const now = new Date().toISOString();
    winnerAccount.updatedAt = now;
    loserAccount.updatedAt = now;

    await writeStore(this.filePath, store);

    return {
      ok: true,
      winnerAccount,
      loserAccount,
      winnerReward: reward,
      loserPenalty: penalty,
      raceWager: wager,
      appliedPenalty,
      settled: true,
      transferred: true,
      reason: "settled",
      winnerBalance: winnerAccount.streetCredit,
      loserBalance: loserAccount.streetCredit,
      winnerDelta: reward,
      loserDelta: -appliedPenalty,
    };
  }

  async transferPinkSlipCar({ winnerAccountId, loserAccountId, loserAccountCarId }) {
    const store = await readStore(this.filePath);
    const winnerId = Number(winnerAccountId || 0);
    const loserId = Number(loserAccountId || 0);
    const sourceCarId = Number(loserAccountCarId || 0);

    if (!winnerId || !loserId || winnerId === loserId || !sourceCarId) {
      return { ok: false, code: -1, reason: "invalid-transfer" };
    }

    const winnerAccount = store.accounts.find((item) => Number(item.id) === winnerId);
    const loserAccount = store.accounts.find((item) => Number(item.id) === loserId);
    if (!winnerAccount || !loserAccount) {
      return { ok: false, code: -100, reason: "account-not-found" };
    }

    const sourceCar = findGarageCar(loserAccount, sourceCarId);
    if (!sourceCar) {
      return { ok: false, code: -2, reason: "car-not-found", winnerAccount, loserAccount };
    }

    const loserCars = garageCarsFor(loserAccount);
    if (loserCars.length <= 1) {
      return { ok: false, code: -3, reason: "only-car", winnerAccount, loserAccount, sourceCar };
    }

    if (sourceCar.testDrive || sourceCar.testDriveExpired) {
      return { ok: false, code: -4, reason: "test-drive", winnerAccount, loserAccount, sourceCar };
    }

    const transferredCar = JSON.parse(JSON.stringify(sourceCar));
    const newAccountCarId = allocateGarageCarId(store);
    transferredCar.accountCarId = newAccountCarId;
    transferredCar.selected = false;
    transferredCar.pinkSlipWonFromAccountId = loserId;
    transferredCar.pinkSlipWonAt = new Date().toISOString();

    if (Number(loserAccount.starterCar?.accountCarId || 0) === sourceCarId) {
      loserAccount.garageCars = Array.isArray(loserAccount.garageCars) ? loserAccount.garageCars : [];
      loserAccount.starterCar = loserAccount.garageCars.shift() || null;
    } else {
      loserAccount.garageCars = Array.isArray(loserAccount.garageCars)
        ? loserAccount.garageCars.filter((car) => Number(car.accountCarId || 0) !== sourceCarId)
        : [];
    }

    const remainingLoserCars = garageCarsFor(loserAccount);
    if (remainingLoserCars.length === 0) {
      return { ok: false, code: -5, reason: "no-remaining-car", winnerAccount, loserAccount, sourceCar };
    }

    const loserDefaultCarId = Number(loserAccount.defaultCarAccountCarId || 0);
    const loserDefaultStillExists = remainingLoserCars.some(
      (car) => Number(car.accountCarId || 0) === loserDefaultCarId,
    );
    markSelectedCar(loserAccount, loserDefaultStillExists ? loserDefaultCarId : remainingLoserCars[0]?.accountCarId);

    winnerAccount.garageCars = Array.isArray(winnerAccount.garageCars) ? winnerAccount.garageCars : [];
    winnerAccount.garageCars.push(transferredCar);
    const winnerDefaultCarId = Number(winnerAccount.defaultCarAccountCarId || 0);
    const winnerDefaultStillExists = garageCarsFor(winnerAccount).some(
      (car) => Number(car.accountCarId || 0) === winnerDefaultCarId,
    );
    markSelectedCar(winnerAccount, winnerDefaultStillExists ? winnerDefaultCarId : garageCarsFor(winnerAccount)[0]?.accountCarId);

    const winnerBefore = economySnapshot(winnerAccount);
    const loserBefore = economySnapshot(loserAccount);
    const now = new Date().toISOString();
    winnerAccount.updatedAt = now;
    loserAccount.updatedAt = now;
    await writeStore(this.filePath, store);
    this.auditAccountEconomy(winnerAccount, "transferPinkSlipCar:win", winnerBefore, {
      loserAccountId: loserId,
      sourceCarId,
      newAccountCarId,
      catalogCarId: Number(transferredCar.catalogCarId || 0),
    });
    this.auditAccountEconomy(loserAccount, "transferPinkSlipCar:loss", loserBefore, {
      winnerAccountId: winnerId,
      sourceCarId,
      catalogCarId: Number(transferredCar.catalogCarId || 0),
    });

    return {
      ok: true,
      winnerAccount,
      loserAccount,
      transferredCar,
      sourceCarId,
      newAccountCarId,
    };
  }

  async searchAccounts(searchTerm, { page = 1, pageSize = 20 } = {}) {
    const store = await readStore(this.filePath);
    const term = normalizeUsername(searchTerm).toLowerCase();
    const normalizedPageSize = Number.isInteger(Number(pageSize)) && Number(pageSize) > 0
      ? Number(pageSize)
      : 20;
    const normalizedPage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
    const matches = store.accounts
      .filter((account) => {
        if (!term) {
          return true;
        }

        return String(account.username || "").toLowerCase().includes(term);
      })
      .sort((left, right) => String(left.username || "").localeCompare(String(right.username || "")));
    const startIndex = (normalizedPage - 1) * normalizedPageSize;

    return {
      accounts: matches.slice(startIndex, startIndex + normalizedPageSize),
      count: matches.length,
      page: normalizedPage,
      pageSize: normalizedPageSize,
    };
  }

  async getAvatarAges(accountIds) {
    const store = await readStore(this.filePath);
    const requestedIds = Array.isArray(accountIds) ? accountIds : [];
    const values = requestedIds
      .map((accountId) => Number(accountId || 0))
      .filter((accountId) => Number.isInteger(accountId) && accountId > 0)
      .map((accountId) => {
        const account = store.accounts.find((item) => Number(item.id) === accountId);
        return [accountId, avatarTimestamp(account?.avatar)];
      });

    return values;
  }

  async updateAvatar({ accountId, fileName, bytes, width, height }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, reason: "account-not-found" };
    }

    const now = new Date().toISOString();
    account.avatar = {
      id: Number(account.id),
      type: "avatars",
      fileName: String(fileName || ""),
      bytes: normalizeBalance(bytes, 0),
      width: normalizeBalance(width, 0),
      height: normalizeBalance(height, 0),
      updatedAt: now,
    };
    account.updatedAt = now;

    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      avatar: account.avatar,
    };
  }

  async getTeamAvatarAges(teamIds) {
    const store = await readStore(this.filePath);
    const requestedIds = Array.isArray(teamIds) ? teamIds : [];
    const values = requestedIds
      .map((teamId) => Number(teamId || 0))
      .filter((teamId) => Number.isInteger(teamId) && teamId > 0)
      .map((teamId) => {
        const team = store.teams.find((item) => Number(item.id) === teamId);
        return [teamId, avatarTimestamp(team?.avatar)];
      });

    return values;
  }

  async updateTeamAvatar({ accountId, teamId, fileName, bytes, width, height }) {
    const store = await readStore(this.filePath);
    const { account, team, member } = findTeamContext(store, accountId);
    const normalizedTeamId = Number(teamId || 0);

    if (!account) {
      return { ok: false, reason: "account-not-found" };
    }
    if (!team || Number(team.id || 0) !== normalizedTeamId) {
      return { ok: false, reason: "team-not-found", account };
    }
    if (!member || !isTeamManagerRole(member.role)) {
      return { ok: false, reason: "not-manager", account, team: normalizeTeamRecord(team, store) };
    }

    const now = new Date().toISOString();
    team.avatar = {
      id: normalizedTeamId,
      type: "teamavatars",
      fileName: String(fileName || ""),
      bytes: normalizeBalance(bytes, 0),
      width: normalizeBalance(width, 0),
      height: normalizeBalance(height, 0),
      updatedAt: now,
    };
    team.updatedAt = now;

    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      team: normalizeTeamRecord(team, store),
      avatar: team.avatar,
    };
  }

  async listBuddiesForAccount(accountId) {
    const store = await readStore(this.filePath);
    const normalizedAccountId = Number(accountId || 0);
    const accountsById = new Map(store.accounts.map((account) => [Number(account.id), account]));
    const buddyIds = store.buddies
      .map((buddy) => {
        const leftId = Number(buddy?.accountId || 0);
        const rightId = Number(buddy?.buddyAccountId || 0);

        if (leftId === rightId) {
          return 0;
        }
        if (leftId === normalizedAccountId) {
          return rightId;
        }
        if (rightId === normalizedAccountId) {
          return leftId;
        }
        return 0;
      })
      .filter((id) => id > 0);

    return [...new Set(buddyIds)]
      .map((id) => accountsById.get(id))
      .filter(Boolean)
      .sort((left, right) => String(left.username || "").localeCompare(String(right.username || "")));
  }

  async areBuddies(accountId, buddyAccountId) {
    const store = await readStore(this.filePath);
    const left = Number(accountId || 0);
    const right = Number(buddyAccountId || 0);

    if (!left || !right) {
      return false;
    }
    if (left === right) {
      return false;
    }

    return store.buddies.some((buddy) => {
      const buddyLeft = Number(buddy?.accountId || 0);
      const buddyRight = Number(buddy?.buddyAccountId || 0);

      return (buddyLeft === left && buddyRight === right)
        || (buddyLeft === right && buddyRight === left);
    });
  }

  async addBuddy({ accountId, buddyAccountId }) {
    const store = await readStore(this.filePath);
    const left = Number(accountId || 0);
    const right = Number(buddyAccountId || 0);
    const account = store.accounts.find((item) => Number(item.id) === left);
    const buddyAccount = store.accounts.find((item) => Number(item.id) === right);

    if (!account || !buddyAccount) {
      return { ok: false, code: 0, reason: "target-not-found" };
    }
    if (left === right) {
      return { ok: false, code: -8, reason: "self-buddy" };
    }

    const existing = store.buddies.find((buddy) => {
      const buddyLeft = Number(buddy?.accountId || 0);
      const buddyRight = Number(buddy?.buddyAccountId || 0);

      return (buddyLeft === left && buddyRight === right)
        || (buddyLeft === right && buddyRight === left);
    });

    if (!existing) {
      const now = new Date().toISOString();
      store.buddies.push({
        accountId: Math.min(left, right),
        buddyAccountId: Math.max(left, right),
        createdAt: now,
      });
      account.updatedAt = now;
      buddyAccount.updatedAt = now;
      await writeStore(this.filePath, store);
    }

    return {
      ok: true,
      account,
      buddyAccount,
      created: !existing,
    };
  }

  async createBuddyRequest({ fromAccountId, toAccountId }) {
    const store = await readStore(this.filePath);
    const fromId = Number(fromAccountId || 0);
    const toId = Number(toAccountId || 0);
    const fromAccount = store.accounts.find((item) => Number(item.id) === fromId);
    const toAccount = store.accounts.find((item) => Number(item.id) === toId);

    if (!fromAccount || !toAccount) {
      return { ok: false, code: 0, reason: "target-not-found" };
    }
    if (fromId === toId) {
      return { ok: false, code: -8, reason: "self-buddy" };
    }

    const alreadyBuddies = store.buddies.some((buddy) => {
      const left = Number(buddy?.accountId || 0);
      const right = Number(buddy?.buddyAccountId || 0);

      return (left === fromId && right === toId) || (left === toId && right === fromId);
    });

    if (alreadyBuddies) {
      return { ok: false, code: -3, reason: "already-buddies" };
    }

    const existing = store.buddyRequests.find((request) => {
      const requestFromId = Number(request?.fromAccountId || 0);
      const requestToId = Number(request?.toAccountId || 0);

      return (requestFromId === fromId && requestToId === toId)
        || (requestFromId === toId && requestToId === fromId);
    });

    if (!existing) {
      const now = new Date().toISOString();
      store.buddyRequests.push({
        fromAccountId: fromId,
        toAccountId: toId,
        status: 2,
        createdAt: now,
      });
      fromAccount.updatedAt = now;
      toAccount.updatedAt = now;
      await writeStore(this.filePath, store);
    }

    return {
      ok: true,
      fromAccount,
      toAccount,
      created: !existing,
    };
  }

  async listIncomingBuddyRequests(accountId) {
    const store = await readStore(this.filePath);
    const normalizedAccountId = Number(accountId || 0);
    const accountsById = new Map(store.accounts.map((account) => [Number(account.id), account]));

    return store.buddyRequests
      .filter((request) => (
        Number(request?.toAccountId || 0) === normalizedAccountId
        && Number(request?.fromAccountId || 0) !== normalizedAccountId
      ))
      .map((request) => ({
        ...request,
        account: accountsById.get(Number(request.fromAccountId)) || null,
      }))
      .filter((request) => request.account)
      .sort((left, right) => String(left.account.username || "").localeCompare(String(right.account.username || "")));
  }

  async listOutgoingBuddyRequests(accountId) {
    const store = await readStore(this.filePath);
    const normalizedAccountId = Number(accountId || 0);
    const accountsById = new Map(store.accounts.map((account) => [Number(account.id), account]));

    return store.buddyRequests
      .filter((request) => (
        Number(request?.fromAccountId || 0) === normalizedAccountId
        && Number(request?.toAccountId || 0) !== normalizedAccountId
      ))
      .map((request) => ({
        ...request,
        account: accountsById.get(Number(request.toAccountId)) || null,
      }))
      .filter((request) => request.account)
      .sort((left, right) => String(left.account.username || "").localeCompare(String(right.account.username || "")));
  }

  async answerBuddyRequest({ accountId, requesterAccountId, accepted }) {
    const store = await readStore(this.filePath);
    const targetId = Number(accountId || 0);
    const requesterId = Number(requesterAccountId || 0);
    const targetAccount = store.accounts.find((item) => Number(item.id) === targetId);
    const requesterAccount = store.accounts.find((item) => Number(item.id) === requesterId);
    const requestIndex = store.buddyRequests.findIndex((request) => (
      Number(request?.fromAccountId || 0) === requesterId
      && Number(request?.toAccountId || 0) === targetId
    ));

    if (!targetAccount || !requesterAccount) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }
    if (targetId === requesterId) {
      return { ok: false, code: -8, reason: "self-buddy" };
    }

    if (requestIndex >= 0) {
      store.buddyRequests.splice(requestIndex, 1);
    }

    if (!accepted) {
      await writeStore(this.filePath, store);
      return {
        ok: true,
        accepted: false,
        targetAccount,
        requesterAccount,
      };
    }

    const alreadyBuddies = store.buddies.some((buddy) => {
      const left = Number(buddy?.accountId || 0);
      const right = Number(buddy?.buddyAccountId || 0);

      return (left === requesterId && right === targetId) || (left === targetId && right === requesterId);
    });

    if (!alreadyBuddies) {
      const now = new Date().toISOString();
      store.buddies.push({
        accountId: Math.min(requesterId, targetId),
        buddyAccountId: Math.max(requesterId, targetId),
        createdAt: now,
      });
      targetAccount.updatedAt = now;
      requesterAccount.updatedAt = now;
    }

    await writeStore(this.filePath, store);

    return {
      ok: true,
      accepted: true,
      targetAccount,
      requesterAccount,
    };
  }

  async cancelBuddyRequest({ fromAccountId, toAccountId }) {
    const store = await readStore(this.filePath);
    const fromId = Number(fromAccountId || 0);
    const toId = Number(toAccountId || 0);
    const before = store.buddyRequests.length;

    store.buddyRequests = store.buddyRequests.filter((request) => !(
      Number(request?.fromAccountId || 0) === fromId
      && Number(request?.toAccountId || 0) === toId
    ));

    if (store.buddyRequests.length !== before) {
      await writeStore(this.filePath, store);
    }

    return { ok: true, removed: store.buddyRequests.length !== before };
  }

  async removeBuddy({ accountId, buddyAccountId }) {
    const store = await readStore(this.filePath);
    const left = Number(accountId || 0);
    const right = Number(buddyAccountId || 0);
    const before = store.buddies.length;

    store.buddies = store.buddies.filter((buddy) => {
      const buddyLeft = Number(buddy?.accountId || 0);
      const buddyRight = Number(buddy?.buddyAccountId || 0);

      return !(
        (buddyLeft === left && buddyRight === right)
        || (buddyLeft === right && buddyRight === left)
      );
    });

    if (store.buddies.length !== before) {
      const now = new Date().toISOString();
      for (const account of store.accounts) {
        if (Number(account.id) === left || Number(account.id) === right) {
          account.updatedAt = now;
        }
      }
      await writeStore(this.filePath, store);
    }

    return { ok: true, removed: store.buddies.length !== before };
  }

  async listRemarksForTarget(targetAccountId) {
    const store = await readStore(this.filePath);
    const normalizedTargetId = Number(targetAccountId || 0);
    const accountsById = new Map(store.accounts.map((account) => [Number(account.id), account]));

    return store.remarks
      .filter((remark) => Number(remark?.toAccountId || 0) === normalizedTargetId)
      .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
      .map((remark) => ({
        ...remark,
        fromUsername: accountsById.get(Number(remark.fromAccountId))?.username || "Racer",
      }));
  }

  async addRemark({ fromAccountId, toAccountId, body }) {
    const store = await readStore(this.filePath);
    const fromAccount = store.accounts.find((account) => Number(account.id) === Number(fromAccountId));
    const toAccount = store.accounts.find((account) => Number(account.id) === Number(toAccountId));
    const text = String(body ?? "").replace(/\r\n/g, "\n").trim().slice(0, 500);

    if (!fromAccount) {
      return { ok: false, code: -100, reason: "missing-session-account" };
    }
    if (!toAccount) {
      return { ok: false, code: 0, reason: "target-not-found" };
    }
    if (!text) {
      return { ok: false, code: -2, reason: "empty-remark" };
    }
    if (Number(fromAccount.id) !== Number(toAccount.id)) {
      const areBuddies = store.buddies.some((buddy) => {
        const left = Number(buddy?.accountId || 0);
        const right = Number(buddy?.buddyAccountId || 0);

        return (left === Number(fromAccount.id) && right === Number(toAccount.id))
          || (left === Number(toAccount.id) && right === Number(fromAccount.id));
      });

      if (!areBuddies) {
        return { ok: false, code: -1, reason: "not-buddies" };
      }
    }

    const now = new Date().toISOString();
    const remark = {
      id: allocateRemarkId(store),
      fromAccountId: Number(fromAccount.id),
      toAccountId: Number(toAccount.id),
      body: text,
      nonDelete: 0,
      createdAt: now,
    };

    store.remarks.push(remark);
    fromAccount.updatedAt = now;
    toAccount.updatedAt = now;
    await writeStore(this.filePath, store);

    return {
      ok: true,
      remark,
      fromAccount,
      toAccount,
    };
  }

  async deleteRemark({ accountId, remarkId }) {
    const store = await readStore(this.filePath);
    const normalizedAccountId = Number(accountId || 0);
    const normalizedRemarkId = Number(remarkId || 0);
    const index = store.remarks.findIndex((remark) => Number(remark?.id || 0) === normalizedRemarkId);

    if (index < 0) {
      return { ok: true, deleted: false, reason: "remark-not-found" };
    }

    const remark = store.remarks[index];
    const canDelete = Number(remark.fromAccountId || 0) === normalizedAccountId
      || Number(remark.toAccountId || 0) === normalizedAccountId;

    if (!canDelete) {
      return { ok: false, code: 0, reason: "remark-delete-denied" };
    }

    store.remarks.splice(index, 1);
    const account = store.accounts.find((item) => Number(item.id) === normalizedAccountId);
    if (account) {
      account.updatedAt = new Date().toISOString();
    }
    await writeStore(this.filePath, store);

    return { ok: true, deleted: true };
  }

  async setRemarkDeleteFlags({ accountId, remarkIds, nonDelete }) {
    const store = await readStore(this.filePath);
    const normalizedAccountId = Number(accountId || 0);
    const ids = new Set((Array.isArray(remarkIds) ? remarkIds : [])
      .map((remarkId) => Number(remarkId || 0))
      .filter((remarkId) => Number.isInteger(remarkId) && remarkId > 0));
    let updated = 0;

    for (const remark of store.remarks) {
      if (!ids.has(Number(remark?.id || 0))) {
        continue;
      }
      if (Number(remark.toAccountId || 0) !== normalizedAccountId) {
        continue;
      }
      remark.nonDelete = nonDelete ? 1 : 0;
      updated += 1;
    }

    if (updated > 0) {
      const account = store.accounts.find((item) => Number(item.id) === normalizedAccountId);
      if (account) {
        account.updatedAt = new Date().toISOString();
      }
      await writeStore(this.filePath, store);
    }

    return { ok: true, updated };
  }

  async unreadMailCount(accountId) {
    const store = await readStore(this.filePath);
    const normalizedAccountId = Number(accountId || 0);

    return store.mail.filter((mail) => (
      Number(mail?.toAccountId || 0) === normalizedAccountId
      && String(mail?.folder || "inbox") === "inbox"
      && !mail.read
      && !mail.deleted
    )).length;
  }

  async listMailForAccount(accountId) {
    const store = await readStore(this.filePath);
    const normalizedAccountId = Number(accountId || 0);
    const accountsById = new Map(store.accounts.map((account) => [Number(account.id), account]));

    return store.mail
      .filter((mail) => (
        Number(mail?.toAccountId || 0) === normalizedAccountId
        && String(mail?.folder || "inbox") === "inbox"
        && !mail.deleted
      ))
      .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
      .map((mail) => ({
        ...mail,
        fromUsername: accountsById.get(Number(mail.fromAccountId))?.username || "Racer",
      }));
  }

  async getMailForAccount({ accountId, mailId }) {
    const store = await readStore(this.filePath);
    const normalizedAccountId = Number(accountId || 0);
    const normalizedMailId = Number(mailId || 0);
    const accountsById = new Map(store.accounts.map((account) => [Number(account.id), account]));
    const mail = store.mail.find((item) => (
      Number(item?.id || 0) === normalizedMailId
      && Number(item?.toAccountId || 0) === normalizedAccountId
      && !item.deleted
    ));

    if (!mail) {
      return null;
    }

    return {
      ...mail,
      fromUsername: accountsById.get(Number(mail.fromAccountId))?.username || "Racer",
    };
  }

  async markMailRead({ accountId, mailId }) {
    const store = await readStore(this.filePath);
    const normalizedAccountId = Number(accountId || 0);
    const normalizedMailId = Number(mailId || 0);
    const mail = store.mail.find((item) => (
      Number(item?.id || 0) === normalizedMailId
      && Number(item?.toAccountId || 0) === normalizedAccountId
      && !item.deleted
    ));

    if (!mail) {
      return { ok: true, updated: false };
    }

    if (!mail.read) {
      mail.read = true;
      mail.readAt = new Date().toISOString();
      await writeStore(this.filePath, store);
    }

    return { ok: true, updated: true };
  }

  async deleteMail({ accountId, mailId }) {
    const store = await readStore(this.filePath);
    const normalizedAccountId = Number(accountId || 0);
    const normalizedMailId = Number(mailId || 0);
    const mail = store.mail.find((item) => (
      Number(item?.id || 0) === normalizedMailId
      && Number(item?.toAccountId || 0) === normalizedAccountId
      && !item.deleted
    ));

    if (!mail) {
      return { ok: true, deleted: false };
    }

    mail.deleted = true;
    mail.deletedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return { ok: true, deleted: true };
  }

  async sendMail({ fromAccountId, toUsername, subject, body }) {
    const store = await readStore(this.filePath);
    const fromAccount = store.accounts.find((account) => Number(account.id) === Number(fromAccountId));
    const toAccount = store.accounts.find((account) => account.usernameKey === usernameKey(toUsername));
    const safeSubject = String(subject ?? "").trim().slice(0, 100) || " ";
    const safeBody = String(body ?? "").replace(/\r\n/g, "\n").trim().slice(0, 4000);

    if (!fromAccount) {
      return { ok: false, code: -100, reason: "missing-session-account" };
    }
    if (!toAccount) {
      return { ok: false, code: 0, reason: "target-not-found" };
    }
    if (!safeBody) {
      return { ok: false, code: -2, reason: "empty-body", fromAccount, toAccount };
    }

    const now = new Date().toISOString();
    const mail = {
      id: allocateMailId(store),
      fromAccountId: Number(fromAccount.id),
      toAccountId: Number(toAccount.id),
      subject: safeSubject,
      body: safeBody,
      folder: "inbox",
      read: false,
      deleted: false,
      createdAt: now,
    };

    store.mail.push(mail);
    fromAccount.updatedAt = now;
    toAccount.updatedAt = now;
    await writeStore(this.filePath, store);

    return { ok: true, mail, fromAccount, toAccount };
  }

  async purchaseCatalogPart({ accountId, accountCarId, catalogPart, paymentType, installId }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const paysWithPoints = String(paymentType || "").toLowerCase() === "p";
    const price = normalizeBalance(paysWithPoints ? catalogPart?.pp : catalogPart?.p, 0);
    const money = normalizeBalance(account.money, DEFAULT_STARTING_MONEY);
    const points = normalizeBalance(account.points, DEFAULT_STARTING_POINTS);
    const currentBalance = paysWithPoints ? points : money;

    if (!catalogPart?.i) {
      return { ok: false, code: 0, reason: "part-not-found" };
    }

    // LE/Tournament/Trophy wheels are not purchasable by anyone.
    if (isLockedWheelCatalogPart(catalogPart)) {
      return {
        ok: false,
        code: -19,
        reason: "locked-part",
        balance: currentBalance,
      };
    }

    if (isNonPurchasableCatalogPart(catalogPart)) {
      return {
        ok: false,
        code: 0,
        reason: "part-not-for-sale",
        balance: currentBalance,
      };
    }

    if (currentBalance < price) {
      return {
        ok: false,
        code: -3,
        reason: paysWithPoints ? "insufficient-points" : "insufficient-funds",
        balance: currentBalance,
      };
    }

    const payment = debitSelectedBalance(account, { paysWithPoints, money, points, price });
    account.starterCar = account.starterCar || {};
    account.starterCar.accountCarId = Number(account.starterCar.accountCarId || account.id) || account.id;

    const requestedCarId = Number(accountCarId || account.starterCar.accountCarId);
    const targetCar = findGarageCar(account, requestedCarId);
    const partCategoryId = normalizedPartSlotId(catalogPart.ci || catalogPart.pi);
    if (targetCar) {
      if (carHasActiveUsedCarListing(store, account, targetCar)) {
        return { ok: false, code: -9, reason: "car-listed", balance: currentBalance };
      }
      if (garageCarBuildLocked(targetCar)) {
        return { ...lockedGarageCarMutationResult(), balance: currentBalance };
      }

      if (
        FORCED_INDUCTION_SYSTEM_CATEGORY_IDS.has(partCategoryId)
        || (partCategoryId === HEADER_CATEGORY_ID && hasInstalledForcedInduction(targetCar.partsXml))
      ) {
        if (canReplaceActiveSystemPart(targetCar, partCategoryId)) {
          const existingPart = findInstalledPartEntryBySlot(targetCar.partsXml, partCategoryId);
          const existingPartId = Number(existingPart?.attrs?.i || 0);
          const purchasedPartId = Number(catalogPart.i || 0);

          if (installedPartMatchesCatalogPart(existingPart, catalogPart)) {
            addSparePartFromCatalogPart(store, account, catalogPart, installId);
          } else {
            addSparePartFromInstalledXml(store, account, existingPart?.raw);
            targetCar.partsXml = upsertInstalledPartXml(
              targetCar.partsXml,
              partCategoryId,
              renderInstalledCatalogPartXml(catalogPart, installId),
            );
            syncDynoBoostSettingFromInstalledBoostPart(targetCar);
          }

          dedupeInstalledPartsBySlot({ store, account, car: targetCar });
          account.updatedAt = new Date().toISOString();
          await writeStore(this.filePath, store);

          return {
            ok: true,
            account,
            balance: payment.balance,
            paymentType: payment.paymentType,
            price,
            systemInstalled: existingPartId !== purchasedPartId,
          };
        }

        addSparePartFromCatalogPart(store, account, catalogPart, installId);
        account.updatedAt = new Date().toISOString();
        await writeStore(this.filePath, store);

        return {
          ok: true,
          account,
          balance: payment.balance,
          paymentType: payment.paymentType,
          price,
          spareOnly: true,
        };
      }

      const existingPart = findInstalledPartEntryBySlot(targetCar.partsXml, partCategoryId);
      const existingPartId = Number(existingPart?.attrs?.i || 0);
      const purchasedPartId = Number(catalogPart.i || 0);

      if (installedPartMatchesCatalogPart(existingPart, catalogPart)) {
        addSparePartFromCatalogPart(store, account, catalogPart, installId);
      } else {
        addSparePartFromInstalledXml(store, account, existingPart?.raw);

        targetCar.partsXml = upsertInstalledPartXml(
          targetCar.partsXml,
          partCategoryId,
          renderInstalledCatalogPartXml(catalogPart, installId),
        );
      }

      if (partCategoryId === WHEEL_CATEGORY_ID) {
        targetCar.wheelPartId = Number(catalogPart.i);
        targetCar.wheelDesignId = Number(catalogPart.di || catalogPart.pdi || 1);
        targetCar.wheelSize = Number(catalogPart.ps || 17);
      }

      if (partCategoryId === TIRE_CATEGORY_ID) {
        targetCar.tirePartId = Number(catalogPart.i);
        targetCar.tireDesignId = Number(catalogPart.di || catalogPart.pdi || 1);
        targetCar.tireSize = Number(catalogPart.ps || STOCK_TIRE_SIZE);
      }

      dedupeInstalledPartsBySlot({ store, account, car: targetCar });
      normalizeCarAfterPartInventoryChange(targetCar);
    }

    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      balance: payment.balance,
      paymentType: payment.paymentType,
      price,
    };
  }

  async purchasePaint({ accountId, accountCarId, jobs, paymentType }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const requestedCarId = Number(accountCarId || account.starterCar?.accountCarId || account.id || 0);
    const targetCar = findGarageCar(account, requestedCarId);
    if (!targetCar) {
      return { ok: false, code: -5, reason: "car-not-found" };
    }
    if (carHasActiveUsedCarListing(store, account, targetCar)) {
      return { ok: false, code: -9, reason: "car-listed" };
    }
    if (garageCarBuildLocked(targetCar)) {
      return lockedGarageCarMutationResult();
    }

    const normalizedJobs = Array.isArray(jobs) ? jobs.map((job) => ({
      partCategoryId: Number(job.partCategoryId),
      color: normalizePaintColor(job.color),
    })) : [];

    if (
      normalizedJobs.length === 0
      || normalizedJobs.some((job) => !job.color || !isKnownPaintColor(job.color))
    ) {
      return { ok: false, code: -1, reason: "invalid-paint" };
    }

    const paysWithPoints = String(paymentType || "").toLowerCase() === "p";
    const money = normalizeBalance(account.money, DEFAULT_STARTING_MONEY);
    const points = normalizeBalance(account.points, DEFAULT_STARTING_POINTS);
    const currentBalance = paysWithPoints ? points : money;
    const price = paintPriceForJobs(
      normalizedJobs,
      paysWithPoints ? "p" : "m",
      targetCar.locationId || account.locationId || DEFAULT_LOCATION_ID,
    );

    if (currentBalance < price) {
      return {
        ok: false,
        code: -2,
        reason: paysWithPoints ? "insufficient-points" : "insufficient-funds",
        balance: currentBalance,
      };
    }

    for (const job of normalizedJobs) {
      if (job.partCategoryId === -2) {
        targetCar.color = job.color;
        targetCar.partsXml = clearInstalledPartColors(
          targetCar.partsXml,
          (categoryId) => PAINTABLE_PART_CATEGORY_IDS.has(categoryId),
        );
      } else if (job.partCategoryId === -1) {
        targetCar.color = job.color;
      } else {
        targetCar.partsXml = updateInstalledPartColors(
          targetCar.partsXml,
          (categoryId) => categoryId === job.partCategoryId,
          job.color,
        );
      }
    }

    const payment = debitSelectedBalance(account, { paysWithPoints, money, points, price });
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      balance: payment.balance,
      paymentType: payment.paymentType,
      price,
    };
  }

  async purchaseLicensePlateStyle({ accountId, accountCarId, plateId, paymentType }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));
    const plate = getLicensePlate(plateId);

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    if (!plate) {
      return { ok: false, code: 0, reason: "plate-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);
    if (!targetCar) {
      return { ok: false, code: -8, reason: "car-not-found" };
    }
    if (carHasActiveUsedCarListing(store, account, targetCar)) {
      return { ok: false, code: -9, reason: "car-listed" };
    }
    if (garageCarBuildLocked(targetCar)) {
      return lockedGarageCarMutationResult();
    }

    const accountLocationId = Number(account.locationId || targetCar.locationId || DEFAULT_LOCATION_ID);
    if (Number(plate.minLocationId || DEFAULT_LOCATION_ID) > accountLocationId) {
      return { ok: false, code: -1, reason: "invalid-location" };
    }

    const paysWithPoints = String(paymentType || "").toLowerCase() === "p";
    const price = licensePriceForPayment(plate, paymentType);
    const money = normalizeBalance(account.money, DEFAULT_STARTING_MONEY);
    const points = normalizeBalance(account.points, DEFAULT_STARTING_POINTS);
    const currentBalance = paysWithPoints ? points : money;

    if (currentBalance < price) {
      return {
        ok: false,
        code: -3,
        reason: paysWithPoints ? "insufficient-points" : "insufficient-funds",
        balance: currentBalance,
      };
    }

    const payment = debitSelectedBalance(account, { paysWithPoints, money, points, price });
    targetCar.plateId = Number(plate.id);
    targetCar.plateNumber = samplePlateNumber(plate.id);
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      car: targetCar,
      balance: payment.balance,
      paymentType: payment.paymentType,
      plateNumber: targetCar.plateNumber,
      price,
    };
  }

  async purchaseVanityPlate({ accountId, accountCarId, plateNumber, paymentType }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);
    if (!targetCar) {
      return { ok: false, code: -6, reason: "car-not-found" };
    }
    if (carHasActiveUsedCarListing(store, account, targetCar)) {
      return { ok: false, code: -9, reason: "car-listed" };
    }
    if (garageCarBuildLocked(targetCar)) {
      return lockedGarageCarMutationResult();
    }

    const normalizedPlateNumber = normalizePlateNumber(plateNumber);
    if (!normalizedPlateNumber) {
      return { ok: false, code: -1, reason: "plate-number-missing" };
    }
    if (normalizedPlateNumber.length > 10) {
      return { ok: false, code: -2, reason: "plate-number-too-long" };
    }

    const plateId = Number(targetCar.plateId || DEFAULT_PLATE_ID);
    const plate = getLicensePlate(plateId) || getLicensePlate(DEFAULT_PLATE_ID);
    const paysWithPoints = String(paymentType || "").toLowerCase() === "p";
    const price = licensePriceForPayment(plate, paymentType, { vanity: true });
    const money = normalizeBalance(account.money, DEFAULT_STARTING_MONEY);
    const points = normalizeBalance(account.points, DEFAULT_STARTING_POINTS);
    const currentBalance = paysWithPoints ? points : money;

    if (currentBalance < price) {
      return {
        ok: false,
        code: -3,
        reason: paysWithPoints ? "insufficient-points" : "insufficient-funds",
        balance: currentBalance,
      };
    }

    const payment = debitSelectedBalance(account, { paysWithPoints, money, points, price });
    targetCar.plateId = plateId;
    targetCar.plateNumber = normalizedPlateNumber;
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      car: targetCar,
      balance: payment.balance,
      paymentType: payment.paymentType,
      plateNumber: targetCar.plateNumber,
      price,
    };
  }

  async purchaseCar({ accountId, catalogCarId, paymentType, color }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));
    const catalogCar = getCatalogCar(catalogCarId);

    if (!account) {
      return { ok: false, code: -3, reason: "account-not-found" };
    }

    if (!catalogCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }

    if (isShowroomCarLocked(catalogCar.id)) {
      return { ok: false, code: 0, reason: "locked-car" };
    }

    const paysWithPoints = String(paymentType || "").toLowerCase() === "p";
    const price = paysWithPoints ? getCatalogCarPointPrice(catalogCar.id) : getCatalogCarPrice(catalogCar.id);
    const pointOnlyCar = Number(getCatalogCarPrice(catalogCar.id) || 0) <= 0
      && Number(getCatalogCarPointPrice(catalogCar.id) || 0) > 0;
    const money = normalizeBalance(account.money, DEFAULT_STARTING_MONEY);
    const points = normalizeBalance(account.points, DEFAULT_STARTING_POINTS);
    const currentBalance = paysWithPoints ? points : money;
    const requiredLocationId = getShowroomLocationIdForCar(catalogCar.id);
    const accountLocationId = Number(account.locationId || DEFAULT_LOCATION_ID);

    if (!paysWithPoints && pointOnlyCar) {
      return { ok: false, code: -4, reason: "points-only-car", balance: currentBalance };
    }

    if (!paysWithPoints && requiredLocationId > accountLocationId) {
      return { ok: false, code: -6, reason: "invalid-location", balance: currentBalance };
    }

    if (currentBalance < price) {
      return { ok: false, code: -4, reason: "insufficient-balance", balance: currentBalance };
    }

    const car = defaultGarageCarFields({
      accountCarId: allocateGarageCarId(store),
      catalogCarId: catalogCar.id,
      locationId: account.locationId || requiredLocationId,
      color,
    });
    await applyCatalogOemWheelsToGarageCar(car);

    const before = economySnapshot(account);
    const payment = debitSelectedBalance(account, { paysWithPoints, money, points, price });
    account.garageCars = Array.isArray(account.garageCars) ? account.garageCars : [];
    account.garageCars.push(car);
    markSelectedCar(account, car.accountCarId);
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);
    this.auditAccountEconomy(account, "purchaseCar", before, {
      catalogCarId: catalogCar.id,
      accountCarId: car.accountCarId,
      price,
      paymentType: payment.paymentType,
    });

    return {
      ok: true,
      account,
      car,
      balance: payment.balance,
      paymentType: payment.paymentType,
      price,
    };
  }

  async updateDefaultCar({ accountId, accountCarId }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);

    if (!targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }

    if (carHasActiveUsedCarListing(store, account, targetCar)) {
      return { ok: false, code: -9, reason: "car-listed" };
    }
    // Build/tuning lock (`isLocked`) should not prevent selecting a default race car.
    // Only used-car listings (race lock) block default selection.

    markSelectedCar(account, targetCar.accountCarId);
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return { ok: true, account, car: targetCar };
  }

  async updateCarDynoSettings({ accountId, accountCarId, boostSetting, airFuelSetting, shiftLightRpm }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);

    if (!targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }

    if (carHasActiveUsedCarListing(store, account, targetCar)) {
      return { ok: false, code: -9, reason: "car-listed" };
    }
    if (garageCarBuildLocked(targetCar)) {
      return lockedGarageCarMutationResult();
    }

    const normalizedBoost = Number(boostSetting);
    if (Number.isFinite(normalizedBoost)) {
      targetCar.dynoBoostSetting = Math.max(0, normalizedBoost);
    }

    const normalizedAirFuel = Number(airFuelSetting);
    if (Number.isFinite(normalizedAirFuel)) {
      targetCar.dynoAirFuelSetting = normalizedAirFuel;
    }

    const normalizedShiftLight = Number(shiftLightRpm);
    if (Number.isFinite(normalizedShiftLight)) {
      targetCar.shiftLightRpm = Math.max(0, Math.floor(normalizedShiftLight));
    }

    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return { ok: true, account, car: targetCar };
  }

  async saveCarDynoGraph({ accountId, accountCarId, graph }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);

    if (!targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }

    targetCar.dynoGraph = {
      g1: String(graph?.g1 ?? ""),
      g2: String(graph?.g2 ?? ""),
      g3: String(graph?.g3 ?? ""),
      g4: String(graph?.g4 ?? ""),
      g5: String(graph?.g5 ?? ""),
    };

    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return { ok: true, account, car: targetCar };
  }

  async applyEngineDamageToCar({
    accountId,
    accountCarId,
    damageState,
    accumulateMechanical = false,
  }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);
    if (!targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }

    const catalogCar = getCatalogCar(targetCar.catalogCarId) || getCatalogCar(1) || {};
    const performance = calculateRacePerformance({ account, targetCar, catalogCar });
    const filteredDamage = filterRaceDamageForInstalledFluids(targetCar, damageState);

    targetCar.engineDamage = applyRaceEngineDamageState(
      targetCar.engineDamage,
      filteredDamage,
      {
        accumulateMechanical,
        nitrousTankSize: performance.nitrousTankSize || 0,
      },
    );
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return { ok: true, account, car: targetCar };
  }

  async repairCarEngine({ accountId, accountCarId, componentKeys = null, paysWithPoints = false }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);
    if (!targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }

    const currentDamage = normalizeEngineDamageState(targetCar.engineDamage);
    const keysToRepair = Array.isArray(componentKeys) && componentKeys.length > 0
      ? componentKeys
      : [...ENGINE_DAMAGE_COMPONENTS, "oil", "oilFilter", "coolant", "nitrousRemaining", "raceGas"];

    let totalCost = 0;
    const repaired = {};
    const canRepairNitrous = hasInstalledNitrous(targetCar.partsXml);
    for (const key of keysToRepair) {
      if (!Object.hasOwn(currentDamage, key)) continue;
      if (key === "nitrousRemaining" && !canRepairNitrous) continue;
      let damage = Number(currentDamage[key] || 0);
      if (key === "nitrousRemaining") {
        damage = 100 - damage; // 100 remaining = 0 damage, 0 remaining = 100 damage
      }
      if (damage <= 0) continue;
      totalCost += key === "nitrousRemaining"
        ? Math.max(1, Math.round(damage * NITROUS_REFILL_COST_PER_PERCENT))
        : FLUID_REFILL_KEYS.has(key)
          ? Math.max(1, Math.round(damage * FLUID_REFILL_COST_PER_PERCENT))
          : tieredRepairCost(damage);
      repaired[key] = damage;
    }

    if (totalCost <= 0) {
      return { ok: true, account, car: targetCar, totalCost: 0, repaired };
    }

    const money = normalizeBalance(account.money, DEFAULT_STARTING_MONEY);
    const points = normalizeBalance(account.points, DEFAULT_STARTING_POINTS);
    const available = paysWithPoints ? points : money;
    if (available < totalCost) {
      return { ok: false, code: -1, reason: "insufficient-funds", totalCost };
    }

    if (paysWithPoints) {
      account.points = points - totalCost;
    } else {
      account.money = money - totalCost;
    }

    const nextDamage = { ...currentDamage };
    for (const key of Object.keys(repaired)) {
      nextDamage[key] = key === "nitrousRemaining" ? 100 : 0;
    }
    targetCar.engineDamage = nextDamage;
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return { ok: true, account, car: targetCar, totalCost, repaired };
  }

  async updateCarGearRatios({ accountId, accountCarId, gearRatios }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);

    if (!targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }

    if (carHasActiveUsedCarListing(store, account, targetCar)) {
      return { ok: false, code: -9, reason: "car-listed" };
    }

    targetCar.partsXml = ensureStockEngineInstalled(targetCar.catalogCarId, targetCar.partsXml || "");

    const normalizedRatios = {};
    for (const key of ["f", "g", "h", "i", "j", "k", "l"]) {
      const value = Number(gearRatios?.[key]);
      if (Number.isFinite(value) && value >= 0 && value <= 10) {
        normalizedRatios[key] = Number(value.toFixed(3));
      }
    }

    if (Object.keys(normalizedRatios).length === 0) {
      return { ok: false, code: 0, reason: "missing-ratios" };
    }

    targetCar.gearRatios = {
      ...(targetCar.gearRatios || {}),
      ...normalizedRatios,
    };

    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return { ok: true, account, car: targetCar };
  }

  async getCarSellPrice({ accountId, accountCarId }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);
    if (!targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }

    return {
      ok: true,
      account,
      car: targetCar,
      price: getCatalogCarSellValue(targetCar.catalogCarId),
    };
  }

  async getCarPartsBin({ accountId, accountCarId, partsById }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);
    if (!targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }

    targetCar.partsXml = ensureStockEngineInstalled(targetCar.catalogCarId, targetCar.partsXml || "");
    const normalizedParts = normalizeInstalledPartsForCatalog(store, account, targetCar, partsById);
    const normalizedWheelTireParts = ensureCurrentWheelTirePartsInstalled(targetCar, partsById);
    const syncedWheelTireFields = syncCurrentWheelTireFieldsFromInstalledParts(targetCar);
    const normalizedSpares = normalizeSparePartsForCatalog(account, partsById);
    const spareParts = normalizeAccountSpares(account);

    if (normalizedParts.changed || normalizedWheelTireParts.changed || syncedWheelTireFields || normalizedSpares) {
      account.updatedAt = new Date().toISOString();
      await writeStore(this.filePath, store);
    }

    return {
      ok: true,
      account,
      car: targetCar,
      xml: renderPartsBinXml(targetCar.partsXml, spareParts, partsById),
      installedCount: collectPartXmlEntries(targetCar.partsXml).length,
      spareCount: spareParts.length,
    };
  }

  async getPartsBin({ accountId, partsById }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const spareParts = normalizeAccountSpares(account);
    const normalizedSpares = normalizeSparePartsForCatalog(account, partsById);

    if (normalizedSpares) {
      account.updatedAt = new Date().toISOString();
      await writeStore(this.filePath, store);
    }

    return {
      ok: true,
      account,
      xml: renderPartsBinXml("", spareParts, partsById),
      spareCount: spareParts.length,
    };
  }

  async getSystemParts({ accountId, accountCarId, engineTypeId, partsById }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);
    if (!targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }
    if (carHasActiveUsedCarListing(store, account, targetCar)) {
      return { ok: false, code: -9, reason: "car-listed" };
    }
    if (garageCarBuildLocked(targetCar)) {
      return lockedGarageCarMutationResult();
    }

    const slotIds = systemCategoryIdsForEngineType(engineTypeId);
    if (slotIds.length === 0) {
      return { ok: false, code: 0, reason: "unknown-system" };
    }

    targetCar.partsXml = ensureStockEngineInstalled(targetCar.catalogCarId, targetCar.partsXml || "");
    const normalizedParts = normalizeInstalledPartsForCatalog(store, account, targetCar, partsById);
    const normalizedSpares = normalizeSparePartsForCatalog(account, partsById);
    const spareParts = normalizeAccountSpares(account);

    if (normalizedParts.changed || normalizedSpares) {
      account.updatedAt = new Date().toISOString();
      await writeStore(this.filePath, store);
    }

    return {
      ok: true,
      account,
      car: targetCar,
      xml: renderSystemPartsXml(targetCar, spareParts, engineTypeId, partsById),
    };
  }

  async systemSwap({ accountId, accountCarId, engineTypeId, selectedPartIds = [], partsById }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);
    if (!targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }
    if (carHasActiveUsedCarListing(store, account, targetCar)) {
      return { ok: false, code: -9, reason: "car-listed" };
    }
    if (garageCarBuildLocked(targetCar)) {
      return lockedGarageCarMutationResult();
    }

    const slotIds = systemCategoryIdsForEngineType(engineTypeId);
    if (slotIds.length === 0) {
      return { ok: false, code: 0, reason: "unknown-system" };
    }

    targetCar.partsXml = ensureStockEngineInstalled(targetCar.catalogCarId, targetCar.partsXml || "");
    normalizeInstalledPartsForCatalog(store, account, targetCar, partsById);
    normalizeSparePartsForCatalog(account, partsById);

    const spareParts = normalizeAccountSpares(account);
    const selectedIds = selectedPartIds.map((value) => String(value || "").trim()).filter(Boolean);
    const selectedBySlot = new Map();
    const selectedSpareIds = new Set();

    for (const selectedId of selectedIds) {
      const sparePart = spareParts.find((part) => String(part.id || "") === selectedId);
      if (sparePart) {
        const normalizedXml = renderPartForBin(sparePart.partXml, partsById);
        const slotId = Number(getXmlAttribute(normalizedXml, "ci") || getXmlAttribute(normalizedXml, "pi") || 0);
        if (slotIds.includes(slotId)) {
          selectedBySlot.set(slotId, {
            partId: Number(getXmlAttribute(normalizedXml, "i") || sparePart.partId || 0),
            xml: normalizedXml,
          });
          selectedSpareIds.add(Number(sparePart.id || 0));
        }
        continue;
      }

      const installedPart = findInstalledPartEntryByInstallId(targetCar.partsXml || "", selectedId);
      const slotId = Number(installedPart?.attrs?.ci || installedPart?.attrs?.pi || 0);
      if (installedPart?.raw && slotIds.includes(slotId)) {
        selectedBySlot.set(slotId, {
          partId: Number(installedPart.attrs.i || 0),
          xml: renderPartForBin(installedPart.raw, partsById),
        });
      }
    }

    const missingSlotIds = slotIds.filter((slotId) => !selectedBySlot.has(Number(slotId)));
    if (missingSlotIds.length > 0) {
      return { ok: false, code: -1, reason: `missing-slots:${missingSlotIds.join(",")}` };
    }

    let nextPartsXml = String(targetCar.partsXml || "");
    const obsoleteSlotIds = Number(engineTypeId) === ENGINE_TYPE_TURBO
      ? [HEADER_CATEGORY_ID, ...SUPERCHARGER_SYSTEM_CATEGORY_IDS]
      : Number(engineTypeId) === ENGINE_TYPE_SUPERCHARGER
        ? [HEADER_CATEGORY_ID, ...TURBO_SYSTEM_CATEGORY_IDS]
        : installedForcedInductionCategoryIds(nextPartsXml);

    for (const slotId of obsoleteSlotIds) {
      const installedPart = findInstalledPartEntryBySlot(nextPartsXml, slotId);
      if (installedPart?.raw) {
        addSparePartFromInstalledXml(store, account, installedPart.raw);
        nextPartsXml = removeInstalledPartEntryBySlot(nextPartsXml, slotId);
      }
    }

    let offset = 0;
    for (const slotId of slotIds) {
      const selectedPart = selectedBySlot.get(Number(slotId));
      const existingPart = findInstalledPartEntryBySlot(nextPartsXml, slotId);
      if (Number(existingPart?.attrs?.i || 0) !== Number(selectedPart.partId || 0)) {
        addSparePartFromInstalledXml(store, account, existingPart?.raw);
      }

      let installedXml = selectedPart.xml;
      installedXml = setXmlAttribute(installedXml, "ai", createInstalledPartId(offset));
      installedXml = setXmlAttribute(installedXml, "in", 1);
      nextPartsXml = upsertInstalledPartXml(nextPartsXml, slotId, installedXml);
      offset += 1;
    }

    targetCar.partsXml = nextPartsXml;
    targetCar.engineTypeId = Number(engineTypeId);
    syncDynoBoostSettingFromInstalledBoostPart(targetCar);
    account.spareParts = normalizeAccountSpares(account)
      .filter((part) => !selectedSpareIds.has(Number(part.id || 0)));
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      car: targetCar,
    };
  }

  async getSparePartsValue({ accountId }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const value = normalizeAccountSpares(account).reduce(
      (total, sparePart) => total + getSparePartSellValueFromXml(sparePart.partXml),
      0,
    );

    return {
      ok: true,
      account,
      value,
    };
  }

  async installSparePart({ accountId, accountCarId, sparePartId, expectedPartId, installId, partsById }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);
    if (!targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }
    if (carHasActiveUsedCarListing(store, account, targetCar)) {
      return { ok: false, code: -9, reason: "car-listed" };
    }
    if (garageCarBuildLocked(targetCar)) {
      return lockedGarageCarMutationResult();
    }

    const spareParts = normalizeAccountSpares(account);
    const sparePart = spareParts.find((part) => Number(part.id || 0) === Number(sparePartId || 0));
    if (!sparePart) {
      return { ok: false, code: 0, reason: "spare-part-not-found" };
    }

    const normalizedSpareXml = renderPartForBin(sparePart.partXml, partsById);
    const partId = Number(getXmlAttribute(normalizedSpareXml, "i") || sparePart.partId || 0);
    if (Number(expectedPartId || 0) > 0 && Number(expectedPartId) !== partId) {
      return { ok: false, code: 0, reason: "part-mismatch" };
    }

    if (isNonPurchasableCatalogPart({ i: partId, n: getXmlAttribute(normalizedSpareXml, "n"), mn: getXmlAttribute(normalizedSpareXml, "mn") })) {
      return { ok: false, code: 0, reason: "part-not-for-sale" };
    }

    const slotId = normalizedPartSlotIdFromXml(normalizedSpareXml);
    if (!slotId) {
      return { ok: false, code: 0, reason: "missing-slot" };
    }
    if (FORCED_INDUCTION_SYSTEM_CATEGORY_IDS.has(slotId)) {
      return { ok: false, code: -2, reason: "system-slot-blocked" };
    }
    if (slotId === HEADER_CATEGORY_ID && hasInstalledForcedInduction(targetCar.partsXml)) {
      return { ok: false, code: -2, reason: "system-slot-blocked" };
    }

    const existingPart = findInstalledPartEntryBySlot(targetCar.partsXml, slotId);
    if (Number(existingPart?.attrs?.i || 0) !== partId) {
      addSparePartFromInstalledXml(store, account, existingPart?.raw);
    }

    let installedXml = setXmlAttribute(normalizedSpareXml, "ai", installId);
    installedXml = setXmlAttribute(installedXml, "in", 1);
    installedXml = setXmlAttribute(installedXml, "ci", slotId);
    installedXml = setXmlAttribute(installedXml, "categoryID", slotId);
    installedXml = setXmlAttribute(installedXml, "p", getXmlAttribute(sparePart.partXml, "p"));
    installedXml = setXmlAttribute(installedXml, "pp", getXmlAttribute(sparePart.partXml, "pp"));
    targetCar.partsXml = upsertInstalledPartXml(targetCar.partsXml, slotId, installedXml);
    if (slotId === WHEEL_CATEGORY_ID) {
      targetCar.wheelPartId = partId;
      targetCar.wheelDesignId = Number(getXmlAttribute(installedXml, "di") || getXmlAttribute(installedXml, "pdi") || targetCar.wheelDesignId || 1);
      targetCar.wheelSize = Number(getXmlAttribute(installedXml, "ps") || targetCar.wheelSize || 17);
    }
    if (slotId === TIRE_CATEGORY_ID) {
      targetCar.tirePartId = partId;
      targetCar.tireDesignId = Number(getXmlAttribute(installedXml, "di") || getXmlAttribute(installedXml, "pdi") || targetCar.tireDesignId || 1);
      targetCar.tireSize = Number(getXmlAttribute(installedXml, "ps") || targetCar.tireSize || STOCK_TIRE_SIZE);
    }
    dedupeInstalledPartsBySlot({ store, account, car: targetCar, partsById });
    normalizeCarAfterPartInventoryChange(targetCar);
    account.spareParts = normalizeAccountSpares(account)
      .filter((part) => Number(part.id || 0) !== Number(sparePartId || 0));
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      car: targetCar,
      partId,
      installId,
    };
  }

  async uninstallCarParts({ accountId, accountCarId, installIds, expectedPartIds = [] }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);
    if (!targetCar) {
      return { ok: false, code: -5, reason: "car-not-found" };
    }
    if (carHasActiveUsedCarListing(store, account, targetCar)) {
      return { ok: false, code: -9, reason: "car-listed" };
    }
    if (garageCarBuildLocked(targetCar)) {
      return lockedGarageCarMutationResult();
    }

    const normalizedInstallIds = Array.isArray(installIds)
      ? installIds.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    if (normalizedInstallIds.length === 0) {
      return { ok: false, code: 0, reason: "missing-install-id" };
    }

    let nextPartsXml = String(targetCar.partsXml || "");
    let removedCount = 0;

    for (let index = 0; index < normalizedInstallIds.length; index += 1) {
      const installId = normalizedInstallIds[index];
      const expectedPartId = Number(expectedPartIds[index] || 0);
      const installedPart = findInstalledPartEntryByInstallId(nextPartsXml, installId);
      if (!installedPart) {
        continue;
      }

      const partId = Number(installedPart.attrs.i || 0);
      if (expectedPartId > 0 && partId > 0 && partId !== expectedPartId) {
        continue;
      }

      const slotId = Number(installedPart.attrs.ci || installedPart.attrs.pi || 0);
      if (FORCED_INDUCTION_SYSTEM_CATEGORY_IDS.has(slotId)) {
        return { ok: false, code: -2, reason: "system-slot-blocked" };
      }

      if (String(installedPart.attrs.ai || "") === "0") {
        return { ok: false, code: -3, reason: "stock-part" };
      }

      nextPartsXml = removeInstalledPartEntryByInstallId(nextPartsXml, installId);
      addSparePartFromInstalledXml(store, account, installedPart.raw);
      removedCount += 1;
    }

    if (removedCount <= 0) {
      return { ok: false, code: 0, reason: "no-op" };
    }

    targetCar.partsXml = nextPartsXml;
    normalizeCarAfterPartInventoryChange(targetCar);
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      car: targetCar,
      removedCount,
    };
  }

  async sellSparePart({ accountId, sparePartId, sellAll = false }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const spareParts = normalizeAccountSpares(account);
    const partsToSell = sellAll
      ? [...spareParts]
      : spareParts.filter((sparePart) => Number(sparePart.id || 0) === Number(sparePartId || 0));

    if (partsToSell.length === 0) {
      return { ok: false, code: -1, reason: "spare-part-not-found", balance: account.money || 0, value: 0 };
    }

    const soldIds = new Set(partsToSell.map((sparePart) => Number(sparePart.id || 0)));
    const value = partsToSell.reduce(
      (total, sparePart) => total + getSparePartSellValueFromXml(sparePart.partXml),
      0,
    );

    const before = economySnapshot(account);
    account.money = normalizeBalance(account.money, DEFAULT_STARTING_MONEY) + value;
    account.spareParts = spareParts.filter((sparePart) => !soldIds.has(Number(sparePart.id || 0)));
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);
    this.auditAccountEconomy(account, "sellSpareParts", before, {
      value,
      partsSold: partsToSell.length,
    });

    return {
      ok: true,
      account,
      value,
      balance: account.money,
    };
  }

  async listUsedCarListings({ catalogCarId = 0, limit = 100, includePrivate = false } = {}) {
    const store = await readStore(this.filePath);
    const requestedCatalogCarId = Number(catalogCarId || 0);
    const maxResults = Math.min(Math.max(Number(limit) || 100, 1), 250);
    const now = Date.now();

    const listings = store.usedCarListings
      .filter((listing) => usedCarListingActive(listing, now))
      .filter((listing) => includePrivate || !usedCarListingPrivate(listing))
      .filter((listing) => !requestedCatalogCarId || Number(listing.catalogCarId || 0) === requestedCatalogCarId)
      .map((listing) => {
        const sellerAccount = store.accounts.find((account) => Number(account.id || 0) === Number(listing.sellerAccountId || 0));
        const sellerCar = sellerAccount ? findGarageCar(sellerAccount, listing.accountCarId) : null;
        if (!sellerAccount || !sellerCar) {
          return null;
        }

        return {
          ...listing,
          sellerAccount,
          car: sellerCar,
          pendingTradeCount: usedCarPendingTradeCountForListing(store, listing.id),
        };
      })
      .filter(Boolean)
      .sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""))
      .slice(0, maxResults);

    return { ok: true, listings };
  }

  async getUsedCarListing({ listingId }) {
    const store = await readStore(this.filePath);
    const listing = store.usedCarListings.find((item) => Number(item.id || 0) === Number(listingId || 0));

    if (!usedCarListingActive(listing)) {
      return { ok: false, code: 0, reason: listing ? "listing-expired" : "listing-not-found" };
    }

    const sellerAccount = store.accounts.find((account) => Number(account.id || 0) === Number(listing.sellerAccountId || 0));
    const sellerCar = sellerAccount ? findGarageCar(sellerAccount, listing.accountCarId) : null;

    if (!sellerAccount || !sellerCar) {
      return { ok: false, code: 0, reason: "seller-car-not-found" };
    }

    return {
      ok: true,
      listing: {
        ...listing,
        sellerAccount,
        car: sellerCar,
        pendingTradeCount: usedCarPendingTradeCountForListing(store, listing.id),
      },
    };
  }

  async createUsedCarListing({
    sellerAccountId,
    accountCarId,
    askingPrice,
    currencyType,
    description,
    daysDuration,
    allowTrades = false,
    privatePassword = "",
  }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(sellerAccountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCar = findGarageCar(account, accountCarId);
    if (!targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }

    if (garageCarsFor(account).length <= 1) {
      return { ok: false, code: -1, reason: "only-car" };
    }

    if (targetCar.testDrive || targetCar.testDriveExpired) {
      return { ok: false, code: -4, reason: "test-drive" };
    }

    const price = normalizeUsedCarPrice(askingPrice);
    if (!price) {
      return { ok: false, code: 0, reason: "invalid-price" };
    }

    const normalizedCurrencyType = normalizeUsedCarCurrencyType(currencyType);
    const existingListing = store.usedCarListings.find((listing) => (
      usedCarListingActive(listing)
      && Number(listing.sellerAccountId || 0) === Number(account.id || 0)
      && Number(listing.accountCarId || 0) === Number(targetCar.accountCarId || 0)
    ));
    const now = new Date().toISOString();
    const listing = existingListing || {
      id: allocateUsedCarListingId(store),
      status: "active",
      sellerAccountId: Number(account.id || 0),
      sellerUsername: account.username || "",
      accountCarId: Number(targetCar.accountCarId || 0),
      catalogCarId: Number(targetCar.catalogCarId || 0),
      createdAt: now,
    };

    listing.status = "active";
    listing.sellerUsername = account.username || listing.sellerUsername || "";
    listing.accountCarId = Number(targetCar.accountCarId || 0);
    listing.catalogCarId = Number(targetCar.catalogCarId || 0);
    listing.askingPrice = price;
    listing.currencyType = normalizedCurrencyType;
    listing.allowTrades = Boolean(allowTrades);
    listing.privatePassword = String(privatePassword || "").trim().slice(0, 40);
    listing.description = String(description || "").trim().slice(0, 160);
    listing.expiresAt = usedCarListingExpiresAt(daysDuration);
    listing.updatedAt = now;
    listing.carSnapshot = cloneGarageCar(targetCar);

    if (!existingListing) {
      store.usedCarListings.push(listing);
    }

    targetCar.usedCarListingId = Number(listing.id || 0);
    targetCar.usedCarListedAt = now;
    targetCar.usedCarAskingPrice = price;
    targetCar.usedCarCurrencyType = normalizedCurrencyType;
    targetCar.usedCarAllowTrades = listing.allowTrades;
    targetCar.usedCarPrivateListing = listing.privatePassword.length > 0;
    account.updatedAt = now;
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      car: targetCar,
      listing,
    };
  }

  async buyUsedCar({ buyerAccountId, listingId, password = "" }) {
    const store = await readStore(this.filePath);
    const buyerAccount = store.accounts.find((item) => Number(item.id) === Number(buyerAccountId));

    if (!buyerAccount) {
      return { ok: false, code: 0, reason: "buyer-not-found" };
    }

    const listing = store.usedCarListings.find((item) => Number(item.id || 0) === Number(listingId || 0));
    if (!usedCarListingActive(listing)) {
      return { ok: false, code: listing ? -7 : 0, reason: listing ? "listing-expired" : "listing-not-found" };
    }

    const sellerAccount = store.accounts.find((item) => Number(item.id || 0) === Number(listing.sellerAccountId || 0));
    if (!sellerAccount) {
      return { ok: false, code: 0, reason: "seller-not-found" };
    }

    if (Number(sellerAccount.id || 0) === Number(buyerAccount.id || 0)) {
      return { ok: false, code: -6, reason: "self-purchase" };
    }

    if (String(listing.privatePassword || "").length > 0 && String(password || "") !== String(listing.privatePassword)) {
      return { ok: false, code: 0, reason: "private-password" };
    }

    const sellerCar = findGarageCar(sellerAccount, listing.accountCarId);
    if (!sellerCar) {
      listing.status = "cancelled";
      listing.cancelReason = "seller-car-not-found";
      listing.updatedAt = new Date().toISOString();
      await writeStore(this.filePath, store);
      return { ok: false, code: 0, reason: "seller-car-not-found" };
    }

    const currencyType = normalizeUsedCarCurrencyType(listing.currencyType);
    const price = normalizeUsedCarPrice(listing.askingPrice);
    const buyerMoney = normalizeBalance(buyerAccount.money, DEFAULT_STARTING_MONEY);
    const buyerPoints = normalizeBalance(buyerAccount.points, DEFAULT_STARTING_POINTS);
    const buyerBalance = currencyType === "points" ? buyerPoints : buyerMoney;

    if (buyerBalance < price) {
      return {
        ok: false,
        code: currencyType === "points" ? -5 : -4,
        reason: currencyType === "points" ? "insufficient-points" : "insufficient-money",
        balance: buyerBalance,
      };
    }

    const buyerBefore = economySnapshot(buyerAccount);
    const sellerBefore = economySnapshot(sellerAccount);
    const now = new Date().toISOString();
    if (currencyType === "points") {
      buyerAccount.points = buyerPoints - price;
      sellerAccount.points = normalizeBalance(sellerAccount.points, DEFAULT_STARTING_POINTS) + price;
    } else {
      buyerAccount.money = buyerMoney - price;
      sellerAccount.money = normalizeBalance(sellerAccount.money, DEFAULT_STARTING_MONEY) + price;
    }

    const transferredCar = clearUsedCarListingFields(cloneGarageCar(sellerCar));
    removeGarageCarFromAccount(sellerAccount, sellerCar.accountCarId);
    transferredCar.accountCarId = allocateGarageCarId(store);
    transferredCar.selected = false;
    transferredCar.usedCarBoughtFromAccountId = Number(sellerAccount.id || 0);
    transferredCar.usedCarBoughtAt = now;

    buyerAccount.garageCars = Array.isArray(buyerAccount.garageCars) ? buyerAccount.garageCars : [];
    buyerAccount.garageCars.push(transferredCar);
    markSelectedCar(buyerAccount, transferredCar.accountCarId);

    listing.status = "sold";
    listing.buyerAccountId = Number(buyerAccount.id || 0);
    listing.buyerUsername = buyerAccount.username || "";
    listing.soldAt = now;
    listing.updatedAt = now;
    listing.carSnapshot = cloneGarageCar(sellerCar);
    listing.sellerProfitAcknowledged = false;
    buyerAccount.updatedAt = now;
    sellerAccount.updatedAt = now;
    sellerAccount.uclSoldAwaitingAck = Number(listing.id || 0);
    await writeStore(this.filePath, store);
    this.auditAccountEconomy(buyerAccount, "buyUsedCarListing:buyer", buyerBefore, {
      listingId: Number(listing.id || 0),
      sellerAccountId: Number(sellerAccount.id || 0),
      price,
      currencyType,
      catalogCarId: Number(transferredCar.catalogCarId || 0),
      accountCarId: transferredCar.accountCarId,
    });
    this.auditAccountEconomy(sellerAccount, "buyUsedCarListing:seller", sellerBefore, {
      listingId: Number(listing.id || 0),
      buyerAccountId: Number(buyerAccount.id || 0),
      price,
      currencyType,
      catalogCarId: Number(transferredCar.catalogCarId || 0),
      accountCarId: transferredCar.accountCarId,
    });

    return {
      ok: true,
      buyerAccount,
      sellerAccount,
      car: transferredCar,
      listing,
      balance: currencyType === "points" ? buyerAccount.points : buyerAccount.money,
      paymentType: currencyType === "points" ? "p" : "m",
      price,
    };
  }

  async acknowledgePendingUclProfit({ sellerAccountId }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(sellerAccountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const pendingListings = store.usedCarListings.filter((listing) => (
      Number(listing.sellerAccountId || 0) === Number(account.id || 0)
      && String(listing.status || "").toLowerCase() === "sold"
      && !listing.sellerProfitAcknowledged
    ));

    if (pendingListings.length === 0 && !Number(account.uclSoldAwaitingAck || 0)) {
      return { ok: false, code: -1, reason: "no-sold-cars" };
    }

    const now = new Date().toISOString();
    for (const listing of pendingListings) {
      listing.sellerProfitAcknowledged = true;
      listing.updatedAt = now;
    }

    account.uclSoldAwaitingAck = 0;
    account.updatedAt = now;
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      balance: normalizeBalance(account.money, DEFAULT_STARTING_MONEY),
      points: normalizeBalance(account.points, DEFAULT_STARTING_POINTS),
      acknowledgedListings: pendingListings.length,
    };
  }

  async cancelUsedCarListing({ sellerAccountId, listingId }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(sellerAccountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const listing = store.usedCarListings.find((item) => Number(item.id || 0) === Number(listingId || 0));
    if (!listing || Number(listing.sellerAccountId || 0) !== Number(account.id || 0)) {
      return { ok: false, code: 0, reason: "listing-not-found" };
    }

    if (!usedCarListingActive(listing)) {
      return { ok: false, code: 0, reason: "listing-not-active" };
    }

    const now = new Date().toISOString();
    const targetCar = findGarageCar(account, listing.accountCarId);
    clearUsedCarListingFields(targetCar);
    listing.status = "cancelled";
    listing.cancelledAt = now;
    listing.updatedAt = now;
    account.updatedAt = now;
    await writeStore(this.filePath, store);

    return { ok: true, account, listing };
  }

  async usedCarListingHistory({ accountId }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const listings = store.usedCarListings
      .filter((listing) => Number(listing.sellerAccountId || 0) === Number(account.id || 0))
      .map((listing) => hydrateUsedCarListingRecord(store, listing))
      .filter(Boolean)
      .sort((left, right) => Date.parse(right.updatedAt || right.createdAt || "") - Date.parse(left.updatedAt || left.createdAt || ""));

    return { ok: true, account, listings };
  }

  async requestUsedCarTrade({ requesterAccountId, offeredListingId, targetListingId, password = "" }) {
    const store = await readStore(this.filePath);
    const requester = store.accounts.find((item) => Number(item.id || 0) === Number(requesterAccountId || 0));

    if (!requester) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const offeredListing = hydrateUsedCarListing(store, offeredListingId);
    const targetListing = hydrateUsedCarListing(store, targetListingId);

    if (!offeredListing || !targetListing) {
      return { ok: false, code: 0, reason: "listing-not-found" };
    }
    if (Number(offeredListing.sellerAccountId || 0) !== Number(requester.id || 0)) {
      return { ok: false, code: 0, reason: "offered-listing-not-owned" };
    }
    if (Number(targetListing.sellerAccountId || 0) === Number(requester.id || 0)) {
      return { ok: false, code: -6, reason: "self-trade" };
    }
    if (!targetListing.allowTrades) {
      return { ok: false, code: 0, reason: "trades-disabled" };
    }
    if (String(targetListing.privatePassword || "").length > 0 && String(password || "") !== String(targetListing.privatePassword)) {
      return { ok: false, code: 0, reason: "private-password" };
    }

    const existingTrade = store.usedCarTrades.find((trade) => (
      usedCarTradePending(trade)
      && Number(trade.offeredListingId || 0) === Number(offeredListing.id || 0)
      && Number(trade.targetListingId || 0) === Number(targetListing.id || 0)
    ));
    const now = new Date().toISOString();
    const trade = existingTrade || {
      id: allocateUsedCarTradeId(store),
      offeredListingId: Number(offeredListing.id || 0),
      targetListingId: Number(targetListing.id || 0),
      requesterAccountId: Number(requester.id || 0),
      receiverAccountId: Number(targetListing.sellerAccountId || 0),
      createdAt: now,
    };

    trade.status = "pending";
    trade.password = String(password || "").trim().slice(0, 40);
    trade.updatedAt = now;

    if (!existingTrade) {
      store.usedCarTrades.push(trade);
    }

    await writeStore(this.filePath, store);

    return {
      ok: true,
      account: requester,
      trade: hydrateUsedCarTrade(store, trade),
    };
  }

  async listIncomingUsedCarTrades({ accountId, listingId }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id || 0) === Number(accountId || 0));
    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const trades = store.usedCarTrades
      .filter((trade) => usedCarTradePending(trade))
      .filter((trade) => Number(trade.receiverAccountId || 0) === Number(account.id || 0))
      .filter((trade) => !Number(listingId || 0) || Number(trade.targetListingId || 0) === Number(listingId || 0))
      .map((trade) => hydrateUsedCarTrade(store, trade))
      .filter(Boolean)
      .sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""));

    return { ok: true, account, trades };
  }

  async listOutgoingUsedCarTrades({ accountId }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id || 0) === Number(accountId || 0));
    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const trades = store.usedCarTrades
      .filter((trade) => Number(trade.requesterAccountId || 0) === Number(account.id || 0))
      .map((trade) => hydrateUsedCarTrade(store, trade))
      .filter(Boolean)
      .sort((left, right) => Date.parse(right.updatedAt || right.createdAt || "") - Date.parse(left.updatedAt || left.createdAt || ""));

    return { ok: true, account, trades };
  }

  async cancelUsedCarTrade({ requesterAccountId, offeredListingId, targetListingId }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id || 0) === Number(requesterAccountId || 0));
    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const trade = store.usedCarTrades.find((item) => (
      usedCarTradePending(item)
      && Number(item.requesterAccountId || 0) === Number(account.id || 0)
      && Number(item.offeredListingId || 0) === Number(offeredListingId || 0)
      && Number(item.targetListingId || 0) === Number(targetListingId || 0)
    ));

    if (!trade) {
      return { ok: false, code: 0, reason: "trade-not-found" };
    }

    trade.status = "cancelled";
    trade.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return { ok: true, account, trade };
  }

  async respondUsedCarTrade({ receiverAccountId, offeredListingId, targetListingId, accept = false }) {
    const store = await readStore(this.filePath);
    const receiver = store.accounts.find((item) => Number(item.id || 0) === Number(receiverAccountId || 0));
    if (!receiver) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const trade = store.usedCarTrades.find((item) => (
      usedCarTradePending(item)
      && Number(item.receiverAccountId || 0) === Number(receiver.id || 0)
      && Number(item.offeredListingId || 0) === Number(offeredListingId || 0)
      && Number(item.targetListingId || 0) === Number(targetListingId || 0)
    ));

    if (!trade) {
      return { ok: false, code: 0, reason: "trade-not-found" };
    }

    if (!accept) {
      trade.status = "declined";
      trade.updatedAt = new Date().toISOString();
      await writeStore(this.filePath, store);
      return { ok: true, account: receiver, trade, accepted: false };
    }

    const offeredListing = hydrateUsedCarListing(store, offeredListingId);
    const targetListing = hydrateUsedCarListing(store, targetListingId);
    const offeredRecord = store.usedCarListings.find((item) => Number(item.id || 0) === Number(offeredListingId || 0));
    const targetRecord = store.usedCarListings.find((item) => Number(item.id || 0) === Number(targetListingId || 0));
    if (!offeredListing || !targetListing) {
      trade.status = "expired";
      trade.updatedAt = new Date().toISOString();
      await writeStore(this.filePath, store);
      return { ok: false, code: 0, reason: "listing-not-found" };
    }

    const requester = offeredListing.sellerAccount;
    const offeredCar = findGarageCar(requester, offeredListing.accountCarId);
    const targetCar = findGarageCar(receiver, targetListing.accountCarId);
    if (!requester || !offeredCar || !targetCar) {
      return { ok: false, code: 0, reason: "car-not-found" };
    }

    const now = new Date().toISOString();
    const receiverGets = clearUsedCarListingFields(cloneGarageCar(offeredCar));
    const requesterGets = clearUsedCarListingFields(cloneGarageCar(targetCar));

    removeGarageCarFromAccount(requester, offeredCar.accountCarId);
    removeGarageCarFromAccount(receiver, targetCar.accountCarId);

    receiverGets.accountCarId = allocateGarageCarId(store);
    requesterGets.accountCarId = allocateGarageCarId(store);
    receiverGets.selected = false;
    requesterGets.selected = false;
    receiverGets.usedCarTradedFromAccountId = Number(requester.id || 0);
    requesterGets.usedCarTradedFromAccountId = Number(receiver.id || 0);
    receiverGets.usedCarTradedAt = now;
    requesterGets.usedCarTradedAt = now;

    receiver.garageCars = Array.isArray(receiver.garageCars) ? receiver.garageCars : [];
    requester.garageCars = Array.isArray(requester.garageCars) ? requester.garageCars : [];
    receiver.garageCars.push(receiverGets);
    requester.garageCars.push(requesterGets);
    markSelectedCar(receiver, receiverGets.accountCarId);
    markSelectedCar(requester, requesterGets.accountCarId);

    if (offeredRecord) {
      offeredRecord.status = "traded";
      offeredRecord.tradedAt = now;
      offeredRecord.updatedAt = now;
    }
    if (targetRecord) {
      targetRecord.status = "traded";
      targetRecord.tradedAt = now;
      targetRecord.updatedAt = now;
    }
    trade.status = "accepted";
    trade.acceptedAt = now;
    trade.updatedAt = now;
    receiver.updatedAt = now;
    requester.updatedAt = now;

    await writeStore(this.filePath, store);

    return {
      ok: true,
      account: receiver,
      requesterAccount: requester,
      trade,
      accepted: true,
      receiverCar: receiverGets,
      requesterCar: requesterGets,
    };
  }

  async sellCar({ accountId, accountCarId }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const targetCarId = Number(accountCarId || 0);
    const targetCar = findGarageCar(account, targetCarId);
    if (!targetCar) {
      return { ok: false, code: -2, reason: "car-not-found" };
    }

    const cars = garageCarsFor(account);
    if (cars.length <= 1) {
      return { ok: false, code: -1, reason: "only-car" };
    }

    if (targetCar.testDrive || targetCar.testDriveExpired) {
      return { ok: false, code: -4, reason: "test-drive" };
    }
    if (garageCarBuildLocked(targetCar)) {
      return { ok: false, code: -4, reason: "car-locked" };
    }

    const price = getCatalogCarSellValue(targetCar.catalogCarId);
    const money = normalizeBalance(account.money, DEFAULT_STARTING_MONEY);
    const before = economySnapshot(account);
    account.money = money + price;

    if (Number(account.starterCar?.accountCarId || 0) === targetCarId) {
      account.garageCars = Array.isArray(account.garageCars) ? account.garageCars : [];
      account.starterCar = account.garageCars.shift() || null;
    } else {
      account.garageCars = Array.isArray(account.garageCars)
        ? account.garageCars.filter((car) => Number(car.accountCarId || 0) !== targetCarId)
        : [];
    }

    const remainingCars = garageCarsFor(account);
    const currentDefaultCarId = Number(account.defaultCarAccountCarId || 0);
    const defaultStillExists = remainingCars.some((car) => Number(car.accountCarId || 0) === currentDefaultCarId);
    markSelectedCar(account, defaultStillExists ? currentDefaultCarId : remainingCars[0]?.accountCarId);

    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);
    this.auditAccountEconomy(account, "sellCar", before, {
      accountCarId: targetCarId,
      catalogCarId: Number(targetCar.catalogCarId || 0),
      price,
    });

    return {
      ok: true,
      account,
      price,
      balance: account.money,
    };
  }

  async createTeam({ accountId, name }) {
    const store = await readStore(this.filePath);
    const { account, team: existingTeam } = findTeamContext(store, accountId);

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }
    if (existingTeam) {
      return { ok: false, code: -1, reason: "already-on-team", account, team: normalizeTeamRecord(existingTeam, store) };
    }

    const teamName = cleanTeamName(name);
    if (!validTeamName(teamName)) {
      return { ok: false, code: 0, reason: "invalid-team-name", account };
    }

    const key = teamNameKey(teamName);
    if (store.teams.some((team) => teamNameKey(team?.name || team?.nameKey || "") === key)) {
      return { ok: false, code: -2, reason: "team-name-taken", account };
    }

    const now = new Date().toISOString();
    const team = {
      id: allocateTeamId(store),
      name: teamName,
      nameKey: key,
      score: 0,
      teamFund: 0,
      backgroundColor: DEFAULT_TEAM_BACKGROUND_COLOR,
      createdAt: now,
      wins: 0,
      losses: 0,
      recruitmentType: "open",
      requirements: "",
      leaderComments: "",
      vip: 0,
      members: [{
        accountId: Number(account.id),
        username: account.username,
        role: TEAM_ROLE.LEADER,
        joinedAt: now,
        contribution: 0,
        dealerMaxBet: -1,
      }],
      applications: [],
      transactions: [],
    };

    setAccountTeamMembership(account, team, TEAM_ROLE.LEADER);
    account.updatedAt = now;
    for (const otherTeam of store.teams) {
      ensureTeamCollections(otherTeam);
      otherTeam.applications = otherTeam.applications.filter(
        (application) => Number(application?.applicantAccountId || application?.applicantPublicId || 0) !== Number(account.id),
      );
    }
    store.teams.push(team);
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      team: normalizeTeamRecord(team, store),
    };
  }

  async getTeamForAccount(accountId) {
    const store = await readStore(this.filePath);
    const { account, team, member } = findTeamContext(store, accountId);

    return {
      account,
      team: team ? normalizeTeamRecord(team, store) : null,
      member,
    };
  }

  async getTeamsByIds(teamIds = []) {
    const store = await readStore(this.filePath);
    const requestedIds = new Set(
      (Array.isArray(teamIds) ? teamIds : [])
        .map((teamId) => Number(teamId || 0))
        .filter((teamId) => Number.isInteger(teamId) && teamId > 0),
    );
    const teams = store.teams
      .filter((team) => requestedIds.has(Number(team?.id || 0)))
      .map((team) => normalizeTeamRecord(team, store));

    return teams;
  }

  async searchTeams(searchTerm, { page = 1, pageSize = 20 } = {}) {
    const store = await readStore(this.filePath);
    const term = teamNameKey(searchTerm);
    const normalizedPageSize = Number.isInteger(Number(pageSize)) && Number(pageSize) > 0
      ? Number(pageSize)
      : 20;
    const normalizedPage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
    const matches = store.teams
      .map((team) => normalizeTeamRecord(team, store))
      .filter((team) => !term || teamNameKey(team.name).includes(term))
      .sort((left, right) => {
        const scoreDelta = Number(right.score || 0) - Number(left.score || 0);
        return scoreDelta || String(left.name || "").localeCompare(String(right.name || ""));
      });
    const startIndex = (normalizedPage - 1) * normalizedPageSize;

    return {
      teams: matches.slice(startIndex, startIndex + normalizedPageSize),
      count: matches.length,
      page: normalizedPage,
      pageSize: normalizedPageSize,
    };
  }

  async getTeamTransactions({ accountId, teamId = 0 } = {}) {
    const store = await readStore(this.filePath);
    const requestedTeamId = Number(teamId || 0);
    let team = requestedTeamId
      ? store.teams.find((item) => Number(item?.id || 0) === requestedTeamId) || null
      : null;

    if (!team && accountId) {
      team = findTeamContext(store, accountId).team;
    }

    return {
      ok: true,
      team: team ? normalizeTeamRecord(team, store) : null,
      transactions: team ? ensureTeamCollections(team).transactions.slice() : [],
    };
  }

  async depositTeamFunds({ accountId, amount }) {
    const store = await readStore(this.filePath);
    const { account, team, member } = findTeamContext(store, accountId);
    const normalizedAmount = normalizeTeamAmount(amount);

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }
    if (!team || !member) {
      return { ok: false, code: 0, reason: "no-team", account };
    }
    if (!normalizedAmount || normalizedAmount > 100000000) {
      return { ok: false, code: -2, reason: "bad-amount", account, team: normalizeTeamRecord(team, store) };
    }

    const balance = normalizeBalance(account.money, DEFAULT_STARTING_MONEY);
    if (balance < normalizedAmount) {
      return {
        ok: false,
        code: -1,
        reason: "insufficient-funds",
        account,
        team: normalizeTeamRecord(team, store),
        balance,
      };
    }

    const now = new Date().toISOString();
    account.money = balance - normalizedAmount;
    account.updatedAt = now;
    team.teamFund = normalizeBalance(team.teamFund ?? team.team_fund, 0) + normalizedAmount;
    team.updatedAt = now;
    member.contribution = normalizeBalance(member.contribution, 0) + normalizedAmount;
    member.username = account.username;
    recordTeamTransaction(store, team, {
      type: TEAM_TRANSACTION_TYPE.DEPOSIT,
      username: account.username,
      amount: normalizedAmount,
    });
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      team: normalizeTeamRecord(team, store),
      balance: account.money,
      amount: normalizedAmount,
    };
  }

  async withdrawTeamFunds({ accountId, amount }) {
    const store = await readStore(this.filePath);
    const { account, team, member } = findTeamContext(store, accountId);
    const normalizedAmount = normalizeTeamAmount(amount);

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }
    if (!team || !member) {
      return { ok: false, code: 0, reason: "no-team", account };
    }
    if (!normalizedAmount || normalizedAmount > 100000000) {
      return { ok: false, code: -2, reason: "bad-amount", account, team: normalizeTeamRecord(team, store) };
    }

    const contribution = normalizeBalance(member.contribution, 0);
    const teamFund = normalizeBalance(team.teamFund ?? team.team_fund, 0);
    if (normalizedAmount > contribution || normalizedAmount > teamFund) {
      return {
        ok: false,
        code: -1,
        reason: "insufficient-team-funds",
        account,
        team: normalizeTeamRecord(team, store),
        balance: normalizeBalance(account.money, DEFAULT_STARTING_MONEY),
      };
    }

    const before = economySnapshot(account);
    const now = new Date().toISOString();
    account.money = normalizeBalance(account.money, DEFAULT_STARTING_MONEY) + normalizedAmount;
    account.updatedAt = now;
    team.teamFund = teamFund - normalizedAmount;
    team.updatedAt = now;
    member.contribution = contribution - normalizedAmount;
    member.username = account.username;
    recordTeamTransaction(store, team, {
      type: TEAM_TRANSACTION_TYPE.WITHDRAW,
      username: account.username,
      amount: normalizedAmount,
    });
    await writeStore(this.filePath, store);
    this.auditAccountEconomy(account, "withdrawTeamFunds", before, {
      teamId: Number(team.id || 0),
      amount: normalizedAmount,
    });

    return {
      ok: true,
      account,
      team: normalizeTeamRecord(team, store),
      balance: account.money,
      amount: normalizedAmount,
    };
  }

  async quitTeam({ accountId }) {
    const store = await readStore(this.filePath);
    const { account, team, member } = findTeamContext(store, accountId);

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }
    if (!team || !member) {
      return { ok: false, code: 0, reason: "no-team", account };
    }

    const joinedAt = Date.parse(member.joinedAt || account.teamJoinedAt || "");
    if (Number.isFinite(joinedAt) && Date.now() - joinedAt < RECENT_TEAM_JOIN_QUIT_GRACE_MS) {
      return {
        ok: false,
        code: 0,
        reason: "recently-joined",
        account,
        team: normalizeTeamRecord(team, store),
      };
    }

    ensureTeamCollections(team);
    const remainingMembers = team.members.filter((item) => (
      Number(item?.accountId || item?.id || 0) !== Number(account.id || 0)
    ));
    let successorAccount = null;
    if (normalizeTeamRole(member.role, 0) === TEAM_ROLE.LEADER && remainingMembers.length > 0) {
      const successor = remainingMembers
        .sort((left, right) => {
          const roleDelta = normalizeTeamRole(left?.role, TEAM_ROLE.MEMBER) - normalizeTeamRole(right?.role, TEAM_ROLE.MEMBER);
          const contributionDelta = normalizeBalance(right?.contribution, 0) - normalizeBalance(left?.contribution, 0);
          return roleDelta || contributionDelta || Number(left?.accountId || 0) - Number(right?.accountId || 0);
        })[0];
      if (successor) {
        successor.role = TEAM_ROLE.LEADER;
        successor.dealerMaxBet = -1;
        successorAccount = store.accounts.find((item) => Number(item.id || 0) === Number(successor.accountId || 0)) || null;
      }
    }

    const now = new Date().toISOString();
    team.members = remainingMembers;
    team.applications = team.applications.filter((application) => (
      Number(application?.applicantAccountId || application?.applicantPublicId || 0) !== Number(account.id || 0)
    ));
    clearAccountTeamMembership(account);
    account.updatedAt = now;
    if (successorAccount) {
      setAccountTeamMembership(successorAccount, team, TEAM_ROLE.LEADER);
      successorAccount.updatedAt = now;
    }

    if (team.members.length === 0) {
      store.teams = store.teams.filter((item) => Number(item?.id || 0) !== Number(team.id || 0));
    } else {
      team.updatedAt = now;
    }

    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      successorAccount,
      team: team.members.length > 0 ? normalizeTeamRecord(team, store) : null,
      affectedAccounts: [account, successorAccount].filter(Boolean),
    };
  }

  async disperseTeam({
    accountId,
    amount,
    targetAccountId = 0,
    alternateAmount = 0,
    alternateTargetAccountId = 0,
  }) {
    const store = await readStore(this.filePath);
    const { account, team, member } = findTeamContext(store, accountId);

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }
    if (!team || !member || !isTeamManagerRole(member.role)) {
      return {
        ok: false,
        code: 0,
        reason: "not-manager",
        account,
        team: team ? normalizeTeamRecord(team, store) : null,
      };
    }

    ensureTeamCollections(team);
    const candidateTransfers = [
      { targetAccountId: Number(targetAccountId || 0), amount: normalizeTeamAmount(amount) },
      { targetAccountId: Number(alternateTargetAccountId || 0), amount: normalizeTeamAmount(alternateAmount) },
      { targetAccountId: Number(account.id || 0), amount: normalizeTeamAmount(amount) },
    ];
    const selectedTransfer = candidateTransfers.find((candidate) => (
      candidate.amount > 0 && teamMemberForAccount(team, candidate.targetAccountId)
    )) || candidateTransfers.find((candidate) => candidate.amount > 0);
    const normalizedAmount = normalizeTeamAmount(selectedTransfer?.amount);
    const targetMember = teamMemberForAccount(team, selectedTransfer?.targetAccountId)
      || teamMemberForAccount(team, account.id);
    const targetId = Number(targetMember?.accountId || targetMember?.id || account.id || 0);
    const targetAccount = store.accounts.find((item) => Number(item.id || 0) === targetId) || null;

    if (!targetMember || !targetAccount) {
      return { ok: false, code: -3, reason: "target-not-on-team", account, team: normalizeTeamRecord(team, store) };
    }
    if (!normalizedAmount || normalizedAmount > 100000000) {
      return { ok: false, code: -2, reason: "bad-amount", account, team: normalizeTeamRecord(team, store) };
    }

    const teamFund = normalizeBalance(team.teamFund ?? team.team_fund, 0);
    if (normalizedAmount > teamFund) {
      return {
        ok: false,
        code: -1,
        reason: "insufficient-team-funds",
        account,
        team: normalizeTeamRecord(team, store),
        balance: normalizeBalance(account.money, DEFAULT_STARTING_MONEY),
      };
    }

    const targetBefore = economySnapshot(targetAccount);
    const now = new Date().toISOString();
    targetAccount.money = normalizeBalance(targetAccount.money, DEFAULT_STARTING_MONEY) + normalizedAmount;
    targetAccount.updatedAt = now;
    team.teamFund = teamFund - normalizedAmount;
    team.updatedAt = now;
    targetMember.username = targetAccount.username;
    recordTeamTransaction(store, team, {
      type: TEAM_TRANSACTION_TYPE.DISPERSE,
      username: targetAccount.username,
      amount: normalizedAmount,
    });
    await writeStore(this.filePath, store);
    this.auditAccountEconomy(targetAccount, "disperseTeamFunds", targetBefore, {
      teamId: Number(team.id || 0),
      disbursedByAccountId: Number(account.id || 0),
      amount: normalizedAmount,
    });

    const normalizedTeam = normalizeTeamRecord(team, store);

    return {
      ok: true,
      account,
      targetAccount,
      team: normalizedTeam,
      teamId: normalizedTeam.id,
      amount: normalizedAmount,
      balance: normalizeBalance(account.money, DEFAULT_STARTING_MONEY),
      targetBalance: normalizeBalance(targetAccount.money, DEFAULT_STARTING_MONEY),
      affectedAccounts: [account, targetAccount].filter((item, index, items) => (
        item && items.findIndex((other) => Number(other?.id || 0) === Number(item.id || 0)) === index
      )),
    };
  }

  async stepDownTeamLeader({ accountId }) {
    const store = await readStore(this.filePath);
    const { account, team, member } = findTeamContext(store, accountId);

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }
    if (!team || !member || normalizeTeamRole(member.role, 0) !== TEAM_ROLE.LEADER) {
      return {
        ok: false,
        code: 0,
        reason: "not-leader",
        account,
        team: team ? normalizeTeamRecord(team, store) : null,
      };
    }

    ensureTeamCollections(team);
    const successor = team.members
      .filter((item) => Number(item?.accountId || item?.id || 0) !== Number(account.id || 0))
      .sort((left, right) => {
        const roleDelta = normalizeTeamRole(left?.role, TEAM_ROLE.MEMBER) - normalizeTeamRole(right?.role, TEAM_ROLE.MEMBER);
        const contributionDelta = normalizeBalance(right?.contribution, 0) - normalizeBalance(left?.contribution, 0);
        return roleDelta || contributionDelta || Number(left?.accountId || 0) - Number(right?.accountId || 0);
      })[0];

    if (!successor) {
      return {
        ok: false,
        code: -1,
        reason: "no-successor",
        account,
        team: normalizeTeamRecord(team, store),
      };
    }

    member.role = TEAM_ROLE.MEMBER;
    successor.role = TEAM_ROLE.LEADER;
    team.updatedAt = new Date().toISOString();

    const successorAccount = store.accounts.find((item) => Number(item.id || 0) === Number(successor.accountId || 0)) || null;
    setAccountTeamMembership(account, team, TEAM_ROLE.MEMBER);
    account.updatedAt = team.updatedAt;
    if (successorAccount) {
      setAccountTeamMembership(successorAccount, team, TEAM_ROLE.LEADER);
      successorAccount.updatedAt = team.updatedAt;
    }

    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      successorAccount,
      team: normalizeTeamRecord(team, store),
      affectedAccounts: [account, successorAccount].filter(Boolean),
    };
  }

  async kickTeamMember({ accountId, targetAccountId }) {
    const store = await readStore(this.filePath);
    const { account, team, member } = findTeamContext(store, accountId);
    const normalizedTargetId = Number(targetAccountId || 0);

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }
    if (!team || !member) {
      return { ok: false, code: -2, reason: "no-team", account };
    }
    if (!normalizedTargetId) {
      return { ok: false, code: -2, reason: "missing-target", account, team: normalizeTeamRecord(team, store) };
    }
    if (normalizedTargetId === Number(account.id || 0)) {
      return { ok: false, code: 0, reason: "cannot-kick-self", account, team: normalizeTeamRecord(team, store) };
    }

    const callerRole = normalizeTeamRole(member.role, 0);
    if (!isTeamManagerRole(callerRole)) {
      return { ok: false, code: -3, reason: "not-manager", account, team: normalizeTeamRecord(team, store) };
    }

    ensureTeamCollections(team);
    const targetMember = teamMemberForAccount(team, normalizedTargetId);
    const targetAccount = store.accounts.find((item) => Number(item.id || 0) === normalizedTargetId) || null;
    if (!targetMember || !targetAccount) {
      return { ok: false, code: -2, reason: "target-not-on-team", account, team: normalizeTeamRecord(team, store) };
    }

    const targetRole = normalizeTeamRole(targetMember.role, TEAM_ROLE.MEMBER);
    if (targetRole === TEAM_ROLE.LEADER) {
      return {
        ok: false,
        code: callerRole === TEAM_ROLE.LEADER ? -1 : -3,
        reason: "target-is-leader",
        account,
        targetAccount,
        team: normalizeTeamRecord(team, store),
      };
    }
    if (callerRole === TEAM_ROLE.CO_LEADER && targetRole === TEAM_ROLE.CO_LEADER) {
      return {
        ok: false,
        code: -3,
        reason: "insufficient-role",
        account,
        targetAccount,
        team: normalizeTeamRecord(team, store),
      };
    }

    const now = new Date().toISOString();
    team.members = team.members.filter((item) => (
      Number(item?.accountId || item?.id || 0) !== normalizedTargetId
    ));
    team.applications = team.applications.filter((application) => (
      Number(application?.applicantAccountId || application?.applicantPublicId || 0) !== normalizedTargetId
    ));
    team.updatedAt = now;
    clearAccountTeamMembership(targetAccount);
    targetAccount.updatedAt = now;
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      targetAccount,
      team: normalizeTeamRecord(team, store),
      affectedAccounts: [account, targetAccount],
    };
  }

  async changeTeamRole({ accountId, targetAccountId, role, dealerMaxBet = 0 }) {
    const store = await readStore(this.filePath);
    const { account, team, member } = findTeamContext(store, accountId);
    const normalizedTargetId = Number(targetAccountId || 0);
    const desiredRole = normalizeTeamRole(role, 0);

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }
    if (!team || !member) {
      return { ok: false, code: -1, reason: "no-team", account };
    }

    const callerRole = normalizeTeamRole(member.role, 0);
    if (!isTeamManagerRole(callerRole)) {
      return { ok: false, code: 0, reason: "not-manager", account, team: normalizeTeamRecord(team, store) };
    }

    ensureTeamCollections(team);
    const targetMember = teamMemberForAccount(team, normalizedTargetId);
    const targetAccount = store.accounts.find((item) => Number(item.id || 0) === normalizedTargetId) || null;
    if (!targetMember || !targetAccount) {
      return { ok: false, code: -1, reason: "target-not-on-team", account, team: normalizeTeamRecord(team, store) };
    }

    const targetCurrentRole = normalizeTeamRole(targetMember.role, TEAM_ROLE.MEMBER);
    if (!desiredRole || targetCurrentRole === TEAM_ROLE.LEADER || desiredRole === TEAM_ROLE.LEADER) {
      return {
        ok: false,
        code: -2,
        reason: "leader-role-denied",
        account,
        targetAccount,
        team: normalizeTeamRecord(team, store),
      };
    }
    if (desiredRole === TEAM_ROLE.CO_LEADER && callerRole !== TEAM_ROLE.LEADER) {
      return {
        ok: false,
        code: -3,
        reason: "coleader-role-denied",
        account,
        targetAccount,
        team: normalizeTeamRecord(team, store),
      };
    }
    if (callerRole === TEAM_ROLE.CO_LEADER && targetCurrentRole === TEAM_ROLE.CO_LEADER) {
      return {
        ok: false,
        code: -3,
        reason: "insufficient-role",
        account,
        targetAccount,
        team: normalizeTeamRecord(team, store),
      };
    }

    const normalizedMaxBet = desiredRole === TEAM_ROLE.DEALER
      ? normalizeTeamDealerMaxBet(dealerMaxBet, 0)
      : -1;
    if (normalizedMaxBet === null) {
      return {
        ok: false,
        code: -4,
        reason: "bad-max-bet",
        account,
        targetAccount,
        team: normalizeTeamRecord(team, store),
      };
    }

    const now = new Date().toISOString();
    targetMember.role = desiredRole;
    targetMember.username = targetAccount.username;
    targetMember.dealerMaxBet = desiredRole === TEAM_ROLE.DEALER ? normalizedMaxBet : -1;
    team.updatedAt = now;
    setAccountTeamMembership(targetAccount, team, desiredRole);
    targetAccount.updatedAt = now;
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      targetAccount,
      team: normalizeTeamRecord(team, store),
      role: desiredRole,
      dealerMaxBet: targetMember.dealerMaxBet,
      affectedAccounts: [account, targetAccount],
    };
  }

  async updateTeamDealerMaxBet({ accountId, targetAccountId, dealerMaxBet }) {
    const store = await readStore(this.filePath);
    const { account, team, member } = findTeamContext(store, accountId);
    const normalizedTargetId = Number(targetAccountId || 0);

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }
    if (!team || !member || !isTeamManagerRole(member.role)) {
      return {
        ok: false,
        code: 0,
        reason: "not-manager",
        account,
        team: team ? normalizeTeamRecord(team, store) : null,
      };
    }

    ensureTeamCollections(team);
    const targetMember = teamMemberForAccount(team, normalizedTargetId);
    const targetAccount = store.accounts.find((item) => Number(item.id || 0) === normalizedTargetId) || null;
    if (!targetMember || !targetAccount) {
      return { ok: false, code: -1, reason: "target-not-on-team", account, team: normalizeTeamRecord(team, store) };
    }

    const normalizedMaxBet = normalizeTeamDealerMaxBet(dealerMaxBet, 0);
    if (normalizedMaxBet === null) {
      return {
        ok: false,
        code: -4,
        reason: "bad-max-bet",
        account,
        targetAccount,
        team: normalizeTeamRecord(team, store),
      };
    }

    targetMember.username = targetAccount.username;
    targetMember.dealerMaxBet = normalizedMaxBet;
    team.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      targetAccount,
      team: normalizeTeamRecord(team, store),
      dealerMaxBet: normalizedMaxBet,
      affectedAccounts: [account, targetAccount],
    };
  }

  async listTeamApplications({ teamId }) {
    const store = await readStore(this.filePath);
    const team = store.teams.find((item) => Number(item?.id || 0) === Number(teamId || 0));

    return team ? ensureTeamCollections(team).applications.slice() : [];
  }

  async listMyTeamApplications({ accountId }) {
    const store = await readStore(this.filePath);
    const normalizedAccountId = Number(accountId || 0);
    const applications = [];

    for (const team of store.teams) {
      ensureTeamCollections(team);
      for (const application of team.applications) {
        if (Number(application?.applicantAccountId || application?.applicantPublicId || 0) === normalizedAccountId) {
          applications.push({
            ...application,
            teamId: Number(team.id || application.teamId || 0),
            teamName: team.name || application.teamName || "",
            teamScore: Number(team.score || application.teamScore || 0),
          });
        }
      }
    }

    return applications;
  }

  async addTeamApplication({ accountId, teamId, comment = "" }) {
    const store = await readStore(this.filePath);
    const { account, team: currentTeam } = findTeamContext(store, accountId);
    const team = store.teams.find((item) => Number(item?.id || 0) === Number(teamId || 0));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }
    if (currentTeam) {
      return { ok: false, code: -6, reason: "already-on-team" };
    }
    if (!team) {
      return { ok: false, code: 0, reason: "team-not-found" };
    }
    if (String(team.recruitmentType || team.recruitment_type || "open").toLowerCase() === "closed") {
      return { ok: false, code: -1, reason: "recruitment-closed" };
    }

    ensureTeamCollections(team);
    if (team.applications.some((application) => (
      Number(application?.applicantAccountId || application?.applicantPublicId || 0) === Number(account.id)
    ))) {
      return { ok: false, code: -5, reason: "duplicate-application" };
    }

    const application = {
      id: store.nextTeamApplicationId,
      applicantAccountId: Number(account.id),
      applicantPublicId: Number(account.id),
      applicantName: account.username,
      applicantScore: accountStreetCredit(account),
      teamId: Number(team.id),
      teamName: team.name,
      teamScore: Number(team.score || 0),
      comment: String(comment || "").trim().slice(0, 280),
      status: TEAM_APP_STATUS.PENDING,
      createdAt: Date.now(),
    };
    store.nextTeamApplicationId += 1;
    team.applications.push(application);
    await writeStore(this.filePath, store);

    return { ok: true, application };
  }

  async deleteTeamApplication({ accountId, teamId }) {
    const store = await readStore(this.filePath);
    const team = store.teams.find((item) => Number(item?.id || 0) === Number(teamId || 0));
    if (!team) {
      return { ok: false, code: 0, reason: "team-not-found" };
    }

    ensureTeamCollections(team);
    const before = team.applications.length;
    team.applications = team.applications.filter((application) => (
      Number(application?.applicantAccountId || application?.applicantPublicId || 0) !== Number(accountId || 0)
    ));
    await writeStore(this.filePath, store);

    return { ok: true, removed: before - team.applications.length };
  }

  async updateTeamApplication({ accountId, teamId, applicantAccountId, response }) {
    const store = await readStore(this.filePath);
    const { team, member } = findTeamContext(store, accountId);
    const targetTeam = team && Number(team.id || 0) === Number(teamId || team.id || 0)
      ? team
      : store.teams.find((item) => Number(item?.id || 0) === Number(teamId || 0));

    if (!targetTeam || !member || !isTeamManagerRole(member.role)) {
      return { ok: false, code: 0, reason: "not-manager" };
    }

    ensureTeamCollections(targetTeam);
    const application = targetTeam.applications.find((entry) => (
      Number(entry?.applicantAccountId || entry?.applicantPublicId || 0) === Number(applicantAccountId || 0)
    ));
    if (!application) {
      return { ok: false, code: -1, reason: "application-not-found" };
    }
    if (String(application.status || TEAM_APP_STATUS.PENDING).toLowerCase() !== TEAM_APP_STATUS.PENDING.toLowerCase()) {
      return { ok: false, code: -2, reason: "application-already-processed" };
    }

    application.status = Number(response || 0) === 1 ? TEAM_APP_STATUS.ACCEPTED : TEAM_APP_STATUS.DECLINED;
    await writeStore(this.filePath, store);

    return { ok: true, application };
  }

  async acceptTeamApplication({ accountId, teamId = 0 }) {
    const store = await readStore(this.filePath);
    const { account, team: currentTeam } = findTeamContext(store, accountId);
    const normalizedAccountId = Number(accountId || 0);
    const requestedTeamId = Number(teamId || 0);

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const acceptedStatus = TEAM_APP_STATUS.ACCEPTED.toLowerCase();
    let targetTeam = null;
    let acceptedApplication = null;

    for (const team of store.teams) {
      ensureTeamCollections(team);
      if (requestedTeamId > 0 && Number(team.id || 0) !== requestedTeamId) {
        continue;
      }

      const application = team.applications.find((entry) => (
        Number(entry?.applicantAccountId || entry?.applicantPublicId || 0) === normalizedAccountId
        && String(entry?.status || "").toLowerCase() === acceptedStatus
      ));

      if (application) {
        targetTeam = team;
        acceptedApplication = application;
        break;
      }
    }

    if (!targetTeam || !acceptedApplication) {
      return { ok: false, code: -1, reason: "accepted-application-not-found", account };
    }

    if (currentTeam && Number(currentTeam.id || 0) !== Number(targetTeam.id || 0)) {
      return {
        ok: false,
        code: -6,
        reason: "already-on-team",
        account,
        team: normalizeTeamRecord(currentTeam, store),
      };
    }

    ensureTeamCollections(targetTeam);
    const now = new Date().toISOString();
    let member = teamMemberForAccount(targetTeam, normalizedAccountId);
    if (!member) {
      member = {
        accountId: normalizedAccountId,
        username: account.username,
        role: TEAM_ROLE.MEMBER,
        joinedAt: now,
        contribution: 0,
        dealerMaxBet: -1,
      };
      targetTeam.members.push(member);
    }

    member.username = account.username;
    member.role = normalizeTeamRole(member.role, TEAM_ROLE.MEMBER);
    targetTeam.updatedAt = now;
    setAccountTeamMembership(account, targetTeam, member.role);
    account.updatedAt = now;

    for (const team of store.teams) {
      ensureTeamCollections(team);
      team.applications = team.applications.filter((entry) => (
        Number(entry?.applicantAccountId || entry?.applicantPublicId || 0) !== normalizedAccountId
      ));
    }

    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      team: normalizeTeamRecord(targetTeam, store),
      application: acceptedApplication,
      affectedAccounts: [account],
    };
  }

  async updateTeamLeaderComments({ accountId, comments }) {
    const store = await readStore(this.filePath);
    const { team, member } = findTeamContext(store, accountId);
    if (!team || !member || !isTeamManagerRole(member.role)) {
      return { ok: false, code: 0, reason: "not-manager" };
    }

    team.leaderComments = String(comments || "").slice(0, 400);
    team.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return { ok: true, team: normalizeTeamRecord(team, store) };
  }

  async updateTeamRequirements({ accountId, recruitmentType, requirements }) {
    const store = await readStore(this.filePath);
    const { team, member } = findTeamContext(store, accountId);
    if (!team || !member || !isTeamManagerRole(member.role)) {
      return { ok: false, code: 0, reason: "not-manager" };
    }

    const normalizedRecruitmentType = String(recruitmentType || team.recruitmentType || team.recruitment_type || "open").toLowerCase();
    team.recruitmentType = normalizedRecruitmentType === "closed" ? "closed" : "open";
    team.requirements = String(requirements || "").slice(0, 400);
    team.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return { ok: true, team: normalizeTeamRecord(team, store) };
  }

  async setTeamColor({ accountId, color }) {
    const store = await readStore(this.filePath);
    const { team, member } = findTeamContext(store, accountId);
    if (!team || !member || !isTeamManagerRole(member.role)) {
      return { ok: false, code: 0, reason: "not-manager" };
    }

    const normalizedColor = String(color || "")
      .replace(/[^0-9a-f]/gi, "")
      .slice(0, 6)
      .toUpperCase() || DEFAULT_TEAM_BACKGROUND_COLOR;
    team.backgroundColor = normalizedColor;
    team.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return { ok: true, team: normalizeTeamRecord(team, store) };
  }

  async persistRaceResult({ raceGuid = "", raceResult = null, mode = "race" } = {}) {
    if (!raceResult || !Array.isArray(raceResult.racers) || raceResult.noWinner) {
      return { ok: false, reason: "no-result" };
    }

    const store = await readStore(this.filePath);
    const now = new Date().toISOString();
    const updated = [];
    const PERFECT_RT = 0.5;
    const winnerAccountId = Number(raceResult.winner?.accountId || 0);

    for (const racer of raceResult.racers) {
      const accountId = Number(racer.accountId || 0);
      if (!accountId) {
        continue;
      }

      const account = store.accounts.find((item) => Number(item.id) === accountId);
      if (!account) {
        continue;
      }

      const won = winnerAccountId > 0 && accountId === winnerAccountId;
      const lost = !won;
      const isPerfectRt = !racer.foul && !racer.dns && Number(racer.reactionTime) === PERFECT_RT;

      const before = {
        wins: Number(account.wins || 0),
        losses: Number(account.losses || 0),
        perfectReactionTimes: Number(account.perfectReactionTimes || 0),
      };

      account.wins = before.wins + (won ? 1 : 0);
      account.losses = before.losses + (lost ? 1 : 0);
      if (isPerfectRt) {
        account.perfectReactionTimes = before.perfectReactionTimes + 1;
        account.perfectReactionTimeCount = account.perfectReactionTimes;
        account.perfectRtCount = account.perfectReactionTimes;
        account.perfect_rt_count = account.perfectReactionTimes;
      }

      account.updatedAt = now;
      updated.push({
        accountId,
        username: account.username,
        before,
        after: {
          wins: account.wins,
          losses: account.losses,
          perfectReactionTimes: Number(account.perfectReactionTimes || 0),
        },
      });
    }

    const raceType = String(mode || "race");
    const racedAt = now;
    const isKothRace = raceType.startsWith("koth");
    const isRivalsRace = raceType.startsWith("rivals") || raceType.startsWith("team-rivals");
    const historyEntries = [];
    let wroteRaceLog = false;

    if (isKothRace || isRivalsRace) {
      for (const racer of raceResult.racers) {
        const accountId = Number(racer.accountId || 0);
        if (!accountId || !store.accounts.some((item) => Number(item.id) === accountId)) {
          continue;
        }

        const timeMs = raceElapsedMilliseconds(
          racer.elapsedTime ?? racer.rawElapsedTime ?? racer.et ?? racer.timeMs,
        );
        const won = winnerAccountId > 0 && accountId === winnerAccountId;
        const carId = Number(racer.accountCarId || racer.carId || 0);
        const account = store.accounts.find((item) => Number(item.id) === accountId);
        const catalogCarId = Number(
          racer.catalogCarId ||
          racer.catalog_car_id ||
          findGarageCar(account, carId)?.catalogCarId ||
          0,
        );
        const historyEntry = {
          playerId: accountId,
          accountId,
          raceType,
          won,
          timeMs,
          carId,
          catalogCarId,
          racedAt,
        };

        if (isKothRace) {
          historyEntries.push(historyEntry);
          continue;
        }

        if (timeMs > 0 && !racer.dns && !racer.foul) {
          historyEntries.push(historyEntry);
        }
      }

      if (isRivalsRace && raceResult.racers.length >= 2) {
        const [playerOne, playerTwo] = raceResult.racers;
        const player1Id = Number(playerOne?.accountId || 0);
        const player2Id = Number(playerTwo?.accountId || 0);
        const player1Time = raceElapsedMilliseconds(
          playerOne?.elapsedTime ?? playerOne?.rawElapsedTime ?? playerOne?.et,
        );
        const player2Time = raceElapsedMilliseconds(
          playerTwo?.elapsedTime ?? playerTwo?.rawElapsedTime ?? playerTwo?.et,
        );

        if (player1Id > 0 && player2Id > 0 && player1Time > 0 && player2Time > 0) {
          appendRaceLogEntry(store, {
            player1Id,
            player2Id,
            winnerId: winnerAccountId,
            player1Time,
            player2Time,
            createdAt: racedAt,
          });
          wroteRaceLog = true;
        }
      }
    }

    appendRaceHistoryEntries(store, historyEntries);

    if (updated.length > 0 || historyEntries.length > 0 || wroteRaceLog) {
      await writeStore(this.filePath, store);
    }

    return {
      ok: true,
      raceGuid,
      mode,
      updated,
      historyEntries: historyEntries.length,
    };
  }

  async adminUpdateAccountFields({ accountId, fields = {} }) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, reason: "account-not-found" };
    }

    const before = economySnapshot(account);
    for (const [key, value] of Object.entries(fields)) {
      if (key === "money" || key === "points") {
        account[key] = Math.max(0, Math.floor(Number(value || 0)));
      } else {
        account[key] = value;
      }
    }

    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);
    this.auditAccountEconomy(account, "adminUpdateAccountFields", before, {
      fields: Object.keys(fields),
      purchaseSource: fields.purchases?.[0]?.source || "",
      purchaseSku: fields.purchases?.[0]?.sku || "",
    });

    return {
      ok: true,
      account,
    };
  }

  async moveLocation({ accountId, locationId, paymentType }) {
    const targetLocationId = Number(locationId);
    const moveCosts = LOCATION_MOVE_COSTS.get(targetLocationId);

    if (!moveCosts) {
      return { ok: false, code: -4, reason: "invalid-location" };
    }

    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));

    if (!account) {
      return { ok: false, code: 0, reason: "account-not-found" };
    }

    const streetCredit = accountStreetCredit(account);
    const requiredStreetCredit = Math.max(0, Math.floor(Number(moveCosts.streetCredit || 0)));
    if (streetCredit < requiredStreetCredit) {
      return {
        ok: false,
        code: -7,
        reason: "insufficient-street-credit",
        streetCredit,
        requiredStreetCredit,
      };
    }

    const paysWithPoints = String(paymentType || "").toLowerCase() === "p";
    const price = paysWithPoints ? moveCosts.points : moveCosts.money;
    const money = normalizeBalance(account.money, DEFAULT_STARTING_MONEY);
    const points = normalizeBalance(account.points, DEFAULT_STARTING_POINTS);
    const currentBalance = paysWithPoints ? points : money;

    if (currentBalance < price) {
      return {
        ok: false,
        code: paysWithPoints ? -5 : -3,
        reason: paysWithPoints ? "insufficient-points" : "insufficient-funds",
        balance: currentBalance,
      };
    }

    const payment = debitSelectedBalance(account, { paysWithPoints, money, points, price });
    account.locationId = targetLocationId;
    account.starterCar = account.starterCar || {};
    account.starterCar.locationId = targetLocationId;
    for (const car of garageCarsFor(account)) {
      car.locationId = targetLocationId;
    }
    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account,
      balance: payment.balance,
      paymentType: payment.paymentType,
      price,
      requiredStreetCredit,
    };
  }

  async recordAccountSecurityTelemetry({ accountId = 0, username = "", ...telemetry } = {}) {
    const store = await readStore(this.filePath);
    const targetAccount = Number(accountId || 0)
      ? store.accounts.find((account) => Number(account.id) === Number(accountId))
      : store.accounts.find((account) => account.usernameKey === usernameKey(username));

    if (!targetAccount) {
      return { ok: false, reason: "account-not-found" };
    }

    const now = new Date().toISOString();
    const result = applyAccountSecurityTelemetry(targetAccount, telemetry, now);
    if (!result.changed) {
      return { ok: true, account: targetAccount, changed: false, report: null };
    }

    targetAccount.updatedAt = now;
    await writeStore(this.filePath, store);

    return {
      ok: true,
      account: targetAccount,
      changed: true,
      report: result.report,
      suspicious: Boolean(result.report?.suspicious),
    };
  }

  async updateAccountSecurity(input = {}) {
    return this.recordAccountSecurityTelemetry({
      accountId: input.accountId,
      username: input.username,
      action: input.action || "login",
      remoteAddress: input.ip || input.remoteAddress,
      mid: input.machineId || input.mid,
      nid: input.macAddress || input.nid || input.mac,
      prid: input.productId || input.prid,
      cna: input.computerName || input.cna,
      cp: input.cp,
      cw: input.cw,
      cwc: input.cwc,
      ce: input.ce,
    });
  }

  async checkLoginSecurity({ account, ...telemetry } = {}) {
    const store = await readStore(this.filePath);
    const normalized = normalizeSecurityTelemetry(telemetry);
    return evaluateLoginSecurity(store, account, normalized);
  }

  async checkLoginTelemetrySecurity({ account, enforcement = "block", ...telemetry } = {}) {
    const store = await readStore(this.filePath);
    const normalized = normalizeSecurityTelemetry(telemetry);
    return evaluateLoginTelemetrySecurity(store, account, normalized, { enforcement });
  }

  async listAdminSecurityReport({ limit = 50 } = {}) {
    const store = await readStore(this.filePath);
    return buildAdminSecurityReport(store, limit);
  }

  async applyAccountDeviceBans({
    accountId = 0,
    banIp = false,
    banMac = false,
    banMachine = false,
    unbanIp = false,
    unbanMac = false,
    unbanMachine = false,
    reason = "",
    actor = "",
  } = {}) {
    const store = await readStore(this.filePath);
    const account = store.accounts.find((item) => Number(item.id) === Number(accountId));
    if (!account) {
      return { ok: false, reason: "account-not-found" };
    }

    const security = account.security || {};
    const ip = String(security.lastIp || "");
    const mac = String(security.lastMacAddress || "");
    const machineKey = currentMachineKey(account);
    let changed = false;

    if (banIp) {
      account.ipBanned = true;
      changed = addSecurityBanEntries(store, { ip, mac: "", machineKey: "", reason, actor, accountId }) || changed;
      changed = true;
    }
    if (banMac) {
      account.macBanned = true;
      changed = addSecurityBanEntries(store, { ip: "", mac, machineKey: "", reason, actor, accountId }) || changed;
      changed = true;
    }
    if (banMachine) {
      account.machineBanned = true;
      changed = addSecurityBanEntries(store, { ip: "", mac: "", machineKey, reason, actor, accountId }) || changed;
      changed = true;
    }
    if (unbanIp) {
      account.ipBanned = false;
      changed = removeSecurityBanEntries(store, { ip }) || changed;
      changed = true;
    }
    if (unbanMac) {
      account.macBanned = false;
      changed = removeSecurityBanEntries(store, { mac }) || changed;
      changed = true;
    }
    if (unbanMachine) {
      account.machineBanned = false;
      changed = removeSecurityBanEntries(store, { machineKey }) || changed;
      changed = true;
    }

    if (!changed) {
      return { ok: true, account, changed: false };
    }

    account.updatedAt = new Date().toISOString();
    await writeStore(this.filePath, store);
    return { ok: true, account, changed: true };
  }

  async runInstalledPartsSlotDedupeMigrationOnce() {
    const store = await readStore(this.filePath);
    store.migrations = store.migrations && typeof store.migrations === "object"
      ? store.migrations
      : {};

    if (store.migrations[INSTALLED_PARTS_SLOT_DEDUPE_MIGRATION_KEY]) {
      return { ok: true, skipped: true, reason: "already-applied" };
    }

    let accountsTouched = 0;
    let carsTouched = 0;
    let listingsTouched = 0;
    let duplicatePartsRemoved = 0;

    for (const account of store.accounts) {
      let accountChanged = false;

      for (const car of garageCarsFor(account)) {
        if (!car?.partsXml) {
          continue;
        }

        const { changed, duplicatesRemoved } = dedupeInstalledPartsBySlot({
          store,
          account,
          car,
        });
        if (!changed) {
          continue;
        }

        normalizeCarAfterPartInventoryChange(car);
        duplicatePartsRemoved += duplicatesRemoved;
        carsTouched += 1;
        accountChanged = true;
      }

      if (accountChanged) {
        account.updatedAt = new Date().toISOString();
        accountsTouched += 1;
      }
    }

    for (const listing of store.usedCarListings) {
      const snapshot = listing?.carSnapshot;
      if (!snapshot?.partsXml) {
        continue;
      }

      const { changed, duplicatesRemoved } = dedupeInstalledPartsBySlot({
        store,
        account: null,
        car: snapshot,
        moveDuplicatesToSpares: false,
      });
      if (!changed) {
        continue;
      }

      duplicatePartsRemoved += duplicatesRemoved;
      listingsTouched += 1;
      listing.updatedAt = new Date().toISOString();
    }

    store.migrations[INSTALLED_PARTS_SLOT_DEDUPE_MIGRATION_KEY] = new Date().toISOString();
    await writeStore(this.filePath, store);

    const summary = {
      ok: true,
      skipped: false,
      accountsTouched,
      carsTouched,
      listingsTouched,
      duplicatePartsRemoved,
    };

    this.logger?.info("Installed parts slot dedupe migration completed", summary);
    return summary;
  }
}
