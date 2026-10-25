import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import TablaFinanzas, { EstadoFinanciero, fechaCorta } from './TablaFinanzas';
import CampoFecha from './CampoFecha';
import { listarPagos } from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { BotonFinanzas, ESTADOS_PAGOS, FiltroEstado, PaginacionFinanzas, monedaARS, s } from './FinanzasPresentacion';

export function validarFechasPagos(desde, hasta) {
  for (const valor of [desde, hasta]) {
    if (!valor) continue;
    const fecha = new Date(`${valor}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
      return 'Ingresá fechas válidas con formato AAAA-MM-DD.';
    }
  }
  return desde && hasta && hasta < desde ? 'La fecha hasta debe ser igual o posterior a desde.' : '';
}

export default function ConsultaPagos({ idSuscripcion = null, idUsuario = null, filtrosIniciales = {} }) {
  const [filtros, setFiltros] = useState({ estado: null, desde: '', hasta: '', pagina: 1, ...filtrosIniciales });
  const [borrador, setBorrador] = useState({ desde: filtrosIniciales.desde || '', hasta: filtrosIniciales.hasta || '' });
  const [busqueda, setBusqueda] = useState('');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [errorFechas, setErrorFechas] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true); setError(''); setDatos(null);
    listarPagos({ ...filtros, idSuscripcion, ...(idUsuario != null ? { idUsuario } : {}) })
      .then((respuesta) => { if (vigente) setDatos(respuesta); })
      .catch((err) => { if (vigente) setError(err.message || 'No se pudieron consultar los pagos.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [filtros, idSuscripcion, idUsuario, recarga]);

  function aplicarFechas() {
    const mensaje = validarFechasPagos(borrador.desde, borrador.hasta);
    setErrorFechas(mensaje);
    if (!mensaje) setFiltros((actual) => ({ ...actual, ...borrador, pagina: 1 }));
  }

  function limpiar() {
    setBusqueda('');
    setBorrador({ desde: '', hasta: '' }); setErrorFechas('');
    setFiltros({ estado: null, desde: '', hasta: '', pagina: 1 });
  }

  return <View style={s.pantalla}>
    <Text style={s.subtitulo}>{idSuscripcion ? `Historial de pagos de la suscripción${idUsuario ? ` #${idSuscripcion}` : ''}` : idUsuario ? 'Historial de pagos del usuario' : 'Pagos registrados'}</Text>
    {idUsuario == null ? <View style={s.fila}>
      <TextInput accessibilityLabel="Buscar pagos por usuario" placeholder="Nombre, email o usuario" placeholderTextColor={c.textoTenue} value={busqueda} onChangeText={setBusqueda}
        style={[s.boton, s.texto, { minWidth: 260 }]} onSubmitEditing={() => setFiltros((f) => ({ ...f, q: busqueda.trim(), pagina: 1 }))} />
      <BotonFinanzas onPress={() => setFiltros((f) => ({ ...f, q: busqueda.trim(), pagina: 1 }))}>Buscar pagos</BotonFinanzas>
    </View> : null}
    <FiltroEstado nombre="Estado del pago" etiquetas={ESTADOS_PAGOS} valor={filtros.estado} onCambiar={(estado) => setFiltros((f) => ({ ...f, estado, pagina: 1 }))} />
    <View style={s.fila}>
      <CampoFecha etiqueta="Pagos desde" valor={borrador.desde} onCambiar={(desde) => setBorrador((b) => ({ ...b, desde }))} />
      <CampoFecha etiqueta="Pagos hasta" valor={borrador.hasta} onCambiar={(hasta) => setBorrador((b) => ({ ...b, hasta }))} />
      <BotonFinanzas onPress={aplicarFechas}>Aplicar fechas</BotonFinanzas>
      <BotonFinanzas onPress={limpiar}>Limpiar filtros</BotonFinanzas>
    </View>
    <Text style={s.texto}>Las fechas incluyen el día completo en hora Argentina.</Text>
    {errorFechas ? <Text accessibilityRole="alert" style={s.error}>{errorFechas}</Text> : null}
    {cargando ? <ActivityIndicator color={c.acento} /> : error ? <View style={s.tarjeta}>
      <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      <BotonFinanzas onPress={() => setRecarga((n) => n + 1)}>Reintentar pagos</BotonFinanzas>
    </View> : datos ? <>
      <View style={s.tarjeta}>
        <Text style={s.texto}>Total de ingresos aprobados del filtro</Text>
        <Text style={s.total}>{monedaARS(datos.totalIngresosAprobadosARS)}</Text>
        <Text style={s.texto}>Suma de los pagos aprobados de todas las páginas que coinciden con los filtros aplicados.</Text>
      </View>
      <Text style={s.texto}>{datos.total} operaciones encontradas · Deslizá la tabla para ver todas las columnas.</Text>
      <TablaFinanzas filas={datos.items} vacio="No se encontraron pagos para los filtros aplicados." columnas={[
        { nombre: 'Fecha', ancho: 120, render: (p) => <Text style={s.texto}>{fechaCorta(p.fecha)}</Text> },
        { nombre: 'Usuario', ancho: 280, render: (p) => <><Text style={[s.texto, { color: c.texto }]}>{p.usuario.nombreCompleto}</Text><Text style={s.texto}>{p.usuario.email}</Text></> },
        { nombre: 'Monto', ancho: 175, numero: true, render: (p) => <Text style={[s.texto, { color: p.estado === 'aprobado' ? c.salvia : c.texto }]}>{monedaARS(p.montoARS)}</Text> },
        { nombre: 'Estado', ancho: 145, render: (p) => <EstadoFinanciero estado={p.estado} etiqueta={ESTADOS_PAGOS[p.estado]} /> },
        { nombre: 'Suscripción', ancho: 120, render: (p) => <Text style={s.texto}>#{p.idSuscripcion}</Text> },
        { nombre: 'Operación en pasarela', ancho: 340, render: (p) => <Text selectable style={s.texto}>Operación: {p.idOperacionPasarela || 'Pendiente de asignación'}</Text> },
      ]} />
      <PaginacionFinanzas datos={datos} onCambiar={(pagina) => setFiltros((f) => ({ ...f, pagina }))} />
    </> : null}
  </View>;
}
