import { useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import ContadorNoches from "./ContadorNoches";
import {
  colorDeDestino,
  colorSuaveDeDestino,
  colors,
  radii,
  spacing,
  textStyles,
} from "../../theme/tokens";
import FotoDestino from "../ui/FotoDestino";
import LineaPunteada from "../ui/LineaPunteada";
import { formatDateRangeShort } from "../../utils/dates";
import {
  MODOS_RECORRIDO,
  calcularNochesViaje,
  calcularTramos,
  cambiarNoches,
  cambiarNochesEnViaje,
  indiceDeArrastre,
  moverDestino,
  repartirNoches,
  resumenRecorrido,
  textoNoches,
  textoPildoraTraslado,
  textoRangoTramo,
  textoRegion,
  textoTraslado,
} from "../../utils/recorrido";

const DEMORA_ARRASTRE_MS = 300;
const TAMANO_FOTO = 52;
const PADDING_CAJITA = 10;
const COLOR_SOFT = `${colors.primarySoft}33`;

const ESTILOS_ESTADO = {
  success: { icono: "check", colorIcono: colors.success, colorTexto: colors.success },
  warning: {
    icono: "triangle-exclamation",
    colorIcono: colors.warning,
    colorTexto: colors.warningText,
    fondo: colors.warningSurface,
  },
  info: {
    icono: "circle-info",
    colorIcono: colors.primary,
    colorTexto: colors.primary,
    fondo: COLOR_SOFT,
  },
  danger: {
    icono: "circle-exclamation",
    colorIcono: colors.danger,
    colorTexto: colors.danger,
    fondo: colors.dangerSurface,
  },
};

export function EncabezadoDestinos({ startDate, endDate }) {
  const conFechas = Boolean(startDate && endDate);
  return (
    <View>
      <Text style={styles.titulo}>Tus destinos</Text>
      {conFechas ? (
        <Text style={styles.subtitulo}>
          {`${formatDateRangeShort(startDate, endDate)} · ${textoNoches(
            calcularNochesViaje(startDate, endDate)
          )}`}
        </Text>
      ) : null}
    </View>
  );
}

export function AvisoRecorrido({ tono, mensaje, accion }) {
  const estilo = ESTILOS_ESTADO[tono];
  if (!estilo || !mensaje) return null;
  const alerta = tono === "danger";
  return (
    <View style={estilo.fondo && [styles.estadoConFondo, { backgroundColor: estilo.fondo }]}>
      {/* El rol va en esta fila: en el contenedor agruparía también el link. */}
      <View
        accessible={alerta}
        accessibilityLiveRegion="polite"
        accessibilityRole={alerta ? "alert" : undefined}
        style={styles.estado}
      >
        <FontAwesome6 name={estilo.icono} size={13} color={estilo.colorIcono} style={styles.estadoIcono} />
        <Text style={[styles.estadoTexto, { color: estilo.colorTexto }]}>{mensaje}</Text>
      </View>
      {accion ? (
        <Pressable accessibilityRole="button" onPress={accion.onPress} style={styles.estadoAccion}>
          <Text style={[styles.estadoAccionTexto, { color: estilo.colorTexto }]}>{accion.texto}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function BarraRecorrido({ segmentos }) {
  return (
    <View style={styles.barra}>
      {segmentos.map((segmento) => (
        <View
          key={`${segmento.tipo}-${segmento.indice}`}
          testID={`recorrido-barra-${segmento.tipo}`}
          style={[
            styles.barraTramo,
            { flex: segmento.noches },
            segmento.tipo === "destino" && { backgroundColor: colorDeDestino(segmento.indice) },
            segmento.tipo === "enViaje" && styles.barraEnViaje,
            segmento.tipo === "libre" && styles.barraLibre,
          ]}
        />
      ))}
    </View>
  );
}

// Se reordena manteniendo apretada la foto. El PanResponder solo toma el gesto
// después de la pulsación larga: hasta entonces, deslizar sobre la foto hace scroll.
function useArrastre({ index, onInicio, onFin }) {
  const desplazamiento = useRef(new Animated.Value(0)).current;
  const [arrastrando, setArrastrando] = useState(false);
  const activo = useRef(false);
  const gestoTomado = useRef(false);
  const ultimo = useRef({});
  ultimo.current = { index, onInicio, onFin };

  function terminar(dy) {
    activo.current = false;
    gestoTomado.current = false;
    desplazamiento.setValue(0);
    setArrastrando(false);
    ultimo.current.onFin(ultimo.current.index, dy);
  }
  const terminarRef = useRef(terminar);
  terminarRef.current = terminar;

  const panResponder = useMemo(() => {
    const puedeTomar = () => activo.current;
    return PanResponder.create({
      onMoveShouldSetPanResponder: puedeTomar,
      onMoveShouldSetPanResponderCapture: puedeTomar,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        gestoTomado.current = true;
      },
      onPanResponderMove: (_, gesto) => desplazamiento.setValue(gesto.dy),
      onPanResponderRelease: (_, gesto) => terminarRef.current(gesto.dy),
      onPanResponderTerminate: (_, gesto) => terminarRef.current(gesto.dy),
    });
  }, [desplazamiento]);

  function alMantener() {
    activo.current = true;
    setArrastrando(true);
    ultimo.current.onInicio();
  }

  // Soltó sin mover. Si el PanResponder tomó el gesto, el cierre le toca a él.
  function alSoltar() {
    if (activo.current && !gestoTomado.current) terminar(0);
  }

  return {
    desplazamiento,
    arrastrando,
    panHandlers: panResponder.panHandlers,
    alMantener,
    alSoltar,
  };
}

function CajitaDestino({
  destino,
  index,
  modo,
  tramo,
  totalNoches,
  imagenDe,
  puedeMover,
  onCambiarNoches,
  onQuitar,
  onMover,
  onInicioArrastre,
  onFinArrastre,
}) {
  const { desplazamiento, arrastrando, panHandlers, alMantener, alSoltar } = useArrastre({
    index,
    onInicio: onInicioArrastre,
    onFin: onFinArrastre,
  });
  const color = colorDeDestino(index);
  const armado = modo === MODOS_RECORRIDO.ARMADO;
  const unico = modo === MODOS_RECORRIDO.UNICO;
  const conContador = armado || modo === MODOS_RECORRIDO.SIN_ARMAR;
  const region = textoRegion(destino);
  const noches = destino.noches ?? null;
  const foto = <FotoDestino uri={imagenDe(destino)} numero={index + 1} color={color} />;

  return (
    <Animated.View
      style={[
        styles.cajita,
        { transform: [{ translateY: desplazamiento }] },
        arrastrando && styles.cajitaArrastrada,
      ]}
    >
      <View style={styles.cabecera}>
        {puedeMover ? (
          <View {...panHandlers}>
            <Pressable
              testID={`recorrido-mover-${index}`}
              accessibilityRole="adjustable"
              accessibilityLabel={`Cambiar el orden de ${destino.name}`}
              accessibilityActions={[
                { name: "moverAntes", label: "Mover antes" },
                { name: "moverDespues", label: "Mover después" },
              ]}
              onAccessibilityAction={({ nativeEvent }) =>
                onMover(index, index + (nativeEvent.actionName === "moverAntes" ? -1 : 1))
              }
              delayLongPress={DEMORA_ARRASTRE_MS}
              onLongPress={alMantener}
              onPressOut={alSoltar}
              style={styles.fotoArrastrable}
            >
              {foto}
            </Pressable>
          </View>
        ) : (
          foto
        )}
        <View style={styles.identidad}>
          <Text style={styles.nombre}>{destino.name}</Text>
          {region ? <Text style={styles.region}>{region}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Quitar ${destino.name} del viaje`}
          onPress={() => onQuitar(destino)}
          style={styles.quitar}
          testID={`trip-remove-destination-${index}`}
        >
          <FontAwesome6 name="xmark" size={15} color={colors.iconMuted} />
        </Pressable>
      </View>

      {unico || conContador ? (
        <View style={[styles.franja, { backgroundColor: colorSuaveDeDestino(index) }]}>
          <View style={styles.franjaFechas}>
            {unico || (armado && tramo) ? (
              <>
                <FontAwesome6 name="calendar" size={12} color={color} />
                <Text style={[styles.rango, { color }]}>
                  {unico ? "Todo el viaje" : textoRangoTramo(tramo)}
                </Text>
              </>
            ) : null}
          </View>
          {unico ? <Text style={[styles.rango, { color }]}>{textoNoches(totalNoches)}</Text> : null}
          {conContador ? (
            <ContadorNoches
              valor={noches}
              texto={noches === null ? "—" : textoNoches(noches)}
              color={color}
              etiquetaMenos={`Sacar una noche de ${destino.name}`}
              etiquetaMas={`Sumar una noche a ${destino.name}`}
              onCambiar={(delta) => onCambiarNoches(index, delta)}
            />
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

function FilaTraslado({ tramo, destino, siguiente, armado, onCambiar }) {
  const nochesEnViaje = destino.nochesEnViaje ?? 0;
  return (
    <View style={styles.traslado}>
      <LineaPunteada style={styles.linea} />
      <FontAwesome6
        name={nochesEnViaje > 0 ? "moon" : "arrow-right"}
        size={11}
        color={colors.textSecondary}
      />
      <Text style={styles.trasladoTexto}>
        {armado && tramo ? textoTraslado(tramo) : `Traslado a ${siguiente.name}`}
      </Text>
      <ContadorNoches
        chica
        valor={nochesEnViaje}
        texto={textoPildoraTraslado(nochesEnViaje)}
        color={colors.textSecondary}
        etiquetaMenos={`Sacar una noche en viaje hacia ${siguiente.name}`}
        etiquetaMas={`Sumar una noche en viaje hacia ${siguiente.name}`}
        onCambiar={onCambiar}
      />
    </View>
  );
}

export default function RecorridoViaje({
  destinos,
  startDate,
  endDate,
  onChange,
  onQuitar,
  onAgregar,
  onArrastreChange,
  imagenDe = (destino) => destino.imageUrl,
}) {
  const posiciones = useRef([]);
  const [indiceArrastrado, setIndiceArrastrado] = useState(null);
  const totalNoches = calcularNochesViaje(startDate, endDate);
  const resumen = resumenRecorrido(destinos, totalNoches);
  const { modo } = resumen;
  const tramos = calcularTramos(destinos, startDate);
  const armado = modo === MODOS_RECORRIDO.ARMADO;
  const conTraslados = armado || modo === MODOS_RECORRIDO.SIN_ARMAR;

  function mover(desde, hasta) {
    const nuevos = moverDestino(destinos, desde, hasta);
    if (nuevos !== destinos) onChange(nuevos);
  }

  function inicioArrastre(index) {
    setIndiceArrastrado(index);
    onArrastreChange?.(true);
  }

  function finArrastre(index, dy) {
    setIndiceArrastrado(null);
    onArrastreChange?.(false);
    mover(index, indiceDeArrastre(posiciones.current, index, dy));
  }

  return (
    <View>
      {armado ? (
        <View style={styles.resumen}>
          <BarraRecorrido segmentos={resumen.segmentos} />
          <AvisoRecorrido tono={resumen.tono} mensaje={resumen.mensaje} />
          {resumen.mostrarRepartir ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => onChange(repartirNoches(destinos, totalNoches))}
              style={styles.repartir}
            >
              <Text style={styles.repartirTexto}>Repartir automáticamente</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {destinos.map((destino, index) => {
        const siguiente = destinos[index + 1];
        return (
          <View
            key={`${destino.name}-${destino.country}`}
            style={indiceArrastrado === index && styles.destinoArrastrado}
            onLayout={({ nativeEvent }) => {
              posiciones.current[index] = nativeEvent.layout;
            }}
          >
            <CajitaDestino
              destino={destino}
              index={index}
              modo={modo}
              tramo={tramos[index]}
              totalNoches={totalNoches}
              imagenDe={imagenDe}
              puedeMover={destinos.length > 1}
              onCambiarNoches={(i, delta) => onChange(cambiarNoches(destinos, i, delta))}
              onQuitar={onQuitar}
              onMover={mover}
              onInicioArrastre={() => inicioArrastre(index)}
              onFinArrastre={finArrastre}
            />
            {siguiente && conTraslados ? (
              <FilaTraslado
                tramo={tramos[index]}
                destino={destino}
                siguiente={siguiente}
                armado={armado}
                onCambiar={(delta) => onChange(cambiarNochesEnViaje(destinos, index, delta))}
              />
            ) : (
              <View style={styles.separacion} />
            )}
          </View>
        );
      })}

      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.8}
        onPress={onAgregar}
        style={styles.addAnotherButton}
      >
        <FontAwesome6 name="plus" size={12} color={colors.primary} />
        <Text style={styles.addAnotherText}>Agregar otro destino</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 18,
  },
  subtitulo: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  resumen: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  barra: {
    flexDirection: "row",
    gap: 2,
    height: 6,
    borderRadius: radii.pill,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
  },
  barraTramo: {
    height: "100%",
  },
  barraEnViaje: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.textMuted,
    backgroundColor: colors.surfaceMuted,
  },
  barraLibre: {
    backgroundColor: colors.border,
  },
  estado: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  estadoConFondo: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  estadoIcono: {
    marginTop: 2,
  },
  estadoAccion: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 44,
    marginBottom: -spacing.xs,
    paddingLeft: 21,
  },
  estadoAccionTexto: {
    ...textStyles.meta,
    fontWeight: "700",
  },
  estadoTexto: {
    ...textStyles.meta,
    flex: 1,
  },
  repartir: {
    alignSelf: "flex-start",
  },
  repartirTexto: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
  cajita: {
    gap: PADDING_CAJITA,
    padding: PADDING_CAJITA,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  cajitaArrastrada: {
    opacity: 0.92,
    borderColor: colors.primarySoft,
  },
  destinoArrastrado: {
    zIndex: 10,
    elevation: 10,
  },
  cabecera: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  fotoArrastrable: Platform.select({
    web: { cursor: "grab", userSelect: "none" },
    default: {},
  }),
  identidad: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    alignSelf: "center",
  },
  nombre: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 16,
  },
  region: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 12,
  },
  quitar: {
    width: 36,
    height: 36,
    marginTop: -6,
    marginRight: -6,
    alignItems: "center",
    justifyContent: "center",
  },
  franja: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    minHeight: 40,
    paddingVertical: spacing.xxs,
    paddingLeft: PADDING_CAJITA,
    paddingRight: 2,
    borderRadius: 12,
  },
  franjaFechas: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  rango: {
    ...textStyles.meta,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  traslado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 46,
    paddingVertical: spacing.xs,
  },
  linea: {
    marginVertical: -spacing.xs,
    marginLeft: PADDING_CAJITA + 14,
    marginRight: spacing.xxs,
  },
  trasladoTexto: {
    ...textStyles.meta,
    fontSize: 12,
    flex: 1,
    minWidth: 0,
    color: colors.textSecondary,
  },
  separacion: {
    height: spacing.sm,
  },
  addAnotherButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 46,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.primary,
    borderRadius: radii.md,
    backgroundColor: COLOR_SOFT,
  },
  addAnotherText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
});
