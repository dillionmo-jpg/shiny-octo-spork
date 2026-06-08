import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";

export const CLIENT_HASH_REJECTION_CODE = -21;

let resolvedHashesCache = null;
let resolvedHashesCacheKey = "";

export function parseClientHashEnforcement(value, fallback = "log") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["off", "log", "block"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

export function normalizeClientMd5(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{32}$/.test(normalized) ? normalized : "";
}

export function parseAllowedClientMd5List(value) {
  return [...new Set(
    String(value || "")
      .split(/[\s,;]+/)
      .map((entry) => normalizeClientMd5(entry))
      .filter(Boolean),
  )];
}

function md5File(filePath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash("md5");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectPromise);
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

function cacheKeyForConfig(config = {}) {
  return [
    String(config.clientHashEnforcement || "off"),
    ...(Array.isArray(config.allowedClientMd5) ? config.allowedClientMd5 : []),
    String(config.clientExePath || ""),
    String(config.assetRoot || ""),
  ].join("|");
}

export async function resolveAllowedClientMd5Hashes(config = {}) {
  const cacheKey = cacheKeyForConfig(config);
  if (resolvedHashesCache && resolvedHashesCacheKey === cacheKey) {
    return resolvedHashesCache;
  }

  const hashes = new Set(
    (Array.isArray(config.allowedClientMd5) ? config.allowedClientMd5 : [])
      .map((entry) => normalizeClientMd5(entry))
      .filter(Boolean),
  );

  const explicitExePath = String(config.clientExePath || "").trim();
  if (explicitExePath && existsSync(explicitExePath)) {
    hashes.add(await md5File(explicitExePath));
  }

  const assetRoot = String(config.assetRoot || "").trim();
  if (assetRoot) {
    for (const candidate of [
      "NittoLegendsBeta.exe",
      "Nitto1320.exe",
      "Nitto 1320 Legends.exe",
    ]) {
      const candidatePath = resolve(assetRoot, candidate);
      if (existsSync(candidatePath)) {
        hashes.add(await md5File(candidatePath));
        break;
      }
    }
  }

  resolvedHashesCache = [...hashes];
  resolvedHashesCacheKey = cacheKey;
  return resolvedHashesCache;
}

export function evaluateClientExeHash({
  clientMd5 = "",
  allowedHashes = [],
  enforcement = "off",
} = {}) {
  const mode = parseClientHashEnforcement(enforcement, "off");
  if (mode === "off") {
    return { ok: true, skipped: true, reason: "enforcement-off" };
  }

  const allowlist = [...new Set(
    (Array.isArray(allowedHashes) ? allowedHashes : [])
      .map((entry) => normalizeClientMd5(entry))
      .filter(Boolean),
  )];

  if (!allowlist.length) {
    return { ok: true, skipped: true, reason: "no-allowlist" };
  }

  const normalizedClientMd5 = normalizeClientMd5(clientMd5);
  if (!normalizedClientMd5) {
    if (mode === "block") {
      return {
        ok: false,
        code: CLIENT_HASH_REJECTION_CODE,
        reason: "client-hash-missing",
      };
    }
    return {
      ok: true,
      logged: true,
      reason: "client-hash-missing",
    };
  }

  if (allowlist.includes(normalizedClientMd5)) {
    return {
      ok: true,
      normalizedClientMd5,
    };
  }

  if (mode === "block") {
    return {
      ok: false,
      code: CLIENT_HASH_REJECTION_CODE,
      reason: "client-hash-mismatch",
      normalizedClientMd5,
      allowedCount: allowlist.length,
    };
  }

  return {
    ok: true,
    logged: true,
    reason: "client-hash-mismatch",
    normalizedClientMd5,
    allowedCount: allowlist.length,
  };
}
