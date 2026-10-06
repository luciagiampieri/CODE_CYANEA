import { Platform } from "react-native";

/**
 * Solo web: <input type="date" | "time"> invisible que cubre a su contenedor.
 *
 * Se pone adentro de la misma "tarjeta" que se usa en la app nativa (ícono +
 * texto), así en web se ve exactamente igual y al tocarla se abre el selector
 * nativo del navegador (calendario o reloj). El contenedor tiene que ocupar el
 * área tocable; las Views de React Native ya son position: relative.
 *
 * En iOS/Android no renderiza nada.
 *
 * @param {"date"|"time"} type
 * @param {string} value - "YYYY-MM-DD" para fechas, "HH:MM" para horas, o ""
 * @param {(value: string) => void} onChange - recibe el mismo formato
 * @param {string} [min] / [max] - en el mismo formato que value
 */
export default function WebPickerOverlay({
  type = "date",
  value,
  onChange,
  min,
  max,
  disabled = false,
  label,
}) {
  if (Platform.OS !== "web") return null;

  return (
    <input
      type={type}
      aria-label={label}
      disabled={disabled}
      min={min || undefined}
      max={max || undefined}
      step={type === "time" ? 60 : undefined}
      value={value || ""}
      onChange={(e) => onChange?.(e.target.value)}
      onClick={(e) => {
        // En escritorio el selector solo se abre tocando el iconito; showPicker lo abre siempre.
        try {
          e.currentTarget.showPicker?.();
        } catch {
          // Algunos navegadores no lo permiten: queda el comportamiento por defecto.
        }
      }}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        opacity: 0,
        margin: 0,
        padding: 0,
        border: "none",
        boxSizing: "border-box",
        fontSize: 16, // evita el zoom automático de iPhone al tocar el campo
        cursor: disabled ? "not-allowed" : "pointer",
        zIndex: 1,
      }}
    />
  );
}