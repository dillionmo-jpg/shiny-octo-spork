import fs from "node:fs";
import path from "node:path";

const DEFAULT_SERVERS_FILE = "B:\\NittoLegends-10.03ObiWan-V.01\\servers.txt";
const DEFAULT_PROXY_BASE = "http://127.0.0.1:8089/";

function readArgValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
}

function parseAngleValues(text) {
  return [...String(text || "").matchAll(/<([^>]*)>/g)].map((match) => match[1]);
}

function buildAngleValues(values) {
  return values.map((value) => `<${value}>`).join("");
}

function timestampToken() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function main() {
  const serversFile = path.resolve(readArgValue("--servers-file", DEFAULT_SERVERS_FILE));
  const restorePath = readArgValue("--restore", "");

  if (restorePath) {
    const resolvedRestore = path.resolve(restorePath);
    if (!fs.existsSync(resolvedRestore)) {
      throw new Error(`Backup file not found: ${resolvedRestore}`);
    }
    fs.copyFileSync(resolvedRestore, serversFile);
    console.log(JSON.stringify({
      restored: true,
      serversFile,
      backupPath: resolvedRestore,
    }, null, 2));
    return;
  }

  if (!fs.existsSync(serversFile)) {
    throw new Error(`Standalone servers file not found: ${serversFile}`);
  }

  const proxyBase = new URL(readArgValue("--proxy-base", DEFAULT_PROXY_BASE));
  const originalText = fs.readFileSync(serversFile, "utf8");
  const values = parseAngleValues(originalText);
  if (values.length < 6) {
    throw new Error(`Unexpected servers.txt format in ${serversFile}`);
  }

  const backupPath = `${serversFile}.bak.${timestampToken()}`;
  fs.writeFileSync(backupPath, originalText);

  values[2] = proxyBase.toString();
  values[3] = proxyBase.toString();
  values[4] = new URL("dl/", proxyBase).toString();
  values[5] = new URL("ug/", proxyBase).toString();

  const rewritten = buildAngleValues(values);
  fs.writeFileSync(serversFile, rewritten, "utf8");

  console.log(JSON.stringify({
    restored: false,
    serversFile,
    backupPath,
    proxyBase: proxyBase.toString(),
    rewrittenHttpValues: values.slice(2, 6),
  }, null, 2));
}

main();
