import { accountStreetCredit } from "../accounts/street-credit.js";
import { calculateRacePerformance } from "../race/performance-model.js";
import {
  FULL_CAR_CATALOG,
  getCatalogCar,
  isShowroomCarLocked,
} from "../showroom/car-showroom.js";

const LOCATION_NAME_BY_ID = Object.freeze({
  100: "Toreno",
  200: "Newburge",
  300: "Creek Side",
  400: "Vista Heights",
  500: "Diamond Point",
});

function normalizedTournamentCarName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tournamentCarNameTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/super\s*bee/g, "superbee")
    .split(/[^a-z0-9]+/)
    .map(normalizedTournamentCarName)
    .filter((token) => token.length >= 4);
}

function eventRequiredCarNames(event) {
  return [
    ...(Array.isArray(event?.supportedCarNames) ? event.supportedCarNames : []),
    ...(Array.isArray(event?.carNames) ? event.carNames : []),
  ];
}

function catalogCarMatchesName(catalogCar, requiredName) {
  const requiredNormalized = normalizedTournamentCarName(requiredName);
  if (!requiredNormalized) {
    return false;
  }

  const candidateNormalized = normalizedTournamentCarName(catalogCar?.name);
  return candidateNormalized === requiredNormalized
    || candidateNormalized.includes(requiredNormalized)
    || requiredNormalized.includes(candidateNormalized)
    || tournamentCarNameTokens(catalogCar?.name).some((token) => (
      tournamentCarNameTokens(requiredName).includes(token)
    ));
}

export function resolveEventCatalogCar(event) {
  const requiredNames = eventRequiredCarNames(event).filter(Boolean);
  if (requiredNames.length === 0) {
    return null;
  }

  for (const requiredName of requiredNames) {
    const exactMatch = FULL_CAR_CATALOG.find((car) => catalogCarMatchesName(car, requiredName));
    if (exactMatch) {
      return exactMatch;
    }
  }

  return null;
}

export function isScheduleEventEligible(event) {
  if (!event || event.blockedReason) {
    return false;
  }

  if (Number(event.scheduleId || 0) >= 9000) {
    return false;
  }

  const requiredNames = eventRequiredCarNames(event).filter(Boolean);
  if (requiredNames.length === 0) {
    return true;
  }

  const catalogCar = resolveEventCatalogCar(event);
  return Boolean(catalogCar) && !isShowroomCarLocked(catalogCar.id);
}

export function liveTournamentCarMatchesRequirement(event, targetCar) {
  const requiredNames = eventRequiredCarNames(event);
  const requiredNormalizedNames = requiredNames.map(normalizedTournamentCarName).filter(Boolean);

  if (requiredNormalizedNames.length === 0) {
    return true;
  }

  const catalogCar = getCatalogCar(Number(targetCar?.catalogCarId || targetCar?.ci || 0));
  const candidateRawNames = [
    catalogCar?.name,
    targetCar?.name,
    targetCar?.carName,
  ];
  const candidateNames = candidateRawNames.map(normalizedTournamentCarName).filter(Boolean);

  if (requiredNormalizedNames.some((requiredName) => candidateNames.some((candidateName) => (
    candidateName === requiredName
      || candidateName.includes(requiredName)
      || requiredName.includes(candidateName)
  )))) {
    return true;
  }

  const candidateTokens = new Set(candidateRawNames.flatMap(tournamentCarNameTokens));
  return requiredNames
    .flatMap(tournamentCarNameTokens)
    .some((token) => candidateTokens.has(token));
}

function accountLocationName(account) {
  const locationId = Number(account?.locationId || 100);
  return LOCATION_NAME_BY_ID[locationId] || "";
}

export function accountMatchesLocationRequirement(account, requiredLocation) {
  const required = String(requiredLocation || "").trim();
  if (!required) {
    return true;
  }

  return accountLocationName(account).toLowerCase() === required.toLowerCase();
}

export function accountMatchesStreetCreditRequirement(account, minStreetCredit, maxStreetCredit) {
  const streetCredit = accountStreetCredit(account);
  const minValue = minStreetCredit == null || minStreetCredit === "" ? null : Number(minStreetCredit);
  const maxValue = maxStreetCredit == null || maxStreetCredit === "" ? null : Number(maxStreetCredit);

  if (Number.isFinite(minValue) && streetCredit < minValue) {
    return false;
  }

  if (Number.isFinite(maxValue) && streetCredit > maxValue) {
    return false;
  }

  return true;
}

export function garageCarIsNaturallyAspirated(account, targetCar) {
  const catalogCarId = Number(targetCar?.catalogCarId || targetCar?.ci || 0);
  const catalogCar = getCatalogCar(catalogCarId);
  const performance = calculateRacePerformance({ account, targetCar, catalogCar });

  return String(performance?.boostType || "N") === "N"
    && Number(performance?.boostSetting || 0) <= 0;
}

function garageCarMatchesBoostRequirement(targetCar, requiredBoostType) {
  const required = String(requiredBoostType || "").trim().toUpperCase();
  if (!required) {
    return true;
  }

  const catalogCar = getCatalogCar(Number(targetCar?.catalogCarId || targetCar?.ci || 0));
  const candidateBoostType = String(
    targetCar?.boostType
    || catalogCar?.boostType
    || "",
  ).trim().toUpperCase();

  return candidateBoostType === required
    || (required === "T" && candidateBoostType.includes("T"))
    || (required === "S" && candidateBoostType.includes("S"));
}

export function validateLiveTournamentEntry(event, account, targetCar) {
  if (!event || !account || !targetCar) {
    return { ok: false, reason: "missing-entry" };
  }

  const catalogCarId = Number(targetCar?.catalogCarId || targetCar?.ci || 0);
  if (isShowroomCarLocked(catalogCarId)) {
    return { ok: false, reason: "premium-trophy-car" };
  }

  if (!liveTournamentCarMatchesRequirement(event, targetCar)) {
    return { ok: false, reason: "wrong-car" };
  }

  if (event.naturallyAspirated && !garageCarIsNaturallyAspirated(account, targetCar)) {
    return { ok: false, reason: "not-naturally-aspirated" };
  }

  if (!garageCarMatchesBoostRequirement(targetCar, event.requiredBoostType)) {
    return { ok: false, reason: "wrong-boost-type" };
  }

  if (!accountMatchesLocationRequirement(account, event.requiredLocation)) {
    return { ok: false, reason: "wrong-location" };
  }

  if (!accountMatchesStreetCreditRequirement(account, event.minStreetCredit, event.maxStreetCredit)) {
    return { ok: false, reason: "street-credit-out-of-range" };
  }

  return { ok: true };
}
