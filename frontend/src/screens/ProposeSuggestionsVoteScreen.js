import DateTimePicker from "@react-native-community/datetimepicker";
import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Modal from "../components/ui/AppModal";
import DatePickerModal from "../components/ui/DatePickerModal";
import PrimaryButton from "../components/ui/PrimaryButton";
import WebPickerOverlay from "../components/ui/WebPickerOverlay";
import { createVotacionDesdeSugerencias } from "../services/api";
import { colors, radii, spacing, textStyles } from "../theme/tokens";
import { getTodayIso, parseYMD, toYMD } from "../utils/dates";

const LARGO_MAXIMO_TITULO = 150;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function hhmm(valor) {
  return String(valor ?? "").slice(0, 5);
}

function pad(numero) {
  return String(Math.abs(numero)).padStart(2, "0");
}

function esFechaValida(fecha) {
  return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}

function partesFecha(fechaRaw) {
  const [y, m, d] = String(fechaRaw ?? "").slice(0, 10).split("-").map(Number);
  return y && m && d ? { y, m, d } : null;
}

export function inicioDeFranja(fechaRaw, hora) {
  const fecha = partesFecha(fechaRaw);
  const [h, mi] = hhmm(hora).split(":").map(Number);
  if (!fecha || !Number.isFinite(h) || !Number.isFinite(mi)) return null;
  const inicio = new Date(fecha.y, fecha.m - 1, fecha.d, h, mi, 0, 0);
  return esFechaValida(inicio) ? inicio : null;
}

export function tituloPredefinido(fechaRaw, franja) {
  const rango = franja ? `de ${franja.inicio} a ${franja.fin}` : "";
  const fecha = partesFecha(fechaRaw);
  if (!fecha) return `¿Qué hacemos ${rango}?`.replace(/\s+\?/, "?");
  const diaSemana = DIAS[new Date(fecha.y, fecha.m - 1, fecha.d, 12).getDay()];
  return `¿Qué hacemos el ${diaSemana} ${fecha.d} de ${MESES[fecha.m - 1]} ${rango}?`;
}

export function cierrePorDefecto(inicio, ahora = new Date()) {
  if (!esFechaValida(inicio)) return null;
  const margen = inicio.getTime() - ahora.getTime();
  if (margen <= 60 * 1000) return null;
  const unaHoraAntes = new Date(inicio.getTime() - 60 * 60 * 1000);
  if (unaHoraAntes.getTime() - ahora.getTime() >= 5 * 60 * 1000) return unaHoraAntes;
  const mitad = new Date(ahora.getTime() + margen / 2);
  mitad.setSeconds(0, 0);
  return mitad > ahora ? mitad : null;
}

