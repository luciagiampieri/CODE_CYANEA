import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome6 } from '@expo/vector-icons';
import PrimaryButton from '../ui/PrimaryButton';
import SectionCard from '../ui/SectionCard';
import { appAlert } from '../ui/AppDialog';
import useAvailablePlans from '../../hooks/useAvailablePlans';
import { cancelSubscription, getSubscriptionManagement, reactivateSubscription } from '../../services/api';
import { fechaCorta } from '../../screens/SubscribeProScreen';
import { colors, radii, spacing, textStyles } from '../../theme/tokens';
import { p, precioPlan } from './planStyles';

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
  if (sub.estado === 'activa') return `Próxima renovación: ${fechaCorta(sub.fechaProximaRenovacion)}`;
  if (sub.estado === 'cancelada' && sub.puedeReactivar) return `Conservás los beneficios Pro hasta el ${fechaCorta(sub.fechaFin)}. La suscripción no se renovará.`;
  if (sub.estado === 'cancelada') return `Tu suscripción finalizó el ${fechaCorta(sub.fechaFin)}.`;
  if (sub.estado === 'pendiente_pago') return 'No pudimos cobrar la renovación. Mercado Pago va a reintentar el cobro: actualizá tu medio de pago para no perder los beneficios Pro.';
  return `Tu suscripción venció el ${fechaCorta(sub.fechaFin)}.`;
}

function Dato({ etiqueta, valor }) {
  return <View style={s.dato}>
    <Text style={s.datoEtiqueta}>{etiqueta}</Text>
    <Text style={s.datoValor}>{valor}</Text>
  </View>;
}

export default function SubscriptionPanel({ navigation, onVerPlanes }) {
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
  const esPro = datos?.planActual === 'pro';
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

  if (cargando && !datos) return <ActivityIndicator color={colors.primary} size="large" />;
  if (error && !datos) return <View style={p.panel}>
    <Text accessibilityRole="alert" style={p.error}>{error}</Text>
    <PrimaryButton label="Reintentar" onPress={actualizar} />
  </View>;
  if (!datos) return null;

  const estado = sub ? ESTADOS[sub.estado] : null;

  return <View style={{ gap: spacing.lg }} testID="mi-suscripcion">
    <SectionCard padded>
      <View style={s.cabecera}>
        <View style={[s.icono, esPro && s.iconoPro]}>
          <FontAwesome6 name={esPro ? 'crown' : 'suitcase-rolling'} size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.etiqueta}>Tu plan actual</Text>
          <Text style={p.nombre}>{esPro ? 'Pro' : 'Gratuito'}</Text>
        </View>
        {estado ? <Text testID="mi-suscripcion-estado" style={[s.pastilla, { backgroundColor: estado.fondo, color: estado.color }]}>
          {estado.texto}
        </Text> : null}
      </View>

      {sub ? <>
        <View style={s.datos}>
          <Dato etiqueta="Modalidad" valor={MODALIDADES[sub.modalidad] || 'Sin periodicidad registrada'} />
          <Dato etiqueta="Precio" valor={sub.precioARS == null ? 'No registrado' : `${precioPlan(sub.precioARS)}${PERIODOS[sub.modalidad] ? ` por ${PERIODOS[sub.modalidad]}` : ''}`} />
        </View>
        <Text testID="mi-suscripcion-fecha"
          style={sub.estado === 'pendiente_pago' ? s.alerta : sub.estado === 'cancelada' && sub.puedeReactivar ? p.ahorro : p.texto}>
          {textoFecha(sub)}
        </Text>
        {sub.fechaCancelacion ? <Text style={p.subtitulo}>Cancelación registrada el {fechaCorta(sub.fechaCancelacion)}</Text> : null}
        {sub.urlMedioPago ? <PrimaryButton label="Actualizar medio de pago" testID="mi-suscripcion-medio-pago" onPress={actualizarMedioPago} /> : null}
        {sub.puedeReactivar ? <PrimaryButton label="Reactivar renovación automática" testID="mi-suscripcion-reactivar" loading={procesando} disabled={procesando} onPress={reactivar} /> : null}
        {sub.puedeCancelar ? <PrimaryButton label="Cancelar renovación automática" variant="secondary" testID="mi-suscripcion-cancelar" loading={procesando} disabled={procesando} onPress={cancelar} /> : null}
        {!esPro ? <PrimaryButton label="Suscribirme a Pro" testID="mi-suscripcion-suscribirme" onPress={() => navigation.navigate('SuscribirsePro')} /> : null}
      </> : <>
        <Text style={p.texto}>
          Con Pro, los viajes que administrás suman más participantes, sugerencias con IA y almacenamiento para todo el grupo.
        </Text>
        {intentoPendiente
          ? <PrimaryButton label="Ver el estado de mi último pago" testID="mi-suscripcion-estado-pago" onPress={() => navigation.navigate('SuscripcionEstado')} />
          : <PrimaryButton label="Suscribirme a Pro" testID="mi-suscripcion-suscribirme" onPress={() => navigation.navigate('SuscribirsePro')} />}
        <PrimaryButton label="Comparar planes" variant="secondary" testID="mi-suscripcion-ver-planes" onPress={onVerPlanes} />
      </>}
    </SectionCard>

    <PrimaryButton label="Actualizar información" variant="secondary" loading={cargando} onPress={actualizar} />
  </View>;
}

const s = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icono: { width: 44, height: 44, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  iconoPro: { backgroundColor: colors.accent },
  etiqueta: { ...textStyles.label, color: colors.textMuted, fontSize: 11 },
  pastilla: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  datos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  dato: { flexGrow: 1, flexBasis: 160, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted, gap: 2 },
  datoEtiqueta: { ...textStyles.meta, color: colors.textSecondary, fontSize: 12 },
  datoValor: { ...textStyles.bodyStrong, color: colors.textPrimary, fontSize: 15 },
  alerta: { ...textStyles.body, color: colors.danger },
});