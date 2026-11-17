export function formatMoney(amount, currency) {
  const numeric = Number(amount ?? 0);
  if (Number.isNaN(numeric)) {
    return `${currency || "ARS"} 0,00`;
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency || "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric);
}

// Igual que formatMoney, pero el símbolo no se separa del número al saltar de
// renglón ("$ 30.400" nunca queda como "$" / "30.400").
export function formatMoneyNoBreak(amount, currency) {
  return formatMoney(amount, currency).replace(/\s/g, "\u00a0");
}

// Monto abreviado para cuando el completo no entra en una línea: "$ 12,3 M", "$ 950 mil".
export function formatMoneyCompacto(amount, currency) {
  const numeric = Number(amount ?? 0);
  if (Number.isNaN(numeric)) return formatMoney(0, currency);

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency || "ARS",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numeric);
}

export function formatSignedMoney(amount, currency) {
  const numeric = Number(amount ?? 0);
  if (!numeric) return formatMoney(0, currency);
  const sign = numeric > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(numeric), currency)}`;
}