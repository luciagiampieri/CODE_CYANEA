import { FontAwesome6 } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import FormularioCategoria from '../../components/backoffice/FormularioCategoria';
import { appToast } from '../../components/ui/AppDialog';
import {
  actualizarCategoria,
  cambiarEstadoCategoria,
  crearCategoria,
  eliminarCategoria,
  listarCategorias,
} from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { radii, spacing, textStyles } from '../../theme/tokens';
import { avisar, confirmar } from '../../utils/dialogs';

export const SECCIONES_CATEGORIAS = [
  { tipo: 'gastos', titulo: 'Gastos', icono: 'wallet', singular: 'gasto', plural: 'gastos' },
  { tipo: 'documentos', titulo: 'Documentos', icono: 'folder-open', singular: 'documento', plural: 'documentos' },
  {
    tipo: 'checklist',
    titulo: 'Tareas del checklist',
    icono: 'list-check',
    singular: 'tarea',
    plural: 'tareas',
  },
];

function seccionDe(tipo) {
  return SECCIONES_CATEGORIAS.find((s) => s.tipo === tipo);
}

export function textoUsos(cantidad, tipo) {
  const seccion = seccionDe(tipo);
  if (!cantidad) return 'Sin uso';
  return `En uso en ${cantidad} ${cantidad === 1 ? seccion.singular : seccion.plural}`;
}

