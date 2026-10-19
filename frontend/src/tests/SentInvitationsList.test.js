import { fireEvent, render } from "@testing-library/react-native";

import SentInvitationsList, {
  formatInvitationDate,
} from "../components/trip/SentInvitationsList";

function invitacion(overrides = {}) {
  return {
    userId: 1,
    nombreUsuario: "pepe",
    nombreCompleto: "Pepe Test",
    fotoUrl: null,
    status: "pendiente",
    invitedAt: "2026-09-03T10:00:00",
    respondedAt: null,
    ...overrides,
  };
}

const invitaciones = [
  invitacion({ userId: 1, nombreUsuario: "pepe", status: "pendiente" }),
  invitacion({ userId: 2, nombreUsuario: "ana", status: "aceptada" }),
  invitacion({ userId: 3, nombreUsuario: "rita", status: "rechazada" }),
];

describe("SentInvitationsList", () => {
  it("muestra usuario, estado y fecha de envío de cada invitación", async () => {
    const { getAllByText, getByText } = await render(
      <SentInvitationsList invitations={invitaciones} />
    );

    expect(getByText("@pepe")).toBeTruthy();
    expect(getByText("Pendiente")).toBeTruthy();
    expect(getByText("Aceptada")).toBeTruthy();
    expect(getByText("Rechazada")).toBeTruthy();
    expect(getAllByText("· Enviada el 3 sep", { exact: false })).toHaveLength(3);
  });

  it("filtra por estado pendiente", async () => {
    const { getByTestId, queryByText } = await render(
      <SentInvitationsList invitations={invitaciones} />
    );

    await fireEvent.press(getByTestId("invitation-filter-pendiente"));

    expect(queryByText("@pepe")).toBeTruthy();
    expect(queryByText("@ana")).toBeNull();
    expect(queryByText("@rita")).toBeNull();
  });

  it("muestra la cantidad por estado en cada filtro", async () => {
    const { getByText } = await render(<SentInvitationsList invitations={invitaciones} />);

    expect(getByText("Todas")).toBeTruthy();
    expect(getByText("3")).toBeTruthy();
    expect(getByText("Pendientes")).toBeTruthy();
  });

  it("muestra y filtra las invitaciones vencidas al finalizar el viaje (US 103)", async () => {
    const lista = [...invitaciones, invitacion({ userId: 4, nombreUsuario: "flor", status: "vencida" })];
    const { getByTestId, getByText, queryByText, queryByTestId } = await render(
      <SentInvitationsList invitations={lista} onCancel={jest.fn()} onResend={jest.fn()} />
    );

    expect(getByText("Vencida")).toBeTruthy();
    expect(getByText("Vencidas")).toBeTruthy();

    await fireEvent.press(getByTestId("invitation-filter-vencida"));

    expect(queryByText("@flor")).toBeTruthy();
    expect(queryByText("@pepe")).toBeNull();
    // Una invitación vencida no se puede cancelar.
    expect(queryByTestId("sent-invitation-cancel-4")).toBeNull();
    expect(queryByTestId("sent-invitation-resend-4")).toBeNull();
  });

  it("muestra mensaje cuando no hay invitaciones enviadas", async () => {
    const { getByText } = await render(<SentInvitationsList invitations={[]} />);

    expect(getByText(/Todavía no enviaste invitaciones/)).toBeTruthy();
  });

  it("no muestra filtros si todas las invitaciones tienen el mismo estado", async () => {
    const { getByText, queryByTestId } = await render(
      <SentInvitationsList invitations={[invitacion({ status: "pendiente" })]} />
    );

    expect(getByText("@pepe")).toBeTruthy();
    expect(queryByTestId("invitation-filter-todas")).toBeNull();
    expect(queryByTestId("invitation-filter-pendiente")).toBeNull();
  });

  it("muestra solo los filtros de estados que tienen invitaciones", async () => {
    const lista = [
      invitacion({ userId: 1, status: "pendiente" }),
      invitacion({ userId: 3, nombreUsuario: "rita", status: "rechazada" }),
    ];
    const { getByTestId, queryByTestId } = await render(<SentInvitationsList invitations={lista} />);

    expect(getByTestId("invitation-filter-todas")).toBeTruthy();
    expect(getByTestId("invitation-filter-pendiente")).toBeTruthy();
    expect(getByTestId("invitation-filter-rechazada")).toBeTruthy();
    expect(queryByTestId("invitation-filter-aceptada")).toBeNull();
    expect(queryByTestId("invitation-filter-vencida")).toBeNull();
  });

  it("vuelve a 'Todas' si el estado elegido se queda sin invitaciones", async () => {
    const lista = [
      invitacion({ userId: 1, status: "pendiente" }),
      invitacion({ userId: 2, nombreUsuario: "ana", status: "aceptada" }),
      invitacion({ userId: 3, nombreUsuario: "rita", status: "rechazada" }),
    ];
    const utils = await render(<SentInvitationsList invitations={lista} />);

    await fireEvent.press(utils.getByTestId("invitation-filter-pendiente"));
    expect(utils.queryByText("@ana")).toBeNull();

    await utils.rerender(<SentInvitationsList invitations={lista.slice(1)} />);

    expect(utils.getByText("@ana")).toBeTruthy();
    expect(utils.getByText("@rita")).toBeTruthy();
    expect(utils.getByTestId("invitation-filter-todas").props.accessibilityState.selected).toBe(true);
  });

  it("permite cancelar solo las invitaciones pendientes", async () => {
    const onCancel = jest.fn();
    const { getByTestId, queryByTestId } = await render(
      <SentInvitationsList invitations={invitaciones} onCancel={onCancel} />
    );

    expect(queryByTestId("sent-invitation-cancel-2")).toBeNull();
    expect(queryByTestId("sent-invitation-cancel-3")).toBeNull();

    await fireEvent.press(getByTestId("sent-invitation-cancel-1"));
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }));
  });

  it("permite volver a invitar solo a quien rechazó la invitación", async () => {
    const onResend = jest.fn();
    const { getByTestId, queryByTestId } = await render(
      <SentInvitationsList invitations={invitaciones} onResend={onResend} />
    );

    expect(queryByTestId("sent-invitation-resend-1")).toBeNull(); 
    expect(queryByTestId("sent-invitation-resend-2")).toBeNull();

    await fireEvent.press(getByTestId("sent-invitation-resend-3"));
    expect(onResend).toHaveBeenCalledWith(expect.objectContaining({ userId: 3 }));
  });

  it("no muestra la acción de volver a invitar si no se recibe onResend", async () => {
    const { queryByTestId } = await render(<SentInvitationsList invitations={invitaciones} />);

    expect(queryByTestId("sent-invitation-resend-3")).toBeNull();
  });

  it("no muestra la acción de cancelar si no se recibe onCancel", async () => {
    const { queryByTestId } = await render(<SentInvitationsList invitations={invitaciones} />);

    expect(queryByTestId("sent-invitation-cancel-1")).toBeNull();
  });
});

describe("formatInvitationDate", () => {
  it("muestra día y mes abreviado si es del año en curso", () => {
    expect(formatInvitationDate("2026-09-03T10:00:00", new Date(2026, 8, 28))).toBe("3 sep");
  });

  it("agrega el año si la invitación es de otro año", () => {
    expect(formatInvitationDate("2025-12-24T10:00:00", new Date(2026, 8, 28))).toBe("24 dic 2025");
  });

  it("devuelve vacío si no hay fecha", () => {
    expect(formatInvitationDate(null)).toBe("");
  });
});

describe("SentInvitationsList con error", () => {
  it("muestra el error sin filtros y permite reintentar", async () => {
    const onRetry = jest.fn();
    const { getByText, getByTestId, queryByTestId } = await render(
      <SentInvitationsList
        invitations={[]}
        error="No pudimos cargar las invitaciones enviadas."
        onRetry={onRetry}
      />
    );

    expect(getByText("No pudimos cargar las invitaciones enviadas.")).toBeTruthy();
    expect(queryByTestId("invitation-filter-todas")).toBeNull();

    await fireEvent.press(getByTestId("sent-invitations-retry"));
    expect(onRetry).toHaveBeenCalled();
  });
});