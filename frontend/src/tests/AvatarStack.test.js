import { render } from "@testing-library/react-native";

import AvatarStack from "../components/ui/AvatarStack";

const participante = (overrides = {}) => ({
  id: "1",
  nombreCompleto: "Lucia Giampieri",
  ...overrides,
});

describe("AvatarStack", () => {
  it("no rompe cuando no recibe participantes", async () => {
    const { toJSON } = await render(<AvatarStack />);
    expect(toJSON()).toBeTruthy();
  });

  it("renderiza un avatar por cada participante hasta el máximo (default 4)", async () => {
    const participantes = [
      participante({ id: "1", nombreCompleto: "Ana Uno" }),
      participante({ id: "2", nombreCompleto: "Bruno Dos" }),
      participante({ id: "3", nombreCompleto: "Carla Tres" }),
    ];
    const { getByText } = await render(<AvatarStack participants={participantes} />);
    expect(getByText("AU")).toBeTruthy();
    expect(getByText("BD")).toBeTruthy();
    expect(getByText("CT")).toBeTruthy();
  });

  it("muestra el indicador de overflow (+N) cuando hay más participantes que el máximo", async () => {
    const participantes = [
      participante({ id: "1", nombreCompleto: "Ana Uno" }),
      participante({ id: "2", nombreCompleto: "Bruno Dos" }),
      participante({ id: "3", nombreCompleto: "Carla Tres" }),
    ];
    const { getByText, queryByText } = await render(
      <AvatarStack participants={participantes} max={2} />
    );
    expect(getByText("AU")).toBeTruthy();
    expect(getByText("BD")).toBeTruthy();
    expect(queryByText("CT")).toBeNull();
    expect(getByText("+1")).toBeTruthy();
  });

  it("usa overflowLabel personalizado en vez de +N cuando se provee", async () => {
    const participantes = [participante({ id: "1" }), participante({ id: "2" })];
    const { getByText } = await render(
      <AvatarStack participants={participantes} max={1} overflowLabel="y más" />
    );
    expect(getByText("y más")).toBeTruthy();
  });

  it("usa fallback 'Invitado' cuando el participante no tiene nombre ni email", async () => {
    const { getByText } = await render(<AvatarStack participants={[{ id: "1" }]} />);
    expect(getByText("I")).toBeTruthy();
  });
});