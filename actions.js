import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { LocalAccountStore, TEAM_ROLE } from "../features/accounts/local-account-store.js";
import { buildGarageXml, buildLoginBody } from "../features/accounts/login-payload.js";
import { createLocalSession, getLocalSession } from "../features/accounts/local-sessions.js";
import {
  accountMembershipFlag,
  accountStatusClass,
  accountStatusColor,
} from "../features/accounts/account-status.js";
import {
  buildPaintCategoriesXml,
  buildPaintsXml,
  parsePaintJobs,
} from "../features/paint/paint-catalog.js";
import { rememberAvatarUploadRequest } from "../features/avatars/avatar-store.js";
import {
  buildCustomGraphicCatalogPart,
  buildGraphicsPartGroupXml,
  finalizeUserGraphicInstall,
  getCustomGraphicSlotIdForField,
  graphicSlotConfig,
  graphicSlotConfigForPartId,
  graphicSlotForPartId,
  normalizeUserGraphicFileExt,
  rememberUserGraphicUploadRequest,
} from "../features/graphics/user-graphics.js";
import { buildLicensePlatesXml } from "../features/license/license-catalog.js";
import {
  buildGraphicsOnlyCategoryXml,
  buildPartsCatalog,
  buildPartsXml,
  filterPartsForGraphicsShop,
  isGraphicsShopCatalogRequest,
} from "../features/parts/parts-catalog.js";
import {
  calibrateClientDynoTorqueCurve,
  calculateRacePerformance,
  estimateClientDynoTorqueCurve,
  installedAirFuelMeterCapability,
  installedGaugeControlsId,
  installedShiftLightCapability,
} from "../features/race/performance-model.js";
import {
  buildCarCategoryXml,
  buildDealerShowroomXml,
  getCatalogCar,
  getCatalogCarPrice,
  renderOwnedGarageCarXml,
} from "../features/showroom/car-showroom.js";
import { buildStarterShowroomXml } from "../features/showroom/starter-showroom.js";
import {
  LocalTournamentStore,
  renderTournamentsXml,
} from "../features/tournaments/tournament-store.js";
import { accountStreetCredit, streetCreditRankName } from "../features/accounts/street-credit.js";
import { buildWheelsTiresCatalog } from "../features/wheels/wheels-catalog.js";
import { notImplementedBody, quoteLingoString, statusBody, successData } from "../protocol/response.js";

const handlers = new Map([
  ["activateaccount", handleAccountAlreadyVerified],
  ["accepttestdrive", handleDisabledTestDriveAction],
  ["addbuddy", handleAddBuddy],
  ["addremark", handleAddRemark],
  ["buycar", handleBuyCar],
  ["buytestdrivecar", handleDisabledTestDriveAction],
  ["buyfromclassified", handleBuyUsedCar],
  ["buydyno", handleBuyDyno],
  ["buyenginepart", handleBuyEnginePart],
  ["buygears", handleBuyGears],
  ["buyplate", handleBuyPlate],
  ["buypaint", handleBuyPaint],
  ["buypart", handleBuyPart],
  ["buypartugg", handleBuyPartUgg],
  ["buyusedcar", handleBuyUsedCar],
  ["cancelclassified", handleCancelClassified],
  ["claimpendinguclprofit", handleClaimPendingUclProfit],
  ["classifiedhistory", handleClassifiedHistory],
  ["buyvanity", handleBuyVanity],
  ["createaccount", handleCreateAccount],
  ["egue", handleEngineList],
  ["getallcats", handleGetAllCats],
  ["getallcars", handleGetAllCars],
  ["getallimcars", handleGetAllImportedCars],
  ["getallotherusercars", handleGetAllOtherUserCars],
  ["getallparts", handleGetAllParts],
  ["getallwheelstires", handleGetAllWheelsTires],
  ["getavatarage", handleGetAvatarAge],
  ["getblackcardprogress", handleGetBlackCardProgress],
  ["getbuddies", handleGetBuddies],
  ["getbuddylist", handleGetBuddies],
  ["getcarcategories", handleGetCarCategories],
  ["getcarpartsbin", handleGetCarPartsBin],
  ["getcarprice", handleGetCarPrice],
  ["gethumantournaments", handleGetHumanTournaments],
  ["changeairfuel", handleChangeAirFuel],
  ["changeboost", handleChangeBoost],
  ["checktestdrive", handleDisabledTestDriveAction],
  ["ctct", handleComputerTournamentCreate],
  ["ctgr", handleComputerTournamentGetRacers],
  ["ctjt", handleComputerTournamentJoin],
  ["ctrt", handleComputerTournamentRequest],
  ["ctst", handleComputerTournamentSave],
  ["getdescription", handleGetDescription],
  ["getemail", handleGetEmail],
  ["getemaillist", handleGetEmailList],
  ["getgearinfo", handleGetGearInfo],
  ["getclassifieddetail", handleGetClassifiedDetail],
  ["getleaderboard", handleGetLeaderboard],
  ["getleaderboardmenu", handleGetLeaderboardMenu],
  ["getinstalledenginepartbyaccountcar", handleGetInstalledEnginePartsByAccountCar],
  ["getlicenseplates", handleGetLicensePlates],
  ["getonecar", handleGetOneCar],
  ["getonecarengine", handleGetOneCarEngine],
  ["getpaintcats", handleGetPaintCategories],
  ["getpaints", handleGetPaints],
  ["getpartsbin", handleGetPartsBin],
  ["getpartgroup", handleGetPartGroup],
  ["getremarks", handleGetRemarks],
  ["getrepairparts", handleGetRepairParts],
  ["getracerscars", handleGetRacersCars],
  ["getspareprice", handleGetSparePrice],
  ["getstartershowroom", handleGetStarterShowroom],
  ["getsystemparts", handleGetSystemParts],
  ["getteamavatarage", handleGetTeamAvatarAge],
  ["getteaminfo", handleGetTeamInfo],
  ["gettotalnewmail", handleGetTotalNewMail],
  ["gettworacerscars", handleGetTwoRacersCars],
  ["getoutgoingtradehistory", handleOutgoingTradeHistory],
  ["getpendingtrades", handlePendingTrades],
  ["getuser", handleGetUser],
  ["getuserremarks", handleGetUserRemarks],
  ["getusers", handleGetUsers],
  ["changeshiftlightrpm", handleChangeShiftLightRpm],
  ["installenginepart", handleInstallPart],
  ["installpart", handleInstallPart],
  ["joinhumantournament", handleJoinHumanTournament],
  ["listclassified", handleListClassified],
  ["listusedcars", handleListClassified],
  ["login", handleLogin],
  ["movelocation", handleMoveLocation],
  ["ping", handlePing],
  ["putcaronclassified", handlePutCarOnClassified],
  ["practice", handlePractice],
  ["practiceend", handlePracticeLifecycleAck],
  ["racersearch", handleRacerSearch],
  ["racersearchnopage", handleRacerSearch],
  ["rejecttestdrive", handleDisabledTestDriveAction],
  ["removebuddy", handleRemoveBuddy],
  ["removetestdrivecar", handleDisabledTestDriveAction],
  ["resendactivation", handleAccountAlreadyVerified],
  ["requesttrade", handleRequestTrade],
  ["respondtrade", handleRespondTrade],
  ["sellallspare", handleSellAllSpare],
  ["sellcar", handleSellCar],
  ["sellcartomarketplace", handlePutCarOnClassified],
  ["sellcarpart", handleSellSparePart],
  ["sellenginepart", handleSellSparePart],
  ["sendemail", handleSendEmail],
  ["setdeletes", handleSetRemarkDeletes],
  ["setnondeletes", handleSetRemarkNonDeletes],
  ["setteamcolor", handleSetTeamColor],
  ["teamcreate", handleTeamCreate],
  ["teamdeposit", handleTeamDeposit],
  ["teaminfo", handleTeamInfo],
  ["teamsearch", handleTeamSearch],
  ["teamtrans", handleTeamTransactions],
  ["teamwithdraw", handleTeamWithdraw],
  ["teamwithdrawal", handleTeamWithdraw],
  ["addteamapp", handleAddTeamApplication],
  ["deleteapp", handleDeleteTeamApplication],
  ["getallmyapps", handleGetAllMyTeamApplications],
  ["getallteamapps", handleGetAllTeamApplications],
  ["updateleadercomments", handleUpdateLeaderComments],
  ["updateteamapp", handleUpdateTeamApplication],
  ["updateteamreq", handleUpdateTeamRequirements],
  ["systemswap", handleSystemSwap],
  ["canceltrade", handleCancelTrade],
  ["deleteemail", handleDeleteEmail],
  ["deleteremark", handleDeleteRemark],
  ["endpractice", handlePracticeLifecycleAck],
  ["exitpractice", handlePracticeLifecycleAck],
  ["fbgetinviteurl", handleFacebookInviteUrl],
  ["fbgettoken", handleFacebookGetToken],
  ["fbremovefacebook", handleFacebookRemove],
  ["leavepractice", handlePracticeLifecycleAck],
  ["markemailread", handleMarkEmailRead],
  ["ugg", handleUggQueueAck],
  ["uninstallenginepart", handleUninstallPart],
  ["uninstallpart", handleUninstallPart],
  ["updatedefaultcar", handleUpdateDefaultCar],
  ["uploadrequest", handleUploadRequest],
  ["verifyaccount", handleAccountAlreadyVerified],
  ["viewshowroom", handleViewShowroom],
]);

const PRACTICE_ET_ENDING_ANCHORS = Object.freeze([
  { ending: 32, windowBefore: 2, windowAfter: 2 },
  { ending: 66, windowBefore: 2, windowAfter: 2 },
  { ending: 99, windowBefore: 2, windowAfter: 0 },
]);

function escapeXmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function accountLocationId(account) {
  return Number(account?.locationId || account?.starterCar?.locationId || 100) || 100;
}

