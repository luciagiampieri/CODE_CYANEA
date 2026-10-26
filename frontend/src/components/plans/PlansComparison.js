import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import PrimaryButton from '../ui/PrimaryButton';
import useAvailablePlans from '../../hooks/useAvailablePlans';
import { colors, spacing } from '../../theme/tokens';
import { LIMITES_COMPARACION, limitePlan, p, precioPlan } from './planStyles';

export default function PlansComparison({ navigation, onGestionar }) {
  const { datos, cargando, error, actualizar } = useAvailablePlans();

  if (cargando && !datos) return <ActivityIndicator color={colors.primary} size="large" />;
  if (error && !datos) return <View style={p.panel}>
    <Text accessibilityRole="alert" style={p.error}>{error}</Text>
    <PrimaryButton label="Reintentar" onPress={actualizar} />
  </View>;
  if (!datos) return null;

  const esPro = datos.planActual === 'pro';
  return <View style={{ gap: spacing.lg }}>
    <View style={p.planes}>
      <View style={[p.panel, p.plan, !esPro && p.actual]}>
        <View style={p.fila}><Text style={p.nombre}>Gratuito</Text>{!esPro ? <Text style={p.insignia}>Tu plan actual</Text> : null}</View>
        <Text style={p.precio}>Sin costo</Text>
        <Text style={p.subtitulo}>Para organizar tus próximas escapadas.</Text>
      </View>
      <View style={[p.panel, p.plan, p.pro, esPro && p.actual]}>
        <View style={p.fila}><FontAwesome6 name="crown" color={colors.primary} size={20} /><Text style={p.nombre}>Pro</Text>{esPro ? <Text style={p.insignia}>Tu plan actual</Text> : null}</View>
        <Text style={p.precio}>{precioPlan(datos.precioMensualARS)}<Text style={p.subtitulo}> / mes</Text></Text>
        <Text style={p.nombre}>{precioPlan(datos.precioAnualARS)}<Text style={p.subtitulo}> / año</Text></Text>
        {datos.ahorroAnualPorcentaje == null ? <Text style={p.subtitulo}>El ahorro anual se mostrará cuando estén configurados ambos precios.</Text> : <Text style={p.ahorro}>
          {Number(datos.ahorroAnualPorcentaje) > 0 ? `Ahorrás ${Number(datos.ahorroAnualPorcentaje).toLocaleString('es-AR', { maximumFractionDigits: 2 })} % con el plan anual` : 'La modalidad anual no ofrece ahorro frente al pago mensual.'}
        </Text>}
        <Text style={p.subtitulo}>Comparado con 12 pagos mensuales a la tarifa vigente.</Text>
        {esPro ? <PrimaryButton label="Gestionar mi suscripción" testID="planes-gestionar" onPress={onGestionar} /> :
          <PrimaryButton label="Suscribirme a Pro" testID="planes-suscribirme" disabled={datos.precioMensualARS == null || datos.precioAnualARS == null}
            onPress={() => navigation.navigate('SuscribirsePro')} />}
        {!esPro && datos.ultimaSuscripcion?.estado === 'pendiente_pago' ? <Pressable accessibilityRole="link" testID="planes-estado-pago"
          onPress={() => navigation.navigate('SuscripcionEstado')}><Text style={[p.subtitulo, { textDecorationLine: 'underline' }]}>Ver el estado de tu último pago</Text></Pressable> : null}
      </View>
    </View>
    <View style={p.panel}>
      <Text style={p.nombre}>Compará los límites vigentes</Text>
      <View style={[p.comparacionFila, p.comparacionCabecera]}>
        <Text style={[p.subtitulo, p.concepto]}>Beneficio</Text><Text style={p.valor}>Gratuito</Text><Text style={[p.valor, p.valorPro]}>Pro</Text>
      </View>
      {LIMITES_COMPARACION.map(([campo, titulo, unidad]) => <View key={campo} style={p.comparacionFila}>
        <View style={p.concepto}><Text style={p.etiqueta}>{titulo}</Text><Text style={p.unidad}>{unidad}</Text></View>
        <Text testID={`planes-gratuito-${campo}`} style={p.valor}>{limitePlan(datos.gratuito[campo], campo)}</Text>
        <Text testID={`planes-pro-${campo}`} style={[p.valor, p.valorPro]}>{limitePlan(datos.pro[campo], campo)}</Text>
      </View>)}
    </View>
    <View style={[p.panel, { backgroundColor: colors.accentMuted }]}>
      <Text style={p.nombre}>Tus beneficios Pro viajan con el grupo</Text>
      <Text style={p.texto}>Los beneficios Pro se extienden a todos los participantes de los viajes que administrás, aunque tengan una cuenta gratuita.</Text>
      <Text style={p.subtitulo}>Los límites de participantes, sugerencias y almacenamiento del viaje dependen de quien lo administra. Los escaneos mensuales corresponden al plan de cada usuario.</Text>
    </View>
  </View>;
}