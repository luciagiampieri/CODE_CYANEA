export function toYMD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// "YYYY-MM-DD" -> Date en hora local. Con hour = 0 queda a medianoche
// (útil como minDate/maxDate para que el propio día límite siga siendo seleccionable).
export function parseYMD(ymd, hour = 12) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

// react-native-calendar-picker puede devolver un Date o un objeto tipo moment según la versión.
export function toJsDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  return value instanceof Date ? value : new Date(value);
}

export function formatDateDisplay(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function getTodayIso() {
  return toYMD(new Date());
}