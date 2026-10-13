import { fireEvent, render } from "@testing-library/react-native";

import ExpenseSummaryCard from "../components/trip/ExpenseSummaryCard";

jest.mock("../components/ui/PrimaryButton", () => {
  const { Pressable, Text } = require("react-native");
  return function PrimaryButton({ label, onPress }) {
    return (
      <Pressable onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
  };
});

describe("ExpenseSummaryCard", () => {
  it("indica cuánto debe el usuario y permite ver a quién", async () => {
    const onShowMyTransfers = jest.fn();
    const { getByText, getByTestId } = await render(
      <ExpenseSummaryCard currency="ARS" mySaldo={-100} onShowMyTransfers={onShowMyTransfers} />
    );

    expect(getByText(/^Debés/)).toBeTruthy();
    expect(getByText("Ver a quién")).toBeTruthy();

    await fireEvent.press(getByTestId("expense-my-balance"));
    expect(onShowMyTransfers).toHaveBeenCalled();
  });

  it("indica cuánto le deben al usuario", async () => {
    const { getByText } = await render(
      <ExpenseSummaryCard currency="ARS" mySaldo={250} onShowMyTransfers={jest.fn()} />
    );

    expect(getByText(/^Te deben/)).toBeTruthy();
    expect(getByText("Ver de quién")).toBeTruthy();
  });

  it("muestra 'Estás al día' sin acceso a transferencias cuando el saldo es cero", async () => {
    const { getByText, queryByText } = await render(
      <ExpenseSummaryCard currency="ARS" mySaldo={0} onShowMyTransfers={jest.fn()} />
    );

    expect(getByText("Estás al día")).toBeTruthy();
    expect(queryByText("Ver a quién")).toBeNull();
  });

  it("no muestra el bloque de saldo si el usuario no figura en la liquidación", async () => {
    const { queryByTestId } = await render(<ExpenseSummaryCard currency="ARS" mySaldo={null} />);

    expect(queryByTestId("expense-my-balance")).toBeNull();
  });

  it("muestra las acciones solo si el usuario puede editar gastos", async () => {
    const onAddExpense = jest.fn();
    const onRebuild = jest.fn();
    const { getByText, rerender, queryByText } = await render(
      <ExpenseSummaryCard
        canAddExpense
        canRebuild
        currency="ARS"
        onAddExpense={onAddExpense}
        onRebuild={onRebuild}
      />
    );

    await fireEvent.press(getByText("Agregar gasto"));
    await fireEvent.press(getByText("Recalcular liquidación"));
    expect(onAddExpense).toHaveBeenCalled();
    expect(onRebuild).toHaveBeenCalled();

    await rerender(<ExpenseSummaryCard currency="ARS" />);
    expect(queryByText("Agregar gasto")).toBeNull();
    expect(queryByText("Recalcular liquidación")).toBeNull();
  });

  it("muestra el total del grupo y tu gasto, con lo que es personal", async () => {
    const { getByTestId } = await render(
      <ExpenseSummaryCard
        currency="USD"
        myExpense={600}
        myPersonalExpense={500}
        pendingTotal={100}
        totalSpent={300}
      />
    );

    expect(getByTestId("expense-group-total")).toHaveTextContent(/Gastos del grupo/);
    expect(getByTestId("expense-group-total")).toHaveTextContent(/300/);
    expect(getByTestId("expense-my-total")).toHaveTextContent(/Tu gasto/);
    expect(getByTestId("expense-my-total")).toHaveTextContent(/600/);
    expect(getByTestId("expense-my-personal")).toHaveTextContent(/Incluye .*500 personales/);
  });

  it("sin gastos personales no muestra la aclaración", async () => {
    const { getByTestId, queryByTestId } = await render(
      <ExpenseSummaryCard currency="USD" myExpense={100} myPersonalExpense={0} totalSpent={300} />
    );

    expect(getByTestId("expense-my-total")).toHaveTextContent(/100/);
    expect(queryByTestId("expense-my-personal")).toBeNull();
  });

  it("si no llega tu gasto, muestra 'Por saldar' como antes", async () => {
    const { getByText, queryByTestId } = await render(
      <ExpenseSummaryCard currency="USD" pendingTotal={100} totalSpent={300} />
    );

    expect(getByText("Por saldar")).toBeTruthy();
    expect(queryByTestId("expense-my-total")).toBeNull();
    expect(queryByTestId("expense-pending-total")).toBeNull();
  });

  it("los totales no repiten el código de moneda junto al monto", async () => {
    const { getByTestId, queryByText } = await render(
      <ExpenseSummaryCard currency="ARS" myExpense={50} totalSpent={160} />
    );

    expect(getByTestId("expense-group-total")).toHaveTextContent(/Gastos del grupo/);
    expect(queryByText(/ARS/)).toBeNull();
  });

  it("no muestra 'Por saldar en el grupo' ni la frase de recálculo: no repite información", async () => {
    const { queryByText, getByText } = await render(
      <ExpenseSummaryCard canRebuild currency="ARS" myExpense={50} onRebuild={jest.fn()} pendingTotal={100} totalSpent={160} />
    );

    expect(queryByText(/Por saldar/)).toBeNull();
    expect(queryByText(/Las cuentas se recalculan/)).toBeNull();
    expect(getByText("Recalcular liquidación")).toBeTruthy();
  });
});