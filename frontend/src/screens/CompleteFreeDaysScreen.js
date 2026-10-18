import { FontAwesome6 } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import SuggestionCompactCard from "../components/trip/SuggestionCompactCard";
import Modal from "../components/ui/AppModal";
import PrimaryButton from "../components/ui/PrimaryButton";
import { completeFreeItinerarySlots, getFreeItinerarySlots } from "../services/api";
import { colors, radii, spacing, textStyles } from "../theme/tokens";
import {
  agruparPorDia,
  avisoLimiteSeleccion,
  claveFranja,
  fechaLegible,
  payloadCompletar,
  textoFranja,
} from "../utils/diasLibres";
import { confirmar } from "../utils/dialogs";

function tituloDia(grupo) {
  const fecha = fechaLegible(grupo.Fecha);
  return grupo.IndiceDia ? `Día ${grupo.IndiceDia} · ${fecha}` : fecha;
}

// US 92: el asistente detecta los días y franjas libres del itinerario y sugiere
// actividades para las que el usuario elija. Fases: cargando, seleccion, completo,
// generando, resultados y error.
export default function CompleteFreeDaysScreen({ visible, tripId, tripTitle, onClose, onGenerado }) {
  const [fase, setFase] = useState("cargando");
  const [datos, setDatos] = useState(null);
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [expandidaId, setExpandidaId] = useState(null);

  const cargar = useCallback(async () => {
    if (!tripId) return;
    setFase("cargando");
    setError("");
    setSeleccionadas([]);
    setResultado(null);
    try {
      const respuesta = await getFreeItinerarySlots(tripId);
      setDatos(respuesta);
      setFase(respuesta?.ItinerarioCompleto ? "completo" : "seleccion");
    } catch (err) {
      setError(err?.message || "No se pudieron detectar los días libres del itinerario.");
      setFase("error");
    }
  }, [tripId]);

  useEffect(() => {
    if (visible) cargar();
  }, [visible, cargar]);

  const franjas = datos?.Franjas ?? [];
  const restantes = datos?.SolicitudesRestantes ?? 0;
  const aviso = avisoLimiteSeleccion(seleccionadas.length, restantes);
  const puedeGenerar = seleccionadas.length > 0 && !aviso;

  function alternar(franja) {
    const clave = claveFranja(franja);
    setSeleccionadas((actuales) =>
      actuales.includes(clave) ? actuales.filter((c) => c !== clave) : [...actuales, clave]
    );
  }

  async function generar({ continuarSinPreferencias = false } = {}) {
    const elegidas = franjas.filter((f) => seleccionadas.includes(claveFranja(f)));
    setFase("generando");
    setError("");
    try {
      const respuesta = await completeFreeItinerarySlots(
        tripId,
        payloadCompletar(elegidas, { continuarSinPreferencias })
      );
      setResultado(respuesta);
      setDatos((actuales) =>
        actuales ? { ...actuales, SolicitudesRestantes: respuesta.SolicitudesRestantes } : actuales
      );
      setFase("resultados");
      onGenerado?.(respuesta);
    } catch (err) {
      if (err?.code === "NO_PREFERENCES" && !continuarSinPreferencias) {
        setFase("seleccion");
        const continuar = await confirmar({
          titulo: "Sin preferencias de planificación",
          mensaje: err.message,
          textoConfirmar: "Continuar",
          tipo: "info",
        });
        if (continuar) generar({ continuarSinPreferencias: true });
        return;
      }
      setError(err?.message || "No se pudieron generar las sugerencias.");
      setFase("seleccion");
    }
  }

  function renderCargando(texto) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.textoCentro}>{texto}</Text>
      </View>
    );
  }

  function renderCompleto() {
    return (
      <View style={styles.centro} testID="itinerario-completo">
        <View style={styles.iconoGrande}>
          <FontAwesome6 name="calendar-check" size={22} color={colors.primary} />
        </View>
        <Text style={styles.tituloCentro}>¡Tu itinerario está completo!</Text>
        <Text style={styles.textoCentro}>{datos?.Mensaje}</Text>
        <PrimaryButton label="Entendido" onPress={onClose} style={styles.botonCentro} />
      </View>
    );
  }

  function renderError() {
    return (
      <View style={styles.centro}>
        <FontAwesome6 name="circle-exclamation" size={22} color={colors.danger} />
        <Text style={styles.textoCentro}>{error}</Text>
        <PrimaryButton label="Reintentar" onPress={cargar} style={styles.botonCentro} variant="secondary" />
      </View>
    );
  }

  function renderSeleccion() {
    return (
      <>
        <Text style={styles.intro}>
          Elegí qué días y franjas querés completar. El asistente propone hasta{" "}
          {datos?.MaxSugerenciasPorFranja ?? 3} actividades por franja y cada una cuenta como una
          solicitud del límite diario del viaje.
        </Text>
        {agruparPorDia(franjas).map((grupo) => (
          <View key={grupo.IdDiaCronograma} style={styles.grupo}>
            <Text style={styles.grupoTitulo}>{tituloDia(grupo)}</Text>
            {grupo.items.map((franja) => {
              const clave = claveFranja(franja);
              const marcada = seleccionadas.includes(clave);
              return (
                <Pressable
                  key={clave}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: marcada }}
                  onPress={() => alternar(franja)}
                  style={({ pressed }) => [
                    styles.franja,
                    marcada && styles.franjaMarcada,
                    pressed && styles.presionado,
                  ]}
                  testID={`franja-libre-${clave}`}
                >
                  <FontAwesome6
                    name={franja.DiaCompleto ? "sun" : "clock"}
                    size={13}
                    color={colors.primary}
                  />
                  <Text style={styles.franjaTexto}>{textoFranja(franja)}</Text>
                  <View style={[styles.check, marcada && styles.checkActivo]}>
                    {marcada ? <FontAwesome6 name="check" size={11} color={colors.textInverse} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </>
    );
  }

  function renderResultados() {
    const grupos = agruparPorDia(resultado?.Resultados ?? []);
    const total = (resultado?.Resultados ?? []).reduce((n, r) => n + (r.Sugerencias?.length ?? 0), 0);
    return (
      <>
        <View style={styles.resumen}>
          <FontAwesome6 name="wand-magic-sparkles" size={14} color={colors.primary} />
          <Text style={styles.resumenTexto}>
            {total > 0
              ? `${total} ${total === 1 ? "sugerencia pendiente" : "sugerencias pendientes"}. Desde las sugerencias de cada día podés agregarlas al itinerario, descartarlas o proponerlas a votación.`
              : "No se generaron sugerencias para las franjas elegidas."}
          </Text>
        </View>
        {grupos.map((grupo) => (
          <View key={grupo.IdDiaCronograma} style={styles.grupo} testID={`resultado-dia-${grupo.IdDiaCronograma}`}>
            <Text style={styles.grupoTitulo}>{fechaLegible(grupo.Fecha)}</Text>
            {grupo.items.map((item) => (
              <View key={claveFranja(item)} style={styles.resultadoFranja}>
                <Text style={styles.resultadoFranjaTitulo}>
                  {item.HoraInicio} – {item.HoraFin}
                </Text>
                {item.Sugerencias?.length ? (
                  item.Sugerencias.map((sugerencia) => (
                    <SuggestionCompactCard
                      key={sugerencia.IdSugerenciaActividad}
                      sugerencia={sugerencia}
                      expandida={expandidaId === sugerencia.IdSugerenciaActividad}
                      onPress={() =>
                        setExpandidaId((actual) =>
                          actual === sugerencia.IdSugerenciaActividad ? null : sugerencia.IdSugerenciaActividad
                        )
                      }
                    />
                  ))
                ) : (
                  <Text style={[styles.resultadoMensaje, item.CodigoError && styles.resultadoError]}>
                    {item.Mensaje}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ))}
      </>
    );
  }

  function renderContenido() {
    if (fase === "cargando") return renderCargando("Buscando días y franjas libres…");
    if (fase === "generando") {
      return renderCargando(
        `Generando sugerencias para ${seleccionadas.length} ${seleccionadas.length === 1 ? "franja" : "franjas"}…`
      );
    }
    if (fase === "completo") return renderCompleto();
    if (fase === "error") return renderError();
    if (fase === "resultados") return renderResultados();
    return renderSeleccion();
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.headerTexts}>
              <Text style={styles.title}>Completar días libres</Text>
              {tripTitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {tripTitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel="Cerrar"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.closeButton}
              testID="completar-dias-libres-cerrar"
            >
              <FontAwesome6 name="xmark" size={16} color={colors.primary} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {renderContenido()}
          </ScrollView>

          {fase === "seleccion" ? (
            <View style={styles.pie}>
              <Text style={styles.pieTexto}>
                {seleccionadas.length} {seleccionadas.length === 1 ? "franja seleccionada" : "franjas seleccionadas"}
                {" · "}
                {restantes} {restantes === 1 ? "solicitud disponible" : "solicitudes disponibles"} hoy
              </Text>
              {aviso ? (
                <Text style={styles.pieAviso} testID="aviso-limite-franjas">
                  {aviso}
                </Text>
              ) : null}
              {error ? (
                <Text style={styles.pieAviso} testID="completar-dias-libres-error">
                  {error}
                </Text>
              ) : null}
              <PrimaryButton
                disabled={!puedeGenerar}
                icon="wand-magic-sparkles"
                iconPosition="left"
                label="Generar sugerencias"
                onPress={() => generar()}
                testID="generar-sugerencias-dias-libres"
              />
            </View>
          ) : null}

          {fase === "resultados" ? (
            <View style={styles.pie}>
              <PrimaryButton label="Listo" onPress={onClose} testID="completar-dias-libres-listo" />
            </View>
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
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  intro: {
    ...textStyles.meta,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  grupo: {
    gap: spacing.xs,
  },
  grupoTitulo: {
    ...textStyles.bodyStrong,
    fontSize: 14,
    color: colors.primary,
  },
  franja: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  franjaMarcada: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceMuted,
  },
  franjaTexto: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkActivo: {
    backgroundColor: colors.primary,
  },
  centro: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  iconoGrande: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentMuted,
  },
  tituloCentro: {
    ...textStyles.bodyStrong,
    fontSize: 16,
    color: colors.primary,
    textAlign: "center",
  },
  textoCentro: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
  },
  botonCentro: {
    marginTop: spacing.sm,
    alignSelf: "stretch",
  },
  resumen: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.accentMuted,
  },
  resumenTexto: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  resultadoFranja: {
    gap: spacing.xs,
  },
  resultadoFranjaTitulo: {
    ...textStyles.meta,
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  resultadoMensaje: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
  },
  resultadoError: {
    color: colors.danger,
  },
  pie: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pieTexto: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
  },
  pieAviso: {
    ...textStyles.meta,
    fontSize: 12,
    fontWeight: "600",
    color: colors.danger,
  },
  presionado: {
    opacity: 0.85,
  },
});
