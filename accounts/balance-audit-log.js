import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildBalanceAuditAlertConfig,
  evaluateBalanceAuditAlert,
  sendBalanceAuditDiscordAlert,
  shouldSendBalanceAuditDiscord,
} from "./balance-audit-alerts.js";

export function createBalanceAuditLog({
  dataRoot,
  logger = null,
  alertConfig = null,
  discordConfig = null,
  onAlert = null,
} = {}) {
  const filePath = join(String(dataRoot || ""), "audit", "balance-changes.jsonl");
  const accountWindows = new Map();
  const resolvedAlertConfig = buildBalanceAuditAlertConfig(alertConfig || {});
  let queue = Promise.resolve();

  function windowStateFor(accountId) {
    const key = String(Number(accountId || 0));
    if (!accountWindows.has(key)) {
      accountWindows.set(key, { entries: [], lastAlertAtMs: 0 });
    }
    return accountWindows.get(key);
  }

  async function handleAlert(entry, alert) {
    if (!alert) {
      return;
    }

    const state = windowStateFor(alert.accountId);
    const nowMs = Date.parse(String(alert.at || "")) || Date.now();

    logger?.warn("Suspicious economy credit detected", {
      accountId: alert.accountId,
      username: alert.username,
      reason: alert.reason,
      source: alert.source,
      moneyDelta: alert.moneyDelta,
      pointsDelta: alert.pointsDelta,
      garageCarsDelta: alert.garageCarsDelta,
      windowMoney: alert.windowMoney,
      windowPoints: alert.windowPoints,
    });

    if (discordConfig && shouldSendBalanceAuditDiscord(state, alert, nowMs)) {
      state.lastAlertAtMs = nowMs;
      await sendBalanceAuditDiscordAlert(discordConfig, alert, { logger }).catch((error) => {
        logger?.warn("Balance audit Discord alert failed", {
          accountId: alert.accountId,
          error: error?.message || String(error),
        });
      });
    }

    if (typeof onAlert === "function") {
      await onAlert(alert, entry);
    }
  }

  function record(entry) {
    const line = `${JSON.stringify({
      at: new Date().toISOString(),
      ...entry,
    })}\n`;

    const fullEntry = {
      at: new Date().toISOString(),
      ...entry,
    };

    queue = queue.then(async () => {
      try {
        await mkdir(dirname(filePath), { recursive: true });
        await appendFile(filePath, line, "utf8");
        if (logger) {
          const moneyDelta = Number(entry.moneyDelta || 0);
          const pointsDelta = Number(entry.pointsDelta || 0);
          const garageCarsDelta = Number(entry.garageCarsDelta || 0);
          if (moneyDelta > 0 || pointsDelta > 0 || garageCarsDelta > 0) {
            logger.info("Account economy credit audited", {
              accountId: entry.accountId,
              username: entry.username,
              source: entry.source,
              moneyDelta,
              pointsDelta,
              garageCarsDelta,
              moneyAfter: entry.moneyAfter,
              pointsAfter: entry.pointsAfter,
              auditFile: filePath,
            });
          }
        }

        const alert = evaluateBalanceAuditAlert(
          fullEntry,
          windowStateFor(fullEntry.accountId),
          resolvedAlertConfig,
        );
        if (alert) {
          await handleAlert(fullEntry, alert);
        }
      } catch (error) {
        if (logger) {
          logger.warn("Balance audit log write failed", {
            error: error?.message || String(error),
            auditFile: filePath,
          });
        }
      }
    });

    return queue;
  }

  return {
    filePath,
    record,
  };
}
