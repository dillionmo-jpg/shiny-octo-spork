import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import jpeg from "jpeg-js";
import { LocalAccountStore, TEAM_ROLE } from "../accounts/local-account-store.js";

const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPE = "avatars";
const TEAM_AVATAR_TYPE = "teamavatars";
const DEFAULT_CLIENT_AVATAR_ROOT = "C:\\Program Files (x86)\\Nitto 1320 Legends\\cache\\avatars";
const CLIENT_AVATAR_WIDTH = 96;
const CLIENT_AVATAR_HEIGHT = 80;
const CLIENT_SAFE_AVATAR_MAX_WIDTH = 100;
const CLIENT_SAFE_AVATAR_MAX_HEIGHT = 100;
const CLIENT_SAFE_FALLBACK_AVATAR_ID = 1;
const AVATAR_JPEG_QUALITY = 85;
const COMPUTER_TOURNAMENT_AVATAR_IDS = [
  100, 109, 110, 111, 112, 113, 114, 115,
  116, 117, 118, 119, 120, 121, 122, 123,
  124, 125, 126, 127, 128, 129, 130, 131,
  132, 90, 91, 92, 93, 94, 95,
];
const pendingUploadsByRemote = new Map();

function normalizeRemoteAddress(remoteAddress) {
  return String(remoteAddress || "").replace(/^::ffff:/, "");
}

function firstForwardedAddress(value) {
  return String(value || "")
    .split(",", 1)[0]
    .trim();
}

function requestClientAddress(remoteAddress, requestHeaders = {}) {
  const forwarded = firstForwardedAddress(requestHeaders["x-forwarded-for"]);
  if (forwarded) {
    return normalizeRemoteAddress(forwarded);
  }

  const realIp = String(requestHeaders["x-real-ip"] || "").trim();
  if (realIp) {
    return normalizeRemoteAddress(realIp);
  }

  return normalizeRemoteAddress(remoteAddress);
}

function uploadFilenameKey(value) {
  return basename(String(value || "").replace(/\\/g, "/")).toLowerCase();
}

function rememberPendingUpload(remoteKey, pendingUpload) {
  const pendingUploads = pendingUploadsByRemote.get(remoteKey) || [];
  pendingUploads.push(pendingUpload);
  pendingUploadsByRemote.set(remoteKey, pendingUploads);
}

function takePendingUpload(remoteKey, filename) {
  const pendingUploads = pendingUploadsByRemote.get(remoteKey) || [];
  if (pendingUploads.length === 0) {
    return null;
  }

  const filenameKey = uploadFilenameKey(filename);
  let pendingIndex = filenameKey
    ? pendingUploads.findIndex((pendingUpload) => uploadFilenameKey(pendingUpload.filename) === filenameKey)
    : -1;

  if (pendingIndex < 0 && pendingUploads.length === 1) {
    pendingIndex = 0;
  }
  if (pendingIndex < 0) {
    return null;
  }

  const [pendingUpload] = pendingUploads.splice(pendingIndex, 1);
  if (pendingUploads.length === 0) {
    removePendingUpload(remoteKey, pendingUpload);
  } else {
    pendingUploadsByRemote.set(remoteKey, pendingUploads);
  }

  return pendingUpload;
}

function removePendingUpload(remoteKey, pendingUpload) {
  const pendingUploads = pendingUploadsByRemote.get(remoteKey) || [];
  const pendingIndex = pendingUploads.indexOf(pendingUpload);
  if (pendingIndex < 0) {
    return;
  }

  pendingUploads.splice(pendingIndex, 1);
  if (pendingUploads.length === 0) {
    pendingUploadsByRemote.delete(remoteKey);
  } else {
    pendingUploadsByRemote.set(remoteKey, pendingUploads);
  }
}

function normalizeAvatarType(value) {
  return String(value || "").trim().toLowerCase();
}

