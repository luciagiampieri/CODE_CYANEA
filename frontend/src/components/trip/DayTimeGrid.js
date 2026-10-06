import { useMemo } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatDuration, getActivityTimes, getPlaceName, isTodayISO } from "../../utils/agenda";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

const ALTO_HORA = 68; // px por hora
const ALTO_MINIMO = 32; // una actividad corta nunca queda más chica que esto
const ANCHO_HORAS = 38;

// Color por tipo de actividad, deducido del ícono. Fondo suave + acento + texto oscuro del mismo tono.
const TIPOS = {
  comida: { acento: "#D97706", fondo: "rgba(217,119,6,0.14)", texto: "#92400E", iconos: ["utensils", "mug-hot", "burger", "pizza-slice", "wine-glass", "martini-glass", "ice-cream", "bowl-food", "cake-candles", "beer-mug-empty"] },
  traslado: { acento: "#2563EB", fondo: "rgba(37,99,235,0.12)", texto: "#1E40AF", iconos: ["plane", "plane-departure", "plane-arrival", "car", "bus", "train", "taxi", "ship", "bicycle", "person-walking", "route", "motorcycle", "subway"] },
  hospedaje: { acento: "#7C3AED", fondo: "rgba(124,58,237,0.12)", texto: "#5B21B6", iconos: ["bed", "hotel", "house", "key", "suitcase", "suitcase-rolling", "campground"] },
  paseo: { acento: "#0D9488", fondo: "rgba(13,148,136,0.13)", texto: "#115E59", iconos: ["landmark", "camera", "mountain", "tree", "umbrella-beach", "water", "binoculars", "church", "monument", "fish", "sun", "leaf", "map-location-dot", "palette", "ticket"] },
};

function tipoDe(icono) {
  const nombre = String(icono ?? "");
  const clave = Object.keys(TIPOS).find((k) => TIPOS[k].iconos.includes(nombre));
  return clave
    ? TIPOS[clave]
    : { acento: colors.primary, fondo: colors.surfaceAlt, texto: colors.primary };
}

// Reparte en columnas las actividades que se pisan, para que queden lado a lado.
function acomodar(items) {
  const ordenadas = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const resultado = [];
  let grupo = [];
  let finGrupo = -1;

  const cerrarGrupo = () => {
    const columnas = Math.max(1, ...grupo.map((g) => g.col + 1));
    grupo.forEach((g) => resultado.push({ ...g, columnas }));
    grupo = [];
  };

  ordenadas.forEach((item) => {
    if (grupo.length && item.startMin >= finGrupo) cerrarGrupo();
    const ocupadas = new Set(grupo.filter((g) => g.endMin > item.startMin).map((g) => g.col));
    let col = 0;
    while (ocupadas.has(col)) col += 1;
    grupo.push({ ...item, col });
    finGrupo = Math.max(finGrupo, item.endMin);
  });
  if (grupo.length) cerrarGrupo();
  return resultado;
}

/**
 * Vista "día en el tiempo": un eje de horas y cada actividad como un bloque cuyo alto
 * es proporcional a su duración. Las que se superponen quedan una al lado de la otra.
 * Las actividades sin horario se listan arriba como fichas.
 */
