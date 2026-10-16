import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { createElement, useEffect, useRef, useState } from 'react';
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

import { obtenerMetricas } from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { fontFamilies, radii, spacing, textStyles } from '../../theme/tokens';

const COLOR_USUARIOS = c.manteca;
const COLOR_VIAJES = c.cielo;

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
  { id: 'personalizado', etiqueta: 'Personalizado', dias: null },
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const ALTO_GRAFICO = 240;
const ALTO_SPARKLINE = 40;
const DURACION_CONTADOR = 800;

function aISO(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function rangoUltimosDias(dias) {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - (dias - 1));
  return { desde: aISO(desde), hasta: aISO(hasta) };
}

function formatearISO(iso) {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

function etiquetaCorta(iso, agrupacion) {
  const [anio, mes, dia] = iso.split('-');
  return agrupacion === 'mes' ? `${MESES[Number(mes) - 1]} ${anio.slice(2)}` : `${dia}/${mes}`;
}

function etiquetaLarga(iso, agrupacion) {
  const [anio, mes] = iso.split('-');
  return agrupacion === 'mes' ? `${MESES[Number(mes) - 1]} ${anio}` : formatearISO(iso);
}

function diasDelRango(desde, hasta) {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1;
}

function formatearNumero(valor, moneda) {
  if (valor === null || valor === undefined) return '—';
  if (moneda) {
    return valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  }
  return valor.toLocaleString('es-AR');
}

function escalaRedonda(maximo) {
  if (maximo <= 4) return 4;
  const magnitud = 10 ** Math.floor(Math.log10(maximo));
  if (magnitud === 1) return maximo + (maximo % 2);
  return Math.ceil(maximo / magnitud) * magnitud;
}

function validarRango({ desde, hasta }, hoy) {
  if (!desde || !hasta) return 'Completá ambas fechas.';
  if (hasta < desde) return 'La fecha de fin no puede ser anterior a la fecha de inicio.';
  if (hasta > hoy) return 'La fecha de fin no puede ser posterior a hoy.';
  return '';
}

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

export default function PanelMetricas() {
  const { width } = useWindowDimensions();
  const ancho = width >= 1100;
  const hoy = aISO(new Date());
  const [preset, setPreset] = useState('30');
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
    if (opcion.dias) {
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
            <GraficoEvolucion serie={datos.evolucion} />
          </View>
          <View style={[styles.columnaLateral, ancho && styles.columnaLateralAncha]}>
            {SECUNDARIAS.map((metrica) => (
              <TarjetaSecundaria key={metrica.clave} metrica={datos[metrica.clave]} {...metrica} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.barraHerramientas}>
        <View>
          <Text style={styles.tituloPanel}>Métricas de la plataforma</Text>
          <Text style={styles.subtituloPanel}>
            {datos ? `Del ${formatearISO(datos.desde)} al ${formatearISO(datos.hasta)}` : ' '}
          </Text>
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

function CampoFecha({ etiqueta, valor, maximo, onCambiar }) {
  return (
    <View style={styles.grupoFecha}>
      <Text style={styles.etiquetaFecha}>{etiqueta}</Text>
      <View style={styles.cajaFecha}>
        <FontAwesome6 color={c.textoTenue} name="calendar" size={13} />
        {Platform.OS === 'web' ? (
          createElement('input', {
            type: 'date',
            value: valor,
            max: maximo,
            onChange: (evento) => onCambiar(evento.target.value),
            style: estiloInputWeb,
          })
        ) : (
          <TextInput
            onChangeText={onCambiar}
            placeholder="AAAA-MM-DD"
            placeholderTextColor={c.textoTenue}
            style={styles.inputFecha}
            value={valor}
          />
        )}
      </View>
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
          <NumeroAnimado moneda={moneda} style={styles.valorSecundaria} valor={metrica?.valor} />
        )}
        <Text style={styles.detalleSecundaria}>{detalle}</Text>
      </View>
    </View>
  );
}

function GraficoEvolucion({ serie }) {
  const [activo, setActivo] = useState(null);

  if (serie.error) {
    return (
      <View style={styles.panelGrafico}>
        <View style={styles.avisoSecundaria}>
          <FontAwesome6 color={c.textoTenue} name="triangle-exclamation" size={13} />
          <Text style={styles.textoAvisoSecundaria}>{serie.error}</Text>
        </View>
      </View>
    );
  }

  const puntos = serie.puntos;
  const totalUsuarios = puntos.reduce((suma, p) => suma + p.usuarios, 0);
  const totalViajes = puntos.reduce((suma, p) => suma + p.viajes, 0);
  const maximo = escalaRedonda(Math.max(0, ...puntos.flatMap((p) => [p.usuarios, p.viajes])));
  const cadaCuanto = Math.max(1, Math.ceil(puntos.length / 8));
  const alto = (valor) => (valor ? Math.max(3, Math.round((valor / maximo) * ALTO_GRAFICO)) : 0);
  const mitad = puntos.length / 2;

  return (
    <View style={styles.panelGrafico}>
      <View style={styles.cabeceraGrafico}>
        <View>
          <Text style={styles.tituloGrafico}>
            Evolución {serie.agrupacion === 'mes' ? 'mensual' : 'diaria'}
          </Text>
          <Text style={styles.subtituloGrafico}>Registros de usuarios y viajes creados</Text>
        </View>
        <View style={styles.pastillas}>
          <Pastilla color={COLOR_USUARIOS} texto={`${formatearNumero(totalUsuarios)} registros`} />
          <Pastilla color={COLOR_VIAJES} texto={`${formatearNumero(totalViajes)} viajes`} />
        </View>
      </View>

      {totalUsuarios + totalViajes === 0 ? (
        <View style={styles.vacio}>
          <View style={styles.burbujaVacio}>
            <FontAwesome6 color={c.manteca} name="chart-column" size={22} />
          </View>
          <Text style={styles.tituloVacio}>Sin movimiento en este período</Text>
          <Text style={styles.textoVacio}>Probá con un rango de fechas más amplio.</Text>
        </View>
      ) : (
        <View style={styles.lienzo}>
          <View style={styles.ejeY}>
            {[maximo, maximo / 2, 0].map((valor) => (
              <Text key={valor} style={styles.etiquetaEjeY}>
                {formatearNumero(Math.round(valor))}
              </Text>
            ))}
          </View>
          <View style={styles.zonaGrafico}>
            <View style={styles.areaBarras}>
              {[0, 0.5, 1].map((fraccion) => (
                <View
                  key={fraccion}
                  style={[styles.lineaGuia, { bottom: fraccion * ALTO_GRAFICO }]}
                />
              ))}
              <View style={styles.columnas}>
                {puntos.map((punto, indice) => (
                  <Pressable
                    key={punto.fecha}
                    onHoverIn={() => setActivo(indice)}
                    onHoverOut={() => setActivo((actual) => (actual === indice ? null : actual))}
                    onPress={() => setActivo((actual) => (actual === indice ? null : indice))}
                    style={[styles.columna, activo === indice && styles.columnaActiva]}
                  >
                    <View style={[styles.barrasColumna, activo === indice && styles.barrasResaltadas]}>
                      <View
                        style={[styles.barra, { height: alto(punto.usuarios), backgroundColor: COLOR_USUARIOS }]}
                      />
                      <View
                        style={[styles.barra, { height: alto(punto.viajes), backgroundColor: COLOR_VIAJES }]}
                      />
                    </View>
                    {activo === indice ? (
                      <View
                        style={[
                          styles.tooltip,
                          { bottom: Math.max(alto(punto.usuarios), alto(punto.viajes)) + 10 },
                          indice < mitad ? styles.tooltipIzquierda : styles.tooltipDerecha,
                        ]}
                      >
                        <Text style={styles.fechaTooltip}>
                          {etiquetaLarga(punto.fecha, serie.agrupacion)}
                        </Text>
                        <FilaTooltip color={COLOR_USUARIOS} texto="Registros" valor={punto.usuarios} />
                        <FilaTooltip color={COLOR_VIAJES} texto="Viajes" valor={punto.viajes} />
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.etiquetasX}>
              {puntos.map((punto, indice) => (
                <Text key={punto.fecha} numberOfLines={1} style={styles.etiquetaEjeX}>
                  {indice % cadaCuanto === 0 ? etiquetaCorta(punto.fecha, serie.agrupacion) : ' '}
                </Text>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function Pastilla({ color, texto }) {
  return (
    <View style={[styles.pastilla, { backgroundColor: `${color}14`, borderColor: `${color}40` }]}>
      <View style={[styles.puntoPastilla, { backgroundColor: color }]} />
      <Text style={[styles.textoPastilla, { color }]}>{texto}</Text>
    </View>
  );
}

function FilaTooltip({ color, texto, valor }) {
  return (
    <View style={styles.filaTooltip}>
      <View style={[styles.puntoPastilla, { backgroundColor: color }]} />
      <Text style={styles.textoTooltip}>{texto}</Text>
      <Text style={styles.valorTooltip}>{formatearNumero(valor)}</Text>
    </View>
  );
}

const estiloInputWeb = {
  flex: 1,
  minWidth: 0,
  height: 42,
  padding: 0,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: c.texto,
  colorScheme: 'dark',
  fontFamily: fontFamilies.sans,
  fontSize: 15,
  cursor: 'pointer',
};

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
  segmentos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.panel,
  },
  segmento: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
  },
  segmentoHover: {
    backgroundColor: c.acentoSuave,
  },
  segmentoActivo: {
    backgroundColor: c.manteca,
  },
  textoSegmento: {
    ...textStyles.meta,
    color: c.textoSecundario,
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
  grupoFecha: {
    gap: 6,
  },
  etiquetaFecha: {
    ...textStyles.meta,
    color: c.textoSecundario,
    fontSize: 12,
  },
  cajaFecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: 200,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeFuerte,
    backgroundColor: c.fondo,
  },
  inputFecha: {
    flex: 1,
    height: 42,
    color: c.texto,
    fontFamily: fontFamilies.sans,
    fontSize: 15,
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
    minHeight: 210,
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
  panelGrafico: {
    flex: 1,
    padding: spacing.xl,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  cabeceraGrafico: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  tituloGrafico: {
    ...textStyles.bodyStrong,
    color: c.texto,
    fontSize: 19,
  },
  subtituloGrafico: {
    ...textStyles.meta,
    color: c.textoTenue,
    marginTop: 2,
  },
  pastillas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pastilla: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  puntoPastilla: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  textoPastilla: {
    ...textStyles.bodyStrong,
    fontSize: 13,
  },
  lienzo: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ejeY: {
    height: ALTO_GRAFICO,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: -7,
  },
  etiquetaEjeY: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 11,
  },
  zonaGrafico: {
    flex: 1,
    minWidth: 0,
  },
  areaBarras: {
    height: ALTO_GRAFICO,
  },
  lineaGuia: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: c.borde,
  },
  columnas: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  columna: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    justifyContent: 'flex-end',
  },
  columnaActiva: {
    zIndex: 10,
  },
  barrasColumna: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 6,
  },
  barrasResaltadas: {
    backgroundColor: c.acentoSuave,
  },
  barra: {
    flex: 1,
    maxWidth: 16,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  tooltip: {
    position: 'absolute',
    width: 160,
    gap: 4,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeFuerte,
    backgroundColor: c.panel,
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  tooltipIzquierda: {
    left: 0,
  },
  tooltipDerecha: {
    right: 0,
  },
  fechaTooltip: {
    ...textStyles.bodyStrong,
    color: c.texto,
    fontSize: 13,
    marginBottom: 2,
  },
  filaTooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  textoTooltip: {
    ...textStyles.meta,
    color: c.textoSecundario,
    fontSize: 12,
    flex: 1,
  },
  valorTooltip: {
    ...textStyles.bodyStrong,
    color: c.texto,
    fontSize: 13,
  },
  etiquetasX: {
    flexDirection: 'row',
    gap: 3,
    marginTop: spacing.xs,
  },
  etiquetaEjeX: {
    ...textStyles.meta,
    flex: 1,
    minWidth: 0,
    color: c.textoTenue,
    fontSize: 11,
    overflow: 'visible',
  },
  vacio: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  burbujaVacio: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
  },
  textoVacio: {
    ...textStyles.body,
    color: c.textoSecundario,
    marginTop: spacing.xs,
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