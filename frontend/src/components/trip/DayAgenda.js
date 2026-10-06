import { useMemo, useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { buildAgenda, getPlaceName, isTodayISO } from "../../utils/agenda";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

const COLOR_SOFT = colors.primarySoft ? `${colors.primarySoft}33` : "#eef2ff";
const COLOR_DANGER = colors.danger || "#FF3B30";
const COLOR_WARNING = colors.warning || "#B45309";

const ACTIVIDADES_INICIALES = 5;
const NOTA_LARGA = 60;
const TITULO_LARGO = 38;

/**
 * Agenda de un día, pensada para pantallas chicas: cada actividad ocupa pocas líneas.
 *   1) horario + duración (y las acciones a la derecha)
 *   2) nombre
 *   3) lugar (una línea)
 *   4) nota (una línea; al tocar la tarjeta se abre todo)
 * El ícono va dentro de la tarjeta; un riel con puntos une las actividades. Si el día es hoy, marca la que está en curso.
 */
export default function DayAgenda({
  actividades = [],
  fecha,
  canEdit = false,
  onAdd,
  onEdit,
  onDelete,
}) {
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [detallesAbiertos, setDetallesAbiertos] = useState({});

  const hoy = isTodayISO(fecha);
  const agenda = useMemo(() => buildAgenda(actividades, { isToday: hoy }), [actividades, hoy]);

  if (agenda.length === 0) {
    return (
      <View style={styles.empty} testID="agenda-empty">
        <FontAwesome6 name="calendar-plus" size={16} color={colors.primary} />
        <View style={styles.emptyTexts}>
          <Text style={styles.emptyTitle}>Todavía no hay planes para este día</Text>
          <Text style={styles.emptyCopy}>
            {canEdit
              ? "Sumá la primera actividad."
              : "Cuando alguien agregue actividades, las vas a ver acá."}
          </Text>
        </View>
        {canEdit && onAdd ? (
          <Pressable
            onPress={onAdd}
            style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Agregar actividad"
            testID="agenda-add"
          >
            <FontAwesome6 name="plus" size={13} color={colors.textInverse} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  const ocultas = Math.max(0, agenda.length - ACTIVIDADES_INICIALES);
  const visibles = mostrarTodas || ocultas === 0 ? agenda : agenda.slice(0, ACTIVIDADES_INICIALES);

  return (
    <View>
      {visibles.map((entrada, posicion) => {
        const { item } = entrada;
        const id = item.id ?? posicion;
        const titulo = item.title ?? item.Titulo ?? "Actividad sin nombre";
        const nota = item.note ?? item.Notas ?? "";
        const lugar = getPlaceName(item);
        const esUltima = posicion === visibles.length - 1;
        const hayMas = titulo.length > TITULO_LARGO || nota.length > NOTA_LARGA;
        const abierto = Boolean(detallesAbiertos[id]);
        const enCurso = entrada.estado === "ahora";
        const siguiente = entrada.estado === "siguiente";
        const pasada = entrada.estado === "pasada";

        let horario = "Sin horario";
        if (entrada.start && entrada.end) horario = `${entrada.start} – ${entrada.end}`;
        else if (entrada.start) horario = `Desde las ${entrada.start}`;

        return (
          <View key={id}>
            {entrada.huecoLibre ? (
              <View style={styles.row}>
                <View style={styles.rail}>
                  <View style={styles.railLine} />
                </View>
                <Text style={styles.gapText}>{entrada.huecoLibre} libres</Text>
              </View>
            ) : null}

            <View style={[styles.row, pasada && styles.rowPast]} testID={`agenda-item-${id}`}>
              <View style={styles.rail}>
                <View style={[styles.dot, enCurso && styles.dotNow, siguiente && styles.dotNext]} />
                {!esUltima ? <View style={styles.railLine} /> : null}
              </View>

              <Pressable
                disabled={!hayMas}
                onPress={() => setDetallesAbiertos((actual) => ({ ...actual, [id]: !actual[id] }))}
                accessibilityRole={hayMas ? "button" : undefined}
                accessibilityLabel={hayMas ? (abierto ? "Ver menos" : "Ver más") : undefined}
                testID={`agenda-detail-${id}`}
                style={[styles.card, enCurso && styles.cardNow, !esUltima && styles.cardSpacing]}
              >
                {/* 1) Horario, duración, estado y acciones */}
                <View style={styles.cardTop}>
                  <View style={[styles.iconBubble, enCurso && styles.iconBubbleNow]}>
                    <FontAwesome6
                      name={item.icon ?? "location-dot"}
                      size={11}
                      color={enCurso ? colors.textInverse : colors.primary}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[styles.time, !entrada.start && styles.timeNone]}
                    testID={`agenda-time-${id}`}
                  >
                    {horario}
                    {entrada.duracion ? <Text style={styles.duration}>{`  ·  ${entrada.duracion}`}</Text> : null}
                  </Text>

                  {enCurso || siguiente ? (
                    <View style={[styles.badge, enCurso ? styles.badgeNow : styles.badgeNext]}>
                      <Text style={[styles.badgeText, enCurso && styles.badgeTextNow]}>
                        {enCurso ? "EN CURSO" : "SIGUIENTE"}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.spacer} />

                  {hayMas ? (
                    <FontAwesome6
                      name={abierto ? "chevron-up" : "chevron-down"}
                      size={10}
                      color={colors.textMuted}
                    />
                  ) : null}

                  {canEdit ? (
                    <View style={styles.actions}>
                      <Pressable
                        onPress={() => onEdit?.(item)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel={`Editar ${titulo}`}
                        testID={`agenda-edit-${id}`}
                      >
                        <FontAwesome6 name="pen" size={12} color={colors.primary} />
                      </Pressable>
                      <Pressable
                        onPress={() => onDelete?.(item)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                        accessibilityRole="button"
                        accessibilityLabel={`Eliminar ${titulo}`}
                        testID={`agenda-delete-${id}`}
                      >
                        <FontAwesome6 name="trash" size={12} color={COLOR_DANGER} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>

                {/* 2) Nombre */}
                <Text style={styles.title} numberOfLines={abierto ? undefined : 2}>
                  {titulo}
                </Text>

                {/* 3) Lugar */}
                {lugar ? (
                  <View style={styles.metaRow}>
                    <FontAwesome6 name="location-dot" size={10} color={colors.textMuted} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {lugar}
                    </Text>
                  </View>
                ) : null}

                {/* 4) Nota */}
                {nota ? (
                  <Text style={styles.note} numberOfLines={abierto ? undefined : 1}>
                    {nota}
                  </Text>
                ) : null}

                {entrada.seSuperpone ? (
                  <View style={styles.metaRow}>
                    <FontAwesome6 name="triangle-exclamation" size={10} color={COLOR_WARNING} />
                    <Text style={[styles.metaText, styles.warningText]} numberOfLines={1}>
                      Se superpone con la anterior
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>
        );
      })}

      {ocultas > 0 ? (
        <Pressable
          onPress={() => setMostrarTodas((actual) => !actual)}
          style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
          accessibilityRole="button"
          testID="agenda-show-more"
        >
          <Text style={styles.moreText}>
            {mostrarTodas
              ? "Mostrar menos"
              : `Ver ${ocultas} ${ocultas === 1 ? "actividad más" : "actividades más"}`}
          </Text>
          <FontAwesome6 name={mostrarTodas ? "chevron-up" : "chevron-down"} size={10} color={colors.primary} />
        </Pressable>
      ) : null}

      {canEdit && onAdd ? (
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          accessibilityRole="button"
          testID="agenda-add"
        >
          <FontAwesome6 name="plus" size={11} color={colors.primary} />
          <Text style={styles.addText}>Agregar actividad</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const RIEL = 14;
const PUNTO = 10;
const BURBUJA = 24;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
  },
  rowPast: {
    opacity: 0.55,
  },
  rail: {
    width: RIEL,
    alignItems: "center",
  },
  railLine: {
    flex: 1,
    width: 2,
    marginVertical: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  dot: {
    width: PUNTO,
    height: PUNTO,
    borderRadius: PUNTO / 2,
    marginTop: 14,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  dotNow: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dotNext: {
    borderColor: colors.primary,
  },
  iconBubble: {
    width: BURBUJA,
    height: BURBUJA,
    borderRadius: BURBUJA / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  iconBubbleNow: {
    backgroundColor: colors.primary,
  },
  card: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.xs,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 2,
  },
  cardSpacing: {
    marginBottom: 6,
  },
  cardNow: {
    borderColor: colors.primary,
    backgroundColor: COLOR_SOFT,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 24,
  },
  spacer: {
    flex: 1,
  },
  time: {
    ...textStyles.bodyStrong,
    flexShrink: 1,
    color: colors.primary,
    fontSize: 13,
  },
  timeNone: {
    color: colors.textMuted,
    fontWeight: "400",
  },
  duration: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "400",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: COLOR_SOFT,
  },
  badgeNow: {
    backgroundColor: colors.primary,
  },
  badgeNext: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "transparent",
  },
  badgeText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
    fontSize: 9,
    letterSpacing: 0.4,
  },
  badgeTextNow: {
    color: colors.textInverse,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: -4,
  },
  actionButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 15,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    ...textStyles.meta,
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: 12,
  },
  warningText: {
    color: COLOR_WARNING,
    fontWeight: "600",
  },
  note: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  gapText: {
    ...textStyles.meta,
    flex: 1,
    marginLeft: spacing.sm,
    marginBottom: 2,
    color: colors.textMuted,
    fontSize: 11,
    fontStyle: "italic",
  },
  moreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  moreText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: 4,
    paddingVertical: 9,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.primary,
    backgroundColor: COLOR_SOFT,
  },
  addText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
  },
  empty: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: COLOR_SOFT,
  },
  emptyTexts: {
    flex: 1,
    gap: 1,
  },
  emptyTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 14,
  },
  emptyCopy: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: 12,
  },
  emptyButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
});