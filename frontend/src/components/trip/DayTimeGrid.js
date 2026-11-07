import { useMemo } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import useArrastreDia from "../../hooks/useArrastreDia";
import { formatDuration, getActivityTimes, getPlaceName, isTodayISO } from "../../utils/agenda";
import { aHora, aMinutos, calcularHuecosLibres } from "../../utils/huecosLibres";
import { avisoDeTraslado, textoHorario } from "../../utils/traslados";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import { AvisoTraslado } from "./TrasladoCard";
import FotoDestino from "../ui/FotoDestino";

const ALTO_HORA = 68; 
const ALTO_MINIMO_TRASLADO = 58;
const ALTO_TARJETA_VIAJE = 112;
const ULTIMO_MINUTO = 23 * 60 + 59;
const ALTO_MINIMO = 32; 
const ANCHO_HORAS = 38;
const INICIO_SUGERENCIAS = 8 * 60;
const FIN_SUGERENCIAS = 23 * 60;
const PASO_ARRASTRE = 72;
const DEMORA_ARRASTRE_MS = 300;

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

function posicionDeFranja(franja, desde, hasta) {
  const inicio = franja.desde ?? desde;
  const fin = franja.hasta ?? hasta;
  return {
    top: ((inicio - desde) / 60) * ALTO_HORA,
    height: Math.max(0, ((fin - inicio) / 60) * ALTO_HORA),
  };
}

function EtiquetaFranja({ franja, top }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.etiquetaFranja, { top: top + 4 }]}
      testID={`timegrid-etiqueta-${franja.clave}`}
    >
      <FotoDestino uri={franja.destino.foto} tamano={16} radio={8} />
      <Text style={[styles.etiquetaFranjaTexto, { color: franja.destino.color }]}>
        {franja.etiqueta}
      </Text>
    </View>
  );
}

// Traslado entre destinos: la línea del viaje une la salida con la llegada. Si dura poco no
// entra todo, y va en una línea para no tapar lo que sigue.
function TarjetaViajeGrilla({ viaje, alto }) {
  const { item, salida, llegada, duracion, otroDia } = viaje;
  const textoLlegada = otroDia
    ? `llega ${llegada.fecha}, ${llegada.hora}`
    : `llega ${llegada.hora}`;

  if (alto < ALTO_TARJETA_VIAJE) {
    return (
      <View style={[styles.viaje, styles.viajeCompacto]} testID="timegrid-viaje-compacto">
        <View style={styles.viajeTitulo}>
          <FontAwesome6 color={colors.primary} name={item.icon ?? "route"} size={12} />
          <Text numberOfLines={1} style={styles.viajeNombre}>
            {item.title}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.viajeTexto}>
          {`Sale ${salida.hora} · ${textoLlegada}`}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.viaje} testID="timegrid-viaje">
      <View style={styles.viajeTitulo}>
        <FontAwesome6 color={colors.primary} name={item.icon ?? "route"} size={13} />
        <Text numberOfLines={1} style={styles.viajeNombre}>
          {item.title}
        </Text>
      </View>
      <View style={styles.viajeCuerpo}>
        <View style={styles.viajeRiel}>
          <View style={[styles.viajePunto, { backgroundColor: salida.color }]} />
          <LinearGradient
            colors={[salida.color, llegada.color]}
            end={{ x: 0, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.viajeLinea}
          />
          <View style={[styles.viajePunto, { backgroundColor: llegada.color }]} />
        </View>
        <View style={styles.viajeParadas}>
          <Text numberOfLines={1} style={styles.viajeTexto}>
            <Text style={[styles.viajeLugar, { color: salida.color }]}>{salida.nombre}</Text>
            {` · sale ${salida.hora}`}
          </Text>
          {duracion ? <Text style={styles.viajeTexto}>{`${duracion} de viaje`}</Text> : null}
          <Text numberOfLines={1} style={styles.viajeTexto}>
            <Text style={[styles.viajeLugar, { color: llegada.color }]}>{llegada.nombre}</Text>
            {` · ${textoLlegada}`}
          </Text>
        </View>
      </View>
    </View>
  );
}

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

