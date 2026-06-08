export const SECURITY_HISTORY_LIMIT = 24;
export const SECURITY_PROCESS_REPORT_LIMIT = 50;
export const LOGIN_TELEMETRY_REJECTION_CODE = -22;

export function parseLoginTelemetryEnforcement(value, fallback = "block") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["off", "log", "block"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

export const SECURITY_MATCH_TERMS = Object.freeze([
  "sniper.dll",
  "nittwow.dll",
  "nittwow",
  "elite 6 final",
  "elite6",
  "swf bot",
  "undetected pv2",
  "absinthe",
  "ae cracked",
  "nitto 504",
  "pv3",
  "shifter bot",
  "tourney bot",
  "war bot",
]);

function securityText(value, maxLength = 160) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function normalizeRemoteAddress(value) {
  const address = securityText(value, 80);
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

export function normalizeMacAddress(value) {
  const raw = securityText(value, 80).toUpperCase();
  const hex = raw.replace(/[^0-9A-F]/g, "");
  if (hex.length === 12) {
    return hex.match(/.{1,2}/g).join(":");
  }
  return raw;
}

export function normalizeSecurityTelemetry(input = {}) {
  const telemetry = {
    action: securityText(input.action || input.source || "", 64).toLowerCase(),
    remoteAddress: normalizeRemoteAddress(input.remoteAddress || input.ip || ""),
    mid: securityText(input.mid || input.machineId || "", 128),
    nid: normalizeMacAddress(input.nid || input.macAddress || input.mac || ""),
    prid: securityText(input.prid || input.productId || "", 128),
    cna: securityText(input.cna || input.computerName || "", 128),
    cp: securityText(input.cp || "", 256),
    cw: securityText(input.cw || "", 256),
    cwc: securityText(input.cwc || "", 256),
    ce: securityText(input.ce || "", 256),
  };
  telemetry.hasIdentity = Boolean(
    telemetry.remoteAddress
    || telemetry.mid
    || telemetry.nid
    || telemetry.prid
    || telemetry.cna,
  );
  telemetry.hasProcessReport = Boolean(telemetry.cp || telemetry.cw || telemetry.cwc || telemetry.ce);
  telemetry.machineKey = machineKeyFromTelemetry(telemetry);
  return telemetry;
}

export function machineKeyFromTelemetry(telemetry = {}) {
  const mid = String(telemetry.mid || "").trim();
  const prid = String(telemetry.prid || "").trim();
  const cna = String(telemetry.cna || "").trim();
  return mid && prid && cna ? `${mid}|${prid}|${cna}` : "";
}

function ensureSecurityRecord(account, now) {
  account.security = account.security && typeof account.security === "object" ? account.security : {};
  account.security.firstSeenAt = account.security.firstSeenAt || now;
  account.security.ips = Array.isArray(account.security.ips) ? account.security.ips : [];
  account.security.mids = Array.isArray(account.security.mids) ? account.security.mids : [];
  account.security.nids = Array.isArray(account.security.nids) ? account.security.nids : [];
  account.security.prids = Array.isArray(account.security.prids) ? account.security.prids : [];
  account.security.cnas = Array.isArray(account.security.cnas) ? account.security.cnas : [];
  account.security.processReports = Array.isArray(account.security.processReports)
    ? account.security.processReports
    : [];
  return account.security;
}

function rememberSecurityValue(entries, value, now, action = "") {
  if (!value) {
    return false;
  }

  const existing = entries.find((entry) => String(entry.value || "") === value);
  if (existing) {
    existing.lastSeenAt = now;
    existing.count = Math.max(0, Number(existing.count || 0)) + 1;
    existing.lastAction = action || existing.lastAction || "";
    return true;
  }

  entries.push({
    value,
    firstSeenAt: now,
    lastSeenAt: now,
    count: 1,
    firstAction: action,
    lastAction: action,
  });
  if (entries.length > SECURITY_HISTORY_LIMIT) {
    entries.splice(0, entries.length - SECURITY_HISTORY_LIMIT);
  }
  return true;
}

export function processReportMatchedTerms(telemetry) {
  const raw = [telemetry.cp, telemetry.cw, telemetry.cwc, telemetry.ce].join(" ").toLowerCase();
  return SECURITY_MATCH_TERMS.filter((term) => raw.includes(term));
}

export function processReportIsSuspicious(telemetry, matchedTerms = []) {
  const ce = String(telemetry.ce || "").trim().toLowerCase();
  if (ce && !["0", "false", "none", "ok"].includes(ce)) {
    return true;
  }
  return matchedTerms.length > 0;
}

export function applyAccountSecurityTelemetry(account, input = {}, now = new Date().toISOString()) {
  const telemetry = normalizeSecurityTelemetry(input);
  if (!telemetry.hasIdentity && !telemetry.hasProcessReport) {
    return { changed: false, telemetry, report: null };
  }

  const security = ensureSecurityRecord(account, now);
  const action = telemetry.action;
  rememberSecurityValue(security.ips, telemetry.remoteAddress, now, action);
  rememberSecurityValue(security.mids, telemetry.mid, now, action);
  rememberSecurityValue(security.nids, telemetry.nid, now, action);
  rememberSecurityValue(security.prids, telemetry.prid, now, action);
  rememberSecurityValue(security.cnas, telemetry.cna, now, action);

  security.lastSeenAt = now;
  security.lastAction = action || security.lastAction || "";
  security.lastIp = telemetry.remoteAddress || security.lastIp || "";
  security.lastMachineId = telemetry.mid || security.lastMachineId || "";
  security.lastMacAddress = telemetry.nid || security.lastMacAddress || "";
  security.lastProductId = telemetry.prid || security.lastProductId || "";
  security.lastComputerName = telemetry.cna || security.lastComputerName || "";
  security.loginCount = Math.max(0, Number(security.loginCount || 0)) + (action === "login" ? 1 : 0);

  // Keep legacy flat arrays in sync for admin account views.
  if (telemetry.remoteAddress) {
    account.ipHistory = Array.isArray(account.ipHistory) ? account.ipHistory : [];
    if (!account.ipHistory.includes(telemetry.remoteAddress)) {
      account.ipHistory.push(telemetry.remoteAddress);
      if (account.ipHistory.length > 20) {
        account.ipHistory = account.ipHistory.slice(-20);
      }
    }
  }
  if (telemetry.nid) {
    account.macAddresses = Array.isArray(account.macAddresses) ? account.macAddresses : [];
    if (!account.macAddresses.includes(telemetry.nid)) {
      account.macAddresses.push(telemetry.nid);
    }
  }
  if (telemetry.mid) {
    account.machineIds = Array.isArray(account.machineIds) ? account.machineIds : [];
    if (!account.machineIds.includes(telemetry.mid)) {
      account.machineIds.push(telemetry.mid);
    }
  }
  if (telemetry.prid) {
    account.productIds = Array.isArray(account.productIds) ? account.productIds : [];
    if (!account.productIds.includes(telemetry.prid)) {
      account.productIds.push(telemetry.prid);
    }
  }

  let report = null;
  if (telemetry.hasProcessReport) {
    const matchedTerms = processReportMatchedTerms(telemetry);
    report = {
      at: now,
      action,
      suspicious: processReportIsSuspicious(telemetry, matchedTerms),
      matchedTerms,
      raw: {
        cp: telemetry.cp,
        cw: telemetry.cw,
        cwc: telemetry.cwc,
        ce: telemetry.ce,
      },
    };
    security.processReports.push(report);
    if (security.processReports.length > SECURITY_PROCESS_REPORT_LIMIT) {
      security.processReports = security.processReports.slice(-SECURITY_PROCESS_REPORT_LIMIT);
    }
  }

  return { changed: true, telemetry, report };
}

export function securityEntryValues(account, key) {
  if (Array.isArray(account?.security?.[key])) {
    return account.security[key].map((entry) => String(entry?.value || "")).filter(Boolean);
  }

  if (key === "ips") {
    return (Array.isArray(account?.ipHistory) ? account.ipHistory : [])
      .map((value) => normalizeRemoteAddress(value))
      .filter(reportableIpAddress);
  }
  if (key === "nids") {
    return (Array.isArray(account?.macAddresses) ? account.macAddresses : [])
      .map((value) => normalizeMacAddress(value))
      .filter(Boolean);
  }
  if (key === "mids") {
    return Array.isArray(account?.machineIds) ? account.machineIds.map(String).filter(Boolean) : [];
  }
  if (key === "prids") {
    return Array.isArray(account?.productIds) ? account.productIds.map(String).filter(Boolean) : [];
  }
  if (key === "cnas") {
    const security = account?.security || {};
    return security.lastComputerName ? [String(security.lastComputerName)] : [];
  }
  return [];
}

export function accountHasSecurityData(account = {}) {
  if (account?.security && typeof account.security === "object") {
    return true;
  }
  return Boolean(
    (Array.isArray(account?.ipHistory) && account.ipHistory.length)
    || (Array.isArray(account?.macAddresses) && account.macAddresses.length)
    || (Array.isArray(account?.machineIds) && account.machineIds.length)
    || (Array.isArray(account?.productIds) && account.productIds.length),
  );
}

export function currentMachineKey(account) {
  const security = account?.security || {};
  return machineKeyFromTelemetry({
    mid: security.lastMachineId,
    prid: security.lastProductId,
    cna: security.lastComputerName,
  });
}

export function reportableIpAddress(value) {
  const address = normalizeRemoteAddress(value);
  return address && address !== "127.0.0.1" && address !== "::1" && address !== "localhost";
}

export function ensureSecurityBans(store) {
  store.securityBans = store.securityBans && typeof store.securityBans === "object"
    ? store.securityBans
    : {};
  store.securityBans.ips = Array.isArray(store.securityBans.ips) ? store.securityBans.ips : [];
  store.securityBans.macs = Array.isArray(store.securityBans.macs) ? store.securityBans.macs : [];
  store.securityBans.machines = Array.isArray(store.securityBans.machines) ? store.securityBans.machines : [];
  return store.securityBans;
}

function rememberBanEntry(entries, value, { reason = "", actor = "", accountId = 0, now = new Date().toISOString() } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }
  const existing = entries.find((entry) => String(entry.value || "") === normalized);
  if (existing) {
    existing.updatedAt = now;
    existing.reason = reason || existing.reason || "";
    existing.actor = actor || existing.actor || "";
    existing.accountId = Number(accountId || existing.accountId || 0);
    return false;
  }
  entries.push({
    value: normalized,
    reason: String(reason || ""),
    actor: String(actor || ""),
    accountId: Number(accountId || 0),
    createdAt: now,
    updatedAt: now,
  });
  return true;
}

export function addSecurityBanEntries(store, {
  ip = "",
  mac = "",
  machineKey = "",
  reason = "",
  actor = "",
  accountId = 0,
} = {}) {
  const bans = ensureSecurityBans(store);
  const now = new Date().toISOString();
  let added = false;
  if (reportableIpAddress(ip)) {
    added = rememberBanEntry(bans.ips, normalizeRemoteAddress(ip), { reason, actor, accountId, now }) || added;
  }
  if (mac) {
    added = rememberBanEntry(bans.macs, normalizeMacAddress(mac), { reason, actor, accountId, now }) || added;
  }
  if (machineKey) {
    added = rememberBanEntry(bans.machines, String(machineKey).trim(), { reason, actor, accountId, now }) || added;
  }
  return added;
}

export function removeSecurityBanEntries(store, { ip = "", mac = "", machineKey = "" } = {}) {
  const bans = ensureSecurityBans(store);
  const removeFrom = (entries, value) => {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return false;
    }
    const index = entries.findIndex((entry) => String(entry.value || "") === normalized);
    if (index < 0) {
      return false;
    }
    entries.splice(index, 1);
    return true;
  };

  let removed = false;
  removed = removeFrom(bans.ips, normalizeRemoteAddress(ip)) || removed;
  removed = removeFrom(bans.macs, normalizeMacAddress(mac)) || removed;
  removed = removeFrom(bans.machines, String(machineKey || "").trim()) || removed;
  return removed;
}

