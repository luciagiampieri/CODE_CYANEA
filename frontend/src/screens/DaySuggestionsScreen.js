import { FontAwesome6 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import ScreenHeader from "../components/ui/ScreenHeader";
import AcceptSuggestionModal from "../components/trip/AcceptSuggestionModal";
import SuggestionCompactCard from "../components/trip/SuggestionCompactCard";
import { appAlert } from "../components/ui/AppDialog";
import { discardActivitySuggestion, getActivitySuggestions } from "../services/api";
import { colors, radii, spacing, textStyles } from "../theme/tokens";
import ActivitySuggestionsScreen from "./ActivitySuggestionsScreen";
import ProposeSuggestionsVoteScreen from "./ProposeSuggestionsVoteScreen";

const MINIMO_VOTACION = 2;
const MAXIMO_VOTACION = 5;

function hhmm(valor) {
  return String(valor ?? "").slice(0, 5);
}

function aMinutos(valor) {
  const [h, m] = hhmm(valor).split(":").map(Number);
  return h * 60 + m;
}

function esPendiente(sugerencia) {
  return String(sugerencia.Estado ?? "").toLowerCase() === "pendiente";
}

function interseccion(sugerencias) {
  if (!sugerencias.length) return null;
  return {
    inicio: Math.max(...sugerencias.map((s) => aMinutos(s.HoraInicio))),
    fin: Math.min(...sugerencias.map((s) => aMinutos(s.HoraFin))),
  };
}

function seSuperponeCon(rango, sugerencia) {
  if (!rango) return true;
  return Math.max(rango.inicio, aMinutos(sugerencia.HoraInicio)) < Math.min(rango.fin, aMinutos(sugerencia.HoraFin));
}

function franjaDe(sugerencias) {
  if (!sugerencias.length) return null;
  const inicios = sugerencias.map((s) => hhmm(s.HoraInicio)).sort();
  const fines = sugerencias.map((s) => hhmm(s.HoraFin)).sort();
  return { inicio: inicios[0], fin: fines[fines.length - 1] };
}

function franjaSolicitada(sugerencia) {
  return {
    inicio: hhmm(sugerencia.FranjaInicio || sugerencia.HoraInicio),
    fin: hhmm(sugerencia.FranjaFin || sugerencia.HoraFin),
  };
}

export default function DaySuggestionsScreen({ navigation, route }) {
  const { tripId, trip, tripTitle, dia, canPropose = false } = route.params ?? {};

  const [sugerencias, setSugerencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState("");
  const [expandidaId, setExpandidaId] = useState(null);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [avisoLimite, setAvisoLimite] = useState(false);
  const [mostrarSheet, setMostrarSheet] = useState(false);

  const [descartandoId, setDescartandoId] = useState(null);
  const [franjaDescartada, setFranjaDescartada] = useState(null);
  const [mostrarRegenerar, setMostrarRegenerar] = useState(false);
  const [franjaRegenerar, setFranjaRegenerar] = useState(null);
  const [sugerenciaAceptando, setSugerenciaAceptando] = useState(null);

  const yaCargoRef = useRef(false);

  const cargar = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!tripId) return;
      if (!silencioso) setCargando(true);
      setError("");
      try {
        const data = await getActivitySuggestions(tripId);
        setSugerencias(
          (Array.isArray(data) ? data : []).filter((s) => s.IdDiaCronograma === dia?.dayId)
        );
      } catch (err) {
        setError(err.message || "No se pudieron cargar las sugerencias.");
      } finally {
        setCargando(false);
        setRefrescando(false);
      }
    },
    [tripId, dia?.dayId]
  );

  useFocusEffect(
    useCallback(() => {
      cargar({ silencioso: yaCargoRef.current });
      yaCargoRef.current = true;
    }, [cargar])
  );

  const ordenadas = useMemo(
    () =>
      [...sugerencias].sort(
        (a, b) =>
          hhmm(a.HoraInicio).localeCompare(hhmm(b.HoraInicio)) ||
          hhmm(a.HoraFin).localeCompare(hhmm(b.HoraFin))
      ),
    [sugerencias]
  );

  useEffect(() => {
    setSeleccionadas((actuales) =>
      actuales.filter((id) =>
        sugerencias.some((s) => s.IdSugerenciaActividad === id && esPendiente(s))
      )
    );
  }, [sugerencias]);

  const pendientes = ordenadas.filter(esPendiente).length;
  const elegidas = ordenadas.filter((s) => seleccionadas.includes(s.IdSugerenciaActividad));
  const rangoComun = interseccion(elegidas);
  const franjaVotacion = franjaDe(elegidas);
  const puedeContinuar = seleccionadas.length >= MINIMO_VOTACION && seleccionadas.length <= MAXIMO_VOTACION;

  const puedeGestionar = canPropose;
  const franjaParaRegenerar = franjaDescartada ?? (ordenadas.length > 0 ? franjaSolicitada(ordenadas[0]) : null);

  const diasParaSheet = useMemo(
    () =>
      dia
        ? [
            {
              dayId: dia.dayId,
              dayIndex: dia.dayIndex,
              fechaRaw: dia.fechaRaw,
              dayDateText: dia.dayDateText,
              actividades: dia.actividades ?? [],
            },
          ]
        : [],
    [dia]
  );

  function abrirRegenerar(franja) {
    setFranjaRegenerar(franja ?? franjaParaRegenerar);
    setMostrarRegenerar(true);
  }

  function mostrarMensaje(titulo, mensaje) {
    appAlert(titulo, mensaje);
  }

  // Mensaje de confirmación posterior al descarte, con acceso directo a regenerar.
  function avisarDescarte(franja) {
    const mensaje = "La sugerencia se descartó y dejó de mostrarse.";
    appAlert("Sugerencia descartada", `${mensaje} ¿Querés buscar otras opciones para la misma franja?`, [
      { text: "Listo", style: "cancel" },
      { text: "Buscar otras opciones", onPress: () => abrirRegenerar(franja) },
    ]);
  }

  async function ejecutarDescarte(sugerencia) {
    const id = sugerencia.IdSugerenciaActividad;
    if (descartandoId != null) return;
    setDescartandoId(id);
    try {
      await discardActivitySuggestion(tripId, id);
      const franja = franjaSolicitada(sugerencia);
      setSugerencias((actuales) => actuales.filter((s) => s.IdSugerenciaActividad !== id));
      setExpandidaId(null);
      setFranjaDescartada(franja);
      avisarDescarte(franja);
    } catch (err) {
      mostrarMensaje("No se pudo descartar", err?.message || "No se pudo descartar la sugerencia.");
      cargar({ silencioso: true });
    } finally {
      setDescartandoId(null);
    }
  }

  // US 88: la actividad ya se creó; la sugerencia pasa a "Aceptada" y deja de listarse.
  function handleAceptada(resultado) {
    const id = sugerenciaAceptando?.IdSugerenciaActividad;
    setSugerenciaAceptando(null);
    setExpandidaId(null);
    setSugerencias((actuales) => actuales.filter((s) => s.IdSugerenciaActividad !== id));
    mostrarMensaje(
      "Actividad agregada",
      resultado?.Mensaje || "La sugerencia se agregó al itinerario."
    );
  }

  function pedirConfirmacionDescarte(sugerencia) {
    const mensaje = `Se va a descartar "${sugerencia.Nombre}". Dejará de mostrarse y no se volverá a sugerir ese lugar para esta franja.`;
    appAlert("¿Descartar sugerencia?", mensaje, [
      { text: "Cancelar", style: "cancel" },
      { text: "Descartar", style: "destructive", onPress: () => ejecutarDescarte(sugerencia) },
    ]);
  }

  function empezarSeleccion() {
    setModoSeleccion(true);
    setSeleccionadas([]);
    setAvisoLimite(false);
    setExpandidaId(null);
  }

  function salirDeSeleccion() {
    setModoSeleccion(false);
    setSeleccionadas([]);
    setAvisoLimite(false);
  }

  function alternarSeleccion(sugerencia) {
    const id = sugerencia.IdSugerenciaActividad;
    setAvisoLimite(false);
    if (seleccionadas.includes(id)) {
      setSeleccionadas((actuales) => actuales.filter((item) => item !== id));
      return;
    }
    if (seleccionadas.length >= MAXIMO_VOTACION) {
      setAvisoLimite(true);
      return;
    }
    setSeleccionadas((actuales) => [...actuales, id]);
  }

  function irAVotar() {
    if (trip) {
      navigation.navigate("TripDetail", {
        trip,
        initialTab: "votar",
        notificationTarget: { origen: "sugerencias-dia" },
      });
    } else {
      navigation.goBack();
    }
  }

  function handleCreada() {
    setMostrarSheet(false);
    salirDeSeleccion();
    cargar({ silencioso: true });

    const mensaje = "La votación se creó correctamente y ya la puede ver todo el grupo.";
    appAlert("Votación creada", mensaje, [
      { text: "Seguir acá", style: "cancel" },
      { text: "Ver votación", onPress: irAVotar },
    ]);
  }

  function renderSugerencia(sugerencia) {
    const id = sugerencia.IdSugerenciaActividad;
    if (modoSeleccion) {
      const seleccionada = seleccionadas.includes(id);
      const bloqueada =
        !esPendiente(sugerencia) || (!seleccionada && !seSuperponeCon(rangoComun, sugerencia));
      return (
        <SuggestionCompactCard
          key={id}
          sugerencia={sugerencia}
          modoSeleccion
          seleccionada={seleccionada}
          bloqueada={bloqueada}
          onPress={() => alternarSeleccion(sugerencia)}
        />
      );
    }
    return (
      <SuggestionCompactCard
        key={id}
        sugerencia={sugerencia}
        expandida={expandidaId === id}
        onPress={() => setExpandidaId((actual) => (actual === id ? null : id))}
        onDescartar={puedeGestionar ? pedirConfirmacionDescarte : undefined}
        descartando={descartandoId === id}
        onAceptar={puedeGestionar ? setSugerenciaAceptando : undefined}
      />
    );
  }

  function renderContenido() {
    if (cargando) {
      return <ActivityIndicator color={colors.primary} style={styles.cargando} />;
    }
    if (error) {
      return (
        <View style={styles.estadoVacio}>
          <FontAwesome6 name="circle-exclamation" size={22} color={colors.danger} />
          <Text style={styles.estadoVacioTitulo}>No se pudieron cargar las sugerencias</Text>
          <Text style={styles.estadoVacioTexto}>{error}</Text>
          <Pressable onPress={() => cargar()} style={styles.botonSecundario}>
            <Text style={styles.botonSecundarioTexto}>Reintentar</Text>
          </Pressable>
        </View>
      );
    }
    if (ordenadas.length === 0) {
      return (
        <View style={styles.estadoVacio}>
          <FontAwesome6 name="wand-magic-sparkles" size={22} color={colors.textMuted} />
          <Text style={styles.estadoVacioTitulo}>Este día no tiene sugerencias</Text>
          <Text style={styles.estadoVacioTexto}>
            Pedile al asistente ideas para un hueco libre desde el itinerario.
          </Text>
          {puedeGestionar && franjaParaRegenerar ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => abrirRegenerar(franjaParaRegenerar)}
              style={({ pressed }) => [styles.botonProponer, pressed && styles.presionado]}
              testID="regenerar-sugerencias-vacio"
            >
              <FontAwesome6 name="rotate" size={12} color={colors.primary} />
              <Text style={styles.botonProponerTexto}>
                Buscar nuevas opciones ({franjaParaRegenerar.inicio} – {franjaParaRegenerar.fin})
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => navigation.goBack()} style={styles.botonSecundario}>
            <Text style={styles.botonSecundarioTexto}>Volver al itinerario</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <>
        <View style={styles.encabezado}>
          <View style={styles.encabezadoTextos}>
            <Text style={styles.encabezadoTitulo}>
              {ordenadas.length} {ordenadas.length === 1 ? "sugerencia" : "sugerencias"}
            </Text>
            <Text style={styles.encabezadoSubtitulo}>
              {pendientes} {pendientes === 1 ? "pendiente" : "pendientes"}
            </Text>
          </View>
          <View style={styles.encabezadoAcciones}>
            {puedeGestionar && franjaParaRegenerar && !modoSeleccion ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => abrirRegenerar(franjaParaRegenerar)}
                style={({ pressed }) => [styles.botonProponer, pressed && styles.presionado]}
                testID="regenerar-sugerencias"
              >
                <FontAwesome6 name="rotate" size={12} color={colors.primary} />
                <Text style={styles.botonProponerTexto}>Regenerar</Text>
              </Pressable>
            ) : null}
            {canPropose && pendientes >= MINIMO_VOTACION && !modoSeleccion ? (
              <Pressable
                accessibilityRole="button"
                onPress={empezarSeleccion}
                style={({ pressed }) => [styles.botonProponer, pressed && styles.presionado]}
                testID="proponer-votacion"
              >
                <FontAwesome6 name="check-to-slot" size={12} color={colors.primary} />
                <Text style={styles.botonProponerTexto}>Proponer a votación</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <Text style={styles.intro}>
          {modoSeleccion
            ? `Elegí entre ${MINIMO_VOTACION} y ${MAXIMO_VOTACION} sugerencias pendientes que se superpongan en horario: el grupo va a votar cuál hacer.`
            : "Las sugerencias quedan pendientes y las ve todo el grupo. Tocá una para ver el detalle y agregarla al itinerario."}
        </Text>

        <View style={styles.lista}>{ordenadas.map(renderSugerencia)}</View>
      </>
    );
  }

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScreenHeader
        title="Sugerencias del día"
        subtitle={`Día ${dia?.dayIndex}${dia?.dayDateText ? ` · ${dia.dayDateText}` : ""}${tripTitle ? ` · ${tripTitle}` : ""}`}
        onBack={() => navigation.goBack()}
        backTestID="sugerencias-dia-volver"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, modoSeleccion && styles.scrollConBarra]}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={() => {
              setRefrescando(true);
              cargar({ silencioso: true });
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.contenido}>{renderContenido()}</View>
      </ScrollView>

      {modoSeleccion ? (
        <View style={styles.barra}>
          <View style={styles.barraInterior}>
            <View style={styles.barraTextos}>
              <Text style={styles.barraContador}>
                {seleccionadas.length} de {MAXIMO_VOTACION} seleccionadas
              </Text>
              {avisoLimite ? (
                <Text style={styles.barraAviso}>Podés proponer hasta {MAXIMO_VOTACION} sugerencias.</Text>
              ) : franjaVotacion ? (
                <Text style={styles.barraAyuda}>
                  Votación de {franjaVotacion.inicio} a {franjaVotacion.fin}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={salirDeSeleccion}
              style={({ pressed }) => [styles.botonSecundario, pressed && styles.presionado]}
            >
              <Text style={styles.botonSecundarioTexto}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !puedeContinuar }}
              disabled={!puedeContinuar}
              onPress={() => setMostrarSheet(true)}
              style={({ pressed }) => [
                styles.botonPrimario,
                !puedeContinuar && styles.botonDeshabilitado,
                pressed && styles.presionado,
              ]}
              testID="continuar-propuesta-votacion"
            >
              <Text style={styles.botonPrimarioTexto}>Continuar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ProposeSuggestionsVoteScreen
        visible={mostrarSheet}
        onClose={() => setMostrarSheet(false)}
        tripId={tripId}
        dia={dia}
        franja={franjaVotacion}
        sugerencias={elegidas}
        onCreada={handleCreada}
      />

      <AcceptSuggestionModal
        visible={Boolean(sugerenciaAceptando)}
        tripId={tripId}
        sugerencia={sugerenciaAceptando}
        onClose={() => setSugerenciaAceptando(null)}
        onAceptada={handleAceptada}
      />

      <ActivitySuggestionsScreen
        visible={mostrarRegenerar}
        tripId={tripId}
        tripTitle={tripTitle}
        dias={diasParaSheet}
        initialDayId={dia?.dayId}
        initialFranja={franjaRegenerar}
        onClose={() => setMostrarRegenerar(false)}
        onGenerado={() => cargar({ silencioso: true })}
        onCrearManual={() => {
          setMostrarRegenerar(false);
          navigation.goBack();
        }}
      />
    </ScreenContainer>
  );
}

const ANCHO_MAXIMO = 720;

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  scrollConBarra: {
    paddingBottom: 120,
  },
  contenido: {
    width: "100%",
    maxWidth: ANCHO_MAXIMO,
    alignSelf: "center",
  },
  cargando: {
    marginTop: spacing.xl,
  },
  encabezado: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  encabezadoTextos: {
    flexShrink: 1,
  },
  encabezadoAcciones: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  encabezadoTitulo: {
    ...textStyles.bodyStrong,
    fontSize: 15,
    color: colors.primary,
  },
  encabezadoSubtitulo: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
  },
  intro: {
    ...textStyles.meta,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  botonProponer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  botonProponerTexto: {
    ...textStyles.meta,
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  lista: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  estadoVacio: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  estadoVacioTitulo: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    textAlign: "center",
  },
  estadoVacioTexto: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
  },
  barra: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  barraInterior: {
    width: "100%",
    maxWidth: ANCHO_MAXIMO,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  barraTextos: {
    flex: 1,
    gap: 2,
  },
  barraContador: {
    ...textStyles.bodyStrong,
    fontSize: 13,
    color: colors.primary,
  },
  barraAyuda: {
    ...textStyles.meta,
    fontSize: 11,
    color: colors.textSecondary,
  },
  barraAviso: {
    ...textStyles.meta,
    fontSize: 11,
    color: colors.warning,
    fontWeight: "600",
  },
  botonSecundario: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  botonSecundarioTexto: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  botonPrimario: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  botonPrimarioTexto: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textInverse,
  },
  botonDeshabilitado: {
    opacity: 0.45,
  },
  presionado: {
    opacity: 0.8,
  },
});