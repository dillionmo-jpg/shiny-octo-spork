import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createJsonStorageClient } from "../src/json-storage-client.js";
import { hashGamePassword, normalizeUsername } from "../src/player-identity.js";
import { getPlayerByUsername, createPlayer, updatePlayerDefaultCar } from "../src/data-access/players.js";
import { createOwnedCar } from "../src/data-access/cars.js";
import {
  DEFAULT_COLOR_CODE,
  DEFAULT_STARTER_CATALOG_CAR_ID,
  getDefaultWheelXmlForCar,
  getDefaultPartsXmlForCar,
} from "../src/car-defaults.js";

function loadDotEnv(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = value;
  }
  return env;
}

function getArg(name, fallback = "") {
  const long = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(long));
  if (found) return found.slice(long.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const fileEnv = loadDotEnv(resolve(process.cwd(), ".env"));
const env = { ...fileEnv, ...process.env };

const username = normalizeUsername(getArg("username", process.env.NITTO_USERNAME || ""));
const password = getArg("password", process.env.NITTO_PASSWORD || "");
const gender = String(getArg("gender", "m")).toLowerCase().startsWith("f") ? "f" : "m";
const imageId = Number(getArg("image", "0")) || 0;
const money = Number(getArg("money", "5000000")) || 5000000;
const points = Number(getArg("points", "5000000")) || 5000000;
const carId = Number(getArg("car", String(DEFAULT_STARTER_CATALOG_CAR_ID))) || DEFAULT_STARTER_CATALOG_CAR_ID;
const color = String(getArg("color", DEFAULT_COLOR_CODE) || DEFAULT_COLOR_CODE).replace(/^#/, "").toUpperCase();

if (!username || !password) {
  console.error("Usage: node tools/create-local-account.mjs --username User --password test123");
  process.exit(1);
}

const dataDir = resolve(process.cwd(), env.DATA_DIR || "./data/json-db");
const supabase = createJsonStorageClient({ dataDir, logger: console });

const existing = await getPlayerByUsername(supabase, username);
if (existing) {
  console.error(`Account already exists: ${username} (player id ${existing.id})`);
  process.exit(2);
}

const player = await createPlayer(supabase, {
  username,
  passwordHash: hashGamePassword(password),
  gender,
  imageId,
  money,
  points,
  score: 0,
  clientRole: 5,
});

if (!player?.id) {
  console.error("Failed to create player.");
  process.exit(3);
}

const car = await createOwnedCar(supabase, {
  playerId: player.id,
  catalogCarId: carId,
  selected: true,
  plateName: "",
  colorCode: color,
  partsXml: getDefaultPartsXmlForCar(carId),
  wheelXml: getDefaultWheelXmlForCar(carId),
});

if (car?.game_car_id) {
  await updatePlayerDefaultCar(supabase, player.id, car.game_car_id);
}

console.log("");
console.log("Created local JSON account:");
console.log(`  Username: ${username}`);
console.log(`  Password: ${password}`);
console.log(`  PlayerID: ${player.id}`);
console.log(`  Starter car catalog ID: ${carId}`);
console.log(`  Starter game car ID: ${car?.game_car_id || "unknown"}`);
console.log(`  JSON folder: ${dataDir}`);
console.log("");
