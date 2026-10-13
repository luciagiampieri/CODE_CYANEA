import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import StatusPill from "../ui/StatusPill";
import { getActivitySuggestionPhotoSource } from "../../services/api";
import { formatMoney } from "../../utils/money";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";


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

function SuggestionPhoto({ sugerencia }) {
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

  if (!sugerencia.TieneFoto) return null;

  return (
    <View style={styles.photoWrap}>
      {source ? (
        <Image
          accessibilityLabel={`Foto de ${sugerencia.LugarNombre}`}
          source={source}
          style={styles.photo}
          resizeMode="cover"
          onError={() => setSource(null)}
        />
      ) : null}
    </View>
  );
}


export default function ActivitySuggestionCard({ sugerencia }) {
  const costo = Number(sugerencia.CostoEstimadoARS ?? 0);
  const sitioWeb = /^https?:\/\//i.test(sugerencia.SitioWebUrl || "") ? sugerencia.SitioWebUrl : null;

  return (
    <View style={styles.card} testID={`suggestion-${sugerencia.IdSugerenciaActividad}`}>
      <SuggestionPhoto sugerencia={sugerencia} />

      <View style={styles.headerRow}>
        <View style={styles.timePill}>
          <FontAwesome6 name="clock" size={11} color={colors.primary} />
          <Text style={styles.timeText}>
            {sugerencia.HoraInicio} – {sugerencia.HoraFin}
          </Text>
        </View>
        <StatusPill tone="pendiente" textStyle={styles.pillText}>
          Pendiente
        </StatusPill>
      </View>

      <Text style={styles.title}>{sugerencia.Nombre}</Text>
      <Text style={styles.description}>{sugerencia.Descripcion}</Text>

      <View style={styles.infoRow}>
        <FontAwesome6 name="location-dot" size={12} color={colors.primary} style={styles.infoIcon} />
        <View style={styles.infoTexts}>
          <Text style={styles.placeName}>{sugerencia.LugarNombre}</Text>
          <Text style={styles.placeAddress}>{sugerencia.LugarDireccion}</Text>
        </View>
      </View>

      <View style={styles.infoRow}>
        <FontAwesome6 name="tag" size={12} color={colors.primary} style={styles.infoIcon} />
        <Text style={styles.costText}>
          {costo > 0
            ? `ARS $ ${Math.round(costo).toLocaleString("es-AR")} por persona (estimado)`
            : "Gratis"}
        </Text>
      </View>

      <View style={styles.reasonBox}>
        <FontAwesome6 name="wand-magic-sparkles" size={11} color={colors.primary} />
        <Text style={styles.reasonText}>{sugerencia.Motivo}</Text>
      </View>

      <View style={styles.linksRow}>
        <Pressable
          accessibilityRole="link"
          onPress={() => abrirUrl(urlGoogleMaps(sugerencia))}
          style={styles.linkButton}
          testID={`suggestion-maps-${sugerencia.IdSugerenciaActividad}`}
        >
          <FontAwesome6 name="map-location-dot" size={12} color={colors.primary} />
          <Text style={styles.linkText}>Ver en Google Maps</Text>
        </Pressable>

        {sitioWeb ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => abrirUrl(sitioWeb)}
            style={styles.linkButton}
            testID={`suggestion-web-${sugerencia.IdSugerenciaActividad}`}
          >
            <FontAwesome6 name="globe" size={12} color={colors.primary} />
            <Text style={styles.linkText}>Sitio web</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
    overflow: "hidden",
  },
  photoWrap: {
    height: 150,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
    marginBottom: spacing.xxs,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  timeText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
  pillText: {
    fontSize: 11,
  },
  title: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 16,
    marginTop: spacing.xxs,
  },
  description: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  infoIcon: {
    marginTop: 3,
    width: 14,
  },
  infoTexts: {
    flex: 1,
  },
  placeName: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    fontSize: 13,
  },
  placeAddress: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 12,
  },
  costText: {
    ...textStyles.meta,
    color: colors.textPrimary,
    flex: 1,
  },
  reasonBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  reasonText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    flex: 1,
  },
  linksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  linkText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
  },
});