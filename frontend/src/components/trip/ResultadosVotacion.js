import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";


function formatFechaVoto(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("es-AR", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}


export default function ResultadosVotacion({ resultados, mostrarGanador = true }) {
    const [detalleVisible, setDetalleVisible] = useState(false);
    if (!resultados) return null;

    const { Resultados, IdPropuestasGanadoras, Empate, TotalVotos, TotalVotantes, MisPropuestas = [] } = resultados;
    const ganadoras = mostrarGanador ? IdPropuestasGanadoras : [];

    if (TotalVotos === 0) {
        return (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {mostrarGanador
                    ? "Esta votación finalizó sin votos registrados."
                    : "Todavía nadie votó en esta votación."}
            </Text>
        );
    }

    return (
        <View style={{ gap: 10 }}>
            {mostrarGanador && Empate && (
                <Text style={{ color: colors.warning || "#b45309", fontWeight: "700", fontSize: 13 }}>
                    ⚖️ Hubo un empate entre {IdPropuestasGanadoras.length} propuestas.
                </Text>
            )}
            {Resultados.map((r) => {
                const esGanadora = ganadoras.includes(r.IdPropuesta);
                const esMiVoto = MisPropuestas.includes(r.IdPropuesta);
                const colorAcento = esGanadora ? colors.primary : esMiVoto ? "#FFEC80" : colors.border;
                return (
                    <View
                        key={r.IdPropuesta}
                        style={[
                            styles.pill,
                            {
                                borderColor: colorAcento,
                                borderWidth: esGanadora || esMiVoto ? 2 : 1,
                            },
                        ]}
                    >
                        <View
                            style={[
                                styles.fill,
                                {
                                    width: `${r.Porcentaje}%`,
                                    backgroundColor: esGanadora
                                        ? "rgba(37, 99, 235, 0.16)"
                                        : esMiVoto
                                        ? "rgba(255, 236, 128, 0.22)"
                                        : "rgba(100, 116, 139, 0.12)",
                                },
                            ]}
                        />
                        <View style={styles.content}>
                            <Text style={{ color: colors.textPrimary, fontWeight: esGanadora ? "800" : "500" }}>
                                {esGanadora ? "🏆 " : ""}
                                {r.Texto}
                            </Text>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                {esMiVoto && (
                                    <Text style={{ color: "#1E3E7B", fontWeight: "700", fontSize: 12 }}>
                                        ✓ Tu voto
                                    </Text>
                                )}
                                <Text style={{ color: colors.textSecondary, fontWeight: "700", fontSize: 13 }}>
                                    {r.Votos} · {r.Porcentaje}%
                                </Text>
                            </View>
                        </View>
                    </View>
                );
            })}

            <Pressable
                onPress={() => setDetalleVisible(true)}
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 8,
                }}
            >
                <FontAwesome6 name="eye" size={12} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>
                    Ver votos
                </Text>
            </Pressable>

            {detalleVisible && (
                <Modal
                    animationType="slide"
                    transparent
                    visible
                    onRequestClose={() => setDetalleVisible(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.modalTitle}>Detalles de la votación</Text>
                                    <Text style={styles.modalSubtitle}>
                                        {TotalVotantes} {TotalVotantes === 1 ? "persona votó" : "personas votaron"}
                                    </Text>
                                </View>
                                <Pressable onPress={() => setDetalleVisible(false)} hitSlop={8}>
                                    <FontAwesome6 name="xmark" size={18} color={colors.textSecondary} />
                                </Pressable>
                            </View>

                            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                                {Resultados.map((r) => (
                                    <View key={r.IdPropuesta} style={styles.opcionBloque}>
                                        <View style={styles.opcionHeaderRow}>
                                            <Text style={styles.opcionTitulo}>{r.Texto}</Text>
                                            <View style={styles.opcionVotosBadge}>
                                                <Text style={styles.opcionVotosBadgeText}>
                                                    {r.Votos} {r.Votos === 1 ? "voto" : "votos"}
                                                </Text>
                                            </View>
                                        </View>
 
                                        {r.Votantes && r.Votantes.length > 0 ? (
                                            r.Votantes.map((votante) => (
                                                <View key={votante.IdUsuario} style={styles.votanteRow}>
                                                    <View style={styles.votanteAvatar}>
                                                        <Text style={styles.votanteAvatarText}>
                                                            {votante.NombreCompleto?.charAt(0)?.toUpperCase() || "?"}
                                                        </Text>
                                                    </View>
                                                    <Text style={styles.votanteNombre}>{votante.NombreCompleto}</Text>
                                                    <Text style={styles.votanteFecha}>
                                                        {formatFechaVoto(votante.FechaVoto)}
                                                    </Text>
                                                </View>
                                            ))
                                        ) : (
                                            <Text style={styles.sinVotos}>Nadie votó esta opción.</Text>
                                        )}
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}

        </View>
    );
}

const styles = StyleSheet.create({
    pill: {
        position: "relative",
        overflow: "hidden",
        borderWidth: 1,
        borderRadius: radii.md,
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    fill: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
    },
    content: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    modalOverlay: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(9, 19, 45, 0.5)",
    },
    modalCard: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radii.xl,
        borderTopRightRadius: radii.xl,
        padding: spacing.lg,
        maxHeight: "80%",
    },
    modalHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: spacing.md,
    },
    modalTitle: {
        ...textStyles.bodyStrong,
        color: colors.primary,
        fontSize: 18,
    },
    modalSubtitle: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginTop: 2,
    },
    opcionBloque: {
        marginBottom: spacing.lg,
    },
    opcionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.sm,
    },
    opcionTitulo: {
        ...textStyles.bodyStrong,
        color: colors.textPrimary,
        fontSize: 15,
        flex: 1,
        marginRight: spacing.sm,
    },
    opcionVotosBadge: {
        backgroundColor: colors.successSurface || "#dcf3dd",
        borderRadius: radii.pill ?? 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    opcionVotosBadgeText: {
        fontSize: 12,
        fontWeight: "700",
        color: colors.success,
    },
    votanteRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
    },
    votanteAvatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
        marginRight: spacing.sm,
    },
    votanteAvatarText: {
        fontSize: 12,
        fontWeight: "700",
        color: colors.primary,
    },
    votanteNombre: {
        flex: 1,
        color: colors.textPrimary,
        fontSize: 13,
        fontWeight: "600",
    },
    votanteFecha: {
        color: colors.textMuted,
        fontSize: 11,
    },
    sinVotos: {
        color: colors.textMuted,
        fontSize: 12,
        fontStyle: "italic",
        marginLeft: 38,
    },
});