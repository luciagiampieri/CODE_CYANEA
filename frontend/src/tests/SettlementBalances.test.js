import { fireEvent, render } from "@testing-library/react-native";

import SettlementBalances from "../components/trip/SettlementBalances";

const balances = [
  { IdParticipanteViaje: 1, IdUsuario: 11, NombreCompleto: "Ana Gómez", TotalPagado: 0, GastoIndividual: 0, BalancePendiente: 0 },
  { IdParticipanteViaje: 2, IdUsuario: 22, NombreCompleto: "Daniela Fernández", TotalPagado: 1100, GastoIndividual: 1000, BalancePendiente: 100 },
  { IdParticipanteViaje: 3, IdUsuario: 33, NombreCompleto: "Lucia Giampieri", TotalPagado: 0, GastoIndividual: 100, BalancePendiente: -100 },
  { IdParticipanteViaje: 4, IdUsuario: 44, NombreCompleto: "Martín López", TotalPagado: 0, GastoIndividual: 40, BalancePendiente: -40 },
];

describe("SettlementBalances", () => {
  it("arriba muestra tu saldo con una explicación simple", async () => {
    const { getAllByTestId, getByTestId } = await render(
      <SettlementBalances balances={balances} currency="ARS" currentUserId={33} />
    );

    expect(getAllByTestId(/^balance-\d+$/)[0].props.testID).toBe("balance-3");
    expect(getByTestId("balance-mine-value")).toHaveTextContent(/Debés .*100/);
    expect(getByTestId("balance-mine-explain")).toHaveTextContent(/Pagaste .*0 y tu parte es .*100\./);
  });

  it("si ya hubo transferencias, lo aclara", async () => {
    const conTransferencia = balances.map((b) =>
      b.IdUsuario === 33 ? { ...b, BalancePendiente: 0 } : b
    );
    const { getByTestId } = await render(
      <SettlementBalances balances={conTransferencia} currency="ARS" currentUserId={33} />
    );

    expect(getByTestId("balance-mine-value")).toHaveTextContent("Estás al día");
    expect(getByTestId("balance-mine-explain")).toHaveTextContent(/Ya contamos las transferencias/);
  });

  it("'Ver de dónde sale' abre el desglose", async () => {
    const onShowBreakdown = jest.fn();
    const { getByTestId } = await render(
      <SettlementBalances balances={balances} currency="ARS" currentUserId={33} onShowBreakdown={onShowBreakdown} />
    );

    await fireEvent.press(getByTestId("balance-breakdown-open"));
    expect(onShowBreakdown).toHaveBeenCalled();
  });

  it("el grupo va ordenado: a quién le deben, quién debe y quién está al día", async () => {
    const { getAllByTestId, getByTestId } = await render(
      <SettlementBalances balances={balances} currency="ARS" currentUserId={33} />
    );

    const grupo = getAllByTestId(/^balance-\d+$/).slice(1).map((fila) => fila.props.testID);
    expect(grupo).toEqual(["balance-2", "balance-4", "balance-1"]);
    expect(getByTestId("balance-2")).toHaveTextContent(/le deben/);
    expect(getByTestId("balance-4")).toHaveTextContent(/debe/);
    expect(getByTestId("balance-1")).toHaveTextContent(/al día/);
    expect(getByTestId("balance-2")).toHaveTextContent(/Pagó .*1\.100, su parte .*1\.000/);
  });

  it("muestra un mensaje si todavía no hay saldos", async () => {
    const { getByText } = await render(<SettlementBalances balances={[]} currency="ARS" />);

    expect(getByText(/Todavía no hay participantes aceptados/)).toBeTruthy();
  });
});