import { FontAwesome6 } from '@expo/vector-icons';
import { createElement } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { backofficeColors as c } from '../../theme/backofficeTokens';
import { fontFamilies, radii, spacing, textStyles } from '../../theme/tokens';

export default function CampoFecha({ etiqueta, valor, maximo, onCambiar }) {
  return (
    <View style={styles.grupo}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <View style={styles.caja}>
        <FontAwesome6 color={c.textoTenue} name="calendar" size={13} />
        {Platform.OS === 'web' ? (
          createElement('input', {
            type: 'date',
            value: valor || '',
            max: maximo,
            'aria-label': etiqueta,
            onChange: (evento) => onCambiar(evento.target.value),
            style: estiloInputWeb,
          })
        ) : (
          <TextInput
            accessibilityLabel={etiqueta}
            onChangeText={onCambiar}
            placeholder="AAAA-MM-DD"
            placeholderTextColor={c.textoTenue}
            style={styles.input}
            value={valor || ''}
          />
        )}
      </View>
    </View>
  );
}

const estiloInputWeb = {
  flex: 1,
  minWidth: 0,
  height: 42,
  padding: 0,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: c.texto,
  colorScheme: 'dark',
  fontFamily: fontFamilies.sans,
  fontSize: 15,
  cursor: 'pointer',
};

const styles = StyleSheet.create({
  grupo: {
    gap: 6,
  },
  etiqueta: {
    ...textStyles.meta,
    color: c.textoSecundario,
    fontSize: 12,
  },
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: 200,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeControl,
    backgroundColor: c.fondo,
  },
  input: {
    flex: 1,
    height: 42,
    color: c.texto,
    fontFamily: fontFamilies.sans,
    fontSize: 15,
  },
});