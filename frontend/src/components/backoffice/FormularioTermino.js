import { FontAwesome6 } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import Modal from '../ui/AppModal';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { fontFamilies, radii, spacing, textStyles } from '../../theme/tokens';

export const LARGO_MAXIMO_NUMERO = 30;
export const LARGO_MAXIMO_TITULO = 200;
export const LARGO_MAXIMO_CONTENIDO = 100000;

export function validarTermino({ numero, titulo, contenido }) {
  const errores = {};
  const numeroLimpio = String(numero ?? '').trim();
  const tituloLimpio = String(titulo ?? '').trim().replace(/\s+/g, ' ');
  const contenidoLimpio = String(contenido ?? '').replace(/\r\n/g, '\n').trim();

  if (!numeroLimpio) errores.numero = 'Ingresá el número de versión.';
  else if (numeroLimpio.length > LARGO_MAXIMO_NUMERO) {
    errores.numero = `El número de versión puede tener hasta ${LARGO_MAXIMO_NUMERO} caracteres.`;
  }
  if (!tituloLimpio) errores.titulo = 'Ingresá el título.';
  else if (tituloLimpio.length > LARGO_MAXIMO_TITULO) {
    errores.titulo = `El título puede tener hasta ${LARGO_MAXIMO_TITULO} caracteres.`;
  }
  if (!contenidoLimpio) errores.contenido = 'Ingresá el contenido.';
  else if (contenidoLimpio.length > LARGO_MAXIMO_CONTENIDO) {
    errores.contenido = `El contenido puede tener hasta ${LARGO_MAXIMO_CONTENIDO} caracteres.`;
  }

  return { valores: { numero: numeroLimpio, titulo: tituloLimpio, contenido: contenidoLimpio }, errores };
}

export default function FormularioTermino({ visible, modo = 'crear', version = null, onCerrar, onGuardar }) {
  const editando = modo === 'editar';
  const [numero, setNumero] = useState('');
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setNumero(version?.numero ?? '');
    setTitulo(version?.titulo ?? '');
    setContenido(version?.contenido ?? '');
    setErrores({});
    setErrorGeneral('');
    setGuardando(false);
  }, [visible, version]);

  function limpiarError(campo) {
    setErrores((e) => (e[campo] ? { ...e, [campo]: undefined } : e));
  }

  async function enviar() {
    const resultado = validarTermino({ numero, titulo, contenido });
    setErrores(resultado.errores);
    setErrorGeneral('');
    if (Object.keys(resultado.errores).length) return;

    setGuardando(true);
    try {
      await onGuardar(resultado.valores);
    } catch (error) {
      if (error?.codigo === 'TERMS_VERSION_NUMBER_DUPLICATED') {
        setErrores({ numero: error.message });
      } else {
        setErrorGeneral(error?.message || 'No se pudo guardar la versión.');
      }
      setGuardando(false);
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onCerrar} transparent visible={visible}>
      <View style={styles.fondo}>
        <View style={styles.panel}>
          <View style={styles.cabecera}>
            <Text style={styles.titulo}>{editando ? 'Editar versión' : 'Nueva versión'}</Text>
            <Pressable accessibilityLabel="Cerrar" hitSlop={10} onPress={onCerrar}>
              <FontAwesome6 color={c.textoSecundario} name="xmark" size={16} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
            <Text style={styles.etiqueta}>Número de versión</Text>
            <TextInput
              accessibilityLabel="Número de versión"
              autoCapitalize="none"
              maxLength={LARGO_MAXIMO_NUMERO}
              onChangeText={(valor) => {
                setNumero(valor);
                limpiarError('numero');
              }}
              placeholder="Por ejemplo: 2027-01-15"
              placeholderTextColor={c.textoTenue}
              style={[styles.input, errores.numero && styles.inputError]}
              value={numero}
            />
            {errores.numero ? <Text style={styles.textoError}>{errores.numero}</Text> : null}

            <Text style={styles.etiqueta}>Título</Text>
            <TextInput
              accessibilityLabel="Título"
              maxLength={LARGO_MAXIMO_TITULO}
              onChangeText={(valor) => {
                setTitulo(valor);
                limpiarError('titulo');
              }}
              placeholder="Términos y Condiciones de Cyanea"
              placeholderTextColor={c.textoTenue}
              style={[styles.input, errores.titulo && styles.inputError]}
              value={titulo}
            />
            {errores.titulo ? <Text style={styles.textoError}>{errores.titulo}</Text> : null}

            <Text style={styles.etiqueta}>Contenido</Text>
            <Text style={styles.ayuda}>
              Separá las secciones con una línea en blanco. Para titular una sección, escribí en la
              primera línea "1. Título" y el texto desde la línea siguiente.
            </Text>
            <TextInput
              accessibilityLabel="Contenido"
              multiline
              onChangeText={(valor) => {
                setContenido(valor);
                limpiarError('contenido');
              }}
              placeholder={'1. Objeto de la plataforma\nTexto de la sección.'}
              placeholderTextColor={c.textoTenue}
              style={[styles.input, styles.inputContenido, errores.contenido && styles.inputError]}
              textAlignVertical="top"
              value={contenido}
            />
            {errores.contenido ? <Text style={styles.textoError}>{errores.contenido}</Text> : null}

            {errorGeneral ? (
              <View style={styles.cajaError}>
                <FontAwesome6 color={c.peligro} name="circle-exclamation" size={13} />
                <Text style={styles.textoError}>{errorGeneral}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.pie}>
            <Pressable disabled={guardando} onPress={onCerrar} style={styles.botonSecundario}>
              <Text style={styles.textoBotonSecundario}>Cancelar</Text>
            </Pressable>
            <Pressable
              disabled={guardando}
              onPress={enviar}
              style={({ hovered }) => [styles.botonPrincipal, hovered && styles.hover, guardando && styles.deshabilitado]}
              testID="termino-guardar"
            >
              {guardando ? (
                <ActivityIndicator color={c.sobreAcento} size="small" />
              ) : (
                <Text style={styles.textoBotonPrincipal}>
                  {editando ? 'Guardar cambios' : 'Guardar borrador'}
                </Text>
              )}
            </Pressable>
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
    maxWidth: 720,
    maxHeight: '94%',
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
  },
  cuerpo: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  etiqueta: {
    ...textStyles.label,
    color: c.textoSecundario,
    marginTop: spacing.sm,
  },
  ayuda: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
  },
  input: {
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeControl,
    backgroundColor: c.fondo,
    color: c.texto,
    fontFamily: fontFamilies.sans,
    fontSize: 15,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  inputContenido: {
    minHeight: 260,
  },
  inputError: {
    borderColor: c.peligro,
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
  botonPrincipal: {
    minHeight: 42,
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: c.manteca,
  },
  textoBotonPrincipal: {
    ...textStyles.bodyStrong,
    color: c.sobreAcento,
  },
  hover: {
    opacity: 0.9,
  },
  deshabilitado: {
    opacity: 0.6,
  },
});