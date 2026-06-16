import { useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    Switch,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export default function RegisterScreen({ navigation }) {
    const [form, setForm] = useState({
        nombre: "",
        apellido: "",
        nombreUsuario: "",
        email: "",
        password: "",
        confirmarPassword: "",
        aceptaTerminos: false,
    });

    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    function setField(key, value) {
        setForm((prev) => ({ ...prev, [key]: value }));
        if (errors[key]) {
            setErrors((prev) => ({ ...prev, [key]: undefined }));
        }
    }

    function validate() {
        const e = {};

        if (!form.nombre.trim()) e.nombre = "El nombre es requerido.";
        if (!form.apellido.trim()) e.apellido = "El apellido es requerido.";

        if (!form.nombreUsuario.trim()) {
            e.nombreUsuario = "El nombre de usuario es requerido.";
        } else if (form.nombreUsuario.length < 3) {
            e.nombreUsuario = "Debe tener al menos 3 caracteres.";
        }

        if (!form.email.trim()) {
            e.email = "El correo es requerido.";
        } else if (!EMAIL_REGEX.test(form.email)) {
            e.email = "El correo no tiene un formato válido.";
        }

        if (!form.password) {
            e.password = "La contraseña es requerida.";
        } else if (!PASSWORD_REGEX.test(form.password)) {
            e.password =
                "Mínimo 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial.";
        }

        if (!form.confirmarPassword) {
            e.confirmarPassword = "Confirmá tu contraseña.";
        } else if (form.password !== form.confirmarPassword) {
            e.confirmarPassword = "Las contraseñas no coinciden.";
        }

        if (!form.aceptaTerminos) {
            e.aceptaTerminos = "Debés aceptar los Términos y Condiciones.";
        }

        setErrors(e);
        return Object.keys(e).length === 0;
    }

    async function handleSubmit() {
        if (!validate()) return;

        setLoading(true);
        setErrors({});

        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nombre: form.nombre.trim(),
                    apellido: form.apellido.trim(),
                    nombreUsuario: form.nombreUsuario.trim(),
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    aceptaTerminos: form.aceptaTerminos,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setErrors({ general: data.detail ?? "Error al registrarse." });
                return;
            }

            navigation.replace("RegistrationSuccess", { email: form.email });
            
        } catch {
            setErrors({ general: "No se pudo conectar con el servidor." });
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* contenedor "card" para centrar y achicar el formulario */}
                <View style={styles.card}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.logo}>CYANEA</Text>
                        <Text style={styles.tagline}>Muchas manos, un único destino</Text>
                        <Text style={styles.title}>Crear cuenta</Text>
                    </View>

                    {/* Error general */}
                    {errors.general && (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorBannerText}>{errors.general}</Text>
                        </View>
                    )}

                    {/* Nombre */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Nombre *</Text>
                        <TextInput
                            style={[styles.input, errors.nombre && styles.inputError]}
                            placeholder="Tu nombre"
                            placeholderTextColor="#aaa"
                            value={form.nombre}
                            onChangeText={(v) => setField("nombre", v)}
                            autoCapitalize="words"
                        />
                        {errors.nombre && <Text style={styles.errorText}>{errors.nombre}</Text>}
                    </View>

                    {/* Apellido */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Apellido *</Text>
                        <TextInput
                            style={[styles.input, errors.apellido && styles.inputError]}
                            placeholder="Tu apellido"
                            placeholderTextColor="#aaa"
                            value={form.apellido}
                            onChangeText={(v) => setField("apellido", v)}
                            autoCapitalize="words"
                        />
                        {errors.apellido && <Text style={styles.errorText}>{errors.apellido}</Text>}
                    </View>

                    {/* Nombre de usuario */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Nombre de usuario *</Text>
                        <TextInput
                            style={[styles.input, errors.nombreUsuario && styles.inputError]}
                            placeholder="@tunombre"
                            placeholderTextColor="#aaa"
                            value={form.nombreUsuario}
                            onChangeText={(v) => setField("nombreUsuario", v)}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {errors.nombreUsuario && (
                            <Text style={styles.errorText}>{errors.nombreUsuario}</Text>
                        )}
                    </View>

                    {/* Email */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Correo electrónico *</Text>
                        <TextInput
                            style={[styles.input, errors.email && styles.inputError]}
                            placeholder="tu@correo.com"
                            placeholderTextColor="#aaa"
                            value={form.email}
                            onChangeText={(v) => setField("email", v)}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
                    </View>

                    {/* Contraseña */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Contraseña *</Text>
                        <View style={styles.passwordRow}>
                            <TextInput
                                style={[
                                    styles.input,
                                    styles.inputFlex,
                                    errors.password && styles.inputError,
                                ]}
                                placeholder="Mínimo 8 caracteres"
                                placeholderTextColor="#aaa"
                                value={form.password}
                                onChangeText={(v) => setField("password", v)}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                            />
                            <TouchableOpacity
                                style={styles.eyeBtn}
                                onPress={() => setShowPassword((v) => !v)}
                            >
                                <FontAwesome6
                                    name={showPassword ? "eye-slash" : "eye"}
                                    size={13}
                                    color="#666"
                                />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.hint}>
                            Debe contener mayúscula, minúscula, número y carácter especial.
                        </Text>
                        {errors.password && (
                            <Text style={styles.errorText}>{errors.password}</Text>
                        )}
                    </View>

                    {/* Confirmar contraseña */}
                    <View style={styles.field}>
                        <Text style={styles.label}>Confirmar contraseña *</Text>
                        <View style={styles.passwordRow}>
                            <TextInput
                                style={[
                                    styles.input,
                                    styles.inputFlex,
                                    errors.confirmarPassword && styles.inputError,
                                ]}
                                placeholder="Repetí tu contraseña"
                                placeholderTextColor="#aaa"
                                value={form.confirmarPassword}
                                onChangeText={(v) => setField("confirmarPassword", v)}
                                secureTextEntry={!showConfirm}
                                autoCapitalize="none"
                            />
                            <TouchableOpacity
                                style={styles.eyeBtn}
                                onPress={() => setShowConfirm((v) => !v)}
                            >
                                <FontAwesome6
                                    name={showConfirm ? "eye-slash" : "eye"}
                                    size={13}
                                    color="#666"
                                />
                            </TouchableOpacity>
                        </View>
                        {errors.confirmarPassword && (
                            <Text style={styles.errorText}>{errors.confirmarPassword}</Text>
                        )}
                    </View>

                    {/* Términos */}
                    <View style={styles.termsRow}>
                        <Switch
                            value={form.aceptaTerminos}
                            onValueChange={(v) => setField("aceptaTerminos", v)}
                            trackColor={{ true: "#1e3e7b", false: "#ccc" }}
                            thumbColor={form.aceptaTerminos ? "#ffec80" : "#fff"}
                        />
                        <Text style={styles.termsText}>
                            Acepto los{" "}
                            <Text style={styles.termsLink}>Términos y Condiciones</Text>
                        </Text>
                    </View>
                    {errors.aceptaTerminos && (
                        <Text style={styles.errorText}>{errors.aceptaTerminos}</Text>
                    )}

                    {/* Botón */}
                    <TouchableOpacity
                        style={[styles.btn, loading && styles.btnDisabled]}
                        onPress={handleSubmit}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        {loading ? (
                            <ActivityIndicator color="#ffec80" />
                        ) : (
                            <Text style={styles.btnText}>Crear cuenta</Text>
                        )}
                    </TouchableOpacity>

                    {/* Link al login */}
                    <View style={styles.loginRow}>
                        <Text style={styles.loginText}>¿Ya tenés cuenta? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate("Login")}>
                            <Text style={styles.loginLink}>Iniciá sesión</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const C = {
    dark: "#1e3e7b",
    yellow: "#ffec80",
    error: "#b3261e",
    muted: "#666",
    border: "#d0d7e8",
    bg: "#f0f4f8",
};

const styles = StyleSheet.create({
    scrollContent: {
        flexGrow: 1,
        backgroundColor: C.bg,
        alignItems: "center", 
        justifyContent: "center", 
        padding: 24,
        paddingTop: 10,
        paddingBottom: 48,
    },
    card: {
        backgroundColor: "#fff",
        width: "100%",
        maxWidth: 550, 
        padding: 22,
        borderRadius: 16,
        elevation: 4, 
        shadowColor: "#000", 
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
    },
    header: {
        alignItems: "center",
        marginBottom: 8,
    },
    logo: {
        fontSize: 40,
        fontWeight: "800",
        color: C.dark,
        letterSpacing: 1,
    },
    tagline: {
        fontSize: 12,
        color: C.muted,
        marginBottom: 12,
    },
    title: {
        fontSize: 22,
        fontWeight: "700",
        color: C.dark,
    },
    errorBanner: {
        backgroundColor: "#fdecea",
        borderColor: C.error,
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
    },
    errorBannerText: {
        color: C.error,
        fontSize: 14,
        textAlign: "center",
    },
    field: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: "600",
        color: C.dark,
        marginBottom: 6,
    },
    input: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: "#222",
    },
    inputError: {
        borderColor: C.error,
    },
    inputFlex: {
        flex: 1,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
    },
    passwordRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    eyeBtn: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderLeftWidth: 0,
        borderColor: C.border,
        borderTopRightRadius: 10,
        borderBottomRightRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    eyeText: {
        fontSize: 18,
    },
    hint: {
        fontSize: 11,
        color: C.muted,
        marginTop: 4,
    },
    errorText: {
        color: C.error,
        fontSize: 12,
        marginTop: 4,
    },
    termsRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
        gap: 10,
    },
    termsText: {
        flex: 1,
        fontSize: 14,
        color: C.muted,
    },
    termsLink: {
        color: C.dark,
        fontWeight: "700",
        textDecorationLine: "underline",
    },
    btn: {
        backgroundColor: C.dark,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: "center",
        marginTop: 8,
        elevation: 4,
    },
    btnDisabled: { opacity: 0.7 },
    btnText: {
        color: C.yellow,
        fontSize: 16,
        fontWeight: "700",
    },
    loginRow: {
        flexDirection: "row",
        justifyContent: "center",
        marginTop: 20,
    },
    loginText: { color: C.muted, fontSize: 14 },
    loginLink: { color: C.dark, fontSize: 14, fontWeight: "700" },
});