import { FontAwesome6 } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import Modal from '../ui/AppModal';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { fontFamilies, radii, spacing, textStyles } from '../../theme/tokens';
import {
  ICONOS_DISPONIBLES,
  ICONO_POR_DEFECTO,
  normalizarNombreCategoria,
} from '../../utils/iconosCategorias';

export const LARGO_MAXIMO_NOMBRE = 50;

export const TIPOS_FORMULARIO = [
  { valor: 'gastos', etiqueta: 'Gastos' },
  { valor: 'documentos', etiqueta: 'Documentos' },
  { valor: 'checklist', etiqueta: 'Tareas del checklist' },
];

// Validación previa al envío; el backend aplica las mismas reglas (US 110).
export function validarCategoria({ nombre, icono, tipo, idActual = null }, existentes = []) {
  const errores = {};
  const limpio = String(nombre ?? '').trim().replace(/\s+/g, ' ');
  if (!limpio) {
    errores.nombre = 'Ingresá el nombre de la categoría.';
  } else if (limpio.length > LARGO_MAXIMO_NOMBRE) {
    errores.nombre = `El nombre puede tener hasta ${LARGO_MAXIMO_NOMBRE} caracteres.`;
  } else {
    const repetida = existentes.find(
      (cat) => cat.id !== idActual && normalizarNombreCategoria(cat.nombre) === normalizarNombreCategoria(limpio)
    );
    if (repetida) {
      const etiqueta = TIPOS_FORMULARIO.find((t) => t.valor === tipo)?.etiqueta.toLowerCase() ?? tipo;
      errores.nombre = `Ya existe una categoría de ${etiqueta} llamada "${repetida.nombre}".`;
    }
  }
  if (!icono) errores.icono = 'Elegí un ícono.';
  return { nombre: limpio, errores };
}

