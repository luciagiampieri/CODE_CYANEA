import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import CampoFecha from '../../components/backoffice/CampoFecha';
import TablaFinanzas from '../../components/backoffice/TablaFinanzas';
import { BotonFinanzas, FiltroEstado, PaginacionFinanzas, fechaFinanciera, s } from '../../components/backoffice/FinanzasPresentacion';
import { validarFechasPagos } from '../../components/backoffice/ConsultaPagos';
import { listarAuditoria, obtenerEventoAuditoria, obtenerOpcionesAuditoria } from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';

const TIPOS = {
  inicio_sesion: 'Inicio de sesión en backoffice',
  suspension_usuario: 'Suspensión de usuario',
  reactivacion_usuario: 'Reactivación de usuario',
  publicacion_terminos: 'Publicación de Términos y Condiciones',
  cambio_plan: 'Cambio de planes y límites',
};
const INICIALES = { pagina: 1, desde: '', hasta: '', tipo: null, idAdministrador: null };

function Resultado({ valor }) {
  return <Text style={[s.texto, { color: valor === 'exitoso' ? c.salvia : c.peligro, fontWeight: '600' }]}>
    {valor === 'exitoso' ? 'Exitoso' : 'Fallido'}
  </Text>;
}

function SelectorAdministrador({ opciones, valor, onCambiar }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const actual = opciones.find((a) => a.id === valor);
  function elegir(id) { onCambiar(id); setAbierto(false); setBusqueda(''); }
  return <View style={{ gap: 8 }}>
    <Text style={s.texto}>Administrador</Text>
    <BotonFinanzas accessibilityLabel="Seleccionar administrador" onPress={() => setAbierto((v) => !v)}>
      {actual ? `${actual.nombreCompleto} · #${actual.id}` : 'Todos los administradores'}
    </BotonFinanzas>
    {abierto ? <View style={s.tarjeta}>
      <TextInput accessibilityLabel="Buscar administrador" placeholder="Nombre o correo" placeholderTextColor={c.textoTenue}
        value={busqueda} onChangeText={setBusqueda} style={[s.boton, s.texto]} />
      <ScrollView style={{ maxHeight: 220 }}>
        <View style={{ gap: 8 }}>
          <BotonFinanzas onPress={() => elegir(null)}>Todos los administradores</BotonFinanzas>
          {opciones.filter((a) => `${a.nombreCompleto} ${a.email || ''}`.toLowerCase().includes(busqueda.toLowerCase())).map((a) =>
            <BotonFinanzas key={a.id} accessibilityLabel={`Filtrar por administrador ${a.id}`} onPress={() => elegir(a.id)}>
              {a.nombreCompleto} · #{a.id}
            </BotonFinanzas>)}
        </View>
      </ScrollView>
    </View> : null}
  </View>;
}

function DetalleEvento({ id, onVolver }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    let vigente = true;
    setDatos(null); setError('');
    obtenerEventoAuditoria(id).then((d) => { if (vigente) setDatos(d); })
      .catch((e) => { if (vigente) setError(e.message || 'No se pudo consultar el evento.'); });
    return () => { vigente = false; };
  }, [id, recarga]);
  return <View style={s.pantalla}>
    <BotonFinanzas onPress={onVolver}>Volver al registro</BotonFinanzas>
    <Text style={s.titulo}>Detalle del evento</Text>
    {error ? <><Text accessibilityRole="alert" style={s.error}>{error}</Text><BotonFinanzas onPress={() => setRecarga((n) => n + 1)}>Reintentar detalle</BotonFinanzas></> : datos ? <>
      <View style={s.tarjeta}>
        <Text style={s.subtitulo}>{TIPOS[datos.tipo]}</Text>
        <Text selectable style={s.texto}>Referencia: {datos.id}</Text>
        <Text style={s.texto}>Fecha y hora: {fechaFinanciera(datos.fechaHora)} (Argentina)</Text>
        <Text style={s.texto}>Originado por: {datos.usuario.nombreCompleto}</Text>
        {datos.usuario.email ? <Text style={s.texto}>{datos.usuario.email}</Text> : null}
        <Resultado valor={datos.resultado} />
        <Text style={s.texto}>Entidad: {datos.entidad.nombre}{datos.entidad.id != null ? ` · #${datos.entidad.id}` : ''}</Text>
        <Text style={s.texto}>{datos.descripcion}</Text>
      </View>
      {datos.cambios.length ? <>
        <Text style={s.subtitulo}>Cambios de configuración</Text>
        <TablaFinanzas filas={datos.cambios} clave={(cambio) => cambio.campo} columnas={[
          { nombre: 'Campo', ancho: 300, render: (cambio) => <Text style={s.texto}>{cambio.campo}</Text> },
          { nombre: 'Valor anterior', ancho: 180, render: (cambio) => <Text selectable style={s.texto}>{cambio.valorAnterior ?? 'No registrado'}</Text> },
          { nombre: 'Valor nuevo', ancho: 180, render: (cambio) => <Text selectable style={s.texto}>{cambio.valorNuevo ?? 'No registrado'}</Text> },
        ]} />
      </> : null}
      <Text style={s.texto}>Registro de solo lectura.</Text>
    </> : <ActivityIndicator accessibilityLabel="Cargando detalle" color={c.acento} />}
  </View>;
}