function numericParam(params, names, fallback = 0) {
  for (const name of names) {
    const value = Number(params.get(name));
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return fallback;
}

function stabilizedPracticeElapsedTime(elapsedTime) {
  const rawElapsedTime = Number(elapsedTime);
  if (!Number.isFinite(rawElapsedTime) || rawElapsedTime <= 0) {
    return {
      elapsedTime: 0,
      rawElapsedTime: Number.isFinite(rawElapsedTime) ? rawElapsedTime : 0,
      stabilized: false,
      anchor: 0,
    };
  }

  const roundedMilliseconds = Math.round(rawElapsedTime * 1000);
  const secondBaseMilliseconds = Math.floor(roundedMilliseconds / 1000) * 1000;
  const withinSecondMilliseconds = roundedMilliseconds - secondBaseMilliseconds;
  const tenthBaseMilliseconds = Math.floor(withinSecondMilliseconds / 100) * 100;
  const ending = withinSecondMilliseconds - tenthBaseMilliseconds;

  for (const anchor of PRACTICE_ET_ENDING_ANCHORS) {
    const minEnding = anchor.ending - anchor.windowBefore;
    const maxEnding = anchor.ending + anchor.windowAfter;
    if (ending < minEnding || ending > maxEnding) {
      continue;
    }

    const stabilizedMilliseconds = secondBaseMilliseconds + tenthBaseMilliseconds + anchor.ending;
    return {
      elapsedTime: Number((stabilizedMilliseconds / 1000).toFixed(3)),
      rawElapsedTime: Number(rawElapsedTime.toFixed(3)),
      stabilized: stabilizedMilliseconds !== roundedMilliseconds,
      anchor: anchor.ending,
    };
  }

  return {
    elapsedTime: Number(rawElapsedTime.toFixed(3)),
    rawElapsedTime: Number(rawElapsedTime.toFixed(3)),
    stabilized: false,
    anchor: 0,
  };
}

async function buildPartsCatalogForGarage(config, catalogCarId) {
  const partsCatalog = await buildPartsCatalog({
    projectRoot: config.projectRoot,
    dataRoot: config.dataRoot,
    assetRoot: config.assetRoot,
    catalogCarId,
  });
  const wheelsTiresCatalog = await buildWheelsTiresCatalog({
    assetRoot: config.assetRoot,
    dataRoot: config.dataRoot,
  });

  return {
    ...partsCatalog,
    partsById: new Map([...partsCatalog.partsById, ...wheelsTiresCatalog.partsById]),
    wheelsTiresPartCount: wheelsTiresCatalog.parts.length,
  };
}

function accountTeamId(account) {
  return Number(account?.teamId || account?.team_id || 0) || 0;
}

function accountTeamRole(account) {
  const teamRole = Number(account?.teamRole || account?.team_role || 0);
  return Number.isFinite(teamRole) ? teamRole : 0;
}

function accountTeamName(account) {
  const teamId = accountTeamId(account);
  const username = String(account?.username || "Racer");
  return teamId
    ? String(account?.teamName || account?.team_name || "")
    : username;
}

function renderPublicUserXml(account) {
  const userId = Number(account?.id || 0);
  const username = escapeXmlAttribute(account?.username || "Racer");
  const teamId = accountTeamId(account);
  const teamRole = accountTeamRole(account);
  const teamName = escapeXmlAttribute(accountTeamName(account));
  const roleClass = accountStatusClass(account);
  const textColor = accountStatusColor(account);
  const memberFlag = accountMembershipFlag(account);
  const streetCredit = accountStreetCredit(account);
  const streetCreditRank = streetCreditRankName(streetCredit);

  return `<u i='${userId}' u='${username}' un='${username}' n='${username}' ` +
    `name='${username}' username='${username}' userName='${username}' user='${username}' ` +
    `dn='${username}' displayName='${username}' displayname='${username}' ` +
    `screenName='${username}' screenname='${username}' racerName='${username}' racername='${username}' ` +
    `playerName='${username}' playername='${username}' label='${username}' title='${username}' ` +
    `r='${roleClass}' sc='${streetCredit}' scr='${escapeXmlAttribute(streetCreditRank)}' ` +
    `scRank='${escapeXmlAttribute(streetCreditRank)}' streetCreditRank='${escapeXmlAttribute(streetCreditRank)}' ` +
    `lid='${accountLocationId(account)}' ti='${teamId}' tid='${teamId}' tr='${teamRole}' ` +
    `tn='${teamName}' teamName='${teamName}' teamname='${teamName}' ` +
    `tf='${textColor}' ms='${roleClass}' mb='${memberFlag}' vip='${memberFlag}' fbc='0' bg='000000' w='0' l='0'/>`;
}

function computerTournamentPerformancePoints(elapsedTime) {
  const normalizedEt = Math.max(8, Math.min(18, Number(elapsedTime || 13)));
  const sampleCount = Math.max(60, Math.round(normalizedEt * 30));
  let previousPosition = 0;

  return Array.from({ length: sampleCount }, (_, index) => {
    const progress = (index + 1) / sampleCount;
    const easedProgress = Math.pow(progress, 1.5);
    const position = easedProgress * 1320;
    const delta = Math.max(0, position - previousPosition);

    previousPosition = position;
    return delta.toFixed(3);
  })
    .join(",");
}

function renderRacerSearchXml(accounts, { count, page }) {
  const nodes = accounts
    .map((account) => {
      const roleClass = accountStatusClass(account);
      return (
        `<r i='${Number(account.id || 0)}' u='${escapeXmlAttribute(account.username || "Racer")}' ` +
        `r='${roleClass}' tf='${accountStatusColor(account)}' ms='${roleClass}'/>`
      );
    })
    .join("");

  return `<u c='${Number(count || 0)}' p='${Number(page || 1)}'>${nodes}</u>`;
}

const COMPUTER_TOURNAMENT_RACERS = [
  { id: 101, catalogCarId: 1, username: "Rookie Ryan", difficulty: "amateur", carName: "Acura Integra GSR", et: 14.8, delay: 0.65 },
  { id: 102, catalogCarId: 31, username: "Street Mia", difficulty: "amateur", carName: "Honda Civic Si", et: 14.4, delay: 0.45 },
  { id: 103, catalogCarId: 41, username: "Sport Alex", difficulty: "sport", carName: "Nissan 240SX", et: 13.2, delay: 0.2 },
  { id: 104, catalogCarId: 61, username: "Sport Vega", difficulty: "sport", carName: "Toyota MR2", et: 12.8, delay: 0 },
  { id: 105, catalogCarId: 7, username: "Pro Knox", difficulty: "pro", carName: "Chevy Corvette C6", et: 11.4, delay: -0.15 },
  { id: 106, catalogCarId: 21, username: "Pro Sato", difficulty: "pro", carName: "Nissan GT-R", et: 10.9, delay: -0.3 },
  { id: 107, catalogCarId: 107, username: "Bracket Ben", difficulty: "amateur", carName: "Mazda MX-5 Miata", et: 14.1, delay: 0.35 },
  { id: 108, catalogCarId: 13, username: "Rookie Cam", difficulty: "amateur", carName: "Scion tC", et: 14.0, delay: 0.25 },
  { id: 109, catalogCarId: 99, username: "Late Nate", difficulty: "amateur", carName: "Toyota Corolla GT-S", et: 15.1, delay: 0.8 },
  { id: 110, catalogCarId: 64, username: "Cruise Kim", difficulty: "amateur", carName: "VW Golf GTI", et: 14.7, delay: 0.55 },
  { id: 111, catalogCarId: 74, username: "Shift Jules", difficulty: "amateur", carName: "Honda CR-X Si", et: 14.5, delay: 0.5 },
  { id: 112, catalogCarId: 47, username: "Launch Leo", difficulty: "amateur", carName: "Nissan Sentra SE-R", et: 14.3, delay: 0.4 },
  { id: 113, catalogCarId: 2, username: "Sport Nova", difficulty: "sport", carName: "Mitsubishi Lancer Evo VIII", et: 12.4, delay: -0.1 },
  { id: 114, catalogCarId: 25, username: "Metro Zane", difficulty: "sport", carName: "Nissan 350Z", et: 12.9, delay: 0.08 },
  { id: 115, catalogCarId: 89, username: "Vista Rae", difficulty: "sport", carName: "Subaru Impreza WRX STI", et: 12.6, delay: 0 },
  { id: 116, catalogCarId: 16, username: "Creek Omar", difficulty: "sport", carName: "Mazda RX-7", et: 12.7, delay: 0.05 },
  { id: 117, catalogCarId: 3, username: "Torque Ivy", difficulty: "sport", carName: "Ford Mustang GT", et: 13.0, delay: 0.15 },
  { id: 118, catalogCarId: 15, username: "Sport Mika", difficulty: "sport", carName: "Dodge Neon SRT-4", et: 13.1, delay: 0.18 },
  { id: 119, catalogCarId: 10, username: "Pro Rina", difficulty: "pro", carName: "Dodge Viper SRT-10", et: 11.1, delay: -0.25 },
  { id: 120, catalogCarId: 5, username: "Pro Vale", difficulty: "pro", carName: "Ford GT", et: 10.8, delay: -0.35 },
  { id: 121, catalogCarId: 14, username: "Diamond Eli", difficulty: "pro", carName: "Toyota Supra", et: 11.3, delay: -0.2 },
  { id: 122, catalogCarId: 87, username: "Apex Noor", difficulty: "pro", carName: "Mitsubishi Lancer Evo X", et: 10.7, delay: -0.4 },
  { id: 123, catalogCarId: 136, username: "Pro Jax", difficulty: "pro", carName: "Porsche 911 GT3 RS", et: 10.6, delay: -0.45 },
  { id: 124, catalogCarId: 90, username: "Pro Iris", difficulty: "pro", carName: "McLaren MP4-12C", et: 10.5, delay: -0.5 },
];
const COMPUTER_TOURNAMENT_EXTRA_RACERS = [
  { id: 125, catalogCarId: 6, username: "Amateur Niko", difficulty: "amateur", carName: "Acura RSX Type-S", et: 14.2, delay: 0.38 },
  { id: 126, catalogCarId: 23, username: "Rookie Luna", difficulty: "amateur", carName: "Mazdaspeed 3", et: 14.6, delay: 0.58 },
  { id: 127, catalogCarId: 58, username: "Street Cole", difficulty: "amateur", carName: "VW Golf R32", et: 14.35, delay: 0.48 },
  { id: 128, catalogCarId: 51, username: "Sport Remy", difficulty: "sport", carName: "Infiniti G37S", et: 12.95, delay: 0.12 },
  { id: 129, catalogCarId: 55, username: "Sport Kira", difficulty: "sport", carName: "Nissan 370Z", et: 12.55, delay: -0.02 },
  { id: 130, catalogCarId: 40, username: "Vista Juno", difficulty: "sport", carName: "Mitsubishi Lancer Evo IX", et: 12.35, delay: -0.08 },
  { id: 131, catalogCarId: 34, username: "Pro Dash", difficulty: "pro", carName: "Chevy Corvette Z06", et: 10.95, delay: -0.32 },
];
const COMPUTER_TOURNAMENT_FIELD_RACERS = [...COMPUTER_TOURNAMENT_RACERS, ...COMPUTER_TOURNAMENT_EXTRA_RACERS];
const COMPUTER_TOURNAMENT_BRACKET_SIZE = 32;
const COMPUTER_TOURNAMENT_PLAYER_SEED = 16;
const COMPUTER_TOURNAMENT_ROUNDS_TO_WIN = 5;
const COMPUTER_TOURNAMENT_PERFECT_REACTION_TIME_SECONDS = 0.5;
const COMPUTER_TOURNAMENT_PROFILES = {
  amateur: { minDial: 15.2, maxDial: 16.9, minOver: 0.101, maxOver: 0.152, minRt: 0.572, maxRt: 0.649, minHp: 155, maxHp: 225, minWeight: 2550, maxWeight: 3200, minTrap: 84, maxTrap: 101, rewards: [{ money: 100, points: 10 }, { money: 200, points: 0 }, { money: 300, points: 0 }, { money: 400, points: 0 }, { money: 1000, points: 10 }] },
  sport: { minDial: 13.1, maxDial: 14.7, minOver: 0.04, maxOver: 0.07, minRt: 0.532, maxRt: 0.599, minHp: 240, maxHp: 360, minWeight: 2450, maxWeight: 3150, minTrap: 101, maxTrap: 121, rewards: [{ money: 250, points: 20 }, { money: 350, points: 0 }, { money: 450, points: 0 }, { money: 550, points: 0 }, { money: 2500, points: 20 }] },
  pro: { minDial: 10.4, maxDial: 12.3, minOver: 0.005, maxOver: 0.03, minRt: 0.5, maxRt: 0.53, minHp: 420, maxHp: 680, minWeight: 2250, maxWeight: 3050, minTrap: 122, maxTrap: 151, rewards: [{ money: 1875, points: 100 }, { money: 1875, points: 0 }, { money: 1875, points: 0 }, { money: 1875, points: 0 }, { money: 7500, points: 100 }] },
};

function computerTournamentBotSeeds(count) {
  const seeds = [];

  for (let seed = 1; seed <= COMPUTER_TOURNAMENT_BRACKET_SIZE && seeds.length < count; seed += 1) {
    if (seed !== COMPUTER_TOURNAMENT_PLAYER_SEED) {
      seeds.push(seed);
    }
  }

  return seeds;
}

function computerTournamentDifficulty(params) {
  const rawTournamentId = String(
    params.get("ctid")
      || params.get("tid")
      || params.get("tournamentid")
      || "",
  ).trim().toLowerCase();

  if (["1", "a", "am", "amateur"].includes(rawTournamentId)) {
    return "amateur";
  }

  if (["2", "s", "sp", "sport"].includes(rawTournamentId)) {
    return "sport";
  }

  if (["3", "p", "pro"].includes(rawTournamentId)) {
    return "pro";
  }

  const rawDifficulty = String(
    params.get("d")
      || params.get("difficulty")
      || params.get("l")
      || params.get("level")
      || "",
  ).trim().toLowerCase();

  if (["0", "a", "am", "amateur"].includes(rawDifficulty)) {
    return "amateur";
  }

  if (["1", "s", "sp", "sport"].includes(rawDifficulty)) {
    return "sport";
  }

  if (["2", "p", "pro"].includes(rawDifficulty)) {
    return "pro";
  }

  return rawDifficulty;
}

function seededTournamentFraction(seed) {
  const value = Math.sin(Number(seed || 0) * 12.9898) * 43758.5453;

  return value - Math.floor(value);
}

function tournamentInterpolate(min, max, fraction) {
  return Number(min || 0) + (Number(max || 0) - Number(min || 0)) * Number(fraction || 0);
}

function computerTournamentProfile(difficulty) {
  return COMPUTER_TOURNAMENT_PROFILES[String(difficulty || "").toLowerCase()]
    || COMPUTER_TOURNAMENT_PROFILES.amateur;
}

function computerTournamentRoundReward(difficulty, wins = 0) {
  const profile = computerTournamentProfile(difficulty);
  const rewards = Array.isArray(profile.rewards) && profile.rewards.length > 0
    ? profile.rewards
    : [{ money: 0, points: 0 }];
  const roundIndex = Math.max(0, Math.min(rewards.length - 1, Number(wins || 0)));

  return {
    money: Number(rewards[roundIndex]?.money || 0),
    points: Number(rewards[roundIndex]?.points || 0),
  };
}

function computerTournamentRoundPayout(difficulty, wins = 0) {
  return computerTournamentRoundReward(difficulty, wins).money;
}

function tournamentBotStats(racer, index = 0, difficulty = "") {
  const profile = computerTournamentProfile(difficulty || racer.difficulty);
  const seedBase = (index + 1) * 37;
  const dialTime = tournamentInterpolate(profile.minDial, profile.maxDial, seededTournamentFraction(seedBase + 1));
  const overDial = tournamentInterpolate(profile.minOver, profile.maxOver, seededTournamentFraction(seedBase + 2));
  const elapsedTime = dialTime + overDial;
  const reactionTime = tournamentInterpolate(profile.minRt, profile.maxRt, seededTournamentFraction(seedBase + 3));
  const totalTime = elapsedTime + reactionTime;
  const trapSpeed = tournamentInterpolate(profile.minTrap, profile.maxTrap, seededTournamentFraction(seedBase + 4));
  const horsepower = Math.round(tournamentInterpolate(profile.minHp, profile.maxHp, seededTournamentFraction(seedBase + 5)));
  const weight = Math.round(tournamentInterpolate(profile.minWeight, profile.maxWeight, seededTournamentFraction(seedBase + 6)));
  const performancePoints = computerTournamentPerformancePoints(elapsedTime);

  return {
    bracketTime: Number(dialTime.toFixed(3)),
    reactionTime: Number(reactionTime.toFixed(3)),
    elapsedTime: Number(elapsedTime.toFixed(3)),
    totalTime: Number(totalTime.toFixed(3)),
    overDial: Number(overDial.toFixed(3)),
    trapSpeed: Number(trapSpeed.toFixed(2)),
    horsepower,
    weight,
    performancePoints,
  };
}

function tournamentBotIdentity(racer, index = -1) {
  const rosterIndex = index >= 0
    ? index
    : Math.max(0, COMPUTER_TOURNAMENT_FIELD_RACERS.findIndex((entry) => entry.id === racer.id));
  const tournamentId = 1;
  const competitorIndex = rosterIndex;

  return {
    competitorId: 1000 + tournamentId * 100 + competitorIndex,
    competitorCarId: 2000 + tournamentId * 100 + competitorIndex,
    virtualCarId: 6000 + tournamentId * 100 + competitorIndex,
    racerNumber: 100 + competitorIndex,
    competitorIndex,
  };
}

function tournamentBotForVirtualCarId(accountCarId) {
  const numericId = Number(accountCarId || 0);
  if (numericId < 6100 || numericId >= 6200) {
    return null;
  }

  const rosterIndex = numericId - 6100;
  const racer = COMPUTER_TOURNAMENT_FIELD_RACERS[rosterIndex];
  if (!racer) {
    return null;
  }

  return {
    racer,
    rosterIndex,
    identity: tournamentBotIdentity(racer, rosterIndex),
  };
}

function tournamentBotForPublicId(publicId) {
  const numericId = Number(publicId || 0);

  return COMPUTER_TOURNAMENT_FIELD_RACERS
    .map((racer, index) => ({
      racer,
      rosterIndex: index,
      identity: tournamentBotIdentity(racer, index),
    }))
    .find(({ racer, identity }) => (
      racer.id === numericId
      || identity.competitorId === numericId
      || identity.competitorCarId === numericId
      || identity.virtualCarId === numericId
    )) || null;
}

function tournamentBotSyntheticAccount(publicId, fallbackLocationId = 100) {
  const tournamentBot = tournamentBotForPublicId(publicId);
  if (!tournamentBot) {
    return null;
  }

  return {
    id: Number(publicId || tournamentBot.identity.competitorId),
    username: tournamentBot.racer.username,
    streetCredit: 0,
    locationId: fallbackLocationId,
    defaultCarAccountCarId: tournamentBot.identity.virtualCarId,
    starterCar: {
      accountCarId: tournamentBot.identity.virtualCarId,
      catalogCarId: tournamentBot.racer.catalogCarId,
      color: "FF0033",
      locationId: fallbackLocationId,
    },
  };
}

function computerTournamentRacersXml(params) {
  const difficulty = computerTournamentDifficulty(params) || "amateur";
  const racers = COMPUTER_TOURNAMENT_FIELD_RACERS.slice(0, COMPUTER_TOURNAMENT_BRACKET_SIZE - 1);
  const seeds = computerTournamentBotSeeds(racers.length);
  const nodes = racers
    .map((racer, index) => {
      const stats = tournamentBotStats(racer, index, difficulty);
      const identity = tournamentBotIdentity(racer, index);

      return (
        `<r i='${identity.competitorCarId}' id='${identity.competitorId}' p='${seeds[index]}' ` +
        `caid='${identity.competitorCarId}' aid='${identity.competitorId}' uid='${identity.competitorId}' ` +
        `rid='${identity.competitorId}' cid='${identity.competitorCarId}' ci='${racer.catalogCarId}' ` +
        `carid='${racer.catalogCarId}' cacid='${identity.virtualCarId}' ` +
        `n='${escapeXmlAttribute(racer.username)}' u='${escapeXmlAttribute(racer.username)}' ` +
        `r='5' sc='0' d='${escapeXmlAttribute(difficulty)}' c='${escapeXmlAttribute(racer.carName)}' ` +
        `bt='${stats.bracketTime}' rt='${stats.reactionTime}' et='${stats.elapsedTime}' ` +
        `t='${stats.elapsedTime}' ts='${stats.trapSpeed}' total='${stats.totalTime}' ` +
        `racerNum='${identity.racerNumber}' type='C' hp='${stats.horsepower}' w='${stats.weight}' ` +
        `pp='${stats.performancePoints}' b='${racer.delay}'/>`
      );
    })
    .join("");

  return `<u c='${COMPUTER_TOURNAMENT_BRACKET_SIZE}' p='1'>${nodes}</u>`;
}

function computerTournamentOpponent(params, state = null) {
  const requestedId = Number(
    params.get("rid")
      || params.get("oid")
      || params.get("opponentid")
      || params.get("racerid")
      || params.get("caid")
      || params.get("computeraccountid")
      || params.get("tid")
      || params.get("uid")
      || params.get("id")
      || 0,
  );
  const requestedOpponent = COMPUTER_TOURNAMENT_FIELD_RACERS.find((racer, index) => {
    const identity = tournamentBotIdentity(racer, index);
    return (
      racer.id === requestedId
      || identity.competitorId === requestedId
      || identity.competitorCarId === requestedId
      || identity.virtualCarId === requestedId
    );
  });

  if (requestedOpponent) {
    return requestedOpponent;
  }

  const matchNumber = Number(params.get("m") || params.get("match") || params.get("mid") || params.get("mn") || params.get("b") || 0);
  if (Number.isInteger(matchNumber) && matchNumber > 0) {
    const playerMatch = Math.ceil(COMPUTER_TOURNAMENT_PLAYER_SEED / 2);
    const opponentSeed = playerMatch * 2;
    const racers = COMPUTER_TOURNAMENT_FIELD_RACERS.slice(0, COMPUTER_TOURNAMENT_BRACKET_SIZE - 1);
    const seeds = computerTournamentBotSeeds(racers.length);
    const seededOpponent = racers.find((_, index) => seeds[index] === opponentSeed);

    if (matchNumber === playerMatch && seededOpponent) {
      return seededOpponent;
    }
  }

  const roundOpponentIndexes = [0, 3, 12, 20, 30];
  const roundIndex = Math.max(0, Math.min(roundOpponentIndexes.length - 1, Number(state?.wins || 0)));
  const progressionOpponent = COMPUTER_TOURNAMENT_FIELD_RACERS[roundOpponentIndexes[roundIndex]];
  if (progressionOpponent) {
    return progressionOpponent;
  }

  return COMPUTER_TOURNAMENT_FIELD_RACERS.find((racer) => racer.difficulty === computerTournamentDifficulty(params))
    || COMPUTER_TOURNAMENT_FIELD_RACERS[0];
}

function computerTournamentOpponentXml(opponent, difficulty = "", roundWins = 0) {
  const rosterIndex = COMPUTER_TOURNAMENT_FIELD_RACERS.findIndex((racer) => racer.id === opponent.id);
  const stats = tournamentBotStats(opponent, rosterIndex, difficulty);
  const identity = tournamentBotIdentity(opponent, rosterIndex);
  const payout = computerTournamentRoundPayout(difficulty || opponent.difficulty, roundWins);

  return (
    `<r i='${identity.virtualCarId}' id='${identity.competitorCarId}' cid='${identity.competitorCarId}' ` +
    `caid='${identity.competitorCarId}' cacid='${identity.virtualCarId}' aid='${identity.competitorId}' ` +
    `uid='${identity.competitorId}' rid='${identity.competitorId}' ` +
    `ci='${opponent.catalogCarId}' carid='${opponent.catalogCarId}' n='${escapeXmlAttribute(opponent.username)}' ` +
    `u='${escapeXmlAttribute(opponent.username)}' r='5' sc='0' d='${escapeXmlAttribute(difficulty || opponent.difficulty)}' ` +
    `c='${escapeXmlAttribute(opponent.carName)}' bt='${stats.bracketTime}' rt='${stats.reactionTime}' ` +
    `et='${stats.elapsedTime}' t='${stats.elapsedTime}' ts='${stats.trapSpeed}' total='${stats.totalTime}' ` +
    `p='${payout}' pp='${stats.performancePoints}' hp='${stats.horsepower}' w='${stats.weight}' ` +
    `b='${opponent.delay}' type='C'/>`
  );
}

function localComputerTournamentState(session) {
  if (!session) {
    return null;
  }

  if (!session.computerTournament || typeof session.computerTournament !== "object") {
    session.computerTournament = {};
  }

  session.computerTournament.wins = Math.max(0, Number(session.computerTournament.wins || 0));
  session.computerTournament.bracketTime = Number(session.computerTournament.bracketTime || 0);
  session.computerTournament.bracketTimeReliable = Boolean(session.computerTournament.bracketTimeReliable);
  session.computerTournament.bracketTimeSource = session.computerTournament.bracketTimeSource || "unknown";
  session.computerTournament.phase = session.computerTournament.phase || "idle";

  return session.computerTournament;
}

function resetLocalComputerTournamentState(session, params = new URLSearchParams()) {
  if (!session) {
    return null;
  }

  session.computerTournament = {
    wins: 0,
    bracketTime: 0,
    bracketTimeReliable: false,
    bracketTimeSource: "none",
    difficulty: computerTournamentDifficulty(params) || "all",
    phase: "joined",
    currentOpponentId: 0,
  };

  return session.computerTournament;
}

function tournamentNumericParam(params, keys, fallback = 0) {
  for (const key of keys) {
    const value = Number(params.get(key));
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return fallback;
}

function tournamentSignedNumericParam(params, keys, fallback = 0) {
  for (const key of keys) {
    const rawValue = params.get(key);
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      continue;
    }

    const value = Number(rawValue);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

function tournamentHasParam(params, keys) {
  return keys.some((key) => {
    const value = params.get(key);
    return value !== null && value !== undefined && value !== "";
  });
}

function tournamentTime(value, fallback = 0) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) && numericValue > 0
    ? Number(numericValue.toFixed(3))
    : Number(fallback || 0);
}

function tournamentPlayerBracketTimeResult(params, fallback = 12) {
  const elapsedTime = tournamentNumericParam(params, ["et", "e", "t", "time", "elapsed", "elapsedtime"], 0);
  const bracketTime = tournamentNumericParam(
    params,
    ["bt", "bracket", "brackettime", "bracketTime", "dial", "dialin", "dialIn"],
    0,
  );

  if (bracketTime > 0) {
    return {
      bracketTime: tournamentTime(bracketTime),
      reliable: true,
      source: "bracket-param",
    };
  }

  if (elapsedTime > 0) {
    return {
      bracketTime: tournamentTime(elapsedTime),
      reliable: true,
      source: "elapsed-time",
    };
  }

  return {
    bracketTime: tournamentTime(fallback),
    reliable: false,
    source: "fallback",
  };
}

function computerTournamentBracketTimeFromPerformance(performance = {}) {
  const horsepower = Number(performance.horsepower || performance.hp || 0);
  const weight = Number(performance.weight || performance.r || 0);

  if (!Number.isFinite(horsepower) || horsepower <= 0 || !Number.isFinite(weight) || weight <= 0) {
    return null;
  }

  const bracketTime = Math.pow(weight / horsepower, 1 / 3) * 5.825;

  return {
    bracketTime: tournamentTime(bracketTime),
    horsepower: Math.round(horsepower),
    weight: Math.round(weight),
  };
}

function computerTournamentPlayerBracketTimeResult(params, account, targetCar, fallback = 12) {
  const paramResult = tournamentPlayerBracketTimeResult(params, 0);
  if (paramResult.reliable && paramResult.bracketTime > 0) {
    return paramResult;
  }

  const catalogCarId = Number(targetCar?.catalogCarId || targetCar?.ci || 0);
  const catalogCar = getCatalogCar(catalogCarId) || getCatalogCar(1) || {};
  const performance = calculateRacePerformance({ account, targetCar, catalogCar });
  const estimated = computerTournamentBracketTimeFromPerformance(performance);

  if (estimated?.bracketTime > 0) {
    return {
      ...estimated,
      reliable: false,
      source: "car-performance-estimate",
    };
  }

  return tournamentPlayerBracketTimeResult(params, fallback);
}

function isComputerTournamentFoulReactionTime(value, params) {
  const hasReactionTime = ["rt", "r", "reaction", "reactiontime"]
    .some((key) => params.has(key));
  const reactionTime = Number(value);

  return Boolean(
    hasReactionTime
      && Number.isFinite(reactionTime)
      && reactionTime < COMPUTER_TOURNAMENT_PERFECT_REACTION_TIME_SECONDS
  );
}

function computerTournamentReactionPenaltySeconds(reactionTime) {
  const normalizedReactionTime = Number(reactionTime);
  if (!Number.isFinite(normalizedReactionTime) || normalizedReactionTime < 0) {
    return 0;
  }

  return Number((normalizedReactionTime - COMPUTER_TOURNAMENT_PERFECT_REACTION_TIME_SECONDS).toFixed(3));
}

function scoreComputerTournamentRacer({
  side,
  elapsedTime,
  reactionTime,
  bracketTime,
  trapSpeed = 0,
  foul = false,
  dns = false,
  finishIndex = 0,
}) {
  const numericElapsedTime = Number(elapsedTime);
  const numericReactionTime = Number(reactionTime);
  const numericBracketTime = Number(bracketTime);
  const hasDial = Number.isFinite(numericBracketTime) && numericBracketTime > 0;
  const cleanElapsedTime = Number.isFinite(numericElapsedTime) && numericElapsedTime > 0
    ? Number(numericElapsedTime.toFixed(3))
    : -1;
  const normalizedReactionTime = Number.isFinite(numericReactionTime)
    ? Number(numericReactionTime.toFixed(3))
    : COMPUTER_TOURNAMENT_PERFECT_REACTION_TIME_SECONDS;
  const reactionPenalty = computerTournamentReactionPenaltySeconds(normalizedReactionTime);
  const totalTime = !dns && cleanElapsedTime > 0
    ? Number((cleanElapsedTime + Math.max(0, reactionPenalty)).toFixed(3))
    : Number.POSITIVE_INFINITY;
  const dialDelta = hasDial && cleanElapsedTime > 0
    ? Number((cleanElapsedTime - numericBracketTime).toFixed(3))
    : 0;
  const packageDelta = hasDial && Number.isFinite(totalTime)
    ? Number((totalTime - numericBracketTime).toFixed(3))
    : totalTime;
  const breakout = hasDial && cleanElapsedTime > 0 && cleanElapsedTime < numericBracketTime;

  return {
    side,
    elapsedTime: cleanElapsedTime,
    trapSpeed: Number.isFinite(Number(trapSpeed)) ? Number(trapSpeed) : 0,
    reactionTime: normalizedReactionTime,
    reactionPenalty,
    totalTime,
    bracketTime: hasDial ? numericBracketTime : 0,
    dialDelta,
    absDialDelta: Math.abs(dialDelta),
    packageDelta,
    absPackageDelta: Math.abs(packageDelta),
    breakout,
    foul: Boolean(foul),
    dns: Boolean(dns),
    finishIndex: Number(finishIndex || 0),
  };
}

function resolveComputerTournamentRaceResult(playerScore, opponentScore) {
  const scored = [playerScore, opponentScore].filter(Boolean);

  if (!scored.length || scored.every((racer) => racer.dns)) {
    return { winner: null, loser: null, racers: scored, noWinner: true, reason: "dns" };
  }

  if (scored.length >= 2 && scored.every((racer) => racer.foul && !racer.dns)) {
    return { winner: null, loser: null, racers: scored, noWinner: true, reason: "double-foul" };
  }

  if (scored.some((racer) => racer.foul)) {
    const cleanRacers = scored.filter((racer) => !racer.foul);
    if (!cleanRacers.length || cleanRacers.every((racer) => racer.dns)) {
      return { winner: null, loser: null, racers: scored, noWinner: true, reason: "foul-no-clean-finish" };
    }
  }

  scored.sort((left, right) => {
    if (left.dns !== right.dns) {
      return left.dns ? 1 : -1;
    }
    if (left.foul !== right.foul) {
      return left.foul ? 1 : -1;
    }
    if (left.breakout !== right.breakout) {
      return left.breakout ? 1 : -1;
    }

    const packageDifference = left.breakout && right.breakout
      ? left.absDialDelta - right.absDialDelta
      : left.packageDelta - right.packageDelta;
    if (Math.abs(packageDifference) > 0.0005) {
      return packageDifference;
    }

    const reactionDifference = left.reactionTime - right.reactionTime;
    if (Math.abs(reactionDifference) > 0.0005) {
      return reactionDifference;
    }

    return left.finishIndex - right.finishIndex;
  });

  return {
    winner: scored[0] || null,
    loser: scored[1] || null,
    racers: scored,
    noWinner: false,
    reason: "scored",
  };
}

function buddyTargetAccountId(params, fallbackAccountId = 0) {
  for (const key of ["i", "tid", "bid", "target", "targetid", "uid", "playerid", "pid", "id"]) {
    const value = Number(params.get(key) || 0);
    if (Number.isInteger(value) && value > 0) {
      return value;
    }
  }

  return Number(fallbackAccountId || 0);
}

function renderBuddiesXml(accounts, onlineAccountIds = null) {
  const hasPresence = onlineAccountIds instanceof Set;
  const nodes = (Array.isArray(accounts) ? accounts : [])
    .map((account) => ({
      account,
      accountId: Number(account.id || 0),
    }))
    .sort((left, right) => {
      const leftOnline = hasPresence ? onlineAccountIds.has(left.accountId) : true;
      const rightOnline = hasPresence ? onlineAccountIds.has(right.accountId) : true;
      if (leftOnline !== rightOnline) {
        return leftOnline ? -1 : 1;
      }

      return String(left.account.username || "Racer").localeCompare(
        String(right.account.username || "Racer"),
        undefined,
        { numeric: true, sensitivity: "base" },
      ) || left.accountId - right.accountId;
    })
    .map(({ account, accountId }) => {
      const isOnline = hasPresence ? onlineAccountIds.has(accountId) : true;

      return (
        `<I i='${accountId}' id='${accountId}' ` +
        `n='${escapeXmlAttribute(account.username || "Racer")}' ` +
        `s='${isOnline ? 1 : 0}' b='0' r='3' ul='${isOnline ? "-" : "0"}'/>`
      );
    })
    .join("");

  return `<buddies>${nodes}</buddies>`;
}

function remarkTargetAccountId(params, fallbackAccountId = 0) {
  for (const key of ["tid", "aid", "uid", "id", "i", "pid", "playerid"]) {
    const value = Number(params.get(key) || 0);
    if (Number.isInteger(value) && value > 0) {
      return value;
    }
  }

  return Number(fallbackAccountId || 0);
}

function remarkBody(params) {
  for (const key of ["rmk", "r", "remark", "remarks", "txt", "text", "b", "body"]) {
    const value = String(params.get(key) || "").replace(/\r\n/g, "\n").trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function remarkIds(params) {
  return String(params.get("arids") || params.get("arid") || params.get("ids") || params.get("id") || "")
    .split(/[,\s]+/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function remarkDateLabel(value) {
  const date = new Date(value || Date.now());

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();

  return `${month}/${day}/${year}`;
}

function renderRemarksXml(targetAccountId, remarks) {
  const nodes = (Array.isArray(remarks) ? remarks : [])
    .map((remark) => {
      const body = escapeXmlAttribute(remark.body || "");

      return (
        `<r rid='${Number(remark.id || 0)}' fid='${Number(remark.fromAccountId || 0)}' ` +
        `fu='${escapeXmlAttribute(remark.fromUsername || "Racer")}' ` +
        `dc='${escapeXmlAttribute(remarkDateLabel(remark.createdAt))}' ` +
        `nd='${Number(remark.nonDelete || 0)}'>${body}</r>`
      );
    })
    .join("");

  return `<remarks uid='${Number(targetAccountId || 0)}' c='${Array.isArray(remarks) ? remarks.length : 0}'>${nodes}</remarks>`;
}

function formatMailTimestamp(value) {
  const date = new Date(value || Date.now());
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const month = safeDate.getMonth() + 1;
  const day = safeDate.getDate();
  const year = safeDate.getFullYear();
  const hours24 = safeDate.getHours();
  const hours12 = hours24 % 12 || 12;
  const minutes = String(safeDate.getMinutes()).padStart(2, "0");
  const seconds = String(safeDate.getSeconds()).padStart(2, "0");
  const ampm = hours24 >= 12 ? "PM" : "AM";

  return `${month}/${day}/${year} ${hours12}:${minutes}:${seconds} ${ampm}`;
}

function renderEmailListXml(mailItems) {
  const nodes = (Array.isArray(mailItems) ? mailItems : [])
    .map((mail) => (
      `<m i='${Number(mail.id || 0)}' fu='${escapeXmlAttribute(mail.fromUsername || "Racer")}' ` +
      `fi='${Number(mail.fromAccountId || 0)}' d='${escapeXmlAttribute(formatMailTimestamp(mail.createdAt))}' ` +
      `s='${escapeXmlAttribute(mail.subject || " ")}' n='${mail.read ? 0 : 1}'/>`
    ))
    .join("");

  return `<emails>${nodes}</emails>`;
}

function renderEmailDetailXml(mail, fallbackMailId = 0) {
  const mailId = Number(mail?.id || fallbackMailId || 0);
  const body = escapeXmlAttribute(mail?.body || "");

  return (
    `<email i='${mailId}' fu='${escapeXmlAttribute(mail?.fromUsername || "Racer")}' ` +
    `fi='${Number(mail?.fromAccountId || 0)}' d='${escapeXmlAttribute(formatMailTimestamp(mail?.createdAt))}' ` +
    `s='${escapeXmlAttribute(mail?.subject || " ")}'>${body}</email>`
  );
}

function sendEmailSuccessXml(composeId) {
  return `<r s='1' id='${Number(composeId || 0)}'/>`;
}

function xmlAttribute(xml, name) {
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

function renderInstalledEnginePartXml(partXml, partsById) {
  let xml = String(partXml || "");
  const catalogPart = partsById?.get?.(Number(xmlAttribute(xml, "i") || 0));

  if (!catalogPart) {
    return xml;
  }

  const installCategoryId = Number(catalogPart.ci || catalogPart.pi || 0);
  const airFuelKind = String(catalogPart.afm || "").toLowerCase();
  const airFuelType = Number(catalogPart.aft || 0);
  const visualCategoryId = airFuelKind === "controller" || airFuelType === 2
    ? 26
    : airFuelKind === "meter" || airFuelType === 1
      ? 134
      : 0;
  const displayCategoryId = visualCategoryId || Number(catalogPart.pi || installCategoryId || 0);

  if (displayCategoryId) {
    xml = setXmlAttribute(xml, "pi", displayCategoryId);
    xml = setXmlAttribute(xml, "pcid", displayCategoryId);
  }
  if (installCategoryId || visualCategoryId) {
    xml = setXmlAttribute(xml, "ci", visualCategoryId || installCategoryId);
    xml = setXmlAttribute(xml, "categoryID", visualCategoryId || installCategoryId);
  }

  for (const key of ["di", "pdi", "afm", "aft", "af", "ff", "ef", "eef", "flow"]) {
    if (catalogPart[key] !== undefined && catalogPart[key] !== null && catalogPart[key] !== "") {
      xml = setXmlAttribute(xml, key, catalogPart[key]);
    }
  }

  return xml;
}

function renderInstalledEnginePartsXml(car, partsById) {
  const nodes = [...String(car?.partsXml || "").matchAll(/<p\b[^>]*\/>/g)]
    .map((match) => match[0])
    .filter((partXml) => String(xmlAttribute(partXml, "t") || xmlAttribute(partXml, "pt")).toLowerCase() === "e")
    .map((partXml) => renderInstalledEnginePartXml(partXml, partsById))
    .join("");

  return `<n2>${nodes}</n2>`;
}

function sendEmailFailureXml(composeId, title, message) {
  return (
    `<r s='0' id='${Number(composeId || 0)}' ` +
    `t='${escapeXmlAttribute(title)}' m='${escapeXmlAttribute(message)}'/>`
  );
}

function renderOtherUserCarsXml(account) {
  const cars = accountGarageCars(account);
  const defaultCarId = Number(account?.defaultCarAccountCarId || account?.starterCar?.accountCarId || cars[0]?.accountCarId || 0);
  const carNodes = cars
    .map((car, index) => renderOwnedGarageCarXml(account, {
      ...car,
      locationId: car.locationId || accountLocationId(account),
    }, {
      selected: defaultCarId
        ? Number(car.accountCarId) === defaultCarId
        : index === 0,
    }))
    .join("");

  return `<cars i='${Number(account?.id || 0)}' dc='${defaultCarId}'>${carNodes}</cars>`;
}

function selectedGarageCarForCatalog(account, params) {
  const requestedAccountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || 0);
  const cars = accountGarageCars(account);

  if (requestedAccountCarId > 0) {
    return cars.find((car) => Number(car.accountCarId || 0) === requestedAccountCarId) || null;
  }

  const defaultCarId = Number(account?.defaultCarAccountCarId || 0);
  if (defaultCarId > 0) {
    return cars.find((car) => Number(car.accountCarId || 0) === defaultCarId) || null;
  }

  return cars.find((car) => car.selected) || account?.starterCar || cars[0] || null;
}

async function handlePing() {
  return {
    body: statusBody(1),
    source: "local:ping",
  };
}

async function handleEngineList(context) {
  const session = getLocalSession(context.params.get("sk"));

  if (!session) {
    context.logger.warn("Local engine picker request rejected because session was not found", {
      accountId: context.params.get("aid") || "<empty>",
      hasSessionKey: Boolean(context.params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:egue:missing-session",
    };
  }

  context.logger.info("Local engine picker served without swap engines", {
    accountId: session.account.id,
    username: session.account.username,
  });

  return {
    body: successData("<n2></n2>"),
    source: "local:egue",
  };
}

async function handleGetStarterShowroom() {
  return {
    body: successData(buildStarterShowroomXml()),
    source: "local:getstartershowroom",
  };
}

async function handleGetCarCategories(context) {
  context.logger.info("Local car showroom categories served");

  return {
    body: successData(buildCarCategoryXml()),
    source: "local:getcarcategories",
  };
}

async function handleGetPaintCategories(context) {
  context.logger.info("Local paint categories served");

  return {
    body: successData(buildPaintCategoriesXml()),
    source: "local:getpaintcats",
  };
}

async function handleGetPaints(context) {
  context.logger.info("Local paint colors served");

  return {
    body: successData(buildPaintsXml()),
    source: "local:getpaints",
  };
}

async function handleGetLicensePlates(context) {
  context.logger.info("Local license plates served");

  return {
    body: successData(buildLicensePlatesXml()),
    source: "local:getlicenseplates",
  };
}

async function handleViewShowroom(context) {
  const session = getLocalSession(context.params.get("sk"));
  const locationId = Number(
    context.params.get("lid")
    || context.params.get("l")
    || session?.account?.locationId
    || 100,
  );
  const xml = buildDealerShowroomXml(locationId);

  context.logger.info("Local car showroom served", {
    accountId: session?.account?.id || 0,
    username: session?.account?.username || "<unknown>",
    locationId,
  });

  return {
    body: successData(xml),
    source: "local:viewshowroom",
  };
}

async function handleGetTotalNewMail(context) {
  const session = getLocalSession(context.params.get("sk"));
  if (!session) {
    return {
      body: `"s", 1, "im", "0"`,
      source: "local:gettotalnewmail:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const unreadCount = await store.unreadMailCount(session.account.id);

  return {
    body: `"s", 1, "im", "${unreadCount}"`,
    source: "local:gettotalnewmail",
  };
}

async function handleGetEmailList(context) {
  const session = getLocalSession(context.params.get("sk"));
  if (!session) {
    return {
      body: successData("<emails></emails>"),
      source: "local:getemaillist:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const mailItems = await store.listMailForAccount(session.account.id);

  context.logger.info("Local email list served", {
    accountId: session.account.id,
    username: session.account.username,
    count: mailItems.length,
  });

  return {
    body: successData(renderEmailListXml(mailItems)),
    source: "local:getemaillist",
  };
}

async function handleGetEmail(context) {
  const session = getLocalSession(context.params.get("sk"));
  const mailId = Number(context.params.get("eid") || context.params.get("i") || 0);

  if (!session) {
    return {
      body: successData(renderEmailDetailXml(null, mailId)),
      source: "local:getemail:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const mail = await store.getMailForAccount({
    accountId: session.account.id,
    mailId,
  });

  return {
    body: successData(renderEmailDetailXml(mail, mailId)),
    source: mail ? "local:getemail" : "local:getemail:not-found",
  };
}

async function handleMarkEmailRead(context) {
  const session = getLocalSession(context.params.get("sk"));
  const mailId = Number(context.params.get("eid") || context.params.get("i") || 0);

  if (!session) {
    return {
      body: statusBody(0),
      source: "local:markemailread:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  await store.markMailRead({
    accountId: session.account.id,
    mailId,
  });

  return {
    body: statusBody(1),
    source: "local:markemailread",
  };
}

async function handleDeleteEmail(context) {
  const session = getLocalSession(context.params.get("sk"));
  const mailId = Number(context.params.get("eid") || context.params.get("i") || 0);

  if (!session) {
    return {
      body: `"s", 0, "eid", "${mailId || 0}"`,
      source: "local:deleteemail:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  await store.deleteMail({
    accountId: session.account.id,
    mailId,
  });

  return {
    body: `"s", 1, "eid", "${mailId || 0}"`,
    source: "local:deleteemail",
  };
}

async function handleSendEmail(context) {
  const session = getLocalSession(context.params.get("sk"));
  const composeId = Number(context.params.get("i") || context.params.get("id") || 0);
  const toUsername = String(context.params.get("tu") || context.params.get("to") || context.params.get("u") || "").trim();
  const subject = context.params.get("s") || " ";
  const body = context.params.get("b") || "";

  if (!session) {
    return {
      body: successData(sendEmailFailureXml(
        composeId,
        "E-mail Can Not Be Sent",
        "Your session could not be found. Please log in again.",
      )),
      source: "local:sendemail:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const result = await store.sendMail({
    fromAccountId: session.account.id,
    toUsername,
    subject,
    body,
  });

  if (!result.ok) {
    const message = result.reason === "empty-body"
      ? "The message body can not be blank."
      : "The receiver could not be found. Please check the racer name and try again.";

    context.logger.warn("Local email send rejected", {
      accountId: session.account.id,
      username: session.account.username,
      toUsername,
      reason: result.reason,
    });

    return {
      body: successData(sendEmailFailureXml(composeId, "E-mail Can Not Be Sent", message)),
      source: `local:sendemail:${result.reason || "rejected"}`,
    };
  }

  context.logger.info("Local email sent", {
    accountId: session.account.id,
    username: session.account.username,
    toAccountId: result.toAccount.id,
    toUsername: result.toAccount.username,
    mailId: result.mail.id,
  });

  return {
    body: successData(sendEmailSuccessXml(composeId)),
    source: "local:sendemail",
  };
}

async function handleGetRemarks(context) {
  const session = getLocalSession(context.params.get("sk"));

  if (!session) {
    return {
      body: successData("<remarks/>"),
      source: "local:getremarks:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const remarks = await store.listRemarksForTarget(session.account.id);

  return {
    body: successData(renderRemarksXml(session.account.id, remarks)),
    source: "local:getremarks",
  };
}

async function handleGetUserRemarks(context) {
  const session = getLocalSession(context.params.get("sk"));
  const targetAccountId = remarkTargetAccountId(context.params, session?.account?.id || 0);
  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const account = await store.findById(targetAccountId);

  if (!account) {
    context.logger.warn("Local user remarks request rejected because target account was not found", {
      requesterAccountId: session?.account?.id || 0,
      targetAccountId,
    });
    return {
      body: successData(renderRemarksXml(targetAccountId, [])),
      source: "local:getuserremarks:not-found",
    };
  }

  const remarks = await store.listRemarksForTarget(account.id);

  return {
    body: successData(renderRemarksXml(account.id, remarks)),
    source: "local:getuserremarks",
  };
}

async function handleAddRemark(context) {
  const session = getLocalSession(context.params.get("sk"));
  const targetAccountId = remarkTargetAccountId(context.params, 0);
  const text = remarkBody(context.params);

  if (!session) {
    context.logger.warn("Local add remark rejected because session was not found", {
      targetAccountId,
      hasSessionKey: Boolean(context.params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:addremark:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const result = await store.addRemark({
    fromAccountId: session.account.id,
    toAccountId: targetAccountId,
    body: text,
  });

  if (!result.ok) {
    context.logger.warn("Local add remark rejected", {
      accountId: session.account.id,
      username: session.account.username,
      targetAccountId,
      reason: result.reason,
    });
    return {
      body: statusBody(result.code ?? 0),
      source: `local:addremark:${result.reason || "failed"}`,
    };
  }

  context.logger.info("Local remark added", {
    accountId: session.account.id,
    username: session.account.username,
    targetAccountId,
    remarkId: result.remark.id,
  });

  return {
    body: statusBody(1),
    source: "local:addremark",
  };
}

async function handleDeleteRemark(context) {
  const session = getLocalSession(context.params.get("sk"));
  const remarkId = Number(context.params.get("arid") || context.params.get("id") || 0);

  if (!session) {
    return {
      body: `"s", 0, "arid", "${escapeXmlAttribute(remarkId)}"`,
      source: "local:deleteremark:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const result = await store.deleteRemark({
    accountId: session.account.id,
    remarkId,
  });

  if (!result.ok) {
    context.logger.warn("Local delete remark rejected", {
      accountId: session.account.id,
      username: session.account.username,
      remarkId,
      reason: result.reason,
    });
    return {
      body: `"s", 0, "arid", "${escapeXmlAttribute(remarkId)}"`,
      source: `local:deleteremark:${result.reason || "failed"}`,
    };
  }

  return {
    body: `"s", 1, "arid", "${escapeXmlAttribute(remarkId)}"`,
    source: "local:deleteremark",
  };
}

async function handleSetRemarkNonDeletes(context) {
  return handleSetRemarkDeleteFlag(context, true, "local:setnondeletes");
}

async function handleSetRemarkDeletes(context) {
  return handleSetRemarkDeleteFlag(context, false, "local:setdeletes");
}

async function handleSetRemarkDeleteFlag(context, nonDelete, source) {
  const session = getLocalSession(context.params.get("sk"));

  if (!session) {
    return {
      body: statusBody(0),
      source: `${source}:missing-session`,
    };
  }

  const ids = remarkIds(context.params);
  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const result = await store.setRemarkDeleteFlags({
    accountId: session.account.id,
    remarkIds: ids,
    nonDelete,
  });

  context.logger.info("Local remark delete flags updated", {
    accountId: session.account.id,
    username: session.account.username,
    requested: ids.length,
    updated: result.updated,
    nonDelete: nonDelete ? 1 : 0,
  });

  return {
    body: statusBody(1),
    source,
  };
}

async function handleGetBuddies(context) {
  const session = getLocalSession(context.params.get("sk"));
  const targetAccountId = buddyTargetAccountId(context.params, session?.account?.id || 0);
  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const account = await store.findById(targetAccountId);

  if (!account) {
    context.logger.warn("Local buddies request rejected because target account was not found", {
      requesterAccountId: session?.account?.id || 0,
      targetAccountId,
    });
    return {
      body: successData("<buddies></buddies>"),
      source: "local:getbuddies:not-found",
    };
  }

  const buddies = await store.listBuddiesForAccount(account.id);
  const onlineAccountIds = typeof context.tcpServer?.onlineAccountIds === "function"
    ? context.tcpServer.onlineAccountIds()
    : null;

  return {
    body: successData(renderBuddiesXml(buddies, onlineAccountIds)),
    source: "local:getbuddies",
  };
}

async function handleAddBuddy(context) {
  const session = getLocalSession(context.params.get("sk"));
  const targetAccountId = buddyTargetAccountId(context.params, 0);

  if (!session) {
    return {
      body: statusBody(-100),
      source: "local:addbuddy:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const result = await store.createBuddyRequest({
    fromAccountId: session.account.id,
    toAccountId: targetAccountId,
  });

  if (!result.ok) {
    return {
      body: statusBody(result.code ?? 0),
      source: `local:addbuddy:${result.reason || "failed"}`,
    };
  }

  return {
    body: statusBody(1),
    source: result.created ? "local:addbuddy:request" : "local:addbuddy:request-existing",
  };
}

async function handleRemoveBuddy(context) {
  const session = getLocalSession(context.params.get("sk"));
  const targetAccountId = buddyTargetAccountId(context.params, 0);

  if (!session) {
    return {
      body: statusBody(-100),
      source: "local:removebuddy:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  await store.removeBuddy({
    accountId: session.account.id,
    buddyAccountId: targetAccountId,
  });

  return {
    body: statusBody(1),
    source: "local:removebuddy",
  };
}

async function handleGetBlackCardProgress() {
  return {
    body: successData("<x s='0'/>"),
    source: "local:getblackcardprogress:zero",
  };
}

async function handleGetAvatarAge(context) {
  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const tids = String(context.params.get("tids") || "")
    .split(",")
    .map((tid) => Number(tid.trim()))
    .filter((tid) => Number.isFinite(tid) && tid > 0);
  const ages = await store.getAvatarAges(tids);
  const values = ages.map(([tid, age]) => `[${tid}, ${age}]`).join(", ");

  return {
    body: `"s", 1, "tids", [${values}]`,
    source: "local:getavatarage",
  };
}

async function handleGetTeamAvatarAge(context) {
  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const tids = String(context.params.get("tids") || "")
    .split(",")
    .map((tid) => Number(tid.trim()))
    .filter((tid) => Number.isFinite(tid) && tid > 0);
  const ages = await store.getTeamAvatarAges(tids);
  const values = ages.map(([tid, age]) => `[${tid}, ${age}]`).join(", ");

  return {
    body: `"s", 1, "tids", [${values}]`,
    source: "local:getteamavatarage",
  };
}

async function handleFacebookGetToken() {
  return {
    body: `"t", "", "a", ""`,
    source: "local:fbgettoken:disabled",
  };
}

async function handleFacebookRemove() {
  return {
    body: statusBody(1),
    source: "local:fbremovefacebook:disabled",
  };
}

async function handleFacebookInviteUrl() {
  return {
    body: `"d", ""`,
    source: "local:fbgetinviteurl:disabled",
  };
}

async function handleUggQueueAck(context) {
  context.logger.info("Local UGG bridge acknowledged", {
    accountId: context.params.get("aid") || "0",
  });

  return {
    body: `"s", 1`,
    source: "local:ugg:queue-ack",
  };
}

async function handleUploadRequest(context) {
  const session = getLocalSession(context.params.get("sk"));
  const targetId = Number(context.params.get("id") || context.params.get("tid") || context.params.get("aid") || 0);
  const accepted = rememberAvatarUploadRequest({
    remoteAddress: context.remoteAddress,
    accountId: session?.account?.id,
    targetId,
    avatarType: context.params.get("t"),
    filename: context.params.get("fn"),
  }) || rememberUserGraphicUploadRequest({
    remoteAddress: context.remoteAddress,
    accountId: session?.account?.id,
    uploadType: context.params.get("t"),
    filename: context.params.get("fn"),
    slot: context.params.get("slot") || context.params.get("ci") || context.params.get("pi"),
    fieldName: context.params.get("field") || context.params.get("n") || context.params.get("fn"),
  });

  if (!accepted) {
    context.logger.warn("Upload request rejected", {
      accountId: session?.account?.id || 0,
      targetId,
      uploadType: context.params.get("t") || "",
      remoteAddress: context.remoteAddress || "",
    });

    return {
      body: `"s", -1`,
      source: "local:uploadrequest:rejected",
    };
  }

  return {
    body: `"s", 1`,
    source: "local:uploadrequest",
  };
}

async function handleGetLeaderboardMenu() {
  const xml = (
    "<menu tc='10' ttc='3'>" +
    "<racerCategoriesMenu id='racerCategoriesMenu'><i n='Street Credit'/><i n='Net Wealth'/><i n='King of the Hill'/><i n='Fastest Cars'/></racerCategoriesMenu>" +
    "<teamCategoriesMenu id='teamCategoriesMenu'><i n='Street Credit'/><i n='Wealth Gain'/><i n='Fastest Teams'/><i n='Members'/><i n='Badges'/><i n='Wins'/></teamCategoriesMenu>" +
    "<periodMenu id='periodMenu'><i n='Overall' t='All' c='0'/><i n='Today' t='Day' c='1'/><i n='This Week' t='Week' c='1'/></periodMenu>" +
    "<periodMenu2 id='periodMenu2'><i n='Today' t='Day' c='1'/><i n='This Week' t='Week' c='1'/></periodMenu2>" +
    "<carMenu id='carMenu'><i cid='0' n='Overall'/></carMenu>" +
    "</menu>"
  );

  return {
    body: successData(xml),
    source: "local:getleaderboardmenu",
  };
}

async function handleGetAllImportedCars() {
  return {
    body: successData("<cars i='0' dc='0'></cars>"),
    source: "local:getallimcars:compat",
  };
}

async function handleDisabledTestDriveAction(context) {
  const action = String(context.action || "").toLowerCase();
  const response = {
    accepttestdrive: { status: -1, source: "local:accepttestdrive:disabled" },
    buytestdrivecar: { status: 0, source: "local:buytestdrivecar:disabled" },
    checktestdrive: { status: 0, source: "local:checktestdrive:disabled" },
    rejecttestdrive: { status: 1, source: "local:rejecttestdrive:ok" },
    removetestdrivecar: { status: 1, source: "local:removetestdrivecar:disabled" },
  }[action] || { status: 0, source: `local:${action || "testdrive"}:disabled` };

  return {
    body: statusBody(response.status),
    source: response.source,
  };
}

async function handleGetLeaderboard(context) {
  const reportId = leaderboardReportId(context.params);
  const state = await readLocalLeaderboardState(context.config);

  if (reportId === "sc") {
    return renderStreetCreditLeaderboard(reportId, state);
  }

  if (reportId === "ba") {
    return renderBallerLeaderboard(reportId, state);
  }

  if (reportId === "tsc" || reportId === "tba" || reportId === "ta" || reportId === "ttw") {
    return renderTeamLeaderboard(reportId, state);
  }

  if (reportId === "ks") {
    return renderKingOfTheHillLeaderboard(reportId, state);
  }

  if (reportId === "fc") {
    return renderFastestCarsLeaderboard(reportId, state, context.params);
  }

  if (reportId === "tft") {
    return renderFastestTeamsLeaderboard(reportId, state);
  }

  return {
    body: successData(`<leaderboard id='${escapeXmlAttribute(reportId)}'><rows></rows></leaderboard>`),
    source: `local:getleaderboard:${reportId}:compat`,
  };
}

function leaderboardReportId(params) {
  const rawId = String(params.get("n") || params.get("id") || params.get("l") || "sc");
  return rawId.toLowerCase().replace(/[^a-z]/g, "") || "sc";
}

async function readLocalLeaderboardState(config) {
  try {
    const filePath = join(config.dataRoot, "accounts.local.json");
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

function leaderboardBody(reportId, innerXml) {
  return successData(`<leaderboard id='${escapeXmlAttribute(reportId)}'>${innerXml}</leaderboard>`);
}

function leaderboardAccounts(state) {
  return [...state.accounts].filter((account) => Number(account?.id || 0) > 0);
}

function leaderboardTeams(state) {
  return [...state.teams].filter((team) => Number(team?.id || 0) > 0);
}

function leaderboardStreetCreditFlag(account) {
  const teamId = Number(account?.teamId || 0);

  if (teamId > 0) {
    return Math.max(0, teamId - 1);
  }

  return 1;
}

function renderStreetCreditLeaderboard(reportId, state) {
  const rows = leaderboardAccounts(state)
    .map((account) => ({
      account,
      streetCredit: accountStreetCredit(account),
    }))
    .sort((left, right) => (
      right.streetCredit - left.streetCredit ||
      String(left.account.username || "").localeCompare(String(right.account.username || ""))
    ))
    .map(({ account, streetCredit }) => (
      `<r i='${Number(account.id || 0)}' n='${escapeXmlAttribute(account.username || "Racer")}' ` +
      `tf='${leaderboardStreetCreditFlag(account)}' sc='${streetCredit}'/>`
    ))
    .join("");

  return {
    body: leaderboardBody(reportId, `<rows>${rows}</rows>`),
    source: `local:getleaderboard:${reportId}`,
  };
}

function accountNetWorth(account) {
  const money = Number(account?.money || 0);
  const carValue = accountGarageCars(account).reduce(
    (total, car) => total + getCatalogCarPrice(car.catalogCarId),
    0,
  );

  return money + carValue;
}

function renderBallerLeaderboard(reportId, state) {
  const rows = leaderboardAccounts(state)
    .map((account) => ({
      account,
      netWorth: accountNetWorth(account),
      carCount: accountGarageCars(account).length,
    }))
    .sort((left, right) => (
      right.netWorth - left.netWorth ||
      String(left.account.username || "").localeCompare(String(right.account.username || ""))
    ))
    .map(({ account, netWorth, carCount }, index) => (
      `<r i='${Number(account.id || 0)}' n='${escapeXmlAttribute(account.username || "Racer")}' ` +
      `tf='${index === 0 ? 1 : 0}' nw='${netWorth}' nc='${carCount}' lid='${accountLocationId(account)}'/>`
    ))
    .join("");

  return {
    body: leaderboardBody(reportId, `<rows>${rows}</rows>`),
    source: `local:getleaderboard:${reportId}`,
  };
}

function renderTeamLeaderboard(reportId, state) {
  const config = {
    tsc: {
      attr: "sc",
      value: (team) => Number(team?.score || 0),
    },
    tba: {
      attr: "f",
      value: (team) => Number(team?.teamFund || team?.funds || 0),
    },
    ta: {
      attr: "m",
      value: (team) => (Array.isArray(team?.members) ? team.members.length : 0),
    },
    ttw: {
      attr: "b",
      value: (team) => Number(team?.wins || 0),
    },
  }[reportId];

  const rows = leaderboardTeams(state)
    .map((team) => ({
      team,
      value: config.value(team),
    }))
    .sort((left, right) => (
      right.value - left.value ||
      String(left.team.name || "").localeCompare(String(right.team.name || ""))
    ))
    .map(({ team, value }) => (
      `<r i='${Number(team.id || 0)}' n='${escapeXmlAttribute(team.name || "")}' ${config.attr}='${value}'/>`
    ))
    .join("");

  return {
    body: leaderboardBody(reportId, `<rows>${rows}</rows>`),
    source: `local:getleaderboard:${reportId}`,
  };
}

function selectedLeaderboardCar(account) {
  const cars = accountGarageCars(account);
  const defaultCarId = Number(account?.defaultCarAccountCarId || 0);

  if (defaultCarId > 0) {
    return cars.find((car) => Number(car.accountCarId || 0) === defaultCarId) || cars[0] || null;
  }

  return cars.find((car) => car.selected) || cars[0] || null;
}

function leaderboardCarForRace(account, accountCarId) {
  const requestedCarId = Number(accountCarId || 0);

  if (requestedCarId > 0) {
    return findAccountGarageCar(account, requestedCarId) || selectedLeaderboardCar(account);
  }

  return selectedLeaderboardCar(account);
}

function leaderboardRaceWon(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const text = String(value ?? "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

function raceElapsedMilliseconds(value) {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  return numericValue < 100 ? Math.round(numericValue * 1000) : Math.round(numericValue);
}

function formatLeaderboardElapsedTime(timeMs) {
  return (Math.round(Number(timeMs || 0)) / 1000).toFixed(3);
}

function leaderboardInductionGroup(catalogCarId) {
  const induction = String(getCatalogCar(catalogCarId)?.inductionSystem || "").toUpperCase();

  if (induction.startsWith("SC") || induction.includes("SUPER")) {
    return "s";
  }
  if (induction.startsWith("TC") || induction.includes("TURBO")) {
    return "t";
  }
  return "n";
}

function leaderboardRaceEntries(state) {
  const accountsById = new Map(leaderboardAccounts(state).map((account) => [Number(account.id || 0), account]));

  if (state.raceHistory.length > 0) {
    return state.raceHistory
      .map((record) => {
        const account = accountsById.get(Number(record?.playerId || record?.accountId || 0));
        const car = account ? leaderboardCarForRace(account, record?.carId || record?.accountCarId) : null;
        const timeMs = raceElapsedMilliseconds(record?.timeMs || record?.elapsedMs || record?.elapsedTime);

        return {
          account,
          car,
          timeMs,
          racedAt: record?.racedAt || record?.createdAt || "",
        };
      })
      .filter((entry) => entry.account && entry.car && entry.timeMs > 0);
  }

  return state.raceLogs
    .flatMap((record) => [
      {
        account: accountsById.get(Number(record?.player1Id || 0)),
        timeMs: raceElapsedMilliseconds(record?.player1Time || record?.player1TimeMs),
        racedAt: record?.createdAt || "",
      },
      {
        account: accountsById.get(Number(record?.player2Id || 0)),
        timeMs: raceElapsedMilliseconds(record?.player2Time || record?.player2TimeMs),
        racedAt: record?.createdAt || "",
      },
    ])
    .map((entry) => ({
      ...entry,
      car: entry.account ? selectedLeaderboardCar(entry.account) : null,
    }))
    .filter((entry) => entry.account && entry.car && entry.timeMs > 0);
}

function renderFastestCarsLeaderboard(reportId, state, params) {
  const requestedCatalogCarId = Number(params.get("cid") || params.get("ci") || params.get("carid") || 0);
  const bestByGroupAndAccount = new Map();

  for (const entry of leaderboardRaceEntries(state)) {
    const catalogCarId = Number(entry.car.catalogCarId || 0);
    if (requestedCatalogCarId > 0 && catalogCarId !== requestedCatalogCarId) {
      continue;
    }

    const group = leaderboardInductionGroup(catalogCarId);
    const key = `${group}:${Number(entry.account.id || 0)}`;
    const existing = bestByGroupAndAccount.get(key);

    if (!existing || entry.timeMs < existing.timeMs) {
      bestByGroupAndAccount.set(key, {
        ...entry,
        group,
      });
    }
  }

  const rowsByGroup = { n: [], t: [], s: [] };
  for (const entry of bestByGroupAndAccount.values()) {
    rowsByGroup[entry.group].push(entry);
  }

  let rowIndex = 0;
  const groups = ["n", "t", "s"].map((group) => {
    const rows = rowsByGroup[group]
      .sort((left, right) => (
        left.timeMs - right.timeMs ||
        String(left.account.username || "").localeCompare(String(right.account.username || ""))
      ))
      .map((entry) => {
        const flag = rowIndex === 0 ? 1 : 0;
        rowIndex += 1;

        return (
          `<r i='${Number(entry.account.id || 0)}' n='${escapeXmlAttribute(entry.account.username || "Racer")}' ` +
          `tf='${flag}' et='${formatLeaderboardElapsedTime(entry.timeMs)}' ` +
          `c='${Number(entry.car.catalogCarId || 0)}' ac='${Number(entry.car.accountCarId || 0)}'/>`
        );
      })
      .join("");

    return `<g e='${group}'>${rows}</g>`;
  }).join("");

  const hasRows = rowIndex > 0;

  return {
    body: leaderboardBody(reportId, groups),
    source: hasRows ? `local:getleaderboard:${reportId}` : `local:getleaderboard:${reportId}:compat`,
  };
}

function kothLeaderboardGroup(raceType) {
  const normalizedType = String(raceType || "").toLowerCase();

  if (!normalizedType.startsWith("koth")) {
    return "";
  }
  if (normalizedType.includes("bk") || normalizedType.endsWith(":b")) {
    return "b";
  }
  if (normalizedType.includes("h2h") || normalizedType.endsWith(":h")) {
    return "h";
  }
  return "";
}

function renderKingOfTheHillLeaderboard(reportId, state) {
  const accountsById = new Map(leaderboardAccounts(state).map((account) => [Number(account.id || 0), account]));
  const trackers = new Map();

  for (const record of [...state.raceHistory].sort((left, right) => (
    String(left?.racedAt || left?.createdAt || "").localeCompare(String(right?.racedAt || right?.createdAt || ""))
  ))) {
    const group = kothLeaderboardGroup(record?.raceType);
    const accountId = Number(record?.playerId || record?.accountId || 0);

    if (!group || !accountsById.has(accountId)) {
      continue;
    }

    const key = `${group}:${accountId}`;
    const tracker = trackers.get(key) || { group, accountId, current: 0, max: 0 };

    if (leaderboardRaceWon(record?.won)) {
      tracker.current += 1;
      tracker.max = Math.max(tracker.max, tracker.current);
    } else {
      tracker.current = 0;
    }

    trackers.set(key, tracker);
  }

  const rowsByGroup = { b: [], h: [] };
  for (const tracker of trackers.values()) {
    if (tracker.max > 0) {
      rowsByGroup[tracker.group].push({
        account: accountsById.get(tracker.accountId),
        streak: tracker.max,
      });
    }
  }

  let rowCount = 0;
  const groups = ["b", "h"].map((group) => {
    const rows = rowsByGroup[group]
      .sort((left, right) => (
        right.streak - left.streak ||
        String(left.account.username || "").localeCompare(String(right.account.username || ""))
      ))
      .map(({ account, streak }) => {
        rowCount += 1;
        return (
          `<r i='${Number(account.id || 0)}' n='${escapeXmlAttribute(account.username || "Racer")}' ` +
          `tf='1' s='${streak}'/>`
        );
      })
      .join("");

    return `<g t='${group}'>${rows}</g>`;
  }).join("");

  return {
    body: leaderboardBody(reportId, groups),
    source: rowCount > 0 ? `local:getleaderboard:${reportId}` : `local:getleaderboard:${reportId}:compat`,
  };
}

function renderFastestTeamsLeaderboard(reportId, state) {
  const teamsById = new Map(leaderboardTeams(state).map((team) => [Number(team.id || 0), team]));
  const bestByTeam = new Map();

  for (const entry of leaderboardRaceEntries(state)) {
    const teamId = Number(entry.account.teamId || 0);
    const team = teamsById.get(teamId);

    if (!team) {
      continue;
    }

    const existing = bestByTeam.get(teamId);
    if (!existing || entry.timeMs < existing.timeMs) {
      bestByTeam.set(teamId, {
        team,
        timeMs: entry.timeMs,
      });
    }
  }

  const rows = [...bestByTeam.values()]
    .sort((left, right) => (
      left.timeMs - right.timeMs ||
      String(left.team.name || "").localeCompare(String(right.team.name || ""))
    ))
    .map(({ team, timeMs }) => (
      `<r i='${Number(team.id || 0)}' n='${escapeXmlAttribute(team.name || "")}' ` +
      `t='${formatLeaderboardElapsedTime(timeMs)}'/>`
    ))
    .join("");

  const groups = ["f2v2", "f3v3", "f4v4"]
    .map((group) => `<g t='${group}'>${rows}</g>`)
    .join("");

  return {
    body: leaderboardBody(reportId, `<rows>${groups}</rows>`),
    source: rows ? `local:getleaderboard:${reportId}` : `local:getleaderboard:${reportId}:compat`,
  };
}

async function handleGetRepairParts() {
  return {
    body: `"s", 1, "d", "<parts/>"`,
    source: "local:getrepairparts:empty",
  };
}

async function handleGetDescription(context) {
  const session = getLocalSession(context.params.get("sk"));
  const partId = Number(context.params.get("id") || context.params.get("pid") || context.params.get("i") || 0);
  const partType = String(context.params.get("pt") || context.params.get("t") || "").trim().toLowerCase();
  const selectedCar = selectedGarageCarForCatalog(session?.account, context.params);
  const catalog = await buildPartsCatalogForGarage(context.config, selectedCar?.catalogCarId || 0);
  const part = catalog.partsById.get(partId);

  if (!part) {
    context.logger.info("Local part description fallback served", {
      partId,
      partType,
      rawQuery: context.decodedQuery || "",
    });

    return {
      body: successData(`<d>No description available for ${escapeXmlAttribute(partType || "part")} ${partId}.</d>`),
      source: `local:getdescription:missing:${partId || "unknown"}`,
    };
  }

  const stats = [];
  const hp = Number(part.hp || 0);
  const tq = Number(part.tq || 0);
  const wt = Number(part.wt || 0);
  const money = Number(part.p || 0);
  const points = Number(part.pp || 0);

  if (hp) {
    stats.push(`${hp > 0 ? "+" : ""}${hp} HP`);
  }
  if (tq) {
    stats.push(`${tq > 0 ? "+" : ""}${tq} TQ`);
  }
  if (wt) {
    stats.push(`${wt > 0 ? "+" : ""}${wt} WT`);
  }
  if (money) {
    stats.push(`$${money}`);
  }
  if (points) {
    stats.push(`${points} pts`);
  }

  const description = [
    part.n,
    [part.bn, part.mn].filter(Boolean).join(" "),
    stats.join(" | "),
  ].filter(Boolean).join(" - ");

  context.logger.info("Local part description served", {
    partId,
    partType,
    name: part.n || "",
    categoryId: part.ci || part.pi || 0,
  });

  return {
    body: successData(`<d>${escapeXmlAttribute(description)}</d>`),
    source: `local:getdescription:${partId}`,
  };
}

function parseTeamIds(params) {
  return String(params.get("tids") || params.get("tid") || params.get("id") || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function renderTeamDetailXml(team) {
  const members = Array.isArray(team?.members) ? team.members : [];
  const totalContribution = members.reduce((sum, member) => sum + Number(member?.contribution || 0), 0);
  const membersXml = members
    .map((member) => {
      const accountId = Number(member?.accountId || 0);
      const roleCode = Number(member?.role || TEAM_ROLE.MEMBER);
      const contribution = Number(member?.contribution || 0);
      const ownerPct = totalContribution > 0
        ? Math.round((contribution / totalContribution) * 10000) / 100
        : 0;
      const maxBetPct = roleCode === TEAM_ROLE.DEALER
        ? Number(member?.dealerMaxBet ?? 0)
        : -1;

      return (
        `<tm i='${accountId}' un='${escapeXmlAttribute(member?.username || "")}' ` +
        `sc='${Number(member?.score || 0)}' et='0' tr='${roleCode}' ` +
        `po='${ownerPct}' fu='${contribution}' mbp='${maxBetPct}'/>`
      );
    })
    .join("");

  return (
    `<t i='${Number(team?.id || 0)}' n='${escapeXmlAttribute(team?.name || "")}' sc='${Number(team?.score || 0)}' ` +
    `bg='${escapeXmlAttribute(team?.backgroundColor || team?.background_color || "7D7D7D")}' ` +
    `de='${escapeXmlAttribute(team?.createdAt || team?.created_at || "")}' ` +
    `tf='${Number(team?.teamFund ?? team?.team_fund ?? 0)}' ` +
    `lc='${escapeXmlAttribute(team?.leaderComments || "")}' ` +
    `tw='${Number(team?.wins || 0)}' tl='${Number(team?.losses || 0)}' ` +
    `rt='${escapeXmlAttribute(team?.recruitmentType || team?.recruitment_type || "open")}' ` +
    `v='${Number(team?.vip || 0)}'>${membersXml}</t>`
  );
}

function renderMissingTeamDetailXml(teamId) {
  return renderTeamDetailXml({
    id: teamId,
    name: "--",
    members: [],
  });
}

function renderTeamsXml(teams, { missingTeamIds = [] } = {}) {
  const body = (teams || []).map(renderTeamDetailXml).join("");
  const missingBody = missingTeamIds.map(renderMissingTeamDetailXml).join("");
  return `<teams>${body}${missingBody}</teams>`;
}

function renderTeamSearchXml(teams, { count, page } = {}) {
  const body = (teams || [])
    .map((team) => (
      `<team i='${Number(team?.id || 0)}' ` +
      `n='${escapeXmlAttribute(team?.name || "")}' ` +
      `s='${Number(team?.score || 0)}' ` +
      `w='${Number(team?.wins || 0)}' ` +
      `l='${Number(team?.losses || 0)}' ` +
      `bc='${escapeXmlAttribute(team?.backgroundColor || team?.background_color || "7D7D7D")}'/>`
    ))
    .join("");

  return `<teams c='${Number(count || 0)}' p='${Number(page || 1)}'>${body}</teams>`;
}

function renderTeamTransactionsXml(transactions = []) {
  const body = transactions
    .map((entry) => (
      `<tr d='${escapeXmlAttribute(entry?.date || "")}' t='${Number(entry?.type || 0)}' ` +
      `u='${escapeXmlAttribute(entry?.username || "")}' a='${Math.abs(Number(entry?.amount || 0))}'/>`
    ))
    .join("");

  return `<transactions><r>${body}</r></transactions>`;
}

function renderTeamApplicationsXml(applications = []) {
  const body = applications
    .map((application) => (
      `<a i='${Number(application?.applicantPublicId || application?.applicantAccountId || 0)}' ` +
      `u='${escapeXmlAttribute(application?.applicantName || "")}' ` +
      `sc='${Number(application?.applicantScore || 0)}' et='0' ` +
      `s='${escapeXmlAttribute(application?.status || "Pending")}' ` +
      `n='${escapeXmlAttribute(application?.comment || "")}'/>`
    ))
    .join("");

  return `<apps>${body}</apps>`;
}

function renderMyTeamApplicationsXml(applications = []) {
  const body = applications
    .map((application) => (
      `<a ti='${Number(application?.teamId || 0)}' tn='${escapeXmlAttribute(application?.teamName || "")}' ` +
      `sc='${Number(application?.teamScore || 0)}' ` +
      `s='${escapeXmlAttribute(application?.status || "Pending")}' ` +
      `n='${escapeXmlAttribute(application?.comment || "")}'/>`
    ))
    .join("");

  return `<apps>${body}</apps>`;
}

function teamActionAmount(params) {
  const explicit = Number(params.get("amount") || params.get("a") || params.get("m") || 0);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.floor(explicit);
  }

  return Math.floor(firstNumericParam(
    params,
    ["value", "v"],
    ["action", "aid", "sk", "tid", "pn", "st"],
  ));
}

async function resolveSessionTeamAccess({ store, session, params, requireMembership = false }) {
  const requestedTeamIds = parseTeamIds(params);
  const accountId = session?.account?.id || (requireMembership ? 0 : Number(params.get("aid") || 0) || 0);
  const teamContext = accountId
    ? await store.getTeamForAccount(accountId)
    : { account: null, team: null, member: null };
  const currentTeamId = Number(teamContext.team?.id || 0);

  if (session && teamContext.account) {
    session.account = teamContext.account;
  }

  if (requestedTeamIds.length > 0) {
    const teamIds = requireMembership
      ? requestedTeamIds.filter((teamId) => teamId === currentTeamId)
      : requestedTeamIds;

    return {
      ...teamContext,
      accountId,
      currentTeamId,
      requestedTeamIds,
      teamIds,
      deniedTeamIds: requestedTeamIds.filter((teamId) => !teamIds.includes(teamId)),
    };
  }

  return {
    ...teamContext,
    accountId,
    currentTeamId,
    requestedTeamIds,
    teamIds: currentTeamId ? [currentTeamId] : [],
    deniedTeamIds: [],
  };
}

async function handleTeamInfo(context, options = {}) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const access = await resolveSessionTeamAccess({
    store,
    session,
    params,
    requireMembership: options.requireMembership ?? false,
  });
  const teams = access.teamIds.length > 0 ? await store.getTeamsByIds(access.teamIds) : [];
  const servedTeamIds = new Set(teams.map((team) => Number(team?.id || 0)));
  const missingTeamIds = !options.statusOnEmpty && access.requestedTeamIds.length > 0
    ? access.requestedTeamIds.filter((teamId) => !servedTeamIds.has(Number(teamId || 0)))
    : [];
  const sourceAction = options.sourceAction || "teaminfo";
  const sourceState = teams.length > 0 || missingTeamIds.length > 0
    ? ""
    : access.deniedTeamIds.length > 0 ? ":denied" : ":none";

  logger.info("Local team info served", {
    accountId: access.accountId,
    teamIds: access.teamIds,
    requestedTeamIds: access.requestedTeamIds,
    currentTeamId: access.currentTeamId,
    deniedTeamIds: access.deniedTeamIds,
    missingTeamIds,
    served: teams.length,
  });

  return {
    body: teams.length > 0 || missingTeamIds.length > 0 || !options.statusOnEmpty
      ? successData(renderTeamsXml(teams, { missingTeamIds }))
      : statusBody(0),
    source: `local:${sourceAction}${sourceState}`,
  };
}

async function handleGetTeamInfo(context) {
  return handleTeamInfo(context, {
    requireMembership: false,
    statusOnEmpty: true,
    sourceAction: "getteaminfo",
  });
}

async function handleTeamSearch(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const searchTerm = params.get("st") || params.get("tn") || params.get("n") || params.get("name") || "";
  const page = Number(params.get("pn") || params.get("p") || 1);
  const result = await store.searchTeams(searchTerm, { page, pageSize: 20 });

  logger.info("Local team search served", {
    accountId: session?.account?.id || Number(params.get("aid") || 0) || 0,
    searchTerm,
    page: result.page,
    count: result.count,
    returned: result.teams.length,
  });

  return {
    body: successData(renderTeamSearchXml(result.teams, result)),
    source: "local:teamsearch",
  };
}

async function handleTeamTransactions(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const access = await resolveSessionTeamAccess({
    store,
    session,
    params,
    requireMembership: true,
  });
  const teamId = Number(access.teamIds[0] || 0);
  if (!teamId) {
    logger.info("Local team transactions denied", {
      accountId: access.accountId,
      requestedTeamIds: access.requestedTeamIds,
      currentTeamId: access.currentTeamId,
      deniedTeamIds: access.deniedTeamIds,
    });
    return {
      body: statusBody(0),
      source: access.deniedTeamIds.length > 0 ? "local:teamtrans:denied" : "local:teamtrans:none",
    };
  }

  const result = await store.getTeamTransactions({
    accountId: access.accountId,
    teamId,
  });

  logger.info("Local team transactions served", {
    accountId: access.accountId,
    teamId: result.team?.id || teamId || 0,
    count: result.transactions.length,
  });

  return {
    body: successData(renderTeamTransactionsXml(result.transactions)),
    source: "local:teamtrans",
  };
}

async function handleTeamCreate(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: statusBody(-100),
      source: "local:teamcreate:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.createTeam({
    accountId: session.account.id,
    name: params.get("n") || params.get("name") || params.get("tn") || "",
  });

  if (!result.ok) {
    logger.warn("Local team creation rejected", {
      accountId: session.account.id,
      username: session.account.username,
      reason: result.reason || "unknown",
    });
    return {
      body: statusBody(result.code || 0),
      source: `local:teamcreate:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  logger.info("Local team created", {
    accountId: result.account.id,
    username: result.account.username,
    teamId: result.team.id,
    teamName: result.team.name,
  });

  return {
    body: `"s", 1, "id", ${Number(result.team.id || 0)}`,
    source: "local:teamcreate",
  };
}

async function handleTeamDeposit(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: statusBody(-100),
      source: "local:teamdeposit:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.depositTeamFunds({
    accountId: session.account.id,
    amount: teamActionAmount(params),
  });

  if (!result.ok) {
    logger.warn("Local team deposit rejected", {
      accountId: session.account.id,
      username: session.account.username,
      reason: result.reason || "unknown",
    });
    return {
      body: `"s", ${Number(result.code || 0)}, "b", ${Number(result.balance ?? session.account.money ?? 0)}`,
      source: `local:teamdeposit:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  logger.info("Local team deposit saved", {
    accountId: result.account.id,
    username: result.account.username,
    teamId: result.team.id,
    amount: result.amount,
    balance: result.balance,
    teamFund: result.team.teamFund,
  });

  return {
    body: `"s", 1, "b", ${Number(result.balance || 0)}`,
    source: "local:teamdeposit",
  };
}

async function handleTeamWithdraw(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: statusBody(-100),
      source: "local:teamwithdraw:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.withdrawTeamFunds({
    accountId: session.account.id,
    amount: teamActionAmount(params),
  });

  if (!result.ok) {
    logger.warn("Local team withdrawal rejected", {
      accountId: session.account.id,
      username: session.account.username,
      reason: result.reason || "unknown",
    });
    return {
      body: `"s", ${Number(result.code || 0)}, "b", ${Number(result.balance ?? session.account.money ?? 0)}`,
      source: `local:teamwithdraw:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  logger.info("Local team withdrawal saved", {
    accountId: result.account.id,
    username: result.account.username,
    teamId: result.team.id,
    amount: result.amount,
    balance: result.balance,
    teamFund: result.team.teamFund,
  });

  return {
    body: `"s", 1, "b", ${Number(result.balance || 0)}`,
    source: "local:teamwithdraw",
  };
}

async function handleGetAllTeamApplications(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const access = await resolveSessionTeamAccess({
    store,
    session,
    params,
    requireMembership: true,
  });
  const teamId = Number(access.teamIds[0] || 0);

  if (!teamId) {
    logger.info("Local team applications denied", {
      accountId: access.accountId,
      requestedTeamIds: access.requestedTeamIds,
      currentTeamId: access.currentTeamId,
      deniedTeamIds: access.deniedTeamIds,
    });
    return {
      body: statusBody(0),
      source: access.deniedTeamIds.length > 0 ? "local:getallteamapps:denied" : "local:getallteamapps:none",
    };
  }

  const applications = await store.listTeamApplications({ teamId });

  if (!applications.length) {
    return {
      body: statusBody(0),
      source: "local:getallteamapps:none",
    };
  }

  return {
    body: successData(renderTeamApplicationsXml(applications)),
    source: "local:getallteamapps",
  };
}

async function handleGetAllMyTeamApplications(context) {
  const { config, params } = context;
  const session = getLocalSession(params.get("sk"));
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const applications = await store.listMyTeamApplications({
    accountId: session?.account?.id || Number(params.get("aid") || 0) || 0,
  });

  if (!applications.length) {
    return {
      body: statusBody(0),
      source: "local:getallmyapps:none",
    };
  }

  return {
    body: successData(renderMyTeamApplicationsXml(applications)),
    source: "local:getallmyapps",
  };
}

async function handleAddTeamApplication(context) {
  const { config, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: statusBody(-100),
      source: "local:addteamapp:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.addTeamApplication({
    accountId: session.account.id,
    teamId: Number(params.get("tid") || 0),
    comment: params.get("c") || params.get("n") || "",
  });

  return {
    body: statusBody(result.ok ? 1 : result.code || 0),
    source: result.ok ? "local:addteamapp" : `local:addteamapp:${result.reason || "rejected"}`,
  };
}

async function handleDeleteTeamApplication(context) {
  const { config, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: statusBody(-100),
      source: "local:deleteapp:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.deleteTeamApplication({
    accountId: session.account.id,
    teamId: Number(params.get("tid") || 0),
  });

  return {
    body: statusBody(result.ok ? 1 : result.code || 0),
    source: result.ok ? "local:deleteapp" : `local:deleteapp:${result.reason || "rejected"}`,
  };
}

async function handleUpdateTeamApplication(context) {
  const { config, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: statusBody(-100),
      source: "local:updateteamapp:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.updateTeamApplication({
    accountId: session.account.id,
    teamId: Number(params.get("tid") || 0),
    applicantAccountId: Number(params.get("aaid") || params.get("aidtk") || params.get("uid") || 0),
    response: Number(params.get("r") || 0),
  });

  return {
    body: statusBody(result.ok ? 1 : result.code || 0),
    source: result.ok ? "local:updateteamapp" : `local:updateteamapp:${result.reason || "rejected"}`,
  };
}

async function handleUpdateLeaderComments(context) {
  const { config, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: statusBody(-100),
      source: "local:updateleadercomments:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.updateTeamLeaderComments({
    accountId: session.account.id,
    comments: params.get("lc") || params.get("c") || "",
  });

  return {
    body: statusBody(result.ok ? 1 : result.code || 0),
    source: result.ok ? "local:updateleadercomments" : `local:updateleadercomments:${result.reason || "rejected"}`,
  };
}

async function handleUpdateTeamRequirements(context) {
  const { config, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: statusBody(-100),
      source: "local:updateteamreq:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.updateTeamRequirements({
    accountId: session.account.id,
    recruitmentType: params.get("rt") || params.get("r") || params.get("type") || "",
    requirements: params.get("req") || params.get("n") || params.get("c") || "",
  });

  return {
    body: statusBody(result.ok ? 1 : result.code || 0),
    source: result.ok ? "local:updateteamreq" : `local:updateteamreq:${result.reason || "rejected"}`,
  };
}

async function handleSetTeamColor(context) {
  const { config, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: statusBody(-100),
      source: "local:setteamcolor:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.setTeamColor({
    accountId: session.account.id,
    color: params.get("bg") || params.get("c") || params.get("color") || "",
  });

  return {
    body: statusBody(result.ok ? 1 : result.code || 0),
    source: result.ok ? "local:setteamcolor" : `local:setteamcolor:${result.reason || "rejected"}`,
  };
}

async function handleGetUser(context) {
  const session = getLocalSession(context.params.get("sk"));
  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const targetAccountId = Number(context.params.get("tid") || context.params.get("uid") || context.params.get("id") || session?.account?.id || 0);
  const account = await store.findById(targetAccountId)
    || tournamentBotSyntheticAccount(targetAccountId, accountLocationId(session?.account));

  if (!account) {
    context.logger.warn("Local user profile request rejected because target account was not found", {
      requesterAccountId: session?.account?.id || 0,
      targetAccountId,
    });

    return {
      body: statusBody(0),
      source: "local:getuser:not-found",
    };
  }

  const xml = (
    "<n2>" +
    renderPublicUserXml(account) +
    "</n2>"
  );
  context.logger.info("Local user profile served", {
    accountId: session?.account?.id || 0,
    targetAccountId: account.id,
    targetUsername: account.username,
    xml,
  });

  return {
    body: successData(xml),
    source: "local:getuser",
  };
}

async function handleGetUsers(context) {
  const session = getLocalSession(context.params.get("sk"));
  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const accountIds = String(context.params.get("aids") || context.params.get("tids") || context.params.get("tid") || "")
    .split(",")
    .map((accountId) => Number(accountId.trim()))
    .filter((accountId) => Number.isInteger(accountId) && accountId > 0);
  const accounts = [];

  for (const accountId of accountIds) {
    const account = await store.findById(accountId)
      || tournamentBotSyntheticAccount(accountId, accountLocationId(session?.account));
    if (account) {
      accounts.push(account);
    }
  }

  context.logger.info("Local users served", {
    accountId: session?.account?.id || 0,
    requestedAccountIds: accountIds,
    requested: accountIds.length,
    served: accounts.length,
    servedUsers: accounts.map((account) => ({
      accountId: Number(account.id || 0),
      username: account.username || "",
    })),
  });

  return {
    body: successData(`<n2>${accounts.map(renderPublicUserXml).join("")}</n2>`),
    source: "local:getusers",
  };
}

async function handleRacerSearch(context) {
  const session = getLocalSession(context.params.get("sk"));
  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const searchTerm = context.params.get("st") || context.params.get("u") || context.params.get("un") || context.params.get("username") || "";
  const page = Number(context.params.get("pn") || 1);
  const result = await store.searchAccounts(searchTerm, { page, pageSize: 20 });

  context.logger.info("Local racer search served", {
    accountId: session?.account?.id || 0,
    searchTerm,
    page: result.page,
    count: result.count,
    returned: result.accounts.length,
  });

  return {
    body: successData(renderRacerSearchXml(result.accounts, result)),
    source: "local:racersearch",
  };
}

async function handleGetAllCats(context) {
  const session = getLocalSession(context.params.get("sk"));
  const selectedCar = selectedGarageCarForCatalog(session?.account, context.params);
  const catalog = await buildPartsCatalog({
    projectRoot: context.config.projectRoot,
    dataRoot: context.config.dataRoot,
    assetRoot: context.config.assetRoot,
    catalogCarId: selectedCar?.catalogCarId || 0,
  });

  if (!catalog.metadata?.partsListSourcePath) {
    context.logger.warn("Parts list data source missing; generated exterior parts only will be available", {
      partsListSourcePath: catalog.metadata.partsListSourcePath || "<missing>",
      masterCatalogSourcePath: catalog.metadata.masterCatalogSourcePath || "<missing>",
      missingPartsListCandidates: catalog.metadata.missingPartsListCandidates,
      missingMasterCatalogCandidates: catalog.metadata.missingMasterCatalogCandidates,
    });
  }

  const graphicsShopRequest = isGraphicsShopCatalogRequest(context.params);
  const categoryXml = graphicsShopRequest
    ? buildGraphicsOnlyCategoryXml(catalog.parts)
    : catalog.categoryXml;

  context.logger.info("Local part categories served", {
    categoryBytes: categoryXml.length,
    categorySource: catalog.metadata?.categorySource || "unknown",
    graphicsShopRequest,
    request: catalogRequestLogFields(context.params),
    partsListSourcePath: catalog.metadata?.partsListSourcePath || "<missing>",
    masterCatalogSourcePath: catalog.metadata?.masterCatalogSourcePath || "<missing>",
  });

  return {
    body: successData(categoryXml),
    source: graphicsShopRequest ? "local:getallcats:graphics" : "local:getallcats",
  };
}

async function handleGetAllCars(context) {
  const session = getLocalSession(context.params.get("sk"));

  if (!session) {
    context.logger.warn("Local garage request rejected because session was not found", {
      accountId: context.params.get("aid") || "<empty>",
      hasSessionKey: Boolean(context.params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:getallcars:missing-session",
    };
  }

  context.logger.info("Local garage served", {
    accountId: session.account.id,
    username: session.account.username,
    starterCar: session.account.starterCar,
  });

  return {
    body: successData(buildGarageXml(session.account)),
    source: "local:getallcars",
  };
}

async function handleGetOneCar(context) {
  const session = getLocalSession(context.params.get("sk"));

  if (!session) {
    context.logger.warn("Local one-car request rejected because session was not found", {
      accountId: context.params.get("aid") || "<empty>",
      hasSessionKey: Boolean(context.params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:getonecar:missing-session",
    };
  }

  const accountCarId = Number(context.params.get("acid") || context.params.get("cid") || context.params.get("i") || 0);
  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const freshAccount = await store.findById(session.account.id);
  if (freshAccount) {
    session.account = freshAccount;
  }

  const car = findAccountGarageCar(session.account, accountCarId)
    || selectedGarageCarForCatalog(session.account, context.params);

  if (!car) {
    context.logger.warn("Local one-car request rejected because car was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
    });
    return {
      body: statusBody(0),
      source: "local:getonecar:no-car",
    };
  }

  const carXml = `<n>${renderOwnedGarageCarXml(session.account, car, { selected: true })}</n>`;
  context.logger.info("Local one-car garage XML served", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId: car.accountCarId,
    bytes: carXml.length,
  });

  return {
    body: successData(carXml),
    source: "local:getonecar",
  };
}

async function handleGetAllOtherUserCars(context) {
  const session = getLocalSession(context.params.get("sk"));
  const targetAccountId = Number(context.params.get("tid") || context.params.get("uid") || context.params.get("id") || 0);
  const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
  const account = await store.findById(targetAccountId)
    || tournamentBotSyntheticAccount(targetAccountId, accountLocationId(session?.account));

  if (!session) {
    context.logger.warn("Other user garage request rejected because session was not found", {
      targetAccountId,
      hasSessionKey: Boolean(context.params.get("sk")),
    });
    return {
      body: statusBody(0),
      source: "local:getallotherusercars:missing-session",
    };
  }

  if (!account) {
    context.logger.warn("Other user garage request rejected because target account was not found", {
      accountId: session.account.id,
      username: session.account.username,
      targetAccountId,
    });
    return {
      body: statusBody(0),
      source: "local:getallotherusercars:not-found",
    };
  }

  context.logger.info("Other user garage served", {
    accountId: session.account.id,
    username: session.account.username,
    targetAccountId: account.id,
    targetUsername: account.username,
    carCount: accountGarageCars(account).length,
  });

  return {
    body: successData(renderOtherUserCarsXml(account)),
    source: "local:getallotherusercars",
  };
}

async function handleGetAllWheelsTires(context) {
  const session = getLocalSession(context.params.get("sk"));

  if (!session) {
    context.logger.warn("Local wheels and tires request rejected because session was not found", {
      accountId: context.params.get("aid") || "<empty>",
      hasSessionKey: Boolean(context.params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:getallwheelstires:missing-session",
    };
  }

  const catalog = await buildWheelsTiresCatalog({
    assetRoot: context.config.assetRoot,
    dataRoot: context.config.dataRoot,
  });

  context.logger.info("Local wheels and tires catalog served", {
    accountId: session.account.id,
    username: session.account.username,
    wheels: catalog.wheelCount,
    tires: catalog.tireCount,
    designs: catalog.designCount,
  });

  return {
    body: successData(catalog.xml),
    source: "local:getallwheelstires",
  };
}

async function handleGetAllParts(context) {
  const session = getLocalSession(context.params.get("sk"));

  if (!session) {
    context.logger.warn("Local parts request rejected because session was not found", {
      accountId: context.params.get("aid") || "<empty>",
      hasSessionKey: Boolean(context.params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:getallparts:missing-session",
    };
  }

  const catalog = await buildPartsCatalog({
    projectRoot: context.config.projectRoot,
    dataRoot: context.config.dataRoot,
    assetRoot: context.config.assetRoot,
    catalogCarId: selectedGarageCarForCatalog(session.account, context.params)?.catalogCarId || 0,
  });

  const graphicsShopRequest = isGraphicsShopCatalogRequest(context.params);
  const shopParts = graphicsShopRequest
    ? filterPartsForGraphicsShop(catalog.parts)
    : catalog.parts;
  const partsXml = graphicsShopRequest
    ? buildPartsXml(shopParts)
    : catalog.xml;

  context.logger.info("Local parts catalog served", {
    accountId: session.account.id,
    username: session.account.username,
    parts: shopParts.length,
    categorySource: catalog.metadata?.categorySource || "unknown",
    graphicsShopRequest,
    request: catalogRequestLogFields(context.params),
    partsListSourcePath: catalog.metadata?.partsListSourcePath || "<missing>",
    masterCatalogSourcePath: catalog.metadata?.masterCatalogSourcePath || "<missing>",
  });

  return {
    body: `"s", 1, "d", "${quoteLingoString(partsXml)}", "d1", "${quoteLingoString("<n2></n2>")}"`,
    source: graphicsShopRequest ? "local:getallparts:graphics" : "local:getallparts",
  };
}

function catalogRequestLogFields(params) {
  const visibleKeys = ["aid", "cid", "acid", "carid", "lid", "l", "m", "pi", "pcid", "cat", "category", "store", "st", "t"];
  return Object.fromEntries(
    visibleKeys
      .map((key) => [key, params.get(key)])
      .filter(([, value]) => value !== null && value !== ""),
  );
}

async function handleGetPartGroup(context) {
  const session = getLocalSession(context.params.get("sk"));

  if (!session) {
    context.logger.warn("Local part group request rejected because session was not found", {
      accountId: context.params.get("aid") || "<empty>",
      hasSessionKey: Boolean(context.params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:getpartgroup:missing-session",
    };
  }

  const xml = buildGraphicsPartGroupXml();
  context.logger.info("Local graphics part group served", {
    accountId: session.account.id,
    username: session.account.username,
    request: catalogRequestLogFields(context.params),
    bytes: xml.length,
  });

  return {
    body: successData(xml),
    source: "local:getpartgroup:graphics",
  };
}

async function handleGetCarPartsBin(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local car parts bin request rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:getcarpartsbin:missing-session",
    };
  }

  const accountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || 0);
  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const catalogCarId = findAccountGarageCar(session.account, accountCarId)?.catalogCarId || selectedCar?.catalogCarId || 0;
  const catalog = await buildPartsCatalogForGarage(config, catalogCarId);
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.getCarPartsBin({
    accountId: session.account.id,
    accountCarId,
    partsById: catalog.partsById,
  });

  if (!result.ok) {
    logger.warn("Local car parts bin request rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      reason: result.reason || "unknown",
    });
    return {
      body: statusBody(result.code || 0),
      source: `local:getcarpartsbin:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  logger.info("Local car parts bin served", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId,
    catalogCarId: result.car.catalogCarId,
    installedParts: result.installedCount,
    spareParts: result.spareCount,
    wheelsTiresParts: catalog.wheelsTiresPartCount,
  });

  return {
    body: successData(result.xml),
    source: "local:getcarpartsbin",
  };
}

async function handleGetInstalledEnginePartsByAccountCar(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local installed engine parts request rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:getinstalledenginepartbyaccountcar:missing-session",
    };
  }

  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const accountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || selectedCar?.accountCarId || 0);
  const targetCar = findAccountGarageCar(session.account, accountCarId) || selectedCar;

  if (!targetCar) {
    logger.warn("Local installed engine parts request rejected because car was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
    });
    return {
      body: statusBody(0),
      source: "local:getinstalledenginepartbyaccountcar:no-car",
    };
  }

  const catalog = await buildPartsCatalogForGarage(config, targetCar.catalogCarId);
  const xml = renderInstalledEnginePartsXml(targetCar, catalog.partsById);
  logger.info("Local installed engine parts served", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId: targetCar.accountCarId,
    catalogCarId: targetCar.catalogCarId,
    enginePartBytes: xml.length,
    hasAdjustableAirFuelController: /afm='controller'|aft='2'/.test(xml),
    airFuelControllerSlot: /ci='19'/.test(xml),
  });

  return {
    body: successData(xml),
    source: "local:getinstalledenginepartbyaccountcar",
  };
}

async function handleGetPartsBin(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local spare parts bin request rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:getpartsbin:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const catalog = await buildPartsCatalogForGarage(config, selectedCar?.catalogCarId || 0);
  const result = await store.getPartsBin({
    accountId: session.account.id,
    partsById: catalog.partsById,
  });

  if (!result.ok) {
    logger.warn("Local spare parts bin request rejected", {
      accountId: session.account.id,
      username: session.account.username,
      reason: result.reason || "unknown",
    });
    return {
      body: statusBody(result.code || 0),
      source: `local:getpartsbin:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  logger.info("Local spare parts bin served", {
    accountId: session.account.id,
    username: session.account.username,
    spareParts: result.spareCount,
    wheelsTiresParts: catalog.wheelsTiresPartCount,
  });

  return {
    body: successData(result.xml),
    source: "local:getpartsbin",
  };
}

async function handleGetSystemParts(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local system parts request rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: successData("<r s='0'/>"),
      source: "local:getsystemparts:missing-session",
    };
  }

  const accountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || 0);
  const engineTypeId = Number(params.get("etid") || 0);
  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const catalogCarId = findAccountGarageCar(session.account, accountCarId)?.catalogCarId || selectedCar?.catalogCarId || 0;
  const catalog = await buildPartsCatalog({
    projectRoot: config.projectRoot,
    dataRoot: config.dataRoot,
    assetRoot: config.assetRoot,
    catalogCarId,
  });
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.getSystemParts({
    accountId: session.account.id,
    accountCarId,
    engineTypeId,
    partsById: catalog.partsById,
  });

  if (!result.ok) {
    logger.warn("Local system parts request rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      engineTypeId,
      reason: result.reason || "unknown",
    });
    return {
      body: successData("<r s='0'/>"),
      source: `local:getsystemparts:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  logger.info("Local system parts served", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId: result.car.accountCarId,
    catalogCarId: result.car.catalogCarId,
    engineTypeId,
  });

  return {
    body: successData(result.xml),
    source: "local:getsystemparts",
  };
}

function createInstalledPartId() {
  return Math.floor(Date.now() % 1000000000);
}

function customGraphicSlotIdForPurchase(params, partId, catalogPart) {
  const rawSlotId = Number(params.get("ci") || params.get("pi") || catalogPart?.ci || catalogPart?.pi || 0);
  return graphicSlotForPartId(partId)
    || getCustomGraphicSlotIdForField(params.get("slot") || params.get("field") || params.get("n") || "")
    || graphicSlotConfig(rawSlotId)?.slotId
    || 0;
}

function customGraphicDecalIdParam(params, slotId) {
  const config = graphicSlotConfig(slotId);
  const slotDecalId = config ? params.get(config.shortKey) : "";
  return String(
    params.get("did")
      || params.get("decalId")
      || params.get("di")
      || params.get("pdi")
      || slotDecalId
      || "",
  ).replace(/[^0-9]/g, "");
}

function customGraphicFileExtParam(params, slotId) {
  const config = graphicSlotConfig(slotId);
  const slotFileExt = config ? params.get(`${config.shortKey}x`) : "";
  return normalizeUserGraphicFileExt(
    params.get("fx")
      || params.get("fe")
      || params.get("ext")
      || slotFileExt
      || "png",
  );
}

function buyPartStatusForPayment(paymentType) {
  return String(paymentType || "").toLowerCase() === "p" ? 1 : 2;
}

function buildBuyPartResponseBody({ status, balance = 0, installId = 0 }) {
  const purchaseXml = `<r s='${Number(status) || 0}' b='${Number(balance) || 0}' ai='${Number(installId) || 0}'/>`;
  const installXml = Number(status) > 0
    ? `<r s='${Number(status)}' b='${Number(balance) || 0}'/>`
    : `<r s='${Number(status) || 0}'/>`;

  return `"s", 1, "d1", "${quoteLingoString(purchaseXml)}", "d", "${quoteLingoString(installXml)}"`;
}

function buildBuyCarResponseBody({ status, balance = 0, carXml = "" }) {
  const normalizedStatus = Number(status) || 0;
  const normalizedBalance = Number(balance) || 0;

  return `"s", ${normalizedStatus}, "b", ${normalizedBalance}, "d", "${quoteLingoString(carXml)}", "m", ${normalizedBalance}`;
}

function classifiedListingIdParam(params) {
  return Number(
    params.get("cid")
      || params.get("classifiedID")
      || params.get("classifiedId")
      || params.get("lid")
      || params.get("listing_id")
      || params.get("listingId")
      || params.get("id")
      || params.get("i")
      || 0,
  );
}

function classifiedCatalogCarIdParam(params) {
  const value = Number(
    params.get("catalogCarId")
      || params.get("carId")
      || params.get("modelId")
      || params.get("ci")
      || params.get("cid")
      || 0,
  );

  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeUsedCarBoostType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "0" || normalized === "all" || normalized === "any") {
    return "";
  }

  if (["1", "n", "na", "nat", "natural", "naturally aspirated", "naturally-aspirated"].includes(normalized)) {
    return "N";
  }

  if (["2", "t", "tc", "turbo", "turbocharged"].includes(normalized)) {
    return "T";
  }

  if (["3", "s", "sc", "super", "supercharged", "supercharger"].includes(normalized)) {
    return "S";
  }

  return "";
}

function classifiedEngineTypeParam(params) {
  return normalizeUsedCarBoostType(
    params.get("engineType")
      || params.get("engine")
      || params.get("boostType")
      || params.get("bt")
      || params.get("et")
      || params.get("eti")
      || "",
  );
}

function usedCarCurrencyType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "p" || normalized === "point" || normalized === "points" ? "points" : "money";
}

function usedCarStatusCode(status) {
  switch (String(status || "active").toLowerCase()) {
    case "active":
      return 1;
    case "expired":
      return 2;
    case "sold":
      return 3;
    case "traded":
      return 4;
    case "cancelled":
    case "canceled":
    case "retracted":
      return 5;
    case "pending":
      return 6;
    default:
      return 1;
  }
}

function usedCarErrorMessage(reason) {
  switch (reason) {
    case "missing-session":
      return "Your session has expired. Please log in again.";
    case "account-not-found":
    case "buyer-not-found":
      return "Your account could not be found.";
    case "car-not-found":
      return "This car could not be found.";
    case "only-car":
      return "You cannot list your only car.";
    case "test-drive":
      return "Test drive cars cannot be listed.";
    case "invalid-price":
      return "Please enter a valid sale price.";
    case "listing-expired":
      return "This listing has expired.";
    case "listing-not-found":
      return "This listing could not be found.";
    case "seller-car-not-found":
      return "The seller no longer has this car.";
    case "self-purchase":
      return "You cannot buy your own listing.";
    case "self-trade":
      return "You cannot trade with your own listing.";
    case "offered-listing-not-owned":
      return "The offered listing must belong to you.";
    case "trades-disabled":
      return "That listing is not accepting trade offers.";
    case "trade-not-found":
      return "That trade offer could not be found.";
    case "insufficient-points":
      return "You do not have enough points for this purchase.";
    case "insufficient-money":
      return "You do not have enough money for this purchase.";
    case "private-password":
      return "The private listing password is incorrect.";
    case "car-listed":
      return "This car is currently listed in Used Cars.";
    default:
      return "The used car request could not be completed.";
  }
}

function usedCarDialogXml({ listingId = 0, accountCarId = 0, idValue, balance = 0, error = "" } = {}) {
  const attrs = {
    i: Number((idValue ?? listingId) || accountCarId || 0),
    cid: Number(listingId || 0),
    acid: Number(accountCarId || 0),
    ub: Number(balance || 0),
    e: error,
  };
  const attrXml = Object.entries(attrs)
    .map(([key, value]) => `${key}='${escapeXmlAttribute(value)}'`)
    .join(" ");

  return `<n2 ${attrXml}/>`;
}

function buildUsedCarDialogBody({ status, xml }) {
  return `"s", ${Number(status) || 0}, "d", "${quoteLingoString(xml)}"`;
}

function usedCarExpiryLabel(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) {
    return "";
  }

  return new Date(time).toISOString().slice(0, 10);
}

function listedCarRaceBlocked(car) {
  return Number(car?.usedCarListingId || car?.lk || 0) > 0;
}

function usedCarBoostTypeId(boostType) {
  switch (boostType) {
    case "T":
      return 2;
    case "S":
      return 3;
    case "N":
    default:
      return 1;
  }
}

function usedCarBoostTypeLabel(boostType) {
  switch (boostType) {
    case "T":
      return "TC";
    case "S":
      return "SC";
    case "N":
    default:
      return "NA";
  }
}

function dynoSampledTorqueCurve(torqueCurve = []) {
  return torqueCurve.filter((value, index) => index % 4 === 0 && Number.isFinite(Number(value)));
}

function maxNumericValue(values = []) {
  return values.reduce((highest, value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(highest, numeric) : highest;
  }, 0);
}

function peakHorsepowerFromTorqueCurve(torqueCurve = []) {
  return torqueCurve.reduce((highest, torque, sampleIndex) => {
    const numericTorque = Number(torque);
    if (!Number.isFinite(numericTorque)) {
      return highest;
    }

    const rpm = sampleIndex * 400;
    if (rpm <= 0) {
      return highest;
    }

    return Math.max(highest, (numericTorque * rpm) / 5252);
  }, 0);
}

function dynoDisplaySummaryFromSampledTorqueCurve(dynoTorqueCurve = [], fallback = {}) {
  const dynoHorsepower = peakHorsepowerFromTorqueCurve(dynoTorqueCurve)
    || Number(fallback.horsepower || fallback.hp || 0);
  const dynoTorque = maxNumericValue(dynoTorqueCurve)
    || Number(fallback.torque || fallback.tq || 0);

  return {
    hp: Math.round(dynoHorsepower),
    tq: Math.round(dynoTorque),
  };
}

function dynoDisplaySummaryFromTorqueCurve(torqueCurve = [], fallback = {}) {
  return dynoDisplaySummaryFromSampledTorqueCurve(
    dynoSampledTorqueCurve(torqueCurve),
    fallback,
  );
}

function clientDynoDisplaySummaryFromPerformance(performance = {}) {
  return {
    hp: Math.round(Number(performance.horsepower || performance.hp || 0)),
    tq: Math.round(Number(performance.torque || performance.tq || 0)),
  };
}

function usedCarPerformanceSummary(account, car, catalogCar) {
  try {
    const performance = calculateRacePerformance({ account, targetCar: car, catalogCar });
    const dynoDisplay = clientDynoDisplaySummaryFromPerformance(performance);
    const boostType = performance.boostType || "N";

    return {
      hp: dynoDisplay.hp,
      tq: dynoDisplay.tq,
      boostType,
      boostTypeId: usedCarBoostTypeId(boostType),
      boostTypeLabel: usedCarBoostTypeLabel(boostType),
    };
  } catch {
    const boostType = normalizeUsedCarBoostType(catalogCar?.boostType || car?.boostType || car?.engineType || car?.engineTypeId) || "N";
    return {
      hp: Number(catalogCar?.horsepower || 0),
      tq: Number(catalogCar?.torque || 0),
      boostType,
      boostTypeId: usedCarBoostTypeId(boostType),
      boostTypeLabel: usedCarBoostTypeLabel(boostType),
    };
  }
}

function setOpeningXmlAttribute(xml, key, value) {
  const source = String(xml || "");
  const openTagEnd = source.indexOf(">");
  if (openTagEnd < 0) {
    return source;
  }

  const openingTag = source.slice(0, openTagEnd);
  const rest = source.slice(openTagEnd);
  const attrPattern = new RegExp(`\\s${key}='[^']*'`);
  const replacement = ` ${key}='${escapeXmlAttribute(value)}'`;

  return attrPattern.test(openingTag)
    ? `${openingTag.replace(attrPattern, replacement)}${rest}`
    : `${openingTag}${replacement}${rest}`;
}

function renderUsedCarDetailGarageXml(account, car, performance) {
  let carXml = renderOwnedGarageCarXml(account, car);
  const displayAttrs = {
    hp: performance.hp,
    h: performance.hp,
    horsepower: performance.hp,
    whp: performance.hp,
    dhp: performance.hp,
    tq: performance.tq,
    torque: performance.tq,
    wtq: performance.tq,
    dtq: performance.tq,
  };

  for (const [key, value] of Object.entries(displayAttrs)) {
    carXml = setOpeningXmlAttribute(carXml, key, value);
  }

  return carXml;
}

function usedCarListingModelName(listing) {
  const car = listing?.car || {};
  const catalogCar = getCatalogCar(car.catalogCarId || listing?.catalogCarId) || {};

  return String(catalogCar.name || car.name || listing?.name || "").trim();
}

function sortUsedCarListingsByModel(listings = []) {
  return [...listings].sort((left, right) => {
    const modelSort = usedCarListingModelName(left).localeCompare(
      usedCarListingModelName(right),
      undefined,
      { numeric: true, sensitivity: "base" },
    );

    if (modelSort !== 0) {
      return modelSort;
    }

    return Date.parse(right.createdAt || "") - Date.parse(left.createdAt || "");
  });
}

function usedCarListingMatchesBoostType(listing, boostType) {
  if (!boostType) {
    return true;
  }

  const car = listing?.car || {};
  const account = listing?.sellerAccount || {
    id: listing?.sellerAccountId,
    username: listing?.sellerUsername || "Racer",
  };
  const catalogCar = getCatalogCar(car.catalogCarId || listing?.catalogCarId) || {};

  return usedCarPerformanceSummary(account, car, catalogCar).boostType === boostType;
}

function renderUsedCarListingXml(listing, { detail = false } = {}) {
  const car = listing?.car || {};
  const account = listing?.sellerAccount || {
    id: listing?.sellerAccountId,
    username: listing?.sellerUsername || "Racer",
  };
  const catalogCar = getCatalogCar(car.catalogCarId || listing?.catalogCarId) || {};
  const listingId = Number(listing?.id || 0);
  const accountCarId = Number(car.accountCarId || listing?.accountCarId || 0);
  const catalogCarId = Number(car.catalogCarId || listing?.catalogCarId || 0);
  const sellerAccountId = Number(account?.id || listing?.sellerAccountId || 0);
  const sellerName = account?.username || listing?.sellerUsername || "Racer";
  const price = Number(listing?.askingPrice || 0);
  const currencyType = usedCarCurrencyType(listing?.currencyType);
  const expiresAt = Date.parse(listing?.expiresAt || "");
  const allowTrades = listing?.allowTrades || listing?.tradeAllowed || listing?.tradesFlag;
  const isPrivate = String(listing?.privatePassword || "").length > 0 || listing?.privateListing;
  const statusCode = usedCarStatusCode(listing?.status);
  const performance = usedCarPerformanceSummary(account, car, catalogCar);
  const attrs = {
    id: listingId,
    i: listingId,
    lid: listingId,
    cid: catalogCarId,
    ci: catalogCarId,
    acid: accountCarId,
    aci: accountCarId,
    aid: sellerAccountId,
    sid: sellerAccountId,
    sellerId: sellerAccountId,
    sn: sellerName,
    seller: sellerName,
    u: sellerName,
    un: sellerName,
    n: catalogCar.name || car.name || "",
    c: catalogCar.name || car.name || "",
    cc: car.color || car.cc || "C0C0C0",
    pn: car.plateNumber || "",
    pi: Number(car.plateId || 1),
    "if": Number(car.impoundFee || car.impound || 0),
    pr: price,
    p: price,
    m: price,
    ct: currencyType,
    currency: currencyType,
    pp: currencyType === "points" ? price : 0,
    mp: currencyType === "money" ? price : 0,
    desc: listing?.description || "",
    exp: Number.isFinite(expiresAt) ? Math.floor(expiresAt / 1000) : 0,
    ex: usedCarExpiryLabel(listing?.expiresAt),
    s: statusCode,
    status: listing?.status || "active",
    et: performance.boostTypeId,
    eti: performance.boostTypeId,
    bt: performance.boostType,
    boostType: performance.boostTypeLabel,
    engineType: performance.boostTypeLabel,
    t: allowTrades ? 1 : 0,
    pt: Number(listing?.pendingTradeCount || 0),
    pv: isPrivate ? 1 : 0,
    sw: Number(catalogCar.weight || 0),
    hp: performance.hp,
    tq: performance.tq,
  };
  const attrXml = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}='${escapeXmlAttribute(value)}'`)
    .join(" ");

  if (!detail) {
    return `<car ${attrXml}/>`;
  }

  return `<car ${attrXml}>${renderUsedCarDetailGarageXml(account, car, performance)}<r p='0' v='0'></r></car>`;
}

function buildUsedCarListingsXml(listings, { detail = false, pageCount = 1 } = {}) {
  const carNodes = listings
    .map((listing) => renderUsedCarListingXml(listing, { detail }))
    .join("");
  const safePageCount = Math.max(1, Number(pageCount) || 1);

  return `<cars i='${listings.length}' dc='${listings.length}' c='${listings.length}' tc='${listings.length}' p='${safePageCount}'>${carNodes}</cars>`;
}

function buildUsedCarDetailXml(listing) {
  return renderUsedCarListingXml(listing, { detail: true });
}

function renderUsedCarTradeXml(trade, { direction = "outgoing" } = {}) {
  const statusCode = Number(trade?.statusCode || 1);
  const firstListing = direction === "incoming" ? trade?.targetListing : trade?.offeredListing;
  const secondListing = direction === "incoming" ? trade?.offeredListing : trade?.targetListing;

  if (!firstListing || !secondListing) {
    return "";
  }

  return `<t i='${Number(trade?.id || 0)}' s='${statusCode}'>` +
    `${renderUsedCarListingXml(firstListing)}` +
    `${renderUsedCarListingXml(secondListing)}` +
    "</t>";
}

function buildUsedCarTradesXml(trades, { direction = "outgoing" } = {}) {
  const nodes = (Array.isArray(trades) ? trades : [])
    .map((trade) => renderUsedCarTradeXml(trade, { direction }))
    .filter(Boolean)
    .join("");

  return `<trades i='${Number(trades?.length || 0)}'>${nodes}</trades>`;
}

async function pushUsedCarListUpdate(context, store, { accountIds = null } = {}) {
  const result = await store.listUsedCarListings({});
  const xml = buildUsedCarListingsXml(result.listings || []);

  context.logger.info("Local used car TCP update skipped", {
    reason: "client-ucl-packet-crash",
    targeted: accountIds !== null && accountIds !== undefined,
    accountIds: accountIds === null || accountIds === undefined
      ? null
      : [...new Set((Array.isArray(accountIds) ? accountIds : [accountIds])
        .map((accountId) => Number(accountId || 0))
        .filter((accountId) => accountId > 0))],
    listings: result.listings?.length || 0,
    bytes: xml.length,
  });
  return;

  if (accountIds !== null && accountIds !== undefined) {
    if (typeof context?.tcpServer?.sendUsedCarListUpdateToAccount !== "function") {
      return;
    }

    const targetAccountIds = [...new Set((Array.isArray(accountIds) ? accountIds : [accountIds])
      .map((accountId) => Number(accountId || 0))
      .filter((accountId) => accountId > 0))];

    for (const accountId of targetAccountIds) {
      context.tcpServer.sendUsedCarListUpdateToAccount(accountId, xml);
    }
    return;
  }

  if (typeof context?.tcpServer?.broadcastUsedCarListUpdate !== "function") {
    return;
  }

  context.tcpServer.broadcastUsedCarListUpdate(xml);
}

async function pushUsedCarSellerListingsUpdate(context, store, accountId) {
  if (typeof context?.tcpServer?.sendUsedCarListUpdateToAccount !== "function") {
    return;
  }

  const normalizedAccountId = Number(accountId || 0);
  if (!normalizedAccountId) {
    return;
  }

  const result = await store.usedCarListingHistory({ accountId: normalizedAccountId });
  if (!result.ok) {
    return;
  }

  context.tcpServer.sendUsedCarListUpdateToAccount(
    normalizedAccountId,
    buildUsedCarListingsXml(result.listings || []),
  );
}

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

function buildTwoRacersCarsXml(account, requestedCarIds) {
  const carNodes = requestedCarIds
    .map((accountCarId, index) => {
      const car = findAccountGarageCar(account, accountCarId);
      if (car) {
        return renderOwnedGarageCarXml(account, car, { selected: index === 0 });
      }

      const tournamentBot = tournamentBotForVirtualCarId(accountCarId);
      if (!tournamentBot) {
        return "";
      }

      return renderOwnedGarageCarXml(
        {
          id: tournamentBot.identity.competitorId,
          locationId: accountLocationId(account),
          username: tournamentBot.racer.username,
        },
        {
          accountCarId: tournamentBot.identity.virtualCarId,
          catalogCarId: tournamentBot.racer.catalogCarId,
          color: "FF0033",
          locationId: accountLocationId(account),
        },
        { selected: index === 0 },
      );
    })
    .filter(Boolean);

  if (carNodes.length === 1) {
    carNodes.push("<c/>");
  }

  return `<n2>${carNodes.join("")}</n2>`;
}

function accountIdParam(params, names) {
  for (const name of names) {
    const value = Number(params.get(name) || 0);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return 0;
}

function findAccountById(accounts, accountId) {
  const requestedAccountId = Number(accountId || 0);
  return accounts.find((account) => Number(account?.id || 0) === requestedAccountId) || null;
}

function inferRacerAccountIds(accounts, fallbackAccount, requestedCarIds, requestedAccountIds = []) {
  return requestedCarIds.map((accountCarId, index) => {
    const requestedAccountId = Number(requestedAccountIds[index] || 0);
    if (requestedAccountId > 0) {
      return requestedAccountId;
    }

    const matchingOwners = accounts.filter((account) => findAccountGarageCar(account, accountCarId));
    if (matchingOwners.length === 1) {
      return Number(matchingOwners[0].id || 0);
    }

    if (findAccountGarageCar(fallbackAccount, accountCarId)) {
      return Number(fallbackAccount?.id || 0);
    }

    return 0;
  });
}

function buildRacersCarsXml(accounts, fallbackAccount, requestedCarIds, requestedAccountIds = []) {
  const fallbackCar = selectedGarageCarForCatalog(fallbackAccount, new URLSearchParams());
  const normalizedCarIds = requestedCarIds.map((accountCarId, index) => {
    const parsedCarId = Number(accountCarId || 0);
    if (Number.isFinite(parsedCarId) && parsedCarId > 0) {
      return parsedCarId;
    }

    return index === 0 ? Number(fallbackCar?.accountCarId || 0) : 0;
  });

  const carNodes = normalizedCarIds
    .map((accountCarId, index) => {
      if (!accountCarId) {
        return "";
      }

      const preferredAccount = findAccountById(accounts, requestedAccountIds[index]);
      if (preferredAccount) {
        const preferredCar = findAccountGarageCar(preferredAccount, accountCarId)
          || selectedGarageCarForCatalog(preferredAccount, new URLSearchParams());
        if (preferredCar) {
          return renderOwnedGarageCarXml(preferredAccount, preferredCar, { selected: index === 0 });
        }
      }

      for (const account of accounts) {
        const car = findAccountGarageCar(account, accountCarId);
        if (car) {
          return renderOwnedGarageCarXml(account, car, { selected: index === 0 });
        }
      }

      const tournamentBot = tournamentBotForVirtualCarId(accountCarId);
      if (!tournamentBot) {
        return "";
      }

      return renderOwnedGarageCarXml(
        {
          id: tournamentBot.identity.competitorId,
          locationId: accountLocationId(fallbackAccount),
          username: tournamentBot.racer.username,
        },
        {
          accountCarId: tournamentBot.identity.virtualCarId,
          catalogCarId: tournamentBot.racer.catalogCarId,
          color: "FF0033",
          locationId: accountLocationId(fallbackAccount),
        },
        { selected: index === 0 },
      );
    })
    .filter(Boolean);

  if (carNodes.length === 1) {
    carNodes.push("<c/>");
  }

  return `<n2>${carNodes.join("")}</n2>`;
}

function describeResolvedRacerCars(accounts, requestedCarIds, requestedAccountIds = []) {
  return requestedCarIds.map((accountCarId, index) => {
    const preferredAccount = findAccountById(accounts, requestedAccountIds[index]);
    const preferredCar = preferredAccount ? findAccountGarageCar(preferredAccount, accountCarId) : null;
    const fallbackPreferredCar = preferredAccount
      ? (preferredCar || selectedGarageCarForCatalog(preferredAccount, new URLSearchParams()))
      : null;
    if (fallbackPreferredCar) {
      return {
        accountId: Number(preferredAccount.id || 0),
        username: preferredAccount.username || "",
        accountCarId: Number(fallbackPreferredCar.accountCarId || 0),
        catalogCarId: Number(fallbackPreferredCar.catalogCarId || 0),
      };
    }

    for (const account of accounts) {
      const car = findAccountGarageCar(account, accountCarId);
      if (car) {
        return {
          accountId: Number(account.id || 0),
          username: account.username || "",
          accountCarId: Number(car.accountCarId || 0),
          catalogCarId: Number(car.catalogCarId || 0),
        };
      }
    }

    return {
      accountId: 0,
      username: "",
      accountCarId: Number(accountCarId || 0),
      catalogCarId: 0,
    };
  });
}

function buildRaceEnginePayload(account, targetCar, { includeNitrous = true, calibrateForDyno = false } = {}) {
  const catalogCarId = Number(targetCar?.catalogCarId || targetCar?.ci || 0);
  const catalogCar = getCatalogCar(catalogCarId) || getCatalogCar(1) || {};
  const performance = calculateRacePerformance({ account, targetCar, catalogCar });
  const torqueCurve = calibrateForDyno
    ? calibrateClientDynoTorqueCurve(performance)
    : performance.torqueCurve;
  const clientDynoPerformance = { ...performance, torqueCurve };
  const ratios = performance.gearRatios;
  const cylinderCount = performance.cylinderCount;
  const valveCount = cylinderCount * 4;
  const nitrousShot = includeNitrous ? Number(performance.nitrousShot || 0) : 0;
  const nitrousRemaining = includeNitrous ? Number(performance.nitrousRemaining || 0) : 0;
  const nitrousTankSize = includeNitrous ? Number(performance.nitrousTankSize || 0) : 0;
  const xmlBoostSetting = performance.boostSetting;
  const installedPartsXml = targetCar?.partsXml || "";
  const hasShiftLightGauge = installedShiftLightCapability(installedPartsXml);
  const savedShiftLightRpm = Number(targetCar?.shiftLightRpm || 0);
  const shiftLightRpm = hasShiftLightGauge && savedShiftLightRpm > 0
    ? savedShiftLightRpm
    : performance.redlineRpm;
  const raceControlsId = installedGaugeControlsId(installedPartsXml);
  const clientDynoTorqueCurve = estimateClientDynoTorqueCurve(clientDynoPerformance);
  const clientDynoDisplay = calibrateForDyno
    ? clientDynoDisplaySummaryFromPerformance(performance)
    : dynoDisplaySummaryFromSampledTorqueCurve(clientDynoTorqueCurve, performance);
  const attrs = {
    r: performance.weight,
    v: 0,
    sl: shiftLightRpm,
    es: performance.boostType === "T" ? 2 : performance.boostType === "S" ? 3 : 1,
    sg: hasShiftLightGauge ? 1 : 0,
    rc: raceControlsId,
    tmp: 0,
    a: performance.redlineRpm,
    n: performance.redlineRpm,
    o: performance.revLimiterRpm,
    s: 0.854,
    b: 0,
    p: performance.gripCoefficient,
    c: performance.xmlStockBoost,
    e: xmlBoostSetting,
    d: performance.boostType,
    f: ratios.f,
    g: ratios.g,
    h: ratios.h,
    i: ratios.i,
    j: ratios.j,
    k: ratios.k,
    l: ratios.l,
    q: nitrousShot,
    m: nitrousRemaining,
    t: nitrousTankSize,
    u: performance.maxPsi,
    w: performance.airhpi,
    x: performance.boostFlow,
    y: performance.fuelFlowLimit,
    z: performance.overallAirFlowLimit,
    aa: cylinderCount,
    ab: valveCount,
    ac: performance.compressionLevel,
    ad: performance.chipSetting,
    afm: performance.chipSetting,
    aft: performance.airFuelMeterCapability,
    ae: 100,
    af: 100,
    ag: 100,
    ah: 100,
    ai: 100,
    aj: 0,
    ak: 0,
    al: 0,
    am: 0,
    an: 0,
    ao: 100,
    ap: 0,
    aq: 0,
    ar: performance.tireStick,
    as: performance.tractionControl ? 1 : 0,
    at: 100,
    au: 100,
    av: 0,
    aw: 100,
    ax: 0,
    hp: performance.horsepower,
    tq: performance.torque,
    acid: Number(targetCar?.accountCarId || targetCar?.i || 0),
    cid: catalogCarId,
    aid: Number(account?.id || 0),
  };
  const attrXml = Object.entries(attrs)
    .map(([key, value]) => `${key}='${escapeXmlAttribute(value)}'`)
    .join(" ");

  return {
    raceXml: `<n2 ${attrXml}/>`,
    torqueCurve,
    clientDynoTorqueCurve,
    clientDynoDisplay,
    clientDynoHorsepower: clientDynoDisplay.hp,
    clientDynoTorque: clientDynoDisplay.tq,
    staticHorsepower: performance.horsepower,
    staticTorque: performance.torque,
    tirePartId: performance.tirePartId,
    tireStick: performance.tireStick,
    gripCoefficient: performance.gripCoefficient,
    tractionControl: performance.tractionControl,
    shiftLight: hasShiftLightGauge,
    shiftLightRpm,
    raceControlsId,
    boostType: performance.boostType,
    boostSource: performance.boostSource,
    stockBoost: performance.stockBoost,
    xmlStockBoost: performance.xmlStockBoost,
    boostSetting: performance.boostSetting,
    effectiveBoostSetting: performance.effectiveBoostSetting,
    xmlBoostSetting,
    maxPsi: performance.maxPsi,
    boostEffectScale: performance.boostEffectScale,
    boostFlow: performance.boostFlow,
    gearRatios: performance.gearRatios,
    defaultGearRatios: performance.defaultGearRatios,
    nitrousShot,
    nitrousRemaining,
    nitrousTankSize,
    airDemand: performance.airDemand,
    overallAirFlowLimit: performance.overallAirFlowLimit,
    fuelFlowLimit: performance.fuelFlowLimit,
    chipSetting: performance.chipSetting,
    airFuelMeterCapability: performance.airFuelMeterCapability,
    airflowBonus: performance.airflowBonus,
    fuelBonus: performance.fuelBonus,
    tuneBonus: performance.tuneBonus,
    compressionRatio: performance.compressionRatio,
    compressionLevel: performance.compressionLevel,
    compressionDelta: performance.compressionDelta,
    compressionMultiplier: performance.compressionMultiplier,
    runtimeHpi: performance.runtimeHpi,
    factoryStockEngine: performance.factoryStockEngine,
    stockEnginePowerScale: performance.stockEnginePowerScale,
    unscaledBaseHorsepower: performance.unscaledBaseHorsepower,
    unscaledBaseTorque: performance.unscaledBaseTorque,
    rawHorsepower: performance.rawHorsepower,
    rawTorque: performance.rawTorque,
  };
}

function buildRaceStartResponseBody({ status = 1, raceXml = "", torqueCurve = [] }) {
  const torqueList = Array.isArray(torqueCurve) && torqueCurve.length > 0
    ? `[${torqueCurve.map((value) => Number(value) || 0).join(", ")}]`
    : "[]";

  return `"s", ${Number(status) || 0}, "d", "${quoteLingoString(raceXml)}", "t", ${torqueList}`;
}

function buildDynoStartResponseBody({ status = 1, balance = 0, raceXml = "", torqueCurve = [] }) {
  const torqueList = Array.isArray(torqueCurve) && torqueCurve.length > 0
    ? `[${torqueCurve.map((value) => Number(value) || 0).join(", ")}]`
    : "[]";

  return `"s", ${Number(status) || 0}, "b", ${Number(balance) || 0}, "d", "${quoteLingoString(raceXml)}", "t", ${torqueList}`;
}

function buildTournamentJoinResponseBody({ status = 1, bracketStatus = 0, raceXml = "", torqueCurve = [] }) {
  const torqueList = Array.isArray(torqueCurve) && torqueCurve.length > 0
    ? `[${torqueCurve.map((value) => Number(value) || 0).join(", ")}]`
    : "[]";

  return (
    `"s", ${Number(status) || 0}, "b", ${Number(bracketStatus) || 0}, ` +
    `"d", "${quoteLingoString(raceXml)}", "t", ${torqueList}`
  );
}

function gearRatioXml({ accountCarId = 0, catalogCarId = 0, gearRatios = {}, defaultGearRatios = {}, shiftLightRpm = 0 }) {
  const ratio = (key, fallback = 0) => Number(gearRatios?.[key] ?? defaultGearRatios?.[key] ?? fallback) || 0;
  const gear1 = ratio("f");
  const gear2 = ratio("g");
  const gear3 = ratio("h");
  const gear4 = ratio("i");
  const gear5 = ratio("j");
  const gear6 = ratio("k");
  const finalDrive = ratio("l");
  const attrs = {
    acid: Number(accountCarId || 0),
    cid: Number(catalogCarId || 0),
    f: gear1,
    g: gear2,
    h: gear3,
    i: gear4,
    j: gear5,
    k: gear6,
    l: finalDrive,
    g1: gear1,
    g2: gear2,
    g3: gear3,
    g4: gear4,
    g5: gear5,
    g6: gear6,
    gr1: gear1,
    gr2: gear2,
    gr3: gear3,
    gr4: gear4,
    gr5: gear5,
    gr6: gear6,
    gear1,
    gear2,
    gear3,
    gear4,
    gear5,
    gear6,
    first: gear1,
    second: gear2,
    third: gear3,
    fourth: gear4,
    fifth: gear5,
    sixth: gear6,
    fd: finalDrive,
    fgr: finalDrive,
    fg: finalDrive,
    fdr: finalDrive,
    fr: finalDrive,
    dr: finalDrive,
    final: finalDrive,
    finalratio: finalDrive,
    finalRatio: finalDrive,
    finalgear: finalDrive,
    finalGear: finalDrive,
    finalgearratio: finalDrive,
    finalGearRatio: finalDrive,
    finaldrive: finalDrive,
    finalDrive,
    finaldriveratio: finalDrive,
    finalDriveRatio: finalDrive,
    diff: finalDrive,
    differential: finalDrive,
    sl: Number(shiftLightRpm || 0),
    shiftLightRpm: Number(shiftLightRpm || 0),
  };

  const attrXml = Object.entries(attrs)
    .map(([key, value]) => `${key}='${escapeXmlAttribute(value)}'`)
    .join(" ");

  return `<n2 ${attrXml}><g ${attrXml}/><gear ${attrXml}/><fd ${attrXml}/><final ${attrXml}/></n2>`;
}

function gearRatioParams(params) {
  const aliases = [
    ["f", ["f", "g1", "first", "firstgear", "firstGear"]],
    ["g", ["g", "g2", "second", "secondgear", "secondGear"]],
    ["h", ["h", "g3", "third", "thirdgear", "thirdGear"]],
    ["i", ["i", "g4", "fourth", "fourthgear", "fourthGear"]],
    ["j", ["j", "g5", "fifth", "fifthgear", "fifthGear"]],
    ["k", ["k", "g6", "sixth", "sixthgear", "sixthGear"]],
    ["l", [
      "l",
      "fd",
      "fgr",
      "fg",
      "fdr",
      "fr",
      "dr",
      "final",
      "finalratio",
      "finalRatio",
      "finalgear",
      "finalGear",
      "finalgearratio",
      "finalGearRatio",
      "finaldrive",
      "finalDrive",
      "finaldriveratio",
      "finalDriveRatio",
      "diff",
      "differential",
    ]],
  ];
  const ratios = {};

  for (const [key, names] of aliases) {
    for (const name of names) {
      if (!params.has(name)) {
        continue;
      }

      const value = Number(params.get(name));
      if (Number.isFinite(value)) {
        ratios[key] = value;
        break;
      }
    }
  }

  return ratios;
}

function requestParamsObject(params) {
  return Object.fromEntries([...params.entries()].map(([key, value]) => [key, value]));
}

function firstNumericParam(params, preferredNames, ignoredNames = []) {
  const ignored = new Set(ignoredNames.map((name) => String(name).toLowerCase()));

  for (const name of preferredNames) {
    if (!params.has(name)) {
      continue;
    }

    const rawValue = params.get(name);
    if (rawValue === null || rawValue === "") {
      continue;
    }

    const value = Number(rawValue);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  for (const [name, rawValue] of params.entries()) {
    if (ignored.has(String(name).toLowerCase())) {
      continue;
    }
    if (rawValue === "") {
      continue;
    }

    const value = Number(rawValue);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return Number.NaN;
}

function paintStatusForPayment(paymentType) {
  return String(paymentType || "").toLowerCase() === "p" ? 1 : 2;
}

function buildBuyPaintResponseBody({ status, balance = 0 }) {
  return `"s", ${Number(status) || 0}, "b", ${Number(balance) || 0}`;
}

function licenseStatusForPayment(paymentType) {
  return String(paymentType || "").toLowerCase() === "p" ? 1 : 2;
}

function buildBuyPlateResponseBody({ status, balance = 0, plateNumber = "" }) {
  return `"s", ${Number(status) || 0}, "b", ${Number(balance) || 0}, "pl", "${quoteLingoString(plateNumber)}"`;
}

async function handleListClassified(context) {
  const { config, logger, params } = context;
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const catalogCarId = classifiedCatalogCarIdParam(params);
  const engineType = classifiedEngineTypeParam(params);
  const limit = Math.min(Math.max(Number(params.get("limit") || params.get("l") || 100) || 100, 1), 250);
  const result = await store.listUsedCarListings({
    catalogCarId,
    limit: 250,
  });
  const listings = sortUsedCarListingsByModel(result.listings || [])
    .filter((listing) => usedCarListingMatchesBoostType(listing, engineType))
    .slice(0, limit);
  const xml = buildUsedCarListingsXml(listings);

  logger.info("Local used car listings served", {
    count: listings.length,
    catalogCarId,
    engineType: engineType || "all",
  });

  return {
    body: successData(xml),
    source: "local:listclassified",
  };
}

async function handleGetClassifiedDetail(context) {
  const { config, logger, params } = context;
  const listingId = classifiedListingIdParam(params);
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.getUsedCarListing({ listingId });

  if (!result.ok) {
    logger.warn("Local used car listing detail rejected", {
      listingId,
      reason: result.reason || "unknown",
    });
    return {
      body: buildUsedCarDialogBody({
        status: result.code || 0,
        xml: usedCarDialogXml({
          listingId,
          error: usedCarErrorMessage(result.reason),
        }),
      }),
      source: `local:getclassifieddetail:${result.reason || "rejected"}`,
    };
  }

  return {
    body: successData(buildUsedCarDetailXml(result.listing)),
    source: "local:getclassifieddetail",
  };
}

async function handlePutCarOnClassified(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local used car listing rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: buildUsedCarDialogBody({
        status: -100,
        xml: usedCarDialogXml({ error: usedCarErrorMessage("missing-session") }),
      }),
      source: "local:putcaronclassified:missing-session",
    };
  }

  const accountCarId = Number(params.get("acid") || params.get("accountCarId") || params.get("carid") || params.get("cid") || params.get("i") || 0);
  const askingPrice = Number(params.get("pr") || params.get("price") || params.get("p") || 0);
  const currencyType = params.get("ct") || params.get("currency") || params.get("pt") || "money";
  const privatePassword = params.get("pw") || params.get("password") || "";
  const allowTrades = Number(params.get("t") || params.get("trades") || params.get("allowTrades") || 0) === 1;
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.createUsedCarListing({
    sellerAccountId: session.account.id,
    accountCarId,
    askingPrice,
    currencyType,
    privatePassword,
    allowTrades,
    description: params.get("desc") || params.get("description") || "",
    daysDuration: Number(params.get("days") || params.get("dys") || 7),
  });

  if (!result.ok) {
    logger.warn("Local used car listing rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      askingPrice,
      currencyType,
      reason: result.reason || "unknown",
    });
    return {
      body: buildUsedCarDialogBody({
        status: result.code || 0,
        xml: usedCarDialogXml({
          accountCarId,
          balance: session.account.money,
          error: usedCarErrorMessage(result.reason),
        }),
      }),
      source: `local:putcaronclassified:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  context.tcpServer?.syncLiveAccountSnapshot?.(result.account);
  await pushUsedCarListUpdate(context, store, { accountIds: result.account.id });
  logger.info("Local car listed on used car lot", {
    accountId: result.account.id,
    username: result.account.username,
    accountCarId,
    listingId: result.listing.id,
    askingPrice: result.listing.askingPrice,
    currencyType: result.listing.currencyType,
  });

  return {
    body: buildUsedCarDialogBody({
      status: 1,
      xml: usedCarDialogXml({
        listingId: result.listing.id,
        balance: result.account.money,
      }),
    }),
    source: "local:putcaronclassified",
  };
}

async function handleBuyUsedCar(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local used car purchase rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: buildUsedCarDialogBody({
        status: -100,
        xml: usedCarDialogXml({ error: usedCarErrorMessage("missing-session") }),
      }),
      source: "local:buyusedcar:missing-session",
    };
  }

  const listingId = classifiedListingIdParam(params);
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.buyUsedCar({
    buyerAccountId: session.account.id,
    listingId,
    password: params.get("p") || params.get("pw") || params.get("password") || "",
  });

  if (!result.ok) {
    logger.warn("Local used car purchase rejected", {
      buyerAccountId: session.account.id,
      buyerUsername: session.account.username,
      listingId,
      reason: result.reason || "unknown",
    });
    return {
      body: buildUsedCarDialogBody({
        status: result.code || 0,
        xml: usedCarDialogXml({
          listingId,
          balance: result.balance || session.account.money || 0,
          error: usedCarErrorMessage(result.reason),
        }),
      }),
      source: `local:buyusedcar:${result.reason || "rejected"}`,
    };
  }

  session.account = result.buyerAccount;
  context.tcpServer?.syncLiveAccountSnapshot?.(result.buyerAccount);
  context.tcpServer?.syncLiveAccountSnapshot?.(result.sellerAccount);
  await pushUsedCarListUpdate(context, store, {
    accountIds: [result.buyerAccount?.id, result.sellerAccount?.id],
  });

  logger.info("Local used car purchased", {
    buyerAccountId: result.buyerAccount.id,
    buyerUsername: result.buyerAccount.username,
    sellerAccountId: result.sellerAccount.id,
    sellerUsername: result.sellerAccount.username,
    listingId: result.listing.id,
    accountCarId: result.car.accountCarId,
    catalogCarId: result.car.catalogCarId,
    price: result.price,
    paymentType: result.paymentType,
    balance: result.balance,
  });

  return {
    body: buildUsedCarDialogBody({
      status: 1,
      xml: usedCarDialogXml({
        listingId: result.listing.id,
        balance: result.balance,
      }),
    }),
    source: "local:buyusedcar",
  };
}

async function handleCancelClassified(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    return {
      body: buildUsedCarDialogBody({
        status: -100,
        xml: usedCarDialogXml({ error: usedCarErrorMessage("missing-session") }),
      }),
      source: "local:cancelclassified:missing-session",
    };
  }

  const listingId = classifiedListingIdParam(params);
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.cancelUsedCarListing({
    sellerAccountId: session.account.id,
    listingId,
  });

  if (!result.ok) {
    logger.warn("Local used car listing cancel rejected", {
      accountId: session.account.id,
      username: session.account.username,
      listingId,
      reason: result.reason || "unknown",
    });
    return {
      body: buildUsedCarDialogBody({
        status: result.code || 0,
        xml: usedCarDialogXml({
          listingId,
          balance: session.account.money,
          error: usedCarErrorMessage(result.reason),
        }),
      }),
      source: `local:cancelclassified:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  context.tcpServer?.syncLiveAccountSnapshot?.(result.account);
  await pushUsedCarListUpdate(context, store, { accountIds: result.account.id });
  return {
    body: buildUsedCarDialogBody({
      status: 1,
      xml: usedCarDialogXml({
        listingId: result.listing.id,
        accountCarId: result.listing.accountCarId,
        idValue: result.listing.accountCarId,
        balance: result.account.money,
      }),
    }),
    source: "local:cancelclassified",
  };
}

async function handleClassifiedHistory(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    return {
      body: `"d", "<cars i='0' dc='0' c='0' tc='0' p='1'></cars>"`,
      source: "local:classifiedhistory:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.usedCarListingHistory({
    accountId: session.account.id,
  });

  if (!result.ok) {
    logger.warn("Local classified history rejected", {
      accountId: session.account.id,
      username: session.account.username,
      reason: result.reason || "unknown",
    });
    return {
      body: `"d", "<cars i='0' dc='0' c='0' tc='0' p='1'></cars>"`,
      source: `local:classifiedhistory:${result.reason || "rejected"}`,
    };
  }

  return {
    body: `"d", "${quoteLingoString(buildUsedCarListingsXml(result.listings || []))}"`,
    source: "local:classifiedhistory",
  };
}

async function handleClaimPendingUclProfit() {
  return {
    body: `"s", 1, "d", ""`,
    source: "local:claimpendinguclprofit:empty",
  };
}

async function handleRequestTrade(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    return {
      body: buildUsedCarDialogBody({
        status: -100,
        xml: usedCarDialogXml({ error: usedCarErrorMessage("missing-session") }),
      }),
      source: "local:requesttrade:missing-session",
    };
  }

  const offeredListingId = Number(params.get("cid1") || 0);
  const targetListingId = Number(params.get("cid2") || 0);
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.requestUsedCarTrade({
    requesterAccountId: session.account.id,
    offeredListingId,
    targetListingId,
    password: params.get("p") || params.get("pw") || "",
  });

  if (!result.ok) {
    logger.warn("Local used car trade request rejected", {
      accountId: session.account.id,
      username: session.account.username,
      offeredListingId,
      targetListingId,
      reason: result.reason || "unknown",
    });
    return {
      body: buildUsedCarDialogBody({
        status: result.code || 0,
        xml: usedCarDialogXml({ error: usedCarErrorMessage(result.reason) }),
      }),
      source: `local:requesttrade:${result.reason || "rejected"}`,
    };
  }

  logger.info("Local used car trade requested", {
    accountId: session.account.id,
    username: session.account.username,
    offeredListingId,
    targetListingId,
    tradeId: result.trade?.id || 0,
    receiverAccountId: result.trade?.receiverAccountId || 0,
  });

  await pushUsedCarListUpdate(context, store, {
    accountIds: [session.account.id, result.trade?.receiverAccountId],
  });
  await pushUsedCarSellerListingsUpdate(context, store, result.trade?.receiverAccountId);

  return {
    body: buildUsedCarDialogBody({
      status: 1,
      xml: usedCarDialogXml({ listingId: targetListingId }),
    }),
    source: "local:requesttrade",
  };
}

async function handlePendingTrades(context) {
  const { config, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: `"d", "<trades i='0'></trades>"`,
      source: "local:getpendingtrades:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.listIncomingUsedCarTrades({
    accountId: session.account.id,
    listingId: Number(params.get("cid") || params.get("id") || 0),
  });

  return {
    body: `"d", "${quoteLingoString(buildUsedCarTradesXml(result.trades || [], { direction: "incoming" }))}"`,
    source: "local:getpendingtrades",
  };
}

async function handleOutgoingTradeHistory(context) {
  const { config, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: `"d", "<trades i='0'></trades>"`,
      source: "local:getoutgoingtradehistory:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.listOutgoingUsedCarTrades({ accountId: session.account.id });

  return {
    body: `"d", "${quoteLingoString(buildUsedCarTradesXml(result.trades || [], { direction: "outgoing" }))}"`,
    source: "local:getoutgoingtradehistory",
  };
}

async function handleRespondTrade(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: buildUsedCarDialogBody({
        status: -100,
        xml: usedCarDialogXml({ error: usedCarErrorMessage("missing-session") }),
      }),
      source: "local:respondtrade:missing-session",
    };
  }

  const offeredListingId = Number(params.get("cid1") || 0);
  const targetListingId = Number(params.get("cid2") || 0);
  const accept = Number(params.get("a") || 0) === 1;
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.respondUsedCarTrade({
    receiverAccountId: session.account.id,
    offeredListingId,
    targetListingId,
    accept,
  });

  if (!result.ok) {
    logger.warn("Local used car trade response rejected", {
      accountId: session.account.id,
      username: session.account.username,
      offeredListingId,
      targetListingId,
      accept,
      reason: result.reason || "unknown",
    });
    return {
      body: buildUsedCarDialogBody({
        status: result.code || 0,
        xml: usedCarDialogXml({ error: usedCarErrorMessage(result.reason) }),
      }),
      source: `local:respondtrade:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  context.tcpServer?.syncLiveAccountSnapshot?.(result.account);
  if (result.requesterAccount) {
    context.tcpServer?.syncLiveAccountSnapshot?.(result.requesterAccount);
  }
  await pushUsedCarListUpdate(context, store, {
    accountIds: [session.account.id, result.trade?.requesterAccountId],
  });
  await pushUsedCarSellerListingsUpdate(context, store, session.account.id);
  await pushUsedCarSellerListingsUpdate(context, store, result.trade?.requesterAccountId);

  return {
    body: `"s", 1, "d", "${quoteLingoString(`<n2 a='${accept ? 1 : 0}' ub='${Number(result.account?.money || 0)}' e=''/>`)}"`,
    source: "local:respondtrade",
  };
}

async function handleCancelTrade(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  if (!session) {
    return {
      body: buildUsedCarDialogBody({
        status: -100,
        xml: usedCarDialogXml({ error: usedCarErrorMessage("missing-session") }),
      }),
      source: "local:canceltrade:missing-session",
    };
  }

  const offeredListingId = Number(params.get("cid1") || 0);
  const targetListingId = Number(params.get("cid2") || 0);
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.cancelUsedCarTrade({
    requesterAccountId: session.account.id,
    offeredListingId,
    targetListingId,
  });

  if (!result.ok) {
    logger.warn("Local used car trade cancel rejected", {
      accountId: session.account.id,
      username: session.account.username,
      offeredListingId,
      targetListingId,
      reason: result.reason || "unknown",
    });
    return {
      body: buildUsedCarDialogBody({
        status: result.code || 0,
        xml: usedCarDialogXml({ error: usedCarErrorMessage(result.reason) }),
      }),
      source: `local:canceltrade:${result.reason || "rejected"}`,
    };
  }

  await pushUsedCarListUpdate(context, store, {
    accountIds: [session.account.id, result.trade?.receiverAccountId],
  });
  await pushUsedCarSellerListingsUpdate(context, store, session.account.id);
  await pushUsedCarSellerListingsUpdate(context, store, result.trade?.receiverAccountId);

  return {
    body: buildUsedCarDialogBody({
      status: 1,
      xml: usedCarDialogXml(),
    }),
    source: "local:canceltrade",
  };
}

async function handleBuyCar(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local car purchase rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:buycar:missing-session",
    };
  }

  const catalogCarId = Number(params.get("cid") || params.get("ci") || params.get("carid") || params.get("id") || 0);
  const paymentType = String(params.get("pt") || "m").toLowerCase() === "p" ? "p" : "m";
  const color = params.get("c") || params.get("cc") || "C0C0C0";
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.purchaseCar({
    accountId: session.account.id,
    catalogCarId,
    paymentType,
    color,
  });

  if (!result.ok) {
    logger.warn("Local car purchase rejected", {
      accountId: session.account.id,
      username: session.account.username,
      catalogCarId,
      paymentType,
      reason: result.reason || "unknown",
    });
    return {
      body: buildBuyCarResponseBody({ status: result.code || 0, balance: result.balance || 0 }),
      source: `local:buycar:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  const status = result.paymentType === "p" ? 1 : 2;
  const carXml = renderOwnedGarageCarXml(result.account, result.car, { selected: true });

  logger.info("Local car purchased", {
    accountId: result.account.id,
    username: result.account.username,
    catalogCarId,
    accountCarId: result.car.accountCarId,
    paymentType: result.paymentType,
    price: result.price,
    balance: result.balance,
  });

  return {
    body: buildBuyCarResponseBody({ status, balance: result.balance, carXml }),
    source: "local:buycar",
  };
}

async function handleGetCarPrice(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local car price request rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:getcarprice:missing-session",
    };
  }

  const accountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || 0);
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.getCarSellPrice({
    accountId: session.account.id,
    accountCarId,
  });

  if (!result.ok) {
    logger.warn("Local car price request rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      reason: result.reason || "unknown",
    });
    return {
      body: statusBody(result.code || 0),
      source: `local:getcarprice:${result.reason || "rejected"}`,
    };
  }

  logger.info("Local car sell price served", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId,
    catalogCarId: result.car.catalogCarId,
    price: result.price,
  });

  return {
    body: `"s", 1, "p", ${Number(result.price || 0)}`,
    source: "local:getcarprice",
  };
}

async function handleSellCar(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local car sale rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:sellcar:missing-session",
    };
  }

  const accountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || 0);
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.sellCar({
    accountId: session.account.id,
    accountCarId,
  });

  if (!result.ok) {
    logger.warn("Local car sale rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      reason: result.reason || "unknown",
    });
    return {
      body: `"s", ${Number(result.code || 0)}, "b", ${Number(session.account.money || 0)}`,
      source: `local:sellcar:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  logger.info("Local car sold", {
    accountId: result.account.id,
    username: result.account.username,
    accountCarId,
    price: result.price,
    balance: result.balance,
  });

  return {
    body: `"s", 1, "b", ${Number(result.balance || 0)}`,
    source: "local:sellcar",
  };
}

async function handleGetSparePrice(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local spare price request rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: `"s", -1, "p", 0, "b", 0`,
      source: "local:getspareprice:missing-session",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.getSparePartsValue({
    accountId: session.account.id,
  });

  if (!result.ok) {
    logger.warn("Local spare price request rejected", {
      accountId: session.account.id,
      username: session.account.username,
      reason: result.reason || "unknown",
    });
    return {
      body: `"s", -1, "p", 0, "b", 0`,
      source: `local:getspareprice:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;

  return {
    body: `"s", 1, "p", ${Number(result.value || 0)}, "b", ${Number(result.value || 0)}`,
    source: "local:getspareprice",
  };
}

async function handleSellAllSpare(context) {
  return handleSellSparePart(context, { sellAll: true, actionName: "sellallspare" });
}

async function handleSellSparePart(context, options = {}) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  const actionName = options.actionName || String(context.action || "sellsparepart").toLowerCase();

  if (!session) {
    logger.warn("Local spare part sale rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: `"s", -1, "b", 0, "m", 0, "v", 0`,
      source: `local:${actionName}:missing-session`,
    };
  }

  const sparePartId = Number(params.get("aepid") || params.get("acpid") || params.get("apdi") || params.get("id") || 0);
  const sellAll = Boolean(options.sellAll)
    || ["1", "true", "all"].includes(String(params.get("all") || params.get("sellall") || params.get("aepid") || "").toLowerCase());
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.sellSparePart({
    accountId: session.account.id,
    sparePartId,
    sellAll,
  });

  if (!result.ok) {
    logger.warn("Local spare part sale rejected", {
      accountId: session.account.id,
      username: session.account.username,
      sparePartId,
      sellAll,
      reason: result.reason || "unknown",
    });
    return {
      body: `"s", ${Number(result.code || -1)}, "b", ${Number(result.balance || session.account.money || 0)}, "m", ${Number(result.balance || session.account.money || 0)}, "v", ${Number(result.value || 0)}`,
      source: `local:${actionName}:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  logger.info("Local spare part sold", {
    accountId: result.account.id,
    username: result.account.username,
    sparePartId,
    sellAll,
    value: result.value,
    balance: result.balance,
  });

  return {
    body: `"s", 1, "b", ${Number(result.balance || 0)}, "m", ${Number(result.balance || 0)}, "v", ${Number(result.value || 0)}`,
    source: `local:${actionName}`,
  };
}

async function handleInstallPart(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  const actionName = String(context.action || "installpart").toLowerCase();
  const installResponseBody = (status) => successData(`<r s='${Number(status) || 0}' b='0'/>`);

  if (!session) {
    logger.warn("Local spare part install rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: installResponseBody(-100),
      source: `local:${actionName}:missing-session`,
    };
  }

  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const accountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || selectedCar?.accountCarId || 0);
  const sparePartId = Number(params.get("acpid") || params.get("aepid") || params.get("apdi") || 0);
  const expectedPartId = Number(params.get("pid") || params.get("epid") || 0);
  const installId = createInstalledPartId();
  const targetCar = findAccountGarageCar(session.account, accountCarId) || selectedCar;
  const catalog = await buildPartsCatalogForGarage(config, targetCar?.catalogCarId || 0);
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.installSparePart({
    accountId: session.account.id,
    accountCarId,
    sparePartId,
    expectedPartId,
    installId,
    partsById: catalog.partsById,
  });

  if (!result.ok) {
    logger.warn("Local spare part install rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      sparePartId,
      expectedPartId,
      reason: result.reason || "unknown",
    });
    return {
      body: installResponseBody(result.code || 0),
      source: `local:${actionName}:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  logger.info("Local spare part installed", {
    accountId: result.account.id,
    username: result.account.username,
    accountCarId,
    sparePartId,
    partId: result.partId,
    installId: result.installId,
  });

  return {
    body: installResponseBody(1),
    source: `local:${actionName}`,
  };
}

async function handleUninstallPart(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local part uninstall rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: successData("<r s='-100'/>"),
      source: "local:uninstallpart:missing-session",
    };
  }

  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const accountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || selectedCar?.accountCarId || 0);
  const installIds = String(params.get("acpids") || params.get("acpid") || params.get("aepids") || params.get("aepid") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const expectedPartIds = String(params.get("pids") || params.get("pid") || params.get("epids") || params.get("epid") || "")
    .split(",")
    .map((value) => Number(value.trim() || 0));
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.uninstallCarParts({
    accountId: session.account.id,
    accountCarId,
    installIds,
    expectedPartIds,
  });

  if (!result.ok) {
    logger.warn("Local part uninstall rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      installIds,
      reason: result.reason || "unknown",
    });
    return {
      body: successData(`<r s='${Number(result.code || 0)}'/>`),
      source: `local:uninstallpart:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  logger.info("Local part uninstalled to spares", {
    accountId: result.account.id,
    username: result.account.username,
    accountCarId,
    installIds,
    removedCount: result.removedCount,
  });

  return {
    body: successData("<r s='1'/>"),
    source: "local:uninstallpart",
  };
}

async function handleSystemSwap(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local system swap rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: successData("<r s='0'/>"),
      source: "local:systemswap:missing-session",
    };
  }

  const accountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || 0);
  const engineTypeId = Number(params.get("etid") || 0);
  const selectedPartIds = String(params.get("aepids") || params.get("aepid") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const catalogCarId = findAccountGarageCar(session.account, accountCarId)?.catalogCarId || selectedCar?.catalogCarId || 0;
  const catalog = await buildPartsCatalog({
    projectRoot: config.projectRoot,
    dataRoot: config.dataRoot,
    assetRoot: config.assetRoot,
    catalogCarId,
  });
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.systemSwap({
    accountId: session.account.id,
    accountCarId,
    engineTypeId,
    selectedPartIds,
    partsById: catalog.partsById,
  });

  if (!result.ok) {
    logger.warn("Local system swap rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      engineTypeId,
      selectedPartIds,
      reason: result.reason || "unknown",
    });
    return {
      body: successData(`<r s='${Number(result.code || 0)}'/>`),
      source: `local:systemswap:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  logger.info("Local system swap complete", {
    accountId: result.account.id,
    username: result.account.username,
    accountCarId: result.car.accountCarId,
    catalogCarId: result.car.catalogCarId,
    engineTypeId,
    selectedPartIds,
  });

  return {
    body: `"s", 1, "d", "${quoteLingoString(`<n>${renderOwnedGarageCarXml(result.account, result.car, { selected: true })}</n>`)}"`,
    source: "local:systemswap",
  };
}

async function handleBuyPart(context) {
  return handlePurchasePart(context, {
    actionName: "buypart",
    partIdParams: ["pid"],
    includeWheelsAndTires: true,
  });
}

async function handleBuyPartUgg(context) {
  return handlePurchasePart(context, {
    actionName: "buypartugg",
    partIdParams: ["pid"],
    includeWheelsAndTires: true,
  });
}

async function handleBuyEnginePart(context) {
  return handlePurchasePart(context, {
    actionName: "buyenginepart",
    partIdParams: ["epid", "pid"],
    includeWheelsAndTires: false,
  });
}

async function handlePurchasePart(context, { actionName, partIdParams, includeWheelsAndTires }) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local part purchase rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: `local:${actionName}:missing-session`,
    };
  }

  const partId = Number(partIdParams.map((name) => params.get(name)).find(Boolean) || 0);
  const rawPartType = String(params.get("pt") || "m").toLowerCase();
  const preliminaryGraphicSlotId = customGraphicSlotIdForPurchase(params, partId, null);
  const preliminaryDecalId = customGraphicDecalIdParam(params, preliminaryGraphicSlotId);
  const mightBeCustomGraphicRequest = actionName === "buypartugg"
    || graphicSlotForPartId(partId) > 0
    || preliminaryGraphicSlotId > 0;
  const isCustomGraphicRequest = (rawPartType === "p" || actionName === "buypartugg")
    && Boolean(preliminaryDecalId)
    && mightBeCustomGraphicRequest;
  const paymentType = rawPartType === "p" ? "p" : "m";
  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const accountCarId = Number(params.get("acid") || selectedCar?.accountCarId || session.account?.starterCar?.accountCarId || session.account?.id || 0);
  const partsCatalog = await buildPartsCatalog({
    projectRoot: config.projectRoot,
    dataRoot: config.dataRoot,
    assetRoot: config.assetRoot,
    catalogCarId: findAccountGarageCar(session.account, accountCarId)?.catalogCarId || selectedCar?.catalogCarId || 0,
  });
  let catalogPart = partsCatalog.partsById.get(partId);

  if (!catalogPart && includeWheelsAndTires) {
    const wheelsTiresCatalog = await buildWheelsTiresCatalog({
      assetRoot: config.assetRoot,
      dataRoot: config.dataRoot,
    });
    catalogPart = wheelsTiresCatalog.partsById.get(partId);
  }

  if (isCustomGraphicRequest) {
    const slotId = customGraphicSlotIdForPurchase(params, partId, catalogPart);
    const graphicConfig = graphicSlotConfig(slotId) || graphicSlotConfigForPartId(partId);
    const finalizedGraphic = finalizeUserGraphicInstall({
      dataRoot: config.dataRoot,
      remoteAddress: context.remoteAddress,
      slotId: graphicConfig?.slotId || slotId || 161,
      decalId: preliminaryDecalId,
      fileExt: customGraphicFileExtParam(params, slotId),
      logger,
    });
    catalogPart = buildCustomGraphicCatalogPart({
      basePart: catalogPart,
      partId,
      slotId: graphicConfig?.slotId || slotId || 161,
      decalId: finalizedGraphic.decalId,
      fileExt: finalizedGraphic.fileExt,
    });
    logger.info("Custom graphic purchase prepared", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      partId,
      requestedSlotId: slotId,
      resolvedSlotId: graphicConfig?.slotId || slotId || 161,
      requestedDecalId: preliminaryDecalId,
      resolvedDecalId: finalizedGraphic.decalId,
      sourcePath: finalizedGraphic.sourcePath,
      targetPath: finalizedGraphic.targetPath,
      catalogPart,
    });
  }

  if (!accountCarId || !catalogPart) {
    logger.warn("Local part purchase rejected because the car or part was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      partId,
    });
    return {
      body: buildBuyPartResponseBody({ status: catalogPart ? -8 : 0 }),
      source: catalogPart ? `local:${actionName}:no-car` : `local:${actionName}:no-part`,
    };
  }

  const installId = createInstalledPartId();
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.purchaseCatalogPart({
    accountId: session.account.id,
    accountCarId,
    catalogPart,
    paymentType,
    installId,
  });

  if (!result.ok) {
    logger.warn("Local part purchase rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      partId,
      paymentType,
      reason: result.reason || "unknown",
    });
    return {
      body: buildBuyPartResponseBody({ status: result.code || 0, balance: result.balance || 0 }),
      source: `local:${actionName}:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  const status = buyPartStatusForPayment(result.paymentType);

  logger.info("Local part purchased and installed", {
    accountId: result.account.id,
    username: result.account.username,
    accountCarId,
    partId,
    paymentType: result.paymentType,
    price: result.price,
    balance: result.balance,
    spareOnly: Boolean(result.spareOnly),
    systemInstalled: Boolean(result.systemInstalled),
    customGraphic: isCustomGraphicRequest,
    starterCar: result.account.starterCar,
  });

  return {
    body: buildBuyPartResponseBody({ status, balance: result.balance, installId }),
    source: `local:${actionName}`,
  };
}

async function handleBuyPlate(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local license plate style purchase rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: buildBuyPlateResponseBody({ status: -100 }),
      source: "local:buyplate:missing-session",
    };
  }

  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const accountCarId = Number(params.get("acid") || selectedCar?.accountCarId || session.account?.starterCar?.accountCarId || 0);
  const plateId = Number(params.get("pid") || params.get("pi") || 0);
  const paymentType = String(params.get("pt") || "m").toLowerCase() === "p" ? "p" : "m";
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.purchaseLicensePlateStyle({
    accountId: session.account.id,
    accountCarId,
    plateId,
    paymentType,
  });

  if (!result.ok) {
    logger.warn("Local license plate style purchase rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      plateId,
      paymentType,
      reason: result.reason || "unknown",
    });
    return {
      body: buildBuyPlateResponseBody({ status: result.code || 0, balance: result.balance || 0 }),
      source: `local:buyplate:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  const status = licenseStatusForPayment(result.paymentType);

  logger.info("Local license plate style purchased", {
    accountId: result.account.id,
    username: result.account.username,
    accountCarId,
    plateId,
    paymentType: result.paymentType,
    price: result.price,
    balance: result.balance,
    plateNumber: result.plateNumber,
  });

  return {
    body: buildBuyPlateResponseBody({ status, balance: result.balance, plateNumber: result.plateNumber }),
    source: "local:buyplate",
  };
}

async function handleBuyVanity(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local vanity plate purchase rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: buildBuyPaintResponseBody({ status: -100 }),
      source: "local:buyvanity:missing-session",
    };
  }

  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const accountCarId = Number(params.get("acid") || selectedCar?.accountCarId || session.account?.starterCar?.accountCarId || 0);
  const plateNumber = params.get("pn") || "";
  const paymentType = String(params.get("pt") || "m").toLowerCase() === "p" ? "p" : "m";
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.purchaseVanityPlate({
    accountId: session.account.id,
    accountCarId,
    plateNumber,
    paymentType,
  });

  if (!result.ok) {
    logger.warn("Local vanity plate purchase rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      paymentType,
      reason: result.reason || "unknown",
    });
    return {
      body: buildBuyPaintResponseBody({ status: result.code || 0, balance: result.balance || 0 }),
      source: `local:buyvanity:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  const status = licenseStatusForPayment(result.paymentType);

  logger.info("Local vanity plate purchased", {
    accountId: result.account.id,
    username: result.account.username,
    accountCarId,
    paymentType: result.paymentType,
    price: result.price,
    balance: result.balance,
    plateNumber: result.plateNumber,
  });

  return {
    body: buildBuyPaintResponseBody({ status, balance: result.balance }),
    source: "local:buyvanity",
  };
}

async function handleBuyPaint(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local paint purchase rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:buypaint:missing-session",
    };
  }

  const accountCarId = Number(params.get("acid") || session.account?.starterCar?.accountCarId || session.account?.id || 0);
  const paymentType = String(params.get("pt") || "m").toLowerCase() === "p" ? "p" : "m";
  const jobs = parsePaintJobs(params.get("p"));
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.purchasePaint({
    accountId: session.account.id,
    accountCarId,
    jobs,
    paymentType,
  });

  if (!result.ok) {
    logger.warn("Local paint purchase rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      paymentType,
      jobs,
      reason: result.reason || "unknown",
    });
    return {
      body: buildBuyPaintResponseBody({ status: result.code || 0, balance: result.balance || 0 }),
      source: `local:buypaint:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  const status = paintStatusForPayment(result.paymentType);

  logger.info("Local paint purchased", {
    accountId: result.account.id,
    username: result.account.username,
    accountCarId,
    paymentType: result.paymentType,
    jobs,
    price: result.price,
    balance: result.balance,
  });

  return {
    body: buildBuyPaintResponseBody({ status, balance: result.balance }),
    source: "local:buypaint",
  };
}

async function handleBuyDyno(context) {
  const { logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local dyno rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: buildDynoStartResponseBody({ status: -100 }),
      source: "local:buydyno:missing-session",
    };
  }

  const accountCarId = Number(
    params.get("acid")
      || params.get("cid")
      || params.get("i")
      || session.account?.starterCar?.accountCarId
      || 0,
  );
  const targetCar = findAccountGarageCar(session.account, accountCarId);
  const balance = Number(session.account.money || 0);

  if (!targetCar) {
    logger.warn("Local dyno rejected because car was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
    });
    return {
      body: buildDynoStartResponseBody({ status: 0, balance }),
      source: "local:buydyno:no-car",
    };
  }

  if (listedCarRaceBlocked(targetCar)) {
    logger.warn("Local dyno rejected because car is listed on used car lot", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      listingId: targetCar.usedCarListingId || 0,
    });
    return {
      body: buildDynoStartResponseBody({ status: 0, balance }),
      source: "local:buydyno:listed-car",
    };
  }

  const racePayload = buildRaceEnginePayload(session.account, targetCar, {
    includeNitrous: false,
    calibrateForDyno: true,
  });
  const dynoDisplay = racePayload.clientDynoDisplay;
  logger.info("Local dyno session accepted", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId,
    catalogCarId: targetCar.catalogCarId,
    balance,
    expectedDisplayHp: dynoDisplay.hp,
    expectedDisplayTq: dynoDisplay.tq,
    staticHorsepower: racePayload.staticHorsepower,
    staticTorque: racePayload.staticTorque,
    rawHorsepower: racePayload.rawHorsepower,
    rawTorque: racePayload.rawTorque,
    compressionRatio: racePayload.compressionRatio,
    compressionLevel: racePayload.compressionLevel,
    compressionDelta: racePayload.compressionDelta,
    compressionMultiplier: racePayload.compressionMultiplier,
    factoryStockEngine: racePayload.factoryStockEngine,
    stockEnginePowerScale: racePayload.stockEnginePowerScale,
    unscaledBaseHorsepower: racePayload.unscaledBaseHorsepower,
    unscaledBaseTorque: racePayload.unscaledBaseTorque,
    raceBytes: racePayload.raceXml.length,
    torqueSamples: racePayload.torqueCurve.length,
    tirePartId: racePayload.tirePartId,
    tireStick: racePayload.tireStick,
    gripCoefficient: racePayload.gripCoefficient,
    tractionControl: racePayload.tractionControl,
    boostType: racePayload.boostType,
    boostSource: racePayload.boostSource,
    stockBoost: racePayload.stockBoost,
    xmlStockBoost: racePayload.xmlStockBoost,
    boostSetting: racePayload.boostSetting,
    effectiveBoostSetting: racePayload.effectiveBoostSetting,
    xmlBoostSetting: racePayload.xmlBoostSetting,
    maxPsi: racePayload.maxPsi,
    boostEffectScale: racePayload.boostEffectScale,
    boostFlow: racePayload.boostFlow,
    gearRatios: racePayload.gearRatios,
    defaultGearRatios: racePayload.defaultGearRatios,
    nitrousShot: racePayload.nitrousShot,
    nitrousRemaining: racePayload.nitrousRemaining,
    nitrousTankSize: racePayload.nitrousTankSize,
    airDemand: racePayload.airDemand,
    overallAirFlowLimit: racePayload.overallAirFlowLimit,
    fuelFlowLimit: racePayload.fuelFlowLimit,
    chipSetting: racePayload.chipSetting,
    airFuelMeterCapability: racePayload.airFuelMeterCapability,
    dynoXml: racePayload.raceXml,
    airflowBonus: racePayload.airflowBonus,
    fuelBonus: racePayload.fuelBonus,
    tuneBonus: racePayload.tuneBonus,
  });

  return {
    body: buildDynoStartResponseBody({ status: 1, balance, ...racePayload }),
    source: "local:buydyno",
  };
}

async function handleGetGearInfo(context) {
  const { logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local gear info rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:getgearinfo:missing-session",
    };
  }

  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const accountCarId = Number(
    params.get("acid")
      || params.get("accountCarId")
      || params.get("carid")
      || selectedCar?.accountCarId
      || 0,
  );
  const targetCar = findAccountGarageCar(session.account, accountCarId) || selectedCar;

  if (!targetCar) {
    logger.warn("Local gear info rejected because car was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
    });
    return {
      body: statusBody(0),
      source: "local:getgearinfo:no-car",
    };
  }

  const catalogCar = getCatalogCar(Number(targetCar.catalogCarId || 0)) || getCatalogCar(1) || {};
  const performance = calculateRacePerformance({ account: session.account, targetCar, catalogCar });
  const xml = gearRatioXml({
    accountCarId: targetCar.accountCarId,
    catalogCarId: targetCar.catalogCarId,
    gearRatios: performance.gearRatios,
    defaultGearRatios: performance.defaultGearRatios,
    shiftLightRpm: targetCar.shiftLightRpm || performance.redlineRpm,
  });

  logger.info("Local gear info served", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId: targetCar.accountCarId,
    catalogCarId: targetCar.catalogCarId,
    gearRatios: performance.gearRatios,
    shiftLightRpm: targetCar.shiftLightRpm || performance.redlineRpm,
  });

  return {
    body: successData(xml),
    source: "local:getgearinfo",
  };
}

async function handleBuyGears(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local gear ratio update rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: `"s", -100, "b", 0`,
      source: "local:buygears:missing-session",
    };
  }

  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const accountCarId = Number(
    params.get("acid")
      || params.get("accountCarId")
      || params.get("carid")
      || selectedCar?.accountCarId
      || 0,
  );
  const ratios = gearRatioParams(params);
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.updateCarGearRatios({
    accountId: session.account.id,
    accountCarId,
    gearRatios: ratios,
  });

  if (!result.ok) {
    logger.warn("Local gear ratio update rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      ratios,
      params: requestParamsObject(params),
      reason: result.reason || "unknown",
    });
    return {
      body: `"s", ${Number(result.code || 0)}, "b", ${Number(session.account.money || 0)}`,
      source: `local:buygears:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;

  logger.info("Local gear ratios saved", {
    accountId: result.account.id,
    username: result.account.username,
    accountCarId: result.car.accountCarId,
    catalogCarId: result.car.catalogCarId,
    gearRatios: result.car.gearRatios,
    balance: result.account.money,
  });

  return {
    body: `"s", 1, "b", ${Number(result.account.money || 0)}`,
    source: "local:buygears",
  };
}

async function handleChangeBoost(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  const requestedBoost = firstNumericParam(
    params,
    ["boost", "boostsetting", "boostSetting", "boostpsi", "boostPsi", "psi", "bs", "b", "e", "value", "v", "n", "p"],
    ["action", "sk", "aid", "acid", "cid", "i", "carid", "accountcarid"],
  );

  if (!session) {
    logger.warn("Local dyno boost change rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
      requestedBoost,
    });
    return {
      body: statusBody(-100),
      source: "local:changeboost:missing-session",
    };
  }

  const accountCarId = Number(
    params.get("acid")
      || params.get("cid")
      || params.get("i")
      || session.account?.defaultCarAccountCarId
      || session.account?.starterCar?.accountCarId
      || 0,
  );

  if (!Number.isFinite(requestedBoost)) {
    logger.warn("Local dyno boost change rejected because boost value was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      params: requestParamsObject(params),
    });
    return {
      body: statusBody(0),
      source: "local:changeboost:missing-boost",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.updateCarDynoSettings({
    accountId: session.account.id,
    accountCarId,
    boostSetting: requestedBoost,
  });

  if (!result.ok) {
    logger.warn("Local dyno boost change rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      requestedBoost,
      reason: result.reason,
    });
    return {
      body: statusBody(result.code || 0),
      source: `local:changeboost:${result.reason || "failed"}`,
    };
  }

  session.account = result.account;

  logger.info("Local dyno boost change saved", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId: result.car.accountCarId,
    requestedBoost,
    savedBoost: result.car.dynoBoostSetting,
  });

  return {
    body: statusBody(1),
    source: "local:changeboost",
  };
}

async function handleChangeAirFuel(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  const requestedSetting = firstNumericParam(
    params,
    [
      "airfuel",
      "airFuel",
      "airfuelratio",
      "airFuelRatio",
      "afr",
      "af",
      "chip",
      "chipsetting",
      "chipSetting",
      "ad",
      "value",
      "v",
      "n",
      "p",
    ],
    ["action", "sk", "aid", "acid", "cid", "i", "carid", "accountcarid"],
  );

  if (!session) {
    logger.warn("Local dyno air/fuel change rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
      requestedSetting,
    });
    return {
      body: statusBody(-100),
      source: "local:changeairfuel:missing-session",
    };
  }

  const accountCarId = Number(
    params.get("acid")
      || params.get("cid")
      || params.get("i")
      || session.account?.defaultCarAccountCarId
      || session.account?.starterCar?.accountCarId
      || 0,
  );

  if (!Number.isFinite(requestedSetting)) {
    logger.warn("Local dyno air/fuel change rejected because setting value was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      params: requestParamsObject(params),
    });
    return {
      body: statusBody(0),
      source: "local:changeairfuel:missing-setting",
    };
  }

  const targetCar = findAccountGarageCar(session.account, accountCarId);
  const airFuelMeterCapability = installedAirFuelMeterCapability(targetCar?.partsXml || "");

  if (airFuelMeterCapability < 2) {
    logger.warn("Local dyno air/fuel change rejected because no controller is installed", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      requestedSetting,
      airFuelMeterCapability,
    });
    return {
      body: statusBody(0),
      source: "local:changeairfuel:no-controller",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.updateCarDynoSettings({
    accountId: session.account.id,
    accountCarId,
    airFuelSetting: requestedSetting,
  });

  if (!result.ok) {
    logger.warn("Local dyno air/fuel change rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      requestedSetting,
      reason: result.reason,
    });
    return {
      body: statusBody(result.code || 0),
      source: `local:changeairfuel:${result.reason || "failed"}`,
    };
  }

  session.account = result.account;

  logger.info("Local dyno air/fuel change saved", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId: result.car.accountCarId,
    requestedSetting,
    savedSetting: result.car.dynoAirFuelSetting,
    airFuelMeterCapability,
  });

  return {
    body: statusBody(1),
    source: "local:changeairfuel",
  };
}

async function handleChangeShiftLightRpm(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  const requestedRpm = firstNumericParam(
    params,
    ["rpm", "shift", "shiftlight", "shiftLight", "shiftlightrpm", "shiftLightRpm", "sl", "value", "v", "n"],
    ["action", "sk", "aid", "acid", "cid", "i", "carid", "accountcarid"],
  );

  if (!session) {
    logger.warn("Local shift light change rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
      requestedRpm,
    });
    return {
      body: statusBody(-100),
      source: "local:changeshiftlightrpm:missing-session",
    };
  }

  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const accountCarId = Number(
    params.get("acid")
      || params.get("accountCarId")
      || params.get("carid")
      || selectedCar?.accountCarId
      || 0,
  );

  if (!Number.isFinite(requestedRpm)) {
    logger.warn("Local shift light change rejected because rpm value was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      params: requestParamsObject(params),
    });
    return {
      body: statusBody(0),
      source: "local:changeshiftlightrpm:missing-rpm",
    };
  }

  const targetCar = findAccountGarageCar(session.account, accountCarId) || selectedCar;
  if (!targetCar) {
    logger.warn("Local shift light change rejected because car was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
    });
    return {
      body: statusBody(0),
      source: "local:changeshiftlightrpm:no-car",
    };
  }

  if (!installedShiftLightCapability(targetCar.partsXml || "")) {
    logger.warn("Local shift light change rejected because no shift light is installed", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      requestedRpm,
    });
    return {
      body: statusBody(0),
      source: "local:changeshiftlightrpm:no-indicator",
    };
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.updateCarDynoSettings({
    accountId: session.account.id,
    accountCarId,
    shiftLightRpm: requestedRpm,
  });

  if (!result.ok) {
    logger.warn("Local shift light change rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      requestedRpm,
      reason: result.reason,
    });
    return {
      body: statusBody(result.code || 0),
      source: `local:changeshiftlightrpm:${result.reason || "failed"}`,
    };
  }

  session.account = result.account;

  logger.info("Local shift light rpm saved", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId: result.car.accountCarId,
    requestedRpm,
    savedRpm: result.car.shiftLightRpm,
  });

  return {
    body: statusBody(1),
    source: "local:changeshiftlightrpm",
  };
}

