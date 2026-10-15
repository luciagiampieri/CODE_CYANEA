/**
 * US: Sugerir entradas y reservas para actividades (frontend).
 *
 * El backend decide si corresponde recomendar y devuelve:
 *   - `RecomendacionEntradas` en la actividad creada o modificada, o
 *   - `recomendacionEntradas` + `googlePlaceIdEntradas` dentro de la advertencia de horario.
 * Se muestra solo al registrar o modificar la actividad, en el diálogo de mensajes de
 * la app (`appAlert`, el mismo del "Éxito"; en los tests delega en `Alert.alert`): el
 * mensaje de éxito, qué conviene hacer y los botones "Ahora no" ("Entendido" si no hay
 * nada para recordar), "Recordármelo" y la acción en línea (comprar, reservar o ver el
 * sitio oficial). "Recordármelo" se prueba en RecordarTareaEntradas.test.js.
 */
import { Alert, Linking, Platform } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import AddActivityScreen from "../screens/AddActivityScreen";
import {
  AVISO_SIN_ENLACE,
  accionPrincipal,
  descripcionCorta,
  dominioDe,
  enlaceSitioOficial,
  normalizarRecomendacion,
  recomendacionDeRespuesta,
  tituloRecomendacion,
  urlSegura,
} from "../utils/recomendacionEntradas";

jest.mock("../services/api", () => ({
  searchTripPlaces: jest.fn(),
  saveActivityLocation: jest.fn(),
  resolveTripPlace: jest.fn(),
}));

const MENSAJE_ANTICIPADAS =
  "Te recomendamos comprar las entradas antes de tu visita para asegurarte el ingreso.";

function recomendacion(cambios = {}) {
  return {
    tipo: "ENTRADAS_ANTICIPADAS",
    mensaje: MENSAJE_ANTICIPADAS,
    nombreLugar: "Museo del Prado",
    googlePlaceId: "ChIJprado",
    urlSitioOficial: "https://www.museodelprado.es/",
    urlAccion: "https://entradas.museodelprado.es/comprar",
    urlRecomendada: "https://entradas.museodelprado.es/comprar",
    avisoEnlace: null,
    evidencia: "es necesario comprar la entrada online con antelación",
    fuenteEvidencia: "https://www.museodelprado.es/entradas",
    verificada: true,
    ...cambios,
  };
}

function reservaOpenTable(cambios = {}) {
  return recomendacion({
    tipo: "RESERVA_DISPONIBLE",
    mensaje: "Este lugar acepta reservas desde su sitio oficial.",
    nombreLugar: "Hard Rock Cafe",
    urlSitioOficial: "https://cafe.hardrock.com/orlando/",
    urlAccion: null,
    urlReservaExterna: "https://www.opentable.com/hard-rock-cafe-reservations-orlando?restref=213622",
    plataformaReserva: "OpenTable",
    evidencia: "BOOK YOUR TABLE",
    ...cambios,
  });
}

function actividadGuardada(rec = null, id = 7) {
  return { IdActividad: id, Nombre: "Museo del Prado", RecomendacionEntradas: rec };
}

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  onSubmit: jest.fn(),
  dayLabel: "Día 1 - lunes",
  tripId: 42,
  activityToEdit: null,
  onCancelEdit: jest.fn(),
};

const actividadEditable = {
  id: 7,
  title: "Museo del Prado",
  note: "",
  time: "10:00 - 12:00",
  icon: "camera",
  lugarInteres: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "web";
  window.alert = jest.fn();
  window.confirm = jest.fn().mockReturnValue(true);
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  Platform.OS = "web";
  Linking.openURL.mockRestore?.();
  Alert.alert.mockRestore?.();
});

function dialogo() {
  const [titulo, mensaje, botones, opciones] = Alert.alert.mock.calls[Alert.alert.mock.calls.length - 1];
  return { titulo, mensaje, botones, opciones: opciones || {}, textos: (botones || []).map((b) => b.text) };
}

function boton(texto) {
  return dialogo().botones.find((b) => b.text === texto);
}

/* ----------------------------- helpers ----------------------------- */

async function elegirHora(utils, indice, valor) {
  await act(async () => {
    const label = indice === 0 ? "Hora de inicio" : "Hora de fin";
    fireEvent(utils.getByLabelText(label), "change", { target: { value: valor } });
  });
}

async function registrar(onSubmit, { nombre = "Museo del Prado", inicio = "10:00", fin = "12:00" } = {}) {
  const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText("Visita al museo"), nombre);
  });
  await elegirHora(utils, 0, inicio);
  await elegirHora(utils, 1, fin);
  await act(async () => {
    const botones = utils.getAllByText("Agregar actividad");
    fireEvent.press(botones[botones.length - 1]);
  });
  return utils;
}

