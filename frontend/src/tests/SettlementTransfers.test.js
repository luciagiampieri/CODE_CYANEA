import { fireEvent, render } from "@testing-library/react-native";

import SettlementTransfers, { VISIBLE_PENDING } from "../components/trip/SettlementTransfers";

// Lucia (usuario 1, participante 10) es el usuario actual.
const balances = [
  { IdParticipanteViaje: 10, IdUsuario: 1 },
  { IdParticipanteViaje: 20, IdUsuario: 2 },
  { IdParticipanteViaje: 30, IdUsuario: 3 },
];

function transfer(id, deudor, acreedor, estado, monto = 100) {
  const nombres = { 10: "Lucia Giampieri", 20: "Daniela Fernández", 30: "Martín López" };
  return {
    IdTransferenciaLiquidacion: id,
    IdParticipanteDeudor: deudor,
    IdParticipanteAcreedor: acreedor,
    NombreDeudor: nombres[deudor],
    NombreAcreedor: nombres[acreedor],
    Monto: monto,
    Estado: estado,
  };
}

async function renderTransfers(transfers, props = {}) {
  return render(
    <SettlementTransfers
      balances={balances}
      canUpdate
      currency="ARS"
      currentUserId={1}
      transfers={transfers}
      onConfirm={jest.fn()}
      onReject={jest.fn()}
      onReport={jest.fn()}
      {...props}
    />
  );
}

