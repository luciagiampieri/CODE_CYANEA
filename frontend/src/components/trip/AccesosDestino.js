import { useMemo, useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import HojaDestinos, { NumeroDestino } from "../explore/HojaDestinos";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import { textoNoches } from "../../utils/recorrido";

/**
 * Acceso a cada destino del recorrido en el timeline del itinerario. Es un único botón
 * desplegable ("Ir a un destino ▾") que abre la hoja "Destinos del viaje" (la misma de
 * Explorar): con muchos destinos, los chips uno al lado del otro no entraban. Elegir uno
 * llama a `onPress(acceso)` y el botón pasa a mostrar ese destino.
 */
export default function AccesosDestino({ accesos, onPress }) {
  const [abierta, setAbierta] = useState(false);
  const [elegido, setElegido] = useState(null);

  const destinos = useMemo(
    () =>
      accesos.map((acceso) => ({
        ...acceso,
        textoNoches: Number.isInteger(acceso.noches) ? textoNoches(acceso.noches) : "",
        conUbicacion: true,
      })),
    [accesos]
  );
  const actual = destinos.find((destino) => destino.indice === elegido) ?? null;

  function elegir(destino) {
    setAbierta(false);
    if (!destino) return;
    setElegido(destino.indice);
    onPress?.(destino);
  }

  const texto = actual ? [actual.nombre, actual.rango].filter(Boolean).join(" · ") : "Ir a un destino";

  return (
    <View style={styles.fila} testID="accesos-destino">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${texto}. Elegir destino del recorrido`}
        accessibilityState={{ expanded: abierta }}
        onPress={() => setAbierta(true)}
        style={({ pressed }) => [styles.boton, pressed && styles.presionado]}
        testID="accesos-destino-boton"
      >
        {actual ? (
          <NumeroDestino chico indice={actual.indice} />
        ) : (
          <FontAwesome6 name="route" size={13} color={colors.primary} />
        )}
        <Text numberOfLines={1} style={styles.texto}>
          {texto}
        </Text>
        {actual ? null : <Text style={styles.cantidad}>{destinos.length} destinos</Text>}
        <FontAwesome6 name="chevron-down" size={10} color={colors.primary} />
      </Pressable>

      <HojaDestinos
        visible={abierta}
        destinos={destinos}
        activo={elegido}
        onElegir={elegir}
        onCerrar={() => setAbierta(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    alignItems: "flex-start",
    paddingVertical: spacing.xxs,
  },
  boton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    maxWidth: "100%",
    minHeight: 36,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  texto: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
    flexShrink: 1,
  },
  cantidad: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  presionado: {
    opacity: 0.7,
  },
});
