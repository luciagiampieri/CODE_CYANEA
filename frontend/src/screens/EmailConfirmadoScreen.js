import { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
} from "react-native";

const MENSAJES = {
    ok: {
        emoji: "🎉",
        titulo: "¡Cuenta confirmada!",
        texto: "Tu correo fue verificado exitosamente. Ya podés iniciar sesión en Cyanea.",
    },
    "ya-confirmado": {
        emoji: "✅",
        titulo: "Ya confirmada",
        texto: "Tu cuenta ya fue confirmada anteriormente. Podés iniciar sesión.",
    },
    error: {
        emoji: "❌",
        titulo: "Enlace inválido",
        texto: "El enlace de confirmación es inválido o ya expiró. Volvé a registrarte.",
    },
};

export default function EmailConfirmadoScreen({ navigation, route }) {
    const [status, setStatus] = useState("cargando");

    useEffect(() => {
        const s = route?.params?.status;
        if (s === "ok" || s === "ya-confirmado" || s === "error") {
            setStatus(s);
        } else {
            setStatus("error");
        }
    }, [route]);

    if (status === "cargando") {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#1e3e7b" />
            </View>
        );
    }

    const info = MENSAJES[status];
    const isError = status === "error";

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.logo}>CYANEA</Text>
                <Text style={styles.tagline}>Muchas manos, un único destino</Text>

                <Text style={styles.emoji}>{info.emoji}</Text>
                <Text style={[styles.titulo, isError && styles.tituloError]}>
                    {info.titulo}
                </Text>
                <Text style={styles.texto}>{info.texto}</Text>

                {isError ? (
                    <TouchableOpacity
                        style={[styles.btn, styles.btnError]}
                        onPress={() => navigation.replace("Register")}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.btnText}>Volver al registro</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={styles.btn}
                        onPress={() => navigation.replace("Login")}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.btnText}>Ir al login</Text>
                    </TouchableOpacity>
                )}
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
    },
    logo: {
        fontSize: 24,
        fontWeight: "800",
        color: "#1e3e7b",
        letterSpacing: 1,
        marginBottom: 4,
    },
    tagline: {
        fontSize: 11,
        color: "#666",
        marginBottom: 28,
    },
    emoji: { fontSize: 52, marginBottom: 16 },
    titulo: {
        fontSize: 22,
        fontWeight: "700",
        color: "#1e3e7b",
        textAlign: "center",
        marginBottom: 12,
    },
    tituloError: { color: "#b3261e" },
    texto: {
        fontSize: 15,
        color: "#666",
        textAlign: "center",
        lineHeight: 22,
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
    btnError: { backgroundColor: "#b3261e" },
    btnText: { color: "#ffec80", fontSize: 15, fontWeight: "700" },
});