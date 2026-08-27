import { render } from "@testing-library/react-native";

import ResultadosVotacion from "../components/trip/ResultadosVotacion";

function buildResultados(overrides = {}) {
  return {
    TotalVotos: 10,
    Empate: false,
    IdPropuestasGanadoras: [1],
    MisPropuestas: [],
    Resultados: [
      { IdPropuesta: 1, Texto: "Parrilla", Votos: 7, Porcentaje: 70 },
      { IdPropuesta: 2, Texto: "Sushi", Votos: 3, Porcentaje: 30 },
    ],
    ...overrides,
  };
}

describe("ResultadosVotacion", () => {
  it("no renderiza nada si no hay resultados", async () => {
    const { toJSON } = await render(<ResultadosVotacion resultados={null} />);

    expect(toJSON()).toBeNull();
  });

  it("muestra el mensaje de sin votos (variante finalizada) cuando TotalVotos es 0", async () => {
    const { getByText } = await render(
      <ResultadosVotacion resultados={buildResultados({ TotalVotos: 0 })} mostrarGanador />
    );

    expect(getByText("Esta votación finalizó sin votos registrados.")).toBeTruthy();
  });

  it("muestra el mensaje de sin votos (variante en curso) cuando mostrarGanador es false", async () => {
    const { getByText } = await render(
      <ResultadosVotacion
        resultados={buildResultados({ TotalVotos: 0 })}
        mostrarGanador={false}
      />
    );

    expect(getByText("Todavía nadie votó en esta votación.")).toBeTruthy();
  });

  it("muestra las propuestas con sus votos y porcentajes", async () => {
    const { getByText } = await render(
      <ResultadosVotacion resultados={buildResultados()} />
    );

    expect(getByText("7 · 70%")).toBeTruthy();
    expect(getByText("3 · 30%")).toBeTruthy();
  });

  it("marca la propuesta ganadora con el trofeo cuando mostrarGanador es true", async () => {
    const { getByText, queryByText } = await render(
      <ResultadosVotacion resultados={buildResultados()} mostrarGanador />
    );

    expect(getByText("🏆 Parrilla")).toBeTruthy();
    expect(queryByText("🏆 Sushi")).toBeNull();
  });

  it("no marca ninguna ganadora cuando mostrarGanador es false, aunque haya IdPropuestasGanadoras", async () => {
    const { getByText, queryByText } = await render(
      <ResultadosVotacion resultados={buildResultados()} mostrarGanador={false} />
    );

    expect(queryByText("🏆 Parrilla")).toBeNull();
    expect(getByText("Parrilla")).toBeTruthy();
  });

  it("muestra el mensaje de empate cuando corresponde", async () => {
    const { getByText } = await render(
      <ResultadosVotacion
        resultados={buildResultados({ Empate: true, IdPropuestasGanadoras: [1, 2] })}
        mostrarGanador
      />
    );

    expect(getByText("⚖️ Hubo un empate entre 2 propuestas.")).toBeTruthy();
  });

  it("marca 'Tu voto' en las propuestas que el usuario votó", async () => {
    const { getByText } = await render(
      <ResultadosVotacion resultados={buildResultados({ MisPropuestas: [2] })} />
    );

    expect(getByText("✓ Tu voto")).toBeTruthy();
  });
});