import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Modal from "../ui/AppModal";
import PrimaryButton from "../ui/PrimaryButton";
import { appAlert } from "../ui/AppDialog";
import { exportItinerary } from "../../services/api";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import {
  MENSAJE_SIN_CONTENIDO,
  compartirArchivoExportado,
  diasExportables,
  errorReintentable,
  mensajeErrorExportacion,
  nombreArchivoItinerario,
  tieneContenido,
} from "../../utils/exportarItinerario";

const FORMATOS = [
  { id: "pdf", titulo: "PDF", detalle: "Para leer, imprimir o compartir", icono: "file-pdf" },
  { id: "ics", titulo: "Calendario", detalle: "Para Google, Apple u Outlook", icono: "calendar-plus" },
];

const MODOS = [
  { id: "todo", label: "Todo el viaje" },
  { id: "dias", label: "Elegir días" },
];

const AVISO =
  "El archivo refleja el itinerario de este momento. Si después hay cambios, vas a tener que exportarlo de nuevo.";

export default function ExportarItinerarioModal({
  visible,
  onClose,
  tripId,
  tripTitle,
  dias = [],
  exportar = exportItinerary,
  compartir = compartirArchivoExportado,
}) {
  const [formato, setFormato] = useState("pdf");
  const [modo, setModo] = useState("todo");
  const [seleccion, setSeleccion] = useState([]);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState(null);

  const opcionesDias = useMemo(() => diasExportables(dias), [dias]);

  useEffect(() => {
    if (!visible) return;
    setFormato("pdf");
    setModo("todo");
    setSeleccion([]);
    setGenerando(false);
    setError(null);
  }, [visible]);

  function elegirFormato(id) {
    setFormato(id);
    setError(null);
  }

  function elegirModo(id) {
    setModo(id);
    setError(null);
  }

  function alternarDia(dayId) {
    setError(null);
    setSeleccion((actual) =>
      actual.includes(dayId) ? actual.filter((id) => id !== dayId) : [...actual, dayId]
    );
  }

  async function generar() {
    if (generando) return;
    const elegidos = modo === "dias" ? seleccion : [];
    if (modo === "dias" && elegidos.length === 0) {
      setError({ mensaje: "Elegí al menos un día.", reintentable: false });
      return;
    }
    if (!tieneContenido(opcionesDias, elegidos)) {
      setError({ mensaje: MENSAJE_SIN_CONTENIDO, reintentable: false });
      return;
    }

    const nombreArchivo = nombreArchivoItinerario(tripTitle, formato);
    setGenerando(true);
    setError(null);
    try {
      const resultado = await exportar(tripId, { formato, dias: elegidos, nombreArchivo });
      const compartido =
        Platform.OS === "web" ? false : await compartir(resultado?.uri, formato);
      onClose?.();
      if (!compartido) {
        appAlert(
          "Itinerario exportado",
          Platform.OS === "web"
            ? `Se descargó "${nombreArchivo}".`
            : `Se guardó "${nombreArchivo}" en tu dispositivo.`,
          undefined,
          { tipo: "success" }
        );
      }
    } catch (fallo) {
      setError({ mensaje: mensajeErrorExportacion(fallo), reintentable: errorReintentable(fallo) });
    } finally {
      setGenerando(false);
    }
  }

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={generando ? undefined : onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.titulo}>Exportar itinerario</Text>
            <Pressable
              accessibilityLabel="Cerrar"
              accessibilityRole="button"
              disabled={generando}
              hitSlop={8}
              onPress={onClose}
            >
              <FontAwesome6 color={colors.textSecondary} name="xmark" size={18} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
            <Text style={styles.etiqueta}>Formato</Text>
            <View style={styles.formatos}>
              {FORMATOS.map((opcion) => {
                const activo = opcion.id === formato;
                return (
                  <Pressable
                    key={opcion.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: activo }}
                    disabled={generando}
                    onPress={() => elegirFormato(opcion.id)}
                    style={[styles.formato, activo && styles.formatoActivo]}
                    testID={`exportar-formato-${opcion.id}`}
                  >
                    <FontAwesome6
                      color={activo ? colors.accent : colors.primary}
                      name={opcion.icono}
                      size={20}
                    />
                    <Text style={[styles.formatoTitulo, activo && styles.textoActivo]}>
                      {opcion.titulo}
                    </Text>
                    <Text style={[styles.formatoDetalle, activo && styles.detalleActivo]}>
                      {opcion.detalle}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.etiqueta}>Días</Text>
            <View style={styles.modos}>
              {MODOS.map((opcion) => {
                const activo = opcion.id === modo;
                return (
                  <Pressable
                    key={opcion.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: activo }}
                    disabled={generando}
                    onPress={() => elegirModo(opcion.id)}
                    style={[styles.modo, activo && styles.modoActivo]}
                    testID={`exportar-modo-${opcion.id}`}
                  >
                    <Text style={[styles.modoTexto, activo && styles.textoActivo]}>
                      {opcion.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {modo === "dias" ? (
              <View style={styles.chips}>
                {opcionesDias.map((opcion) => {
                  const elegido = seleccion.includes(opcion.dayId);
                  return (
                    <Pressable
                      key={opcion.dayId}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: elegido }}
                      disabled={generando}
                      onPress={() => alternarDia(opcion.dayId)}
                      style={[styles.chip, elegido && styles.chipElegido]}
                      testID={`exportar-dia-${opcion.dayId}`}
                    >
                      {elegido ? (
                        <FontAwesome6 color={colors.textInverse} name="check" size={10} />
                      ) : null}
                      <Text style={[styles.chipTexto, elegido && styles.chipTextoElegido]}>
                        {opcion.etiqueta}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.aviso}>
              <FontAwesome6 color={colors.primary} name="circle-info" size={14} />
              <Text style={styles.avisoTexto}>{AVISO}</Text>
            </View>

            {error ? (
              <View style={styles.error} testID="exportar-error">
                <Text style={styles.errorTexto}>{error.mensaje}</Text>
                {error.reintentable ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={generar}
                    style={styles.reintentar}
                    testID="exportar-reintentar"
                  >
                    <FontAwesome6 color={colors.primary} name="arrows-rotate" size={12} />
                    <Text style={styles.reintentarTexto}>Reintentar</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          {generando ? (
            <View style={styles.progreso} testID="exportar-progreso">
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.progresoTexto}>Generando el archivo…</Text>
            </View>
          ) : null}

          <PrimaryButton
            label={generando ? "Generando…" : "Exportar"}
            icon="file-export"
            iconPosition="left"
            onPress={generar}
            disabled={generando}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(9, 19, 45, 0.7)",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "90%",
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titulo: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  contenido: {
    gap: spacing.sm,
  },
  etiqueta: {
    ...textStyles.sectionLabel,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  formatos: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  formato: {
    flex: 1,
    gap: 4,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  formatoActivo: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  formatoTitulo: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 15,
    marginTop: spacing.xxs,
  },
  formatoDetalle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 12,
  },
  textoActivo: {
    color: colors.textInverse,
  },
  detalleActivo: {
    color: "#dde7fb",
  },
  modos: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  modo: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  modoActivo: {
    backgroundColor: colors.primary,
  },
  modoTexto: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipElegido: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipTexto: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
    fontSize: 12,
  },
  chipTextoElegido: {
    color: colors.textInverse,
  },
  aviso: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  avisoTexto: {
    ...textStyles.meta,
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
  },
  error: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorTexto: {
    ...textStyles.meta,
    color: colors.danger,
    fontWeight: "600",
  },
  reintentar: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 4,
  },
  reintentarTexto: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
  },
  progreso: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  progresoTexto: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
});