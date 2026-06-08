import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PANEL_EXPORT_SIZES } from "./swf-writer.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_DIMENSIONS_PATH = resolve(PROJECT_ROOT, "data/car-graphic-dimensions.json");
const DEFAULT_MATCHES_PATH = resolve(PROJECT_ROOT, "data/car-graphic-matches.json");
const DEFAULT_OUTPUT_PATH = resolve(PROJECT_ROOT, "tools/custom-graphics-studio/studio-data.js");

function readJson(pathname, fallback) {
  try {
    return JSON.parse(readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function toPosixPath(pathname) {
  return pathname.split(/[\\/]+/).join("/");
}

function serializePanel(panel) {
  const {
    xmin,
    xmax,
    ymin,
    ymax,
    width,
    height,
    pointCount = 0,
    pointGrid = [],
  } = panel;

  return {
    bounds: { xmin, xmax, ymin, ymax, width, height },
    pointCount,
    pointGrid,
  };
}

function serializeViews(views = {}) {
  return Object.fromEntries(
    Object.entries(views).map(([viewName, view]) => [
      viewName,
      {
        source: view.source,
        stage: view.stage,
        panels: Object.fromEntries(
          Object.entries(view.panels || {}).map(([panelName, panel]) => [
            panelName,
            serializePanel(panel),
          ]),
        ),
      },
    ]),
  );
}

export function buildCustomGraphicsStudioData({
  dimensionsPath = DEFAULT_DIMENSIONS_PATH,
  matchesPath = DEFAULT_MATCHES_PATH,
} = {}) {
  const dimensions = readJson(dimensionsPath, { cars: [], summary: {} });
  const matches = readJson(matchesPath, { cars: [] });
  const carNames = new Map((matches.cars || []).map((car) => [String(car.carId), car.name]));
  const carCategories = new Map((matches.cars || []).map((car) => [String(car.carId), car.category]));

  return {
    schemaVersion: 1,
    panelSizes: PANEL_EXPORT_SIZES,
    summary: {
      carCount: dimensions.summary?.carCount || dimensions.cars?.length || 0,
      packageCount: dimensions.summary?.packageCount || 0,
      panelCounts: dimensions.summary?.panelCounts || {},
    },
    cars: (dimensions.cars || []).map((car) => {
      const carId = String(car.carId);
      return {
        carId,
        name: carNames.get(carId) || `Car ${carId}`,
        category: carCategories.get(carId) || "",
        views: serializeViews(car.views),
      };
    }),
  };
}

export function writeCustomGraphicsStudioData({
  dimensionsPath = DEFAULT_DIMENSIONS_PATH,
  matchesPath = DEFAULT_MATCHES_PATH,
  outputPath = DEFAULT_OUTPUT_PATH,
} = {}) {
  const data = buildCustomGraphicsStudioData({ dimensionsPath, matchesPath });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `export const STUDIO_DATA = ${JSON.stringify(data, null, 2)};\n`,
    "utf8",
  );
  return { outputPath, data };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const [outputPath = DEFAULT_OUTPUT_PATH] = process.argv.slice(2);
  const result = writeCustomGraphicsStudioData({ outputPath: resolve(outputPath) });
  console.log(
    JSON.stringify(
      {
        outputPath: toPosixPath(relative(process.cwd(), result.outputPath)),
        carCount: result.data.cars.length,
      },
      null,
      2,
    ),
  );
}
