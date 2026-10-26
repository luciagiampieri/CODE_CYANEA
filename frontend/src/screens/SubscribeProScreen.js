import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome6 } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import ScreenContainer from '../components/layout/ScreenContainer';
import IconCircleButton from '../components/ui/IconCircleButton';
import PrimaryButton from '../components/ui/PrimaryButton';
import { getSubscriptionSummary, startSubscription } from '../services/api';
import { colors, radii, spacing } from '../theme/tokens';
import { p, precioPlan } from '../components/plans/planStyles';

export const MODALIDADES = [
  { clave: 'mensual', nombre: 'Mensual', periodo: 'mes' },
  { clave: 'anual', nombre: 'Anual', periodo: 'año' },
];

export const fechaCorta = (valor) => new Date(valor).toLocaleDateString('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
});

async function abrirPago(urlPago, urlRetorno) {
  try {
    await WebBrowser.openAuthSessionAsync(urlPago, urlRetorno);
  } catch {
    await Linking.openURL(urlPago);
  }
}

export default function SubscribeProScreen({ navigation, route }) {
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [modalidad, setModalidad] = useState(route?.params?.modalidad === 'anual' ? 'anual' : 'mensual');
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');

  useFocusEffect(useCallback(() => {
    let vigente = true;
    setCargando(true); setError('');
    getSubscriptionSummary().then((datos) => { if (vigente) setResumen(datos); })
      .catch((err) => { if (vigente) setError(err.message || 'No se pudo cargar la suscripción.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [recarga]));

  const elegida = MODALIDADES.find((m) => m.clave === modalidad);
  const detalle = resumen?.modalidades?.[modalidad];

  const confirmar = async () => {
    setEnviando(true); setErrorEnvio('');
    try {
      const inicio = await startSubscription({ modalidad, aceptaRenovacionAutomatica: acepta });
      await abrirPago(inicio.urlPago, inicio.urlRetorno);
      navigation.replace('SuscripcionEstado');
    } catch (err) {
      setErrorEnvio(err.message || 'No se pudo iniciar la suscripción.');
      if (err.code === 'SUBSCRIPTION_PAYMENT_PENDING' || err.code === 'SUBSCRIPTION_ALREADY_ACTIVE') {
        setRecarga((n) => n + 1);
      }
    } finally {
      setEnviando(false);
    }
  };

  const bloqueo = resumen && !resumen.puedeSuscribirse ? <View style={p.panel} testID="suscribirse-bloqueo">
    <Text style={p.nombre}>No podés suscribirte en este momento</Text>
    <Text style={p.texto}>{resumen.mensaje}</Text>
    {resumen.codigo === 'SUBSCRIPTION_PAYMENT_PENDING' ? <PrimaryButton label="Ver el estado de mi pago" testID="suscribirse-ver-estado"
      onPress={() => navigation.replace('SuscripcionEstado')} /> : null}
    {resumen.codigo === 'SUBSCRIPTION_ALREADY_ACTIVE' ? <PrimaryButton label="Ver mi suscripción"
      onPress={() => navigation.navigate('MiSuscripcion')} /> : null}
  </View> : null;

  return <ScreenContainer fullWidth padded={false}>
    <ScrollView contentContainerStyle={p.scroll}>
      <View style={p.contenido}>
        <View style={p.encabezado}>
          <IconCircleButton icon="arrow-left" tone="surface" accessibilityLabel="Volver" onPress={() => navigation.goBack()} />
          <View style={{ flex: 1 }}>
            <Text style={p.titulo}>Suscribirme a Pro</Text>
            <Text style={p.subtitulo}>Elegí cómo querés pagar y revisá el resumen antes de continuar.</Text>
          </View>
        </View>
        {cargando ? <ActivityIndicator color={colors.primary} size="large" /> : error ? <View style={p.panel}>
          <Text accessibilityRole="alert" style={p.error}>{error}</Text>
          <PrimaryButton label="Reintentar" onPress={() => setRecarga((n) => n + 1)} />
        </View> : resumen ? (bloqueo || <>
          <View style={p.panel}>
            <Text style={p.nombre}>1. Elegí la modalidad</Text>
            <View style={p.planes}>
              {MODALIDADES.map((m) => {
                const seleccionada = m.clave === modalidad;
                return <Pressable key={m.clave} testID={`suscribirse-modalidad-${m.clave}`} accessibilityRole="radio"
                  accessibilityState={{ selected: seleccionada }} onPress={() => setModalidad(m.clave)}
                  style={[p.panel, p.plan, { flexBasis: 220 }, seleccionada && p.actual]}>
                  <Text style={p.nombre}>{m.nombre}</Text>
                  <Text style={p.precio}>{precioPlan(resumen.modalidades[m.clave].precioARS)}<Text style={p.subtitulo}> / {m.periodo}</Text></Text>
                </Pressable>;
              })}
            </View>
          </View>

          <View style={p.panel} testID="suscribirse-resumen">
            <Text style={p.nombre}>2. Resumen</Text>
            <Text style={p.texto}>Modalidad: {elegida.nombre}</Text>
            <Text style={p.texto}>Precio: {precioPlan(detalle.precioARS)} por {elegida.periodo}</Text>
            <Text style={p.texto} testID="suscribirse-renovacion">Próxima renovación: {fechaCorta(detalle.fechaProximaRenovacion)}</Text>
            <Text style={p.subtitulo}>Si el pago se acredita otro día, el período y la renovación se cuentan desde la acreditación.</Text>
          </View>

          <View style={p.panel}>
            <Text style={p.nombre}>3. Renovación automática</Text>
            <Pressable testID="suscribirse-acepta" accessibilityRole="checkbox" accessibilityState={{ checked: acepta }}
              onPress={() => setAcepta((v) => !v)} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
              <FontAwesome6 name={acepta ? 'square-check' : 'square'} size={22} color={colors.primary} solid={acepta} />
              <Text style={[p.texto, { flex: 1 }]}>
                Acepto que mi suscripción se renueve automáticamente y que Mercado Pago cobre {precioPlan(detalle.precioARS)} cada {elegida.periodo}.
              </Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surfaceMuted, padding: spacing.md, borderRadius: radii.md }}>
              <FontAwesome6 name="lock" size={14} color={colors.textSecondary} />
              <Text style={[p.subtitulo, { flex: 1 }]}>Vas a completar el pago en Mercado Pago. Cyanea no guarda los datos de tu tarjeta.</Text>
            </View>
          </View>

          {errorEnvio ? <Text accessibilityRole="alert" style={p.error}>{errorEnvio}</Text> : null}
          <PrimaryButton label="Continuar a Mercado Pago" testID="suscribirse-confirmar" disabled={!acepta}
            loading={enviando} onPress={confirmar} />
        </>) : null}
      </View>
    </ScrollView>
  </ScreenContainer>;
}
