
export function buildRouteMarkers(actividades, ruta) {
    if (!ruta?.idsActividadesOrdenadas?.length) return [];

    const actividadesPorId = new Map((actividades ?? []).map((actividad) => [actividad.id, actividad]));

    return ruta.idsActividadesOrdenadas
        .map((id) => actividadesPorId.get(id))
        .filter((actividad) => actividad?.lugarInteres?.lat != null && actividad?.lugarInteres?.lng != null)
        .map((actividad) => ({
            id: actividad.id,
            kind: "routeStop",
            name: actividad.title,
            address: actividad.lugarInteres?.address ?? "",
            lat: actividad.lugarInteres.lat,
            lng: actividad.lugarInteres.lng,
        }));
}