import { fireEvent, render } from "@testing-library/react-native";

import SettlementTransfers from "../components/trip/SettlementTransfers";

const balances = [
  { IdParticipanteViaje: 10, IdUsuario: 1 },
  { IdParticipanteViaje: 20, IdUsuario: 2 },
  { IdParticipanteViaje: 30, IdUsuario: 3 },
];

const transfers = [
  { IdTransferenciaLiquidacion: 1, IdParticipanteDeudor: 30, IdParticipanteAcreedor: 20, NombreDeudor: "Martín", NombreAcreedor: "Daniela", Monto: 50, Estado: "realizada" },
  { IdTransferenciaLiquidacion: 2, IdParticipanteDeudor: 10, IdParticipanteAcreedor: 20, NombreDeudor: "Lucia", NombreAcreedor: "Daniela", Monto: 100, Estado: "pendiente" },
];

describe("SettlementTransfers", () => {
  it("muestra las pendientes primero y reemplaza el nombre del usuario por 'Vos'", async () => {
    const { getAllByTestId, getByText } = await render(
      <SettlementTransfers balances={balances} currency="ARS" currentUserId={1} transfers={transfers} />
    );

    expect(getAllByTestId(/^transfer-\d+$/)[0].props.testID).toBe("transfer-2");
    expect(getByText("Vos")).toBeTruthy();
  });

  it("permite marcar como pagada y deshacer si puede actualizar", async () => {
    const onToggle = jest.fn();
    const { getByTestId } = await render(
      <SettlementTransfers
        balances={balances}
        canUpdate
        currency="ARS"
        currentUserId={1}
        onToggle={onToggle}
        transfers={transfers}
      />
    );

    await fireEvent.press(getByTestId("transfer-pay-2"));
    await fireEvent.press(getByTestId("transfer-undo-1"));

    expect(onToggle).toHaveBeenCalledWith(2, true);
    expect(onToggle).toHaveBeenCalledWith(1, false);
  });

  it("sin permiso de edición solo informa el estado", async () => {
    const { queryByTestId, getByText } = await render(
      <SettlementTransfers balances={balances} currency="ARS" currentUserId={1} transfers={transfers} />
    );

    expect(queryByTestId("transfer-pay-2")).toBeNull();
    expect(getByText("Pendiente")).toBeTruthy();
  });

  it("muestra un mensaje cuando no hay transferencias", async () => {
    const { getByText } = await render(<SettlementTransfers currency="ARS" transfers={[]} />);

    expect(getByText("No hay deudas pendientes. El grupo está al día.")).toBeTruthy();
  });

  it("adapta el texto del botón al rol del usuario en la transferencia", async () => {
    const pendientes = [
      { IdTransferenciaLiquidacion: 7, IdParticipanteDeudor: 10, IdParticipanteAcreedor: 20, NombreDeudor: "Lucia", NombreAcreedor: "Daniela", Monto: 40, Estado: "pendiente" },
      { IdTransferenciaLiquidacion: 8, IdParticipanteDeudor: 30, IdParticipanteAcreedor: 10, NombreDeudor: "Martín", NombreAcreedor: "Lucia", Monto: 20, Estado: "pendiente" },
      { IdTransferenciaLiquidacion: 9, IdParticipanteDeudor: 30, IdParticipanteAcreedor: 20, NombreDeudor: "Martín", NombreAcreedor: "Daniela", Monto: 10, Estado: "pendiente" },
    ];
    const { getByText } = await render(
      <SettlementTransfers
        balances={balances}
        canUpdate
        currency="ARS"
        currentUserId={1}
        onToggle={jest.fn()}
        transfers={pendientes}
      />
    );

    expect(getByText("Ya pagué")).toBeTruthy();
    expect(getByText("Ya me pagó")).toBeTruthy();
    expect(getByText("Marcar pagada")).toBeTruthy();
  });

  it("las transferencias pagadas muestran su estado junto al monto", async () => {
    const { getByText } = await render(
      <SettlementTransfers balances={balances} currency="ARS" currentUserId={1} transfers={transfers} />
    );

    expect(getByText("Pagada")).toBeTruthy();
  });
});