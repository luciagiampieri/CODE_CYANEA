import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

// Simulamos los tokens visuales oscuros/claros que venís usando en tu app
const COLORS = {
  primary: "#1e3e7b",      // Azul oscuro principal
  secondary: "#ffec80",    // Amarillo/dorado para contrastes notables
  background: "#f0f4f8",   // Fondo gris claro de la app
  cardBg: "#ffffff",       // Fondo blanco para contenedores
  textDark: "#1a1a1a",     // Texto principal
  textMuted: "#666666",    // Texto secundario
  border: "#e1e8ed"        // Separadores de pestañas
};

export default function TripDetailsScreen({ route, navigation }) {
  // Capturamos el IdViaje enviado desde el listado por los parámetros de navegación
  const { IdViaje } = route.params || { IdViaje: 1 };
  
  const [tabActiva, setTabActiva] = useState("Itinerario");
  const [viaje, setViaje] = useState(null);
  const [loading, setLoading] = useState(true);

  // Efecto simulado para cargar los datos del viaje usando el IdViaje recibido
  useEffect(() => {
    // Aquí eventualmente llamarás a tu API real: const data = await getTripById(IdViaje);
    setTimeout(() => {
      setViaje({
        IdViaje: IdViaje,
        Titulo: "Escapada a Córdoba",
        Destino: "Córdoba, Argentina",
        Descripcion: "Viaje grupal con amigos para recorrer las sierras y pasar un finde increíble.",
        Fechas: "18 Jun - 21 Jun, 2026",
        Integrantes: 4
      });
      setLoading(false);
    }, 800);
  }, [IdViaje]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Listado de pestañas requerido tal cual lo solicitaste
  const tabs = ["Itinerario", "Gastos", "Documentos", "Votaciones", "Checklists"];

  // Renderizado dinámico del contenido de cada pestaña
  const renderContenidoTab = () => {
    switch (tabActiva) {
      case "Itinerario":
        return (
          <View style={styles.tabContainerPlaceholder}>
            <FontAwesome6 name="calendar-days" size={40} color={COLORS.primary} />
            <Text style={styles.tabTitlePlaceholder}>Itinerario del Viaje</Text>
            <Text style={styles.tabTextPlaceholder}>Acá se listarán los días, actividades y puntos de encuentro planificados.</Text>
          </View>
        );
      case "Gastos":
        return (
          <View style={styles.tabContainerPlaceholder}>
            <FontAwesome6 name="money-bill-transfer" size={40} color={COLORS.primary} />
            <Text style={styles.tabTitlePlaceholder}>Gestión de Gastos</Text>
            <Text style={styles.tabTextPlaceholder}>Espacio destinado para registrar las cuentas, divisiones y saldos compartidos.</Text>
            {/* Botón sugerido en tus US anteriores para añadir un gasto */}
            <TouchableOpacity 
              style={styles.actionBtn} 
              onPress={() => navigation.navigate("AddGasto", { IdViaje: viaje.IdViaje })}
            >
              <Text style={styles.actionBtnText}>Añadir nuevo gasto</Text>
            </TouchableOpacity>
          </View>
        );
      case "Documentos":
        return (
          <View style={styles.tabContainerPlaceholder}>
            <FontAwesome6 name="file-lines" size={40} color={COLORS.primary} />
            <Text style={styles.tabTitlePlaceholder}>Documentos y Pasajes</Text>
            <Text style={styles.tabTextPlaceholder}>Espacio para guardar reservas de hotel, pasajes de avión, PDFs y vouchers importantes.</Text>
          </View>
        );
      case "Votaciones":
        return (
          <View style={styles.tabContainerPlaceholder}>
            <FontAwesome6 name="square-poll-vertical" size={40} color={COLORS.primary} />
            <Text style={styles.tabTitlePlaceholder}>Votaciones Grupales</Text>
            <Text style={styles.tabTextPlaceholder}>Encuestas para decidir democráticamente dónde comer, qué hacer o qué auto alquilar.</Text>
          </View>
        );
      case "Checklists":
        return (
          <View style={styles.tabContainerPlaceholder}>
            <FontAwesome6 name="list-check" size={40} color={COLORS.primary} />
            <Text style={styles.tabTitlePlaceholder}>Listas de Control (Checklists)</Text>
            <Text style={styles.tabTextPlaceholder}>Tareas pendientes y valijas listas. Controlá que nadie se olvide nada fundamental.</Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* SECCIÓN DEL HEADER PRINCIPAL: Info básica del Viaje */}
      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <FontAwesome6 name="arrow-left" size={18} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerMainTitle}>{viaje?.Titulo}</Text>
          <View style={{ width: 32 }} /> {/* Espaciador óptico para centrar */}
        </View>

        <View style={styles.headerDetailsBox}>
          <Text style={styles.headerDestino}>📍 {viaje?.Destino}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.headerMeta}><FontAwesome6 name="calendar" size={12} /> {viaje?.Fechas}</Text>
            <Text style={styles.headerMeta}><FontAwesome6 name="users" size={12} /> {viaje?.Integrantes} viajeros</Text>
          </View>
          <Text style={styles.headerDesc}>{viaje?.Descripcion}</Text>
        </View>
      </View>

      {/* BARRA HORIZONTAL DE PESTAÑAS (TABS) */}
      <View style={styles.tabsWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScrollContent}
        >
          {tabs.map((tab) => {
            const esActiva = tabActiva === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabItem, esActiva && styles.tabItemActiva]}
                onPress={() => setTabActiva(tab)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabItemText, esActiva && styles.tabItemTextActiva]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* CONTENIDO INTERNO DE LA PESTAÑA SELECCIONADA */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderContenidoTab()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  headerCard: {
    backgroundColor: COLORS.cardBg,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backBtn: {
    padding: 6,
  },
  headerMainTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.primary,
    textAlign: "center",
  },
  headerDetailsBox: {
    marginTop: 4,
  },
  headerDestino: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textDark,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
  },
  headerMeta: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "500",
  },
  headerDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  /* Estilos de la barra de Navegación por pestañas */
  tabsWrapper: {
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabsScrollContent: {
    paddingHorizontal: 12,
    alignItems: "center",
  },
  tabItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabItemActiva: {
    borderBottomColor: COLORS.primary, // Línea inferior resaltada para la activa
  },
  tabItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  tabItemTextActiva: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  /* Contenedor del contenido interno de la pestaña */
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  tabContainerPlaceholder: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    marginTop: 8,
  },
  tabTitlePlaceholder: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.primary,
    marginTop: 14,
    marginBottom: 8,
  },
  tabTextPlaceholder: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 18,
    horizontalPadding: 10,
  },
  actionBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  actionBtnText: {
    color: COLORS.secondary,
    fontWeight: "700",
    fontSize: 14,
  }
});