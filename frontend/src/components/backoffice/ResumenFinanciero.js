import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { obtenerResumenFinanciero } from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import CampoFecha from './CampoFecha';
import { validarFechasPagos } from './ConsultaPagos';
import { BotonFinanzas, monedaARS, s } from './FinanzasPresentacion';
import TablaFinanzas, { fechaCorta } from './TablaFinanzas';

function mesNombre(periodo) {
  const [anio, mes] = periodo.split('-');
  return new Date(Number(anio), Number(mes) - 1, 15).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
}

export default function ResumenFinanciero({ onVerPagos, periodoInicial = {}, onPeriodoAplicado }) {
  const [filtros, setFiltros] = useState(periodoInicial);
  const [borrador, setBorrador] = useState({ desde: periodoInicial.desde || '', hasta: periodoInicial.hasta || '' });
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [validacion, setValidacion] = useState('');
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    let vigente = true;
    setCargando(true); setError('');
    obtenerResumenFinanciero(filtros).then((respuesta) => {
      if (vigente) {
        setDatos(respuesta); setBorrador({ desde: respuesta.desde, hasta: respuesta.hasta });
        onPeriodoAplicado?.({ desde: respuesta.desde, hasta: respuesta.hasta });
      }
    }).catch((err) => { if (vigente) setError(err.message || 'No se pudo cargar el resumen financiero.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [filtros, recarga]);

  function aplicar() {
    const mensaje = !borrador.desde || !borrador.hasta ? 'Seleccioná ambas fechas.' : validarFechasPagos(borrador.desde, borrador.hasta);
    setValidacion(mensaje);
    if (!mensaje) setFiltros({ ...borrador });
  }
  function rapido(tipo) {
    const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const fecha = new Date(`${hoy}T12:00:00Z`);
    if (tipo === 'mes') fecha.setUTCDate(1);
    if (tipo === '90dias') fecha.setUTCDate(fecha.getUTCDate() - 89);
    if (tipo === '12meses') { fecha.setUTCDate(1); fecha.setUTCMonth(fecha.getUTCMonth() - 11); }
    setValidacion(''); setFiltros({ desde: fecha.toISOString().slice(0, 10), hasta: hoy });
  }
  const maximo = datos ? Math.max(1, ...datos.periodos.map((p) => Number(p.ingresosARS))) : 1;
  const ver = (extra = {}) => onVerPagos({ desde: datos.desde, hasta: datos.hasta, ...extra });
  return <View style={s.pantalla}>
    <View style={s.tarjeta}>
      <View style={s.fila}>
        <Text style={s.subtitulo}>Período de cobros</Text>
        <BotonFinanzas onPress={() => rapido('mes')}>Este mes</BotonFinanzas>
        <BotonFinanzas onPress={() => rapido('90dias')}>Últimos 90 días</BotonFinanzas>
        <BotonFinanzas onPress={() => rapido('12meses')}>Últimos 12 meses</BotonFinanzas>
      </View>
      <View style={s.fila}>
        <CampoFecha etiqueta="Resumen desde" valor={borrador.desde} onCambiar={(desde) => setBorrador((b) => ({ ...b, desde }))} />
        <CampoFecha etiqueta="Resumen hasta" valor={borrador.hasta} onCambiar={(hasta) => setBorrador((b) => ({ ...b, hasta }))} />
        <BotonFinanzas onPress={aplicar}>Actualizar resumen</BotonFinanzas>
      </View>
      <Text style={s.texto}>Ingresos por fecha de cobro en pesos argentinos. Los pagos pendientes y rechazados se muestran por separado.</Text>
      {validacion ? <Text accessibilityRole="alert" style={s.error}>{validacion}</Text> : null}
    </View>
    {cargando ? <ActivityIndicator color={c.acento} /> : error ? <View style={s.tarjeta}>
      <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      <BotonFinanzas onPress={() => setRecarga((n) => n + 1)}>Reintentar resumen</BotonFinanzas>
    </View> : datos ? <>
      <Text style={s.texto}>Período aplicado: {fechaCorta(`${datos.desde}T12:00:00Z`)} al {fechaCorta(`${datos.hasta}T12:00:00Z`)} · Totales de todos los registros</Text>
      <View style={r.indicadores}>
        <Indicador titulo="Ingresos cobrados" valor={monedaARS(datos.ingresosARS)} color={c.salvia}
          detalle={`${datos.pagosAprobados} pagos aprobados`} onPress={() => ver({ estado: 'aprobado' })} />
        <Indicador titulo="Variación de ingresos" valor={datos.variacionPorcentaje == null ? 'Sin base comparable' : `${Number(datos.variacionPorcentaje) > 0 ? '+' : ''}${Number(datos.variacionPorcentaje).toLocaleString('es-AR')} %`}
          detalle={`Anterior: ${monedaARS(datos.ingresosAnterioresARS)} · ${fechaCorta(`${datos.anteriorDesde}T12:00:00Z`)} al ${fechaCorta(`${datos.anteriorHasta}T12:00:00Z`)}`} />
        <Indicador titulo="Pagos pendientes" valor={monedaARS(datos.pendientesARS)} color={c.manteca}
          detalle={`${datos.pagosPendientes} operaciones · no son ingresos cobrados`} onPress={() => ver({ estado: 'pendiente' })} />
        <Indicador titulo="Pagos rechazados" valor={String(datos.pagosRechazados)} color={c.peligro}
          detalle={`${Number(datos.tasaAprobacion).toLocaleString('es-AR')} % de aprobación sobre todos los intentos`} onPress={() => ver({ estado: 'rechazado' })} />
      </View>
      <View style={s.tarjeta}>
        <View style={[s.fila, { justifyContent: 'space-between' }]}>
          <View style={{ gap: 5 }}><Text style={s.subtitulo}>Evolución de ingresos</Text><Text style={s.texto}>Cobros aprobados por mes · seleccioná un mes para ver sus operaciones</Text></View>
          <View style={r.instantanea}><Text style={[s.subtitulo, { color: c.salvia }]}>{datos.suscripcionesActivasHoy}</Text><Text style={s.texto}>usuarios con suscripción activa hoy</Text></View>
        </View>
        {datos.pagosAprobados === 0 ? <Text style={s.texto}>No hay ingresos aprobados en este período.</Text> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={r.grafico}>
            {datos.periodos.map((p) => <Pressable key={p.periodo} accessibilityRole="button"
              accessibilityLabel={`Ingresos ${mesNombre(p.periodo)}: ${monedaARS(p.ingresosARS)}`}
              onPress={() => ver({ desde: p.desde, hasta: p.hasta, estado: 'aprobado' })} style={r.columna}>
              <Text style={[s.texto, r.numero]}>{Number(p.ingresosARS).toLocaleString('es-AR', { notation: 'compact', maximumFractionDigits: 1 })}</Text>
              <View style={r.pista}><View style={[r.barra, { height: Number(p.ingresosARS) / maximo * 140 }]} /></View>
              <Text style={s.texto}>{mesNombre(p.periodo)}</Text>
            </Pressable>)}
          </View>
        </ScrollView>
      </View>
      <Text style={s.subtitulo}>Balance de cobros por mes</Text>
      <Text style={s.texto}>Mensual y anual indican la periodicidad contratada. Un pago anual se contabiliza completo en el mes de cobro. Los meses de los extremos pueden ser parciales.</Text>
      <TablaFinanzas filas={datos.periodos} clave={(p) => p.periodo} columnas={[
        { nombre: 'Período', ancho: 120, render: (p) => <Text style={s.texto}>{mesNombre(p.periodo)}</Text> },
        { nombre: 'Ingresos cobrados', ancho: 180, numero: true, render: (p) => <Text style={[s.texto, { color: c.salvia, fontWeight: '700' }]}>{monedaARS(p.ingresosARS)}</Text> },
        { nombre: 'Plan mensual', ancho: 170, numero: true, render: (p) => <Text style={s.texto}>{monedaARS(p.mensualARS)}</Text> },
        { nombre: 'Plan anual', ancho: 170, numero: true, render: (p) => <Text style={s.texto}>{monedaARS(p.anualARS)}</Text> },
        { nombre: 'Sin periodicidad', ancho: 160, numero: true, render: (p) => <Text style={s.texto}>{monedaARS(p.sinPeriodicidadARS)}</Text> },
        { nombre: 'Aprobados', ancho: 100, numero: true, render: (p) => <Text style={s.texto}>{p.aprobados}</Text> },
        { nombre: 'Pendientes', ancho: 170, numero: true, render: (p) => <Text style={s.texto}>{monedaARS(p.pendientesARS)}</Text> },
        { nombre: 'Rechazados', ancho: 100, numero: true, render: (p) => <Text style={s.texto}>{p.rechazados}</Text> },
        { nombre: 'Detalle', ancho: 140, render: (p) => <BotonFinanzas onPress={() => ver({ desde: p.desde, hasta: p.hasta })}>Ver pagos</BotonFinanzas> },
      ]} />
    </> : null}
  </View>;
}

function Indicador({ titulo, valor, detalle, color = c.texto, onPress }) {
  return <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} style={[s.tarjeta, r.indicador]}>
    <Text style={s.texto}>{titulo}</Text><Text style={[r.valor, { color }]}>{valor}</Text><Text style={s.texto}>{detalle}</Text>
    {onPress ? <Text style={[s.texto, { color: c.acento }]}>Ver operaciones →</Text> : null}
  </Pressable>;
}
const r = StyleSheet.create({
  indicadores: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  indicador: { flex: 1, flexBasis: 230, minHeight: 150, justifyContent: 'space-between' },
  valor: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  instantanea: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, backgroundColor: c.superficie, borderRadius: 12 },
  grafico: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingVertical: 20 },
  columna: { width: 76, gap: 10, alignItems: 'center' },
  numero: { fontSize: 12 },
  pista: { height: 140, width: 40, justifyContent: 'flex-end', backgroundColor: c.superficie, borderRadius: 5, overflow: 'hidden' },
  barra: { backgroundColor: c.salvia, borderRadius: 5, width: '100%' },
});
