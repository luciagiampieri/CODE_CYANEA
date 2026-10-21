import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { obtenerMetricas } from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { radii, spacing, textStyles } from '../../theme/tokens';
import {
  aISO,
  diasDelRango,
  formatearISO,
  formatearNumero,
  rangoUltimosDias,
  validarRango,
} from '../../utils/formatoMetricas';
import { variacion } from '../../utils/tendencias';
import CampoFecha from './CampoFecha';
import GraficoCombinado from './GraficoCombinado';
import MapaEstacional from './MapaEstacional';

const KPIS = [
  { clave: 'usuariosRegistrados', titulo: 'Usuarios registrados', icono: 'users', color: c.manteca },
  { clave: 'usuariosActivos', titulo: 'Usuarios activos', icono: 'bolt', color: c.salvia },
  { clave: 'viajesCreados', titulo: 'Viajes creados', icono: 'suitcase-rolling', color: c.cielo },
  { clave: 'viajesActivos', titulo: 'Viajes activos', icono: 'plane-departure', color: c.lavanda },
];

const SECUNDARIAS = [
  { clave: 'solicitudesIA', titulo: 'Solicitudes a IA', icono: 'wand-magic-sparkles', color: c.lavanda, detalle: 'En el período' },
  { clave: 'suscripcionesProActivas', titulo: 'Suscripciones Pro activas', icono: 'crown', color: c.manteca, detalle: 'Al día de hoy' },
  { clave: 'ingresos', titulo: 'Ingresos', icono: 'sack-dollar', color: c.salvia, detalle: 'En el período', moneda: true },
];

const PRESETS = [
  { id: '7', etiqueta: '7 días', dias: 7 },
  { id: '30', etiqueta: '30 días', dias: 30 },
  { id: '90', etiqueta: '90 días', dias: 90 },
  { id: '365', etiqueta: '12 meses', dias: 365 },
  { id: 'inicio', etiqueta: 'Desde el inicio', historico: true },
  { id: 'personalizado', etiqueta: 'Personalizado', dias: null },
];

const ALTO_SPARKLINE = 40;
const DURACION_CONTADOR = 800;

function useContador(objetivo) {
  const [valor, setValor] = useState(0);
  const previo = useRef(0);

  useEffect(() => {
    if (typeof objetivo !== 'number') {
      previo.current = 0;
      setValor(0);
      return undefined;
    }
    const inicio = previo.current;
    const comienzo = Date.now();
    let marco;
    const paso = () => {
      const avance = Math.min(1, (Date.now() - comienzo) / DURACION_CONTADOR);
      const suavizado = 1 - Math.pow(1 - avance, 3);
      setValor(inicio + (objetivo - inicio) * suavizado);
      if (avance < 1) {
        marco = requestAnimationFrame(paso);
      } else {
        previo.current = objetivo;
      }
    };
    marco = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(marco);
  }, [objetivo]);

  return valor;
}

function NumeroAnimado({ valor, moneda, style }) {
  const animado = useContador(valor);
  return (
    <Text style={style}>
      {typeof valor === 'number' ? formatearNumero(Math.round(animado), moneda) : '—'}
    </Text>
  );
}

function VariacionBadge({ actual, anterior }) {
  const cambio = variacion(actual, anterior);
  if (!cambio) return null;
  let color = c.textoSecundario;
  let icono = 'minus';
  if (cambio.direccion === 'sube') {
    color = c.salvia;
    icono = 'arrow-trend-up';
  } else if (cambio.direccion === 'baja') {
    color = c.peligro;
    icono = 'arrow-trend-down';
  }
  const signo = cambio.porcentaje > 0 ? '+' : '';
  return (
    <View style={styles.variacion} testID="variacion-periodo">
      <View style={[styles.pildoraVariacion, { backgroundColor: `${color}1F`, borderColor: `${color}55` }]}>
        <FontAwesome6 color={color} name={icono} size={11} />
        <Text style={[styles.textoVariacion, { color }]}>
          {signo}
          {cambio.porcentaje}%
        </Text>
      </View>
      <Text style={styles.detalleVariacion}>vs. período anterior</Text>
    </View>
  );
}

