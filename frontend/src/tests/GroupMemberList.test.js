import { fireEvent, render } from "@testing-library/react-native";

import GroupMemberList from "../components/trip/GroupMemberList";

function integrante(overrides = {}) {
  return {
    key: "1",
    id: 1,
    nombreCompleto: "Ada Lovelace",
    nombreUsuario: "ada",
    role: "participante",
    status: "aceptado",
    ...overrides,
  };
}

describe("GroupMemberList", () => {
  it("muestra el estado vacío cuando no hay integrantes", async () => {
    const { getByText } = await render(<GroupMemberList members={[]} />);

    expect(getByText("Todavía no hay integrantes en el grupo.")).toBeTruthy();
  });

  it("muestra nombre y @usuario de cada integrante", async () => {
    const { getByText } = await render(<GroupMemberList members={[integrante()]} />);

    expect(getByText("Ada Lovelace")).toBeTruthy();
    expect(getByText("@ada")).toBeTruthy();
  });

  it("marca al organizador con su badge", async () => {
    const { getByText } = await render(
      <GroupMemberList members={[integrante({ role: "administrador" })]} />
    );

    expect(getByText("Organizador")).toBeTruthy();
  });

  it("indica cuando la invitación de un integrante sigue pendiente", async () => {
    const { getByText } = await render(
      <GroupMemberList members={[integrante({ status: "invitado" })]} />
    );

    expect(getByText("Invitación pendiente")).toBeTruthy();
  });

  it("no muestra acciones si no puede gestionar el grupo", async () => {
    const { queryByTestId } = await render(
      <GroupMemberList canManage={false} members={[integrante()]} onRemove={jest.fn()} />
    );

    expect(queryByTestId("group-member-menu-1")).toBeNull();
  });

  it("no ofrece acciones sobre el organizador", async () => {
    const { queryByTestId } = await render(
      <GroupMemberList
        canManage
        members={[integrante({ role: "administrador" })]}
        onRemove={jest.fn()}
      />
    );

    expect(queryByTestId("group-member-menu-1")).toBeNull();
  });

  it("abre el menú de acciones y permite expulsar a un integrante", async () => {
    const onRemove = jest.fn();
    const member = integrante({ key: "2", id: 2 });
    const { getByTestId, queryByTestId } = await render(
      <GroupMemberList canManage members={[member]} onRemove={onRemove} />
    );

    expect(queryByTestId("group-member-remove-2")).toBeNull();

    await fireEvent.press(getByTestId("group-member-menu-2"));
    await fireEvent.press(getByTestId("group-member-remove-2"));

    expect(onRemove).toHaveBeenCalledWith(member);
    expect(queryByTestId("group-member-remove-2")).toBeNull();
  });
});
