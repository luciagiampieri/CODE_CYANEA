import { formatMoney, formatMoneyCompacto } from "../utils/money";

describe("formatMoneyCompacto", () => {
  it("abrevia los montos grandes y queda más corto que el completo", () => {
    const compacto = formatMoneyCompacto(12345678, "ARS");

    expect(compacto).toMatch(/12,3/);
    expect(compacto).toMatch(/M/);
    expect(compacto.length).toBeLessThan(formatMoney(12345678, "ARS").length);
  });

  it("respeta la moneda del viaje", () => {
    expect(formatMoneyCompacto(2500000, "USD")).toMatch(/US\$|USD/);
  });

  it("un valor inválido se muestra como cero", () => {
    expect(formatMoneyCompacto("abc", "ARS")).toBe(formatMoney(0, "ARS"));
  });
});
