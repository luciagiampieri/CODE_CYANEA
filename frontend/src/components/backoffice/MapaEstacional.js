import { FontAwesome6 } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { backofficeColors as c } from '../../theme/backofficeTokens';
import { radii, spacing, textStyles } from '../../theme/tokens';
import { MESES_CORTOS, MESES_LARGOS, formatearNumero } from '../../utils/formatoMetricas';
import { mesDestacado } from '../../utils/tendencias';

const SERIES = [
  {
    clave: 'salidas',
    titulo: 'Salidas de viajes',
    color: c.salvia,
    ayuda: 'En qué meses viajan los grupos (fecha de inicio del viaje, incluye los planificados hasta el año que viene).',
  },
  { clave: 'viajes', titulo: 'Viajes creados', color: c.cielo, ayuda: 'En qué meses se planifican los viajes.' },
  { clave: 'usuarios', titulo: 'Registros', color: c.manteca, ayuda: 'En qué meses se suma gente nueva a Cyanea.' },
];

const SEPARACION = 4;
const ANCHO_ANIO = 56;
const ANCHO_TOTAL = 64;
const ANCHO_CELDA_MINIMO = 44;
const ALTO_CELDA = 34;

function colorCelda(color, valor, maximo) {
  if (!valor || !maximo) return null;
  const opacidad = 0.18 + 0.72 * (valor / maximo);
  return `${color}${Math.round(opacidad * 255).toString(16).padStart(2, '0')}`;
}

