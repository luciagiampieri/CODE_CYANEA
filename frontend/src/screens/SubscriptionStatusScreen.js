import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome6 } from '@expo/vector-icons';
import ScreenContainer from '../components/layout/ScreenContainer';
import IconCircleButton from '../components/ui/IconCircleButton';
import PrimaryButton from '../components/ui/PrimaryButton';
import { getSubscriptionStatus } from '../services/api';
import { colors } from '../theme/tokens';
import { p, precioPlan } from './PlansScreen';
import { fechaCorta } from './SubscribeProScreen';

export const INTERVALO_CONSULTA_MS = 4000;
export const MAX_CONSULTAS = 30; // unos dos minutos esperando la confirmación
const ESPERANDO = new Set(['sin_pago', 'pago_en_proceso']);

const CONTENIDO = {
  activa: { icono: 'crown', color: colors.primary, titulo: '¡Ya sos Pro!' },
  pago_en_proceso: {
    icono: 'hourglass-half', color: colors.warning, titulo: 'Tu pago se está procesando',
    texto: 'La suscripción se activará al acreditarse el pago. Te vamos a avisar por correo y en la app.',
  },
  pago_rechazado: {
    icono: 'circle-xmark', color: colors.danger, titulo: 'Tu pago fue rechazado',
    texto: 'Tu plan no cambió y no se realizó ningún cobro. Podés intentarlo de nuevo con la misma tarjeta o con otro medio de pago.',
  },
  sin_pago: {
    icono: 'clock', color: colors.textSecondary, titulo: 'Todavía no recibimos la confirmación de tu pago',
    texto: 'Si completaste el pago, puede tardar unos segundos en confirmarse. Si saliste de Mercado Pago sin pagar, tu plan no cambió.',
  },
  descartada: {
    icono: 'circle-minus', color: colors.textSecondary, titulo: 'La suscripción no se concretó',
    texto: 'Tu plan no cambió. Podés iniciar una nueva suscripción cuando quieras.',
  },
};

export default function SubscriptionStatusScreen({ navigation }) {
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [consultas, setConsultas] = useState(0);
  const enFoco = useRef(false);

  const consultar = useCallback(() => getSubscriptionStatus()
    .then((datos) => { if (enFoco.current) { setEstado(datos); setError(''); } })
    .catch((err) => { if (enFoco.current) setError(err.message || 'No se pudo consultar tu suscripción.'); })
    .finally(() => { if (enFoco.current) setCargando(false); }), []);

  useFocusEffect(useCallback(() => {
    enFoco.current = true;
    setCargando(true); setConsultas(0);
    consultar();
    return () => { enFoco.current = false; };
  }, [consultar]));

  // Mientras se espera la confirmación de Mercado Pago se vuelve a consultar.
  useEffect(() => {
    if (!estado || !ESPERANDO.has(estado.estado) || consultas >= MAX_CONSULTAS) return undefined;
    const temporizador = setTimeout(() => { setConsultas((n) => n + 1); consultar(); }, INTERVALO_CONSULTA_MS);
    return () => clearTimeout(temporizador);
  }, [estado, consultas, consultar]);

  const actualizar = () => { setCargando(true); setConsultas(0); consultar(); };
  // En React Navigation 7, `navigate` hacia una pantalla anterior agrega otra copia
  // al stack: se usa popTo/replace para no dejar pantallas repetidas al volver atrás.
  const volverAPlanes = () => (typeof navigation.popTo === 'function'
    ? navigation.popTo('Planes') : navigation.navigate('Planes'));
  const reintentar = () => navigation.replace('SuscribirsePro', { modalidad: estado?.modalidad });
  const contenido = estado ? CONTENIDO[estado.estado] : null;

  return <ScreenContainer fullWidth padded={false}>
    <ScrollView contentContainerStyle={p.scroll}>
      <View style={p.contenido}>
        <View style={p.encabezado}>
          <IconCircleButton icon="arrow-left" tone="surface" accessibilityLabel="Volver a planes" onPress={volverAPlanes} />
          <Text style={[p.titulo, { flex: 1 }]}>Estado de tu suscripción</Text>
        </View>
        {cargando && !estado ? <ActivityIndicator color={colors.primary} size="large" /> : error && !estado ? <View style={p.panel}>
          <Text accessibilityRole="alert" style={p.error}>{error}</Text>
          <PrimaryButton label="Volver a planes" variant="secondary" onPress={volverAPlanes} />
        </View> : contenido ? <View style={[p.panel, { alignItems: 'center' }]} testID={`suscripcion-estado-${estado.estado}`}>
          <FontAwesome6 name={contenido.icono} size={44} color={contenido.color} solid />
          <Text style={[p.nombre, { textAlign: 'center' }]}>{contenido.titulo}</Text>
          {estado.estado === 'activa' ? <Text style={[p.texto, { textAlign: 'center' }]}>
            Tu suscripción {estado.modalidad} está activa. Próxima renovación: {fechaCorta(estado.fechaProximaRenovacion)}.
          </Text> : <Text style={[p.texto, { textAlign: 'center' }]}>{contenido.texto}</Text>}
          <Text style={p.subtitulo}>
            {estado.modalidad === 'anual' ? 'Pro anual' : 'Pro mensual'} · {precioPlan(estado.precioARS)}
          </Text>
          {ESPERANDO.has(estado.estado) && consultas < MAX_CONSULTAS ? <View style={[p.fila, { justifyContent: 'center' }]}>
            <ActivityIndicator color={colors.primary} /><Text style={p.subtitulo}>Esperando la confirmación de Mercado Pago…</Text>
          </View> : null}
          {error ? <Text accessibilityRole="alert" style={p.error}>{error}</Text> : null}

          {estado.estado === 'activa' ? <PrimaryButton label="Ver mi suscripción" testID="suscripcion-ver" onPress={() => navigation.replace('MiSuscripcion')} /> : null}
          {['pago_rechazado', 'sin_pago', 'descartada'].includes(estado.estado) ? <PrimaryButton label="Reintentar" testID="suscripcion-reintentar" onPress={reintentar} /> : null}
          {ESPERANDO.has(estado.estado) ? <PrimaryButton label="Actualizar" variant="secondary" testID="suscripcion-actualizar" loading={cargando} onPress={actualizar} /> : null}
        </View> : null}
      </View>
    </ScrollView>
  </ScreenContainer>;
}
