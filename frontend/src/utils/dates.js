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

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "2026-11-21" -> "21 nov"
export function formatDayMonth(isoDate) {
  if (!isoDate) return "";
  const fecha = parseYMD(isoDate);
  return `${fecha.getDate()} ${MESES_CORTOS[fecha.getMonth()]}`;
}

// "3 al 12 nov", "28 nov al 3 dic" o "28 dic 2026 al 3 ene 2027"
export function formatDateRangeShort(inicio, fin) {
  if (!inicio || !fin) return "";
  const desde = parseYMD(inicio);
  const hasta = parseYMD(fin);
  const mesFin = MESES_CORTOS[hasta.getMonth()];
  if (desde.getFullYear() !== hasta.getFullYear()) {
    const mesInicio = MESES_CORTOS[desde.getMonth()];
    return `${desde.getDate()} ${mesInicio} ${desde.getFullYear()} al ${hasta.getDate()} ${mesFin} ${hasta.getFullYear()}`;
  }
  if (desde.getMonth() !== hasta.getMonth()) {
    return `${desde.getDate()} ${MESES_CORTOS[desde.getMonth()]} al ${hasta.getDate()} ${mesFin}`;
  }
  return `${desde.getDate()} al ${hasta.getDate()} ${mesFin}`;
}

export function getTodayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}