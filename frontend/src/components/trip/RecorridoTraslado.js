import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import HoraField from "../ui/HoraField";
import { colorDeDestino, colors, radii, spacing, textStyles } from "../../theme/tokens";
import { ACLARACION_FECHAS, paradasDelTramo } from "../../utils/traslados";
import { textoNoches } from "../../utils/recorrido";

const PUNTOS_LINEA = Array.from({ length: 10 }, (_, punto) => punto);
const COLOR_FONDO_PIE = `${colors.primarySoft}14`;

function colorDe(nombre, destinos) {
  const indice = destinos.findIndex((destino) => destino.name === nombre);
  return indice >= 0 ? colorDeDestino(indice) : colors.primary;
}

function Linea() {
  return (
    <View style={styles.linea}>
      {PUNTOS_LINEA.map((punto) => (
        <View key={punto} style={styles.lineaPunto} />
      ))}
    </View>
  );
}

function Parada({ parada, color, hueco, conLinea, hora, etiquetaHora }) {
  return (
    <View style={styles.parada}>
      <View style={styles.riel}>
        <View
          style={[
            styles.punto,
            hueco ? { borderColor: color, borderWidth: 2 } : { backgroundColor: color },
          ]}
        />
        {conLinea ? <Linea /> : null}
      </View>
      <View
        accessible
        accessibilityLabel={[parada.nombre, parada.fecha].filter(Boolean).join(", ")}
        style={styles.textos}
      >
        <Text style={styles.nombre}>{parada.nombre}</Text>
        {parada.fecha ? <Text style={styles.fecha}>{parada.fecha}</Text> : null}
      </View>
      {hora ? <HoraField compacto label={etiquetaHora} placeholder="Hora" {...hora} /> : null}
    </View>
  );
}

function PieRecorrido({ esAdmin, puedeCambiarRecorrido, nombreAdministrador, onCambiarRecorrido }) {
  if (esAdmin && puedeCambiarRecorrido) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="¿Cambian los días? Editar recorrido"
        onPress={onCambiarRecorrido}
        style={({ pressed }) => [styles.pie, styles.pieTocable, pressed && styles.presionado]}
        testID="traslado-cambiar-recorrido"
      >
        <FontAwesome6 name="calendar" size={14} color={colors.primary} />
        <Text style={styles.pieTexto}>
          ¿Cambian los días? <Text style={styles.pieAccion}>Editar recorrido</Text>
        </Text>
        <FontAwesome6 name="chevron-right" size={12} color={colors.primary} />
      </Pressable>
    );
  }

  const aclaracion =
    !esAdmin && nombreAdministrador
      ? `${ACLARACION_FECHAS} Solo ${nombreAdministrador} (administrador/a) puede cambiarlos.`
      : ACLARACION_FECHAS;

  return (
    <View style={styles.pie}>
      <FontAwesome6 name="circle-info" size={14} color={colors.textSecondary} />
      <Text style={styles.pieTexto} testID="traslado-solo-admin">
        {aclaracion}
      </Text>
    </View>
  );
}

// Origen, destino y horas del traslado. Las fechas salen del recorrido y son solo lectura.
// `horas`: { salida, llegada }, cada una con las props de `HoraField`, o null si no se piden.
export default function RecorridoTraslado({ tramo, destinos = [], horas = null, ...pie }) {
  const { origen, llegada, nochesEnViaje } = paradasDelTramo(tramo);
  const ambas = Boolean(origen && llegada);

  return (
    <View style={styles.caja} testID="traslado-recorrido">
      <View style={styles.contenido}>
        {origen ? (
          <Parada
            parada={origen}
            color={colorDe(origen.nombre, destinos)}
            hueco
            conLinea={ambas}
            hora={horas?.salida}
            etiquetaHora="Hora de salida"
          />
        ) : null}

        {ambas && nochesEnViaje > 0 ? (
          <View style={styles.parada}>
            <View style={styles.riel}>
              <Linea />
            </View>
            <View style={styles.pildora} testID="traslado-noches-en-viaje">
              <FontAwesome6 name="moon" size={10} color={colors.textSecondary} />
              <Text style={styles.pildoraTexto}>{`${textoNoches(nochesEnViaje)} en viaje`}</Text>
            </View>
          </View>
        ) : null}

        {llegada ? (
          <Parada
            parada={llegada}
            color={colorDe(llegada.nombre, destinos)}
            hora={horas?.llegada}
            etiquetaHora="Hora de llegada"
          />
        ) : null}
      </View>

      <PieRecorrido {...pie} />
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  contenido: {
    padding: spacing.md,
  },
  parada: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  riel: {
    width: 14,
    alignItems: "center",
    paddingTop: 5,
  },
  punto: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  linea: {
    flex: 1,
    minHeight: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingVertical: 2,
  },
  lineaPunto: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.borderStrong,
  },
  textos: {
    flex: 1,
    minWidth: 0,
    paddingBottom: spacing.xs,
  },
  nombre: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  fecha: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pildora: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    marginVertical: spacing.xxs,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: COLOR_FONDO_PIE,
  },
  pildoraTexto: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  pie: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 48,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pieTocable: {
    backgroundColor: COLOR_FONDO_PIE,
  },
  pieTexto: {
    ...textStyles.meta,
    color: colors.textSecondary,
    flex: 1,
  },
  pieAccion: {
    color: colors.primary,
    fontWeight: "700",
  },
  presionado: {
    opacity: 0.7,
  },
});
