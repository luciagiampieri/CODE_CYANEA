/**
 * Nueva actividad: sugerir los lugares guardados del viaje desde "Nombre" y en "Ubicación".
 * Elegir uno completa nombre y ubicación en un paso (sin Google) y vincula la actividad al
 * guardado (vincularGuardado), para que en el mapa figure como en el itinerario.
 */
import { Platform } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { simularDialogos } from "./helpers/dialogosSimulados";
import AddActivityScreen from "../screens/AddActivityScreen";
import { getTripPlaces, resolveTripPlace, saveActivityLocation, searchTripPlaces } from "../services/api";

jest.mock("../services/api", () => ({
  getTripPlaces: jest.fn(),
  searchTripPlaces: jest.fn(),
  saveActivityLocation: jest.fn(),
  resolveTripPlace: jest.fn(),
}));

const PRADO = { id: 1, name: "Museo del Prado", address: "Madrid", lat: 40.41, lng: -3.69, category: "Museo", scheduledDays: [] };
const GIJON = {
  id: 2,
  name: "Café Gijón",
  address: "Madrid",
  lat: 40.42,
  lng: -3.69,
  category: "Cafetería",
  scheduledDays: [{ dayId: 11, dayIndex: 2, date: "2026-12-02" }],
};
const RETIRO = { id: 3, name: "Parque del Retiro", address: "Madrid", lat: 40.41, lng: -3.68, category: "Parque", scheduledDays: [] };

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  onSubmit: jest.fn(),
  dayLabel: "Día 1 - lunes",
  tripId: 42,
  activityToEdit: null,
  onCancelEdit: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "web";
  simularDialogos({ confirma: false });
  getTripPlaces.mockResolvedValue([PRADO, GIJON, RETIRO]);
  searchTripPlaces.mockResolvedValue([]);
});

async function renderPantalla(props = {}) {
  const utils = await render(<AddActivityScreen {...baseProps} {...props} />);
  await waitFor(() => expect(getTripPlaces).toHaveBeenCalledWith(42));
  return utils;
}

async function enfocarNombre(utils) {
  await act(async () => {
    fireEvent(utils.getByTestId("actividad-nombre"), "focus");
  });
}

async function escribirNombre(utils, texto) {
  await act(async () => {
    fireEvent.changeText(utils.getByTestId("actividad-nombre"), texto);
  });
}

async function elegirHoras(utils) {
  await act(async () => {
    fireEvent(utils.getByLabelText("Hora de inicio"), "change", { target: { value: "10:00" } });
  });
  await act(async () => {
    fireEvent(utils.getByLabelText("Hora de fin"), "change", { target: { value: "12:00" } });
  });
}

async function enviar(utils) {
  await act(async () => {
    const botones = utils.getAllByText("Agregar actividad");
    fireEvent.press(botones[botones.length - 1]);
  });
}