export function findSecurityBanMatch(store, telemetry = {}) {
  const bans = ensureSecurityBans(store);
  const normalized = normalizeSecurityTelemetry(telemetry);
  const ip = reportableIpAddress(normalized.remoteAddress) ? normalizeRemoteAddress(normalized.remoteAddress) : "";
  const mac = normalized.nid || "";
  const machineKey = normalized.machineKey || "";

  const ipBan = ip ? bans.ips.find((entry) => String(entry.value || "") === ip) : null;
  if (ipBan) {
    return { type: "ip", value: ip, entry: ipBan };
  }

  const macBan = mac ? bans.macs.find((entry) => String(entry.value || "") === mac) : null;
  if (macBan) {
    return { type: "mac", value: mac, entry: macBan };
  }

  const machineBan = machineKey ? bans.machines.find((entry) => String(entry.value || "") === machineKey) : null;
  if (machineBan) {
    return { type: "machine", value: machineKey, entry: machineBan };
  }

  return null;
}

function accountIsDeviceBanned(account = {}) {
  return Boolean(
    account.permanentBan
    || account.ipBanned
    || account.ip_banned
    || account.macBanned
    || account.mac_banned,
  );
}

function accountSharesTelemetryDevice(account, telemetry = {}) {
  const normalized = normalizeSecurityTelemetry(telemetry);
  if (normalized.mid && securityEntryValues(account, "mids").includes(normalized.mid)) {
    return true;
  }
  if (normalized.nid && securityEntryValues(account, "nids").includes(normalized.nid)) {
    return true;
  }
  if (normalized.machineKey && currentMachineKey(account) === normalized.machineKey) {
    return true;
  }
  return false;
}

