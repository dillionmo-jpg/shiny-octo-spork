import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

export const PANEL_UPLOAD_SOURCE_SIZES = Object.freeze({
  hood: Object.freeze({ width: 200, height: 200 }),
  side: Object.freeze({ width: 650, height: 187 }),
  front: Object.freeze({ width: 300, height: 160 }),
  back: Object.freeze({ width: 350, height: 150 }),
});

const TWIPS_PER_PIXEL = 20;
const PANEL_NAMES = new Set(["side", "sideOpp", "hood", "front", "back"]);
const POINT_NAME_PATTERN = /^p(\d+)_(\d+)$/i;
const IDENTITY_MATRIX = Object.freeze({
  scaleX: 1,
  scaleY: 1,
  rotateSkew0: 0,
  rotateSkew1: 0,
  translateX: 0,
  translateY: 0,
});

class BitReader {
  constructor(buffer, byteOffset = 0) {
    this.buffer = buffer;
    this.byteOffset = byteOffset;
    this.bitOffset = 0;
  }

  readUB(bitCount) {
    let value = 0;
    for (let i = 0; i < bitCount; i += 1) {
      const bit = (this.buffer[this.byteOffset] >> (7 - this.bitOffset)) & 1;
      value = (value << 1) | bit;
      this.bitOffset += 1;
      if (this.bitOffset === 8) {
        this.bitOffset = 0;
        this.byteOffset += 1;
      }
    }
    return value;
  }

  readSB(bitCount) {
    const value = this.readUB(bitCount);
    const shift = 32 - bitCount;
    return (value << shift) >> shift;
  }

  align() {
    if (this.bitOffset !== 0) {
      this.bitOffset = 0;
      this.byteOffset += 1;
    }
  }
}

function roundPixel(value) {
  return Math.round(value * 100) / 100;
}

function rectToPixels(rect) {
  const xmin = roundPixel(rect.xmin / TWIPS_PER_PIXEL);
  const xmax = roundPixel(rect.xmax / TWIPS_PER_PIXEL);
  const ymin = roundPixel(rect.ymin / TWIPS_PER_PIXEL);
  const ymax = roundPixel(rect.ymax / TWIPS_PER_PIXEL);
  return {
    xmin,
    xmax,
    ymin,
    ymax,
    width: roundPixel(xmax - xmin),
    height: roundPixel(ymax - ymin),
  };
}

function pointToPixels(point) {
  return {
    x: roundPixel(point.x / TWIPS_PER_PIXEL),
    y: roundPixel(point.y / TWIPS_PER_PIXEL),
  };
}

function readRect(buffer, offset) {
  const bits = new BitReader(buffer, offset);
  const bitCount = bits.readUB(5);
  const xmin = bits.readSB(bitCount);
  const xmax = bits.readSB(bitCount);
  const ymin = bits.readSB(bitCount);
  const ymax = bits.readSB(bitCount);
  bits.align();
  return {
    rect: {
      xmin,
      xmax,
      ymin,
      ymax,
      width: xmax - xmin,
      height: ymax - ymin,
    },
    endOffset: bits.byteOffset,
  };
}

function readFixed(bits, bitCount) {
  return bits.readSB(bitCount) / 65536;
}

function readMatrix(buffer, offset) {
  const bits = new BitReader(buffer, offset);
  let scaleX = 1;
  let scaleY = 1;
  let rotateSkew0 = 0;
  let rotateSkew1 = 0;

  if (bits.readUB(1)) {
    const bitCount = bits.readUB(5);
    scaleX = readFixed(bits, bitCount);
    scaleY = readFixed(bits, bitCount);
  }

  if (bits.readUB(1)) {
    const bitCount = bits.readUB(5);
    rotateSkew0 = readFixed(bits, bitCount);
    rotateSkew1 = readFixed(bits, bitCount);
  }

  const translateBits = bits.readUB(5);
  const translateX = translateBits ? bits.readSB(translateBits) : 0;
  const translateY = translateBits ? bits.readSB(translateBits) : 0;
  bits.align();

  return {
    matrix: {
      scaleX,
      scaleY,
      rotateSkew0,
      rotateSkew1,
      translateX,
      translateY,
    },
    endOffset: bits.byteOffset,
  };
}

