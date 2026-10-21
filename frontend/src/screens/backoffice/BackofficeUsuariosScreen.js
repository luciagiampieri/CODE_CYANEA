import { FontAwesome6 } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import CampoFecha from '../../components/backoffice/CampoFecha';
import {
  ETIQUETAS_ESTADO,
  ETIQUETAS_METODO,
  ETIQUETAS_PLAN,
  EstadoCuentaBadge,
  formatearFecha,
} from '../../components/backoffice/UsuarioPresentacion';
import { listarUsuarios } from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { fontFamilies, radii, spacing, textStyles } from '../../theme/tokens';
import { aISO, formatearISO, rangoUltimosDias, validarRango } from '../../utils/formatoMetricas';

export const FILTROS_USUARIOS_INICIALES = {
  q: '',
  estado: null,
  plan: null,
  metodoRegistro: null,
  periodo: 'todos',
  desde: null,
  hasta: null,
  pagina: 1,
};

const ANCHO_TABLA = 900;
const ESPERA_BUSQUEDA = 350;

const FLEX = {
  nombre: 2,
  usuario: 1.4,
  correo: 2.2,
  plan: 0.8,
  estado: 1,
  registro: 1,
};

function opciones(etiquetas) {
  return [
    { valor: null, etiqueta: 'Todos' },
    ...Object.entries(etiquetas).map(([valor, etiqueta]) => ({ valor, etiqueta })),
  ];
}

const OPCIONES_ESTADO = opciones(ETIQUETAS_ESTADO);
const OPCIONES_PLAN = opciones(ETIQUETAS_PLAN);
const OPCIONES_METODO = opciones(ETIQUETAS_METODO);

const PERIODOS_REGISTRO = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: '7', etiqueta: '7 días', dias: 7 },
  { valor: '30', etiqueta: '30 días', dias: 30 },
  { valor: '90', etiqueta: '90 días', dias: 90 },
  { valor: '365', etiqueta: '12 meses', dias: 365 },
  { valor: 'personalizado', etiqueta: 'Personalizado' },
];

