import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import InvitationsScreen from "../screens/InvitationsScreen";
import { appAlert } from "../components/ui/AppDialog";

import {
  getNotifications,
  getPendingInvitations,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  respondToInvitation,
  getNotificationsSocketUrl,
} from "../services/api";

jest.mock("../services/api", () => ({
  getNotifications: jest.fn(),
  getPendingInvitations: jest.fn(),
  markNotificationAsRead: jest.fn(),
  markAllNotificationsAsRead: jest.fn(),
  respondToInvitation: jest.fn(),
  getNotificationsSocketUrl: jest.fn(),
}));

// Los avisos de la pantalla pasan por appAlert: se reemplaza para verificar título y mensaje.
jest.mock("../components/ui/AppDialog", () => ({
  appAlert: jest.fn(),
}));

// Botón de volver del encabezado: se reemplaza por un Pressable identificable por su ícono.
jest.mock("../components/ui/IconCircleButton", () => {
  const React = require("react");
  const { Pressable } = require("react-native");

  return function IconCircleButton({ icon, onPress }) {
    return <Pressable testID={`icon-button-${icon}`} onPress={onPress} />;
  };
});

jest.mock("../components/ui/PrimaryButton", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");

  return function PrimaryButton({ label, onPress, testID }) {
    return (
      <Pressable testID={testID || `button-${label}`} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
  };
});

const mockGoBack = jest.fn();
const navigation = { goBack: mockGoBack };

const AVISO_CARGANDO = "Cargando notificaciones...";
const TEXTO_VACIO = "No tenés notificaciones pendientes.";
const TEXTO_VACIO_DETALLE = "Cuando haya novedades o te sumen a un viaje, aparecerán aquí.";

const invitacionSalta = {
  tripId: 5,
  title: "Viaje a Salta",
  destinations: [{ name: "Salta", country: "Argentina" }],
  status: "invitado",
  role: "participante",
};

const novedadSinLeer = (id, titulo = `Novedad ${id}`) => ({
  id,
  titulo,
  mensaje: `Mensaje de la novedad ${id}.`,
  fechaCreacion: "2026-09-02T10:00:00Z",
  leida: false,
  tipo: "participante_salio",
});

const novedadLeida = (id, titulo = `Novedad leída ${id}`) => ({
  ...novedadSinLeer(id, titulo),
  leida: true,
});

async function press(getters, texto) {
  await act(async () => {
    fireEvent.press(getters.getByText(texto));
  });
}

// Presiona la primera coincidencia del texto (por ejemplo, el primer "Marcar como leída").
async function pressPrimero(getters, texto) {
  await act(async () => {
    fireEvent.press(getters.getAllByText(texto)[0]);
  });
}

// Espera a que termine de cargar la lista: el encabezado recién aparece cuando se dejó de cargar.
async function renderPantallaCargada() {
  const utils = await render(<InvitationsScreen navigation={navigation} />);
  await waitFor(() => expect(utils.getByText("Notificaciones")).toBeTruthy());
  return utils;
}

// Dispara el "tirar para actualizar" del ScrollView buscando su control de actualización en el
// árbol renderizado (no depende de las consultas UNSAFE_ de testing-library).
async function tirarParaActualizar(utils) {
  let control = null;
  const recorrer = (nodo) => {
    if (!nodo || typeof nodo === "string" || control) return;
    if (Array.isArray(nodo)) return nodo.forEach(recorrer);
    if (nodo.props?.refreshControl) {
      control = nodo.props.refreshControl;
      return;
    }
    (nodo.children || []).forEach(recorrer);
  };
  recorrer(utils.toJSON());

  expect(control).toBeTruthy();
  await act(async () => {
    control.props.onRefresh();
  });
}

