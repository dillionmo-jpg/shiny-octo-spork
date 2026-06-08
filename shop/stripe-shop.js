import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import Stripe from "stripe";

import { accountMembershipFlag } from "../accounts/account-status.js";
import { applyManualBadgesToAccount, collectManualBadgeRows } from "../accounts/profile-badges.js";
import { LocalAccountStore, verifyPassword } from "../accounts/local-account-store.js";

const STRIPE_API_VERSION = "2026-04-22.dahlia";
const BODY_LIMIT_BYTES = 64 * 1024;
const PACKAGE_GRANTS = Object.freeze([
  { key: "gold-starter", title: "Gold Starter Pack", price: "$9.99", money: 50_000, points: 1_370, kind: "points" },
  { key: "silver-boost", title: "Silver Boost Pack", price: "$14.99", money: 87_500, points: 2_000, kind: "points" },
  { key: "diamond-street", title: "Diamond Street Pack", price: "$19.99", money: 125_000, points: 2_810, kind: "points" },
  { key: "pro-plus", title: "Pro Plus Pack", price: "$29.99", money: 250_000, points: 4_560, kind: "points" },
  { key: "champion", title: "Champion Pack", price: "$39.99", money: 400_000, points: 6_840, kind: "points" },
  { key: "legendary", title: "Legendary Pack", price: "$49.99", money: 650_000, points: 9_500, kind: "points" },
  { key: "extreme", title: "Extreme Pack", price: "$79.99", money: 1_250_000, points: 15_500, kind: "points" },
  { key: "elite", title: "Elite Pack", price: "$99.99", money: 1_750_000, points: 20_500, kind: "points" },
  { key: "master", title: "Master Pack", price: "$149.99", money: 3_000_000, points: 32_500, kind: "points" },
  { key: "kingpin", title: "Kingpin Pack", price: "$199.99", money: 5_000_000, points: 45_000, catalogCarId: 57, badgeIds: [160, 174], kind: "points" },
  { key: "ultimate-vip-garage", title: "Ultimate VIP Garage Pack", price: "$299.00", money: 8_500_000, points: 75_000, catalogCarId: 123, badgeIds: [160, 174], kind: "points" },
  { key: "member-starter", title: "Member Starter Bundle", price: "$9.99", money: 75_000, points: 1_000, membership: true, membershipMonths: 1, kind: "membership" },
  { key: "member-pro", title: "Member Pro Bundle", price: "$19.99", money: 200_000, points: 2_500, membership: true, membershipMonths: 3, kind: "membership" },
  { key: "member-champion", title: "Member Champion Bundle", price: "$39.99", money: 500_000, points: 6_000, membership: true, membershipMonths: 6, kind: "membership" },
  { key: "member-extreme", title: "Member Extreme Bundle", price: "$79.99", money: 1_500_000, points: 14_000, membership: true, membershipMonths: 12, kind: "membership" },
  { key: "vip-garage", title: "VIP Garage Bundle", price: "$149.99", money: 4_000_000, points: 30_000, membership: true, membershipMonths: 12, kind: "membership" },
]);

