import React from "react";
import { Platform, StyleSheet } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

import TextoAjustable, { tamanoParaAncho } from "../components/ui/TextoAjustable";

// En la web, adjustsFontSizeToFit no existe: el monto se cortaba con "…". El componente
// mide el ancho y achica la letra, y si ni así entra usa el formato abreviado.

describe("tamanoParaAncho", () => {
  it("si entra deja el tamaño base", () => {
    expect(tamanoParaAncho("$ 1.000", 300, 22, 15)).toEqual({ tamano: 22, entra: true });
  });

  it("achica la letra hasta que entra", () => {
    const { tamano, entra } = tamanoParaAncho("$ 1.234.567,89", 150, 22, 10);
    expect(entra).toBe(true);
    expect(tamano).toBeLessThan(22);
    expect(tamano).toBeGreaterThanOrEqual(10);
  });

  it("no baja del mínimo y avisa que no entra", () => {
    expect(tamanoParaAncho("$ 123.456.789.012,50", 100, 22, 15)).toEqual({ tamano: 15, entra: false });
  });

  it("sin ancho medido todavía usa el tamaño base", () => {
    expect(tamanoParaAncho("$ 1.000", 0, 22, 15)).toEqual({ tamano: 22, entra: true });
  });
});

describe("TextoAjustable", () => {
  const osOriginal = Platform.OS;

  afterEach(() => {
    Platform.OS = osOriginal;
  });

  const tamanoDe = (elemento) => StyleSheet.flatten(elemento.props.style).fontSize;

  async function medir(utils, ancho) {
    // El contenedor es el padre del texto: es el que informa el ancho disponible.
    const contenedor = utils.getByTestId("monto").parent;
    await act(async () => {
      fireEvent(contenedor, "layout", { nativeEvent: { layout: { width: ancho, height: 30 } } });
    });
  }

  it("en Android/iOS usa adjustsFontSizeToFit como siempre", async () => {
    const utils = await render(
      <TextoAjustable style={{ fontSize: 22 }} minimumFontScale={0.7} testID="monto">
        $ 1.000
      </TextoAjustable>
    );

    const texto = utils.getByTestId("monto");
    expect(texto.props.adjustsFontSizeToFit).toBe(true);
    expect(texto.props.minimumFontScale).toBe(0.7);
    expect(texto.props.numberOfLines).toBe(1);
  });

  it("en la web achica la letra según el ancho y muestra el monto entero", async () => {
    Platform.OS = "web";
    const utils = await render(
      <TextoAjustable style={{ fontSize: 22 }} textoCompacto="$ 1,2 M" testID="monto">
        $ 1.234.567
      </TextoAjustable>
    );

    await medir(utils, 130);

    const texto = utils.getByTestId("monto");
    expect(texto.props.children).toBe("$ 1.234.567");
    expect(tamanoDe(texto)).toBeLessThan(22);
    expect(tamanoDe(texto)).toBeGreaterThanOrEqual(15);
  });

  it("en la web, si ni con la letra mínima entra, usa el abreviado y conserva el monto completo para accesibilidad", async () => {
    Platform.OS = "web";
    const utils = await render(
      <TextoAjustable style={{ fontSize: 22 }} textoCompacto="$ 123,5 mil M" testID="monto">
        $ 123.456.789.012,50
      </TextoAjustable>
    );

    await medir(utils, 120);

    const texto = utils.getByTestId("monto");
    expect(texto.props.children).toBe("$ 123,5 mil M");
    expect(texto.props.accessibilityLabel).toBe("$ 123.456.789.012,50");
  });
});
