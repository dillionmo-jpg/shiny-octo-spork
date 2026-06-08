import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const gameActionsPath = resolve(projectRoot, "src", "game-actions.js");

if (!existsSync(gameActionsPath)) {
  console.error("Could not find src/game-actions.js. Run this from the project root.");
  process.exit(1);
}

let source = readFileSync(gameActionsPath, "utf8");

if (source.includes("isLocalDevRemoteAddress(remoteAddress)")) {
  console.log("Localhost anti-cheat bypass is already installed.");
  process.exit(0);
}

const backupDir = resolve(projectRoot, "patch-backups");
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
copyFileSync(gameActionsPath, resolve(backupDir, `game-actions.before-localhost-anticheat-bypass.${stamp}.js`));

const helper = `
function isLocalDevRemoteAddress(remoteAddress) {
  const raw = String(remoteAddress || "").trim().toLowerCase();
  if (!raw) {
    return false;
  }

  const withoutIpv6Prefix = raw.startsWith("::ffff:") ? raw.slice("::ffff:".length) : raw;
  const withoutPort = withoutIpv6Prefix.replace(/^\\[?([^\\]]+)\\]?:\\d+$/, "$1");

  return (
    withoutPort === "localhost"
    || withoutPort === "::1"
    || withoutPort === "0:0:0:0:0:0:0:1"
    || withoutPort === "127.0.0.1"
    || withoutPort.startsWith("127.")
  );
}
`;

const handleLoginMarker = "async function handleLogin(context) {";
if (!source.includes(handleLoginMarker)) {
  console.error("Could not find handleLogin(context) in src/game-actions.js.");
  process.exit(1);
}
source = source.replace(handleLoginMarker, `${helper}\n${handleLoginMarker}`);

const targetBlock = `  const anticheatTicket = params.get("acticket") || "";
  const clientBuildId = String(params.get("dt") || "").trim();`;
const replacementBlock = `  const anticheatTicket = params.get("acticket") || "";
  const clientBuildId = String(params.get("dt") || "").trim();
  const localDevAnticheatBypass = isLocalDevRemoteAddress(remoteAddress);`;

if (!source.includes(targetBlock)) {
  console.error("Could not find login anti-cheat variable block.");
  process.exit(1);
}
source = source.replace(targetBlock, replacementBlock);

const targetAnticheatBlock = `    const anticheat = services?.anticheat || null;
    const anticheatRequired = anticheat?.isLoginTicketRequired?.() !== false;
    const buildIdRequired = anticheat?.isLoginBuildRequired?.() === true;
    const mustConsumeAnticheatTicket = anticheatRequired || buildIdRequired || Boolean(anticheatTicket);
    let anticheatResult = null;
    if (mustConsumeAnticheatTicket) {`;
const replacementAnticheatBlock = `    const anticheat = services?.anticheat || null;
    const anticheatRequired = localDevAnticheatBypass ? false : anticheat?.isLoginTicketRequired?.() !== false;
    const buildIdRequired = localDevAnticheatBypass ? false : anticheat?.isLoginBuildRequired?.() === true;
    const mustConsumeAnticheatTicket = !localDevAnticheatBypass && (anticheatRequired || buildIdRequired || Boolean(anticheatTicket));
    let anticheatResult = localDevAnticheatBypass
      ? {
          ok: true,
          buildId: clientBuildId || "local-dev",
          manifestId: "localhost-dev-bypass",
          signatureKeyId: "localhost-dev-bypass",
          integrityReportHash: "localhost-dev-bypass",
          bypass: "localhost",
        }
      : null;
    if (localDevAnticheatBypass) {
      logger.info("Login anti-cheat bypassed for local dev client", {
        username,
        playerId: player.id,
        remoteAddress,
      });
    }
    if (mustConsumeAnticheatTicket) {`;

if (!source.includes(targetAnticheatBlock)) {
  console.error("Could not find login anti-cheat enforcement block. Your file may have changed.");
  process.exit(1);
}
source = source.replace(targetAnticheatBlock, replacementAnticheatBlock);

writeFileSync(gameActionsPath, source, "utf8");
console.log("Installed localhost anti-cheat bypass in src/game-actions.js");
console.log("A backup was saved under patch-backups/.");
console.log("Restart the Node server before testing login again.");
