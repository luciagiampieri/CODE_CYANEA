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

describe("con varios destinos: primero los guardados del destino del día", () => {
  const MADRID = { id: 21, name: "Madrid", lat: 40.4168, lng: -3.7038, noches: 3, nochesEnViaje: 0 };
  const BARCELONA = { id: 22, name: "Barcelona", lat: 41.3874, lng: 2.1686, noches: 2, nochesEnViaje: 0 };
  const SAGRADA = { id: 11, name: "Sagrada Familia", address: "Barcelona", lat: 41.4036, lng: 2.1744, category: "Iglesia", scheduledDays: [] };
  const BATLLO = { id: 12, name: "Casa Batlló", address: "Barcelona", lat: 41.3916, lng: 2.1649, category: "Museo", scheduledDays: [] };
  const BOQUERIA = { id: 13, name: "La Boqueria", address: "Barcelona", lat: 41.3817, lng: 2.1716, category: "Mercado", scheduledDays: [] };

  // 1 → 4 dic en Madrid, 4 → 6 dic en Barcelona.
  const dias = [1, 2, 3, 4, 5, 6].map((n) => ({
    dayId: 100 + n,
    dayIndex: n,
    fechaRaw: `2030-12-0${n}`,
    dayDateText: `${n} dic`,
    actividades: [],
  }));
  const propsViaje = {
    dias,
    destinos: [MADRID, BARCELONA],
    fechaInicio: "2030-12-01",
    fechaFin: "2030-12-06",
  };
  const ids = (utils) => utils.getAllByTestId(/^guardado-opcion-/).map((nodo) => nodo.props.testID);

  beforeEach(() => {
    // Del más nuevo al más viejo, como la API: primero los de Barcelona.
    getTripPlaces.mockResolvedValue([SAGRADA, BATLLO, BOQUERIA, PRADO, RETIRO]);
  });

  it("en un día de Madrid, el campo vacío sugiere primero los de Madrid y completa con otros", async () => {
    const utils = await renderPantalla({ ...propsViaje, diaActualId: 101 });
    await enfocarNombre(utils);

    expect(ids(utils)).toEqual(["guardado-opcion-1", "guardado-opcion-3", "guardado-opcion-11"]);
    expect(utils.getByText("Iglesia · Barcelona · Sin día asignado")).toBeTruthy();
    expect(utils.getByText("Ver todos tus guardados (5)")).toBeTruthy();
  });

  it("mientras se escribe también prioriza el destino del día", async () => {
    const utils = await renderPantalla({ ...propsViaje, diaActualId: 101 });
    await enfocarNombre(utils);
    await escribirNombre(utils, "a");

    expect(ids(utils)).toEqual(["guardado-opcion-1", "guardado-opcion-3", "guardado-opcion-11"]);
  });

  it("la hoja muestra 'En <destino>' y 'Otros destinos', todos elegibles", async () => {
    const utils = await renderPantalla({ ...propsViaje, diaActualId: 105 });
    await enfocarNombre(utils);
    await act(async () => {
      fireEvent.press(utils.getByTestId("guardados-ver-todos"));
    });

    expect(utils.getByTestId("hoja-guardados-grupo-destino-del-dia")).toHaveTextContent(/En Barcelona/);
    expect(utils.getByTestId("hoja-guardados-grupo-otros-destinos")).toHaveTextContent(/Otros destinos/);

    await act(async () => {
      fireEvent.press(utils.getByTestId("hoja-guardado-1"));
    });
    expect(utils.queryByTestId("hoja-guardados")).toBeNull();
    expect(utils.getByTestId("actividad-nombre").props.value).toBe("Museo del Prado");
  });

  it("al editar, cambiar de día cambia el destino que se prioriza", async () => {
    const actividad = { id: 5, title: "", note: "", time: "09:00 - 10:00", icon: "utensils", lugarInteres: null };
    const utils = await renderPantalla({ ...propsViaje, diaActualId: 101, activityToEdit: actividad });
    await enfocarNombre(utils);
    expect(ids(utils)[0]).toBe("guardado-opcion-1");

    await act(async () => {
      fireEvent.press(utils.getByTestId("actividad-dia-105"));
    });
    await enfocarNombre(utils);
    expect(ids(utils)).toEqual(["guardado-opcion-11", "guardado-opcion-12", "guardado-opcion-13"]);
  });

  it("con un solo destino queda como siempre", async () => {
    const utils = await renderPantalla({ ...propsViaje, destinos: [MADRID], diaActualId: 101 });
    await enfocarNombre(utils);

    expect(ids(utils)).toEqual(["guardado-opcion-11", "guardado-opcion-12", "guardado-opcion-13"]);
    expect(utils.getByText("Iglesia · Sin día asignado")).toBeTruthy();
  });
});