export default function BackofficeCategoriasScreen({ onVolver }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  // { modo: 'crear' | 'editar', tipo, categoria? }
  const [formulario, setFormulario] = useState(null);
  const [procesandoId, setProcesandoId] = useState(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    listarCategorias()
      .then((respuesta) => {
        if (vigente) setDatos(respuesta);
      })
      .catch((err) => {
        if (vigente) setError(err?.message || 'No se pudieron cargar las categorías.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [recarga]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  async function guardar({ tipo, nombre, icono }) {
    if (formulario.modo === 'crear') {
      await crearCategoria({ tipo, nombre, icono });
      appToast('Categoría creada');
    } else {
      await actualizarCategoria(formulario.tipo, formulario.categoria.id, { nombre, icono });
      appToast('Categoría actualizada');
    }
    setFormulario(null);
    recargar();
  }

  async function ejecutar(categoria, accion, mensajeExito) {
    setProcesandoId(`${categoria.tipo}-${categoria.id}`);
    try {
      await accion();
      appToast(mensajeExito);
      recargar();
    } catch (err) {
      avisar('No se pudo completar la acción', err?.message || 'Ocurrió un error inesperado.');
    } finally {
      setProcesandoId(null);
    }
  }

  async function cambiarEstado(categoria) {
    if (categoria.activa) {
      const acepta = await confirmar({
        titulo: '¿Desactivar la categoría?',
        mensaje: `"${categoria.nombre}" no se ofrecerá al registrar nuevos elementos. Los que ya la usan la conservan.`,
        textoConfirmar: 'Desactivar',
        tipo: 'warning',
      });
      if (!acepta) return;
    }
    await ejecutar(
      categoria,
      () => cambiarEstadoCategoria(categoria.tipo, categoria.id, !categoria.activa),
      categoria.activa ? 'Categoría desactivada' : 'Categoría activada'
    );
  }

  async function eliminar(categoria) {
    if (categoria.cantidadUsos > 0) {
      // CA 6: una categoría en uso no se elimina; se ofrece desactivarla.
      if (!categoria.activa) {
        avisar(
          'No se puede eliminar',
          `"${categoria.nombre}" está en uso (${textoUsos(categoria.cantidadUsos, categoria.tipo).toLowerCase()}). Ya está desactivada, así que no se ofrece en nuevos registros.`
        );
        return;
      }
      const desactivar = await confirmar({
        titulo: 'No se puede eliminar',
        mensaje: `"${categoria.nombre}" está en uso (${textoUsos(categoria.cantidadUsos, categoria.tipo).toLowerCase()}). ¿Querés desactivarla para que no se ofrezca en nuevos registros?`,
        textoConfirmar: 'Desactivar',
        tipo: 'warning',
      });
      if (desactivar) {
        await ejecutar(
          categoria,
          () => cambiarEstadoCategoria(categoria.tipo, categoria.id, false),
          'Categoría desactivada'
        );
      }
      return;
    }

    const acepta = await confirmar({
      titulo: '¿Eliminar la categoría?',
      mensaje: `"${categoria.nombre}" se eliminará definitivamente.`,
      textoConfirmar: 'Eliminar',
      destructivo: true,
    });
    if (!acepta) return;
    await ejecutar(categoria, () => eliminarCategoria(categoria.tipo, categoria.id), 'Categoría eliminada');
  }

  let contenido;
  if (cargando && !datos) {
    contenido = (
      <View style={styles.centro}>
        <ActivityIndicator color={c.acento} size="large" />
      </View>
    );
  } else if (error) {
    contenido = (
      <View style={styles.cajaError}>
        <FontAwesome6 color={c.peligro} name="circle-exclamation" size={14} />
        <Text style={styles.textoError}>{error}</Text>
        <Pressable onPress={recargar} style={styles.botonSecundario}>
          <Text style={styles.textoBotonSecundario}>Reintentar</Text>
        </Pressable>
      </View>
    );
  } else {
    contenido = (
      <View style={[styles.secciones, cargando && styles.recargando]}>
        {SECCIONES_CATEGORIAS.map((seccion) => (
          <SeccionCategorias
            categorias={datos?.[seccion.tipo] ?? []}
            key={seccion.tipo}
            onAgregar={() => setFormulario({ modo: 'crear', tipo: seccion.tipo })}
            onCambiarEstado={cambiarEstado}
            onEditar={(categoria) => setFormulario({ modo: 'editar', tipo: seccion.tipo, categoria })}
            onEliminar={eliminar}
            procesandoId={procesandoId}
            seccion={seccion}
          />
        ))}
      </View>
    );
  }

  return (
    <View>
      <Pressable onPress={onVolver} style={({ pressed }) => [styles.volver, pressed && styles.presionado]}>
        <FontAwesome6 color={c.textoSecundario} name="arrow-left" size={12} />
        <Text style={styles.textoVolver}>Volver al inicio</Text>
      </Pressable>

      <View style={styles.encabezado}>
        <View style={styles.textosEncabezado}>
          <Text style={styles.titulo}>Categorías</Text>
          <Text style={styles.bajada}>
            Administrá las categorías que se ofrecen a los viajeros al registrar gastos, documentos y
            tareas del checklist.
          </Text>
        </View>
        <Pressable
          onPress={() => setFormulario({ modo: 'crear', tipo: 'gastos' })}
          style={({ hovered, pressed }) => [
            styles.botonPrincipal,
            hovered && styles.hover,
            pressed && styles.presionado,
          ]}
          testID="categorias-nueva"
        >
          <FontAwesome6 color={c.sobreAcento} name="plus" size={13} />
          <Text style={styles.textoBotonPrincipal}>Nueva categoría</Text>
        </Pressable>
      </View>

      {contenido}

      <FormularioCategoria
        categoria={formulario?.categoria}
        categoriasPorTipo={datos}
        modo={formulario?.modo}
        onCerrar={() => setFormulario(null)}
        onGuardar={guardar}
        tipoInicial={formulario?.tipo}
        visible={Boolean(formulario)}
      />
    </View>
  );
}

function SeccionCategorias({ seccion, categorias, onAgregar, onEditar, onCambiarEstado, onEliminar, procesandoId }) {
  const activas = categorias.filter((categoria) => categoria.activa).length;

  return (
    <View style={styles.seccion} testID={`categorias-seccion-${seccion.tipo}`}>
      <View style={styles.encabezadoSeccion}>
        <View style={styles.iconoSeccion}>
          <FontAwesome6 color={c.acento} name={seccion.icono} size={14} />
        </View>
        <View style={styles.textosSeccion}>
          <Text style={styles.tituloSeccion}>{seccion.titulo}</Text>
          <Text style={styles.metaSeccion}>
            {categorias.length} {categorias.length === 1 ? 'categoría' : 'categorías'} · {activas}{' '}
            {activas === 1 ? 'activa' : 'activas'}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`Agregar categoría de ${seccion.titulo.toLowerCase()}`}
          onPress={onAgregar}
          style={({ hovered, pressed }) => [styles.botonAgregar, hovered && styles.hoverBorde, pressed && styles.presionado]}
        >
          <FontAwesome6 color={c.texto} name="plus" size={12} />
          <Text style={styles.textoAgregar}>Agregar</Text>
        </Pressable>
      </View>

      {categorias.length === 0 ? (
        <Text style={styles.sinCategorias}>Todavía no hay categorías de este tipo.</Text>
      ) : (
        categorias.map((categoria, indice) => (
          <FilaCategoria
            categoria={categoria}
            key={categoria.id}
            onCambiarEstado={onCambiarEstado}
            onEditar={onEditar}
            onEliminar={onEliminar}
            procesando={procesandoId === `${categoria.tipo}-${categoria.id}`}
            ultima={indice === categorias.length - 1}
            unicaActiva={categoria.activa && activas === 1}
          />
        ))
      )}
    </View>
  );
}

function FilaCategoria({ categoria, ultima, unicaActiva, procesando, onEditar, onCambiarEstado, onEliminar }) {
  const protegida = categoria.esSistema;
  const id = `${categoria.tipo}-${categoria.id}`;
  let motivoSinDesactivar = '';
  if (protegida) motivoSinDesactivar = 'La usa el sistema';
  else if (unicaActiva) motivoSinDesactivar = 'Única categoría activa del tipo';

  return (
    <View style={[styles.fila, !ultima && styles.filaConBorde]} testID={`categoria-${id}`}>
      <View style={[styles.iconoCategoria, !categoria.activa && styles.iconoInactivo]}>
        <FontAwesome6 color={categoria.activa ? c.acento : c.textoTenue} name={categoria.icono} size={15} />
      </View>

      <View style={styles.datosCategoria}>
        <View style={styles.filaNombre}>
          <Text style={[styles.nombre, !categoria.activa && styles.nombreInactivo]} numberOfLines={1}>
            {categoria.nombre}
          </Text>
          {!categoria.activa ? <Etiqueta texto="Inactiva" /> : null}
          {protegida ? <Etiqueta icono="lock" resaltada texto="Sistema" /> : null}
        </View>
        <Text style={styles.usos}>
          {textoUsos(categoria.cantidadUsos, categoria.tipo)}
          {motivoSinDesactivar && categoria.activa ? ` · ${motivoSinDesactivar}` : ''}
        </Text>
      </View>

      {procesando ? (
        <ActivityIndicator color={c.acento} size="small" />
      ) : (
        <View style={styles.acciones}>
          <BotonAccion
            etiqueta={`Editar ${categoria.nombre}`}
            icono="pen"
            onPress={() => onEditar(categoria)}
            testID={`categoria-editar-${id}`}
          />
          <BotonAccion
            deshabilitado={categoria.activa && Boolean(motivoSinDesactivar)}
            etiqueta={`${categoria.activa ? 'Desactivar' : 'Activar'} ${categoria.nombre}`}
            icono={categoria.activa ? 'eye-slash' : 'eye'}
            onPress={() => onCambiarEstado(categoria)}
            testID={`categoria-estado-${id}`}
          />
          <BotonAccion
            deshabilitado={protegida || unicaActiva}
            etiqueta={`Eliminar ${categoria.nombre}`}
            icono="trash"
            onPress={() => onEliminar(categoria)}
            peligro
            testID={`categoria-eliminar-${id}`}
          />
        </View>
      )}
    </View>
  );
}

function Etiqueta({ texto, icono, resaltada = false }) {
  return (
    <View style={[styles.etiqueta, resaltada && styles.etiquetaResaltada]}>
      {icono ? <FontAwesome6 color={resaltada ? c.acento : c.textoSecundario} name={icono} size={9} /> : null}
      <Text style={[styles.textoEtiqueta, resaltada && styles.textoEtiquetaResaltada]}>{texto}</Text>
    </View>
  );
}

function BotonAccion({ icono, etiqueta, onPress, deshabilitado = false, peligro = false, testID }) {
  return (
    <Pressable
      accessibilityLabel={etiqueta}
      accessibilityRole="button"
      accessibilityState={{ disabled: deshabilitado }}
      disabled={deshabilitado}
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.botonAccion,
        hovered && !deshabilitado && (peligro ? styles.botonAccionPeligro : styles.hoverBorde),
        deshabilitado && styles.deshabilitado,
        pressed && styles.presionado,
      ]}
      testID={testID}
    >
      <FontAwesome6 color={peligro ? c.peligro : c.textoSecundario} name={icono} size={13} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  volver: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.lg,
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
    marginBottom: spacing.xl,
  },
  textosEncabezado: {
    flexShrink: 1,
    maxWidth: 720,
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
  botonPrincipal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: c.manteca,
  },
  textoBotonPrincipal: {
    ...textStyles.bodyStrong,
    color: c.sobreAcento,
  },
  secciones: {
    gap: spacing.lg,
  },
  recargando: {
    opacity: 0.6,
  },
  seccion: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.panel,
    overflow: 'hidden',
  },
  encabezadoSeccion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: c.borde,
    backgroundColor: c.superficie,
  },
  iconoSeccion: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.acentoSuave,
    borderWidth: 1,
    borderColor: c.acentoBorde,
  },
  textosSeccion: {
    flex: 1,
  },
  tituloSeccion: {
    ...textStyles.bodyStrong,
    color: c.texto,
    fontSize: 17,
  },
  metaSeccion: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
  },
  botonAgregar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeFuerte,
  },
  textoAgregar: {
    ...textStyles.meta,
    color: c.texto,
  },
  sinCategorias: {
    ...textStyles.meta,
    color: c.textoTenue,
    padding: spacing.lg,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  filaConBorde: {
    borderBottomWidth: 1,
    borderBottomColor: c.borde,
  },
  iconoCategoria: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.superficieElevada,
  },
  iconoInactivo: {
    opacity: 0.6,
  },
  datosCategoria: {
    flex: 1,
    minWidth: 0,
  },
  filaNombre: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  nombre: {
    ...textStyles.bodyStrong,
    color: c.texto,
    flexShrink: 1,
  },
  nombreInactivo: {
    color: c.textoSecundario,
  },
  usos: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
    marginTop: 2,
  },
  etiqueta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.bordeFuerte,
  },
  etiquetaResaltada: {
    borderColor: c.acentoBorde,
    backgroundColor: c.acentoSuave,
  },
  textoEtiqueta: {
    ...textStyles.meta,
    color: c.textoSecundario,
    fontSize: 11,
  },
  textoEtiquetaResaltada: {
    color: c.acento,
  },
  acciones: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  botonAccion: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.borde,
  },
  botonAccionPeligro: {
    borderColor: c.peligro,
    backgroundColor: c.peligroSuave,
  },
  hover: {
    opacity: 0.9,
  },
  hoverBorde: {
    borderColor: c.textoSecundario,
  },
  deshabilitado: {
    opacity: 0.35,
  },
  centro: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
  },
  cajaError: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.peligro,
    backgroundColor: c.peligroSuave,
  },
  textoError: {
    ...textStyles.body,
    color: c.peligro,
    flex: 1,
  },
  botonSecundario: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeFuerte,
  },
  textoBotonSecundario: {
    ...textStyles.meta,
    color: c.texto,
  },
  presionado: {
    transform: [{ scale: 0.985 }],
  },
});