function BloqueActividad({
  bloque,
  desde,
  letra,
  esHoy,
  minutosAhora,
  canEdit,
  onEdit,
  onDelete,
  arrastre,
}) {
  const { item } = bloque;
  const puedeArrastrar = canEdit && Boolean(arrastre) && !item.traslado;
  const { desplazamiento, arrastrando, pasos, panHandlers, alMantener, alSoltar } = useArrastreDia({
    anchoPaso: PASO_ARRASTRE,
    onInicio: () => arrastre?.onInicio?.(),
    onCambio: (nuevos) => arrastre?.onCambio?.(item, nuevos),
    onSoltar: (resultado, movio) => {
      arrastre?.onSoltar?.(item, movio ? resultado : 0);
      if (!movio) onDelete?.(item);
    },
  });

  const top = ((bloque.startMin - desde) / 60) * ALTO_HORA;
  const alto = Math.max(
    ((bloque.endMin - bloque.startMin) / 60) * ALTO_HORA - 2,
    item.traslado ? ALTO_MINIMO_TRASLADO : ALTO_MINIMO
  );
  const ancho = 100 / bloque.columnas;
  const lineasTitulo = Math.max(
    1,
    Math.min(4, Math.floor((alto - 14 - (alto >= 40 ? 15 : 0)) / 16))
  );
  const tipo = tipoDe(item.icon);
  const pasada = esHoy && bloque.endMin <= minutosAhora;
  const enCurso = esHoy && bloque.startMin <= minutosAhora && minutosAhora < bloque.endMin;
  const lugar = alto >= 66 && bloque.columnas === 1 ? getPlaceName(item) : null;
  const destino = arrastrando && arrastre ? arrastre.etiqueta(pasos) : null;

  return (
    <Animated.View
      {...(puedeArrastrar ? panHandlers : {})}
      style={[
        styles.bloque,
        { top, height: alto, left: `${bloque.col * ancho}%`, width: `${ancho}%` },
        pasada && !arrastrando && styles.bloquePasado,
        arrastrando && styles.bloqueArrastrado,
        { transform: [{ translateX: desplazamiento }] },
      ]}
    >
      <Pressable
        accessibilityLabel={`${item.title}, ${bloque.start}${bloque.end ? ` a ${bloque.end}` : ""}${
          item.advertenciaHorario ? `. Advertencia: ${item.advertenciaHorario}` : ""
        }`}
        disabled={!canEdit}
        delayLongPress={puedeArrastrar ? DEMORA_ARRASTRE_MS : undefined}
        onLongPress={canEdit ? (puedeArrastrar ? alMantener : () => onDelete?.(item)) : undefined}
        onPressOut={puedeArrastrar ? alSoltar : undefined}
        onPress={() => onEdit?.(item)}
        style={styles.bloquePresionable}
        testID={`timegrid-block-${item.id}`}
      >
        <View
          style={[
            styles.bloqueInterior,
            { backgroundColor: tipo.fondo, borderLeftColor: tipo.acento },
            enCurso && { borderColor: tipo.acento, borderWidth: 1.5 },
          ]}
        >
          {item.traslado ? (
            <Text
              style={[styles.etiquetaTraslado, { color: tipo.texto }]}
              testID={`timegrid-traslado-${item.id}`}
            >
              TRASLADO
            </Text>
          ) : null}
          <View style={styles.bloqueTitulo}>
            {letra ? (
              <View style={[styles.bloqueIcono, { backgroundColor: tipo.acento }]}>
                <Text style={styles.letraTexto}>{letra}</Text>
              </View>
            ) : (
              <View style={[styles.bloqueIcono, { backgroundColor: tipo.acento }]}>
                <FontAwesome6 color="#fff" name={item.icon ?? "location-dot"} size={9} />
              </View>
            )}
            <Text numberOfLines={lineasTitulo} style={[styles.bloqueTexto, { color: tipo.texto }]}>
              {item.title}
            </Text>
            {item.advertenciaHorario ? (
              <FontAwesome6
                color={colors.warning}
                name="triangle-exclamation"
                size={10}
                testID={`timegrid-schedule-warning-${item.id}`}
              />
            ) : null}
            {enCurso && bloque.columnas === 1 ? (
              <View style={[styles.etiqueta, { backgroundColor: tipo.acento }]}>
                <Text style={styles.etiquetaTexto}>AHORA</Text>
              </View>
            ) : null}
          </View>
          {item.traslado ? (
            <Text numberOfLines={1} style={[styles.bloqueHora, { color: tipo.texto }]}>
              {textoHorario(item.traslado, item.horaInicio, item.horaFin)}
            </Text>
          ) : alto >= 40 ? (
            <Text numberOfLines={1} style={[styles.bloqueHora, { color: tipo.texto }]}>
              {bloque.start}
              {bloque.tieneFin ? ` – ${bloque.end}` : ""}
              {bloque.tieneFin && bloque.columnas === 1 ? ` · ${formatDuration(bloque.endMin - bloque.startMin)}` : ""}
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
      {destino ? (
        <View
          pointerEvents="none"
          style={[styles.destino, destino.valido ? styles.destinoValido : styles.destinoInvalido]}
          testID={`timegrid-destino-${item.id}`}
        >
          <FontAwesome6
            color={colors.textInverse}
            name={destino.valido ? "calendar-day" : "ban"}
            size={10}
          />
          <Text numberOfLines={1} style={styles.destinoTexto}>
            {destino.texto}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}


export default function DayTimeGrid({
  actividades = [],
  fecha,
  canEdit = false,
  onAdd,
  onEdit,
  onDelete,
  onSuggestGap,
  // Tinte y etiqueta de cada franja horaria según el destino (US 138).
  franjas = null,
  // Traslado entre destinos del día, que se dibuja como tarjeta del viaje.
  viaje = null,
  arrastre,
}) {
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
      // Si llega otro día, el viaje ocupa hasta el final del día de salida.
      const fin = viaje?.item === item && viaje.otroDia ? ULTIMO_MINUTO : endMin ?? startMin + 45;
      conHorario.push({ item, startMin, endMin: fin, start, end, tieneFin: endMin != null });
    });

    if (!conHorario.length) return { bloques: [], sinHorario: sin, desde: 0, hasta: 0 };

    const minInicio = Math.min(...conHorario.map((b) => b.startMin));
    const maxFin = Math.max(...conHorario.map((b) => b.endMin));
    const d = Math.max(0, Math.floor(minInicio / 60) - 1) * 60;
    const h = Math.min(24, Math.ceil(maxFin / 60) + 1) * 60;
    return { bloques: acomodar(conHorario), sinHorario: sin, desde: d, hasta: h };
  }, [actividades, viaje]);

  const ahora = new Date();
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const mostrarAhora = esHoy && minutosAhora >= desde && minutosAhora <= hasta;

  const puedeSugerir = canEdit && typeof onSuggestGap === "function";
  const huecos = useMemo(() => {
    if (!puedeSugerir || !bloques.length) return [];
    const inicio = Math.max(desde, INICIO_SUGERENCIAS);
    const fin = Math.min(hasta, FIN_SUGERENCIAS);
    if (fin <= inicio) return [];
    return calcularHuecosLibres(
      bloques.map((b) => ({ horaInicio: aHora(b.startMin), horaFin: aHora(b.endMin) })),
      { inicioDia: aHora(inicio), finDia: aHora(fin) }
    ).filter((h) => !(esHoy && aMinutos(h.hasta) <= minutosAhora));
  }, [puedeSugerir, bloques, desde, hasta, esHoy, minutosAhora]);

  const enConflicto = bloques
    .filter((b) => b.columnas > 1)
    .sort((a, b) => a.startMin - b.startMin || a.col - b.col);
  const letraDe = {};
  enConflicto.forEach((b, i) => {
    letraDe[b.item.id] = String.fromCharCode(65 + (i % 26));
  });

  const horas = [];
  for (let m = desde; m < hasta; m += 60) horas.push(m);

  const puedeArrastrar = canEdit && Boolean(arrastre);

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

      {bloques
        .filter((b) => avisoDeTraslado(b.item.traslado))
        .map((b) => (
          <Pressable
            key={`traslado-aviso-${b.item.id}`}
            accessibilityLabel={`Editar ${b.item.title}`}
            disabled={!canEdit}
            onLongPress={canEdit ? () => onDelete?.(b.item) : undefined}
            onPress={() => onEdit?.(b.item)}
          >
            <Text numberOfLines={1} style={styles.trasladoAvisoNombre}>
              {b.item.title}
            </Text>
            <AvisoTraslado traslado={b.item.traslado} testID={`timegrid-traslado-aviso-${b.item.id}`} />
          </Pressable>
        ))}

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
                    {b.tieneFin ? ` – ${b.end}` : ""}
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
          {(franjas ?? []).map((franja) => (
            <View
              key={franja.clave}
              pointerEvents="none"
              style={[
                styles.franja,
                posicionDeFranja(franja, desde, hasta),
                { backgroundColor: franja.destino.tinte },
              ]}
              testID={`timegrid-franja-${franja.clave}`}
            />
          ))}

          {horas.map((m) => (
            <View key={m} style={[styles.fila, { top: ((m - desde) / 60) * ALTO_HORA }]}>
              <Text style={styles.hora}>{String(m / 60).padStart(2, "0")}:00</Text>
              <View style={styles.linea} />
            </View>
          ))}

          <View style={styles.carril}>
            {huecos.map((h) => {
              const inicio = aMinutos(h.desde);
              const fin = aMinutos(h.hasta);
              const top = ((inicio - desde) / 60) * ALTO_HORA + 2;
              const alto = ((fin - inicio) / 60) * ALTO_HORA - 6;
              return (
                <Pressable
                  key={`hueco-${h.desde}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Libre de ${h.desde} a ${h.hasta}. Sugerir actividades con IA`}
                  onPress={() => onSuggestGap(h.desde, h.hasta)}
                  style={({ pressed }) => [
                    styles.hueco,
                    { top, height: alto },
                    pressed && styles.huecoPresionado,
                  ]}
                  testID={`timegrid-gap-${h.desde}`}
                >
                  <FontAwesome6 color={colors.primary} name="wand-magic-sparkles" size={11} />
                  <Text style={styles.huecoTexto}>
                    {formatDuration(fin - inicio)} libres · Sugerir
                  </Text>
                </Pressable>
              );
            })}

            {bloques.map((b) => {
              if (viaje?.item === b.item) {
                const top = ((b.startMin - desde) / 60) * ALTO_HORA;
                const alto = Math.max(
                  ((b.endMin - b.startMin) / 60) * ALTO_HORA - 2,
                  b.item.traslado ? ALTO_MINIMO_TRASLADO : ALTO_MINIMO
                );
                const ancho = 100 / b.columnas;
                return (
                  <Pressable
                    key={b.item.id}
                    accessibilityLabel={`${b.item.title}, sale ${viaje.salida.hora}, llega ${viaje.llegada.hora}`}
                    disabled={!canEdit}
                    onLongPress={canEdit ? () => onDelete?.(b.item) : undefined}
                    onPress={() => onEdit?.(b.item)}
                    style={[
                      styles.bloque,
                      { top, height: alto, left: `${b.col * ancho}%`, width: `${ancho}%` },
                    ]}
                    testID={`timegrid-block-${b.item.id}`}
                  >
                    <TarjetaViajeGrilla alto={alto} viaje={viaje} />
                  </Pressable>
                );
              }
              return (
                <BloqueActividad
                  key={b.item.id}
                  bloque={b}
                  desde={desde}
                  letra={letraDe[b.item.id]}
                  esHoy={esHoy}
                  minutosAhora={minutosAhora}
                  canEdit={canEdit}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  arrastre={arrastre}
                />
              );
            })}
          </View>

          {(franjas ?? [])
            .filter((franja) => franja.etiqueta)
            .map((franja) => (
              <EtiquetaFranja
                key={franja.clave}
                franja={franja}
                top={posicionDeFranja(franja, desde, hasta).top}
              />
            ))}

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
        <Text style={styles.ayuda}>
          {puedeArrastrar
            ? "Tocá un bloque para editarlo · mantenelo apretado para eliminarlo o deslizalo hacia un costado para cambiarlo de día"
            : "Tocá un bloque para editarlo · mantenelo apretado para eliminarlo"}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  franja: {
    position: "absolute",
    left: -spacing.md,
    right: -spacing.md,
  },
  etiquetaFranja: {
    position: "absolute",
    left: ANCHO_HORAS,
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  etiquetaFranjaTexto: {
    ...textStyles.meta,
    fontSize: 11,
    fontWeight: "700",
  },
  viaje: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  viajeCompacto: {
    gap: 2,
    paddingVertical: 6,
  },
  viajeTitulo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  viajeNombre: {
    ...textStyles.bodyStrong,
    flexShrink: 1,
    fontSize: 14,
    color: colors.primary,
  },
  viajeCuerpo: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
  },
  viajeRiel: {
    width: 10,
    alignItems: "center",
  },
  viajePunto: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  viajeLinea: {
    flex: 1,
    width: 3,
  },
  viajeParadas: {
    flex: 1,
    minWidth: 0,
    justifyContent: "space-between",
  },
  viajeTexto: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
  },
  viajeLugar: {
    fontWeight: "700",
  },
  etiquetaTraslado: {
    ...textStyles.meta,
    fontWeight: "700",
    fontSize: 8,
    letterSpacing: 0.4,
  },
  trasladoAvisoNombre: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
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
  hueco: {
    position: "absolute",
    left: 0,
    right: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accentStrong,
    backgroundColor: colors.accentMuted,
  },
  huecoPresionado: { opacity: 0.75 },
  huecoTexto: { ...textStyles.meta, color: colors.primary, fontSize: 12, fontWeight: "700" },
  bloque: { position: "absolute", paddingRight: 3, paddingBottom: 2 },
  bloquePresionable: { flex: 1 },
  bloquePasado: { opacity: 0.55 },
  bloqueArrastrado: { zIndex: 20, elevation: 20, opacity: 0.95 },
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
  destino: {
    position: "absolute",
    top: -26,
    left: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill ?? 999,
  },
  destinoValido: { backgroundColor: colors.primary },
  destinoInvalido: { backgroundColor: colors.textMuted },
  destinoTexto: { color: colors.textInverse, fontSize: 11, fontWeight: "700" },
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