async function handleGetHumanTournaments(context) {
  const session = getLocalSession(context.params.get("sk"));
  const store = new LocalTournamentStore({ dataRoot: context.config.dataRoot });
  const tournaments = await store.listTournaments();

  context.logger.info("Local human tournaments served", {
    accountId: session?.account?.id || 0,
    username: session?.account?.username || "<unknown>",
    count: tournaments.length,
  });

  return {
    body: successData(renderTournamentsXml(tournaments)),
    source: "local:gethumantournaments",
  };
}

async function handleJoinHumanTournament(context) {
  const { logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local human tournament join rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: buildTournamentJoinResponseBody({ status: -100 }),
      source: "local:joinhumantournament:missing-session",
    };
  }

  const accountCarId = Number(
    params.get("acid")
      || params.get("cid")
      || params.get("carid")
      || params.get("i")
      || session.account.defaultCarAccountCarId
      || 0,
  );
  const targetCar = findAccountGarageCar(session.account, accountCarId)
    || selectedGarageCarForCatalog(session.account, params);

  if (!targetCar) {
    logger.warn("Local human tournament join rejected because car was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
    });
    return {
      body: buildTournamentJoinResponseBody({ status: 0 }),
      source: "local:joinhumantournament:no-car",
    };
  }

  if (listedCarRaceBlocked(targetCar)) {
    logger.warn("Local human tournament join rejected because car is listed on used car lot", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId: targetCar.accountCarId,
      listingId: targetCar.usedCarListingId || 0,
    });
    return {
      body: buildTournamentJoinResponseBody({ status: 0 }),
      source: "local:joinhumantournament:listed-car",
    };
  }

  const tournamentId = Number(params.get("tid") || params.get("id") || params.get("htid") || 1);
  const tournamentStore = new LocalTournamentStore({ dataRoot: context.config.dataRoot });
  const result = await tournamentStore.joinTournament({
    tournamentId,
    account: session.account,
    accountCarId: targetCar.accountCarId,
  });

  if (!result.ok) {
    logger.warn("Local human tournament join rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId: targetCar.accountCarId,
      tournamentId,
      reason: result.reason || "unknown",
    });
    return {
      body: buildTournamentJoinResponseBody({ status: result.code || 0 }),
      source: `local:joinhumantournament:${result.reason || "rejected"}`,
    };
  }

  const racePayload = buildRaceEnginePayload(session.account, targetCar);
  logger.info("Local human tournament qualifying joined", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId: targetCar.accountCarId,
    catalogCarId: targetCar.catalogCarId,
    tournamentId: result.tournament.id,
    entrants: result.tournament.entrants.length,
    raceBytes: racePayload.raceXml.length,
    torqueSamples: racePayload.torqueCurve.length,
  });

  return {
    body: buildTournamentJoinResponseBody({ status: 1, bracketStatus: 0, ...racePayload }),
    source: "local:joinhumantournament",
  };
}

