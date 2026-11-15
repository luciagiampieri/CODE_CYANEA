import { FontAwesome6 } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatMoney, formatMoneyNoBreak } from "../../utils/money";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

const firstName = (fullName) => String(fullName ?? "").trim().split(/\s+/)[0] || "";

function toneOf(value) {
  const n = Number(value ?? 0);
  if (n > 0.004) return "credit";
  if (n < -0.004) return "debt";
  return "even";
}

const TONE = {
  credit: { color: colors.success, label: "le deben", mine: "te deben", etapa: "a favor" },
  debt: { color: colors.danger, label: "debe", mine: "debés", etapa: "en contra" },
  even: { color: colors.textSecondary, label: "al día", mine: "al día", etapa: "parejo" },
};

const TONE_ORDER = { credit: 0, debt: 1, even: 2 };

const MODO_TOTAL = "total";
const MODO_ETAPA = "etapa";

const PHASES = [
  { key: "pre_viaje", title: "Antes", long: "Antes del viaje", icon: "suitcase" },
  { key: "en_curso", title: "Durante", long: "Durante el viaje", icon: "plane" },
  { key: "post_viaje", title: "Después", long: "Después del viaje", icon: "house" },
];

function shortDate(iso) {
  if (!iso) return "";
  const [, month, day] = String(iso).slice(0, 10).split("-");
  return `${day}/${month}`;
}

function phaseRange(phase) {
  if (!phase) return "";
  if (phase.Fase === "pre_viaje") return phase.Hasta ? `hasta ${shortDate(phase.Hasta)}` : "";
  if (phase.Fase === "post_viaje") return phase.Desde ? `desde ${shortDate(phase.Desde)}` : "";
  if (phase.Desde && phase.Hasta) return `${shortDate(phase.Desde)} al ${shortDate(phase.Hasta)}`;
  return "";
}

function signed(value, currency) {
  const n = Number(value ?? 0);
  const tone = toneOf(n);
  const sign = tone === "credit" ? "+" : tone === "debt" ? "−" : "";
  return `${sign}${formatMoney(Math.abs(n), currency)}`;
}

function gastosLabel(count) {
  if (count === 0) return "Sin gastos";
  return `${count} ${count === 1 ? "gasto" : "gastos"}`;
}

// Lo que movieron las transferencias: el saldo pendiente menos (pagado - parte).
// Positivo: la persona transfirió. Negativo: recibió.
function ajusteTransferencias(item) {
  const pendiente = Number(item.BalancePendiente ?? 0);
  const pagado = Number(item.TotalPagado ?? 0);
  const parte = Number(item.GastoIndividual ?? 0);
  return pendiente - (pagado - parte);
}

function primeraEtapaConGastos(phasesByKey) {
  const conGastos = PHASES.find((phase) => Number(phasesByKey[phase.key]?.CantidadGastos ?? 0) > 0);
  return (conGastos ?? PHASES[0]).key;
}

export default function SettlementBalances({
  balances = [],
  currency,
  currentUserId,
  loading,
  onShowBreakdown,
}) {
  const [modo, setModo] = useState(MODO_TOTAL);
  const [etapa, setEtapa] = useState(null);

  if (balances.length === 0) {
    return loading ? null : (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>
          Todavía no hay participantes aceptados para calcular los saldos.
        </Text>
      </View>
    );
  }

  const isMe = (item) =>
    currentUserId !== null &&
    currentUserId !== undefined &&
    String(item.IdUsuario) === String(currentUserId);

  const me = balances.find(isMe);
  const others = balances.filter((item) => !isMe(item));

  const phases = (me ?? balances[0])?.Fases ?? [];
  const phasesByKey = Object.fromEntries(phases.map((phase) => [phase.Fase, phase]));
  const hayEtapas = phases.length > 0;
  const porEtapa = hayEtapas && modo === MODO_ETAPA;
  const etapaActiva = etapa ?? primeraEtapaConGastos(phasesByKey);
  const fase = porEtapa ? phasesByKey[etapaActiva] : null;

  return (
    <View style={styles.container}>
      {hayEtapas ? (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Saldos</Text>
          <ModeToggle value={porEtapa ? MODO_ETAPA : MODO_TOTAL} onChange={setModo} />
        </View>
      ) : null}

      {porEtapa ? (
        <>
          <PhaseSelector phasesByKey={phasesByKey} value={etapaActiva} onChange={setEtapa} />
          {fase ? (
            <PhaseDetail currency={currency} etapa={etapaActiva} hasMe={Boolean(me)} phase={fase} />
          ) : null}
          {fase && Number(fase.CantidadGastos ?? 0) > 0 && others.length > 0 ? (
            <PhaseGroupList currency={currency} etapa={etapaActiva} others={others} />
          ) : null}
        </>
      ) : (
        <TotalList currency={currency} me={me} onShowBreakdown={onShowBreakdown} others={others} />
      )}
    </View>
  );
}

