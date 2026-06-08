import { STUDIO_DATA } from "./studio-data.js";
import {
  createCustomGraphicSwf,
  PANEL_EXPORT_SIZES,
  validateCustomGraphicSwf,
} from "./swf-writer.js";
import {
  PANEL_LABELS,
  PANEL_ORDER,
  TEMPLATE_LIBRARY,
  assetCachePath,
  assetFileName,
  basePanelName,
  buildExportManifest,
  createLayer,
  createProject,
  deserializeProject,
  getPanelDocument,
  instantiateTemplate,
  panelCategory,
  serializeProject,
  summarizeCompatibility,
} from "./studio-project.js";

const state = {
  project: createProject({ carId: STUDIO_DATA.cars[0]?.carId || "", decalId: 1 }),
  view: "front",
  panel: "hood",
  activeLayerId: null,
  imageCache: new Map(),
  backdropDataUrl: null,
  backdropImage: null,
  cacheDirectoryHandle: null,
  compareCarIds: [],
  showGrid: true,
  showBackdrop: true,
  zoom: 1,
};

const elements = {
  projectNameInput: document.querySelector("#projectNameInput"),
  saveProjectButton: document.querySelector("#saveProjectButton"),
  loadProjectButton: document.querySelector("#loadProjectButton"),
  projectInput: document.querySelector("#projectInput"),
  carSelect: document.querySelector("#carSelect"),
  viewButtons: document.querySelector("#viewButtons"),
  panelButtons: document.querySelector("#panelButtons"),
  decalIdInput: document.querySelector("#decalIdInput"),
  addImageLayerButton: document.querySelector("#addImageLayerButton"),
  addTextLayerButton: document.querySelector("#addTextLayerButton"),
  addShapeLayerButton: document.querySelector("#addShapeLayerButton"),
  layerImageInput: document.querySelector("#layerImageInput"),
  layerList: document.querySelector("#layerList"),
  templateSelect: document.querySelector("#templateSelect"),
  addTemplateButton: document.querySelector("#addTemplateButton"),
  layerNameInput: document.querySelector("#layerNameInput"),
  layerTextField: document.querySelector("#layerTextField"),
  layerTextInput: document.querySelector("#layerTextInput"),
  offsetXRangeInput: document.querySelector("#offsetXRangeInput"),
  offsetXInput: document.querySelector("#offsetXInput"),
  offsetYRangeInput: document.querySelector("#offsetYRangeInput"),
  offsetYInput: document.querySelector("#offsetYInput"),
  scaleRangeInput: document.querySelector("#scaleRangeInput"),
  scaleInput: document.querySelector("#scaleInput"),
  rotateRangeInput: document.querySelector("#rotateRangeInput"),
  rotateInput: document.querySelector("#rotateInput"),
  layerWidthRangeInput: document.querySelector("#layerWidthRangeInput"),
  layerWidthInput: document.querySelector("#layerWidthInput"),
  layerHeightRangeInput: document.querySelector("#layerHeightRangeInput"),
  layerHeightInput: document.querySelector("#layerHeightInput"),
  opacityRangeInput: document.querySelector("#opacityRangeInput"),
  opacityInput: document.querySelector("#opacityInput"),
  blendModeInput: document.querySelector("#blendModeInput"),
  fillInput: document.querySelector("#fillInput"),
  secondaryFillInput: document.querySelector("#secondaryFillInput"),
  fitButton: document.querySelector("#fitButton"),
  centerButton: document.querySelector("#centerButton"),
  resetScaleButton: document.querySelector("#resetScaleButton"),
  resetRotationButton: document.querySelector("#resetRotationButton"),
  fullOpacityButton: document.querySelector("#fullOpacityButton"),
  duplicateLayerButton: document.querySelector("#duplicateLayerButton"),
  moveLayerUpButton: document.querySelector("#moveLayerUpButton"),
  moveLayerDownButton: document.querySelector("#moveLayerDownButton"),
  deleteLayerButton: document.querySelector("#deleteLayerButton"),
  pickCacheFolderButton: document.querySelector("#pickCacheFolderButton"),
  saveCacheButton: document.querySelector("#saveCacheButton"),
  exportPngButton: document.querySelector("#exportPngButton"),
  exportSwfButton: document.querySelector("#exportSwfButton"),
  exportAllButton: document.querySelector("#exportAllButton"),
  gridToggle: document.querySelector("#gridToggle"),
  backdropToggle: document.querySelector("#backdropToggle"),
  zoomInput: document.querySelector("#zoomInput"),
  backdropButton: document.querySelector("#backdropButton"),
  backdropInput: document.querySelector("#backdropInput"),
  sourceCanvas: document.querySelector("#sourceCanvas"),
  previewCanvas: document.querySelector("#previewCanvas"),
  selectedCarLabel: document.querySelector("#selectedCarLabel"),
  selectedPanelLabel: document.querySelector("#selectedPanelLabel"),
  statusText: document.querySelector("#statusText"),
  sourceSizeLabel: document.querySelector("#sourceSizeLabel"),
  gridStatsLabel: document.querySelector("#gridStatsLabel"),
  assetPath: document.querySelector("#assetPath"),
  compatSummary: document.querySelector("#compatSummary"),
  compareCarSelect: document.querySelector("#compareCarSelect"),
  addCompareCarButton: document.querySelector("#addCompareCarButton"),
  compareGrid: document.querySelector("#compareGrid"),
};

