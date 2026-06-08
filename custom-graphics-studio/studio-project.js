export const PANEL_ORDER = Object.freeze(["hood", "side", "front", "back"]);

export const PANEL_LABELS = Object.freeze({
  hood: "Hood",
  side: "Side",
  sideOpp: "Side Opp",
  front: "Front",
  back: "Back",
});

export const CATEGORY_BY_PANEL = Object.freeze({
  hood: "160",
  side: "161",
  sideOpp: "161",
  front: "162",
  back: "163",
});

const DEFAULT_COLORS = Object.freeze({
  primary: "#e3422f",
  secondary: "#f6b73c",
  white: "#f4f7f8",
  black: "#111316",
});

let nextLayerId = 1;

export const TEMPLATE_LIBRARY = Object.freeze([
  Object.freeze({
    id: "race-number",
    name: "Race number",
    layers: Object.freeze([
      Object.freeze({
        type: "shape",
        shape: "rect",
        name: "Number plate",
        x: 0,
        y: 0,
        width: 126,
        height: 72,
        fill: DEFAULT_COLORS.white,
        stroke: DEFAULT_COLORS.black,
        strokeWidth: 4,
        opacity: 0.96,
      }),
      Object.freeze({
        type: "text",
        name: "Number",
        text: "1320",
        x: 0,
        y: 4,
        fontSize: 34,
        fontWeight: 900,
        fill: DEFAULT_COLORS.black,
        opacity: 1,
      }),
    ]),
  }),
  Object.freeze({
    id: "speed-stripes",
    name: "Speed stripes",
    layers: Object.freeze([
      Object.freeze({
        type: "shape",
        shape: "stripe",
        name: "Main stripe",
        x: -36,
        y: -4,
        width: 320,
        height: 26,
        rotation: -12,
        fill: DEFAULT_COLORS.primary,
        opacity: 0.9,
      }),
      Object.freeze({
        type: "shape",
        shape: "stripe",
        name: "Accent stripe",
        x: 18,
        y: 24,
        width: 260,
        height: 10,
        rotation: -12,
        fill: DEFAULT_COLORS.secondary,
        opacity: 0.85,
      }),
    ]),
  }),
  Object.freeze({
    id: "carbon-band",
    name: "Carbon band",
    layers: Object.freeze([
      Object.freeze({
        type: "shape",
        shape: "carbon",
        name: "Carbon weave",
        x: 0,
        y: 0,
        width: 300,
        height: 92,
        fill: "#23282d",
        secondaryFill: "#0b0d0f",
        opacity: 0.92,
      }),
    ]),
  }),
  Object.freeze({
    id: "sponsor-stack",
    name: "Sponsor stack",
    layers: Object.freeze([
      Object.freeze({
        type: "shape",
        shape: "rect",
        name: "Sponsor backing",
        x: 0,
        y: 0,
        width: 210,
        height: 44,
        fill: DEFAULT_COLORS.black,
        stroke: DEFAULT_COLORS.primary,
        strokeWidth: 2,
        opacity: 0.86,
      }),
      Object.freeze({
        type: "text",
        name: "Sponsor text",
        text: "NITTO",
        x: 0,
        y: 2,
        fontSize: 24,
        fontWeight: 900,
        fill: DEFAULT_COLORS.white,
        opacity: 1,
      }),
    ]),
  }),
  Object.freeze({
    id: "fade-split",
    name: "Fade split",
    layers: Object.freeze([
      Object.freeze({
        type: "shape",
        shape: "gradient",
        name: "Panel fade",
        x: 0,
        y: 0,
        width: 360,
        height: 120,
        fill: DEFAULT_COLORS.primary,
        secondaryFill: "rgba(227,66,47,0)",
        opacity: 0.75,
      }),
    ]),
  }),
]);

export function basePanelName(panelName = "hood") {
  return panelName === "sideOpp" ? "side" : panelName;
}

export function panelCategory(panelName = "hood") {
  return CATEGORY_BY_PANEL[panelName] || CATEGORY_BY_PANEL[basePanelName(panelName)] || CATEGORY_BY_PANEL.hood;
}

export function assetFileName(panelName, decalId, extension = "swf") {
  const safeDecalId = Math.max(1, Number.parseInt(decalId, 10) || 1);
  return `${panelCategory(panelName)}_${safeDecalId}.${extension}`;
}

export function assetCachePath(panelName, decalId, extension = "swf") {
  return `cache/car/userDecals/${assetFileName(panelName, decalId, extension)}`;
}

