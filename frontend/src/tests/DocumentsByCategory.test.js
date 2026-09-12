import { act, fireEvent, render } from "@testing-library/react-native";

import DocumentosPorCategoria, {
  ID_TODAS,
} from "../components/trip/DocumentsByCategory";

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
        categoriaFiltro={ID_TODAS}
        onCategoriaChange={jest.fn()}
      />
    );

    expect(
      getByText("Todavía no hay documentos cargados en este viaje.")
    ).toBeTruthy();
  });

  it("agrupa los documentos por categoría y muestra el contador de cada chip", async () => {
    const documentos = [
      documento({ IdDocumento: 1, IdCategoriaDocumento: 10, NombreCategoria: "Pasajes" }),
      documento({ IdDocumento: 2, IdCategoriaDocumento: 10, NombreCategoria: "Pasajes" }),
      documento({ IdDocumento: 3, IdCategoriaDocumento: 20, NombreCategoria: "Alojamiento" }),
    ];

    const { getByText } = await render(
      <DocumentosPorCategoria
        documentos={documentos}
        categoriaFiltro={ID_TODAS}
        onCategoriaChange={jest.fn()}
      />
    );

    expect(getByText("Todos (3)")).toBeTruthy();
    expect(getByText("Pasajes (2)")).toBeTruthy();
    expect(getByText("Alojamiento (1)")).toBeTruthy();
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
        categoriaFiltro={ID_TODAS}
        onCategoriaChange={jest.fn()}
      />
    );

    // Los títulos de sección se renderizan en el mismo orden que las chips.
    const titulos = getAllByText(/^(Otros|Vuelos|Alojamiento)$/).map(
      (n) => n.props.children
    );
    expect(titulos).toEqual(["Alojamiento", "Vuelos", "Otros"]);
  });

  it("al tocar un chip de categoría, llama a onCategoriaChange con el id correspondiente", async () => {
    const onCategoriaChange = jest.fn();
    const documentos = [
      documento({ IdDocumento: 1, IdCategoriaDocumento: 10, NombreCategoria: "Pasajes" }),
    ];

    const { getByTestId } = await render(
      <DocumentosPorCategoria
        documentos={documentos}
        categoriaFiltro={ID_TODAS}
        onCategoriaChange={onCategoriaChange}
      />
    );

    fireEvent.press(getByTestId("documentos-categoria-10"));

    expect(onCategoriaChange).toHaveBeenCalledWith(10);
  });

  it("al tocar el chip 'Todos', llama a onCategoriaChange con ID_TODAS", async () => {
    const onCategoriaChange = jest.fn();
    const documentos = [documento({ IdCategoriaDocumento: 10, NombreCategoria: "Pasajes" })];

    const { getByTestId } = await render(
      <DocumentosPorCategoria
        documentos={documentos}
        categoriaFiltro={10}
        onCategoriaChange={onCategoriaChange}
      />
    );

    fireEvent.press(getByTestId("documentos-categoria-todas"));

    expect(onCategoriaChange).toHaveBeenCalledWith(ID_TODAS);
  });

  it("al filtrar por una categoría puntual, oculta el título de sección y solo muestra esos documentos", async () => {
    const documentos = [
      documento({ IdDocumento: 1, IdCategoriaDocumento: 10, NombreCategoria: "Pasajes", NombreArchivo: "vuelo.pdf" }),
      documento({ IdDocumento: 2, IdCategoriaDocumento: 20, NombreCategoria: "Alojamiento", NombreArchivo: "hotel.pdf" }),
    ];

    const { getByText, queryByText } = await render(
      <DocumentosPorCategoria
        documentos={documentos}
        categoriaFiltro={10}
        onCategoriaChange={jest.fn()}
      />
    );

    expect(getByText("vuelo.pdf")).toBeTruthy();
    expect(queryByText("hotel.pdf")).toBeNull();
    // ocultarTitulo: el nombre de categoría no debe aparecer como título de sección
    expect(queryByText("Pasajes")).toBeNull();
  });

  it("si categoriaFiltro no corresponde a ninguna categoría existente, avisa y pide volver a 'Todos'", async () => {
    const onCategoriaChange = jest.fn();
    const documentos = [documento({ IdCategoriaDocumento: 10, NombreCategoria: "Pasajes" })];

    const { getByText } = await render(
      <DocumentosPorCategoria
        documentos={documentos}
        categoriaFiltro={999}
        onCategoriaChange={onCategoriaChange}
      />
    );

    expect(getByText("No hay documentos en esta categoría.")).toBeTruthy();
    expect(onCategoriaChange).toHaveBeenCalledWith(ID_TODAS);
  });

  it("muestra el badge PÚBLICO cuando el documento es público", async () => {
    const { getByText } = await render(
      <DocumentosPorCategoria
        documentos={[documento({ EsPublico: true })]}
        categoriaFiltro={ID_TODAS}
        onCategoriaChange={jest.fn()}
      />
    );

    expect(getByText("PÚBLICO")).toBeTruthy();
  });

  it("muestra el badge PRIVADO cuando el documento no es público", async () => {
    const { getByText } = await render(
      <DocumentosPorCategoria
        documentos={[documento({ EsPublico: false })]}
        categoriaFiltro={ID_TODAS}
        onCategoriaChange={jest.fn()}
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
        categoriaFiltro={ID_TODAS}
        onCategoriaChange={jest.fn()}
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
        categoriaFiltro={ID_TODAS}
        onCategoriaChange={jest.fn()}
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
        categoriaFiltro={ID_TODAS}
        onCategoriaChange={jest.fn()}
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
        categoriaFiltro={ID_TODAS}
        onCategoriaChange={jest.fn()}
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
        categoriaFiltro={ID_TODAS}
        onCategoriaChange={jest.fn()}
      />
    );

    expect(getByText("Pasajes · Subido por Alan Turing")).toBeTruthy();
  });
});