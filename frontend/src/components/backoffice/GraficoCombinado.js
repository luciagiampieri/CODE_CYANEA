import { FontAwesome6 } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';

import { backofficeColors as c } from '../../theme/backofficeTokens';
import { radii, spacing, textStyles } from '../../theme/tokens';
import {
  escalaRedonda,
  etiquetaCorta,
  etiquetaLarga,
  formatearNumero,
} from '../../utils/formatoMetricas';
import { describirTendencia, lineaTendencia } from '../../utils/tendencias';

export const SERIES_EVOLUCION = [
  { clave: 'usuarios', titulo: 'Registros', color: c.manteca },
  { clave: 'viajes', titulo: 'Viajes creados', color: c.cielo },
  { clave: 'solicitudesIA', titulo: 'Solicitudes a IA', color: c.lavanda },
];

const ALTO = 260;
const MARGEN_SUPERIOR = 14;
const MARGEN_INFERIOR = 26;
const MARGEN_EJE = 46;
const MARGEN_SIN_EJE = 12;
const ANCHO_TOOLTIP = 190;
const MAX_PUNTOS_CON_MARCADOR = 45;

function buscarSerie(clave) {
  return SERIES_EVOLUCION.find((serie) => serie.clave === clave) ?? null;
}


export default function GraficoCombinado({ serie: datos }) {
  const [ancho, setAncho] = useState(0);
  const [claveBarras, setClaveBarras] = useState('usuarios');
  const [claveLinea, setClaveLinea] = useState('viajes');
  const [conTendencia, setConTendencia] = useState(true);
  const [activo, setActivo] = useState(null);

  if (datos.error) {
    return (
      <View style={styles.panel}>
        <View style={styles.aviso}>
          <FontAwesome6 color={c.textoTenue} name="triangle-exclamation" size={13} />
          <Text style={styles.textoAviso}>{datos.error}</Text>
        </View>
      </View>
    );
  }

  const puntos = datos.puntos;
  const agrupacion = datos.agrupacion;
  const barras = buscarSerie(claveBarras);
  const linea = buscarSerie(claveLinea);
  const valoresBarras = puntos.map((p) => p[barras.clave] ?? 0);
  const valoresLinea = linea ? puntos.map((p) => p[linea.clave] ?? 0) : [];
  const tendenciaBarras = conTendencia ? lineaTendencia(valoresBarras) : null;
  const tendenciaLinea = conTendencia && linea ? lineaTendencia(valoresLinea) : null;
  const maximoBarras = escalaRedonda(Math.max(0, ...valoresBarras, ...(tendenciaBarras ?? [])));
  const maximoLinea = escalaRedonda(Math.max(0, ...valoresLinea, ...(tendenciaLinea ?? [])));
  const hayDatos = valoresBarras.some((v) => v > 0) || valoresLinea.some((v) => v > 0);

  const izquierda = MARGEN_EJE;
  const derecha = linea ? MARGEN_EJE : MARGEN_SIN_EJE;
  const anchoUtil = Math.max(0, ancho - izquierda - derecha);
  const altoUtil = ALTO - MARGEN_SUPERIOR - MARGEN_INFERIOR;
  const base = MARGEN_SUPERIOR + altoUtil;
  const cantidad = puntos.length;
  const banda = cantidad ? anchoUtil / cantidad : 0;
  const anchoBarra = Math.max(2, Math.min(banda * 0.6, 22));
  const cadaCuanto = Math.max(1, Math.ceil(cantidad / 8));
  const x = (indice) => izquierda + banda * (indice + 0.5);
  const y = (valor, maximo) => base - (Math.min(Math.max(valor, 0), maximo) / maximo) * altoUtil;

  function elegirBarras(clave) {
    setClaveBarras(clave);
    if (clave === claveLinea) setClaveLinea(null);
  }

  function renderSvg() {
    return (
      <Svg height={ALTO} width={ancho}>
        {[0, 0.5, 1].map((fraccion) => (
          <Line
            key={fraccion}
            stroke={c.borde}
            strokeWidth={1}
            x1={izquierda}
            x2={ancho - derecha}
            y1={MARGEN_SUPERIOR + altoUtil * (1 - fraccion)}
            y2={MARGEN_SUPERIOR + altoUtil * (1 - fraccion)}
          />
        ))}

        {activo !== null ? (
          <Line
            stroke={c.bordeControl}
            strokeWidth={1}
            x1={x(activo)}
            x2={x(activo)}
            y1={MARGEN_SUPERIOR}
            y2={base}
          />
        ) : null}

        {valoresBarras.map((valor, indice) =>
          valor > 0 ? (
            <Rect
              key={`b-${puntos[indice].fecha}`}
              fill={barras.color}
              height={base - y(valor, maximoBarras)}
              opacity={activo === null || activo === indice ? 1 : 0.45}
              rx={3}
              width={anchoBarra}
              x={x(indice) - anchoBarra / 2}
              y={y(valor, maximoBarras)}
            />
          ) : null
        )}

        {tendenciaBarras ? (
          <Line
            stroke={barras.color}
            strokeDasharray="6 5"
            strokeWidth={2}
            x1={x(0)}
            x2={x(cantidad - 1)}
            y1={y(tendenciaBarras[0], maximoBarras)}
            y2={y(tendenciaBarras[cantidad - 1], maximoBarras)}
          />
        ) : null}

        {linea && cantidad > 0 ? (
          <Polyline
            fill="none"
            points={valoresLinea.map((v, i) => `${x(i)},${y(v, maximoLinea)}`).join(' ')}
            stroke={linea.color}
            strokeLinejoin="round"
            strokeWidth={2.5}
          />
        ) : null}

        {linea && cantidad <= MAX_PUNTOS_CON_MARCADOR
          ? valoresLinea.map((valor, indice) => (
              <Circle
                key={`l-${puntos[indice].fecha}`}
                cx={x(indice)}
                cy={y(valor, maximoLinea)}
                fill={c.superficie}
                r={activo === indice ? 5 : 3}
                stroke={linea.color}
                strokeWidth={2}
              />
            ))
          : null}

        {tendenciaLinea ? (
          <Line
            stroke={linea.color}
            strokeDasharray="6 5"
            strokeWidth={2}
            x1={x(0)}
            x2={x(cantidad - 1)}
            y1={y(tendenciaLinea[0], maximoLinea)}
            y2={y(tendenciaLinea[cantidad - 1], maximoLinea)}
          />
        ) : null}
      </Svg>
    );
  }

  function renderEtiquetas() {
    return (
      <>
        {[1, 0.5, 0].map((fraccion) => (
          <Text
            key={`izq-${fraccion}`}
            style={[
              styles.etiquetaEje,
              { top: MARGEN_SUPERIOR + altoUtil * (1 - fraccion) - 8, left: 0, width: izquierda - 8, textAlign: 'right', color: barras.color },
            ]}
          >
            {formatearNumero(Math.round(maximoBarras * fraccion))}
          </Text>
        ))}
        {linea
          ? [1, 0.5, 0].map((fraccion) => (
              <Text
                key={`der-${fraccion}`}
                style={[
                  styles.etiquetaEje,
                  { top: MARGEN_SUPERIOR + altoUtil * (1 - fraccion) - 8, left: ancho - derecha + 8, width: derecha - 8, color: linea.color },
                ]}
              >
                {formatearNumero(Math.round(maximoLinea * fraccion))}
              </Text>
            ))
          : null}
        {puntos.map((punto, indice) =>
          indice % cadaCuanto === 0 ? (
            <Text
              key={`x-${punto.fecha}`}
              numberOfLines={1}
              style={[styles.etiquetaX, { left: x(indice) - 30, top: base + 6 }]}
            >
              {etiquetaCorta(punto.fecha, agrupacion)}
            </Text>
          ) : null
        )}
      </>
    );
  }

  function renderInteraccion() {
    return (
      <>
        <View
          style={[
            styles.capaInteractiva,
            { left: izquierda, width: anchoUtil, top: MARGEN_SUPERIOR, height: altoUtil },
          ]}
        >
          {puntos.map((punto, indice) => (
            <Pressable
              key={`p-${punto.fecha}`}
              accessibilityLabel={etiquetaLarga(punto.fecha, agrupacion)}
              onHoverIn={() => setActivo(indice)}
              onHoverOut={() => setActivo((actual) => (actual === indice ? null : actual))}
              onPress={() => setActivo((actual) => (actual === indice ? null : indice))}
              style={{ width: banda, height: '100%' }}
            />
          ))}
        </View>
        {activo !== null ? (
          <View
            pointerEvents="none"
            style={[
              styles.tooltip,
              { left: Math.min(Math.max(x(activo) - ANCHO_TOOLTIP / 2, 0), Math.max(0, ancho - ANCHO_TOOLTIP)) },
            ]}
          >
            <Text style={styles.fechaTooltip}>{etiquetaLarga(puntos[activo].fecha, agrupacion)}</Text>
            <FilaTooltip color={barras.color} texto={barras.titulo} valor={valoresBarras[activo]} />
            {linea ? (
              <FilaTooltip color={linea.color} texto={linea.titulo} valor={valoresLinea[activo]} />
            ) : null}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.cabecera}>
        <View style={styles.flex}>
          <Text style={styles.titulo}>Evolución {agrupacion === 'mes' ? 'mensual' : 'diaria'}</Text>
          <Text style={styles.subtitulo}>Combiná dos indicadores y compará sus tendencias.</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: conTendencia }}
          onPress={() => setConTendencia((valor) => !valor)}
          style={({ hovered }) => [
            styles.chip,
            hovered && !conTendencia && styles.chipHover,
            conTendencia && styles.chipActivo,
          ]}
          testID="grafico-tendencias"
        >
          <FontAwesome6 color={conTendencia ? c.acento : c.texto} name="chart-line" size={12} />
          <Text style={[styles.textoChip, conTendencia && styles.textoChipActivo]}>Tendencias</Text>
        </Pressable>
      </View>

      <View style={styles.selectores}>
        <Selector
          etiqueta="Barras"
          icono="chart-column"
          onCambiar={elegirBarras}
          opciones={SERIES_EVOLUCION}
          valor={claveBarras}
        />
        <Selector
          conNinguna
          etiqueta="Línea"
          icono="chart-line"
          onCambiar={setClaveLinea}
          opciones={SERIES_EVOLUCION.filter((serie) => serie.clave !== claveBarras)}
          valor={claveLinea}
        />
      </View>

      {hayDatos ? (
        <View
          onLayout={(evento) => setAncho(evento.nativeEvent.layout.width)}
          style={styles.lienzo}
          testID="grafico-combinado"
        >
          {ancho > 0 ? (
            <>
              {renderSvg()}
              {renderEtiquetas()}
              {renderInteraccion()}
            </>
          ) : null}
        </View>
      ) : (
        <View style={styles.vacio}>
          <View style={styles.burbujaVacio}>
            <FontAwesome6 color={c.manteca} name="chart-column" size={22} />
          </View>
          <Text style={styles.tituloVacio}>Sin movimiento en este período</Text>
          <Text style={styles.textoVacio}>Probá con un rango de fechas más amplio.</Text>
        </View>
      )}

      <View style={styles.leyendas}>
        <Leyenda agrupacion={agrupacion} serie={barras} tipo="barras" valores={valoresBarras} />
        {linea ? <Leyenda agrupacion={agrupacion} serie={linea} tipo="linea" valores={valoresLinea} /> : null}
      </View>
    </View>
  );
}

