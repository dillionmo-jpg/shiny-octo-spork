const STARTER_LOCATION_ID = 100;
const DEFAULT_STARTER_CATALOG_CAR_ID = 3;

const STOCK_WHEEL = {
  wheelId: 1,
  partId: 1001,
  size: 17,
};

const PAINT_SWATCHES = [
  "C0C0C0",
  "1F1F1F",
  "FFFFFF",
  "D21F2B",
  "244C9A",
  "238447",
  "F2C230",
  "6F3FA8",
];

const STARTER_CARS = [
  { id: 3, name: "Ford Mustang GT", price: 28000 },
  { id: 1, name: "Acura Integra GSR", price: 10000 },
  { id: 13, name: "Scion tC", price: 9500 },
];

function escapeXmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAttributes(attributes) {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}='${escapeXmlAttribute(value)}'`)
    .join(" ");
}

function pointPrice(price) {
  return Math.max(1, Math.round(Number(price) / 40));
}

function renderWheelOptions() {
  const attributes = renderAttributes({
    wid: STOCK_WHEEL.wheelId,
    id: STOCK_WHEEL.partId,
    ws: STOCK_WHEEL.size,
  });

  return `<ws><w ${attributes}/></ws>`;
}

function renderPaintSwatches() {
  const swatches = PAINT_SWATCHES
    .map((color, index) => `<p ${renderAttributes({ i: index + 1, cd: color })}/>`)
    .join("");

  return `<ps>${swatches}</ps>`;
}

function renderStarterCar(car) {
  const attributes = renderAttributes({
    ai: 0,
    id: car.id,
    i: car.id,
    ci: car.id,
    sel: car.id === DEFAULT_STARTER_CATALOG_CAR_ID ? 1 : 0,
    pi: car.id,
    pn: "",
    l: STARTER_LOCATION_ID,
    lid: STARTER_LOCATION_ID,
    cid: STARTER_LOCATION_ID,
    b: 0,
    n: car.name,
    c: car.name,
    p: car.price,
    pr: car.price,
    pp: pointPrice(car.price),
    cp: car.price,
    lk: 0,
    ae: 0,
    cc: PAINT_SWATCHES[0],
    g: "",
    ii: 0,
    wid: STOCK_WHEEL.wheelId,
    ws: STOCK_WHEEL.size,
    rh: 0,
    ts: 0,
    mo: 0,
    cbl: 0,
    cb: 0,
    po: 0,
    poc: 0,
    led: "",
    le: 0,
    lea: 999,
    les: 0,
    lec: 999,
    let: 0,
    eo: 0,
    dt: 0,
    np: 0,
    ct: 0,
    et: 0,
    tt: 0,
    sw: 0,
    st: 0,
    y: "",
  });

  return `<c ${attributes}>${renderWheelOptions()}${renderPaintSwatches()}</c>`;
}

export function starterShowroomCatalog() {
  return {
    defaultCatalogCarId: DEFAULT_STARTER_CATALOG_CAR_ID,
    stockWheel: { ...STOCK_WHEEL },
    cars: STARTER_CARS.map((car) => ({ ...car })),
    paintSwatches: PAINT_SWATCHES.map((color, index) => ({
      id: index + 1,
      color,
    })),
  };
}

export function buildStarterShowroomXml() {
  const attributes = renderAttributes({
    i: 0,
    dc: DEFAULT_STARTER_CATALOG_CAR_ID,
    l: STARTER_LOCATION_ID,
  });
  const cars = STARTER_CARS.map(renderStarterCar).join("");

  return `<cars ${attributes}>${cars}</cars>`;
}
