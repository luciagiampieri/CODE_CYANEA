import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Modal from "../ui/AppModal";
import PrimaryButton from "../ui/PrimaryButton";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import { avisoPosiblesDuplicados, formatFechaCarga } from "../../utils/duplicadosGasto";
import { ExpenseDetailContent } from "./ExpenseDetailModal";


export default function PossibleDuplicateExpenseModal({
  visible,
  gastos = [],
  idParticipanteActual = null,
  onBack,
  onConfirm,
  onDiscard,
}) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onBack}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onBack} />
        <View style={styles.sheet} testID="possible-duplicate">
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>Posible gasto duplicado</Text>
            <Pressable hitSlop={10} onPress={onBack} testID="possible-duplicate-close">
              <FontAwesome6 color={colors.overlay} name="xmark" size={18} />
            </Pressable>
          </View>

          <View style={styles.aviso} testID="possible-duplicate-aviso">
            <FontAwesome6 color={colors.warning} name="triangle-exclamation" size={13} />
            <Text style={styles.avisoTexto}>{avisoPosiblesDuplicados(gastos.length)}</Text>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {gastos.map((gasto) => (
              <View key={gasto.IdGasto} style={styles.existente} testID={`possible-duplicate-${gasto.IdGasto}`}>
                <View style={styles.etiquetaRow}>
                  <FontAwesome6 color={colors.textSecondary} name="clock-rotate-left" size={11} />
                  <Text style={styles.etiqueta}>Ya registrado</Text>
                </View>
                <View style={styles.recuadro}>
                  <ExpenseDetailContent
                    gasto={gasto}
                    fechaCarga={formatFechaCarga(gasto.FechaCreacion)}
                    pagoYo={
                      idParticipanteActual != null &&
                      String(gasto.IdPagador) === String(idParticipanteActual)
                    }
                  />
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Dos filas: los dos botones lado a lado (el principal a la derecha,
              como en el resto de los diálogos) y descartar como texto. */}
          <View style={styles.acciones}>
            <View style={styles.filaBotones}>
              <PrimaryButton
                label="Registrar igual"
                onPress={onConfirm}
                style={styles.boton}
                testID="possible-duplicate-confirm"
                variant="secondary"
              />
              <PrimaryButton
                label="Volver y revisar"
                onPress={onBack}
                style={styles.boton}
                testID="possible-duplicate-back"
              />
            </View>
            <Pressable
              hitSlop={10}
              onPress={onDiscard}
              style={styles.descartar}
              testID="possible-duplicate-discard"
            >
              <Text style={styles.descartarTexto}>Descartar gasto nuevo</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Misma hoja que ExpenseDetailModal, para que la advertencia se vea como el detalle.
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayStrong,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: "88%",
    gap: spacing.sm,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  aviso: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    borderRadius: radii.sm,
    padding: spacing.sm,
    backgroundColor: colors.warningSurface,
  },
  avisoTexto: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  existente: {
    gap: spacing.xs,
  },
  etiquetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  etiqueta: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  recuadro: {
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  acciones: {
    gap: spacing.xs,
  },
  filaBotones: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  boton: {
    flex: 1,
  },
  descartar: {
    alignSelf: "center",
    paddingVertical: spacing.xxs,
  },
  descartarTexto: {
    ...textStyles.bodyStrong,
    color: colors.danger,
  },
});
