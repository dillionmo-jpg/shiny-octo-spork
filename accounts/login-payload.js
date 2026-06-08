import { quoteLingoString } from "../../protocol/response.js";
import {
  buildPaintCategoriesXml,
  buildPaintsXml,
} from "../paint/paint-catalog.js";
import { buildLicensePlatesXml, samplePlateNumber } from "../license/license-catalog.js";
import {
  FULL_CAR_CATALOG,
  renderOwnedGarageCarXml,
} from "../showroom/car-showroom.js";
import {
  accountMembershipFlag,
  accountStatusClass,
  accountStatusColor,
} from "./account-status.js";
import {
  DEFAULT_STARTER_CATALOG_CAR_ID,
  DEFAULT_LOCATION_ID,
  DEFAULT_STARTING_MONEY,
  DEFAULT_STARTING_POINTS,
} from "./local-account-store.js";
import {
  accountStreetCredit,
  buildStreetCreditLevelsBootstrapNode,
  streetCreditRankName,
} from "./street-credit.js";
import { buildBadgeCatalogXml } from "./profile-badges.js";

const ENABLE_LOGIN_SYSTEM_MESSAGE = false;
const ENABLE_LOGIN_POLL = false;
const LOGIN_SYSTEM_MESSAGE = "Welcome to Nitto Legends!";
const DISABLED_BROADCAST_ID = 999999;
const PREFS_WRITE_PADDING = "0".repeat(512);

const STOCK_WHEEL = {
  wheelId: 1,
  partId: 1001,
  size: 17,
};

const STOCK_TIRE = {
  designId: 1,
  partId: 1300,
  size: 5,
};

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

const STATIC_BROADCAST_XML = renderNode("n", { id: "broadcast" }, renderNode("b", {
  i: 1,
  m: LOGIN_SYSTEM_MESSAGE,
}));

const STATIC_DISABLED_BROADCAST_XML = renderNode("n", { id: "broadcast" }, renderNode("b", {
  i: DISABLED_BROADCAST_ID,
  m: "",
}));

const STATIC_DISABLED_INTRO_XML = renderNode("n", { id: "intro" }, [
  renderNode("n", { id: "dailyLogin" }, renderNode("s", {}, [
    renderNode("d", { a: 0 }),
    renderNode("d", { a: 0 }),
    renderNode("d", { a: 0 }),
    renderNode("d", { a: 0 }),
    renderNode("d", { a: 0 }),
    renderNode("d", { i: "" }),
  ].join(""))),
  renderNode("n", { id: "pwc" }, renderNode("x")),
  renderNode("n", { id: "banner" }, renderNode("outer", {}, renderNode("inner"))),
  renderNode("n", { id: "dailyChallenge" }, renderNode("s", {}, renderNode("x", {
    ct: 5,
    w: 3,
    c: 0,
    et: "2027-01-01 23:59:59",
    tt: 0,
    tr: 0,
    bp: 5000,
    mp: 5000,
    pp: 50,
    ptp: 0,
    eptp: 0,
    sc: 100,
    pn: "Daily Win Bonus",
    imf: "",
    ci: 0,
    pa: 500,
  }))),
  renderNode("s"),
].join(""));

function localPrefsTimestamp() {
  return `${new Date().toISOString()}-local-broadcast-disabled-${PREFS_WRITE_PADDING}`;
}

function starterCarFor(account) {
  const starterCar = account.starterCar || {};

  return {
    accountCarId: Number(starterCar.accountCarId || account.id) || 1,
    catalogCarId: Number(starterCar.catalogCarId || DEFAULT_STARTER_CATALOG_CAR_ID),
    color: String(starterCar.color || "C0C0C0").replace(/[^0-9a-f]/gi, "").slice(0, 6) || "C0C0C0",
    wheelPartId: Number(starterCar.wheelPartId || STOCK_WHEEL.partId),
    wheelDesignId: Number(starterCar.wheelDesignId || STOCK_WHEEL.wheelId),
    wheelSize: Number(starterCar.wheelSize || STOCK_WHEEL.size),
    tirePartId: Number(starterCar.tirePartId || STOCK_TIRE.partId),
    tireDesignId: Number(starterCar.tireDesignId || STOCK_TIRE.designId),
    tireSize: Number(starterCar.tireSize || STOCK_TIRE.size),
    plateId: Number(starterCar.plateId || 1),
    plateNumber: String(starterCar.plateNumber || samplePlateNumber(starterCar.plateId || 1)),
    partsXml: String(starterCar.partsXml || ""),
  };
}

function garageCarsFor(account) {
  const starterCar = starterCarFor(account);
  const extraCars = Array.isArray(account.garageCars) ? account.garageCars : [];

  return [starterCar, ...extraCars];
}

