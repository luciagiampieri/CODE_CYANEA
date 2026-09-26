import { useState, useEffect, useRef } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
    Platform,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    Keyboard,
    TouchableWithoutFeedback,
    KeyboardAvoidingView,
    ActivityIndicator,
    TouchableOpacity,
    FlatList,
    Animated,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import PrimaryButton from "../components/ui/PrimaryButton";
import {
    searchTripPlaces,
    saveActivityLocation,
    resolveTripPlace,
} from "../services/api";
import { colors, radii, spacing, textStyles } from "../theme/tokens";
import ScreenContainer from "../components/layout/ScreenContainer";

const ICON_OPTIONS = [
    { name: "plane", label: "Vuelo" },
    { name: "building", label: "Hotel" },
    { name: "utensils", label: "Comida" },
    { name: "camera", label: "Turismo" },
    { name: "ticket", label: "Evento" },
    { name: "car", label: "Traslado" },
    { name: "person-hiking", label: "Excursión" },
    { name: "location-dot", label: "Otro" },
];

const ICON_KEYWORDS = {
    plane: ["vuelo", "avion", "avión", "aeropuerto", "embarque", "flight", "aterrizaje", "despegue", "boarding", "boarding pass", "aerolinea", "aerolínea", "airline", "gate", "escala", "conexion"],
    building: ["hotel", "alojamiento", "hostel", "check-in", "check in", "check-out", "check out", "hospedaje", "apartamento", "cabaña", "resort", "bnb", "dormir", "habitación", "recepción", "reserva", "booking", "hostería", "hospedería", "hostal", "airbnb"],
    utensils: ["cena", "almuerzo", "desayuno", "comida", "restaurante", "brunch", "cafe", "café", "bar", "parrilla", "pizza", "gastronomia", "degustación", "fast food", "burger", "comedor", "cafetería", "cafeteria", "snack", "merienda", "tapas", "pub", "cerveza", "vino", "cocktail", "coctel", "drinks", "bebidas", "drink", "beverage", "cena romántica", "romantic dinner"],
    camera: ["visita", "museo", "tour", "turismo", "paseo", "recorrido", "monumento", "catedral", "iglesia", "plaza", "galeria", "shopping", "compras", "tienda", "exposición", "mirador", "foto", "histórico", "ruinas", "arquitectura", "cultural", "artístico", "arte", "fotografía", "photography", "sightseeing", "landmark", "attraction", "city tour", "walking tour", "parque", "jardín", "zoológico", "acuario", "planetario", "observatorio", "cultural center", "cultural centre", "cultural site", "guiada", "guiado", "guía", "guide", "guided tour", "tour guide", "excursión guiada", "visita guiada"],
    ticket: ["show", "teatro", "concierto", "evento", "espectaculo", "espectáculo", "partido", "cancha", "cine", "festival", "obra", "entrada", "recital", "ópera", "musical", "danza", "ballet", "performance", "ticket", "tickets", "entradas", "boletos", "boleto", "admisión", "admission", "pass", "passes", "conferencia", "charla", "workshop", "seminario", "exposición", "exhibition", "expo", "feria", "convention", "convención", "convocatoria"],
    car: ["traslado", "taxi", "bus", "colectivo", "transporte", "uber", "remis", "transfer", "shuttle", "metro", "tren", "subte", "alquiler", "renta", "conducción", "puerto", "ferry", "estación", "terminal", "autobús", "camioneta", "van", "vehículo", "carro", "coche", "auto", "ride", "transportation", "commute", "ave"],
    "person-hiking": ["excursion", "excursión", "senderismo", "trekking", "hiking", "caminata", "montaña", "playa", "trek", "aventura", "naturaleza", "escalada", "ski", "buceo", "surf", "nadar", "rafting", "kayak", "bosque", "snorkel", "yoga"],
};

function detectIcon(nombre) {
    if (!nombre.trim()) return "location-dot";
    const lower = nombre.toLowerCase();
    for (const [icon, keywords] of Object.entries(ICON_KEYWORDS)) {
        if (keywords.some((kw) => lower.includes(kw))) return icon;
    }
    return "location-dot";
}

