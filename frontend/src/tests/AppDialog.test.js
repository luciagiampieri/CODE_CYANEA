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
      fireEvent.press(utils.getByText("Eliminar"));
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

    expect(utils.getByText("Pendiente")).toBeTruthy();
  });

  it("deduce el tipo a partir del título y los botones", () => {
    expect(inferirTipo("Éxito")).toBe("success");
    expect(inferirTipo("Error")).toBe("error");
    expect(inferirTipo("¿Cancelar invitación?")).toBe("confirm");
    expect(inferirTipo("Atención")).toBe("warning");
    expect(inferirTipo("Sin conexión")).toBe("info");
  });
});