function accountBalance(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function accountTeamId(account) {
  return Number(account?.teamId || account?.team_id || 0) || 0;
}

function accountTeamName(account) {
  const teamId = accountTeamId(account);
  return teamId
    ? String(account?.teamName || account?.team_name || "")
    : String(account?.username || "Racer");
}

function accountTeamRole(account) {
  const teamRole = Number(account?.teamRole || account?.team_role || 0);
  return Number.isFinite(teamRole) ? teamRole : 0;
}

function accountLocationId(account) {
  return Number(account.locationId || account.starterCar?.locationId || DEFAULT_LOCATION_ID) || DEFAULT_LOCATION_ID;
}

function accountRole(account) {
  return accountStatusClass(account);
}

function renderGarageCar(account) {
  const cars = garageCarsFor(account);
  const defaultCarId = Number(account.defaultCarAccountCarId || account.starterCar?.accountCarId || account.id || 0);

  return cars
    .map((car, index) => renderOwnedGarageCarXml(account, {
      ...car,
      locationId: car.locationId || accountLocationId(account),
    }, {
      selected: defaultCarId
        ? Number(car.accountCarId) === defaultCarId
        : index === 0,
    }))
    .join("");
}

function renderLoginNode(account) {
  const starterCar = starterCarFor(account);
  const locationId = accountLocationId(account);
  const streetCredit = accountStreetCredit(account);
  const streetCreditRank = streetCreditRankName(streetCredit);
  const teamId = accountTeamId(account);
  const teamName = accountTeamName(account);
  const teamRole = accountTeamRole(account);

  return renderNode("n", { id: "login" }, renderNode("u", {
    i: account.id,
    u: account.username,
    un: account.username,
    n: account.username,
    user: account.username,
    username: account.username,
    userName: account.username,
    name: account.username,
    dn: account.username,
    displayName: account.username,
    displayname: account.username,
    tn: teamName,
    teamName,
    teamname: teamName,
    r: accountRole(account),
    m: accountBalance(account.money, DEFAULT_STARTING_MONEY),
    p: accountBalance(account.points, DEFAULT_STARTING_POINTS),
    sc: streetCredit,
    scr: streetCreditRank,
    scRank: streetCreditRank,
    streetCreditRank,
    im: 0,
    act: 1,
    dc: starterCar.accountCarId,
    lid: locationId,
    l: locationId,
    ti: teamId,
    tid: teamId,
    tr: teamRole,
    tf: accountStatusColor(account),
    mb: accountMembershipFlag(account),
    vip: accountMembershipFlag(account),
    fbc: 0,
    alr: 1,
    bpr: 1,
    sr: 0,
    bg: "000000",
    dt: localPrefsTimestamp(),
  }));
}

function renderBroadcastNode() {
  return ENABLE_LOGIN_SYSTEM_MESSAGE ? STATIC_BROADCAST_XML : STATIC_DISABLED_BROADCAST_XML;
}

function renderIntroNode() {
  return ENABLE_LOGIN_POLL ? renderNode("n", { id: "intro" }, renderNode("n", { id: "poll" }, renderNode("s"))) : STATIC_DISABLED_INTRO_XML;
}

export function buildGarageXml(account) {
  return renderNode("cars", { id: "getallcars" }, renderGarageCar(account));
}

function buildCatalogCarsBootstrapNode() {
  const cars = FULL_CAR_CATALOG
    .map((car) => renderNode("c", {
      id: car.id,
      i: car.id,
      ci: car.id,
      c: car.name,
      n: car.name,
      l: car.locationId,
      lid: car.locationId,
      pi: car.brandCategoryId,
    }))
    .join("");

  return renderNode("n", { id: "cars" }, cars);
}

function buildLoginXml(account) {
  const nodes = [
    renderLoginNode(account),
    renderNode("n", { id: "locations" }, [
      renderNode("loc", { lid: 100, ln: "Toreno", f: 0, pf: 0, r: 0, ps: 3, sc: 0 }),
      renderNode("loc", { lid: 200, ln: "Newburge", f: 10000, pf: 100, r: 500, ps: 5, sc: 0 }),
      renderNode("loc", { lid: 300, ln: "Creek Side", f: 50000, pf: 500, r: 2000, ps: 8, sc: 0 }),
      renderNode("loc", { lid: 400, ln: "Vista Heights", f: 150000, pf: 1500, r: 5000, ps: 12, sc: 0 }),
      renderNode("loc", { lid: 500, ln: "Diamond Point", f: 500000, pf: 5000, r: 10000, ps: 20, sc: 0 }),
    ].join("")),
    buildStreetCreditLevelsBootstrapNode(),
    buildLicensePlatesXml(),
    buildPaintCategoriesXml(),
    buildPaintsXml(),
    renderNode("n", { id: "banners" }, renderNode("w")),
    buildGarageXml(account),
    renderNode("n", { id: "dyno" }),
    buildBadgeCatalogXml(),
    renderNode("n", { id: "gears", p: 100, pp: 1 }),
    renderBroadcastNode(),
    buildCatalogCarsBootstrapNode(),
    renderNode("n", { id: "impound", p: 500, pd: 100 }),
    renderNode("n", { id: "usedcar", p: 0, mp: 0, c: 0, mc: 0, t: 0, mt: 0 }),
    renderNode("n", { id: "testdrivecar" }),
    renderNode("n", { id: "userDecalBans", s: 0 }),
    renderIntroNode(),
  ];

  return renderNode("n", { id: "bootstrap" }, nodes.join(""));
}

export function buildLoginBody(account, sessionKey) {
  return [
    `"s", 1`,
    `"d", "${quoteLingoString(buildLoginXml(account))}"`,
    `"aid", ${Number(account.id) || 0}`,
    `"guid", "${quoteLingoString(sessionKey)}"`,
    `"cp", "NittoLegendsBeta"`,
    `"cw", "Nitto Legends"`,
    `"cwc", "NittoLegendsBeta"`,
    `"at", 0`,
    `"am", 0`,
  ].join(", ");
}