const layerControlInputs = [
  elements.layerNameInput,
  elements.layerTextInput,
  elements.offsetXRangeInput,
  elements.offsetXInput,
  elements.offsetYRangeInput,
  elements.offsetYInput,
  elements.scaleRangeInput,
  elements.scaleInput,
  elements.rotateRangeInput,
  elements.rotateInput,
  elements.layerWidthRangeInput,
  elements.layerWidthInput,
  elements.layerHeightRangeInput,
  elements.layerHeightInput,
  elements.opacityRangeInput,
  elements.opacityInput,
  elements.blendModeInput,
  elements.fillInput,
  elements.secondaryFillInput,
  elements.fitButton,
  elements.centerButton,
  elements.resetScaleButton,
  elements.resetRotationButton,
  elements.fullOpacityButton,
  elements.duplicateLayerButton,
  elements.moveLayerUpButton,
  elements.moveLayerDownButton,
  elements.deleteLayerButton,
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function currentCar() {
  return STUDIO_DATA.cars.find((car) => car.carId === state.project.carId) || STUDIO_DATA.cars[0];
}

function carById(carId) {
  return STUDIO_DATA.cars.find((car) => car.carId === carId);
}

function currentView() {
  const car = currentCar();
  return car?.views?.[state.view] || Object.values(car?.views || {})[0];
}

function currentPanelName() {
  const view = currentView();
  if (view?.panels?.[state.panel]) return state.panel;
  if (view?.panels?.[basePanelName(state.panel)]) return basePanelName(state.panel);
  return Object.keys(view?.panels || {})[0] || "hood";
}

function currentPanelSize(panelName = currentPanelName()) {
  return PANEL_EXPORT_SIZES[basePanelName(panelName)] || PANEL_EXPORT_SIZES.hood;
}

function numberOrFallback(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function setControlBounds(input, { min, max, step }) {
  if (!input) return;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
}

function setControlValue(input, value) {
  if (input) input.value = String(value);
}

function syncNumberControl(numberInput, rangeInput, value, bounds) {
  const resolvedBounds = {
    ...bounds,
    min: Math.min(Number(bounds.min), Number(value)),
    max: Math.max(Number(bounds.max), Number(value)),
  };
  setControlBounds(numberInput, resolvedBounds);
  setControlBounds(rangeInput, resolvedBounds);
  setControlValue(numberInput, value);
  setControlValue(rangeInput, value);
}

function rangeStepPrecision(step) {
  const text = String(step || "");
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function rangeValueFromPointer(input, clientX) {
  const rect = input.getBoundingClientRect();
  const min = numberOrFallback(input.min, 0);
  const max = numberOrFallback(input.max, 100);
  const step = Number(input.step);
  const ratio = rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
  let value = min + ratio * (max - min);
  if (Number.isFinite(step) && step > 0) value = min + Math.round((value - min) / step) * step;
  return clamp(Number(value.toFixed(Math.min(rangeStepPrecision(input.step), 6))), min, max);
}

function dispatchRangeInput(input, eventName) {
  input.dispatchEvent(new Event(eventName, { bubbles: true }));
}

function wireRangePointerScrub(input) {
  if (!input) return;
  const updateFromPointer = (event) => {
    if (input.disabled) return;
    setControlValue(input, rangeValueFromPointer(input, event.clientX));
    dispatchRangeInput(input, "input");
  };

  input.addEventListener("pointerdown", (event) => {
    if (input.disabled) return;
    const pointerId = event.pointerId;
    const onPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      updateFromPointer(moveEvent);
      moveEvent.preventDefault();
    };
    const stopScrubbing = (endEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      updateFromPointer(endEvent);
      dispatchRangeInput(input, "change");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopScrubbing);
      window.removeEventListener("pointercancel", stopScrubbing);
      endEvent.preventDefault();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", stopScrubbing, { passive: false });
    window.addEventListener("pointercancel", stopScrubbing, { passive: false });
    updateFromPointer(event);
    event.preventDefault();
  });
}

function layerControlBounds() {
  const size = currentPanelSize();
  return {
    x: { min: -Math.round(size.width), max: Math.round(size.width), step: 1 },
    y: { min: -Math.round(size.height), max: Math.round(size.height), step: 1 },
    scale: { min: 0.05, max: 8, step: 0.01 },
    rotation: { min: -180, max: 180, step: 1 },
    width: { min: 1, max: Math.max(2, Math.round(size.width * 2)), step: 1 },
    height: { min: 1, max: Math.max(2, Math.round(size.height * 2)), step: 1 },
    opacity: { min: 0, max: 1, step: 0.01 },
  };
}

function currentPanel() {
  return currentView()?.panels?.[currentPanelName()];
}

function currentPanelDocument() {
  return getPanelDocument(state.project, currentPanelName());
}

function activeLayer() {
  const layers = currentPanelDocument().layers;
  return layers.find((layer) => layer.id === state.activeLayerId) || layers[0] || null;
}

function setActiveLayer(layerId) {
  state.activeLayerId = layerId || currentPanelDocument().layers[0]?.id || null;
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function setCanvasSize(canvas, width, height, zoom = 1) {
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  canvas.style.width = `${Math.max(1, Math.ceil(width * zoom))}px`;
  canvas.style.height = `${Math.max(1, Math.ceil(height * zoom))}px`;
}

function drawChecker(ctx, width, height, size = 16) {
  ctx.fillStyle = "#0f1113";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1d2328";
  for (let y = 0; y < height; y += size) {
    for (let x = (y / size) % 2 ? 0 : size; x < width; x += size * 2) {
      ctx.fillRect(x, y, size, size);
    }
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(`Cannot read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = dataUrl;
  });
}

async function ensureLayerImage(layer) {
  if (!layer?.dataUrl) return null;
  const cached = state.imageCache.get(layer.id);
  if (cached?.dataUrl === layer.dataUrl) return cached.image;
  const image = await loadImage(layer.dataUrl);
  state.imageCache.set(layer.id, { dataUrl: layer.dataUrl, image });
  return image;
}

async function hydrateProjectImages() {
  const imageLayers = PANEL_ORDER.flatMap((panelName) => state.project.panels[panelName]?.layers || [])
    .filter((layer) => layer.type === "image" && layer.dataUrl);
  await Promise.all(imageLayers.map((layer) => ensureLayerImage(layer)));
  if (state.backdropDataUrl) state.backdropImage = await loadImage(state.backdropDataUrl);
}

function drawImageCover(ctx, image, width, height, alpha = 1) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawShape(ctx, layer) {
  const width = Math.max(1, Number(layer.width) || 1);
  const height = Math.max(1, Number(layer.height) || 1);
  const x = -width / 2;
  const y = -height / 2;

  if (layer.shape === "stripe") {
    ctx.fillStyle = layer.fill;
    ctx.beginPath();
    ctx.moveTo(x + height * 0.45, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width - height * 0.45, y + height);
    ctx.lineTo(x, y + height);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (layer.shape === "ellipse") {
    ctx.fillStyle = layer.fill;
    ctx.beginPath();
    ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (layer.shape === "gradient") {
    const gradient = ctx.createLinearGradient(x, 0, x + width, 0);
    gradient.addColorStop(0, layer.fill);
    gradient.addColorStop(1, layer.secondaryFill || "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    return;
  }

  if (layer.shape === "carbon") {
    ctx.fillStyle = layer.fill || "#22282e";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = layer.secondaryFill || "#0d1115";
    ctx.lineWidth = 2;
    for (let stripe = -height; stripe < width + height; stripe += 12) {
      ctx.beginPath();
      ctx.moveTo(x + stripe, y);
      ctx.lineTo(x + stripe + height, y + height);
      ctx.stroke();
    }
    return;
  }

  ctx.fillStyle = layer.fill;
  ctx.fillRect(x, y, width, height);
  if (layer.strokeWidth > 0 && layer.stroke !== "transparent") {
    ctx.strokeStyle = layer.stroke;
    ctx.lineWidth = layer.strokeWidth;
    ctx.strokeRect(x, y, width, height);
  }
}

function drawLayer(ctx, layer, panelSize) {
  if (!layer.visible) return;
  ctx.save();
  ctx.globalAlpha = clamp(Number(layer.opacity) || 0, 0, 1);
  ctx.globalCompositeOperation = layer.blendMode || "source-over";
  ctx.translate(panelSize.width / 2 + (Number(layer.x) || 0), panelSize.height / 2 + (Number(layer.y) || 0));
  ctx.rotate(((Number(layer.rotation) || 0) * Math.PI) / 180);
  ctx.scale(Number(layer.scale) || 1, Number(layer.scale) || 1);

  if (layer.type === "image") {
    const image = state.imageCache.get(layer.id)?.image;
    if (image) {
      const width = Math.max(1, Number(layer.width) || image.width);
      const height = Math.max(1, Number(layer.height) || image.height);
      ctx.drawImage(image, -width / 2, -height / 2, width, height);
    }
  } else if (layer.type === "text") {
    ctx.fillStyle = layer.fill;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Number(layer.fontWeight) || 800} ${Math.max(1, Number(layer.fontSize) || 32)}px Arial, Helvetica, sans-serif`;
    ctx.fillText(layer.text || "", 0, 0);
  } else {
    drawShape(ctx, layer);
  }

  ctx.restore();
}

function renderPanelArtwork(canvas, panelName, { checker = false, placeholder = false, zoom = 1 } = {}) {
  const key = basePanelName(panelName);
  const size = currentPanelSize(key);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  setCanvasSize(canvas, size.width, size.height, zoom);
  ctx.clearRect(0, 0, size.width, size.height);
  if (checker) drawChecker(ctx, size.width, size.height);

  const layers = state.project.panels[key]?.layers || [];
  for (const layer of layers) drawLayer(ctx, layer, size);

  if (placeholder && layers.length === 0) {
    ctx.fillStyle = "#9da7b1";
    ctx.font = "700 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${size.width} x ${size.height}`, size.width / 2, size.height / 2);
  }
  return canvas;
}

function renderSourceCanvas() {
  renderPanelArtwork(elements.sourceCanvas, currentPanelName(), {
    checker: true,
    placeholder: true,
    zoom: state.zoom,
  });
}

function adjustedPoint(point, stage) {
  return {
    x: point.x - stage.xmin,
    y: point.y - stage.ymin,
  };
}

function panelStageBounds(panel, stage) {
  const points = (panel?.pointGrid || [])
    .flatMap((row) => row || [])
    .filter(Boolean)
    .map((point) => adjustedPoint(point, stage));
  if (!points.length && panel?.bounds) {
    points.push(
      { x: panel.bounds.xmin - stage.xmin, y: panel.bounds.ymin - stage.ymin },
      { x: panel.bounds.xmax - stage.xmin, y: panel.bounds.ymax - stage.ymin },
    );
  }
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  return {
    xmin,
    xmax,
    ymin,
    ymax,
    width: xmax - xmin,
    height: ymax - ymin,
  };
}

function drawPanelSurfaceCell(ctx, points, selected, shade = 0) {
  const tint = selected ? [78, 113, 136] : [48, 57, 66];
  const alpha = selected ? 0.74 - shade * 0.08 : 0.56 - shade * 0.08;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.fillStyle = `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${Math.max(0.28, alpha)})`;
  ctx.fill();
  ctx.strokeStyle = selected ? "rgba(231, 240, 247, 0.34)" : "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = selected ? 1.2 : 0.8;
  ctx.stroke();
}

function drawPanelSurfaceFallback(ctx, panel, stage, selected) {
  const bounds = panelStageBounds(panel, stage);
  if (!bounds) return;
  ctx.fillStyle = selected ? "rgba(78, 113, 136, 0.68)" : "rgba(48, 57, 66, 0.5)";
  ctx.strokeStyle = selected ? "rgba(231, 240, 247, 0.32)" : "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = selected ? 1.2 : 0.8;
  ctx.fillRect(bounds.xmin, bounds.ymin, bounds.width, bounds.height);
  ctx.strokeRect(bounds.xmin, bounds.ymin, bounds.width, bounds.height);
}

function drawPanelSurface(ctx, panel, stage, selected) {
  const grid = panel?.pointGrid || [];
  const rows = grid.length;
  const columns = Math.max(0, ...grid.map((row) => row?.length || 0));
  if (rows < 2 || columns < 2) {
    drawPanelSurfaceFallback(ctx, panel, stage, selected);
    return;
  }

  ctx.save();
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const p00 = grid[row]?.[column];
      const p01 = grid[row]?.[column + 1];
      const p10 = grid[row + 1]?.[column];
      const p11 = grid[row + 1]?.[column + 1];
      if (!p00 || !p01 || !p10 || !p11) continue;
      const shade = (row + column) / Math.max(1, rows + columns);
      drawPanelSurfaceCell(ctx, [
        adjustedPoint(p00, stage),
        adjustedPoint(p01, stage),
        adjustedPoint(p11, stage),
        adjustedPoint(p10, stage),
      ], selected, shade);
    }
  }
  ctx.restore();
}

function drawTriangle(ctx, image, source, destination) {
  const [s0, s1, s2] = source;
  const [d0, d1, d2] = destination;
  const denominator = s0.x * (s1.y - s2.y)
    + s1.x * (s2.y - s0.y)
    + s2.x * (s0.y - s1.y);
  if (!denominator) return;

  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denominator;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denominator;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denominator;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denominator;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y)
    + d1.x * (s2.x * s0.y - s0.x * s2.y)
    + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denominator;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y)
    + d1.y * (s2.x * s0.y - s0.x * s2.y)
    + d2.y * (s0.x * s1.y - s1.x * s0.y)) / denominator;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function drawWarpedSource(ctx, sourceCanvas, panel, stage) {
  const grid = panel?.pointGrid || [];
  const rows = grid.length;
  const columns = Math.max(0, ...grid.map((row) => row?.length || 0));
  if (rows < 2 || columns < 2) return;

  const sourceWidth = sourceCanvas.width;
  const sourceHeight = sourceCanvas.height;
  const cellWidth = sourceWidth / (columns - 1);
  const cellHeight = sourceHeight / (rows - 1);

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const p00 = grid[row]?.[column];
      const p01 = grid[row]?.[column + 1];
      const p10 = grid[row + 1]?.[column];
      const p11 = grid[row + 1]?.[column + 1];
      if (!p00 || !p01 || !p10 || !p11) continue;

      const x0 = column * cellWidth;
      const y0 = row * cellHeight;
      const x1 = (column + 1) * cellWidth;
      const y1 = (row + 1) * cellHeight;
      const d00 = adjustedPoint(p00, stage);
      const d01 = adjustedPoint(p01, stage);
      const d10 = adjustedPoint(p10, stage);
      const d11 = adjustedPoint(p11, stage);

      drawTriangle(
        ctx,
        sourceCanvas,
        [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }],
        [d00, d01, d11],
      );
      drawTriangle(
        ctx,
        sourceCanvas,
        [{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
        [d00, d11, d10],
      );
    }
  }
}