describe("SettlementTransfers", () => {
  it("muestra solo las transferencias del usuario, en dos secciones", async () => {
    const utils = await renderTransfers([
      transfer(1, 10, 20, "pendiente"), // Lucia le debe a Daniela
      transfer(2, 30, 10, "pendiente"), // Martín le debe a Lucia
      transfer(3, 30, 20, "pendiente"), // entre otros: no se muestra
    ]);

    expect(utils.getByTestId("transfers-to-pay")).toHaveTextContent(/Tenés que transferir.*Daniela Fernández/);
    expect(utils.getByTestId("transfers-to-receive")).toHaveTextContent(/Te tienen que transferir.*Martín López/);
    expect(utils.queryByTestId("transfer-3")).toBeNull();
  });

  it("sin transferencias propias avisa que está al día, aunque otros deban", async () => {
    const utils = await renderTransfers([transfer(3, 30, 20, "pendiente")]);

    expect(utils.getByTestId("transfers-empty")).toHaveTextContent(
      /No tenés transferencias pendientes con nadie del grupo\./
    );
  });

  it("sin deudas en el grupo dice que el grupo está al día", async () => {
    const utils = await renderTransfers([]);

    expect(utils.getByText("No hay deudas pendientes. El grupo está al día.")).toBeTruthy();
  });

  it("el deudor avisa 'Ya transferí' y después espera la confirmación", async () => {
    const onReport = jest.fn();
    const utils = await renderTransfers([transfer(1, 10, 20, "pendiente")], { onReport });

    await fireEvent.press(utils.getByTestId("transfer-report-1"));
    expect(onReport).toHaveBeenCalledWith(1);
    // El deudor no puede confirmar por el otro.
    expect(utils.queryByTestId("transfer-confirm-1")).toBeNull();

    await utils.rerender(
      <SettlementTransfers
        balances={balances}
        canUpdate
        currency="ARS"
        currentUserId={1}
        transfers={[transfer(1, 10, 20, "informada")]}
        onReport={onReport}
      />
    );
    expect(utils.queryByTestId("transfer-report-1")).toBeNull();
    expect(utils.getByTestId("transfer-1")).toHaveTextContent(/Esperando que Daniela confirme/);
  });

  it("al acreedor le llega el aviso y puede confirmar o decir que no le llegó", async () => {
    const onConfirm = jest.fn();
    const onReject = jest.fn();
    const utils = await renderTransfers(
      [transfer(2, 30, 10, "pendiente"), transfer(4, 20, 10, "informada")],
      { onConfirm, onReject }
    );

    // Lo que espera su respuesta va primero.
    const filas = utils.getAllByTestId(/^transfer-\d+$/).map((fila) => fila.props.testID);
    expect(filas).toEqual(["transfer-4", "transfer-2"]);
    expect(utils.getByTestId("transfer-4")).toHaveTextContent(/Daniela dice que ya te transfirió/);

    await fireEvent.press(utils.getByTestId("transfer-confirm-4"));
    await fireEvent.press(utils.getByTestId("transfer-reject-4"));
    expect(onConfirm).toHaveBeenCalledWith(4, true);
    expect(onReject).toHaveBeenCalledWith(4);

    // Una pendiente sin aviso no muestra botones hasta que se toca la fila.
    expect(utils.queryByTestId("transfer-confirm-2")).toBeNull();
    await fireEvent.press(utils.getByTestId("transfer-2"));
    await fireEvent.press(utils.getByTestId("transfer-confirm-2"));
    expect(onConfirm).toHaveBeenCalledWith(2, true);
    // Se puede confirmar, pero no rechazar: nadie avisó nada.
    expect(utils.queryByTestId("transfer-reject-2")).toBeNull();
  });

  it("el acreedor puede deshacer una transferencia recibida", async () => {
    const onConfirm = jest.fn();
    const utils = await renderTransfers([transfer(2, 30, 10, "realizada")], { onConfirm });

    // Lo saldado queda plegado.
    expect(utils.queryByTestId("transfer-2")).toBeNull();
    await fireEvent.press(utils.getByTestId("transfers-settled-receive"));

    expect(utils.getByTestId("transfer-2")).toHaveTextContent(/Recibida/);
    await fireEvent.press(utils.getByTestId("transfer-undo-2"));
    expect(onConfirm).toHaveBeenCalledWith(2, false);
  });

  it("el deudor ve cuando el otro confirmó que le llegó", async () => {
    const utils = await renderTransfers([transfer(1, 10, 20, "realizada")]);
    await fireEvent.press(utils.getByTestId("transfers-settled-pay"));

    expect(utils.getByTestId("transfer-1")).toHaveTextContent(/Daniela confirmó que le llegó/);
    expect(utils.queryByTestId("transfer-undo-1")).toBeNull();
  });

  it("sin permiso de edición muestra el estado pero no las acciones", async () => {
    const utils = await renderTransfers(
      [transfer(1, 10, 20, "pendiente"), transfer(4, 20, 10, "informada")],
      { canUpdate: false }
    );

    expect(utils.queryByTestId("transfer-report-1")).toBeNull();
    expect(utils.queryByTestId("transfer-confirm-4")).toBeNull();
    expect(utils.getByTestId("transfer-4")).toHaveTextContent(/dice que ya te transfirió/);
  });

  it("cada sección muestra el total que falta, sin contar lo saldado", async () => {
    const utils = await renderTransfers([
      transfer(2, 30, 10, "pendiente", 4000),
      transfer(4, 20, 10, "informada", 8200),
      transfer(5, 20, 10, "realizada", 1500),
    ]);

    expect(utils.getByTestId("transfers-total-receive")).toHaveTextContent(/12\.200/);
    expect(utils.getByTestId("transfers-settled-receive")).toHaveTextContent(/Ya saldadas \(1\)/);
  });

  it("con muchas pendientes muestra las primeras y un 'Ver N más'", async () => {
    // Cinco personas le deben a Lucia (participantes 101 a 105).
    const muchas = [101, 102, 103, 104, 105].map((deudor, i) => ({
      ...transfer(200 + i, 30, 10, "pendiente"),
      IdParticipanteDeudor: deudor,
      NombreDeudor: `Persona ${i + 1}`,
    }));
    const utils = await renderTransfers(muchas);

    expect(utils.getAllByTestId(/^transfer-\d+$/)).toHaveLength(VISIBLE_PENDING);
    await fireEvent.press(utils.getByTestId("transfers-more-receive"));

    expect(utils.getAllByTestId(/^transfer-\d+$/)).toHaveLength(5);
    expect(utils.queryByTestId("transfers-more-receive")).toBeNull();
  });

  it("los avisos para confirmar siempre se ven, aunque haya muchas pendientes", async () => {
    const pendientes = [101, 102, 103, 104].map((deudor, i) => ({
      ...transfer(300 + i, 30, 10, "pendiente"),
      IdParticipanteDeudor: deudor,
      NombreDeudor: `Persona ${i + 1}`,
    }));
    const utils = await renderTransfers([...pendientes, transfer(4, 20, 10, "informada")]);

    expect(utils.getByTestId("transfer-confirm-4")).toBeTruthy();
    expect(utils.getAllByTestId(/^transfer-\d+$/)).toHaveLength(1 + VISIBLE_PENDING);
  });
});