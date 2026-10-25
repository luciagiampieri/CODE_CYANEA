import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { obtenerHistorialComercialUsuario } from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import ConsultaPagos from './ConsultaPagos';
import TablaFinanzas, { EstadoFinanciero, fechaCorta } from './TablaFinanzas';
import { BotonFinanzas, ESTADOS_SUSCRIPCIONES, monedaARS, PaginacionFinanzas, s } from './FinanzasPresentacion';

const plan = (valor) => valor === 'pro' ? 'Pro' : valor === 'gratuito' ? 'Gratuito' : valor;
const periodicidad = (valor) => ({ mensual: 'Mensual', anual: 'Anual' }[valor] || 'Sin periodicidad registrada');

function movimiento(item) {
  switch (item.movimiento) {
    case 'primer_periodo': return 'Primer período registrado';
    case 'cambio_plan': return `Cambio de plan: ${plan(item.planAnterior)} → ${plan(item.plan)}`;
    case 'cambio_periodicidad': return `Cambio de periodicidad: ${periodicidad(item.tipoPlanAnterior)} → ${periodicidad(item.tipoPlan)}`;
    case 'renovacion': return 'Renovación';
    default: return 'Nuevo período registrado';
  }
}

export default function FinanzasUsuario({ idUsuario }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [pagina, setPagina] = useState(1);
  const [recarga, setRecarga] = useState(0);
  const [vista, setVista] = useState('historial');
  const [idSuscripcion, setIdSuscripcion] = useState(null);
  useEffect(() => {
    let vigente = true;
    setCargando(true); setError('');
    obtenerHistorialComercialUsuario(idUsuario, pagina)
      .then((respuesta) => { if (vigente) setDatos(respuesta); })
      .catch((err) => { if (vigente) setError(err.message || 'No se pudo cargar el historial comercial.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [idUsuario, pagina, recarga]);

  function abrirPagos(id = null) { setIdSuscripcion(id); setVista('pagos'); }
  return <View style={[s.pantalla, { marginTop: 28 }]}>
    <Text style={s.subtitulo}>Suscripciones y pagos del usuario</Text>
    {cargando ? <ActivityIndicator color={c.acento} /> : error ? <View style={s.tarjeta}>
      <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      <BotonFinanzas onPress={() => setRecarga((n) => n + 1)}>Reintentar historial comercial</BotonFinanzas>
    </View> : datos ? <>
      <View style={[s.fila, { alignItems: 'stretch' }]}>
        <View style={[s.tarjeta, { flexGrow: 1, flexBasis: 230 }]}>
          <Text style={s.texto}>Total pagado por el usuario</Text><Text style={s.total}>{monedaARS(datos.totalPagadoARS)}</Text>
          <Text style={s.texto}>{datos.pagosAprobados} pagos aprobados · todas sus suscripciones</Text>
        </View>
        <View style={[s.tarjeta, { flexGrow: 1, flexBasis: 230 }]}>
          <Text style={s.texto}>Seguimiento de cobros</Text>
          <Text style={[s.subtitulo, { color: c.manteca }]}>{datos.pagosPendientes} pendientes · {datos.pagosRechazados} rechazados</Text>
          <Text style={s.texto}>Son intentos de pago registrados, no deudas acumuladas.</Text>
        </View>
        <View style={[s.tarjeta, { flexGrow: 1, flexBasis: 230 }]}>
          <Text style={s.texto}>Último período registrado</Text>
          <Text style={s.subtitulo}>{datos.ultimaSuscripcion ? `${plan(datos.ultimaSuscripcion.plan)} · ${periodicidad(datos.ultimaSuscripcion.tipoPlan)}` : 'Sin suscripciones registradas'}</Text>
          {datos.ultimaSuscripcion ? <Text style={s.texto}>{fechaCorta(datos.ultimaSuscripcion.fechaInicio)} al {fechaCorta(datos.ultimaSuscripcion.fechaFin)} · {ESTADOS_SUSCRIPCIONES[datos.ultimaSuscripcion.estado]}</Text> : null}
        </View>
      </View>
      <View style={s.fila}>
        <BotonFinanzas seleccionado={vista === 'historial'} onPress={() => setVista('historial')}>Historial de suscripciones y cambios</BotonFinanzas>
        <BotonFinanzas seleccionado={vista === 'pagos' && idSuscripcion == null} onPress={() => abrirPagos()}>Todos los pagos del usuario</BotonFinanzas>
      </View>
      {vista === 'pagos' ? <ConsultaPagos key={`${idUsuario}-${idSuscripcion}`} idUsuario={idUsuario} idSuscripcion={idSuscripcion} /> : <>
        <Text style={s.texto}>Plan actual de la cuenta: {plan(datos.planActual)}. La evolución se reconstruye desde los períodos registrados; no existe un registro completo de cambios manuales de plan anteriores.</Text>
        <Text style={s.texto}>Un período vencido o cancelado no acredita por sí solo un regreso al plan gratuito.</Text>
        <TablaFinanzas filas={datos.items} vacio="Este usuario no tiene suscripciones ni cambios de periodicidad registrados." columnas={[
          { nombre: 'Inicio del período', ancho: 140, render: (item) => <Text style={s.texto}>{fechaCorta(item.fechaInicio)}</Text> },
          { nombre: 'Movimiento', ancho: 240, render: (item) => <Text style={[s.texto, { color: c.texto }]}>{movimiento(item)}</Text> },
          { nombre: 'Plan / periodicidad', ancho: 155, render: (item) => <><Text style={s.texto}>{plan(item.plan)} · {periodicidad(item.tipoPlan)}</Text><Text style={s.texto}>Suscripción #{item.id}</Text></> },
          { nombre: 'Estado registrado', ancho: 185, render: (item) => <><EstadoFinanciero estado={item.estado} etiqueta={ESTADOS_SUSCRIPCIONES[item.estado]} />{item.fechaCancelacion ? <Text style={s.texto}>Cancelación: {fechaCorta(item.fechaCancelacion)}</Text> : null}</> },
          { nombre: 'Fin del período', ancho: 130, render: (item) => <Text style={s.texto}>{fechaCorta(item.fechaFin)}</Text> },
          { nombre: 'Importe del período', ancho: 170, numero: true, render: (item) => <Text style={s.texto}>{monedaARS(item.precioPeriodoARS)}</Text> },
          { nombre: 'Pagos asociados', ancho: 145, render: (item) => <BotonFinanzas accessibilityLabel={`Ver pagos de suscripción #${item.id}`} onPress={() => abrirPagos(item.id)}>Ver pagos</BotonFinanzas> },
        ]} />
        <PaginacionFinanzas datos={datos} onCambiar={setPagina} />
      </>}
    </> : null}
  </View>;
}
