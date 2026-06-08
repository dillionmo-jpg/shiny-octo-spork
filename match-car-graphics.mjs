import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { FULL_CAR_CATALOG, getCatalogCarCategory } from "../src/car-catalog.js";

export const FULL_GRAPHIC_COMPATIBILITY_SET_ID = "all-complete-full-graphics";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const DEFAULT_DECAL_DIR = resolve(PROJECT_ROOT, "cache/car/decals");
const DEFAULT_PACKAGE_DIR = resolve(PROJECT_ROOT, "cache/car/packages");
const DEFAULT_DIMENSIONS_PATH = resolve(PROJECT_ROOT, "data/car-graphic-dimensions.json");
const DEFAULT_OUTPUT_PATH = resolve(PROJECT_ROOT, "data/car-graphic-matches.json");
const PANEL_TYPES = ["side", "hood", "front", "back"];
const PANEL_NAMES = new Set(PANEL_TYPES);
const OPPOSITE_SIDE_PANEL_NAME = "sideOpp";

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

  align() {
    if (this.bitOffset !== 0) {
      this.bitOffset = 0;
      this.byteOffset += 1;
    }
  }
}

function toPosixPath(pathname) {
  return pathname.split(/[\\/]+/).join("/");
}

function repoPath(pathname) {
  return toPosixPath(relative(PROJECT_ROOT, pathname));
}

function sortIds(left, right) {
  return Number(left) - Number(right) || String(left).localeCompare(String(right));
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

  throw new Error(`Unsupported SWF signature ${signature} in ${repoPath(pathname)}`);
}

function readRectEndOffset(buffer, offset) {
  const bits = new BitReader(buffer, offset);
  const bitCount = bits.readUB(5);
  bits.readUB(bitCount);
  bits.readUB(bitCount);
  bits.readUB(bitCount);
  bits.readUB(bitCount);
  bits.align();
  return bits.byteOffset;
}

function readSwfHeader(pathname) {
  const { buffer, signature, compressed } = readSwf(pathname);
  const rectEndOffset = readRectEndOffset(buffer, 8);

  return {
    signature,
    version: buffer[3],
    compressed,
    declaredLength: buffer.readUInt32LE(4),
    frameRateRaw: buffer.readUInt16LE(rectEndOffset),
    frameCount: buffer.readUInt16LE(rectEndOffset + 2),
  };
}

function ensureAssetGroup(groups, parentId) {
  const id = String(parentId);
  if (!groups.has(id)) {
    groups.set(id, { parentId: id, thumbnails: new Map() });
  }
  return groups.get(id);
}

function recordThumbnail(group, variationId, pathname) {
  const frameId = Number(variationId);
  if (!Number.isFinite(frameId)) return;
  group.thumbnails.set(frameId, repoPath(pathname));
}

