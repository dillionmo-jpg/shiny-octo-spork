import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { accountStreetCredit, streetCreditRankName } from "../accounts/street-credit.js";
import { getCatalogCar, getCatalogCarPrice } from "../showroom/car-showroom.js";

const PUBLIC_LEADERBOARD_LIMIT = 8;

function accountGarageCars(account) {
  return [
    account?.starterCar,
    ...(Array.isArray(account?.garageCars) ? account.garageCars : []),
  ].filter(Boolean);
}

function findAccountGarageCar(account, accountCarId) {
  const requestedCarId = Number(accountCarId || 0);
  return accountGarageCars(account).find((car) => Number(car.accountCarId || 0) === requestedCarId) || null;
}

function selectedLeaderboardCar(account) {
  const cars = accountGarageCars(account);
  const defaultCarId = Number(account?.defaultCarAccountCarId || 0);

  if (defaultCarId > 0) {
    return cars.find((car) => Number(car.accountCarId || 0) === defaultCarId) || cars[0] || null;
  }

  return cars.find((car) => car.selected) || cars[0] || null;
}

function leaderboardCarForRace(account, accountCarId, catalogCarId = 0) {
  const requestedCarId = Number(accountCarId || 0);
  const storedCatalogCarId = Number(catalogCarId || 0);

  if (requestedCarId > 0) {
    const garageCar = findAccountGarageCar(account, requestedCarId);
    if (garageCar) {
      return garageCar;
    }

    if (storedCatalogCarId > 0) {
      return {
        accountCarId: requestedCarId,
        catalogCarId: storedCatalogCarId,
      };
    }

    return selectedLeaderboardCar(account);
  }

  return selectedLeaderboardCar(account);
}

function raceElapsedMilliseconds(value) {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  return numericValue < 100 ? Math.round(numericValue * 1000) : Math.round(numericValue);
}

function formatPublicElapsedTime(timeMs) {
  return `${(Math.round(Number(timeMs || 0)) / 1000).toFixed(3)}s`;
}

function formatPublicMoney(value) {
  return `$${Math.max(0, Math.floor(Number(value || 0))).toLocaleString("en-US")}`;
}

function accountNetWorth(account) {
  const money = Number(account?.money || 0);
  const carValue = accountGarageCars(account).reduce(
    (total, car) => total + getCatalogCarPrice(car.catalogCarId),
    0,
  );

  return money + carValue;
}

function leaderboardAccounts(state) {
  return [...state.accounts].filter((account) => Number(account?.id || 0) > 0);
}

function fastestRunEntries(state) {
  const accountsById = new Map(leaderboardAccounts(state).map((account) => [Number(account.id || 0), account]));
  const entries = [];

  if (Array.isArray(state.raceHistory) && state.raceHistory.length > 0) {
    for (const record of state.raceHistory) {
      const account = accountsById.get(Number(record?.playerId || record?.accountId || 0));
      const car = account
        ? leaderboardCarForRace(
          account,
          record?.carId || record?.accountCarId,
          record?.catalogCarId || record?.catalog_car_id,
        )
        : null;
      const timeMs = raceElapsedMilliseconds(record?.timeMs || record?.elapsedMs || record?.elapsedTime);

      if (account && car && timeMs > 0) {
        entries.push({ account, car, timeMs });
      }
    }
  } else if (Array.isArray(state.raceLogs)) {
    for (const record of state.raceLogs) {
      for (const [accountIdKey, timeKey] of [
        ["player1Id", "player1Time"],
        ["player2Id", "player2Time"],
      ]) {
        const account = accountsById.get(Number(record?.[accountIdKey] || 0));
        const timeMs = raceElapsedMilliseconds(record?.[timeKey] || record?.[`${timeKey}Ms`]);
        const car = account ? selectedLeaderboardCar(account) : null;

        if (account && car && timeMs > 0) {
          entries.push({ account, car, timeMs });
        }
      }
    }
  }

  const bestByAccount = new Map();
  for (const entry of entries) {
    const accountId = Number(entry.account.id || 0);
    const existing = bestByAccount.get(accountId);

    if (!existing || entry.timeMs < existing.timeMs) {
      bestByAccount.set(accountId, entry);
    }
  }

  return [...bestByAccount.values()]
    .sort((left, right) => (
      left.timeMs - right.timeMs ||
      String(left.account.username || "").localeCompare(String(right.account.username || ""))
    ));
}

export async function readLocalLeaderboardState(dataRoot) {
  try {
    const filePath = join(dataRoot, "accounts.local.json");
    const parsed = JSON.parse(await readFile(filePath, "utf8"));

    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      raceHistory: Array.isArray(parsed.raceHistory) ? parsed.raceHistory : [],
      raceLogs: Array.isArray(parsed.raceLogs) ? parsed.raceLogs : [],
    };
  } catch {
    return {
      accounts: [],
      teams: [],
      raceHistory: [],
      raceLogs: [],
    };
  }
}

export function buildPublicLeaderboardsFromState(state) {
  const accounts = leaderboardAccounts(state);

  const topStreetCredit = accounts
    .map((account) => ({
      account,
      streetCredit: accountStreetCredit(account),
    }))
    .sort((left, right) => (
      right.streetCredit - left.streetCredit ||
      String(left.account.username || "").localeCompare(String(right.account.username || ""))
    ))
    .slice(0, PUBLIC_LEADERBOARD_LIMIT)
    .map((entry, index) => ({
      rank: index + 1,
      name: String(entry.account.username || "Racer"),
      detail: streetCreditRankName(entry.streetCredit) || "Street Credit",
      value: String(entry.streetCredit),
    }));

  const topBallers = accounts
    .map((account) => ({
      account,
      netWorth: accountNetWorth(account),
    }))
    .sort((left, right) => (
      right.netWorth - left.netWorth ||
      String(left.account.username || "").localeCompare(String(right.account.username || ""))
    ))
    .slice(0, PUBLIC_LEADERBOARD_LIMIT)
    .map((entry, index) => ({
      rank: index + 1,
      name: String(entry.account.username || "Racer"),
      detail: "Net worth",
      value: formatPublicMoney(entry.netWorth),
    }));

  const fastestRuns = fastestRunEntries(state)
    .slice(0, PUBLIC_LEADERBOARD_LIMIT)
    .map((entry, index) => {
      const catalogCarId = Number(entry.car.catalogCarId || 0);
      const carName = String(getCatalogCar(catalogCarId)?.name || "Personal best");

      return {
        rank: index + 1,
        name: String(entry.account.username || "Racer"),
        detail: carName,
        value: formatPublicElapsedTime(entry.timeMs),
      };
    });

  return {
    fastestRuns,
    topBallers,
    topStreetCredit,
  };
}

export async function buildPublicLeaderboards(dataRoot) {
  const state = await readLocalLeaderboardState(dataRoot);

  return {
    ok: true,
    source: "local:public-leaderboards",
    generatedAt: new Date().toISOString(),
    leaderboards: buildPublicLeaderboardsFromState(state),
  };
}
