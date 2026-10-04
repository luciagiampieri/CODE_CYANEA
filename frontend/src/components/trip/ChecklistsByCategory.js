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

const FILTRO_ASIGNACION = {
    TODAS: "todos",
    MIS_TAREAS: "mis_tareas",
};

const OPCIONES_ASIGNACION = [
    { valor: FILTRO_ASIGNACION.TODAS, label: "Todas", icono: "layer-group" },
    { valor: FILTRO_ASIGNACION.MIS_TAREAS, label: "Mis tareas", icono: "user-check" },
];

const ETIQUETA_ASIGNACION = {
    [FILTRO_ASIGNACION.MIS_TAREAS]: "Mis tareas",
};

const ICONOS_CATEGORIAS_CHECKLIST = {
    "Documentación": "passport",
    "Transporte": "car",
    "Alojamiento": "hotel",
    "Equipamiento": "suitcase",
    "Salud": "kit-medical",
    "Seguros": "shield-halved",
    "Finanzas": "money-bill-transfer",
    "Comida": "utensils",
    "Otros": "list-check",
};

const iconoCategoria = (nombre) => ICONOS_CATEGORIAS_CHECKLIST[nombre] || "tags";

const TINTE_PRIMARIO = colors.primarySoft ? `${colors.primarySoft}22` : "#eef4ff";

