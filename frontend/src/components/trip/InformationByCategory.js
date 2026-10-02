import { useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    ActivityIndicator,
    Modal,
    TextInput,
    Keyboard,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";
import { centerInScroll } from "../../utils/scrollHelpers";

export const ID_TODAS = "TODAS";

const ALTURA_MAXIMA_LISTA = 360;

const FILTRO_VISIBILIDAD = {
    TODOS: "todos",
    PUBLICOS: "publicos",
    PRIVADOS: "privados",
};

const OPCIONES_VISIBILIDAD = [
    { valor: FILTRO_VISIBILIDAD.TODOS, label: "Todos", icono: "layer-group" },
    { valor: FILTRO_VISIBILIDAD.PUBLICOS, label: "Públicos", icono: "users" },
    { valor: FILTRO_VISIBILIDAD.PRIVADOS, label: "Privados", icono: "lock" },
];

const ETIQUETA_VISIBILIDAD = {
    [FILTRO_VISIBILIDAD.PUBLICOS]: "Públicos",
    [FILTRO_VISIBILIDAD.PRIVADOS]: "Privados",
};

const TIPOS_INFORMACION = [
    { id: "enlace", nombre: "Enlaces", icono: "link" },
    { id: "direccion", nombre: "Direcciones", icono: "location-dot" },
    { id: "contacto", nombre: "Contactos", icono: "address-book" },
    { id: "otro", nombre: "Otros", icono: "circle-info" },
];

const iconoParaTipo = (tipo) => {
    const iconos = {
        enlace: "link",
        direccion: "location-dot",
        contacto: "address-book",
        otro: "circle-info",
    };
    return iconos[tipo?.toLowerCase()] || "circle-info";
};

const TINTE_PRIMARIO = colors.primarySoft ? `${colors.primarySoft}22` : "#eef4ff";

const normalizarTexto = (texto) =>
    (texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

function coincideBusqueda(item, busquedaNormalizada) {
    if (!busquedaNormalizada) return true;
    const titulo = normalizarTexto(item.Titulo);
    const contenido = normalizarTexto(item.Contenido);
    const descripcion = normalizarTexto(item.Descripcion);
    return titulo.includes(busquedaNormalizada) || contenido.includes(busquedaNormalizada) || descripcion.includes(busquedaNormalizada);
}

function coincideVisibilidad(item, filtro) {
    if (filtro === FILTRO_VISIBILIDAD.PUBLICOS) return !!item.EsPublico;
    if (filtro === FILTRO_VISIBILIDAD.PRIVADOS) return !item.EsPublico;
    return true;
}

export default function InformacionRelevantePorTipo({
    items = [],
    onCopiar,
    onEditar,
    onEliminar,
    eliminandoItemId = null,
    scrollRef,
    cardRef,
}) {
    const [abiertas, setAbiertas] = useState({});
    const sectionRefs = useRef({});
    const pendingScrollId = useRef(null);

    const [filtroVisibilidad, setFiltroVisibilidad] = useState(FILTRO_VISIBILIDAD.TODOS);

    const [busqueda, setBusqueda] = useState("");
    const busquedaNormalizada = normalizarTexto(busqueda);
    const hayBusqueda = busquedaNormalizada.length > 0;

    const [tiposFiltro, setTiposFiltro] = useState([]);

    const [panelVisible, setPanelVisible] = useState(false);
    const [panelVista, setPanelVista] = useState("main");
    const [borradorTipos, setBorradorTipos] = useState([]);
    const [borradorVisibilidad, setBorradorVisibilidad] = useState(FILTRO_VISIBILIDAD.TODOS);

    const itemsBuscados = useMemo(
        () => items.filter((i) => coincideBusqueda(i, busquedaNormalizada)),
        [items, busquedaNormalizada]
    );

    const tiposMaestros = useMemo(() => {
        const mapa = new Map();

        TIPOS_INFORMACION.forEach((t) => {
            mapa.set(t.id, {
                id: t.id,
                nombre: t.nombre,
                icono: t.icono,
                items: [],
            });
        });

        items.forEach((item) => {
            const tipoKey = String(item.Tipo || "otro").toLowerCase();
            if (!mapa.has(tipoKey)) {
                mapa.set(tipoKey, {
                    id: tipoKey,
                    nombre: item.Tipo ? item.Tipo.charAt(0).toUpperCase() + item.Tipo.slice(1) : "Otros",
                    icono: "circle-info",
                    items: [],
                });
            }
            if (coincideBusqueda(item, busquedaNormalizada)) {
                mapa.get(tipoKey).items.push(item);
            }
        });

        return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [items, busquedaNormalizada]);

    const tiposConResultados = useMemo(
        () =>
            tiposMaestros
                .map((grupo) => ({
                    ...grupo,
                    items: grupo.items.filter((i) => coincideVisibilidad(i, filtroVisibilidad)),
                }))
                .filter((grupo) => {
                    const pasaFiltroTipo = tiposFiltro.length === 0 || tiposFiltro.includes(grupo.id);
                    return grupo.items.length > 0 && pasaFiltroTipo;
                }),
        [tiposMaestros, filtroVisibilidad, tiposFiltro]
    );

    // Mantiene las secciones abiertas si hay filtros activos o búsqueda, sin alterar el scroll al escribir
    useEffect(() => {
        if (hayBusqueda || tiposFiltro.length > 0 || filtroVisibilidad !== FILTRO_VISIBILIDAD.TODOS) {
            const nextOpened = {};
            tiposConResultados.forEach((grupo) => {
                nextOpened[grupo.id] = true;
            });
            setAbiertas(nextOpened);
        }
    }, [hayBusqueda, tiposFiltro, filtroVisibilidad, tiposConResultados]);

    const totalVisibles = useMemo(
        () => tiposConResultados.reduce((acc, grupo) => acc + grupo.items.length, 0),
        [tiposConResultados]
    );

    const conteoTiposBorrador = useMemo(() => {
        const porTipo = {};
        let total = 0;
        tiposMaestros.forEach((grupo) => {
            const n = grupo.items.filter((i) => coincideVisibilidad(i, borradorVisibilidad)).length;
            porTipo[grupo.id] = n;
            total += n;
        });
        return { porTipo, total };
    }, [tiposMaestros, borradorVisibilidad]);

    const conteoVisibilidadBorrador = useMemo(() => {
        const base =
            borradorTipos.length === 0
                ? itemsBuscados
                : itemsBuscados.filter((i) => borradorTipos.includes(String(i.Tipo || "otro").toLowerCase()));
        const publicos = base.filter((i) => i.EsPublico).length;
        return {
            [FILTRO_VISIBILIDAD.TODOS]: base.length,
            [FILTRO_VISIBILIDAD.PUBLICOS]: publicos,
            [FILTRO_VISIBILIDAD.PRIVADOS]: base.length - publicos,
        };
    }, [itemsBuscados, borradorTipos]);

    const resultadosBorrador = conteoVisibilidadBorrador[borradorVisibilidad];

    useEffect(() => {
        if (items.length === 0) return;
        setTiposFiltro((actual) => {
            const vigentes = actual.filter((id) => tiposMaestros.some((t) => t.id === id));
            return vigentes.length === actual.length ? actual : vigentes;
        });
    }, [tiposMaestros, items.length]);

    const abiertaPorDefecto = tiposConResultados.length === 1 || hayBusqueda;

    function estaAbierta(id) {
        return abiertas[id] ?? abiertaPorDefecto;
    }

    function alternarGrupo(id) {
        Keyboard.dismiss();
        const willOpen = !(abiertas[id] ?? abiertaPorDefecto);
        pendingScrollId.current = willOpen ? id : null;
        setAbiertas((actual) => ({ ...actual, [id]: willOpen }));
    }

    function handleSectionLayout(id) {
        if (pendingScrollId.current !== id) return;
        pendingScrollId.current = null;
        centerSection(id);
    }

    function centerSection(id) {
        const scroller = scrollRef?.current;
        const node = sectionRefs.current[id];
        if (!scroller || !node) return;

        const inner = scroller.getInnerViewRef?.() ?? scroller.getScrollableNode?.();
        if (!inner) return;

        node.measureLayout(
            inner,
            (_x, y, _width, height) => {
                const scrollTo = (viewportHeight) => {
                    const target = height >= viewportHeight ? y - spacing.md : y - (viewportHeight - height) / 2;
                    const offset = Math.max(0, target);
                    if (typeof scroller.scrollTo === "function") {
                        scroller.scrollTo({ y: offset, animated: true });
                    } else if (typeof scroller.scrollToOffset === "function") {
                        scroller.scrollToOffset({ offset, animated: true });
                    }
                };

                if (typeof scroller.measure === "function") {
                    scroller.measure((_a, _b, _c, viewportHeight) =>
                        scrollTo(viewportHeight || 600)
                    );
                } else {
                    scrollTo(600);
                }
            },
            () => {}
        );
    }

    function abrirSoloTipos(ids) {
        if (ids.length === 0) return;
        const nuevoEstado = {};
        tiposMaestros.forEach((grupo) => {
            nuevoEstado[grupo.id] = ids.includes(grupo.id);
        });
        setAbiertas(nuevoEstado);
    }

    function abrirPanel() {
        Keyboard.dismiss();
        setBorradorTipos(tiposFiltro);
        setBorradorVisibilidad(filtroVisibilidad);
        setPanelVista("main");
        setPanelVisible(true);
    }

    function cerrarPanel() {
        setPanelVisible(false);
    }

    function limpiarBorrador() {
        setBorradorTipos([]);
        setBorradorVisibilidad(FILTRO_VISIBILIDAD.TODOS);
    }

    function alternarBorradorTipo(id, count) {
        if (count === 0) return;
        setBorradorTipos((actual) =>
            actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]
        );
    }

    function aplicarFiltros() {
        setFiltroVisibilidad(borradorVisibilidad);
        setTiposFiltro(borradorTipos);
        abrirSoloTipos(borradorTipos);
        setPanelVisible(false);
    }

    function limpiarFiltros() {
        setFiltroVisibilidad(FILTRO_VISIBILIDAD.TODOS);
        setTiposFiltro([]);
        setBusqueda("");
    }

    function quitarTipoFiltro(id) {
        setTiposFiltro((actual) => actual.filter((x) => x !== id));
    }

    const visibilidadActiva = filtroVisibilidad !== FILTRO_VISIBILIDAD.TODOS;
    const cantidadFiltrosActivos = tiposFiltro.length + (visibilidadActiva ? 1 : 0);

    const resumenTiposBorrador =
        borradorTipos.length === 0
            ? "Todos"
            : borradorTipos.length === 1
            ? tiposMaestros.find((t) => t.id === borradorTipos[0])?.nombre ?? "1 seleccionado"
            : `${borradorTipos.length} seleccionados`;

    if (items.length === 0) {
        return (
            <View style={styles.emptyState}>
                <FontAwesome6 name="address-book" size={22} color={colors.textMuted} />
                <Text style={styles.emptyText}>
                    Enlaces, direcciones y contactos útiles para el viaje aparecerán aquí.
                </Text>
            </View>
        );
    }

    const tiposElegidos = tiposMaestros.filter((t) => tiposFiltro.includes(t.id));
    const tiposElegidosSinResultados =
        tiposFiltro.length > 0 &&
        !tiposConResultados.some((t) => tiposFiltro.includes(t.id));
    const hayVacio = totalVisibles === 0 || tiposElegidosSinResultados;

    function listaNombres(nombres) {
        if (nombres.length <= 1) return nombres.join("");
        return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
    }

    function mensajeVacio() {
        if (hayBusqueda) {
            return `No se encontró información para "${busqueda.trim()}"${
                cantidadFiltrosActivos > 0 ? " con los filtros aplicados" : ""
            }.`;
        }
        const tipo = ETIQUETA_VISIBILIDAD[filtroVisibilidad]?.toLowerCase();
        const nombres = listaNombres(tiposElegidos.map((t) => t.nombre));
        if (tipo && nombres) return `No hay información ${tipo} en ${nombres}.`;
        if (tipo) return `No hay información ${tipo}.`;
        if (nombres) return `No hay información en ${nombres}.`;
        return "No hay información para mostrar.";
    }

    return (
        <View style={styles.container}>
            <View style={styles.filaBusqueda}>
                <View style={styles.buscadorBox}>
                    <FontAwesome6 name="magnifying-glass" size={13} color={colors.overlay || colors.textMuted} />
                    <TextInput
                        style={styles.buscadorInput}
                        value={busqueda}
                        onChangeText={setBusqueda}
                        placeholder="Buscar información"
                        placeholderTextColor={colors.overlay || colors.textMuted}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoCapitalize="none"
                        testID="repositorio-buscador"
                        onFocus={() => {
                            if (scrollRef?.current && cardRef?.current) {
                                setTimeout(() => {
                                    centerInScroll(scrollRef.current, cardRef.current, { align: "top", margin: spacing.xs });
                                }, 300);
                            }
                        }}
                    />
                    {busqueda.length > 0 && (
                        <Pressable
                            onPress={() => setBusqueda("")}
                            hitSlop={10}
                            testID="repositorio-buscador-limpiar"
                        >
                            <FontAwesome6 name="circle-xmark" size={15} color={colors.textMuted} />
                        </Pressable>
                    )}
                </View>

                <Pressable
                    onPress={abrirPanel}
                    style={[styles.botonFiltros, cantidadFiltrosActivos > 0 && styles.botonFiltrosActivo]}
                    accessibilityRole="button"
                    testID="repositorio-filtros-abrir"
                >
                    <FontAwesome6
                        name="sliders"
                        size={13}
                        color={cantidadFiltrosActivos > 0 ? colors.textInverse : colors.primary}
                    />
                    <Text
                        style={[
                            styles.botonFiltrosTexto,
                            cantidadFiltrosActivos > 0 && styles.botonFiltrosTextoActivo,
                        ]}
                    >
                        Filtros
                    </Text>
                    {cantidadFiltrosActivos > 0 && (
                        <View style={styles.botonFiltrosBadge}>
                            <Text style={styles.botonFiltrosBadgeTexto}>{cantidadFiltrosActivos}</Text>
                        </View>
                    )}
                </Pressable>
            </View>

            {(tiposElegidos.length > 0 || visibilidadActiva) && (
                <View style={styles.barraFiltros}>
                    {tiposElegidos.map((grupo) => (
                        <Pressable
                            key={grupo.id}
                            onPress={() => quitarTipoFiltro(grupo.id)}
                            style={styles.tagActivo}
                            hitSlop={6}
                            testID={`repositorio-filtro-tag-tipo-${grupo.id}`}
                        >
                            <FontAwesome6 name={grupo.icono} size={11} color={colors.primary} />
                            <Text style={styles.tagActivoTexto} numberOfLines={1}>
                                {grupo.nombre}
                            </Text>
                            <FontAwesome6 name="xmark" size={11} color={colors.primary} />
                        </Pressable>
                    ))}

                    {visibilidadActiva && (
                        <Pressable
                            onPress={() => setFiltroVisibilidad(FILTRO_VISIBILIDAD.TODOS)}
                            style={styles.tagActivo}
                            hitSlop={6}
                            testID="repositorio-filtro-tag-visibilidad"
                        >
                            <FontAwesome6
                                name={filtroVisibilidad === FILTRO_VISIBILIDAD.PUBLICOS ? "users" : "lock"}
                                size={11}
                                color={colors.primary}
                            />
                            <Text style={styles.tagActivoTexto}>{ETIQUETA_VISIBILIDAD[filtroVisibilidad]}</Text>
                            <FontAwesome6 name="xmark" size={11} color={colors.primary} />
                        </Pressable>
                    )}
                </View>
            )}

            {hayVacio && (
                <View style={styles.vacioFiltros}>
                    <FontAwesome6 name="address-book" size={22} color={colors.textMuted} />
                    <Text style={styles.emptyText}>{mensajeVacio()}</Text>
                    {(cantidadFiltrosActivos > 0 || hayBusqueda) && (
                        <Pressable onPress={limpiarFiltros} hitSlop={8} testID="repositorio-vacio-limpiar">
                            <Text style={styles.vacioLimpiarTexto}>
                                {cantidadFiltrosActivos > 0 ? "Limpiar filtros" : "Limpiar búsqueda"}
                            </Text>
                        </Pressable>
                    )}
                </View>
            )}

            {tiposConResultados.map((grupo) => (
                <View
                    key={grupo.id}
                    collapsable={false}
                    onLayout={() => handleSectionLayout(grupo.id)}
                    ref={(node) => {
                        sectionRefs.current[grupo.id] = node;
                    }}
                >
                    <SeccionGrupo
                        grupo={grupo}
                        abierta={estaAbierta(grupo.id)}
                        onToggle={() => alternarGrupo(grupo.id)}
                        onCopiar={onCopiar}
                        onEditar={onEditar}
                        onEliminar={onEliminar}
                        eliminandoItemId={eliminandoItemId}
                    />
                </View>
            ))}

            <Modal animationType="slide" transparent visible={panelVisible} onRequestClose={cerrarPanel}>
                <View style={styles.overlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={cerrarPanel} />

                    <View style={styles.sheet}>
                        <View style={styles.sheetHandle} />

                        {panelVista === "main" ? (
                            <>
                                <View style={styles.sheetHeader}>
                                    <Text style={styles.sheetTitulo}>Filtros</Text>
                                    <Pressable onPress={cerrarPanel} hitSlop={12} testID="repositorio-filtros-cerrar">
                                        <FontAwesome6 name="xmark" size={18} color={colors.textMuted} />
                                    </Pressable>
                                </View>

                                <ScrollView
                                    style={styles.sheetScroll}
                                    contentContainerStyle={styles.sheetContenido}
                                    showsVerticalScrollIndicator={false}
                                >
                                    <Text style={styles.filtroLabel}>Visibilidad</Text>
                                    <View style={styles.visibilidadContainer}>
                                        {OPCIONES_VISIBILIDAD.map((op) => {
                                            const activo = borradorVisibilidad === op.valor;
                                            return (
                                                <Pressable
                                                    key={op.valor}
                                                    onPress={() => setBorradorVisibilidad(op.valor)}
                                                    style={[styles.visibilidadOpcion, activo && styles.visibilidadOpcionActiva]}
                                                    accessibilityRole="button"
                                                    accessibilityState={{ selected: activo }}
                                                    testID={`repositorio-visibilidad-${op.valor}`}
                                                >
                                                    <FontAwesome6
                                                        name={op.icono}
                                                        size={12}
                                                        color={activo ? colors.textInverse : colors.primary}
                                                    />
                                                    <Text style={[styles.visibilidadTexto, activo && styles.visibilidadTextoActivo]}>
                                                        {op.label}
                                                    </Text>
                                                    <Text style={[styles.visibilidadCantidad, activo && styles.visibilidadCantidadActiva]}>
                                                        {conteoVisibilidadBorrador[op.valor]}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>

                                    <Text style={[styles.filtroLabel, { marginTop: spacing.lg }]}>Más filtros</Text>
                                    <View style={styles.settingsCard}>
                                        <SettingsRow
                                            active={borradorTipos.length > 0}
                                            icon="tags"
                                            label="Categorías"
                                            value={resumenTiposBorrador}
                                            onPress={() => setPanelVista("types")}
                                            testID="repositorio-filtro-tipos"
                                        />
                                    </View>
                                </ScrollView>

                                <View style={styles.sheetFooter}>
                                    <Pressable
                                        onPress={limpiarBorrador}
                                        style={styles.botonSecundario}
                                        testID="repositorio-filtros-limpiar"
                                    >
                                        <Text style={styles.botonSecundarioTexto}>Limpiar</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={aplicarFiltros}
                                        disabled={resultadosBorrador === 0}
                                        style={[styles.botonPrimario, resultadosBorrador === 0 && styles.botonPrimarioDeshabilitado]}
                                        testID="repositorio-filtros-aplicar"
                                    >
                                        <Text style={styles.botonPrimarioTexto}>
                                            {resultadosBorrador === 0
                                                ? "Sin resultados"
                                                : `Ver ${resultadosBorrador} ítem${resultadosBorrador === 1 ? "" : "s"}`}
                                        </Text>
                                    </Pressable>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={styles.sheetHeader}>
                                    <Pressable
                                        onPress={() => setPanelVista("main")}
                                        style={styles.backButton}
                                        testID="repositorio-types-back"
                                    >
                                        <FontAwesome6 color={colors.primary} name="chevron-left" size={16} />
                                        <Text style={styles.sheetTitulo}>Categorías</Text>
                                    </Pressable>
                                    {borradorTipos.length > 0 ? (
                                        <Pressable onPress={() => setBorradorTipos([])} testID="repositorio-types-clear">
                                            <Text style={styles.headerLink}>Borrar</Text>
                                        </Pressable>
                                    ) : null}
                                </View>

                                <Text style={styles.subHint}>Podés elegir varias. Sin selección se muestran todas.</Text>

                                <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
                                    {tiposMaestros.map((grupo, index) => {
                                        const active = borradorTipos.includes(grupo.id);
                                        const count = conteoTiposBorrador.porTipo[grupo.id] ?? 0;
                                        const isLast = index === tiposMaestros.length - 1;
                                        return (
                                            <Pressable
                                                key={grupo.id}
                                                onPress={() => alternarBorradorTipo(grupo.id, count)}
                                                style={[
                                                    styles.categoryRow,
                                                    !isLast && styles.categoryRowDivider,
                                                    count === 0 && styles.categoryRowEmpty,
                                                ]}
                                                testID={`repositorio-filter-${grupo.id}`}
                                            >
                                                <View style={styles.settingsIcon}>
                                                    <FontAwesome6
                                                        color={colors.primary}
                                                        name={grupo.icono}
                                                        size={13}
                                                    />
                                                </View>
                                                <Text numberOfLines={1} style={styles.categoryName}>
                                                    {grupo.nombre}
                                                </Text>
                                                <Text style={styles.categoryCount}>{count}</Text>
                                                <View style={[styles.checkbox, active && styles.checkboxActive]}>
                                                    {active ? (
                                                        <FontAwesome6 color={colors.textInverse} name="check" size={11} />
                                                    ) : null}
                                                </View>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>

                                <View style={styles.sheetFooter}>
                                    <Pressable
                                        onPress={() => setPanelVista("main")}
                                        style={styles.botonPrimario}
                                        testID="repositorio-types-done"
                                    >
                                        <Text style={styles.botonPrimarioTexto}>Listo</Text>
                                    </Pressable>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function SettingsRow({ icon, label, value, active, onPress, testID }) {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={styles.settingsRowMain}
            testID={testID}
        >
            <View style={styles.settingsIcon}>
                <FontAwesome6 color={colors.primary} name={icon} size={13} />
            </View>
            <Text style={styles.settingsLabel}>{label}</Text>
            <Text numberOfLines={1} style={[styles.settingsValue, active && styles.settingsValueActive]}>
                {value}
            </Text>
            <FontAwesome6 color={colors.textMuted} name="chevron-right" size={12} />
        </Pressable>
    );
}

function SeccionGrupo({
    grupo,
    abierta,
    onToggle,
    onCopiar,
    onEditar,
    onEliminar,
    eliminandoItemId,
}) {
    return (
        <View style={styles.seccion}>
            <Pressable
                onPress={onToggle}
                style={[styles.seccionHeader, abierta && styles.seccionHeaderAbierta]}
                accessibilityRole="button"
                accessibilityState={{ expanded: abierta }}
                testID={`repositorio-categoria-header-${grupo.id}`}
            >
                <FontAwesome6
                    name={abierta ? "chevron-down" : "chevron-right"}
                    size={13}
                    color={colors.primary}
                    style={styles.seccionChevron}
                />
                <FontAwesome6
                    name={grupo.icono}
                    size={14}
                    color={colors.primary}
                />
                <Text style={styles.seccionTitulo} numberOfLines={1}>
                    {grupo.nombre}
                </Text>
                <View style={styles.seccionContadorBadge}>
                    <Text style={styles.seccionContador}>{grupo.items.length}</Text>
                </View>
            </Pressable>

            {abierta && (
                <ScrollView
                    style={styles.listaScroll}
                    contentContainerStyle={styles.listaContenido}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                >
                    {grupo.items.map((item) => (
                        <RepositorioItemCard
                            key={item.IdItemRepositorio}
                            item={item}
                            onCopiar={onCopiar}
                            onEditar={onEditar}
                            onEliminar={onEliminar}
                            eliminando={eliminandoItemId === item.IdItemRepositorio}
                        />
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

function RepositorioItemCard({ item, onCopiar, onEditar, onEliminar, eliminando }) {
    return (
        <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
                <FontAwesome6 name={iconoParaTipo(item.Tipo)} size={16} color={colors.primary} />
                <View style={styles.cardBody}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <Text style={[styles.cardNombre, { flexShrink: 1 }]} numberOfLines={1}>
                            {item.Titulo}
                        </Text>
                        <View
                            style={{
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 6,
                                backgroundColor: item.EsPublico ? "#e0f2fe" : "#f3e8ff",
                            }}
                        >
                            <Text style={{ fontSize: 10, fontWeight: "700", color: item.EsPublico ? "#0369a1" : "#6b21a8" }}>
                                {item.EsPublico ? "PÚBLICO" : "PRIVADO"}
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.cardContenido} numberOfLines={2}>
                        {item.Contenido}
                    </Text>
                    {item.Descripcion ? (
                        <Text style={styles.cardDescripcion} numberOfLines={2}>
                            {item.Descripcion}
                        </Text>
                    ) : null}
                    <Text style={styles.cardMeta}>
                        Subido por {item.NombreUsuarioCreador}
                    </Text>
                </View>
            </View>

            <View style={styles.cardAcciones}>
                <Pressable
                    onPress={() => onCopiar?.(item.Contenido)}
                    style={styles.accionBoton}
                    hitSlop={8}
                    testID={`repositorio-copiar-${item.IdItemRepositorio}`}
                >
                    <FontAwesome6 name="copy" size={12} color={colors.textSecondary} />
                    <Text style={styles.accionTexto}>Copiar</Text>
                </Pressable>

                {item.EsPropio && (
                    <>
                        <Pressable
                            onPress={() => onEditar?.(item)}
                            style={styles.accionBoton}
                            hitSlop={8}
                            testID={`repositorio-editar-${item.IdItemRepositorio}`}
                        >
                            <FontAwesome6 name="pen" size={12} color={colors.textSecondary} />
                            <Text style={styles.accionTexto}>Editar</Text>
                        </Pressable>

                        <Pressable
                            onPress={() => onEliminar?.(item)}
                            disabled={eliminando}
                            style={[styles.accionBoton, eliminando && styles.accionBotonDisabled]}
                            hitSlop={8}
                            testID={`repositorio-eliminar-${item.IdItemRepositorio}`}
                        >
                            {eliminando ? (
                                <ActivityIndicator size="small" color={colors.danger || "#dc2626"} />
                            ) : (
                                <FontAwesome6
                                    name="trash"
                                    size={12}
                                    color={colors.danger || "#dc2626"}
                                />
                            )}
                            <Text style={[styles.accionTexto, styles.accionTextoDanger]}>
                                {eliminando ? "Eliminando..." : "Eliminar"}
                            </Text>
                        </Pressable>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: spacing.md,
    },
    filaBusqueda: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
    },
    buscadorBox: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        height: 38,
        paddingHorizontal: spacing.md,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
    },
    buscadorInput: {
        flex: 1,
        paddingVertical: 0,
        color: colors.textPrimary,
        ...textStyles.body,
    },
    barraFiltros: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: spacing.xs + 2,
    },
    botonFiltros: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: spacing.md,
        height: 38,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.primary,
        backgroundColor: colors.surface,
    },
    botonFiltrosActivo: {
        backgroundColor: colors.primary,
    },
    botonFiltrosTexto: {
        ...textStyles.meta,
        fontSize: 13,
        color: colors.primary,
        fontWeight: "700",
    },
    botonFiltrosTextoActivo: {
        color: colors.textInverse,
    },
    botonFiltrosBadge: {
        minWidth: 18,
        height: 18,
        paddingHorizontal: 5,
        borderRadius: 9,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
    },
    botonFiltrosBadgeTexto: {
        fontSize: 11,
        fontWeight: "800",
        color: colors.primary,
    },
    tagActivo: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        maxWidth: 200,
        paddingHorizontal: spacing.sm + 2,
        height: 32,
        borderRadius: radii.pill,
        backgroundColor: TINTE_PRIMARIO,
    },
    tagActivoTexto: {
        ...textStyles.meta,
        color: colors.primary,
        fontWeight: "700",
        flexShrink: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: colors.overlayStrong || "rgba(9, 19, 45, 0.7)",
        justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radii.xl || 24,
        borderTopRightRadius: radii.xl || 24,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xl,
        maxHeight: "85%",
    },
    sheetHandle: {
        alignSelf: "center",
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.border,
        marginBottom: spacing.sm,
    },
    sheetHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingBottom: spacing.sm,
        marginBottom: spacing.xs,
    },
    sheetTitulo: {
        ...textStyles.tripTitle,
        color: colors.primary,
        fontSize: 20,
    },
    sheetScroll: {
        flexGrow: 0,
    },
    sheetContenido: {
        paddingVertical: spacing.sm,
    },
    filtroLabel: {
        ...textStyles.meta,
        color: colors.textSecondary,
        fontWeight: "700",
        letterSpacing: 0.3,
        marginBottom: spacing.sm,
    },
    subHint: {
        ...textStyles.meta,
        color: colors.textMuted,
        marginBottom: spacing.sm,
    },
    headerLink: {
        ...textStyles.meta,
        color: colors.primary,
        fontWeight: "700",
    },
    backButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
    },
    sheetFooter: {
        flexDirection: "row",
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    botonSecundario: {
        flex: 1,
        height: 48,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    botonSecundarioTexto: {
        ...textStyles.bodyStrong,
        color: colors.primary,
    },
    botonPrimario: {
        flex: 2,
        height: 48,
        borderRadius: radii.md,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    botonPrimarioDeshabilitado: {
        opacity: 0.45,
    },
    botonPrimarioTexto: {
        ...textStyles.bodyStrong,
        color: colors.textInverse,
    },
    visibilidadContainer: {
        flexDirection: "row",
        backgroundColor: TINTE_PRIMARIO,
        borderRadius: radii.md,
        padding: 3,
        gap: 3,
    },
    visibilidadOpcion: {
        flex: 1,
        flexDirection: "row",
        height: 40,
        borderRadius: 9,
        justifyContent: "center",
        alignItems: "center",
        gap: 6,
    },
    visibilidadOpcionActiva: {
        backgroundColor: colors.primary,
    },
    visibilidadTexto: {
        ...textStyles.meta,
        color: colors.primary,
        fontWeight: "600",
    },
    visibilidadTextoActivo: {
        color: colors.textInverse,
        fontWeight: "700",
    },
    visibilidadCantidad: {
        fontSize: 11,
        fontWeight: "700",
        color: colors.textSecondary,
    },
    visibilidadCantidadActiva: {
        color: colors.textInverse,
        opacity: 0.85,
    },
    settingsCard: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        overflow: "hidden",
    },
    settingsRowMain: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        minHeight: 54,
        paddingHorizontal: spacing.md,
    },
    settingsIcon: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: TINTE_PRIMARIO,
    },
    settingsLabel: {
        ...textStyles.body,
        color: colors.textPrimary,
        flex: 1,
    },
    settingsValue: {
        ...textStyles.meta,
        color: colors.textMuted,
    },
    settingsValueActive: {
        color: colors.primary,
        fontWeight: "700",
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: spacing.sm,
    },
    checkboxActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    categoryRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        minHeight: 52,
        paddingHorizontal: spacing.md,
    },
    categoryRowDivider: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    categoryRowEmpty: {
        opacity: 0.45,
    },
    categoryName: {
        ...textStyles.body,
        flex: 1,
        color: colors.textPrimary,
    },
    categoryCount: {
        ...textStyles.meta,
        color: colors.textMuted,
        fontWeight: "600",
    },
    vacioFiltros: {
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
        paddingVertical: spacing.lg,
    },
    vacioLimpiarTexto: {
        ...textStyles.meta,
        color: colors.primary,
        fontWeight: "700",
        textDecorationLine: "underline",
    },
    seccion: {
        gap: spacing.sm,
    },
    seccionHeader: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        gap: spacing.sm,
    },
    seccionHeaderAbierta: {
        borderColor: colors.primary,
    },
    seccionChevron: {
        width: 14,
        textAlign: "center",
    },
    seccionTitulo: {
        ...textStyles.bodyStrong,
        flex: 1,
        color: colors.primary,
    },
    seccionContadorBadge: {
        minWidth: 24,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radii.pill,
        backgroundColor: colors.primary,
        alignItems: "center",
    },
    seccionContador: {
        ...textStyles.meta,
        color: colors.textInverse,
        fontWeight: "700",
    },
    listaScroll: {
        maxHeight: ALTURA_MAXIMA_LISTA,
    },
    listaContenido: {
        gap: spacing.sm,
        paddingBottom: 2,
    },
    card: {
        ...surfaces.card,
        padding: spacing.md,
        gap: 6,
    },
    cardHeaderRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.sm,
    },
    cardBody: {
        flex: 1,
    },
    cardNombre: {
        ...textStyles.bodyStrong,
        color: colors.textPrimary,
    },
    cardContenido: {
        ...textStyles.body,
        color: colors.textSecondary,
        marginTop: 2,
    },
    cardDescripcion: {
        ...textStyles.meta,
        color: colors.textMuted,
        marginTop: 2,
    },
    cardMeta: {
        ...textStyles.meta,
        color: colors.textMuted,
        fontSize: 11,
        marginTop: 4,
    },
    cardAcciones: {
        flexDirection: "row",
        gap: spacing.md,
        marginTop: 6,
    },
    accionBoton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    accionBotonDisabled: {
        opacity: 0.6,
    },
    accionTexto: {
        ...textStyles.meta,
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: "600",
    },
    accionTextoDanger: {
        color: colors.danger || "#dc2626",
    },
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
        paddingVertical: spacing.lg,
    },
    emptyText: {
        ...textStyles.meta,
        color: colors.textSecondary,
        textAlign: "center",
    },
});