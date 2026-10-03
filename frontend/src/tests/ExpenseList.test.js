import { fireEvent, render } from "@testing-library/react-native";

import ExpenseList, {
  formatExpenseDate,
  iconForCategory,
} from "../components/trip/ExpenseList";

const categorias = [
  { IdCategoria: 1, Nombre: "Comida y Bebida" },
  { IdCategoria: 2, Nombre: "Transporte" },
  { IdCategoria: 3, Nombre: "Alojamiento" },
];

function gasto(overrides = {}) {
  return {
    IdGasto: 1,
    Nombre: "Cena",
    Monto: 100,
    FechaGasto: "2026-09-02",
    IdCategoria: 1,
    NombreCategoria: "Comida y Bebida",
    IdPagador: 10,
    IdUsuarioPagador: 1,
    NombrePagador: "Lucia Giampieri",
    ...overrides,
  };
}

const gastos = [
  gasto({ IdGasto: 3, Nombre: "Taxi", Monto: 40, IdCategoria: 2, NombreCategoria: "Transporte", IdUsuarioPagador: 2, NombrePagador: "Daniela F" }),
  gasto({ IdGasto: 1, Nombre: "Cena", Monto: 100 }),
  gasto({ IdGasto: 2, Nombre: "Almuerzo", Monto: 60 }),
];

describe("ExpenseList", () => {
  it("muestra cada gasto con su nombre, quién pagó y el monto", async () => {
    const { getByTestId, getByText, getAllByText, queryByText } = await render(
      <ExpenseList categories={categorias} currency="ARS" currentUserId={2} expenses={gastos} />
    );

    // Abrir las secciones colapsables para poder ver los gastos dentro
    await fireEvent.press(getByTestId("expense-category-header-1"));
    await fireEvent.press(getByTestId("expense-category-header-2"));

    expect(getByText("Taxi")).toBeTruthy();
    expect(getByText(/^Pagaste vos/)).toBeTruthy();
    expect(queryByText(/^Pagó vos/)).toBeNull();
    expect(getAllByText(/^Pagó Lucia Giampieri/)).toHaveLength(2);
  });

  it("muestra el total y la cantidad de todos los gastos", async () => {
    const { getByText } = await render(
      <ExpenseList categories={categorias} currency="ARS" expenses={gastos} />
    );

    expect(getByText("Total · 3 gastos")).toBeTruthy();
    expect(getByText("$ 200")).toBeTruthy();
  });

  it("abre el panel de filtros y permite navegar a la sección de categorías", async () => {
    const { getByTestId, getByText, queryByTestId } = await render(
      <ExpenseList categories={categorias} currency="ARS" expenses={gastos} />
    );

    expect(queryByTestId("expense-filter-1")).toBeNull();

    await fireEvent.press(getByTestId("expense-filter-open"));

    expect(getByText("Tipo de gasto")).toBeTruthy();

    await fireEvent.press(getByTestId("expense-filter-categorias"));

    expect(getByText("Categorías")).toBeTruthy();
    expect(getByTestId("expense-filter-1")).toBeTruthy();
    expect(getByText("Alojamiento")).toBeTruthy();
  });

  it("filtra por categoría mediante el panel, muestra el chip activo y actualiza el total", async () => {
    const { getByTestId, getByText, queryByText, queryByTestId, getAllByText } = await render(
      <ExpenseList categories={categorias} currency="ARS" expenses={gastos} />
    );

    await fireEvent.press(getByTestId("expense-filter-open"));
    await fireEvent.press(getByTestId("expense-filter-categorias"));
    await fireEvent.press(getByTestId("expense-filter-1"));
    await fireEvent.press(getByTestId("expense-categories-done"));
    await fireEvent.press(getByTestId("expense-filter-aplicar"));

    expect(getByText("Cena")).toBeTruthy();
    expect(getByTestId("expense-filter-tag-categorias")).toBeTruthy();
    expect(getByText("Total filtrado · 2 gastos")).toBeTruthy();
    expect(getAllByText("$ 160").length).toBeGreaterThan(0);

    // Quitar el filtro tocando el chip activo
    await fireEvent.press(getByTestId("expense-filter-tag-categorias"));

    expect(getByText("Total · 3 gastos")).toBeTruthy();
    expect(queryByTestId("expense-filter-tag-categorias")).toBeNull();
  });

  it("muestra un mensaje si el viaje no tiene gastos", async () => {
    const { getByText, queryByTestId } = await render(
      <ExpenseList categories={categorias} currency="ARS" expenses={[]} />
    );

    expect(getByText(/Todavía no hay gastos cargados/)).toBeTruthy();
    expect(queryByTestId("expense-filter-open")).toBeNull();
  });

  it("muestra el error y permite reintentar", async () => {
    const onRetry = jest.fn();
    const { getByText, getByTestId } = await render(
      <ExpenseList currency="ARS" error="No pudimos cargar los gastos del viaje." onRetry={onRetry} />
    );

    expect(getByText("No pudimos cargar los gastos del viaje.")).toBeTruthy();
    await fireEvent.press(getByTestId("expenses-retry"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("permite solicitar la eliminación de un gasto cuando está habilitada", async () => {
    const onDeleteExpense = jest.fn();
    const { getByTestId } = await render(
      <ExpenseList
        canDelete
        categories={categorias}
        currency="ARS"
        expenses={gastos}
        onDeleteExpense={onDeleteExpense}
      />
    );

    await fireEvent.press(getByTestId("expense-category-header-1"));
    await fireEvent.press(getByTestId("expense-delete-1"));

    expect(onDeleteExpense).toHaveBeenCalledWith(expect.objectContaining({ IdGasto: 1 }));
  });
});

describe("formatExpenseDate", () => {
  it("no corre la fecha por zona horaria", () => {
    expect(formatExpenseDate("2026-09-02", new Date(2026, 8, 28))).toBe("2 sep");
  });

  it("agrega el año si no es el año en curso", () => {
    expect(formatExpenseDate("2025-12-31", new Date(2026, 8, 28))).toBe("31 dic 2025");
  });
});

describe("iconForCategory", () => {
  it("usa el ícono de la categoría o uno genérico", () => {
    expect(iconForCategory("Transporte")).toBe("car");
    expect(iconForCategory("Categoría nueva")).toBe("receipt");
  });
});
