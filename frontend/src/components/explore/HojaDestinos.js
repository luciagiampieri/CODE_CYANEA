import { FontAwesome6 } from "@expo/vector-icons";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import Modal from "../ui/AppModal";
import { sheetFormStyles } from "../ui/sheetFormStyles";
import { colorDeDestino, colors, radii, spacing, textStyles } from "../../theme/tokens";

/**
 * Hoja "Destinos del viaje" de Explorar: todos los destinos en el orden del recorrido con
 * sus fechas y noches (`resumenDestinos`), el activo con ✓ y "Hoy" en el destino de hoy si
 * el viaje está en curso. Mismo panel inferior que `OptionSheet`, dentro de un modal porque
 * Explorar no es un formulario tipo hoja. Un destino sin ubicación no se puede elegir.
 * Con `conTodos` (filtro de Guardados) suma arriba "Todos los destinos", que llama a
 * `onElegir(null)` y queda marcado cuando `activo` es null.
 */
export default function HojaDestinos({
  visible,
  destinos,
  activo,
  indicesHoy = [],
  conTodos = false,
  onElegir,
  onCerrar,
}) {
  const todosActivo = conTodos && activo === null;
  const filaTodos = conTodos ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: todosActivo }}
      onPress={() => onElegir(null)}
      style={({ pressed }) => [
        sheetFormStyles.modalItemC,
        todosActivo && sheetFormStyles.modalItemActiveC,
        pressed && styles.presionado,
      ]}
      testID="hoja-destino-todos"
    >
      <View style={styles.fila}>
        <View style={[styles.numero, styles.numeroTodos]}>
          <FontAwesome6 name="layer-group" size={12} color={colors.primary} />
        </View>
        <Text style={[sheetFormStyles.modalItemTextC, todosActivo && sheetFormStyles.modalItemTextActiveC]}>
          Todos los destinos
        </Text>
      </View>
      {todosActivo ? <FontAwesome6 name="check" size={14} color={colors.primary} /> : null}
    </Pressable>
  ) : null;

  return (
    <Modal animationType="fade" transparent statusBarTranslucent visible={visible} onRequestClose={onCerrar}>
      <View style={sheetFormStyles.modalOverlayC} testID="hoja-destinos">
        <Pressable accessibilityLabel="Cerrar" style={StyleSheet.absoluteFill} onPress={onCerrar} />
        <View style={sheetFormStyles.bottomSheetC}>
          <View style={sheetFormStyles.modalHeaderC}>
            <Text style={sheetFormStyles.modalTitleC}>Destinos del viaje</Text>
            <Pressable accessibilityLabel="Cerrar destinos" accessibilityRole="button" hitSlop={10} onPress={onCerrar}>
              <FontAwesome6 name="xmark" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <FlatList
            data={destinos}
            keyExtractor={(destino) => String(destino.indice)}
            ListHeaderComponent={filaTodos}
            renderItem={({ item: destino, index }) => {
              const esActivo = destino.indice === activo;
              const esHoy = indicesHoy.includes(destino.indice);
              const detalle = destino.conUbicacion
                ? [destino.rango, destino.textoNoches].filter(Boolean).join(" · ")
                : "Sin ubicación en el mapa";
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: esActivo, disabled: !destino.conUbicacion }}
                  disabled={!destino.conUbicacion}
                  onPress={() => onElegir(destino)}
                  style={({ pressed }) => [
                    sheetFormStyles.modalItemC,
                    esActivo && sheetFormStyles.modalItemActiveC,
                    index === destinos.length - 1 && styles.sinBorde,
                    !destino.conUbicacion && styles.deshabilitado,
                    pressed && styles.presionado,
                  ]}
                  testID={`hoja-destino-${destino.indice}`}
                >
                  <View style={styles.fila}>
                    <NumeroDestino indice={destino.indice} />
                    <View style={styles.textos}>
                      <View style={styles.lineaNombre}>
                        <Text
                          style={[sheetFormStyles.modalItemTextC, esActivo && sheetFormStyles.modalItemTextActiveC]}
                        >
                          {destino.nombre}
                        </Text>
                        {esHoy ? (
                          <View style={styles.hoy} testID={`hoja-destino-hoy-${destino.indice}`}>
                            <Text style={styles.hoyTexto}>Hoy</Text>
                          </View>
                        ) : null}
                      </View>
                      {detalle ? <Text style={styles.detalle}>{detalle}</Text> : null}
                    </View>
                  </View>
                  {esActivo ? <FontAwesome6 name="check" size={14} color={colors.primary} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

/** Círculo con el número del destino en el recorrido, en su color (como en RecorridoViaje). */
export function NumeroDestino({ indice, chico = false }) {
  return (
    <View style={[styles.numero, chico && styles.numeroChico, { backgroundColor: colorDeDestino(indice) }]}>
      <Text style={[styles.numeroTexto, chico && styles.numeroTextoChico]}>{indice + 1}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
  },
  textos: {
    flex: 1,
  },
  lineaNombre: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  detalle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  hoy: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill ?? 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  hoyTexto: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
  numero: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  numeroTodos: {
    backgroundColor: colors.surfaceMuted,
  },
  numeroChico: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  numeroTexto: {
    ...textStyles.meta,
    color: colors.textInverse,
    fontWeight: "700",
  },
  numeroTextoChico: {
    fontSize: 11,
  },
  sinBorde: {
    borderBottomWidth: 0,
  },
  deshabilitado: {
    opacity: 0.5,
  },
  presionado: {
    opacity: 0.7,
  },
});
