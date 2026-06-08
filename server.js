import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { deflateSync } from "node:zlib";
import { decodeGameCodeQuery, encryptPayload } from "../protocol/cipher.js";
import { successData } from "../protocol/response.js";
import { buildStreetCreditLevelsXml } from "../features/accounts/street-credit.js";
import { handleAvatarUpload } from "../features/avatars/avatar-store.js";
import { handleUserGraphicUpload } from "../features/graphics/user-graphics.js";
import { buildPublicTournaments } from "../features/tournaments/public-tournaments.js";
import { handleHttpAction } from "./actions.js";
import { buildCacheManifest } from "./cache-manifest.js";
import {
  findCustomGraphicStudioAsset,
  findSiteAsset,
  findStaticAsset,
  sendStaticAsset,
} from "./static-assets.js";

const GAME_STYLES_CSS = `body {
  font-family: AliasCond;
  font-size: 8px;
  color: #d9dde2;
}

p {
  margin-bottom: 4px;
}

a {
  font-family: AliasCond;
  font-size: 8px;
  color: #7fc7ff;
  text-decoration: underline;
}

.eb {
  font-family: ArialBold;
  font-size: 11px;
  font-weight: bold;
}

.e10b {
  font-family: ArialBold;
  font-size: 11px;
  font-weight: bold;
}

.nim {
  font-family: AliasCond;
  font-size: 8px;
  color: #000000;
}

.nim_self {
  font-family: AliasCond;
  font-size: 8px;
  color: #3366cc;
}

.e0 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
.e1 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #ff0000; }
.e2 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #66ccff; }
.e3 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
.e4 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
.e5 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #000000; }
.e6 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #00aa00; }
.e7 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #f2c6ff; }
.e8 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #0000ff; }
.e9 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #b8860b; }
.e10 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #ffd166; }
.e11 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
.e12 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
.e13 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
.e14 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
.e15 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
.e16 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
.e17 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
.e18 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
.e19 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
.e20 { font-family: AliasCond; font-size: 8px; font-weight: normal; color: #d9dde2; }
`;

function sendText(res, statusCode, body, headers = {}) {
  const text = String(body ?? "");
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=latin1",
    "Content-Length": Buffer.byteLength(text, "latin1"),
    ...headers,
  });
  res.end(text, "latin1");
}

function sendCss(res, body) {
  sendText(res, 200, body, {
    "Content-Type": "text/css; charset=latin1",
    "Cache-Control": "no-store",
    "X-Nitto-Source": "local:game-styles",
  });
}

function sendXml(res, body, headers = {}) {
  const text = String(body ?? "");
  res.writeHead(200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Content-Length": Buffer.byteLength(text, "utf8"),
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(text, "utf8");
}

function sendBinary(res, statusCode, body, headers = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/octet-stream",
    "Content-Length": buffer.length,
    ...headers,
  });
  res.end(buffer);
}

function sendJson(res, statusCode, payload, headers = {}) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
    ...headers,
  });
  res.end(body, "utf8");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""), "utf8");
  const rightBuffer = Buffer.from(String(right ?? ""), "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isCustomGraphicStudioPath(pathname) {
  const normalizedPath = String(pathname || "").toLowerCase();
  return normalizedPath === "/custom-graphic-studio" ||
    normalizedPath.startsWith("/custom-graphic-studio/") ||
    normalizedPath === "/custom-graphics-studio" ||
    normalizedPath.startsWith("/custom-graphics-studio/") ||
    normalizedPath === "/custom-grpahics-studio" ||
    normalizedPath.startsWith("/custom-grpahics-studio/") ||
    normalizedPath === "/tools/custom-graphics-studio" ||
    normalizedPath.startsWith("/tools/custom-graphics-studio/");
}

function redirectTargetForCustomGraphicStudio(pathname) {
  const normalizedPath = String(pathname || "");
  const lowerPath = normalizedPath.toLowerCase();
  const routeRoots = [
    "/custom-graphic-studio",
    "/custom-graphics-studio",
    "/custom-grpahics-studio",
    "/tools/custom-graphics-studio",
  ];
  const routeRoot = routeRoots.find((root) => lowerPath === root);
  return routeRoot ? `${routeRoot}/` : null;
}

function customGraphicStudioAuthConfigured(config) {
  return Boolean(String(config.customStudioPassword || ""));
}

