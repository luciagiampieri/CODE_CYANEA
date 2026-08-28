import { render } from "@testing-library/react-native";

import Avatar from "../components/ui/Avatar";

describe("Avatar", () => {
  it("muestra las iniciales cuando no hay imageUrl", async () => {
    const { getByText } = await render(<Avatar name="Lucia Giampieri" />);
    expect(getByText("LG")).toBeTruthy();
  });

  it("toma solo las primeras dos palabras del nombre para las iniciales", async () => {
    const { getByText } = await render(<Avatar name="Ana Maria Perez" />);
    expect(getByText("AM")).toBeTruthy();
  });

  it("no explota si no recibe name (fallback vacío)", async () => {
    const { queryByText, toJSON } = await render(<Avatar />);
    expect(queryByText(/./)).toBeNull();
    expect(toJSON()).toBeTruthy();
  });

  it("renderiza una imagen en vez de iniciales cuando hay imageUrl", async () => {
    const { queryByText, toJSON } = await render(
      <Avatar name="Lucia Giampieri" imageUrl="https://example.com/foto.jpg" />
    );
    expect(queryByText("LG")).toBeNull();
    expect(JSON.stringify(toJSON())).toContain("https://example.com/foto.jpg");
  });

  it("usa la primera letra cuando el nombre es una sola palabra", async () => {
    const { getByText } = await render(
      <Avatar name="Test" size={60} outlined ringColor="#fff" />
    );
    expect(getByText("T")).toBeTruthy();
  });
});