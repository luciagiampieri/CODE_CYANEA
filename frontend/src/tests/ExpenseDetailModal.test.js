import { fireEvent, render } from "@testing-library/react-native";

import ExpenseDetailModal from "../components/trip/ExpenseDetailModal";

function detalle(overrides = {}) {
  return {
    IdGasto: 15,
    IdViaje: 3,
    Nombre: "Cena",
    Monto: "900.00",
    MontoOriginal: "900.00",
    MonedaOriginal: "ARS",
    MonedaViaje: "ARS",
    TipoCambio: "1.000000",
    FechaGasto: "2026-10-10",
    IdCategoria: 1,
    NombreCategoria: "Comida y Bebida",
    IdPagador: 8,
    IdUsuarioPagador: 12,
    NombrePagador: "Carla Test",
    IdParticipanteCreador: 7,
    NombreCreador: "Bruno Test",
    EsCompartido: true,
    TipoDivision: "igualitaria",
    DividirEntreTodos: false,
    Participantes: [
      { IdParticipanteViaje: 6, IdUsuario: 10, Nombre: "Ana", Apellido: "Test", NombreUsuario: "ana", MontoAsignado: "300.00" },
      { IdParticipanteViaje: 8, IdUsuario: 12, Nombre: "Carla", Apellido: "Test", NombreUsuario: "carla", MontoAsignado: "300.00" },
      { IdParticipanteViaje: 9, IdUsuario: 13, Nombre: "Dario", Apellido: "Test", NombreUsuario: "dario", MontoAsignado: "300.00" },
    ],
    PuedeEditar: true,
    CodigoNoEditable: null,
    MotivoNoEditable: null,
    IdUsuarioEditando: null,
    NombreUsuarioEditando: null,
    ...overrides,
  };
}

describe("ExpenseDetailModal", () => {
  it("muestra los datos del gasto y su división", async () => {
    const { getByTestId, getByText } = await render(
      <ExpenseDetailModal currentUserId={10} gasto={detalle()} visible onClose={jest.fn()} />
    );

    expect(getByTestId("expense-detail-nombre")).toHaveTextContent("Cena");
    expect(getByText("Comida y Bebida")).toBeTruthy();
    expect(getByTestId("expense-detail-pagador")).toHaveTextContent(/Carla Test/);
    expect(getByText("Bruno Test")).toBeTruthy();
    expect(getByText("Compartido · división igualitaria")).toBeTruthy();
    expect(getByText("Ana Test")).toBeTruthy();
    expect(getByText("Dario Test")).toBeTruthy();
  });

  it("indica cuando el usuario actual es quien pagó", async () => {
    const { getByTestId } = await render(
      <ExpenseDetailModal currentUserId={12} gasto={detalle()} visible onClose={jest.fn()} />
    );

    expect(getByTestId("expense-detail-pagador")).toHaveTextContent(/Carla Test \(vos\)/);
  });

  it("muestra el monto original si se registró en otra moneda", async () => {
    const { getByTestId } = await render(
      <ExpenseDetailModal
        currentUserId={10}
        gasto={detalle({ MonedaOriginal: "USD", MontoOriginal: "3.00", Monto: "3000.00" })}
        visible
        onClose={jest.fn()}
      />
    );

    expect(getByTestId("expense-detail-original")).toHaveTextContent(/Registrado:/);
  });

  it("con permiso muestra el botón Editar y lo dispara con el gasto", async () => {
    const onEdit = jest.fn();
    const gasto = detalle();
    const { getByTestId, queryByTestId } = await render(
      <ExpenseDetailModal currentUserId={12} gasto={gasto} visible onClose={jest.fn()} onEdit={onEdit} />
    );

    expect(queryByTestId("expense-detail-motivo")).toBeNull();
    fireEvent.press(getByTestId("expense-detail-edit"));
    expect(onEdit).toHaveBeenCalledWith(gasto);
  });

  it("sin permiso muestra el motivo y no el botón Editar", async () => {
    const { getByTestId, queryByTestId } = await render(
      <ExpenseDetailModal
        currentUserId={13}
        gasto={detalle({
          PuedeEditar: false,
          CodigoNoEditable: "EXPENSE_EDIT_FORBIDDEN",
          MotivoNoEditable: "Solo el creador del gasto o su pagador actual pueden editarlo.",
        })}
        visible
        onClose={jest.fn()}
        onEdit={jest.fn()}
      />
    );

    expect(queryByTestId("expense-detail-edit")).toBeNull();
    expect(getByTestId("expense-detail-motivo")).toHaveTextContent(
      /Solo el creador del gasto o su pagador actual pueden editarlo\./
    );
  });

  it("avisa si otro usuario está editando el gasto", async () => {
    const { getByTestId } = await render(
      <ExpenseDetailModal
        currentUserId={12}
        gasto={detalle({ IdUsuarioEditando: 11, NombreUsuarioEditando: "Bruno Test" })}
        visible
        onClose={jest.fn()}
      />
    );

    expect(getByTestId("expense-detail-editando")).toHaveTextContent(/Bruno Test está editando este gasto\./);
  });

  it("muestra el error de carga y permite reintentar", async () => {
    const onRetry = jest.fn();
    const { getByText } = await render(
      <ExpenseDetailModal error="No se pudo cargar el gasto" visible onClose={jest.fn()} onRetry={onRetry} />
    );

    fireEvent.press(getByText("Reintentar"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("se cierra con la cruz", async () => {
    const onClose = jest.fn();
    const { getByTestId } = await render(
      <ExpenseDetailModal currentUserId={10} gasto={detalle()} visible onClose={onClose} />
    );

    fireEvent.press(getByTestId("expense-detail-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("permite eliminar el gasto desde el detalle", async () => {
    const onDelete = jest.fn();
    const gasto = detalle();
    const { getByTestId } = await render(
      <ExpenseDetailModal canDelete currentUserId={13} gasto={gasto} visible onClose={jest.fn()} onDelete={onDelete} />
    );

    fireEvent.press(getByTestId("expense-detail-delete"));
    expect(onDelete).toHaveBeenCalledWith(gasto);
  });

  it("sin permiso de edición igual puede eliminar si canDelete", async () => {
    const { getByTestId, queryByTestId } = await render(
      <ExpenseDetailModal
        canDelete
        currentUserId={13}
        gasto={detalle({ PuedeEditar: false, MotivoNoEditable: "Solo el creador del gasto o su pagador actual pueden editarlo." })}
        visible
        onClose={jest.fn()}
        onDelete={jest.fn()}
        onEdit={jest.fn()}
      />
    );

    expect(getByTestId("expense-detail-delete")).toBeTruthy();
    expect(queryByTestId("expense-detail-edit")).toBeNull();
  });

  it("no muestra Eliminar si no se puede eliminar", async () => {
    const { queryByTestId } = await render(
      <ExpenseDetailModal currentUserId={12} gasto={detalle()} visible onClose={jest.fn()} onDelete={jest.fn()} />
    );

    expect(queryByTestId("expense-detail-delete")).toBeNull();
  });
});