async function editar(onSubmit, cambios = {}) {
  const utils = await render(
    <AddActivityScreen {...baseProps} onSubmit={onSubmit} activityToEdit={{ ...actividadEditable, ...cambios }} />
  );
  await act(async () => {
    fireEvent.press(utils.getByText("Guardar cambios"));
  });
  return utils;
}

/* ------------------------- utilidades puras ------------------------- */

describe("normalizarRecomendacion", () => {
  it("acepta solo recomendaciones verificadas de los tipos conocidos", () => {
    expect(normalizarRecomendacion(recomendacion())).toEqual(
      expect.objectContaining({ tipo: "ENTRADAS_ANTICIPADAS", urlAccion: "https://entradas.museodelprado.es/comprar" })
    );
    expect(normalizarRecomendacion(recomendacion({ verificada: false }))).toBeNull();
    expect(normalizarRecomendacion(recomendacion({ verificada: undefined }))).toBeNull();
    expect(normalizarRecomendacion(recomendacion({ tipo: "SIN_INFORMACION" }))).toBeNull();
    expect(normalizarRecomendacion(null)).toBeNull();
  });

  it("descarta enlaces que no son web y usa el sitio oficial como alternativa", () => {
    const rec = normalizarRecomendacion(recomendacion({ urlAccion: "javascript:alert(1)" }));
    expect(rec.urlAccion).toBeNull();
    expect(accionPrincipal(rec).url).toBe("https://www.museodelprado.es/");
  });

  it("sin ningún enlace informa que no se pudo obtener el enlace oficial", () => {
    const rec = normalizarRecomendacion(recomendacion({ urlAccion: null, urlSitioOficial: null }));
    expect(accionPrincipal(rec)).toBeNull();
    expect(rec.avisoEnlace).toBe(AVISO_SIN_ENLACE);
  });

  it("lee la recomendación de la actividad o de la advertencia de horario", () => {
    expect(recomendacionDeRespuesta(actividadGuardada(recomendacion())).tipo).toBe("ENTRADAS_ANTICIPADAS");
    expect(
      recomendacionDeRespuesta({ advertencia: true, recomendacionEntradas: recomendacion({ tipo: "RESERVA" }) }).tipo
    ).toBe("RESERVA");
    expect(recomendacionDeRespuesta(actividadGuardada(null))).toBeNull();
    expect(recomendacionDeRespuesta(undefined)).toBeNull();
  });

  it("arma títulos, descripciones, acción principal y enlace al sitio", () => {
    expect(tituloRecomendacion("RESERVA")).toBe("Reservá antes de ir");
    expect(tituloRecomendacion("ENTRADAS_ANTICIPADAS")).toBe("Comprá tus entradas antes");
    expect(tituloRecomendacion("ENTRADAS_PRESENCIALES")).toBe("Entradas en boletería");
    expect(tituloRecomendacion("RESERVA_DISPONIBLE")).toBe("Podés reservar tu lugar");
    expect(descripcionCorta({ tipo: "ENTRADAS_PRESENCIALES" })).toContain("Llegá con tiempo");

    const compra = normalizarRecomendacion(recomendacion());
    expect(accionPrincipal(compra)).toEqual(
      expect.objectContaining({ texto: "Comprar entradas", url: "https://entradas.museodelprado.es/comprar" })
    );
    expect(enlaceSitioOficial(compra)).toEqual({ texto: "Ver sitio oficial", url: "https://www.museodelprado.es/" });
    expect(accionPrincipal(normalizarRecomendacion(recomendacion({ tipo: "RESERVA" }))).texto).toBe("Reservar");

    const soloSitio = normalizarRecomendacion(recomendacion({ urlAccion: null }));
    expect(accionPrincipal(soloSitio).texto).toBe("Ir al sitio oficial");
    expect(enlaceSitioOficial(soloSitio)).toBeNull();

    const presencial = normalizarRecomendacion(recomendacion({ tipo: "ENTRADAS_PRESENCIALES" }));
    expect(accionPrincipal(presencial)).toBeNull();
    expect(enlaceSitioOficial(presencial).url).toBe("https://www.museodelprado.es/");

    const externa = normalizarRecomendacion(reservaOpenTable());
    expect(accionPrincipal(externa)).toEqual(
      expect.objectContaining({ texto: "Reservar en OpenTable", externa: true })
    );

    expect(dominioDe("https://www.museodelprado.es/entradas")).toBe("museodelprado.es");
    expect(urlSegura("ftp://x.org")).toBeNull();
  });

  it("usa la evidencia traducida al español cuando existe", () => {
    const rec = normalizarRecomendacion(
      recomendacion({ evidencia: "入館には事前予約が必要です", evidenciaEs: "Para ingresar es necesaria una reserva previa" })
    );
    expect(rec.evidencia).toBe("Para ingresar es necesaria una reserva previa");
  });
});