function collectDecalAssetFiles(decalDir) {
  const fullGroups = new Map();
  const panelGroups = new Map();

  for (const entry of readdirSync(decalDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;

    const pathname = resolve(decalDir, entry.name);
    let match = entry.name.match(/^(\d+)_full\.swf$/);
    if (match) {
      ensureAssetGroup(fullGroups, match[1]).frontSwf = pathname;
      continue;
    }

    match = entry.name.match(/^(\d+)_full_b\.swf$/);
    if (match) {
      ensureAssetGroup(fullGroups, match[1]).rearSwf = pathname;
      continue;
    }

    match = entry.name.match(/^(\d+)_full_(\d+)_th\.jpg$/);
    if (match) {
      recordThumbnail(ensureAssetGroup(fullGroups, match[1]), match[2], pathname);
      continue;
    }

    match = entry.name.match(/^(\d+)_(side|hood|front|back)\.swf$/);
    if (match) {
      const group = ensureAssetGroup(panelGroups, match[1]);
      group[match[2]] = {
        ...(group[match[2]] || {}),
        swf: pathname,
      };
      continue;
    }

    match = entry.name.match(/^(\d+)_(side|hood|front|back)_(\d+)_th\.jpg$/);
    if (match) {
      const group = ensureAssetGroup(panelGroups, match[1]);
      const panel = {
        ...(group[match[2]] || {}),
        thumbnails: group[match[2]]?.thumbnails || new Map(),
      };
      recordThumbnail(panel, match[3], pathname);
      group[match[2]] = panel;
    }
  }

  return { fullGroups, panelGroups };
}

function buildCatalogCarMap() {
  return new Map(
    FULL_CAR_CATALOG.map(([id, name, price, locationId]) => [
      String(id),
      {
        carId: String(id),
        name,
        price,
        locationId: String(locationId),
        category: getCatalogCarCategory(id),
      },
    ]),
  );
}

function loadDimensions(dimensionsPath) {
  if (!existsSync(dimensionsPath)) {
    return { summary: { carCount: 0 }, cars: [] };
  }
  return JSON.parse(readFileSync(dimensionsPath, "utf8"));
}

function buildDimensionsMap(dimensions) {
  return new Map((dimensions.cars || []).map((car) => [String(car.carId), car]));
}

function getCarPanelCompatibility(dimensions) {
  if (!dimensions?.views) return [];

  const panels = new Set();
  for (const view of Object.values(dimensions.views)) {
    for (const panelName of Object.keys(view.panels || {})) {
      if (PANEL_NAMES.has(panelName)) {
        panels.add(panelName);
      } else if (panelName === OPPOSITE_SIDE_PANEL_NAME) {
        panels.add("side");
      }
    }
  }

  return PANEL_TYPES.filter((panelName) => panels.has(panelName));
}

function serializeDirectCatalogCar(catalogCarMap, parentId) {
  return catalogCarMap.get(String(parentId)) || null;
}

function serializeFullGraphics(fullGroups, catalogCarMap) {
  return [...fullGroups.values()]
    .filter((group) => group.frontSwf && group.rearSwf && group.thumbnails.size > 0)
    .sort((left, right) => sortIds(left.parentId, right.parentId))
    .map((group) => {
      const variations = [...group.thumbnails.keys()].sort((left, right) => left - right);
      const frontHeader = readSwfHeader(group.frontSwf);
      const rearHeader = readSwfHeader(group.rearSwf);

      return {
        parentId: group.parentId,
        assetType: "full",
        source: {
          front: repoPath(group.frontSwf),
          rear: repoPath(group.rearSwf),
        },
        thumbnailPattern: `cache/car/decals/${group.parentId}_full_{variation}_th.jpg`,
        thumbnails: variations.map((variation) => ({
          variation,
          source: group.thumbnails.get(variation),
        })),
        variations,
        hasVariationOne: variations.includes(1),
        shopEligible: variations.includes(1),
        frameCountFront: frontHeader.frameCount,
        frameCountRear: rearHeader.frameCount,
        swf: {
          front: frontHeader,
          rear: rearHeader,
        },
        directCatalogCar: serializeDirectCatalogCar(catalogCarMap, group.parentId),
      };
    });
}

function serializePanelGraphics(panelGroups, catalogCarMap) {
  const panelGraphics = [];

  for (const group of [...panelGroups.values()].sort((left, right) => sortIds(left.parentId, right.parentId))) {
    for (const panelName of PANEL_TYPES) {
      const panel = group[panelName];
      if (!panel?.swf || !panel.thumbnails?.size) continue;

      const variations = [...panel.thumbnails.keys()].sort((left, right) => left - right);
      const header = readSwfHeader(panel.swf);
      panelGraphics.push({
        parentId: group.parentId,
        assetType: panelName,
        source: repoPath(panel.swf),
        thumbnailPattern: `cache/car/decals/${group.parentId}_${panelName}_{variation}_th.jpg`,
        thumbnails: variations.map((variation) => ({
          variation,
          source: panel.thumbnails.get(variation),
        })),
        variations,
        hasVariationOne: variations.includes(1),
        frameCount: header.frameCount,
        swf: header,
        directCatalogCar: serializeDirectCatalogCar(catalogCarMap, group.parentId),
      });
    }
  }

  return panelGraphics;
}

function buildCompatibilitySets(fullGraphics, panelGraphics) {
  const panelSets = Object.fromEntries(
    PANEL_TYPES.map((panelName) => [
      panelName,
      {
        id: `all-${panelName}-graphics`,
        parentIds: panelGraphics
          .filter((asset) => asset.assetType === panelName)
          .map((asset) => asset.parentId),
      },
    ]),
  );

  return {
    fullGraphics: {
      id: FULL_GRAPHIC_COMPATIBILITY_SET_ID,
      rule: "Original client loads full graphics by parentdi from cache/car/decals/{parentdi}_full.swf and _full_b.swf, then uses di as the frame.",
      parentIds: fullGraphics.map((asset) => asset.parentId),
      shopParentIds: fullGraphics.map((asset) => asset.parentId),
      variationOneParentIds: fullGraphics
        .filter((asset) => asset.hasVariationOne)
        .map((asset) => asset.parentId),
    },
    panelGraphics: panelSets,
  };
}

function directPanelParentIds(panelGraphics, carId) {
  const parentIds = new Set(
    panelGraphics
      .filter((asset) => asset.parentId === carId)
      .map((asset) => asset.parentId),
  );
  return [...parentIds].sort(sortIds);
}

function serializeCars(catalogCarMap, dimensionsMap, fullGraphics, panelGraphics) {
  const completeFullParentIds = new Set(fullGraphics.map((asset) => asset.parentId));

  return [...catalogCarMap.values()]
    .sort((left, right) => sortIds(left.carId, right.carId))
    .map((car) => {
      const dimensions = dimensionsMap.get(car.carId) || null;
      const panelCompatibility = getCarPanelCompatibility(dimensions);

      return {
        carId: car.carId,
        name: car.name,
        category: car.category,
        locationId: car.locationId,
        packages: {
          front: {
            source: `cache/car/packages/${car.carId}f`,
            hasDecalLoader: existsSync(resolve(DEFAULT_PACKAGE_DIR, `${car.carId}f/decalLoader.swf`)),
          },
          rear: {
            source: `cache/car/packages/${car.carId}b`,
            hasDecalLoader: existsSync(resolve(DEFAULT_PACKAGE_DIR, `${car.carId}b/decalLoader.swf`)),
          },
        },
        dimensions,
        compatibleAssetSets: {
          fullGraphics: FULL_GRAPHIC_COMPATIBILITY_SET_ID,
          panelGraphics: panelCompatibility,
        },
        directGraphicAssetMatches: {
          fullGraphicParentIds: completeFullParentIds.has(car.carId) ? [car.carId] : [],
          panelGraphicParentIds: directPanelParentIds(panelGraphics, car.carId),
        },
      };
    });
}

function countPanelGraphics(panelGraphics) {
  return Object.fromEntries(
    PANEL_TYPES.map((panelName) => [
      panelName,
      panelGraphics.filter((asset) => asset.assetType === panelName).length,
    ]),
  );
}

function listAssetsWithoutDirectCar(assets) {
  return assets
    .filter((asset) => !asset.directCatalogCar)
    .map((asset) => asset.parentId)
    .filter((parentId, index, ids) => ids.indexOf(parentId) === index)
    .sort(sortIds);
}

export function collectCarGraphicMatches({
  decalDir = DEFAULT_DECAL_DIR,
  dimensionsPath = DEFAULT_DIMENSIONS_PATH,
} = {}) {
  const catalogCarMap = buildCatalogCarMap();
  const dimensions = loadDimensions(dimensionsPath);
  const dimensionsMap = buildDimensionsMap(dimensions);
  const dimensionOnlyCarIds = [...dimensionsMap.keys()]
    .filter((carId) => !catalogCarMap.has(carId))
    .sort(sortIds);
  const { fullGroups, panelGroups } = collectDecalAssetFiles(decalDir);
  const fullGraphics = serializeFullGraphics(fullGroups, catalogCarMap);
  const panelGraphics = serializePanelGraphics(panelGroups, catalogCarMap);
  const fullGraphicVariationCount = fullGraphics.reduce(
    (count, asset) => count + asset.variations.length,
    0,
  );
  const cars = serializeCars(catalogCarMap, dimensionsMap, fullGraphics, panelGraphics);
  const carsWithDecalLoader = cars.filter((car) => Boolean(car.dimensions)).length;
  const directFullCatalogMatches = fullGraphics.filter((asset) => asset.directCatalogCar).length;
  const directPanelCatalogMatches = new Set(
    panelGraphics
      .filter((asset) => asset.directCatalogCar)
      .map((asset) => asset.parentId),
  ).size;

  return {
    schemaVersion: 1,
    sourceRules: {
      fullGraphics: "Use every complete {parentId}_full.swf + {parentId}_full_b.swf group that has at least one thumbnail. The client picks the frame with di.",
      shopFullGraphics: "Current shop catalog exposes one Full Graphics part for each thumbnail/frame variation at every shop location.",
      panelGraphics: "Use complete {parentId}_{side|hood|front|back}.swf panel assets with thumbnails; car-specific decalLoader dimensions define where each panel can render.",
    },
    summary: {
      catalogCarCount: catalogCarMap.size,
      dimensionCarCount: dimensions.summary?.carCount || dimensionsMap.size,
      completeFullGraphicGroupCount: fullGraphics.length,
      fullGraphicVariationCount,
      shopFullGraphicPartRowsAllLocations: fullGraphicVariationCount * 5,
      variationOneFullGraphicGroupCount: fullGraphics.filter((asset) => asset.hasVariationOne).length,
      panelGraphicGroupCount: panelGroups.size,
      completePanelGraphicCounts: countPanelGraphics(panelGraphics),
      carsWithDecalLoader,
      carsWithoutDecalLoader: cars.length - carsWithDecalLoader,
      directFullCatalogMatches,
      directPanelCatalogMatches,
      fullGraphicGroupsWithoutDirectCatalogCar: listAssetsWithoutDirectCar(fullGraphics).length,
      panelGraphicGroupsWithoutDirectCatalogCar: listAssetsWithoutDirectCar(panelGraphics).length,
      dimensionCarIdsWithoutPlayableCatalogEntry: dimensionOnlyCarIds.length,
    },
    compatibilitySets: buildCompatibilitySets(fullGraphics, panelGraphics),
    assets: {
      fullGraphics,
      panelGraphics,
    },
    cars,
    unmatched: {
      fullGraphicParentIdsWithoutDirectCatalogCar: listAssetsWithoutDirectCar(fullGraphics),
      panelGraphicParentIdsWithoutDirectCatalogCar: listAssetsWithoutDirectCar(panelGraphics),
      dimensionCarIdsWithoutPlayableCatalogEntry: dimensionOnlyCarIds,
      catalogCarIdsWithoutDecalLoader: cars
        .filter((car) => !car.dimensions)
        .map((car) => car.carId),
    },
  };
}

export function writeCarGraphicMatches({
  decalDir = DEFAULT_DECAL_DIR,
  dimensionsPath = DEFAULT_DIMENSIONS_PATH,
  outputPath = DEFAULT_OUTPUT_PATH,
} = {}) {
  const matches = collectCarGraphicMatches({ decalDir, dimensionsPath });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(matches, null, 2)}\n`, "utf8");
  return { outputPath, matches };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const [outputPath = DEFAULT_OUTPUT_PATH] = process.argv.slice(2);
  const { outputPath: writtenPath, matches } = writeCarGraphicMatches({
    outputPath: resolve(outputPath),
  });
  console.log(
    JSON.stringify(
      {
        outputPath: repoPath(writtenPath),
        catalogCarCount: matches.summary.catalogCarCount,
        completeFullGraphicGroupCount: matches.summary.completeFullGraphicGroupCount,
        fullGraphicVariationCount: matches.summary.fullGraphicVariationCount,
        shopFullGraphicPartRowsAllLocations: matches.summary.shopFullGraphicPartRowsAllLocations,
        completePanelGraphicCounts: matches.summary.completePanelGraphicCounts,
        carsWithDecalLoader: matches.summary.carsWithDecalLoader,
        carsWithoutDecalLoader: matches.summary.carsWithoutDecalLoader,
      },
      null,
      2,
    ),
  );
}