function hasCustomGraphicStudioAuth(req, config) {
  if (!customGraphicStudioAuthConfigured(config)) {
    return true;
  }

  const authorization = String(req.headers.authorization || "");
  if (!authorization.toLowerCase().startsWith("basic ")) {
    return false;
  }

  let decoded = "";
  try {
    decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) {
    return false;
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  return safeEqual(username, config.customStudioUsername || "studio") &&
    safeEqual(password, config.customStudioPassword);
}

function sendCustomGraphicStudioAuthRequired(res) {
  sendText(res, 401, "authentication required\n", {
    "Cache-Control": "no-store",
    "WWW-Authenticate": 'Basic realm="Nitto Custom Graphic Studio"',
    "X-Nitto-Source": "local:custom-graphic-studio-auth",
  });
}

function sendCustomGraphicStudioRedirect(res, location) {
  res.writeHead(308, {
    Location: location,
    "Cache-Control": "no-store",
    "Content-Length": 0,
  });
  res.end();
}

function buildPublicLeaderboards() {
  return {
    ok: true,
    source: "local:public-leaderboards",
    generatedAt: new Date().toISOString(),
    leaderboards: {
      fastestRuns: [],
      topBallers: [],
      topStreetCredit: [],
    },
  };
}

function sendCrossDomainPolicy(res) {
  sendText(
    res,
    200,
    [
      '<?xml version="1.0"?>',
      '<cross-domain-policy>',
      '<allow-access-from domain="*" secure="false" />',
      '<allow-http-request-headers-from domain="*" headers="*" secure="false" />',
      '</cross-domain-policy>',
      "",
    ].join("\n"),
    {
      "Content-Type": "text/x-cross-domain-policy",
      "Cache-Control": "no-store",
      "X-Nitto-Source": "local:crossdomain",
    },
  );
}

function decodeRequestQuery(rawQuery) {
  try {
    return {
      encrypted: true,
      ...decodeGameCodeQuery(rawQuery),
    };
  } catch (error) {
    const params = new URLSearchParams(rawQuery);
    const action = params.get("action") || "";
    if (!action) {
      throw error;
    }

    return {
      encrypted: false,
      seed: null,
      action,
      params,
      decoded: rawQuery,
    };
  }
}

const TOURNAMENT_KEY_DIGIT_BITMAPS = Object.freeze({
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "001", "001", "001"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"],
});

function createTournamentKeyCode(aid, rid, tournamentType = "") {
  const keyType = String(tournamentType || "cpu").trim().toLowerCase();
  const seed = keyType === "cpu" || !keyType
    ? `${aid}:1:cpu`
    : `${aid}:${rid}:${keyType}`;
  const digest = createHash("sha1").update(seed, "utf8").digest("hex");
  const numeric = parseInt(digest.slice(0, 8), 16);
  return String((numeric % 32) + 1);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writePngChunk(type, data) {
  const chunkLength = Buffer.alloc(4);
  chunkLength.writeUInt32BE(data.length, 0);
  const chunkType = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([chunkType, data])) >>> 0, 0);
  return Buffer.concat([chunkLength, chunkType, data, crc]);
}