function isValidTime(value) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export default function AddActivityScreen({
    visible,
    onClose,
    onSubmit,
    dayLabel,
    tripId,
    activityToEdit = null,
    onCancelEdit,
}) {
    const [nombre, setNombre] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [horaInicio, setHoraInicio] = useState("");
    const [horaFin, setHoraFin] = useState("");

    const [showTimePicker, setShowTimePicker] = useState(null);
    const [tempDate, setTempDate] = useState(new Date());

    const [icono, setIcono] = useState("location-dot");
    const [iconoModificadoManual, setIconoModificadoManual] = useState(false);
    const [modalIconoVisible, setModalIconoVisible] = useState(false);

    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");

    const [ubicacion, setUbicacion] = useState(null);
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [locationQuery, setLocationQuery] = useState("");
    const [locationResults, setLocationResults] = useState([]);
    const [searchingLocations, setSearchingLocations] = useState(false);
    const [hasSearchedLocations, setHasSearchedLocations] = useState(false);
    const [savingLocation, setSavingLocation] = useState(false);

    const lastQueryLengthRef = useRef(0);
    const slideAnimIcono = useRef(new Animated.Value(300)).current;

    const scrollRef = useRef(null);
    const fieldY = useRef({});

    function scrollToField(key) {
        // Pequeño delay para esperar a que el teclado termine de aparecer
        setTimeout(() => {
            const y = fieldY.current[key];
            if (y == null) return;
            scrollRef.current?.scrollTo({ y: Math.max(y - 80, 0), animated: true });
        }, 300);
    }

    useEffect(() => {
        if (modalIconoVisible) {
            Animated.timing(slideAnimIcono, { toValue: 0, duration: 250, useNativeDriver: true }).start();
        } else {
            slideAnimIcono.setValue(300);
        }
    }, [modalIconoVisible]);

    useEffect(() => {
        if (!iconoModificadoManual) {
            setIcono(detectIcon(nombre));
        }
    }, [nombre]);

    useEffect(() => {
        if (!visible) return;

        if (activityToEdit) {
            setNombre(activityToEdit.title ?? "");
            setDescripcion(activityToEdit.note ?? "");
            const [horaInicioEdit, horaFinEdit] = (activityToEdit.time ?? "").split(" - ");
            setHoraInicio(horaInicioEdit ?? "");
            setHoraFin(horaFinEdit ?? "");
            setIcono(activityToEdit.icon ?? "location-dot");
            setIconoModificadoManual(true);
            setUbicacion(activityToEdit.lugarInteres ?? null);
        } else {
            setNombre("");
            setDescripcion("");
            setHoraInicio("");
            setHoraFin("");
            setIcono("location-dot");
            setIconoModificadoManual(false);
            setUbicacion(null);
        }

        setError("");
        setSuccessMessage("");
        setShowTimePicker(null);
        setShowLocationPicker(false);
        setModalIconoVisible(false);
        setLocationQuery("");
        setLocationResults([]);
        setHasSearchedLocations(false);
    }, [visible, activityToEdit]);

    useEffect(() => {
        let active = true;
        const queryLimpia = locationQuery.trim();

        if (queryLimpia.length < 2) {
            setLocationResults([]);
            setSearchingLocations(false);
            setHasSearchedLocations(false);
            lastQueryLengthRef.current = 0;
            return;
        }

        const isFirstSearch = lastQueryLengthRef.current < 2;
        lastQueryLengthRef.current = queryLimpia.length;
        const delay = isFirstSearch ? 0 : 150;

        setSearchingLocations(true);

        const timeout = setTimeout(async () => {
            try {
                const results = await searchTripPlaces(tripId, queryLimpia);
                if (!active) return;
                setLocationResults(results);
                setHasSearchedLocations(true);
            } catch (err) {
                if (!active) return;
                setLocationResults([]);
                setHasSearchedLocations(true);
                setError(err.message || "No se pudieron buscar lugares.");
            } finally {
                if (active) setSearchingLocations(false);
            }
        }, delay);

        return () => {
            active = false;
            clearTimeout(timeout);
        };
    }, [locationQuery, tripId]);

    function handleSelectIcon(iconName) {
        setIcono(iconName);
        setIconoModificadoManual(true);
        setModalIconoVisible(false);
    }

    function resetAndClose() {
        if (activityToEdit?.id) {
            onCancelEdit?.(activityToEdit.id);
        }
        setNombre("");
        setDescripcion("");
        setHoraInicio("");
        setHoraFin("");
        setIcono("location-dot");
        setIconoModificadoManual(false);
        setError("");
        setSuccessMessage("");
        setShowTimePicker(null);
        setShowLocationPicker(false);
        setModalIconoVisible(false);
        setLocationQuery("");
        setLocationResults([]);
        setHasSearchedLocations(false);

        onClose();
    }

    function openTimePicker(type) {
        Keyboard.dismiss();
        if (type === "fin" && !horaInicio) {
            setError("Primero seleccioná una hora de inicio.");
            return;
        }

        const baseDate = new Date();

        if (type === "inicio") {
            if (horaInicio && isValidTime(horaInicio)) {
                const [h, m] = horaInicio.split(":");
                baseDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
            }
        } else if (horaFin && isValidTime(horaFin)) {
            const [h, m] = horaFin.split(":");
            baseDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
        } else {
            // Sin hora de fin todavía: proponer inicio + 1 hora (tope 23:59)
            const [h, m] = horaInicio.split(":");
            const total = Math.min(parseInt(h, 10) * 60 + parseInt(m, 10) + 60, 23 * 60 + 59);
            baseDate.setHours(Math.floor(total / 60), total % 60, 0, 0);
        }

        setTempDate(baseDate);
        setShowTimePicker(type);
        setError("");
    }

    function commitTime(type, date) {
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const selectedTime = `${hours}:${minutes}`;

        if (type === "inicio") {
            setHoraInicio(selectedTime);
            if (horaFin && selectedTime >= horaFin) setHoraFin("");
            setError("");
        } else if (type === "fin") {
            if (horaInicio && selectedTime <= horaInicio) {
                setError("La hora de fin debe ser posterior a la hora de inicio.");
                setHoraFin("");
            } else {
                setHoraFin(selectedTime);
                setError("");
            }
        }
    }

    function handleTimeChange(event, selectedDate) {
        if (Platform.OS === "android") {
            const type = showTimePicker;
            setShowTimePicker(null);
            if (event.type === "set" && selectedDate) commitTime(type, selectedDate);
            return;
        }
        // iOS: solo guardamos el valor temporal; se confirma con "Listo"
        if (selectedDate) setTempDate(selectedDate);
    }

    function confirmTimePicker() {
        commitTime(showTimePicker, tempDate);
        setShowTimePicker(null);
    }

    function closeTimePicker() {
        setShowTimePicker(null);
    }

    function openLocationPicker() {
        Keyboard.dismiss();
        setShowLocationPicker(true);
    }

    function closeLocationPicker() {
        Keyboard.dismiss();
        setShowLocationPicker(false);
        setLocationQuery("");
        setLocationResults([]);
        setSearchingLocations(false);
        setHasSearchedLocations(false);
        lastQueryLengthRef.current = 0;
    }

    async function handleSubmit() {
        if (!nombre.trim()) {
            setError("El nombre de la actividad es obligatorio.");
            return;
        }

        if (!isValidTime(horaInicio) || !isValidTime(horaFin)) {
            setError("Ingresá los horarios en formato HH:MM.");
            return;
        }

        if (horaFin <= horaInicio) {
            if (horaFin === "00:00") {
                setError("Para el fin del día usá 23:59. Las 00:00 cuentan como el día siguiente.");
            } else if (horaFin === horaInicio) {
                setError("La hora de inicio y fin no pueden ser iguales.");
            } else {
                setError("La hora de fin debe ser posterior a la hora de inicio (dentro del mismo día).");
            }
            return;
        }

        setSubmitting(true);
        setError("");
        setSuccessMessage("");

        try {
            await onSubmit({
                id: activityToEdit?.id,
                nombre: nombre.trim(),
                descripcion: descripcion.trim() || null,
                horaInicio: `${horaInicio}:00`,
                horaFin: `${horaFin}:00`,
                icono,
                idLugarInteres: ubicacion?.id || null,
            });

            setSuccessMessage(
                activityToEdit
                    ? "¡Actividad editada correctamente!"
                    : "¡Actividad agregada correctamente!"
            );

            setTimeout(() => {
                resetAndClose();
            }, 1200);
        } catch (err) {
            setError(
                err.message ||
                    (activityToEdit
                        ? "No se pudo editar la actividad."
                        : "No se pudo crear la actividad.")
            );
        } finally {
            setSubmitting(false);
        }
    }

    async function handleSelectLocation(place) {
        try {
            Keyboard.dismiss();
            setSavingLocation(true);
            setError("");

            const resolvedPlace = await resolveTripPlace(tripId, place.placeId);
            const response = await saveActivityLocation(tripId, {
                placeId: resolvedPlace.placeId,
                name: resolvedPlace.name,
                address: resolvedPlace.address,
                lat: resolvedPlace.lat,
                lng: resolvedPlace.lng,
                category: resolvedPlace.category,
                metadata: resolvedPlace.metadata,
            });

            setUbicacion(response);
            closeLocationPicker();
        } catch (err) {
            setError(err.message || "No se pudo guardar la ubicación.");
        } finally {
            setSavingLocation(false);
        }
    }

    function handleRemoveLocation() {
        setUbicacion(null);
        setError("");
    }

    const iconoSeleccionadoObj = ICON_OPTIONS.find((opt) => opt.name === icono);

    return (
        <Modal
            animationType="slide"
            transparent
            visible={visible}
            onRequestClose={resetAndClose}
        >
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <View style={styles.overlay}>
                    <View style={styles.sheet}>
                        {/* FORMULARIO PRINCIPAL */}
                        <ScrollView
                            ref={scrollRef}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: spacing.xl }}
                        >
                            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                                <View>
                                    <View style={styles.headerRow}>
                                        <Text style={styles.title}>
                                            {activityToEdit ? "Editar actividad" : "Agregar actividad"}
                                        </Text>

                                        <Pressable onPress={resetAndClose} hitSlop={10}>
                                            <FontAwesome6 color={colors.textMuted} name="xmark" size={18} />
                                        </Pressable>
                                    </View>

                                    {dayLabel ? <Text style={styles.subtitle}>{dayLabel}</Text> : null}

                                    <Text style={styles.label}>Nombre</Text>

                                    <View 
                                        style={styles.inputBox}
                                        onLayout={(e) => {
                                            fieldY.current.nombre = e.nativeEvent.layout.y;
                                        }}
                                    >
                                        <FontAwesome6 name="pen" size={14} color={colors.overlay} />
                                        <TextInput
                                            onChangeText={(text) => {
                                                setNombre(text);
                                                if (error) setError("");
                                            }}
                                            onFocus={() => scrollToField("nombre")}
                                            placeholder="Visita al museo"
                                            placeholderTextColor={colors.overlay}
                                            style={styles.inputInner}
                                            value={nombre}
                                            editable={!successMessage}
                                        />
                                    </View>

                                    {/* HORARIOS */}
                                    <View style={styles.row}>
                                        <View style={styles.timeField}>
                                            <Text style={styles.label}>Hora de inicio</Text>
                                            {Platform.OS === "web" ? (
                                                <View style={styles.dateBox}>
                                                    <FontAwesome6 name="clock" size={14} color={colors.overlay} />
                                                    <TextInput
                                                        onChangeText={setHoraInicio}
                                                        placeholder="HH:MM"
                                                        placeholderTextColor={colors.overlay}
                                                        style={styles.inputInner}
                                                        value={horaInicio}
                                                        editable={!successMessage}
                                                        type="time"
                                                    />
                                                </View>
                                            ) : (
                                                <Pressable
                                                    onPress={() => !successMessage && openTimePicker("inicio")}
                                                    style={styles.dateBox}
                                                >
                                                    <FontAwesome6 name="clock" size={14} color={colors.overlay} />
                                                    <Text style={horaInicio ? styles.timeText : styles.placeholderText}>
                                                        {horaInicio || "Seleccionar hora"}
                                                    </Text>
                                                </Pressable>
                                            )}
                                        </View>

                                        <View style={styles.timeField}>
                                            <Text style={styles.label}>Hora de fin</Text>
                                            {Platform.OS === "web" ? (
                                                <View style={styles.dateBox}>
                                                    <FontAwesome6 name="clock" size={14} color={colors.overlay} />
                                                    <TextInput
                                                        onChangeText={setHoraFin}
                                                        placeholder="HH:MM"
                                                        placeholderTextColor={colors.overlay}
                                                        style={styles.inputInner}
                                                        value={horaFin}
                                                        editable={!successMessage}
                                                        type="time"
                                                    />
                                                </View>
                                            ) : (
                                                <Pressable
                                                    onPress={() => !successMessage && openTimePicker("fin")}
                                                    style={styles.dateBox}
                                                >
                                                    <FontAwesome6 name="clock" size={14} color={colors.overlay} />
                                                    <Text style={horaFin ? styles.timeText : styles.placeholderText}>
                                                        {horaFin || "Seleccionar hora"}
                                                    </Text>
                                                </Pressable>
                                            )}
                                        </View>
                                    </View>

                                    {/* ERROR VISIBLE TRAS CAMPOS DE HORA */}
                                    {error ? (
                                        <View style={styles.errorContainer}>
                                            <FontAwesome6 name="circle-exclamation" size={14} color={colors.danger} />
                                            <Text style={styles.errorText}>{error}</Text>
                                        </View>
                                    ) : null}

                                    {/* UBICACIÓN */}
                                    <Text style={styles.label}>Ubicación (opcional)</Text>
                                    <View style={styles.locationInputContainer}>
                                        <TouchableOpacity
                                            style={styles.dropdownButton}
                                            onPress={() => !successMessage && openLocationPicker()}
                                        >
                                            <View style={styles.dropdownLeftContent}>
                                                <FontAwesome6
                                                    name="location-dot"
                                                    size={14}
                                                    color={ubicacion ? colors.primary : colors.overlay}
                                                    style={{ marginRight: 10, width: 18, textAlign: "center" }}
                                                />
                                                <Text
                                                    style={ubicacion ? styles.dropdownText : styles.dropdownPlaceholder}
                                                    numberOfLines={1}
                                                    ellipsizeMode="tail"
                                                >
                                                    {ubicacion ? ubicacion.name : "Seleccionar ubicación"}
                                                </Text>
                                            </View>
                                            <FontAwesome6 name="chevron-down" size={14} color={colors.overlay} />
                                        </TouchableOpacity>

                                        {ubicacion ? (
                                            <Pressable
                                                style={styles.removeLocationButton}
                                                onPress={handleRemoveLocation}
                                                disabled={!!successMessage}
                                                hitSlop={8}
                                            >
                                                <FontAwesome6 name="trash-can" size={16} color={colors.danger} />
                                            </Pressable>
                                        ) : null}
                                    </View>

                                    {ubicacion?.address ? (
                                        <Text style={styles.locationAddressHint} numberOfLines={1} ellipsizeMode="tail">
                                            {ubicacion.address}
                                        </Text>
                                    ) : null}

                                    {/* DESCRIPCIÓN */}
                                    <Text style={styles.label}>Descripción (opcional)</Text>
                                    <View 
                                        style={[styles.inputBox, styles.inputBoxMultiline]}
                                        onLayout={(e) => {
                                            fieldY.current.descripcion = e.nativeEvent.layout.y;
                                        }}
                                    >
                                        <FontAwesome6
                                            name="note-sticky"
                                            size={14}
                                            color={colors.overlay}
                                            style={styles.inputBoxMultilineIcon}
                                        />
                                        <TextInput
                                            multiline
                                            onChangeText={setDescripcion}
                                            onFocus={() => scrollToField("descripcion")}
                                            placeholder="Detalle del traslado, excursión o evento."
                                            placeholderTextColor={colors.overlay}
                                            style={[styles.inputInner, styles.inputMultiline]}
                                            value={descripcion}
                                            editable={!successMessage}
                                        />
                                    </View>

                                    {/* ÍCONO */}
                                    <Text style={styles.label}>Ícono</Text>
                                    <Text style={styles.iconHint}>
                                        Detectado automáticamente. Seleccioná otro para cambiarlo.
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.dropdownButton}
                                        onPress={() => {
                                            if (successMessage) return;
                                            Keyboard.dismiss();
                                            setModalIconoVisible(true);
                                        }}
                                    >
                                        <View style={styles.dropdownLeftContent}>
                                            <FontAwesome6
                                                name={iconoSeleccionadoObj ? iconoSeleccionadoObj.name : "location-dot"}
                                                size={14}
                                                color={colors.primary}
                                                style={{ marginRight: 10, width: 18, textAlign: "center" }}
                                            />
                                            <Text style={styles.dropdownText} numberOfLines={1} ellipsizeMode="tail">
                                                {iconoSeleccionadoObj ? iconoSeleccionadoObj.label : "Selecciona un ícono"}
                                            </Text>
                                        </View>
                                        <FontAwesome6 name="chevron-down" size={14} color={colors.overlay} />
                                    </TouchableOpacity>

                                    {successMessage ? (
                                        <Text style={styles.success}>{successMessage}</Text>
                                    ) : null}

                                    <PrimaryButton
                                        label={
                                            submitting
                                                ? "Guardando..."
                                                : activityToEdit
                                                ? "Guardar cambios"
                                                : "Agregar actividad"
                                        }
                                        loading={submitting}
                                        onPress={handleSubmit}
                                        disabled={!!successMessage}
                                        style={styles.submitButton}
                                    />
                                </View>
                            </TouchableWithoutFeedback>
                        </ScrollView>

                        {/* MODAL DESPLEGABLE PARA SELECCIONAR ÍCONO */}
                        {modalIconoVisible && (
                            <View style={styles.modalOverlayC}>
                                <Pressable
                                    style={StyleSheet.absoluteFill}
                                    onPress={() => setModalIconoVisible(false)}
                                />
                                <Animated.View style={[styles.bottomSheetC, { transform: [{ translateY: slideAnimIcono }] }]}>
                                    <View style={styles.modalHeaderC}>
                                        <Text style={styles.modalTitleC}>Seleccionar ícono</Text>
                                        <TouchableOpacity onPress={() => setModalIconoVisible(false)} hitSlop={10}>
                                            <FontAwesome6 name="xmark" size={20} color={colors.textMuted} />
                                        </TouchableOpacity>
                                    </View>

                                    <FlatList
                                        data={ICON_OPTIONS}
                                        keyExtractor={(item) => item.name}
                                        renderItem={({ item, index }) => {
                                            const esActivo = icono === item.name;
                                            const esElUltimo = index === ICON_OPTIONS.length - 1;
                                            return (
                                                <TouchableOpacity
                                                    style={[styles.modalItemC, esActivo && styles.modalItemActiveC, esElUltimo && { borderBottomWidth: 0 }]}
                                                    onPress={() => handleSelectIcon(item.name)}
                                                >
                                                    <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                                                        <FontAwesome6
                                                            name={item.name}
                                                            size={16}
                                                            color={esActivo ? colors.primary : "#4b5563"}
                                                            style={{ marginRight: 12, width: 24, textAlign: "center" }}
                                                        />
                                                        <Text style={[styles.modalItemTextC, esActivo && styles.modalItemTextActiveC]} numberOfLines={1} ellipsizeMode="tail">
                                                            {item.label}
                                                        </Text>
                                                    </View>
                                                    {esActivo && (
                                                        <FontAwesome6 name="check" size={14} color={colors.primary} />
                                                    )}
                                                </TouchableOpacity>
                                            );
                                        }}
                                    />
                                </Animated.View>
                            </View>
                        )}

                        <Modal
                            animationType="slide"
                            visible={showLocationPicker}
                            onRequestClose={closeLocationPicker}
                        >
                            <ScreenContainer fullWidth padded={false}>
                                <KeyboardAvoidingView
                                    style={{ flex: 1 }}
                                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                                >
                                    <View style={styles.locationHeader}>
                                        <TouchableOpacity onPress={closeLocationPicker} hitSlop={12} style={styles.locationHeaderSide}>
                                            <FontAwesome6 name="chevron-left" size={16} color={colors.primary} />
                                        </TouchableOpacity>
                                        <Text style={styles.modalTitleC}>Seleccionar ubicación</Text>
                                        <View style={styles.locationHeaderSide} />
                                    </View>

                                    <View style={styles.locationBody}>
                                        <View style={styles.searchBox}>
                                            <FontAwesome6 name="magnifying-glass" size={14} color={colors.overlay} />
                                            <TextInput
                                                value={locationQuery}
                                                onChangeText={setLocationQuery}
                                                placeholder="Buscar un lugar..."
                                                placeholderTextColor={colors.overlay}
                                                style={styles.searchInput}
                                                autoFocus
                                                returnKeyType="search"
                                            />
                                            {searchingLocations ? (
                                                <ActivityIndicator size="small" color={colors.primary} />
                                            ) : locationQuery.length > 0 ? (
                                                <Pressable onPress={() => setLocationQuery("")} hitSlop={10}>
                                                    <FontAwesome6 name="circle-xmark" size={16} color={colors.overlay} />
                                                </Pressable>
                                            ) : null}
                                        </View>

                                        <FlatList
                                            data={locationResults}
                                            keyExtractor={(place) => place.placeId}
                                            keyboardShouldPersistTaps="handled"
                                            showsVerticalScrollIndicator={false}
                                            style={{ flex: 1 }}
                                            renderItem={({ item: place, index }) => {
                                                const esElUltimo = index === locationResults.length - 1;
                                                return (
                                                    <TouchableOpacity
                                                        style={[styles.modalItemC, esElUltimo && { borderBottomWidth: 0 }]}
                                                        onPress={() => handleSelectLocation(place)}
                                                        disabled={savingLocation}
                                                    >
                                                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                                                            <FontAwesome6
                                                                name="location-dot"
                                                                size={15}
                                                                color={colors.primary}
                                                                style={{ marginRight: 12, width: 24, textAlign: "center" }}
                                                            />
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={styles.modalItemTextC} numberOfLines={1} ellipsizeMode="tail">
                                                                    {place.name}
                                                                </Text>
                                                                <Text style={styles.locationResultAddress} numberOfLines={1} ellipsizeMode="tail">
                                                                    {place.address}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        <FontAwesome6 name="chevron-right" size={12} color={colors.overlay} />
                                                    </TouchableOpacity>
                                                );
                                            }}
                                            ListEmptyComponent={
                                                locationQuery.trim().length < 2 ? (
                                                    <Text style={styles.emptyTextC}>Escribí el nombre de un lugar para buscarlo.</Text>
                                                ) : searchingLocations ? null : hasSearchedLocations ? (
                                                    <Text style={styles.emptyTextC}>No se encontraron lugares para "{locationQuery.trim()}".</Text>
                                                ) : null
                                            }
                                        />

                                        {savingLocation ? (
                                            <View style={styles.savingRow}>
                                                <ActivityIndicator size="small" color={colors.primary} />
                                                <Text style={styles.savingText}>Guardando ubicación...</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                </KeyboardAvoidingView>
                            </ScreenContainer>
                        </Modal>

                        {/* PICKER DE HORARIOS IOS */}
                        {Platform.OS !== "web" && showTimePicker !== null && Platform.OS === "ios" ? (
                            <Modal
                                transparent
                                animationType="fade"
                                visible={showTimePicker !== null}
                                onRequestClose={closeTimePicker}
                            >
                                <Pressable style={styles.timePickerOverlay} onPress={closeTimePicker}>
                                    <Pressable style={styles.timePickerContainer} onPress={(e) => e.stopPropagation()}>
                                        <DateTimePicker
                                            mode="time"
                                            value={tempDate}
                                            onChange={handleTimeChange}
                                            is24Hour={true}
                                            display="spinner"
                                            style={{ width: 220, height: 160 }}
                                        />
                                        <Pressable style={styles.timePickerDone} onPress={confirmTimePicker}>
                                            <Text style={styles.timePickerDoneText}>Listo</Text>
                                        </Pressable>
                                    </Pressable>
                                </Pressable>
                            </Modal>
                        ) : Platform.OS !== "web" && showTimePicker !== null ? (
                            <DateTimePicker
                                mode="time"
                                value={tempDate}
                                onChange={handleTimeChange}
                                is24Hour={true}
                                display="default"
                            />
                        ) : null}
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: colors.overlayStrong || "rgba(9, 19, 45, 0.7)",
        justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radii.xl || 24,
        borderTopRightRadius: radii.xl || 24,
        padding: spacing.lg,
        maxHeight: "90%",
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.xs,
    },
    title: {
        ...textStyles.tripTitle,
        color: colors.primary,
        fontSize: 20,
    },
    subtitle: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginTop: spacing.xxs,
        marginBottom: spacing.md,
    },
    label: {
        ...textStyles.label,
        textTransform: "none",
        color: colors.primary,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
    },
    iconHint: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginBottom: spacing.sm,
    },
    dropdownButton: {
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    dropdownLeftContent: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        marginRight: 10,
    },
    dropdownText: {
        ...textStyles.body,
        color: colors.textPrimary,
        flex: 1,
    },
    dropdownPlaceholder: {
        ...textStyles.body,
        color: colors.overlay,
        flex: 1,
    },
    inputBox: {
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    inputBoxMultiline: {
        alignItems: "flex-start",
        paddingVertical: spacing.sm,
    },
    inputBoxMultilineIcon: {
        marginTop: 4,
    },
    inputInner: {
        flex: 1,
        color: colors.textPrimary,
        paddingVertical: 8,
        ...textStyles.body,
    },
    dateBox: {
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
    },
    inputMultiline: {
        minHeight: 90,
        maxHeight: 140,
        textAlignVertical: "top",
        paddingTop: 0,
    },
    row: {
        flexDirection: "row",
        gap: spacing.md,
    },
    timeField: {
        flex: 1,
    },
    errorContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        marginTop: spacing.xs,
        paddingHorizontal: spacing.xs,
    },
    errorText: {
        ...textStyles.meta,
        color: colors.danger,
        flex: 1,
    },
    success: {
        ...textStyles.meta,
        color: colors.success ?? "#1f9d55",
        marginTop: spacing.md,
        fontWeight: "700",
    },
    submitButton: {
        marginTop: spacing.xl,
        marginBottom: spacing.md,
    },
    timeText: {
        ...textStyles.body,
        color: colors.textPrimary,
        flex: 1,
    },
    placeholderText: {
        ...textStyles.body,
        color: colors.overlay,
        flex: 1,
    },
    timePickerOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        justifyContent: "center",
        alignItems: "center",
    },
    timePickerContainer: {
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        padding: spacing.lg,
        alignItems: "center",
        minWidth: 260,
    },
    timePickerDone: {
        marginTop: spacing.sm,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
    },
    timePickerDoneText: {
        ...textStyles.body,
        color: colors.primary,
        fontWeight: "700",
    },
    locationInputContainer: {
        position: "relative",
        justifyContent: "center",
    },
    removeLocationButton: {
        position: "absolute",
        right: 36,
        height: 48,
        width: 40,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2,
    },
    locationAddressHint: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginTop: spacing.xxs,
        marginLeft: spacing.xxs,
    },
    // Estilos del modal desplegable (Bottom Sheet)
    modalOverlayC: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "flex-end",
        elevation: 999,
        zIndex: 1000,
    },
    bottomSheetC: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radii.xl || 24,
        borderTopRightRadius: radii.xl || 24,
        padding: 20,
        maxHeight: "80%",
    },
    modalHeaderC: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: spacing.md,
        paddingBottom: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalTitleC: {
        ...textStyles.bodyStrong,
        fontSize: 18,
        color: colors.primary,
    },
    modalItemC: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: spacing.sm + 4,
        paddingHorizontal: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: "#f5f5f5",
    },
    modalItemActiveC: {
        backgroundColor: colors.primarySoft ? `${colors.primarySoft}22` : "#f0f4f8",
        borderRadius: radii.sm || 8,
    },
    modalItemTextC: {
        ...textStyles.body,
        color: colors.textPrimary,
    },
    modalItemTextActiveC: {
        color: colors.primary,
        fontWeight: "700",
    },
    emptyTextC: {
        ...textStyles.meta,
        color: colors.textSecondary,
        textAlign: "center",
        paddingVertical: spacing.lg,
    },
    searchBox: {
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: spacing.sm,
    },
    searchInput: {
        flex: 1,
        color: colors.textPrimary,
        paddingVertical: 8,
        ...textStyles.body,
    },
    locationListFlat: {
        maxHeight: 300,
    },
    locationResultAddress: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginTop: 2,
    },
    savingRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
        paddingVertical: spacing.md,
    },
    savingText: {
        ...textStyles.meta,
        color: colors.textSecondary,
    },
    locationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    },
    locationHeaderSide: {
        width: 40,
    },
    locationBody: {
        flex: 1,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
    },
});