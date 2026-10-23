import { FontAwesome6 } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { appToast } from '../ui/AppDialog';
import {
  obtenerHistorialSuspensiones,
  reactivarUsuario,
  suspenderUsuario,
} from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { radii, spacing, textStyles } from '../../theme/tokens';
import { avisar, confirmar } from '../../utils/dialogs';
import FormularioSuspension from './FormularioSuspension';
import { formatearFecha } from './UsuarioPresentacion';

const ETIQUETAS_ACCION = {
  suspension: 'Suspensión',
  reactivacion: 'Reactivación',
};


export default function SuspensionUsuario({ usuario, onCambio }) {
  const [info, setInfo] = useState(null);
  const [formulario, setFormulario] = useState(false);
  const [reactivando, setReactivando] = useState(false);

  const estadoNormalizado = usuario.estado?.toLowerCase();
  const puedeSuspender = estadoNormalizado === 'activa' || estadoNormalizado === 'activo';
  const suspendida = estadoNormalizado === 'suspendida' || estadoNormalizado === 'suspendido';

  useEffect(() => {
    let vigente = true;
    if (suspendida) {
      obtenerHistorialSuspensiones(usuario.id)
        .then((respuesta) => {
          if (vigente) setInfo(respuesta);
        })
        .catch(() => {});
    }
    return () => {
      vigente = false;
    };
  }, [usuario.id, suspendida]);

  async function confirmarSuspension(motivo) {
    await suspenderUsuario(usuario.id, motivo);
    setFormulario(false);
    appToast('Cuenta suspendida');
    onCambio();
  }

  async function reactivar() {
    const acepta = await confirmar({
      titulo: '¿Reactivar la cuenta?',
      mensaje: `La cuenta de ${usuario.nombreCompleto} volverá a estar activa y se le notificará por correo. Deberá iniciar sesión nuevamente.`,
      textoConfirmar: 'Reactivar',
      tipo: 'info',
    });
    if (!acepta) return;

    setReactivando(true);
    try {
      await reactivarUsuario(usuario.id);
      appToast('Cuenta reactivada');
      onCambio();
    } catch (err) {
      avisar('No se pudo reactivar la cuenta', err?.message || 'Ocurrió un error inesperado.');
      setReactivando(false);
    }
  }

  return (
    <View style={styles.contenedor} testID="suspension-usuario">
      {suspendida ? (
        <View style={styles.banner} testID="suspension-banner">
          <View style={styles.cabeceraBanner}>
            <FontAwesome6 color={c.peligro} name="user-lock" size={16} />
            <Text style={styles.tituloBanner}>Cuenta suspendida</Text>
          </View>
          {info?.motivoVigente ? (
            <Text style={styles.textoBanner}>
              <Text style={styles.textoFuerte}>Motivo: </Text>
              {info.motivoVigente}
            </Text>
          ) : null}
          {info?.fechaSuspension ? (
            <Text style={styles.metaBanner}>
              Suspendida el {formatearFecha(info.fechaSuspension)}
              {info.administrador ? ` por ${info.administrador}` : ''}
            </Text>
          ) : null}
          <Pressable
            disabled={reactivando}
            onPress={reactivar}
            style={({ hovered, pressed }) => [
              styles.botonReactivar,
              hovered && styles.hover,
              pressed && styles.presionado,
              reactivando && styles.deshabilitado,
            ]}
            testID="suspension-reactivar"
          >
            {reactivando ? (
              <ActivityIndicator color={c.sobreAcento} size="small" />
            ) : (
              <>
                <FontAwesome6 color={c.sobreAcento} name="rotate-left" size={13} />
                <Text style={styles.textoBotonReactivar}>Reactivar cuenta</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      {puedeSuspender ? (
        <Pressable
          onPress={() => setFormulario(true)}
          style={({ hovered, pressed }) => [
            styles.botonSuspender,
            hovered && styles.hover,
            pressed && styles.presionado,
          ]}
          testID="suspension-abrir"
        >
          <FontAwesome6 color={c.peligro} name="user-lock" size={13} />
          <Text style={styles.textoBotonSuspender}>Suspender cuenta</Text>
        </Pressable>
      ) : null}

      <FormularioSuspension
        nombreUsuario={usuario.nombreCompleto}
        onCerrar={() => setFormulario(false)}
        onConfirmar={confirmarSuspension}
        visible={formulario}
      />
    </View>
  );
}


export function HistorialSuspensiones({ usuario }) {
  const [info, setInfo] = useState(null);
  const [errorHistorial, setErrorHistorial] = useState(false);

  useEffect(() => {
    let vigente = true;
    setErrorHistorial(false);
    obtenerHistorialSuspensiones(usuario.id)
      .then((respuesta) => {
        if (vigente) setInfo(respuesta);
      })
      .catch(() => {
        if (vigente) setErrorHistorial(true);
      });
    return () => {
      vigente = false;
    };
  }, [usuario.id, usuario.estado]);

  const historial = info?.historial ?? [];

  if (!historial.length && !errorHistorial) return null;

  return (
    <View style={styles.contenedorHistorial} testID="suspension-historial">
      {historial.length ? (
        <>
          <Text style={styles.etiquetaSeccion}>HISTORIAL DE SUSPENSIONES</Text>
          <View style={styles.panelHistorial}>
            {historial.map((evento, indice) => (
              <View
                key={evento.id}
                style={[styles.filaHistorial, indice === historial.length - 1 && styles.filaUltima]}
              >
                <View style={styles.cabeceraEvento}>
                  <Text style={styles.accion}>{ETIQUETAS_ACCION[evento.accion] || evento.accion}</Text>
                  <Text style={styles.metaEvento}>
                    {formatearFecha(evento.fecha)} · {evento.administrador}
                  </Text>
                </View>
                {evento.motivo ? <Text style={styles.motivoEvento}>{evento.motivo}</Text> : null}
              </View>
            ))}
          </View>
        </>
      ) : null}

      {errorHistorial ? (
        <Text style={styles.textoErrorHistorial}>No se pudo cargar el historial de suspensiones.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  contenedorHistorial: {
    marginTop: spacing.xl,
  },
  banner: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.peligro,
    backgroundColor: c.peligroSuave,
  },
  cabeceraBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tituloBanner: {
    ...textStyles.bodyStrong,
    color: c.peligro,
    fontSize: 17,
  },
  textoBanner: {
    ...textStyles.body,
    color: c.texto,
  },
  textoFuerte: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  metaBanner: {
    ...textStyles.meta,
    color: c.textoSecundario,
  },
  botonReactivar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    minHeight: 42,
    minWidth: 170,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: c.manteca,
  },
  textoBotonReactivar: {
    ...textStyles.bodyStrong,
    color: c.sobreAcento,
  },
  botonSuspender: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.peligro,
  },
  textoBotonSuspender: {
    ...textStyles.bodyStrong,
    color: c.peligro,
  },
  etiquetaSeccion: {
    ...textStyles.sectionLabel,
    color: c.textoTenue,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  panelHistorial: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  filaHistorial: {
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.borde,
  },
  filaUltima: {
    borderBottomWidth: 0,
  },
  cabeceraEvento: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  accion: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  metaEvento: {
    ...textStyles.meta,
    color: c.textoTenue,
  },
  motivoEvento: {
    ...textStyles.body,
    color: c.textoSecundario,
  },
  textoErrorHistorial: {
    ...textStyles.meta,
    color: c.textoTenue,
  },
  hover: {
    opacity: 0.9,
  },
  deshabilitado: {
    opacity: 0.6,
  },
  presionado: {
    transform: [{ scale: 0.985 }],
  },
});