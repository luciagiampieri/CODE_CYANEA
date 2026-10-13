import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import ActivitySuggestionCard from "../components/trip/ActivitySuggestionCard";
import PrimaryButton from "../components/ui/PrimaryButton";
import { getActivitySuggestionsContext, requestActivitySuggestions } from "../services/api";
import { colors, radii, spacing, textStyles } from "../theme/tokens";
import PlanningPreferencesScreen from "./PlanningPreferencesScreen";

const DURACION_MINIMA_MINUTOS = 60;

const FRANJAS_RAPIDAS = [
  { id: "manana", label: "Mañana", inicio: "09:00", fin: "13:00" },
  { id: "tarde", label: "Tarde", inicio: "14:00", fin: "18:00" },
  { id: "noche", label: "Noche", inicio: "19:00", fin: "23:00" },
];

const DISTANCIAS = [
  { km: 5, label: "Cerca · 5 km" },
  { km: 15, label: "Normal · 15 km" },
  { km: 30, label: "Más lejos · 30 km" },
];


const MENSAJES_PROGRESO = [
  "Analizando las preferencias del grupo…",
  "Buscando actividades para tu franja…",
  "Validando lugares y direcciones…",
  "Ajustando horarios y costos…",
];

const ERRORES_DE_IA = ["AI_UNAVAILABLE", "AI_TIMEOUT", "AI_RATE_LIMITED", "AI_INVALID_RESPONSE"];


