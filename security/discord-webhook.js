const DISCORD_WEBHOOK_TIMEOUT_MS = 5000;

function webhookUrl(config) {
  return String(config?.securityDiscordWebhookUrl || "").trim();
}

function safeText(value, maxLength = 800) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function auditColor(action) {
  if (String(action || "").includes("moderation")) {
    return 0xff2a1f;
  }
  if (String(action || "").includes("role") || String(action || "").includes("membership")) {
    return 0xff7a20;
  }
  return 0x2f81f7;
}

export function hasSecurityDiscordWebhook(config) {
  return Boolean(webhookUrl(config));
}

export async function sendSecurityDiscordMessage(config, payload, { logger = null } = {}) {
  const url = webhookUrl(config);
  if (!url) {
    return { ok: false, skipped: true, reason: "discord-webhook-not-configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCORD_WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger?.warn("Discord security webhook rejected", {
        statusCode: response.status,
        statusText: response.statusText,
      });
      return { ok: false, statusCode: response.status, reason: "discord-webhook-rejected" };
    }

    logger?.info("Discord security webhook sent", {
      statusCode: response.status,
    });
    return { ok: true, statusCode: response.status };
  } catch (error) {
    logger?.warn("Discord security webhook failed", {
      error: error?.name === "AbortError" ? "timeout" : error?.message,
    });
    return { ok: false, reason: error?.name === "AbortError" ? "discord-webhook-timeout" : "discord-webhook-failed" };
  } finally {
    clearTimeout(timeout);
  }
}

export function sendAdminAuditDiscord(config, entry, { logger = null } = {}) {
  if (!hasSecurityDiscordWebhook(config)) {
    return;
  }

  const payload = {
    username: "1320 Legends Security",
    embeds: [
      {
        title: safeText(entry?.action || "admin.action", 256),
        color: auditColor(entry?.action),
        timestamp: entry?.at || new Date().toISOString(),
        fields: [
          { name: "Actor", value: safeText(entry?.actor || "admin", 256), inline: true },
          { name: "Target", value: safeText(entry?.targetUsername || entry?.targetAccountId || "none", 256), inline: true },
          { name: "Reason", value: safeText(entry?.reason || "No reason provided"), inline: false },
        ],
      },
    ],
  };

  sendSecurityDiscordMessage(config, payload, { logger }).catch((error) => {
    logger?.warn("Discord security webhook dispatch failed", {
      error: error?.message,
    });
  });
}