function isAccountAvatarType(value) {
  return normalizeAvatarType(value) === AVATAR_TYPE;
}

function isTeamAvatarType(value) {
  const normalizedType = normalizeAvatarType(value);
  return normalizedType === TEAM_AVATAR_TYPE || normalizedType === "teamavatar";
}

function avatarPathPartsToId(parts) {
  const [millions, tenThousands, hundreds, ones] = parts.map((part) => Number(part));

  if (![millions, tenThousands, hundreds, ones].every((part) => Number.isInteger(part) && part >= 0)) {
    return 0;
  }

  return millions * 1000000 + tenThousands * 10000 + hundreds * 100 + ones;
}

function computerTournamentAvatarId(avatarId) {
  const numericAvatarId = Number(avatarId || 0);
  const botIndex = numericAvatarId >= 2100 && numericAvatarId < 2100 + COMPUTER_TOURNAMENT_AVATAR_IDS.length
    ? numericAvatarId - 2100
    : numericAvatarId >= 1100 && numericAvatarId < 1100 + COMPUTER_TOURNAMENT_AVATAR_IDS.length
      ? numericAvatarId - 1100
      : -1;

  return botIndex >= 0 ? COMPUTER_TOURNAMENT_AVATAR_IDS[botIndex] : 0;
}

function clientAvatarRoot() {
  return process.env.NITTO_CLIENT_AVATAR_ROOT || DEFAULT_CLIENT_AVATAR_ROOT;
}

export function jpegDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;

    while (buffer[offset] === 0xff) {
      offset += 1;
    }

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 2 > buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      break;
    }

    if (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  return null;
}

