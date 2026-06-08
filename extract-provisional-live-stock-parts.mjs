import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const DEFAULT_INPUT_PATH = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "Temp",
  "nitto-live-cars.json",
);
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, "docs", "oem-part-evidence");
const CARS_CATALOG_PATH = path.join(ROOT_DIR, "src", "catalog-data", "cars-catalog.json");

function readArgValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parsePartsXml(xml) {
  const parts = [];
  const text = String(xml || "");
  for (const match of text.matchAll(/<p\b([^>]*)\/>/g)) {
    const attrs = {};
    for (const attrMatch of match[1].matchAll(/(\w+)=['"]([^'"]*)['"]/g)) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    parts.push({
      attrs,
      rawXml: match[0],
    });
  }
  return parts;
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slotKey(attrs = {}) {
  return `${attrs.pt || attrs.t || "?"}:${attrs.pi || attrs.ci || "?"}`;
}

function isStockLikePart(attrs = {}) {
  const inventoryId = String(attrs.ai || "");
  const name = String(attrs.n || "");
  const brandName = String(attrs.bn || "");
  const modelName = String(attrs.mn || "");
  return (
    /^default/i.test(inventoryId)
    || /^Stock\b/i.test(name)
    || /^OEM$/i.test(brandName)
    || /^OEM\b/i.test(name)
    || /^OEM$/i.test(modelName)
  );
}

function normalizePart(part = {}) {
  const attrs = part.attrs || {};
  return {
    slotId: String(attrs.pi || attrs.ci || ""),
    categoryId: String(attrs.ci || ""),
    partType: String(attrs.pt || attrs.t || ""),
    inventoryId: String(attrs.ai || ""),
    partId: String(attrs.i || ""),
    name: String(attrs.n || ""),
    brandName: String(attrs.bn || ""),
    modelName: String(attrs.mn || ""),
    rawXml: part.rawXml,
  };
}

function analyzeCarRow(car = {}) {
  const parts = parsePartsXml(car.parts_xml);
  const slotMap = new Map();
  let hasDuplicateSlots = false;
  let hasConflictingDuplicateSlots = false;

  for (const part of parts) {
    const key = slotKey(part.attrs);
    if (!slotMap.has(key)) {
      slotMap.set(key, [part]);
      continue;
    }
    hasDuplicateSlots = true;
    const existing = slotMap.get(key);
    const first = existing[0];
    const firstSignature = `${first.attrs.i || ""}|${first.attrs.ai || ""}|${first.attrs.n || ""}|${first.attrs.bn || ""}`;
    const partSignature = `${part.attrs.i || ""}|${part.attrs.ai || ""}|${part.attrs.n || ""}|${part.attrs.bn || ""}`;
    if (firstSignature !== partSignature) {
      hasConflictingDuplicateSlots = true;
    }
    existing.push(part);
  }

  const defaultEntryCount = parts.filter((part) => /^default/i.test(String(part.attrs.ai || ""))).length;
  const oemEntryCount = parts.filter((part) => /^OEM$/i.test(String(part.attrs.bn || "")) || /^OEM\b/i.test(String(part.attrs.n || ""))).length;
  const stockNameEntryCount = parts.filter((part) => /^Stock\b/i.test(String(part.attrs.n || ""))).length;
  const nonStockLikeParts = parts.filter((part) => !isStockLikePart(part.attrs));
  const hasNonStockLikeParts = nonStockLikeParts.length > 0;

  const reasons = [];
  if (parts.length === 0) {
    reasons.push("empty_parts_xml");
  }
  if (hasDuplicateSlots) {
    reasons.push("duplicate_slots");
  }
  if (hasConflictingDuplicateSlots) {
    reasons.push("conflicting_duplicate_slots");
  }
  if (hasNonStockLikeParts) {
    reasons.push("non_stock_like_parts");
  }

  const accepted = parts.length > 0 && !hasDuplicateSlots && !hasNonStockLikeParts;
  const normalizedParts = parts.map(normalizePart);

  return {
    accepted,
    reasons,
    stats: {
      entryCount: parts.length,
      uniqueSlotCount: slotMap.size,
      duplicateSlotCount: Math.max(parts.length - slotMap.size, 0),
      defaultEntryCount,
      oemEntryCount,
      stockNameEntryCount,
      nonStockLikeCount: nonStockLikeParts.length,
    },
    normalizedParts,
    rawPartsXml: String(car.parts_xml || ""),
  };
}

function candidateSortScore(candidate) {
  return [
    Number(candidate.analysis.stats.entryCount || 0),
    Number(candidate.analysis.stats.defaultEntryCount || 0),
    Number(candidate.analysis.stats.oemEntryCount || 0),
    Number(candidate.analysis.stats.stockNameEntryCount || 0),
    -Number(candidate.gameCarId || 0),
  ];
}

function compareCandidateScores(left, right) {
  const leftScore = candidateSortScore(left);
  const rightScore = candidateSortScore(right);
  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] !== rightScore[index]) {
      return rightScore[index] - leftScore[index];
    }
  }
  return Number(left.gameCarId || 0) - Number(right.gameCarId || 0);
}

function buildCandidate(car, carCatalogById) {
  const analysis = analyzeCarRow(car);
  return {
    catalogCarId: numberValue(car.catalog_car_id),
    carName: carCatalogById.get(numberValue(car.catalog_car_id)) || null,
    gameCarId: numberValue(car.game_car_id),
    playerId: numberValue(car.player_id),
    selected: Boolean(car.selected),
    plateName: String(car.plate_name || ""),
    analysis,
  };
}

