import { fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import FloatingTabBar, { ALTO_BARRA_TABS, espacioBarraTabs } from "../components/navigation/FloatingTabBar";

const METRICAS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function props(indice = 0) {
  const routes = [
    { key: "inicio-1", name: "Inicio" },
    { key: "viajes-1", name: "Mis Viajes" },
    { key: "perfil-1", name: "Perfil" },
  ];
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };
  const descriptors = Object.fromEntries(
    routes.map((route) => [route.key, { options: { tabBarLabel: route.name } }])
  );
  return {
    state: { index: indice, routes },
    descriptors,
    navigation,
    iconos: { Inicio: "home", "Mis Viajes": "briefcase", Perfil: "user" },
  };
}

async function renderizar(valores) {
  return render(
    <SafeAreaProvider initialMetrics={METRICAS}>
      <FloatingTabBar {...valores} />
    </SafeAreaProvider>
  );
}

describe("Barra de pestañas flotante", () => {
  it("muestra las tres pestañas con su texto y marca la activa", async () => {
    const { getByText, getByTestId } = await renderizar(props(0));

    expect(getByText("Inicio")).toBeTruthy();
    expect(getByText("Mis Viajes")).toBeTruthy();
    expect(getByText("Perfil")).toBeTruthy();
    expect(getByTestId("tab-Inicio").props.accessibilityState).toEqual({ selected: true });
    expect(getByTestId("tab-Perfil").props.accessibilityState).toEqual({ selected: false });
  });

  it("al tocar otra pestaña navega a esa pantalla", async () => {
    const valores = props(0);
    const { getByTestId } = await renderizar(valores);

    fireEvent.press(getByTestId("tab-Perfil"));

    expect(valores.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tabPress", target: "perfil-1" })
    );
    expect(valores.navigation.navigate).toHaveBeenCalledWith("Perfil", undefined);
  });

  it("tocar la pestaña activa no vuelve a navegar", async () => {
    const valores = props(1);
    const { getByTestId } = await renderizar(valores);

    fireEvent.press(getByTestId("tab-Mis Viajes"));

    expect(valores.navigation.navigate).not.toHaveBeenCalled();
  });

  it("deja lugar para la barra y el área segura de abajo", () => {
    expect(espacioBarraTabs(34)).toBe(ALTO_BARRA_TABS + 34 + 12);
    expect(espacioBarraTabs(0)).toBe(ALTO_BARRA_TABS + 12 + 12);
  });
});