function skipCxform(buffer, offset, hasAlpha) {
  const bits = new BitReader(buffer, offset);
  const hasAddTerms = bits.readUB(1);
  const hasMultTerms = bits.readUB(1);
  const bitCount = bits.readUB(4);
  const channelCount = hasAlpha ? 4 : 3;

  if (hasMultTerms) {
    for (let i = 0; i < channelCount; i += 1) bits.readSB(bitCount);
  }
  if (hasAddTerms) {
    for (let i = 0; i < channelCount; i += 1) bits.readSB(bitCount);
  }
  bits.align();
  return bits.byteOffset;
}

function readCString(buffer, offset, endOffset) {
  let cursor = offset;
  while (cursor < endOffset && buffer[cursor] !== 0) cursor += 1;
  return {
    value: buffer.subarray(offset, cursor).toString("utf8"),
    endOffset: cursor + 1,
  };
}

function readSwf(pathname) {
  const raw = readFileSync(pathname);
  const signature = raw.subarray(0, 3).toString("ascii");

  if (signature === "FWS") {
    return { buffer: raw, signature, compressed: false };
  }
  if (signature === "CWS") {
    return {
      buffer: Buffer.concat([raw.subarray(0, 8), inflateSync(raw.subarray(8))]),
      signature,
      compressed: true,
    };
  }

  throw new Error(`Unsupported SWF signature ${signature} in ${pathname}`);
}

function parseTags(buffer, startOffset, endOffset = buffer.length) {
  const tags = [];
  let offset = startOffset;

  while (offset + 2 <= endOffset) {
    const header = buffer.readUInt16LE(offset);
    offset += 2;
    const type = header >> 6;
    let length = header & 0x3f;
    if (length === 0x3f) {
      length = buffer.readUInt32LE(offset);
      offset += 4;
    }

    const bodyOffset = offset;
    const nextOffset = offset + length;
    tags.push({ type, bodyOffset, length, nextOffset });
    offset = nextOffset;
    if (type === 0) break;
  }

  return tags;
}

function parsePlaceObject2(buffer, tag) {
  let offset = tag.bodyOffset;
  const flags = buffer[offset];
  offset += 1;

  const place = {
    depth: buffer.readUInt16LE(offset),
    matrix: {
      scaleX: 1,
      scaleY: 1,
      rotateSkew0: 0,
      rotateSkew1: 0,
      translateX: 0,
      translateY: 0,
    },
  };
  offset += 2;

  if (flags & 0x02) {
    place.characterId = buffer.readUInt16LE(offset);
    offset += 2;
  }
  if (flags & 0x04) {
    const parsed = readMatrix(buffer, offset);
    place.matrix = parsed.matrix;
    offset = parsed.endOffset;
  }
  if (flags & 0x08) {
    offset = skipCxform(buffer, offset, true);
  }
  if (flags & 0x10) {
    place.ratio = buffer.readUInt16LE(offset);
    offset += 2;
  }
  if (flags & 0x20) {
    const parsed = readCString(buffer, offset, tag.nextOffset);
    place.name = parsed.value;
    offset = parsed.endOffset;
  }
  if (flags & 0x40) {
    place.clipDepth = buffer.readUInt16LE(offset);
  }

  return place;
}

function parseAssetNames(buffer, tag) {
  const names = [];
  let offset = tag.bodyOffset;
  const count = buffer.readUInt16LE(offset);
  offset += 2;

  for (let i = 0; i < count; i += 1) {
    const id = buffer.readUInt16LE(offset);
    offset += 2;
    const parsed = readCString(buffer, offset, tag.nextOffset);
    offset = parsed.endOffset;
    names.push({ id, name: parsed.value });
  }

  return names;
}

function transformPoint(matrix, x, y) {
  return {
    x: matrix.scaleX * x + matrix.rotateSkew0 * y + matrix.translateX,
    y: matrix.rotateSkew1 * x + matrix.scaleY * y + matrix.translateY,
  };
}

function transformRect(matrix, rect) {
  const points = [
    transformPoint(matrix, rect.xmin, rect.ymin),
    transformPoint(matrix, rect.xmax, rect.ymin),
    transformPoint(matrix, rect.xmin, rect.ymax),
    transformPoint(matrix, rect.xmax, rect.ymax),
  ];
  return {
    xmin: Math.min(...points.map((point) => point.x)),
    xmax: Math.max(...points.map((point) => point.x)),
    ymin: Math.min(...points.map((point) => point.y)),
    ymax: Math.max(...points.map((point) => point.y)),
  };
}

