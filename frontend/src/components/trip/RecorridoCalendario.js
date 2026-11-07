import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import { isTodayISO } from "../../utils/agenda";
import { coloresDelDia } from "../../utils/destinosDias";

const DIAS_SEMANA = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const ANCHO_DIA = 48;
const SEPARACION_DIA = 6;
const OPACIDAD_TRAMO_INACTIVO = 0.3;

function partesDeFecha(fechaRaw) {
  const fecha = new Date(`${String(fechaRaw ?? "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) return { semana: "", numero: "" };
  return { semana: DIAS_SEMANA[fecha.getDay()], numero: String(fecha.getDate()) };
}

function Tramos({ accesos, activos, resaltar, onPress }) {
  return (
    <View style={styles.tramos} testID="recorrido-tramos">
      {accesos.map((acceso) => {
        const activo = activos.includes(acceso.indice);
        return (
          <Pressable
            key={acceso.indice}
            accessibilityRole="button"
            accessibilityLabel={`${acceso.nombre}, ${acceso.rango}`}
            accessibilityState={{ selected: activo }}
            onPress={() => onPress?.(acceso)}
            style={[
              styles.tramo,
              { flex: acceso.noches, opacity: !resaltar || activo ? 1 : OPACIDAD_TRAMO_INACTIVO },
            ]}
            testID={`tramo-destino-${acceso.indice}`}
          >
            <View style={styles.tramoNombre}>
              <View style={[styles.tramoPunto, { backgroundColor: acceso.color }]} />
              <Text numberOfLines={1} style={[styles.tramoTexto, { color: acceso.color }]}>
                {acceso.nombre}
              </Text>
            </View>
            <View style={[styles.tramoLinea, { backgroundColor: acceso.color }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

function PuntosDia({ dia, activo }) {
  if (dia.infoDestino) {
    return (
      <View style={styles.puntos} testID={`dia-puntos-${dia.dayId}`}>
        {coloresDelDia(dia.infoDestino).map((color) => (
          <View
            key={color}
            style={[styles.punto, { backgroundColor: activo ? colors.textInverse : color }]}
          />
        ))}
      </View>
    );
  }

  // Sin destinos, el punto indica si el día tiene actividades.
  const cantidad = (dia.actividades ?? []).length;
  const hoy = isTodayISO(dia.fechaRaw);
  return (
    <View style={styles.puntos}>
      <View
        style={[
          styles.punto,
          styles.puntoVacio,
          cantidad > 0 && styles.puntoLleno,
          activo && cantidad > 0 && styles.puntoActivo,
          hoy && !activo && styles.puntoHoy,
        ]}
      />
    </View>
  );
}

// Tarjeta del recorrido completo del calendario: un tramo por destino y la tira de días.
export default function RecorridoCalendario({
  dias,
  diaActual,
  diaObjetivoId = null,
  accesos,
  conTira = true,
  onElegirDia,
  onElegirDestino,
}) {
  const tiraRef = useRef(null);
  const [anchoTira, setAnchoTira] = useState(0);
  const indiceActual = diaActual ? dias.findIndex((d) => d.dayId === diaActual.dayId) : -1;

  useEffect(() => {
    if (!conTira || indiceActual < 0 || !anchoTira) return;
    const x = indiceActual * (ANCHO_DIA + SEPARACION_DIA) - (anchoTira - ANCHO_DIA) / 2;
    tiraRef.current?.scrollTo?.({ x: Math.max(0, x), animated: true });
  }, [conTira, indiceActual, anchoTira]);

  return (
    <View style={styles.tarjeta} testID="recorrido-calendario">
      {accesos ? (
        <Tramos
          accesos={accesos}
          activos={diaActual?.infoDestino?.indices ?? []}
          resaltar={conTira}
          onPress={onElegirDestino}
        />
      ) : null}
      {conTira ? (
        <ScrollView
          ref={tiraRef}
          contentContainerStyle={styles.tira}
          horizontal
          onLayout={(e) => setAnchoTira(e.nativeEvent.layout.width)}
          showsHorizontalScrollIndicator={false}
        >
          {dias.map((dia) => {
            const activo = dia.dayId === diaActual?.dayId;
            const { semana, numero } = partesDeFecha(dia.fechaRaw);
            const cantidad = (dia.actividades ?? []).length;
            return (
              <Pressable
                key={dia.dayId}
                accessibilityLabel={`Día ${dia.dayIndex}, ${cantidad} ${cantidad === 1 ? "actividad" : "actividades"}`}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                onPress={() => onElegirDia?.(dia)}
                style={[
                  styles.dia,
                  activo && styles.diaActivo,
                  dia.dayId === diaObjetivoId && styles.diaObjetivo,
                ]}
              >
                <Text style={[styles.semana, activo && styles.textoActivo]}>{semana}</Text>
                <Text style={[styles.numero, activo && styles.textoActivo]}>{numero}</Text>
                <PuntosDia dia={dia} activo={activo} />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  tramos: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  tramo: {
    minWidth: 0,
    gap: 4,
  },
  tramoNombre: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  tramoPunto: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  tramoTexto: {
    ...textStyles.meta,
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 1,
  },
  tramoLinea: {
    height: 4,
    borderRadius: 2,
  },
  tira: {
    gap: SEPARACION_DIA,
  },
  dia: {
    width: ANCHO_DIA,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: colors.surfaceMuted,
    gap: 1,
  },
  diaActivo: {
    backgroundColor: colors.primary,
  },
  diaObjetivo: {
    borderColor: colors.accentStrong,
  },
  semana: {
    ...textStyles.meta,
    fontSize: 9,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  numero: {
    ...textStyles.bodyStrong,
    fontSize: 16,
    color: colors.primary,
  },
  textoActivo: {
    color: colors.textInverse,
  },
  puntos: {
    flexDirection: "row",
    gap: 3,
    marginTop: 2,
    height: 6,
  },
  punto: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  puntoVacio: {
    backgroundColor: "transparent",
  },
  puntoLleno: {
    backgroundColor: colors.primary,
  },
  puntoActivo: {
    backgroundColor: colors.textInverse,
  },
  puntoHoy: {
    backgroundColor: colors.warning,
  },
});
