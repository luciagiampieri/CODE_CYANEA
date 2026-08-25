import { decodePolyline } from "../utils/polyline";

describe("decodePolyline", () => {
  it("devuelve un array vacío si no recibe polilínea", () => {
    expect(decodePolyline(null)).toEqual([]);
    expect(decodePolyline("")).toEqual([]);
  });

  it("decodifica una polilínea codificada de Google conocida", () => {
    const coords = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");

    expect(coords).toHaveLength(3);
    expect(coords[0].lat).toBeCloseTo(38.5, 3);
    expect(coords[0].lng).toBeCloseTo(-120.2, 3);
    expect(coords[1].lat).toBeCloseTo(40.7, 3);
    expect(coords[1].lng).toBeCloseTo(-120.95, 3);
    expect(coords[2].lat).toBeCloseTo(43.252, 3);
    expect(coords[2].lng).toBeCloseTo(-126.453, 3);
  });
});