export function clientSafeAvatarDimensions(dimensions) {
  const width = Number(dimensions?.width || 0);
  const height = Number(dimensions?.height || 0);

  return Number.isFinite(width)
    && Number.isFinite(height)
    && width > 0
    && height > 0
    && width <= CLIENT_SAFE_AVATAR_MAX_WIDTH
    && height <= CLIENT_SAFE_AVATAR_MAX_HEIGHT;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sampleChannel(data, width, height, x, y, channel) {
  const x0 = clamp(Math.floor(x), 0, width - 1);
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = clamp(x0 + 1, 0, width - 1);
  const y1 = clamp(y0 + 1, 0, height - 1);
  const xRatio = clamp(x - x0, 0, 1);
  const yRatio = clamp(y - y0, 0, 1);
  const topLeft = data[((y0 * width + x0) * 4) + channel];
  const topRight = data[((y0 * width + x1) * 4) + channel];
  const bottomLeft = data[((y1 * width + x0) * 4) + channel];
  const bottomRight = data[((y1 * width + x1) * 4) + channel];
  const top = topLeft + (topRight - topLeft) * xRatio;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * xRatio;

  return Math.round(top + (bottom - top) * yRatio);
}

function resizeAvatarCover(decoded) {
  const sourceWidth = Number(decoded?.width || 0);
  const sourceHeight = Number(decoded?.height || 0);
  if (!sourceWidth || !sourceHeight || !decoded?.data) {
    throw new Error("invalid-avatar-source");
  }

  const scale = Math.max(CLIENT_AVATAR_WIDTH / sourceWidth, CLIENT_AVATAR_HEIGHT / sourceHeight);
  const cropWidth = CLIENT_AVATAR_WIDTH / scale;
  const cropHeight = CLIENT_AVATAR_HEIGHT / scale;
  const cropX = (sourceWidth - cropWidth) / 2;
  const cropY = (sourceHeight - cropHeight) / 2;
  const data = Buffer.alloc(CLIENT_AVATAR_WIDTH * CLIENT_AVATAR_HEIGHT * 4, 255);

  for (let y = 0; y < CLIENT_AVATAR_HEIGHT; y += 1) {
    for (let x = 0; x < CLIENT_AVATAR_WIDTH; x += 1) {
      const sourceX = cropX + ((x + 0.5) / scale) - 0.5;
      const sourceY = cropY + ((y + 0.5) / scale) - 0.5;
      const targetOffset = (y * CLIENT_AVATAR_WIDTH + x) * 4;

      data[targetOffset] = sampleChannel(decoded.data, sourceWidth, sourceHeight, sourceX, sourceY, 0);
      data[targetOffset + 1] = sampleChannel(decoded.data, sourceWidth, sourceHeight, sourceX, sourceY, 1);
      data[targetOffset + 2] = sampleChannel(decoded.data, sourceWidth, sourceHeight, sourceX, sourceY, 2);
      data[targetOffset + 3] = 255;
    }
  }

  return {
    data,
    width: CLIENT_AVATAR_WIDTH,
    height: CLIENT_AVATAR_HEIGHT,
  };
}

export function normalizeAvatarJpeg(buffer) {
  const decoded = jpeg.decode(buffer, {
    colorTransform: true,
    maxMemoryUsageInMB: 256,
    useTArray: true,
  });
  const resized = resizeAvatarCover(decoded);

  return jpeg.encode(resized, AVATAR_JPEG_QUALITY).data;
}

export function normalizedAvatarDimensions() {
  return {
    width: CLIENT_AVATAR_WIDTH,
    height: CLIENT_AVATAR_HEIGHT,
  };
}

export function isAvatarRequestPath(pathname) {
  const normalizedPath = decodeURIComponent(pathname || "").replace(/\\/g, "/");

  return /^\/cache\/avatars\/\d+\.jpg$/i.test(normalizedPath)
    || /^\/avatars\/\d+\/\d+\/\d+\/\d+\.jpg$/i.test(normalizedPath)
    || /^\/teamavatars\/\d+\/\d+\/\d+\/\d+\.jpg$/i.test(normalizedPath);
}

function firstExistingClientSafeAvatar(paths) {
  return paths.find((filePath) => {
    try {
      return filePath
        && existsSync(filePath)
        && statSync(filePath).isFile()
        && clientSafeAvatarDimensions(jpegDimensions(readFileSync(filePath)));
    } catch {
      return false;
    }
  }) || "";
}

export function clientSafeAvatarFallbackPath({ assetRoot, dataRoot }) {
  return firstExistingClientSafeAvatar([
    join(assetRoot, "cache", "avatars", `${CLIENT_SAFE_FALLBACK_AVATAR_ID}.jpg`),
    join(clientAvatarRoot(), `${CLIENT_SAFE_FALLBACK_AVATAR_ID}.jpg`),
  ]);
}

export function clientAvatarFilePath(filePath, { assetRoot, dataRoot }) {
  let sourceBuffer;
  let sourceDimensions;

  try {
    sourceBuffer = readFileSync(filePath);
    sourceDimensions = jpegDimensions(sourceBuffer);
    if (clientSafeAvatarDimensions(sourceDimensions)) {
      return filePath;
    }
  } catch {
    return clientSafeAvatarFallbackPath({ assetRoot, dataRoot }) || filePath;
  }

  const safeFilePath = join(dataRoot, "avatars", "client-safe", basename(filePath));

  try {
    const sourceStat = statSync(filePath);
    if (existsSync(safeFilePath)) {
      const safeStat = statSync(safeFilePath);
      if (safeStat.mtimeMs >= sourceStat.mtimeMs) {
        const safeDimensions = jpegDimensions(readFileSync(safeFilePath));
        if (clientSafeAvatarDimensions(safeDimensions)) {
          return safeFilePath;
        }
      }
    }

    const normalizedBytes = normalizeAvatarJpeg(sourceBuffer);
    mkdirSync(dirname(safeFilePath), { recursive: true });
    writeFileSync(safeFilePath, normalizedBytes);

    return safeFilePath;
  } catch {
    return clientSafeAvatarFallbackPath({ assetRoot, dataRoot }) || filePath;
  }
}

function parseMultipartUpload(body, contentType) {
  const boundaryMatch = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    return null;
  }

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const bodyText = body.toString("latin1");
  const parts = bodyText.split(boundary);

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0 || !/filename=/i.test(part.slice(0, headerEnd))) {
      continue;
    }

    const headers = part.slice(0, headerEnd);
    let content = part.slice(headerEnd + 4);
    if (content.endsWith("\r\n")) {
      content = content.slice(0, -2);
    }

    const filename = headers.match(/filename="([^"]*)"/i)?.[1] || "";

    return {
      filename,
      bytes: Buffer.from(content, "latin1"),
    };
  }

  return null;
}

function requestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let rejected = false;

    req.on("data", (chunk) => {
      if (rejected) {
        return;
      }

      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        rejected = true;
        reject(Object.assign(new Error("upload-too-large"), { statusCode: 406 }));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (!rejected) {
        resolve(Buffer.concat(chunks));
      }
    });
    req.on("error", reject);
  });
}

export async function rememberAvatarUploadRequest({
  remoteAddress,
  requestHeaders,
  accountId,
  targetId,
  avatarType,
  filename,
  dataRoot,
}) {
  const normalizedType = normalizeAvatarType(avatarType);
  const numericAccountId = Number(accountId || 0);
  const numericTargetId = Number(targetId || 0);

  if (!Number.isInteger(numericAccountId) || numericAccountId <= 0) {
    return false;
  }

  // For account avatars: targetId must match accountId
  if (isAccountAvatarType(normalizedType)) {
    if (numericTargetId !== numericAccountId) {
      return false;
    }
  }

  // For team avatars: validate team membership and permissions
  if (isTeamAvatarType(normalizedType)) {
    if (!Number.isInteger(numericTargetId) || numericTargetId <= 0) {
      return false;
    }

    // Validate user has permission to update this team's avatar
    if (dataRoot) {
      const accountStore = new LocalAccountStore({ dataRoot });
      const teamContext = await accountStore.getTeamForAccount(numericAccountId);
      const role = Number(teamContext.member?.role || 0);
      const canUpdateTeamAvatar = Number(teamContext.team?.id || 0) === numericTargetId
        && (role === TEAM_ROLE.LEADER || role === TEAM_ROLE.CO_LEADER);

      if (!canUpdateTeamAvatar) {
        return false;
      }
    }
  }

  const finalAvatarType = isTeamAvatarType(normalizedType) ? TEAM_AVATAR_TYPE : AVATAR_TYPE;
  const finalTargetId = isTeamAvatarType(normalizedType) ? numericTargetId : numericAccountId;

  rememberPendingUpload(requestClientAddress(remoteAddress, requestHeaders), {
    accountId: numericAccountId,
    avatarType: finalAvatarType,
    filename: String(filename || ""),
    requestedAt: Date.now(),
    targetId: finalTargetId,
  });

  return true;
}

