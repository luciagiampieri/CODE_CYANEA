import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { getPendingInvitations, respondToInvitation } from "../services/api";
import ScreenContainer from "../components/layout/ScreenContainer";
import PrimaryButton from "../components/ui/PrimaryButton";
import { colors } from "../theme/tokens";

export default function InvitationsScreen() {
    const [invitations, setInvitations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const loadInvitations = async () => {
        try {
            setLoading(true);
            const data = await getPendingInvitations();
            setInvitations(data);
        } catch (error) {
            Alert.alert("Error", error.message || "No se pudieron cargar las invitaciones.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadInvitations();
    }, []);

    const handleResponse = async (idViaje, decision) => {
        if (submitting) return;

        try {
            setSubmitting(true);
            const result = await respondToInvitation(idViaje, decision);
        
            Alert.alert("Éxito", result.message || `Invitación procesada correctamente.`);
            await loadInvitations();
        } catch (error) {
            Alert.alert("Atención", error.message || "Ocurrió un error al procesar la invitación.");
            loadInvitations();
        } finally {
            setSubmitting(false);
        }
    };

    const renderItem = ({ item }) => {
        const idViaje = item.id || item.tripId || item.IdViaje;
        const titulo = item.title || item.titulo || item.Titulo;
        const destino = item.destination || item.destino || item.Destino;
        const rol = item.role || item.rol || "Participante";

        return (
            <View style={styles.card}>
                <View style={styles.infoContainer}>
                    <Text style={styles.title}>{titulo}</Text>
                    <Text style={styles.destination}>📍 Destino: {destino}</Text>
                    <Text style={styles.role}>Rol propuesto: {rol}</Text>
                </View>
                <View style={styles.actionsContainer}>
                    <View style={styles.buttonWrapper}>
                        <PrimaryButton
                            label="Rechazar"
                            onPress={() => handleResponse(idViaje, "rechazar")}
                            disabled={submitting}
                            style={styles.rejectButton}
                            textStyle={styles.rejectText} 
                        />
                    </View>
                    <View style={styles.buttonWrapper}>
                        <PrimaryButton
                            label="Unirme"
                            onPress={() => handleResponse(idViaje, "aceptar")}
                            disabled={submitting}
                        />
                    </View>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <ScreenContainer>
            <Text style={styles.header}>Mis Invitaciones Pendientes</Text>
            {invitations.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No tenés invitaciones de viaje pendientes 🐙</Text>
                </View>
            ) : (
                <FlatList
                    data={invitations}
                    keyExtractor={(item) => (item.id || item.tripId || item.IdViaje || Math.random()).toString()}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                />
            )}
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { fontSize: 22, fontWeight: "bold", marginVertical: 15, color: "#222" },
    list: { paddingBottom: 20 },
    card: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: "#eceff1",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
    },
    infoContainer: { marginBottom: 16 },
    title: { fontSize: 18, fontWeight: "800", color: "#1a202c" },
    destination: { fontSize: 14, color: "#4a5568", marginTop: 6 },
    role: { fontSize: 13, color: "#718096", marginTop: 4, fontStyle: "italic" },
    actionsContainer: { 
        flexDirection: "row", 
        justifyContent: "space-between", 
        gap: 12 
    },
    buttonWrapper: {
        flex: 1
    },
    rejectButton: { 
        backgroundColor: "#e2e8f0", 
    },
    rejectText: {
        color: "#4a5568", 
        fontWeight: "bold"
    }
});