export function createLayer({
  id,
  type = "shape",
  name,
  visible = true,
  locked = false,
  opacity = 1,
  blendMode = "source-over",
  x = 0,
  y = 0,
  scale = 1,
  rotation = 0,
  width = 120,
  height = 40,
  fill = DEFAULT_COLORS.primary,
  secondaryFill = DEFAULT_COLORS.secondary,
  stroke = "transparent",
  strokeWidth = 0,
  shape = "rect",
  text = "NITTO",
  fontSize = 32,
  fontWeight = 800,
  dataUrl,
  imageName,
} = {}) {
  return {
    id: id || `layer-${nextLayerId++}`,
    type,
    name: name || `${type[0].toUpperCase()}${type.slice(1)} layer`,
    visible,
    locked,
    opacity,
    blendMode,
    x,
    y,
    scale,
    rotation,
    width,
    height,
    fill,
    secondaryFill,
    stroke,
    strokeWidth,
    shape,
    text,
    fontSize,
    fontWeight,
    dataUrl,
    imageName,
  };
}

export function createPanelDocument(panelName) {
  return {
    panel: basePanelName(panelName),
    layers: [],
  };
}

export function createProject({ carId = "", decalId = 1, name = "Custom graphic" } = {}) {
  return {
    schemaVersion: 1,
    name,
    carId: String(carId || ""),
    decalId: Math.max(1, Number.parseInt(decalId, 10) || 1),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    panels: Object.fromEntries(PANEL_ORDER.map((panelName) => [panelName, createPanelDocument(panelName)])),
  };
}

export function getPanelDocument(project, panelName) {
  const key = basePanelName(panelName);
  if (!project.panels[key]) project.panels[key] = createPanelDocument(key);
  return project.panels[key];
}

export function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

export function serializeProject(project) {
  const clone = cloneProject(project);
  clone.updatedAt = new Date().toISOString();
  return JSON.stringify(clone, null, 2);
}

export function deserializeProject(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : cloneProject(value);
  const project = {
    ...createProject({
      carId: parsed.carId,
      decalId: parsed.decalId,
      name: parsed.name || "Custom graphic",
    }),
    ...parsed,
    panels: {
      ...Object.fromEntries(PANEL_ORDER.map((panelName) => [panelName, createPanelDocument(panelName)])),
      ...(parsed.panels || {}),
    },
  };

  for (const panelName of PANEL_ORDER) {
    const panel = project.panels[panelName] || createPanelDocument(panelName);
    panel.panel = panelName;
    panel.layers = Array.isArray(panel.layers) ? panel.layers.map((layer) => createLayer(layer)) : [];
    project.panels[panelName] = panel;
  }
  return project;
}

export function instantiateTemplate(templateId, panelSize = { width: 200, height: 200 }) {
  const template = TEMPLATE_LIBRARY.find((candidate) => candidate.id === templateId) || TEMPLATE_LIBRARY[0];
  return template.layers.map((layer, index) => createLayer({
    ...layer,
    x: layer.x ?? 0,
    y: layer.y ?? 0,
    width: Math.min(layer.width || panelSize.width * 0.66, panelSize.width),
    height: Math.min(layer.height || panelSize.height * 0.4, panelSize.height),
    id: undefined,
    name: template.layers.length > 1 ? `${template.name} ${index + 1}` : template.name,
  }));
}

function panelExistsInCar(car, panelName) {
  const key = basePanelName(panelName);
  return Object.values(car?.views || {}).some((view) => Boolean(view?.panels?.[key] || view?.panels?.[panelName]));
}

export function summarizeCompatibility(cars, panelNames = PANEL_ORDER) {
  return (cars || []).map((car) => {
    const missingPanels = panelNames.filter((panelName) => !panelExistsInCar(car, panelName));
    return {
      carId: String(car.carId),
      name: car.name,
      status: missingPanels.length ? "missing-panels" : "compatible",
      missingPanels,
    };
  });
}

export function buildExportManifest({
  project,
  car,
  panels = PANEL_ORDER,
  swfResults = {},
  compatibility = [],
} = {}) {
  const decalId = Math.max(1, Number.parseInt(project?.decalId, 10) || 1);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    projectName: project?.name || "Custom graphic",
    decalId,
    car: {
      carId: String(car?.carId ?? project?.carId ?? ""),
      name: car?.name || "Unknown car",
    },
    assets: panels.map((panelName) => {
      const result = swfResults[basePanelName(panelName)] || swfResults[panelName] || {};
      return {
        panel: basePanelName(panelName),
        categoryId: panelCategory(panelName),
        fileName: assetFileName(panelName, decalId),
        path: assetCachePath(panelName, decalId),
        byteLength: result.byteLength ?? null,
        valid: result.valid ?? null,
      };
    }),
    compatibility,
    project,
  };
}
