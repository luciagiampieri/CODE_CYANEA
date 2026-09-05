import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import CrearVotacionScreen from "../screens/CreateVotationScreen";
import { createVotacion } from "../services/api";

jest.mock("../services/api", () => ({
  createVotacion: jest.fn(),
}));

const mockOnClose = jest.fn();
const mockOnVotacionCreada = jest.fn();


async function renderPantallaCargada() {
  return render(
    <CrearVotacionScreen
      visible={true}
      IdViaje={7}
      onClose={mockOnClose}
      onVotacionCreada={mockOnVotacionCreada}
    />
  );
}


async function press(utils, texto) {
  await act(async () => {
    fireEvent.press(utils.getByText(texto));
  });
}


async function completarFormularioMinimo(utils) {
  await act(async () => {
    fireEvent.changeText(
      utils.getByPlaceholderText("¿Qué hacemos el segundo día?"),
      "¿Dónde cenamos?"
    );
  });
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText("Propuesta 1"), "Parrilla");
  });
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText("Propuesta 2"), "Sushi");
  });
}


describe("CrearVotacionScreen", () => {
  let alertMock;

  beforeEach(() => {
    jest.clearAllMocks();
    alertMock = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertMock.mockRestore();
  });

  it("arranca con dos propuestas vacías (AC2)", async () => {
    const utils = await renderPantallaCargada();

    expect(utils.getByPlaceholderText("Propuesta 1")).toBeTruthy();
    expect(utils.getByPlaceholderText("Propuesta 2")).toBeTruthy();
    expect(utils.queryByPlaceholderText("Propuesta 3")).toBeNull();
  });

  it("muestra error si el nombre está vacío", async () => {
    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Propuesta 1"), "Parrilla");
    });
    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Propuesta 2"), "Sushi");
    });
    await press(utils, "Crear votación");

    expect(utils.getByText("El nombre de la votación es obligatorio")).toBeTruthy();
    expect(createVotacion).not.toHaveBeenCalled();
  });

  it("muestra error si hay menos de dos propuestas completadas", async () => {
    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("¿Qué hacemos el segundo día?"),
        "¿Dónde cenamos?"
      );
    });
    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Propuesta 1"), "Parrilla");
    });
    await press(utils, "Crear votación");

    expect(utils.getByText("Debés cargar al menos dos propuestas")).toBeTruthy();
    expect(createVotacion).not.toHaveBeenCalled();
  });

  it("muestra error si hay propuestas repetidas", async () => {
    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("¿Qué hacemos el segundo día?"),
        "¿Dónde cenamos?"
      );
    });
    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Propuesta 1"), "Parrilla");
    });
    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Propuesta 2"), "parrilla");
    });
    await press(utils, "Crear votación");

    expect(utils.getByText("Hay propuestas repetidas")).toBeTruthy();
    expect(createVotacion).not.toHaveBeenCalled();
  });

  it("agrega una nueva propuesta al presionar 'Agregar'", async () => {
    const utils = await renderPantallaCargada();

    await press(utils, "Agregar");

    expect(utils.getByPlaceholderText("Propuesta 3")).toBeTruthy();
  });

  it("no permite quitar propuestas por debajo de dos, pero sí a partir de la tercera", async () => {
    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.press(utils.getByTestId("votacion-quitar-propuesta-0"));
    });
    expect(utils.getByPlaceholderText("Propuesta 1")).toBeTruthy();
    expect(utils.getByPlaceholderText("Propuesta 2")).toBeTruthy();

    await press(utils, "Agregar");
    expect(utils.getByPlaceholderText("Propuesta 3")).toBeTruthy();

    await act(async () => {
      fireEvent.press(utils.getByTestId("votacion-quitar-propuesta-2"));
    });
    expect(utils.queryByPlaceholderText("Propuesta 3")).toBeNull();
  });

  it("camino feliz: crea la votación, avisa por Alert y cierra el modal", async () => {
    const nuevaVotacion = { id: 55, nombre: "¿Dónde cenamos?" };
    createVotacion.mockResolvedValue(nuevaVotacion);

    const utils = await renderPantallaCargada();

    await completarFormularioMinimo(utils);
    await press(utils, "Opción múltiple");
    await press(utils, "Crear votación");

    await waitFor(() => expect(createVotacion).toHaveBeenCalled());

    expect(createVotacion).toHaveBeenCalledWith(
      expect.objectContaining({
        idViaje: 7,
        nombre: "¿Dónde cenamos?",
        tipo: "opcion_multiple",
        propuestas: ["Parrilla", "Sushi"],
      })
    );

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith(
      "Votación creada",
      "La votación se creó correctamente."
    ));
    expect(mockOnVotacionCreada).toHaveBeenCalledWith(nuevaVotacion);
    
    expect(mockOnClose).toHaveBeenCalled(); 
  });

  it("muestra un Alert de error si falla la creación en el backend", async () => {
    createVotacion.mockRejectedValue(new Error("No hay conexión con el servidor."));

    const utils = await renderPantallaCargada();

    await completarFormularioMinimo(utils);
    await press(utils, "Crear votación");

    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith("No se pudo crear", "No hay conexión con el servidor.")
    );
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("cierra el modal al presionar la cruz de cerrar", async () => {
    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.press(utils.getByTestId("cerrar-votacion-modal"));
    });

    expect(mockOnClose).toHaveBeenCalled();
  });
});