function renderTournamentKeyImage(code) {
  const width = 48;
  const height = 24;
  const scale = 3;
  const digitWidth = 3 * scale;
  const gap = scale;
  const marginX = 4;
  const marginY = 4;
  const formattedCode = String(code || "0000").padStart(4, "0").slice(-4);
  const pixels = Buffer.alloc((width * 4 + 1) * height, 0);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    pixels[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * 4;
      const shade = y < height / 2 ? 235 : 220;
      pixels[offset] = shade;
      pixels[offset + 1] = shade;
      pixels[offset + 2] = shade;
      pixels[offset + 3] = 255;
    }
  }

  for (let digitIndex = 0; digitIndex < formattedCode.length; digitIndex += 1) {
    const glyph = TOURNAMENT_KEY_DIGIT_BITMAPS[formattedCode[digitIndex]] || TOURNAMENT_KEY_DIGIT_BITMAPS[0];
    const startX = marginX + digitIndex * (digitWidth + gap);
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== "1") {
          continue;
        }
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            const x = startX + col * scale + sx;
            const y = marginY + row * scale + sy;
            if (x < 0 || x >= width || y < 0 || y >= height) {
              continue;
            }
            const offset = y * (width * 4 + 1) + 1 + x * 4;
            pixels[offset] = 25;
            pixels[offset + 1] = 25;
            pixels[offset + 2] = 25;
            pixels[offset + 3] = 255;
          }
        }
      }
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    signature,
    writePngChunk("IHDR", ihdr),
    writePngChunk("IDAT", deflateSync(pixels)),
    writePngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function createHttpServer({ config, logger, tcpServer = null }) {
  return createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    try {
      if (requestUrl.pathname === "/health") {
        sendJson(res, 200, {
          ok: true,
        });
        return;
      }

      if (requestUrl.pathname === "/healthz") {
        sendText(res, 200, "ok", {
          "Cache-Control": "no-store",
          "X-Nitto-Source": "local:healthz",
        });
        return;
      }

      if (requestUrl.pathname.toLowerCase() === "/crossdomain.xml") {
        sendCrossDomainPolicy(res);
        return;
      }

      if (isCustomGraphicStudioPath(requestUrl.pathname) && !hasCustomGraphicStudioAuth(req, config)) {
        sendCustomGraphicStudioAuthRequired(res);
        return;
      }

      const studioRedirectTarget = redirectTargetForCustomGraphicStudio(requestUrl.pathname);
      if (studioRedirectTarget) {
        sendCustomGraphicStudioRedirect(res, studioRedirectTarget);
        return;
      }

      if (requestUrl.pathname !== "/gameCode1_00.aspx") {
        const siteAsset = findSiteAsset(requestUrl.pathname, config);
        if (siteAsset.filePath) {
          logger.info("HTTP V2 site asset served", {
            path: requestUrl.pathname,
            filePath: siteAsset.filePath,
          });
          sendStaticAsset(res, siteAsset.filePath, {
            "X-Nitto-Source": "local:v2-site",
          });
          return;
        }

        const studioAsset = findCustomGraphicStudioAsset(requestUrl.pathname, config);
        if (studioAsset.filePath) {
          logger.info("HTTP custom graphic studio asset served", {
            path: requestUrl.pathname,
            filePath: studioAsset.filePath,
          });
          sendStaticAsset(res, studioAsset.filePath, {
            "Cache-Control": "no-store",
            "X-Nitto-Source": "local:custom-graphic-studio",
          });
          return;
        }

        if (studioAsset.candidates.length > 0) {
          logger.warn("HTTP custom graphic studio asset is not available locally", {
            path: requestUrl.pathname,
            candidates: studioAsset.candidates,
          });
        }

        if (requestUrl.pathname.toLowerCase() === "/api/public-leaderboards") {
          sendJson(res, 200, buildPublicLeaderboards(), {
            "Cache-Control": "no-store",
            "X-Nitto-Source": "local:public-leaderboards",
          });
          return;
        }

        if (requestUrl.pathname.toLowerCase() === "/api/public-tournaments") {
          sendJson(res, 200, buildPublicTournaments(), {
            "Cache-Control": "no-store",
            "X-Nitto-Source": "local:public-tournaments",
          });
          return;
        }

        if (requestUrl.pathname.toLowerCase() === "/accountupload.aspx") {
          if (req.method !== "POST") {
            sendText(res, 405, "method not allowed\n");
            return;
          }

          const uploadResult = await handleAvatarUpload({
            req,
            config,
            logger,
            remoteAddress: req.socket.remoteAddress,
          });

          sendText(res, uploadResult.statusCode, uploadResult.body, {
            "Cache-Control": "no-store",
            "X-Nitto-Source": "local:avatar-upload",
          });
          return;
        }

        if (requestUrl.pathname.toLowerCase().endsWith("upload.aspx")) {
          if (req.method !== "POST") {
            sendText(res, 405, "method not allowed\n");
            return;
          }

          const uploadResult = await handleUserGraphicUpload({
            req,
            config,
            logger,
            remoteAddress: req.socket.remoteAddress,
            searchParams: requestUrl.searchParams,
          });

          sendText(res, uploadResult.statusCode, uploadResult.body, {
            "Cache-Control": "no-store",
            "X-Nitto-Source": "local:user-graphic-upload",
          });
          return;
        }

        if (
          requestUrl.pathname.toLowerCase() === "/content.htm" ||
          requestUrl.pathname.toLowerCase() === "/dl/content.htm"
        ) {
          if (!config.cacheManifestEnabled) {
            logger.info("HTTP cache manifest disabled", {
              path: requestUrl.pathname,
            });
            sendText(res, 200, successData("<n2 />"), {
              "Cache-Control": "no-store",
              "X-Nitto-Source": "local:cache-manifest-disabled",
            });
            return;
          }

          const startedAt = performance.now();
          const manifest = await buildCacheManifest({
            assetRoot: config.assetRoot,
            dataRoot: config.dataRoot,
            ttlMs: config.cacheManifestTtlMs,
            hashConcurrency: config.cacheManifestHashConcurrency,
          });
          const durationMs = performance.now() - startedAt;
          logger.info("HTTP cache manifest served", {
            path: requestUrl.pathname,
            files: manifest.fileCount,
            bytes: manifest.byteCount,
            fromCache: manifest.fromCache,
            durationMs,
          });
          sendText(res, 200, successData(manifest.xml), {
            "Cache-Control": "no-store",
            "X-Nitto-Source": "local:cache-manifest",
          });
          return;
        }

        if (
          requestUrl.pathname.toLowerCase() === "/sclevels.xml" ||
          requestUrl.pathname.toLowerCase() === "/dl/sclevels.xml"
        ) {
          logger.info("HTTP street credit levels served", {
            path: requestUrl.pathname,
          });
          sendXml(res, buildStreetCreditLevelsXml(), {
            "X-Nitto-Source": "generated:scLevels.xml",
          });
          return;
        }

        if (
          requestUrl.pathname.toLowerCase() === "/gamestyles.css" ||
          requestUrl.pathname.toLowerCase() === "/newsstyles.css"
        ) {
          logger.info("HTTP game stylesheet served", {
            path: requestUrl.pathname,
          });
          sendCss(res, GAME_STYLES_CSS);
          return;
        }

        if (requestUrl.pathname.toLowerCase() === "/generatetournamentkey.aspx") {
          const tournamentKey = createTournamentKeyCode(
            requestUrl.searchParams.get("aid") || "0",
            requestUrl.searchParams.get("rid") || "0",
            requestUrl.searchParams.get("t") || "cpu",
          );
          const image = renderTournamentKeyImage(tournamentKey);
          logger.info("HTTP computer tournament key served", {
            path: requestUrl.pathname,
            tournamentKey,
          });
          sendBinary(res, 200, image, {
            "Content-Type": "image/png",
            "Cache-Control": "no-store",
            "X-Nitto-Source": "local:computer-tournament-key",
          });
          return;
        }

        if (requestUrl.pathname.toLowerCase() === "/oneclient.html") {
          logger.info("HTTP process check served", {
            path: requestUrl.pathname,
            result: 0,
          });
          sendText(res, 200, "0", {
            "Cache-Control": "no-store",
            "X-Nitto-Source": "local:process-check",
          });
          return;
        }

        const asset = findStaticAsset(requestUrl.pathname, config);
        if (asset.filePath) {
          logger.info("HTTP static asset served", {
            path: requestUrl.pathname,
            filePath: asset.filePath,
          });
          sendStaticAsset(res, asset.filePath);
          return;
        }

        if (asset.candidates.length > 0) {
          logger.warn("HTTP static asset is not available locally", {
            path: requestUrl.pathname,
            candidates: asset.candidates,
          });
        } else {
          logger.warn("HTTP route is not implemented yet", {
            path: requestUrl.pathname,
          });
        }

        sendText(res, 404, `not found: ${requestUrl.pathname}\n`);
        return;
      }

      const rawQuery = req.url?.includes("?") ? req.url.split("?", 2)[1] : "";
      if (!rawQuery) {
        sendText(res, 400, `"s", 0`);
        return;
      }

      const decoded = decodeRequestQuery(rawQuery);
      const startedAt = performance.now();
      const result = await handleHttpAction({
        action: decoded.action,
        config,
        params: decoded.params,
        rawQuery,
        decodedQuery: decoded.decoded,
        encrypted: decoded.encrypted,
        remoteAddress: req.socket.remoteAddress,
        logger,
        tcpServer,
      });
      const durationMs = performance.now() - startedAt;

      const responseBody = decoded.encrypted
        ? encryptPayload(result.body, decoded.seed)
        : result.body;

      if (config.timingLogsEnabled) {
        logger.info("HTTP game action timing", {
          action: decoded.action || "<unknown>",
          source: result.source,
          encrypted: decoded.encrypted,
          ok: true,
          durationMs,
        });
      }

      logger.info("HTTP game action served", {
        action: decoded.action || "<unknown>",
        encrypted: decoded.encrypted,
        source: result.source,
      });

      sendText(res, 200, responseBody, {
        "X-Nitto-Action": decoded.action || "<unknown>",
        "X-Nitto-Source": result.source,
      });
    } catch (error) {
      logger.error("HTTP request failed", error);
      sendText(res, 500, `"s", 0`);
    }
  });
}
