import {
  buildWebPinIcon,
  buildWebPinSvg,
  resolveMarkerAppearance,
} from "../components/map/markerAppearance";
import { colors } from "../theme/tokens";

const maps = {
  Size: class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
  },
  Point: class {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  },
};

const PREFIJO_URL = "data:image/svg+xml;charset=UTF-8,";

describe("resolveMarkerAppearance", () => {
  it("los destinos del viaje usan bandera y el color de acento", () => {
    expect(resolveMarkerAppearance({ kind: "tripDestination" })).toEqual({
      fill: colors.accentStrong,
      border: colors.primary,
      content: colors.primary,
      icon: "flag",
      glyph: "flag",
      label: null,
    });
  });

  it.each([
    [{ kind: "savedPlace" }, "bookmark", "bookmark"],
    [{ kind: "savedPlace", scheduledDays: [] }, "bookmark", "bookmark"],
    [{ kind: "savedPlace", scheduledDays: [3] }, "calendar-check", "check"],
  ])("un lugar guardado %p usa ícono %p y glifo %p", (marker, icon, glyph) => {
    const look = resolveMarkerAppearance(marker);

    expect(look.fill).toBe(colors.primary);
    expect(look.icon).toBe(icon);
    expect(look.glyph).toBe(glyph);
  });

  it.each([
    [{ kind: "routeStop", pinLabel: "3" }, "3"],
    [{ kind: "routeStop" }, null],
  ])("una parada de recorrido %p muestra la etiqueta %p", (marker, label) => {
    const look = resolveMarkerAppearance(marker);

    expect(look.fill).toBe(colors.primarySoft);
    expect(look.label).toBe(label);
  });

  it.each([
    [undefined, "location-dot", null],
    [{ kind: "otro" }, "location-dot", null],
    [{ pinIcon: "star", pinLabel: "1" }, "star", "1"],
  ])("el pin por defecto con %p usa ícono %p y etiqueta %p", (marker, icon, label) => {
    const look = resolveMarkerAppearance(marker);

    expect(look.fill).toBe(colors.surface);
    expect(look.icon).toBe(icon);
    expect(look.label).toBe(label);
  });
});

describe("buildWebPinSvg", () => {
  it("dibuja el pin con el borde normal", () => {
    const svg = buildWebPinSvg({ kind: "tripDestination" });

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain(`stroke="${colors.primary}"`);
  });

  it("resalta el pin con borde más grueso y color de acento", () => {
    const svg = buildWebPinSvg({ kind: "savedPlace" }, { highlighted: true });

    expect(svg).toContain('stroke-width="3"');
    expect(svg).toContain(`stroke="${colors.accentStrong}"`);
  });

  it.each([
    [{ kind: "tripDestination" }, "M8 4.5h1.8v15H8z"],
    [{ kind: "savedPlace" }, "M7.5 5h9v14"],
    [{ kind: "savedPlace", scheduledDays: [1] }, 'stroke-linecap="round"'],
    [{ kind: "routeStop" }, "<circle"],
  ])("con %p dibuja el glifo correspondiente", (marker, fragmento) => {
    expect(buildWebPinSvg(marker)).toContain(fragmento);
  });

  it.each([
    ["1", 'font-size="13"'],
    ["10", 'font-size="11.5"'],
  ])("con la etiqueta %p usa %p", (pinLabel, tamano) => {
    const svg = buildWebPinSvg({ kind: "routeStop", pinLabel });

    expect(svg).toContain("<text");
    expect(svg).toContain(`>${pinLabel}</text>`);
    expect(svg).toContain(tamano);
  });

  it("escapa los caracteres especiales de la etiqueta", () => {
    const svg = buildWebPinSvg({ kind: "routeStop", pinLabel: `<&>"'` });

    expect(svg).toContain("&#60;&#38;&#62;&#34;&#39;");
    expect(svg).not.toContain(`<&>`);
  });
});

describe("buildWebPinIcon", () => {
  it("arma el ícono con el SVG codificado y la punta en la coordenada", () => {
    const marker = { kind: "tripDestination" };

    const icono = buildWebPinIcon(maps, marker);

    expect(icono.url.startsWith(PREFIJO_URL)).toBe(true);
    expect(decodeURIComponent(icono.url.slice(PREFIJO_URL.length))).toBe(buildWebPinSvg(marker));
    expect(icono.scaledSize).toEqual({ width: 34, height: 44 });
    expect(icono.anchor).toEqual({ x: 17, y: 41 });
  });

  it("agranda el ícono resaltado", () => {
    const icono = buildWebPinIcon(maps, { kind: "savedPlace" }, { highlighted: true });

    expect(icono.scaledSize).toEqual({ width: 44, height: 57 });
    expect(icono.anchor.x).toBe(22);
    expect(icono.anchor.y).toBeCloseTo(53.1);
  });
});