const normalizarTexto = (texto) =>
    (texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

function coincideBusqueda(tarea, busquedaNormalizada) {
    if (!busquedaNormalizada) return true;
    return normalizarTexto(tarea.Nombre).includes(busquedaNormalizada);
}

function coincideAsignacion(tarea, filtro, currentUserId) {
    if (filtro === FILTRO_ASIGNACION.MIS_TAREAS) {
        return tarea.Responsables?.some((r) => String(r.IdUsuario) === String(currentUserId));
    }
    return true;
}

export default function ChecklistsByCategory({
    checklists = [],
    onEditar,
    onEliminar,
    onToggle,
    puedeCompletar = true,
    eliminandoChecklistId = null,
    tripHasLeft = false,
    currentUserId,
    scrollRef,
    cardRef,
}) {
    const [abiertas, setAbiertas] = useState({});
    const sectionRefs = useRef({});
    const pendingScrollId = useRef(null);

    const [filtroAsignacion, setFiltroAsignacion] = useState(FILTRO_ASIGNACION.TODAS);

    const [busqueda, setBusqueda] = useState("");
    const busquedaNormalizada = normalizarTexto(busqueda);
    const hayBusqueda = busquedaNormalizada.length > 0;

    const [categoriasFiltro, setCategoriasFiltro] = useState([]);

    const [panelVisible, setPanelVisible] = useState(false);
    const [panelVista, setPanelVista] = useState("main");
    const [borradorCategorias, setBorradorCategorias] = useState([]);
    const [borradorAsignacion, setBorradorAsignacion] = useState(FILTRO_ASIGNACION.TODAS);

    const tareasBuscadas = useMemo(
        () => checklists.filter((t) => coincideBusqueda(t, busquedaNormalizada)),
        [checklists, busquedaNormalizada]
    );

    const categoriasMaestras = useMemo(() => {
        const mapa = new Map();

        checklists.forEach((tarea) => {
            const key = tarea.CategoriaChecklist?.IdCategoriaChecklist ? String(tarea.CategoriaChecklist.IdCategoriaChecklist) : "otros_id";
            const nombreCat = tarea.CategoriaChecklist?.Nombre || "Otros";

            if (!mapa.has(key)) {
                mapa.set(key, {
                    id: key,
                    nombre: nombreCat,
                    tareas: [],
                });
            }
            if (coincideBusqueda(tarea, busquedaNormalizada)) {
                mapa.get(key).tareas.push(tarea);
            }
        });

        Object.keys(ICONOS_CATEGORIAS_CHECKLIST).forEach((nombreStd, index) => {
            const existe = Array.from(mapa.values()).some(
                (c) => c.nombre.trim().toLowerCase() === nombreStd.trim().toLowerCase()
            );
            if (!existe) {
                mapa.set(`std-${index}`, {
                    id: `std-${index}`,
                    nombre: nombreStd,
                    tareas: [],
                });
            }
        });

        const esOtros = (nombre) => (nombre || "").trim().toLowerCase() === "otros";

        return Array.from(mapa.values()).sort((a, b) => {
            const aEsOtros = esOtros(a.nombre);
            const bEsOtros = esOtros(b.nombre);
            if (aEsOtros && !bEsOtros) return 1;
            if (!aEsOtros && bEsOtros) return -1;
            return a.nombre.localeCompare(b.nombre);
        });
    }, [checklists, busquedaNormalizada]);

    const categoriasConResultados = useMemo(
        () =>
            categoriasMaestras
                .map((cat) => ({
                    ...cat,
                    tareas: cat.tareas.filter((t) => coincideAsignacion(t, filtroAsignacion, currentUserId)),
                }))
                .filter((cat) => {
                    const pasaFiltroCategoria = categoriasFiltro.length === 0 || categoriasFiltro.includes(cat.id);
                    return cat.tareas.length > 0 && pasaFiltroCategoria;
                }),
        [categoriasMaestras, filtroAsignacion, categoriasFiltro, currentUserId]
    );

    useEffect(() => {
        if (hayBusqueda || categoriasFiltro.length > 0 || filtroAsignacion !== FILTRO_ASIGNACION.TODAS) {
            const nextOpened = {};
            categoriasConResultados.forEach((cat) => {
                nextOpened[cat.id] = true;
            });
            setAbiertas(nextOpened);
        }
    }, [hayBusqueda, categoriasFiltro, filtroAsignacion, categoriasConResultados]);

    const totalVisibles = useMemo(
        () => categoriasConResultados.reduce((acc, cat) => acc + cat.tareas.length, 0),
        [categoriasConResultados]
    );

    const conteoCategoriasBorrador = useMemo(() => {
        const porCategoria = {};
        let total = 0;
        categoriasMaestras.forEach((cat) => {
            const n = cat.tareas.filter((t) => coincideAsignacion(t, borradorAsignacion, currentUserId)).length;
            porCategoria[cat.id] = n;
            total += n;
        });
        return { porCategoria, total };
    }, [categoriasMaestras, borradorAsignacion, currentUserId]);

    const conteoAsignacionBorrador = useMemo(() => {
        const base =
            borradorCategorias.length === 0
                ? tareasBuscadas
                : tareasBuscadas.filter((t) => {
                        const key = t.CategoriaChecklist?.IdCategoriaChecklist ? String(t.CategoriaChecklist.IdCategoriaChecklist) : "otros_id";
                        return borradorCategorias.includes(key);
                    });
        const misTareas = base.filter((t) => t.Responsables?.some((r) => String(r.IdUsuario) === String(currentUserId))).length;
        return {
            [FILTRO_ASIGNACION.TODAS]: base.length,
            [FILTRO_ASIGNACION.MIS_TAREAS]: misTareas,
        };
    }, [tareasBuscadas, borradorCategorias, currentUserId]);

    const resultadosBorrador = conteoAsignacionBorrador[borradorAsignacion];

    useEffect(() => {
        if (checklists.length === 0) return;
        setCategoriasFiltro((actual) => {
            const vigentes = actual.filter((id) => categoriasMaestras.some((c) => c.id === id));
            return vigentes.length === actual.length ? actual : vigentes;
        });
    }, [categoriasMaestras, checklists.length]);

    const abiertaPorDefecto = categoriasConResultados.length === 1 || hayBusqueda;

    function estaAbierta(id) {
        return abiertas[id] ?? abiertaPorDefecto;
    }

    function alternarCategoria(id) {
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

    function abrirSoloCategorias(ids) {
        if (ids.length === 0) return;
        const nuevoEstado = {};
        categoriasMaestras.forEach((cat) => {
            nuevoEstado[cat.id] = ids.includes(cat.id);
        });
        setAbiertas(nuevoEstado);
    }

    function abrirPanel() {
        Keyboard.dismiss();
        setBorradorCategorias(categoriasFiltro);
        setBorradorAsignacion(filtroAsignacion);
        setPanelVista("main");
        setPanelVisible(true);
    }

    function cerrarPanel() {
        setPanelVisible(false);
    }

    function limpiarBorrador() {
        setBorradorCategorias([]);
        setBorradorAsignacion(FILTRO_ASIGNACION.TODAS);
    }

    function alternarBorradorCategoria(id, count) {
        if (count === 0) return;
        setBorradorCategorias((actual) =>
            actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]
        );
    }

    function aplicarFiltros() {
        setFiltroAsignacion(borradorAsignacion);
        setCategoriasFiltro(borradorCategorias);
        abrirSoloCategorias(borradorCategorias);
        setPanelVisible(false);
    }

    function limpiarFiltros() {
        setFiltroAsignacion(FILTRO_ASIGNACION.TODAS);
        setCategoriasFiltro([]);
        setBusqueda("");
    }

    function quitarCategoriaFiltro(id) {
        setCategoriasFiltro((actual) => actual.filter((x) => x !== id));
    }

    const asignacionActiva = filtroAsignacion !== FILTRO_ASIGNACION.TODAS;
    const cantidadFiltrosActivos = categoriasFiltro.length + (asignacionActiva ? 1 : 0);

    const resumenCategoriasBorrador =
        borradorCategorias.length === 0
            ? "Todas"
            : borradorCategorias.length === 1
            ? categoriasMaestras.find((c) => c.id === borradorCategorias[0])?.nombre ?? "1 seleccionada"
            : `${borradorCategorias.length} seleccionadas`;

    if (checklists.length === 0) {
        return (
            <View style={styles.emptyState}>
                <FontAwesome6 name="list-check" size={22} color={colors.textMuted} />
                <Text style={styles.emptyText}>
                    Todavía no hay tareas creadas para este viaje.
                </Text>
            </View>
        );
    }

    const categoriasElegidas = categoriasMaestras.filter((c) => categoriasFiltro.includes(c.id));
    const categoriasElegidasSinResultados =
        categoriasFiltro.length > 0 &&
        !categoriasConResultados.some((c) => categoriasFiltro.includes(c.id));
    const hayVacio = totalVisibles === 0 || categoriasElegidasSinResultados;

    function listaNombres(nombres) {
        if (nombres.length <= 1) return nombres.join("");
        return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
    }

    function mensajeVacio() {
        if (hayBusqueda) {
            return `No se encontraron tareas para "${busqueda.trim()}"${
                cantidadFiltrosActivos > 0 ? " con los filtros aplicados" : ""
            }.`;
        }
        const tipo = ETIQUETA_ASIGNACION[filtroAsignacion]?.toLowerCase();
        const nombres = listaNombres(categoriasElegidas.map((c) => c.nombre));
        if (tipo && nombres) return `No hay tareas en ${tipo} dentro de ${nombres}.`;
        if (tipo) return `No tenés tareas asignadas.`;
        if (nombres) return `No hay tareas en ${nombres}.`;
        return "No hay tareas para mostrar.";
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
                        placeholder="Buscar tarea"
                        placeholderTextColor={colors.overlay || colors.textMuted}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoCapitalize="none"
                        testID="checklist-buscador"
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
                            testID="checklist-buscador-limpiar"
                        >
                            <FontAwesome6 name="circle-xmark" size={15} color={colors.textMuted} />
                        </Pressable>
                    )}
                </View>

                <Pressable
                    onPress={abrirPanel}
                    style={[styles.botonFiltros, cantidadFiltrosActivos > 0 && styles.botonFiltrosActivo]}
                    accessibilityRole="button"
                    testID="checklist-filtros-abrir"
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

            {(categoriasElegidas.length > 0 || asignacionActiva) && (
                <View style={styles.barraFiltros}>
                    {categoriasElegidas.map((cat) => (
                        <Pressable
                            key={cat.id}
                            onPress={() => quitarCategoriaFiltro(cat.id)}
                            style={styles.tagActivo}
                            hitSlop={6}
                        >
                            <FontAwesome6 name={iconoCategoria(cat.nombre)} size={11} color={colors.primary} />
                            <Text style={styles.tagActivoTexto} numberOfLines={1}>
                                {cat.nombre}
                            </Text>
                            <FontAwesome6 name="xmark" size={11} color={colors.primary} />
                        </Pressable>
                    ))}

                    {asignacionActiva && (
                        <Pressable
                            onPress={() => setFiltroAsignacion(FILTRO_ASIGNACION.TODAS)}
                            style={styles.tagActivo}
                            hitSlop={6}
                        >
                            <FontAwesome6
                                name="user-check"
                                size={11}
                                color={colors.primary}
                            />
                            <Text style={styles.tagActivoTexto}>{ETIQUETA_ASIGNACION[filtroAsignacion]}</Text>
                            <FontAwesome6 name="xmark" size={11} color={colors.primary} />
                        </Pressable>
                    )}
                </View>
            )}

            {hayVacio && (
                <View style={styles.vacioFiltros}>
                    <FontAwesome6 name="list-check" size={22} color={colors.textMuted} />
                    <Text style={styles.emptyText}>{mensajeVacio()}</Text>
                    {(cantidadFiltrosActivos > 0 || hayBusqueda) && (
                        <Pressable onPress={limpiarFiltros} hitSlop={8}>
                            <Text style={styles.vacioLimpiarTexto}>
                                {cantidadFiltrosActivos > 0 ? "Limpiar filtros" : "Limpiar búsqueda"}
                            </Text>
                        </Pressable>
                    )}
                </View>
            )}

            {categoriasConResultados.map((cat) => (
                <View
                    key={cat.id}
                    collapsable={false}
                    onLayout={() => handleSectionLayout(cat.id)}
                    ref={(node) => {
                        sectionRefs.current[cat.id] = node;
                    }}
                >
                    <SeccionCategoria
                        categoria={cat}
                        abierta={estaAbierta(cat.id)}
                        onToggleSeccion={() => alternarCategoria(cat.id)}
                        onToggleTarea={onToggle}
                        onEditar={onEditar}
                        onEliminar={onEliminar}
                        puedeCompletar={puedeCompletar}
                        eliminandoChecklistId={eliminandoChecklistId}
                        tripHasLeft={tripHasLeft}
                    />
                </View>
            ))}

            {/* MODAL DE FILTROS */}
            <Modal animationType="slide" transparent visible={panelVisible} onRequestClose={cerrarPanel}>
                <View style={styles.overlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={cerrarPanel} />

                    <View style={styles.sheet}>
                        <View style={styles.sheetHandle} />

                        {panelVista === "main" ? (
                            <>
                                <View style={styles.sheetHeader}>
                                    <Text style={styles.sheetTitulo}>Filtros</Text>
                                    <Pressable onPress={cerrarPanel} hitSlop={12}>
                                        <FontAwesome6 name="xmark" size={18} color={colors.textMuted} />
                                    </Pressable>
                                </View>

                                <ScrollView
                                    style={styles.sheetScroll}
                                    contentContainerStyle={styles.sheetContenido}
                                    showsVerticalScrollIndicator={false}
                                >
                                    <Text style={styles.filtroLabel}>Asignación</Text>
                                    <View style={styles.visibilidadContainer}>
                                        {OPCIONES_ASIGNACION.map((op) => {
                                            const activo = borradorAsignacion === op.valor;
                                            return (
                                                <Pressable
                                                    key={op.valor}
                                                    onPress={() => setBorradorAsignacion(op.valor)}
                                                    style={[styles.visibilidadOpcion, activo && styles.visibilidadOpcionActiva]}
                                                    accessibilityRole="button"
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
                                                        {conteoAsignacionBorrador[op.valor]}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>

                                    <Text style={[styles.filtroLabel, { marginTop: spacing.lg }]}>Más filtros</Text>
                                    <View style={styles.settingsCard}>
                                        <SettingsRow
                                            active={borradorCategorias.length > 0}
                                            icon="tags"
                                            label="Categorías"
                                            value={resumenCategoriasBorrador}
                                            onPress={() => setPanelVista("categories")}
                                        />
                                    </View>
                                </ScrollView>

                                <View style={styles.sheetFooter}>
                                    <Pressable
                                        onPress={limpiarBorrador}
                                        style={styles.botonSecundario}
                                    >
                                        <Text style={styles.botonSecundarioTexto}>Limpiar</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={aplicarFiltros}
                                        disabled={resultadosBorrador === 0}
                                        style={[styles.botonPrimario, resultadosBorrador === 0 && styles.botonPrimarioDeshabilitado]}
                                    >
                                        <Text style={styles.botonPrimarioTexto}>
                                            {resultadosBorrador === 0
                                                ? "Sin resultados"
                                                : `Ver ${resultadosBorrador} tarea${resultadosBorrador === 1 ? "" : "s"}`}
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
                                    >
                                        <FontAwesome6 color={colors.primary} name="chevron-left" size={16} />
                                        <Text style={styles.sheetTitulo}>Categorías</Text>
                                    </Pressable>
                                    {borradorCategorias.length > 0 ? (
                                        <Pressable onPress={() => setBorradorCategorias([])}>
                                            <Text style={styles.headerLink}>Borrar</Text>
                                        </Pressable>
                                    ) : null}
                                </View>

                                <Text style={styles.subHint}>Podés elegir varias. Sin selección se muestran todas.</Text>

                                <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
                                    {categoriasMaestras.map((cat, index) => {
                                        const active = borradorCategorias.includes(cat.id);
                                        const count = conteoCategoriasBorrador.porCategoria[cat.id] ?? 0;
                                        const isLast = index === categoriasMaestras.length - 1;
                                        return (
                                            <Pressable
                                                key={cat.id}
                                                onPress={() => alternarBorradorCategoria(cat.id, count)}
                                                style={[
                                                    styles.categoryRow,
                                                    !isLast && styles.categoryRowDivider,
                                                    count === 0 && styles.categoryRowEmpty,
                                                ]}
                                            >
                                                <View style={styles.settingsIcon}>
                                                    <FontAwesome6
                                                        color={colors.primary}
                                                        name={iconoCategoria(cat.nombre)}
                                                        size={13}
                                                    />
                                                </View>
                                                <Text numberOfLines={1} style={styles.categoryName}>
                                                    {cat.nombre}
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

function SettingsRow({ icon, label, value, active, onPress }) {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={styles.settingsRowMain}
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

function SeccionCategoria({
    categoria,
    abierta,
    onToggleSeccion,
    onToggleTarea,
    onEditar,
    onEliminar,
    puedeCompletar,
    eliminandoChecklistId,
    tripHasLeft
}) {
    return (
        <View style={styles.seccion}>
            <Pressable
                onPress={onToggleSeccion}
                style={[styles.seccionHeader, abierta && styles.seccionHeaderAbierta]}
                accessibilityRole="button"
            >
                <FontAwesome6
                    name={abierta ? "chevron-down" : "chevron-right"}
                    size={13}
                    color={colors.primary}
                    style={styles.seccionChevron}
                />
                <FontAwesome6
                    name={iconoCategoria(categoria.nombre)}
                    size={14}
                    color={colors.primary}
                />
                <Text style={styles.seccionTitulo} numberOfLines={1}>
                    {categoria.nombre}
                </Text>
                <View style={styles.seccionContadorBadge}>
                    <Text style={styles.seccionContador}>{categoria.tareas.length}</Text>
                </View>
            </Pressable>

            {abierta && (
                <ScrollView
                    style={styles.listaScroll}
                    contentContainerStyle={styles.listaContenido}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                >
                    {categoria.tareas.map((tarea) => (
                        <ChecklistCard
                            key={tarea.IdChecklist}
                            tarea={tarea}
                            onEditar={onEditar}
                            onEliminar={onEliminar}
                            onToggle={onToggleTarea}
                            puedeCompletar={puedeCompletar}
                            eliminando={eliminandoChecklistId === tarea.IdChecklist}
                            tripHasLeft={tripHasLeft}
                        />
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

function ChecklistCard({ tarea, onEditar, onEliminar, onToggle, puedeCompletar, eliminando, tripHasLeft }) {
    const esCompletada = !!tarea.Completada;
    
    return (
        <View style={[styles.card, { paddingVertical: spacing.sm, flexDirection: "row", alignItems: "center" }, esCompletada && styles.cardCompletada]}>
            <Pressable
                testID={`toggle-checklist-${tarea.IdChecklist}`}
                onPress={() => onToggle?.(tarea)}
                disabled={!onToggle || !puedeCompletar}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: esCompletada, disabled: !puedeCompletar }}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
            >
                <FontAwesome6
                    name={esCompletada ? "circle-check" : "circle"}
                    size={22}
                    color={esCompletada ? colors.success : colors.border}
                />
                <View style={{ flex: 1 }}>
                    <Text
                        style={[styles.cardNombre, { fontSize: 16 }, esCompletada && styles.cardNombreCompletada]}
                        numberOfLines={1}
                    >
                        {tarea.Nombre}
                    </Text>
                    {tarea.Responsables?.length > 0 && (
                        <Text style={[styles.cardMeta, { fontSize: 12, marginTop: 2 }]} numberOfLines={1}>
                            Asignada a: {tarea.Responsables.map((r) => r.NombreCompleto.split(" ")[0]).join(", ")}
                        </Text>
                    )}
                </View>
            </Pressable>

            {tarea.EsPropio && !tripHasLeft ? (
                <View style={{ flexDirection: "row", gap: spacing.md, marginLeft: 10 }}>
                    <Pressable
                        onPress={() => onEditar?.(tarea)}
                        style={{ padding: 4 }}
                        hitSlop={8}
                    >
                        <FontAwesome6 name="pen" size={13} color={colors.textSecondary} />
                    </Pressable>

                    <Pressable
                        onPress={() => onEliminar?.(tarea)}
                        disabled={eliminando}
                        style={{ padding: 4, opacity: eliminando ? 0.6 : 1 }}
                        hitSlop={8}
                    >
                        {eliminando ? (
                            <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                            <FontAwesome6 name="trash" size={13} color={colors.danger} />
                        )}
                    </Pressable>
                </View>
            ) : null}
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
    cardNombre: {
        ...textStyles.bodyStrong,
        color: colors.textPrimary,
    },
    cardCompletada: {
        opacity: 0.6,
    },
    cardNombreCompletada: {
        textDecorationLine: "line-through",
        color: colors.textSecondary,
    },
    cardMeta: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginTop: 2,
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