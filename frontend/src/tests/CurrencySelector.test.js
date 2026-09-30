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

const PLACEHOLDER = "Elegí una moneda";
const PLACEHOLDER_BUSCADOR = "Buscá por nombre o código";

async function abrirSelector(utils) {
  await act(async () => {
    fireEvent.press(utils.getByText(PLACEHOLDER));
  });
}

async function buscar(utils, texto) {
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR), texto);
  });
}

describe("CurrencySelector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("botón cerrado", () => {
    it("muestra el placeholder cuando no hay moneda seleccionada", async () => {
      const { getByText } = await render(<CurrencySelector {...baseProps} />);

      expect(getByText(PLACEHOLDER)).toBeTruthy();
    });

    it("muestra el nombre y el código de la moneda seleccionada", async () => {
      const { getByText, queryByText } = await render(
        <CurrencySelector {...baseProps} selectedCurrency="USD" />
      );

      expect(getByText("Dólar estadounidense")).toBeTruthy();
      expect(getByText("USD")).toBeTruthy();
      expect(queryByText(PLACEHOLDER)).toBeNull();
    });

    it("muestra el mensaje de error cuando viene la prop error", async () => {
      const { getByText } = await render(
        <CurrencySelector {...baseProps} error="Seleccioná una moneda válida." />
      );

      expect(getByText("Seleccioná una moneda válida.")).toBeTruthy();
    });
  });

  describe("selector abierto", () => {
    it("al tocar el botón, abre el listado con todas las monedas y llama a onOpen", async () => {
      const onOpen = jest.fn();
      const utils = await render(<CurrencySelector {...baseProps} onOpen={onOpen} />);

      await abrirSelector(utils);

      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(utils.getByText("Peso argentino")).toBeTruthy();
      expect(utils.getByText("Dólar estadounidense")).toBeTruthy();
      expect(utils.getByText("Euro")).toBeTruthy();
    });

    it("muestra en el encabezado cuántas monedas hay disponibles", async () => {
      const utils = await render(<CurrencySelector {...baseProps} />);

      await abrirSelector(utils);

      expect(utils.getByText("3 disponibles")).toBeTruthy();
    });

    it("usa el singular cuando hay una sola moneda disponible", async () => {
      const utils = await render(
        <CurrencySelector {...baseProps} currencies={[{ Codigo: "USD", Nombre: "Dólar estadounidense" }]} />
      );

      await abrirSelector(utils);

      expect(utils.getByText("1 disponible")).toBeTruthy();
    });

    it("la moneda seleccionada aparece también dentro del listado", async () => {
      const utils = await render(<CurrencySelector {...baseProps} selectedCurrency="USD" />);

      await act(async () => {
        fireEvent.press(utils.getByText("Dólar estadounidense"));
      });

      // Una vez en el botón y otra en la lista
      expect(utils.getAllByText("Dólar estadounidense")).toHaveLength(2);
      expect(utils.getByText("Euro")).toBeTruthy();
    });

    it("el botón volver cierra el listado sin elegir ninguna moneda", async () => {
      const onSelectCurrency = jest.fn();
      const utils = await render(
        <CurrencySelector {...baseProps} onSelectCurrency={onSelectCurrency} />
      );
      await abrirSelector(utils);

      await act(async () => {
        fireEvent.press(utils.getByLabelText("Cerrar selector de moneda"));
      });

      expect(onSelectCurrency).not.toHaveBeenCalled();
      expect(utils.queryByText("Peso argentino")).toBeNull();
    });

    it("al cerrar y volver a abrir, la búsqueda anterior se limpia", async () => {
      const utils = await render(<CurrencySelector {...baseProps} />);
      await abrirSelector(utils);
      await buscar(utils, "euro");
      expect(utils.queryByText("Peso argentino")).toBeNull();

      await act(async () => {
        fireEvent.press(utils.getByLabelText("Cerrar selector de moneda"));
      });
      await abrirSelector(utils);

      expect(utils.getByText("Peso argentino")).toBeTruthy();
      expect(utils.getByText("Dólar estadounidense")).toBeTruthy();
      expect(utils.getByText("Euro")).toBeTruthy();
    });
  });

  describe("búsqueda", () => {
    it("filtra las monedas por nombre (sin importar mayúsculas)", async () => {
      const utils = await render(<CurrencySelector {...baseProps} />);
      await abrirSelector(utils);

      await buscar(utils, "DÓLAR");

      expect(utils.getByText("Dólar estadounidense")).toBeTruthy();
      expect(utils.queryByText("Peso argentino")).toBeNull();
      expect(utils.queryByText("Euro")).toBeNull();
    });

    it("filtra las monedas por código", async () => {
      const utils = await render(<CurrencySelector {...baseProps} />);
      await abrirSelector(utils);

      await buscar(utils, "eur");

      expect(utils.getByText("Euro")).toBeTruthy();
      expect(utils.queryByText("Peso argentino")).toBeNull();
    });

    it("ignora los espacios al principio y al final de la búsqueda", async () => {
      const utils = await render(<CurrencySelector {...baseProps} />);
      await abrirSelector(utils);

      await buscar(utils, "  euro  ");

      expect(utils.getByText("Euro")).toBeTruthy();
      expect(utils.queryByText("Peso argentino")).toBeNull();
    });

    it("muestra 'Sin resultados' cuando el filtro no coincide con ninguna moneda", async () => {
      const utils = await render(<CurrencySelector {...baseProps} />);
      await abrirSelector(utils);

      await buscar(utils, "yen japonés");

      expect(utils.getByText("Sin resultados")).toBeTruthy();
      expect(
        utils.getByText("No encontramos ninguna moneda que coincida con tu búsqueda.")
      ).toBeTruthy();
    });

    it("no falla si alguna moneda viene sin nombre", async () => {
      const utils = await render(
        <CurrencySelector {...baseProps} currencies={[{ Codigo: "ABC" }]} />
      );
      await abrirSelector(utils);

      await buscar(utils, "zzz");

      expect(utils.getByText("Sin resultados")).toBeTruthy();
    });
  });

  describe("selección", () => {
    it("al elegir una moneda, llama a onSelectCurrency con su código y cierra el listado", async () => {
      const onSelectCurrency = jest.fn();
      const utils = await render(
        <CurrencySelector {...baseProps} onSelectCurrency={onSelectCurrency} />
      );
      await abrirSelector(utils);

      await act(async () => {
        fireEvent.press(utils.getByText("Euro"));
      });

      expect(onSelectCurrency).toHaveBeenCalledTimes(1);
      expect(onSelectCurrency).toHaveBeenCalledWith("EUR");
      expect(utils.queryByText("Peso argentino")).toBeNull();
    });

    it("se puede elegir una moneda después de filtrar", async () => {
      const onSelectCurrency = jest.fn();
      const utils = await render(
        <CurrencySelector {...baseProps} onSelectCurrency={onSelectCurrency} />
      );
      await abrirSelector(utils);
      await buscar(utils, "peso");

      await act(async () => {
        fireEvent.press(utils.getByText("Peso argentino"));
      });

      expect(onSelectCurrency).toHaveBeenCalledWith("ARS");
    });
  });
});