export default function BackofficeAuditoriaScreen({ onVolver }) {
  const [filtros, setFiltros] = useState(INICIALES);
  const [borrador, setBorrador] = useState({ desde: '', hasta: '' });
  const [errorFechas, setErrorFechas] = useState('');
  const [datos, setDatos] = useState(null);
  const [administradores, setAdministradores] = useState([]);
  const [error, setError] = useState('');
  const [errorOpciones, setErrorOpciones] = useState('');
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [evento, setEvento] = useState(null);

  useEffect(() => {
    let vigente = true;
    setErrorOpciones('');
    obtenerOpcionesAuditoria().then((d) => { if (vigente) setAdministradores(d.administradores); })
      .catch(() => { if (vigente) setErrorOpciones('No se pudieron cargar los administradores.'); });
    return () => { vigente = false; };
  }, [recarga]);

  useEffect(() => {
    let vigente = true;
    setCargando(true); setDatos(null); setError('');
    listarAuditoria(filtros).then((d) => { if (vigente) setDatos(d); })
      .catch((e) => { if (vigente) setError(e.message || 'No se pudo consultar el registro.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [filtros, recarga]);

  function aplicarFechas() {
    const mensaje = validarFechasPagos(borrador.desde, borrador.hasta);
    setErrorFechas(mensaje);
    if (!mensaje) setFiltros((f) => ({ ...f, ...borrador, pagina: 1 }));
  }

  if (evento) return <DetalleEvento id={evento} onVolver={() => setEvento(null)} />;
  return <View style={s.pantalla}>
    <BotonFinanzas onPress={onVolver}>Volver al inicio</BotonFinanzas>
    <Text style={s.titulo}>Registro de auditoría</Text>
    <Text style={s.texto}>Revisá accesos y acciones sensibles. Los registros son de solo lectura.</Text>
    <View style={s.tarjeta}>
      <Text style={s.subtitulo}>Filtrar eventos</Text>
      <Text style={s.texto}>Por defecto se consultan los últimos 7 días. Las fechas incluyen el día completo en hora Argentina.</Text>
      <View style={s.fila}>
        <CampoFecha etiqueta="Auditoría desde" valor={borrador.desde} onCambiar={(desde) => setBorrador((b) => ({ ...b, desde }))} />
        <CampoFecha etiqueta="Auditoría hasta" valor={borrador.hasta} onCambiar={(hasta) => setBorrador((b) => ({ ...b, hasta }))} />
        <BotonFinanzas onPress={aplicarFechas}>Aplicar fechas</BotonFinanzas>
        <BotonFinanzas onPress={() => { setFiltros({ ...INICIALES }); setBorrador({ desde: '', hasta: '' }); setErrorFechas(''); }}>Restablecer últimos 7 días</BotonFinanzas>
      </View>
      {errorFechas ? <Text accessibilityRole="alert" style={s.error}>{errorFechas}</Text> : null}
      <Text style={s.texto}>Tipo de evento</Text>
      <FiltroEstado nombre="Tipo de evento" etiquetas={TIPOS} valor={filtros.tipo} onCambiar={(tipo) => setFiltros((f) => ({ ...f, tipo, pagina: 1 }))} />
      <SelectorAdministrador opciones={administradores} valor={filtros.idAdministrador} onCambiar={(idAdministrador) => setFiltros((f) => ({ ...f, idAdministrador, pagina: 1 }))} />
      {errorOpciones ? <><Text accessibilityRole="alert" style={s.error}>{errorOpciones}</Text><BotonFinanzas onPress={() => setRecarga((n) => n + 1)}>Reintentar filtros</BotonFinanzas></> : null}
    </View>
    {cargando ? <ActivityIndicator accessibilityLabel="Cargando auditoría" color={c.acento} /> : error ? <View style={s.tarjeta}>
      <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      <BotonFinanzas onPress={() => setRecarga((n) => n + 1)}>Reintentar consulta</BotonFinanzas>
    </View> : datos ? <>
      <Text style={s.texto}>Período aplicado: {datos.desde} al {datos.hasta} · {datos.total} eventos · Más recientes primero</Text>
      <TablaFinanzas filas={datos.items} vacio="No se encontraron eventos de auditoría para los filtros aplicados." columnas={[
        { nombre: 'Fecha y hora (Argentina)', ancho: 190, render: (item) => <Text style={s.texto}>{fechaFinanciera(item.fechaHora)}</Text> },
        { nombre: 'Tipo de evento', ancho: 235, render: (item) => <Text style={s.texto}>{TIPOS[item.tipo]}</Text> },
        { nombre: 'Originado por', ancho: 230, render: (item) => <><Text style={s.texto}>{item.usuario.nombreCompleto}</Text>{item.usuario.email ? <Text style={s.texto}>{item.usuario.email}</Text> : null}</> },
        { nombre: 'Resultado', ancho: 110, render: (item) => <Resultado valor={item.resultado} /> },
        { nombre: 'Entidad afectada', ancho: 220, render: (item) => <Text style={s.texto}>{item.entidad.nombre}{item.entidad.id != null ? ` · #${item.entidad.id}` : ''}</Text> },
        { nombre: 'Detalle', ancho: 145, render: (item) => <BotonFinanzas accessibilityLabel={`Ver evento ${item.id}`} onPress={() => setEvento(item.id)}>Ver detalle</BotonFinanzas> },
      ]} />
      <PaginacionFinanzas datos={datos} onCambiar={(pagina) => setFiltros((f) => ({ ...f, pagina }))} />
    </> : null}
  </View>;
}
