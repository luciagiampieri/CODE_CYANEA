import React, { useState } from "react";
import { Pressable, Text } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

import RecorridoViaje, { AvisoRecorrido, EncabezadoDestinos } from "../components/trip/RecorridoViaje";
import useDeshacerDestino from "../hooks/useDeshacerDestino";
import { colors } from "../theme/tokens";

jest.mock("@expo/vector-icons", () => {
  const { Text: TextoIcono } = require("react-native");
  const ReactActual = require("react");
  return {
    FontAwesome6: ({ name }) => ReactActual.createElement(TextoIcono, null, `icono-${name}`),
  };
});

const destino = (name, noches = null, nochesEnViaje = 0, extra = {}) => ({
  name,
  country: "Argentina",
  noches,
  nochesEnViaje,
  ...extra,
});

function Recorrido({ inicial, endDate = "2026-11-12", onCambio, onQuitar = jest.fn(), onArrastreChange }) {
  const [destinos, setDestinos] = useState(inicial);
  return (
    <RecorridoViaje
      destinos={destinos}
      startDate="2026-11-03"
      endDate={endDate}
      onChange={(nuevos) => {
        setDestinos(nuevos);
        onCambio?.(nuevos);
      }}
      onQuitar={onQuitar}
      onAgregar={jest.fn()}
      onArrastreChange={onArrastreChange}
    />
  );
}

async function pulsar(utils, etiqueta) {
  await act(async () => {
    fireEvent.press(utils.getByLabelText(etiqueta));
  });
}

async function pulsarTexto(utils, texto) {
  await act(async () => {
    fireEvent.press(utils.getByText(texto));
  });
}

describe("EncabezadoDestinos", () => {
  it("muestra el título con el rango y las noches", async () => {
    const utils = await render(<EncabezadoDestinos startDate="2026-11-04" endDate="2026-11-11" />);

    expect(utils.getByText("Tus destinos")).toBeTruthy();
    expect(utils.getByText("4 al 11 nov · 7 noches")).toBeTruthy();
  });

  it("sin fechas muestra solo el título", async () => {
    const utils = await render(<EncabezadoDestinos startDate="" endDate="" />);

    expect(utils.getByText("Tus destinos")).toBeTruthy();
    expect(utils.queryByText(/noches/)).toBeNull();
  });
});

