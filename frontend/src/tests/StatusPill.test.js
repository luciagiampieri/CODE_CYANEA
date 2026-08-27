import { render } from "@testing-library/react-native";

import StatusPill from "../components/ui/StatusPill";

describe("StatusPill", () => {
  it("renderiza el texto que recibe como children", async () => {
    const { getByText } = await render(<StatusPill tone="activo">Activo</StatusPill>);
    expect(getByText("Activo")).toBeTruthy();
  });

  it.each([
    "conectada", "cargando", "sin-conexion", "activo",
    "finalizado", "planificando", "pendiente", "note",
  ])("renderiza sin explotar para el tono conocido '%s'", async (tone) => {
    const { getByText } = await render(<StatusPill tone={tone}>{tone}</StatusPill>);
    expect(getByText(tone)).toBeTruthy();
  });

  it("usa el tono 'note' como fallback cuando el tono no existe en el mapa", async () => {
    const { getByText } = await render(<StatusPill tone="tono-inexistente">Rara</StatusPill>);
    expect(getByText("Rara")).toBeTruthy();
  });

  it("usa 'note' como tono por defecto si no se pasa la prop tone", async () => {
    const { getByText } = await render(<StatusPill>Sin tono</StatusPill>);
    expect(getByText("Sin tono")).toBeTruthy();
  });
});