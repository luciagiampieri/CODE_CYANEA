import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import ScreenContainer from '../components/layout/ScreenContainer';
import IconCircleButton from '../components/ui/IconCircleButton';
import PrimaryButton from '../components/ui/PrimaryButton';
import AccountUsage from '../components/plans/AccountUsage';
import { appAlert } from '../components/ui/AppDialog';
import useAvailablePlans from '../hooks/useAvailablePlans';
import { colors, radii, spacing, textStyles } from '../theme/tokens';

export const LIMITES_COMPARACION = [
  ['maxViajesActivos', 'Viajes activos que administrás', 'simultáneos'],
  ['maxParticipantesViaje', 'Participantes por viaje', 'incluido quien administra'],
  ['maxSugerenciasDiarias', 'Solicitudes de sugerencias con IA', 'por viaje, por día'],
  ['maxEscaneosMensuales', 'Escaneos de comprobantes', 'por usuario, por mes'],
  ['maxAlmacenamientoMb', 'Almacenamiento del repositorio', 'por viaje'],
];
export const precioPlan = (valor) => valor == null ? 'Precio por configurar' : `ARS ${Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const limite = (valor, campo) => valor == null ? 'Sin límite' : `${Number(valor).toLocaleString('es-AR')}${campo === 'maxAlmacenamientoMb' ? ' MB' : ''}`;

export default function PlansScreen({ navigation }) {
  const { datos, cargando, error, actualizar } = useAvailablePlans();
  const [vista, setVista] = useState('comparacion');
  return <ScreenContainer fullWidth padded={false}>
    <ScrollView contentContainerStyle={p.scroll}>
      <View style={p.contenido}>
        <View style={p.encabezado}>
          <IconCircleButton icon="arrow-left" tone="surface" accessibilityLabel="Volver" onPress={() => navigation.goBack()} testID="planes-volver" />
          <View style={{ flex: 1 }}><Text style={p.titulo}>Tu plan y consumo</Text><Text style={p.subtitulo}>Controlá tu cuenta y compará los beneficios de cada plan.</Text></View>
        </View>
        <View style={p.fila}>
          {[['consumo', 'Mi consumo'], ['comparacion', 'Comparar planes']].map(([clave, nombre]) => <Pressable key={clave} accessibilityRole="button"
            accessibilityState={{ selected: vista === clave }} onPress={() => { setVista(clave); if (clave === 'comparacion') actualizar(); }}
            style={[p.pestana, vista === clave && { backgroundColor: colors.primary }]}>
            <Text style={[p.etiqueta, vista === clave && { color: colors.surface }]}>{nombre}</Text>
          </Pressable>)}
        </View>
        {vista === 'consumo' ? <AccountUsage /> : cargando ? <ActivityIndicator color={colors.primary} size="large" /> : error ? <View style={p.panel}>
          <Text accessibilityRole="alert" style={p.error}>{error}</Text><PrimaryButton label="Reintentar" onPress={actualizar} />
        </View> : datos ? <>
          <View style={p.planes}>
            <View style={[p.panel, p.plan, datos.planActual === 'gratuito' && p.actual]}>
              <View style={p.fila}><Text style={p.nombre}>Gratuito</Text>{datos.planActual === 'gratuito' ? <Text style={p.insignia}>Tu plan actual</Text> : null}</View>
              <Text style={p.precio}>Sin costo</Text><Text style={p.subtitulo}>Para organizar tus próximas escapadas.</Text>
            </View>
            <View style={[p.panel, p.plan, p.pro, datos.planActual === 'pro' && p.actual]}>
              <View style={p.fila}><FontAwesome6 name="crown" color={colors.primary} size={20} /><Text style={p.nombre}>Pro</Text>{datos.planActual === 'pro' ? <Text style={p.insignia}>Tu plan actual</Text> : null}</View>
              <Text style={p.precio}>{precioPlan(datos.precioMensualARS)}<Text style={p.subtitulo}> / mes</Text></Text>
              <Text style={p.nombre}>{precioPlan(datos.precioAnualARS)}<Text style={p.subtitulo}> / año</Text></Text>
              {datos.ahorroAnualPorcentaje == null ? <Text style={p.subtitulo}>El ahorro anual se mostrará cuando estén configurados ambos precios.</Text> : <Text style={p.ahorro}>
                {Number(datos.ahorroAnualPorcentaje) > 0 ? `Ahorrás ${Number(datos.ahorroAnualPorcentaje).toLocaleString('es-AR', { maximumFractionDigits: 2 })} % con el plan anual` : 'La modalidad anual no ofrece ahorro frente al pago mensual.'}
              </Text>}
              <Text style={p.subtitulo}>Comparado con 12 pagos mensuales a la tarifa vigente.</Text>
              {datos.planActual === 'pro' ? <PrimaryButton label="Gestionar mi suscripción" testID="planes-gestionar" onPress={() => navigation.navigate('MiSuscripcion')} /> :
                <PrimaryButton label="Suscribirme a Pro" testID="planes-suscribirme" disabled={datos.precioMensualARS == null || datos.precioAnualARS == null}
                  onPress={() => appAlert('Suscripciones Pro', 'La contratación de Pro estará disponible próximamente. Podés consultar aquí los precios y beneficios vigentes.')} />}
              {datos.planActual !== 'pro' ? <Text style={p.subtitulo}>Contratación disponible próximamente.</Text> : null}
            </View>
          </View>
          <View style={p.panel}>
            <Text style={p.nombre}>Compará los límites vigentes</Text>
            <View style={[p.comparacionFila, p.comparacionCabecera]}>
              <Text style={[p.subtitulo, p.concepto]}>Beneficio</Text><Text style={p.valor}>Gratuito</Text><Text style={[p.valor, p.valorPro]}>Pro</Text>
            </View>
            {LIMITES_COMPARACION.map(([campo, titulo, unidad]) => <View key={campo} style={p.comparacionFila}>
              <View style={p.concepto}><Text style={p.etiqueta}>{titulo}</Text><Text style={p.unidad}>{unidad}</Text></View>
              <Text testID={`planes-gratuito-${campo}`} style={p.valor}>{limite(datos.gratuito[campo], campo)}</Text>
              <Text testID={`planes-pro-${campo}`} style={[p.valor, p.valorPro]}>{limite(datos.pro[campo], campo)}</Text>
            </View>)}
          </View>
          <View style={[p.panel, { backgroundColor: colors.accentMuted }]}>
            <Text style={p.nombre}>Tus beneficios Pro viajan con el grupo</Text>
            <Text style={p.texto}>Los beneficios Pro se extienden a todos los participantes de los viajes que administrás, aunque tengan una cuenta gratuita.</Text>
            <Text style={p.subtitulo}>Los límites de participantes, sugerencias y almacenamiento del viaje dependen de quien lo administra. Los escaneos mensuales corresponden al plan de cada usuario.</Text>
          </View>
        </> : null}
      </View>
    </ScrollView>
  </ScreenContainer>;
}

export const p = StyleSheet.create({
  scroll: { padding: spacing.md, paddingBottom: spacing.xxxl, alignItems: 'center' },
  contenido: { width: '100%', maxWidth: 1000, gap: spacing.lg },
  encabezado: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', paddingVertical: spacing.md },
  pestana: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.surface },
  titulo: { ...textStyles.screenTitle, color: colors.primary },
  subtitulo: { ...textStyles.meta, color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  texto: { ...textStyles.body, color: colors.textPrimary },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  panel: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  planes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'stretch' },
  plan: { flexGrow: 1, flexBasis: 300 },
  actual: { borderColor: colors.primary, borderWidth: 2 },
  pro: { backgroundColor: '#fffcf0' },
  nombre: { ...textStyles.bodyStrong, color: colors.primary, fontSize: 20 },
  precio: { ...textStyles.screenTitle, color: colors.primary, fontSize: 28 },
  insignia: { backgroundColor: colors.primary, color: colors.surface, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: '700' },
  ahorro: { color: colors.success, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, fontSize: 16 },
  comparacionFila: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: 'center', gap: 6 },
  comparacionCabecera: { borderTopWidth: 0 },
  concepto: { flex: 1.8 },
  etiqueta: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  unidad: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  valor: { flex: 1, textAlign: 'center', color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  valorPro: { color: colors.primary, fontWeight: '800' },
});