function accountHasSuspiciousProcessHistory(account = {}) {
  const reports = Array.isArray(account.security?.processReports) ? account.security.processReports : [];
  return reports.some((report) => Boolean(report?.suspicious));
}

export function findBannedAccountsSharingDevice(store, telemetry = {}, { excludeAccountId = 0 } = {}) {
  const accounts = Array.isArray(store?.accounts) ? store.accounts : [];
  return accounts
    .filter((account) => Number(account.id) !== Number(excludeAccountId))
    .filter((account) => accountIsDeviceBanned(account))
    .filter((account) => accountSharesTelemetryDevice(account, telemetry))
    .map((account) => ({
      id: Number(account.id || 0),
      username: String(account.username || ""),
    }));
}

export function findSuspiciousAccountsSharingDevice(store, telemetry = {}, { excludeAccountId = 0 } = {}) {
  const accounts = Array.isArray(store?.accounts) ? store.accounts : [];
  return accounts
    .filter((account) => Number(account.id) !== Number(excludeAccountId))
    .filter((account) => accountHasSuspiciousProcessHistory(account))
    .filter((account) => accountSharesTelemetryDevice(account, telemetry))
    .map((account) => ({
      id: Number(account.id || 0),
      username: String(account.username || ""),
    }));
}

export function evaluateLoginTelemetrySecurity(store, account, telemetryInput = {}, options = {}) {
  const enforcement = parseLoginTelemetryEnforcement(options.enforcement, "block");
  if (enforcement === "off") {
    return { ok: true, skipped: true, reason: "enforcement-off" };
  }

  const telemetry = normalizeSecurityTelemetry(telemetryInput);
  const excludeAccountId = Number(account?.id || 0);
  const issues = [];

  if (telemetry.hasProcessReport) {
    const matchedTerms = processReportMatchedTerms(telemetry);
    if (processReportIsSuspicious(telemetry, matchedTerms)) {
      issues.push({
        reason: "suspicious-process-report",
        matchedTerms,
      });
    }
  }

  if (!telemetry.hasIdentity) {
    issues.push({ reason: "missing-device-identity" });
  }

  const bannedDeviceOverlap = findBannedAccountsSharingDevice(store, telemetry, { excludeAccountId });
  if (bannedDeviceOverlap.length) {
    issues.push({
      reason: "banned-device-overlap",
      linkedAccounts: bannedDeviceOverlap,
    });
  }

  const suspiciousDeviceOverlap = findSuspiciousAccountsSharingDevice(store, telemetry, { excludeAccountId });
  if (suspiciousDeviceOverlap.length) {
    issues.push({
      reason: "suspicious-device-overlap",
      linkedAccounts: suspiciousDeviceOverlap,
    });
  }

  if (!issues.length) {
    return { ok: true, telemetry };
  }

  const result = {
    ok: false,
    code: LOGIN_TELEMETRY_REJECTION_CODE,
    reason: issues[0].reason,
    issues,
    telemetry,
  };

  if (enforcement === "log") {
    return {
      ok: true,
      logged: true,
      issues,
      telemetry,
    };
  }

  return result;
}