/* ------------- al registrar: diálogo con la recomendación ------------- */

describe("Recomendación al registrar o modificar la actividad", () => {
  it("CP2/CP4: muestra la recomendación con el éxito y el botón de compra oficial", async () => {
    const onSubmit = jest.fn().mockResolvedValue(actividadGuardada(recomendacion()));

    await registrar(onSubmit);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const { titulo, mensaje, textos, opciones, botones } = dialogo();
    expect(titulo).toBe("Comprá tus entradas antes");
    // La confirmación de guardado va en su propia franja, separada de la recomendación.
    expect(opciones.confirmacion).toBe("Actividad registrada");
    expect(mensaje).not.toContain("Actividad registrada correctamente.");
    // El lugar va en una píldora con ícono, no mezclado con el texto.
    expect(opciones.etiqueta).toEqual({ icono: "location-dot", texto: "Museo del Prado" });
    expect(opciones.icono).toBe("ticket");
    expect(mensaje).toBe(
      "Su sitio oficial recomienda sacarlas online antes de ir."
    );
    // "Ahora no" es la cruz del diálogo; quedan la compra (principal) y "Recordármelo" (con borde).
    expect(opciones.botonCerrar).toBe(true);
    expect(textos).toEqual(["Ahora no", "Recordármelo", "Comprar entradas"]);
    expect(botones[0].style).toBe("cancel");
    expect(botones[1]).toEqual(expect.objectContaining({ icono: "bell", variante: "contorno" }));
    expect(botones[2].icono).toBe("arrow-up-right-from-square");
    // Reemplaza al aviso de éxito: un solo mensaje.
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("la recomendación aparece con el formulario ya cerrado (la actividad está guardada)", async () => {
    const onSubmit = jest.fn().mockResolvedValue(actividadGuardada(recomendacion()));
    await registrar(onSubmit);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("CP9: el botón de la acción abre el enlace oficial y cierra el formulario", async () => {
    const onSubmit = jest.fn().mockResolvedValue(actividadGuardada(recomendacion()));
    await registrar(onSubmit);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    await act(async () => {
      await boton("Comprar entradas").onPress();
    });

    expect(Linking.openURL).toHaveBeenCalledWith("https://entradas.museodelprado.es/comprar");
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("CP14: 'Ahora no' cierra sin abrir nada", async () => {
    const onSubmit = jest.fn().mockResolvedValue(actividadGuardada(recomendacion()));
    await registrar(onSubmit);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    await act(async () => {
      boton("Ahora no").onPress?.();
    });

    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("CP1: reserva confirmada ofrece 'Reservar'", async () => {
    const onSubmit = jest.fn().mockResolvedValue(
      actividadGuardada(recomendacion({ tipo: "RESERVA", urlAccion: "https://www.museoreinasofia.es/reservas" }))
    );

    await registrar(onSubmit, { nombre: "Museo Reina Sofía" });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(dialogo().titulo).toBe("Reservá antes de ir");
    expect(dialogo().textos).toEqual(["Ahora no", "Recordármelo", "Reservar"]);
  });

  it("CP3/CP5: boletería ofrece ver el sitio oficial", async () => {
    const onSubmit = jest.fn().mockResolvedValue(
      actividadGuardada(recomendacion({ tipo: "ENTRADAS_PRESENCIALES", urlAccion: null }))
    );

    await registrar(onSubmit, { nombre: "Teatro Colón" });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(dialogo().titulo).toBe("Entradas en boletería");
    expect(dialogo().mensaje).toContain("Llegá con tiempo");
    // Nada para recordar: "Entendido" es el principal y el sitio oficial va con borde.
    expect(dialogo().textos).toEqual(["Ver sitio oficial", "Entendido"]);
    expect(dialogo().opciones.botonCerrar).toBe(false);
  });

  it("restaurante con OpenTable: nombra la plataforma y aclara que es externa", async () => {
    const onSubmit = jest.fn().mockResolvedValue(actividadGuardada(reservaOpenTable()));
    await registrar(onSubmit, { nombre: "Cena en Hard Rock" });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    expect(dialogo().titulo).toBe("Podés reservar tu lugar");
    expect(dialogo().mensaje).toContain("La reserva se hace en OpenTable, enlazada desde su sitio oficial.");
    expect(dialogo().textos).toEqual(["Ahora no", "Recordármelo", "Reservar en OpenTable"]);
    await act(async () => {
      await boton("Reservar en OpenTable").onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://www.opentable.com/hard-rock-cafe-reservations-orlando?restref=213622"
    );
  });

  it("sin ningún enlace oficial muestra el aviso y ofrece recordarlo sin enlace", async () => {
    const onSubmit = jest.fn().mockResolvedValue(
      actividadGuardada(recomendacion({ urlAccion: null, urlSitioOficial: null }))
    );

    await registrar(onSubmit);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(dialogo().mensaje).toContain(AVISO_SIN_ENLACE);
    expect(dialogo().textos).toEqual(["Ahora no", "Recordármelo"]);
  });

  it("CP13: la recomendación no impide guardar (se envía una sola vez)", async () => {
    const onSubmit = jest.fn().mockResolvedValue(actividadGuardada(recomendacion()));

    await registrar(onSubmit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][1]).toEqual({ ignorarAdvertencia: false });
  });

  it("CP16-CP19: sin recomendación confirmada solo se informa el éxito", async () => {
    const onSubmit = jest.fn().mockResolvedValue(actividadGuardada(null));

    await registrar(onSubmit, { nombre: "Cena con amigos" });

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.alert.mock.calls[0][0]).toContain("Actividad registrada correctamente.");
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("CP19: una recomendación no verificada no se muestra", async () => {
    const onSubmit = jest.fn().mockResolvedValue(actividadGuardada(recomendacion({ verificada: false })));

    await registrar(onSubmit);

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("CP21-CP23: si el guardado falla no hay recomendación", async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error("El servidor no responde."));

    const utils = await registrar(onSubmit);

    await waitFor(() => expect(utils.getByText("El servidor no responde.")).toBeTruthy());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("CP8-CP11: al editar sin cambio de lugar el backend no manda recomendación y solo se informa el éxito", async () => {
    const onSubmit = jest.fn().mockResolvedValue(actividadGuardada(null));

    await editar(onSubmit, { title: "Visita al Museo del Prado" });

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.alert.mock.calls[0][0]).toContain("Actividad editada correctamente.");
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("CP12: al editar con un lugar nuevo muestra su recomendación", async () => {
    const onSubmit = jest.fn().mockResolvedValue(actividadGuardada(recomendacion({ tipo: "RESERVA" })));

    await editar(onSubmit, { title: "Museo Reina Sofía" });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(dialogo().opciones.confirmacion).toBe("Actividad editada");
  });

  it("con advertencia de horario: al confirmar reenvía el lugar analizado y muestra la recomendación recibida", async () => {
    const advertencia = {
      advertencia: true,
      tipo: "fuera_de_horario",
      resumen: "Fuera del horario del lugar (09:00 a 18:00)",
      nombreLugar: "Museo del Prado",
      horariosApertura: "09:00 - 18:00",
      recomendacionEntradas: recomendacion(),
      googlePlaceIdEntradas: "ChIJprado",
    };
    const onSubmit = jest.fn().mockResolvedValueOnce(advertencia).mockResolvedValueOnce(actividadGuardada(null, 9));

    await registrar(onSubmit, { inicio: "19:00", fin: "20:00" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][1]).toEqual({ ignorarAdvertencia: true });
    expect(onSubmit.mock.calls[1][0]).toEqual(expect.objectContaining({ googlePlaceIdEntradas: "ChIJprado" }));
    // La recomendación no se mezcla con la advertencia: aparece recién al guardar.
    expect(window.confirm.mock.calls[0][0]).not.toContain("entradas antes");
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(dialogo().titulo).toBe("Comprá tus entradas antes");
  });

  it("si el usuario corrige el horario, no reenvía el lugar ni muestra la recomendación anterior", async () => {
    window.confirm.mockReturnValue(false);
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce({ advertencia: true, tipo: "fuera_de_horario", recomendacionEntradas: recomendacion(), googlePlaceIdEntradas: "ChIJprado" })
      .mockResolvedValueOnce(actividadGuardada(null));

    const utils = await registrar(onSubmit, { inicio: "19:00", fin: "20:00" });
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    await elegirHora(utils, 0, "10:00");
    await elegirHora(utils, 1, "12:00");
    await act(async () => {
      const botones = utils.getAllByText("Agregar actividad");
      fireEvent.press(botones[botones.length - 1]);
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0].googlePlaceIdEntradas).toBeUndefined();
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("en nativo también usa el diálogo de la app", async () => {
    Platform.OS = "android";
    const onSubmit = jest.fn().mockResolvedValue(actividadGuardada(recomendacion()));

    await editar(onSubmit);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(dialogo().titulo).toBe("Comprá tus entradas antes");
  });
});
