import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome6 } from '@expo/vector-icons';
import ListRow from '../ui/ListRow';
import PrimaryButton from '../ui/PrimaryButton';
import SectionCard from '../ui/SectionCard';
import { appAlert } from '../ui/AppDialog';
import useAvailablePlans from '../../hooks/useAvailablePlans';
import { cancelSubscription, getSubscriptionManagement, reactivateSubscription } from '../../services/api';
import { fechaCorta } from '../../utils/fechasSuscripcion';
import { colors, radii, spacing, textStyles } from '../../theme/tokens';
import { p, precioCorto } from './planStyles';

const ESTADOS = {
  activa: { texto: 'Activa', fondo: colors.successSurface, color: colors.success },
  cancelada: { texto: 'Cancelada', fondo: colors.warningSurface, color: colors.warning },
  pendiente_pago: { texto: 'Pendiente de pago', fondo: colors.dangerSurface, color: colors.danger },
  vencida: { texto: 'Vencida', fondo: colors.surfaceAlt, color: colors.textSecondary },
};
const MODALIDADES = { mensual: 'Mensual', anual: 'Anual' };
const PERIODOS = { mensual: 'mes', anual: 'año' };

function confirmarAccion(titulo, mensaje, textoConfirmar, destructivo) {
  return new Promise((resolve) => {
    appAlert(
      titulo,
      mensaje,
      [
        { text: 'Volver', style: 'cancel', onPress: () => resolve(false) },
        { text: textoConfirmar, style: destructivo ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { tipo: 'warning', cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

function textoFecha(sub) {
  if (sub.estado === 'activa') return `Se renueva el ${fechaCorta(sub.fechaProximaRenovacion)}`;
  if (sub.estado === 'cancelada' && sub.puedeReactivar) return `Pro hasta el ${fechaCorta(sub.fechaFin)} · no se renueva`;
  if (sub.estado === 'cancelada') return `Finalizó el ${fechaCorta(sub.fechaFin)}`;
  return `Venció el ${fechaCorta(sub.fechaFin)}`;
}

function textoPendiente(sub) {
  return sub.fechaLimitePago
    ? `Tenés hasta el ${fechaCorta(sub.fechaLimitePago)} para regularizarlo; si no, volvés al plan gratuito.`
    : 'Mercado Pago va a reintentar el cobro en los próximos días.';
}

export default function SubscriptionPanel({ navigation, onVerPlanes, recarga = 0, onRecargado }) {
  const planes = useAvailablePlans();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [recargaInterna, setRecargaInterna] = useState(0);
  const recargaInicial = useRef(recarga);

  useFocusEffect(useCallback(() => {
    let vigente = true;
    setCargando(true); setError('');
    getSubscriptionManagement()
      .then((respuesta) => { if (vigente) setDatos(respuesta); })
      .catch((err) => { if (vigente) setError(err.message || 'No se pudo cargar tu suscripción.'); })
      .finally(() => {
        if (vigente) setCargando(false);
        onRecargado?.();
      });
    return () => { vigente = false; };
  }, [recargaInterna, recarga]));

  // El pull-to-refresh de la pantalla también vuelve a consultar los planes.
  useEffect(() => {
    if (recarga !== recargaInicial.current) planes.actualizar?.();
  }, [recarga]);

  const sub = datos?.suscripcion;
  const esPro = datos?.planActual === 'pro';
  const intentoPendiente = !sub && planes.datos?.ultimaSuscripcion?.estado === 'pendiente_pago';

  function actualizar() {
    setRecargaInterna((n) => n + 1);
    planes.actualizar?.();
  }

  async function ejecutar(accion) {
    setProcesando(true);
    try {
      const respuesta = await accion();
      setDatos(respuesta);
      appAlert('Listo', respuesta.message, undefined, { tipo: 'success' });
    } catch (err) {
      appAlert('No se pudo completar la acción', err.message || 'Intentá nuevamente en unos minutos.', undefined, { tipo: 'error' });
      actualizar();
    } finally {
      setProcesando(false);
    }
  }

  async function cancelar() {
    const confirmado = await confirmarAccion(
      '¿Cancelar la renovación automática?',
      `Vas a conservar los beneficios Pro hasta el ${fechaCorta(sub.fechaFin)}. No se realizarán nuevos cobros y después tu cuenta vuelve al plan gratuito, conservando todos tus viajes.`,
      'Cancelar renovación',
      true,
    );
    if (confirmado) ejecutar(cancelSubscription);
  }

  async function reactivar() {
    const confirmado = await confirmarAccion(
      '¿Reactivar la renovación automática?',
      `Tu suscripción se renovará automáticamente el ${fechaCorta(sub.fechaFin)}. No se realiza ningún cobro ahora.`,
      'Reactivar',
      false,
    );
    if (confirmado) ejecutar(reactivateSubscription);
  }

  async function actualizarMedioPago() {
    try {
      await Linking.openURL(sub.urlMedioPago);
    } catch {
      appAlert('No se pudo abrir Mercado Pago', 'Ingresá a tu cuenta de Mercado Pago para actualizar el medio de pago de tu suscripción.', undefined, { tipo: 'error' });
    }
  }

  if (cargando && !datos) return <ActivityIndicator color={colors.primary} size="large" />;
  if (error && !datos) return <View style={p.panel}>
    <Text accessibilityRole="alert" style={p.error}>{error}</Text>
    <PrimaryButton label="Reintentar" onPress={actualizar} />
  </View>;
  if (!datos) return null;

  const estado = sub ? ESTADOS[sub.estado] : null;
  const pendiente = sub?.estado === 'pendiente_pago';
  const periodo = sub ? PERIODOS[sub.modalidad] : null;
  const indicador = procesando ? <ActivityIndicator color={colors.primary} /> : undefined;

  // US 120: el historial se consulta aunque el usuario ya no sea Pro.
  const filas = [
    !esPro && { clave: 'planes', icon: 'scale-balanced', title: 'Comparar planes', onPress: onVerPlanes, testID: 'mi-suscripcion-ver-planes' },
    { clave: 'historial', icon: 'receipt', title: 'Historial de pagos', onPress: () => navigation.navigate('HistorialPagos'), testID: 'mi-suscripcion-historial' },
    sub?.puedeReactivar && { clave: 'reactivar', icon: 'rotate-right', title: 'Reactivar renovación', onPress: reactivar, testID: 'mi-suscripcion-reactivar', disabled: procesando, right: indicador },
    sub?.puedeCancelar && { clave: 'cancelar', icon: 'ban', title: 'Cancelar renovación', onPress: cancelar, testID: 'mi-suscripcion-cancelar', destructive: true, disabled: procesando, right: indicador },
  ].filter(Boolean);

  return <View style={{ gap: spacing.lg }} testID="mi-suscripcion">
    <SectionCard padded>
      <View style={s.cabecera}>
        <View style={[s.icono, esPro && s.iconoPro]}>
          <FontAwesome6 name={esPro ? 'crown' : 'suitcase-rolling'} size={18} color={colors.primary} />
        </View>
        <View style={s.nombreBloque}>
          <Text style={p.nombre}>{esPro ? 'Pro' : 'Gratuito'}</Text>
          {esPro && MODALIDADES[sub?.modalidad] ? <Text style={s.modalidad}>{MODALIDADES[sub.modalidad]}</Text> : null}
        </View>
        {estado ? <Text testID="mi-suscripcion-estado" style={[p.pastilla, { backgroundColor: estado.fondo, color: estado.color }]}>
          {estado.texto}
        </Text> : null}
      </View>

      {esPro && sub ? <View style={s.precioFila} testID="mi-suscripcion-precio">
        {sub.precioARS == null
          ? <Text style={p.subtitulo}>Precio no registrado</Text>
          : <>
            <Text style={p.precio}>{precioCorto(sub.precioARS)}</Text>
            {periodo ? <Text style={s.periodo}>/{periodo}</Text> : null}
          </>}
      </View> : null}

      {sub && !pendiente ? <View style={s.fechaFila}>
        <FontAwesome6 name="calendar" size={13} color={colors.textSecondary} />
        <Text testID="mi-suscripcion-fecha" style={s.fecha}>{textoFecha(sub)}</Text>
      </View> : null}

      {!esPro ? <>
        <Text style={p.subtitulo}>Más participantes, IA y almacenamiento en los viajes que administrás.</Text>
        {intentoPendiente
          ? <PrimaryButton label="Ver el estado de mi último pago" testID="mi-suscripcion-estado-pago" onPress={() => navigation.navigate('SuscripcionEstado')} />
          : <PrimaryButton label="Suscribirme a Pro" testID="mi-suscripcion-suscribirme" onPress={() => navigation.navigate('SuscribirsePro')} />}
      </> : null}
    </SectionCard>

    {pendiente ? <View style={s.aviso} testID="mi-suscripcion-aviso-pago">
      <View style={s.avisoTitulo}>
        <FontAwesome6 name="triangle-exclamation" size={15} color={colors.danger} />
        <Text style={s.avisoTexto}>No pudimos cobrar la renovación</Text>
      </View>
      <Text testID="mi-suscripcion-fecha" style={s.avisoDetalle}>{textoPendiente(sub)}</Text>
      {sub.urlMedioPago ? <PrimaryButton label="Actualizar medio de pago" testID="mi-suscripcion-medio-pago" onPress={actualizarMedioPago} /> : null}
    </View> : null}

    <SectionCard>
      {filas.map(({ clave, ...fila }, indice) => <ListRow key={clave} {...fila} divider={indice < filas.length - 1} />)}
    </SectionCard>
  </View>;
}

const s = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icono: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  iconoPro: { backgroundColor: colors.accent },
  nombreBloque: { flex: 1 },
  modalidad: { ...textStyles.meta, color: colors.textSecondary, fontSize: 13 },
  precioFila: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: spacing.xs },
  periodo: { ...textStyles.meta, color: colors.textSecondary, fontSize: 14 },
  fechaFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  fecha: { ...textStyles.meta, color: colors.textSecondary, fontSize: 14, flex: 1 },
  aviso: { backgroundColor: colors.dangerSurface, borderRadius: radii.md, padding: spacing.lg, gap: spacing.sm },
  avisoTitulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  avisoTexto: { ...textStyles.bodyStrong, color: colors.danger, flex: 1 },
  avisoDetalle: { ...textStyles.meta, color: colors.textPrimary, fontSize: 14 },
});