export function toISOConOffset(fecha) {
  const offset = -fecha.getTimezoneOffset();
  const signo = offset >= 0 ? "+" : "-";
  return (
    `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}` +
    `T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:00` +
    `${signo}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  );
}

function textoCosto(sugerencia) {
  const costo = Number(sugerencia.CostoEstimadoARS ?? 0);
  return costo > 0
    ? `ARS $ ${Math.round(costo).toLocaleString("es-AR")} por persona`
    : "Gratis";
}

function textoFechaCorta(fecha) {
  if (!esFechaValida(fecha)) return "";
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(fecha);
}

export default function ProposeSuggestionsVoteScreen({
  visible,
  onClose,
  tripId,
  dia,
  franja,
  sugerencias = [],
  onCreada,
}) {
  const inicio = useMemo(
    () => inicioDeFranja(dia?.fechaRaw, franja?.inicio),
    [dia?.fechaRaw, franja?.inicio]
  );

  const [titulo, setTitulo] = useState("");
  const [tituloEditado, setTituloEditado] = useState(false);
  const [fechaCierre, setFechaCierre] = useState(null);
  const [intentoEnviar, setIntentoEnviar] = useState(false);
  const [errorServidor, setErrorServidor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [mostrarSelectorHora, setMostrarSelectorHora] = useState(false);
  const [horaTemporal, setHoraTemporal] = useState(new Date());

  useEffect(() => {
    if (!visible) return;
    setTitulo(tituloPredefinido(dia?.fechaRaw, franja));
    setTituloEditado(false);
    setFechaCierre(cierrePorDefecto(inicio));
    setIntentoEnviar(false);
    setErrorServidor("");
    setGuardando(false);
  }, [visible]);

  if (!visible || !franja) return null;

  const errorTitulo = !titulo.trim() ? "El título es obligatorio." : null;
  let errorCierre = null;
  if (!esFechaValida(fechaCierre)) {
    errorCierre = "La franja ya empezó o está por empezar: no queda tiempo para votar.";
  } else if (fechaCierre <= new Date()) {
    errorCierre = "La fecha y hora de cierre tiene que ser posterior a ahora.";
  } else if (inicio && fechaCierre >= inicio) {
    errorCierre = `La votación tiene que cerrar antes de las ${franja.inicio} del ${textoFechaCorta(inicio)}.`;
  }

  const base = esFechaValida(fechaCierre) ? fechaCierre : new Date();
  const horaTexto = `${pad(base.getHours())}:${pad(base.getMinutes())}`;
  const fechaTexto = esFechaValida(fechaCierre) ? textoFechaCorta(fechaCierre) : "Elegí una fecha";

  function cambiarFecha(ymd) {
    if (!ymd) return;
    const [year, month, day] = ymd.split("-").map(Number);
    if (!year || !month || !day) return;
    const nueva = new Date(base);
    nueva.setFullYear(year, month - 1, day);
    nueva.setSeconds(0, 0);
    if (esFechaValida(nueva)) setFechaCierre(nueva);
  }

  function cambiarHora(horas, minutos) {
    if (!Number.isFinite(horas) || !Number.isFinite(minutos)) return;
    const nueva = new Date(base);
    nueva.setHours(horas, minutos, 0, 0);
    if (esFechaValida(nueva)) setFechaCierre(nueva);
  }

  function handleTimeChange(event, seleccionada) {
    if (Platform.OS === "android") {
      setMostrarSelectorHora(false);
      if (event.type === "set" && seleccionada) {
        cambiarHora(seleccionada.getHours(), seleccionada.getMinutes());
      }
      return;
    }
    if (seleccionada) setHoraTemporal(seleccionada);
  }

  async function crear() {
    setIntentoEnviar(true);
    if (errorTitulo || errorCierre || guardando) return;
    try {
      setGuardando(true);
      setErrorServidor("");
      const votacion = await createVotacionDesdeSugerencias({
        idViaje: tripId,
        idsSugerencias: sugerencias.map((s) => s.IdSugerenciaActividad),
        nombre: tituloEditado ? titulo.trim() : null,
        fechaCierre: toISOConOffset(fechaCierre),
      });
      onCreada?.(votacion);
    } catch (error) {
      setErrorServidor(error.message || "No se pudo crear la votación.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.headerRow}>
              <View style={styles.headerTexts}>
                <Text style={styles.title}>Proponer a votación</Text>
                <Text style={styles.subtitle}>
                  Día {dia?.dayIndex} · {franja.inicio} – {franja.fin}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Cerrar"
                onPress={onClose}
                style={styles.closeButton}
                testID="cerrar-propuesta-votacion"
              >
                <FontAwesome6 name="xmark" size={16} color={colors.primary} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.intro}>
                Se va a crear una votación de opción única con {sugerencias.length} propuestas.
                Mientras esté abierta, estas sugerencias no se pueden aceptar ni descartar por
                separado.
              </Text>

              <View style={styles.seccion}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Título</Text>
                  <Text style={styles.hint}>
                    {titulo.length}/{LARGO_MAXIMO_TITULO}
                  </Text>
                </View>
                <TextInput
                  style={[styles.input, intentoEnviar && errorTitulo && styles.inputError]}
                  value={titulo}
                  onChangeText={(valor) => {
                    setTitulo(valor);
                    setTituloEditado(true);
                  }}
                  maxLength={LARGO_MAXIMO_TITULO}
                  placeholder="¿Qué hacemos en esta franja?"
                  placeholderTextColor={colors.textMuted}
                  testID="propuesta-votacion-titulo"
                />
                {intentoEnviar && errorTitulo ? (
                  <Text style={styles.error}>{errorTitulo}</Text>
                ) : null}
              </View>

              <View style={styles.seccion}>
                <Text style={styles.label}>Propuestas</Text>
                {sugerencias.map((sugerencia, indice) => (
                  <View key={sugerencia.IdSugerenciaActividad} style={styles.propuesta}>
                    <View style={styles.propuestaIndice}>
                      <Text style={styles.propuestaIndiceTexto}>{indice + 1}</Text>
                    </View>
                    <View style={styles.propuestaTextos}>
                      <Text style={styles.propuestaNombre}>{sugerencia.Nombre}</Text>
                      <View style={styles.propuestaFila}>
                        <FontAwesome6 name="location-dot" size={11} color={colors.textMuted} />
                        <Text style={styles.propuestaDato} numberOfLines={1}>
                          {sugerencia.LugarNombre}
                        </Text>
                      </View>
                      <View style={styles.propuestaFila}>
                        <FontAwesome6 name="clock" size={11} color={colors.textMuted} />
                        <Text style={styles.propuestaDato}>
                          {hhmm(sugerencia.HoraInicio)} – {hhmm(sugerencia.HoraFin)}
                        </Text>
                      </View>
                      <View style={styles.propuestaFila}>
                        <FontAwesome6 name="tag" size={11} color={colors.textMuted} />
                        <Text style={styles.propuestaDato}>{textoCosto(sugerencia)}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.seccion}>
                <Text style={styles.label}>Cierre de la votación</Text>
                <View style={[styles.cierreBox, errorCierre && styles.inputError]}>
                  {Platform.OS === "web" ? (
                    <>
                      <View style={styles.cierreParteFecha}>
                        <FontAwesome6 name="calendar" size={14} color={colors.primary} />
                        <Text style={styles.cierreTexto}>{fechaTexto}</Text>
                        <WebPickerOverlay
                          type="date"
                          label="Fecha de cierre"
                          value={toYMD(base)}
                          min={getTodayIso()}
                          onChange={cambiarFecha}
                        />
                      </View>
                      <View style={styles.cierreDivisor} />
                      <View style={styles.cierreParteHora}>
                        <FontAwesome6 name="clock" size={14} color={colors.primary} />
                        <Text style={styles.cierreTexto}>{horaTexto}</Text>
                        <WebPickerOverlay
                          type="time"
                          label="Hora de cierre"
                          value={horaTexto}
                          onChange={(valor) => {
                            if (!valor) return;
                            const [h, m] = valor.split(":").map(Number);
                            cambiarHora(h, m);
                          }}
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      <Pressable
                        style={styles.cierreParteFecha}
                        onPress={() => {
                          Keyboard.dismiss();
                          setMostrarCalendario(true);
                        }}
                      >
                        <FontAwesome6 name="calendar" size={14} color={colors.primary} />
                        <Text style={styles.cierreTexto}>{fechaTexto}</Text>
                      </Pressable>
                      <View style={styles.cierreDivisor} />
                      <Pressable
                        style={styles.cierreParteHora}
                        onPress={() => {
                          Keyboard.dismiss();
                          setHoraTemporal(new Date(base));
                          setMostrarSelectorHora(true);
                        }}
                      >
                        <FontAwesome6 name="clock" size={14} color={colors.primary} />
                        <Text style={styles.cierreTexto}>{horaTexto}</Text>
                      </Pressable>
                    </>
                  )}
                </View>
                {errorCierre ? (
                  <Text style={styles.error}>{errorCierre}</Text>
                ) : inicio ? (
                  <Text style={styles.hint}>
                    Tiene que cerrar antes de las {franja.inicio} del {textoFechaCorta(inicio)}.
                  </Text>
                ) : null}
              </View>

              {errorServidor ? (
                <View style={styles.errorBox}>
                  <FontAwesome6 name="circle-exclamation" size={12} color={colors.danger} />
                  <Text style={styles.errorBoxTexto}>{errorServidor}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.pie}>
              <PrimaryButton
                label={guardando ? "Creando..." : "Crear votación"}
                loading={guardando}
                disabled={guardando}
                onPress={crear}
                testID="crear-votacion-desde-sugerencias"
              />
            </View>

            {Platform.OS !== "web" ? (
              <DatePickerModal
                visible={mostrarCalendario}
                onClose={() => setMostrarCalendario(false)}
                title="Fecha de cierre"
                value={toYMD(base)}
                onChange={cambiarFecha}
                minDate={parseYMD(getTodayIso(), 0)}
              />
            ) : null}

            {mostrarSelectorHora && Platform.OS === "ios" ? (
              <Modal
                transparent
                animationType="fade"
                visible={mostrarSelectorHora}
                onRequestClose={() => setMostrarSelectorHora(false)}
              >
                <Pressable
                  style={styles.horaOverlay}
                  onPress={() => setMostrarSelectorHora(false)}
                >
                  <Pressable style={styles.horaContenedor} onPress={(e) => e.stopPropagation()}>
                    <DateTimePicker
                      mode="time"
                      value={horaTemporal}
                      onChange={handleTimeChange}
                      is24Hour
                      display="spinner"
                      style={{ width: 220, height: 160 }}
                    />
                    <Pressable
                      style={styles.horaListo}
                      onPress={() => {
                        cambiarHora(horaTemporal.getHours(), horaTemporal.getMinutes());
                        setMostrarSelectorHora(false);
                      }}
                    >
                      <Text style={styles.horaListoTexto}>Listo</Text>
                    </Pressable>
                  </Pressable>
                </Pressable>
              </Modal>
            ) : mostrarSelectorHora && Platform.OS === "android" ? (
              <DateTimePicker
                mode="time"
                value={horaTemporal}
                onChange={handleTimeChange}
                is24Hour
                display="default"
              />
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    maxHeight: "92%",
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
  },
  headerTexts: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
  },
  subtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  intro: {
    ...textStyles.meta,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  seccion: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  label: {
    ...textStyles.label,
    textTransform: "none",
    letterSpacing: 0.2,
    fontSize: 13,
    color: colors.primary,
  },
  hint: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textMuted,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...textStyles.bodyStrong,
    fontSize: 14,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.danger,
    fontWeight: "600",
  },
  propuesta: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  propuestaIndice: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  propuestaIndiceTexto: {
    ...textStyles.bodyStrong,
    fontSize: 12,
    color: colors.primary,
  },
  propuestaTextos: {
    flex: 1,
    gap: 3,
  },
  propuestaNombre: {
    ...textStyles.bodyStrong,
    fontSize: 14,
    color: colors.primary,
  },
  propuestaFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  propuestaDato: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  cierreBox: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  cierreParteFecha: {
    flex: 1.3,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  cierreParteHora: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  cierreDivisor: {
    width: 1,
    height: "60%",
    backgroundColor: colors.border,
  },
  cierreTexto: {
    ...textStyles.bodyStrong,
    fontSize: 13,
    color: colors.textPrimary,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    marginTop: spacing.lg,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerSurface,
  },
  errorBoxTexto: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.danger,
    flex: 1,
  },
  pie: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  horaOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  horaContenedor: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: "center",
    minWidth: 260,
  },
  horaListo: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  horaListoTexto: {
    ...textStyles.body,
    color: colors.primary,
    fontWeight: "700",
  },
});