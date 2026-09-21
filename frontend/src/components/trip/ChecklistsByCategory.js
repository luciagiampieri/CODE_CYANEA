import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";


import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";

export const ID_TODAS = "TODAS";

export default function ChecklistsByCategory({
    checklists = [],
    categoriaFiltro,
    onCategoriaChange,
    onEditar,
    onEliminar,
    eliminandoChecklistId = null,
    tripHasLeft = false,
    currentUserId,
}) {
const [soloMisTareas, setSoloMisTareas] = useState(false);

    const tareasFiltradas = useMemo(() => {
        if (!soloMisTareas) return checklists;
        return checklists.filter((tarea) =>
            tarea.Responsables?.some((r) => String(r.IdUsuario) === String(currentUserId))
        );
    }, [checklists, soloMisTareas, currentUserId]);

    const categorias = useMemo(() => {
        const mapa = new Map();

        tareasFiltradas.forEach((chk) => {
            const key = chk.CategoriaChecklist?.IdCategoriaChecklist || "otros_id";
            const nombreCat = chk.CategoriaChecklist?.Nombre || "Otros";

            if (!mapa.has(key)) {
                mapa.set(key, {
                    id: key,
                    nombre: nombreCat,
                    tareas: [],
                });
            }
            mapa.get(key).tareas.push(chk);
        });

        const esOtros = (nombre) => (nombre || "").trim().toLowerCase() === "otros";

        return Array.from(mapa.values()).sort((a, b) => {
            const aEsOtros = esOtros(a.nombre);
            const bEsOtros = esOtros(b.nombre);
            if (aEsOtros && !bEsOtros) return 1; 
            if (!aEsOtros && bEsOtros) return -1;
            return a.nombre.localeCompare(b.nombre); 
        });
    }, [tareasFiltradas]);

    useEffect(() => {
        if (categoriaFiltro !== ID_TODAS && tareasFiltradas.length > 0) {
            const categoriaAunExiste = categorias.some((c) => c.id === categoriaFiltro);
            if (!categoriaAunExiste) {
                onCategoriaChange?.(ID_TODAS);
            }
        }
    }, [categorias, categoriaFiltro, tareasFiltradas.length, onCategoriaChange]);

    const categoriaSeleccionada = categorias.find((c) => c.id === categoriaFiltro);
    const mostrandoTodas = categoriaFiltro === ID_TODAS;

    if (checklists.length === 0) {
        return (
            <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                    Todavía no hay tareas para este viaje. ¡Creá la primera!
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
                    onPress={() => setSoloMisTareas(!soloMisTareas)}
                    style={[
                        styles.chip,
                        {
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            backgroundColor: soloMisTareas ? colors.primary : colors.surface,
                            borderColor: soloMisTareas ? colors.primary : colors.border,
                        }
                    ]}
                >
                    <FontAwesome6 
                        name="user-check" 
                        size={12} 
                        color={soloMisTareas ? "#ffec80" : colors.primary}
                    />
                    <Text 
                        style={{ 
                            fontSize: 12, 
                            fontWeight: "700", 
                            color: soloMisTareas ? "#ffec80" : colors.primary 
                        }}
                    >
                        Mis tareas
                    </Text>
                </Pressable>

                <View style={{ width: 1, backgroundColor: colors.border , marginVertical: 6, marginHorizontal: 4 }} />
                <Pressable
                    onPress={() => onCategoriaChange?.(ID_TODAS)}
                    style={[styles.chip, mostrandoTodas && styles.chipActiva]}
                    testID="checklist-categoria-todas"
                >
                    <Text style={[styles.chipTexto, mostrandoTodas && styles.chipTextoActivo]}>
                        Todas ({tareasFiltradas.length})
                    </Text>
                </Pressable>

                {categorias.map((cat) => {
                    const activa = cat.id === categoriaFiltro;
                    return (
                        <Pressable
                            key={cat.id}
                            onPress={() => onCategoriaChange?.(cat.id)}
                            style={[styles.chip, activa && styles.chipActiva]}
                            testID={`checklist-categoria-${cat.id}`}
                        >
                            <Text style={[styles.chipTexto, activa && styles.chipTextoActivo]}>
                                {cat.nombre} ({cat.tareas.length})
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
            {tareasFiltradas.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>
                        No tenés ninguna tarea asignada.
                    </Text>
                </View>            
            ) : mostrandoTodas ? (
                categorias.map((cat) => (
                    <SeccionCategoria
                        key={cat.id}
                        categoria={cat}
                        onEditar={onEditar}
                        onEliminar={onEliminar}
                        eliminandoChecklistId={eliminandoChecklistId}
                        tripHasLeft={tripHasLeft}
                    />
                ))
            ) : categoriaSeleccionada ? (
                <SeccionCategoria
                    categoria={categoriaSeleccionada}
                    onEditar={onEditar}
                    onEliminar={onEliminar}
                    eliminandoChecklistId={eliminandoChecklistId}
                    tripHasLeft={tripHasLeft}
                    ocultarTitulo 
                />
            ) : (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No hay tareas en esta categoría.</Text>
                </View>
            )}
        </View>
    );
}


function SeccionCategoria({
    categoria,
    onEditar,
    onEliminar,
    eliminandoChecklistId,
    tripHasLeft,
    ocultarTitulo,
}) {
    return (
        <View style={styles.seccion}>
            {!ocultarTitulo && (
                <View style={styles.seccionHeader}>
                    <Text style={styles.seccionTitulo}>{categoria.nombre}</Text>
                    <Text style={styles.seccionContador}>{categoria.tareas.length}</Text>
                </View>
            )}

            {categoria.tareas.length === 0 ? (
                <Text style={styles.emptyTextInline}>No hay tareas en esta categoría.</Text>
            ) : (
                categoria.tareas.map((tarea) => (
                    <ChecklistCard
                        key={tarea.IdChecklist}
                        tarea={tarea}
                        onEditar={onEditar}
                        onEliminar={onEliminar}
                        eliminando={eliminandoChecklistId === tarea.IdChecklist}
                        tripHasLeft={tripHasLeft}
                    />
                ))
            )}
        </View>
    );
}


function ChecklistCard({ tarea, onEditar, onEliminar, eliminando, tripHasLeft }) {
    return (
        <View style={[styles.card, { paddingVertical: spacing.sm }]}>
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    <FontAwesome6
                        name="circle-check"
                        size={18}
                        color={tarea.Completada ? colors.success : colors.border}
                    />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.cardNombre, { fontSize: 16 }]} numberOfLines={1}>
                            {tarea.Nombre}
                        </Text>
                        <Text style={[styles.cardMeta, { fontSize: 12, marginTop: 2 }]}>
                            <Text style={{ fontWeight: "700" }}>
                                {tarea.CategoriaChecklist?.Nombre || "Otros"}
                            </Text>
                            {tarea.Responsables?.length > 0
                                ? ` — ${tarea.Responsables.map((r) => r.NombreCompleto.split(" ")[0]).join(", ")}`
                                : ""}
                        </Text>
                    </View>
                </View>

                {tarea.EsPropio && !tripHasLeft ? (
                    <View style={{ flexDirection: "row", gap: spacing.md, marginLeft: 10 }}>
                        <Pressable
                            onPress={() => onEditar?.(tarea)}
                            style={{ padding: 4 }}
                        >
                            <FontAwesome6 name="pen" size={13} color={colors.textSecondary} />
                        </Pressable>

                        <Pressable
                            onPress={() => onEliminar?.(tarea)}
                            disabled={eliminando}
                            style={{ padding: 4, opacity: eliminando ? 0.6 : 1 }}
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
    cardNombre: {
        ...textStyles.bodyStrong,
        color: colors.textPrimary,
    },
    cardMeta: {
        ...textStyles.body,
        color: colors.textSecondary,
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