export function normalizarHora(texto) {
  const match = String(texto ?? "").trim().match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = match[2] ? Number(match[2]) : 0;
  if (horas > 23 || minutos > 59) return null;
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

function aMinutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function validarFranja(inicioTexto, finTexto) {
  const inicio = normalizarHora(inicioTexto);
  const fin = normalizarHora(finTexto);
  if (!inicio) return { error: "Ingresá una hora de inicio válida (por ejemplo 09:30)." };
  if (!fin) return { error: "Ingresá una hora de fin válida (por ejemplo 13:00)." };
  if (aMinutos(fin) <= aMinutos(inicio)) {
    return { error: "La hora de fin debe ser posterior a la hora de inicio." };
  }
  if (aMinutos(fin) - aMinutos(inicio) < DURACION_MINIMA_MINUTOS) {
    return { error: "La franja debe durar al menos una hora." };
  }
  return { inicio, fin, error: null };
}

function hoyIso() {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

export default function ActivitySuggestionsScreen({
  visible,
  onClose,
  tripId,
  tripTitle,
  dias,
  initialDayId,
  onGenerado,
  onCrearManual,
}) {
  const [dayId, setDayId] = useState(null);
  const [inicioTexto, setInicioTexto] = useState("10:00");
  const [finTexto, setFinTexto] = useState("13:00");
  const [contexto, setContexto] = useState(null);
  const [indicacion, setIndicacion] = useState(""); 
  const [distanciaKm, setDistanciaKm] = useState(15);
  const [diaAbierto, setDiaAbierto] = useState(false);
  const listaDiasRef = useRef(null);
  const [cargandoContexto, setCargandoContexto] = useState(false);
  const [fase, setFase] = useState("formulario"); 
  const [sugerencias, setSugerencias] = useState([]);
  const [mensajeVacio, setMensajeVacio] = useState("");
  const [errorInfo, setErrorInfo] = useState(null);
  const [sinPreferencias, setSinPreferencias] = useState(false);
  const [restantes, setRestantes] = useState(null);
  const [pasoProgreso, setPasoProgreso] = useState(0);
  const [mostrarPreferencias, setMostrarPreferencias] = useState(false);

  const diasValidos = useMemo(
    () => (dias ?? []).filter((dia) => Number.isInteger(dia.dayId)),
    [dias]
  );
  const hoy = hoyIso();
  const franja = validarFranja(inicioTexto, finTexto);

  async function cargarContexto() {
    if (!tripId) return;
    setCargandoContexto(true);
    try {
      const data = await getActivitySuggestionsContext(tripId);
      setContexto(data);
      setRestantes(data.SolicitudesRestantes);
      setSinPreferencias(data.ParticipantesConPreferencias === 0);
    } catch {
      setContexto(null);
    } finally {
      setCargandoContexto(false);
    }
  }

  useEffect(() => {
    if (!visible) return;
    setFase("formulario");
    setSugerencias([]);
    setErrorInfo(null);
    setMensajeVacio("");
    setIndicacion("");
    setDistanciaKm(15);
    setDiaAbierto(false)
    setDayId(initialDayId ?? diasValidos[0]?.dayId ?? null);
    cargarContexto();
  }, [visible, tripId]);


  useEffect(() => {
    if (visible && initialDayId != null) setDayId(initialDayId);
  }, [initialDayId]);

  useEffect(() => {
    if (fase !== "cargando") return undefined;
    setPasoProgreso(0);
    const intervalo = setInterval(
      () => setPasoProgreso((paso) => (paso + 1) % MENSAJES_PROGRESO.length),
      4000
    );
    return () => clearInterval(intervalo);
  }, [fase]);

  async function generar(continuarSinPreferencias = false) {
    if (fase === "cargando" || !franja.inicio || dayId == null) return;
    setFase("cargando");
    setErrorInfo(null);
    try {
      const resultado = await requestActivitySuggestions(tripId, {
        IdDiaCronograma: dayId,
        HoraInicio: franja.inicio,
        HoraFin: franja.fin,
        ContinuarSinPreferencias: continuarSinPreferencias || sinPreferencias,
        Indicacion: indicacion.trim() || null, 
        DistanciaMaximaKm: distanciaKm,
      });
      setRestantes(resultado.SolicitudesRestantes);
      onGenerado?.(resultado);
      if (!resultado.Sugerencias?.length) {
        setMensajeVacio(
          resultado.Mensaje ||
            "No se encontraron opciones para esa franja. Probá ampliando la franja horaria o buscar más lejos."
        );
        setFase("vacio");
        return;
      }
      setSugerencias(resultado.Sugerencias);
      setFase("resultados");
    } catch (error) {
      if (error?.code === "NO_PREFERENCES") {
        setSinPreferencias(true);
        setFase("formulario");
        return;
      }
      setErrorInfo({ message: error?.message || "No se pudieron generar las sugerencias.", code: error?.code });
      setFase("error");
      cargarContexto();
    }
  }

  function aplicarFranjaRapida(opcion) {
    setInicioTexto(opcion.inicio);
    setFinTexto(opcion.fin);
  }

  const limiteAlcanzado = restantes != null && restantes <= 0;
  const solicitudDeshabilitada =
    !franja.inicio || dayId == null || limiteAlcanzado || contexto?.PuedeSolicitar === false;

  function renderFormulario() {
    return (
      <View style={styles.content}>
        <Text style={styles.intro}>
          El asistente propone actividades para tu franja libre según los intereses, el ritmo y el
          presupuesto del grupo. Quedan como pendientes y las ve todo el viaje.
        </Text>

        <Text style={styles.label}>Día</Text>
        {(() => {
          const indice = diasValidos.findIndex((item) => item.dayId === dayId);
          const dia = diasValidos[indice];
          return (
            <View>
              <Pressable
                onPress={() => setDiaAbierto((abierto) => !abierto)}
                style={[styles.diaSelect, diaAbierto && styles.diaSelectAbierto]}
                accessibilityRole="button"
                accessibilityState={{ expanded: diaAbierto }}
                testID="suggestions-dia-select"
              >
                <Text style={styles.diaTitulo}>
                  {dia ? `Día ${dia.dayIndex} · ${dia.dayDateTextCorta || dia.dayDateText}` : "Elegí un día"}
                </Text>
                <FontAwesome6
                  name={diaAbierto ? "chevron-up" : "chevron-down"}
                  size={13}
                  color={colors.primary}
                />
              </Pressable>

              {diaAbierto ? (
                <View style={styles.diaLista}>
                  <ScrollView
                    ref={listaDiasRef}
                    nestedScrollEnabled
                    style={styles.diaListaScroll}
                    onLayout={() =>
                      listaDiasRef.current?.scrollTo({
                        y: Math.max(0, indice * 44 - 88),
                        animated: false,
                      })
                    }
                  >
                    {diasValidos.map((item) => {
                      const activo = item.dayId === dayId;
                      const pasado = item.fechaRaw && String(item.fechaRaw).slice(0, 10) < hoy;
                      return (
                        <Pressable
                          key={item.dayId}
                          disabled={pasado}
                          onPress={() => {
                            setDayId(item.dayId);
                            setDiaAbierto(false);
                          }}
                          style={[
                            styles.diaOpcion,
                            activo && styles.diaOpcionActiva,
                            pasado && styles.chipDisabled,
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: activo, disabled: pasado }}
                        >
                          <Text style={[styles.diaOpcionTexto, activo && styles.diaOpcionTextoActivo]}>
                            Día {item.dayIndex} · {item.dayDateTextCorta || item.dayDateText}
                          </Text>
                          {activo ? (
                            <FontAwesome6 name="check" size={12} color={colors.textInverse} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          );
        })()}

        <Text style={styles.label}>Franja horaria</Text>
        <View style={styles.chipsRow}>
          {FRANJAS_RAPIDAS.map((opcion) => {
            const activo =
              normalizarHora(inicioTexto) === opcion.inicio &&
              normalizarHora(finTexto) === opcion.fin;
            return (
              <Pressable
                key={opcion.id}
                onPress={() => aplicarFranjaRapida(opcion)}
                style={[styles.chip, activo && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                testID={`suggestions-franja-${opcion.id}`}
              >
                <Text style={[styles.chipText, activo && styles.chipTextActive]}>
                  {opcion.label} {opcion.inicio}–{opcion.fin}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.horasRow}>
          <View style={styles.horaCol}>
            <Text style={styles.hint}>Desde</Text>
            <TextInput
              style={styles.horaInput}
              value={inicioTexto}
              onChangeText={setInicioTexto}
              onBlur={() => setInicioTexto(normalizarHora(inicioTexto) ?? inicioTexto)}
              keyboardType="numbers-and-punctuation"
              placeholder="10:00"
              placeholderTextColor={colors.overlay}
              maxLength={5}
              testID="suggestions-hora-inicio"
            />
          </View>
          <FontAwesome6 name="arrow-right" size={12} color={colors.textMuted} style={styles.flecha} />
          <View style={styles.horaCol}>
            <Text style={styles.hint}>Hasta</Text>
            <TextInput
              style={styles.horaInput}
              value={finTexto}
              onChangeText={setFinTexto}
              onBlur={() => setFinTexto(normalizarHora(finTexto) ?? finTexto)}
              keyboardType="numbers-and-punctuation"
              placeholder="13:00"
              placeholderTextColor={colors.overlay}
              maxLength={5}
              testID="suggestions-hora-fin"
            />
          </View>
        </View>
        {franja.error ? <Text style={styles.error}>{franja.error}</Text> : null}
        <Text style={styles.label}>Distancia máxima</Text>
        <View style={styles.chipsRow}>
          {DISTANCIAS.map((opcion) => {
            const activo = opcion.km === distanciaKm;
            return (
              <Pressable
                key={opcion.km}
                onPress={() => setDistanciaKm(opcion.km)}
                style={[styles.chip, activo && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                testID={`suggestions-distancia-${opcion.km}`}
              >
                <Text style={[styles.chipText, activo && styles.chipTextActive]}>
                  {opcion.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { marginTop: spacing.xs }]}>
          Desde tus actividades del día o el destino.
        </Text>
        <Text style={styles.label}>Indicación para esta búsqueda (opcional)</Text>
        <TextInput
          style={styles.indicacionInput}
          value={indicacion}
          onChangeText={setIndicacion}
          multiline
          maxLength={300}
          placeholder="Ej: que sea bajo techo, sin mucha caminata…"
          placeholderTextColor={colors.overlay}
          textAlignVertical="top"
          testID="suggestions-indicacion"
        />
        <View style={styles.indicacionFooter}>
          <Text style={styles.contadorIndicacion}>No incluyas datos personales.</Text>
          <Text style={styles.contadorIndicacion}>{indicacion.length}/300</Text>
        </View>

        {cargandoContexto ? (
          <ActivityIndicator color={colors.primary} style={styles.contextLoader} />
        ) : contexto ? (
          <View style={styles.infoBox}>
            <FontAwesome6 name="users" size={12} color={colors.primary} />
            <Text style={styles.infoText}>
              {contexto.ParticipantesConPreferencias} de {contexto.ParticipantesTotal} participantes
              configuraron sus preferencias.
            </Text>
          </View>
        ) : null}

        {contexto && !contexto.MisPreferenciasConfiguradas ? (
          <Pressable style={styles.linkRow} onPress={() => setMostrarPreferencias(true)}>
            <FontAwesome6 name="sliders" size={12} color={colors.primary} />
            <Text style={styles.linkText}>Configurar mis preferencias para este viaje</Text>
          </Pressable>
        ) : null}

        {sinPreferencias ? (
          <View style={styles.aviso} testID="suggestions-sin-preferencias">
            <FontAwesome6 name="circle-info" size={12} color={colors.warning} />
            <Text style={styles.avisoTexto}>
              Ningún participante configuró sus preferencias. Si continuás, el asistente usará
              criterios generales.
            </Text>
          </View>
        ) : null}

        {restantes != null ? (
          <Text style={[styles.contador, limiteAlcanzado && styles.error]}>
            {limiteAlcanzado
              ? `Alcanzaste el límite de ${contexto?.LimiteDiario ?? ""} solicitudes de hoy para este viaje.`
              : `Te quedan ${restantes} ${restantes === 1 ? "solicitud" : "solicitudes"} hoy en este viaje.`}
          </Text>
        ) : null}

        <PrimaryButton
          label={sinPreferencias ? "Continuar con criterios generales" : "Generar sugerencias"}
          icon="wand-magic-sparkles"
          iconPosition="left"
          disabled={solicitudDeshabilitada}
          onPress={() => generar(sinPreferencias)}
          style={styles.submitButton}
          testID="suggestions-generar"
        />
      </View>
    );
  }

  function renderCargando() {
    return (
      <View style={styles.centrado} testID="suggestions-loading">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.progresoTexto}>{MENSAJES_PROGRESO[pasoProgreso]}</Text>
        <Text style={styles.hint}>Puede demorar hasta 30 segundos.</Text>
      </View>
    );
  }

  function renderResultados() {
    return (
      <View style={styles.content}>
        <Text style={styles.intro}>
          {sugerencias.length === 1 ? "Esta es la sugerencia para tu franja." : `Estas son las ${sugerencias.length} sugerencias para tu franja.`}{" "}
          Quedaron pendientes y las ven todos los participantes.
        </Text>
        <View style={styles.listaCards}>
          {sugerencias.map((sugerencia) => (
            <ActivitySuggestionCard key={sugerencia.IdSugerenciaActividad} sugerencia={sugerencia} />
          ))}
        </View>
        {restantes != null ? (
          <Text style={styles.contador}>
            Te quedan {restantes} {restantes === 1 ? "solicitud" : "solicitudes"} hoy.
          </Text>
        ) : null}
        <PrimaryButton label="Listo" onPress={onClose} style={styles.submitButton} />
      </View>
    );
  }

  function renderVacio() {
    return (
      <View style={styles.centrado} testID="suggestions-empty">
        <FontAwesome6 name="magnifying-glass" size={22} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>No encontramos opciones</Text>
        <Text style={styles.emptyText}>{mensajeVacio}</Text>
        <PrimaryButton
          label="Cambiar la franja"
          onPress={() => setFase("formulario")}
          style={styles.submitButton}
        />
      </View>
    );
  }

  function renderError() {
    const esErrorDeIA = ERRORES_DE_IA.includes(errorInfo?.code);
    return (
      <View style={styles.centrado} testID="suggestions-error">
        <FontAwesome6 name="circle-exclamation" size={22} color={colors.danger} />
        <Text style={styles.emptyTitle}>No se pudieron generar las sugerencias</Text>
        <Text style={styles.emptyText}>{errorInfo?.message}</Text>
        {esErrorDeIA ? (
          <PrimaryButton
            label="Crear actividad manualmente"
            icon="plus"
            iconPosition="left"
            onPress={() => onCrearManual?.(dayId)}
            style={styles.submitButton}
          />
        ) : null}
        <Pressable onPress={() => setFase("formulario")} style={styles.linkRow}>
          <Text style={styles.linkText}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  function renderContenido() {
    if (fase === "cargando") return renderCargando();
    if (fase === "resultados") return renderResultados();
    if (fase === "vacio") return renderVacio();
    if (fase === "error") return renderError();
    return renderFormulario();
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.headerRow}>
              <View style={styles.headerTexts}>
                <Text style={styles.title}>Sugerencias con IA</Text>
                {tripTitle ? (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {tripTitle}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={onClose} testID="close-suggestions-modal">
                <FontAwesome6 name="xmark" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {renderContenido()}
          </ScrollView>

          <PlanningPreferencesScreen
            visible={mostrarPreferencias}
            tripId={tripId}
            tripTitle={tripTitle}
            onClose={() => setMostrarPreferencias(false)}
            onGuardado={cargarContexto}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  indicacionInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    color: colors.textPrimary,
    ...textStyles.body,
  },
  contadorIndicacion: {
    ...textStyles.meta,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  indicacionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayStrong,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    maxHeight: "92%",
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  headerTexts: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  subtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  content: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  centrado: {
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  intro: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  label: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.primary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  hint: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.textInverse,
  },
  horasRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  horaCol: {
    flex: 1,
  },
  flecha: {
    marginBottom: 18,
  },
  horaInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    textAlign: "center",
    ...textStyles.bodyStrong,
  },
  contextLoader: {
    marginTop: spacing.md,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
  },
  infoText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    flex: 1,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  linkText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
  },
  aviso: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.warningSurface,
  },
  avisoTexto: {
    ...textStyles.meta,
    color: colors.warning,
    flex: 1,
  },
  contador: {
    ...textStyles.meta,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  error: {
    ...textStyles.meta,
    color: colors.danger,
    marginTop: spacing.xs,
    fontWeight: "600",
  },
  submitButton: {
    marginTop: spacing.lg,
  },
  progresoTexto: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  listaCards: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  emptyTitle: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
  },
  diaSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  diaSelectAbierto: {
    borderColor: colors.primary,
  },
  diaLista: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  diaListaScroll: {
    maxHeight: 220,
  },
  diaOpcion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  diaOpcionActiva: {
    backgroundColor: colors.primary,
  },
  diaOpcionTexto: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  diaOpcionTextoActivo: {
    color: colors.textInverse,
    fontWeight: "700",
  },
});