import { randomBytes } from "node:crypto";

const sessionsByKey = new Map();

export function createLocalSession(account) {
  const sessionKey = randomBytes(18).toString("base64url");

  sessionsByKey.set(sessionKey, {
    account,
    createdAt: new Date().toISOString(),
  });

  return sessionKey;
}

export function getLocalSession(sessionKey) {
  return sessionsByKey.get(String(sessionKey || "")) || null;
}
