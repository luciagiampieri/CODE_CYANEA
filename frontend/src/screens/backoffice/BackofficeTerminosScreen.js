import { FontAwesome6 } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import FormularioTermino from '../../components/backoffice/FormularioTermino';
import { formatearFecha } from '../../components/backoffice/UsuarioPresentacion';
import TermsModal from '../../components/legal/TermsModal';
import { appToast } from '../../components/ui/AppDialog';
import {
  actualizarTermino,
  crearTermino,
  eliminarTermino,
  listarTerminos,
  obtenerTermino,
  publicarTermino,
} from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { radii, spacing, textStyles } from '../../theme/tokens';
import { avisar, confirmar } from '../../utils/dialogs';

const BO = { backoffice: true };

export const ETIQUETAS_ESTADO_TERMINOS = {
  borrador: 'Borrador',
  vigente: 'Vigente',
  historica: 'Histórica',
};

const COLORES_ESTADO = {
  vigente: { texto: c.acento, fondo: c.acentoSuave, borde: c.acentoBorde },
  borrador: { texto: c.textoSecundario, fondo: 'transparent', borde: c.bordeFuerte },
  historica: { texto: c.textoTenue, fondo: c.superficie, borde: c.borde },
};

export function contenidoAParrafos(texto) {
  return String(texto ?? '')
    .split(/\n\s*\n/)
    .map((parrafo) => parrafo.trim())
    .filter(Boolean);
}