async function handleComputerTournamentGetRacers(context) {
  const session = getLocalSession(context.params.get("sk"));
  const xml = computerTournamentRacersXml(context.params);

  context.logger.info("Local computer tournament racers served", {
    accountId: session?.account?.id || 0,
    username: session?.account?.username || "<unknown>",
    difficulty: computerTournamentDifficulty(context.params) || "all",
    bytes: xml.length,
  });

  return {
    body: successData(xml),
    source: "local:ctgr",
  };
}

async function handleComputerTournamentJoin(context) {
  const session = getLocalSession(context.params.get("sk"));
  const state = resetLocalComputerTournamentState(session, context.params);

  context.logger.info("Local computer tournament join acknowledged", {
    accountId: session?.account?.id || 0,
    username: session?.account?.username || "<unknown>",
    difficulty: computerTournamentDifficulty(context.params) || "all",
    wins: state?.wins || 0,
  });

  return {
    body: statusBody(session ? 1 : -100),
    source: session ? "local:ctjt" : "local:ctjt:missing-session",
  };
}

async function handleComputerTournamentCreate(context) {
  const { logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local computer tournament qualifying rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: buildRaceStartResponseBody({ status: -100 }),
      source: "local:ctct:missing-session",
    };
  }

  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const accountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || selectedCar?.accountCarId || 0);
  const targetCar = findAccountGarageCar(session.account, accountCarId) || selectedCar;

  if (!targetCar) {
    logger.warn("Local computer tournament qualifying rejected because car was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
    });
    return {
      body: buildRaceStartResponseBody({ status: 0 }),
      source: "local:ctct:no-car",
    };
  }

  if (listedCarRaceBlocked(targetCar)) {
    logger.warn("Local computer tournament qualifying rejected because car is listed on used car lot", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId: targetCar.accountCarId,
      listingId: targetCar.usedCarListingId || 0,
    });
    return {
      body: buildRaceStartResponseBody({ status: 0 }),
      source: "local:ctct:listed-car",
    };
  }

  const racePayload = buildRaceEnginePayload(session.account, targetCar);
  const state = localComputerTournamentState(session);
  const bracketTimeResult = computerTournamentPlayerBracketTimeResult(params, session.account, targetCar, 12);
  const difficulty = state.difficulty || computerTournamentDifficulty(params) || "all";
  state.phase = "qualifying";
  state.difficulty = difficulty;
  state.accountCarId = Number(targetCar.accountCarId || 0);
  state.catalogCarId = Number(targetCar.catalogCarId || 0);
  state.currentOpponentId = 0;
  state.bracketTime = bracketTimeResult.bracketTime;
  state.bracketTimeReliable = bracketTimeResult.reliable;
  state.bracketTimeSource = bracketTimeResult.source;
  state.bracketHorsepower = bracketTimeResult.horsepower || 0;
  state.bracketWeight = bracketTimeResult.weight || 0;

  logger.info("Local computer tournament qualifying accepted", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId: targetCar.accountCarId,
    catalogCarId: targetCar.catalogCarId,
    difficulty,
    playerBracketTime: state.bracketTime,
    playerBracketTimeReliable: Boolean(state.bracketTimeReliable),
    playerBracketTimeSource: state.bracketTimeSource,
    playerBracketHorsepower: state.bracketHorsepower,
    playerBracketWeight: state.bracketWeight,
    raceBytes: racePayload.raceXml.length,
    torqueSamples: racePayload.torqueCurve.length,
  });

  return {
    body: buildRaceStartResponseBody({ status: 1, ...racePayload }),
    source: "local:ctct",
  };
}

