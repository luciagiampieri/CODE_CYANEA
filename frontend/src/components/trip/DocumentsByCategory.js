import { useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";

export const ID_TODAS = "TODAS";


export default function DocumentosPorCategoria({
    documentos = [],
    categoriaFiltro,
    onCategoriaChange,
    onAbrir,
    onDescargar,
    onEditar,
    onEliminar,
    descargandoDocId = null,
    eliminandoDocId = null,
}) {

    const categorias = useMemo(() => {
        const mapa = new Map();

        documentos.forEach((doc) => {
            const key = doc.IdCategoriaDocumento;
            if (!mapa.has(key)) {
                mapa.set(key, {
                    id: key,
                    nombre: doc.NombreCategoria,
                    documentos: [],
                });
            }
            mapa.get(key).documentos.push(doc);
        });

        const esOtros = (nombre) => (nombre || "").trim().toLowerCase() === "otros";

        return Array.from(mapa.values()).sort((a, b) => {
            const aEsOtros = esOtros(a.nombre);
            const bEsOtros = esOtros(b.nombre);
            if (aEsOtros && !bEsOtros) return 1;
            if (!aEsOtros && bEsOtros) return -1;
            return a.nombre.localeCompare(b.nombre);
        });
    }, [documentos]);


    useEffect(() => {
        if (categoriaFiltro !== ID_TODAS && documentos.length > 0) {
            const categoriaAunExiste = categorias.some((c) => c.id === categoriaFiltro);

            if (!categoriaAunExiste) {
                onCategoriaChange?.(ID_TODAS);
            }
        }
    }, [categorias, categoriaFiltro, documentos.length]);

    const categoriaSeleccionada = categorias.find((c) => c.id === categoriaFiltro);
    const mostrandoTodas = categoriaFiltro === ID_TODAS;

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

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
            >
                <Pressable
                    onPress={() => onCategoriaChange?.(ID_TODAS)}
                    style={[styles.chip, mostrandoTodas && styles.chipActiva]}
                >
                    <Text style={[styles.chipTexto, mostrandoTodas && styles.chipTextoActivo]}>
                        Todos ({documentos.length})
                    </Text>
                </Pressable>

                {categorias.map((cat) => {
                    const activa = cat.id === categoriaFiltro;
                    return (
                        <Pressable
                            key={cat.id}
                            onPress={() => onCategoriaChange?.(cat.id)}
                            style={[styles.chip, activa && styles.chipActiva]}
                        >
                            <Text style={[styles.chipTexto, activa && styles.chipTextoActivo]}>
                                {cat.nombre} ({cat.documentos.length})
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>

            {mostrandoTodas ? (
                categorias.map((cat) => (
                    <SeccionCategoria
                        key={cat.id}
                        categoria={cat}
                        onAbrir={onAbrir}
                        onDescargar={onDescargar}
                        onEditar={onEditar}
                        onEliminar={onEliminar}
                        descargandoDocId={descargandoDocId}
                        eliminandoDocId={eliminandoDocId}
                    />
                ))
            ) : categoriaSeleccionada ? (
                <SeccionCategoria
                    categoria={categoriaSeleccionada}
                    onAbrir={onAbrir}
                    onDescargar={onDescargar}
                    onEditar={onEditar}
                    onEliminar={onEliminar}
                    descargandoDocId={descargandoDocId}
                    eliminandoDocId={eliminandoDocId}
                    ocultarTitulo
                />
            ) : (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No hay documentos en esta categoría.</Text>
                </View>
            )}
        </View>
    );
}

function SeccionCategoria({
    categoria,
    onAbrir,
    onDescargar,
    onEditar,
    onEliminar,
    descargandoDocId,
    eliminandoDocId,
    ocultarTitulo,
}) {
    return (
        <View style={styles.seccion}>
            {!ocultarTitulo && (
                <View style={styles.seccionHeader}>
                    <Text style={styles.seccionTitulo}>{categoria.nombre}</Text>
                    <Text style={styles.seccionContador}>{categoria.documentos.length}</Text>
                </View>
            )}

            {categoria.documentos.length === 0 ? (
                <Text style={styles.emptyTextInline}>No hay documentos en esta categoría.</Text>
            ) : (
                categoria.documentos.map((documento) => (
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
                ))
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
                        >
                            <FontAwesome6 name="pen" size={12} color={colors.primary} />
                            <Text style={styles.accionTexto}>Editar</Text>
                        </Pressable>

                        <Pressable
                            onPress={() => onEliminar?.(documento)}
                            disabled={eliminando}
                            style={[styles.accionBoton, eliminando && styles.accionBotonDisabled]}
                            hitSlop={8}
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
    chipsRow: {
        gap: spacing.xs,
        paddingVertical: spacing.xxs,
    },
    chip: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.pill,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
    },
    chipActiva: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    chipTexto: {
        ...textStyles.meta,
        color: colors.primary,
        fontWeight: "700",
    },
    chipTextoActivo: {
        color: colors.textInverse,
    },
    seccion: {
        gap: spacing.sm,
    },
    seccionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: spacing.xs,
    },
    seccionTitulo: {
        ...textStyles.label,
        color: colors.primary,
    },
    seccionContador: {
        ...textStyles.meta,
        color: colors.textSecondary,
        fontWeight: "700",
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
    emptyTextInline: {
        ...textStyles.meta,
        color: colors.textSecondary,
    },
});