import { fireEvent, render } from "@testing-library/react-native";

import ParticipantList from "../components/trip/ParticipantList";

function participante(overrides = {}) {
  return {
    key: "1",
    nombreCompleto: "Ada Lovelace",
    role: "miembro",
    kind: "registered",
    ...overrides,
  };
}

describe("ParticipantList", () => {
  it("muestra el estado vacío cuando no hay participantes", async () => {
    const { getByText } = await render(
      <ParticipantList participants={[]} onRemove={jest.fn()} isAdmin={false} />
    );

    expect(getByText("Todavía no agregaste participantes al viaje.")).toBeTruthy();
    expect(getByText("0")).toBeTruthy();
  });

  it("muestra el contador y el nombre de cada participante", async () => {
    const participants = [
      participante({ key: "1", nombreCompleto: "Ada Lovelace" }),
      participante({ key: "2", nombreCompleto: "Alan Turing" }),
    ];

    const { getByText } = await render(
      <ParticipantList participants={participants} onRemove={jest.fn()} isAdmin={false} />
    );

    expect(getByText("2")).toBeTruthy();
    expect(getByText("Ada Lovelace")).toBeTruthy();
    expect(getByText("Alan Turing")).toBeTruthy();
  });

  it("muestra el @usuario cuando el participante tiene nombreUsuario", async () => {
    const { getByText } = await render(
      <ParticipantList
        participants={[participante({ nombreUsuario: "adalovelace" })]}
        onRemove={jest.fn()}
        isAdmin={false}
      />
    );

    expect(getByText("@adalovelace")).toBeTruthy();
  });

  it("no muestra ninguna línea de @usuario si el participante no tiene nombreUsuario", async () => {
    const { queryByText } = await render(
      <ParticipantList participants={[participante()]} onRemove={jest.fn()} isAdmin={false} />
    );

    expect(queryByText(/^@/)).toBeNull();
  });

  it("muestra el badge 'Organizador' para el participante administrador", async () => {
    const { getByText } = await render(
      <ParticipantList
        participants={[participante({ role: "administrador" })]}
        onRemove={jest.fn()}
        isAdmin={false}
      />
    );

    expect(getByText("Organizador")).toBeTruthy();
  });

  it("no muestra el badge 'Organizador' para un participante que no lo es", async () => {
    const { queryByText } = await render(
      <ParticipantList
        participants={[participante({ role: "miembro" })]}
        onRemove={jest.fn()}
        isAdmin={false}
      />
    );

    expect(queryByText("Organizador")).toBeNull();
  });

  it("muestra 'Registrado' para participantes con cuenta y 'Invitación pendiente' para externos", async () => {
    const participants = [
      participante({ key: "1", kind: "registered" }),
      participante({ key: "2", kind: "external" }),
    ];

    const { getByText } = await render(
      <ParticipantList participants={participants} onRemove={jest.fn()} isAdmin={false} />
    );

    expect(getByText("Registrado")).toBeTruthy();
    expect(getByText("Invitación pendiente")).toBeTruthy();
  });

  it("no muestra el botón de quitar si el usuario actual no es admin", async () => {
    const { queryByTestId } = await render(
      <ParticipantList
        participants={[participante({ key: "1" })]}
        onRemove={jest.fn()}
        isAdmin={false}
      />
    );

    expect(queryByTestId("participant-remove-1")).toBeNull();
  });

  it("no muestra el botón de quitar sobre el propio organizador, aunque el usuario actual sea admin", async () => {
    const { queryByTestId } = await render(
      <ParticipantList
        participants={[participante({ key: "1", role: "administrador" })]}
        onRemove={jest.fn()}
        isAdmin
      />
    );

    expect(queryByTestId("participant-remove-1")).toBeNull();
  });

  it("siendo admin, muestra el botón de quitar sobre los demás participantes y llama a onRemove", async () => {
    const onRemove = jest.fn();
    const participants = [
      participante({ key: "1", nombreCompleto: "Ada Lovelace", role: "administrador" }),
      participante({ key: "2", nombreCompleto: "Alan Turing", role: "miembro" }),
    ];

    const { getByTestId, queryByTestId } = await render(
      <ParticipantList participants={participants} onRemove={onRemove} isAdmin />
    );

    expect(queryByTestId("participant-remove-1")).toBeNull();

    fireEvent.press(getByTestId("participant-remove-2"));

    expect(onRemove).toHaveBeenCalledWith(participants[1]);
  });
});