export default function BackofficeTerminosScreen({ onVolver }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [formulario, setFormulario] = useState(null);
  const [preview, setPreview] = useState(null);
  const [procesandoId, setProcesandoId] = useState(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    listarTerminos()
      .then((respuesta) => {
        if (vigente) setDatos(respuesta);
      })
      .catch((err) => {
        if (vigente) setError(err?.message || 'No se pudieron cargar las versiones.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [recarga]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  async function guardar({ numero, titulo, contenido }) {
    if (formulario.modo === 'crear') {
      await crearTermino({ numero, titulo, contenido });
      appToast('Versión creada', BO);
    } else {
      await actualizarTermino(formulario.version.id, { numero, titulo, contenido });
      appToast('Versión actualizada', BO);
    }
    setFormulario(null);
    recargar();
  }

  async function conProceso(item, accion, mensajeExito) {
    setProcesandoId(item.id);
    try {
      await accion();
      if (mensajeExito) appToast(mensajeExito, BO);
      recargar();
    } catch (err) {
      avisar('No se pudo completar la acción', err?.message || 'Ocurrió un error inesperado.', undefined, BO);
    } finally {
      setProcesandoId(null);
    }
  }

  async function abrirEdicion(item) {
    setProcesandoId(item.id);
    try {
      const detalle = await obtenerTermino(item.id);
      setFormulario({ modo: 'editar', version: detalle });
    } catch (err) {
      avisar('No se pudo abrir la versión', err?.message || 'Ocurrió un error inesperado.', undefined, BO);
    } finally {
      setProcesandoId(null);
    }
  }

  async function previsualizar(item) {
    setProcesandoId(item.id);
    try {
      const detalle = await obtenerTermino(item.id);
      setPreview({
        version: detalle.numero,
        titulo: detalle.titulo,
        contenido: contenidoAParrafos(detalle.contenido),
      });
    } catch (err) {
      avisar('No se pudo cargar la versión', err?.message || 'Ocurrió un error inesperado.', undefined, BO);
    } finally {
      setProcesandoId(null);
    }
  }

  async function publicar(item) {
    const acepta = await confirmar({
      titulo: '¿Publicar la versión?',
      mensaje: `La versión ${item.numero} pasará a ser la vigente y la actual quedará como histórica. Todos los usuarios deberán aceptar la nueva versión para seguir usando Cyanea.`,
      textoConfirmar: 'Publicar',
      tipo: 'warning',
      opciones: BO,
    });
    if (!acepta) return;
    await conProceso(item, () => publicarTermino(item.id), 'Versión publicada');
  }

  async function eliminar(item) {
    const acepta = await confirmar({
      titulo: '¿Eliminar el borrador?',
      mensaje: `El borrador "${item.numero}" se eliminará definitivamente.`,
      textoConfirmar: 'Eliminar',
      destructivo: true,
      opciones: BO,
    });
    if (!acepta) return;
    await conProceso(item, () => eliminarTermino(item.id), 'Borrador eliminado');
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
    const aceptaron = datos?.usuariosAceptaronVigente ?? 0;
    const versiones = datos?.versiones ?? [];
    contenido = (
      <View style={cargando && styles.recargando}>
        {datos?.versionVigente ? (
          <View style={styles.resumen} testID="terminos-resumen">
            <View style={styles.iconoResumen}>
              <FontAwesome6 color={c.acento} name="user-check" size={14} />
            </View>
            <View style={styles.textosResumen}>
              <Text style={styles.tituloResumen}>Versión vigente: {datos.versionVigente}</Text>
              <Text style={styles.metaResumen}>
                {`${aceptaron} ${aceptaron === 1 ? 'usuario aceptó' : 'usuarios aceptaron'} la versión vigente`}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.lista}>
          {versiones.map((item, indice) => (
            <FilaVersion
              item={item}
              key={item.id}
              onEditar={abrirEdicion}
              onEliminar={eliminar}
              onPrevisualizar={previsualizar}
              onPublicar={publicar}
              procesando={procesandoId === item.id}
              ultima={indice === versiones.length - 1}
            />
          ))}
        </View>
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
          <Text style={styles.titulo}>Términos y Condiciones</Text>
          <Text style={styles.bajada}>
            Creá versiones en borrador, previsualizalas y publicalas. Al publicar, todos los usuarios
            deberán aceptar la nueva versión.
          </Text>
        </View>
        <Pressable
          onPress={() => setFormulario({ modo: 'crear' })}
          style={({ hovered, pressed }) => [styles.botonPrincipal, hovered && styles.hover, pressed && styles.presionado]}
          testID="termino-nueva"
        >
          <FontAwesome6 color={c.sobreAcento} name="plus" size={13} />
          <Text style={styles.textoBotonPrincipal}>Nueva versión</Text>
        </Pressable>
      </View>

      {contenido}

      <FormularioTermino
        modo={formulario?.modo}
        onCerrar={() => setFormulario(null)}
        onGuardar={guardar}
        version={formulario?.version}
        visible={Boolean(formulario)}
      />
      <TermsModal
        backoffice
        onClose={() => setPreview(null)}
        previewTerms={preview}
        visible={Boolean(preview)}
      />
    </View>
  );
}

function FilaVersion({ item, ultima, procesando, onPrevisualizar, onEditar, onEliminar, onPublicar }) {
  const esBorrador = item.estado === 'borrador';
  const colores = COLORES_ESTADO[item.estado] || COLORES_ESTADO.historica;

  return (
    <View style={[styles.fila, !ultima && styles.filaConBorde]} testID={`termino-${item.id}`}>
      <View style={styles.datos}>
        <View style={styles.filaNombre}>
          <Text numberOfLines={1} style={styles.numero}>
            {item.numero}
          </Text>
          <View style={[styles.badge, { backgroundColor: colores.fondo, borderColor: colores.borde }]}>
            <View style={[styles.punto, { backgroundColor: colores.texto }]} />
            <Text style={[styles.textoBadge, { color: colores.texto }]}>
              {ETIQUETAS_ESTADO_TERMINOS[item.estado] || item.estado}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.tituloVersion}>
          {item.titulo}
        </Text>
        <Text style={styles.meta}>
          {item.fechaPublicacion ? `Publicada el ${formatearFecha(item.fechaPublicacion)}` : 'Sin publicar'}
        </Text>
      </View>

      {procesando ? (
        <ActivityIndicator color={c.acento} size="small" />
      ) : (
        <View style={styles.acciones}>
          <BotonAccion
            etiqueta={`Previsualizar ${item.numero}`}
            icono="eye"
            onPress={() => onPrevisualizar(item)}
            testID={`termino-previsualizar-${item.id}`}
          />
          {esBorrador ? (
            <>
              <BotonAccion
                etiqueta={`Editar ${item.numero}`}
                icono="pen"
                onPress={() => onEditar(item)}
                testID={`termino-editar-${item.id}`}
              />
              <BotonAccion
                etiqueta={`Publicar ${item.numero}`}
                icono="paper-plane"
                onPress={() => onPublicar(item)}
                resaltado
                testID={`termino-publicar-${item.id}`}
              />
              <BotonAccion
                etiqueta={`Eliminar ${item.numero}`}
                icono="trash"
                onPress={() => onEliminar(item)}
                peligro
                testID={`termino-eliminar-${item.id}`}
              />
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

function BotonAccion({ icono, etiqueta, onPress, peligro = false, resaltado = false, testID }) {
  let color = c.textoSecundario;
  if (peligro) color = c.peligro;
  if (resaltado) color = c.acento;
  return (
    <Pressable
      accessibilityLabel={etiqueta}
      accessibilityRole="button"
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.botonAccion,
        hovered && (peligro ? styles.botonAccionPeligro : styles.hoverBorde),
        pressed && styles.presionado,
      ]}
      testID={testID}
    >
      <FontAwesome6 color={color} name={icono} size={13} />
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
  recargando: {
    opacity: 0.6,
  },
  resumen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.acentoBorde,
    backgroundColor: c.panel,
  },
  iconoResumen: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.acentoSuave,
    borderWidth: 1,
    borderColor: c.acentoBorde,
  },
  textosResumen: {
    flex: 1,
  },
  tituloResumen: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  metaResumen: {
    ...textStyles.meta,
    color: c.textoSecundario,
  },
  lista: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.panel,
    overflow: 'hidden',
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
  datos: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  filaNombre: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  numero: {
    ...textStyles.bodyStrong,
    color: c.texto,
    flexShrink: 1,
  },
  tituloVersion: {
    ...textStyles.body,
    color: c.textoSecundario,
  },
  meta: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  punto: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  textoBadge: {
    ...textStyles.meta,
    fontSize: 12,
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