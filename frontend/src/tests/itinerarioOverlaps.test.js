import {
  minutosDesdeMedianoche,
  calcularActividadesSolapadas,
} from "../utils/itinerarioOverlaps";

describe("minutosDesdeMedianoche", () => {
  it("convierte una hora HH:MM a minutos desde medianoche", () => {
    expect(minutosDesdeMedianoche("09:30")).toBe(570);
    expect(minutosDesdeMedianoche("00:00")).toBe(0);
  });

  it("devuelve null si no recibe una hora", () => {
    expect(minutosDesdeMedianoche(null)).toBeNull();
    expect(minutosDesdeMedianoche(undefined)).toBeNull();
  });

  it("devuelve null ante un formato inválido", () => {
    expect(minutosDesdeMedianoche("no-es-hora")).toBeNull();
  });
});

describe("calcularActividadesSolapadas", () => {
  it("devuelve un set vacío si no hay actividades", () => {
    expect(calcularActividadesSolapadas([])).toEqual(new Set());
  });

  it("no marca nada cuando los horarios no se solapan", () => {
    const actividades = [
      { id: 1, horaInicio: "09:00", horaFin: "10:00" },
      { id: 2, horaInicio: "10:00", horaFin: "11:00" },
    ];

    expect(calcularActividadesSolapadas(actividades)).toEqual(new Set());
  });

  it("marca ambas actividades cuando sus horarios se solapan", () => {
    const actividades = [
      { id: 1, horaInicio: "09:00", horaFin: "10:30" },
      { id: 2, horaInicio: "10:00", horaFin: "11:00" },
    ];

    expect(calcularActividadesSolapadas(actividades)).toEqual(new Set([1, 2]));
  });

  it("ignora actividades sin horario cargado al comparar", () => {
    const actividades = [
      { id: 1, horaInicio: "09:00", horaFin: "10:00" },
      { id: 2, horaInicio: null, horaFin: null },
    ];

    expect(calcularActividadesSolapadas(actividades)).toEqual(new Set());
  });

  it("detecta solapamientos múltiples entre más de dos actividades", () => {
    const actividades = [
      { id: 1, horaInicio: "09:00", horaFin: "11:00" },
      { id: 2, horaInicio: "10:00", horaFin: "10:30" },
      { id: 3, horaInicio: "12:00", horaFin: "13:00" },
    ];

    expect(calcularActividadesSolapadas(actividades)).toEqual(new Set([1, 2]));
  });
});