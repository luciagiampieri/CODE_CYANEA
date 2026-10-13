import React from "react";
import { render } from "@testing-library/react-native";

import DayAgenda from "../components/trip/DayAgenda";

describe("DayAgenda - advertencia de horario marcada en el itinerario", () => {
  const base = { id: 1, title: "Museo", horaInicio: "10:00", horaFin: "12:00", time: "10:00 - 12:00" };

  it("muestra la advertencia aceptada debajo de la actividad", async () => {
    const utils = await render(
      <DayAgenda
        fecha="2030-12-07"
        actividades={[
          { ...base, tipoAdvertenciaHorario: "cerrado_dia", advertenciaHorario: "Cerrado el lunes 07/12" },
        ]}
      />
    );

    expect(utils.getByTestId("agenda-schedule-warning-1")).toBeTruthy();
    expect(utils.getByText("Cerrado el lunes 07/12")).toBeTruthy();
  });

  it("no muestra nada si la actividad no tiene advertencia", async () => {
    const utils = await render(<DayAgenda fecha="2030-12-07" actividades={[base]} />);

    expect(utils.queryByTestId("agenda-schedule-warning-1")).toBeNull();
  });
});
