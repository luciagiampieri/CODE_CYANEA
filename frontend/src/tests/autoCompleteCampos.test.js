import fs from "fs";
import path from "path";

// Campos que no son datos personales: en la web llevan SIN_AUTORRELLENO (autoComplete
// "off") para que Safari no ofrezca "Autorrellenar contacto". Correo y contraseña del
// login no lo llevan. Se revisa el código porque estos campos están en hojas grandes.

const SRC = path.join(__dirname, "..");
const leer = (archivo) => fs.readFileSync(path.join(SRC, archivo), "utf8");

// Cantidad de TextInput con SIN_AUTORRELLENO esperada por archivo.
const CAMPOS = [
  ["screens/DocumentsScreen.js", 1, "nombre del documento"],
  ["screens/AddGastoScreen.js", 1, "concepto del gasto"],
  ["screens/AddActivityScreen.js", 2, "nombre y descripción de la actividad"],
  ["screens/AddTrasladoScreen.js", 1, "notas del traslado"],
  ["screens/CreateVotationScreen.js", 2, "nombre y propuestas de la votación"],
  ["screens/CreateTripScreen.js", 1, "título y descripción del viaje (componente Field)"],
  ["screens/CreateChecklistScreen.js", 1, "título de la tarea"],
];

describe("autorrelleno en los campos de la app", () => {
  it.each(CAMPOS)("%s apaga el autorrelleno en %i campo(s): %s", (archivo, cantidad) => {
    const codigo = leer(archivo);
    const usos = codigo.match(/<TextInput\s+\{\.\.\.SIN_AUTORRELLENO\}/g) || [];
    expect(usos).toHaveLength(cantidad);
  });

  it("el login no apaga el autorrelleno de correo ni contraseña", () => {
    const codigo = leer("screens/LoginScreen.js");
    expect(codigo).not.toMatch(/SIN_AUTORRELLENO/);
    expect(codigo).not.toMatch(/autoComplete=["']off["']/);
  });
});