function ModeToggle({ value, onChange }) {
  const opciones = [
    { key: MODO_TOTAL, label: "Todo el viaje" },
    { key: MODO_ETAPA, label: "Por etapa" },
  ];
  return (
    <View style={styles.toggle} testID="balance-mode">
      {opciones.map((opcion) => {
        const on = opcion.key === value;
        return (
          <Pressable
            key={opcion.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(opcion.key)}
            style={[styles.toggleOption, on && styles.toggleOptionOn]}
            testID={`balance-mode-${opcion.key}`}
          >
            <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{opcion.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PhaseSelector({ phasesByKey, value, onChange }) {
  return (
    <View style={styles.selector} testID="balance-phases">
      {PHASES.map((phase) => {
        const count = Number(phasesByKey[phase.key]?.CantidadGastos ?? 0);
        const vacia = count === 0;
        const selected = phase.key === value;
        return (
          <Pressable
            key={phase.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(phase.key)}
            style={({ pressed }) => [
              styles.chip,
              vacia && styles.chipEmpty,
              selected && styles.chipSelected,
              pressed && !selected && styles.chipPressed,
            ]}
            testID={`phase-${phase.key}`}
          >
            <FontAwesome6
              color={selected ? colors.accent : vacia ? colors.textMuted : colors.primary}
              name={phase.icon}
              size={14}
            />
            <View style={styles.chipText}>
              <Text
                numberOfLines={1}
                style={[
                  styles.chipTitle,
                  vacia && styles.chipTitleEmpty,
                  selected && styles.chipTitleSelected,
                ]}
              >
                {phase.title}
              </Text>
              <Text numberOfLines={1} style={[styles.chipSub, selected && styles.chipSubSelected]}>
                {gastosLabel(count)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function DetailRow({ label, value, color, strong }) {
  return (
    <View style={[styles.detailRow, strong && styles.detailRowStrong]}>
      <Text style={[styles.detailLabel, strong && styles.detailLabelStrong]}>{label}</Text>
      <Text style={[strong ? styles.detailValueStrong : styles.detailValue, color ? { color } : null]}>
        {value}
      </Text>
    </View>
  );
}

function PhaseDetail({ phase, etapa, hasMe, currency }) {
  const meta = PHASES.find((item) => item.key === etapa);
  const range = phaseRange(phase);
  const count = Number(phase.CantidadGastos ?? 0);
  const neto = Number(phase.Neto ?? 0);

  return (
    <View style={styles.detail} testID="phase-detail">
      <Text style={styles.detailTitle}>
        {meta?.long}
        {range ? <Text style={styles.detailTitleMeta}> · {range}</Text> : null}
      </Text>
      {count === 0 ? (
        <Text style={styles.detailEmpty}>Todavía no hay gastos en esta etapa.</Text>
      ) : (
        <>
          <DetailRow
            label={`Gastó el grupo (${gastosLabel(count)})`}
            value={formatMoney(phase.TotalGrupo, currency)}
          />
          {hasMe ? (
            <>
              <DetailRow label="Pagaste" value={formatMoney(phase.Pagado, currency)} />
              <DetailRow label="Tu parte" value={`−${formatMoney(phase.Parte, currency)}`} />
              <DetailRow
                color={TONE[toneOf(neto)].color}
                label="Tu balance en la etapa"
                strong
                value={signed(neto, currency)}
              />
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

function TotalList({ me, others, currency, onShowBreakdown }) {
  const ordenados = [...others].sort((a, b) => {
    const ta = toneOf(a.BalancePendiente);
    const tb = toneOf(b.BalancePendiente);
    if (ta !== tb) return TONE_ORDER[ta] - TONE_ORDER[tb];
    return Math.abs(Number(b.BalancePendiente ?? 0)) - Math.abs(Number(a.BalancePendiente ?? 0));
  });
  const filas = (me ? 1 : 0) + ordenados.length;

  return (
    <View style={styles.list}>
      {me ? (
        <MyRow currency={currency} isLast={filas === 1} item={me} onPress={onShowBreakdown} />
      ) : null}
      {ordenados.map((item, index) => (
        <GroupRow
          key={item.IdParticipanteViaje}
          currency={currency}
          isLast={index === ordenados.length - 1}
          item={item}
        />
      ))}
    </View>
  );
}

function Avatar({ name, mine }) {
  return (
    <View style={[styles.avatar, mine && styles.avatarMine]}>
      <Text style={[styles.avatarText, mine && styles.avatarTextMine]}>
        {mine ? "V" : firstName(name).charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

function MetaLine({ parts }) {
  return (
    <View style={styles.metaRow}>
      {parts.map((part, index) => (
        <Text key={part} style={styles.meta}>
          {part}
          {index < parts.length - 1 ? " · " : ""}
        </Text>
      ))}
    </View>
  );
}

function MyRow({ item, currency, isLast, onPress }) {
  const pendiente = Number(item.BalancePendiente ?? 0);
  const tone = toneOf(pendiente);
  const ajuste = ajusteTransferencias(item);
  const parts = [
    `Pagaste ${formatMoneyNoBreak(item.TotalPagado, currency)}`,
    `tu parte ${formatMoneyNoBreak(item.GastoIndividual, currency)}`,
  ];
  if (Math.abs(ajuste) > 0.004) {
    parts.push(
      `${ajuste > 0 ? "transferiste" : "recibiste"} ${formatMoneyNoBreak(Math.abs(ajuste), currency)}`
    );
  }

  const content = (
    <View
      style={[styles.row, styles.rowMine, !isLast && styles.rowDivider]}
      testID={`balance-${item.IdParticipanteViaje}`}
    >
      <Avatar mine />
      <View style={styles.rowText}>
        <Text style={styles.name}>Vos</Text>
        <MetaLine parts={parts} />
      </View>
      <View style={styles.amountBox} testID="balance-mine-value">
        {tone !== "even" ? (
          <Text style={[styles.amount, { color: TONE[tone].color }]}>
            {formatMoney(Math.abs(pendiente), currency)}
          </Text>
        ) : null}
        <Text style={[styles.amountLabel, { color: TONE[tone].color }]}>{TONE[tone].mine}</Text>
      </View>
      {onPress ? <FontAwesome6 color={colors.textSecondary} name="chevron-right" size={12} /> : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityHint="Muestra de dónde sale tu saldo"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
      testID="balance-breakdown-open"
    >
      {content}
    </Pressable>
  );
}

function GroupRow({ item, currency, isLast }) {
  const pendiente = Number(item.BalancePendiente ?? 0);
  const tone = toneOf(pendiente);
  const ajuste = ajusteTransferencias(item);
  const parts = [
    `Pagó ${formatMoneyNoBreak(item.TotalPagado, currency)}`,
    `su parte ${formatMoneyNoBreak(item.GastoIndividual, currency)}`,
  ];
  if (Math.abs(ajuste) > 0.004) {
    parts.push(
      `${ajuste > 0 ? "transfirió" : "recibió"} ${formatMoneyNoBreak(Math.abs(ajuste), currency)}`
    );
  }

  return (
    <View style={[styles.row, !isLast && styles.rowDivider]} testID={`balance-${item.IdParticipanteViaje}`}>
      <Avatar name={item.NombreCompleto} />
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.name}>
          {item.NombreCompleto}
        </Text>
        <MetaLine parts={parts} />
      </View>
      <View style={styles.amountBox}>
        {tone !== "even" ? (
          <Text style={[styles.amount, { color: TONE[tone].color }]}>
            {formatMoney(Math.abs(pendiente), currency)}
          </Text>
        ) : null}
        <Text style={[styles.amountLabel, { color: TONE[tone].color }]}>{TONE[tone].label}</Text>
      </View>
    </View>
  );
}

function PhaseGroupList({ others, etapa, currency }) {
  const faseDe = (item) => (item.Fases ?? []).find((f) => f.Fase === etapa);
  const ordenados = [...others].sort(
    (a, b) => Number(faseDe(b)?.Neto ?? 0) - Number(faseDe(a)?.Neto ?? 0)
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>El grupo en esta etapa</Text>
      <Text style={styles.sectionHint}>Lo que pagó cada uno menos su parte, sin contar transferencias.</Text>
      <View style={styles.list}>
        {ordenados.map((item, index) => (
          <GroupPhaseRow
            key={item.IdParticipanteViaje}
            currency={currency}
            data={faseDe(item)}
            isLast={index === ordenados.length - 1}
            item={item}
          />
        ))}
      </View>
    </View>
  );
}

function GroupPhaseRow({ item, data, currency, isLast }) {
  const neto = Number(data?.Neto ?? 0);
  const tone = toneOf(neto);

  return (
    <View
      style={[styles.row, !isLast && styles.rowDivider]}
      testID={`balance-phase-${item.IdParticipanteViaje}`}
    >
      <Avatar name={item.NombreCompleto} />
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.name}>
          {item.NombreCompleto}
        </Text>
        {data ? (
          <MetaLine
            parts={[
              `Pagó ${formatMoneyNoBreak(data.Pagado, currency)}`,
              `su parte ${formatMoneyNoBreak(data.Parte, currency)}`,
            ]}
          />
        ) : (
          <Text style={styles.meta}>Sin datos de esta etapa</Text>
        )}
      </View>
      {data ? (
        <View style={styles.amountBox}>
          <Text style={[styles.amount, { color: TONE[tone].color }]}>{signed(neto, currency)}</Text>
          <Text style={[styles.amountLabel, { color: TONE[tone].color }]}>{TONE[tone].etapa}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  emptyState: {
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  emptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headerTitle: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    paddingHorizontal: spacing.xxs,
  },
  toggle: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  toggleOption: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  toggleOptionOn: {
    backgroundColor: colors.primary,
  },
  toggleText: {
    ...textStyles.meta,
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  toggleTextOn: {
    color: colors.textInverse,
  },
  selector: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipEmpty: {
    backgroundColor: colors.surfaceMuted,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  chipText: {
    minWidth: 0,
    flexShrink: 1,
  },
  chipTitle: {
    ...textStyles.meta,
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  chipTitleEmpty: {
    color: colors.textMuted,
  },
  chipTitleSelected: {
    color: colors.textInverse,
  },
  chipSub: {
    ...textStyles.meta,
    fontSize: 10,
    color: colors.textSecondary,
  },
  chipSubSelected: {
    color: colors.accent,
  },
  detail: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  detailTitle: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 2,
  },
  detailTitleMeta: {
    fontWeight: "400",
    color: colors.textSecondary,
  },
  detailEmpty: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
    paddingTop: spacing.xxs,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: 5,
  },
  detailRowStrong: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xxs,
    paddingTop: spacing.sm,
  },
  detailLabel: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  detailLabelStrong: {
    fontWeight: "700",
    color: colors.primary,
  },
  detailValue: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  detailValueStrong: {
    ...textStyles.kpiValue,
    fontSize: 18,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    paddingHorizontal: spacing.xxs,
  },
  sectionHint: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textMuted,
    paddingHorizontal: spacing.xxs,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
  },
  rowMine: {
    backgroundColor: colors.surfaceMuted,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: {
    opacity: 0.75,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  avatarMine: {
    backgroundColor: colors.primary,
  },
  avatarText: {
    ...textStyles.bodyStrong,
    fontSize: 13,
    color: colors.primary,
  },
  avatarTextMine: {
    color: colors.accent,
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
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },
  meta: {
    ...textStyles.meta,
    fontSize: 12,
    fontWeight: "400",
    color: colors.textSecondary,
  },
  amountBox: {
    alignItems: "flex-end",
  },
  amount: {
    ...textStyles.kpiValue,
    fontSize: 16,
  },
  amountLabel: {
    ...textStyles.meta,
    fontSize: 12,
    fontWeight: "600",
  },
});