describe("AvisoRecorrido", () => {
  const colorDe = (elemento) => [elemento.props.style].flat(Infinity).find((s) => s?.color)?.color;

  it("no muestra nada sin tono", async () => {
    const utils = await render(<AvisoRecorrido mensaje="Hola" />);

    expect(utils.queryByText("Hola")).toBeNull();
  });

  it("el error es una alerta en rojo", async () => {
    const utils = await render(<AvisoRecorrido tono="danger" mensaje="Hay 1 noche de más." />);

    expect(utils.getByRole("alert")).toBeTruthy();
    expect(utils.getByText("icono-circle-exclamation")).toBeTruthy();
    expect(colorDe(utils.getByText("Hay 1 noche de más."))).toBe(colors.danger);
  });

  it("el aviso usa el tono de warning y no es una alerta", async () => {
    const utils = await render(<AvisoRecorrido tono="warning" mensaje="Quedan 2 noches." />);

    expect(utils.queryByRole("alert")).toBeNull();
    expect(utils.getByText("icono-triangle-exclamation")).toBeTruthy();
    expect(colorDe(utils.getByText("Quedan 2 noches."))).toBe(colors.warningText);
  });

  it("el informativo no es una alerta", async () => {
    const utils = await render(<AvisoRecorrido tono="info" mensaje="Indicá las noches." />);

    expect(utils.queryByRole("alert")).toBeNull();
    expect(utils.getByText("icono-circle-info")).toBeTruthy();
    expect(colorDe(utils.getByText("Indicá las noches."))).toBe(colors.primary);
  });

  it("muestra el link dentro del aviso, en el color del texto", async () => {
    const onPress = jest.fn();
    const utils = await render(
      <AvisoRecorrido tono="danger" mensaje="No entran." accion={{ texto: "Ir ›", onPress }} />
    );

    expect(colorDe(utils.getByText("Ir ›"))).toBe(colors.danger);
    expect(utils.getByRole("alert")).toBeTruthy();

    await pulsarTexto(utils, "Ir ›");

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("todo bien muestra el check en verde", async () => {
    const utils = await render(<AvisoRecorrido tono="success" mensaje="Repartidas." />);

    expect(utils.queryByRole("alert")).toBeNull();
    expect(utils.getByText("icono-check")).toBeTruthy();
    expect(colorDe(utils.getByText("Repartidas."))).toBe(colors.success);
  });
});

describe("RecorridoViaje", () => {
  it("con un destino muestra 'Todo el viaje', el total y no pide noches", async () => {
    const utils = await render(<Recorrido inicial={[destino("Salta")]} />);

    expect(utils.getByText("Todo el viaje")).toBeTruthy();
    expect(utils.getByText("9 noches")).toBeTruthy();
    expect(utils.queryByLabelText("Sumar una noche a Salta")).toBeNull();
    expect(utils.queryByTestId("recorrido-mover-0")).toBeNull();
  });

  it("muestra el rango corto de cada destino y sin 'Llegás el'", async () => {
    const utils = await render(
      <Recorrido inicial={[destino("Mendoza", 3), destino("Salta", 3), destino("Cafayate", 3)]} />
    );

    expect(utils.getByText("3 → 6 nov")).toBeTruthy();
    expect(utils.getByText("6 → 9 nov")).toBeTruthy();
    expect(utils.getByText("9 → 12 nov")).toBeTruthy();
    expect(utils.queryByText(/Llegás/)).toBeNull();
    expect(utils.getByText("Las 9 noches están repartidas.")).toBeTruthy();
    expect(utils.getByTestId("recorrido-mover-2")).toBeTruthy();
  });

  it("muestra la región debajo del nombre y omite lo que se repite", async () => {
    const utils = await render(
      <Recorrido
        inicial={[
          destino("Mendoza", 3, 0, { provinceState: "Mendoza" }),
          destino("Argentina", 3, 0),
        ]}
      />
    );

    expect(utils.getByText("Mendoza")).toBeTruthy();
    expect(utils.getAllByText("Argentina")).toHaveLength(2);
    expect(utils.queryByText("Mendoza, Argentina")).toBeNull();
  });

  it("el nombre, la región y el rango no se cortan", async () => {
    const utils = await render(
      <Recorrido
        inicial={[
          destino("San Carlos de Bariloche", 3, 0, { provinceState: "Río Negro" }),
          destino("Salta", 3),
        ]}
      />
    );

    for (const texto of ["San Carlos de Bariloche", "Río Negro, Argentina", "3 → 6 nov"]) {
      expect(utils.getByText(texto).props.numberOfLines).toBeUndefined();
    }
  });

  it("cambia las noches con los botones y recalcula las fechas", async () => {
    const utils = await render(<Recorrido inicial={[destino("Mendoza", 3), destino("Salta", 3)]} />);

    await pulsar(utils, "Sumar una noche a Mendoza");

    expect(utils.getByText("3 → 7 nov")).toBeTruthy();
    expect(utils.getByText("Quedan 2 noches sin destino. Podés seguir igual.")).toBeTruthy();
  });

  it("la cruz avisa qué destino se quita", async () => {
    const onQuitar = jest.fn();
    const salta = destino("Salta", 3);
    const utils = await render(
      <Recorrido inicial={[destino("Mendoza", 3), salta]} onQuitar={onQuitar} />
    );

    await pulsar(utils, "Quitar Salta del viaje");

    expect(onQuitar).toHaveBeenCalledWith(salta);
  });

  it("muestra el traslado según las noches en viaje", async () => {
    const utils = await render(
      <Recorrido inicial={[destino("Mendoza", 3), destino("Salta", 2, 1), destino("Cafayate", 3)]} />
    );

    expect(utils.getByText("Traslado el 6 nov")).toBeTruthy();
    expect(utils.getByText("Mismo día")).toBeTruthy();
    expect(utils.getByText("Llegan el 9 nov")).toBeTruthy();
    expect(utils.getByText("1 noche")).toBeTruthy();
    expect(utils.getByTestId("recorrido-barra-enViaje")).toBeTruthy();
  });

  it("cambia las noches en viaje con la píldora en línea y vuelve a 'Mismo día' con 0", async () => {
    const onCambio = jest.fn();
    const utils = await render(
      <Recorrido inicial={[destino("Mendoza", 6), destino("Salta", 2)]} onCambio={onCambio} />
    );

    expect(utils.getByText("Traslado el 9 nov")).toBeTruthy();
    expect(utils.getByText("Mismo día")).toBeTruthy();

    await pulsar(utils, "Sumar una noche en viaje hacia Salta");

    expect(utils.getByText("Llegan el 10 nov")).toBeTruthy();
    expect(utils.getByText("1 noche")).toBeTruthy();
    expect(utils.queryByText("Mismo día")).toBeNull();
    expect(onCambio.mock.calls[0][0].map((d) => d.nochesEnViaje)).toEqual([1, 0]);

    await pulsar(utils, "Sumar una noche en viaje hacia Salta");

    expect(utils.getByText("Llegan el 11 nov")).toBeTruthy();

    await pulsar(utils, "Sacar una noche en viaje hacia Salta");
    await pulsar(utils, "Sacar una noche en viaje hacia Salta");

    expect(utils.getByText("Mismo día")).toBeTruthy();
    expect(utils.getByText("Traslado el 9 nov")).toBeTruthy();
  });

  it("avisa el destino sin noches y reparte automáticamente", async () => {
    const onCambio = jest.fn();
    const utils = await render(
      <Recorrido inicial={[destino("Salta", 9), destino("Cafayate", 0)]} onCambio={onCambio} />
    );

    expect(utils.getByText(/Cafayate todavía no tiene noches/)).toBeTruthy();

    await pulsarTexto(utils, "Repartir automáticamente");

    expect(onCambio.mock.calls[0][0].map((d) => d.noches)).toEqual([5, 4]);
    expect(utils.queryByText("Repartir automáticamente")).toBeNull();
  });

  it("marca las noches de más y ofrece repartir", async () => {
    const utils = await render(<Recorrido inicial={[destino("Salta", 5), destino("Cafayate", 5)]} />);

    expect(utils.getByText("Hay 1 noche de más. Sacá noches para poder seguir.")).toBeTruthy();
    expect(utils.getByText("Repartir automáticamente")).toBeTruthy();
  });

  it("cambia el orden con las acciones de mover y recalcula las fechas", async () => {
    const onCambio = jest.fn();
    const utils = await render(
      <Recorrido inicial={[destino("Mendoza", 2), destino("Salta", 4)]} onCambio={onCambio} />
    );

    await act(async () => {
      fireEvent(utils.getByTestId("recorrido-mover-0"), "accessibilityAction", {
        nativeEvent: { actionName: "moverDespues" },
      });
    });

    expect(onCambio.mock.calls[0][0].map((d) => d.name)).toEqual(["Salta", "Mendoza"]);
    expect(utils.getByText("3 → 7 nov")).toBeTruthy();
  });

  it("activa el arrastre con la pulsación larga y lo cancela al soltar sin mover", async () => {
    const onArrastreChange = jest.fn();
    const onCambio = jest.fn();
    const utils = await render(
      <Recorrido
        inicial={[destino("Mendoza", 2), destino("Salta", 4)]}
        onArrastreChange={onArrastreChange}
        onCambio={onCambio}
      />
    );
    const foto = utils.getByTestId("recorrido-mover-0");

    await act(async () => {
      fireEvent(foto, "pressOut");
    });
    expect(onArrastreChange).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent(foto, "longPress");
    });
    expect(onArrastreChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      fireEvent(foto, "pressOut");
    });
    expect(onArrastreChange).toHaveBeenLastCalledWith(false);
    expect(onCambio).not.toHaveBeenCalled();
  });

  it("sin armar muestra contadores vacíos, sin barra ni mensajes", async () => {
    const utils = await render(<Recorrido inicial={[destino("Mendoza"), destino("Salta")]} />);

    expect(utils.getAllByText("—")).toHaveLength(2);
    expect(utils.getByText("Traslado a Salta")).toBeTruthy();
    expect(utils.queryByText(/noches están repartidas/)).toBeNull();
    expect(utils.queryByText(/todavía no/)).toBeNull();
    expect(utils.queryByTestId("recorrido-barra-destino")).toBeNull();

    await pulsar(utils, "Sumar una noche a Mendoza");

    expect(utils.getByText("1 noche")).toBeTruthy();
    expect(utils.getByText(/Tenés 8 noches para repartir/)).toBeTruthy();
  });

  it("en un recorrido sin armar el traslado no muestra fechas hasta tocar la píldora", async () => {
    const utils = await render(<Recorrido inicial={[destino("Mendoza"), destino("Salta")]} />);

    expect(utils.getByText("Traslado a Salta")).toBeTruthy();
    expect(utils.getByText("Mismo día")).toBeTruthy();

    await pulsar(utils, "Sumar una noche en viaje hacia Salta");

    expect(utils.getByText("Llegan el 4 nov")).toBeTruthy();
  });

  it("con menos noches que destinos no muestra contadores, barra ni traslados", async () => {
    const utils = await render(
      <Recorrido
        inicial={[destino("Mendoza"), destino("Salta"), destino("Cafayate")]}
        endDate="2026-11-05"
      />
    );

    expect(utils.getByText("Mendoza")).toBeTruthy();
    expect(utils.queryByLabelText("Sumar una noche a Mendoza")).toBeNull();
    expect(utils.queryByText("Traslado a Salta")).toBeNull();
    expect(utils.queryByTestId("recorrido-barra-destino")).toBeNull();
  });
});

