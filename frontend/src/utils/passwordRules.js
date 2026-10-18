// Reglas de contraseña compartidas por el restablecimiento (US 59) y el cambio
// desde "Mi cuenta" (US 101). El backend aplica las mismas en
// `password_reset_service.validar_reglas_password`.
export const REGLAS_PASSWORD = [
  { key: "len", label: "Al menos 8 caracteres", test: (p) => p.length >= 8 },
  { key: "upper", label: "Una letra mayúscula", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "Una letra minúscula", test: (p) => /[a-z]/.test(p) },
  { key: "number", label: "Un número", test: (p) => /\d/.test(p) },
  { key: "special", label: "Un carácter especial", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function cumpleReglasPassword(password) {
  return REGLAS_PASSWORD.every((regla) => regla.test(password ?? ""));
}

/** Validación del formulario de cambio de contraseña. Devuelve el mensaje de error o null. */
export function validarCambioPassword({ passwordActual, passwordNueva, confirmacion }) {
  if (!passwordActual || !passwordNueva || !confirmacion) {
    return "Completá la contraseña actual, la nueva contraseña y su confirmación.";
  }
  if (!cumpleReglasPassword(passwordNueva)) {
    return "La nueva contraseña no cumple con todas las reglas indicadas.";
  }
  if (passwordNueva === passwordActual) {
    return "La nueva contraseña debe ser distinta de la contraseña actual.";
  }
  if (passwordNueva !== confirmacion) {
    return "La nueva contraseña y su confirmación no coinciden.";
  }
  return null;
}

/** Solo las cuentas registradas con correo tienen contraseña propia de Cyanea. */
export function puedeCambiarPassword(usuario) {
  return usuario?.proveedorAutenticacion === "local";
}
