import { FontAwesome6 } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Modal from "../ui/AppModal";
import PrimaryButton from "../ui/PrimaryButton";
import { formatMoney } from "../../utils/money";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import { formatExpenseDate, iconForCategory } from "./ExpenseList";

function nombreCompleto(persona) {
  return `${persona?.Nombre ?? ""} ${persona?.Apellido ?? ""}`.trim() || persona?.NombreUsuario || "";
}

function textoDivision(gasto) {
  if (!gasto?.EsCompartido) return "Gasto personal";
  if (gasto.TipoDivision === "personalizada") return "Compartido · división personalizada";
  return "Compartido · división igualitaria";
}

function formatearTasa(valor) {
  return Number(valor).toLocaleString("es-AR", { maximumFractionDigits: 4 });
}

export function textoCotizacion(gasto) {
  const tasa = Number(gasto?.TipoCambio);
  const origen = String(gasto?.MonedaOriginal ?? "").toUpperCase();
  const destino = String(gasto?.MonedaViaje ?? "").toUpperCase();
  if (!Number.isFinite(tasa) || tasa <= 0 || !origen || !destino || origen === destino) return null;
  return tasa >= 1
    ? `1 ${origen} = ${formatearTasa(tasa)} ${destino}`
    : `1 ${destino} = ${formatearTasa(1 / tasa)} ${origen}`;
}

export function textoFuenteCotizacion(gasto) {
  const fecha = gasto?.FechaCotizacion ? formatExpenseDate(gasto.FechaCotizacion) : "";
  if (gasto?.FuenteCotizacion === "manual") {
    return `Monto en pesos ingresado por quien cargó el gasto${fecha ? ` (${fecha})` : ""}`;
  }
  if (gasto?.FuenteCotizacion === "referencia") {
    return `Tipo de cambio de referencia (Frankfurter)${fecha ? ` para el ${fecha}` : ""}`;
  }
  return "Tipo de cambio de referencia del día del gasto";
}

function Fila({ icono, etiqueta, valor, testID }) {
  return (
    <View style={styles.fila} testID={testID}>
      <FontAwesome6 color={colors.textSecondary} name={icono} size={13} style={styles.filaIcono} />
      <Text style={styles.filaEtiqueta}>{etiqueta}</Text>
      <Text numberOfLines={2} style={styles.filaValor}>
        {valor}
      </Text>
    </View>
  );
}

