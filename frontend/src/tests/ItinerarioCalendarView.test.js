import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import ItinerarioCalendarView from "../components/trip/ItinerarioCalendarView";

jest.mock("../hooks/useResponsive", () => ({
  __esModule: true,
  default: () => ({ width: 1200 }),
}));

jest.mock("../components/map/MapCanvas", () => {
  const ReactActual = require("react");
  const { Text } = require("react-native");

  return function MockMapCanvas() {
    return ReactActual.createElement(Text, null, "Mapa renderizado");
  };
});

describe("HU 23 - ItinerarioCalendarView", () => {
  const baseDay = {
    dayId: 2,
    dayIndex: 2,
    dayDateText: "20/07/2026",
    dayDateTextCorta: "20 Jul",
  };

  const actividadA = {
    id: 3,
    title: "Fuente de Aguas Danzantes",
    time: "19:00",
    icon: "location-dot",
    idLugarInteres: 4,
    lugarInteres: {
      lat: -31.4235,
      lng: -64.1865,
      address: "San Lorenzo 47",
    },
  };

  const actividadB = {
    id: 4,
    title: "Observatorio",
    time: "20:00",
    icon: "camera",
    idLugarInteres: 5,
    lugarInteres: {
      lat: -31.42,
      lng: -64.1987,
      address: "Laprida 854",
    },
  };

  it("muestra un mensaje informativo cuando no hay ruta generada pero ya puede generarse", async () => {
    const { getByText, queryByText } = await render(
      <ItinerarioCalendarView
        dias={[
          {
            ...baseDay,
            actividades: [actividadA, actividadB],
            ruta: null,
          },
        ]}
      />
    );

    expect(
      getByText(
        "Todavia no hay una ruta generada para este dia. Generala para visualizar el recorrido en el mapa."
      )
    ).toBeTruthy();
    expect(getByText("Generar ruta")).toBeTruthy();
    expect(queryByText("Ver mapa")).toBeNull();
  });

  it("muestra un mensaje informativo cuando no hay ruta y faltan actividades con ubicacion", async () => {
    const { getByText, queryByText } = await render(
      <ItinerarioCalendarView
        dias={[
          {
            ...baseDay,
            actividades: [actividadA, { id: 7, title: "Cena", time: "22:00" }],
            ruta: null,
          },
        ]}
      />
    );

    expect(
      getByText(
        "Todavia no hay una ruta generada para este dia. Agrega 2 o mas actividades con ubicacion para poder visualizar el recorrido en el mapa."
      )
    ).toBeTruthy();
    expect(queryByText("Generar ruta")).toBeNull();
    expect(queryByText("Ver mapa")).toBeNull();
  });

  it("permite visualizar el mapa cuando la ruta ya existe", async () => {
    const { getByText, queryByText } = await render(
      <ItinerarioCalendarView
        dias={[
          {
            ...baseDay,
            actividades: [actividadA, actividadB],
            ruta: {
              modo: "walking",
              distanciaMetros: 1420,
              duracionSegundos: 1234,
              polilineaCodificada: "abc123",
              idsActividadesOrdenadas: [3, 4],
            },
          },
        ]}
      />
    );

    fireEvent.press(getByText("Ver mapa"));

    await waitFor(() => {
      expect(getByText("Mapa renderizado")).toBeTruthy();
    });
    expect(
      queryByText(
        "Todavia no hay una ruta generada para este dia. Generala para visualizar el recorrido en el mapa."
      )
    ).toBeNull();
  });
});
