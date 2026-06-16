import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Switch,
    Platform,
    Modal,
    FlatList,
} from "react-native";

import DateTimePicker from "@react-native-community/datetimepicker";
import { FontAwesome6 } from "@expo/vector-icons";

import {
    getExpenseCategories,
    getTripParticipants,
    createExpense,
} from "../services/api";

import {
    colors,
    radii,
    spacing,
    shadows,
} from "../theme/tokens";

import { guardarGastoOffline } from "../database/gastosLocal";
import NetInfo from "@react-native-community/netinfo";

export default function AddGastoScreen({ route, navigation }) {

    const { IdViaje } = route.params;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [categorias, setCategorias] = useState([]);
    const [participantes, setParticipantes] = useState([]);

    const [nombre, setNombre] = useState("");
    const [monto, setMonto] = useState("");

    const [idCategoria, setIdCategoria] = useState(null);
    const [idPagador, setIdPagador] = useState(null);

    // Estados para controlar la visibilidad de los menús desplegables modales
    const [modalCategoriaVisible, setModalCategoriaVisible] = useState(false);
    const [modalPagadorVisible, setModalPagadorVisible] = useState(false);
    const [modalParticipantesVisible, setModalParticipantesVisible] = useState(false); // Nuevo modal desplegable

    // CONTROL DE DIVISIÓN DE GASTOS
    const [dividirEntreTodos, setDividirEntreTodos] = useState(true);
    const [idsParticipantesSeleccionados, setIdsParticipantesSeleccionados] = useState([]);

    const [fecha, setFecha] = useState(new Date());
    const [mostrarFecha, setMostrarFecha] = useState(false);

    const [errores, setErrores] = useState({});

    useEffect(() => {
        async function cargarDatos() {
            try {
                const [cats, parts] = await Promise.all([
                    getExpenseCategories(),
                    getTripParticipants(IdViaje),
                ]);

                setCategorias(cats);
                setParticipantes(parts);
            } catch (error) {
                Alert.alert("Error", error.message);
            } finally {
                setLoading(false);
            }
        }

        cargarDatos();
    }, [IdViaje]);

    function fechaFormato() {
        return fecha.toISOString().split("T")[0];
    }

    // Helpers para obtener el nombre del item seleccionado en los dropdowns
    const categoriaSeleccionada = categorias.find(c => c.IdCategoria === idCategoria);
    const pagadorSeleccionado = participantes.find(p => p.IdParticipanteViaje === idPagador);

    // Función para tildar / destildar un participante de la lista específica
    function toggleSeleccionParticipante(id) {
        if (idsParticipantesSeleccionados.includes(id)) {
            setIdsParticipantesSeleccionados(idsParticipantesSeleccionados.filter(item => item !== id));
        } else {
            setIdsParticipantesSeleccionados([...idsParticipantesSeleccionados, id]);
        }
    }

    async function handleGuardar() {
        let nuevosErrores = {};

        if (!nombre.trim()) {
            nuevosErrores.nombre = "El concepto es obligatorio";
        }

        if (!monto) {
            nuevosErrores.monto = "El monto es obligatorio";
        }
        else if (Number(monto) <= 0) {
            nuevosErrores.monto = "El monto debe ser mayor a cero";
        }

        if (!idCategoria) {
            nuevosErrores.categoria = "Seleccioná una categoría";
        }

        if (!idPagador) {
            nuevosErrores.pagador = "Seleccioná quién pagó";
        }

        if (!dividirEntreTodos && idsParticipantesSeleccionados.length === 0) {
            nuevosErrores.participantes = "Debes seleccionar al menos un participante";
        }

        setErrores(nuevosErrores); // <-- Uso correcto de la variable vinculada al estado

        if (Object.keys(nuevosErrores).length > 0) {
            return;
        }

        try {
            setSaving(true);

            const nuevoGasto = {
                IdViaje,
                Nombre: nombre,
                Monto: Number(monto),
                IdCategoria: idCategoria,
                IdPagador: idPagador,
                FechaGasto: fechaFormato(),
                DividirEntreTodos: dividirEntreTodos,
                IdParticipantes: dividirEntreTodos ? [] : idsParticipantesSeleccionados
            };

            try {
                await createExpense(nuevoGasto);

                Alert.alert(
                    "Éxito",
                    "Gasto registrado correctamente en el servidor."
                );
                navigation.goBack();

            } catch (apiError) {
                console.log("⚠️ Sin conexión. Guardando gasto localmente...");

                const guardadoConExito = guardarGastoOffline(nuevoGasto);

                if (guardadoConExito) {
                    Alert.alert(
                        "Modo Offline",
                        "El gasto quedó guardado localmente. Se sincronizará cuando vuelva la conexión.",
                        [
                            {
                                text: "Entendido",
                                onPress: () => navigation.goBack()
                            }
                        ]
                    );
                } else {
                    throw new Error("No se pudo guardar el gasto offline");
                }
            }
        } catch (error) {
            Alert.alert("Error", error.message);
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        )
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Nuevo gasto</Text>

            {/* NOMBRE */}
            <Text style={styles.label}>Concepto</Text>
            <View style={styles.inputBox}>
                <FontAwesome6 name="pen" size={14} color={colors.textMuted} />
                <TextInput
                    style={styles.input}
                    placeholder="Ej: Cena"
                    value={nombre}
                    onChangeText={setNombre}
                />
            </View>
            {errores.nombre && <Text style={styles.error}>{errores.nombre}</Text>}

            {/* MONTO */}
            <Text style={styles.label}>Monto</Text>
            <View style={styles.inputBox}>
                <FontAwesome6 name="dollar-sign" size={14} color={colors.textMuted} />
                <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={monto}
                    onChangeText={setMonto}
                />
            </View>
            {errores.monto && <Text style={styles.error}>{errores.monto}</Text>}

            {/* FECHA */}
            <Text style={styles.label}>Fecha</Text>
            {Platform.OS === "web" ? (
                <View style={styles.dateBox}>
                    <input
                        type="date"
                        value={fechaFormato()}
                        onChange={(e) => {
                            const p = e.target.value.split("-");
                            setFecha(new Date(p[0], p[1] - 1, p[2]));
                        }}
                        style={{ border: 'none', width: '100%', outline: 'none' }}
                    />
                </View>
            ) : (
                <>
                    <TouchableOpacity style={styles.dateBox} onPress={() => setMostrarFecha(true)}>
                        <FontAwesome6 name="calendar" size={15} color={colors.primary} />
                        <Text>{fechaFormato()}</Text>
                    </TouchableOpacity>

                    {mostrarFecha && (
                        <DateTimePicker
                            value={fecha}
                            mode="date"
                            onChange={(e, date) => {
                                setMostrarFecha(false);
                                if (date) { setFecha(date); }
                            }}
                        />
                    )}
                </>
            )}

            {/* MENÚ DESPLEGABLE: CATEGORIAS */}
            <Text style={styles.label}>Categoría</Text>
            <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setModalCategoriaVisible(true)}
            >
                <View style={styles.dropdownLeftContent}>
                    <FontAwesome6 name="tags" size={14} color={colors.textMuted} style={{ marginRight: 10 }} />
                    <Text style={idCategoria ? styles.dropdownText : styles.dropdownPlaceholder}>
                        {categoriaSeleccionada ? categoriaSeleccionada.Nombre : "Seleccioná una categoría"}
                    </Text>
                </View>
                <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
            </TouchableOpacity>
            {errores.categoria && <Text style={styles.error}>{errores.categoria}</Text>}

            {/* MENÚ DESPLEGABLE: PAGADOR */}
            <Text style={styles.label}>¿Quién pagó?</Text>
            <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setModalPagadorVisible(true)}
            >
                <View style={styles.dropdownLeftContent}>
                    <FontAwesome6 name="user" size={14} color={colors.textMuted} style={{ marginRight: 10 }} />
                    <Text style={idPagador ? styles.dropdownText : styles.dropdownPlaceholder}>
                        {pagadorSeleccionado
                            ? `${pagadorSeleccionado.Nombre} ${pagadorSeleccionado.Apellido} (${pagadorSeleccionado.NombreUsuario})`
                            : "Seleccioná quién pagó"
                        }
                    </Text>
                </View>
                <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
            </TouchableOpacity>
            {errores.pagador && <Text style={styles.error}>{errores.pagador}</Text>}

            {/* DIVISION GLOBAL ENTRE TODOS */}
            <View style={styles.switchBox}>
                <View>
                    <Text style={styles.switchTitle}>Dividir entre todos</Text>
                    <Text style={styles.sub}>Solo viajeros aceptados</Text>
                </View>
                <Switch value={dividirEntreTodos} onValueChange={setDividirEntreTodos} />
            </View>

            {/* CHECKLIST DESPLEGABLE INTELIGENTE (Solo aparece si el switch está apagado) */}
            {!dividirEntreTodos && (
                <View style={{ marginTop: 15 }}>
                    <Text style={styles.label}>¿Entre quiénes se divide?</Text>
                    <TouchableOpacity
                        style={[styles.dropdownButton, errores.participantes && { borderColor: '#dc2626', borderWidth: 1 }]}
                        onPress={() => setModalParticipantesVisible(true)}
                    >
                        <View style={styles.dropdownLeftContent}>
                            <FontAwesome6 name="users" size={14} color={colors.textMuted} style={{ marginRight: 10 }} />
                            <Text style={idsParticipantesSeleccionados.length > 0 ? styles.dropdownText : styles.dropdownPlaceholder}>
                                {idsParticipantesSeleccionados.length > 0
                                    ? `${idsParticipantesSeleccionados.length} participantes seleccionados`
                                    : "Seleccionar participantes"
                                }
                            </Text>
                        </View>
                        <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                    {errores.participantes && <Text style={styles.error}>{errores.participantes}</Text>}
                </View>
            )}

            {/* BOTON REGISTRAR */}
            <TouchableOpacity style={styles.button} onPress={handleGuardar} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Registrar gasto</Text>}
            </TouchableOpacity>

            {/* MODAL DESPLEGABLE DE CATEGORÍAS */}
            <Modal visible={modalCategoriaVisible} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Seleccionar Categoría</Text>
                            <TouchableOpacity onPress={() => setModalCategoriaVisible(false)}>
                                <FontAwesome6 name="xmark" size={20} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={categorias}
                            keyExtractor={(item) => item.IdCategoria.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.modalItem, idCategoria === item.IdCategoria && styles.modalItemActive]}
                                    onPress={() => {
                                        setIdCategoria(item.IdCategoria);
                                        setModalCategoriaVisible(false);
                                    }}
                                >
                                    <Text style={[styles.modalItemText, idCategoria === item.IdCategoria && styles.modalItemTextActive]}>
                                        {item.Nombre}
                                    </Text>
                                    {idCategoria === item.IdCategoria && <FontAwesome6 name="check" size={14} color={colors.primary} />}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            {/* MODAL DESPLEGABLE DE PAGADORES */}
            <Modal visible={modalPagadorVisible} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>¿Quién pagó?</Text>
                            <TouchableOpacity onPress={() => setModalPagadorVisible(false)}>
                                <FontAwesome6 name="xmark" size={20} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={participantes}
                            keyExtractor={(item) => item.IdParticipanteViaje.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.modalItem, idPagador === item.IdParticipanteViaje && styles.modalItemActive]}
                                    onPress={() => {
                                        setIdPagador(item.IdParticipanteViaje);
                                        setModalPagadorVisible(false);
                                    }}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.modalItemText, idPagador === item.IdParticipanteViaje && styles.modalItemTextActive]}>
                                            {item.Nombre} {item.Apellido}
                                        </Text>
                                        <Text style={{ fontSize: 12, color: colors.textMuted }}>@{item.NombreUsuario}</Text>
                                    </View>
                                    {idPagador === item.IdParticipanteViaje && <FontAwesome6 name="check" size={14} color={colors.primary} />}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            {/* MODAL DESPLEGABLE: CHECKLIST MULTIPLE DE PARTICIPANTES */}
            <Modal visible={modalParticipantesVisible} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Integrantes del Gasto</Text>
                            <TouchableOpacity
                                style={styles.modalDoneButton}
                                onPress={() => setModalParticipantesVisible(false)}
                            >
                                <Text style={styles.modalDoneButtonText}>Listo</Text>
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={participantes}
                            keyExtractor={(item) => item.IdParticipanteViaje.toString()}
                            renderItem={({ item }) => {
                                const estaSeleccionado = idsParticipantesSeleccionados.includes(item.IdParticipanteViaje);
                                return (
                                    <TouchableOpacity
                                        style={[styles.modalItem, estaSeleccionado && styles.modalItemActive]}
                                        onPress={() => toggleSeleccionParticipante(item.IdParticipanteViaje)}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.modalItemText, estaSeleccionado && styles.modalItemTextActive]}>
                                                {item.Nombre} {item.Apellido}
                                            </Text>
                                            <Text style={{ fontSize: 12, color: colors.textMuted }}>@{item.NombreUsuario}</Text>
                                        </View>
                                        <View style={[styles.customCheckbox, estaSeleccionado && styles.customCheckboxChecked]}>
                                            {estaSeleccionado && <FontAwesome6 name="check" size={10} color="#fff" />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </View>
            </Modal>

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background
    },
    content: {
        padding: 20,
        paddingBottom: 40
    },
    center: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center"
    },
    title: {
        fontSize: 28,
        fontWeight: "800",
        color: colors.primary,
        marginBottom: 20
    },
    label: {
        fontWeight: "700",
        color: colors.primary,
        marginTop: 10,
        marginBottom: 8
    },
    inputBox: {
        backgroundColor: "#fff",
        height: 50,
        borderRadius: 12,
        paddingHorizontal: 15,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 5,
        ...shadows.card
    },
    input: {
        flex: 1
    },
    dateBox: {
        backgroundColor: "#fff",
        padding: 15,
        borderRadius: 12,
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
        ...shadows.card
    },
    dropdownButton: {
        backgroundColor: "#fff",
        height: 50,
        borderRadius: 12,
        paddingHorizontal: 15,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        ...shadows.card
    },
    dropdownLeftContent: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1
    },
    dropdownPlaceholder: {
        color: "#aaa",
        fontSize: 14
    },
    dropdownText: {
        color: "#000",
        fontSize: 14,
        fontWeight: "500"
    },
    switchBox: {
        marginTop: 25,
        backgroundColor: "#fff",
        padding: 15,
        borderRadius: 12,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center"
    },
    switchTitle: {
        fontWeight: "700"
    },
    sub: {
        fontSize: 12,
        color: colors.textMuted
    },
    customCheckbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: colors.textMuted,
        justifyContent: "center",
        alignItems: "center"
    },
    customCheckboxChecked: {
        backgroundColor: colors.primary,
        borderColor: colors.primary
    },
    button: {
        marginTop: 30,
        height: 55,
        borderRadius: 12,
        backgroundColor: colors.primary,
        justifyContent: "center",
        alignItems: "center"
    },
    buttonText: {
        color: "#fff",
        fontWeight: "800"
    },
    error: {
        color: "#dc2626",
        fontSize: 12,
        marginTop: 5,
        fontWeight: "600"
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        alignItems: "center",
        padding: 20
    },
    modalContainer: {
        backgroundColor: "#fff",
        width: "100%",
        maxHeight: "70%",
        borderRadius: 16,
        padding: 20,
        ...shadows.card
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 15,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#eee"
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: "800",
        color: colors.primary
    },
    modalDoneButton: {
        backgroundColor: colors.primary,
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 8
    },
    modalDoneButtonText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 14
    },
    modalItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#f5f5f5"
    },
    modalItemActive: {
        backgroundColor: "#f0f4f8",
        borderRadius: 8
    },
    modalItemText: {
        fontSize: 15,
        color: "#333"
    },
    modalItemTextActive: {
        color: colors.primary,
        fontWeight: "700"
    }
});