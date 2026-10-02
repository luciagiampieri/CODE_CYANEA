import { act, fireEvent, render } from "@testing-library/react-native";

import DocumentosPorCategoria from "../components/trip/DocumentsByCategory";

function documento(overrides = {}) {
  return {
    IdDocumento: 1,
    IdCategoriaDocumento: 10,
    NombreCategoria: "Pasajes",
    NombreArchivo: "vuelo.pdf",
    NombreUsuarioSubida: "Ada Lovelace",
    EsPublico: false,
    EsPropio: false,
    ...overrides,
  };
}

describe("DocumentsByCategory", () => {
  it("muestra el estado vacío cuando no hay documentos", async () => {
    const { getByText } = await render(
      <DocumentosPorCategoria
        documentos={[]}
      />
    );

    expect(
      getByText("Todavía no hay documentos cargados en este viaje.")
    ).toBeTruthy();
  });

  it("agrupa los documentos por categoría y muestra el contador de cada sección", async () => {
    const documentos = [
      documento({ IdDocumento: 1, IdCategoriaDocumento: 10, NombreCategoria: "Pasajes" }),
      documento({ IdDocumento: 2, IdCategoriaDocumento: 10, NombreCategoria: "Pasajes" }),
      documento({ IdDocumento: 3, IdCategoriaDocumento: 20, NombreCategoria: "Alojamiento" }),
    ];

    const { getByText } = await render(
      <DocumentosPorCategoria
        documentos={documentos}
      />
    );

    expect(getByText("Pasajes")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();
    expect(getByText("Alojamiento")).toBeTruthy();
    expect(getByText("1")).toBeTruthy();
  });

  it("ordena las categorías alfabéticamente y deja 'Otros' siempre al final", async () => {
    const documentos = [
      documento({ IdDocumento: 1, IdCategoriaDocumento: 1, NombreCategoria: "Otros" }),
      documento({ IdDocumento: 2, IdCategoriaDocumento: 2, NombreCategoria: "Vuelos" }),
      documento({ IdDocumento: 3, IdCategoriaDocumento: 3, NombreCategoria: "Alojamiento" }),
    ];

    const { getAllByText } = await render(
      <DocumentosPorCategoria
        documentos={documentos}
      />
    );

    const titulos = getAllByText(/^(Otros|Vuelos|Alojamiento)$/).map(
      (n) => n.props.children
    );
    expect(titulos).toEqual(["Alojamiento", "Vuelos", "Otros"]);
  });

  it("muestra el badge PÚBLICO cuando el documento es público", async () => {
    const { getByText } = await render(
      <DocumentosPorCategoria
        documentos={[documento({ EsPublico: true })]}
      />
    );

    expect(getByText("PÚBLICO")).toBeTruthy();
  });

  it("muestra el badge PRIVADO cuando el documento no es público", async () => {
    const { getByText } = await render(
      <DocumentosPorCategoria
        documentos={[documento({ EsPublico: false })]}
      />
    );

    expect(getByText("PRIVADO")).toBeTruthy();
  });

  it("muestra los botones Editar y Eliminar solo cuando el documento es propio", async () => {
    const propio = documento({ IdDocumento: 1, EsPropio: true });
    const ajeno = documento({ IdDocumento: 2, EsPropio: false });

    const { getByTestId, queryByTestId } = await render(
      <DocumentosPorCategoria
        documentos={[propio, ajeno]}
      />
    );

    expect(getByTestId("documento-editar-1")).toBeTruthy();
    expect(getByTestId("documento-eliminar-1")).toBeTruthy();
    expect(queryByTestId("documento-editar-2")).toBeNull();
    expect(queryByTestId("documento-eliminar-2")).toBeNull();
  });

  it("al presionar la tarjeta llama a onAbrir, y Descargar/Editar/Eliminar llaman a sus callbacks", async () => {
    const onAbrir = jest.fn();
    const onDescargar = jest.fn();
    const onEditar = jest.fn();
    const onEliminar = jest.fn();
    const doc = documento({ IdDocumento: 5, EsPropio: true });

    const { getByTestId } = await render(
      <DocumentosPorCategoria
        documentos={[doc]}
        onAbrir={onAbrir}
        onDescargar={onDescargar}
        onEditar={onEditar}
        onEliminar={onEliminar}
      />
    );

    await act(async () => {
      fireEvent.press(getByTestId("documento-abrir-5"));
    });
    await act(async () => {
      fireEvent.press(getByTestId("documento-descargar-5"));
    });
    await act(async () => {
      fireEvent.press(getByTestId("documento-editar-5"));
    });
    await act(async () => {
      fireEvent.press(getByTestId("documento-eliminar-5"));
    });

    expect(onAbrir).toHaveBeenCalledWith(doc);
    expect(onDescargar).toHaveBeenCalledWith(doc);
    expect(onEditar).toHaveBeenCalledWith(doc);
    expect(onEliminar).toHaveBeenCalledWith(doc);
  });

  it("mientras descarga, muestra 'Descargando...' y deshabilita el botón", async () => {
    const doc = documento({ IdDocumento: 7 });

    const { getByText, getByTestId } = await render(
      <DocumentosPorCategoria
        documentos={[doc]}
        descargandoDocId={7}
      />
    );

    expect(getByText("Descargando...")).toBeTruthy();
    expect(getByTestId("documento-descargar-7").props.accessibilityState.disabled).toBe(true);
  });

  it("mientras elimina, muestra 'Eliminando...' y deshabilita el botón", async () => {
    const doc = documento({ IdDocumento: 8, EsPropio: true });

    const { getByText, getByTestId } = await render(
      <DocumentosPorCategoria
        documentos={[doc]}
        eliminandoDocId={8}
      />
    );

    expect(getByText("Eliminando...")).toBeTruthy();
    expect(getByTestId("documento-eliminar-8").props.accessibilityState.disabled).toBe(true);
  });

  it("muestra la categoría y quién subió el documento en el meta", async () => {
    const doc = documento({
      NombreCategoria: "Pasajes",
      NombreUsuarioSubida: "Alan Turing",
    });

    const { getByText } = await render(
      <DocumentosPorCategoria
        documentos={[doc]}
      />
    );

    expect(getByText("Pasajes · Subido por Alan Turing")).toBeTruthy();
  });
});