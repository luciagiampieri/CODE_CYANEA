import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import ResumenFinanciero from '../../components/backoffice/ResumenFinanciero';
import TablaFinanzas, { EstadoFinanciero, fechaCorta } from '../../components/backoffice/TablaFinanzas';
import ConsultaPagos from '../../components/backoffice/ConsultaPagos';
import { BotonFinanzas, ESTADOS_SUSCRIPCIONES, FiltroEstado, PaginacionFinanzas, fechaFinanciera, monedaARS, s } from '../../components/backoffice/FinanzasPresentacion';
import { listarSuscripciones, obtenerSuscripcion } from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';

function DatosSuscripcion({ item }) {
  return <View style={s.tarjeta}>
    <Text style={s.subtitulo}>{item.usuario.nombreCompleto}</Text>
    <Text style={s.texto}>{item.usuario.email} · @{item.usuario.nombreUsuario}</Text>
    <Text style={s.texto}>Plan: {item.plan === 'pro' ? 'Pro' : item.plan} · {item.tipoPlan === 'mensual' ? 'Mensual' : item.tipoPlan === 'anual' ? 'Anual' : 'Sin periodicidad registrada'}</Text>
    <Text style={s.texto}>Estado: {ESTADOS_SUSCRIPCIONES[item.estado]}</Text>
    <Text style={s.texto}>Inicio: {fechaFinanciera(item.fechaInicio)}</Text>
    <Text style={s.texto}>Próxima renovación: {fechaFinanciera(item.fechaProximaRenovacion)}</Text>
    <Text style={s.texto}>Fin del período: {fechaFinanciera(item.fechaFin)}</Text>
    <Text style={s.texto}>Importe del período: {monedaARS(item.precioPeriodoARS)}</Text>
  </View>;
}

function DetalleSuscripcion({ id, onVolver }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    let vigente = true;
    setDatos(null); setError('');
    obtenerSuscripcion(id)
      .then((respuesta) => { if (vigente) setDatos(respuesta); })
      .catch((err) => { if (vigente) setError(err.message || 'No se pudo consultar la suscripción.'); });
    return () => { vigente = false; };
  }, [id, recarga]);
  return <View style={s.pantalla}>
    <BotonFinanzas onPress={onVolver}>Volver a suscripciones</BotonFinanzas>
    <Text style={s.titulo}>Suscripción #{id}</Text>
    {error ? <><Text accessibilityRole="alert" style={s.error}>{error}</Text><BotonFinanzas onPress={() => setRecarga((n) => n + 1)}>Reintentar detalle</BotonFinanzas></> : datos ?
      <><DatosSuscripcion item={datos} /><ConsultaPagos key={id} idSuscripcion={id} /></> : <ActivityIndicator color={c.acento} />}
  </View>;
}

