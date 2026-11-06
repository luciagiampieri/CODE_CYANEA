import { useState, useEffect, useRef } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Keyboard,
  KeyboardAvoidingView,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
} from "react-native";
import Modal from "../components/ui/AppModal";
import HoraField from "../components/ui/HoraField";
import OptionSheet from "../components/ui/OptionSheet";
import SelectField from "../components/ui/SelectField";
import SelectorHora, { useSelectorHora } from "../components/ui/SelectorHora";
import { sheetFormStyles } from "../components/ui/sheetFormStyles";
import useScrollACampo from "../hooks/useScrollACampo";
import { FontAwesome6 } from "@expo/vector-icons";

import PrimaryButton from "../components/ui/PrimaryButton";
import {
    searchTripPlaces,
    saveActivityLocation,
    resolveTripPlace,
} from "../services/api";
import { colors, radii, spacing, textStyles } from "../theme/tokens";
import ScreenContainer from "../components/layout/ScreenContainer";
import SearchPickerHeader, { SEARCH_PICKER_EDGES } from "../components/ui/SearchPickerHeader";

import { appAlert } from "../components/ui/AppDialog";
import { ICON_OPTIONS, detectIcon } from "../utils/categoriasActividad";
import { recomendacionDeRespuesta } from "../utils/recomendacionEntradas";
import {
    mostrarAdvertenciaHorario as mostrarAdvertenciaHorarioActividad,
    mostrarConfirmacionTareasEntradas,
    mostrarRecomendacionEntradas,
} from "../utils/dialogosActividad";

// Mismo celeste suave que el buscador de destinos.
const COLOR_SOFT = colors.primarySoft ? `${colors.primarySoft}33` : "#eef2ff";