export function evaluateLoginSecurity(store, account, telemetry = {}) {
  if (Boolean(account?.permanentBan || account?.ipBanned || account?.ip_banned)) {
    return { ok: false, reason: "account-banned", code: 0 };
  }
  if (Boolean(account?.chatBanned || account?.banned)) {
    return { ok: false, reason: "account-banned", code: 0 };
  }

  const banMatch = findSecurityBanMatch(store, telemetry);
  if (banMatch) {
    return { ok: false, reason: `${banMatch.type}-banned`, code: 0, banMatch };
  }

  return { ok: true };
}

function adminSecurityAccountSummary(account = {}) {
  const security = account.security || {};
  const processReports = Array.isArray(security.processReports) ? security.processReports : [];
  const suspiciousReports = processReports.filter((report) => Boolean(report?.suspicious)).length;
  return {
    id: Number(account.id || 0),
    username: String(account.username || ""),
    lastSeenAt: String(security.lastSeenAt || account.updatedAt || ""),
    lastIp: String(security.lastIp || account.lastIp || account.ip || ""),
    lastMacAddress: String(security.lastMacAddress || account.lastMacAddress || account.mac || ""),
    lastMachineId: String(security.lastMachineId || account.lastMachineId || account.mid || ""),
    lastProductId: String(security.lastProductId || account.lastProductId || account.prid || ""),
    lastComputerName: String(security.lastComputerName || account.lastComputerName || ""),
    ipCount: securityEntryValues(account, "ips").length,
    macCount: securityEntryValues(account, "nids").length,
    machineIdCount: securityEntryValues(account, "mids").length,
    processReportCount: processReports.length,
    suspiciousReportCount: suspiciousReports,
    loginCount: Number(security.loginCount || 0),
  };
}

