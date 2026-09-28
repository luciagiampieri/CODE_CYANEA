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

  it("no repite el código de moneda si el monto ya lo incluye", async () => {
    const { queryByText } = await render(<ExpenseSummaryCard currency="EUR" totalSpent={160} />);

    expect(queryByText(" EUR")).toBeNull();
  });

  it("no agrega el código cuando el símbolo ya identifica la moneda (US$)", async () => {
    const { queryByText } = await render(<ExpenseSummaryCard currency="USD" totalSpent={160} />);

    expect(queryByText(" USD")).toBeNull();
  });

  it("aclara la moneda cuando el monto solo muestra el símbolo", async () => {
    const { getByText } = await render(<ExpenseSummaryCard currency="ARS" totalSpent={160} />);

    expect(getByText(" ARS")).toBeTruthy();
  });
});