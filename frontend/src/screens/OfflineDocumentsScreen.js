import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import ScreenContainer from "../components/layout/ScreenContainer";
import EmptyState from "../components/ui/EmptyState";
import ListRow from "../components/ui/ListRow";
import ScreenHeader from "../components/ui/ScreenHeader";
import SectionCard from "../components/ui/SectionCard";
import { appAlert } from "../components/ui/AppDialog";
import useResponsive from "../hooks/useResponsive";
import { quitarDocumentoOffline, resumenEspacioOffline } from "../database/offlineViajes";
import { colors, spacing, textStyles } from "../theme/tokens";

export function formatearTamano(bytes) {
  const valor = Number(bytes) || 0;
  if (valor <= 0) return "0 KB";
  if (valor < 1024 * 1024) return `${Math.max(1, Math.round(valor / 1024))} KB`;
  return `${(valor / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export default function OfflineDocumentsScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const [resumen, setResumen] = useState({ viajes: [], totalBytes: 0 });

  const cargar = useCallback(() => {
    setResumen(resumenEspacioOffline());
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  function confirmarQuitar(guardado) {
    const nombre = guardado.documento?.NombreArchivo ?? "Documento";
    appAlert(
      "Quitar del dispositivo",
      `"${nombre}" va a dejar de estar disponible sin conexión. Podés volver a guardarlo desde el viaje.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Quitar",
          style: "destructive",
          onPress: () => {
            quitarDocumentoOffline(guardado.idDocumento);
            cargar();
          },
        },
      ]
    );
  }

  function confirmarQuitarViaje(viaje) {
    appAlert(
      "Quitar documentos del viaje",
      `Se van a quitar de este dispositivo los ${viaje.documentos.length} documentos guardados de "${viaje.titulo}".`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Quitar todos",
          style: "destructive",
          onPress: () => {
            viaje.documentos.forEach((guardado) => quitarDocumentoOffline(guardado.idDocumento));
            cargar();
          },
        },
      ]
    );
  }

  const hayDocumentos = resumen.viajes.length > 0;

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Documentos sin conexión"
          subtitle={
            hayDocumentos
              ? `Ocupan ${formatearTamano(resumen.totalBytes)} en este dispositivo`
              : "Guardá documentos desde la pestaña Docs de cada viaje"
          }
          onBack={() => navigation.goBack()}
          backTestID="offline-docs-back-button"
        />

        <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
          {!hayDocumentos ? (
            <EmptyState
              icon="cloud-arrow-down"
              title="No hay documentos guardados"
              body="Los documentos que marques como disponibles sin conexión van a aparecer acá."
              testID="offline-docs-empty"
            />
          ) : (
            resumen.viajes.map((viaje) => (
              <SectionCard
                key={viaje.idViaje}
                label={`${viaje.titulo} · ${formatearTamano(viaje.tamanoBytes)}`}
                testID={`offline-docs-viaje-${viaje.idViaje}`}
              >
                {viaje.documentos.map((guardado) => (
                  <ListRow
                    key={guardado.idDocumento}
                    icon="file-lines"
                    title={guardado.documento?.NombreArchivo ?? "Documento"}
                    subtitle={`${guardado.documento?.NombreCategoria ?? "Sin categoría"} · ${formatearTamano(
                      guardado.tamanoBytes
                    )}`}
                    onPress={() => confirmarQuitar(guardado)}
                    right={<FontAwesome6 name="trash" size={14} color={colors.danger} />}
                    testID={`offline-docs-documento-${guardado.idDocumento}`}
                    divider
                  />
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => confirmarQuitarViaje(viaje)}
                  style={({ pressed }) => [styles.quitarTodos, pressed && styles.pressed]}
                  testID={`offline-docs-quitar-viaje-${viaje.idViaje}`}
                >
                  <FontAwesome6 name="broom" size={13} color={colors.danger} />
                  <Text style={styles.quitarTodosTexto}>Quitar todos los documentos de este viaje</Text>
                </Pressable>
              </SectionCard>
            ))
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  bodyDesktop: {
    maxWidth: 520,
    alignSelf: "center",
    width: "100%",
  },
  quitarTodos: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.md,
  },
  quitarTodosTexto: {
    ...textStyles.meta,
    color: colors.danger,
    fontWeight: "700",
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
});