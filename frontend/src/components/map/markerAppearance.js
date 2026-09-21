import { colors } from "../../theme/tokens";

/**
 * Un solo lugar que define cómo se ve cada pin, para que mobile y web coincidan.
 *
 * Campos opcionales que puede traer un marker:
 * - pinLabel: texto corto dentro del pin (p. ej. el puesto en los imperdibles).
 * - pinIcon: ícono de FontAwesome6 (solo mobile; en web se usa el glifo genérico).
 */
export function resolveMarkerAppearance(marker) {
  switch (marker?.kind) {
    case "tripDestination":
      return {
        fill: colors.accentStrong,
        border: colors.primary,
        content: colors.primary,
        icon: "flag",
        glyph: "flag",
        label: null,
      };
    case "savedPlace": {
      const scheduled = (marker.scheduledDays || []).length > 0;
      return {
        fill: colors.primary,
        border: colors.surface,
        content: colors.textInverse,
        icon: scheduled ? "calendar-check" : "bookmark",
        glyph: scheduled ? "check" : "bookmark",
        label: null,
      };
    }
    case "routeStop":
      return {
        fill: colors.primarySoft,
        border: colors.surface,
        content: colors.textInverse,
        icon: "location-dot",
        glyph: "dot",
        label: marker.pinLabel ?? null,
      };
    default:
      return {
        fill: colors.surface,
        border: colors.primary,
        content: colors.primary,
        icon: marker?.pinIcon ?? "location-dot",
        glyph: "dot",
        label: marker?.pinLabel ?? null,
      };
  }
}

// --- Web: los pines se dibujan como SVG ---------------------------------------

const PIN_WIDTH = 34;
const PIN_HEIGHT = 44;

// Glifos simples en una caja de 24x24, centrados en el círculo del pin.
function glyphSvg(glyph, color) {
  switch (glyph) {
    case "flag":
      return `<path d="M8 4.5h1.8v15H8z" fill="${color}"/><path d="M9.8 5.5h7.4l-1.8 3.2 1.8 3.2H9.8z" fill="${color}"/>`;
    case "bookmark":
      return `<path d="M7.5 5h9v14l-4.5-3.3L7.5 19z" fill="${color}"/>`;
    case "check":
      return `<path d="M7 12.3l3.3 3.3L17 8.8" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    default:
      return `<circle cx="12" cy="12" r="3.6" fill="${color}"/>`;
  }
}

function escapeXml(text) {
  return String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function buildWebPinSvg(marker, { highlighted = false } = {}) {
  const look = resolveMarkerAppearance(marker);
  const border = highlighted ? colors.accentStrong : look.border;
  const borderWidth = highlighted ? 3 : 2;
  const inner = look.label
    ? `<text x="17" y="20.5" text-anchor="middle" font-family="Montserrat, Segoe UI, Arial, sans-serif" font-size="${
        String(look.label).length > 1 ? 11.5 : 13
      }" font-weight="700" fill="${look.content}">${escapeXml(look.label)}</text>`
    : `<g transform="translate(5 4)">${glyphSvg(look.glyph, look.content)}</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 ${PIN_WIDTH} ${PIN_HEIGHT}">
  <ellipse cx="17" cy="42" rx="5" ry="1.8" fill="rgba(16,41,85,0.28)"/>
  <path d="M17 1.5C8.4 1.5 1.5 8.3 1.5 16.6c0 5.6 3.4 10.9 12.9 22.9a3.3 3.3 0 0 0 5.2 0C29.1 27.5 32.5 22.2 32.5 16.6 32.5 8.3 25.6 1.5 17 1.5z" fill="${look.fill}" stroke="${border}" stroke-width="${borderWidth}"/>
  ${inner}
</svg>`;
}

export function buildWebPinIcon(maps, marker, { highlighted = false } = {}) {
  const scale = highlighted ? 1.3 : 1;
  const width = Math.round(PIN_WIDTH * scale);
  const height = Math.round(PIN_HEIGHT * scale);
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(buildWebPinSvg(marker, { highlighted }))}`,
    scaledSize: new maps.Size(width, height),
    // La punta del pin toca la coordenada exacta.
    anchor: new maps.Point(width / 2, height - 3 * scale),
  };
}
