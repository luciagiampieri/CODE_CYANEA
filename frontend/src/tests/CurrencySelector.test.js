import { act, fireEvent, render } from "@testing-library/react-native";

import CurrencySelector from "../components/trip/CurrencySelector";

const currencies = [
  { Codigo: "ARS", Nombre: "Peso argentino" },
  { Codigo: "USD", Nombre: "Dólar estadounidense" },
  { Codigo: "EUR", Nombre: "Euro" },
];

const baseProps = {
  currencies,
  selectedCurrency: null,
  onSelectCurrency: jest.fn(),
  error: "",
};

async function abrirBuscador(utils) {
  await act(async () => {
    fireEvent(utils.getByPlaceholderText("Buscar moneda..."), "focus");
  });
}

describe("CurrencySelector", () => {
  it("muestra el input vacío cuando no hay moneda seleccionada y está cerrado", async () => {
    const { getByPlaceholderText } = await render(<CurrencySelector {...baseProps} />);

    expect(getByPlaceholderText("Buscar moneda...").props.value).toBe("");
  });

  it("muestra 'Nombre (Código)' de la moneda seleccionada cuando está cerrado", async () => {
    const { getByPlaceholderText } = await render(
      <CurrencySelector {...baseProps} selectedCurrency="USD" />
    );

    expect(getByPlaceholderText("Buscar moneda...").props.value).toBe(
      "Dólar estadounidense (USD)"
    );
  });

  it("al hacer foco, abre el listado con todas las monedas", async () => {
    const utils = await render(<CurrencySelector {...baseProps} />);

    await abrirBuscador(utils);

    expect(utils.getByText("Peso argentino")).toBeTruthy();
    expect(utils.getByText("Dólar estadounidense")).toBeTruthy();
    expect(utils.getByText("Euro")).toBeTruthy();
  });

  it("filtra las monedas por nombre (sin importar mayúsculas)", async () => {
    const utils = await render(<CurrencySelector {...baseProps} />);
    await abrirBuscador(utils);

    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Buscar moneda..."), "DÓLAR");
    });

    expect(utils.getByText("Dólar estadounidense")).toBeTruthy();
    expect(utils.queryByText("Peso argentino")).toBeNull();
    expect(utils.queryByText("Euro")).toBeNull();
  });

  it("filtra las monedas por código", async () => {
    const utils = await render(<CurrencySelector {...baseProps} />);
    await abrirBuscador(utils);

    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Buscar moneda..."), "eur");
    });

    expect(utils.getByText("Euro")).toBeTruthy();
    expect(utils.queryByText("Peso argentino")).toBeNull();
  });

  it("muestra 'No se encontraron monedas.' cuando el filtro no matchea nada", async () => {
    const utils = await render(<CurrencySelector {...baseProps} />);
    await abrirBuscador(utils);

    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Buscar moneda..."), "yen japonés");
    });

    expect(utils.getByText("No se encontraron monedas.")).toBeTruthy();
  });

  it("al elegir una moneda, llama a onSelectCurrency y cierra el listado", async () => {
    const onSelectCurrency = jest.fn();
    const utils = await render(
      <CurrencySelector {...baseProps} onSelectCurrency={onSelectCurrency} />
    );
    await abrirBuscador(utils);

    await act(async () => {
      fireEvent.press(utils.getByText("Euro"));
    });

    expect(onSelectCurrency).toHaveBeenCalledWith("EUR");
    expect(utils.queryByText("Peso argentino")).toBeNull();
  });

  it("muestra el mensaje de error cuando viene la prop error", async () => {
    const { getByText } = await render(
      <CurrencySelector {...baseProps} error="Seleccioná una moneda válida." />
    );

    expect(getByText("Seleccioná una moneda válida.")).toBeTruthy();
  });
});