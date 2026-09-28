
import { getRouteHint } from "../utils/routeMessages";

describe("getRouteHint", () => {
  it("no muestra mensaje si el día ya tiene ruta", () => {
    expect(getRouteHint({ hasRoute: true, activitiesWithLocation: 3, canEdit: true })).toBeNull();
  });

  it("invita a generar la ruta cuando ya hay actividades suficientes", () => {
    expect(getRouteHint({ hasRoute: false, activitiesWithLocation: 2, canEdit: true })).toBe(
      "Todavía no hay recorrido para este día. Elegí cómo se van a mover y generalo para verlo en el mapa."
    );
  });

  it("indica que falta una sola actividad con ubicación", () => {
    expect(getRouteHint({ hasRoute: false, activitiesWithLocation: 1, canEdit: true })).toBe(
      "Todavía no hay recorrido para este día. Agregá 1 actividad más con ubicación para poder generarlo."
    );
  });

  it("pide al menos 2 actividades con ubicación si no hay ninguna", () => {
    expect(getRouteHint({ hasRoute: false, activitiesWithLocation: 0, canEdit: true })).toBe(
      "Todavía no hay recorrido para este día. Agregá al menos 2 actividades con ubicación para poder generarlo."
    );
  });

  it("en solo lectura no da instrucciones que el usuario no puede cumplir", () => {
    for (const cantidad of [0, 1, 2]) {
      expect(
        getRouteHint({ hasRoute: false, activitiesWithLocation: cantidad, canEdit: false })
      ).toBe("Todavía no hay un recorrido generado para este día.");
    }
  });
});