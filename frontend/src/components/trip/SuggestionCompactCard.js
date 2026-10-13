import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import StatusPill from "../ui/StatusPill";
import { getActivitySuggestionPhotoSource } from "../../services/api";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

const ETIQUETAS_ESTADO = {
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  descartada: "Descartada",
};

function hhmm(valor) {
  return String(valor ?? "").slice(0, 5);
}

function textoCosto(sugerencia) {
  const costo = Number(sugerencia.CostoEstimadoARS ?? 0);
  return costo > 0 ? `ARS $ ${Math.round(costo).toLocaleString("es-AR")}` : "Gratis";
}

function urlGoogleMaps(sugerencia) {
  const placeId = String(sugerencia.GooglePlaceId || "").replace("google:", "");
  const nombre = encodeURIComponent(sugerencia.LugarNombre || "");
  return `https://www.google.com/maps/search/?api=1&query=${nombre}&query_place_id=${encodeURIComponent(placeId)}`;
}

async function abrirUrl(url) {
  try {
    await Linking.openURL(url);
  } catch {
  }
}

function useFotoSugerencia(sugerencia) {
  const [source, setSource] = useState(null);

  useEffect(() => {
    if (!sugerencia.TieneFoto) return undefined;
    let cancelado = false;
    let objectUrl = null;

    getActivitySuggestionPhotoSource(sugerencia.IdViaje, sugerencia.IdSugerenciaActividad)
      .then((resultado) => {
        if (cancelado) return;
        if (resultado.uri?.startsWith("blob:")) objectUrl = resultado.uri;
        setSource(resultado);
      })
      .catch(() => {
      });

    return () => {
      cancelado = true;
      if (objectUrl && typeof URL !== "undefined") URL.revokeObjectURL(objectUrl);
    };
  }, [sugerencia.TieneFoto, sugerencia.IdViaje, sugerencia.IdSugerenciaActividad]);

  return source;
}

function EstadoPill({ estado }) {
  const nombre = String(estado || "pendiente").toLowerCase();

  if (nombre === "en_votacion") {
    return (
      <View style={styles.pillVotacion}>
        <FontAwesome6 name="check-to-slot" size={9} color={colors.primary} />
        <Text style={styles.pillVotacionTexto}>En votación</Text>
      </View>
    );
  }

  const etiqueta = ETIQUETAS_ESTADO[nombre] ?? nombre.charAt(0).toUpperCase() + nombre.slice(1);
  return (
    <StatusPill tone={nombre} textStyle={styles.pillTexto}>
      {etiqueta}
    </StatusPill>
  );
}


