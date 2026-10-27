import { StyleSheet } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

import AICoverGenerator from "../components/trip/AICoverGenerator";

describe("AICoverGenerator", () => {
  it("avisa cuándo se empieza y se termina de escribir la indicación", async () => {
    const onInputFocus = jest.fn();
    const onInputBlur = jest.fn();
    const utils = await render(
      <AICoverGenerator generate={jest.fn()} onAccept={jest.fn()} onInputFocus={onInputFocus} onInputBlur={onInputBlur} />
    );

    await act(async () => fireEvent.press(utils.getByText("Generar portada con IA")));
    const campo = utils.getByTestId("ai-cover-prompt");
    await act(async () => fireEvent(campo, "focus"));
    await act(async () => fireEvent.changeText(campo, "atardecer en la playa"));
    await act(async () => fireEvent(campo, "blur"));

    expect(onInputFocus).toHaveBeenCalledTimes(1);
    expect(onInputBlur).toHaveBeenCalledTimes(1);
    expect(campo.props.value).toBe("atardecer en la playa");
  });

  it("usa letra de 16 px para que Safari del iPhone no haga zoom al tocar el campo", async () => {
    const utils = await render(<AICoverGenerator generate={jest.fn()} onAccept={jest.fn()} />);

    await act(async () => fireEvent.press(utils.getByText("Generar portada con IA")));

    expect(StyleSheet.flatten(utils.getByTestId("ai-cover-prompt").props.style).fontSize).toBe(16);
  });
});
