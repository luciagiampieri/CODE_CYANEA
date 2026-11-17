import { forwardRef } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import ResaltarCoincidencia from "../ui/ResaltarCoincidencia";
import {
  buscarGuardados,
  enItinerario,
  mostrarVerTodos,
  textoDetalleGuardado,
  ultimosSinAgendar,
} from "../../utils/sugerenciasGuardados";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

/**
 * Sugerencias de los lugares guardados del viaje debajo del campo "Nombre" de Nueva
 * actividad, en lista vertical:
 * - campo vacío: los 3 últimos guardados sin agendar y, si hay más de 3 en total,
 *   "Ver todos tus guardados (N)" (abre la hoja con todos);
 * - mientras se escribe: hasta 3 que coinciden (los que ya están en el itinerario, al
 *   final y apagados).
 * Si no hay nada que sugerir no dibuja nada: elegir uno nunca es obligatorio.
 * `contexto` ({ destinos, indicesDia }) pone primero los guardados del destino del día.
 */
const SugerenciasGuardados = forwardRef(function SugerenciasGuardados(
  { lugares, texto, contexto = null, onElegir, onVerTodos, onLayout },
  ref
) {
  const conTexto = String(texto || "").trim().length > 0;

  let filas;
  let verTodos = false;
  if (conTexto) {
    filas = buscarGuardados(lugares, texto, contexto).map(({ lugar }) => lugar);
  } else {
    filas = ultimosSinAgendar(lugares, contexto);
    verTodos = mostrarVerTodos(lugares) && Boolean(onVerTodos);
  }
  if (!filas.length && !verTodos) return null;

  return (
    <View ref={ref} collapsable={false} onLayout={onLayout} style={styles.lista} testID="sugerencias-guardados">
      {filas.map((lugar) => (
        <FilaGuardado
          key={lugar.id}
          lugar={lugar}
          busqueda={conTexto ? texto : ""}
          contexto={contexto}
          onElegir={onElegir}
          testID={`guardado-opcion-${lugar.id}`}
        />
      ))}
      {verTodos ? (
        <Pressable
          accessibilityRole="button"
          onPress={onVerTodos}
          style={({ pressed }) => [styles.verTodos, filas.length > 0 && styles.separador, pressed && styles.presionado]}
          testID="guardados-ver-todos"
        >
          <FontAwesome6 name="bookmark" size={12} color={colors.primary} style={styles.icono} />
          <Text style={styles.verTodosTexto}>{`Ver todos tus guardados (${(lugares || []).length})`}</Text>
          <FontAwesome6 name="chevron-right" size={11} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
});

export default SugerenciasGuardados;

/**
 * Fila de un guardado: nombre completo en hasta 2 líneas (con la parte que coincide con
 * `busqueda` en negrita) y la línea de detalle. Los que ya están en el itinerario se ven
 * apagados. La usan las sugerencias de "Nombre", la hoja "Tus guardados" y el selector
 * de "Ubicación". Con `contexto`, un guardado de otro destino muestra su nombre.
 */
export function FilaGuardado({ lugar, busqueda = "", contexto = null, onElegir, testID }) {
  const detalle = textoDetalleGuardado(lugar, contexto);
  const apagada = enItinerario(lugar);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Usar ${lugar.name}, ${detalle}`}
      onPress={() => onElegir(lugar)}
      style={({ pressed }) => [styles.opcion, apagada && styles.apagada, pressed && styles.presionado]}
      testID={testID}
    >
      <FontAwesome6
        name="location-dot"
        size={13}
        color={apagada ? colors.textMuted : colors.primary}
        style={styles.icono}
      />
      <View style={styles.textos}>
        <ResaltarCoincidencia
          text={lugar.name}
          query={busqueda}
          style={styles.nombre}
          matchStyle={styles.coincide}
          numberOfLines={2}
        />
        <Text style={styles.detalle} numberOfLines={1}>
          {detalle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lista: {
    marginTop: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  opcion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    minHeight: 48,
  },
  apagada: {
    opacity: 0.55,
  },
  presionado: {
    backgroundColor: colors.surfaceAlt,
  },
  icono: {
    width: 16,
    textAlign: "center",
  },
  textos: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nombre: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  coincide: {
    fontWeight: "700",
  },
  detalle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 12,
  },
  verTodos: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  separador: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  verTodosTexto: {
    ...textStyles.meta,
    flex: 1,
    color: colors.primary,
    fontWeight: "700",
  },
});