export default function SuggestionCompactCard({
  sugerencia,
  expandida = false,
  onPress,
  modoSeleccion = false,
  seleccionada = false,
  bloqueada = false,
}) {
  const foto = useFotoSugerencia(sugerencia);
  const sitioWeb = /^https?:\/\//i.test(sugerencia.SitioWebUrl || "") ? sugerencia.SitioWebUrl : null;
  const mostrarDetalle = expandida && !modoSeleccion;

  return (
    <Pressable
      accessibilityRole={modoSeleccion ? "checkbox" : "button"}
      accessibilityLabel={sugerencia.Nombre}
      accessibilityState={
        modoSeleccion ? { checked: seleccionada, disabled: bloqueada } : { expanded: expandida }
      }
      disabled={bloqueada}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        seleccionada && styles.cardSeleccionada,
        bloqueada && styles.cardBloqueada,
        pressed && !bloqueada && styles.presionada,
      ]}
      testID={`sugerencia-compacta-${sugerencia.IdSugerenciaActividad}`}
    >
      <View style={styles.fila}>
        <View style={styles.miniatura}>
          {foto ? (
            <Image source={foto} style={styles.miniaturaImagen} resizeMode="cover" />
          ) : (
            <FontAwesome6 name="location-dot" size={18} color={colors.textMuted} />
          )}
        </View>

        <View style={styles.info}>
          <View style={styles.infoArriba}>
            <Text style={styles.horario}>
              {hhmm(sugerencia.HoraInicio)} – {hhmm(sugerencia.HoraFin)}
            </Text>
            <EstadoPill estado={sugerencia.Estado} />
          </View>
          <Text style={styles.nombre} numberOfLines={mostrarDetalle ? undefined : 1}>
            {sugerencia.Nombre}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {sugerencia.LugarNombre} · {textoCosto(sugerencia)}
          </Text>
        </View>

        {modoSeleccion ? (
          !bloqueada ? (
            <View style={[styles.check, seleccionada && styles.checkActivo]}>
              {seleccionada ? (
                <FontAwesome6 name="check" size={11} color={colors.textInverse} />
              ) : null}
            </View>
          ) : null
        ) : (
          <FontAwesome6
            name={expandida ? "chevron-up" : "chevron-down"}
            size={11}
            color={colors.textMuted}
          />
        )}
      </View>

      {mostrarDetalle ? (
        <View style={styles.detalle}>
          {foto ? <Image source={foto} style={styles.fotoGrande} resizeMode="cover" /> : null}

          {sugerencia.Descripcion ? (
            <Text style={styles.descripcion}>{sugerencia.Descripcion}</Text>
          ) : null}

          {sugerencia.LugarDireccion ? (
            <View style={styles.detalleFila}>
              <FontAwesome6 name="location-dot" size={11} color={colors.textMuted} />
              <Text style={styles.detalleTexto}>{sugerencia.LugarDireccion}</Text>
            </View>
          ) : null}

          {sugerencia.Motivo ? (
            <View style={styles.motivo}>
              <FontAwesome6 name="wand-magic-sparkles" size={11} color={colors.primary} />
              <Text style={styles.motivoTexto}>{sugerencia.Motivo}</Text>
            </View>
          ) : null}

          <View style={styles.links}>
            <Pressable
              accessibilityRole="link"
              onPress={() => abrirUrl(urlGoogleMaps(sugerencia))}
              style={styles.link}
            >
              <FontAwesome6 name="map-location-dot" size={12} color={colors.primary} />
              <Text style={styles.linkTexto}>Ver en Google Maps</Text>
            </Pressable>
            {sitioWeb ? (
              <Pressable accessibilityRole="link" onPress={() => abrirUrl(sitioWeb)} style={styles.link}>
                <FontAwesome6 name="globe" size={12} color={colors.primary} />
                <Text style={styles.linkTexto}>Sitio web</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const MINIATURA = 60;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.xs,
  },
  cardSeleccionada: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  cardBloqueada: {
    opacity: 0.45,
  },
  presionada: {
    opacity: 0.85,
  },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  miniatura: {
    width: MINIATURA,
    height: MINIATURA,
    borderRadius: radii.xs,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  miniaturaImagen: {
    width: "100%",
    height: "100%",
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  infoArriba: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  horario: {
    ...textStyles.meta,
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  nombre: {
    ...textStyles.bodyStrong,
    fontSize: 14,
    color: colors.primary,
  },
  meta: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
  },
  pillTexto: {
    fontSize: 10,
  },
  pillVotacion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accentStrong,
    backgroundColor: colors.accentMuted,
  },
  pillVotacionTexto: {
    ...textStyles.meta,
    fontSize: 10,
    fontWeight: "700",
    color: colors.primary,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  checkActivo: {
    backgroundColor: colors.primary,
  },
  detalle: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  fotoGrande: {
    width: "100%",
    height: 160,
    borderRadius: radii.xs,
    backgroundColor: colors.surfaceAlt,
  },
  descripcion: {
    ...textStyles.meta,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  detalleFila: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  detalleTexto: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
  },
  motivo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.xs,
    backgroundColor: colors.surfaceMuted,
  },
  motivoTexto: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  links: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  linkTexto: {
    ...textStyles.bodyStrong,
    fontSize: 13,
    color: colors.primary,
  },
});