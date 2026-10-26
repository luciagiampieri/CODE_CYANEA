import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ScreenContainer from '../components/layout/ScreenContainer';
import IconCircleButton from '../components/ui/IconCircleButton';
import PrimaryButton from '../components/ui/PrimaryButton';
import { appAlert } from '../components/ui/AppDialog';
import useAvailablePlans from '../hooks/useAvailablePlans';
import { cancelSubscription, getSubscriptionManagement, reactivateSubscription } from '../services/api';
import { colors } from '../theme/tokens';
import { p, precioPlan } from './PlansScreen';
import { fechaCorta } from './SubscribeProScreen';

const ESTADOS = { activa: 'Activa', cancelada: 'Cancelada', pendiente_pago: 'Pendiente de pago', vencida: 'Vencida' };
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
  if (sub.estado === 'activa') return `Próxima renovación: ${fechaCorta(sub.fechaProximaRenovacion)}`;
  if (sub.estado === 'cancelada' && sub.puedeReactivar) return `Conservás los beneficios Pro hasta el ${fechaCorta(sub.fechaFin)}. La suscripción no se renovará.`;
  if (sub.estado === 'cancelada') return `Tu suscripción finalizó el ${fechaCorta(sub.fechaFin)}.`;
  if (sub.estado === 'pendiente_pago') return 'No pudimos cobrar la renovación. Mercado Pago va a reintentar el cobro: actualizá tu medio de pago para no perder los beneficios Pro.';
  return `Tu suscripción venció el ${fechaCorta(sub.fechaFin)}.`;
}

export default function MySubscriptionScreen({ navigation }) {
  const planes = useAvailablePlans();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useFocusEffect(useCallback(() => {
    let vigente = true;
    setCargando(true); setError('');
    getSubscriptionManagement()
      .then((respuesta) => { if (vigente) setDatos(respuesta); })
      .catch((err) => { if (vigente) setError(err.message || 'No se pudo cargar tu suscripción.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [recarga]));

  const sub = datos?.suscripcion;
  const intentoPendiente = !sub && planes.datos?.ultimaSuscripcion?.estado === 'pendiente_pago';

  function actualizar() {
    setRecarga((n) => n + 1);
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

  return <ScreenContainer fullWidth padded={false}><ScrollView contentContainerStyle={p.scroll}><View style={p.contenido}>
    <View style={p.encabezado}>
      <IconCircleButton icon="arrow-left" tone="surface" accessibilityLabel="Volver" onPress={() => navigation.goBack()} />
      <View style={{ flex: 1 }}>
        <Text style={p.titulo}>Mi suscripción</Text>
        <Text style={p.subtitulo}>Consultá el estado de tu suscripción Pro y gestioná su renovación.</Text>
      </View>
    </View>
    {cargando && !datos ? <ActivityIndicator color={colors.primary} size="large" /> : error && !datos ? <View style={p.panel}>
      <Text accessibilityRole="alert" style={p.error}>{error}</Text>
      <PrimaryButton label="Reintentar" onPress={actualizar} />
    </View> : datos ? <View style={p.panel} testID="mi-suscripcion">
      <Text style={p.nombre}>Plan actual: {datos.planActual === 'pro' ? 'Pro' : 'Gratuito'}</Text>
      {sub ? <>
        <Text style={p.texto} testID="mi-suscripcion-estado">Estado: {ESTADOS[sub.estado] || sub.estado}</Text>
        <Text style={p.texto}>Modalidad: {MODALIDADES[sub.modalidad] || 'Sin periodicidad registrada'}</Text>
        <Text style={p.texto}>Precio: {sub.precioARS == null ? 'No registrado' : `${precioPlan(sub.precioARS)}${PERIODOS[sub.modalidad] ? ` por ${PERIODOS[sub.modalidad]}` : ''}`}</Text>
        <Text style={sub.estado === 'pendiente_pago' ? p.error : sub.estado === 'cancelada' && sub.puedeReactivar ? p.ahorro : p.texto} testID="mi-suscripcion-fecha">{textoFecha(sub)}</Text>
        {sub.fechaCancelacion ? <Text style={p.subtitulo}>Cancelación registrada el {fechaCorta(sub.fechaCancelacion)}</Text> : null}
        {sub.urlMedioPago ? <PrimaryButton label="Actualizar medio de pago" testID="mi-suscripcion-medio-pago" onPress={actualizarMedioPago} /> : null}
        {sub.puedeReactivar ? <PrimaryButton label="Reactivar renovación automática" testID="mi-suscripcion-reactivar" loading={procesando} disabled={procesando} onPress={reactivar} /> : null}
        {sub.puedeCancelar ? <PrimaryButton label="Cancelar renovación automática" variant="secondary" testID="mi-suscripcion-cancelar" loading={procesando} disabled={procesando} onPress={cancelar} /> : null}
        {datos.planActual !== 'pro' ? <PrimaryButton label="Suscribirme a Pro" testID="mi-suscripcion-suscribirme" onPress={() => navigation.navigate('SuscribirsePro')} /> : null}
      </> : <>
        <Text style={p.texto}>No tenés una suscripción Pro.</Text>
        {intentoPendiente
          ? <PrimaryButton label="Ver el estado de mi último pago" testID="mi-suscripcion-estado-pago" onPress={() => navigation.navigate('SuscripcionEstado')} />
          : <PrimaryButton label="Suscribirme a Pro" testID="mi-suscripcion-suscribirme" onPress={() => navigation.navigate('SuscribirsePro')} />}
      </>}
      <PrimaryButton label="Actualizar información" variant="secondary" loading={cargando} onPress={actualizar} />
    </View> : null}
  </View></ScrollView></ScreenContainer>;
}