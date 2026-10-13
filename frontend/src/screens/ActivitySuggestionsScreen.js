import React, { useEffect, useMemo, useState } from "react";
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
import { acotarFranja, aMinutos, calcularHuecosLibres } from "../utils/huecosLibres";
import PlanningPreferencesScreen from "./PlanningPreferencesScreen";

const DURACION_MINIMA_MINUTOS = 60;

const FRANJA_POR_DEFECTO = { inicio: "10:00", fin: "13:00" };

// Solo se ofrecen cuando el día no tiene actividades (si tiene, se ofrecen sus huecos libres).
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

const SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const SEMANA_LARGA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function normalizarHora(texto) {
  const match = String(texto ?? "").trim().match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = match[2] ? Number(match[2]) : 0;
  if (horas > 23 || minutos > 59) return null;
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
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

function fechaISO(fechaRaw) {
  return String(fechaRaw ?? "").slice(0, 10);
}

function partesDeFecha(fechaRaw) {
  const fecha = new Date(`${fechaISO(fechaRaw)}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) return null;
  return {
    semana: SEMANA[fecha.getDay()],
    numero: String(fecha.getDate()),
    mes: MESES[fecha.getMonth()],
    larga: `${SEMANA_LARGA[fecha.getDay()]} ${fecha.getDate()} de ${MESES_LARGOS[fecha.getMonth()]}`,
  };
}

// Huecos libres del día (≥ 1 h), acotados a 4 h. Si el día es hoy, descarta los que ya pasaron.
function huecosDelDia(dia, hoy) {
  if (!dia) return [];
  let huecos = calcularHuecosLibres(dia.actividades);
  if (fechaISO(dia.fechaRaw) === hoy) {
    const ahora = new Date();
    const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
    huecos = huecos.filter((h) => aMinutos(h.hasta) > minutosAhora);
  }
  return huecos.map((h) => acotarFranja({ inicio: h.desde, fin: h.hasta }));
}

function textoActividades(cantidad) {
  if (cantidad === 0) return "Sin actividades";
  return `${cantidad} ${cantidad === 1 ? "actividad" : "actividades"}`;
}

export default function ActivitySuggestionsScreen({
  visible,
  onClose,
  tripId,
  tripTitle,
  dias,
  initialDayId,
  initialFranja,
  onGenerado,
  onCrearManual,
}) {
  const [dayId, setDayId] = useState(null);
  const [inicioTexto, setInicioTexto] = useState(FRANJA_POR_DEFECTO.inicio);
  const [finTexto, setFinTexto] = useState(FRANJA_POR_DEFECTO.fin);
  const [contexto, setContexto] = useState(null);
  const [indicacion, setIndicacion] = useState("");
  const [distanciaKm, setDistanciaKm] = useState(15);
  const [cargandoContexto, setCargandoContexto] = useState(false);
  const [fase, setFase] = useState("formulario");
  const [sugerencias, setSugerencias] = useState([]);
  const [mensajeVacio, setMensajeVacio] = useState("");
  const [errorInfo, setErrorInfo] = useState(null);
  const [sinPreferencias, setSinPreferencias] = useState(false);
  const [restantes, setRestantes] = useState(null);
  const [pasoProgreso, setPasoProgreso] = useState(0);
  const [mostrarPreferencias, setMostrarPreferencias] = useState(false);
  const [mostrarDias, setMostrarDias] = useState(false);

  const diasValidos = useMemo(
    () => (dias ?? []).filter((dia) => Number.isInteger(dia.dayId)),
    [dias]
  );
  const hoy = hoyIso();
  const franja = validarFranja(inicioTexto, finTexto);
  const diaSeleccionado = diasValidos.find((item) => item.dayId === dayId) ?? null;
  const actividadesDelDia = diaSeleccionado?.actividades ?? [];
  const huecosSeleccionado = huecosDelDia(diaSeleccionado, hoy);

  // Actividades del día que pisan la franja elegida (solo para avisar, no bloquea).
  const superpuestas =
    franja.inicio && diaSeleccionado
      ? actividadesDelDia.filter((actividad) => {
          const inicio = aMinutos(actividad.horaInicio);
          const fin = aMinutos(actividad.horaFin);
          return (
            inicio != null &&
            fin != null &&
            inicio < aMinutos(franja.fin) &&
            fin > aMinutos(franja.inicio)
          );
        })
      : [];

  function franjaSugeridaPara(idDia) {
    const dia = diasValidos.find((item) => item.dayId === idDia);
    return huecosDelDia(dia, hoy)[0] ?? FRANJA_POR_DEFECTO;
  }

  function aplicarFranja({ inicio, fin }) {
    setInicioTexto(inicio);
    setFinTexto(fin);
  }

  function elegirDia(idDia) {
    setDayId(idDia);
    aplicarFranja(franjaSugeridaPara(idDia));
    setMostrarDias(false);
  }

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
    setMostrarDias(false);
    cargarContexto();
  }, [visible, tripId]);

  // Al abrir (o si cambian el día o la franja con que se abre): precarga día y horario.
  // Si se abrió desde un hueco libre, usa ese hueco; si no, el primer hueco del día.
  useEffect(() => {
    if (!visible) return;
    const primerDiaDisponible =
      diasValidos.find((item) => !item.fechaRaw || fechaISO(item.fechaRaw) >= hoy) ??
      diasValidos[0];
    const idDia = initialDayId ?? primerDiaDisponible?.dayId ?? null;
    setDayId(idDia);
    aplicarFranja(acotarFranja(initialFranja) ?? franjaSugeridaPara(idDia));
  }, [visible, initialDayId, initialFranja?.inicio, initialFranja?.fin]);

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

  const limiteAlcanzado = restantes != null && restantes <= 0;
  const solicitudDeshabilitada =
    !franja.inicio || dayId == null || limiteAlcanzado || contexto?.PuedeSolicitar === false;

  function renderChipFranja({ key, label, inicio, fin, testID }) {
    const activo = normalizarHora(inicioTexto) === inicio && normalizarHora(finTexto) === fin;
    return (
      <Pressable
        key={key}
        onPress={() => aplicarFranja({ inicio, fin })}
        style={[styles.chip, activo && styles.chipActive]}
        accessibilityRole="button"
        accessibilityState={{ selected: activo }}
        testID={testID}
      >
        <Text style={[styles.chipText, activo && styles.chipTextActive]}>{label}</Text>
      </Pressable>
    );
  }

  function renderSelectorDia() {
    const partes = diaSeleccionado ? partesDeFecha(diaSeleccionado.fechaRaw) : null;
    return (
      <View style={styles.seccion}>
        <Text style={styles.label}>Día</Text>
        <Pressable
          onPress={() => setMostrarDias((abierto) => !abierto)}
          style={({ pressed }) => [styles.selectorDia, pressed && styles.selectorDiaPresionado]}
          accessibilityRole="button"
          accessibilityLabel={diaSeleccionado ? `Día ${diaSeleccionado.dayIndex}` : "Elegir día"}
          accessibilityState={{ expanded: mostrarDias }}
          testID="suggestions-dia-select"
        >
          <View style={styles.selectorDiaTexto}>
            <Text style={styles.selectorDiaTitulo}>
              {diaSeleccionado ? `Día ${diaSeleccionado.dayIndex}` : "Elegí un día"}
            </Text>
            {diaSeleccionado ? (
              <Text numberOfLines={1} style={styles.selectorDiaDetalle}>
                {partes ? partes.larga : ""} · {textoActividades(actividadesDelDia.length)}
              </Text>
            ) : null}
          </View>
          <FontAwesome6
            name={mostrarDias ? "chevron-up" : "chevron-down"}
            size={14}
            color={colors.primary}
          />
        </Pressable>

        {mostrarDias ? (
          <View style={styles.listaDias} testID="suggestions-dia-options">
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {diasValidos.map((item) => {
                const activo = item.dayId === dayId;
                const pasado = Boolean(item.fechaRaw) && fechaISO(item.fechaRaw) < hoy;
                const fecha = partesDeFecha(item.fechaRaw);
                const tieneActividades = (item.actividades ?? []).length > 0;
                return (
                  <Pressable
                    key={item.dayId}
                    disabled={pasado}
                    onPress={() => elegirDia(item.dayId)}
                    style={[
                      styles.opcionDia,
                      activo && styles.opcionDiaActiva,
                      pasado && styles.opcionDiaPasada,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Día ${item.dayIndex}${fecha ? `, ${fecha.larga}` : ""}`}
                    accessibilityState={{ selected: activo, disabled: pasado }}
                    testID={`suggestions-dia-${item.dayId}`}
                  >
                    <View style={styles.opcionDiaFecha}>
                      <Text style={[styles.opcionDiaNumero, activo && styles.opcionDiaTextoActivo]}>
                        Día {item.dayIndex}
                      </Text>
                      {fecha ? (
                        <Text style={[styles.opcionDiaDetalle, activo && styles.opcionDiaTextoActivo]}>
                          {fecha.larga}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.diaChipPunto,
                        tieneActividades && styles.diaChipPuntoLleno,
                        activo && tieneActividades && styles.diaChipPuntoActivo,
                      ]}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  }

  function renderFranja() {
    const diaConActividades = actividadesDelDia.length > 0;
    return (
      <View style={styles.seccion}>
        <Text style={styles.label}>Franja horaria</Text>

        {diaConActividades ? (
          huecosSeleccionado.length > 0 ? (
            <>
              <Text style={styles.hint}>Huecos libres de este día</Text>
              <View style={styles.chipsRow}>
                {huecosSeleccionado.map((hueco) =>
                  renderChipFranja({
                    key: `${hueco.inicio}-${hueco.fin}`,
                    label: `${hueco.inicio} – ${hueco.fin}`,
                    inicio: hueco.inicio,
                    fin: hueco.fin,
                    testID: `suggestions-hueco-${hueco.inicio}`,
                  })
                )}
              </View>
            </>
          ) : (
            <Text style={styles.hint}>
              Este día no tiene huecos libres de una hora o más. Podés elegir el horario a mano.
            </Text>
          )
        ) : (
          <View style={styles.chipsRow}>
            {FRANJAS_RAPIDAS.map((opcion) =>
              renderChipFranja({
                key: opcion.id,
                label: `${opcion.label} ${opcion.inicio} – ${opcion.fin}`,
                inicio: opcion.inicio,
                fin: opcion.fin,
                testID: `suggestions-franja-${opcion.id}`,
              })
            )}
          </View>
        )}

        <View style={styles.horasRow}>
          <View style={styles.horaCol}>
            <Text style={styles.label}>Desde</Text>
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
          <FontAwesome6 name="arrow-right" size={12} color={colors.overlay} style={styles.flecha} />
          <View style={styles.horaCol}>
            <Text style={styles.label}>Hasta</Text>
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

        {!franja.error && superpuestas.length > 0 ? (
          <View style={styles.aviso} testID="suggestions-superposicion">
            <FontAwesome6 name="triangle-exclamation" size={12} color={colors.warning} />
            <Text style={styles.avisoTexto}>
              Este horario se superpone con {superpuestas.map((a) => a.title).join(", ")}.
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  function renderFormulario() {
    return (
      <View>
        <Text style={styles.intro}>
          El asistente propone actividades para tu franja libre según los intereses, el ritmo y el
          presupuesto del grupo.
        </Text>

        {renderSelectorDia()}
        {renderFranja()}

        <View style={styles.seccion}>
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
          <Text style={styles.hint}>Se mide desde tus actividades del día o desde el destino.</Text>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.label}>Indicación para esta búsqueda (opcional)</Text>
          <TextInput
            style={styles.indicacionInput}
            value={indicacion}
            onChangeText={setIndicacion}
            multiline
            maxLength={300}
            placeholder="Sin mucha caminata, al aire libre…"
            placeholderTextColor={colors.overlay}
            textAlignVertical="top"
            testID="suggestions-indicacion"
          />
          <View style={styles.indicacionFooter}>
            <Text style={styles.hint}>No incluyas datos personales.</Text>
            <Text style={styles.hint}>{indicacion.length}/300</Text>
          </View>
        </View>

        <View style={styles.seccion}>
          {cargandoContexto ? (
            <ActivityIndicator color={colors.primary} />
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
        </View>
      </View>
    );
  }

  // Pie fijo del formulario: contador de solicitudes y botón de generar.
  function renderPieFormulario() {
    return (
      <View style={styles.pie}>
        {restantes != null ? (
          <Text style={[styles.contador, limiteAlcanzado && styles.contadorError]}>
            {limiteAlcanzado
              ? `Alcanzaste el límite de ${contexto?.LimiteDiario ?? ""} solicitudes de hoy para este viaje.`
              : `Te quedan ${restantes} ${restantes === 1 ? "solicitud" : "solicitudes"} hoy en este viaje.`}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: solicitudDeshabilitada }}
          disabled={solicitudDeshabilitada}
          onPress={() => generar(sinPreferencias)}
          style={({ pressed }) => [
            styles.botonIA,
            solicitudDeshabilitada && styles.botonIADeshabilitado,
            pressed && styles.botonIAPresionado,
          ]}
          testID="suggestions-generar"
        >
          <FontAwesome6 name="wand-magic-sparkles" size={15} color={colors.primary} />
          <Text style={styles.botonIATexto}>
            {sinPreferencias ? "Continuar con criterios generales" : "Generar sugerencias"}
          </Text>
        </Pressable>
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
      <View>
        <Text style={styles.intro}>
          {sugerencias.length === 1
            ? "Esta es la sugerencia para tu franja."
            : `Estas son las ${sugerencias.length} sugerencias para tu franja.`}{" "}
          Quedaron pendientes y las ven todos los participantes.
        </Text>
        <View style={styles.listaCards}>
          {sugerencias.map((sugerencia) => (
            <ActivitySuggestionCard key={sugerencia.IdSugerenciaActividad} sugerencia={sugerencia} />
          ))}
        </View>
        {restantes != null ? (
          <Text style={[styles.contador, styles.contadorResultados]}>
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
        <FontAwesome6 name="magnifying-glass" size={22} color={colors.overlay} />
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
          <View style={styles.headerRow}>
            <View style={styles.headerTexts}>
              <Text style={styles.title}>Sugerencias con IA</Text>
              {tripTitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {tripTitle}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Cerrar"
              testID="close-suggestions-modal"
            >
              <FontAwesome6 name="xmark" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderContenido()}
          </ScrollView>

          {fase === "formulario" ? renderPieFormulario() : null}

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
    color: colors.primary,
    marginTop: 2,
    fontWeight: "650",  
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
    gap: spacing.sm,
  },
  label: {
    ...textStyles.label,
    textTransform: "none",
    letterSpacing: 0.2,
    fontSize: 13,
    color: colors.primary,
  },
  labelDetalle: {
    ...textStyles.meta,
    flexShrink: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },
  hint: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.overlay,
    fontWeight: "650",
  },
  selectorDia: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selectorDiaPresionado: {
    opacity: 0.8,
  },
  selectorDiaTexto: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.sm,
  },
  selectorDiaTitulo: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  selectorDiaDetalle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  listaDias: {
    maxHeight: 220,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  opcionDia: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  opcionDiaActiva: {
    backgroundColor: colors.primary,
  },
  opcionDiaPasada: {
    opacity: 0.35,
  },
  opcionDiaFecha: {
    flex: 1,
    minWidth: 0,
  },
  opcionDiaNumero: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  opcionDiaDetalle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  opcionDiaTextoActivo: {
    color: colors.textInverse,
  },
  diaChipPunto: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 3,
    backgroundColor: "transparent",
  },
  diaChipPuntoLleno: {
    backgroundColor: colors.primary,
  },
  diaChipPuntoActivo: {
    backgroundColor: colors.accent,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
    marginTop: spacing.xs,
  },
  horaCol: {
    flex: 1,
    gap: spacing.xxs,
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
  indicacionInput: {
    minHeight: 84,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    color: colors.textPrimary,
    ...textStyles.body,
    fontSize: 14,
  },
  indicacionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
  },
  infoText: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
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
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.warningSurface,
  },
  avisoTexto: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.warning,
    flex: 1,
  },
  error: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.danger,
    fontWeight: "600",
  },
  pie: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  contador: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
  },
  contadorError: {
    color: colors.danger,
    fontWeight: "600",
  },
  contadorResultados: {
    marginTop: spacing.md,
  },
  botonIA: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.accentStrong,
    backgroundColor: colors.accent,
  },
  botonIADeshabilitado: {
    opacity: 0.5,
  },
  botonIAPresionado: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  botonIATexto: {
    ...textStyles.button,
    color: colors.primary,
  },
  submitButton: {
    marginTop: spacing.lg,
  },
  centrado: {
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
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
});