export function ExpenseDetailContent({ gasto, pagoYo = false, fechaCarga = "" }) {
  const moneda = gasto?.MonedaViaje;
  const monedaOriginal = String(gasto?.MonedaOriginal ?? "").toUpperCase();
  const mostrarOriginal = Boolean(gasto) && monedaOriginal && monedaOriginal !== moneda;
  const cotizacion = mostrarOriginal ? textoCotizacion(gasto) : null;
  const esManual = gasto?.FuenteCotizacion === "manual";

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <FontAwesome6 color={colors.primary} name={iconForCategory(gasto.NombreCategoria, gasto.IconoCategoria)} size={18} />
        </View>
        <View style={styles.heroBody}>
          <Text numberOfLines={2} style={styles.nombre} testID="expense-detail-nombre">
            {gasto.Nombre}
          </Text>
          <Text style={styles.monto}>{formatMoney(gasto.Monto, moneda)}</Text>
          {mostrarOriginal ? (
            <Text style={styles.original} testID="expense-detail-original">
              Registrado: {formatMoney(gasto.MontoOriginal, monedaOriginal)}
            </Text>
          ) : null}
        </View>
      </View>

      {cotizacion ? (
        <View style={styles.cotizacion} testID="expense-detail-cotizacion">
          <View style={styles.cotizacionFila}>
            <FontAwesome6 color={colors.primary} name="money-bill-transfer" size={13} />
            <Text style={styles.cotizacionValor}>{cotizacion}</Text>
          </View>
          <Text style={styles.cotizacionFuente} testID="expense-detail-cotizacion-fuente">
            {textoFuenteCotizacion(gasto)}
          </Text>
          {!esManual ? (
            <Text style={styles.cotizacionNota}>
              Es un valor de referencia: puede no coincidir con lo que cobró la tarjeta o una casa de cambio.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.bloque}>
        <Fila etiqueta="Fecha" icono="calendar" valor={formatExpenseDate(gasto.FechaGasto)} />
        <Fila etiqueta="Categoría" icono="tag" valor={gasto.NombreCategoria} />
        <Fila
          etiqueta="Pagó"
          icono="wallet"
          testID="expense-detail-pagador"
          valor={pagoYo ? `${gasto.NombrePagador} (vos)` : gasto.NombrePagador}
        />
        {gasto.NombreCreador || fechaCarga ? (
          <Fila
            etiqueta="Registró"
            icono="user-pen"
            testID="expense-detail-registro"
            valor={[gasto.NombreCreador, fechaCarga].filter(Boolean).join(" · ")}
          />
        ) : null}
        <Fila etiqueta="División" icono="users" valor={textoDivision(gasto)} />
      </View>

      {gasto.EsCompartido && gasto.Participantes?.length ? (
        <View style={styles.bloque} testID="expense-detail-participantes">
          {gasto.Participantes.map((p) => (
            <View key={p.IdParticipanteViaje} style={styles.participante}>
              <Text numberOfLines={1} style={styles.participanteNombre}>
                {nombreCompleto(p)}
              </Text>
              <Text style={styles.participanteMonto}>{formatMoney(p.MontoAsignado, moneda)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

export default function ExpenseDetailModal({
  visible,
  gasto,
  loading = false,
  error = "",
  currentUserId,
  onClose,
  onEdit,
  onRetry,
  canDelete = false,
  onDelete,
  deleting = false,
}) {
  const pagoYo = gasto && String(gasto.IdUsuarioPagador) === String(currentUserId);
  const editandoOtro =
    gasto?.IdUsuarioEditando != null && String(gasto.IdUsuarioEditando) !== String(currentUserId);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet} testID="expense-detail">
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>Detalle del gasto</Text>
            <Pressable hitSlop={10} onPress={onClose} testID="expense-detail-close">
              <FontAwesome6 color={colors.overlay} name="xmark" size={18} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{error}</Text>
              {onRetry ? (
                <PrimaryButton label="Reintentar" onPress={onRetry} variant="secondary" />
              ) : null}
            </View>
          ) : gasto ? (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <ExpenseDetailContent gasto={gasto} pagoYo={pagoYo} />

              {editandoOtro ? (
                <View style={[styles.aviso, styles.avisoInfo]} testID="expense-detail-editando">
                  <FontAwesome6 color={colors.primary} name="pen" size={12} />
                  <Text style={styles.avisoTexto}>
                    {gasto.NombreUsuarioEditando || "Otro usuario"} está editando este gasto.
                  </Text>
                </View>
              ) : null}

              {!gasto.PuedeEditar && gasto.MotivoNoEditable ? (
                <View style={[styles.aviso, styles.avisoWarning]} testID="expense-detail-motivo">
                  <FontAwesome6 color={colors.warning} name="lock" size={12} />
                  <Text style={styles.avisoTexto}>{gasto.MotivoNoEditable}</Text>
                </View>
              ) : null}

              {(gasto.PuedeEditar && onEdit) || (canDelete && onDelete) ? (
                <View style={styles.acciones}>
                  {canDelete && onDelete ? (
                    <PrimaryButton
                      disabled={deleting}
                      icon="trash-can"
                      iconPosition="left"
                      label="Eliminar"
                      loading={deleting}
                      onPress={() => onDelete(gasto)}
                      style={styles.accion}
                      testID="expense-detail-delete"
                      textStyle={styles.textoEliminar}
                      variant="secondary"
                    />
                  ) : null}
                  {gasto.PuedeEditar && onEdit ? (
                    <PrimaryButton
                      disabled={deleting}
                      icon="pen"
                      iconPosition="left"
                      label="Editar"
                      onPress={() => onEdit(gasto)}
                      style={styles.accion}
                      testID="expense-detail-edit"
                    />
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

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
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  center: {
    paddingVertical: 48,
    alignItems: "center",
    gap: spacing.sm,
  },
  errorText: {
    ...textStyles.body,
    color: colors.danger,
    textAlign: "center",
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBody: {
    flex: 1,
  },
  nombre: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    fontSize: 17,
  },
  monto: {
    ...textStyles.kpiValue,
    color: colors.primary,
  },
  original: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  cotizacion: {
    gap: 4,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  cotizacionFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  cotizacionValor: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  cotizacionFuente: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  cotizacionNota: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textMuted,
  },
  bloque: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  filaIcono: {
    width: 22,
  },
  filaEtiqueta: {
    ...textStyles.meta,
    color: colors.textSecondary,
    width: 80,
  },
  filaValor: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  participante: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xxs + 2,
  },
  participanteNombre: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  participanteMonto: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  aviso: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  avisoInfo: {
    backgroundColor: colors.surfaceMuted,
  },
  avisoWarning: {
    backgroundColor: colors.warningSurface,
  },
  avisoTexto: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
  },
  acciones: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  accion: {
    flex: 1,
  },
  textoEliminar: {
    color: colors.danger,
  },
});