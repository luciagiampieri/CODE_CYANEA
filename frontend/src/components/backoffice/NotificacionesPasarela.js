import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import TablaFinanzas, { EstadoFinanciero } from './TablaFinanzas';
import { listarNotificacionesPasarela } from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { BotonFinanzas, ESTADOS_NOTIFICACIONES, FiltroEstado, PaginacionFinanzas, fechaFinanciera, s } from './FinanzasPresentacion';

const TIPOS = {
  subscription_authorized_payment: 'Cobro de suscripción',
  authorized_payment: 'Cobro de suscripción',
  subscription_preapproval: 'Estado de la suscripción',
  preapproval: 'Estado de la suscripción',
};

export const tipoNotificacion = (tipo) => TIPOS[tipo] || tipo;

export default function NotificacionesPasarela() {
  const [filtros, setFiltros] = useState({ estado: null, pagina: 1 });
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true); setError(''); setDatos(null);
    listarNotificacionesPasarela(filtros)
      .then((respuesta) => { if (vigente) setDatos(respuesta); })
      .catch((err) => { if (vigente) setError(err.message || 'No se pudieron consultar las notificaciones.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [filtros, recarga]);

  const totales = datos?.totalesPorEstado;
  return <View style={s.pantalla}>
    <View style={s.tarjeta}>
      <Text style={s.subtitulo}>Notificaciones de Mercado Pago</Text>
      <Text style={s.texto}>Cada aviso recibido de la pasarela, con su resultado. Las que terminaron con error se reintentan automáticamente desde Mercado Pago.</Text>
      {totales ? <Text style={s.texto} testID="notificaciones-totales">
        {totales.procesada} procesadas · {totales.ignorada} ignoradas · {totales.error} con error
      </Text> : null}
      <FiltroEstado nombre="Resultado de la notificación" etiquetas={ESTADOS_NOTIFICACIONES} valor={filtros.estado}
        onCambiar={(estado) => setFiltros({ estado, pagina: 1 })} />
    </View>
    {cargando ? <ActivityIndicator color={c.acento} /> : error ? <View style={s.tarjeta}>
      <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      <BotonFinanzas onPress={() => setRecarga((n) => n + 1)}>Reintentar notificaciones</BotonFinanzas>
    </View> : datos ? <>
      <TablaFinanzas filas={datos.items} vacio="No se recibieron notificaciones para el filtro aplicado." columnas={[
        { nombre: 'Recepción', ancho: 180, render: (item) => <Text style={s.texto}>{fechaFinanciera(item.fechaRecepcion)}</Text> },
        { nombre: 'Tipo', ancho: 190, render: (item) => <><Text style={[s.texto, { color: c.texto, fontWeight: '600' }]}>{tipoNotificacion(item.tipo)}</Text><Text style={s.texto}>Recurso: {item.idRecurso}</Text></> },
        { nombre: 'Resultado', ancho: 140, render: (item) => <EstadoFinanciero estado={item.estado} etiqueta={ESTADOS_NOTIFICACIONES[item.estado]} /> },
        { nombre: 'Detalle', ancho: 300, render: (item) => <Text style={[s.texto, item.error && { color: c.peligro }]}>{item.error || (item.idSolicitud ? `Solicitud: ${item.idSolicitud}` : '—')}</Text> },
      ]} />
      <PaginacionFinanzas datos={datos} onCambiar={(pagina) => setFiltros((f) => ({ ...f, pagina }))} />
    </> : null}
  </View>;
}
