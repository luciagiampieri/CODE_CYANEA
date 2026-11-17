/**
 * public/index.html es la plantilla de la web (Expo la usa en `npm run web` y en
 * `expo export -p web`). La meta viewport pide interactive-widget=resizes-content para que
 * Chrome de Android achique la página con el teclado; Safari la ignora.
 */
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "..", "public", "index.html"), "utf8");

describe("public/index.html", () => {
  it("la meta viewport achica la página con el teclado en Chrome de Android", () => {
    const meta = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/);
    expect(meta).not.toBeNull();
    const opciones = meta[1].split(",").map((opcion) => opcion.trim());
    expect(opciones).toEqual(
      expect.arrayContaining(["width=device-width", "initial-scale=1", "interactive-widget=resizes-content"])
    );
  });

  it("conserva lo que Expo necesita de su plantilla", () => {
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain("%WEB_TITLE%");
    expect(html).toContain("%LANG_ISO_CODE%");
    expect(html).toContain('<style id="expo-reset">');
  });
});
