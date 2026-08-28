import { fireEvent, render } from "@testing-library/react-native";

import ParticipantSearch from "../components/trip/ParticipantSearch";

const baseProps = {
  search: "",
  onSearchChange: jest.fn(),
  suggestions: [],
  onSelectUser: jest.fn(),
  canInviteExternal: false,
  onInviteExternal: jest.fn(),
  message: "",
};

const usuario = (overrides = {}) => ({
  id: 1,
  nombreCompleto: "Ada Lovelace",
  nombreUsuario: "adalovelace",
  email: "ada@mail.com",
  ...overrides,
});

describe("ParticipantSearch", () => {
  it("no muestra la sección de resultados cuando la búsqueda está vacía", async () => {
    const { queryByText } = await render(<ParticipantSearch {...baseProps} search="" />);

    expect(queryByText("No hay coincidencias para esa búsqueda.")).toBeNull();
  });

  it("no muestra resultados si la búsqueda es solo espacios", async () => {
    const { queryByText } = await render(<ParticipantSearch {...baseProps} search="   " />);

    expect(queryByText("No hay coincidencias para esa búsqueda.")).toBeNull();
  });

  it("llama a onSearchChange al escribir en el input", async () => {
    const onSearchChange = jest.fn();
    const { getByPlaceholderText } = await render(
      <ParticipantSearch {...baseProps} onSearchChange={onSearchChange} />
    );

    fireEvent.changeText(getByPlaceholderText("Busca por nombre o correo"), "ada");

    expect(onSearchChange).toHaveBeenCalledWith("ada");
  });

  it("muestra las sugerencias con nombre, usuario y email", async () => {
    const { getByText } = await render(
      <ParticipantSearch {...baseProps} search="ada" suggestions={[usuario()]} />
    );

    expect(getByText("Ada Lovelace")).toBeTruthy();
    expect(getByText("@adalovelace · ada@mail.com")).toBeTruthy();
  });

  it("llama a onSelectUser con el usuario correcto al presionar una sugerencia", async () => {
    const onSelectUser = jest.fn();
    const user = usuario();
    const { getByText } = await render(
      <ParticipantSearch
        {...baseProps}
        search="ada"
        suggestions={[user]}
        onSelectUser={onSelectUser}
      />
    );

    fireEvent.press(getByText("Ada Lovelace"));

    expect(onSelectUser).toHaveBeenCalledWith(user);
  });

  it("sin sugerencias y sin poder invitar externos, muestra el mensaje de sin coincidencias", async () => {
    const { getByText } = await render(
      <ParticipantSearch {...baseProps} search="nadie" suggestions={[]} canInviteExternal={false} />
    );

    expect(getByText("No hay coincidencias para esa búsqueda.")).toBeTruthy();
  });

  it("sin sugerencias pero pudiendo invitar externos, muestra la opción de invitar por correo", async () => {
    const { getByText, queryByText } = await render(
      <ParticipantSearch {...baseProps} search="nueva@mail.com" suggestions={[]} canInviteExternal />
    );

    expect(getByText("Invitar por correo")).toBeTruthy();
    expect(queryByText("No hay coincidencias para esa búsqueda.")).toBeNull();
  });

  it("llama a onInviteExternal al presionar la opción de invitar", async () => {
    const onInviteExternal = jest.fn();
    const { getByText } = await render(
      <ParticipantSearch
        {...baseProps}
        search="nueva@mail.com"
        suggestions={[]}
        canInviteExternal
        onInviteExternal={onInviteExternal}
      />
    );

    fireEvent.press(getByText("Invitar por correo"));

    expect(onInviteExternal).toHaveBeenCalledTimes(1);
  });

  it("muestra el mensaje de error/aviso cuando viene la prop message", async () => {
    const { getByText } = await render(
      <ParticipantSearch {...baseProps} message="Ese usuario ya está en el viaje." />
    );

    expect(getByText("Ese usuario ya está en el viaje.")).toBeTruthy();
  });
});