describe("useDeshacerDestino", () => {
  const ANTERIOR = [destino("Mendoza", 3), destino("Salta", 3)];
  const RESULTANTE = [destino("Mendoza")];

  function Prueba({ onRestaurar }) {
    const [destinos, setDestinos] = useState(ANTERIOR);
    const { aviso, avisarQuitado, deshacer, descartar } = useDeshacerDestino(destinos, (lista) => {
      setDestinos(lista);
      onRestaurar?.(lista);
    });
    return (
      <>
        <Pressable
          onPress={() => {
            setDestinos(RESULTANTE);
            avisarQuitado("Salta", ANTERIOR, RESULTANTE);
          }}
        >
          <Text>quitar</Text>
        </Pressable>
        <Pressable onPress={() => setDestinos([...RESULTANTE])}>
          <Text>cambiar</Text>
        </Pressable>
        <Pressable onPress={descartar}>
          <Text>descartar</Text>
        </Pressable>
        <Pressable onPress={deshacer}>
          <Text>deshacer</Text>
        </Pressable>
        {aviso ? <Text>{`aviso ${aviso.nombre}`}</Text> : null}
      </>
    );
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it("restaura la lista anterior y cierra el aviso", async () => {
    const onRestaurar = jest.fn();
    const utils = await render(<Prueba onRestaurar={onRestaurar} />);

    await pulsarTexto(utils, "quitar");
    expect(utils.getByText("aviso Salta")).toBeTruthy();

    await pulsarTexto(utils, "deshacer");

    expect(onRestaurar).toHaveBeenCalledWith(ANTERIOR);
    expect(utils.queryByText("aviso Salta")).toBeNull();
  });

  it("desaparece a los 5 segundos", async () => {
    jest.useFakeTimers();
    const utils = await render(<Prueba />);

    await pulsarTexto(utils, "quitar");

    await act(async () => {
      jest.advanceTimersByTime(4900);
    });
    expect(utils.getByText("aviso Salta")).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(utils.queryByText("aviso Salta")).toBeNull();
  });

  it("se cierra si los destinos cambian", async () => {
    const utils = await render(<Prueba />);

    await pulsarTexto(utils, "quitar");
    await pulsarTexto(utils, "cambiar");

    expect(utils.queryByText("aviso Salta")).toBeNull();
  });

  it("se cierra al descartarlo", async () => {
    const utils = await render(<Prueba />);

    await pulsarTexto(utils, "quitar");
    await pulsarTexto(utils, "descartar");

    expect(utils.queryByText("aviso Salta")).toBeNull();
  });
});
