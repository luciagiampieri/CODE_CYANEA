import { contieneTexto, normalizarTexto, partesResaltadas } from "../utils/textoBusqueda";

describe("normalizarTexto", () => {
  it("minúsculas, sin tildes y sin espacios alrededor", () => {
    expect(normalizarTexto("  Café GIJÓN ")).toBe("cafe gijon");
    expect(normalizarTexto(null)).toBe("");
  });
});

describe("contieneTexto", () => {
  it("compara sin mayúsculas ni tildes", () => {
    expect(contieneTexto("Museo del Prado", "PRADO")).toBe(true);
    expect(contieneTexto("Café Gijón", "gijon")).toBe(true);
    expect(contieneTexto("Café Gijón", "gijón")).toBe(true);
    expect(contieneTexto("Café Gijón", "retiro")).toBe(false);
    expect(contieneTexto("Café Gijón", "")).toBe(false);
  });
});

describe("partesResaltadas", () => {
  it("marca la coincidencia respetando el texto original con tildes", () => {
    expect(partesResaltadas("Café Gijón", "gijon")).toEqual([
      { texto: "Café ", resaltado: false },
      { texto: "Gijón", resaltado: true },
    ]);
    expect(partesResaltadas("Café Gijón", "FE G")).toEqual([
      { texto: "Ca", resaltado: false },
      { texto: "fé G", resaltado: true },
      { texto: "ijón", resaltado: false },
    ]);
  });

  it("sin coincidencia o sin búsqueda devuelve el texto entero sin resaltar", () => {
    expect(partesResaltadas("Museo", "zzz")).toEqual([{ texto: "Museo", resaltado: false }]);
    expect(partesResaltadas("Museo", "")).toEqual([{ texto: "Museo", resaltado: false }]);
  });
});