export default function PanelMetricas() {
  const { width } = useWindowDimensions();
  const ancho = width >= 1100;
  const hoy = aISO(new Date());
  const [preset, setPreset] = useState('30');
  // Solo "Desde el inicio" envía { historico: true }; el resto, { desde, hasta }.
  const [consulta, setConsulta] = useState(() => rangoUltimosDias(30));
  const [borrador, setBorrador] = useState(() => rangoUltimosDias(30));
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [errorRango, setErrorRango] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    obtenerMetricas(consulta)
      .then((respuesta) => {
        if (vigente) setDatos(respuesta);
      })
      .catch((err) => {
        if (!vigente) return;
        if (err?.status === 422) {
          setErrorRango(err.message);
        } else {
          setError(err?.message || 'No se pudieron cargar las métricas.');
        }
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [consulta, recarga]);

  function elegirPreset(opcion) {
    setPreset(opcion.id);
    setErrorRango('');
    if (opcion.historico) {
      setConsulta({ historico: true });
    } else if (opcion.dias) {
      const rango = rangoUltimosDias(opcion.dias);
      setBorrador(rango);
      setConsulta(rango);
    }
  }

  function aplicar() {
    const mensaje = validarRango(borrador, hoy);
    setErrorRango(mensaje);
    if (!mensaje) setConsulta({ ...borrador });
  }

  let subtitulo = ' ';
  if (datos) {
    subtitulo = datos.historico
      ? `Desde el inicio (${formatearISO(datos.desde)}) al ${formatearISO(datos.hasta)}`
      : `Del ${formatearISO(datos.desde)} al ${formatearISO(datos.hasta)}`;
  }

  let contenido;
  if (cargando && !datos) {
    contenido = (
      <View style={styles.centro}>
        <ActivityIndicator color={c.manteca} size="large" />
      </View>
    );
  } else if (error && !datos) {
    contenido = (
      <View style={styles.cajaError}>
        <FontAwesome6 color={c.peligro} name="circle-exclamation" size={14} />
        <Text style={styles.textoError}>{error}</Text>
        <Pressable onPress={() => setRecarga((n) => n + 1)} style={styles.botonSecundario}>
          <Text style={styles.textoBotonSecundario}>Reintentar</Text>
        </Pressable>
      </View>
    );
  } else if (datos) {
    contenido = (
      <View style={cargando && styles.recargando}>
        <View style={styles.grillaKpi}>
          {KPIS.map((kpi) => (
            <TarjetaKpi key={kpi.clave} datos={datos} {...kpi} />
          ))}
        </View>
        <View style={[styles.filaInferior, ancho && styles.filaInferiorAncha]}>
          <View style={ancho ? styles.columnaGrafico : null}>
            <GraficoCombinado serie={datos.evolucion} />
          </View>
          <View style={[styles.columnaLateral, ancho && styles.columnaLateralAncha]}>
            {SECUNDARIAS.map((metrica) => (
              <TarjetaSecundaria key={metrica.clave} metrica={datos[metrica.clave]} {...metrica} />
            ))}
          </View>
        </View>
        <View style={styles.seccionEstacional}>
          <MapaEstacional estacionalidad={datos.estacionalidad} />
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.barraHerramientas}>
        <View>
          <Text style={styles.tituloPanel}>Métricas de la plataforma</Text>
          <Text style={styles.subtituloPanel}>{subtitulo}</Text>
          {datos?.desdeAnterior ? (
            <Text style={styles.comparacionPanel}>
              Comparado con el {formatearISO(datos.desdeAnterior)} al {formatearISO(datos.hastaAnterior)}
            </Text>
          ) : null}
        </View>
        <View style={styles.segmentos}>
          {PRESETS.map((opcion) => {
            const activo = opcion.id === preset;
            return (
              <Pressable
                key={opcion.id}
                disabled={cargando && activo}
                onPress={() => elegirPreset(opcion)}
                style={({ hovered, pressed }) => [
                  styles.segmento,
                  hovered && !activo && styles.segmentoHover,
                  activo && styles.segmentoActivo,
                  pressed && styles.presionado,
                ]}
              >
                <Text style={[styles.textoSegmento, activo && styles.textoSegmentoActivo]}>
                  {opcion.etiqueta}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {preset === 'personalizado' ? (
        <View style={styles.filtroPersonalizado}>
          <View style={styles.encabezadoFiltro}>
            <FontAwesome6 color={c.manteca} name="calendar-days" size={14} />
            <Text style={styles.tituloFiltro}>Rango personalizado</Text>
          </View>
          <View style={styles.filaFiltro}>
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
              disabled={cargando}
              onPress={aplicar}
              style={({ hovered, pressed }) => [
                styles.botonAplicar,
                hovered && styles.botonAplicarHover,
                cargando && styles.deshabilitado,
                pressed && styles.presionado,
              ]}
            >
              <FontAwesome6 color={c.sobreAcento} name="check" size={13} />
              <Text style={styles.textoBotonAplicar}>Aplicar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {errorRango ? (
        <View style={styles.avisoRango}>
          <FontAwesome6 color={c.peligro} name="circle-exclamation" size={13} />
          <Text style={styles.textoErrorRango}>{errorRango}</Text>
        </View>
      ) : null}

      {contenido}
    </View>
  );
}

function contenidoPie(clave, metrica, datos, color) {
  const puntos = datos.evolucion?.puntos || [];

  if (clave === 'usuariosRegistrados') {
    const nuevos = puntos.reduce((suma, p) => suma + p.usuarios, 0);
    return {
      grafico: <Sparkline color={color} valores={puntos.map((p) => p.usuarios)} />,
      destacado: `+${formatearNumero(nuevos)}`,
      texto: 'nuevos en el período',
    };
  }

  if (clave === 'viajesCreados') {
    const promedio = metrica.valor / diasDelRango(datos.desde, datos.hasta);
    return {
      grafico: <Sparkline color={color} valores={puntos.map((p) => p.viajes)} />,
      destacado: promedio.toLocaleString('es-AR', { maximumFractionDigits: 1 }),
      texto: 'por día en promedio',
    };
  }

  if (clave === 'usuariosActivos') {
    const registrados = datos.usuariosRegistrados?.valor;
    const porcentaje = registrados
      ? Math.min(100, Math.round((metrica.valor / registrados) * 100))
      : 0;
    return {
      grafico: (
        <View style={[styles.pistaProgreso, { backgroundColor: `${color}26` }]}>
          <View style={[styles.rellenoProgreso, { width: `${porcentaje}%`, backgroundColor: color }]} />
        </View>
      ),
      destacado: `${porcentaje}%`,
      texto: 'de los registrados · últimos 30 días',
    };
  }

  return {
    grafico: null,
    destacado: '',
    texto: 'En planificación o en curso hoy',
  };
}

function TarjetaKpi({ clave, titulo, icono, color, datos }) {
  const metrica = datos[clave];
  const disponible = !metrica?.error && typeof metrica?.valor === 'number';
  const pie = disponible ? contenidoPie(clave, metrica, datos, color) : null;

  return (
    <LinearGradient
      colors={[`${color}26`, `${color}05`]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[styles.kpi, { borderColor: `${color}40` }]}
    >
      <View pointerEvents="none" style={styles.iconoFondo}>
        <FontAwesome6 color={color} name={icono} size={110} />
      </View>

      <View style={styles.cabeceraKpi}>
        <View style={[styles.burbujaKpi, { backgroundColor: color }]}>
          <FontAwesome6 color={c.sobreAcento} name={icono} size={14} />
        </View>
        <Text style={styles.tituloKpi}>{titulo}</Text>
      </View>

      {metrica?.error ? (
        <View style={styles.avisoKpi}>
          <FontAwesome6 color={c.textoSecundario} name="triangle-exclamation" size={13} />
          <Text style={styles.textoAvisoKpi}>{metrica.error}</Text>
        </View>
      ) : (
        <>
          <NumeroAnimado style={styles.valorKpi} valor={metrica?.valor} />
          <VariacionBadge actual={metrica?.valor} anterior={metrica?.anterior} />
          <View style={styles.zonaPie}>{pie?.grafico}</View>
          <Text style={styles.pieKpi}>
            {pie?.destacado ? <Text style={[styles.destacadoPie, { color }]}>{pie.destacado} </Text> : null}
            {pie?.texto}
          </Text>
        </>
      )}
    </LinearGradient>
  );
}

function Sparkline({ valores, color }) {
  const lista = valores.slice(-30);
  if (!lista.length) return null;
  const maximo = Math.max(1, ...lista);
  return (
    <View style={styles.sparkline}>
      {lista.map((valor, indice) => (
        <View
          key={indice}
          style={[
            styles.barraSparkline,
            {
              height: Math.max(3, Math.round((valor / maximo) * ALTO_SPARKLINE)),
              backgroundColor: valor ? color : `${color}33`,
            },
          ]}
        />
      ))}
    </View>
  );
}

function TarjetaSecundaria({ titulo, icono, color, detalle, metrica, moneda }) {
  return (
    <View style={styles.secundaria}>
      <View style={[styles.burbujaSecundaria, { backgroundColor: `${color}1F`, borderColor: `${color}40` }]}>
        <FontAwesome6 color={color} name={icono} size={18} />
      </View>
      <View style={styles.textosSecundaria}>
        <Text style={styles.tituloSecundaria}>{titulo}</Text>
        {metrica?.error ? (
          <View style={styles.avisoSecundaria}>
            <FontAwesome6 color={c.textoTenue} name="circle-info" size={12} />
            <Text style={styles.textoAvisoSecundaria}>{metrica.error}</Text>
          </View>
        ) : (
          <>
            <NumeroAnimado moneda={moneda} style={styles.valorSecundaria} valor={metrica?.valor} />
            <VariacionBadge actual={metrica?.valor} anterior={metrica?.anterior} />
          </>
        )}
        <Text style={styles.detalleSecundaria}>{detalle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barraHerramientas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  tituloPanel: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 26,
  },
  subtituloPanel: {
    ...textStyles.meta,
    color: c.textoSecundario,
    marginTop: 2,
  },
  comparacionPanel: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
    marginTop: 2,
  },
  segmentos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.bordeControl,
    backgroundColor: c.panel,
  },
  segmento: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
  },
  segmentoHover: {
    backgroundColor: c.acentoMedio,
  },
  segmentoActivo: {
    backgroundColor: c.manteca,
  },
  textoSegmento: {
    ...textStyles.meta,
    color: c.texto,
    fontSize: 13,
  },
  textoSegmentoActivo: {
    color: c.sobreAcento,
  },
  filtroPersonalizado: {
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.acentoBorde,
    backgroundColor: c.panel,
  },
  encabezadoFiltro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tituloFiltro: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  filaFiltro: {
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
    marginBottom: spacing.lg,
  },
  textoErrorRango: {
    ...textStyles.meta,
    color: c.peligro,
  },
  centro: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  recargando: {
    opacity: 0.55,
  },
  grillaKpi: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  kpi: {
    flexGrow: 1,
    flexBasis: 250,
    minHeight: 230,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: c.superficie,
  },
  iconoFondo: {
    position: 'absolute',
    right: -18,
    bottom: -22,
    opacity: 0.07,
  },
  cabeceraKpi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  burbujaKpi: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tituloKpi: {
    ...textStyles.bodyStrong,
    color: c.textoSecundario,
    flex: 1,
  },
  valorKpi: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 44,
    marginTop: spacing.xs,
  },
  variacion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pildoraVariacion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  textoVariacion: {
    ...textStyles.bodyStrong,
    fontSize: 12,
  },
  detalleVariacion: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
  },
  zonaPie: {
    height: ALTO_SPARKLINE,
    justifyContent: 'flex-end',
  },
  pieKpi: {
    ...textStyles.meta,
    color: c.textoSecundario,
    fontSize: 13,
  },
  destacadoPie: {
    ...textStyles.bodyStrong,
    fontSize: 13,
  },
  avisoKpi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  textoAvisoKpi: {
    ...textStyles.meta,
    color: c.textoSecundario,
    flex: 1,
  },
  sparkline: {
    height: ALTO_SPARKLINE,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  barraSparkline: {
    flex: 1,
    maxWidth: 10,
    borderRadius: 2,
  },
  pistaProgreso: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  rellenoProgreso: {
    height: '100%',
    borderRadius: 5,
  },
  filaInferior: {
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  filaInferiorAncha: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  columnaGrafico: {
    flex: 2.4,
    minWidth: 0,
  },
  columnaLateral: {
    gap: spacing.lg,
  },
  columnaLateralAncha: {
    flex: 1,
    minWidth: 280,
  },
  seccionEstacional: {
    marginTop: spacing.lg,
  },
  secundaria: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  burbujaSecundaria: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textosSecundaria: {
    flex: 1,
    gap: 2,
  },
  tituloSecundaria: {
    ...textStyles.meta,
    color: c.textoSecundario,
  },
  valorSecundaria: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 30,
  },
  detalleSecundaria: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
  },
  avisoSecundaria: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  textoAvisoSecundaria: {
    ...textStyles.meta,
    color: c.textoTenue,
    flex: 1,
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
    borderColor: c.bordeFuerte,
  },
  textoBotonSecundario: {
    ...textStyles.meta,
    color: c.texto,
  },
  deshabilitado: {
    opacity: 0.5,
  },
  presionado: {
    transform: [{ scale: 0.985 }],
  },
});