export default function BackofficeUsuariosScreen({
  filtros,
  onCambiarFiltros,
  onVerUsuario,
  onVolver,
}) {
  const { width } = useWindowDimensions();
  const tabla = width >= ANCHO_TABLA;
  const hoy = aISO(new Date());
  const [texto, setTexto] = useState(filtros.q);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [borrador, setBorrador] = useState(() => ({
    desde: filtros.desde ?? rangoUltimosDias(30).desde,
    hasta: filtros.hasta ?? hoy,
  }));
  const [errorRango, setErrorRango] = useState('');

  useEffect(() => {
    const limpio = texto.trim();
    if (limpio === filtros.q) return undefined;
    const id = setTimeout(
      () => onCambiarFiltros({ ...filtros, q: limpio, pagina: 1 }),
      ESPERA_BUSQUEDA
    );
    return () => clearTimeout(id);
  }, [texto, filtros, onCambiarFiltros]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    listarUsuarios(filtros)
      .then((respuesta) => {
        if (vigente) setDatos(respuesta);
      })
      .catch((err) => {
        if (vigente) setError(err?.message || 'No se pudo cargar el listado de usuarios.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [filtros, recarga]);

  function cambiar(campo, valor) {
    onCambiarFiltros({ ...filtros, [campo]: valor, pagina: 1 });
  }

  function cambiarPeriodo(valor) {
    setErrorRango('');
    const opcion = PERIODOS_REGISTRO.find((p) => p.valor === valor);
    if (valor === 'todos') {
      onCambiarFiltros({ ...filtros, periodo: 'todos', desde: null, hasta: null, pagina: 1 });
      return;
    }
    if (opcion?.dias) {
      onCambiarFiltros({ ...filtros, periodo: valor, ...rangoUltimosDias(opcion.dias), pagina: 1 });
      return;
    }
    setBorrador({
      desde: filtros.desde ?? rangoUltimosDias(30).desde,
      hasta: filtros.hasta ?? hoy,
    });
    onCambiarFiltros({ ...filtros, periodo: 'personalizado', pagina: 1 });
  }

  function aplicarRango() {
    const mensaje = validarRango(borrador, hoy);
    setErrorRango(mensaje);
    if (!mensaje) {
      onCambiarFiltros({
        ...filtros,
        periodo: 'personalizado',
        desde: borrador.desde,
        hasta: borrador.hasta,
        pagina: 1,
      });
    }
  }

  function irAPagina(pagina) {
    onCambiarFiltros({ ...filtros, pagina });
  }

  function limpiar() {
    setTexto('');
    setErrorRango('');
    onCambiarFiltros(FILTROS_USUARIOS_INICIALES);
  }

  const hayFiltros = Boolean(
    texto.trim() ||
      filtros.estado ||
      filtros.plan ||
      filtros.metodoRegistro ||
      (filtros.periodo && filtros.periodo !== 'todos')
  );
  const total = datos?.total ?? 0;
  const textoRango =
    filtros.desde && filtros.hasta
      ? ` registrados del ${formatearISO(filtros.desde)} al ${formatearISO(filtros.hasta)}`
      : '';

  let contenido;
  if (cargando && !datos) {
    contenido = (
      <View style={styles.centro}>
        <ActivityIndicator color={c.acento} size="large" />
      </View>
    );
  } else if (error) {
    contenido = (
      <View style={styles.cajaError}>
        <FontAwesome6 color={c.peligro} name="circle-exclamation" size={14} />
        <Text style={styles.textoError}>{error}</Text>
        <Pressable onPress={() => setRecarga((n) => n + 1)} style={styles.botonSecundario}>
          <Text style={styles.textoBotonSecundario}>Reintentar</Text>
        </Pressable>
      </View>
    );
  } else if (total === 0) {
    contenido = (
      <View style={styles.vacio}>
        <View style={styles.iconoVacio}>
          <FontAwesome6 color={c.acento} name="magnifying-glass" size={20} />
        </View>
        <Text style={styles.tituloVacio}>No encontramos usuarios que coincidan con tu búsqueda</Text>
        <Text style={styles.textoVacio}>Probá con otro término o ajustá los filtros.</Text>
        {hayFiltros ? (
          <Pressable onPress={limpiar} style={[styles.botonSecundario, styles.botonVacio]}>
            <Text style={styles.textoBotonSecundario}>Limpiar filtros</Text>
          </Pressable>
        ) : null}
      </View>
    );
  } else {
    contenido = (
      <View style={cargando && styles.recargando}>
        {tabla ? (
          <TablaUsuarios onVerUsuario={onVerUsuario} usuarios={datos.items} />
        ) : (
          <TarjetasUsuarios onVerUsuario={onVerUsuario} usuarios={datos.items} />
        )}
      </View>
    );
  }

  return (
    <View>
      <Pressable
        onPress={onVolver}
        style={({ pressed }) => [styles.volver, pressed && styles.presionado]}
      >
        <FontAwesome6 color={c.textoSecundario} name="arrow-left" size={12} />
        <Text style={styles.textoVolver}>Volver al inicio</Text>
      </Pressable>

      <Text style={styles.titulo}>Usuarios</Text>
      <Text style={styles.bajada}>Buscá y consultá las cuentas registradas en la plataforma.</Text>

      <View style={styles.cajaBusqueda}>
        <FontAwesome6 color={c.textoTenue} name="magnifying-glass" size={14} />
        <TextInput
          autoCapitalize="none"
          onChangeText={setTexto}
          placeholder="Buscar por nombre, usuario o correo electrónico"
          placeholderTextColor={c.textoTenue}
          style={styles.input}
          value={texto}
        />
        {texto ? (
          <Pressable hitSlop={8} onPress={() => setTexto('')}>
            <FontAwesome6 color={c.textoTenue} name="xmark" size={14} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.panelFiltros}>
        <View style={styles.filtros}>
          <GrupoFiltro
            etiqueta="Estado"
            icono="circle-half-stroke"
            onCambiar={(valor) => cambiar('estado', valor)}
            opciones={OPCIONES_ESTADO}
            valor={filtros.estado}
          />
          <GrupoFiltro
            etiqueta="Plan"
            icono="crown"
            onCambiar={(valor) => cambiar('plan', valor)}
            opciones={OPCIONES_PLAN}
            valor={filtros.plan}
          />
          <GrupoFiltro
            etiqueta="Método de registro"
            icono="right-to-bracket"
            onCambiar={(valor) => cambiar('metodoRegistro', valor)}
            opciones={OPCIONES_METODO}
            valor={filtros.metodoRegistro}
          />
        </View>

        <View style={styles.separador} />

        <GrupoFiltro
          etiqueta="Fecha de registro"
          icono="calendar-days"
          onCambiar={cambiarPeriodo}
          opciones={PERIODOS_REGISTRO}
          valor={filtros.periodo ?? 'todos'}
        />

        {filtros.periodo === 'personalizado' ? (
          <View style={styles.filaRango}>
            <CampoFecha
              etiqueta="Desde"
              maximo={hoy}
              onCambiar={(valor) => setBorrador((b) => ({ ...b, desde: valor }))}
              valor={borrador.desde}
            />
            <View style={styles.flechaRango}>
              <FontAwesome6 color={c.textoTenue} name="arrow-right" size={13} />
            </View>
            <CampoFecha
              etiqueta="Hasta"
              maximo={hoy}
              onCambiar={(valor) => setBorrador((b) => ({ ...b, hasta: valor }))}
              valor={borrador.hasta}
            />
            <Pressable
              onPress={aplicarRango}
              style={({ hovered, pressed }) => [
                styles.botonAplicar,
                hovered && styles.botonAplicarHover,
                pressed && styles.presionado,
              ]}
              testID="usuarios-aplicar-rango"
            >
              <FontAwesome6 color={c.sobreAcento} name="check" size={13} />
              <Text style={styles.textoBotonAplicar}>Aplicar</Text>
            </Pressable>
          </View>
        ) : null}

        {errorRango ? (
          <View style={styles.avisoRango}>
            <FontAwesome6 color={c.peligro} name="circle-exclamation" size={13} />
            <Text style={styles.textoErrorRango}>{errorRango}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.resumen}>
        <Text style={styles.textoResumen}>
          {datos ? `${total} ${total === 1 ? 'usuario' : 'usuarios'}${textoRango}` : ' '}
        </Text>
        {hayFiltros ? (
          <Pressable hitSlop={8} onPress={limpiar}>
            <Text style={styles.enlace}>Limpiar filtros</Text>
          </Pressable>
        ) : null}
      </View>

      {contenido}

      {datos && datos.totalPaginas > 1 && !error ? (
        <View style={styles.paginacion}>
          <BotonPagina
            deshabilitado={filtros.pagina <= 1 || cargando}
            icono="chevron-left"
            onPress={() => irAPagina(filtros.pagina - 1)}
            texto="Anterior"
          />
          <Text style={styles.textoPagina}>
            Página {datos.pagina} de {datos.totalPaginas}
          </Text>
          <BotonPagina
            deshabilitado={filtros.pagina >= datos.totalPaginas || cargando}
            icono="chevron-right"
            iconoAlFinal
            onPress={() => irAPagina(filtros.pagina + 1)}
            texto="Siguiente"
          />
        </View>
      ) : null}
    </View>
  );
}

function GrupoFiltro({ etiqueta, icono, opciones: lista, valor, onCambiar }) {
  return (
    <View style={styles.grupo}>
      <View style={styles.etiquetaGrupoFila}>
        {icono ? <FontAwesome6 color={c.textoSecundario} name={icono} size={11} /> : null}
        <Text style={styles.etiquetaGrupo}>{etiqueta}</Text>
      </View>
      <View style={styles.chips}>
        {lista.map((opcion) => {
          const activo = opcion.valor === valor;
          return (
            <Pressable
              key={opcion.etiqueta}
              accessibilityRole="button"
              accessibilityState={{ selected: activo }}
              onPress={() => onCambiar(opcion.valor)}
              style={({ hovered, pressed }) => [
                styles.chip,
                hovered && !activo && styles.chipHover,
                activo && styles.chipActivo,
                pressed && styles.presionado,
              ]}
            >
              {activo ? <FontAwesome6 color={c.acento} name="check" size={10} /> : null}
              <Text style={[styles.textoChip, activo && styles.textoChipActivo]}>
                {opcion.etiqueta}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TablaUsuarios({ usuarios, onVerUsuario }) {
  return (
    <View style={styles.tabla}>
      <View style={[styles.filaTabla, styles.encabezadoTabla]}>
        <Text style={[styles.celdaEncabezado, { flex: FLEX.nombre }]}>NOMBRE</Text>
        <Text style={[styles.celdaEncabezado, { flex: FLEX.usuario }]}>USUARIO</Text>
        <Text style={[styles.celdaEncabezado, { flex: FLEX.correo }]}>CORREO ELECTRÓNICO</Text>
        <Text style={[styles.celdaEncabezado, { flex: FLEX.plan }]}>PLAN</Text>
        <Text style={[styles.celdaEncabezado, { flex: FLEX.estado }]}>ESTADO</Text>
        <Text style={[styles.celdaEncabezado, { flex: FLEX.registro }]}>REGISTRO</Text>
      </View>
      {usuarios.map((usuario) => (
        <Pressable
          key={usuario.id}
          onPress={() => onVerUsuario(usuario.id)}
          style={({ hovered, pressed }) => [
            styles.filaTabla,
            (hovered || pressed) && styles.filaResaltada,
          ]}
        >
          <Text numberOfLines={1} style={[styles.celdaFuerte, { flex: FLEX.nombre }]}>
            {usuario.nombreCompleto}
          </Text>
          <Text numberOfLines={1} style={[styles.celda, { flex: FLEX.usuario }]}>
            @{usuario.nombreUsuario}
          </Text>
          <Text numberOfLines={1} style={[styles.celda, { flex: FLEX.correo }]}>
            {usuario.email}
          </Text>
          <Text style={[styles.celda, { flex: FLEX.plan }]}>{ETIQUETAS_PLAN[usuario.plan]}</Text>
          <View style={{ flex: FLEX.estado }}>
            <EstadoCuentaBadge estado={usuario.estado} />
          </View>
          <Text style={[styles.celda, { flex: FLEX.registro }]}>
            {formatearFecha(usuario.fechaRegistro)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function TarjetasUsuarios({ usuarios, onVerUsuario }) {
  return (
    <View style={styles.tarjetas}>
      {usuarios.map((usuario) => (
        <Pressable
          key={usuario.id}
          onPress={() => onVerUsuario(usuario.id)}
          style={({ pressed }) => [styles.tarjeta, pressed && styles.presionado]}
        >
          <View style={styles.filaTarjeta}>
            <Text numberOfLines={1} style={styles.nombreTarjeta}>
              {usuario.nombreCompleto}
            </Text>
            <EstadoCuentaBadge estado={usuario.estado} />
          </View>
          <Text numberOfLines={1} style={styles.celda}>
            @{usuario.nombreUsuario}
          </Text>
          <Text numberOfLines={1} style={styles.celda}>
            {usuario.email}
          </Text>
          <Text style={styles.metaTarjeta}>
            {ETIQUETAS_PLAN[usuario.plan]} · Registro {formatearFecha(usuario.fechaRegistro)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function BotonPagina({ texto, icono, iconoAlFinal, deshabilitado, onPress }) {
  const colorIcono = deshabilitado ? c.textoTenue : c.texto;
  return (
    <Pressable
      disabled={deshabilitado}
      onPress={onPress}
      style={({ pressed }) => [
        styles.botonPagina,
        deshabilitado && styles.deshabilitado,
        pressed && styles.presionado,
      ]}
    >
      {!iconoAlFinal ? <FontAwesome6 color={colorIcono} name={icono} size={11} /> : null}
      <Text style={[styles.textoBotonPagina, deshabilitado && styles.textoDeshabilitado]}>
        {texto}
      </Text>
      {iconoAlFinal ? <FontAwesome6 color={colorIcono} name={icono} size={11} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  volver: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  textoVolver: {
    ...textStyles.meta,
    color: c.textoSecundario,
  },
  titulo: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 36,
  },
  bajada: {
    ...textStyles.body,
    color: c.textoSecundario,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  cajaBusqueda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeControl,
    backgroundColor: c.superficie,
  },
  input: {
    flex: 1,
    minHeight: 52,
    color: c.texto,
    fontFamily: fontFamilies.sans,
    fontSize: 16,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  panelFiltros: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.panel,
  },
  filtros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  separador: {
    height: 1,
    backgroundColor: c.borde,
  },
  grupo: {
    gap: spacing.xs,
  },
  etiquetaGrupoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  etiquetaGrupo: {
    ...textStyles.label,
    color: c.textoSecundario,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.bordeControl,
    backgroundColor: c.superficieElevada,
  },
  chipHover: {
    borderColor: c.textoSecundario,
  },
  chipActivo: {
    borderColor: c.acento,
    backgroundColor: c.acentoMedio,
  },
  textoChip: {
    ...textStyles.meta,
    color: c.texto,
    fontSize: 13,
  },
  textoChipActivo: {
    ...textStyles.bodyStrong,
    color: c.acento,
    fontSize: 13,
  },
  filaRango: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  flechaRango: {
    height: 44,
    justifyContent: 'center',
  },
  botonAplicar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: c.manteca,
  },
  botonAplicarHover: {
    opacity: 0.9,
  },
  textoBotonAplicar: {
    ...textStyles.bodyStrong,
    color: c.sobreAcento,
  },
  avisoRango: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  textoErrorRango: {
    ...textStyles.meta,
    color: c.peligro,
  },
  resumen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  textoResumen: {
    ...textStyles.meta,
    color: c.textoSecundario,
  },
  enlace: {
    ...textStyles.meta,
    color: c.acento,
  },
  centro: {
    paddingVertical: 56,
    alignItems: 'center',
  },
  recargando: {
    opacity: 0.5,
  },
  tabla: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
    overflow: 'hidden',
  },
  filaTabla: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.borde,
  },
  encabezadoTabla: {
    backgroundColor: c.panel,
  },
  filaResaltada: {
    backgroundColor: c.acentoSuave,
  },
  celdaEncabezado: {
    ...textStyles.sectionLabel,
    color: c.textoTenue,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  celda: {
    ...textStyles.meta,
    color: c.textoSecundario,
  },
  celdaFuerte: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  tarjetas: {
    gap: spacing.sm,
  },
  tarjeta: {
    gap: 4,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  filaTarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 2,
  },
  nombreTarjeta: {
    ...textStyles.bodyStrong,
    color: c.texto,
    flex: 1,
  },
  metaTarjeta: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  vacio: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.bordeFuerte,
    backgroundColor: c.superficie,
  },
  iconoVacio: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.acentoSuave,
    borderWidth: 1,
    borderColor: c.acentoBorde,
    marginBottom: spacing.md,
  },
  tituloVacio: {
    ...textStyles.bodyStrong,
    color: c.texto,
    fontSize: 17,
    textAlign: 'center',
  },
  textoVacio: {
    ...textStyles.body,
    color: c.textoSecundario,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  botonVacio: {
    marginTop: spacing.lg,
  },
  cajaError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: c.peligroSuave,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  textoError: {
    ...textStyles.meta,
    color: c.peligro,
    flex: 1,
  },
  botonSecundario: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeControl,
  },
  textoBotonSecundario: {
    ...textStyles.meta,
    color: c.texto,
  },
  paginacion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  textoPagina: {
    ...textStyles.meta,
    color: c.textoSecundario,
  },
  botonPagina: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeControl,
  },
  textoBotonPagina: {
    ...textStyles.meta,
    color: c.texto,
  },
  textoDeshabilitado: {
    color: c.textoTenue,
  },
  deshabilitado: {
    opacity: 0.5,
  },
  presionado: {
    transform: [{ scale: 0.985 }],
  },
});