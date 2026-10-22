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
import { appToast } from '../../components/ui/AppDialog';
import { configurarUmbralCostoIA, obtenerMonitoreoIA } from '../../services/backofficeApi';
import { backofficeColors as c } from '../../theme/backofficeTokens';
import { fontFamilies, radii, spacing, textStyles } from '../../theme/tokens';
import { aISO, formatearISO, rangoUltimosDias, validarRango } from '../../utils/formatoMetricas';
import {
  NIVELES_ALERTA,
  formatearDuracion,
  formatearPorcentaje,
  formatearUSD,
  parsearUmbral,
  tasaDeFallas,
} from '../../utils/formatoMonitoreo';

const ANCHO_TABLA = 860;

export const PERIODOS_MONITOREO = [
  { valor: '7', etiqueta: '7 días', dias: 7 },
  { valor: '30', etiqueta: '30 días', dias: 30 },
  { valor: '90', etiqueta: '90 días', dias: 90 },
  { valor: 'personalizado', etiqueta: 'Personalizado' },
];

export default function BackofficeMonitoreoIAScreen({ onVolver }) {
  const { width } = useWindowDimensions();
  const tabla = width >= ANCHO_TABLA;
  const hoy = aISO(new Date());
  const [periodo, setPeriodo] = useState('30');
  const [rango, setRango] = useState(() => rangoUltimosDias(30));
  const [borrador, setBorrador] = useState(() => rangoUltimosDias(30));
  const [errorRango, setErrorRango] = useState('');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    obtenerMonitoreoIA(rango)
      .then((respuesta) => {
        if (vigente) setDatos(respuesta);
      })
      .catch((err) => {
        if (vigente) setError(err?.message || 'No se pudo cargar el consumo de IA.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [rango, recarga]);

  function cambiarPeriodo(valor) {
    setPeriodo(valor);
    setErrorRango('');
    const opcion = PERIODOS_MONITOREO.find((p) => p.valor === valor);
    if (opcion?.dias) {
      setRango(rangoUltimosDias(opcion.dias));
    } else {
      setBorrador(rango);
    }
  }

  function aplicarRango() {
    const mensaje = validarRango(borrador, hoy);
    setErrorRango(mensaje);
    if (!mensaje) setRango({ ...borrador });
  }

  let contenido;
  if (cargando && !datos) {
    contenido = (
      <View style={styles.centro}>
        <ActivityIndicator color={c.acento} size="large" />
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
  } else {
    const { totales, funcionalidades, umbral } = datos;
    contenido = (
      <View style={cargando && styles.recargando}>
        <AlertaUmbral umbral={umbral} />

        <View style={styles.kpis}>
          <Kpi etiqueta="Solicitudes" icono="bolt" valor={String(totales.solicitudes)} />
          <Kpi
            detalle={
              totales.solicitudes
                ? `${formatearPorcentaje(tasaDeFallas(totales.fallidas, totales.solicitudes))} del total`
                : null
            }
            etiqueta="Fallidas"
            icono="triangle-exclamation"
            valor={String(totales.fallidas)}
          />
          <Kpi etiqueta="Tiempo promedio" icono="stopwatch" valor={formatearDuracion(totales.tiempoPromedioMs)} />
          <Kpi etiqueta="Costo estimado" icono="dollar-sign" valor={formatearUSD(totales.costoEstimadoUSD)} />
        </View>

        <Text style={styles.etiquetaSeccion}>CONSUMO POR FUNCIONALIDAD</Text>
        <Text style={styles.textoRango}>
          Del {formatearISO(datos.desde)} al {formatearISO(datos.hasta)}
        </Text>
        {tabla ? (
          <TablaFuncionalidades funcionalidades={funcionalidades} />
        ) : (
          <TarjetasFuncionalidades funcionalidades={funcionalidades} />
        )}

        <PanelUmbral onActualizado={(nuevo) => setDatos((d) => ({ ...d, umbral: nuevo }))} umbral={umbral} />

        <View style={styles.notaPrivacidad}>
          <FontAwesome6 color={c.textoTenue} name="user-shield" size={12} />
          <Text style={styles.textoNota}>
            Solo se registran metadatos de consumo (funcionalidad, modelo, resultado, duración y tokens).
            No se guarda el contenido de las solicitudes ni datos de los usuarios. Los costos son
            estimados con precios de referencia de cada proveedor.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Pressable onPress={onVolver} style={({ pressed }) => [styles.volver, pressed && styles.presionado]}>
        <FontAwesome6 color={c.textoSecundario} name="arrow-left" size={12} />
        <Text style={styles.textoVolver}>Volver al inicio</Text>
      </Pressable>

      <Text style={styles.titulo}>Monitoreo de IA</Text>
      <Text style={styles.bajada}>
        Controlá el consumo y el costo de los servicios de inteligencia artificial y detectá fallas
        en las funcionalidades que dependen de ellos.
      </Text>

      <View style={styles.panelFiltros}>
        <View style={styles.etiquetaGrupoFila}>
          <FontAwesome6 color={c.textoTenue} name="calendar-days" size={12} />
          <Text style={styles.etiquetaGrupo}>Período</Text>
        </View>
        <View style={styles.chips}>
          {PERIODOS_MONITOREO.map((opcion) => {
            const activo = opcion.valor === periodo;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: activo }}
                key={opcion.valor}
                onPress={() => cambiarPeriodo(opcion.valor)}
                style={({ hovered }) => [styles.chip, hovered && styles.chipHover, activo && styles.chipActivo]}
                testID={`monitoreo-periodo-${opcion.valor}`}
              >
                <Text style={[styles.textoChip, activo && styles.textoChipActivo]}>{opcion.etiqueta}</Text>
              </Pressable>
            );
          })}
        </View>

        {periodo === 'personalizado' ? (
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
              style={({ hovered, pressed }) => [styles.botonAplicar, hovered && styles.hover, pressed && styles.presionado]}
              testID="monitoreo-aplicar-rango"
            >
              <FontAwesome6 color={c.sobreAcento} name="check" size={13} />
              <Text style={styles.textoBotonAplicar}>Aplicar</Text>
            </Pressable>
          </View>
        ) : null}

        {errorRango || (error && datos) ? (
          <View style={styles.avisoRango}>
            <FontAwesome6 color={c.peligro} name="circle-exclamation" size={13} />
            <Text style={styles.textoErrorRango}>{errorRango || error}</Text>
          </View>
        ) : null}
      </View>

      {contenido}
    </View>
  );
}

function AlertaUmbral({ umbral }) {
  if (umbral.nivel === NIVELES_ALERTA.superado) {
    return (
      <View accessibilityRole="alert" style={[styles.alerta, styles.alertaPeligro]} testID="monitoreo-alerta">
        <FontAwesome6 color={c.peligro} name="circle-exclamation" size={16} />
        <View style={styles.textosAlerta}>
          <Text style={[styles.tituloAlerta, { color: c.peligro }]}>Se superó el umbral de costo mensual</Text>
          <Text style={styles.textoAlerta}>
            El costo estimado del mes es {formatearUSD(umbral.costoMesActualUSD)} (
            {formatearPorcentaje(umbral.porcentajeUsado)} de {formatearUSD(umbral.umbralMensualUSD)}). Se
            avisó por correo a los administradores del sistema.
          </Text>
        </View>
      </View>
    );
  }
  if (umbral.nivel === NIVELES_ALERTA.advertencia) {
    return (
      <View accessibilityRole="alert" style={[styles.alerta, styles.alertaAdvertencia]} testID="monitoreo-alerta">
        <FontAwesome6 color={c.manteca} name="triangle-exclamation" size={16} />
        <View style={styles.textosAlerta}>
          <Text style={[styles.tituloAlerta, { color: c.manteca }]}>
            El consumo superó el 80% del umbral mensual
          </Text>
          <Text style={styles.textoAlerta}>
            El costo estimado del mes es {formatearUSD(umbral.costoMesActualUSD)} (
            {formatearPorcentaje(umbral.porcentajeUsado)} de {formatearUSD(umbral.umbralMensualUSD)}).
          </Text>
        </View>
      </View>
    );
  }
  return null;
}

function Kpi({ icono, etiqueta, valor, detalle }) {
  return (
    <View style={styles.kpi}>
      <View style={styles.iconoKpi}>
        <FontAwesome6 color={c.acento} name={icono} size={13} />
      </View>
      <Text style={styles.etiquetaKpi}>{etiqueta}</Text>
      <Text style={styles.valorKpi}>{valor}</Text>
      {detalle ? <Text style={styles.detalleKpi}>{detalle}</Text> : null}
    </View>
  );
}

const COLUMNAS = [
  { clave: 'nombre', titulo: 'Funcionalidad', flex: 2.2 },
  { clave: 'solicitudes', titulo: 'Solicitudes', flex: 1 },
  { clave: 'fallidas', titulo: 'Fallidas', flex: 1 },
  { clave: 'tiempo', titulo: 'Tiempo promedio', flex: 1.2 },
  { clave: 'costo', titulo: 'Costo estimado', flex: 1.2 },
];

function TextoFallidas({ fila }) {
  const tasa = tasaDeFallas(fila.fallidas, fila.solicitudes);
  return (
    <Text style={[styles.celda, fila.fallidas > 0 && styles.celdaPeligro]}>
      {fila.fallidas}
      {tasa !== null ? <Text style={styles.celdaTenue}> ({formatearPorcentaje(tasa)})</Text> : null}
    </Text>
  );
}

function TablaFuncionalidades({ funcionalidades }) {
  return (
    <View style={styles.tabla} testID="monitoreo-tabla">
      <View style={[styles.filaTabla, styles.encabezadoTabla]}>
        {COLUMNAS.map((col) => (
          <Text key={col.clave} style={[styles.celdaEncabezado, { flex: col.flex }]}>
            {col.titulo}
          </Text>
        ))}
      </View>
      {funcionalidades.map((fila, indice) => (
        <View
          key={fila.servicio}
          style={[styles.filaTabla, indice === funcionalidades.length - 1 && styles.ultimaFila]}
          testID={`monitoreo-fila-${fila.servicio}`}
        >
          <Text style={[styles.celdaFuerte, { flex: COLUMNAS[0].flex }]}>{fila.nombre}</Text>
          <Text style={[styles.celda, { flex: COLUMNAS[1].flex }]}>{fila.solicitudes}</Text>
          <View style={{ flex: COLUMNAS[2].flex }}>
            <TextoFallidas fila={fila} />
          </View>
          <Text style={[styles.celda, { flex: COLUMNAS[3].flex }]}>{formatearDuracion(fila.tiempoPromedioMs)}</Text>
          <Text style={[styles.celda, { flex: COLUMNAS[4].flex }]}>{formatearUSD(fila.costoEstimadoUSD)}</Text>
        </View>
      ))}
    </View>
  );
}

function TarjetasFuncionalidades({ funcionalidades }) {
  return (
    <View style={styles.tarjetas}>
      {funcionalidades.map((fila) => (
        <View key={fila.servicio} style={styles.tarjeta} testID={`monitoreo-fila-${fila.servicio}`}>
          <Text style={styles.nombreTarjeta}>{fila.nombre}</Text>
          <View style={styles.filaTarjeta}>
            <Text style={styles.metaTarjeta}>Solicitudes</Text>
            <Text style={styles.celda}>{fila.solicitudes}</Text>
          </View>
          <View style={styles.filaTarjeta}>
            <Text style={styles.metaTarjeta}>Fallidas</Text>
            <TextoFallidas fila={fila} />
          </View>
          <View style={styles.filaTarjeta}>
            <Text style={styles.metaTarjeta}>Tiempo promedio</Text>
            <Text style={styles.celda}>{formatearDuracion(fila.tiempoPromedioMs)}</Text>
          </View>
          <View style={styles.filaTarjeta}>
            <Text style={styles.metaTarjeta}>Costo estimado</Text>
            <Text style={styles.celda}>{formatearUSD(fila.costoEstimadoUSD)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function PanelUmbral({ umbral, onActualizado }) {
  const [texto, setTexto] = useState(
    umbral.umbralMensualUSD !== null && umbral.umbralMensualUSD !== undefined
      ? String(umbral.umbralMensualUSD).replace('.', ',')
      : ''
  );
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar(valor) {
    setGuardando(true);
    setError('');
    try {
      const nuevo = await configurarUmbralCostoIA(valor);
      onActualizado(nuevo);
      appToast(valor === null ? 'Umbral quitado' : 'Umbral guardado');
      if (valor === null) setTexto('');
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el umbral.');
    } finally {
      setGuardando(false);
    }
  }

  function enviar() {
    const resultado = parsearUmbral(texto);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    guardar(resultado.valor);
  }

  const porcentaje = Math.min(umbral.porcentajeUsado ?? 0, 100);
  const colorBarra =
    umbral.nivel === NIVELES_ALERTA.superado
      ? c.peligro
      : umbral.nivel === NIVELES_ALERTA.advertencia
        ? c.manteca
        : c.salvia;

  return (
    <View style={styles.panelUmbral} testID="monitoreo-umbral">
      <View style={styles.encabezadoUmbral}>
        <View style={styles.iconoKpi}>
          <FontAwesome6 color={c.acento} name="gauge-high" size={13} />
        </View>
        <View style={styles.textosUmbral}>
          <Text style={styles.tituloUmbral}>Umbral de costo mensual</Text>
          <Text style={styles.metaUmbral}>
            Se muestra una alerta al superar el 80% y se avisa por correo a los administradores al
            superarlo. Se calcula sobre el mes en curso.
          </Text>
        </View>
      </View>

      <View style={styles.filaConsumoMes}>
        <Text style={styles.textoConsumoMes}>
          Consumo del mes: <Text style={styles.valorConsumoMes}>{formatearUSD(umbral.costoMesActualUSD)}</Text>
          {umbral.umbralMensualUSD
            ? ` de ${formatearUSD(umbral.umbralMensualUSD)} (${formatearPorcentaje(umbral.porcentajeUsado)})`
            : ' · Sin umbral configurado'}
        </Text>
      </View>
      {umbral.umbralMensualUSD ? (
        <View style={styles.barra}>
          <View style={[styles.rellenoBarra, { width: `${porcentaje}%`, backgroundColor: colorBarra }]} />
          <View style={styles.marca80} />
        </View>
      ) : null}

      <View style={styles.filaUmbral}>
        <View style={[styles.cajaUmbral, error && styles.cajaUmbralError]}>
          <Text style={styles.prefijo}>USD</Text>
          <TextInput
            accessibilityLabel="Umbral de costo mensual en USD"
            inputMode="decimal"
            keyboardType="decimal-pad"
            onChangeText={(valor) => {
              setTexto(valor);
              if (error) setError('');
            }}
            onSubmitEditing={enviar}
            placeholder="Por ejemplo: 50"
            placeholderTextColor={c.textoTenue}
            style={styles.inputUmbral}
            value={texto}
          />
        </View>
        <Pressable
          disabled={guardando}
          onPress={enviar}
          style={({ hovered, pressed }) => [
            styles.botonAplicar,
            hovered && styles.hover,
            pressed && styles.presionado,
            guardando && styles.deshabilitado,
          ]}
          testID="monitoreo-guardar-umbral"
        >
          {guardando ? (
            <ActivityIndicator color={c.sobreAcento} size="small" />
          ) : (
            <Text style={styles.textoBotonAplicar}>Guardar umbral</Text>
          )}
        </Pressable>
        {umbral.umbralMensualUSD ? (
          <Pressable
            disabled={guardando}
            onPress={() => guardar(null)}
            style={styles.botonSecundario}
            testID="monitoreo-quitar-umbral"
          >
            <Text style={styles.textoBotonSecundario}>Quitar umbral</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.textoErrorRango}>{error}</Text> : null}
    </View>
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
    maxWidth: 760,
  },
  panelFiltros: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.panel,
    marginBottom: spacing.xl,
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
    marginTop: spacing.xs,
  },
  flechaRango: {
    height: 44,
    justifyContent: 'center',
  },
  botonAplicar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: c.manteca,
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
    marginTop: spacing.xs,
  },
  recargando: {
    opacity: 0.6,
  },
  alerta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  alertaPeligro: {
    borderColor: c.peligro,
    backgroundColor: c.peligroSuave,
  },
  alertaAdvertencia: {
    borderColor: c.acentoBorde,
    backgroundColor: c.acentoMedio,
  },
  textosAlerta: {
    flex: 1,
    gap: 2,
  },
  tituloAlerta: {
    ...textStyles.bodyStrong,
  },
  textoAlerta: {
    ...textStyles.body,
    color: c.texto,
  },
  kpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  kpi: {
    flexGrow: 1,
    flexBasis: 200,
    padding: spacing.lg,
    gap: 4,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  iconoKpi: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.acentoSuave,
    borderWidth: 1,
    borderColor: c.acentoBorde,
    marginBottom: spacing.xs,
  },
  etiquetaKpi: {
    ...textStyles.meta,
    color: c.textoSecundario,
  },
  valorKpi: {
    ...textStyles.brandTitle,
    color: c.texto,
    fontSize: 28,
  },
  detalleKpi: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
  },
  etiquetaSeccion: {
    ...textStyles.sectionLabel,
    color: c.textoSecundario,
    letterSpacing: 1.5,
  },
  textoRango: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  tabla: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.panel,
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
  ultimaFila: {
    borderBottomWidth: 0,
  },
  encabezadoTabla: {
    backgroundColor: c.superficie,
  },
  celdaEncabezado: {
    ...textStyles.label,
    color: c.textoSecundario,
  },
  celda: {
    ...textStyles.body,
    color: c.texto,
  },
  celdaFuerte: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  celdaPeligro: {
    color: c.peligro,
  },
  celdaTenue: {
    color: c.textoTenue,
  },
  tarjetas: {
    gap: spacing.sm,
  },
  tarjeta: {
    padding: spacing.lg,
    gap: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.panel,
  },
  nombreTarjeta: {
    ...textStyles.bodyStrong,
    color: c.texto,
    marginBottom: spacing.xs,
  },
  filaTarjeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metaTarjeta: {
    ...textStyles.meta,
    color: c.textoSecundario,
  },
  panelUmbral: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.borde,
    backgroundColor: c.panel,
  },
  encabezadoUmbral: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  textosUmbral: {
    flex: 1,
  },
  tituloUmbral: {
    ...textStyles.bodyStrong,
    color: c.texto,
    fontSize: 17,
  },
  metaUmbral: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
  },
  filaConsumoMes: {
    marginTop: spacing.xs,
  },
  textoConsumoMes: {
    ...textStyles.body,
    color: c.textoSecundario,
  },
  valorConsumoMes: {
    ...textStyles.bodyStrong,
    color: c.texto,
  },
  barra: {
    height: 10,
    borderRadius: 999,
    backgroundColor: c.superficieElevada,
    overflow: 'hidden',
  },
  rellenoBarra: {
    height: '100%',
    borderRadius: 999,
  },
  marca80: {
    position: 'absolute',
    left: '80%',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: c.texto,
    opacity: 0.5,
  },
  filaUmbral: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cajaUmbral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    width: 220,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.bordeControl,
    backgroundColor: c.fondo,
  },
  cajaUmbralError: {
    borderColor: c.peligro,
  },
  prefijo: {
    ...textStyles.meta,
    color: c.textoTenue,
  },
  inputUmbral: {
    flex: 1,
    height: 42,
    color: c.texto,
    fontFamily: fontFamilies.sans,
    fontSize: 15,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  notaPrivacidad: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  textoNota: {
    ...textStyles.meta,
    color: c.textoTenue,
    fontSize: 12,
    flex: 1,
  },
  centro: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
  },
  cajaError: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.peligro,
    backgroundColor: c.peligroSuave,
  },
  textoError: {
    ...textStyles.body,
    color: c.peligro,
    flex: 1,
  },
  botonSecundario: {
    minHeight: 44,
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
  hover: {
    opacity: 0.9,
  },
  deshabilitado: {
    opacity: 0.6,
  },
  presionado: {
    transform: [{ scale: 0.985 }],
  },
});
