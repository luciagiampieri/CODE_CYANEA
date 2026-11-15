import { fireEvent, render } from "@testing-library/react-native";

import SettlementBalances from "../components/trip/SettlementBalances";

const balances = [
  { IdParticipanteViaje: 1, IdUsuario: 11, NombreCompleto: "Ana Gómez", TotalPagado: 0, GastoIndividual: 0, BalancePendiente: 0 },
  { IdParticipanteViaje: 2, IdUsuario: 22, NombreCompleto: "Daniela Fernández", TotalPagado: 1100, GastoIndividual: 1000, BalancePendiente: 100 },
  { IdParticipanteViaje: 3, IdUsuario: 33, NombreCompleto: "Lucia Giampieri", TotalPagado: 0, GastoIndividual: 100, BalancePendiente: -100 },
  { IdParticipanteViaje: 4, IdUsuario: 44, NombreCompleto: "Martín López", TotalPagado: 0, GastoIndividual: 40, BalancePendiente: -40 },
];

const fases = [
  { Fase: "pre_viaje", Desde: null, Hasta: "2026-01-09", CantidadGastos: 1, TotalGrupo: 300, Pagado: 300, Parte: 100, Neto: 200 },
  { Fase: "en_curso", Desde: "2026-01-10", Hasta: "2026-01-20", CantidadGastos: 3, TotalGrupo: 900, Pagado: 0, Parte: 300, Neto: -300 },
  { Fase: "post_viaje", Desde: "2026-01-21", Hasta: null, CantidadGastos: 0, TotalGrupo: 0, Pagado: 0, Parte: 0, Neto: 0 },
];

const conFases = balances.map((b) => ({ ...b, Fases: fases }));

describe("SettlementBalances", () => {
  it("tu fila va primera, como 'Vos', con lo que pagaste y tu parte", async () => {
    const { getAllByTestId, getByTestId } = await render(
      <SettlementBalances balances={balances} currency="ARS" currentUserId={33} />
    );

    expect(getAllByTestId(/^balance-\d+$/)[0].props.testID).toBe("balance-3");
    expect(getByTestId("balance-3")).toHaveTextContent(/Vos/);
    expect(getByTestId("balance-3")).toHaveTextContent(/Pagaste .*0 · tu parte .*100/);
    expect(getByTestId("balance-mine-value")).toHaveTextContent(/100.*debés/);
  });

  it("si hubo transferencias, las muestra en la fila", async () => {
    const conTransferencia = balances.map((b) =>
      b.IdUsuario === 33 ? { ...b, BalancePendiente: 0 } : b
    );
    const { getByTestId } = await render(
      <SettlementBalances balances={conTransferencia} currency="ARS" currentUserId={33} />
    );

    expect(getByTestId("balance-3")).toHaveTextContent(/transferiste .*100/);
    expect(getByTestId("balance-mine-value")).toHaveTextContent(/al día/);
  });

  it("tocar tu fila abre el desglose", async () => {
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
    expect(getByTestId("balance-2")).toHaveTextContent(/Pagó .*1\.100 · su parte .*1\.000/);
  });

  it("muestra un mensaje si todavía no hay saldos", async () => {
    const { getByText } = await render(<SettlementBalances balances={[]} currency="ARS" />);

    expect(getByText(/Todavía no hay participantes aceptados/)).toBeTruthy();
  });

  it("'Por etapa' muestra las etapas y el detalle de la primera con gastos", async () => {
    const { getByTestId, queryByTestId } = await render(
      <SettlementBalances balances={conFases} currency="ARS" currentUserId={33} />
    );

    expect(queryByTestId("balance-phases")).toBeNull();
    await fireEvent.press(getByTestId("balance-mode-etapa"));

    expect(getByTestId("phase-pre_viaje")).toHaveTextContent(/Antes.*1 gasto/);
    expect(getByTestId("phase-en_curso")).toHaveTextContent(/Durante.*3 gastos/);
    expect(getByTestId("phase-post_viaje")).toHaveTextContent(/Sin gastos/);
    expect(getByTestId("phase-detail")).toHaveTextContent(/Antes del viaje.*hasta 09\/01/);
    expect(getByTestId("phase-detail")).toHaveTextContent(/Pagaste.*300/);
    expect(getByTestId("phase-detail")).toHaveTextContent(/Tu parte.*100/);
    expect(getByTestId("phase-detail")).toHaveTextContent(/\+.*200/);
  });

  it("en una etapa, el grupo muestra el balance de cada uno en esa etapa", async () => {
    const { getByTestId, queryByTestId } = await render(
      <SettlementBalances balances={conFases} currency="ARS" currentUserId={33} />
    );

    await fireEvent.press(getByTestId("balance-mode-etapa"));
    await fireEvent.press(getByTestId("phase-en_curso"));

    expect(getByTestId("phase-detail")).toHaveTextContent(/10\/01 al 20\/01/);
    expect(getByTestId("balance-phase-2")).toHaveTextContent(/Pagó .*0 · su parte .*300/);
    expect(getByTestId("balance-phase-2")).toHaveTextContent(/en contra/);
    expect(queryByTestId("balance-phase-3")).toBeNull();
  });

  it("en una etapa sin gastos no muestra la lista del grupo", async () => {
    const { getByTestId, queryByTestId } = await render(
      <SettlementBalances balances={conFases} currency="ARS" currentUserId={33} />
    );

    await fireEvent.press(getByTestId("balance-mode-etapa"));
    await fireEvent.press(getByTestId("phase-post_viaje"));

    expect(getByTestId("phase-detail")).toHaveTextContent(/Todavía no hay gastos/);
    expect(queryByTestId("balance-phase-2")).toBeNull();
  });

  it("sin etapas no muestra el selector de modo", async () => {
    const { queryByTestId } = await render(
      <SettlementBalances balances={balances} currency="ARS" currentUserId={33} />
    );

    expect(queryByTestId("balance-mode")).toBeNull();
  });
});