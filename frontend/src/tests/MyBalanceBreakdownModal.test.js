import { fireEvent, render } from "@testing-library/react-native";

import MyBalanceBreakdownModal from "../components/trip/MyBalanceBreakdownModal";

function desglose(overrides = {}) {
  return {
    Moneda: "ARS",
    TotalPagado: "300.00",
    TotalParte: "200.00",
    TransferenciasEnviadas: "0.00",
    TransferenciasRecibidas: "0.00",
    Saldo: "100.00",
    Gastos: [
      { IdGasto: 1, Nombre: "Cena", FechaGasto: "2026-10-10", NombreCategoria: "Comida y Bebida", Monto: "300.00", NombrePagador: "Lucia Giampieri", PagasteVos: true, Pagado: "300.00", TuParte: "100.00", Efecto: "200.00" },
      { IdGasto: 2, Nombre: "Taxi", FechaGasto: "2026-10-11", NombreCategoria: "Transporte", Monto: "200.00", NombrePagador: "Dario Test", PagasteVos: false, Pagado: "0.00", TuParte: "100.00", Efecto: "-100.00" },
    ],
    Transferencias: [],
    ...overrides,
  };
}

describe("MyBalanceBreakdownModal", () => {
  it("muestra la cuenta y el resultado", async () => {
    const { getByTestId } = await render(
      <MyBalanceBreakdownModal data={desglose()} visible onClose={jest.fn()} />
    );

    expect(getByTestId("my-balance-headline")).toHaveTextContent(/Te deben .*100/);
    expect(getByTestId("my-balance-paid")).toHaveTextContent(/Pagaste en gastos compartidos.*\+.*300/);
    expect(getByTestId("my-balance-share")).toHaveTextContent(/Tu parte de esos gastos.*−.*200/);
  });

  it("explica cada gasto: quién pagó, tu parte y cuánto movió tu saldo", async () => {
    const { getByTestId } = await render(
      <MyBalanceBreakdownModal data={desglose()} visible onClose={jest.fn()} />
    );

    expect(getByTestId("my-balance-expense-1")).toHaveTextContent(/Cena.*Pagaste .*300, tu parte .*100.*\+.*200/);
    expect(getByTestId("my-balance-expense-2")).toHaveTextContent(/Taxi.*Pagó Dario, tu parte .*100.*−.*100/);
  });

  it("incluye las transferencias y avisa si falta confirmarlas", async () => {
    const { getByTestId, getByText } = await render(
      <MyBalanceBreakdownModal
        data={desglose({
          TransferenciasEnviadas: "100.00",
          Saldo: "0.00",
          Transferencias: [
            { IdTransferenciaLiquidacion: 7, Enviada: true, NombreContraparte: "Ana Gómez", Monto: "100.00", Estado: "informada", Efecto: "100.00" },
          ],
        })}
        visible
        onClose={jest.fn()}
      />
    );

    expect(getByText("Transferencias que hiciste")).toBeTruthy();
    expect(getByTestId("my-balance-transfer-7")).toHaveTextContent(/Le transferiste a Ana.*Falta que lo confirme/);
    expect(getByTestId("my-balance-headline")).toHaveTextContent("Estás al día");
  });

  it("muestra el error y permite reintentar", async () => {
    const onRetry = jest.fn();
    const { getByText } = await render(
      <MyBalanceBreakdownModal error="No se pudo cargar" visible onClose={jest.fn()} onRetry={onRetry} />
    );

    await fireEvent.press(getByText("Reintentar"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("se cierra con la cruz", async () => {
    const onClose = jest.fn();
    const { getByTestId } = await render(
      <MyBalanceBreakdownModal data={desglose()} visible onClose={onClose} />
    );

    await fireEvent.press(getByTestId("my-balance-close"));
    expect(onClose).toHaveBeenCalled();
  });
});