async function handleComputerTournamentRequest(context) {
  const { logger, params } = context;
  const session = getLocalSession(params.get("sk"));
  const requestParams = Object.fromEntries(params.entries());

  if (!session) {
    logger.warn("Local computer tournament opponent race rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: `"s", -100, "b", 0, "d", ""`,
      source: "local:ctrt:missing-session",
    };
  }

  const selectedCar = selectedGarageCarForCatalog(session.account, params);
  const accountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || selectedCar?.accountCarId || 0);
  const targetCar = findAccountGarageCar(session.account, accountCarId) || selectedCar;

  if (!targetCar) {
    logger.warn("Local computer tournament opponent race rejected because car was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
    });
    return {
      body: `"s", 0, "b", 0, "d", ""`,
      source: "local:ctrt:no-car",
    };
  }

  if (listedCarRaceBlocked(targetCar)) {
    logger.warn("Local computer tournament opponent race rejected because car is listed on used car lot", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId: targetCar.accountCarId,
      listingId: targetCar.usedCarListingId || 0,
    });
    return {
      body: `"s", 0, "b", 0, "d", ""`,
      source: "local:ctrt:listed-car",
    };
  }

  const state = localComputerTournamentState(session);
  const carChanged = Number(state.accountCarId || 0) > 0
    && Number(state.accountCarId || 0) !== Number(targetCar.accountCarId || 0);
  if (!state.bracketTime || state.bracketTimeSource === "fallback" || carChanged) {
    const bracketTimeResult = computerTournamentPlayerBracketTimeResult(params, session.account, targetCar, 12);
    state.bracketTime = bracketTimeResult.bracketTime;
    state.bracketTimeReliable = bracketTimeResult.reliable;
    state.bracketTimeSource = bracketTimeResult.source;
    state.bracketHorsepower = bracketTimeResult.horsepower || 0;
    state.bracketWeight = bracketTimeResult.weight || 0;
  }

  const difficulty = state.difficulty || computerTournamentDifficulty(params) || "amateur";
  const opponent = computerTournamentOpponent(params, state);
  const opponentDelay = Number(opponent.delay || 0);
  const opponentXml = computerTournamentOpponentXml(opponent, difficulty, state.wins);
  const opponentRosterIndex = COMPUTER_TOURNAMENT_FIELD_RACERS.findIndex((racer) => racer.id === opponent.id);
  const opponentStats = tournamentBotStats(opponent, opponentRosterIndex, difficulty);
  const opponentIdentity = tournamentBotIdentity(opponent, opponentRosterIndex);
  const bracketDifference = Number((state.bracketTime - opponentStats.bracketTime).toFixed(3));
  const payout = computerTournamentRoundPayout(difficulty, state.wins);
  state.phase = "race";
  state.difficulty = difficulty;
  state.accountCarId = Number(targetCar.accountCarId || 0);
  state.catalogCarId = Number(targetCar.catalogCarId || 0);
  state.currentOpponentId = opponent.id;
  state.currentOpponentRosterIndex = opponentRosterIndex;
  state.currentOpponentCompetitorId = opponentIdentity.competitorId;
  state.currentOpponentCarId = opponentIdentity.competitorCarId;
  state.currentOpponentVirtualCarId = opponentIdentity.virtualCarId;
  state.currentOpponentBracketTime = opponentStats.bracketTime;
  state.currentOpponentReactionTime = opponentStats.reactionTime;
  state.currentOpponentElapsedTime = opponentStats.elapsedTime;
  state.currentOpponentTrapSpeed = opponentStats.trapSpeed;
  state.currentOpponentTotalTime = opponentStats.totalTime;
  state.currentPayout = payout;

  logger.info("Local computer tournament opponent race accepted", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId: targetCar.accountCarId,
    catalogCarId: targetCar.catalogCarId,
    opponentId: opponent.id,
    opponent: opponent.username,
    difficulty,
    opponentDelay,
    playerBracketTime: state.bracketTime,
    playerBracketTimeReliable: Boolean(state.bracketTimeReliable),
    playerBracketTimeSource: state.bracketTimeSource || "unknown",
    playerBracketHorsepower: state.bracketHorsepower || 0,
    playerBracketWeight: state.bracketWeight || 0,
    opponentBracketTime: opponentStats.bracketTime,
    roundWins: state.wins,
    bracketDifference,
    payout,
    requestParams,
    opponentBytes: opponentXml.length,
  });

  return {
    body: `"s", 1, "d", "${quoteLingoString(opponentXml)}", "b", ${bracketDifference}`,
    source: "local:ctrt",
  };
}