describe("sugerencias de guardados en 'Nombre'", () => {
  it("al enfocar el campo vacío muestra en lista los guardados sin agendar, sin 'Ver todos' si son 3 o menos", async () => {
    const utils = await renderPantalla();

    await enfocarNombre(utils);

    expect(utils.getByTestId("guardado-opcion-1")).toBeTruthy();
    expect(utils.getByTestId("guardado-opcion-3")).toBeTruthy();
    expect(utils.queryByTestId("guardado-opcion-2")).toBeNull();
    expect(utils.getByText("Museo · Sin día asignado")).toBeTruthy();
    expect(utils.queryByTestId("guardados-ver-todos")).toBeNull();
  });

  it("mientras se escribe muestra los que coinciden, sin distinguir tildes, con su detalle", async () => {
    const utils = await renderPantalla();
    await enfocarNombre(utils);

    await escribirNombre(utils, "gijon");

    expect(utils.getByTestId("guardado-opcion-2")).toBeTruthy();
    expect(utils.getByText("Ya en el itinerario · Día 2")).toBeTruthy();

    await escribirNombre(utils, "museo");
    expect(utils.getByTestId("guardado-opcion-1")).toBeTruthy();
    expect(utils.getByText("Museo · Sin día asignado")).toBeTruthy();
  });

  it("si nada coincide no muestra la lista y se sigue escribiendo libre", async () => {
    const utils = await renderPantalla();
    await enfocarNombre(utils);

    await escribirNombre(utils, "zzz");

    expect(utils.queryByTestId("sugerencias-guardados")).toBeNull();
    expect(utils.getByTestId("actividad-nombre").props.value).toBe("zzz");
  });

  it("si el viaje no tiene guardados no muestra nada", async () => {
    getTripPlaces.mockResolvedValue([]);
    const utils = await renderPantalla();

    await enfocarNombre(utils);

    expect(utils.queryByTestId("sugerencias-guardados")).toBeNull();
  });

  it("al elegir uno completa nombre y ubicación sin buscar en Google y la actividad se vincula", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const utils = await renderPantalla({ onSubmit });
    await enfocarNombre(utils);

    await act(async () => {
      fireEvent.press(utils.getByTestId("guardado-opcion-1"));
    });

    expect(utils.getByTestId("actividad-nombre").props.value).toBe("Museo del Prado");
    expect(utils.getByTestId("aviso-guardado-vinculado")).toBeTruthy();
    expect(utils.queryByTestId("sugerencias-guardados")).toBeNull();
    expect(resolveTripPlace).not.toHaveBeenCalled();
    expect(saveActivityLocation).not.toHaveBeenCalled();

    await elegirHoras(utils);
    await enviar(utils);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({ nombre: "Museo del Prado", idLugarInteres: 1, vincularGuardado: true })
    );
  });

  it("la ✕ del aviso desvincula y limpia la ubicación sin borrar el nombre", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const utils = await renderPantalla({ onSubmit });
    await enfocarNombre(utils);
    await act(async () => {
      fireEvent.press(utils.getByTestId("guardado-opcion-3"));
    });

    await act(async () => {
      fireEvent.press(utils.getByLabelText("Desvincular lugar guardado"));
    });

    expect(utils.queryByTestId("aviso-guardado-vinculado")).toBeNull();
    expect(utils.getByTestId("actividad-nombre").props.value).toBe("Parque del Retiro");
    expect(utils.getByText("Seleccionar ubicación")).toBeTruthy();

    await elegirHoras(utils);
    await enviar(utils);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const datos = onSubmit.mock.calls[0][0];
    expect(datos.idLugarInteres).toBeNull();
    expect(datos.vincularGuardado).toBeUndefined();
  });
});

describe("edición", () => {
  const editable = {
    id: 5,
    title: "Desayuno",
    note: "",
    time: "09:00 - 10:00",
    icon: "utensils",
    lugarInteres: { id: 9, name: "Restó La Cyanea" },
  };

  it("una actividad que ya tiene ubicación no muestra sugerencias", async () => {
    const utils = await renderPantalla({ activityToEdit: editable });

    await enfocarNombre(utils);
    await escribirNombre(utils, "");

    expect(utils.queryByTestId("sugerencias-guardados")).toBeNull();
  });

  it("una actividad vinculada a un guardado muestra el aviso", async () => {
    const utils = await renderPantalla({
      activityToEdit: { ...editable, idLugarInteresViaje: 7, lugarInteres: PRADO },
    });

    expect(utils.getByTestId("aviso-guardado-vinculado")).toBeTruthy();
  });
});

describe("selector de 'Ubicación'", () => {
  it("antes de escribir muestra 'Guardados del viaje' y elegir uno vincula sin Google", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const utils = await renderPantalla({ onSubmit });

    await act(async () => {
      fireEvent.press(utils.getByText("Seleccionar ubicación"));
    });

    expect(utils.getByTestId("ubicacion-guardados")).toBeTruthy();
    expect(utils.getByText("Guardados del viaje")).toBeTruthy();
    expect(utils.getByTestId("ubicacion-guardado-2")).toBeTruthy();

    await act(async () => {
      fireEvent.press(utils.getByTestId("ubicacion-guardado-3"));
    });

    expect(utils.getByTestId("aviso-guardado-vinculado")).toBeTruthy();
    // El nombre estaba vacío: toma el del lugar.
    expect(utils.getByTestId("actividad-nombre").props.value).toBe("Parque del Retiro");
    expect(resolveTripPlace).not.toHaveBeenCalled();

    await elegirHoras(utils);
    await enviar(utils);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ idLugarInteres: 3, vincularGuardado: true }));
  });

  it("elegir desde 'Ubicación' no pisa un nombre ya escrito", async () => {
    const utils = await renderPantalla();
    await escribirNombre(utils, "Picnic");

    await act(async () => {
      fireEvent.press(utils.getByText("Seleccionar ubicación"));
    });
    await act(async () => {
      fireEvent.press(utils.getByTestId("ubicacion-guardado-3"));
    });

    expect(utils.getByTestId("actividad-nombre").props.value).toBe("Picnic");
  });
});