function mostrarAlertaConfirmacion(titulo, mensaje, onAceptar) {
    appAlert(
        titulo,
        mensaje,
        onAceptar ? [{ text: "Aceptar", onPress: onAceptar }] : undefined
    );
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
    // Tamaño de la pantalla para que "Validando horarios" la cubra entera y quede centrado.
    const pantalla = useWindowDimensions();
    const [nombre, setNombre] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [horaInicio, setHoraInicio] = useState("");
    const [horaFin, setHoraFin] = useState("");

    const selectorHora = useSelectorHora(commitTime);

    const [icono, setIcono] = useState("location-dot");
    const [iconoModificadoManual, setIconoModificadoManual] = useState(false);
    const [modalIconoVisible, setModalIconoVisible] = useState(false);

    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [analizando, setAnalizando] = useState(false);
    const submittingRef = useRef(false);
    const closingRef = useRef(false);

    const [ubicacion, setUbicacion] = useState(null);
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [locationQuery, setLocationQuery] = useState("");
    const [locationResults, setLocationResults] = useState([]);
    const [searchingLocations, setSearchingLocations] = useState(false);
    const [hasSearchedLocations, setHasSearchedLocations] = useState(false);
    const [savingLocation, setSavingLocation] = useState(false);

    const lastQueryLengthRef = useRef(0);

    const { scrollRef, fieldY, scrollToField } = useScrollACampo();

    useEffect(() => {
        if (!iconoModificadoManual) {
            setIcono(detectIcon(nombre));
        }
    }, [nombre]);

    useEffect(() => {
        if (!visible) return;
        closingRef.current = false;

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
        selectorHora.cerrar();
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
        if (closingRef.current) return;
        closingRef.current = true;

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
        selectorHora.cerrar();
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
            const [h, m] = horaInicio.split(":");
            const total = Math.min(parseInt(h, 10) * 60 + parseInt(m, 10) + 60, 23 * 60 + 59);
            baseDate.setHours(Math.floor(total / 60), total % 60, 0, 0);
        }

        selectorHora.abrir(type, baseDate);
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

    // Web: el <input type="time"> del navegador devuelve "HH:MM". Se guarda tal cual y
    // las reglas (fin posterior al inicio, 00:00, etc.) se validan al guardar, como antes.
    function handleWebTimeChange(type, value) {
        if (!value || !isValidTime(value)) return;
        if (type === "inicio") setHoraInicio(value);
        else setHoraFin(value);
        setError("");
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
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 0);
            return;
        }

        if (!isValidTime(horaInicio) || !isValidTime(horaFin)) {
            setError("Ingresá los horarios en formato HH:MM.");
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 0);
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
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 0);
            return;
        }

        await enviarActividad();
    }
    
    function mostrarAdvertenciaHorario(datos, tareasEntradasAEliminar = []) {
        // Se reenvía al confirmar para que la advertencia quede marcada en el itinerario.
        const advertenciaHorario = datos.tipo && datos.resumen
            ? { tipo: datos.tipo, resumen: datos.resumen }
            : null;
        // La recomendación de entradas/reservas llegó con la advertencia: al confirmar el
        // backend no vuelve a analizar el lugar, así que se muestra esta y se reenvía el
        // lugar analizado para que no se repita en próximas ediciones.
        mostrarAdvertenciaHorarioActividad(datos, {
            esEdicion: Boolean(activityToEdit),
            onConfirmar: () =>
                enviarActividad({
                    ignorarAdvertencia: true,
                    advertenciaHorario,
                    googlePlaceIdEntradas: datos.googlePlaceIdEntradas ?? null,
                    recomendacionPrevia: datos.recomendacion ?? null,
                    tareasEntradasAEliminar,
                }),
        });
    }

    async function enviarActividad({
        ignorarAdvertencia = false,
        advertenciaHorario = null,
        googlePlaceIdEntradas = null,
        recomendacionPrevia = null,
        // Tareas de "Recordármelo" que el usuario aceptó eliminar al cambiar el lugar.
        tareasEntradasAEliminar = [],
    } = {}) {
        if (submittingRef.current) return;
        submittingRef.current = true;

        // Sin `ignorarAdvertencia` el backend analiza los horarios del lugar y puede demorar unos segundos.
        setAnalizando(!ignorarAdvertencia);
        setSubmitting(true);
        setError("");
        if (!ignorarAdvertencia) {
            Keyboard.dismiss();
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
        }

        try {
            const resultado = await onSubmit(
                {
                    id: activityToEdit?.id,
                    nombre: nombre.trim(),
                    descripcion: descripcion.trim() || null,
                    horaInicio: `${horaInicio}:00`,
                    horaFin: `${horaFin}:00`,
                    icono,
                    idLugarInteres: ubicacion?.id || null,
                    ...(ignorarAdvertencia && advertenciaHorario ? { advertenciaHorario } : {}),
                    ...(ignorarAdvertencia && googlePlaceIdEntradas ? { googlePlaceIdEntradas } : {}),
                    ...(tareasEntradasAEliminar.length > 0 ? { tareasEntradasAEliminar } : {}),
                },
                { ignorarAdvertencia }
            );

            setSubmitting(false);
            setAnalizando(false);
            submittingRef.current = false;

            // Cambia el lugar de una actividad con tareas pendientes de "Recordármelo":
            // no se guardó nada. Si confirma, se reenvía aceptando eliminarlas; si
            // cancela, el formulario sigue abierto con sus cambios.
            if (resultado?.confirmarTareasEntradas === true) {
                mostrarConfirmacionTareasEntradas(resultado, {
                    onConfirmar: (ids) => enviarActividad({ tareasEntradasAEliminar: ids }),
                });
                return;
            }

            if (resultado?.advertencia === true) {
                mostrarAdvertenciaHorario({
                    mensaje: resultado.mensaje ?? "",
                    horariosApertura: resultado.horariosApertura ?? "",
                    tipo: resultado.tipo ?? null,
                    resumen: resultado.resumen ?? null,
                    nombreLugar: resultado.nombreLugar ?? ubicacion?.name ?? "",
                    nombreActividad: nombre.trim(),
                    horarioActividad: `${horaInicio} a ${horaFin}`,
                    googlePlaceIdEntradas: resultado.googlePlaceIdEntradas ?? null,
                    recomendacion: recomendacionDeRespuesta(resultado),
                }, tareasEntradasAEliminar);
                return;
            }

            const mensajeExito = activityToEdit
                ? "Actividad editada correctamente."
                : "Actividad registrada correctamente.";

            // Si el sitio oficial confirmó que conviene reservar o comprar entradas, se
            // informa en el mismo diálogo de confirmación. No bloquea: la actividad ya
            // quedó guardada y el diálogo ofrece el enlace oficial, "Recordármelo"
            // (tarea en el checklist) y "Ahora no".
            const recomendacionFinal =
                recomendacionDeRespuesta(resultado) || (ignorarAdvertencia ? recomendacionPrevia : null);
            if (recomendacionFinal) {
                // La actividad ya está guardada: el formulario se cierra y la
                // recomendación aparece sobre el itinerario, no sobre el formulario.
                const recordatorio = {
                    tripId,
                    activityId: resultado?.IdActividad ?? resultado?.idActividad ?? activityToEdit?.id,
                };
                resetAndClose();
                mostrarRecomendacionEntradas(recomendacionFinal, {
                    // Corto: va en la franja verde, al lado de la cruz para cerrar.
                    mensajeExito: activityToEdit ? "Actividad editada" : "Actividad registrada",
                    recordatorio,
                });
                return;
            }

            mostrarAlertaConfirmacion("Éxito", mensajeExito, () => {
                resetAndClose();
            });
        } catch (err) {
            setSubmitting(false);
            setAnalizando(false);
            submittingRef.current = false;
            setError(
                err.message ||
                    (activityToEdit
                        ? "No se pudo editar la actividad."
                        : "No se pudo crear la actividad.")
            );
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
                        <ScrollView
                            ref={scrollRef}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: spacing.xl }}
                        >
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
                                        />
                                    </View>

                                    <View style={styles.row}>
                                        <HoraField
                                            label="Hora de inicio"
                                            value={horaInicio}
                                            onPress={() => openTimePicker("inicio")}
                                            onWebChange={(value) => handleWebTimeChange("inicio", value)}
                                        />
                                        <HoraField
                                            label="Hora de fin"
                                            value={horaFin}
                                            onPress={() => openTimePicker("fin")}
                                            onWebChange={(value) => handleWebTimeChange("fin", value)}
                                        />
                                    </View>

                                    {error ? (
                                        <View style={styles.errorContainer}>
                                            <FontAwesome6 name="circle-exclamation" size={14} color={colors.danger} />
                                            <Text style={styles.errorText}>{error}</Text>
                                        </View>
                                    ) : null}

                                    <Text style={styles.label}>Ubicación (opcional)</Text>
                                    <View style={styles.locationInputContainer}>
                                        <TouchableOpacity
                                            style={styles.dropdownButton}
                                            onPress={openLocationPicker}
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
                                            {/* Con una ubicación elegida, en el lugar de la flecha va el botón de eliminar */}
                                            {ubicacion ? (
                                                <View style={styles.removeLocationSpacer} />
                                            ) : (
                                                <FontAwesome6 name="chevron-down" size={14} color={colors.overlay} />
                                            )}
                                        </TouchableOpacity>

                                        {ubicacion ? (
                                            <Pressable
                                                style={styles.removeLocationButton}
                                                onPress={handleRemoveLocation}
                                                hitSlop={8}
                                                accessibilityLabel="Quitar ubicación"
                                            >
                                                <FontAwesome6 name="trash-can" size={16} color={colors.danger} />
                                            </Pressable>
                                        ) : null}
                                    </View>

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
                                        />
                                    </View>

                                    <Text style={styles.label}>Ícono</Text>
                                    <Text style={styles.iconHint}>
                                        Detectado automáticamente. Seleccioná otro para cambiarlo.
                                    </Text>
                                    <SelectField
                                        icono={iconoSeleccionadoObj ? iconoSeleccionadoObj.name : "location-dot"}
                                        valor={iconoSeleccionadoObj ? iconoSeleccionadoObj.label : "Selecciona un ícono"}
                                        onPress={() => setModalIconoVisible(true)}
                                    />

                                    <PrimaryButton
                                        label={
                                            submitting
                                                ? analizando
                                                    ? "Analizando horarios..."
                                                    : "Guardando..."
                                                : activityToEdit
                                                ? "Guardar cambios"
                                                : "Agregar actividad"
                                        }
                                        loading={submitting}
                                        onPress={handleSubmit}
                                        style={styles.submitButton}
                                    />
                            </View>
                        </ScrollView>

                        {/* MODAL DESPLEGABLE PARA SELECCIONAR ÍCONO */}
                        <OptionSheet
                            visible={modalIconoVisible}
                            titulo="Seleccionar ícono"
                            opciones={ICON_OPTIONS}
                            seleccionado={icono}
                            onSelect={handleSelectIcon}
                            onClose={() => setModalIconoVisible(false)}
                        />

                        <Modal statusBarTranslucent
                            animationType="slide"
                            visible={showLocationPicker}
                            onRequestClose={closeLocationPicker}
                        >
                            <ScreenContainer fullWidth padded={false} edges={SEARCH_PICKER_EDGES}>
                                <KeyboardAvoidingView
                                    style={{ flex: 1 }}
                                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                                >
                                    <SearchPickerHeader
                                        title="Seleccionar ubicación"
                                        onBack={closeLocationPicker}
                                        value={locationQuery}
                                        onChangeText={setLocationQuery}
                                        placeholder="Buscar un lugar..."
                                        loading={searchingLocations}
                                    />

                                    <View style={styles.locationBody}>
                                        {locationQuery.trim().length < 2 ? (
                                            <View style={styles.locationIdle}>
                                                <View style={styles.locationIdleIcon}>
                                                    <FontAwesome6 name="map-location-dot" size={22} color={colors.primary} />
                                                </View>
                                                <Text style={styles.locationIdleTitle}>Buscá el lugar de la actividad</Text>
                                                <Text style={styles.locationIdleText}>
                                                    Escribí al menos 2 letras del nombre de un lugar: un museo, un restaurante, un parque...
                                                </Text>
                                            </View>
                                        ) : searchingLocations && locationResults.length === 0 ? (
                                            <View style={styles.locationList}>
                                                {[0, 1, 2].map((n) => (
                                                    <View key={n} style={[styles.locationSkeletonRow, { opacity: 1 - n * 0.2 }]}>
                                                        <View style={styles.locationSkeletonCircle} />
                                                        <View style={{ flex: 1 }}>
                                                            <View style={styles.locationSkeletonLong} />
                                                            <View style={styles.locationSkeletonShort} />
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        ) : locationResults.length > 0 ? (
                                            <FlatList
                                                data={locationResults}
                                                keyExtractor={(place) => place.placeId}
                                                keyboardShouldPersistTaps="handled"
                                                keyboardDismissMode="on-drag"
                                                showsVerticalScrollIndicator={false}
                                                style={{ flex: 1 }}
                                                contentContainerStyle={styles.locationList}
                                                ListHeaderComponent={
                                                    <Text style={styles.locationResultsLabel}>Resultados · tocá para elegir</Text>
                                                }
                                                ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
                                                renderItem={({ item: place }) => (
                                                    <TouchableOpacity
                                                        style={styles.locationItem}
                                                        onPress={() => handleSelectLocation(place)}
                                                        disabled={savingLocation}
                                                        activeOpacity={0.7}
                                                        accessibilityRole="button"
                                                        accessibilityLabel={`Elegir ${place.name}`}
                                                    >
                                                        <View style={styles.locationItemIcon}>
                                                            <FontAwesome6 name="location-dot" size={14} color={colors.primary} />
                                                        </View>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={styles.locationItemName} numberOfLines={1} ellipsizeMode="tail">
                                                                {place.name}
                                                            </Text>
                                                            {place.address ? (
                                                                <Text style={styles.locationItemSub} numberOfLines={1} ellipsizeMode="tail">
                                                                    {place.address}
                                                                </Text>
                                                            ) : null}
                                                        </View>
                                                        <View style={styles.locationItemAction}>
                                                            <FontAwesome6 name="plus" size={12} color={colors.primary} />
                                                        </View>
                                                    </TouchableOpacity>
                                                )}
                                            />
                                        ) : hasSearchedLocations && !searchingLocations ? (
                                            <View style={styles.locationIdle}>
                                                <View style={styles.locationIdleIcon}>
                                                    <FontAwesome6 name="magnifying-glass" size={20} color={colors.textMuted} />
                                                </View>
                                                <Text style={styles.locationIdleTitle}>Sin resultados</Text>
                                                <Text style={styles.locationIdleText}>
                                                    No encontramos lugares para "{locationQuery.trim()}". Probá con otro nombre.
                                                </Text>
                                            </View>
                                        ) : null}

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

                        <SelectorHora selector={selectorHora} />
                    </View>
                </View>
            </KeyboardAvoidingView>

            {/* "Validando horarios" se dibuja como capa de este modal y NO como un Modal
                aparte: al terminar el análisis se abre enseguida el diálogo de advertencia
                o de éxito, y en Android/iOS un Modal nuevo no se muestra si se abre mientras
                otro Modal se está cerrando. Va fuera del KeyboardAvoidingView y ocupa toda
                la pantalla para quedar siempre centrada, como el popup anterior. */}
            {analizando ? (
                <View
                    style={[styles.popupLayer, { width: pantalla.width, height: pantalla.height }]}
                    testID="validando-horarios"
                >
                    <View style={styles.popupCard}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={styles.popupTitle}>Validando horarios</Text>
                        <Text style={styles.popupText}>
                            Estamos validando los horarios del lugar. Esto puede demorar unos segundos.
                        </Text>
                    </View>
                </View>
            ) : null}
        </Modal>
    );
}

const estilosPropios = StyleSheet.create({
    iconHint: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginBottom: spacing.sm,
    },
    analizandoBloque: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        marginTop: spacing.lg,
        backgroundColor: colors.surfaceAlt || "#f5f5f5",
        padding: spacing.md,
        borderRadius: radii.md,
    },
    analizandoContenido: {
        flex: 1,
    },
    analizandoValor: {
        ...textStyles.bodyStrong,
        color: colors.primary,
    },
    analizandoEtiqueta: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginTop: 2,
    },
    locationInputContainer: {
        position: "relative",
        justifyContent: "center",
    },
    removeLocationSpacer: {
        width: 24,
    },
    removeLocationButton: {
        position: "absolute",
        right: 4,
        height: 48,
        width: 40,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2,
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
    // Buscador de ubicación: mismo diseño que el buscador de destinos del viaje.
    locationBody: {
        flex: 1,
        minHeight: 0,
        backgroundColor: colors.background,
    },
    locationList: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.lg,
    },
    locationResultsLabel: {
        ...textStyles.label,
        textTransform: "none",
        color: colors.textSecondary,
        marginBottom: spacing.sm,
    },
    locationItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 56,
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: 6,
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: radii.md,
        backgroundColor: colors.surface,
    },
    locationItemIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLOR_SOFT,
    },
    locationItemName: {
        ...textStyles.bodyStrong,
        color: colors.textPrimary,
        fontWeight: "500",
    },
    locationItemSub: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginTop: 2,
    },
    locationItemAction: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLOR_SOFT,
    },
    locationIdle: {
        alignItems: "center",
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
    },
    locationIdleIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLOR_SOFT,
    },
    locationIdleTitle: {
        ...textStyles.bodyStrong,
        color: colors.textPrimary,
        fontSize: 16,
        textAlign: "center",
    },
    locationIdleText: {
        ...textStyles.meta,
        color: colors.textSecondary,
        textAlign: "center",
    },
    locationSkeletonRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 64,
        paddingHorizontal: spacing.sm + 4,
        marginBottom: 8,
        borderRadius: radii.md,
        backgroundColor: colors.surface,
    },
    locationSkeletonCircle: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: colors.surfaceMuted,
    },
    locationSkeletonLong: {
        width: "60%",
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.surfaceMuted,
    },
    locationSkeletonShort: {
        width: "35%",
        height: 10,
        borderRadius: 5,
        marginTop: 8,
        backgroundColor: colors.surfaceMuted,
    },
    popupLayer: {
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 10,
        elevation: 10,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center",
        alignItems: "center",
        padding: spacing.lg,
    },
    popupCard: {
        backgroundColor: colors.surface,
        borderRadius: radii.xl || 20,
        padding: spacing.xl,
        alignItems: "center",
        width: "85%",
        maxWidth: 320,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
    },
    popupTitle: {
        ...textStyles.bodyStrong,
        fontSize: 18,
        color: colors.primary,
        marginTop: spacing.md,
        marginBottom: spacing.xxs,
        textAlign: "center",
    },
    popupText: {
        ...textStyles.meta,
        color: colors.textSecondary,
        textAlign: "center",
        lineHeight: 18,
    },
});

const styles = { ...sheetFormStyles, ...estilosPropios };
