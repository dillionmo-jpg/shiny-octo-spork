import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...loadDotEnv(resolve(process.cwd(), ".env")), ...process.env };
const dataDir = resolve(process.cwd(), env.DATA_DIR || "./data/json-db");
const file = resolve(dataDir, "game_sessions.json");

if (!existsSync(file)) {
  console.log(`No session file found: ${file}`);
  process.exit(0);
}

const rows = JSON.parse(readFileSync(file, "utf8") || "[]");
const now = new Date().toISOString();
let fixed = 0;
for (const row of rows) {
  if (!row.last_seen_at) {
    row.last_seen_at = row.created_at || row.updated_at || now;
    fixed += 1;
  }
}
writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
console.log(`Fixed ${fixed} session row(s) in ${file}`);
