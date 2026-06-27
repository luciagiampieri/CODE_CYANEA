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

import { 
    guardarGastoOffline,
    guardarCategoriasEnCache, 
    obtenerCategoriasCache, 
    guardarParticipantesEnCache, 
    obtenerParticipantesCache
} from "../database/gastosLocal";

export default function AddGastoScreen({ route, navigation }) {

    const { IdViaje, Moneda } = route.params;
    const monedaBase = Moneda || "USD";

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [categorias, setCategorias] = useState([]);
    const [participantes, setParticipantes] = useState([]);

    const [nombre, setNombre] = useState("");
    const [monto, setMonto] = useState("");

    const [idCategoria, setIdCategoria] = useState(null);
    const [idPagador, setIdPagador] = useState(null);

    const [modalCategoriaVisible, setModalCategoriaVisible] = useState(false);
    const [modalPagadorVisible, setModalPagadorVisible] = useState(false);
    const [modalParticipantesVisible, setModalParticipantesVisible] = useState(false); 

    // NUEVO CONTROL DE FLUJO: Tipo de gasto y Tipo de división
    const [esCompartido, setEsCompartido] = useState(false);
    const [esDivisionIgualitaria, setEsDivisionIgualitaria] = useState(true);
    const [idsParticipantesSeleccionados, setIdsParticipantesSeleccionados] = useState([]);
    const [montosPersonalizados, setMontosPersonalizados] = useState({}); // { idParticipante: "monto" }

    const [fecha, setFecha] = useState(new Date());
    const [mostrarFecha, setMostrarFecha] = useState(false);

    const [errores, setErrores] = useState({});

    function fechaFormato(dateObj = fecha) {
        return dateObj.toISOString().split("T")[0];
    }

    const categoriaSeleccionada = categorias.find(c => c.IdCategoria === idCategoria);
    const pagadorSeleccionado = participantes.find(p => p.IdParticipanteViaje === idPagador);

    // Función para manejar la selección múltiple incluyendo la opción "Todos"
    function toggleSeleccionParticipante(id) {
        if (id === "TODOS") {
            const todosIds = participantes.map(p => p.IdParticipanteViaje);
            const estanTodosSeleccionados = todosIds.every(idp => idsParticipantesSeleccionados.includes(idp));
            
            if (estanTodosSeleccionados) {
                // Si ya estaban todos, dejamos solo al pagador (obligatorio)
                setIdsParticipantesSeleccionados(idPagador ? [idPagador] : []);
            } else {
                setIdsParticipantesSeleccionados(todosIds);
            }
            return;
        }

        if (id === idPagador) {
            Alert.alert("Acción no permitida", "El responsable del gasto debe estar incluido sí o sí.");
            return;
        }

        if (idsParticipantesSeleccionados.includes(id)) {
            setIdsParticipantesSeleccionados(idsParticipantesSeleccionados.filter(item => item !== id));
            // Limpiamos el monto personalizado de este usuario si se deselecciona
            const nuevosMontos = { ...montosPersonalizados };
            delete nuevosMontos[id];
            setMontosPersonalizados(nuevosMontos);
        } else {
            setIdsParticipantesSeleccionados([...idsParticipantesSeleccionados, id]);
        }
    }

    const handleMontoPersonalizadoChange = (id, valor) => {
        setMontosPersonalizados(prev => ({
            ...prev,
            [id]: valor
        }));
    };

    useEffect(() => {
        async function cargarDatos() {
            try {
                setLoading(true);

                const [cats, parts] = await Promise.all([
                    getExpenseCategories(),
                    getTripParticipants(IdViaje),
                ]);

                setCategorias(cats);
                setParticipantes(parts);

            } catch (error) {
                console.log("📡 API caída o modo avión detectado. Buscando respaldo local en SQLite...");

                const catsLocal = obtenerCategoriasCache();
                const partsLocal = obtenerParticipantesCache(IdViaje);

                if (catsLocal.length > 0 && partsLocal.length > 0) {
                    setCategorias(catsLocal);
                    setParticipantes(partsLocal);
                    console.log("Formulario cargado con datos de respaldo local exitosamente.");
                } else {
                    Alert.alert("Sin conexión", "No hay datos locales guardados para este viaje todavía.");
                    navigation.goBack();
                }
            } finally {
                setLoading(false);
            }
        }
        cargarDatos();
    }, [IdViaje, navigation]);

    // Nos aseguramos de meter al pagador actual por defecto si pasa a ser compartido
    useEffect(() => {
        if (esCompartido && idPagador) {
            setIdsParticipantesSeleccionados(prev => {
                if (!prev.includes(idPagador)) {
                    return [...prev, idPagador];
                }
                return prev;
            });
        }
    }, [esCompartido, idPagador]);

    useEffect(() => {
        if (!esCompartido) {
            setIdsParticipantesSeleccionados([]);
            setMontosPersonalizados({});
            setEsDivisionIgualitaria(true);
        }
    }, [esCompartido]);

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

        if (esCompartido && !idPagador) {
            nuevosErrores.pagador = "Seleccioná quién pagó";
        }

        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);
        if (fecha > hoy) {
            nuevosErrores.fecha = "La fecha del gasto no puede ser posterior a hoy";
        }

        if (esCompartido) {
            if (idsParticipantesSeleccionados.length < 2) {
                nuevosErrores.participantes = "Debes seleccionar al menos un participante adicional además del pagador";
            }
            else if (!idsParticipantesSeleccionados.includes(idPagador)) {
                nuevosErrores.participantes = "El pagador debe formar parte de la división del gasto";
            }

            // Validación de montos si la división es personalizada
            if (esCompartido && !esDivisionIgualitaria) {
                let sumaMontos = 0;
                let hayMontosVacios = false;
                
                idsParticipantesSeleccionados.forEach(id => {
                    const montoParticipante = montosPersonalizados[id];
                    const montoNum = parseFloat(montoParticipante); 

                    if (isNaN(montoNum) || montoNum <= 0) {
                        hayMontosVacios = true;
                    } 
                    sumaMontos += (isNaN(montoNum) ? 0 : montoNum);
                });

                if (hayMontosVacios) {
                    nuevosErrores.divisionPersonalizada = "Se debe asignar un monto a todos los participantes";
                }
                else if(Math.abs(sumaMontos - Number(monto)) > 0.01) {
                    nuevosErrores.divisionPersonalizada = `La suma de los montos individuales debe ser igual al monto total (${monto} ${monedaBase})`;
                }
            }
        }

        setErrores(nuevosErrores);

        if (Object.keys(nuevosErrores).length > 0) {
            return;
        }

        try {
            setSaving(true);

            const detalleMontosPersonalizados = !esDivisionIgualitaria
            ? idsParticipantesSeleccionados.map(id => ({
                IdParticipanteViaje: id,
                MontoAsignado: Number(montosPersonalizados[id] || 0)
            }))
            : null;

            const nuevoGasto = {
                IdViaje,
                Nombre: nombre,
                Monto: Number(monto),
                IdCategoria: idCategoria,
                IdPagador: esCompartido ? idPagador : null,
                FechaGasto: fechaFormato(),
                DividirEntreTodos: esCompartido ? esDivisionIgualitaria && idsParticipantesSeleccionados.length === participantes.length : false,
                IdParticipantes: esCompartido ? idsParticipantesSeleccionados : [],
                EsCompartido: esCompartido,
                TipoDivision: esCompartido ? (esDivisionIgualitaria ? "igualitaria" : "personalizada") : null,
                DetalleMontosPersonalizados: (!esDivisionIgualitaria && esCompartido) ? detalleMontosPersonalizados : []
            };

            try {
                await createExpense(nuevoGasto);
                Alert.alert("Éxito", "Gasto registrado correctamente en el servidor.");
                navigation.goBack();
            } catch (apiError) {
                console.log("ERROR createExpense:", apiError);
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
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <FontAwesome6 name="arrow-left" size={18} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.title}>Nuevo gasto</Text>
            </View>

            {/* 1. NOMBRE */}
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

            {/* 2. MONTO */}
            <Text style={styles.label}>Monto</Text>
            <View style={styles.inputBox}>
                <Text style={styles.currencyCodePrefix}>{monedaBase.toUpperCase()}</Text>
                <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={monto}
                    onChangeText={setMonto}
                />
            </View>
            {errores.monto && <Text style={styles.error}>{errores.monto}</Text>}

            {/* 3. FECHA */}
            <Text style={styles.label}>Fecha</Text>
            {Platform.OS === "web" ? (
                <View style={styles.dateBox}>
                    <input
                        type="date"
                        value={fechaFormato()}
                        max={fechaFormato(new Date())}
                        onChange={(e) => {
                            const p = e.target.value.split("-");
                            const nuevaFecha = new Date(p[0], p[1] - 1, p[2]);
                            const limiteHoy = new Date();
                            limiteHoy.setHours(23, 59, 59, 999);

                            if (nuevaFecha > limiteHoy) {
                                Alert.alert("Fecha inválida", "No podés registrar un gasto en una fecha futura.");
                                setFecha(new Date());
                            } else {
                                setFecha(nuevaFecha);
                            }
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
                            maximumDate={new Date()}
                            onChange={(e, date) => {
                                setMostrarFecha(false);
                                if (date) { 
                                    const limiteHoy = new Date();
                                    limiteHoy.setHours(23, 59, 59, 999);
                                    
                                    if (date > limiteHoy) {
                                        Alert.alert("Fecha inválida", "No podés registrar un gasto en una fecha futura.");
                                        setFecha(new Date());
                                    } else {
                                        setFecha(date); 
                                    }
                                }
                            }}
                        />
                    )}
                </>
            )}
            {errores.fecha && <Text style={styles.error}>{errores.fecha}</Text>}

            {/* 4. MENÚ DESPLEGABLE: CATEGORIAS */}
            <Text style={styles.label}>Categoría</Text>
            <TouchableOpacity style={styles.dropdownButton} onPress={() => setModalCategoriaVisible(true)}>
                <View style={styles.dropdownLeftContent}>
                    <FontAwesome6 name="tags" size={14} color={colors.textMuted} style={{ marginRight: 10 }} />
                    <Text style={idCategoria ? styles.dropdownText : styles.dropdownPlaceholder}>
                        {categoriaSeleccionada ? categoriaSeleccionada.Nombre : "Seleccioná una categoría"}
                    </Text>
                </View>
                <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
            </TouchableOpacity>
            {errores.categoria && <Text style={styles.error}>{errores.categoria}</Text>}

            {/* 5. SELECCIONAR TIPO DE GASTO (PERSONAL O COMPARTIDO) */}
            <Text style={styles.label}>Tipo de Gasto</Text>
            <View style={styles.selectorContainer}>
                <TouchableOpacity 
                    style={[styles.selectorOption, !esCompartido && styles.selectorOptionActive]} 
                    onPress={() => setEsCompartido(false)}
                >
                    <FontAwesome6 name="user" size={14} color={!esCompartido ? "#fff" : colors.textMuted} />
                    <Text style={[styles.selectorOptionText, !esCompartido && styles.selectorOptionTextActive]}>Personal</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.selectorOption, esCompartido && styles.selectorOptionActive]} 
                    onPress={() => setEsCompartido(true)}
                >
                    <FontAwesome6 name="users" size={14} color={esCompartido ? "#fff" : colors.textMuted} />
                    <Text style={[styles.selectorOptionText, esCompartido && styles.selectorOptionTextActive]}>Compartido</Text>
                </TouchableOpacity>
            </View>

            {/* 6. MENÚ DESPLEGABLE: PAGADOR */}
            {esCompartido && (
                <>
                <Text style={styles.label}>¿Quién pagó?</Text>
                
                <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setModalPagadorVisible(true)}
                >
                
                <View style={styles.dropdownLeftContent}>
                    <FontAwesome6
                        name="user"
                        size={14}
                        color={colors.textMuted}
                        style={{ marginRight: 10 }}
                    />

                    <Text style={idPagador ? styles.dropdownText : styles.dropdownPlaceholder}>
                        {pagadorSeleccionado
                            ? `${pagadorSeleccionado.Nombre} ${pagadorSeleccionado.Apellido} (${pagadorSeleccionado.NombreUsuario})`
                            : "Seleccioná quién pagó"}
                    </Text>
                </View>

                <FontAwesome6
                    name="chevron-down"
                    size={14}
                    color={colors.textMuted}
                />
            </TouchableOpacity>

            {errores.pagador && (
                <Text style={styles.error}>{errores.pagador}</Text>
            )}
        </>
    )}

            {/* CONFIGURACIONES ADICIONALES SI ES COMPARTIDO */}
            {esCompartido && (
                <View style={styles.compartidoSection}>
                    {/* 7. SELECCIONAR PARTICIPANTES DEL GASTO */}
                    <Text style={styles.label}>¿Entre quiénes se divide?</Text>
                    <TouchableOpacity
                        style={[styles.dropdownButton, errores.participantes && { borderColor: '#dc2626', borderWidth: 1 }]}
                        onPress={() => setModalParticipantesVisible(true)}
                    >
                        <View style={styles.dropdownLeftContent}>
                            <FontAwesome6 name="users" size={14} color={colors.textMuted} style={{ marginRight: 10 }} />
                            <Text style={idsParticipantesSeleccionados.length > 0 ? styles.dropdownText : styles.dropdownPlaceholder}>
                                {idsParticipantesSeleccionados.length === participantes.length
                                    ? "Dividido entre Todos"
                                    : `${idsParticipantesSeleccionados.length} participantes seleccionados`
                                }
                            </Text>
                        </View>
                        <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                    {errores.participantes && <Text style={styles.error}>{errores.participantes}</Text>}

                    {/* MODO DE DIVISIÓN */}
                    <Text style={styles.label}>Distribución de la división</Text>
                    <View style={styles.selectorContainer}>
                        <TouchableOpacity 
                            style={[styles.selectorOption, esDivisionIgualitaria && styles.selectorOptionActive]} 
                            onPress={() => setEsDivisionIgualitaria(true)}
                        >
                            <Text style={[styles.selectorOptionText, esDivisionIgualitaria && styles.selectorOptionTextActive]}>Igualitaria / Equitativa</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.selectorOption, !esDivisionIgualitaria && styles.selectorOptionActive]} 
                            onPress={() => setEsDivisionIgualitaria(false)}
                        >
                            <Text style={[styles.selectorOptionText, !esDivisionIgualitaria && styles.selectorOptionTextActive]}>Personalizada</Text>
                        </TouchableOpacity>
                    </View>

                    {/* 8. DESGLOSE SI SE SELECCIONÓ DIVISIÓN PERSONALIZADA */}
                    {!esDivisionIgualitaria && idsParticipantesSeleccionados.length > 0 && (
                        <View style={styles.personalizadoCard}>
                            <Text style={styles.personalizadoTitle}>Asignar Montos Individuales ({monedaBase.toUpperCase()})</Text>
                            {participantes
                                .filter(p => idsParticipantesSeleccionados.includes(p.IdParticipanteViaje))
                                .map(p => (
                                    <View key={p.IdParticipanteViaje} style={styles.personalizadoRow}>
                                        <Text style={styles.personalizadoNombre}>{p.Nombre} {p.Apellido}</Text>
                                        <TextInput
                                            style={styles.personalizadoInput}
                                            placeholder="0"
                                            keyboardType="numeric"
                                            value={montosPersonalizados[p.IdParticipanteViaje] || ""}
                                            onChangeText={(val) => handleMontoPersonalizadoChange(p.IdParticipanteViaje, val)}
                                        />
                                    </View>
                                ))
                            }
                            {errores.divisionPersonalizada && <Text style={styles.error}>{errores.divisionPersonalizada}</Text>}
                        </View>
                    )}
                </View>
            )}

            <TouchableOpacity style={styles.button} onPress={handleGuardar} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Registrar gasto</Text>}
            </TouchableOpacity>

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
                                Dino>
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
                                        const nuevoPagadorId = item.IdParticipanteViaje;
                                        setIdPagador(nuevoPagadorId);
                                        setModalPagadorVisible(false);
                                        
                                        if (esCompartido) {
                                            setIdsParticipantesSeleccionados(prev => {
                                                if (!prev.includes(nuevoPagadorId)) {
                                                    return [...prev, nuevoPagadorId];
                                                }
                                                return prev;
                                            });
                                        }
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

            {/* MODAL DESPLEGABLE: CHECKLIST MULTIPLE DE PARTICIPANTES (CON OPCIÓN TODOS AL INICIO) */}
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
                        
                        {/* Se usa FlatList unificando la opción especial "Todos" al principio */}
                        <FlatList
                            data={[{ IdParticipanteViaje: "TODOS", Nombre: "Todos", Apellido: "", NombreUsuario: "marcar_desmarcar" }, ...participantes]}
                            keyExtractor={(item) => item.IdParticipanteViaje.toString()}
                            renderItem={({ item }) => {
                                if (item.IdParticipanteViaje === "TODOS") {
                                    const todosIds = participantes.map(p => p.IdParticipanteViaje);
                                    const estanTodosSeleccionados = todosIds.length > 0 && todosIds.every(idp => idsParticipantesSeleccionados.includes(idp));
                                    
                                    return (
                                        <TouchableOpacity
                                            style={[styles.modalItem, estanTodosSeleccionados && styles.modalItemActive, { borderBottomWidth: 2, borderBottomColor: colors.primary }]}
                                            onPress={() => toggleSeleccionParticipante("TODOS")}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.modalItemText, { fontWeight: "bold", color: colors.primary }]}>
                                                    Seleccionar Todos
                                                </Text>
                                            </View>
                                            <View style={[styles.customCheckbox, estanTodosSeleccionados && styles.customCheckboxChecked]}>
                                                {estanTodosSeleccionados && <FontAwesome6 name="check" size={10} color="#fff" />}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                }

                                const estaSeleccionado = idsParticipantesSeleccionados.includes(item.IdParticipanteViaje);
                                const esElPagador = item.IdParticipanteViaje === idPagador;
                                return (
                                    <TouchableOpacity
                                        style={[
                                            styles.modalItem, 
                                            estaSeleccionado && styles.modalItemActive,
                                            esElPagador && { backgroundColor: "#f9fafb" }
                                        ]}
                                        onPress={() => toggleSeleccionParticipante(item.IdParticipanteViaje)}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={[
                                                styles.modalItemText, 
                                                estaSeleccionado && styles.modalItemTextActive,
                                                esElPagador && { color: "#6b7280", fontWeight: "600" }
                                            ]}>
                                                {item.Nombre} {item.Apellido} {esElPagador && "(Responsable)"}
                                            </Text>
                                            <Text style={{ fontSize: 12, color: colors.textMuted }}>@{item.NombreUsuario}</Text>
                                        </View>
                                        <View style={[
                                            styles.customCheckbox, 
                                            estaSeleccionado && styles.customCheckboxChecked,
                                            esElPagador && { backgroundColor: "#9ca3af", borderColor: "#9ca3af" }
                                        ]}>
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
    header: {
        height: 50,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
        position: "relative",
    },
    backButton: {
        position: "absolute",
        left: 0,
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: "#fff",
        justifyContent: "center",
        alignItems: "center",
        ...shadows.card,
    },
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
        textAlign: "center"
    },
    label: {
        fontWeight: "700",
        color: colors.primary,
        marginTop: 14,
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
    currencyCodePrefix: {
        fontSize: 14,
        fontWeight: "800",
        color: "#6b7280",
        marginRight: 2,
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
    selectorContainer: {
        flexDirection: "row",
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 4,
        gap: 5,
        ...shadows.card
    },
    selectorOption: {
        flex: 1,
        flexDirection: "row",
        height: 42,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
        gap: 8
    },
    selectorOptionActive: {
        backgroundColor: colors.primary
    },
    selectorOptionText: {
        fontWeight: "700",
        color: colors.textMuted,
        fontSize: 14
    },
    selectorOptionTextActive: {
        color: "#fff"
    },
    compartidoSection: {
        marginTop: 5,
        backgroundColor: "#f9fafb",
        borderRadius: 14,
        padding: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb"
    },
    personalizadoCard: {
        marginTop: 15,
        backgroundColor: "#fff",
        padding: 15,
        borderRadius: 12,
        ...shadows.card
    },
    personalizadoTitle: {
        fontWeight: "800",
        fontSize: 14,
        color: colors.primary,
        marginBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#f3f4f6",
        paddingBottom: 5
    },
    personalizadoRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#f9fafb"
    },
    personalizadoNombre: {
        fontSize: 14,
        color: "#333",
        fontWeight: "500",
        flex: 1
    },
    personalizadoInput: {
        backgroundColor: "#f3f4f6",
        width: 100,
        height: 38,
        borderRadius: 8,
        paddingHorizontal: 10,
        textAlign: "right",
        fontWeight: "600"
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