export default function BackofficeSuscripcionesScreen({ onVolver }) {
  const [vista, setVista] = useState('resumen');
  const [periodoPagos, setPeriodoPagos] = useState({});
  const [periodoResumen, setPeriodoResumen] = useState({});
  const [seleccionada, setSeleccionada] = useState(null);
  const [filtros, setFiltros] = useState({ estado: null, pagina: 1, q: '', tipoPlan: null, soloUltima: true });
  const [busqueda, setBusqueda] = useState('');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true); setError(''); setDatos(null);
    if (vista !== 'suscripciones') { setCargando(false); return () => { vigente = false; }; }
    listarSuscripciones(filtros)
      .then((respuesta) => { if (vigente) setDatos(respuesta); })
      .catch((err) => { if (vigente) setError(err.message || 'No se pudieron consultar las suscripciones.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [filtros, recarga, vista]);

  if (seleccionada != null) return <DetalleSuscripcion id={seleccionada} onVolver={() => setSeleccionada(null)} />;
  return <View style={s.pantalla}>
    <BotonFinanzas onPress={onVolver}>Volver al inicio</BotonFinanzas>
    <Text style={s.titulo}>Suscripciones y pagos</Text>
    <Text style={s.texto}>De la evolución de ingresos al detalle de cada operación.</Text>
    <View style={s.fila}>
      <BotonFinanzas seleccionado={vista === 'resumen'} onPress={() => setVista('resumen')}>Resumen ejecutivo</BotonFinanzas>
      <BotonFinanzas seleccionado={vista === 'suscripciones'} onPress={() => setVista('suscripciones')}>Suscripciones</BotonFinanzas>
      <BotonFinanzas seleccionado={vista === 'pagos'} onPress={() => setVista('pagos')}>Pagos</BotonFinanzas>
    </View>
    {vista === 'resumen' ? <ResumenFinanciero periodoInicial={periodoResumen} onPeriodoAplicado={setPeriodoResumen} onVerPagos={(periodo) => { setPeriodoPagos(periodo); setVista('pagos'); }} /> : vista === 'pagos' ? <ConsultaPagos key={JSON.stringify(periodoPagos)} filtrosIniciales={periodoPagos} /> : <>
      <View style={s.tarjeta}>
        <Text style={s.subtitulo}>Cartera de suscripciones</Text>
        <Text style={s.texto}>Última por usuario muestra su período más reciente. Historial completo incluye las renovaciones anteriores.</Text>
        <View style={s.fila}>
          <BotonFinanzas seleccionado={filtros.soloUltima} onPress={() => setFiltros((f) => ({ ...f, soloUltima: true, pagina: 1 }))}>Última por usuario</BotonFinanzas>
          <BotonFinanzas seleccionado={!filtros.soloUltima} onPress={() => setFiltros((f) => ({ ...f, soloUltima: false, pagina: 1 }))}>Historial completo</BotonFinanzas>
        </View>
        <View style={s.fila}>
          <TextInput accessibilityLabel="Buscar suscripciones" placeholder="Nombre, email o usuario" placeholderTextColor={c.textoTenue}
            value={busqueda} onChangeText={setBusqueda} style={[s.boton, s.texto, { minWidth: 260 }]}
            onSubmitEditing={() => setFiltros((f) => ({ ...f, q: busqueda.trim(), pagina: 1 }))} />
          <BotonFinanzas onPress={() => setFiltros((f) => ({ ...f, q: busqueda.trim(), pagina: 1 }))}>Buscar</BotonFinanzas>
          <BotonFinanzas onPress={() => { setBusqueda(''); setFiltros({ estado: null, pagina: 1, q: '', tipoPlan: null, soloUltima: true }); }}>Limpiar filtros</BotonFinanzas>
        </View>
        <FiltroEstado nombre="Estado de la suscripción" etiquetas={ESTADOS_SUSCRIPCIONES} valor={filtros.estado} onCambiar={(estado) => setFiltros((f) => ({ ...f, estado, pagina: 1 }))} />
        <FiltroEstado nombre="Periodicidad" etiquetas={{ mensual: 'Mensual', anual: 'Anual' }} valor={filtros.tipoPlan} onCambiar={(tipoPlan) => setFiltros((f) => ({ ...f, tipoPlan, pagina: 1 }))} />
      </View>
      {cargando ? <ActivityIndicator color={c.acento} /> : error ? <View style={s.tarjeta}>
        <Text accessibilityRole="alert" style={s.error}>{error}</Text>
        <BotonFinanzas onPress={() => setRecarga((n) => n + 1)}>Reintentar suscripciones</BotonFinanzas>
      </View> : datos ? <>
        <Text style={s.texto}>{datos.total} suscripciones · {filtros.soloUltima ? 'Última por usuario' : 'Historial completo'} · Deslizá la tabla para ver todas las columnas.</Text>
        <TablaFinanzas filas={datos.items} vacio="No se encontraron suscripciones para los filtros aplicados." columnas={[
          { nombre: 'Usuario', ancho: 240, render: (item) => <><Text style={[s.texto, { color: c.texto, fontWeight: '600' }]}>{item.usuario.nombreCompleto}</Text><Text style={s.texto}>{item.usuario.email}</Text></> },
          { nombre: 'Plan / período', ancho: 125, render: (item) => <><Text style={s.texto}>{item.plan === 'pro' ? 'Pro' : item.plan} · {item.tipoPlan === 'mensual' ? 'Mensual' : item.tipoPlan === 'anual' ? 'Anual' : 'Sin periodicidad'}</Text><Text style={s.texto}>#{item.id}</Text></> },
          { nombre: 'Estado', ancho: 170, render: (item) => <EstadoFinanciero estado={item.estado} etiqueta={ESTADOS_SUSCRIPCIONES[item.estado]} /> },
          { nombre: 'Inicio', ancho: 110, render: (item) => <Text style={s.texto}>{fechaCorta(item.fechaInicio)}</Text> },
          { nombre: 'Próxima renovación', ancho: 150, render: (item) => <Text style={s.texto}>{fechaCorta(item.fechaProximaRenovacion)}</Text> },
          { nombre: 'Importe', ancho: 160, numero: true, render: (item) => <Text style={s.texto}>{monedaARS(item.precioPeriodoARS)}</Text> },
          { nombre: 'Detalle', ancho: 140, render: (item) => <BotonFinanzas accessibilityLabel={`Ver detalle y pagos · #${item.id}`} onPress={() => setSeleccionada(item.id)}>Ver detalle</BotonFinanzas> },
        ]} />
        <PaginacionFinanzas datos={datos} onCambiar={(pagina) => setFiltros((f) => ({ ...f, pagina }))} />
      </> : null}
    </>}
  </View>;
}
