import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { getPendingInvitations, respondToInvitation } from "../services/api";
import ScreenContainer from "../components/layout/ScreenContainer";
import PrimaryButton from "../components/ui/PrimaryButton";
import { colors, radii, spacing, typography } from "../theme/tokens";

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

    const handleResponse = async (tripId, decision) => {
        if (submitting) return; // Bloquea clics duplicados antes de que finalice el proceso

    try {
        setSubmitting(true);
        const result = await respondToInvitation(tripId, decision);
    
        Alert.alert("Éxito", result.message || `Invitación procesada correctamente.`);
    
      // Volver a cargar la lista remueve la invitación de la UI e impide re-acciones
        await loadInvitations();
    } catch (error) {
      // Captura el error 400 del backend ("Esta invitación ya fue respondida previamente.")
        Alert.alert("Atención", error.message);
      // Recargamos por las dudas de que el estado local haya quedado desactualizado
        loadInvitations();
    } finally {
        setSubmitting(false);
        }
    };

    const renderItem = ({ item }) => (
        <View style={styles.card}>
            <View style={styles.infoContainer}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.destination}>📍 Destino: {item.destination}</Text>
                    <Text style={styles.role}>Rol propuesto: {item.role}</Text>
            </View>
        <View style={styles.actionsContainer}>
        <PrimaryButton
            title="Rechazar"
            onPress={() => handleResponse(item.tripId, "rechazar")}
            disabled={submitting}
            style={styles.rejectButton}
            textStyle={styles.rejectText}
        />
        <PrimaryButton
            title="Aceptar"
            onPress={() => handleResponse(item.tripId, "aceptar")}
            disabled={submitting}
            style={styles.acceptButton}
        />
        </View>
    </View>
    );

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
            keyExtractor={(item) => item.tripId.toString()}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
        />
        )}
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { fontSize: 22, fontWeight: "bold", marginVertical: 15, color: "#333" },
    list: { paddingBottom: 20 },
    card: {
        backgroundColor: "#fff",
        borderRadius: 10,
        padding: 15,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#e0e0e0",
    },
    infoContainer: { marginBottom: 15 },
    title: { fontSize: 18, fontWeight: "bold", color: "#111" },
    destination: { fontSize: 14, color: "#666", marginTop: 4 },
    role: { fontSize: 12, color: "#999", marginTop: 2, fontStyle: "italic" },
    actionsContainer: { flexDirection: "row", justifyContent: "space-between" },
    acceptButton: { flex: 1, marginLeft: 8, backgroundColor: "#4CAF50" },
    rejectButton: { flex: 1, marginRight: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#F44336" },
    rejectText: { color: "#F44336" },
    emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", marginTop: 40 },
    emptyText: { fontSize: 16, color: "#777", textAlign: "center" }
    });