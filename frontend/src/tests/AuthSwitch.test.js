import { fireEvent, render } from "@testing-library/react-native";

import AuthSwitch from "../components/ui/AuthSwitch";

describe("AuthSwitch", () => {
  it("usa 'login' como opción activa por defecto", async () => {
    const { getByText } = await render(<AuthSwitch onChange={jest.fn()} />);

    expect(getByText("Iniciar sesión")).toBeTruthy();
    expect(getByText("Crear cuenta")).toBeTruthy();
  });

  it("llama a onChange con la key de la opción presionada", async () => {
    const onChange = jest.fn();
    const { getByText } = await render(<AuthSwitch active="login" onChange={onChange} />);

    fireEvent.press(getByText("Crear cuenta"));

    expect(onChange).toHaveBeenCalledWith("register");
  });

  it("no explota si se presiona sin pasar onChange", async () => {
    const { getByText } = await render(<AuthSwitch active="login" />);

    expect(() => fireEvent.press(getByText("Crear cuenta"))).not.toThrow();
  });
});