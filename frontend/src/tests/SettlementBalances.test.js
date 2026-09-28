import { render } from "@testing-library/react-native";

import SettlementBalances from "../components/trip/SettlementBalances";

const balances = [
  { IdParticipanteViaje: 1, IdUsuario: 11, NombreCompleto: "Ana", TotalPagado: 0, GastoIndividual: 0, BalancePendiente: 0 },
  { IdParticipanteViaje: 2, IdUsuario: 22, NombreCompleto: "Daniela", TotalPagado: 1100, GastoIndividual: 1000, BalancePendiente: 100 },
  { IdParticipanteViaje: 3, IdUsuario: 33, NombreCompleto: "Lucia", TotalPagado: 0, GastoIndividual: 100, BalancePendiente: -100 },
];

describe("SettlementBalances", () => {
  it("pone primero al usuario actual y lo marca con (vos)", async () => {
    const { getAllByTestId, getByText } = await render(
      <SettlementBalances balances={balances} currency="ARS" currentUserId={33} />
    );

    expect(getAllByTestId(/^balance-/)[0].props.testID).toBe("balance-3");
    expect(getByText(" (vos)")).toBeTruthy();
  });

  it("muestra el monto con signo según deba o le deban, y 'Al día' si es cero", async () => {
    const { getByText } = await render(
      <SettlementBalances balances={balances} currency="ARS" currentUserId={33} />
    );

    expect(getByText(/^\+/)).toBeTruthy();
    expect(getByText(/^−/)).toBeTruthy();
    expect(getByText("Al día")).toBeTruthy();
  });

  it("muestra un mensaje si todavía no hay saldos", async () => {
    const { getByText } = await render(<SettlementBalances balances={[]} currency="ARS" />);

    expect(getByText(/Todavía no hay participantes aceptados/)).toBeTruthy();
  });
});