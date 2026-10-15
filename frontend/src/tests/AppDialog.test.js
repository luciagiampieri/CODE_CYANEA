import { act, fireEvent, render } from "@testing-library/react-native";
import { Alert } from "react-native";

import { DialogHost, appAlert, inferirTipo } from "../components/ui/AppDialog";
import AppModal from "../components/ui/AppModal";

jest.useFakeTimers();

describe("AppDialog", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sin DialogHost montado delega en Alert.alert con los mismos argumentos", () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    appAlert("Error", "Algo falló");
    expect(spy).toHaveBeenCalledWith("Error", "Algo falló");
  });

  it("con DialogHost muestra el título, el mensaje y un botón Aceptar por defecto", async () => {
    const spy = jest.spyOn(Alert, "alert");
    const utils = await render(<DialogHost root />);

    await act(async () => appAlert("Éxito", "Documento subido correctamente."));

    expect(utils.getByText("Éxito")).toBeTruthy();
    expect(utils.getByText("Documento subido correctamente.")).toBeTruthy();
    expect(utils.getByText("Aceptar")).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();

    await act(async () => fireEvent.press(utils.getByText("Aceptar")));
    expect(utils.queryByText("Éxito")).toBeNull();
  });

  it("ejecuta el onPress del botón elegido y cierra el diálogo", async () => {
    const onEliminar = jest.fn();
    const onCancelar = jest.fn();
    const utils = await render(<DialogHost root />);

    await act(async () =>
      appAlert("¿Eliminar?", "No se puede deshacer.", [
        { text: "Cancelar", style: "cancel", onPress: onCancelar },
        { text: "Eliminar", style: "destructive", onPress: onEliminar },
      ])
    );

    await act(async () => {
      await fireEvent.press(utils.getByText("Eliminar"));
      jest.runAllTimers();
    });

    expect(onEliminar).toHaveBeenCalledTimes(1);
    expect(onCancelar).not.toHaveBeenCalled();
    expect(utils.queryByText("¿Eliminar?")).toBeNull();
  });

  it("si se piden dos diálogos seguidos, los muestra de a uno", async () => {
    const utils = await render(<DialogHost root />);

    await act(async () => {
      appAlert("Primero", "uno");
      appAlert("Segundo", "dos");
    });

    expect(utils.getByText("Primero")).toBeTruthy();
    expect(utils.queryByText("Segundo")).toBeNull();

    await act(async () => fireEvent.press(utils.getByText("Aceptar")));
    expect(utils.getByText("Segundo")).toBeTruthy();
  });

  it("sin el host root (tests de pantallas) delega en Alert.alert aunque haya un modal abierto", async () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { Text } = require("react-native");
    await render(
      <AppModal visible transparent>
        <Text>contenido</Text>
      </AppModal>
    );

    appAlert("Error", "Algo falló");
    expect(spy).toHaveBeenCalledWith("Error", "Algo falló");
  });

  it("con un AppModal abierto, el diálogo se dibuja dentro del modal y no en el root", async () => {
    const { Text, View } = require("react-native");
    const utils = await render(
      <View>
        <View testID="root-zone">
          <DialogHost root />
        </View>
        <AppModal visible transparent>
          <View testID="modal-zone">
            <Text>Subir documento</Text>
          </View>
        </AppModal>
      </View>
    );

    await act(async () => appAlert("Éxito", "Documento subido correctamente."));

    const { within } = require("@testing-library/react-native");
    expect(within(utils.getByTestId("root-zone")).queryByText("Éxito")).toBeNull();
    expect(utils.getByText("Éxito")).toBeTruthy();
  });

  it("si el modal se cierra con diálogos pendientes, pasan al host de abajo", async () => {
    const { Text, View } = require("react-native");
    const arbol = (visible) => (
      <View>
        <DialogHost root />
        <AppModal visible={visible} transparent>
          <Text>modal</Text>
        </AppModal>
      </View>
    );
    const utils = await render(arbol(true));

    await act(async () => appAlert("Pendiente", "se tiene que ver igual"));
    await act(async () => utils.rerender(arbol(false)));

    // En iOS un Modal no se presenta mientras otro se está cerrando: el diálogo
    // espera a que termine la animación de cierre (o al respaldo si no llega
    // `onDismiss`) y recién ahí aparece.
    expect(utils.queryByText("Pendiente")).toBeNull();
    await act(async () => jest.advanceTimersByTime(1000));
    expect(utils.getByText("Pendiente")).toBeTruthy();
  });

  it("mientras un modal se está cerrando el diálogo espera y aparece apenas termina", async () => {
    const { registrarCierreModal } = require("../components/ui/AppDialog");
    const utils = await render(<DialogHost root />);

    // AppModal lo llama al ocultarse y llama `terminar` en `onDismiss` (iOS).
    const terminar = registrarCierreModal();
    await act(async () => appAlert("Recomendación", "se muestra al terminar de cerrar"));
    expect(utils.queryByText("Recomendación")).toBeNull();

    await act(async () => terminar());
    expect(utils.getByText("Recomendación")).toBeTruthy();
  });

  it("deduce el tipo a partir del título y los botones", () => {
    expect(inferirTipo("Éxito")).toBe("success");
    expect(inferirTipo("Error")).toBe("error");
    expect(inferirTipo("¿Cancelar invitación?")).toBe("confirm");
    expect(inferirTipo("Atención")).toBe("warning");
    expect(inferirTipo("Sin conexión")).toBe("info");
  });
});
describe("AppDialog con confirmación", () => {
  it("muestra la confirmación en una franja propia, separada del mensaje", async () => {
    const { DialogHost, appAlert } = require("../components/ui/AppDialog");
    const { render: renderizar, act: actuar } = require("@testing-library/react-native");
    const utils = await renderizar(<DialogHost root />);

    await actuar(async () => {
      appAlert("Comprá las entradas antes", "Museo del Prado", [{ text: "Entendido" }], {
        tipo: "info",
        confirmacion: "Actividad registrada correctamente.",
      });
    });

    await actuar(async () => jest.advanceTimersByTime(500));
    expect(utils.getByText("Actividad registrada correctamente.")).toBeTruthy();
    expect(utils.getByText("Comprá las entradas antes")).toBeTruthy();
    expect(utils.getByText("Museo del Prado")).toBeTruthy();
  });
});

