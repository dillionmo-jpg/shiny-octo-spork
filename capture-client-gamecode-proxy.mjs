import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeGameCodeQuery, decodePayload } from "../src/nitto-cipher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const DEFAULT_LISTEN_HOST = "127.0.0.1";
const DEFAULT_LISTEN_PORT = 8089;
const DEFAULT_TARGET_BASE = "http://44.206.42.27/";
const DEFAULT_LOG_DIR = path.join(ROOT_DIR, "docs", "oem-part-evidence", "client-payload-captures");
const DEFAULT_WATCH_ACTIONS = ["getallcars", "getonecar", "buycar"];

function readArgValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
}

function hasArg(flag) {
  return process.argv.includes(flag);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowStamp() {
  return new Date().toISOString();
}

function fileStamp() {
  return nowStamp().replace(/[:.]/g, "-");
}

function sanitizeFileToken(value) {
  return String(value || "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown";
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function parseWatchActions(raw) {
  return String(raw || "")
    .split(",")
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(Boolean);
}

function isActionRequest(requestUrl) {
  const pathname = String(requestUrl.pathname || "").toLowerCase();
  return pathname.includes("gamecode1_00.aspx")
    || pathname.includes("/api/legacy/bridge")
    || requestUrl.searchParams.has("action")
    || Boolean(requestUrl.search);
}

function decodeRequest(requestUrl) {
  const rawQuery = requestUrl.search ? requestUrl.search.slice(1) : "";
  if (!rawQuery) {
    return {
      rawQuery,
      mode: "none",
      action: "",
      decodedQuery: "",
      seed: null,
      params: {},
      decodeError: "",
    };
  }

  try {
    const decoded = decodeGameCodeQuery(rawQuery);
    return {
      rawQuery,
      mode: "encoded",
      action: String(decoded.action || ""),
      decodedQuery: decoded.decoded,
      seed: decoded.seed,
      params: Object.fromEntries(decoded.params.entries()),
      decodeError: "",
    };
  } catch (error) {
    const plainParams = new URLSearchParams(rawQuery);
    const plainAction = String(plainParams.get("action") || "");
    if (plainAction) {
      return {
        rawQuery,
        mode: "plain",
        action: plainAction,
        decodedQuery: rawQuery,
        seed: null,
        params: Object.fromEntries(plainParams.entries()),
        decodeError: "",
      };
    }

    return {
      rawQuery,
      mode: "unknown",
      action: "",
      decodedQuery: "",
      seed: null,
      params: {},
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function decodeResponseBody(rawBody) {
  const text = Buffer.isBuffer(rawBody) ? rawBody.toString("latin1") : String(rawBody || "");
  if (!text) {
    return {
      rawText: "",
      mode: "empty",
      decodedText: "",
      seed: null,
      decodeError: "",
    };
  }

  try {
    const decoded = decodePayload(text);
    return {
      rawText: text,
      mode: "encoded",
      decodedText: decoded.decoded,
      seed: decoded.seed,
      decodeError: "",
    };
  } catch (error) {
    return {
      rawText: text,
      mode: "plain",
      decodedText: text,
      seed: null,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function proxyBufferedRequest({
  req,
  res,
  targetUrl,
  targetBase,
  logDir,
  watchActions,
}) {
  const requestBuffer = await collectStream(req);
  const requestInfo = decodeRequest(new URL(req.url, `${targetBase.origin}`));
  const targetHeaders = { ...req.headers, host: targetUrl.host };

  const proxied = await new Promise((resolve, reject) => {
    const upstreamReq = http.request(targetUrl, {
      method: req.method,
      headers: targetHeaders,
    }, async (upstreamRes) => {
      try {
        const responseBuffer = await collectStream(upstreamRes);
        resolve({
          statusCode: upstreamRes.statusCode || 502,
          statusMessage: upstreamRes.statusMessage || "",
          headers: upstreamRes.headers,
          body: responseBuffer,
        });
      } catch (error) {
        reject(error);
      }
    });

    upstreamReq.on("error", reject);
    upstreamReq.end(requestBuffer);
  });

  const responseInfo = decodeResponseBody(proxied.body);
  const entry = {
    capturedAt: nowStamp(),
    request: {
      method: req.method || "GET",
      incomingPath: req.url || "/",
      targetUrl: targetUrl.toString(),
      mode: requestInfo.mode,
      action: requestInfo.action,
      decodedQuery: requestInfo.decodedQuery,
      rawQuery: requestInfo.rawQuery,
      seed: requestInfo.seed,
      params: requestInfo.params,
      bodyLatin1: requestBuffer.toString("latin1"),
      decodeError: requestInfo.decodeError,
    },
    response: {
      statusCode: proxied.statusCode,
      statusMessage: proxied.statusMessage,
      headers: proxied.headers,
      mode: responseInfo.mode,
      decodedBody: responseInfo.decodedText,
      rawBody: responseInfo.rawText,
      seed: responseInfo.seed,
      decodeError: responseInfo.decodeError,
      bodyBytes: proxied.body.length,
    },
  };

  ensureDir(logDir);
  fs.appendFileSync(
    path.join(logDir, "capture-log.jsonl"),
    `${JSON.stringify(entry)}\n`,
  );

  const normalizedAction = String(requestInfo.action || "").toLowerCase();
  if (watchActions.includes(normalizedAction)) {
    const detailPath = path.join(
      logDir,
      `${fileStamp()}-${sanitizeFileToken(normalizedAction)}.json`,
    );
    writeJson(detailPath, entry);
    console.log(JSON.stringify({
      capturedAt: entry.capturedAt,
      action: normalizedAction,
      detailPath,
      statusCode: proxied.statusCode,
    }));
  } else if (normalizedAction) {
    console.log(JSON.stringify({
      capturedAt: entry.capturedAt,
      action: normalizedAction,
      statusCode: proxied.statusCode,
      loggedTo: path.join(logDir, "capture-log.jsonl"),
    }));
  }

  const responseHeaders = { ...proxied.headers };
  responseHeaders["content-length"] = String(proxied.body.length);
  res.writeHead(proxied.statusCode, proxied.statusMessage, responseHeaders);
  res.end(proxied.body);
}

function proxyStreamingRequest(req, res, targetUrl) {
  const upstreamReq = http.request(targetUrl, {
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
    },
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.statusMessage || "", upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstreamReq.on("error", (error) => {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`proxy error: ${error instanceof Error ? error.message : String(error)}\n`);
  });

  req.pipe(upstreamReq);
}

async function main() {
  const listenHost = readArgValue("--listen-host", DEFAULT_LISTEN_HOST);
  const listenPort = Number(readArgValue("--listen-port", String(DEFAULT_LISTEN_PORT)));
  const targetBase = new URL(readArgValue("--target-base", DEFAULT_TARGET_BASE));
  const logDir = path.resolve(readArgValue("--log-dir", DEFAULT_LOG_DIR));
  const watchActions = parseWatchActions(readArgValue("--watch-actions", DEFAULT_WATCH_ACTIONS.join(",")));

  ensureDir(logDir);

  const server = http.createServer((req, res) => {
    const targetUrl = new URL(req.url || "/", targetBase);
    if (isActionRequest(targetUrl)) {
      proxyBufferedRequest({
        req,
        res,
        targetUrl,
        targetBase,
        logDir,
        watchActions,
      }).catch((error) => {
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`proxy error: ${error instanceof Error ? error.message : String(error)}\n`);
      });
      return;
    }

    proxyStreamingRequest(req, res, targetUrl);
  });

  server.listen(listenPort, listenHost, () => {
    console.log(JSON.stringify({
      listenHost,
      listenPort,
      targetBase: targetBase.toString(),
      logDir,
      watchActions,
      note: "Rewrite the standalone HTTP server URLs to this proxy, then trigger getallcars/getonecar/buycar in the client.",
    }, null, 2));
  });

  if (!hasArg("--keep-open")) {
    process.on("SIGINT", () => {
      server.close(() => process.exit(0));
    });
    process.on("SIGTERM", () => {
      server.close(() => process.exit(0));
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
