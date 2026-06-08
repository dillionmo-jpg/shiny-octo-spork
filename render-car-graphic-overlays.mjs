import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DIMENSIONS_PATH = resolve(PROJECT_ROOT, "data/car-graphic-dimensions.json");
const DEFAULT_OUTPUT_DIR = resolve(PROJECT_ROOT, "data/car-graphic-overlays");

const PANEL_STYLES = Object.freeze({
  side: Object.freeze({ stroke: "#ff3b30", fill: "rgba(255,59,48,0.12)" }),
  sideOpp: Object.freeze({ stroke: "#ff9500", fill: "rgba(255,149,0,0.12)" }),
  hood: Object.freeze({ stroke: "#34c759", fill: "rgba(52,199,89,0.12)" }),
  front: Object.freeze({ stroke: "#007aff", fill: "rgba(0,122,255,0.12)" }),
  back: Object.freeze({ stroke: "#af52de", fill: "rgba(175,82,222,0.12)" }),
});

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toPosixPath(pathname) {
  return pathname.split(/[\\/]+/).join("/");
}

function flattenPointGrid(pointGrid = []) {
  return pointGrid.flatMap((row) => (row || []).filter(Boolean));
}

function formatNumber(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}

function renderPolyline(points, attrs = "") {
  if (points.length < 2) return "";
  const value = points.map((point) => `${formatNumber(point.x)},${formatNumber(point.y)}`).join(" ");
  return `<polyline ${attrs} points="${escapeXml(value)}"/>`;
}

function renderPanelGrid(panelName, panel) {
  const style = PANEL_STYLES[panelName] || { stroke: "#111111", fill: "rgba(17,17,17,0.1)" };
  const grid = panel.pointGrid || [];
  const rowLines = grid
    .map((row) => renderPolyline((row || []).filter(Boolean), `data-panel="${panelName}" data-grid="row"`))
    .filter(Boolean);
  const maxColumns = Math.max(0, ...grid.map((row) => row?.length || 0));
  const columnLines = [];

  for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
    const points = grid
      .map((row) => row?.[columnIndex])
      .filter(Boolean);
    const line = renderPolyline(points, `data-panel="${panelName}" data-grid="column"`);
    if (line) columnLines.push(line);
  }

  const pointMarkers = flattenPointGrid(grid).map((point) => (
    `<g data-panel="${panelName}" data-point="${escapeXml(point.name)}">`
    + `<circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="3.5"/>`
    + `<text x="${formatNumber(point.x + 5)}" y="${formatNumber(point.y - 5)}">${escapeXml(point.name)}</text>`
    + "</g>"
  ));

  return [
    `<g class="panel panel-${panelName}" data-panel="${panelName}" style="--panel-stroke:${style.stroke};--panel-fill:${style.fill}">`,
    `<rect x="${formatNumber(panel.xmin)}" y="${formatNumber(panel.ymin)}" width="${formatNumber(panel.width)}" height="${formatNumber(panel.height)}" rx="2"/>`,
    ...rowLines,
    ...columnLines,
    ...pointMarkers,
    "</g>",
  ].join("");
}

export function renderCarGraphicOverlaySvg(dimensions) {
  const stage = dimensions.stage;
  const width = Math.max(1, Math.ceil(stage.width));
  const height = Math.max(1, Math.ceil(stage.height));
  const panelEntries = Object.entries(dimensions.panels || {});
  const panels = panelEntries
    .map(([panelName, panel]) => renderPanelGrid(panelName, panel))
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" data-car-id="${escapeXml(dimensions.carId)}" data-view="${escapeXml(dimensions.view)}" viewBox="${formatNumber(stage.xmin)} ${formatNumber(stage.ymin)} ${formatNumber(stage.width)} ${formatNumber(stage.height)}" width="${width}" height="${height}">`,
    "<style>",
    "svg{background:#1f2328;font-family:Arial,sans-serif}",
    ".stage{fill:#2d333b;stroke:#8b949e;stroke-width:1}",
    ".panel rect{fill:var(--panel-fill);stroke:var(--panel-stroke);stroke-width:2}",
    ".panel polyline{fill:none;stroke:var(--panel-stroke);stroke-width:1.25;stroke-dasharray:5 4}",
    ".panel circle{fill:#ffffff;stroke:var(--panel-stroke);stroke-width:1.5}",
    ".panel text{fill:#ffffff;stroke:#000000;stroke-width:2;paint-order:stroke;font-size:10px}",
    ".label{fill:#ffffff;stroke:#000000;stroke-width:2;paint-order:stroke;font-size:14px;font-weight:700}",
    "</style>",
    `<rect class="stage" x="${formatNumber(stage.xmin)}" y="${formatNumber(stage.ymin)}" width="${formatNumber(stage.width)}" height="${formatNumber(stage.height)}"/>`,
    `<text class="label" x="${formatNumber(stage.xmin + 8)}" y="${formatNumber(stage.ymin + 18)}">car ${escapeXml(dimensions.carId)} ${escapeXml(dimensions.view)}</text>`,
    panels,
    "</svg>",
  ].join("");
}

function buildOverlayIndex(records) {
  const items = records
    .map((record) => `<li><a href="${escapeXml(record.file)}">car ${escapeXml(record.carId)} ${escapeXml(record.view)}</a></li>`)
    .join("");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Car Graphic Overlays</title>",
    "<style>",
    "body{margin:24px;font-family:Arial,sans-serif;background:#111;color:#eee}",
    "a{color:#8ecbff}",
    "li{margin:4px 0}",
    "</style>",
    "</head>",
    "<body>",
    "<h1>Car Graphic Overlays</h1>",
    "<ol>",
    items,
    "</ol>",
    "</body>",
    "</html>",
  ].join("");
}

export function writeCarGraphicOverlays({
  dimensionsPath = DEFAULT_DIMENSIONS_PATH,
  outputDir = DEFAULT_OUTPUT_DIR,
} = {}) {
  const dimensions = JSON.parse(readFileSync(dimensionsPath, "utf8"));
  const records = [];

  mkdirSync(outputDir, { recursive: true });
  for (const car of dimensions.cars || []) {
    for (const [view, viewDimensions] of Object.entries(car.views || {})) {
      const fileName = `${car.carId}-${view}.svg`;
      const outputPath = join(outputDir, fileName);
      const svg = renderCarGraphicOverlaySvg({
        ...viewDimensions,
        carId: car.carId,
        view,
      });
      writeFileSync(outputPath, `${svg}\n`, "utf8");
      records.push({
        carId: car.carId,
        view,
        file: fileName,
        source: viewDimensions.source,
      });
    }
  }

  writeFileSync(join(outputDir, "index.html"), `${buildOverlayIndex(records)}\n`, "utf8");
  writeFileSync(join(outputDir, "index.json"), `${JSON.stringify({ schemaVersion: 1, overlays: records }, null, 2)}\n`, "utf8");
  return { outputDir, records };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const [outputDir = DEFAULT_OUTPUT_DIR, dimensionsPath = DEFAULT_DIMENSIONS_PATH] = process.argv.slice(2);
  const result = writeCarGraphicOverlays({
    outputDir: resolve(outputDir),
    dimensionsPath: resolve(dimensionsPath),
  });
  console.log(
    JSON.stringify(
      {
        outputDir: toPosixPath(relative(process.cwd(), result.outputDir)),
        overlayCount: result.records.length,
      },
      null,
      2,
    ),
  );
}
