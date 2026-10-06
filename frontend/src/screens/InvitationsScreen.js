import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import PrimaryButton from "../components/ui/PrimaryButton";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getPendingInvitations,
  respondToInvitation,
  getNotificationsSocketUrl,
} from "../services/api";
import { colors, spacing, surfaces, textStyles, radii } from "../theme/tokens";

import { appAlert } from "../components/ui/AppDialog";

const COLOR_SOFT = colors.primarySoft ? `${colors.primarySoft}33` : "#eef2ff";

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Resumen para el encabezado: lo que requiere acción primero, y "al día" si no hay nada pendiente.
function buildSummary(invitationsCount, unreadCount) {
  const parts = [];
  if (invitationsCount > 0) {
    parts.push(
      `${invitationsCount} ${invitationsCount === 1 ? "invitación pendiente" : "invitaciones pendientes"}`
    );
  }
  if (unreadCount > 0) {
    parts.push(`${unreadCount} sin leer`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Estás al día";
}

function SectionHeader({ icon, title, count, action }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <FontAwesome6 name={icon} size={11} color={colors.primary} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCount}>
        <Text style={styles.sectionCountText}>{count}</Text>
      </View>
      <View style={styles.flex} />
      {action}
    </View>
  );
}

export default function InvitationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // `silent` evita el spinner de pantalla completa: se usa al refrescar, al llegar una
  // notificación en vivo y después de responder una invitación, para que la lista no parpadee.
  const loadData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const [invitacionesData, notificacionesData] = await Promise.all([
        getPendingInvitations().catch(() => []),
        getNotifications().catch(() => []),
      ]);

      const formattedInvitations = invitacionesData.map((item) => ({
        ...item,
        isInvitation: true,
        idUnico: `inv-${item.tripId || item.IdViaje}`,
        fechaCreacion: item.fechaCreacion || null,
      }));

      const formattedNotifications = notificacionesData.map((item) => ({
        ...item,
        isInvitation: false,
        idUnico: `notif-${item.id}`,
      }));

      setNotifications([...formattedInvitations, ...formattedNotifications]);
    } catch (error) {
      appAlert("Error", error.message || "No se pudieron cargar las notificaciones");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let ws = null;
    let cancelado = false;

    async function conectarSocketUsuario() {
      try {
        const socketUrl = await getNotificationsSocketUrl();
        if (cancelado) return;

        ws = new WebSocket(socketUrl);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.tipo === "nueva_notificacion") {
              loadData({ silent: true });
            }
          } catch (e) {
            console.error("Error al parsear mensaje de notificación", e);
          }
        };

        ws.onerror = (error) => {
          console.log("Error en el WebSocket de notificaciones:", error);
        };
      } catch (err) {
        console.log("Error conectando WS de notificaciones:", err);
      }
    }

    conectarSocketUsuario();

    return () => {
      cancelado = true;
      if (ws) {
        ws.close();
      }
    };
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData({ silent: true });
  };

  const handleResponse = async (idViaje, decision) => {
    if (submitting) return;

    try {
      setSubmitting(true);
      const result = await respondToInvitation(idViaje, decision);
      appAlert("Éxito", result.message || "Invitación procesada correctamente.");
      await loadData({ silent: true });
    } catch (error) {
      appAlert("Atención", error.message || "Ocurrió un error al procesar la invitación.");
      // Si la invitación fue cancelada mientras tanto, se recarga para que desaparezca.
      await loadData({ silent: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, leida: true } : n))
      );
    } catch (error) {
      appAlert("Error", error.message || "No se pudo marcar la notificación como leída.");
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, leida: true })));
    } catch (error) {
      appAlert("Error", error.message || "No se pudieron marcar las notificaciones.");
    }
  };

  const handleBack = () => {
    if (typeof navigation.canGoBack !== "function" || navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate("Tabs", { screen: "Inicio" });
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Cargando notificaciones...</Text>
        </View>
      </ScreenContainer>
    );
  }

  const invitations = notifications.filter((n) => n.isInvitation);
  const updates = notifications.filter((n) => !n.isInvitation);
  const unreadCount = updates.filter((n) => (n.leida ?? true) === false).length;

  function renderInvitation(item) {
    const idViaje = item.id || item.tripId || item.IdViaje || item.viajeId;
    const titulo = item.title || item.titulo || item.Titulo;
    const fecha = formatDate(item.fechaCreacion || item.FechaCreacion);
    const destinos = item.destinations || item.destination || item.Destinos || [];
    const destinoLabel = destinos.length
      ? destinos.map((d) => [d.name, d.country].filter(Boolean).join(", ")).join(" · ")
      : "Destino a confirmar";
    const rol = item.role || item.rol || "Participante";

    return (
      <View key={item.idUnico} style={[styles.card, styles.inviteCard]}>
        <View style={styles.cardTop}>
          <View style={[styles.iconCircle, styles.iconCircleInvite]}>
            <FontAwesome6 name="suitcase-rolling" size={14} color={colors.textInverse} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.inviteTag}>Te invitaron a un viaje</Text>
            <Text style={styles.cardTitle} numberOfLines={2}>{titulo}</Text>
            {fecha ? <Text style={styles.cardDate}>{fecha}</Text> : null}
          </View>
        </View>

        <View style={styles.infoBlock}>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <FontAwesome6 name="location-dot" size={12} color={colors.primary} />
            </View>
            <Text style={styles.infoText}>Destino: {destinoLabel}</Text>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <FontAwesome6 name="user-tag" size={11} color={colors.primary} />
            </View>
            <Text style={styles.infoText}>Rol propuesto: {rol}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label="Rechazar"
            onPress={() => handleResponse(idViaje, "rechazar")}
            disabled={submitting}
            variant="secondary"
            style={styles.secondaryAction}
          />
          <PrimaryButton
            label="Unirme"
            onPress={() => handleResponse(idViaje, "aceptar")}
            disabled={submitting}
            style={styles.primaryAction}
          />
        </View>
      </View>
    );
  }

  function renderUpdate(item) {
    const titulo = item.title || item.titulo || item.Titulo;
    const fecha = formatDate(item.fechaCreacion || item.FechaCreacion);
    const leida = item.leida ?? true;
    const mensajeNotificacion = item.mensaje || item.Mensaje || "";

    return (
      <View key={item.idUnico} style={[styles.noteCard, !leida ? styles.noteCardUnread : styles.noteCardRead]}>
        <View style={[styles.noteIcon, !leida ? styles.noteIconUnread : styles.noteIconRead]}>
          <FontAwesome6 name="bell" size={13} color={!leida ? colors.textInverse : colors.primary} />
        </View>

        <View style={styles.flex}>
          <View style={styles.noteTitleRow}>
            <Text style={[styles.noteTitle, leida && styles.noteTitleRead]} numberOfLines={1}>
              {titulo}
            </Text>
            {!leida ? <View style={styles.unreadDot} /> : null}
          </View>

          {mensajeNotificacion ? <Text style={styles.noteMessage}>{mensajeNotificacion}</Text> : null}

          <View style={styles.noteFooter}>
            <Text style={styles.noteDate}>{fecha}</Text>
            {!leida ? (
              <Pressable
                onPress={() => handleMarkAsRead(item.id)}
                hitSlop={8}
                style={({ pressed }) => [styles.markAsReadButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Marcar como leída"
              >
                <FontAwesome6 name="check" size={11} color={colors.primary} />
                <Text style={styles.markAsReadText}>Marcar como leída</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <IconCircleButton
              icon="arrow-left"
              onPress={handleBack}
              tone="light"
              testID="invitations-back-button"
              accessibilityLabel="Volver"
              hitSlop={10}
              style={styles.backButton}
            />
            <View style={styles.headerTitleWrap} pointerEvents="none">
              <Text style={styles.title}>Notificaciones</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.summary}>{buildSummary(invitations.length, unreadCount)}</Text>

          {notifications.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <FontAwesome6 name="bell-slash" size={26} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No tenés notificaciones pendientes.</Text>
              <Text style={styles.emptyCopy}>Cuando haya novedades o te sumen a un viaje, aparecerán aquí.</Text>
            </View>
          ) : (
            <>
              {invitations.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader icon="envelope-open-text" title="Invitaciones pendientes" count={invitations.length} />
                  {invitations.map(renderInvitation)}
                </View>
              ) : null}

              {updates.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader
                    icon="bell"
                    title="Novedades"
                    count={updates.length}
                    action={
                      unreadCount > 0 ? (
                        <Pressable
                          onPress={handleMarkAllAsRead}
                          hitSlop={8}
                          style={({ pressed }) => [styles.markAllButton, pressed && styles.pressed]}
                          accessibilityRole="button"
                        >
                          <FontAwesome6 name="check-double" size={11} color={colors.primary} />
                          <Text style={styles.markAllText}>Marcar todas como leídas</Text>
                        </Pressable>
                      ) : null
                    }
                  />
                  {updates.map(renderUpdate)}
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  loadingText: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  backButton: {
    zIndex: 1,
    elevation: 1,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 20,
  },
  summary: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  body: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  markAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: COLOR_SOFT,
  },
  markAllText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
    fontSize: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 28,
  },
  sectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  sectionTitle: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.primary,
    fontSize: 15,
  },
  sectionCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  sectionCountText: {
    ...textStyles.meta,
    color: colors.textInverse,
    fontWeight: "700",
    fontSize: 11,
  },
  emptyCard: {
    ...surfaces.card,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
    textAlign: "center",
  },
  emptyCopy: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  card: {
    ...surfaces.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  inviteCard: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleInvite: {
    backgroundColor: colors.primary,
  },
  inviteTag: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
    marginBottom: 1,
  },
  cardTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 17,
  },
  cardDate: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  infoBlock: {
    gap: 6,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: COLOR_SOFT,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  infoText: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontSize: 14,
    flex: 1,
  },
  markAsReadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  markAsReadText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 2,
  },
  primaryAction: {
    flex: 1,
  },
  secondaryAction: {
    flex: 1,
  },
  noteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  noteCardUnread: {
    borderColor: colors.primary,
    backgroundColor: colors.surface || "#eef2ff",
  },
  noteCardRead: {
    opacity: 1,
  },
  noteIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  noteIconUnread: {
    backgroundColor: colors.primary,
  },
  noteIconRead: {
    backgroundColor: colors.surfaceMuted || "#eef0f3",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  noteTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  noteTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 14,
    flexShrink: 1,
  },
  noteTitleRead: {
    color: colors.textPrimary,
    fontWeight: "500",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  noteMessage: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  noteFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 6,
    minHeight: 18,
  },
  noteDate: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 11,
  },
  headerTitleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});