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

const ICONOS_CATEGORIAS_DOCUMENTOS = {
    Vuelos: "plane",
    Alojamiento: "hotel",
    Excursiones: "map-location-dot",
    Seguros: "shield-halved",
    Documentación: "id-card",
    Comprobantes: "receipt", 
    Otros: "ellipsis",
};

const iconoCategoria = (nombre) => ICONOS_CATEGORIAS_DOCUMENTOS[nombre] || "tags";

const TINTE_PRIMARIO = colors.primarySoft ? `${colors.primarySoft}22` : "#eef4ff";

const normalizarTexto = (texto) =>
    (texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

function coincideBusqueda(documento, busquedaNormalizada) {
    if (!busquedaNormalizada) return true;
    return normalizarTexto(documento.NombreArchivo).includes(busquedaNormalizada);
}

function coincideVisibilidad(documento, filtro) {
    if (filtro === FILTRO_VISIBILIDAD.PUBLICOS) return !!documento.EsPublico;
    if (filtro === FILTRO_VISIBILIDAD.PRIVADOS) return !documento.EsPublico;
    return true;
}

export default function DocumentosPorCategoria({
    documentos = [],
    onAbrir,
    onDescargar,
    onEditar,
    onEliminar,
    descargandoDocId = null,
    eliminandoDocId = null,
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

    const [categoriasFiltro, setCategoriasFiltro] = useState([]);

    const [panelVisible, setPanelVisible] = useState(false);
    const [panelVista, setPanelVista] = useState("main");
    const [borradorCategorias, setBorradorCategorias] = useState([]);
    const [borradorVisibilidad, setBorradorVisibilidad] = useState(FILTRO_VISIBILIDAD.TODOS);

    const documentosBuscados = useMemo(
        () => documentos.filter((d) => coincideBusqueda(d, busquedaNormalizada)),
        [documentos, busquedaNormalizada]
    );

    const categoriasMaestras = useMemo(() => {
        const mapa = new Map();

        documentos.forEach((doc) => {
            const key = String(doc.IdCategoriaDocumento);
            if (!mapa.has(key)) {
                mapa.set(key, {
                    id: key,
                    nombre: doc.NombreCategoria,
                    documentos: [],
                });
            }
            if (coincideBusqueda(doc, busquedaNormalizada)) {
                mapa.get(key).documentos.push(doc);
            }
        });

        Object.keys(ICONOS_CATEGORIAS_DOCUMENTOS).forEach((nombreStd, index) => {
            const existe = Array.from(mapa.values()).some(
                (c) => c.nombre.trim().toLowerCase() === nombreStd.trim().toLowerCase()
            );
            if (!existe) {
                mapa.set(`std-${index}`, {
                    id: `std-${index}`,
                    nombre: nombreStd,
                    documentos: [],
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
    }, [documentos, busquedaNormalizada]);

    const categoriasConResultados = useMemo(
        () =>
            categoriasMaestras
                .map((cat) => ({
                    ...cat,
                    documentos: cat.documentos.filter((d) => coincideVisibilidad(d, filtroVisibilidad)),
                }))
                .filter((cat) => {
                    const pasaFiltroCategoria = categoriasFiltro.length === 0 || categoriasFiltro.includes(cat.id);
                    return cat.documentos.length > 0 && pasaFiltroCategoria;
                }),
        [categoriasMaestras, filtroVisibilidad, categoriasFiltro]
    );

    // Mantiene las secciones abiertas si hay filtros activos o búsqueda, sin alterar el scroll al escribir
    useEffect(() => {
        if (hayBusqueda || categoriasFiltro.length > 0 || filtroVisibilidad !== FILTRO_VISIBILIDAD.TODOS) {
            const nextOpened = {};
            categoriasConResultados.forEach((cat) => {
                nextOpened[cat.id] = true;
            });
            setAbiertas(nextOpened);
        }
    }, [hayBusqueda, categoriasFiltro, filtroVisibilidad, categoriasConResultados]);

    const totalVisibles = useMemo(
        () => categoriasConResultados.reduce((acc, cat) => acc + cat.documentos.length, 0),
        [categoriasConResultados]
    );

    const conteoCategoriasBorrador = useMemo(() => {
        const porCategoria = {};
        let total = 0;
        categoriasMaestras.forEach((cat) => {
            const n = cat.documentos.filter((d) => coincideVisibilidad(d, borradorVisibilidad)).length;
            porCategoria[cat.id] = n;
            total += n;
        });
        return { porCategoria, total };
    }, [categoriasMaestras, borradorVisibilidad]);

    const conteoVisibilidadBorrador = useMemo(() => {
        const base =
            borradorCategorias.length === 0
                ? documentosBuscados
                : documentosBuscados.filter((d) => borradorCategorias.includes(String(d.IdCategoriaDocumento)));
        const publicos = base.filter((d) => d.EsPublico).length;
        return {
            [FILTRO_VISIBILIDAD.TODOS]: base.length,
            [FILTRO_VISIBILIDAD.PUBLICOS]: publicos,
            [FILTRO_VISIBILIDAD.PRIVADOS]: base.length - publicos,
        };
    }, [documentosBuscados, borradorCategorias]);

    const resultadosBorrador = conteoVisibilidadBorrador[borradorVisibilidad];

    useEffect(() => {
        if (documentos.length === 0) return;
        setCategoriasFiltro((actual) => {
            const vigentes = actual.filter((id) => categoriasMaestras.some((c) => c.id === id));
            return vigentes.length === actual.length ? actual : vigentes;
        });
    }, [categoriasMaestras, documentos.length]);

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
        setBorradorVisibilidad(filtroVisibilidad);
        setPanelVista("main");
        setPanelVisible(true);
    }

    function cerrarPanel() {
        setPanelVisible(false);
    }

    function limpiarBorrador() {
        setBorradorCategorias([]);
        setBorradorVisibilidad(FILTRO_VISIBILIDAD.TODOS);
    }

    function alternarBorradorCategoria(id, count) {
        if (count === 0) return;
        setBorradorCategorias((actual) =>
            actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]
        );
    }

    function aplicarFiltros() {
        setFiltroVisibilidad(borradorVisibilidad);
        setCategoriasFiltro(borradorCategorias);
        abrirSoloCategorias(borradorCategorias);
        setPanelVisible(false);
    }

    function limpiarFiltros() {
        setFiltroVisibilidad(FILTRO_VISIBILIDAD.TODOS);
        setCategoriasFiltro([]);
        setBusqueda("");
    }

    function quitarCategoriaFiltro(id) {
        setCategoriasFiltro((actual) => actual.filter((x) => x !== id));
    }

    const visibilidadActiva = filtroVisibilidad !== FILTRO_VISIBILIDAD.TODOS;
    const cantidadFiltrosActivos = categoriasFiltro.length + (visibilidadActiva ? 1 : 0);

    const resumenCategoriasBorrador =
        borradorCategorias.length === 0
            ? "Todas"
            : borradorCategorias.length === 1
            ? categoriasMaestras.find((c) => c.id === borradorCategorias[0])?.nombre ?? "1 seleccionada"
            : `${borradorCategorias.length} seleccionadas`;

    if (documentos.length === 0) {
        return (
            <View style={styles.emptyState}>
                <FontAwesome6 name="folder-open" size={22} color={colors.textMuted} />
                <Text style={styles.emptyText}>
                    Todavía no hay documentos cargados en este viaje.
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
            return `No se encontraron documentos para "${busqueda.trim()}"${
                cantidadFiltrosActivos > 0 ? " con los filtros aplicados" : ""
            }.`;
        }
        const tipo = ETIQUETA_VISIBILIDAD[filtroVisibilidad]?.toLowerCase();
        const nombres = listaNombres(categoriasElegidas.map((c) => c.nombre));
        if (tipo && nombres) return `No hay documentos ${tipo} en ${nombres}.`;
        if (tipo) return `No hay documentos ${tipo}.`;
        if (nombres) return `No hay documentos en ${nombres}.`;
        return "No hay documentos para mostrar.";
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
                        placeholder="Buscar documento"
                        placeholderTextColor={colors.overlay || colors.textMuted}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoCapitalize="none"
                        testID="documentos-buscador"
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
                            testID="documentos-buscador-limpiar"
                        >
                            <FontAwesome6 name="circle-xmark" size={15} color={colors.textMuted} />
                        </Pressable>
                    )}
                </View>

                <Pressable
                    onPress={abrirPanel}
                    style={[styles.botonFiltros, cantidadFiltrosActivos > 0 && styles.botonFiltrosActivo]}
                    accessibilityRole="button"
                    testID="documentos-filtros-abrir"
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

            {(categoriasElegidas.length > 0 || visibilidadActiva) && (
                <View style={styles.barraFiltros}>
                    {categoriasElegidas.map((cat) => (
                        <Pressable
                            key={cat.id}
                            onPress={() => quitarCategoriaFiltro(cat.id)}
                            style={styles.tagActivo}
                            hitSlop={6}
                            testID={`documentos-filtro-tag-categoria-${cat.id}`}
                        >
                            <FontAwesome6 name={iconoCategoria(cat.nombre)} size={11} color={colors.primary} />
                            <Text style={styles.tagActivoTexto} numberOfLines={1}>
                                {cat.nombre}
                            </Text>
                            <FontAwesome6 name="xmark" size={11} color={colors.primary} />
                        </Pressable>
                    ))}

                    {visibilidadActiva && (
                        <Pressable
                            onPress={() => setFiltroVisibilidad(FILTRO_VISIBILIDAD.TODOS)}
                            style={styles.tagActivo}
                            hitSlop={6}
                            testID="documentos-filtro-tag-visibilidad"
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
                    <FontAwesome6 name="folder-open" size={22} color={colors.textMuted} />
                    <Text style={styles.emptyText}>{mensajeVacio()}</Text>
                    {(cantidadFiltrosActivos > 0 || hayBusqueda) && (
                        <Pressable onPress={limpiarFiltros} hitSlop={8} testID="documentos-vacio-limpiar">
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
                        onToggle={() => alternarCategoria(cat.id)}
                        onAbrir={onAbrir}
                        onDescargar={onDescargar}
                        onEditar={onEditar}
                        onEliminar={onEliminar}
                        descargandoDocId={descargandoDocId}
                        eliminandoDocId={eliminandoDocId}
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
                                    <Pressable onPress={cerrarPanel} hitSlop={12} testID="documentos-filtros-cerrar">
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
                                                    testID={`documentos-visibilidad-${op.valor}`}
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
                                            active={borradorCategorias.length > 0}
                                            icon="tags"
                                            label="Categorías"
                                            value={resumenCategoriasBorrador}
                                            onPress={() => setPanelVista("categories")}
                                            testID="documentos-filtro-categorias"
                                        />
                                    </View>
                                </ScrollView>

                                <View style={styles.sheetFooter}>
                                    <Pressable
                                        onPress={limpiarBorrador}
                                        style={styles.botonSecundario}
                                        testID="documentos-filtros-limpiar"
                                    >
                                        <Text style={styles.botonSecundarioTexto}>Limpiar</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={aplicarFiltros}
                                        disabled={resultadosBorrador === 0}
                                        style={[styles.botonPrimario, resultadosBorrador === 0 && styles.botonPrimarioDeshabilitado]}
                                        testID="documentos-filtros-aplicar"
                                    >
                                        <Text style={styles.botonPrimarioTexto}>
                                            {resultadosBorrador === 0
                                                ? "Sin resultados"
                                                : `Ver ${resultadosBorrador} documento${resultadosBorrador === 1 ? "" : "s"}`}
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
                                        testID="documentos-categories-back"
                                    >
                                        <FontAwesome6 color={colors.primary} name="chevron-left" size={16} />
                                        <Text style={styles.sheetTitulo}>Categorías</Text>
                                    </Pressable>
                                    {borradorCategorias.length > 0 ? (
                                        <Pressable onPress={() => setBorradorCategorias([])} testID="documentos-categories-clear">
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
                                                testID={`documentos-filter-${cat.id}`}
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
                                        testID="documentos-categories-done"
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

function SeccionCategoria({
    categoria,
    abierta,
    onToggle,
    onAbrir,
    onDescargar,
    onEditar,
    onEliminar,
    descargandoDocId,
    eliminandoDocId,
}) {
    return (
        <View style={styles.seccion}>
            <Pressable
                onPress={onToggle}
                style={[styles.seccionHeader, abierta && styles.seccionHeaderAbierta]}
                accessibilityRole="button"
                accessibilityState={{ expanded: abierta }}
                testID={`documentos-categoria-header-${categoria.id}`}
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
                    <Text style={styles.seccionContador}>{categoria.documentos.length}</Text>
                </View>
            </Pressable>

            {abierta && (
                <ScrollView
                    style={styles.listaScroll}
                    contentContainerStyle={styles.listaContenido}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                >
                    {categoria.documentos.map((documento) => (
                        <DocumentoCard
                            key={documento.IdDocumento}
                            documento={documento}
                            onAbrir={onAbrir}
                            onDescargar={onDescargar}
                            onEditar={onEditar}
                            onEliminar={onEliminar}
                            descargando={descargandoDocId === documento.IdDocumento}
                            eliminando={eliminandoDocId === documento.IdDocumento}
                        />
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

function DocumentoCard({ documento, onAbrir, onDescargar, onEditar, onEliminar, descargando, eliminando }) {
    return (
        <View style={styles.card}>
            <Pressable
                onPress={() => onAbrir?.(documento)}
                style={styles.cardHeaderRow}
                testID={`documento-abrir-${documento.IdDocumento}`}
            >
                <FontAwesome6 name="file-lines" size={18} color={colors.primary} />

                <View style={styles.cardBody}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <Text style={[styles.cardNombre, { flexShrink: 1 }]} numberOfLines={1}>
                            {documento.NombreArchivo}
                        </Text>
                        <View
                            style={{
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 6,
                                backgroundColor: documento.EsPublico ? "#e0f2fe" : "#f3e8ff",
                                marginTop: 2,
                            }}
                        >
                            <Text style={{ fontSize: 10, fontWeight: "700", color: documento.EsPublico ? "#0369a1" : "#6b21a8" }}>
                                {documento.EsPublico ? "PÚBLICO" : "PRIVADO"}
                            </Text>
                        </View>
                    </View>

                    <Text style={styles.cardMeta}>
                        {documento.NombreCategoria} · Subido por {documento.NombreUsuarioSubida}
                    </Text>
                </View>

                <FontAwesome6 name="up-right-from-square" size={13} color={colors.textSecondary} />
            </Pressable>

            <View style={styles.cardAcciones}>
                <Pressable
                    onPress={() => onDescargar?.(documento)}
                    disabled={descargando}
                    style={[styles.accionBoton, descargando && styles.accionBotonDisabled]}
                    hitSlop={8}
                    testID={`documento-descargar-${documento.IdDocumento}`}
                >
                    {descargando ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                        <FontAwesome6 name="download" size={12} color={colors.primary} />
                    )}
                    <Text style={styles.accionTexto}>
                        {descargando ? "Descargando..." : "Descargar"}
                    </Text>
                </Pressable>

                {documento.EsPropio && (
                    <>
                        <Pressable
                            onPress={() => onEditar?.(documento)}
                            style={styles.accionBoton}
                            hitSlop={8}
                            testID={`documento-editar-${documento.IdDocumento}`}
                        >
                            <FontAwesome6 name="pen" size={12} color={colors.primary} />
                            <Text style={styles.accionTexto}>Editar</Text>
                        </Pressable>

                        <Pressable
                            onPress={() => onEliminar?.(documento)}
                            disabled={eliminando}
                            style={[styles.accionBoton, eliminando && styles.accionBotonDisabled]}
                            hitSlop={8}
                            testID={`documento-eliminar-${documento.IdDocumento}`}
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
    settingsDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
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
        alignItems: "center",
        gap: spacing.sm,
    },
    cardBody: {
        flex: 1,
    },
    cardNombre: {
        ...textStyles.bodyStrong,
        color: colors.textPrimary,
    },
    cardMeta: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginTop: 2,
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