function drawGrid(ctx, panel, stage, color) {
  const grid = panel?.pointGrid || [];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 4]);

  for (const row of grid) {
    const points = (row || []).filter(Boolean).map((point) => adjustedPoint(point, stage));
    if (points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  const columns = Math.max(0, ...grid.map((row) => row?.length || 0));
  for (let column = 0; column < columns; column += 1) {
    const points = grid.map((row) => row?.[column]).filter(Boolean).map((point) => adjustedPoint(point, stage));
    if (points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  for (const point of grid.flatMap((row) => (row || []).filter(Boolean))) {
    const adjusted = adjustedPoint(point, stage);
    ctx.beginPath();
    ctx.arc(adjusted.x, adjusted.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function findViewWithPanel(car, viewName, panelName) {
  const key = basePanelName(panelName);
  const preferred = car?.views?.[viewName];
  if (preferred?.panels?.[panelName] || preferred?.panels?.[key]) return preferred;
  return Object.values(car?.views || {}).find((view) => view?.panels?.[panelName] || view?.panels?.[key]);
}

function drawStageBackdrop(ctx, view, width, height, selectedPanelName) {
  ctx.fillStyle = "#151a1f";
  ctx.fillRect(0, 0, width, height);

  const entries = Object.entries(view?.panels || {});
  const bounds = entries
    .map(([, candidate]) => panelStageBounds(candidate, view.stage))
    .filter(Boolean);
  if (bounds.length) {
    const xmin = Math.min(...bounds.map((candidate) => candidate.xmin));
    const xmax = Math.max(...bounds.map((candidate) => candidate.xmax));
    const ymax = Math.max(...bounds.map((candidate) => candidate.ymax));
    ctx.save();
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = "#050708";
    ctx.beginPath();
    ctx.ellipse((xmin + xmax) / 2, ymax + 11, Math.max(20, (xmax - xmin) * 0.5), 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  const selectedKey = basePanelName(selectedPanelName);
  const ordered = entries.sort(([leftName], [rightName]) => {
    const leftSelected = basePanelName(leftName) === selectedKey ? 1 : 0;
    const rightSelected = basePanelName(rightName) === selectedKey ? 1 : 0;
    return leftSelected - rightSelected;
  });
  for (const [name, candidate] of ordered) {
    drawPanelSurface(ctx, candidate, view.stage, basePanelName(name) === selectedKey);
  }
  ctx.restore();
}

function drawProjectOnView(ctx, view, panelNames) {
  for (const [name, candidate] of Object.entries(view?.panels || {})) {
    const key = basePanelName(name);
    if (!panelNames.includes(key)) continue;
    const sourceCanvas = document.createElement("canvas");
    renderPanelArtwork(sourceCanvas, key);
    const hasArtwork = (state.project.panels[key]?.layers || []).some((layer) => layer.visible);
    if (hasArtwork) drawWarpedSource(ctx, sourceCanvas, candidate, view.stage);
  }
}

function drawPanelBounds(ctx, view, selectedPanelName) {
  for (const [name, candidate] of Object.entries(view.panels || {})) {
    const bounds = candidate.bounds;
    const selected = name === selectedPanelName || basePanelName(name) === basePanelName(selectedPanelName);
    ctx.strokeStyle = selected ? "#ffffff" : "#4b5561";
    ctx.fillStyle = selected ? "rgba(227,66,47,0.16)" : "rgba(255,255,255,0.04)";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.fillRect(bounds.xmin - view.stage.xmin, bounds.ymin - view.stage.ymin, bounds.width, bounds.height);
    ctx.strokeRect(bounds.xmin - view.stage.xmin, bounds.ymin - view.stage.ymin, bounds.width, bounds.height);
  }
}

function renderCarPreview(canvas, car, viewName, selectedPanelName, { zoom = 1, allPanels = true } = {}) {
  const view = findViewWithPanel(car, viewName, selectedPanelName);
  const panel = view?.panels?.[selectedPanelName] || view?.panels?.[basePanelName(selectedPanelName)];
  if (!view || !panel) {
    setCanvasSize(canvas, 360, 170, zoom);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#151a1f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const stage = view.stage;
  const ctx = canvas.getContext("2d");
  setCanvasSize(canvas, Math.ceil(stage.width), Math.ceil(stage.height), zoom);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.showBackdrop) {
    if (state.backdropImage) {
      drawImageCover(ctx, state.backdropImage, canvas.width, canvas.height, 0.62);
    } else {
      drawStageBackdrop(ctx, view, canvas.width, canvas.height, selectedPanelName);
    }
  } else {
    ctx.fillStyle = "#151a1f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const visiblePanels = allPanels
    ? PANEL_ORDER.filter((panelName) => (state.project.panels[panelName]?.layers || []).length > 0)
    : [basePanelName(selectedPanelName)];
  drawProjectOnView(ctx, view, visiblePanels.length ? visiblePanels : [basePanelName(selectedPanelName)]);

  if (state.showGrid) {
    drawPanelBounds(ctx, view, selectedPanelName);
    drawGrid(ctx, panel, stage, "#f6b73c");
  }
}

function renderPreviewCanvas() {
  renderCarPreview(elements.previewCanvas, currentCar(), state.view, currentPanelName(), {
    zoom: state.zoom,
    allPanels: true,
  });
}

function renderButtons(container, values, selectedValue, onSelect) {
  container.textContent = "";
  for (const value of values) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = PANEL_LABELS[value] || value[0].toUpperCase() + value.slice(1);
    button.setAttribute("aria-pressed", value === selectedValue ? "true" : "false");
    button.addEventListener("click", () => onSelect(value));
    container.append(button);
  }
}

function renderLayerList() {
  const layers = currentPanelDocument().layers;
  elements.layerList.textContent = "";
  for (const layer of [...layers].reverse()) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "layer-row";
    row.setAttribute("aria-selected", layer.id === state.activeLayerId ? "true" : "false");
    row.addEventListener("click", () => {
      setActiveLayer(layer.id);
      refresh();
      scrollLayerControlsIntoView();
    });

    const name = document.createElement("span");
    name.className = "layer-name";
    name.textContent = `${layer.visible ? "" : "[hidden] "}${layer.name}`;
    row.append(name);

    const type = document.createElement("span");
    type.textContent = layer.type;
    row.append(type);

    const lock = document.createElement("span");
    lock.textContent = layer.locked ? "locked" : "";
    row.append(lock);
    elements.layerList.append(row);
  }
}

function scrollLayerControlsIntoView() {
  const section = elements.layerNameInput?.closest(".tool-section");
  section?.scrollIntoView({ block: "start", inline: "nearest" });
}

function syncLayerControls() {
  const layer = activeLayer();
  const hasLayer = Boolean(layer);
  for (const input of layerControlInputs) input.disabled = !hasLayer;

  elements.layerTextField.style.display = layer?.type === "text" ? "grid" : "none";
  const bounds = layerControlBounds();
  if (!layer) {
    elements.layerNameInput.value = "";
    elements.layerTextInput.value = "";
    syncNumberControl(elements.offsetXInput, elements.offsetXRangeInput, 0, bounds.x);
    syncNumberControl(elements.offsetYInput, elements.offsetYRangeInput, 0, bounds.y);
    syncNumberControl(elements.scaleInput, elements.scaleRangeInput, 1, bounds.scale);
    syncNumberControl(elements.rotateInput, elements.rotateRangeInput, 0, bounds.rotation);
    syncNumberControl(elements.layerWidthInput, elements.layerWidthRangeInput, 1, bounds.width);
    syncNumberControl(elements.layerHeightInput, elements.layerHeightRangeInput, 1, bounds.height);
    syncNumberControl(elements.opacityInput, elements.opacityRangeInput, 1, bounds.opacity);
    return;
  }

  elements.layerNameInput.value = layer.name || "";
  elements.layerTextInput.value = layer.text || "";
  syncNumberControl(elements.offsetXInput, elements.offsetXRangeInput, Math.round(numberOrFallback(layer.x, 0)), bounds.x);
  syncNumberControl(elements.offsetYInput, elements.offsetYRangeInput, Math.round(numberOrFallback(layer.y, 0)), bounds.y);
  syncNumberControl(elements.scaleInput, elements.scaleRangeInput, numberOrFallback(layer.scale, 1), bounds.scale);
  syncNumberControl(elements.rotateInput, elements.rotateRangeInput, numberOrFallback(layer.rotation, 0), bounds.rotation);
  syncNumberControl(elements.layerWidthInput, elements.layerWidthRangeInput, Math.round(numberOrFallback(layer.width, 1)), bounds.width);
  syncNumberControl(elements.layerHeightInput, elements.layerHeightRangeInput, Math.round(numberOrFallback(layer.height, 1)), bounds.height);
  syncNumberControl(elements.opacityInput, elements.opacityRangeInput, clamp(numberOrFallback(layer.opacity, 1), 0, 1), bounds.opacity);
  elements.blendModeInput.value = layer.blendMode || "source-over";
  elements.fillInput.value = normalizeColorInput(layer.fill || "#e3422f");
  elements.secondaryFillInput.value = normalizeColorInput(layer.secondaryFill || "#f6b73c");
}

function normalizeColorInput(color) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#e3422f";
}

function updateCompareSelect() {
  const selectedValue = elements.compareCarSelect.value;
  elements.compareCarSelect.textContent = "";
  for (const car of STUDIO_DATA.cars) {
    const option = document.createElement("option");
    option.value = car.carId;
    option.textContent = `${car.carId} ${car.name}`;
    elements.compareCarSelect.append(option);
  }
  elements.compareCarSelect.value = selectedValue || state.project.carId;
}

function renderCompatibility() {
  const rows = summarizeCompatibility(STUDIO_DATA.cars, PANEL_ORDER);
  const compatible = rows.filter((row) => row.status === "compatible").length;
  const missing = rows.length - compatible;
  elements.compatSummary.textContent = `${compatible} compatible, ${missing} missing panel data`;
}

function renderCompareGrid() {
  elements.compareGrid.textContent = "";
  const selectedPanel = currentPanelName();
  const rows = summarizeCompatibility(STUDIO_DATA.cars, [basePanelName(selectedPanel)]);
  for (const carId of state.compareCarIds) {
    const car = carById(carId);
    if (!car) continue;
    const row = rows.find((candidate) => candidate.carId === carId);
    const card = document.createElement("article");
    card.className = "compare-card";

    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = `${car.carId} ${car.name}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      state.compareCarIds = state.compareCarIds.filter((candidate) => candidate !== carId);
      refresh();
    });
    header.append(title, remove);

    const canvas = document.createElement("canvas");
    renderCarPreview(canvas, car, state.view, selectedPanel, { zoom: 1, allPanels: false });

    const footer = document.createElement("footer");
    const status = document.createElement("span");
    status.className = `status-${row?.status || "missing-panels"}`;
    status.textContent = row?.status === "compatible" ? "Compatible" : `Missing ${(row?.missingPanels || []).join(", ")}`;
    footer.append(status);

    card.append(header, canvas, footer);
    elements.compareGrid.append(card);
  }
}

function refreshControls() {
  const car = currentCar();
  const viewNames = Object.keys(car?.views || {});
  if (!viewNames.includes(state.view)) state.view = viewNames[0] || "front";

  const view = currentView();
  const panelNames = Object.keys(view?.panels || {});
  if (!panelNames.includes(state.panel)) state.panel = panelNames[0] || "hood";
  if (!currentPanelDocument().layers.some((layer) => layer.id === state.activeLayerId)) setActiveLayer();

  renderButtons(elements.viewButtons, viewNames, state.view, (value) => {
    state.view = value;
    refresh();
  });
  renderButtons(elements.panelButtons, panelNames, state.panel, (value) => {
    state.panel = value;
    setActiveLayer();
    refresh();
  });

  const panelName = currentPanelName();
  const panelSize = currentPanelSize(panelName);
  const decalId = Math.max(1, Number.parseInt(state.project.decalId, 10) || 1);
  elements.projectNameInput.value = state.project.name || "Custom graphic";
  elements.decalIdInput.value = String(decalId);
  elements.assetPath.textContent = assetCachePath(panelName, decalId);
  elements.selectedCarLabel.textContent = `${car.carId} ${car.name}`;
  elements.selectedPanelLabel.textContent = `${state.view} / ${PANEL_LABELS[panelName] || panelName} / ${currentPanelDocument().layers.length} layers`;
  elements.sourceSizeLabel.textContent = `${panelSize.width} x ${panelSize.height}`;
  elements.gridStatsLabel.textContent = `${currentPanel()?.pointCount || 0} points`;
  elements.gridToggle.checked = state.showGrid;
  elements.backdropToggle.checked = state.showBackdrop;
  elements.zoomInput.value = String(state.zoom);
  renderLayerList();
  syncLayerControls();
  renderCompatibility();
}

function refresh() {
  refreshControls();
  renderSourceCanvas();
  renderPreviewCanvas();
  renderCompareGrid();
}

function defaultLayerPosition(layer, panelName = currentPanelName()) {
  const size = currentPanelSize(panelName);
  if (!Number.isFinite(layer.width)) layer.width = Math.round(size.width * 0.56);
  if (!Number.isFinite(layer.height)) layer.height = Math.round(size.height * 0.25);
  layer.x = 0;
  layer.y = 0;
  return layer;
}

function addLayer(layer) {
  const doc = currentPanelDocument();
  doc.layers.push(defaultLayerPosition(layer));
  setActiveLayer(layer.id);
  state.project.updatedAt = new Date().toISOString();
  refresh();
  scrollLayerControlsIntoView();
}

function fitLayer() {
  const layer = activeLayer();
  if (!layer || layer.locked) return;
  const size = currentPanelSize();
  const image = state.imageCache.get(layer.id)?.image;
  const width = image?.width || Number(layer.width) || size.width;
  const height = image?.height || Number(layer.height) || size.height;
  layer.scale = Math.min(size.width / width, size.height / height);
  layer.x = 0;
  layer.y = 0;
  refresh();
}

function centerLayer() {
  const layer = activeLayer();
  if (!layer || layer.locked) return;
  layer.x = 0;
  layer.y = 0;
  refresh();
}

function updateActiveLayer(properties) {
  const layer = activeLayer();
  if (!layer || layer.locked) return;
  Object.assign(layer, properties);
  state.project.updatedAt = new Date().toISOString();
  refresh();
}

function duplicateLayer() {
  const layer = activeLayer();
  if (!layer) return;
  const copy = createLayer({
    ...JSON.parse(JSON.stringify(layer)),
    id: undefined,
    name: `${layer.name} copy`,
    x: (Number(layer.x) || 0) + 12,
    y: (Number(layer.y) || 0) + 12,
  });
  currentPanelDocument().layers.push(copy);
  if (layer.type === "image" && layer.dataUrl) ensureLayerImage(copy).catch((error) => setStatus(error.message));
  setActiveLayer(copy.id);
  refresh();
}

function deleteLayer() {
  const doc = currentPanelDocument();
  const layer = activeLayer();
  if (!layer) return;
  doc.layers = doc.layers.filter((candidate) => candidate.id !== layer.id);
  state.imageCache.delete(layer.id);
  setActiveLayer(doc.layers.at(-1)?.id);
  refresh();
}

function moveLayer(delta) {
  const layers = currentPanelDocument().layers;
  const layer = activeLayer();
  const index = layers.findIndex((candidate) => candidate.id === layer?.id);
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) return;
  const [item] = layers.splice(index, 1);
  layers.splice(nextIndex, 0, item);
  refresh();
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportProject() {
  const projectJson = serializeProject(state.project);
  downloadBlob(new Blob([projectJson], { type: "application/json" }), `custom-graphic-${state.project.carId}-${state.project.decalId}.json`);
  setStatus("Project JSON exported");
}

function exportPanelFileName(panelName, extension) {
  return assetFileName(panelName, state.project.decalId, extension);
}

async function buildPanelSwf(panelName) {
  const canvas = document.createElement("canvas");
  renderPanelArtwork(canvas, panelName);
  const size = currentPanelSize(panelName);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, size.width, size.height);
  const swf = await createCustomGraphicSwf({
    width: size.width,
    height: size.height,
    rgba: imageData.data,
  });
  const validation = validateCustomGraphicSwf(swf, size);
  return {
    panelName: basePanelName(panelName),
    fileName: exportPanelFileName(panelName, "swf"),
    path: assetCachePath(panelName, state.project.decalId),
    swf,
    validation,
  };
}

async function exportCurrentSwf() {
  const result = await buildPanelSwf(currentPanelName());
  downloadBlob(new Blob([result.swf], { type: "application/x-shockwave-flash" }), result.fileName);
  setStatus(`Exported ${result.fileName} (${result.validation.valid ? "valid" : "invalid"}, ${result.swf.length} bytes)`);
}

function exportCurrentPng() {
  const canvas = document.createElement("canvas");
  renderPanelArtwork(canvas, currentPanelName());
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, exportPanelFileName(currentPanelName(), "png"));
    setStatus(`Exported ${exportPanelFileName(currentPanelName(), "png")}`);
  }, "image/png");
}

async function buildAllExports() {
  const swfResults = {};
  const files = [];
  for (const panelName of PANEL_ORDER) {
    const result = await buildPanelSwf(panelName);
    swfResults[panelName] = {
      byteLength: result.swf.length,
      valid: result.validation.valid,
    };
    files.push(result);
  }
  const manifest = buildExportManifest({
    project: state.project,
    car: currentCar(),
    panels: PANEL_ORDER,
    swfResults,
    compatibility: summarizeCompatibility(STUDIO_DATA.cars, PANEL_ORDER),
  });
  return { files, manifest };
}

async function exportAllPanels() {
  const { files, manifest } = await buildAllExports();
  for (const file of files) {
    downloadBlob(new Blob([file.swf], { type: "application/x-shockwave-flash" }), file.fileName);
  }
  downloadBlob(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }), `custom-graphic-manifest-${state.project.carId}-${state.project.decalId}.json`);
  downloadBlob(new Blob([serializeProject(state.project)], { type: "application/json" }), `custom-graphic-project-${state.project.carId}-${state.project.decalId}.json`);
  setStatus(`Exported ${files.length} SWFs plus manifest`);
}

async function pickCacheFolder() {
  if (!window.showDirectoryPicker) {
    setStatus("Direct folder save is not available in this browser");
    return;
  }
  state.cacheDirectoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  setStatus(`Selected folder: ${state.cacheDirectoryHandle.name}`);
}

async function writeFile(directoryHandle, fileName, data) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function saveAllToCacheFolder() {
  if (!state.cacheDirectoryHandle) await pickCacheFolder();
  if (!state.cacheDirectoryHandle) return;

  const { files, manifest } = await buildAllExports();
  for (const file of files) {
    await writeFile(state.cacheDirectoryHandle, file.fileName, file.swf);
  }
  await writeFile(
    state.cacheDirectoryHandle,
    `custom-graphic-manifest-${state.project.carId}-${state.project.decalId}.json`,
    JSON.stringify(manifest, null, 2),
  );
  await writeFile(
    state.cacheDirectoryHandle,
    `custom-graphic-project-${state.project.carId}-${state.project.decalId}.json`,
    serializeProject(state.project),
  );
  setStatus(`Saved ${files.length} SWFs to ${state.cacheDirectoryHandle.name}`);
}

function resetCompareCars() {
  state.compareCarIds = [
    state.project.carId,
    ...STUDIO_DATA.cars
      .filter((car) => car.carId !== state.project.carId)
      .slice(0, 3)
      .map((car) => car.carId),
  ];
}

function wireLayerNumber(numberInput, rangeInput, property, fallback = 0) {
  const updateFrom = (sourceInput) => {
    const value = numberOrFallback(sourceInput.value, fallback);
    setControlValue(numberInput, value);
    setControlValue(rangeInput, value);
    updateActiveLayer({ [property]: value });
  };

  numberInput.addEventListener("input", () => updateFrom(numberInput));
  numberInput.addEventListener("change", () => updateFrom(numberInput));
  wireRangePointerScrub(rangeInput);
  rangeInput.addEventListener("input", () => updateFrom(rangeInput));
  rangeInput.addEventListener("change", () => updateFrom(rangeInput));
}

function wireEvents() {
  elements.projectNameInput.addEventListener("input", () => {
    state.project.name = elements.projectNameInput.value || "Custom graphic";
  });
  elements.saveProjectButton.addEventListener("click", exportProject);
  elements.loadProjectButton.addEventListener("click", () => elements.projectInput.click());
  elements.projectInput.addEventListener("change", async () => {
    const file = elements.projectInput.files?.[0];
    if (!file) return;
    state.project = deserializeProject(await file.text());
    state.imageCache.clear();
    await hydrateProjectImages();
    elements.carSelect.value = state.project.carId;
    resetCompareCars();
    setStatus(`Loaded ${file.name}`);
    refresh();
  });

  elements.carSelect.addEventListener("change", () => {
    state.project.carId = elements.carSelect.value;
    resetCompareCars();
    refresh();
  });
  elements.decalIdInput.addEventListener("input", () => {
    state.project.decalId = Math.max(1, Number.parseInt(elements.decalIdInput.value, 10) || 1);
    refresh();
  });

  elements.addImageLayerButton.addEventListener("click", () => elements.layerImageInput.click());
  elements.layerImageInput.addEventListener("change", async () => {
    const file = elements.layerImageInput.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);
    const layer = createLayer({
      type: "image",
      name: file.name.replace(/\.[^.]+$/, ""),
      dataUrl,
      imageName: file.name,
      width: image.width,
      height: image.height,
    });
    state.imageCache.set(layer.id, { dataUrl, image });
    addLayer(layer);
    fitLayer();
    setStatus(file.name);
    elements.layerImageInput.value = "";
  });
  elements.addTextLayerButton.addEventListener("click", () => {
    addLayer(createLayer({
      type: "text",
      name: "Text",
      text: "NITTO",
      fontSize: Math.round(currentPanelSize().height * 0.18),
      fill: "#f4f7f8",
    }));
  });
  elements.addShapeLayerButton.addEventListener("click", () => {
    const size = currentPanelSize();
    addLayer(createLayer({
      type: "shape",
      name: "Shape",
      shape: "rect",
      width: Math.round(size.width * 0.58),
      height: Math.round(size.height * 0.24),
      fill: "#e3422f",
      opacity: 0.9,
    }));
  });
  elements.addTemplateButton.addEventListener("click", () => {
    const layers = instantiateTemplate(elements.templateSelect.value, currentPanelSize());
    for (const layer of layers) currentPanelDocument().layers.push(layer);
    setActiveLayer(layers.at(-1)?.id);
    refresh();
    scrollLayerControlsIntoView();
  });

  elements.layerNameInput.addEventListener("input", () => updateActiveLayer({ name: elements.layerNameInput.value }));
  elements.layerTextInput.addEventListener("input", () => updateActiveLayer({ text: elements.layerTextInput.value }));
  wireLayerNumber(elements.offsetXInput, elements.offsetXRangeInput, "x");
  wireLayerNumber(elements.offsetYInput, elements.offsetYRangeInput, "y");
  wireLayerNumber(elements.scaleInput, elements.scaleRangeInput, "scale", 1);
  wireLayerNumber(elements.rotateInput, elements.rotateRangeInput, "rotation");
  wireLayerNumber(elements.layerWidthInput, elements.layerWidthRangeInput, "width", 1);
  wireLayerNumber(elements.layerHeightInput, elements.layerHeightRangeInput, "height", 1);
  wireLayerNumber(elements.opacityInput, elements.opacityRangeInput, "opacity", 1);
  elements.blendModeInput.addEventListener("input", () => updateActiveLayer({ blendMode: elements.blendModeInput.value }));
  elements.fillInput.addEventListener("input", () => updateActiveLayer({ fill: elements.fillInput.value }));
  elements.secondaryFillInput.addEventListener("input", () => updateActiveLayer({ secondaryFill: elements.secondaryFillInput.value }));
  elements.fitButton.addEventListener("click", fitLayer);
  elements.centerButton.addEventListener("click", centerLayer);
  elements.resetScaleButton.addEventListener("click", () => updateActiveLayer({ scale: 1 }));
  elements.resetRotationButton.addEventListener("click", () => updateActiveLayer({ rotation: 0 }));
  elements.fullOpacityButton.addEventListener("click", () => updateActiveLayer({ opacity: 1 }));
  elements.duplicateLayerButton.addEventListener("click", duplicateLayer);
  elements.moveLayerUpButton.addEventListener("click", () => moveLayer(1));
  elements.moveLayerDownButton.addEventListener("click", () => moveLayer(-1));
  elements.deleteLayerButton.addEventListener("click", deleteLayer);

  elements.gridToggle.addEventListener("change", () => {
    state.showGrid = elements.gridToggle.checked;
    refresh();
  });
  elements.backdropToggle.addEventListener("change", () => {
    state.showBackdrop = elements.backdropToggle.checked;
    refresh();
  });
  wireRangePointerScrub(elements.zoomInput);
  elements.zoomInput.addEventListener("input", () => {
    state.zoom = Number(elements.zoomInput.value) || 1;
    refresh();
  });
  elements.backdropButton.addEventListener("click", () => elements.backdropInput.click());
  elements.backdropInput.addEventListener("change", async () => {
    const file = elements.backdropInput.files?.[0];
    if (!file) return;
    state.backdropDataUrl = await readFileAsDataUrl(file);
    state.backdropImage = await loadImage(state.backdropDataUrl);
    setStatus(`Backdrop loaded: ${file.name}`);
    refresh();
  });

  elements.pickCacheFolderButton.addEventListener("click", () => {
    pickCacheFolder().catch((error) => setStatus(error.message || "Folder selection failed"));
  });
  elements.saveCacheButton.addEventListener("click", () => {
    saveAllToCacheFolder().catch((error) => setStatus(error.message || "Cache save failed"));
  });
  elements.exportPngButton.addEventListener("click", exportCurrentPng);
  elements.exportSwfButton.addEventListener("click", () => {
    exportCurrentSwf().catch((error) => setStatus(error.message || "SWF export failed"));
  });
  elements.exportAllButton.addEventListener("click", () => {
    exportAllPanels().catch((error) => setStatus(error.message || "Export failed"));
  });
  elements.addCompareCarButton.addEventListener("click", () => {
    const carId = elements.compareCarSelect.value;
    if (carId && !state.compareCarIds.includes(carId)) {
      state.compareCarIds = [...state.compareCarIds, carId].slice(-6);
      refresh();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    const layer = activeLayer();
    if (!layer || layer.locked) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") layer.x -= step;
    else if (event.key === "ArrowRight") layer.x += step;
    else if (event.key === "ArrowUp") layer.y -= step;
    else if (event.key === "ArrowDown") layer.y += step;
    else return;
    event.preventDefault();
    refresh();
  });
}

function initOptions() {
  for (const car of STUDIO_DATA.cars) {
    const option = document.createElement("option");
    option.value = car.carId;
    option.textContent = `${car.carId} ${car.name}`;
    elements.carSelect.append(option);
  }
  for (const template of TEMPLATE_LIBRARY) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    elements.templateSelect.append(option);
  }
  updateCompareSelect();
  elements.carSelect.value = state.project.carId;
}

function init() {
  initOptions();
  resetCompareCars();
  wireEvents();
  refresh();
}

init();
