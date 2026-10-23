import { FontAwesome6 } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import Modal from '../ui/AppModal';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { fontFamilies, radii, spacing, textStyles } from '../../theme/tokens';

export const LARGO_MAXIMO_MOTIVO = 500;

export function validarMotivo(valor) {
  const motivo = String(valor ?? '').trim();
  if (!motivo) return { motivo, error: 'Ingresá el motivo de la suspensión.' };
  if (motivo.length > LARGO_MAXIMO_MOTIVO) {
    return { motivo, error: `El motivo puede tener hasta ${LARGO_MAXIMO_MOTIVO} caracteres.` };
  }
  return { motivo, error: '' };
}

export default function FormularioSuspension({ visible, nombreUsuario, onCerrar, onConfirmar }) {
  const [paso, setPaso] = useState('motivo');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPaso('motivo');
    setTexto('');
    setError('');
    setErrorGeneral('');
    setEnviando(false);
  }, [visible]);

  function continuar() {
    const resultado = validarMotivo(texto);
    setError(resultado.error);
    if (!resultado.error) setPaso('confirmar');
  }

  async function suspender() {
    const resultado = validarMotivo(texto);
    if (resultado.error) {
      setError(resultado.error);
      setPaso('motivo');
      return;
    }
    setEnviando(true);
    setErrorGeneral('');
    try {
      await onConfirmar(resultado.motivo);
    } catch (err) {
      setErrorGeneral(err?.message || 'No se pudo suspender la cuenta.');
      setEnviando(false);
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onCerrar} transparent visible={visible}>
      <View style={styles.fondo}>
        <View style={styles.panel}>
          <View style={styles.cabecera}>
            <Text style={styles.titulo}>
              {paso === 'motivo' ? 'Suspender cuenta' : '¿Confirmar la suspensión?'}
            </Text>
            <Pressable accessibilityLabel="Cerrar" disabled={enviando} hitSlop={10} onPress={onCerrar}>
              <FontAwesome6 color={c.textoSecundario} name="xmark" size={16} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
            {paso === 'motivo' ? (
              <>
                <Text style={styles.texto}>
                  Vas a suspender temporalmente la cuenta de{' '}
                  <Text style={styles.textoFuerte}>{nombreUsuario}</Text>. El motivo es obligatorio y se
                  le enviará por correo.
                </Text>
                <Text style={styles.etiqueta}>Motivo de la suspensión</Text>
                <TextInput
                  accessibilityLabel="Motivo de la suspensión"
                  maxLength={LARGO_MAXIMO_MOTIVO}
                  multiline
                  numberOfLines={4}
                  onChangeText={(valor) => {
                    setTexto(valor);
                    if (error) setError('');
                  }}
                  placeholder="Por ejemplo: uso indebido de la plataforma"
                  placeholderTextColor={c.textoTenue}
                  style={[styles.input, error && styles.inputError]}
                  textAlignVertical="top"
                  value={texto}
                />
                <View style={styles.filaAyuda}>
                  {error ? <Text style={styles.textoError}>{error}</Text> : <View />}
                  <Text style={styles.contador}>
                    {texto.length}/{LARGO_MAXIMO_MOTIVO}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.texto}>
                  Al confirmar, la cuenta de <Text style={styles.textoFuerte}>{nombreUsuario}</Text> pasará a
                  estado Suspendida:
                </Text>
                <View style={styles.lista}>
                  <Text style={styles.item}>• Se cerrarán todas sus sesiones activas.</Text>
                  <Text style={styles.item}>• No podrá iniciar sesión por ningún método.</Text>
                  <Text style={styles.item}>• Se le enviará un correo con el motivo.</Text>
                  <Text style={styles.item}>
                    • Su información en los viajes se conserva y su suscripción no se cancela.
                  </Text>
                </View>
                <Text style={styles.etiqueta}>Motivo</Text>
                <View style={styles.citaMotivo}>
                  <Text style={styles.texto}>{texto.trim()}</Text>
                </View>
              </>
            )}

            {errorGeneral ? (
              <View style={styles.cajaError}>
                <FontAwesome6 color={c.peligro} name="circle-exclamation" size={13} />
                <Text style={styles.textoError}>{errorGeneral}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.pie}>
            {paso === 'motivo' ? (
              <>
                <Pressable onPress={onCerrar} style={styles.botonSecundario}>
                  <Text style={styles.textoBotonSecundario}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={continuar}
                  style={({ hovered }) => [styles.botonPeligro, hovered && styles.hover]}
                  testID="suspension-continuar"
                >
                  <Text style={styles.textoBotonPeligro}>Continuar</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable disabled={enviando} onPress={() => setPaso('motivo')} style={styles.botonSecundario}>
                  <Text style={styles.textoBotonSecundario}>Volver</Text>
                </Pressable>
                <Pressable
                  disabled={enviando}
                  onPress={suspender}
                  style={({ hovered }) => [styles.botonPeligro, hovered && styles.hover, enviando && styles.deshabilitado]}
                  testID="suspension-confirmar"
                >
                  {enviando ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.textoBotonPeligro}>Sí, suspender cuenta</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  panel: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.bordeFuerte,
    backgroundColor: c.panel,
    overflow: 'hidden',
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: c.borde,
  },
  titulo: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 24,
    flexShrink: 1,
  },
  cuerpo: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  texto: {
    ...textStyles.body,
    color: c.textoSecundario,
  },
  textoFuerte: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  etiqueta: {
    ...textStyles.label,
    color: c.textoSecundario,
    marginTop: spacing.md,
  },
  input: {
    minHeight: 110,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeControl,
    backgroundColor: c.fondo,
    color: c.texto,
    fontFamily: fontFamilies.sans,
    fontSize: 15,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  inputError: {
    borderColor: c.peligro,
  },
  filaAyuda: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  contador: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
  },
  lista: {
    gap: 4,
    marginTop: spacing.xs,
  },
  item: {
    ...textStyles.body,
    color: c.textoSecundario,
  },
  citaMotivo: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  cajaError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.peligro,
    backgroundColor: c.peligroSuave,
  },
  textoError: {
    ...textStyles.meta,
    color: c.peligro,
    flexShrink: 1,
  },
  pie: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: c.borde,
  },
  botonSecundario: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeFuerte,
  },
  textoBotonSecundario: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  botonPeligro: {
    minHeight: 42,
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: c.peligro,
  },
  textoBotonPeligro: {
    ...textStyles.bodyStrong,
    color: '#FFFFFF',
  },
  hover: {
    opacity: 0.9,
  },
  deshabilitado: {
    opacity: 0.6,
  },
});