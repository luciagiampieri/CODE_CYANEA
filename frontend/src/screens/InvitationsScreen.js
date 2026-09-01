import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
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
  getNotificationsSocketUrl
} from "../services/api";
import { colors, spacing, surfaces, textStyles, radii } from "../theme/tokens";

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

export default function InvitationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [invitacionesData, notificacionesData] = await Promise.all([
        getPendingInvitations().catch(() => []),
        getNotifications().catch(() => []),
      ]);

      const formattedInvitations = invitacionesData.map(item => ({
        ...item,
        isInvitation: true,
        idUnico: `inv-${item.tripId || item.IdViaje}`,
        fechaCreacion: item.fechaCreacion || null,
      }));

      const formattedNotifications = notificacionesData.map(item => ({
        ...item,
        isInvitation: false,
        idUnico: `notif-${item.id}`,
      }));

      setNotifications([...formattedInvitations, ...formattedNotifications]);
    } catch (error) {
      Alert.alert("Error", error.message || "No se pudieron cargar las notificaciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
              loadData();
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
  }, []);

  const handleResponse = async (idViaje, decision) => {
    if (submitting) return;

    try {
      setSubmitting(true);
      const result = await respondToInvitation(idViaje, decision);
      Alert.alert("Éxito", result.message || "Invitación procesada correctamente.");
      await loadData();
    } catch (error) {
      Alert.alert("Atención", error.message || "Ocurrió un error al procesar la invitación.");
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
      Alert.alert("Error", error.message || "No se pudo marcar la notificación como leída.");
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, leida: true }))
      );
    } catch (error) {
      Alert.alert("Error", error.message || "No se pudieron marcar las notificaciones.");
    }
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <IconCircleButton icon="arrow-left" onPress={() => navigation.goBack()} tone="light" />
          </View>
          <Text style={styles.eyebrow}>Centro de Actividad</Text>
          <Text style={styles.title}>Notificaciones e Invitaciones</Text>
          <Text style={styles.copy}>Revisá las invitaciones a nuevos viajes y avisos importantes de tus grupos.</Text>
        </View>

        <View style={styles.body}>
          {/* Botón general ubicado justo antes de listar las notificaciones */}
          {notifications.length > 0 && (
            <View style={styles.actionBar}>
              <Pressable onPress={handleMarkAllAsRead} style={styles.markAllButton}>
                <FontAwesome6 name="check-double" size={14} color={colors.primary} />
                <Text style={styles.markAllText}>Marcar todas como leídas</Text>
              </Pressable>
            </View>
          )}

          {notifications.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No tenés notificaciones pendientes.</Text>
              <Text style={styles.emptyCopy}>Cuando haya novedades o te sumen a un viaje, aparecerán aquí.</Text>
            </View>
          ) : (
            notifications.map((item) => {
              const isInvitation = item.isInvitation;
              const idViaje = item.id || item.tripId || item.IdViaje || item.viajeId;
              const titulo = item.title || item.titulo || item.Titulo;
              const fecha = formatDate(item.fechaCreacion || item.FechaCreacion);
              const destinos = item.destinations || item.destination || item.Destinos || [];
              const destinoLabel = destinos.length
                ? destinos.map((d) => [d.name, d.country].filter(Boolean).join(", ")).join(" · ")
                : "Destino a confirmar";
              const rol = item.role || item.rol || "Participante";
              const leida = item.leida ?? true;
              const mensajeNotificacion = item.mensaje || item.Mensaje || "";

              return (
                <View 
                  key={item.idUnico} 
                  style={[styles.card, !leida && styles.unreadCard]}
                >
                  <View style={styles.cardHeaderRow}>
                    {fecha ? <Text style={styles.cardDate}>{fecha}</Text> : null}
                    {!isInvitation && !leida && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.cardTitle}>{titulo}</Text>
                  
                  {isInvitation ? (
                    <>
                      <Text style={styles.cardMeta}>Destino: {destinoLabel}</Text>
                      <Text style={styles.cardMeta}>Rol propuesto: {rol}</Text>
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
                    </>
                  ) : (
                    <>
                      <Text style={styles.cardMeta}>{mensajeNotificacion}</Text>
                      {!leida && (
                        <Pressable 
                          onPress={() => handleMarkAsRead(item.id)}
                          style={styles.markAsReadButton}
                        >
                          <FontAwesome6 name="check" size={12} color={colors.primary} />
                          <Text style={styles.markAsReadText}>Marcar como leída</Text>
                        </Pressable>
                      )}
                    </>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: "left",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "left",
  },
  actionBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: spacing.xs,
  },
  markAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  markAllText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
  },
  eyebrow: {
    ...textStyles.meta,
    color: "#dbe6fb",
    marginTop: spacing.lg,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 26,
    marginTop: spacing.xs,
    textAlign: "left",
  },
  copy: {
    ...textStyles.body,
    color: "rgba(255,255,255,0.8)",
    marginTop: spacing.xs,
    textAlign: "left",
  },
  body: {
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyCard: {
    ...surfaces.card,
    padding: spacing.xl,
  },
  emptyTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
  },
  emptyCopy: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  card: {
    ...surfaces.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    backgroundColor: colors.surfaceAlt || "#f8fafc",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  cardDate: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 12,
  },
  cardTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  cardMeta: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  markAsReadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.md,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  markAsReadText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  primaryAction: {
    flex: 1,
  },
  secondaryAction: {
    flex: 1,
  },
});