function composeMatrices(parent, child) {
  return {
    scaleX: parent.scaleX * child.scaleX + parent.rotateSkew0 * child.rotateSkew1,
    rotateSkew0: parent.scaleX * child.rotateSkew0 + parent.rotateSkew0 * child.scaleY,
    rotateSkew1: parent.rotateSkew1 * child.scaleX + parent.scaleY * child.rotateSkew1,
    scaleY: parent.rotateSkew1 * child.rotateSkew0 + parent.scaleY * child.scaleY,
    translateX: parent.scaleX * child.translateX + parent.rotateSkew0 * child.translateY + parent.translateX,
    translateY: parent.rotateSkew1 * child.translateX + parent.scaleY * child.translateY + parent.translateY,
  };
}

function unionRects(left, right) {
  if (!left) return { ...right };
  return {
    xmin: Math.min(left.xmin, right.xmin),
    xmax: Math.max(left.xmax, right.xmax),
    ymin: Math.min(left.ymin, right.ymin),
    ymax: Math.max(left.ymax, right.ymax),
  };
}

function buildPointGrid(points) {
  const rows = [];
  for (const point of points.sort((left, right) => left.row - right.row || left.column - right.column)) {
    const rowIndex = point.row - 1;
    const columnIndex = point.column - 1;
    if (!rows[rowIndex]) rows[rowIndex] = [];
    rows[rowIndex][columnIndex] = point;
  }

  return rows.map((row) => (row || []).map((point) => point || null));
}

function parsePackageIdentity(swfPath) {
  const packageName = swfPath.replaceAll("\\", "/").split("/").at(-2) || "";
  const match = packageName.match(/^(\d+)([fb])$/i);
  if (!match) {
    throw new Error(`Cannot infer car package identity from ${swfPath}`);
  }
  return {
    carId: Number(match[1]),
    view: match[2].toLowerCase() === "f" ? "front" : "rear",
  };
}

function toPosixPath(pathname) {
  return pathname.split(sep).join("/");
}

export function parseDecalLoaderDimensions(swfPath) {
  const fullPath = resolve(swfPath);
  const { buffer, signature, compressed } = readSwf(fullPath);
  const version = buffer[3];
  const declaredLength = buffer.readUInt32LE(4);
  const frameSize = readRect(buffer, 8);
  const tags = parseTags(buffer, frameSize.endOffset + 4);
  const shapes = new Map();
  const sprites = new Map();
  const exports = [];

  for (const tag of tags) {
    if ([2, 22, 32, 83].includes(tag.type)) {
      const id = buffer.readUInt16LE(tag.bodyOffset);
      shapes.set(id, readRect(buffer, tag.bodyOffset + 2).rect);
      continue;
    }

    if (tag.type === 39) {
      const id = buffer.readUInt16LE(tag.bodyOffset);
      const spriteTags = parseTags(buffer, tag.bodyOffset + 4, tag.nextOffset);
      sprites.set(
        id,
        spriteTags
          .filter((spriteTag) => spriteTag.type === 26)
          .map((spriteTag) => parsePlaceObject2(buffer, spriteTag)),
      );
      continue;
    }

    if (tag.type === 56 || tag.type === 76) {
      exports.push(...parseAssetNames(buffer, tag).filter((entry) => entry.id !== 0));
    }
  }

  const rootExport = exports.find((entry) => entry.name === "decalLoader") || exports[0];
  if (!rootExport || !sprites.has(rootExport.id)) {
    throw new Error(`Cannot find exported decalLoader sprite in ${swfPath}`);
  }

  const memoizedBounds = new Map();
  function characterBounds(id) {
    if (memoizedBounds.has(id)) return memoizedBounds.get(id);

    let bounds;
    if (shapes.has(id)) {
      bounds = shapes.get(id);
    } else if (sprites.has(id)) {
      for (const placement of sprites.get(id)) {
        if (!placement.characterId) continue;
        const childBounds = characterBounds(placement.characterId);
        if (childBounds) {
          bounds = unionRects(bounds, transformRect(placement.matrix, childBounds));
        } else if (/^p\d+_\d+$/i.test(placement.name || "")) {
          bounds = unionRects(
            bounds,
            transformRect(placement.matrix, { xmin: 0, xmax: 0, ymin: 0, ymax: 0 }),
          );
        }
      }
    }

    memoizedBounds.set(id, bounds);
    return bounds;
  }

  function collectCharacterPoints(id, parentMatrix = IDENTITY_MATRIX, stack = []) {
    if (!sprites.has(id) || stack.includes(id)) return [];

    const points = [];
    for (const placement of sprites.get(id)) {
      const matrix = composeMatrices(parentMatrix, placement.matrix);
      const match = String(placement.name || "").match(POINT_NAME_PATTERN);
      if (match) {
        points.push({
          name: placement.name,
          row: Number(match[1]),
          column: Number(match[2]),
          ...pointToPixels(transformPoint(matrix, 0, 0)),
        });
      }

      if (placement.characterId) {
        points.push(...collectCharacterPoints(placement.characterId, matrix, [...stack, id]));
      }
    }

    return points;
  }

  const panels = {};
  for (const placement of sprites.get(rootExport.id)) {
    if (!PANEL_NAMES.has(placement.name) || !placement.characterId) continue;
    const bounds = characterBounds(placement.characterId);
    if (bounds) {
      const points = collectCharacterPoints(placement.characterId);
      panels[placement.name] = {
        ...rectToPixels(bounds),
        pointCount: points.length,
        pointGrid: buildPointGrid(points),
      };
    }
  }

  return {
    ...parsePackageIdentity(fullPath),
    source: toPosixPath(relative(process.cwd(), fullPath)),
    swf: {
      signature,
      version,
      compressed,
      declaredLength,
    },
    stage: rectToPixels(frameSize.rect),
    panels,
  };
}

function findDecalLoaderFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === "decalloader.swf") {
        files.push(entryPath);
      }
    }
  }

  walk(resolve(rootDir));
  return files.sort((left, right) => {
    const a = parsePackageIdentity(left);
    const b = parsePackageIdentity(right);
    return a.carId - b.carId || a.view.localeCompare(b.view);
  });
}

export function collectCarGraphicDimensions(rootDir = "cache/car/packages") {
  const carsById = new Map();
  const files = findDecalLoaderFiles(rootDir);

  for (const file of files) {
    const dimensions = parseDecalLoaderDimensions(file);
    if (!carsById.has(dimensions.carId)) {
      carsById.set(dimensions.carId, {
        carId: dimensions.carId,
        views: {},
      });
    }
    const car = carsById.get(dimensions.carId);
    car.views[dimensions.view] = {
      source: dimensions.source,
      stage: dimensions.stage,
      panels: dimensions.panels,
    };
  }

  const cars = [...carsById.values()].sort((left, right) => left.carId - right.carId);
  const panelCounts = {};
  for (const car of cars) {
    for (const view of Object.values(car.views)) {
      for (const panelName of Object.keys(view.panels)) {
        panelCounts[panelName] = (panelCounts[panelName] || 0) + 1;
      }
    }
  }

  return {
    schemaVersion: 1,
    units: "pixels",
    twipsPerPixel: TWIPS_PER_PIXEL,
    panelUploadSourceSizes: PANEL_UPLOAD_SOURCE_SIZES,
    summary: {
      packageCount: files.length,
      carCount: cars.length,
      panelCounts,
    },
    cars,
  };
}

export function writeCarGraphicDimensions({
  rootDir = "cache/car/packages",
  outputPath = "data/car-graphic-dimensions.json",
} = {}) {
  const dimensions = collectCarGraphicDimensions(rootDir);
  const fullOutputPath = resolve(outputPath);
  mkdirSync(dirname(fullOutputPath), { recursive: true });
  writeFileSync(fullOutputPath, `${JSON.stringify(dimensions, null, 2)}\n`, "utf8");
  return { outputPath: fullOutputPath, dimensions };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const [rootDir = "cache/car/packages", outputPath = "data/car-graphic-dimensions.json"] =
    process.argv.slice(2);
  const { outputPath: writtenPath, dimensions } = writeCarGraphicDimensions({
    rootDir,
    outputPath,
  });
  console.log(
    JSON.stringify(
      {
        outputPath: toPosixPath(relative(process.cwd(), writtenPath)),
        packageCount: dimensions.summary.packageCount,
        carCount: dimensions.summary.carCount,
        panelCounts: dimensions.summary.panelCounts,
      },
      null,
      2,
    ),
  );
}