function groupedSecurityValues(accounts, valuesForAccount) {
  const groups = new Map();
  for (const account of accounts) {
    for (const value of new Set(valuesForAccount(account).filter(Boolean))) {
      if (!groups.has(value)) {
        groups.set(value, []);
      }
      groups.get(value).push(adminSecurityAccountSummary(account));
    }
  }

  return [...groups.entries()]
    .filter(([, groupAccounts]) => groupAccounts.length > 1)
    .map(([key, groupAccounts]) => ({
      key,
      count: groupAccounts.length,
      accounts: groupAccounts.sort((left, right) => left.username.localeCompare(right.username)),
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function changedDeviceAccounts(accounts) {
  return accounts
    .filter((account) => (
      securityEntryValues(account, "nids").length > 1
      || securityEntryValues(account, "mids").length > 1
      || securityEntryValues(account, "prids").length > 1
      || securityEntryValues(account, "cnas").length > 1
    ))
    .map((account) => ({
      ...adminSecurityAccountSummary(account),
      macAddresses: securityEntryValues(account, "nids"),
      machineIds: securityEntryValues(account, "mids"),
      productIds: securityEntryValues(account, "prids"),
      computerNames: securityEntryValues(account, "cnas"),
    }))
    .sort((left, right) => left.username.localeCompare(right.username));
}

function latestProcessReports(accounts, limit) {
  return accounts
    .flatMap((account) => {
      const reports = Array.isArray(account.security?.processReports) ? account.security.processReports : [];
      return reports.map((report) => ({
        id: `acct-${account.id}-${report.at || ""}`,
        accountId: Number(account.id || 0),
        username: String(account.username || ""),
        at: String(report.at || ""),
        action: String(report.action || ""),
        suspicious: Boolean(report.suspicious),
        matchedTerms: Array.isArray(report.matchedTerms) ? report.matchedTerms : [],
        raw: report.raw && typeof report.raw === "object" ? report.raw : {},
      }));
    })
    .sort((left, right) => String(right.at).localeCompare(String(left.at)))
    .slice(0, limit);
}

export function buildAdminSecurityReport(store, limit = 50) {
  const safeLimit = Math.min(Math.max(Math.trunc(Number(limit || 50)), 1), 200);
  const allAccounts = Array.isArray(store.accounts) ? store.accounts : [];
  const accountsWithSecurity = allAccounts.filter((account) => accountHasSecurityData(account));
  const sameIpGroups = groupedSecurityValues(
    accountsWithSecurity,
    (account) => securityEntryValues(account, "ips").filter(reportableIpAddress),
  );
  const sameMacGroups = groupedSecurityValues(accountsWithSecurity, (account) => securityEntryValues(account, "nids"));
  const sameMachineGroups = groupedSecurityValues(
    accountsWithSecurity,
    (account) => {
      const key = currentMachineKey(account);
      return key ? [key] : [];
    },
  );
  const changedAccounts = changedDeviceAccounts(accountsWithSecurity);
  const accountReports = latestProcessReports(accountsWithSecurity, safeLimit);
  const legacyReports = (Array.isArray(store.processReports) ? store.processReports : [])
    .map((report) => ({
      id: String(report?.id || `legacy-${report?.at || ""}`),
      accountId: Number(report?.accountId || report?.id || 0),
      username: String(report?.username || ""),
      at: String(report?.at || report?.createdAt || ""),
      action: String(report?.action || "legacy.process.report"),
      suspicious: Boolean(report?.suspicious),
      matchedTerms: Array.isArray(report?.matchedTerms) ? report.matchedTerms : [],
      raw: report?.raw && typeof report.raw === "object" ? report.raw : {},
      legacy: true,
    }));
  const processReports = [...accountReports, ...legacyReports]
    .sort((left, right) => String(right.at).localeCompare(String(left.at)))
    .slice(0, safeLimit);
  const suspiciousReports = processReports.filter((report) => report.suspicious).length;
  const accounts = accountsWithSecurity
    .map(adminSecurityAccountSummary)
    .sort((left, right) => String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)))
    .slice(0, safeLimit);
  const bans = ensureSecurityBans(store);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    totals: {
      accounts: allAccounts.length,
      accountsWithSecurity: accountsWithSecurity.length,
      sameIpGroups: sameIpGroups.length,
      sameMacGroups: sameMacGroups.length,
      sameMachineGroups: sameMachineGroups.length,
      changedDeviceAccounts: changedAccounts.length,
      processReports: processReports.length,
      suspiciousReports,
      activeIpBans: bans.ips.length,
      activeMacBans: bans.macs.length,
      activeMachineBans: bans.machines.length,
    },
    sameIpGroups,
    sameMacGroups,
    sameMachineGroups,
    changedDeviceAccounts: changedAccounts,
    processReports,
    accounts,
    securityBans: bans,
  };
}