describe("US - Notificaciones e invitaciones (InvitationsScreen)", () => {
  let logSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    getPendingInvitations.mockResolvedValue([]);
    getNotifications.mockResolvedValue([]);
    markNotificationAsRead.mockResolvedValue({ message: "OK" });
    markAllNotificationsAsRead.mockResolvedValue({ message: "OK" });
    respondToInvitation.mockResolvedValue({});
    // Por defecto no hay conexión en vivo; los tests del socket la reemplazan.
    getNotificationsSocketUrl.mockRejectedValue(new Error("No socket in test"));

    // La pantalla loguea el fallo del socket a propósito; se evita ensuciar la salida.
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Carga inicial
  // ---------------------------------------------------------------------------
  describe("carga inicial", () => {
    it("pide las invitaciones pendientes y las novedades al montar la pantalla", async () => {
      await renderPantallaCargada();

      expect(getPendingInvitations).toHaveBeenCalledTimes(1);
      expect(getNotifications).toHaveBeenCalledTimes(1);
    });

    it("mientras carga muestra el aviso de carga", async () => {
      getPendingInvitations.mockReturnValueOnce(new Promise(() => {}));
      getNotifications.mockReturnValueOnce(new Promise(() => {}));

      const utils = await render(<InvitationsScreen navigation={navigation} />);

      expect(utils.getByText(AVISO_CARGANDO)).toBeTruthy();
      expect(utils.queryByText("Notificaciones")).toBeNull();
    });

    it("muestra el título y vuelve atrás con el botón del encabezado", async () => {
      const utils = await renderPantallaCargada();

      fireEvent.press(utils.getByTestId("icon-button-arrow-left"));

      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it("sin nada pendiente muestra el estado vacío y 'Estás al día'", async () => {
      const utils = await renderPantallaCargada();

      expect(utils.getByText(TEXTO_VACIO)).toBeTruthy();
      expect(utils.getByText(TEXTO_VACIO_DETALLE)).toBeTruthy();
      expect(utils.getByText("Estás al día")).toBeTruthy();
      expect(utils.queryByText("Marcar todas como leídas")).toBeNull();
      expect(utils.queryByText("Invitaciones pendientes")).toBeNull();
      expect(utils.queryByText("Novedades")).toBeNull();
    });

    it("si falla la carga de invitaciones y de novedades muestra el estado vacío", async () => {
      getPendingInvitations.mockRejectedValue(new Error("sin conexión"));
      getNotifications.mockRejectedValue(new Error("sin conexión"));

      const utils = await renderPantallaCargada();

      expect(utils.getByText(TEXTO_VACIO)).toBeTruthy();
    });

    it("si falla solo la carga de invitaciones, igual muestra las novedades", async () => {
      getPendingInvitations.mockRejectedValue(new Error("sin conexión"));
      getNotifications.mockResolvedValue([novedadSinLeer(1)]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Novedad 1")).toBeTruthy();
      expect(utils.queryByText("Invitaciones pendientes")).toBeNull();
    });

    it("si falla solo la carga de novedades, igual muestra las invitaciones", async () => {
      getPendingInvitations.mockResolvedValue([invitacionSalta]);
      getNotifications.mockRejectedValue(new Error("sin conexión"));

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Viaje a Salta")).toBeTruthy();
      expect(utils.queryByText("Novedades")).toBeNull();
    });

    it("si el servidor devuelve un formato inesperado, avisa y muestra el estado vacío", async () => {
      getPendingInvitations.mockResolvedValue(null);

      const utils = await renderPantallaCargada();

      expect(appAlert).toHaveBeenCalledWith("Error", expect.any(String));
      expect(utils.getByText(TEXTO_VACIO)).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Resumen y secciones
  // ---------------------------------------------------------------------------
  describe("resumen y secciones", () => {
    it("el resumen cuenta las invitaciones pendientes y las novedades sin leer", async () => {
      getPendingInvitations.mockResolvedValue([invitacionSalta]);
      getNotifications.mockResolvedValue([novedadSinLeer(1), novedadSinLeer(2), novedadLeida(3)]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("1 invitación pendiente · 2 sin leer")).toBeTruthy();
    });

    it("el resumen usa el plural con varias invitaciones", async () => {
      getPendingInvitations.mockResolvedValue([invitacionSalta, { ...invitacionSalta, tripId: 6 }]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("2 invitaciones pendientes")).toBeTruthy();
    });

    it("con todo leído el resumen dice 'Estás al día'", async () => {
      getNotifications.mockResolvedValue([novedadLeida(1), novedadLeida(2)]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Estás al día")).toBeTruthy();
      expect(utils.queryByText(/sin leer/)).toBeNull();
    });

    it("las invitaciones no cuentan como novedades sin leer", async () => {
      getPendingInvitations.mockResolvedValue([invitacionSalta]);
      getNotifications.mockResolvedValue([novedadLeida(1)]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("1 invitación pendiente")).toBeTruthy();
    });

    it("con invitaciones y novedades muestra las dos secciones", async () => {
      getPendingInvitations.mockResolvedValue([invitacionSalta]);
      getNotifications.mockResolvedValue([novedadSinLeer(1)]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Invitaciones pendientes")).toBeTruthy();
      expect(utils.getByText("Novedades")).toBeTruthy();
    });

    it("con solo novedades no aparece la sección de invitaciones", async () => {
      getNotifications.mockResolvedValue([novedadSinLeer(1)]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Novedades")).toBeTruthy();
      expect(utils.queryByText("Invitaciones pendientes")).toBeNull();
    });

    it("con solo invitaciones no aparece la sección de novedades", async () => {
      getPendingInvitations.mockResolvedValue([invitacionSalta]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Invitaciones pendientes")).toBeTruthy();
      expect(utils.queryByText("Novedades")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Invitaciones pendientes
  // ---------------------------------------------------------------------------
  describe("invitaciones pendientes", () => {
    beforeEach(() => {
      getPendingInvitations.mockResolvedValue([invitacionSalta]);
    });

    it("muestra la invitación con su viaje, destino, rol y acciones", async () => {
      const utils = await renderPantallaCargada();

      expect(utils.getByText("Viaje a Salta")).toBeTruthy();
      expect(utils.getByText("Te invitaron a un viaje")).toBeTruthy();
      expect(utils.getByText("Destino: Salta, Argentina")).toBeTruthy();
      expect(utils.getByText("Rol propuesto: participante")).toBeTruthy();
      expect(utils.getByText("Rechazar")).toBeTruthy();
      expect(utils.getByText("Unirme")).toBeTruthy();
      // Las invitaciones se responden, no se "marcan como leídas".
      expect(utils.queryByText("Marcar como leída")).toBeNull();
      expect(utils.queryByText("Marcar todas como leídas")).toBeNull();
    });

    it("une varios destinos con un punto medio", async () => {
      getPendingInvitations.mockResolvedValue([
        {
          ...invitacionSalta,
          destinations: [
            { name: "Salta", country: "Argentina" },
            { name: "Jujuy", country: "Argentina" },
          ],
        },
      ]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Destino: Salta, Argentina · Jujuy, Argentina")).toBeTruthy();
    });

    it("muestra solo el nombre si el destino no trae país", async () => {
      getPendingInvitations.mockResolvedValue([
        { ...invitacionSalta, destinations: [{ name: "Salta" }] },
      ]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Destino: Salta")).toBeTruthy();
    });

    it("sin destinos ni rol usa los valores por defecto", async () => {
      getPendingInvitations.mockResolvedValue([
        { tripId: 8, title: "Viaje sorpresa", destinations: [], status: "invitado" },
      ]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Destino: Destino a confirmar")).toBeTruthy();
      expect(utils.getByText("Rol propuesto: Participante")).toBeTruthy();
    });

    it("acepta los datos de la invitación con los nombres alternativos del servidor", async () => {
      getPendingInvitations.mockResolvedValue([
        {
          IdViaje: 11,
          Titulo: "Viaje a Mendoza",
          Destinos: [{ name: "Mendoza", country: "Argentina" }],
          rol: "administrador",
        },
      ]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Viaje a Mendoza")).toBeTruthy();
      expect(utils.getByText("Destino: Mendoza, Argentina")).toBeTruthy();
      expect(utils.getByText("Rol propuesto: administrador")).toBeTruthy();

      await press(utils, "Unirme");

      await waitFor(() => expect(respondToInvitation).toHaveBeenCalledWith(11, "aceptar"));
    });

    it("muestra la fecha de la invitación cuando el servidor la manda", async () => {
      getPendingInvitations.mockResolvedValue([
        { ...invitacionSalta, fechaCreacion: "2026-09-28T15:00:00Z" },
      ]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText(/2026/)).toBeTruthy();
    });

    it("no muestra fecha si la que manda el servidor no es válida", async () => {
      getPendingInvitations.mockResolvedValue([{ ...invitacionSalta, fechaCreacion: "no es una fecha" }]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Viaje a Salta")).toBeTruthy();
      expect(utils.queryByText(/\d{4}/)).toBeNull();
    });

    it("al tocar 'Unirme' acepta la invitación, avisa y la quita del listado", async () => {
      getPendingInvitations.mockResolvedValueOnce([invitacionSalta]).mockResolvedValueOnce([]);
      respondToInvitation.mockResolvedValue({ message: "¡Te uniste al viaje!" });

      const utils = await renderPantallaCargada();

      await press(utils, "Unirme");

      await waitFor(() => expect(respondToInvitation).toHaveBeenCalledWith(5, "aceptar"));
      await waitFor(() => expect(appAlert).toHaveBeenCalledWith("Éxito", "¡Te uniste al viaje!"));
      await waitFor(() => expect(utils.queryByText("Viaje a Salta")).toBeNull());
      // Se recargó en segundo plano, sin volver a mostrar la pantalla de carga.
      expect(getPendingInvitations).toHaveBeenCalledTimes(2);
      expect(utils.queryByText(AVISO_CARGANDO)).toBeNull();
    });

    it("al tocar 'Rechazar' rechaza la invitación y usa el texto por defecto si no hay mensaje", async () => {
      getPendingInvitations.mockResolvedValueOnce([invitacionSalta]).mockResolvedValueOnce([]);
      respondToInvitation.mockResolvedValue({});

      const utils = await renderPantallaCargada();

      await press(utils, "Rechazar");

      await waitFor(() => expect(respondToInvitation).toHaveBeenCalledWith(5, "rechazar"));
      await waitFor(() =>
        expect(appAlert).toHaveBeenCalledWith("Éxito", "Invitación procesada correctamente.")
      );
      await waitFor(() => expect(utils.queryByText("Viaje a Salta")).toBeNull());
    });

    it("mientras se procesa una respuesta ignora los toques repetidos", async () => {
      respondToInvitation.mockReturnValue(new Promise(() => {}));

      const utils = await renderPantallaCargada();

      await press(utils, "Unirme");
      await press(utils, "Unirme");
      await press(utils, "Rechazar");

      expect(respondToInvitation).toHaveBeenCalledTimes(1);
      expect(respondToInvitation).toHaveBeenCalledWith(5, "aceptar");
    });

    it("si falla sin mensaje, avisa con el texto por defecto y recarga", async () => {
      respondToInvitation.mockRejectedValue(new Error(""));

      const utils = await renderPantallaCargada();

      await press(utils, "Unirme");

      await waitFor(() =>
        expect(appAlert).toHaveBeenCalledWith(
          "Atención",
          "Ocurrió un error al procesar la invitación."
        )
      );
      await waitFor(() => expect(getPendingInvitations).toHaveBeenCalledTimes(2));
    });

    it("después de un error se puede volver a responder", async () => {
      respondToInvitation
        .mockRejectedValueOnce(new Error("Error de red"))
        .mockResolvedValueOnce({ message: "¡Te uniste al viaje!" });

      const utils = await renderPantallaCargada();

      await press(utils, "Unirme");
      await waitFor(() => expect(appAlert).toHaveBeenCalledWith("Atención", "Error de red"));

      await press(utils, "Unirme");

      await waitFor(() => expect(respondToInvitation).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(appAlert).toHaveBeenCalledWith("Éxito", "¡Te uniste al viaje!"));
    });

    // HU 72: el administrador canceló la invitación antes de que el invitado respondiera.
    describe("HU 72 - invitación cancelada (vista del invitado)", () => {
      it("muestra la notificación de invitación cancelada", async () => {
        getPendingInvitations.mockResolvedValue([]);
        getNotifications.mockResolvedValue([
          {
            id: 7,
            titulo: "Invitación cancelada",
            mensaje: "Lucia Giampieri canceló tu invitación al viaje 'Viaje a Salta'.",
            fechaCreacion: "2026-09-28T10:00:00Z",
            leida: false,
            tipo: "invitacion_cancelada",
          },
        ]);

        const utils = await renderPantallaCargada();

        expect(utils.getByText("Invitación cancelada")).toBeTruthy();
        expect(
          utils.getByText("Lucia Giampieri canceló tu invitación al viaje 'Viaje a Salta'.")
        ).toBeTruthy();
      });

      it("si la invitación fue cancelada al intentar aceptarla, avisa y la quita del listado", async () => {
        getPendingInvitations.mockResolvedValueOnce([invitacionSalta]).mockResolvedValueOnce([]);
        respondToInvitation.mockRejectedValue(
          new Error("Esta invitación fue cancelada por el administrador del viaje.")
        );

        const utils = await renderPantallaCargada();

        await press(utils, "Unirme");

        await waitFor(() =>
          expect(appAlert).toHaveBeenCalledWith(
            "Atención",
            "Esta invitación fue cancelada por el administrador del viaje."
          )
        );
        await waitFor(() => expect(utils.queryByText("Viaje a Salta")).toBeNull());
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Novedades
  // ---------------------------------------------------------------------------
  describe("novedades", () => {
    // US 68: avisos cuando alguien abandona el viaje.
    describe("US 68 - notificaciones por abandono de viaje", () => {
      it("muestra la notificación cuando un participante abandona el viaje (para el administrador)", async () => {
        getNotifications.mockResolvedValue([
          {
            id: 101,
            titulo: "Un participante abandonó el viaje",
            mensaje: "Juan Pérez abandonó el viaje 'Viaje a Bariloche'.",
            fechaCreacion: "2026-12-02T10:00:00Z",
            leida: false,
            tipo: "participante_salio",
          },
        ]);

        const utils = await renderPantallaCargada();

        expect(utils.getByText("Un participante abandonó el viaje")).toBeTruthy();
        expect(utils.getByText("Juan Pérez abandonó el viaje 'Viaje a Bariloche'.")).toBeTruthy();
      });

      it("muestra la notificación cuando se transfiere la administración (para el nuevo administrador)", async () => {
        getNotifications.mockResolvedValue([
          {
            id: 102,
            titulo: "Ahora eres el administrador del viaje",
            mensaje:
              "Juan Pérez te asignó como nuevo administrador del viaje 'Viaje a Bariloche'.",
            fechaCreacion: "2026-12-02T10:05:00Z",
            leida: false,
            tipo: "nuevo_administrador",
          },
        ]);

        const utils = await renderPantallaCargada();

        expect(utils.getByText("Ahora eres el administrador del viaje")).toBeTruthy();
        expect(
          utils.getByText(
            "Juan Pérez te asignó como nuevo administrador del viaje 'Viaje a Bariloche'."
          )
        ).toBeTruthy();
      });

      it("permite marcar una notificación de salida como leída", async () => {
        getNotifications.mockResolvedValue([
          {
            id: 103,
            titulo: "Un participante abandonó el viaje",
            mensaje: "Carlos Gómez abandonó el viaje.",
            fechaCreacion: "2026-12-02T10:10:00Z",
            leida: false,
            tipo: "participante_salio",
          },
        ]);

        const utils = await renderPantallaCargada();

        await press(utils, "Marcar como leída");

        await waitFor(() => expect(markNotificationAsRead).toHaveBeenCalledWith(103));
      });
    });

    it("muestra el título, el mensaje y la fecha de cada novedad", async () => {
      getNotifications.mockResolvedValue([novedadSinLeer(1), novedadLeida(2)]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Novedad 1")).toBeTruthy();
      expect(utils.getByText("Mensaje de la novedad 1.")).toBeTruthy();
      expect(utils.getByText("Novedad leída 2")).toBeTruthy();
      expect(utils.getByText("Mensaje de la novedad 2.")).toBeTruthy();
      expect(utils.getAllByText(/2026/)).toHaveLength(2);
    });

    it("acepta los datos de la novedad con los nombres alternativos del servidor", async () => {
      getNotifications.mockResolvedValue([
        { id: 4, Titulo: "Gasto nuevo", Mensaje: "Se cargó un gasto.", FechaCreacion: "2026-09-02T10:00:00Z", leida: false },
      ]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Gasto nuevo")).toBeTruthy();
      expect(utils.getByText("Se cargó un gasto.")).toBeTruthy();
      expect(utils.getByText(/2026/)).toBeTruthy();
    });

    it("una novedad sin mensaje se muestra solo con su título", async () => {
      getNotifications.mockResolvedValue([
        { id: 5, titulo: "Aviso sin detalle", fechaCreacion: "2026-09-02T10:00:00Z", leida: false },
      ]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Aviso sin detalle")).toBeTruthy();
      expect(utils.getByText("Marcar como leída")).toBeTruthy();
    });

    it("una novedad que no informa si está leída se considera leída", async () => {
      getNotifications.mockResolvedValue([{ id: 6, titulo: "Aviso viejo", mensaje: "Ya pasó." }]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Aviso viejo")).toBeTruthy();
      expect(utils.queryByText("Marcar como leída")).toBeNull();
      expect(utils.getByText("Estás al día")).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Marcar como leídas
  // ---------------------------------------------------------------------------
  describe("marcar como leídas", () => {
    beforeEach(() => {
      getNotifications.mockResolvedValue([novedadSinLeer(1), novedadSinLeer(2), novedadLeida(3)]);
    });

    it("solo las novedades sin leer ofrecen 'Marcar como leída'", async () => {
      const utils = await renderPantallaCargada();

      // Hay 3 novedades y solo 2 sin leer.
      expect(utils.getAllByText("Marcar como leída")).toHaveLength(2);
    });

    it("marcar una como leída la actualiza y baja el contador del resumen", async () => {
      const utils = await renderPantallaCargada();
      expect(utils.getByText("2 sin leer")).toBeTruthy();

      await pressPrimero(utils, "Marcar como leída");

      await waitFor(() => expect(markNotificationAsRead).toHaveBeenCalledWith(1));
      await waitFor(() => expect(utils.getByText("1 sin leer")).toBeTruthy());
      expect(utils.getAllByText("Marcar como leída")).toHaveLength(1);
      // Las otras novedades no se tocan.
      expect(markNotificationAsRead).toHaveBeenCalledTimes(1);
    });

    it("marcar la última sin leer deja el resumen en 'Estás al día' y oculta 'Marcar todas'", async () => {
      getNotifications.mockResolvedValue([novedadSinLeer(1)]);

      const utils = await renderPantallaCargada();
      expect(utils.getByText("Marcar todas como leídas")).toBeTruthy();

      await press(utils, "Marcar como leída");

      await waitFor(() => expect(utils.getByText("Estás al día")).toBeTruthy());
      expect(utils.queryByText("Marcar todas como leídas")).toBeNull();
      expect(utils.queryByText("Marcar como leída")).toBeNull();
    });

    it("'Marcar todas como leídas' aparece con novedades sin leer y las marca todas", async () => {
      const utils = await renderPantallaCargada();

      await press(utils, "Marcar todas como leídas");

      await waitFor(() => expect(markAllNotificationsAsRead).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(utils.queryByText("Marcar como leída")).toBeNull());
      // Ya no queda nada por marcar: desaparece el botón y el resumen lo refleja.
      expect(utils.queryByText("Marcar todas como leídas")).toBeNull();
      expect(utils.getByText("Estás al día")).toBeTruthy();
    });

    it("'Marcar todas como leídas' no aparece si no hay novedades sin leer", async () => {
      getNotifications.mockResolvedValue([novedadLeida(1)]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Novedad leída 1")).toBeTruthy();
      expect(utils.queryByText("Marcar todas como leídas")).toBeNull();
    });

    it("'Marcar todas como leídas' no aparece si solo hay invitaciones", async () => {
      getPendingInvitations.mockResolvedValue([invitacionSalta]);
      getNotifications.mockResolvedValue([]);

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Viaje a Salta")).toBeTruthy();
      expect(utils.queryByText("Marcar todas como leídas")).toBeNull();
    });

    it("marcar todas como leídas no toca las invitaciones pendientes", async () => {
      getPendingInvitations.mockResolvedValue([invitacionSalta]);

      const utils = await renderPantallaCargada();

      await press(utils, "Marcar todas como leídas");

      await waitFor(() => expect(utils.getByText("1 invitación pendiente")).toBeTruthy());
      expect(utils.getByText("Viaje a Salta")).toBeTruthy();
      expect(utils.getByText("Unirme")).toBeTruthy();
    });

    it("si falla marcar una como leída avisa y la deja sin leer", async () => {
      markNotificationAsRead.mockRejectedValue(new Error("No se pudo marcar."));

      const utils = await renderPantallaCargada();

      await pressPrimero(utils, "Marcar como leída");

      await waitFor(() => expect(appAlert).toHaveBeenCalledWith("Error", "No se pudo marcar."));
      expect(utils.getAllByText("Marcar como leída")).toHaveLength(2);
      expect(utils.getByText("2 sin leer")).toBeTruthy();
    });

    it("si falla marcar una como leída sin mensaje, usa el texto por defecto", async () => {
      markNotificationAsRead.mockRejectedValue(new Error(""));

      const utils = await renderPantallaCargada();

      await pressPrimero(utils, "Marcar como leída");

      await waitFor(() =>
        expect(appAlert).toHaveBeenCalledWith(
          "Error",
          "No se pudo marcar la notificación como leída."
        )
      );
    });

    it("si falla marcar todas avisa y conserva las novedades sin leer", async () => {
      markAllNotificationsAsRead.mockRejectedValue(new Error("No se pudieron marcar."));

      const utils = await renderPantallaCargada();

      await press(utils, "Marcar todas como leídas");

      await waitFor(() =>
        expect(appAlert).toHaveBeenCalledWith("Error", "No se pudieron marcar.")
      );
      expect(utils.getAllByText("Marcar como leída")).toHaveLength(2);
      expect(utils.getByText("2 sin leer")).toBeTruthy();
    });

    it("si falla marcar todas sin mensaje, usa el texto por defecto", async () => {
      markAllNotificationsAsRead.mockRejectedValue(new Error(""));

      const utils = await renderPantallaCargada();

      await press(utils, "Marcar todas como leídas");

      await waitFor(() =>
        expect(appAlert).toHaveBeenCalledWith("Error", "No se pudieron marcar las notificaciones.")
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Actualización de la lista
  // ---------------------------------------------------------------------------
  describe("actualización de la lista", () => {
    let socket;
    let originalWebSocket;

    beforeEach(() => {
      getNotifications.mockResolvedValue([novedadSinLeer(1)]);

      socket = { close: jest.fn() };
      originalWebSocket = global.WebSocket;
      global.WebSocket = jest.fn(() => socket);
      getNotificationsSocketUrl.mockResolvedValue("ws://test/notificaciones");
    });

    afterEach(() => {
      global.WebSocket = originalWebSocket;
    });

    async function renderConSocketConectado() {
      const utils = await renderPantallaCargada();
      await waitFor(() =>
        expect(global.WebSocket).toHaveBeenCalledWith("ws://test/notificaciones")
      );
      return utils;
    }

    it("al llegar una notificación en vivo recarga la lista sin pantalla de carga", async () => {
      const utils = await renderConSocketConectado();

      getNotifications.mockResolvedValue([novedadSinLeer(1), novedadSinLeer(9, "Llegó algo nuevo")]);

      await act(async () => {
        socket.onmessage({ data: JSON.stringify({ tipo: "nueva_notificacion" }) });
      });

      await waitFor(() => expect(utils.getByText("Llegó algo nuevo")).toBeTruthy());
      expect(utils.queryByText(AVISO_CARGANDO)).toBeNull();
      expect(getNotifications).toHaveBeenCalledTimes(2);
    });

    it("también recarga las invitaciones cuando llega una notificación en vivo", async () => {
      const utils = await renderConSocketConectado();

      getPendingInvitations.mockResolvedValue([invitacionSalta]);

      await act(async () => {
        socket.onmessage({ data: JSON.stringify({ tipo: "nueva_notificacion" }) });
      });

      await waitFor(() => expect(utils.getByText("Viaje a Salta")).toBeTruthy());
      expect(utils.getByText("Invitaciones pendientes")).toBeTruthy();
    });

    it("ignora los mensajes del socket que no son notificaciones nuevas", async () => {
      await renderConSocketConectado();

      await act(async () => {
        socket.onmessage({ data: JSON.stringify({ tipo: "otra_cosa" }) });
      });

      expect(getNotifications).toHaveBeenCalledTimes(1);
    });

    it("un mensaje de socket inválido no rompe la pantalla", async () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const utils = await renderConSocketConectado();

      await act(async () => {
        socket.onmessage({ data: "esto no es JSON" });
      });

      expect(errorSpy).toHaveBeenCalled();
      expect(utils.getByText("Novedad 1")).toBeTruthy();
      expect(getNotifications).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });

    it("un error del socket se registra y la pantalla sigue funcionando", async () => {
      const utils = await renderConSocketConectado();

      await act(async () => {
        socket.onerror(new Error("falla del socket"));
      });

      expect(logSpy).toHaveBeenCalledWith(
        "Error en el WebSocket de notificaciones:",
        expect.any(Error)
      );
      expect(utils.getByText("Novedad 1")).toBeTruthy();
    });

    it("si no se puede conectar el socket, la pantalla se muestra igual", async () => {
      getNotificationsSocketUrl.mockRejectedValue(new Error("No socket in test"));

      const utils = await renderPantallaCargada();

      await waitFor(() => expect(logSpy).toHaveBeenCalled());
      expect(global.WebSocket).not.toHaveBeenCalled();
      expect(utils.getByText("Novedad 1")).toBeTruthy();
    });

    it("cierra el socket al salir de la pantalla", async () => {
      const utils = await renderConSocketConectado();

      await utils.unmount();

      expect(socket.close).toHaveBeenCalledTimes(1);
    });

    it("si se sale de la pantalla antes de obtener la dirección, no abre el socket", async () => {
      let resolverUrl;
      getNotificationsSocketUrl.mockReturnValue(
        new Promise((resolve) => {
          resolverUrl = resolve;
        })
      );

      const utils = await renderPantallaCargada();
      await utils.unmount();

      await act(async () => {
        resolverUrl("ws://test/notificaciones");
      });

      expect(global.WebSocket).not.toHaveBeenCalled();
    });

    it("tirar hacia abajo recarga la lista sin pantalla de carga", async () => {
      const utils = await renderPantallaCargada();

      getNotifications.mockResolvedValue([
        novedadSinLeer(1),
        novedadSinLeer(7, "Novedad tras refrescar"),
      ]);

      await tirarParaActualizar(utils);

      await waitFor(() => expect(utils.getByText("Novedad tras refrescar")).toBeTruthy());
      expect(utils.queryByText(AVISO_CARGANDO)).toBeNull();
      expect(getNotifications).toHaveBeenCalledTimes(2);
      expect(getPendingInvitations).toHaveBeenCalledTimes(2);
    });
  });
});