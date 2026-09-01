import { fireEvent, render } from "@testing-library/react-native";

import TripCard from "../components/home/TripCard";

function buildTrip(overrides = {}) {
  return {
    title: "Verano en Bariloche",
    destination: "Bariloche, Argentina",
    dateLabel: "12 - 20 ene",
    status: "activo",
    ...overrides,
  };
}

describe("TripCard", () => {
  it("muestra título, destino y fecha del viaje", async () => {
    const { getByText } = await render(<TripCard trip={buildTrip()} onPress={jest.fn()} />);

    expect(getByText("Verano en Bariloche")).toBeTruthy();
    expect(getByText("Bariloche, Argentina")).toBeTruthy();
    expect(getByText("12 - 20 ene")).toBeTruthy();
  });

  it("traduce el status conocido a su label en español", async () => {
    const { getByText } = await render(
      <TripCard trip={buildTrip({ status: "activo" })} onPress={jest.fn()} />
    );

    expect(getByText("Planificando")).toBeTruthy();
  });

  it("usa statusLabel o 'Planificando' como fallback si el status no es conocido", async () => {
    const { getByText } = await render(
      <TripCard trip={buildTrip({ status: "raro", statusLabel: undefined })} onPress={jest.fn()} />
    );

    expect(getByText("Planificando")).toBeTruthy();
  });

  it("llama a onPress al tocar la card", async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await render(<TripCard trip={buildTrip()} onPress={onPress} />);

    fireEvent.press(getByLabelText("Ver detalle de Verano en Bariloche"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("no muestra la sección de presupuesto si el viaje no tiene datos de presupuesto", async () => {
    const { queryByText } = await render(<TripCard trip={buildTrip()} onPress={jest.fn()} />);

    expect(queryByText("Presupuesto")).toBeNull();
  });

  it("muestra el presupuesto y el porcentaje usado cuando hay datos", async () => {
    const trip = buildTrip({ budgetLabel: "$150.000 ARS", budgetProgress: 42 });
    const { getByText } = await render(<TripCard trip={trip} onPress={jest.fn()} />);

    expect(getByText("Presupuesto")).toBeTruthy();
    expect(getByText("$150.000 ARS · 42% usado")).toBeTruthy();
  });

  it("recorta el porcentaje de progreso a 100 si viene por encima", async () => {
    const trip = buildTrip({ budgetLabel: "$1 ARS", budgetProgress: 250 });
    const { getByText } = await render(<TripCard trip={trip} onPress={jest.fn()} />);

    expect(getByText("$1 ARS · 100% usado")).toBeTruthy();
  });

  it("recorta el porcentaje de progreso a 0 si viene negativo", async () => {
    const trip = buildTrip({ budgetLabel: "$1 ARS", budgetProgress: -30 });
    const { getByText } = await render(<TripCard trip={trip} onPress={jest.fn()} />);

    expect(getByText("$1 ARS · 0% usado")).toBeTruthy();
  });
});