export default function FormularioCategoria({
  visible,
  modo = 'crear',
  tipoInicial = 'gastos',
  categoria = null,
  categoriasPorTipo = null,
  onCerrar,
  onGuardar,
}) {
  const editando = modo === 'editar';
  const [tipo, setTipo] = useState(tipoInicial);
  const [nombre, setNombre] = useState('');
  const [icono, setIcono] = useState(ICONO_POR_DEFECTO);
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTipo(categoria?.tipo ?? tipoInicial ?? 'gastos');
    setNombre(categoria?.nombre ?? '');
    setIcono(categoria?.icono ?? ICONO_POR_DEFECTO);
    setErrores({});
    setErrorGeneral('');
    setGuardando(false);
  }, [visible, categoria, tipoInicial]);

  // El ícono actual se ofrece aunque no esté entre los sugeridos.
  const iconos = ICONOS_DISPONIBLES.includes(icono) ? ICONOS_DISPONIBLES : [icono, ...ICONOS_DISPONIBLES];

  async function enviar() {
    const resultado = validarCategoria(
      { nombre, icono, tipo, idActual: categoria?.id ?? null },
      categoriasPorTipo?.[tipo] ?? []
    );
    setErrores(resultado.errores);
    setErrorGeneral('');
    if (Object.keys(resultado.errores).length) return;

    setGuardando(true);
    try {
      await onGuardar({ tipo, nombre: resultado.nombre, icono });
    } catch (error) {
      if (error?.codigo === 'CATEGORY_NAME_DUPLICATED') {
        setErrores({ nombre: error.message });
      } else {
        setErrorGeneral(error?.message || 'No se pudo guardar la categoría.');
      }
      setGuardando(false);
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onCerrar} transparent visible={visible}>
      <View style={styles.fondo}>
        <View style={styles.panel}>
          <View style={styles.cabecera}>
            <Text style={styles.titulo}>{editando ? 'Editar categoría' : 'Nueva categoría'}</Text>
            <Pressable accessibilityLabel="Cerrar" hitSlop={10} onPress={onCerrar}>
              <FontAwesome6 color={c.textoSecundario} name="xmark" size={16} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
            <Text style={styles.etiqueta}>Tipo</Text>
            {editando ? (
              <Text style={styles.tipoFijo}>
                {TIPOS_FORMULARIO.find((t) => t.valor === tipo)?.etiqueta}
              </Text>
            ) : (
              <View style={styles.chips}>
                {TIPOS_FORMULARIO.map((opcion) => {
                  const activo = opcion.valor === tipo;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected: activo }}
                      key={opcion.valor}
                      onPress={() => {
                        setTipo(opcion.valor);
                        setErrores((e) => ({ ...e, nombre: undefined }));
                      }}
                      style={[styles.chip, activo && styles.chipActivo]}
                      testID={`categoria-tipo-${opcion.valor}`}
                    >
                      <Text style={[styles.textoChip, activo && styles.textoChipActivo]}>{opcion.etiqueta}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={styles.etiqueta}>Nombre</Text>
            <TextInput
              accessibilityLabel="Nombre de la categoría"
              maxLength={LARGO_MAXIMO_NOMBRE}
              onChangeText={(valor) => {
                setNombre(valor);
                if (errores.nombre) setErrores((e) => ({ ...e, nombre: undefined }));
              }}
              onSubmitEditing={enviar}
              placeholder="Por ejemplo: Propinas"
              placeholderTextColor={c.textoTenue}
              style={[styles.input, errores.nombre && styles.inputError]}
              value={nombre}
            />
            <View style={styles.filaAyuda}>
              {errores.nombre ? <Text style={styles.textoError}>{errores.nombre}</Text> : <View />}
              <Text style={styles.contador}>
                {nombre.length}/{LARGO_MAXIMO_NOMBRE}
              </Text>
            </View>

            <Text style={styles.etiqueta}>Ícono</Text>
            <View style={styles.grilla}>
              {iconos.map((nombreIcono) => {
                const activo = nombreIcono === icono;
                return (
                  <Pressable
                    accessibilityLabel={`Ícono ${nombreIcono}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: activo }}
                    key={nombreIcono}
                    onPress={() => setIcono(nombreIcono)}
                    style={({ hovered }) => [styles.opcionIcono, hovered && styles.opcionHover, activo && styles.opcionActiva]}
                    testID={`categoria-icono-${nombreIcono}`}
                  >
                    <FontAwesome6 color={activo ? c.sobreAcento : c.texto} name={nombreIcono} size={15} />
                  </Pressable>
                );
              })}
            </View>
            {errores.icono ? <Text style={styles.textoError}>{errores.icono}</Text> : null}

            <View style={styles.vistaPrevia}>
              <View style={styles.iconoPrevia}>
                <FontAwesome6 color={c.acento} name={icono || ICONO_POR_DEFECTO} size={16} />
              </View>
              <Text style={styles.textoPrevia} numberOfLines={1}>
                {nombre.trim() || 'Vista previa'}
              </Text>
            </View>

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
              style={({ hovered }) => [styles.botonPrincipal, hovered && styles.opcionHover, guardando && styles.deshabilitado]}
              testID="categoria-guardar"
            >
              {guardando ? (
                <ActivityIndicator color={c.sobreAcento} size="small" />
              ) : (
                <Text style={styles.textoBotonPrincipal}>{editando ? 'Guardar cambios' : 'Crear categoría'}</Text>
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
  tipoFijo: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.bordeControl,
    backgroundColor: c.superficieElevada,
  },
  chipActivo: {
    borderColor: c.acento,
    backgroundColor: c.acentoMedio,
  },
  textoChip: {
    ...textStyles.meta,
    color: c.texto,
    fontSize: 13,
  },
  textoChipActivo: {
    ...textStyles.bodyStrong,
    color: c.acento,
    fontSize: 13,
  },
  input: {
    minHeight: 46,
    paddingHorizontal: spacing.md,
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
  grilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  opcionIcono: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  opcionHover: {
    opacity: 0.85,
  },
  opcionActiva: {
    borderColor: c.acento,
    backgroundColor: c.manteca,
  },
  vistaPrevia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  iconoPrevia: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.superficieElevada,
  },
  textoPrevia: {
    ...textStyles.bodyStrong,
    color: c.texto,
    flex: 1,
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
    minWidth: 150,
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
  deshabilitado: {
    opacity: 0.6,
  },
});