function Selector({ etiqueta, icono, opciones, valor, onCambiar, conNinguna = false }) {
  const lista = conNinguna ? [{ clave: null, titulo: 'Ninguna', color: null }, ...opciones] : opciones;
  return (
    <View style={styles.selector}>
      <View style={styles.etiquetaSelector}>
        <FontAwesome6 color={c.textoSecundario} name={icono} size={11} />
        <Text style={styles.textoEtiquetaSelector}>{etiqueta}</Text>
      </View>
      <View style={styles.chips}>
        {lista.map((opcion) => {
          const activo = opcion.clave === valor;
          return (
            <Pressable
              key={opcion.titulo}
              accessibilityRole="button"
              accessibilityState={{ selected: activo }}
              onPress={() => onCambiar(opcion.clave)}
              style={({ hovered }) => [styles.chip, hovered && !activo && styles.chipHover, activo && styles.chipActivo]}
            >
              {opcion.color ? <View style={[styles.punto, { backgroundColor: opcion.color }]} /> : null}
              <Text style={[styles.textoChip, activo && styles.textoChipActivo]}>{opcion.titulo}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Leyenda({ serie, tipo, valores, agrupacion }) {
  const total = valores.reduce((a, b) => a + b, 0);
  const tendencia = describirTendencia(valores, agrupacion);
  let icono = 'minus';
  if (tendencia.startsWith('En alza')) icono = 'arrow-trend-up';
  if (tendencia.startsWith('En baja')) icono = 'arrow-trend-down';
  return (
    <View style={styles.leyenda}>
      <View style={[tipo === 'barras' ? styles.muestraBarra : styles.muestraLinea, { backgroundColor: serie.color }]} />
      <View style={styles.flex}>
        <Text style={styles.tituloLeyenda}>
          {serie.titulo} · {formatearNumero(total)} en el período
        </Text>
        <View style={styles.filaTendencia}>
          <FontAwesome6 color={serie.color} name={icono} size={11} />
          <Text style={styles.textoTendencia}>Tendencia: {tendencia}</Text>
        </View>
      </View>
    </View>
  );
}

function FilaTooltip({ color, texto, valor }) {
  return (
    <View style={styles.filaTooltip}>
      <View style={[styles.punto, { backgroundColor: color }]} />
      <Text style={styles.textoTooltip}>{texto}</Text>
      <Text style={styles.valorTooltip}>{formatearNumero(valor)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  panel: {
    flex: 1,
    padding: spacing.xl,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  cabecera: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titulo: {
    ...textStyles.bodyStrong,
    color: c.texto,
    fontSize: 19,
  },
  subtitulo: {
    ...textStyles.meta,
    color: c.textoTenue,
    marginTop: 2,
  },
  selectores: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  selector: {
    gap: spacing.xs,
  },
  etiquetaSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  textoEtiquetaSelector: {
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
  punto: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  lienzo: {
    height: ALTO,
    position: 'relative',
  },
  etiquetaEje: {
    ...textStyles.meta,
    position: 'absolute',
    fontSize: 11,
  },
  etiquetaX: {
    ...textStyles.meta,
    position: 'absolute',
    width: 60,
    textAlign: 'center',
    color: c.textoTenue,
    fontSize: 11,
  },
  capaInteractiva: {
    position: 'absolute',
    flexDirection: 'row',
  },
  tooltip: {
    position: 'absolute',
    top: 0,
    width: ANCHO_TOOLTIP,
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
  leyendas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  leyenda: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flexGrow: 1,
    flexBasis: 240,
  },
  muestraBarra: {
    width: 12,
    height: 12,
    borderRadius: 3,
    marginTop: 3,
  },
  muestraLinea: {
    width: 16,
    height: 3,
    borderRadius: 2,
    marginTop: 8,
  },
  tituloLeyenda: {
    ...textStyles.bodyStrong,
    color: c.texto,
    fontSize: 13,
  },
  filaTendencia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  textoTendencia: {
    ...textStyles.meta,
    color: c.textoSecundario,
    fontSize: 12,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  textoAviso: {
    ...textStyles.meta,
    color: c.textoTenue,
    flex: 1,
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
});