describe("'Ver todos tus guardados'", () => {
  const SOL = { id: 4, name: "Puerta del Sol", address: "Madrid", lat: 40.41, lng: -3.7, category: "Plaza", scheduledDays: [] };
  const BOTANICO = {
    id: 5,
    name: "Real Jardín Botánico, el más lindo de la ciudad para pasear un rato",
    address: "Madrid",
    lat: 40.41,
    lng: -3.69,
    category: "Jardín botánico",
    scheduledDays: [],
  };
  const PALACIO = {
    id: 6,
    name: "Palacio Real",
    address: "Madrid",
    lat: 40.41,
    lng: -3.71,
    category: "Palacio",
    scheduledDays: [{ dayId: 12, dayIndex: 3, date: "2026-12-03" }],
  };

  beforeEach(() => {
    // Del más nuevo al más viejo, como la API.
    getTripPlaces.mockResolvedValue([BOTANICO, SOL, GIJON, PRADO, PALACIO, RETIRO]);
  });

  async function abrirHoja(utils) {
    await enfocarNombre(utils);
    await act(async () => {
      fireEvent.press(utils.getByTestId("guardados-ver-todos"));
    });
  }

  it("con el campo vacío muestra los 3 últimos sin agendar y 'Ver todos tus guardados (N)' con el total", async () => {
    const utils = await renderPantalla();

    await enfocarNombre(utils);

    expect(utils.getByTestId("guardado-opcion-5")).toBeTruthy();
    expect(utils.getByTestId("guardado-opcion-4")).toBeTruthy();
    expect(utils.getByTestId("guardado-opcion-1")).toBeTruthy();
    expect(utils.queryByTestId("guardado-opcion-3")).toBeNull();
    expect(utils.getByText("Ver todos tus guardados (6)")).toBeTruthy();
  });

  it("abre la hoja con todos: primero 'Sin agendar' y después 'Ya en el itinerario'", async () => {
    const utils = await renderPantalla();

    await abrirHoja(utils);

    expect(utils.getByTestId("hoja-guardados")).toBeTruthy();
    expect(utils.getByTestId("hoja-guardados-grupo-sin-agendar")).toHaveTextContent("Sin agendar");
    expect(utils.getByTestId("hoja-guardados-grupo-itinerario")).toHaveTextContent("Ya en el itinerario");
    [5, 4, 1, 3, 2, 6].forEach((id) => expect(utils.getByTestId(`hoja-guardado-${id}`)).toBeTruthy());
    expect(utils.getByText("Ya en el itinerario · Día 3")).toBeTruthy();
  });

  it("el buscador filtra sin distinguir tildes y deja solo el grupo que corresponde", async () => {
    const utils = await renderPantalla();
    await abrirHoja(utils);

    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Buscar en tus guardados"), "gijon");
    });

    expect(utils.getByTestId("hoja-guardado-2")).toBeTruthy();
    expect(utils.queryByTestId("hoja-guardado-1")).toBeNull();
    expect(utils.queryByTestId("hoja-guardados-grupo-sin-agendar")).toBeNull();
    expect(utils.getByTestId("hoja-guardados-grupo-itinerario")).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Buscar en tus guardados"), "zzz");
    });
    expect(utils.getByText("No hay guardados que coincidan con «zzz».")).toBeTruthy();
  });

  it("elegir uno de la hoja completa nombre y ubicación, vincula y cierra la hoja", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const utils = await renderPantalla({ onSubmit });
    await abrirHoja(utils);

    await act(async () => {
      fireEvent.press(utils.getByTestId("hoja-guardado-3"));
    });

    expect(utils.queryByTestId("hoja-guardados")).toBeNull();
    expect(utils.getByTestId("actividad-nombre").props.value).toBe("Parque del Retiro");
    expect(utils.getByTestId("aviso-guardado-vinculado")).toBeTruthy();

    await elegirHoras(utils);
    await enviar(utils);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ idLugarInteres: 3, vincularGuardado: true }));
  });

  it("cerrar la hoja con la flecha no cambia el formulario", async () => {
    const utils = await renderPantalla();
    await abrirHoja(utils);

    await act(async () => {
      fireEvent.press(utils.getByLabelText("Volver"));
    });

    expect(utils.queryByTestId("hoja-guardados")).toBeNull();
    expect(utils.getByTestId("actividad-nombre").props.value).toBe("");
    expect(utils.queryByTestId("aviso-guardado-vinculado")).toBeNull();
  });
});
