export const POINTS_PER_MONEY_UNIT = 0.0250;

export function moneyToPointPrice(moneyPrice) {
  const normalizedMoneyPrice = Number(moneyPrice || 0);

  if (!Number.isFinite(normalizedMoneyPrice) || normalizedMoneyPrice <= 0) {
    return 0;
  }

  return Math.round(normalizedMoneyPrice * POINTS_PER_MONEY_UNIT);
}
