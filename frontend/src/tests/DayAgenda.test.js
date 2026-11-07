import React from "react";
import { StyleSheet } from "react-native";
import { render, within } from "@testing-library/react-native";

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

describe("DayAgenda - tarjetas unidas por una línea", () => {
  const actividad = (id, horaInicio, horaFin) => ({
    id,
    title: `Actividad ${id}`,
    horaInicio,
    horaFin,
    time: `${horaInicio} - ${horaFin}`,
  });

  function horaLocal(minutosDesdeAhora) {
    const fecha = new Date(Date.now() + minutosDesdeAhora * 60000);
    const hora = `${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`;
    return hora;
  }

  function hoy() {
    const fecha = new Date();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${fecha.getFullYear()}-${mes}-${dia}`;
  }

  it("une cada tarjeta con la anterior, sin línea antes de la primera", async () => {
    const utils = await render(
      <DayAgenda
        fecha="2030-12-07"
        actividades={[actividad(1, "09:00", "10:00"), actividad(2, "10:00", "11:00")]}
      />
    );

    expect(utils.queryByTestId("agenda-conector-1")).toBeNull();
    expect(utils.getByTestId("agenda-conector-2")).toBeTruthy();
    expect(utils.getAllByTestId("linea-punteada")).toHaveLength(1);
  });

  it("una sola actividad no lleva línea", async () => {
    const utils = await render(
      <DayAgenda fecha="2030-12-07" actividades={[actividad(1, "09:00", "10:00")]} />
    );

    expect(utils.queryByTestId("linea-punteada")).toBeNull();
  });

  it("el chip de horas libres va sobre la línea", async () => {
    const utils = await render(
      <DayAgenda
        fecha="2030-12-07"
        actividades={[actividad(1, "09:00", "10:00"), actividad(2, "12:00", "13:00")]}
      />
    );

    expect(within(utils.getByTestId("agenda-conector-2")).getByText("2 h libres")).toBeTruthy();
  });

  it("el chip de horas libres no lleva borde punteado", async () => {
    const utils = await render(
      <DayAgenda
        fecha="2030-12-07"
        onSuggestGap={jest.fn()}
        canEdit
        actividades={[actividad(1, "09:00", "10:00"), actividad(2, "12:00", "13:00")]}
      />
    );

    const estilo = StyleSheet.flatten(utils.getByTestId("agenda-gap-2").props.style);

    expect(estilo.borderStyle).toBeUndefined();
    expect(estilo.borderWidth).toBeUndefined();
  });

  it("la actividad en curso lleva la etiqueta y la siguiente no", async () => {
    if (new Date().getHours() < 1 || new Date().getHours() > 21) return;
    const utils = await render(
      <DayAgenda
        fecha={hoy()}
        actividades={[
          actividad(1, horaLocal(-30), horaLocal(30)),
          actividad(2, horaLocal(60), horaLocal(90)),
        ]}
      />
    );

    expect(utils.getByText("EN CURSO")).toBeTruthy();
    expect(utils.queryByText("SIGUIENTE")).toBeNull();
  });
});
