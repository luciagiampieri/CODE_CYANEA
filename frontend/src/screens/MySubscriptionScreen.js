import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import ScreenContainer from '../components/layout/ScreenContainer';
import IconCircleButton from '../components/ui/IconCircleButton';
import PrimaryButton from '../components/ui/PrimaryButton';
import useAvailablePlans from '../hooks/useAvailablePlans';
import { colors } from '../theme/tokens';
import { p, precioPlan } from './PlansScreen';

const estados = { activa: 'Activa', cancelada: 'Cancelada', vencida: 'Vencida', pendiente_pago: 'Pendiente de pago', descartada: 'No concretada' };
const fecha = (valor) => new Date(valor).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

export default function MySubscriptionScreen({ navigation }) {
  const { datos, cargando, error, actualizar } = useAvailablePlans();
  const sub = datos?.ultimaSuscripcion;
  const conservaPeriodo = datos?.planActual === 'pro' && sub?.estado === 'cancelada' && new Date(sub.fechaFin) > new Date();
  return <ScreenContainer fullWidth padded={false}><ScrollView contentContainerStyle={p.scroll}><View style={p.contenido}>
    <View style={p.encabezado}><IconCircleButton icon="arrow-left" tone="surface" accessibilityLabel="Volver" onPress={() => navigation.goBack()} /><Text style={p.titulo}>Mi suscripción</Text></View>
    {cargando ? <ActivityIndicator color={colors.primary} /> : error ? <View style={p.panel}>
      <Text accessibilityRole="alert" style={p.error}>{error}</Text><PrimaryButton label="Reintentar" onPress={actualizar} />
    </View> : datos ? <View style={p.panel}>
      <Text style={p.nombre}>Plan actual: {datos.planActual === 'pro' ? 'Pro' : 'Gratuito'}</Text>
      {sub ? <>
        <Text style={p.texto}>Estado del último período: {estados[sub.estado] || sub.estado}</Text>
        <Text style={p.texto}>Modalidad: {sub.tipoPlan === 'mensual' ? 'Mensual' : sub.tipoPlan === 'anual' ? 'Anual' : 'Sin periodicidad registrada'}</Text>
        <Text style={p.texto}>Inicio: {fecha(sub.fechaInicio)}</Text>
        <Text style={p.texto}>Fin del período: {fecha(sub.fechaFin)}</Text>
        <Text style={p.texto}>Importe del período: {sub.precioPeriodoARS == null ? 'No registrado' : precioPlan(sub.precioPeriodoARS)}</Text>
        {sub.fechaCancelacion ? <Text style={p.texto}>Cancelación registrada: {fecha(sub.fechaCancelacion)}</Text> : null}
        {conservaPeriodo ? <Text style={p.ahorro}>Conservás los beneficios Pro hasta el {fecha(sub.fechaFin)}. La suscripción no se renovará.</Text> : null}
      </> : <Text style={p.texto}>No hay períodos de suscripción registrados para tu cuenta.</Text>}
      {sub?.estado === 'pendiente_pago' ? <PrimaryButton label="Ver el estado del pago" testID="mi-suscripcion-estado-pago" onPress={() => navigation.navigate('SuscripcionEstado')} /> : null}
      {datos.planActual !== 'pro' && sub?.estado !== 'pendiente_pago' ? <PrimaryButton label="Suscribirme a Pro" testID="mi-suscripcion-suscribirme" onPress={() => navigation.navigate('SuscribirsePro')} /> : null}
      <Text style={p.subtitulo}>Los cambios de modalidad y de renovación estarán disponibles próximamente.</Text>
      <PrimaryButton label="Actualizar información" variant="secondary" onPress={actualizar} />
    </View> : null}
  </View></ScrollView></ScreenContainer>;
}
