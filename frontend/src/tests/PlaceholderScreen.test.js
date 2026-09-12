import { render } from "@testing-library/react-native";

import PlaceholderScreen from "../screens/PlaceholderScreen";

describe("PlaceholderScreen", () => {
  it("muestra el título y el mensaje pasados por route.params", async () => {
    const route = { params: { title: "Mapa offline", message: "Todavía no está listo." } };

    const { getByText } = await render(<PlaceholderScreen route={route} />);

    expect(getByText("Sección base")).toBeTruthy();
    expect(getByText("Mapa offline")).toBeTruthy();
    expect(getByText("Todavía no está listo.")).toBeTruthy();
  });

  it("usa los textos por defecto si route.params no trae title/message", async () => {
    const route = { params: {} };

    const { getByText } = await render(<PlaceholderScreen route={route} />);

    expect(getByText("Pendiente")).toBeTruthy();
    expect(
      getByText("Pantalla reservada para una próxima historia.")
    ).toBeTruthy();
  });

  it("usa los textos por defecto si route.params directamente no existe", async () => {
    const route = {};

    const { getByText } = await render(<PlaceholderScreen route={route} />);

    expect(getByText("Pendiente")).toBeTruthy();
    expect(
      getByText("Pantalla reservada para una próxima historia.")
    ).toBeTruthy();
  });
});