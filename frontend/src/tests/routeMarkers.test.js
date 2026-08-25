import { buildRouteMarkers } from "../utils/routeMarkers";

describe("US 62 - buildRouteMarkers", () => {
  const actividadA = {
    id: 1,
    title: "Museo A",
    lugarInteres: { lat: -31.4, lng: -64.2, address: "Calle A 123" },
  };
  const actividadB = {
    id: 2,
    title: "Museo B",
    lugarInteres: { lat: -31.42, lng: -64.18, address: "Calle B 456" },
  };
  const actividadSinUbicacion = { id: 3, title: "Actividad sin ubicación" };

  it("devuelve un array vacío si no hay ruta generada", () => {
    expect(buildRouteMarkers([actividadA, actividadB], null)).toEqual([]);
  });

  it("devuelve un array vacío si la ruta no tiene actividades ordenadas", () => {
    const ruta = { idsActividadesOrdenadas: [] };
    expect(buildRouteMarkers([actividadA, actividadB], ruta)).toEqual([]);
  });

  it("arma los markers respetando el orden de la ruta", () => {
    const ruta = { idsActividadesOrdenadas: [2, 1] };

    const markers = buildRouteMarkers([actividadA, actividadB], ruta);

    expect(markers.map((m) => m.id)).toEqual([2, 1]);
    expect(markers[0]).toMatchObject({
      id: 2,
      kind: "routeStop",
      name: "Museo B",
      lat: -31.42,
      lng: -64.18,
    });
  });

  it("excluye actividades sin ubicación cargada, aunque figuren en la ruta", () => {
    const ruta = { idsActividadesOrdenadas: [1, 3, 2] };

    const markers = buildRouteMarkers(
      [actividadA, actividadSinUbicacion, actividadB],
      ruta
    );

    expect(markers.map((m) => m.id)).toEqual([1, 2]);
  });
});