async function handleComputerTournamentSave(context) {
  const session = getLocalSession(context.params.get("sk"));
  const hasPlayerReactionTime = tournamentHasParam(
    context.params,
    ["rt", "r", "reaction", "reactiontime"],
  );
  const elapsedTime = tournamentNumericParam(
    context.params,
    ["et", "e", "t", "time", "ge", "elapsed", "elapsedtime"],
    0,
  );
  const reactionTime = tournamentSignedNumericParam(
    context.params,
    ["rt", "r", "reaction", "reactiontime"],
    COMPUTER_TOURNAMENT_PERFECT_REACTION_TIME_SECONDS,
  );
  const reportedWinState = Number(context.params.get("w") || 1) ? 1 : 0;
  const state = localComputerTournamentState(session);
  const difficulty = state?.difficulty || computerTournamentDifficulty(context.params) || "amateur";
  const isQualifyingSave = Boolean(session && state?.phase === "qualifying");
  const bracketTime = Number(state?.bracketTime || 0);
  const currentOpponent = COMPUTER_TOURNAMENT_FIELD_RACERS.find((racer) => (
    Number(racer.id || 0) === Number(state?.currentOpponentId || 0)
  )) || computerTournamentOpponent(context.params, state);
  const currentOpponentRosterIndex = COMPUTER_TOURNAMENT_FIELD_RACERS.findIndex((racer) => (
    Number(racer.id || 0) === Number(currentOpponent?.id || 0)
  ));
  const currentOpponentStats = currentOpponent
    ? tournamentBotStats(currentOpponent, currentOpponentRosterIndex, difficulty)
    : null;
  const roundReward = isQualifyingSave
    ? { money: 0, points: 0 }
    : computerTournamentRoundReward(difficulty, state?.wins || 0);
  const payout = isQualifyingSave
    ? 0
    : Number(context.params.get("b") || state?.currentPayout || roundReward.money) || 0;
  const pointsPayout = isQualifyingSave ? 0 : Number(roundReward.points || 0);
  const playerFoul = Boolean(
    !isQualifyingSave
      && session
      && hasPlayerReactionTime
      && isComputerTournamentFoulReactionTime(reactionTime, context.params)
  );
  const playerScore = !isQualifyingSave && session
    ? scoreComputerTournamentRacer({
      side: "player",
      elapsedTime,
      reactionTime,
      bracketTime,
      foul: playerFoul,
      dns: elapsedTime <= 0,
      finishIndex: 0,
    })
    : null;
  const opponentScore = !isQualifyingSave && currentOpponentStats
    ? scoreComputerTournamentRacer({
      side: "opponent",
      elapsedTime: currentOpponentStats.elapsedTime,
      reactionTime: currentOpponentStats.reactionTime,
      bracketTime: currentOpponentStats.bracketTime,
      trapSpeed: currentOpponentStats.trapSpeed,
      foul: false,
      dns: false,
      finishIndex: 1,
    })
    : null;
  const raceResult = !isQualifyingSave && playerScore && opponentScore
    ? resolveComputerTournamentRaceResult(playerScore, opponentScore)
    : null;
  const playerWon = Boolean(raceResult?.winner?.side === "player");
  const playerBreakout = Boolean(playerScore?.breakout);
  const opponentBreakout = Boolean(opponentScore?.breakout);
  const awardedMoney = playerWon ? payout : 0;
  const awardedPoints = playerWon ? pointsPayout : 0;
  let winState = reportedWinState;
  let rewardResult = null;

  if (isQualifyingSave) {
    const bracketTimeResult = tournamentPlayerBracketTimeResult(context.params, state.bracketTime || 12);
    state.bracketTime = bracketTimeResult.bracketTime;
    state.bracketTimeReliable = bracketTimeResult.reliable;
    state.bracketTimeSource = bracketTimeResult.source;
    state.phase = "bracket";
    state.wins = 0;
    winState = 1;
  } else if (session && playerWon) {
    const store = new LocalAccountStore({ dataRoot: context.config.dataRoot });
    rewardResult = await store.awardTournamentReward({
      accountId: session.account.id,
      money: awardedMoney,
      points: awardedPoints,
    });
    if (rewardResult?.ok) {
      Object.assign(session.account, rewardResult.account);
    }

    state.wins += 1;
    winState = state.wins >= COMPUTER_TOURNAMENT_ROUNDS_TO_WIN ? 2 : 1;
    state.phase = winState === 2 ? "complete" : "bracket";
  } else if (session) {
    state.phase = "eliminated";
    state.wins = 0;
    winState = 0;
  }

  const winnerSide = raceResult?.winner?.side || "";
  const resultXml = (
    `<n2 w='${winState}' b='${awardedMoney}' p='${awardedPoints}' ` +
    `pw='${playerWon ? 1 : 0}' ow='${winnerSide === "opponent" ? 1 : 0}' ` +
    `bo='${playerBreakout ? 1 : 0}' fo='${playerFoul ? 1 : 0}' ` +
    `obo='${opponentBreakout ? 1 : 0}' of='0' ` +
    `rt='${playerScore?.reactionTime ?? reactionTime}' et='${playerScore?.elapsedTime ?? elapsedTime}' ` +
    `bt='${playerScore?.bracketTime ?? bracketTime}' tt='${Number.isFinite(playerScore?.totalTime) ? playerScore.totalTime : 0}' ` +
    `ort='${opponentScore?.reactionTime ?? 0}' oet='${opponentScore?.elapsedTime ?? 0}' ` +
    `obt='${opponentScore?.bracketTime ?? 0}' ott='${Number.isFinite(opponentScore?.totalTime) ? opponentScore.totalTime : 0}' ` +
    `r='${escapeXmlAttribute(raceResult?.reason || "")}'/>`
  );

  context.logger.info("Local computer tournament result saved", {
    accountId: session?.account?.id || 0,
    username: session?.account?.username || "<unknown>",
    elapsedTime,
    reactionTime,
    winState,
    reportedWinState,
    serverResolvedWinner: winnerSide || "qualifying",
    serverResolvedReason: raceResult?.reason || "qualifying",
    roundWins: state?.wins || 0,
    bracketTime: state?.bracketTime || 0,
    bracketTimeReliable: Boolean(state?.bracketTimeReliable),
    bracketTimeSource: state?.bracketTimeSource || "unknown",
    playerFoul,
    playerBreakout,
    opponentBreakout,
    opponent: currentOpponent?.username || "",
    opponentId: currentOpponent?.id || 0,
    opponentElapsedTime: opponentScore?.elapsedTime ?? null,
    opponentReactionTime: opponentScore?.reactionTime ?? null,
    playerPackageDelta: playerScore?.packageDelta ?? null,
    opponentPackageDelta: opponentScore?.packageDelta ?? null,
    underDialBy: playerBreakout
      ? Number((bracketTime - elapsedTime).toFixed(3))
      : 0,
    phase: state?.phase || "missing-session",
    payout: awardedMoney,
    pointsPayout: awardedPoints,
    moneyBalance: rewardResult?.moneyBalance ?? session?.account?.money,
    pointsBalance: rewardResult?.pointsBalance ?? session?.account?.points,
    requestParams: Object.fromEntries(context.params.entries()),
  });

  return {
    body: `"s", ${session ? 1 : -100}, "sk", "${quoteLingoString(context.params.get("sk") || "")}", "d", "${quoteLingoString(resultXml)}"`,
    source: session ? "local:ctst" : "local:ctst:missing-session",
  };
}