export default function DayTimeGrid({ actividades = [], fecha, canEdit = false, onAdd, onEdit, onDelete }) {
  const esHoy = isTodayISO(fecha);

  const { bloques, sinHorario, desde, hasta } = useMemo(() => {
    const conHorario = [];
    const sin = [];
    actividades.forEach((item) => {
      const { startMin, endMin, start, end } = getActivityTimes(item);
      if (startMin == null) {
        sin.push(item);
        return;
      }
      // Sin hora de fin se dibuja como una franja de 45 min.
      const fin = endMin ?? startMin + 45;
      conHorario.push({ item, startMin, endMin: fin, start, end, tieneFin: endMin != null });
    });

    if (!conHorario.length) return { bloques: [], sinHorario: sin, desde: 0, hasta: 0 };

    const minInicio = Math.min(...conHorario.map((b) => b.startMin));
    const maxFin = Math.max(...conHorario.map((b) => b.endMin));
    const d = Math.max(0, Math.floor(minInicio / 60) - 1) * 60;
    const h = Math.min(24, Math.ceil(maxFin / 60) + 1) * 60;
    return { bloques: acomodar(conHorario), sinHorario: sin, desde: d, hasta: h };
  }, [actividades]);

  // Las que se pisan llevan una letra (A, B, C) que se repite en el aviso de arriba.
  const enConflicto = bloques
    .filter((b) => b.columnas > 1)
    .sort((a, b) => a.startMin - b.startMin || a.col - b.col);
  const letraDe = {};
  enConflicto.forEach((b, i) => {
    letraDe[b.item.id] = String.fromCharCode(65 + (i % 26));
  });

  const ahora = new Date();
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const mostrarAhora = esHoy && minutosAhora >= desde && minutosAhora <= hasta;

  const horas = [];
  for (let m = desde; m < hasta; m += 60) horas.push(m);

  return (
    <View>
      {sinHorario.length > 0 ? (
        <View style={styles.sinHorarioWrap}>
          <Text style={styles.sinHorarioLabel}>Sin horario</Text>
          <View style={styles.sinHorarioFichas}>
            {sinHorario.map((item) => (
              <Pressable
                key={item.id}
                accessibilityLabel={`Editar ${item.title}`}
                disabled={!canEdit}
                onLongPress={canEdit ? () => onDelete?.(item) : undefined}
                onPress={() => onEdit?.(item)}
                style={styles.ficha}
              >
                <FontAwesome6 color={colors.primary} name={item.icon ?? "location-dot"} size={11} />
                <Text numberOfLines={1} style={styles.fichaTexto}>
                  {item.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {enConflicto.length > 0 ? (
        <View style={styles.aviso} testID="timegrid-conflict">
          <View style={styles.avisoHeader}>
            <FontAwesome6 color="#B45309" name="triangle-exclamation" size={12} />
            <Text style={styles.avisoTitulo}>Estas actividades se superponen</Text>
          </View>
          {enConflicto.map((b) => {
            const tipo = tipoDe(b.item.icon);
            return (
              <Pressable
                key={b.item.id}
                disabled={!canEdit}
                onPress={() => onEdit?.(b.item)}
                style={styles.avisoFila}
              >
                <View style={[styles.letra, { backgroundColor: tipo.acento }]}>
                  <Text style={styles.letraTexto}>{letraDe[b.item.id]}</Text>
                </View>
                <Text numberOfLines={1} style={styles.avisoTexto}>
                  <Text style={styles.avisoHora}>
                    {b.start}
                    {b.tieneFin ? `–${b.end}` : ""}
                  </Text>
                  {"  "}
                  {b.item.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {bloques.length > 0 ? (
        <View style={[styles.grilla, { height: ((hasta - desde) / 60) * ALTO_HORA }]} testID="timegrid">
          {horas.map((m) => (
            <View key={m} style={[styles.fila, { top: ((m - desde) / 60) * ALTO_HORA }]}>
              <Text style={styles.hora}>{String(m / 60).padStart(2, "0")}:00</Text>
              <View style={styles.linea} />
            </View>
          ))}

          <View style={styles.carril}>
            {bloques.map((b) => {
              const top = ((b.startMin - desde) / 60) * ALTO_HORA;
              const alto = Math.max(((b.endMin - b.startMin) / 60) * ALTO_HORA - 2, ALTO_MINIMO);
              const ancho = 100 / b.columnas;
              const lineasTitulo = Math.max(
                1,
                Math.min(4, Math.floor((alto - 14 - (alto >= 40 ? 15 : 0)) / 16))
              );
              const letra = letraDe[b.item.id];
              const tipo = tipoDe(b.item.icon);
              const pasada = esHoy && b.endMin <= minutosAhora;
              const enCurso = esHoy && b.startMin <= minutosAhora && minutosAhora < b.endMin;
              const lugar = alto >= 66 && b.columnas === 1 ? getPlaceName(b.item) : null;
              return (
                <Pressable
                  key={b.item.id}
                  accessibilityLabel={`${b.item.title}, ${b.start}${b.end ? ` a ${b.end}` : ""}`}
                  disabled={!canEdit}
                  onLongPress={canEdit ? () => onDelete?.(b.item) : undefined}
                  onPress={() => onEdit?.(b.item)}
                  style={[
                    styles.bloque,
                    { top, height: alto, left: `${b.col * ancho}%`, width: `${ancho}%` },
                    pasada && styles.bloquePasado,
                  ]}
                  testID={`timegrid-block-${b.item.id}`}
                >
                  <View
                    style={[
                      styles.bloqueInterior,
                      { backgroundColor: tipo.fondo, borderLeftColor: tipo.acento },
                      enCurso && { borderColor: tipo.acento, borderWidth: 1.5 },
                    ]}
                  >
                    <View style={styles.bloqueTitulo}>
                      {letra ? (
                        <View style={[styles.bloqueIcono, { backgroundColor: tipo.acento }]}>
                          <Text style={styles.letraTexto}>{letra}</Text>
                        </View>
                      ) : (
                        <View style={[styles.bloqueIcono, { backgroundColor: tipo.acento }]}>
                          <FontAwesome6 color="#fff" name={b.item.icon ?? "location-dot"} size={9} />
                        </View>
                      )}
                      <Text numberOfLines={lineasTitulo} style={[styles.bloqueTexto, { color: tipo.texto }]}>
                        {b.item.title}
                      </Text>
                      {enCurso && b.columnas === 1 ? (
                        <View style={[styles.etiqueta, { backgroundColor: tipo.acento }]}>
                          <Text style={styles.etiquetaTexto}>AHORA</Text>
                        </View>
                      ) : null}
                    </View>
                    {alto >= 40 ? (
                      <Text numberOfLines={1} style={[styles.bloqueHora, { color: tipo.texto }]}>
                        {b.start}
                        {b.tieneFin ? `–${b.end}` : ""}
                        {b.tieneFin && b.columnas === 1 ? ` · ${formatDuration(b.endMin - b.startMin)}` : ""}
                      </Text>
                    ) : null}
                    {lugar ? (
                      <View style={styles.bloqueLugar}>
                        <FontAwesome6 color={tipo.texto} name="location-dot" size={9} />
                        <Text numberOfLines={1} style={[styles.bloqueHora, { color: tipo.texto, flexShrink: 1 }]}>
                          {lugar}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {mostrarAhora ? (
            <View pointerEvents="none" style={[styles.ahora, { top: ((minutosAhora - desde) / 60) * ALTO_HORA }]}>
              <View style={styles.ahoraPunto} />
              <View style={styles.ahoraLinea} />
            </View>
          ) : null}
        </View>
      ) : sinHorario.length === 0 ? (
        <Text style={styles.vacio}>Sin actividades agendadas.</Text>
      ) : null}

      {canEdit && onAdd ? (
        <Pressable accessibilityRole="button" onPress={onAdd} style={styles.agregar} testID="timegrid-add">
          <FontAwesome6 color={colors.primary} name="plus" size={12} />
          <Text style={styles.agregarTexto}>Agregar actividad</Text>
        </Pressable>
      ) : null}
      {canEdit && bloques.length > 0 ? (
        <Text style={styles.ayuda}>Tocá un bloque para editarlo · mantenelo apretado para eliminarlo</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sinHorarioWrap: { marginBottom: spacing.sm, gap: 4 },
  sinHorarioLabel: { ...textStyles.meta, color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  sinHorarioFichas: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  ficha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill ?? 999,
    backgroundColor: colors.surfaceAlt,
  },
  fichaTexto: { ...textStyles.meta, color: colors.primary, fontSize: 12, flexShrink: 1 },
  grilla: { position: "relative", marginTop: 4 },
  fila: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "flex-start" },
  hora: {
    width: ANCHO_HORAS,
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: -6,
  },
  linea: { flex: 1, height: 1, backgroundColor: colors.border },
  carril: { position: "absolute", top: 0, bottom: 0, left: ANCHO_HORAS + 4, right: 0 },
  bloque: { position: "absolute", paddingRight: 3, paddingBottom: 2 },
  bloquePasado: { opacity: 0.55 },
  bloqueInterior: {
    flex: 1,
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    overflow: "hidden",
    gap: 2,
  },
  bloqueIcono: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  aviso: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: 10,
    backgroundColor: "rgba(245,158,11,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.45)",
    gap: 6,
  },
  avisoHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  avisoTitulo: { ...textStyles.bodyStrong, color: "#92400E", fontSize: 12 },
  avisoFila: { flexDirection: "row", alignItems: "center", gap: 8 },
  avisoTexto: { ...textStyles.meta, color: "#78350F", fontSize: 12, flex: 1 },
  avisoHora: { fontWeight: "700" },
  letra: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  letraTexto: { color: "#fff", fontSize: 10, fontWeight: "700" },
  bloqueLugar: { flexDirection: "row", alignItems: "center", gap: 4 },
  etiqueta: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  etiquetaTexto: { color: "#fff", fontSize: 8, fontWeight: "700", letterSpacing: 0.4 },
  bloqueTitulo: { flexDirection: "row", alignItems: "center", gap: 6 },
  bloqueTexto: { ...textStyles.bodyStrong, fontSize: 13, flexShrink: 1, flex: 1 },
  bloqueHora: { ...textStyles.meta, fontSize: 11, opacity: 0.85 },
  ahora: {
    position: "absolute",
    left: ANCHO_HORAS - 4,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    marginTop: -4,
  },
  ahoraPunto: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger || "#FF3B30" },
  ahoraLinea: { flex: 1, height: 1.5, backgroundColor: colors.danger || "#FF3B30" },
  vacio: { ...textStyles.meta, color: colors.textMuted, fontSize: 12, paddingVertical: spacing.xs },
  agregar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 9,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primary,
    borderRadius: radii.md ?? 12,
  },
  agregarTexto: { ...textStyles.bodyStrong, color: colors.primary, fontSize: 13 },
  ayuda: { ...textStyles.meta, color: colors.textMuted, fontSize: 10, textAlign: "center", marginTop: 6 },
});