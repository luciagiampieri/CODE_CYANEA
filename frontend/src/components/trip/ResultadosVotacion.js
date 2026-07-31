import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radii } from "../../theme/tokens";

export default function ResultadosVotacion({ resultados, mostrarGanador = true }) {
    if (!resultados) return null;

    const { Resultados, IdPropuestasGanadoras, Empate, TotalVotos, MisPropuestas = [] } = resultados;
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
});