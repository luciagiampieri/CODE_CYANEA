import { FontAwesome6 } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ETIQUETAS_METODO,
  ETIQUETAS_PLAN,
  EstadoCuentaBadge,
  formatearFecha,
  obtenerIniciales,
} from '../../components/backoffice/UsuarioPresentacion';
import SuspensionUsuario, { HistorialSuspensiones } from '../../components/backoffice/SuspensionUsuario';
import FinanzasUsuario from '../../components/backoffice/FinanzasUsuario';
import { obtenerUsuario } from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { radii, spacing, textStyles } from '../../theme/tokens';

export default function BackofficeUsuarioDetalleScreen({ idUsuario, onVolver }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    obtenerUsuario(idUsuario)
      .then((respuesta) => {
        if (vigente) setUsuario(respuesta);
      })
      .catch((err) => {
        if (vigente) setError(err?.message || 'No se pudo cargar el usuario.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [idUsuario, recarga]);

  let contenido;
  if (cargando) {
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
      </View>
    );
  } else {
    contenido = <Detalle onCambio={() => setRecarga((n) => n + 1)} usuario={usuario} />;
  }

  return (
    <View>
      <Pressable
        onPress={onVolver}
        style={({ pressed }) => [styles.volver, pressed && styles.presionado]}
      >
        <FontAwesome6 color={c.textoSecundario} name="arrow-left" size={12} />
        <Text style={styles.textoVolver}>Volver a usuarios</Text>
      </Pressable>
      {contenido}
    </View>
  );
}

function Detalle({ usuario, onCambio }) {
  return (
    <>
      <View style={styles.encabezado}>
        <View style={[styles.avatar, usuario.anonimizado && styles.avatarAnonimo]}>
          {usuario.anonimizado ? (
            <FontAwesome6 color={c.textoTenue} name="user-slash" size={18} />
          ) : (
            <Text style={styles.textoAvatar}>{obtenerIniciales(usuario.nombreCompleto)}</Text>
          )}
        </View>
        <View style={styles.datosEncabezado}>
          <Text style={styles.nombre}>{usuario.nombreCompleto}</Text>
          <Text style={styles.nombreUsuario}>@{usuario.nombreUsuario}</Text>
        </View>
        <EstadoCuentaBadge estado={usuario.estado} />
      </View>

      {usuario.anonimizado ? (
        <View style={styles.avisoBaja}>
          <FontAwesome6 color={c.textoSecundario} name="user-shield" size={14} />
          <Text style={styles.textoAvisoBaja}>
            Esta cuenta fue dada de baja el {formatearFecha(usuario.fechaBaja)}. Sus datos
            personales fueron anonimizados.
          </Text>
        </View>
      ) : null}

      <SuspensionUsuario onCambio={onCambio} usuario={usuario} />

      <View style={styles.metricas}>
        <Metrica
          etiqueta="Viajes en los que participa"
          icono="suitcase-rolling"
          valor={String(usuario.cantidadViajes)}
        />
        <Metrica etiqueta="Plan" icono="star" valor={ETIQUETAS_PLAN[usuario.plan]} />
        <Metrica
          etiqueta="Suscripción"
          icono="credit-card"
          valor={usuario.estadoSuscripcion || 'Sin suscripción'}
        />
      </View>

      <FinanzasUsuario key={usuario.id} idUsuario={usuario.id} />
      <Text style={styles.etiquetaSeccion}>DATOS DE LA CUENTA</Text>
      <View style={styles.panelDatos}>
        <FilaDato etiqueta="Nombre" valor={usuario.nombre} />
        <FilaDato etiqueta="Apellido" valor={usuario.apellido} />
        <FilaDato etiqueta="Nombre de usuario" valor={`@${usuario.nombreUsuario}`} />
        <FilaDato etiqueta="Correo electrónico" valor={usuario.email} />
        <FilaDato
          etiqueta="Método de registro"
          valor={ETIQUETAS_METODO[usuario.metodoRegistro] || usuario.metodoRegistro}
        />
        <FilaDato etiqueta="Correo confirmado" valor={usuario.emailConfirmado ? 'Sí' : 'No'} />
        <FilaDato
          etiqueta="Fecha de registro"
          ultima
          valor={formatearFecha(usuario.fechaRegistro)}
        />
      </View>
      <HistorialSuspensiones usuario={usuario} />
    </>
  );
}

function Metrica({ icono, etiqueta, valor }) {
  return (
    <View style={styles.metrica}>
      <View style={styles.iconoMetrica}>
        <FontAwesome6 color={c.acento} name={icono} size={14} />
      </View>
      <Text style={styles.valorMetrica}>{valor}</Text>
      <Text style={styles.etiquetaMetrica}>{etiqueta}</Text>
    </View>
  );
}

function FilaDato({ etiqueta, valor, ultima }) {
  return (
    <View style={[styles.filaDato, ultima && styles.filaDatoUltima]}>
      <Text style={styles.etiquetaDato}>{etiqueta}</Text>
      <Text style={styles.valorDato}>{valor || '—'}</Text>
    </View>
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
  centro: {
    paddingVertical: 56,
    alignItems: 'center',
  },
  cajaError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: c.peligroSuave,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  textoError: {
    ...textStyles.meta,
    color: c.peligro,
    flex: 1,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.acento,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAnonimo: {
    backgroundColor: c.superficie,
    borderWidth: 1,
    borderColor: c.borde,
  },
  textoAvatar: {
    ...textStyles.bodyStrong,
    color: c.sobreAcento,
    fontSize: 22,
  },
  datosEncabezado: {
    flex: 1,
    minWidth: 180,
  },
  nombre: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 30,
  },
  nombreUsuario: {
    ...textStyles.body,
    color: c.textoSecundario,
  },
  avisoBaja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeFuerte,
    backgroundColor: c.superficie,
  },
  textoAvisoBaja: {
    ...textStyles.meta,
    color: c.textoSecundario,
    flex: 1,
  },
  metricas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  metrica: {
    flexGrow: 1,
    flexBasis: 140,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  iconoMetrica: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.acentoSuave,
    borderWidth: 1,
    borderColor: c.acentoBorde,
    marginBottom: spacing.sm,
  },
  valorMetrica: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 22,
  },
  etiquetaMetrica: {
    ...textStyles.meta,
    color: c.textoTenue,
    marginTop: 2,
  },
  etiquetaSeccion: {
    ...textStyles.sectionLabel,
    color: c.textoTenue,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  panelDatos: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  filaDato: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.borde,
  },
  filaDatoUltima: {
    borderBottomWidth: 0,
  },
  etiquetaDato: {
    ...textStyles.meta,
    color: c.textoTenue,
  },
  valorDato: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  presionado: {
    transform: [{ scale: 0.985 }],
  },
});
