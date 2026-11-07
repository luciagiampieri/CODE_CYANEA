import { useEffect, useRef, useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
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

import RecorridoTraslado from "../components/trip/RecorridoTraslado";
import { AvisoTraslado } from "../components/trip/TrasladoCard";
import Modal from "../components/ui/AppModal";
import OptionSheet from "../components/ui/OptionSheet";
import PrimaryButton from "../components/ui/PrimaryButton";
import SelectField from "../components/ui/SelectField";
import SelectorHora, { useSelectorHora } from "../components/ui/SelectorHora";
import { sheetFormStyles } from "../components/ui/sheetFormStyles";
import useScrollACampo from "../hooks/useScrollACampo";
import { colors, spacing, textStyles } from "../theme/tokens";
import { confirmar } from "../utils/dialogs";
import {
  MEDIOS_TRASLADO,
  VALIDEZ,
  etiquetaHoras,
  etiquetaTramo,
  nombreTraslado,
  pideLlegada,
  pideSalida,
  refDeTramo,
  subtituloDia,
  tituloFormulario,
  validarTraslado,
} from "../utils/traslados";

const ICONO_TRAMO = "route";
const SALIDA = "salida";
const LLEGADA = "llegada";
const ULTIMO_MINUTO_DEL_DIA = 23 * 60 + 59;

function horaDe(valor) {
  return String(valor ?? "").slice(0, 5);
}

function conSegundos(hora) {
  return hora ? `${hora}:00` : null;
}

function aMinutos(hora) {
  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
}

function fechaConMinutos(total) {
  const fecha = new Date();
  fecha.setHours(Math.floor(total / 60), total % 60, 0, 0);
  return fecha;
}

function aHora(fecha) {
  const horas = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

// Alta y edición de un traslado (US 136), con el mismo formato de hoja que AddActivityScreen.
// `tramo` es el tramo a agendar; `actividad`, el traslado que se edita. Si ya no corresponde
// al recorrido hay que elegir un tramo de `tramosLibres` para poder guardar.
export default function AddTrasladoScreen({
  visible,
  tramo = null,
  actividad = null,
  tramosLibres = [],
  dias = [],
  destinos = [],
  esAdmin = false,
  puedeCambiarRecorrido = false,
  nombreAdministrador = "",
  onCambiarRecorrido,
  onSubmit,
  onEliminar,
  onClose,
}) {
  // Al cerrar, el padre limpia las props: se conservan para que la hoja no cambie mientras baja.
  const ultimo = useRef({ tramo, actividad });
  if (visible && (tramo || actividad)) ultimo.current = { tramo, actividad };
  const { tramo: tramoNuevo, actividad: actividadEditada } = ultimo.current;

  const traslado = actividadEditada?.traslado ?? null;
  const tramoActual = tramoNuevo ?? traslado;
  const debeReasignar = traslado?.validez === VALIDEZ.NO_CORRESPONDE;

  const [tramoElegido, setTramoElegido] = useState(null);
  const [medio, setMedio] = useState(null);
  const [horaSalida, setHoraSalida] = useState("");
  const [horaLlegada, setHoraLlegada] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [panelMedio, setPanelMedio] = useState(false);
  const [panelTramo, setPanelTramo] = useState(false);

  const closingRef = useRef(false);
  const submittingRef = useRef(false);
  const { scrollRef, fieldY, scrollToField } = useScrollACampo();
  const selectorHora = useSelectorHora((tipo, fecha) => elegirHora(tipo, aHora(fecha)));

  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    submittingRef.current = false;
    setTramoElegido(null);
    setMedio(actividadEditada?.icon ?? null);
    setHoraSalida(
      actividadEditada && pideSalida(traslado) ? horaDe(actividadEditada.horaInicio) : ""
    );
    setHoraLlegada(
      actividadEditada && pideLlegada(traslado) ? horaDe(actividadEditada.horaFin) : ""
    );
    setNotas(actividadEditada?.note ?? "");
    setError("");
    setEnviando(false);
    setPanelMedio(false);
    setPanelTramo(false);
    selectorHora.cerrar();
  }, [visible, actividad, tramo]);

  // Tramo que define qué se pide y qué se valida.
  const tramoDestino = debeReasignar ? tramoElegido : tramoActual;
  const tramoVisible = tramoDestino ?? tramoActual;
  const sinTramosLibres = debeReasignar && tramosLibres.length === 0;
  const medioElegido = MEDIOS_TRASLADO.find((opcion) => opcion.name === medio);
  const opcionesTramo = tramosLibres.map((opcion) => ({
    name: etiquetaTramo(opcion),
    label: etiquetaTramo(opcion),
    icon: ICONO_TRAMO,
  }));

  function resetAndClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    setPanelMedio(false);
    setPanelTramo(false);
    selectorHora.cerrar();
    onClose?.();
  }

  function elegirHora(tipo, valor) {
    if (tipo === SALIDA) setHoraSalida(valor);
    else setHoraLlegada(valor);
    setError("");
  }

  function abrirHora(tipo) {
    Keyboard.dismiss();
    const actual = tipo === SALIDA ? horaSalida : horaLlegada;
    let fecha = new Date();
    if (actual) {
      fecha = fechaConMinutos(aMinutos(actual));
    } else if (tipo === LLEGADA && horaSalida) {
      fecha = fechaConMinutos(Math.min(aMinutos(horaSalida) + 60, ULTIMO_MINUTO_DEL_DIA));
    }
    selectorHora.abrir(tipo, fecha);
  }

  function elegirMedio(nombre) {
    setMedio(nombre);
    setPanelMedio(false);
    setError("");
  }

  function elegirTramo(etiqueta) {
    setTramoElegido(tramosLibres.find((opcion) => etiquetaTramo(opcion) === etiqueta) ?? null);
    setPanelTramo(false);
    setError("");
  }

  function mostrarError(mensaje) {
    setError(mensaje);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 0);
  }

  async function guardar(confirmarSuperposicion = false) {
    if (submittingRef.current) return;

    const mensaje = validarTraslado({ medio, tramo: tramoDestino, horaSalida, horaLlegada });
    if (mensaje) {
      mostrarError(mensaje);
      return;
    }

    setError("");
    submittingRef.current = true;
    setEnviando(true);
    try {
      const resultado = await onSubmit({
        ...(tramoNuevo || debeReasignar ? { tramo: refDeTramo(tramoDestino) } : {}),
        medio,
        horaSalida: pideSalida(tramoDestino) ? conSegundos(horaSalida) : null,
        horaLlegada: pideLlegada(tramoDestino) ? conSegundos(horaLlegada) : null,
        notas: notas.trim() || null,
        confirmarSuperposicion,
      });

      if (resultado?.requiereConfirmacion) {
        submittingRef.current = false;
        setEnviando(false);
        const seguir = await confirmar({
          titulo: "Atención",
          mensaje: resultado.mensaje,
          textoConfirmar: "Guardar igual",
          textoCancelar: "Revisar",
          tipo: "warning",
        });
        if (seguir) await guardar(true);
        return;
      }
      resetAndClose();
    } catch (err) {
      submittingRef.current = false;
      setEnviando(false);
      mostrarError(err.message || "No se pudo guardar el traslado.");
    }
  }

  const subtitulo = tramoVisible ? subtituloDia(tramoVisible, dias) : "";
  const horas = tramoDestino
    ? {
        salida: pideSalida(tramoDestino)
          ? {
              value: horaSalida,
              onPress: () => abrirHora(SALIDA),
              onWebChange: (valor) => elegirHora(SALIDA, valor),
            }
          : null,
        llegada: pideLlegada(tramoDestino)
          ? {
              value: horaLlegada,
              onPress: () => abrirHora(LLEGADA),
              onWebChange: (valor) => elegirHora(LLEGADA, valor),
            }
          : null,
      }
    : null;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={resetAndClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {tramoVisible ? (
              <ScrollView
                ref={scrollRef}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: spacing.xl }}
              >
                <View>
                  <View style={styles.headerRow}>
                    <Text style={[styles.title, styles.titleFlexible]}>
                      {medio
                        ? nombreTraslado(medio, tramoVisible)
                        : tituloFormulario(tramoVisible)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Cerrar"
                      onPress={resetAndClose}
                      hitSlop={10}
                      testID="traslado-cerrar"
                    >
                      <FontAwesome6 color={colors.textMuted} name="xmark" size={18} />
                    </Pressable>
                  </View>

                  {subtitulo ? <Text style={styles.subtitle}>{subtitulo}</Text> : null}

                  <AvisoTraslado traslado={traslado} testID="traslado-form-aviso" />

                  {debeReasignar ? (
                    <>
                      <Text style={styles.label}>Tramo del recorrido</Text>
                      {sinTramosLibres ? (
                        <Text style={styles.ayuda} testID="traslado-sin-tramos">
                          No hay tramos libres en el recorrido. Podés eliminar este traslado.
                        </Text>
                      ) : (
                        <SelectField
                          accessibilityLabel="Tramo del recorrido"
                          icono={ICONO_TRAMO}
                          valor={tramoElegido ? etiquetaTramo(tramoElegido) : ""}
                          placeholder="Seleccionar tramo"
                          onPress={() => setPanelTramo(true)}
                          testID="traslado-tramo"
                        />
                      )}
                    </>
                  ) : null}

                  <Text style={styles.label}>Medio de transporte</Text>
                  <SelectField
                    accessibilityLabel={`Medio de transporte${
                      medioElegido ? `: ${medioElegido.label}` : ""
                    }`}
                    icono={medioElegido ? medioElegido.name : "route"}
                    valor={medioElegido?.label ?? ""}
                    placeholder="Seleccionar medio"
                    onPress={() => setPanelMedio(true)}
                    testID="traslado-medio"
                  />

                  <Text style={styles.label}>{etiquetaHoras(tramoVisible)}</Text>
                  <RecorridoTraslado
                    tramo={tramoVisible}
                    destinos={destinos}
                    horas={horas}
                    esAdmin={esAdmin}
                    puedeCambiarRecorrido={puedeCambiarRecorrido}
                    nombreAdministrador={nombreAdministrador}
                    onCambiarRecorrido={onCambiarRecorrido}
                  />

                  {error ? (
                    <View style={styles.errorContainer}>
                      <FontAwesome6 name="circle-exclamation" size={14} color={colors.danger} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.label}>Notas (opcional)</Text>
                  <View
                    style={[styles.inputBox, styles.inputBoxMultiline]}
                    onLayout={(e) => {
                      fieldY.current.notas = e.nativeEvent.layout.y;
                    }}
                  >
                    <FontAwesome6
                      name="pen"
                      size={14}
                      color={colors.overlay}
                      style={styles.inputBoxMultilineIcon}
                    />
                    <TextInput
                      accessibilityLabel="Notas"
                      multiline
                      onChangeText={(texto) => {
                        setNotas(texto);
                        if (error) setError("");
                      }}
                      onFocus={() => scrollToField("notas")}
                      placeholder="Número de vuelo, empresa, terminal..."
                      placeholderTextColor={colors.overlay}
                      style={[styles.inputInner, styles.inputMultiline]}
                      value={notas}
                    />
                  </View>

                  <PrimaryButton
                    label={
                      enviando
                        ? "Guardando..."
                        : actividadEditada
                        ? "Guardar cambios"
                        : "Agendar traslado"
                    }
                    loading={enviando}
                    disabled={sinTramosLibres}
                    onPress={() => guardar()}
                    style={styles.submitButton}
                  />

                  {actividadEditada && onEliminar ? (
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={onEliminar}
                      style={styles.eliminar}
                      testID="traslado-eliminar"
                    >
                      <Text style={styles.eliminarTexto}>Eliminar traslado</Text>
                    </Pressable>
                  ) : null}
                </View>
              </ScrollView>
            ) : null}

            <OptionSheet
              visible={panelMedio}
              titulo="Seleccionar medio de transporte"
              opciones={MEDIOS_TRASLADO}
              seleccionado={medio}
              onSelect={elegirMedio}
              onClose={() => setPanelMedio(false)}
            />
            <OptionSheet
              visible={panelTramo}
              titulo="Seleccionar tramo"
              opciones={opcionesTramo}
              seleccionado={tramoElegido ? etiquetaTramo(tramoElegido) : null}
              onSelect={elegirTramo}
              onClose={() => setPanelTramo(false)}
            />

            <SelectorHora selector={selectorHora} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = {
  ...sheetFormStyles,
  ...StyleSheet.create({
    titleFlexible: {
      flex: 1,
      marginRight: spacing.sm,
    },
    eliminar: {
      alignSelf: "center",
      paddingVertical: spacing.xs,
    },
    eliminarTexto: {
      ...textStyles.bodyStrong,
      color: colors.danger,
    },
    ayuda: {
      ...textStyles.meta,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
  }),
};