describe("AppDialog con lugar, cruz para cerrar y botones con ícono", () => {
  const { DialogHost, appAlert, appToast } = require("../components/ui/AppDialog");
  const { act: actuar, fireEvent: disparar, render: renderizar } = require("@testing-library/react-native");

  async function abrir(botones, opciones) {
    const utils = await renderizar(<DialogHost root />);
    await actuar(async () => {
      appAlert("Comprá tus entradas antes", "Conviene comprarlas online.", botones, opciones);
      jest.advanceTimersByTime(500);
    });
    return utils;
  }

  it("muestra el lugar en una píldora y el botón cancel como una cruz", async () => {
    const ahoraNo = jest.fn();
    const utils = await abrir(
      [
        { text: "Ahora no", style: "cancel", onPress: ahoraNo },
        { text: "Recordármelo", icono: "bell", variante: "contorno" },
        { text: "Comprar entradas", icono: "arrow-up-right-from-square" },
      ],
      { tipo: "info", icono: "ticket", etiqueta: { icono: "location-dot", texto: "SeaWorld Orlando" }, botonCerrar: true }
    );

    expect(utils.getByText("SeaWorld Orlando")).toBeTruthy();
    expect(utils.getByText("Recordármelo")).toBeTruthy();
    expect(utils.getByText("Comprar entradas")).toBeTruthy();
    // "Ahora no" no es un botón más: es la cruz, con ese texto para lectores de pantalla.
    expect(utils.queryByText("Ahora no")).toBeNull();

    await actuar(async () => {
      disparar.press(utils.getByLabelText("Ahora no"));
      jest.runAllTimers();
    });
    expect(ahoraNo).toHaveBeenCalledTimes(1);
    expect(utils.queryByText("SeaWorld Orlando")).toBeNull();
  });

  it("appToast muestra un aviso breve que desaparece solo", async () => {
    const utils = await renderizar(<DialogHost root />);

    await actuar(async () => {
      appToast("Lo agregamos a tu checklist");
      jest.advanceTimersByTime(600);
    });
    expect(utils.getByText("Lo agregamos a tu checklist")).toBeTruthy();

    await actuar(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(utils.queryByText("Lo agregamos a tu checklist")).toBeNull();
  });
});
