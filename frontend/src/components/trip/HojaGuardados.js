import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, SectionList, StyleSheet, Text, View } from "react-native";

import Modal from "../ui/AppModal";
import ScreenContainer from "../layout/ScreenContainer";
import SearchPickerHeader, { SEARCH_PICKER_EDGES } from "../ui/SearchPickerHeader";
import { FilaGuardado } from "./SugerenciasGuardados";
import { gruposGuardados } from "../../utils/sugerenciasGuardados";
import { MODO_CIERRE_TECLADO } from "../../utils/teclado";
import { colors, spacing, textStyles } from "../../theme/tokens";

/**
 * Hoja "Tus guardados" de Nueva actividad ("Ver todos tus guardados"): todos los guardados
 * del viaje con buscador arriba (sin distinguir mayúsculas ni tildes) y dos grupos, "Sin
 * agendar" primero y "Ya en el itinerario" después, apagados. Mismo patrón que el
 * selector de Ubicación. Con `contexto` (viaje con varios destinos) los grupos son "En
 * <destino del día>" y "Otros destinos". Elegir uno llama a `onElegir`; la hoja la
 * cierra la pantalla.
 */
export default function HojaGuardados({ visible, lugares, contexto = null, onElegir, onCerrar }) {
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (visible) setBusqueda("");
  }, [visible]);

  const secciones = gruposGuardados(lugares, busqueda, contexto);

  return (
    <Modal statusBarTranslucent animationType="slide" visible={visible} onRequestClose={onCerrar}>
      <ScreenContainer fullWidth padded={false} edges={SEARCH_PICKER_EDGES}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SearchPickerHeader
            title="Tus guardados"
            onBack={onCerrar}
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar en tus guardados"
            autoFocus={false}
          />
          <View style={styles.flex} testID="hoja-guardados">
            {secciones.length > 0 ? (
              <SectionList
                sections={secciones}
                keyExtractor={(lugar) => String(lugar.id)}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={MODO_CIERRE_TECLADO}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={styles.contenido}
                renderSectionHeader={({ section }) => (
                  <Text style={styles.grupo} testID={`hoja-guardados-grupo-${section.clave}`}>
                    {section.titulo}
                  </Text>
                )}
                renderItem={({ item }) => (
                  <FilaGuardado
                    lugar={item}
                    busqueda={busqueda}
                    contexto={contexto}
                    onElegir={onElegir}
                    testID={`hoja-guardado-${item.id}`}
                  />
                )}
              />
            ) : (
              <Text style={styles.vacio}>{`No hay guardados que coincidan con «${busqueda.trim()}».`}</Text>
            )}
          </View>
        </KeyboardAvoidingView>
      </ScreenContainer>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  contenido: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  grupo: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  vacio: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
});
