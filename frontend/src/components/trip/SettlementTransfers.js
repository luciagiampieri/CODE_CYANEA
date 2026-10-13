import { FontAwesome6 } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { formatMoney } from "../../utils/money";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

// Cuántas pendientes se ven antes de "Ver N más".
export const VISIBLE_PENDING = 3;

const firstName = (fullName) => String(fullName ?? "").trim().split(/\s+/)[0] || "";

/**
 * Transferencias del usuario actual, pensadas para mobile.
 *
 * Solo las suyas, en dos secciones ("Tenés que transferir" y "Te tienen que
 * transferir"), cada una como una lista compacta con su total.
 * - Lo que espera una acción del usuario se ve primero: el deudor tiene
 *   "Ya transferí" en la fila; el acreedor ve resaltados los avisos de
 *   "Ya transferí" con "Me llegó" / "No me llegó".
 * - Una pendiente sin aviso no muestra botón: el acreedor toca la fila si
 *   quiere confirmarla igual.
 * - Las pendientes largas se cortan en VISIBLE_PENDING con "Ver N más" y las
 *   ya saldadas quedan plegadas al final.
 */
export default function SettlementTransfers({
  transfers = [],
  balances = [],
  currency,
  currentUserId,
  canUpdate = false,
  updatingTransferId = null,
  onReport,
  onConfirm,
  onReject,
  loading,
}) {
  // Las transferencias referencian IdParticipanteViaje; se busca cuál es el del usuario actual.
  const myParticipantId = balances.find(
    (item) =>
      currentUserId !== null &&
      currentUserId !== undefined &&
      String(item.IdUsuario) === String(currentUserId)
  )?.IdParticipanteViaje;

  const mine = (key) =>
    myParticipantId === undefined ? [] : transfers.filter((t) => t[key] === myParticipantId);
  const toPay = mine("IdParticipanteDeudor");
  const toReceive = mine("IdParticipanteAcreedor");

  if (toPay.length === 0 && toReceive.length === 0) {
    if (loading) return null;
    return (
      <View style={styles.emptyState} testID="transfers-empty">
        <FontAwesome6 color={colors.success} name="circle-check" size={16} />
        <Text style={styles.emptyText}>
          {transfers.length === 0
            ? "No hay deudas pendientes. El grupo está al día."
            : "No tenés transferencias pendientes con nadie del grupo."}
        </Text>
      </View>
    );
  }

  const shared = { currency, canUpdate, updatingTransferId, onReport, onConfirm, onReject };

  return (
    <View style={styles.container}>
      {toPay.length > 0 ? (
        <TransferSection id="pay" role="pay" title="Tenés que transferir" transfers={toPay} {...shared} />
      ) : null}
      {toReceive.length > 0 ? (
        <TransferSection
          id="receive"
          role="receive"
          title="Te tienen que transferir"
          transfers={toReceive}
          {...shared}
        />
      ) : null}
    </View>
  );
}

function TransferSection({ id, role, title, transfers, currency, ...rowProps }) {
  const [showAll, setShowAll] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [openRowId, setOpenRowId] = useState(null);

  // Primero lo que espera una respuesta del usuario (avisos para confirmar).
  const attention = transfers.filter((t) => role === "receive" && t.Estado === "informada");
  const waiting = transfers.filter((t) => role === "pay" && t.Estado === "informada");
  const pending = transfers.filter((t) => t.Estado === "pendiente");
  const settled = transfers.filter((t) => t.Estado === "realizada");

  const open = [...attention, ...pending, ...waiting];
  const visible = showAll ? open : open.slice(0, attention.length + VISIBLE_PENDING);
  const hidden = open.length - visible.length;
  const total = open.reduce((acc, t) => acc + Number(t.Monto ?? 0), 0);
  const nameKey = role === "pay" ? "NombreAcreedor" : "NombreDeudor";

  const renderRow = (transfer, index, list) => (
    <TransferRow
      key={transfer.IdTransferenciaLiquidacion}
      amount={formatMoney(transfer.Monto, currency)}
      isLast={index === list.length - 1}
      name={transfer[nameKey]}
      open={openRowId === transfer.IdTransferenciaLiquidacion}
      role={role}
      transfer={transfer}
      onToggleOpen={() =>
        setOpenRowId((current) =>
          current === transfer.IdTransferenciaLiquidacion ? null : transfer.IdTransferenciaLiquidacion
        )
      }
      {...rowProps}
    />
  );

  return (
    <View style={styles.section} testID={role === "pay" ? "transfers-to-pay" : "transfers-to-receive"}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {total > 0 ? (
          <Text style={styles.sectionTotal} testID={`transfers-total-${id}`}>
            {formatMoney(total, currency)}
          </Text>
        ) : null}
      </View>

      {visible.length > 0 ? (
        <View style={styles.list}>
          {visible.map(renderRow)}
          {hidden > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowAll(true)}
              style={styles.moreRow}
              testID={`transfers-more-${id}`}
            >
              <Text style={styles.moreText}>Ver {hidden} más</Text>
              <FontAwesome6 color={colors.primary} name="chevron-down" size={11} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {settled.length > 0 ? (
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showSettled }}
            onPress={() => setShowSettled((prev) => !prev)}
            style={styles.settledToggle}
            testID={`transfers-settled-${id}`}
          >
            <FontAwesome6 color={colors.success} name="circle-check" size={12} />
            <Text style={styles.settledText}>Ya saldadas ({settled.length})</Text>
            <FontAwesome6
              color={colors.textSecondary}
              name={showSettled ? "chevron-up" : "chevron-down"}
              size={11}
            />
          </Pressable>
          {showSettled ? <View style={styles.list}>{settled.map(renderRow)}</View> : null}
        </View>
      ) : null}
    </View>
  );
}

