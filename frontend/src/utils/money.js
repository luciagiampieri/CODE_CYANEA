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

export function formatSignedMoney(amount, currency) {
  const numeric = Number(amount ?? 0);
  if (!numeric) return formatMoney(0, currency);
  const sign = numeric > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(numeric), currency)}`;
}