function html(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textResponse(statusCode, body) {
  return {
    statusCode,
    body,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  };
}

function htmlResponse(statusCode, body) {
  return {
    statusCode,
    body,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  };
}

function redirectResponse(location) {
  return {
    statusCode: 303,
    body: "",
    headers: {
      Location: location,
      "Cache-Control": "no-store",
    },
  };
}

function publicBaseUrl(config, req) {
  const configured = String(config.publicBaseUrl || "").replace(/\/+$/, "");
  if (configured) {
    return configured;
  }
  const host = String(req.headers.host || `127.0.0.1:${config.httpPort || 8082}`);
  return `http://${host}`;
}

function stripeClient(config) {
  return config.stripeSecretKey
    ? new Stripe(config.stripeSecretKey, { apiVersion: STRIPE_API_VERSION })
    : null;
}

function stripeCheckoutError(reason, statusCode) {
  return {
    ok: false,
    reason,
    statusCode,
  };
}

export function packageByKey(packageKey) {
  const normalized = String(packageKey || "").trim().toLowerCase();
  return PACKAGE_GRANTS.find((item) => item.key === normalized) || null;
}

function packagesForKind(kind) {
  return PACKAGE_GRANTS.filter((item) => item.kind === kind);
}

function packagesForPage(kind, selectedPackageKey = "") {
  const selected = packageByKey(selectedPackageKey);
  if (selected?.kind === kind) {
    return [selected];
  }
  return packagesForKind(kind);
}

function shopReady(config, packageGrant) {
  return Boolean(config.stripeSecretKey && packageGrant);
}

function priceUsdFor(packageGrant) {
  const price = Number(String(packageGrant?.price || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function priceCentsFor(packageGrant) {
  const price = priceUsdFor(packageGrant);
  if (price <= 0) {
    throw new Error(`Shop package ${packageGrant?.key || "unknown"} is missing a valid USD price.`);
  }
  return Math.round(price * 100);
}

function membershipDaysFor(packageGrant) {
  if (!packageGrant?.membership) {
    return 0;
  }

  const daysByKey = {
    "member-starter": 30,
    "member-pro": 90,
    "member-champion": 180,
    "member-extreme": 365,
    "vip-garage": 365,
  };
  return daysByKey[packageGrant.key] ?? Number(packageGrant.membershipMonths || 1) * 30;
}

function buildStripePurchaseRecord(account, packageGrant, fulfillment) {
  const purchases = Array.isArray(account.purchases) ? account.purchases : [];
  return {
    id: purchases.length + 1,
    kind: packageGrant.kind === "membership" ? "membership" : "points",
    sku: packageGrant.key,
    label: packageGrant.title,
    priceUsd: priceUsdFor(packageGrant),
    money: Number(packageGrant.money || 0),
    points: Number(packageGrant.points || 0),
    membershipDays: membershipDaysFor(packageGrant),
    status: "completed",
    source: "stripe",
    purchasedAt: fulfillment.at,
    stripeSessionId: fulfillment.sessionId,
    stripeEventId: fulfillment.eventId,
  };
}

export function checkoutLineItemForPackage(packageGrant) {
  return {
    price_data: {
      currency: "usd",
      product_data: {
        name: packageGrant.title,
      },
      unit_amount: priceCentsFor(packageGrant),
    },
    quantity: 1,
  };
}

function renderPackage(packageGrant, config) {
  const ready = shopReady(config, packageGrant);
  return `<article class="pack">
    <div>
      <h2>${html(packageGrant.title)}</h2>
      <div class="price">${html(packageGrant.price)}</div>
      <p>${Number(packageGrant.money || 0).toLocaleString()} cash + ${Number(packageGrant.points || 0).toLocaleString()} points${packageGrant.membership ? ` + ${packageGrant.membershipMonths} month membership` : ""}</p>
    </div>
    <form method="post" action="/${packageGrant.kind}/checkout">
      <input type="hidden" name="packageKey" value="${html(packageGrant.key)}">
      <label>Racer name <input name="username" autocomplete="username" required></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
      <button ${ready ? "" : "disabled"}>${ready ? "Checkout" : "Not configured"}</button>
    </form>
  </article>`;
}

function renderShopPage(kind, config, message = "", selectedPackageKey = "") {
  const title = kind === "membership" ? "1320 Membership" : "1320 Point Packs";
  const packages = packagesForPage(kind, selectedPackageKey).map((item) => renderPackage(item, config)).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(title)}</title>
  <style>
    body{margin:0;background:#090909;color:#f3f3f3;font:15px/1.45 Arial,sans-serif}
    header,main{max-width:1080px;margin:0 auto;padding:28px 18px}
    nav{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
    a{color:#ffb02e}
    h1{font-size:44px;line-height:1;margin:0}
    .notice{border:1px solid #ffb02e;padding:12px;margin:0 0 16px;background:#17110a}
    .pack{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:18px;border:1px solid #333;background:#151515;margin:0 0 14px;padding:18px}
    .price{color:#ffb02e;font-size:32px;font-weight:700}
    form{display:grid;gap:10px}
    input{width:100%;box-sizing:border-box;margin-top:4px;padding:9px;background:#050505;border:1px solid #444;color:#fff}
    button{padding:11px;border:0;background:#e64620;color:#fff;font-weight:700;cursor:pointer}
    button:disabled{background:#555;cursor:not-allowed}
    @media(max-width:720px){.pack{grid-template-columns:1fr}h1{font-size:34px}}
  </style>
</head>
<body>
  <header>
    <h1>${html(title)}</h1>
    <nav><a href="/membership">Membership</a><a href="/points">Point Packs</a></nav>
  </header>
  <main>${message ? `<div class="notice">${html(message)}</div>` : ""}${packages}</main>
</body>
</html>`;
}

function renderResultPage(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${html(title)}</title><style>body{margin:0;background:#090909;color:#f3f3f3;font:16px/1.5 Arial,sans-serif}main{max-width:720px;margin:0 auto;padding:56px 20px}a{color:#ffb02e}</style></head><body><main><h1>${html(title)}</h1><p>${html(message)}</p><p><a href="/membership">Membership</a> | <a href="/points">Point Packs</a></p></main></body></html>`;
}

function readRawBody(req, limitBytes = BODY_LIMIT_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > limitBytes) {
        reject(Object.assign(new Error("request-body-too-large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readForm(req) {
  const body = (await readRawBody(req)).toString("utf8");
  return Object.fromEntries(new URLSearchParams(body));
}

async function readAccountState(config) {
  try {
    const text = await readFile(join(config.dataRoot, "accounts.local.json"), "utf8");
    const parsed = JSON.parse(text);
    return {
      ...parsed,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      adminAudit: Array.isArray(parsed.adminAudit) ? parsed.adminAudit : [],
      stripeFulfillments: Array.isArray(parsed.stripeFulfillments) ? parsed.stripeFulfillments : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { version: 1, accounts: [], adminAudit: [], stripeFulfillments: [] };
    }
    throw error;
  }
}

async function writeAccountState(config, state) {
  const filePath = join(config.dataRoot, "accounts.local.json");
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function nextGarageCarId(state, account) {
  const ids = [
    Number(state.nextGarageCarId || 0),
    Number(account?.starterCar?.accountCarId || 0),
    ...(Array.isArray(account?.garageCars) ? account.garageCars.map((car) => Number(car?.accountCarId || 0)) : []),
  ].filter((id) => Number.isFinite(id) && id > 0);
  return Math.max(1, ...ids) + 1;
}

function grantPackageToAccount(state, account, packageGrant, fulfillment) {
  const before = {
    money: Number(account.money || 0),
    points: Number(account.points || 0),
    membership: Boolean(accountMembershipFlag(account)),
  };

  account.money = Math.max(0, before.money + Number(packageGrant.money || 0));
  account.points = Math.max(0, before.points + Number(packageGrant.points || 0));
  if (packageGrant.membership) {
    account.membership = 1;
    account.vip = 1;
    const nowDate = new Date();
    const currentExpiry = account.membershipExpiresAt ? new Date(account.membershipExpiresAt) : null;
    const startDate = currentExpiry && currentExpiry > nowDate ? currentExpiry : nowDate;
    const expiresAt = new Date(startDate);
    expiresAt.setMonth(expiresAt.getMonth() + Number(packageGrant.membershipMonths || 1));
    account.membershipExpiresAt = expiresAt.toISOString();
  }
  if (packageGrant.catalogCarId) {
    const accountCarId = nextGarageCarId(state, account);
    account.garageCars = Array.isArray(account.garageCars) ? account.garageCars : [];
    account.garageCars.push({
      accountCarId,
      catalogCarId: Number(packageGrant.catalogCarId),
      selected: false,
      color: "000000",
      partsXml: "",
      createdAt: fulfillment.at,
      updatedAt: fulfillment.at,
    });
    state.nextGarageCarId = Math.max(Number(state.nextGarageCarId || 1), accountCarId + 1);
  }
  if (Array.isArray(packageGrant.badgeIds) && packageGrant.badgeIds.length > 0) {
    const byId = new Map(collectManualBadgeRows(account).map((badge) => [badge.id, badge]));
    for (const badgeId of packageGrant.badgeIds) {
      byId.set(Number(badgeId), { id: Number(badgeId), visible: true, count: 1 });
    }
    applyManualBadgesToAccount(account, [...byId.values()].sort((left, right) => left.id - right.id));
  }

  account.updatedAt = fulfillment.at;
  account.purchases = Array.isArray(account.purchases) ? account.purchases : [];
  account.purchases.unshift(buildStripePurchaseRecord(account, packageGrant, fulfillment));
  const after = {
    money: Number(account.money || 0),
    points: Number(account.points || 0),
    membership: Boolean(accountMembershipFlag(account)),
    membershipExpiresAt: account.membershipExpiresAt || null,
  };

  state.adminAudit.push({
    id: `audit-${Date.now()}-${fulfillment.sessionId}`,
    at: fulfillment.at,
    action: "stripe.package.fulfilled",
    actor: "stripe",
    targetAccountId: Number(account.id || 0),
    targetUsername: account.username || "",
    reason: `${packageGrant.price} ${packageGrant.title} Stripe checkout`,
    before,
    after: {
      ...after,
      packageKey: packageGrant.key,
      catalogCarId: packageGrant.catalogCarId || null,
      badgeIds: [...(packageGrant.badgeIds || [])],
      stripeSessionId: fulfillment.sessionId,
      stripeEventId: fulfillment.eventId,
    },
  });
}

async function resolveCheckoutAccount(config, form) {
  const username = String(form.username || "").trim();
  const password = String(form.password || "");
  const store = new LocalAccountStore({ dataRoot: config.dataRoot });
  const account = await store.findByUsername(username);
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return null;
  }
  return account;
}

export async function createStripeCheckoutForAccount({ req, config, account, kind, packageKey }) {
  const normalizedKind = kind === "membership" ? "membership" : "points";
  const packageGrant = packageByKey(packageKey);
  if (!packageGrant || packageGrant.kind !== normalizedKind) {
    return stripeCheckoutError("invalid-package", 422);
  }

  const stripe = stripeClient(config);
  if (!stripe) {
    return stripeCheckoutError("stripe-unavailable", 503);
  }

  try {
    const baseUrl = publicBaseUrl(config, req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [checkoutLineItemForPackage(packageGrant)],
      success_url: `${baseUrl}/${normalizedKind}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/${normalizedKind}/cancel`,
      client_reference_id: String(account.id),
      metadata: {
        product: "saddays-1320-shop",
        packageKey: packageGrant.key,
        packageTitle: packageGrant.title,
        accountId: String(account.id),
        username: account.username || "",
        money: String(packageGrant.money || 0),
        points: String(packageGrant.points || 0),
        membershipMonths: String(packageGrant.membershipMonths || 0),
      },
    });

    if (!session?.url) {
      return stripeCheckoutError("stripe-checkout-failed", 502);
    }

    return {
      ok: true,
      sessionId: String(session.id || ""),
      packageKey: packageGrant.key,
      url: session.url,
    };
  } catch {
    return stripeCheckoutError("stripe-checkout-failed", 502);
  }
}

async function createCheckout({ req, requestUrl, config, kind }) {
  if (req.method !== "POST") {
    return textResponse(405, "method not allowed\n");
  }

  const form = await readForm(req);
  const account = await resolveCheckoutAccount(config, form);
  if (!account) {
    return htmlResponse(401, renderShopPage(kind, config, "Racer name or password was not accepted."));
  }

  const checkout = await createStripeCheckoutForAccount({
    req,
    config,
    account,
    kind,
    packageKey: form.packageKey,
  });
  if (!checkout.ok) {
    if (checkout.reason === "stripe-unavailable") {
      return htmlResponse(503, renderShopPage(kind, config, "Stripe checkout is not configured."));
    }
    if (checkout.reason === "invalid-package") {
      return htmlResponse(400, renderShopPage(kind, config, "Invalid shop package."));
    }
    return htmlResponse(502, renderShopPage(kind, config, "Stripe checkout could not be created."));
  }

  return redirectResponse(checkout.url);
}

async function fulfillCheckoutSession({ config, event, logger }) {
  if (event.type !== "checkout.session.completed") {
    return { fulfilled: false, reason: "ignored-event" };
  }

  const session = event.data?.object;
  if (!session || session.payment_status === "unpaid") {
    return { fulfilled: false, reason: "unpaid-session" };
  }

  const metadata = session.metadata || {};
  if (metadata.product !== "saddays-1320-shop") {
    return { fulfilled: false, reason: "ignored-product" };
  }

  const packageGrant = packageByKey(metadata.packageKey);
  const accountId = Number(metadata.accountId || session.client_reference_id || 0);
  if (!packageGrant || !accountId) {
    throw new Error("Stripe checkout session is missing package/account metadata.");
  }

  const state = await readAccountState(config);
  const sessionId = String(session.id || "");
  const eventId = String(event.id || `checkout:${sessionId}`);
  const existing = state.stripeFulfillments.find((item) => (
    String(item.eventId || "") === eventId || String(item.sessionId || "") === sessionId
  ));
  if (existing?.status === "fulfilled") {
    return { fulfilled: false, reason: "already-fulfilled", accountId, packageKey: packageGrant.key };
  }

  const account = state.accounts.find((item) => Number(item.id || 0) === accountId);
  if (!account) {
    throw new Error(`Stripe checkout target account ${accountId} was not found.`);
  }

  const fulfillment = {
    eventId,
    sessionId,
    accountId,
    packageKey: packageGrant.key,
    status: "fulfilled",
    at: new Date().toISOString(),
  };
  state.stripeFulfillments.push(fulfillment);
  grantPackageToAccount(state, account, packageGrant, fulfillment);
  await writeAccountState(config, state);

  logger.info("Stripe shop checkout fulfilled", {
    accountId,
    username: account.username,
    packageKey: packageGrant.key,
    stripeSessionId: sessionId,
  });

  return { fulfilled: true, accountId, packageKey: packageGrant.key };
}

async function handleWebhook({ req, config, logger }) {
  if (req.method !== "POST") {
    return textResponse(405, "method not allowed\n");
  }

  const stripe = stripeClient(config);
  if (!stripe || !config.stripeWebhookSecret) {
    return textResponse(503, "stripe webhook is not configured\n");
  }

  const bodyBytes = await readRawBody(req);
  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(bodyBytes, signature, config.stripeWebhookSecret);
  } catch (error) {
    logger.warn("Stripe webhook rejected", { reason: error.message });
    return textResponse(400, "invalid stripe signature\n");
  }

  const result = await fulfillCheckoutSession({ config, event, logger });
  return textResponse(200, `${JSON.stringify({ ok: true, ...result })}\n`);
}

export async function handleStripeShopRequest({ req, requestUrl, config, logger }) {
  const pathname = requestUrl.pathname.toLowerCase();

  if (pathname === "/membership") {
    return htmlResponse(200, renderShopPage("membership", config, "", requestUrl.searchParams.get("packageKey")));
  }
  if (pathname === "/points") {
    return htmlResponse(200, renderShopPage("points", config, "", requestUrl.searchParams.get("packageKey")));
  }
  if (pathname === "/membership/checkout") {
    return createCheckout({ req, requestUrl, config, kind: "membership" });
  }
  if (pathname === "/points/checkout") {
    return createCheckout({ req, requestUrl, config, kind: "points" });
  }
  if (pathname === "/membership/success" || pathname === "/points/success") {
    return htmlResponse(200, renderResultPage("Checkout complete", "Stripe confirmed your checkout. The package is applied after the webhook is received."));
  }
  if (pathname === "/membership/cancel" || pathname === "/points/cancel") {
    return htmlResponse(200, renderResultPage("Checkout canceled", "No package was applied because checkout was canceled."));
  }
  if (pathname === "/stripe/webhook") {
    return handleWebhook({ req, config, logger });
  }

  return null;
}