export function resolveAvatarRequestPath(pathname, { assetRoot, dataRoot }) {
  const normalizedPath = decodeURIComponent(pathname || "").replace(/\\/g, "/");
  const cacheMatch = normalizedPath.match(/^\/cache\/avatars\/(\d+)\.jpg$/i);
  const nestedMatch = normalizedPath.match(/^\/(avatars|teamavatars)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\.jpg$/i);
  const isTeamAvatar = String(nestedMatch?.[1] || "").toLowerCase() === "teamavatars";

  const avatarId = cacheMatch
    ? Number(cacheMatch[1])
    : nestedMatch
      ? avatarPathPartsToId(nestedMatch.slice(2))
      : 0;

  if (!Number.isInteger(avatarId) || avatarId <= 0) {
    return [];
  }

  if (isTeamAvatar) {
    return [
      join(dataRoot, "teamAvatars", `${avatarId}.jpg`),
      join(dataRoot, "teamavatars", `${avatarId}.jpg`),
      join(assetRoot, "cache", "teamAvatars", `${avatarId}.jpg`),
      join(assetRoot, "cache", "teamavatars", `${avatarId}.jpg`),
      join(assetRoot, "cache", "avatars", `${CLIENT_SAFE_FALLBACK_AVATAR_ID}.jpg`),
      join(clientAvatarRoot(), `${CLIENT_SAFE_FALLBACK_AVATAR_ID}.jpg`),
    ];
  }

  const tournamentAvatarId = computerTournamentAvatarId(avatarId);
  const candidates = [
    join(dataRoot, "avatars", `${avatarId}.jpg`),
    join(assetRoot, "cache", "avatars", `${avatarId}.jpg`),
    join(clientAvatarRoot(), `${avatarId}.jpg`),
  ];

  if (tournamentAvatarId > 0) {
    candidates.push(
      join(dataRoot, "avatars", `${tournamentAvatarId}.jpg`),
      join(assetRoot, "cache", "avatars", `${tournamentAvatarId}.jpg`),
      join(clientAvatarRoot(), `${tournamentAvatarId}.jpg`),
    );
  }

  return candidates;
}