function TransferRow({
  transfer,
  role,
  name,
  amount,
  isLast,
  open,
  onToggleOpen,
  canUpdate,
  updatingTransferId,
  onReport,
  onConfirm,
  onReject,
}) {
  const id = transfer.IdTransferenciaLiquidacion;
  const estado = transfer.Estado;
  const busy = updatingTransferId === id;
  const who = firstName(name);
  const done = estado === "realizada";
  const needsMe = role === "receive" && estado === "informada";
  // Una pendiente de quien te debe y no avisó: tocás la fila para confirmar igual.
  const expandable = canUpdate && role === "receive" && estado === "pendiente" && Boolean(onConfirm);

  // Acción o estado a la derecha de la fila.
  let trailing = null;
  if (busy) {
    trailing = <ActivityIndicator color={colors.primary} size="small" />;
  } else if (role === "pay" && estado === "pendiente" && canUpdate && onReport) {
    trailing = <Pill icon="paper-plane" label="Ya transferí" onPress={() => onReport(id)} testID={`transfer-report-${id}`} />;
  } else if (done && role === "receive" && canUpdate && onConfirm) {
    trailing = <TextButton label="Deshacer" onPress={() => onConfirm(id, false)} testID={`transfer-undo-${id}`} />;
  } else if (expandable) {
    trailing = <FontAwesome6 color={colors.textSecondary} name={open ? "chevron-up" : "chevron-down"} size={12} />;
  }

  // Línea secundaria bajo el monto, solo cuando aporta algo.
  let note = null;
  if (role === "pay" && estado === "informada") note = `Avisaste que transferiste. Esperando que ${who} confirme`;
  if (role === "pay" && done) note = `${who} confirmó que le llegó`;
  if (needsMe) note = `${who} dice que ya te transfirió`;
  if (role === "receive" && done) note = "Recibida";

  const content = (
    <>
      <View style={styles.rowMain}>
        <View style={[styles.avatar, needsMe && styles.avatarAttention]}>
          <Text style={styles.avatarText}>{who.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={[styles.name, done && styles.muted]}>
            {name}
          </Text>
          <Text style={[styles.amount, done && styles.amountDone]}>{amount}</Text>
          {note ? (
            <Text
              numberOfLines={2}
              style={[styles.note, needsMe && styles.noteAttention, done && styles.noteDone]}
            >
              {note}
            </Text>
          ) : null}
        </View>
        {trailing}
      </View>

      {/* Lo que espera tu respuesta: las dos opciones en su propia línea. */}
      {needsMe && canUpdate && !busy ? (
        <View style={styles.rowActions}>
          {onReject ? (
            <TextButton label="No me llegó" onPress={() => onReject(id)} testID={`transfer-reject-${id}`} />
          ) : null}
          {onConfirm ? (
            <Pill icon="check" label="Me llegó" onPress={() => onConfirm(id, true)} testID={`transfer-confirm-${id}`} />
          ) : null}
        </View>
      ) : null}

      {expandable && open && !busy ? (
        <View style={styles.rowActions}>
          <Text style={styles.hint}>¿Ya te llegó aunque no te avisó?</Text>
          <Pill
            icon="check"
            label="Me llegó"
            onPress={() => onConfirm(id, true)}
            testID={`transfer-confirm-${id}`}
            variant="outline"
          />
        </View>
      ) : null}
    </>
  );

  const rowStyle = [styles.row, !isLast && styles.rowDivider, needsMe && styles.rowAttention];

  if (expandable) {
    return (
      <Pressable
        accessibilityHint="Muestra la opción para confirmar que te llegó"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggleOpen}
        style={rowStyle}
        testID={`transfer-${id}`}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={rowStyle} testID={`transfer-${id}`}>
      {content}
    </View>
  );
}

function Pill({ label, icon, onPress, testID, variant = "primary" }) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        primary ? styles.pillPrimary : styles.pillOutline,
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <FontAwesome6 color={primary ? colors.textInverse : colors.primary} name={icon} size={11} />
      <Text style={[styles.pillText, primary ? styles.pillTextPrimary : styles.pillTextOutline]}>
        {label}
      </Text>
    </Pressable>
  );
}

function TextButton({ label, onPress, testID }) {
  return (
    <Pressable accessibilityRole="button" hitSlop={10} onPress={onPress} testID={testID}>
      <Text style={styles.textButton}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.xxs,
  },
  sectionTitle: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  sectionTotal: {
    ...textStyles.kpiValue,
    fontSize: 16,
    color: colors.primary,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  emptyState: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  emptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  row: {
    gap: spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowAttention: {
    backgroundColor: colors.accentMuted,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  avatarAttention: {
    backgroundColor: colors.accentStrong,
  },
  avatarText: {
    ...textStyles.bodyStrong,
    fontSize: 13,
    color: colors.primary,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...textStyles.meta,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  amount: {
    ...textStyles.kpiValue,
    fontSize: 16,
    color: colors.primary,
  },
  amountDone: {
    color: colors.textSecondary,
    textDecorationLine: "line-through",
  },
  muted: {
    color: colors.textSecondary,
  },
  note: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  noteAttention: {
    color: colors.primary,
    fontWeight: "600",
  },
  noteDone: {
    color: colors.success,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.md,
    paddingLeft: 32 + spacing.sm,
  },
  hint: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  moreText: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  settledToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  settledText: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  pillPrimary: {
    backgroundColor: colors.primary,
  },
  pillOutline: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.8,
  },
  pillText: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
  },
  pillTextPrimary: {
    color: colors.textInverse,
  },
  pillTextOutline: {
    color: colors.primary,
  },
  textButton: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    textDecorationLine: "underline",
  },
});