export default function MapaEstacional({ estacionalidad }) {
  const [clave, setClave] = useState('salidas');
  const [ancho, setAncho] = useState(0);
  const serie = SERIES.find((s) => s.clave === clave);

  if (!estacionalidad || estacionalidad.error) {
    return (
      <View style={styles.panel}>
        <View style={styles.aviso}>
          <FontAwesome6 color={c.textoTenue} name="triangle-exclamation" size={13} />
          <Text style={styles.textoAviso}>
            {estacionalidad?.error || 'No se pudo obtener la estacionalidad.'}
          </Text>
        </View>
      </View>
    );
  }

  const filas = estacionalidad[clave] || [];
  const maximo = Math.max(0, ...filas.flatMap((fila) => fila.meses));
  const totalesMes = Array.from({ length: 12 }, (_, mes) =>
    filas.reduce((suma, fila) => suma + (fila.meses[mes] || 0), 0)
  );
  const maximoTotales = Math.max(0, ...totalesMes);
  const destacado = mesDestacado(filas);
  const anchoCelda = ancho
    ? Math.max(
        ANCHO_CELDA_MINIMO,
        Math.floor((ancho - ANCHO_ANIO - ANCHO_TOTAL - SEPARACION * 13) / 12)
      )
    : ANCHO_CELDA_MINIMO;

  function renderCelda(valor, max, indice, fuerte = false) {
    const fondo = colorCelda(serie.color, valor, max);
    const oscuro = valor && max && valor / max > 0.5;
    return (
      <View
        key={MESES_CORTOS[indice]}
        style={[styles.celda, { width: anchoCelda }, fondo ? { backgroundColor: fondo } : styles.celdaVacia]}
      >
        {valor ? (
          <Text style={[styles.valorCelda, fuerte && styles.valorFuerte, oscuro && styles.valorOscuro]}>
            {formatearNumero(valor)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.titulo}>Estacionalidad</Text>
      <Text style={styles.subtitulo}>Toda la historia de la plataforma, mes por mes. {serie.ayuda}</Text>

      <View style={styles.chips}>
        {SERIES.map((opcion) => {
          const activo = opcion.clave === clave;
          return (
            <Pressable
              key={opcion.clave}
              accessibilityRole="button"
              accessibilityState={{ selected: activo }}
              onPress={() => setClave(opcion.clave)}
              style={({ hovered }) => [styles.chip, hovered && !activo && styles.chipHover, activo && styles.chipActivo]}
            >
              <View style={[styles.punto, { backgroundColor: opcion.color }]} />
              <Text style={[styles.textoChip, activo && styles.textoChipActivo]}>{opcion.titulo}</Text>
            </Pressable>
          );
        })}
      </View>

      {!filas.length || maximo === 0 ? (
        <View style={styles.vacio}>
          <FontAwesome6 color={c.textoTenue} name="calendar-xmark" size={20} />
          <Text style={styles.textoVacio}>Todavía no hay datos para esta serie.</Text>
        </View>
      ) : (
        <View onLayout={(evento) => setAncho(evento.nativeEvent.layout.width)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View testID="mapa-estacional">
              <View style={styles.fila}>
                <Text style={[styles.encabezado, { width: ANCHO_ANIO, textAlign: 'left' }]}>Año</Text>
                {MESES_CORTOS.map((mes, indice) => (
                  <Text
                    key={mes}
                    style={[
                      styles.encabezado,
                      { width: anchoCelda },
                      destacado?.mes === indice && { color: serie.color },
                    ]}
                  >
                    {mes}
                  </Text>
                ))}
                <Text style={[styles.encabezado, { width: ANCHO_TOTAL }]}>Total</Text>
              </View>

              {filas.map((fila) => {
                const total = fila.meses.reduce((a, b) => a + b, 0);
                return (
                  <View key={fila.anio} style={[styles.fila, !total && styles.filaSinActividad]}>
                    <Text style={[styles.anio, { width: ANCHO_ANIO }]}>{fila.anio}</Text>
                    {fila.meses.map((valor, indice) => renderCelda(valor, maximo, indice))}
                    <Text style={[styles.total, { width: ANCHO_TOTAL }]}>{formatearNumero(total)}</Text>
                  </View>
                );
              })}

              <View style={[styles.fila, styles.filaTotales]}>
                <Text style={[styles.anioTotales, { width: ANCHO_ANIO }]}>Total</Text>
                {totalesMes.map((valor, indice) => renderCelda(valor, maximoTotales, indice, true))}
                <Text style={[styles.total, styles.totalGeneral, { width: ANCHO_TOTAL }]}>
                  {formatearNumero(totalesMes.reduce((a, b) => a + b, 0))}
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {destacado && maximo > 0 ? (
        <View style={styles.insight}>
          <FontAwesome6 color={serie.color} name="lightbulb" size={13} />
          <Text style={styles.textoInsight}>
            <Text style={styles.textoInsightFuerte}>{MESES_LARGOS[destacado.mes]}</Text> es el mes más fuerte (
            {formatearNumero(destacado.total)} en total). Es el momento para anticipar campañas y promociones.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: spacing.xl,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
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
    marginBottom: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.lg,
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
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SEPARACION,
    marginBottom: SEPARACION,
  },
  filaSinActividad: {
    opacity: 0.45,
  },
  filaTotales: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: c.borde,
  },
  encabezado: {
    ...textStyles.sectionLabel,
    color: c.textoTenue,
    fontSize: 10,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 2,
  },
  anio: {
    ...textStyles.bodyStrong,
    color: c.textoSecundario,
    fontSize: 13,
  },
  anioTotales: {
    ...textStyles.bodyStrong,
    color: c.texto,
    fontSize: 13,
  },
  celda: {
    height: ALTO_CELDA,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celdaVacia: {
    backgroundColor: c.panel,
  },
  valorCelda: {
    ...textStyles.bodyStrong,
    color: c.texto,
    fontSize: 12,
  },
  valorFuerte: {
    fontSize: 13,
  },
  valorOscuro: {
    color: c.sobreAcento,
  },
  total: {
    ...textStyles.bodyStrong,
    color: c.textoSecundario,
    fontSize: 13,
    textAlign: 'center',
  },
  totalGeneral: {
    color: c.texto,
  },
  insight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: c.panel,
    borderWidth: 1,
    borderColor: c.borde,
  },
  textoInsight: {
    ...textStyles.meta,
    color: c.textoSecundario,
    flex: 1,
  },
  textoInsightFuerte: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  vacio: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
  },
  textoVacio: {
    ...textStyles.meta,
    color: c.textoSecundario,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  textoAviso: {
    ...textStyles.meta,
    color: c.textoTenue,
    flex: 1,
  },
});