export async function handleAvatarUpload({ req, config, logger, remoteAddress, requestHeaders = {} }) {
  const remoteKey = requestClientAddress(remoteAddress, requestHeaders);
  const pendingUploads = pendingUploadsByRemote.get(remoteKey) || [];

  if (pendingUploads.length === 0) {
    logger.warn("Avatar upload rejected because no upload request was pending", { remoteAddress: remoteKey });
    return { statusCode: 409, body: "missing upload request\n" };
  }

  let pendingUpload = pendingUploads.length === 1 ? pendingUploads[0] : null;
  let isTeamUpload = pendingUpload ? isTeamAvatarType(pendingUpload.avatarType) : false;
  let uploadLabel = isTeamUpload ? "team avatar" : "avatar";
  const accountStore = new LocalAccountStore({ dataRoot: config.dataRoot });

  let body;
  try {
    body = await requestBody(req, MAX_AVATAR_UPLOAD_BYTES);
  } catch (error) {
    if (error.statusCode === 406) {
      logger.warn(`${uploadLabel} upload rejected because body exceeds byte limit`, {
        accountId: pendingUpload.accountId,
        teamId: isTeamUpload ? Number(pendingUpload.targetId || 0) : null,
        maxBytes: MAX_AVATAR_UPLOAD_BYTES,
      });
      removePendingUpload(remoteKey, pendingUpload);
      return { statusCode: 406, body: `${uploadLabel} upload too large\n` };
    }

    throw error;
  }
  const upload = parseMultipartUpload(body, req.headers["content-type"]) || {
    filename: pendingUpload?.filename || "",
    bytes: body,
  };
  pendingUpload = takePendingUpload(remoteKey, upload.filename);

  if (!pendingUpload || (!isAccountAvatarType(pendingUpload.avatarType) && !isTeamAvatarType(pendingUpload.avatarType))) {
    logger.warn("Avatar upload rejected because no matching upload request was pending", {
      remoteAddress: remoteKey,
      fileName: upload.filename || "",
      pendingCount: pendingUploads.length,
    });
    return { statusCode: 409, body: "missing upload request\n" };
  }

  isTeamUpload = isTeamAvatarType(pendingUpload.avatarType);
  uploadLabel = isTeamUpload ? "team avatar" : "avatar";
  const dimensions = jpegDimensions(upload.bytes);

  if (!dimensions) {
    return { statusCode: 404, body: "invalid jpg\n" };
  }

  if (!clientSafeAvatarDimensions(dimensions)) {
    logger.warn(`${uploadLabel} upload rejected because source exceeds client pixel limit`, {
      accountId: pendingUpload.accountId,
      teamId: isTeamUpload ? Number(pendingUpload.targetId || 0) : null,
      fileName: upload.filename || pendingUpload.filename,
      width: dimensions.width,
      height: dimensions.height,
      maxWidth: CLIENT_SAFE_AVATAR_MAX_WIDTH,
      maxHeight: CLIENT_SAFE_AVATAR_MAX_HEIGHT,
    });
    pendingUploadsByRemote.delete(remoteKey);
    return {
      statusCode: 406,
      body: `${uploadLabel} must be ${CLIENT_SAFE_AVATAR_MAX_WIDTH}x${CLIENT_SAFE_AVATAR_MAX_HEIGHT} or smaller\n`,
    };
  }

  if (isTeamUpload) {
    const teamContext = await accountStore.getTeamForAccount(pendingUpload.accountId);
    const targetTeamId = Number(pendingUpload.targetId || 0);
    const role = Number(teamContext.member?.role || 0);
    const canUpdateTeamAvatar = Number(teamContext.team?.id || 0) === targetTeamId
      && (role === TEAM_ROLE.LEADER || role === TEAM_ROLE.CO_LEADER);

    if (!canUpdateTeamAvatar) {
      logger.warn("Team avatar upload rejected because the account cannot update this team", {
        accountId: pendingUpload.accountId,
        teamId: targetTeamId,
        currentTeamId: Number(teamContext.team?.id || 0),
        role,
      });
      removePendingUpload(remoteKey, pendingUpload);
      return { statusCode: 403, body: "team avatar update not allowed\n" };
    }
  }

  let avatarBytes;
  let avatarDimensions;
  try {
    avatarBytes = normalizeAvatarJpeg(upload.bytes);
    avatarDimensions = normalizedAvatarDimensions();
  } catch (error) {
    if (!clientSafeAvatarDimensions(dimensions)) {
      logger.warn(`${uploadLabel} upload rejected because it could not be normalized for the client`, {
        accountId: pendingUpload.accountId,
        teamId: isTeamUpload ? Number(pendingUpload.targetId || 0) : null,
        fileName: upload.filename || pendingUpload.filename,
        width: dimensions.width,
        height: dimensions.height,
        error: error?.message || String(error),
      });
      removePendingUpload(remoteKey, pendingUpload);
      return { statusCode: 406, body: `${uploadLabel} could not be resized\n` };
    }

    avatarBytes = upload.bytes;
    avatarDimensions = dimensions;
  }

  const avatarId = isTeamUpload ? Number(pendingUpload.targetId || 0) : Number(pendingUpload.accountId || 0);
  const avatarDirectory = isTeamUpload ? "teamAvatars" : "avatars";
  await mkdir(join(config.dataRoot, avatarDirectory), { recursive: true });
  const filePath = join(config.dataRoot, avatarDirectory, `${avatarId}.jpg`);
  await writeFile(filePath, avatarBytes);

  const avatarUpdate = {
    accountId: pendingUpload.accountId,
    bytes: avatarBytes.length,
    fileName: upload.filename || pendingUpload.filename,
    height: avatarDimensions.height,
    width: avatarDimensions.width,
  };
  const result = isTeamUpload
    ? await accountStore.updateTeamAvatar({
      ...avatarUpdate,
      teamId: avatarId,
    })
    : await accountStore.updateAvatar(avatarUpdate);

  removePendingUpload(remoteKey, pendingUpload);

  if (!result.ok) {
    return { statusCode: 409, body: "account update failed\n" };
  }

  logger.info(isTeamUpload ? "Team avatar upload saved" : "Avatar upload saved", {
    accountId: pendingUpload.accountId,
    teamId: isTeamUpload ? avatarId : null,
    filePath,
    bytes: avatarBytes.length,
    originalBytes: upload.bytes.length,
    originalWidth: dimensions.width,
    originalHeight: dimensions.height,
    width: avatarDimensions.width,
    height: avatarDimensions.height,
  });

  return { statusCode: 200, body: "1\n" };
}
