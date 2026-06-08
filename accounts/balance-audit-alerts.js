import { sendSecurityDiscordMessage, hasSecurityDiscordWebhook } from "../security/discord-webhook.js";

const TRUSTED_AUDIT_SOURCE_PREFIXES = Object.freeze([
  "admin.",
  "adminUpdateAccountFields",
]);

const ALERT_DEDUPE_MS = 5 * 60 * 1000;

function safeText(value, maxLength = 800) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

export function isTrustedAuditSource(source = "") {
  const normalized = String(source || "").trim();
  return TRUSTED_AUDIT_SOURCE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function buildBalanceAuditAlertConfig(config = {}) {
  return {
    enabled: config.auditAlertsEnabled !== false,
    autoFlag: config.auditAlertAutoFlag !== false,
    windowMs: Number(config.auditAlertWindowMs || 10 * 60 * 1000),
    newAccountAgeMs: Number(config.auditAlertNewAccountAgeMs || 7 * 24 * 60 * 60 * 1000),
    moneyWindow: Number(config.auditAlertMoneyWindow || 500_000),
    pointsWindow: Number(config.auditAlertPointsWindow || 5_000),
    singleMoney: Number(config.auditAlertSingleMoney || 1_000_000),
    singlePoints: Number(config.auditAlertSinglePoints || 10_000),
  };
}

function positiveDelta(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function accountAgeMs(entry = {}) {
  const createdAtMs = Date.parse(String(entry.accountCreatedAt || ""));
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) {
    return null;
  }
  const entryAtMs = Date.parse(String(entry.at || ""));
  const nowMs = Number.isFinite(entryAtMs) ? entryAtMs : Date.now();
  return Math.max(0, nowMs - createdAtMs);
}

function pruneWindowEntries(entries = [], windowMs = 0, nowMs = Date.now()) {
  const cutoff = nowMs - Math.max(0, Number(windowMs || 0));
  return entries.filter((item) => Date.parse(String(item.at || "")) >= cutoff);
}

function sumWindowCredits(entries = [], field) {
  return entries.reduce((sum, item) => sum + positiveDelta(item[field]), 0);
}

export function evaluateBalanceAuditAlert(entry = {}, state = {}, alertConfig = {}) {
  const config = buildBalanceAuditAlertConfig(alertConfig);
  if (!config.enabled) {
    return null;
  }

  const source = String(entry.source || "");
  if (isTrustedAuditSource(source)) {
    return null;
  }

  const moneyDelta = Number(entry.moneyDelta || 0);
  const pointsDelta = Number(entry.pointsDelta || 0);
  const garageCarsDelta = Number(entry.garageCarsDelta || 0);
  if (moneyDelta <= 0 && pointsDelta <= 0 && garageCarsDelta <= 0) {
    return null;
  }

  const accountId = Number(entry.accountId || 0);
  const entryAtMs = Date.parse(String(entry.at || "")) || Date.now();
  const ageMs = accountAgeMs(entry);
  const isNewAccount = ageMs !== null && ageMs <= config.newAccountAgeMs;

  if (moneyDelta >= config.singleMoney) {
    return {
      reason: "single-money-credit",
      severity: "high",
      accountId,
      username: String(entry.username || ""),
      source,
      moneyDelta,
      pointsDelta,
      garageCarsDelta,
      moneyAfter: Number(entry.moneyAfter || 0),
      pointsAfter: Number(entry.pointsAfter || 0),
      accountCreatedAt: entry.accountCreatedAt || "",
      isNewAccount,
      at: entry.at || new Date().toISOString(),
    };
  }

  if (pointsDelta >= config.singlePoints) {
    return {
      reason: "single-points-credit",
      severity: "high",
      accountId,
      username: String(entry.username || ""),
      source,
      moneyDelta,
      pointsDelta,
      garageCarsDelta,
      moneyAfter: Number(entry.moneyAfter || 0),
      pointsAfter: Number(entry.pointsAfter || 0),
      accountCreatedAt: entry.accountCreatedAt || "",
      isNewAccount,
      at: entry.at || new Date().toISOString(),
    };
  }

  const windowEntries = pruneWindowEntries(
    [...(state.entries || []), entry],
    config.windowMs,
    entryAtMs,
  );
  state.entries = windowEntries;

  if (isNewAccount) {
    const windowMoney = sumWindowCredits(windowEntries, "moneyDelta");
    const windowPoints = sumWindowCredits(windowEntries, "pointsDelta");
    if (windowMoney >= config.moneyWindow) {
      return {
        reason: "new-account-money-spike",
        severity: "medium",
        accountId,
        username: String(entry.username || ""),
        source,
        moneyDelta,
        pointsDelta,
        garageCarsDelta,
        windowMoney,
        windowPoints,
        moneyAfter: Number(entry.moneyAfter || 0),
        pointsAfter: Number(entry.pointsAfter || 0),
        accountCreatedAt: entry.accountCreatedAt || "",
        isNewAccount,
        at: entry.at || new Date().toISOString(),
      };
    }
    if (windowPoints >= config.pointsWindow) {
      return {
        reason: "new-account-points-spike",
        severity: "medium",
        accountId,
        username: String(entry.username || ""),
        source,
        moneyDelta,
        pointsDelta,
        garageCarsDelta,
        windowMoney,
        windowPoints,
        moneyAfter: Number(entry.moneyAfter || 0),
        pointsAfter: Number(entry.pointsAfter || 0),
        accountCreatedAt: entry.accountCreatedAt || "",
        isNewAccount,
        at: entry.at || new Date().toISOString(),
      };
    }
  }

  return null;
}

export function shouldSendBalanceAuditDiscord(state = {}, alert = {}, nowMs = Date.now()) {
  const lastAlertAtMs = Number(state.lastAlertAtMs || 0);
  return !lastAlertAtMs || (nowMs - lastAlertAtMs) >= ALERT_DEDUPE_MS;
}

export async function sendBalanceAuditDiscordAlert(config, alert, { logger = null } = {}) {
  if (!hasSecurityDiscordWebhook(config) || !alert) {
    return { ok: false, skipped: true, reason: "discord-webhook-not-configured" };
  }

  const fields = [
    { name: "Account", value: safeText(`${alert.username || "unknown"} (#${alert.accountId || 0})`, 256), inline: true },
    { name: "Source", value: safeText(alert.source || "unknown", 256), inline: true },
    { name: "Reason", value: safeText(alert.reason || "suspicious-economy", 256), inline: false },
    { name: "Money Δ", value: safeText(String(alert.moneyDelta ?? 0), 64), inline: true },
    { name: "Points Δ", value: safeText(String(alert.pointsDelta ?? 0), 64), inline: true },
    { name: "Cars Δ", value: safeText(String(alert.garageCarsDelta ?? 0), 64), inline: true },
  ];

  if (alert.windowMoney !== undefined || alert.windowPoints !== undefined) {
    fields.push({
      name: "Window totals",
      value: safeText(`$${alert.windowMoney || 0} / ${alert.windowPoints || 0} pts`, 256),
      inline: false,
    });
  }

  fields.push({
    name: "Balances after",
    value: safeText(`$${alert.moneyAfter || 0} / ${alert.pointsAfter || 0} pts`, 256),
    inline: false,
  });

  const payload = {
    username: "1320 Legends Economy",
    embeds: [
      {
        title: "Suspicious economy credit",
        color: alert.severity === "high" ? 0xff2a1f : 0xff7a20,
        timestamp: alert.at || new Date().toISOString(),
        fields,
      },
    ],
  };

  return sendSecurityDiscordMessage(config, payload, { logger });
}

export function economyFlagFieldsFromAlert(alert = {}) {
  return {
    economyFlagged: true,
    economyFlagReason: String(alert.reason || "suspicious-economy"),
    economyFlaggedAt: String(alert.at || new Date().toISOString()),
    economyFlagSource: String(alert.source || ""),
    economyFlagMoneyDelta: Number(alert.moneyDelta || 0),
    economyFlagPointsDelta: Number(alert.pointsDelta || 0),
    economyFlagGarageCarsDelta: Number(alert.garageCarsDelta || 0),
  };
}
