const LICENSE_PLATES = [
  { id: 1, name: "Toreno Plate", region: "us", moneyPrice: 0, pointPrice: 0, vanityMoneyPrice: 500, vanityPointPrice: 500, minLocationId: 100, streetCredit: 0, memberOnly: 0 },
  { id: 2, name: "Newburge Plate", region: "us", moneyPrice: 1000, pointPrice: 10, vanityMoneyPrice: 500, vanityPointPrice: 500, minLocationId: 200, streetCredit: 0, memberOnly: 0 },
  { id: 3, name: "Creek Side Plate", region: "us", moneyPrice: 2500, pointPrice: 25, vanityMoneyPrice: 1000, vanityPointPrice: 1000, minLocationId: 300, streetCredit: 0, memberOnly: 0 },
  { id: 4, name: "Vista Heights Plate", region: "us", moneyPrice: 5000, pointPrice: 50, vanityMoneyPrice: 2000, vanityPointPrice: 2000, minLocationId: 400, streetCredit: 0, memberOnly: 0 },
  { id: 5, name: "Japan Plate 1", region: "japan", moneyPrice: 7500, pointPrice: 75, vanityMoneyPrice: 3000, vanityPointPrice: 3000, minLocationId: 400, streetCredit: 0, memberOnly: 0 },
  { id: 6, name: "Japan Plate 2", region: "japan", moneyPrice: 10000, pointPrice: 100, vanityMoneyPrice: 3000, vanityPointPrice: 3000, minLocationId: 500, streetCredit: 0, memberOnly: 0 },
  { id: 7, name: "Japan Plate 3", region: "japan", moneyPrice: 10000, pointPrice: 100, vanityMoneyPrice: 3000, vanityPointPrice: 3000, minLocationId: 500, streetCredit: 0, memberOnly: 0 },
  { id: 8, name: "Euro Plate 1", region: "euro", moneyPrice: 10000, pointPrice: 100, vanityMoneyPrice: 3000, vanityPointPrice: 3000, minLocationId: 500, streetCredit: 0, memberOnly: 0 },
  { id: 9, name: "Euro Plate 2", region: "euro", moneyPrice: 10000, pointPrice: 100, vanityMoneyPrice: 3000, vanityPointPrice: 3000, minLocationId: 500, streetCredit: 0, memberOnly: 0 },
  { id: 10, name: "Euro Plate 3", region: "euro", moneyPrice: 10000, pointPrice: 100, vanityMoneyPrice: 3000, vanityPointPrice: 3000, minLocationId: 500, streetCredit: 0, memberOnly: 1 },
  { id: 11, name: "Diamond Point Plate", region: "us", moneyPrice: 10000, pointPrice: 100, vanityMoneyPrice: 3000, vanityPointPrice: 3000, minLocationId: 500, streetCredit: 0, memberOnly: 0 },
  { id: 12, name: "Special Plate", region: "us", moneyPrice: 10000, pointPrice: 100, vanityMoneyPrice: 3000, vanityPointPrice: 3000, minLocationId: 500, streetCredit: 0, memberOnly: 1 },
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
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}='${escapeXmlAttribute(value)}'`)
    .join(" ");
}

function renderNode(name, attributes = {}) {
  const renderedAttributes = renderAttributes(attributes);
  return renderedAttributes ? `<${name} ${renderedAttributes}/>` : `<${name}/>`;
}

export function getLicensePlate(plateId) {
  return LICENSE_PLATES.find((plate) => Number(plate.id) === Number(plateId)) || null;
}

export function buildLicensePlatesXml() {
  const plates = LICENSE_PLATES.map((plate) => renderNode("p", {
    i: plate.id,
    d: plate.name,
    c: plate.region,
    m: plate.moneyPrice,
    p: plate.pointPrice,
    vm: plate.vanityMoneyPrice,
    vp: plate.vanityPointPrice,
    ml: plate.minLocationId,
    ms: plate.streetCredit,
    mc: plate.memberOnly,
  })).join("");

  return `<n id='getlicenseplates'>${plates}</n>`;
}

export function samplePlateNumber(plateId) {
  const id = Number(plateId || 0);

  if (id >= 5 && id <= 7) {
    return "00_00_00";
  }
  if (id === 8) {
    return "00_00_000";
  }
  if (id === 9) {
    return "00_000_00";
  }
  if (id === 10) {
    return "000_00_00";
  }
  if (id === 12) {
    return "0000000";
  }
  return "0000000";
}

export function normalizePlateNumber(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function licensePriceForPayment(plate, paymentType, { vanity = false } = {}) {
  const paysWithPoints = String(paymentType || "").toLowerCase() === "p";
  if (vanity) {
    return paysWithPoints ? Number(plate?.vanityPointPrice || 0) : Number(plate?.vanityMoneyPrice || 0);
  }

  return paysWithPoints ? Number(plate?.pointPrice || 0) : Number(plate?.moneyPrice || 0);
}
