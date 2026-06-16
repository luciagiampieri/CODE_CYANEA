import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

export default function RegistrationSuccessScreen({ navigation, route }) {
    const { email } = route.params;

    return (
        <View style={styles.container}>
        <View style={styles.card}>
            <Text style={styles.emoji}>📧</Text>
            <Text style={styles.title}>¡Revisa tu correo electrónico!</Text>
            <Text style={styles.text}>
                Te enviamos un enlace de confirmación a:
            </Text>
            <Text style={styles.email}>{email}</Text>
            <Text style={styles.subtext}>
                Hacé clic en el enlace del correo para activar tu cuenta.{'\n'}
                El enlace expirará en 24 horas.
            </Text>
            <TouchableOpacity
                style={styles.btn}
                onPress={() => navigation.replace("Login")}
                activeOpacity={0.8}
            >
            <Text style={styles.btnText}>Ir al Inicio de Sesión</Text>
            </TouchableOpacity>
        </View>
    </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f0f4f8",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
    },
    card: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 36,
        alignItems: "center",
        width: "100%",
        maxWidth: 400,
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
    },
    emoji: { fontSize: 56, marginBottom: 16 },
    title: {
        fontSize: 22,
        fontWeight: "700",
        color: "#1e3e7b",
        textAlign: "center",
        marginBottom: 12,
    },
    text: {
        fontSize: 14,
        color: "#666",
        textAlign: "center",
        marginBottom: 6,
    },
    email: {
        fontSize: 15,
        fontWeight: "700",
        color: "#1e3e7b",
        textAlign: "center",
        marginBottom: 16,
    },
    subtext: {
        fontSize: 13,
        color: "#999",
        textAlign: "center",
        lineHeight: 20,
        marginBottom: 32,
    },
    btn: {
        backgroundColor: "#1e3e7b",
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 36,
        alignItems: "center",
        elevation: 4,
    },
    btnText: { color: "#ffec80", fontSize: 15, fontWeight: "700" },
});