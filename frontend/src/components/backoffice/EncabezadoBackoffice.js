import { FontAwesome6 } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { backofficeColors as c } from '../../theme/backofficeTokens';
import { spacing, textStyles } from '../../theme/tokens';

export function BotonVolverBackoffice({ onPress, etiqueta = 'Volver al inicio', deshabilitado = false }) {
  return (
    <Pressable
      accessibilityLabel={etiqueta}
      accessibilityRole="button"
      accessibilityState={{ disabled: deshabilitado }}
      disabled={deshabilitado}
      hitSlop={8}
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.volver,
        hovered && !deshabilitado && styles.volverHover,
        deshabilitado && styles.deshabilitado,
        pressed && styles.presionado,
      ]}
      testID="backoffice-volver"
    >
      <FontAwesome6 color={c.textoSecundario} name="arrow-left" size={12} />
      <Text style={styles.textoVolver}>{etiqueta}</Text>
    </Pressable>
  );
}

export default function EncabezadoBackoffice({
  titulo,
  bajada,
  onVolver,
  etiquetaVolver,
  volverDeshabilitado = false,
  accion = null,
}) {
  return (
    <View style={styles.contenedor}>
      {onVolver ? (
        <BotonVolverBackoffice
          deshabilitado={volverDeshabilitado}
          etiqueta={etiquetaVolver}
          onPress={onVolver}
        />
      ) : null}
      <View style={styles.encabezado}>
        <View style={styles.textos}>
          <Text accessibilityRole="header" style={styles.titulo}>
            {titulo}
          </Text>
          {bajada ? <Text style={styles.bajada}>{bajada}</Text> : null}
        </View>
        {accion}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    marginBottom: spacing.xl,
  },
  volver: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  volverHover: {
    opacity: 0.8,
  },
  textoVolver: {
    ...textStyles.meta,
    color: c.textoSecundario,
  },
  encabezado: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  textos: {
    flexShrink: 1,
    maxWidth: 760,
  },
  titulo: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 36,
  },
  bajada: {
    ...textStyles.body,
    color: c.textoSecundario,
    marginTop: spacing.xs,
  },
  deshabilitado: {
    opacity: 0.5,
  },
  presionado: {
    transform: [{ scale: 0.985 }],
  },
});