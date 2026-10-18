import { FontAwesome6 } from "@expo/vector-icons";
import { NavigationContext, NavigationRouteContext } from "@react-navigation/native";
import { useContext } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";

function contarPorEstado(sugerencias) {
  return sugerencias.reduce(
    (totales, sugerencia) => {
      const estado = String(sugerencia.Estado ?? "").toLowerCase();
      if (estado === "pendiente") totales.pendientes += 1;
      else if (estado === "en_votacion") totales.enVotacion += 1;
      return totales;
    },
    { pendientes: 0, enVotacion: 0 }
  );
}

function textoResumen({ pendientes, enVotacion }) {
  const partes = [];
  if (pendientes > 0) partes.push(`${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}`);
  if (enVotacion > 0) partes.push(`${enVotacion} en votación`);
  return partes.join(" · ");
}

export default function DaySuggestionsSection({ tripId, dia, sugerencias = [], canPropose = false }) {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);

  if (!sugerencias.length) return null;

  const totales = contarPorEstado(sugerencias);
  const resumen = textoResumen(totales);
  const trip = route?.params?.trip ?? null;

  function abrir() {
    if (!navigation) return;
    navigation.navigate("SugerenciasDia", {
      tripId,
      trip,
      tripTitle: trip?.title ?? trip?.Titulo ?? "",
      canPropose,
      dia: {
        dayId: dia.dayId,
        dayIndex: dia.dayIndex,
        fechaRaw: dia.fechaRaw,
        dayDateText: dia.dayDateText,
        actividades: dia.actividades ?? [],
      },
    });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sugerencias del asistente: ${resumen}`}
      onPress={abrir}
      style={({ pressed }) => [styles.fila, pressed && styles.presionada]}
      testID={`sugerencias-dia-${dia.dayId}`}
    >
      <View style={styles.icono}>
        <FontAwesome6 name="wand-magic-sparkles" size={14} color={colors.primary} />
      </View>
      <View style={styles.textos}>
        <Text style={styles.titulo}>Sugerencias del asistente</Text>
        {resumen ? <Text style={styles.resumen}>{resumen}</Text> : null}
      </View>
      <FontAwesome6 name="chevron-right" size={13} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.accentStrong,
    backgroundColor: colors.accentMuted,
  },
  presionada: {
    opacity: 0.8,
  },
  icono: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  textos: {
    flex: 1,
    gap: 1,
  },
  titulo: {
    ...textStyles.bodyStrong,
    fontSize: 14,
    color: colors.primary,
  },
  resumen: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
  },
});