async function handlePractice(context) {
  const { logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local practice rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:practice:missing-session",
    };
  }

  const accountCarId = Number(params.get("acid") || 0);
  const targetCar = findAccountGarageCar(session.account, accountCarId);

  if (!targetCar) {
    logger.warn("Local practice rejected because car was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
    });
    return {
      body: statusBody(0),
      source: "local:practice:no-car",
    };
  }

  if (listedCarRaceBlocked(targetCar)) {
    logger.warn("Local practice rejected because car is listed on used car lot", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      listingId: targetCar.usedCarListingId || 0,
    });
    return {
      body: statusBody(0),
      source: "local:practice:listed-car",
    };
  }

  const racePayload = buildRaceEnginePayload(session.account, targetCar);
  logger.info("Local practice session accepted", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId,
    catalogCarId: targetCar.catalogCarId,
    raceBytes: racePayload.raceXml.length,
    torqueSamples: racePayload.torqueCurve.length,
    tirePartId: racePayload.tirePartId,
    tireStick: racePayload.tireStick,
    gripCoefficient: racePayload.gripCoefficient,
    tractionControl: racePayload.tractionControl,
    boostType: racePayload.boostType,
    boostSource: racePayload.boostSource,
    stockBoost: racePayload.stockBoost,
    xmlStockBoost: racePayload.xmlStockBoost,
    boostSetting: racePayload.boostSetting,
    effectiveBoostSetting: racePayload.effectiveBoostSetting,
    xmlBoostSetting: racePayload.xmlBoostSetting,
    maxPsi: racePayload.maxPsi,
    boostEffectScale: racePayload.boostEffectScale,
    boostFlow: racePayload.boostFlow,
    gearRatios: racePayload.gearRatios,
    defaultGearRatios: racePayload.defaultGearRatios,
    nitrousShot: racePayload.nitrousShot,
    nitrousRemaining: racePayload.nitrousRemaining,
    nitrousTankSize: racePayload.nitrousTankSize,
    airDemand: racePayload.airDemand,
    overallAirFlowLimit: racePayload.overallAirFlowLimit,
    fuelFlowLimit: racePayload.fuelFlowLimit,
    chipSetting: racePayload.chipSetting,
    airFuelMeterCapability: racePayload.airFuelMeterCapability,
    airflowBonus: racePayload.airflowBonus,
    fuelBonus: racePayload.fuelBonus,
    tuneBonus: racePayload.tuneBonus,
  });

  return {
    body: buildRaceStartResponseBody({ status: 1, ...racePayload }),
    source: "local:practice",
  };
}

