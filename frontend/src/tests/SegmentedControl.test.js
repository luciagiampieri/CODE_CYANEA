import { fireEvent, render } from "@testing-library/react-native";

import SegmentedControl from "../components/ui/SegmentedControl";

const options = [
  { id: "a", label: "Participantes" },
  { id: "b", label: "Invitaciones", badge: 2 },
];

describe("SegmentedControl", () => {
  it("muestra las opciones y el contador cuando es mayor a cero", async () => {
    const { getByText } = await render(
      <SegmentedControl onChange={jest.fn()} options={options} value="a" />
    );

    expect(getByText("Participantes")).toBeTruthy();
    expect(getByText("Invitaciones")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();
  });

  it("oculta el contador cuando es cero", async () => {
    const { queryByText } = await render(
      <SegmentedControl
        onChange={jest.fn()}
        options={[{ id: "a", label: "Invitaciones", badge: 0 }]}
        value="a"
      />
    );

    expect(queryByText("0")).toBeNull();
  });

  it("llama a onChange con el id de la opción elegida", async () => {
    const onChange = jest.fn();
    const { getByTestId } = await render(
      <SegmentedControl onChange={onChange} options={options} testID="seg" value="a" />
    );

    await fireEvent.press(getByTestId("seg-b"));

    expect(onChange).toHaveBeenCalledWith("b");
  });
});