function summarizeCandidate(candidate) {
  return {
    gameCarId: candidate.gameCarId,
    playerId: candidate.playerId,
    selected: candidate.selected,
    plateName: candidate.plateName,
    stats: candidate.analysis.stats,
  };
}

function main() {
  const inputPath = path.resolve(readArgValue("--input", DEFAULT_INPUT_PATH));
  const outputDir = path.resolve(readArgValue("--output-dir", DEFAULT_OUTPUT_DIR));
  const fitmentsPath = path.join(outputDir, "provisional-live-stock-part-fitments.json");
  const reportPath = path.join(outputDir, "provisional-live-stock-part-fitments-report.json");

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input snapshot not found: ${inputPath}`);
  }

  const liveCars = readJson(inputPath);
  const carsCatalog = readJson(CARS_CATALOG_PATH);
  const carCatalogById = new Map(carsCatalog.map((car) => [numberValue(car.id), String(car.name || "")]));
  const sourceRows = Array.isArray(liveCars.cars) ? liveCars.cars : [];
  const candidates = sourceRows.map((car) => buildCandidate(car, carCatalogById));

  const acceptedCandidates = candidates.filter((candidate) => candidate.analysis.accepted);
  const rejectedCandidates = candidates.filter((candidate) => !candidate.analysis.accepted && candidate.analysis.stats.entryCount > 0);
  const rowsWithParts = candidates.filter((candidate) => candidate.analysis.stats.entryCount > 0);

  const acceptedByCatalog = new Map();
  for (const candidate of acceptedCandidates) {
    const key = candidate.catalogCarId;
    if (!acceptedByCatalog.has(key)) {
      acceptedByCatalog.set(key, []);
    }
    acceptedByCatalog.get(key).push(candidate);
  }

  const fitments = [...acceptedByCatalog.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([catalogCarId, bucket]) => {
      const ordered = [...bucket].sort(compareCandidateScores);
      const chosen = ordered[0];
      return {
        catalogCarId,
        carName: chosen.carName,
        provenance: {
          source: "provisional-live-backend-snapshot",
          snapshotPath: inputPath,
          trustedFor: "backend-default comparison only",
          notTrustedFor: "OG stock or original client/server truth",
        },
        candidateCount: ordered.length,
        chosenCandidate: summarizeCandidate(chosen),
        alternateCandidates: ordered.slice(1).map(summarizeCandidate),
        parts: chosen.analysis.normalizedParts,
        rawPartsXml: chosen.analysis.rawPartsXml,
      };
    });

  const rejectedReasonCounts = {};
  for (const candidate of rejectedCandidates) {
    const key = candidate.analysis.reasons.join("+") || "unknown";
    rejectedReasonCounts[key] = (rejectedReasonCounts[key] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    provenanceBoundary: {
      source: inputPath,
      summary: "This report is derived from a local live-backend snapshot, not from OG client payload dumps or FFDec export.",
      allowedUse: "secondary comparison and provisional backend-default mapping",
      blockedUse: "claiming original stock/OEM truth without corroborating client-path evidence",
    },
    rules: {
      acceptedRowRequirements: [
        "parts_xml is not empty",
        "no duplicate installed slot ids",
        "every installed part is stock-like by marker",
      ],
      stockLikeMarkers: [
        "inventory id starts with default",
        "part name starts with Stock",
        "brand name is OEM",
        "part name starts with OEM",
      ],
    },
    summary: {
      totalCatalogCars: carsCatalog.length,
      totalSnapshotRows: sourceRows.length,
      rowsWithParts: rowsWithParts.length,
      acceptedRows: acceptedCandidates.length,
      acceptedCatalogCars: fitments.length,
      coveragePercent: carsCatalog.length > 0
        ? Number(((fitments.length / carsCatalog.length) * 100).toFixed(2))
        : 0,
      rejectedReasonCounts,
    },
    fitmentCoverage: fitments.map((entry) => ({
      catalogCarId: entry.catalogCarId,
      carName: entry.carName,
      candidateCount: entry.candidateCount,
      chosenCandidate: entry.chosenCandidate,
    })),
    rejectedExamples: {
      duplicateOrConflicting: rejectedCandidates
        .filter((candidate) => candidate.analysis.reasons.includes("duplicate_slots"))
        .slice(0, 20)
        .map((candidate) => ({
          catalogCarId: candidate.catalogCarId,
          carName: candidate.carName,
          gameCarId: candidate.gameCarId,
          playerId: candidate.playerId,
          reasons: candidate.analysis.reasons,
          stats: candidate.analysis.stats,
        })),
      nonStockLike: rejectedCandidates
        .filter((candidate) => candidate.analysis.reasons.includes("non_stock_like_parts"))
        .slice(0, 20)
        .map((candidate) => ({
          catalogCarId: candidate.catalogCarId,
          carName: candidate.carName,
          gameCarId: candidate.gameCarId,
          playerId: candidate.playerId,
          reasons: candidate.analysis.reasons,
          stats: candidate.analysis.stats,
        })),
    },
  };

  ensureDir(outputDir);
  fs.writeFileSync(fitmentsPath, `${JSON.stringify({
    generatedAt: report.generatedAt,
    provenanceBoundary: report.provenanceBoundary,
    fitments,
  }, null, 2)}\n`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    inputPath,
    fitmentsPath,
    reportPath,
    acceptedCatalogCars: fitments.length,
    acceptedRows: acceptedCandidates.length,
    rowsWithParts: rowsWithParts.length,
    totalCatalogCars: carsCatalog.length,
    coveragePercent: report.summary.coveragePercent,
  }, null, 2));
}

main();