async function handlePracticeLifecycleAck(context) {
  const rawElapsedTime = numericParam(
    context.params,
    ["et", "e", "t", "time", "elapsed", "elapsedtime", "elapsedTime"],
    0,
  );
  const trapSpeed = numericParam(context.params, ["ts", "mph", "d", "trapspeed", "trapSpeed"], 0);
  const stabilizedResult = stabilizedPracticeElapsedTime(rawElapsedTime);

  context.logger.info("Local practice lifecycle acknowledged", {
    action: context.action || "<unknown>",
    accountId: context.params.get("aid") || "<empty>",
    accountCarId: context.params.get("acid") || context.params.get("cid") || "<empty>",
    elapsedTime: stabilizedResult.elapsedTime || undefined,
    rawElapsedTime: rawElapsedTime || undefined,
    elapsedTimeStabilized: stabilizedResult.stabilized || undefined,
    practiceEtAnchor: stabilizedResult.anchor || undefined,
    trapSpeed: trapSpeed || undefined,
  });

  if (stabilizedResult.elapsedTime > 0) {
    const resultXml =
      `<r et='${stabilizedResult.elapsedTime}' e='${stabilizedResult.elapsedTime}' ` +
      `t='${stabilizedResult.elapsedTime}' rawet='${stabilizedResult.rawElapsedTime}' ` +
      `ts='${trapSpeed}' mph='${trapSpeed}' d='${trapSpeed}' ` +
      `st='${stabilizedResult.stabilized ? 1 : 0}' a='${stabilizedResult.anchor}'/>`;
    return {
      body:
        `"s", 1, "et", ${stabilizedResult.elapsedTime}, "e", ${stabilizedResult.elapsedTime}, ` +
        `"t", ${stabilizedResult.elapsedTime}, "rawet", ${stabilizedResult.rawElapsedTime}, ` +
        `"ts", ${trapSpeed}, "st", ${stabilizedResult.stabilized ? 1 : 0}, ` +
        `"a", ${stabilizedResult.anchor}, "d", "${quoteLingoString(resultXml)}"`,
      source: `local:${String(context.action || "practiceend").toLowerCase()}:result`,
    };
  }

  return {
    body: statusBody(1),
    source: `local:${String(context.action || "practiceend").toLowerCase()}`,
  };
}

async function handleGetOneCarEngine(context) {
  const { logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local one-car engine request rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:getonecarengine:missing-session",
    };
  }

  const accountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || 0);
  const targetCar = findAccountGarageCar(session.account, accountCarId);

  if (!targetCar) {
    logger.warn("Local one-car engine request rejected because car was not found", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
    });
    return {
      body: statusBody(0),
      source: "local:getonecarengine:no-car",
    };
  }

  const racePayload = buildRaceEnginePayload(session.account, targetCar);
  logger.info("Local one-car engine XML served", {
    accountId: session.account.id,
    username: session.account.username,
    accountCarId,
    catalogCarId: targetCar.catalogCarId,
    raceBytes: racePayload.raceXml.length,
    torqueSamples: racePayload.torqueCurve.length,
    tirePartId: racePayload.tirePartId,
    tireStick: racePayload.tireStick,
    gripCoefficient: racePayload.gripCoefficient,
    tractionControl: racePayload.tractionControl,
    boostType: racePayload.boostType,
    boostSource: racePayload.boostSource,
    stockBoost: racePayload.stockBoost,
    xmlStockBoost: racePayload.xmlStockBoost,
    boostSetting: racePayload.boostSetting,
    effectiveBoostSetting: racePayload.effectiveBoostSetting,
    xmlBoostSetting: racePayload.xmlBoostSetting,
    maxPsi: racePayload.maxPsi,
    boostEffectScale: racePayload.boostEffectScale,
    boostFlow: racePayload.boostFlow,
    gearRatios: racePayload.gearRatios,
    defaultGearRatios: racePayload.defaultGearRatios,
    nitrousShot: racePayload.nitrousShot,
    nitrousRemaining: racePayload.nitrousRemaining,
    nitrousTankSize: racePayload.nitrousTankSize,
    airDemand: racePayload.airDemand,
    overallAirFlowLimit: racePayload.overallAirFlowLimit,
    fuelFlowLimit: racePayload.fuelFlowLimit,
    chipSetting: racePayload.chipSetting,
    airFuelMeterCapability: racePayload.airFuelMeterCapability,
    airflowBonus: racePayload.airflowBonus,
    fuelBonus: racePayload.fuelBonus,
    tuneBonus: racePayload.tuneBonus,
  });

  return {
    body: buildRaceStartResponseBody({ status: 1, ...racePayload }),
    source: "local:getonecarengine",
  };
}

async function handleGetTwoRacersCars(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local two-racer car request rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:gettworacerscars:missing-session",
    };
  }

  const requestedCarIds = [
    Number(params.get("r1acid") || params.get("acid") || 0),
    Number(params.get("r2acid") || 0),
  ].filter((accountCarId) => Number.isFinite(accountCarId) && accountCarId > 0);
  const requestedAccountIds = [
    accountIdParam(params, ["r1aid", "r1id", "r1uid", "r1pid", "aid1", "id1", "pid1", "p1id"]),
    accountIdParam(params, ["r2aid", "r2id", "r2uid", "r2pid", "aid2", "id2", "pid2", "p2id"]),
  ];
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.searchAccounts("", { page: 1, pageSize: 10000 });
  const accounts = Array.isArray(result.accounts) ? result.accounts : [session.account];
  const effectiveAccountIds = inferRacerAccountIds(accounts, session.account, requestedCarIds, requestedAccountIds);
  const carXml = buildRacersCarsXml(accounts, session.account, requestedCarIds, effectiveAccountIds);
  const resolvedCars = describeResolvedRacerCars(accounts, requestedCarIds, effectiveAccountIds);

  if (!requestedCarIds.length || !carXml.includes("<c ")) {
    logger.warn("Local two-racer car request rejected because no cars were found", {
      accountId: session.account.id,
      username: session.account.username,
      requestedCarIds,
      requestedAccountIds,
      effectiveAccountIds,
    });
    return {
      body: statusBody(0),
      source: "local:gettworacerscars:no-car",
    };
  }

  logger.info("Local two-racer car XML served", {
    accountId: session.account.id,
    username: session.account.username,
    requestedCarIds,
    requestedAccountIds,
    effectiveAccountIds,
    resolvedCars,
    bytes: carXml.length,
  });

  return {
    body: successData(carXml),
    source: "local:gettworacerscars",
  };
}

async function handleGetRacersCars(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local racers cars request rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:getracerscars:missing-session",
    };
  }

  const requestedCarIds = String(params.get("acids") || "")
    .split(",")
    .map((value) => Number(value))
    .filter((accountCarId, index) => (
      (Number.isFinite(accountCarId) && accountCarId > 0)
      || (index === 0 && String(params.get("acids") || "").split(",")[index]?.toLowerCase() === "nan")
    ));
  const fallbackCar = selectedGarageCarForCatalog(session.account, new URLSearchParams());
  const fallbackAccountCarId = Number(fallbackCar?.accountCarId || 0);
  const effectiveCarIds = [...requestedCarIds];

  if (
    effectiveCarIds.length >= 2
    && Number(effectiveCarIds[0] || 0) === Number(effectiveCarIds[1] || 0)
    && fallbackAccountCarId > 0
    && fallbackAccountCarId !== Number(effectiveCarIds[0] || 0)
  ) {
    effectiveCarIds[0] = fallbackAccountCarId;
    logger.info("Local racers cars duplicate request repaired", {
      accountId: session.account.id,
      username: session.account.username,
      requestedCarIds,
      effectiveCarIds,
      acids: params.get("acids") || "",
    });
  }

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.searchAccounts("", { page: 1, pageSize: 10000 });
  const accounts = Array.isArray(result.accounts) ? result.accounts : [session.account];
  const carXml = buildRacersCarsXml(accounts, session.account, effectiveCarIds);

  if (!requestedCarIds.length || !carXml.includes("<c")) {
    logger.warn("Local racers cars request rejected because no cars were found", {
      accountId: session.account.id,
      username: session.account.username,
      requestedCarIds,
      effectiveCarIds,
      acids: params.get("acids") || "",
    });
    return {
      body: statusBody(0),
      source: "local:getracerscars:no-car",
    };
  }

  logger.info("Local racers cars XML served", {
    accountId: session.account.id,
    username: session.account.username,
    requestedCarIds,
    effectiveCarIds,
    acids: params.get("acids") || "",
    bytes: carXml.length,
  });

  return {
    body: successData(carXml),
    source: "local:getracerscars",
  };
}

function moveLocationStatusForPayment(paymentType) {
  return String(paymentType || "").toLowerCase() === "p" ? 1 : 2;
}

async function handleMoveLocation(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local move location rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:movelocation:missing-session",
    };
  }

  const locationId = Number(params.get("lid") || params.get("l") || params.get("id") || 0);
  const paymentType = String(params.get("pt") || "m").toLowerCase() === "p" ? "p" : "m";
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.moveLocation({
    accountId: session.account.id,
    locationId,
    paymentType,
  });

  if (!result.ok) {
    logger.warn("Local move location rejected", {
      accountId: session.account.id,
      username: session.account.username,
      locationId,
      paymentType,
      reason: result.reason || "unknown",
    });
    return {
      body: `"s", ${Number(result.code) || 0}, "m", ${Number(result.balance) || 0}`,
      source: `local:movelocation:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  const status = moveLocationStatusForPayment(result.paymentType);

  logger.info("Local home location moved", {
    accountId: result.account.id,
    username: result.account.username,
    locationId: result.account.locationId,
    paymentType: result.paymentType,
    price: result.price,
    balance: result.balance,
  });

  return {
    body: `"s", ${status}, "m", ${Number(result.balance) || 0}`,
    source: "local:movelocation",
  };
}

async function handleUpdateDefaultCar(context) {
  const { config, logger, params } = context;
  const session = getLocalSession(params.get("sk"));

  if (!session) {
    logger.warn("Local default car update rejected because session was not found", {
      accountId: params.get("aid") || "<empty>",
      hasSessionKey: Boolean(params.get("sk")),
    });
    return {
      body: statusBody(-100),
      source: "local:updatedefaultcar:missing-session",
    };
  }

  const accountCarId = Number(params.get("acid") || params.get("cid") || params.get("i") || 0);
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.updateDefaultCar({
    accountId: session.account.id,
    accountCarId,
  });

  if (!result.ok) {
    logger.warn("Local default car update rejected", {
      accountId: session.account.id,
      username: session.account.username,
      accountCarId,
      reason: result.reason || "unknown",
    });
    return {
      body: statusBody(result.code || 0),
      source: `local:updatedefaultcar:${result.reason || "rejected"}`,
    };
  }

  session.account = result.account;
  logger.info("Local default car updated", {
    accountId: result.account.id,
    username: result.account.username,
    accountCarId,
  });

  return {
    body: statusBody(1),
    source: "local:updatedefaultcar",
  };
}

async function handleAccountAlreadyVerified() {
  return {
    body: statusBody(1),
    source: "local:account-verification-bypassed",
  };
}

async function handleCreateAccount(context) {
  const { config, logger, params } = context;

  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.createAccount({
    username: params.get("un") || params.get("u") || params.get("username"),
    password: params.get("pw") || params.get("p") || params.get("password"),
    confirmPassword: params.get("cpw") || params.get("confirmPassword"),
    email: params.get("ea") || params.get("email"),
    zipCode: params.get("zc") || params.get("zip") || params.get("z"),
    birthYear: params.get("by") || params.get("birthYear") || params.get("y"),
    gender: params.get("g") || params.get("gender"),
    facebookCreate: params.get("fbc"),
    catalogCarId: params.get("cid") || params.get("ci"),
    color: params.get("clr") || params.get("color"),
    wheelPartId: params.get("wid") || params.get("wheelPartId"),
  });

  if (!result.ok) {
    return {
      body: statusBody(result.code || -10),
      source: `local:createaccount:${result.reason || "rejected"}`,
    };
  }

  logger.info("Local account created", {
    accountId: result.account.id,
    username: result.account.username,
    starterCar: result.account.starterCar,
  });

  return {
    body: statusBody(1),
    source: "local:createaccount",
  };
}

async function handleLogin(context) {
  const { config, logger, params } = context;
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const result = await store.loginOrCreate({
    username: params.get("u") || params.get("un") || params.get("username"),
    password: params.get("p") || params.get("pw") || params.get("password"),
  });

  if (!result.ok) {
    logger.warn("Local login rejected", {
      username: params.get("u") || params.get("un") || params.get("username") || "<empty>",
      reason: result.reason || "unknown",
    });
    return {
      body: statusBody(result.code || 0),
      source: `local:login:${result.reason || "rejected"}`,
    };
  }

  const sessionKey = createLocalSession(result.account);

  logger.info(result.created ? "Local account created from login" : "Local account login accepted", {
    accountId: result.account.id,
    username: result.account.username,
    starterCar: result.account.starterCar,
  });

  return {
    body: buildLoginBody(result.account, sessionKey),
    source: result.created ? "local:login:create" : "local:login",
  };
}

export async function handleHttpAction(context) {
  const action = String(context.action || "").toLowerCase();
  const handler = handlers.get(action);

  if (!handler) {
    context.logger.warn("HTTP game action is not implemented yet", {
      action: context.action || "<empty>",
      decodedQuery: context.decodedQuery,
    });
    return {
      body: notImplementedBody(),
      source: `not-implemented:${context.action || "unknown"}`,
    };
  }

  return handler(context);
}
