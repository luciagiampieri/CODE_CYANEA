import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome6 } from '@expo/vector-icons';
import ScreenContainer from '../components/layout/ScreenContainer';
import PrimaryButton from '../components/ui/PrimaryButton';
import ScreenHeader from '../components/ui/ScreenHeader';
import SectionCard from '../components/ui/SectionCard';
import { getSubscriptionPayments } from '../services/api';
import { colors, spacing, textStyles } from '../theme/tokens';
import { p, precioCorto } from '../components/plans/planStyles';
import { fechaCorta, formatearPeriodo } from '../utils/fechasSuscripcion';

export const ESTADOS_PAGO = {
  aprobado: { texto: 'Aprobado', icono: 'check', fondo: colors.successSurface, color: colors.success },
  rechazado: { texto: 'Rechazado', icono: 'xmark', fondo: colors.dangerSurface, color: colors.danger },
  pendiente: { texto: 'Pendiente', icono: 'clock', fondo: colors.warningSurface, color: colors.warning },
};

function FilaPago({ pago, ultima }) {
  const estado = ESTADOS_PAGO[pago.estado];
  const rechazado = pago.estado === 'rechazado';
  return <View style={[s.fila, !ultima && s.divisor]} testID={`pago-${pago.id}`}>
    <View style={[s.icono, estado && { backgroundColor: estado.fondo }]}>
      <FontAwesome6 name={estado?.icono ?? 'receipt'} size={14} color={estado?.color ?? colors.textSecondary} />
    </View>
    <View style={s.centro}>
      <Text style={s.periodo} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {formatearPeriodo(pago.periodoDesde, pago.periodoHasta) ?? 'Período no registrado'}
      </Text>
      <Text style={s.detalle} numberOfLines={1}>
        {`${pago.estado === 'aprobado' ? 'Pagado el' : 'Intento del'} ${fechaCorta(pago.fecha)}`}
      </Text>
    </View>
    <View style={s.derecha}>
      <Text style={[s.monto, rechazado && s.montoRechazado]}>{precioCorto(pago.montoARS)}</Text>
      {estado ? <Text style={[p.pastilla, s.pastilla, { backgroundColor: estado.fondo, color: estado.color }]}>{estado.texto}</Text> : null}
    </View>
  </View>;
}

export default function PaymentHistoryScreen({ navigation }) {
  const [pagos, setPagos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);

  useFocusEffect(useCallback(() => {
    let vigente = true;
    setCargando(true); setError('');
    getSubscriptionPayments()
      .then((respuesta) => { if (vigente) setPagos(respuesta.items); })
      .catch((err) => { if (vigente) setError(err.message || 'No se pudo cargar tu historial de pagos.'); })
      .finally(() => { if (vigente) { setCargando(false); setRefrescando(false); } });
    return () => { vigente = false; };
  }, [recarga]));

  function refrescar() {
    setRefrescando(true);
    setRecarga((n) => n + 1);
  }

  return <ScreenContainer fullWidth padded={false}>
    <ScrollView
      contentContainerStyle={p.scroll}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <ScreenHeader title="Historial de pagos" onBack={() => navigation.goBack()} />
      <View style={p.contenido}>
        {cargando && !pagos ? <ActivityIndicator color={colors.primary} size="large" /> : error && !pagos ? <View style={p.panel}>
          <Text accessibilityRole="alert" style={p.error}>{error}</Text>
          <PrimaryButton label="Reintentar" onPress={() => setRecarga((n) => n + 1)} />
        </View> : pagos?.length === 0 ? <SectionCard padded testID="historial-pagos-vacio" style={s.vacio}>
          <View style={s.vacioIcono}>
            <FontAwesome6 name="receipt" size={22} color={colors.primary} />
          </View>
          <Text style={s.vacioTitulo}>Todavía no hay pagos</Text>
          <Text style={s.vacioTexto}>Acá vas a ver los cobros de tu suscripción Pro.</Text>
        </SectionCard> : pagos ? <View style={s.lista}>
          <Text style={s.resumen}>
            {pagos.length === 1 ? '1 pago' : `${pagos.length} pagos`} · el más reciente primero
          </Text>
          <SectionCard testID="historial-pagos">
            {pagos.map((pago, indice) => <FilaPago key={pago.id} pago={pago} ultima={indice === pagos.length - 1} />)}
          </SectionCard>
        </View> : null}
      </View>
    </ScrollView>
  </ScreenContainer>;
}

const s = StyleSheet.create({
  lista: { gap: spacing.sm },
  resumen: { ...textStyles.meta, color: colors.textSecondary, fontSize: 13 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  divisor: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icono: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  centro: { flex: 1, minWidth: 0, gap: 2 },
  periodo: { ...textStyles.bodyStrong, color: colors.textPrimary, fontSize: 13 },
  detalle: { ...textStyles.meta, color: colors.textSecondary, fontSize: 12 },
  derecha: { alignItems: 'flex-end', gap: 4 },
  monto: { ...textStyles.bodyStrong, color: colors.textPrimary, fontSize: 15 },
  montoRechazado: { color: colors.textMuted },
  // Pastilla más compacta para dejarle lugar al período en pantallas de 360 px.
  pastilla: { paddingHorizontal: 8, fontSize: 11 },
  vacio: { alignItems: 'center', paddingVertical: spacing.xl },
  vacioIcono: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  vacioTitulo: { ...textStyles.bodyStrong, color: colors.textPrimary, fontSize: 16 },
  vacioTexto: { ...textStyles.meta, color: colors.textSecondary, textAlign: 'center' },
});
