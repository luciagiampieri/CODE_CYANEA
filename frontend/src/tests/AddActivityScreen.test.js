import { Platform } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import AddActivityScreen from "../screens/AddActivityScreen";
import { searchTripPlaces, saveActivityLocation, resolveTripPlace } from "../services/api";

jest.mock("../services/api", () => ({
  searchTripPlaces: jest.fn(),
  saveActivityLocation: jest.fn(),
  resolveTripPlace: jest.fn(),
}));


beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "web";
});

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  onSubmit: jest.fn(),
  dayLabel: "Día 1 - lunes",
  tripId: 42,
  activityToEdit: null,
  onCancelEdit: jest.fn(),
};

async function llenarFormularioValido(utils, overrides = {}) {
  const { nombre = "Visita al museo", inicio = "10:00", fin = "12:00" } = overrides;

  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText("Visita al museo"), nombre);
  });
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText("10:00"), inicio);
  });
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText("12:00"), fin);
  });
}

async function press(utils, texto) {
  await act(async () => {
    fireEvent.press(utils.getByText(texto));
  });
}


async function pressSubmit(utils, texto) {
  await act(async () => {
    const matches = utils.getAllByText(texto);
    fireEvent.press(matches[matches.length - 1]);
  });
}

describe("AddActivityScreen", () => {
  it("muestra error si se intenta guardar sin nombre", async () => {
    const onSubmit = jest.fn();
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await pressSubmit(utils, "Agregar actividad");

    expect(utils.getByText("El nombre de la actividad es obligatorio.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("muestra error si los horarios no tienen formato HH:MM", async () => {
    const onSubmit = jest.fn();
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await llenarFormularioValido(utils, { inicio: "10hs", fin: "12hs" });
    await pressSubmit(utils, "Agregar actividad");

    expect(utils.getByText("Ingresá los horarios en formato HH:MM.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("muestra error si la hora de fin no es posterior a la de inicio", async () => {
    const onSubmit = jest.fn();
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await llenarFormularioValido(utils, { inicio: "12:00", fin: "10:00" });
    await pressSubmit(utils, "Agregar actividad");

    expect(
      utils.getByText("La hora de fin debe ser posterior a la hora de inicio.")
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("camino feliz: crea la actividad con los datos completados y muestra éxito", async () => {
    const onSubmit = jest.fn().mockResolvedValue();
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await llenarFormularioValido(utils);
    await pressSubmit(utils, "Agregar actividad");

    await waitFor(() =>
      expect(utils.getByText("¡Actividad agregada correctamente!")).toBeTruthy()
    );

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: "Visita al museo",
        horaInicio: "10:00:00",
        horaFin: "12:00:00",
        icono: "camera", 
        idLugarInteres: null,
      })
    );
  });

  it("muestra el mensaje de error que devuelve onSubmit si falla el guardado", async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error("El servidor no responde."));
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await llenarFormularioValido(utils);
    await pressSubmit(utils, "Agregar actividad");

    await waitFor(() => expect(utils.getByText("El servidor no responde.")).toBeTruthy());
  });

  it("detecta automáticamente el ícono según el nombre de la actividad", async () => {
    const onSubmit = jest.fn().mockResolvedValue();
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await llenarFormularioValido(utils, { nombre: "Cena en el restaurante" });
    await pressSubmit(utils, "Agregar actividad");

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ icono: "utensils" }));
  });

  it("permite elegir un ícono manualmente y deja de autodetectarlo", async () => {
    const onSubmit = jest.fn().mockResolvedValue();
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await press(utils, "Hotel");

    await llenarFormularioValido(utils, { nombre: "Cena en el restaurante" });
    await pressSubmit(utils, "Agregar actividad");

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ icono: "building" }));
  });

  it("precarga los datos de la actividad cuando se edita una existente", async () => {
    const activityToEdit = {
      id: 5,
      title: "Cena de bienvenida",
      note: "Reservar mesa para 6",
      time: "20:00 - 22:00",
      icon: "utensils",
      lugarInteres: { id: 9, name: "Restó La Cyanea" },
    };

    const utils = await render(
      <AddActivityScreen {...baseProps} activityToEdit={activityToEdit} />
    );

    expect(utils.getByDisplayValue("Cena de bienvenida")).toBeTruthy();
    expect(utils.getByDisplayValue("Reservar mesa para 6")).toBeTruthy();
    expect(utils.getByDisplayValue("20:00")).toBeTruthy();
    expect(utils.getByDisplayValue("22:00")).toBeTruthy();
    expect(utils.getByText("Restó La Cyanea")).toBeTruthy();
    expect(utils.getByText("Guardar cambios")).toBeTruthy();
  });

  it("busca lugares al escribir en el buscador y permite seleccionar uno", async () => {
    searchTripPlaces.mockResolvedValue([
      {
        placeId: "p1",
        name: "Museo del Prado",
        address: "Calle Ruiz de Alarcón, Madrid",
      },
    ]);

    resolveTripPlace.mockResolvedValue({
      placeId: "p1",
      name: "Museo del Prado",
      address: "Calle Ruiz de Alarcón, Madrid",
      lat: 40.415,
      lng: -3.693,
      category: "museum",
      metadata: { types: ["museum"] },
    });

    saveActivityLocation.mockResolvedValue({
      id: 99,
      name: "Museo del Prado",
    });

    const utils = await render(
      <AddActivityScreen {...baseProps} />
    );

    await press(utils, "Seleccionar ubicación");

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Buscar un lugar..."),
        "Museo"
      );
    });

    await waitFor(() =>
      expect(utils.getByText("Museo del Prado")).toBeTruthy()
    );

    expect(searchTripPlaces).toHaveBeenCalledWith(42, "Museo");

    await press(utils, "Museo del Prado");

    await waitFor(() =>
      expect(resolveTripPlace).toHaveBeenCalledWith(42, "p1")
    );

    expect(saveActivityLocation).toHaveBeenCalledWith(42, {
      placeId: "p1",
      name: "Museo del Prado",
      address: "Calle Ruiz de Alarcón, Madrid",
      lat: 40.415,
      lng: -3.693,
      category: "museum",
      metadata: { types: ["museum"] },
    });
  });

  it("muestra error si falla la búsqueda de lugares", async () => {
    searchTripPlaces.mockRejectedValue(new Error("No se pudieron buscar lugares."));

    const utils = await render(<AddActivityScreen {...baseProps} />);

    await press(utils, "Seleccionar ubicación");

    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Buscar un lugar..."), "Museo");
    });

    await waitFor(() => expect(utils.getByText("No se pudieron buscar lugares.")).toBeTruthy());
  });
});