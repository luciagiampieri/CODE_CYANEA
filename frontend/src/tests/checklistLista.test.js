import { agregarChecklistSinDuplicar } from "../utils/checklistLista";

describe("agregarChecklistSinDuplicar", () => {
  it("agrega la tarea nueva al principio", () => {
    const lista = [{ IdChecklist: 1, Nombre: "Pasaporte" }];
    expect(agregarChecklistSinDuplicar(lista, { IdChecklist: 2, Nombre: "Vuelos" })).toEqual([
      { IdChecklist: 2, Nombre: "Vuelos" },
      { IdChecklist: 1, Nombre: "Pasaporte" },
    ]);
  });

  it("no la duplica si la recarga por WebSocket ya la había traído", () => {
    const lista = [
      { IdChecklist: 2, Nombre: "Vuelos" },
      { IdChecklist: 1, Nombre: "Pasaporte" },
    ];
    const resultado = agregarChecklistSinDuplicar(lista, { IdChecklist: 2, Nombre: "Vuelos" });
    expect(resultado.map((c) => c.IdChecklist)).toEqual([2, 1]);
  });

  it("acepta una lista vacía", () => {
    expect(agregarChecklistSinDuplicar(undefined, { IdChecklist: 3 })).toEqual([{ IdChecklist: 3 }]);
  });
});
