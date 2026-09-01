import { FontAwesome6 } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Modal,
} from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import MapCanvas from "../components/map/MapCanvas";
import ParticipantSearch from "../components/trip/ParticipantSearch";
import ParticipantList from "../components/trip/ParticipantList";
import ResultadosVotacion from "../components/trip/ResultadosVotacion";
import DocumentosPorCategoria, { ID_TODAS } from "../components/trip/DocumentsByCategory";
import AvatarStack from "../components/ui/AvatarStack";
import IconCircleButton from "../components/ui/IconCircleButton";
import MetricCard from "../components/ui/MetricCard";
import PrimaryButton from "../components/ui/PrimaryButton";
import StatusPill from "../components/ui/StatusPill";
import {
  addTripParticipant,
  emitirVoto,
  cancelarVotacion,
  getCurrentUser,
  getTripSettlement,
  getTripDetail,
  getItinerarySocketUrl,
  getVotaciones,
  getResultadosVotacion,
  getProgresoVotacion,
  getUsers,
  markSettlementTransferPaid,
  removeTripExternalInvitation,
  removeTripParticipant,
  rebuildTripSettlement,
  deleteTrip,
  updateActivity,
  getTripParticipants,
  getExpenseCategories,
  getTripDocuments,
  downloadTripDocument,
  deleteTripDocument,
  getRepositorioItems,
  deleteRepositorioItem,
  createActivity,
  deleteActivity,
  generateTripRoute,
  leaveTrip,
} from "../services/api"
;
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

import {
  guardarParticipantesEnCache,
  guardarCategoriasEnCache,
} from "../database/gastosLocal";

import AddActivityScreen from "./AddActivityScreen";
import useItinerarioViewPreference from "../hooks/useItinerarioViewPreference";
import useResponsive from "../hooks/useResponsive";
import ItinerarioViewToggle from "../components/trip/ItinerarioViewToggle";
import ItinerarioCalendarView from "../components/trip/ItinerarioCalendarView";
import { buildRouteMarkers } from "../utils/routeMarkers";


const tabs = [
  { id: "itinerario", label: "Itinerario", icon: "map" },
  { id: "gastos", label: "Gastos", icon: "sack-dollar" },
  { id: "docs", label: "Docs", icon: "folder" },
  { id: "votar", label: "Votar", icon: "check-to-slot" },
  { id: "grupo", label: "Grupo", icon: "users" },
];

function normalizeTrip(raw) {
  if (!raw) return null;
  const destinationNames =
    Array.isArray(raw.destinations) && raw.destinations.length > 0
      ? raw.destinations.map((d) => d.name ?? d.Nombre).filter(Boolean).join(", ")
      : raw.destination ?? raw.Destino ?? "Destino";

  return {
    id: raw.id ?? raw.IdViaje ?? null,
    title: raw.title ?? raw.Titulo ?? "Viaje sin nombre",
    destination: destinationNames,
    description: raw.description ?? raw.Descripcion ?? "",
    status: (raw.status ?? raw.Estado ?? "activo").toLowerCase(),
    hasLeft: raw.hasLeft ?? raw.HasLeft ?? false,
    currency: raw.currency ?? raw.Moneda ?? "EUR",
    startDate: raw.startDate ?? raw.FechaInicio ?? "",
    endDate: raw.endDate ?? raw.FechaFin ?? "",
    participantUserIds: raw.participantUserIds ?? [],
    invitedEmails: raw.invitedEmails ?? [],
    participants: raw.participants ?? [],
    externalInvitations: raw.externalInvitations ?? [],
    admin: raw.admin ?? null,
    cronograma: raw.cronograma ?? raw.Cronograma ?? raw.dias ?? [],
    image:
      raw.image ??
      "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1400&q=80",
  };
}

function formatHeroDate(trip) {
  if (!trip.startDate || !trip.endDate) return "Fechas por definir";
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Fechas por definir";
  const formatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(start)} · ${formatter.format(end)}`;
}

function normalizeRuta(raw) {
  if (!raw) return null;
  return {
    id: raw.idRutaDiaria ?? raw.IdRutaDiaria,
    modo: raw.modo ?? raw.Modo ?? "walking",
    distanciaMetros: raw.distanciaMetros ?? raw.DistanciaMetros ?? 0,
    duracionSegundos: raw.duracionSegundos ?? raw.DuracionSegundos ?? 0,
    idsActividadesOrdenadas: raw.idsActividadesOrdenadas ?? raw.IdsActividadesOrdenadas ?? [],
    polilineaCodificada: raw.polilineaCodificada ?? raw.PolilineaCodificada ?? null,
  };
}

function formatDayDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  const formattedDate = new Intl.DateTimeFormat("es-AR", {
    weekday: "long", 
    day: "2-digit",   
    month: "long",
    timeZone: "UTC"
  }).format(date);

  return formattedDate.replace(/(\p{L})\p{L}*/gu, (word) => word.charAt(0).toLocaleUpperCase("es-AR") + word.slice(1).toLocaleLowerCase("es-AR"));
}

function formatDayDateCorta(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  const formattedDate = new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);

  return formattedDate.replace(/(\p{L})\p{L}*/gu, (word) => word.charAt(0).toLocaleUpperCase("es-AR") + word.slice(1).toLocaleLowerCase("es-AR"));
}

function formatFechaHoraCierre(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
const ESTADO_VOTACION_LABEL = {
  abierta: "Activa",
  cerrada: "Cerrada",
  cancelada: "Cancelada",
};

function avisar(titulo, mensaje) {
  if (Platform.OS === "web") {
    window.alert(mensaje);
  } else {
    Alert.alert(titulo, mensaje);
  }
}

function confirmar(titulo, mensaje, onConfirmar) {
  if (Platform.OS === "web") {
    if (window.confirm(mensaje)) {
      onConfirmar();
    }
  } else {
    Alert.alert(titulo, mensaje, [
      { text: "Volver", style: "cancel" },
      { text: "Confirmar", style: "destructive", onPress: onConfirmar },
    ]);
  }
}

function formatMoney(amount, currency) {
  const numeric = Number(amount ?? 0);
  if (Number.isNaN(numeric)) {
    return `${currency} 0,00`;
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 2,
  }).format(numeric);
}

export default function TripDetailScreen({ navigation, route }) {
  const initialTrip = normalizeTrip(route.params?.trip);
  const { width, isTablet } = useResponsive();
  const isNarrowMobile = !isTablet && width < 430;
  const [trip, setTrip] = useState(initialTrip);
  const [activeTab, setActiveTab] = useState("itinerario");
  const [expandedDayId, setExpandedDayId] = useState(initialTrip?.cronograma[0]?.IdDiaCronograma ?? initialTrip?.cronograma[0]?.id ?? null);
  const [votacionesActivas, setVotacionesActivas] = useState([]);
  const [loadingVotaciones, setLoadingVotaciones] = useState(false);
  const [votacionesError, setVotacionesError] = useState("");
  const [votandoId, setVotandoId] = useState(null);
  const [cancelandoId, setCancelandoId] = useState(null);
  const [votosSeleccionados, setVotosSeleccionados] = useState({});
  const [resultadosPorVotacion, setResultadosPorVotacion] = useState({});
  const votacionesVisibles = useMemo(
    () =>
      votacionesActivas.filter((v) => {
        if (v.Estado !== "cancelada") return true;
        const resultado = resultadosPorVotacion[v.IdVotacion];
        if (!resultado || resultado.error) return true;
        return resultado.TotalVotos !== 0;
      }),
    [votacionesActivas, resultadosPorVotacion]
  );
  const [participantSearch, setParticipantSearch] = useState("");
  const [userOptions, setUserOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutatingParticipants, setMutatingParticipants] = useState(false);
  const [participantMessage, setParticipantMessage] = useState("");
  const [activityModalDay, setActivityModalDay] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false); 
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [activityEditMessage, setActivityEditMessage] = useState("");
  const [settlement, setSettlement] = useState(null);
  const [loadingSettlement, setLoadingSettlement] = useState(false);
  const [settlementError, setSettlementError] = useState("");
  const [documentos, setDocumentos] = useState([]);
  const [loadingDocumentos, setLoadingDocumentos] = useState(false);
  const [documentosError, setDocumentosError] = useState("");
  const [categoriaDocFiltro, setCategoriaDocFiltro] = useState(ID_TODAS);
  const [repositorioItems, setRepositorioItems] = useState([]);
  const [loadingRepositorio, setLoadingRepositorio] = useState(false);
  const [repositorioError, setRepositorioError] = useState("");
  const [eliminandoItemId, setEliminandoItemId] = useState(null);
  const [descargandoDocId, setDescargandoDocId] = useState(null);
  const [eliminandoDocId, setEliminandoDocId] = useState(null);
  const [updatingTransferId, setUpdatingTransferId] = useState(null);
  const socketRef = useRef(null);
  const pendingEditRef = useRef(null);
  const [itinerarioView, setItinerarioView] = useItinerarioViewPreference();

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [nuevoAdminId, setNuevoAdminId] = useState(null);
  const [leavingTrip, setLeavingTrip] = useState(false);

  const isUserAdmin = useMemo(() => {
    if (!currentUser || !trip?.admin) return false;
    return String(currentUser.id) === String(trip.admin.id);
  }, [currentUser, trip?.admin]);

  const eligibleNewAdmins = useMemo(() => {
    if (!trip?.participants || !currentUser) return [];

    return trip.participants.filter(
      (participant) =>
        String(participant.id ?? participant.IdUsuario) !==
        String(currentUser.id)
    );
  }, [trip?.participants, currentUser]);

  const handleLeaveTripPress = () => {

    if (trip?.status && trip.status !== "activo") {
      avisar(
        "Acción no permitida",
        "No puedes abandonar un viaje que no está activo."
      );
      return;
    }

    if (isUserAdmin && eligibleNewAdmins.length > 0) {
      setNuevoAdminId(null);
      setShowLeaveModal(true);
      return;
    }

    confirmar(
      "Abandonar viaje",
      "¿Estás seguro de que querés abandonar este viaje?",
      () => ejecutarSalidaViaje()
    );
  };

  const ejecutarSalidaViaje = async (adminId = null) => {
    const administradorNuevo = adminId || nuevoAdminId;

    if (isUserAdmin && eligibleNewAdmins.length > 0 && !administradorNuevo) {
      avisar(
        "Atención",
        "Debés seleccionar un nuevo administrador antes de abandonar el viaje."
      );
      return;
    }

    try {
      setLeavingTrip(true);

      const response = await leaveTrip(trip.id, {
        confirmar: true,
        nuevoAdministradorId:
          isUserAdmin && administradorNuevo
            ? Number(administradorNuevo)
            : null,
      });

      setShowLeaveModal(false);
      setNuevoAdminId(null);

       if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }

      setTrip((prev) => ({
      ...prev,
      hasLeft: true,
      }));

      avisar("¡Listo!", response?.message || "Has abandonado el viaje correctamente.");
      loadTripDetail();

    } catch (error) {
      avisar(
        "No se pudo abandonar el viaje",
        error.message || "Ocurrió un problema al intentar abandonar el viaje."
      );
    } finally {
      setLeavingTrip(false);
    }
  };

  function enviarMensajeWebSocket(mensaje) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(mensaje));
      return true;
    }

    console.error("El WebSocket no está conectado.");
    return false;
  }

  function finalizarEdicionActividad(activityId){
    enviarMensajeWebSocket({
      tipo: "finalizar_edicion",
      idActividad: activityId,
    });
  }

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const me = await getCurrentUser();
        setCurrentUser(me);
      } catch {
        setCurrentUser(null);
      }
    }
    loadCurrentUser();
  }, []);

  useEffect(() => {
    const nueva = route.params?.nuevaVotacion;
    if (!nueva) return;
    setVotacionesActivas((prev) => [
      nueva,
      ...prev.filter((v) => v.IdVotacion !== nueva.IdVotacion),
    ]);
    navigation.setParams({ nuevaVotacion: undefined });
  }, [route.params?.nuevaVotacion]);

  useEffect(() => {
    votacionesActivas.forEach(async (v) => {
      const finalizada = v.Estado
        ? v.Estado === "cerrada" || v.Estado === "cancelada"
        : new Date(v.FechaCierre) < new Date();

      if (finalizada) {
        if (resultadosPorVotacion[v.IdVotacion]) return;
        try {
          const data = await getResultadosVotacion(v.IdVotacion);
          setResultadosPorVotacion((prev) => ({ ...prev, [v.IdVotacion]: data }));
        } catch (error) {
          setResultadosPorVotacion((prev) => ({
            ...prev,
            [v.IdVotacion]: { error: error.message || "No se pudieron cargar los resultados." },
          }));
        }
        return;
      }

      if (v.YaVoto) {
        try {
          const data = await getProgresoVotacion(v.IdVotacion);
          setResultadosPorVotacion((prev) => ({ ...prev, [v.IdVotacion]: data }));
        } catch (error) {
        }
      }
    });
  }, [votacionesActivas]);

  const pendingTransfers = useMemo(
    () => settlement?.Transferencias?.filter((item) => item.Estado === "pendiente") ?? [],
    [settlement]
  );
  const totalPendienteLiquidacion = useMemo(
    () => pendingTransfers.reduce((acc, item) => acc + Number(item.Monto ?? 0), 0),
    [pendingTransfers]
  );

  const loadTripDetail = useCallback(async () => {
    if (!initialTrip?.id) {
      setLoading(false);
      setLoadError("No se pudo resolver el viaje.");
      return false;
    }

    try {
      setLoading(true);
      setLoadError("");
      const detail = await getTripDetail(initialTrip.id);
      setTrip((current) => ({
        ...normalizeTrip(detail),
        image: current?.image ?? initialTrip.image,
      }));
      return true;
    } catch (error) {
      setLoadError(error.message || "No se pudo cargar el detalle del viaje.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [initialTrip?.id, initialTrip?.image]);

  const loadSettlement = useCallback(async () => {
    if (!initialTrip?.id) {
      return;
    }

    try {
      setLoadingSettlement(true);
      setSettlementError("");
      const data = await getTripSettlement(initialTrip.id);
      setSettlement(data);
    } catch (error) {
      setSettlementError(error.message || "No se pudo cargar la liquidación del viaje.");
    } finally {
      setLoadingSettlement(false);
    }
  }, [initialTrip?.id]);

  async function loadDocumentos() {
    if (!initialTrip?.id) {
      return;
    }

    try {
      setLoadingDocumentos(true);
      setDocumentosError("");
      const data = await getTripDocuments(initialTrip.id);
      setDocumentos(data);
    } catch (error) {
      setDocumentosError(error.message || "No se pudieron cargar los documentos del viaje.");
    } finally {
      setLoadingDocumentos(false);
    }
  }

  async function loadRepositorio() {
    if (!initialTrip?.id) {
      return;
    }

    try {
      setLoadingRepositorio(true);
      setRepositorioError("");
      const data = await getRepositorioItems(initialTrip.id);
      setRepositorioItems(data);
    } catch (error) {
      setRepositorioError(error.message || "No se pudo cargar la información del repositorio.");
    } finally {
      setLoadingRepositorio(false);
    }
  }

  async function copiarContenido(contenido) {
    try {
      await Clipboard.setStringAsync(contenido);
      avisar("Copiado", "El contenido se copió al portapapeles.");
    } catch (error) {
      avisar("Error", "No se pudo copiar el contenido.");
    }
  }

  async function eliminarItemRepositorio(item) {
    const ejecutar = async () => {
      try {
        setEliminandoItemId(item.IdItemRepositorio);
        await deleteRepositorioItem(trip.id, item.IdItemRepositorio);
        setRepositorioItems((prev) =>
          prev.filter((i) => i.IdItemRepositorio !== item.IdItemRepositorio)
        );
      } catch (error) {
        avisar("No se pudo eliminar", error.message || "Ocurrió un error al eliminar el ítem.");
      } finally {
        setEliminandoItemId(null);
      }
    };

    confirmar(
      "Eliminar información",
      `¿Seguro que querés eliminar "${item.Titulo}"?`,
      ejecutar
    );
  }

  async function abrirDocumento(url) {
    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert("Error", "No se pudo abrir el documento. Intentá nuevamente.");
    }
  }


  async function handleDescargarDocumento(documento) {
    try {
      setDescargandoDocId(documento.IdDocumento);
      await downloadTripDocument(trip.id, documento.IdDocumento, documento.NombreArchivo);
      avisar(
        "Descarga completa",
        Platform.OS === "web"
          ? "El documento se descargó correctamente."
          : "El documento se guardó en tu dispositivo."
      );
    } catch (error) {
      avisar("Error", error.message || "No se pudo descargar el documento. Intentá nuevamente.");
    } finally {
      setDescargandoDocId(null);
    }
  }


  async function eliminarDocumento(documento) {
      const ejecutar = async () => {
        try {
          setEliminandoDocId(documento.IdDocumento);
          await deleteTripDocument(trip.id, documento.IdDocumento);

          setDocumentos((prev) => {
            const nuevosDocs = prev.filter((d) => d.IdDocumento !== documento.IdDocumento);
            const quedanEnCategoria = nuevosDocs.some(
              (d) => d.IdCategoriaDocumento === documento.IdCategoriaDocumento
            );
            setTimeout(() => {
              if (quedanEnCategoria) {
                avisar("Documento eliminado", "El documento se eliminó correctamente.");
              } else {
                avisar("Documento eliminado", "Documento eliminado. La categoría quedó sin documentos y ya no se mostrará.");
                setCategoriaDocFiltro(ID_TODAS);
              }
            }, 150);
            return nuevosDocs;
          });
        } catch (error) {
          avisar("No se pudo eliminar", error.message || "Ocurrió un error al eliminar el documento.");
        } finally {
          setEliminandoDocId(null);
        }
      };

      confirmar(
        "Eliminar documento",
        `¿Seguro que querés eliminar "${documento.NombreArchivo}"? Esta acción no se puede deshacer.`,
        ejecutar
      );
    }

  /*useEffect(() => {
    loadTripDetail();
  }, [loadTripDetail]);

  useEffect(() => {
    // Se carga también en "grupo" para poder advertir sobre saldos
    // pendientes antes de confirmar la expulsión de un participante (US 73).
    if (activeTab === "gastos" || activeTab === "grupo") {
      loadSettlement();
    }
  }, [activeTab, loadSettlement]);*/

  useFocusEffect(
    useCallback(() => {
      loadTripDetail();
      if (activeTab === "gastos" || activeTab === "grupo") {
        loadSettlement();
      }
    }, [activeTab, loadSettlement, loadTripDetail, trip?.hasLeft])
  );

  useEffect(() => {
    if (activeTab === "docs") {
      loadDocumentos();
      loadRepositorio();
    }
  }, [activeTab, initialTrip?.id]);
  
  useEffect(() => {
    if (!trip?.id || trip?.hasLeft) return;
    
    let reconnectTimeout = null;
    let cancelado = false;

    async function conectar() {
      if (cancelado) return;
      try {
        const url = await getItinerarySocketUrl(trip.id);
        console.log("Conectando al WebSocket con URL:", url);
    
        socketRef.current = new WebSocket(url);
        console.log("WebSocket conectado");
        
        socketRef.current.onmessage = (event) => {
          console.log("Mensaje WebSocket recibido:", event.data);
          try {
            const mensaje = JSON.parse(event.data);
            console.log("Mensaje WebSocket recibido:", mensaje);

            if (mensaje.tipo === "documento_actualizado") {
              loadDocumentos();
              return;
            }

            if (mensaje.tipo === "edicion_rechazada"){
              console.log("Edición rechazada:", mensaje.mensaje);

              setActivityEditMessage(mensaje.mensaje);

              pendingEditRef.current = null;
              return;
            }
            if (mensaje.tipo === "edicion_concedida"){
              const actividadPendiente = pendingEditRef.current;

              if(actividadPendiente){
                setActivityModalDay(actividadPendiente);
                pendingEditRef.current = null;
              }
              return;
            }
            if (mensaje.tipo === "votacion_actualizada"){
              loadVotaciones();
              return;
            }
            if (mensaje.tipo === "usuario_anonimizado") {

              loadTripDetail();
              loadDocumentos();
              loadVotaciones();
              loadRepositorio();
              loadSettlement();
              return;
            }
            if (mensaje.tipo == "usuario_abandono_viaje"){
              loadTripDetail();
              return;
            }
            if (mensaje.tipo === "ruta_eliminada"){
              setActivityFeedback({
                success: false,
                message:
                  "La ruta automática de ese día se eliminó porque quedaron menos de dos actividades con ubicación cargada.",
              });
              loadTripDetail();
              return;
            }
            loadTripDetail();
          } catch (error) {
            console.error("Error procesando mensaje WebSocket:", error);
          }
        };

        socketRef.current.onclose = () => {
          if (!cancelado) {
            reconnectTimeout = setTimeout(conectar, 3000);
          }
        };

        socketRef.current.onerror = () => {
          socketRef.current?.close();
        };
      } catch {
        if (!cancelado) {
          reconnectTimeout = setTimeout(conectar, 3000);
        }
      }
    }

    conectar();

    return () => {
      cancelado = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      socketRef.current?.close();
    };
  }, [trip?.id, trip?.hasLeft]);

  const itinerarioDias = useMemo(() => {
    let diasBase = [];

    if (trip?.cronograma && trip.cronograma.length > 0) {
      diasBase = trip.cronograma;
    } else if (trip?.startDate && trip?.endDate) {
      const inicio = new Date(`${trip.startDate}T12:00:00`);
      const fin = new Date(`${trip.endDate}T12:00:00`);

      if (!isNaN(inicio.getTime()) && !isNaN(fin.getTime())) {
        const diferenciaTiempo = fin.getTime() - inicio.getTime();
        const totalDias = Math.ceil(diferenciaTiempo / (1000 * 60 * 60 * 24)) + 1;

        for (let i = 0; i < totalDias; i += 1) {
          const fechaActual = new Date(inicio);
          fechaActual.setDate(inicio.getDate() + i);

          const año = fechaActual.getFullYear();
          const mes = String(fechaActual.getMonth() + 1).padStart(2, "0");
          const dia = String(fechaActual.getDate()).padStart(2, "0");

          diasBase.push({
            id: `fallback-day-${i + 1}`,
            indiceDia: i + 1,
            fecha: `${año}-${mes}-${dia}`,
            actividades: [],
          });
        }
      }
    }

    return diasBase.map((day, index) => {
      const dayId = day.id ?? day.IdDiaCronograma;
      const dayIndex = day.indiceDia ?? day.IndiceDia ?? index + 1;
      const fechaRaw = day.fecha ?? day.Fecha;

      const actividadesBackend = (day.actividades ?? day.Actividades ?? []).map((act) => {
        const horaInicio = (act.horaInicio ?? act.HoraInicio)?.slice(0, 5);
        const horaFin = (act.horaFin ?? act.HoraFin)?.slice(0, 5);
        return {
          id: act.idActividad ?? act.IdActividad,
          idLugarInteres: act.idLugarInteres ?? act.IdLugarInteres ?? null,
          lugarInteres: act.lugarInteres ?? act.LugarInteres ?? null,
          horaInicio,
          horaFin,
          time: `${horaInicio} - ${horaFin}`,
          title: act.nombre ?? act.Nombre,
          note: act.descripcion ?? act.Descripcion,
          icon: act.icono ?? act.Icono ?? "location-dot",
        };
      });
      const actividades = day.items ?? actividadesBackend;

      return {
        dayId,
        dayIndex,
        fechaRaw,
        dayDateText: formatDayDate(fechaRaw),
        dayDateTextCorta: formatDayDateCorta(fechaRaw),
        actividades,
        ruta: normalizeRuta(day.ruta ?? day.Ruta ?? null),
      };
    });
  }, [trip?.cronograma, trip?.startDate, trip?.endDate]);

  async function loadVotaciones() {
    if (!trip?.id) return;
    try {
      setLoadingVotaciones(true);
      setVotacionesError("");
      const data = await getVotaciones(trip.id);
      setVotacionesActivas(data);
    } catch (error) {
      setVotacionesError(error.message || "No se pudieron cargar las votaciones.");
    } finally {
      setLoadingVotaciones(false);
    }
  }

  useEffect(() => {
    loadVotaciones();
  }, [trip?.id]);

  /*useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadTripDetail();
      loadSettlement();
    });
    return unsubscribe;
  }, [navigation, initialTrip?.id]);*/

  useEffect(() => {
    if (!trip || trip?.hasLeft) return;
    const timeoutId = setTimeout(async () => {
      if (!participantSearch.trim()) {
        setUserOptions([]);
        return;
      }
      try {
        const users = await getUsers(participantSearch, 8);
        setUserOptions(users);
      } catch {
        setUserOptions([]);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [participantSearch, trip]);

  useEffect(() => {
    async function precargarDatosOffline() {
      if (!trip?.id) return;
      
      try {
        const [participantes, categorias] = await Promise.all([
          getTripParticipants(trip.id),
          getExpenseCategories(),
        ]);
        
        guardarParticipantesEnCache(trip.id, participantes);
        guardarCategoriasEnCache(categorias);
        console.log("Datos offline del viaje precargados correctamente.");
        
        if (participantes) {
          setTrip((prev) => ({
            ...prev,
            participants: prev?.participants?.length ? prev.participants : participantes,
            participantUserIds: prev?.participantUserIds?.length
              ? prev.participantUserIds
              : participantes.map((p) => p.id ?? p.IdUsuario ?? p.Id),
          }));
        }
      
      } catch (error) {
        console.log("No se pudieron precargar datos offline del viaje:", error);
      }
    }
    precargarDatosOffline();
  }, [trip?.id]);

  const normalizedSearch = participantSearch.trim().toLowerCase();


  const isAdmin = useMemo(() => {
    if (!currentUser || !trip?.admin) return false;
    return String(currentUser.id) === String(trip.admin.id);
  }, [currentUser, trip?.admin]);

  const selectableUsers = useMemo(() => {
    if (!trip) return [];
    return userOptions.filter((user) => !trip.participantUserIds.includes(user.id));
  }, [trip, userOptions]);

  const canInviteExternal = useMemo(() => {
    if (!trip) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedSearch)) return false;
    if (trip.invitedEmails.includes(normalizedSearch)) return false;
    return !selectableUsers.some((user) => user.email.toLowerCase() === normalizedSearch);
  }, [normalizedSearch, selectableUsers, trip]);

  const participantItems = useMemo(() => {
    if (!trip) return [];
    const registered = (trip.participants || []).map((user) => {
      const nombreCompleto = user.nombreCompleto || user.name || 
        (user.Nombre && user.Apellido ? `${user.Nombre} ${user.Apellido}` : null) || 
        user.Nombre || "Usuario";

      return {
        key: `user-${user.id ?? user.IdUsuario}`,
        kind: "registered",
        id: user.id ?? user.IdUsuario,
        nombreCompleto: nombreCompleto,
        nombreUsuario: user.nombreUsuario ?? user.NombreUsuario ?? "",
        email: user.email ?? user.Email,
        fotoUrl: user.fotoUrl ?? user.FotoUrl ?? "",
        role: user.role ?? user.Role ?? "",
        status: user.status ?? user.Status ?? "aceptado",
      };
    });

    const invited = (trip.externalInvitations || []).map((invitation) => ({
      key: `invite-${invitation.email}`,
      kind: "external",
      nombreCompleto: invitation.email.split("@")[0],
      email: invitation.email,
      fotoUrl: "",
      status: invitation.status,
    }));

    return [...registered, ...invited];
  }, [trip?.externalInvitations, trip?.participants]);

  const participantesActivos = useMemo(() => {
    return participantItems.filter(p => p.status === "aceptado" || !p.status);
  }, [participantItems]);

  const invitadosPendientes = useMemo(() => {
    return participantItems.filter(p => p.status === "invitado");
  }, [participantItems]);

  function handleAddParticipant(user) {
    if (trip?.hasLeft) return;
    persistAddParticipant({ userId: user.id });
  }

  function handleAddExternalInvite() {
    if (trip?.hasLeft || !canInviteExternal) return;
    persistAddParticipant({ email: normalizedSearch });
  }

  async function persistAddParticipant(payload) {
    if (!trip?.id || trip?.hasLeft) return;
    try {
      setMutatingParticipants(true);
      setParticipantMessage("");
      await addTripParticipant(trip.id, payload);
      setParticipantSearch("");
      setUserOptions([]);
      await loadTripDetail();
    } catch (error) {
      setParticipantMessage(error.message || "No se pudo agregar el participante.");
    } finally {
      setMutatingParticipants(false);
    }
  }

  function handleRemoveParticipant(participant) {
    if (trip?.hasLeft) return;
    
    let mensaje = `¿Seguro que querés expulsar a ${participant.nombreCompleto} del viaje?`;

    if (participant.kind !== "external") {
      const resumenParticipante = settlement?.ResumenParticipantes?.find(
        (item) => item.IdUsuario === participant.id
      );
      const saldoPendiente = Number(resumenParticipante?.BalancePendiente ?? 0);
      if (saldoPendiente !== 0) {
        mensaje += ` Todavía tiene un saldo pendiente de liquidar de ${formatMoney(
          Math.abs(saldoPendiente),
          settlement?.Moneda ?? trip?.currency
        )}. Su historial de gastos se conservará igual.`;
      }
    }
    confirmar("Expulsar participante", mensaje, () => persistRemoveParticipant(participant));
  }

  async function persistRemoveParticipant(participant) {
    if  (trip?.hasLeft || !trip?.id) return;
    try {
      setMutatingParticipants(true);
      setParticipantMessage("");
      if (participant.kind === "external") {
        await removeTripExternalInvitation(trip.id, participant.email);
        avisar("Listo", "Se quitó la invitación externa correctamente.");
      } else {
        const resultado = await removeTripParticipant(trip.id, participant.id);
        avisar(
          "Participante expulsado",
          resultado?.advertencia
            ? `${resultado.message}. ${resultado.advertencia}`
            : resultado?.message || "El participante fue expulsado del viaje correctamente."
        );
      }
      await loadTripDetail();
    } catch (error) {
      setParticipantMessage(error.message || "No se pudo quitar el participante.");
    } finally {
      setMutatingParticipants(false);
    }
  }

  async function handleCreateActivity(payload) {
    if (!trip?.id || trip?.hasLeft || !activityModalDay) return;
    
    if (payload.id){
      await updateActivity(
      trip.id,
      activityModalDay.id,
      payload.id,
      payload
    );
    finalizarEdicionActividad(payload.id);
    } else {
      await createActivity(trip.id, activityModalDay.id, payload);
    }
    await loadTripDetail();
  }

  async function handleRebuildSettlement() {
    if (!trip?.id || trip?.hasLeft) return;
    try {
      setLoadingSettlement(true);
      setSettlementError("");
      const data = await rebuildTripSettlement(trip.id);
      setSettlement(data);
    } catch (error) {
      setSettlementError(error.message || "No se pudo recalcular la liquidación.");
    } finally {
      setLoadingSettlement(false);
    }
  }

  async function handleMarkTransferPaid(transferId, realizada) {
    if (!trip?.id || trip?.hasLeft) return;
    try {
      setUpdatingTransferId(transferId);
      setSettlementError("");
      const data = await markSettlementTransferPaid(trip.id, transferId, realizada);
      setSettlement(data);
    } catch (error) {
      setSettlementError(error.message || "No se pudo actualizar la transferencia.");
    } finally {
      setUpdatingTransferId(null);
    }
  }

  const [activityToDelete, setActivityToDelete] = useState(null);
  const [activityFeedback, setActivityFeedback] = useState(null);
  const [displayedFeedback, setDisplayedFeedback] = useState(null);
  const [generandoRutaDayId, setGenerandoRutaDayId] = useState(null);
  const [diaConMapaVisible, setDiaConMapaVisible] = useState(null);
  const [modoTransporteDayId, setModoTransporteDayId] = useState({});

  const MODOS_RUTA = [
    { valor: "walking", label: "Caminando", icono: "person-walking" },
    { valor: "driving", label: "Auto", icono: "car" },
    { valor: "bicycling", label: "Bici", icono: "person-biking" },
  ];

  function getRouteAvailabilityMessage(puedeGenerarRuta) {
    if (puedeGenerarRuta) {
      return "Todavia no hay una ruta generada para este dia. Generala para visualizar el recorrido en el mapa.";
    }

    return "Todavia no hay una ruta generada para este dia. Agrega al menos 2 actividades con ubicacion para poder visualizar el recorrido en el mapa.";
  }

  function resolverModoDelDia(dayId, ruta) {
    return modoTransporteDayId[dayId] ?? ruta?.modo ?? "walking";
  }

  async function handleGenerarRuta(dayId, modo) {
    if (!trip?.id || trip?.hasLeft || generandoRutaDayId) return;

    setGenerandoRutaDayId(dayId);
    try {
      const resultado = await generateTripRoute(trip.id, dayId, modo);
      const recargaOk = await loadTripDetail();

      if (!recargaOk) {
        setActivityFeedback({
          success: false,
          message:
            "La ruta se generó, pero no pudimos actualizar la vista. Recargá la pantalla para verla.",
        });
        return;
      }

      const excluidas = resultado.actividadesExcluidas ?? [];
      setActivityFeedback({
        success: true,
        message: excluidas.length
          ? `${resultado.message} Quedaron afuera por no tener ubicación cargada: ${excluidas
              .map((a) => a.nombre)
              .join(", ")}.`
          : resultado.message,
      });
    } catch (error) {
      console.error("Error al generar la ruta:", error);
      setActivityFeedback({
        success: false,
        message:
          (error && error.message) ||
          "No se pudo generar la ruta para este día. Revisá la consola del navegador para más detalles.",
      });
    } finally {
      setGenerandoRutaDayId(null);
    }
  }

  async function abrirGoogleMaps(dayId, actividades, ruta) {
    const actividadesConUbicacion = actividades.filter(
      (item) => item.lat || item.latitude || item.lugarInteres?.lat || item.lugarInteres?.latitude
    );

    if (!actividadesConUbicacion || actividadesConUbicacion.length === 0) {
      avisar("Aviso", "No hay actividades con ubicación para mostrar en Google Maps.");
      return;
    }

    const getLat = (act) => act.lat ?? act.latitude ?? act.lugarInteres?.lat ?? act.lugarInteres?.latitude;
    const getLng = (act) => act.lng ?? act.longitude ?? act.lugarInteres?.lng ?? act.lugarInteres?.longitude;

    const origen = actividadesConUbicacion[0];
    const destino = actividadesConUbicacion[actividadesConUbicacion.length - 1];

    const waypoints = actividadesConUbicacion.slice(1, -1);
    const waypointsString = waypoints
      .map((act) => `${getLat(act)},${getLng(act)}`)
      .join("|");

    const originCoords = `${getLat(origen)},${getLng(origen)}`;
    const destinationCoords = `${getLat(destino)},${getLng(destino)}`;
    
    const modoSeleccionado = resolverModoDelDia(dayId, ruta);
    let travelmode = "walking";
    if (modoSeleccionado === "driving") travelmode = "driving";
    else if (modoSeleccionado === "bicycling") travelmode = "bicycling";

    let url = `https://www.google.com/maps/dir/?api=1&origin=${originCoords}&destination=${destinationCoords}&travelmode=${travelmode}`;
    
    if (waypointsString) {
      url += `&waypoints=${waypointsString}`;
    }

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        avisar("Error", "No se pudo abrir Google Maps en este dispositivo.");
      }
    } catch (error) {
      avisar("Error", "Ocurrió un error al intentar abrir el mapa.");
    }
  }

  function handleDeleteActivity(dayId, activityId, activityTitle) {
    if (trip?.hasLeft) return;
    setActivityToDelete({ dayId, activityId, title: activityTitle });
  }

  async function handleConfirmDeleteActivity() {
    if (!trip?.id || trip?.hasLeft || !activityToDelete) return;
    const { dayId, activityId, title } = activityToDelete;
    setActivityToDelete(null);

    try {
      await deleteActivity(trip.id, dayId, activityId);
      await loadTripDetail();
      setActivityFeedback({
        success: true,
        message: `"${title}" se eliminó correctamente.`,
      });
    } catch (error) {
      setActivityFeedback({
        success: false,
        message:
          error.message || "Ocurrió un problema al intentar eliminar la actividad.",
      });
    }
  }

  useEffect(() => {
    if (!activityFeedback) return;
    setDisplayedFeedback(activityFeedback);
    const timeout = setTimeout(() => setActivityFeedback(null), 2500);
    return () => clearTimeout(timeout);
  }, [activityFeedback]);

  async function handleConfirmDelete() {
    if (!trip?.id || trip?.hasLeft) return;
    try {
      setShowDeleteModal(false);
      setLoading(true);
      
      await deleteTrip(trip.id);

      setLoading(false);
      navigation.reset({
        index: 0,
        routes: [{ name: "Tabs" }], 
      });

      setTimeout(() => {
        Alert.alert(
          "Viaje dado de baja", 
          "El viaje ha sido eliminado correctamente."
        );
      }, 300);

    } catch (error) {
      setLoading(false);
      setTimeout(() => {
        Alert.alert("Error", error.message || "Ocurrió un problema al intentar eliminar el viaje.");
      }, 300);
    }
  }

  if (!trip && !loading) {
    return (
      <ScreenContainer fullWidth padded={false}>
        <View style={styles.body}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>No se pudo cargar el viaje</Text>
            <Text style={styles.sectionCopy}>
              {loadError || "No se encontró información para mostrar."}
            </Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer fullWidth padded={false}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ImageBackground 
          imageStyle={styles.heroImage} 
          source={{ uri: trip.image }} 
          style={styles.hero}
        >
          <LinearGradient 
            colors={["rgba(4,16,36,0.15)", "rgba(9,19,45,0.82)"]} 
            style={styles.heroGradient}
            pointerEvents="box-none" 
          >
            <View style={styles.heroActions} pointerEvents="box-none">
              <IconCircleButton icon="arrow-left" onPress={() => navigation.goBack()} />
              <View style={styles.heroActionsRight} pointerEvents="box-none">
                {isAdmin && !trip?.hasLeft ? (
                  <IconCircleButton
                    icon="pen-to-square"
                    onPress={() => navigation.navigate("EditarViaje", { tripId: trip.id })}
                  />
                ) : null}
                
                <IconCircleButton 
                  icon="ellipsis-vertical" 
                  onPress={() => {
                    if (trip?.hasLeft) {
                      Alert.alert("Modo consulta", "Estás consultando este viaje desde tu historial. No se puede gestionar.");
                      return;
                    }
                    if (isAdmin) {
                      setShowOptionsMenu(true); 
                    } else {
                      Alert.alert("Acceso denegado", "Solo el administrador de este viaje puede gestionarlo."); 
                    }
                  }} 
                />
              </View>
            </View>

            <View style={styles.heroContent}>
              <Text style={styles.heroMeta}>{`${formatHeroDate(trip)} · ${participantItems.length} ${participantItems.length === 1 ? "persona" : "personas"}`}</Text>
              <Text style={styles.heroTitle}>{trip.title}</Text>
              <Text style={styles.heroSubtitle}>{trip.destination}</Text>
              <View style={styles.heroFooter}>
                <AvatarStack
                  max={4}
                  overflowLabel={participantItems.length > 4 ? `+${participantItems.length - 4}` : ""}
                  participants={participantItems}
                  size={34}
                />
              </View>
            </View>
          </LinearGradient>
        </ImageBackground>

        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={[styles.tabButton, active && styles.tabButtonActive]}
              >
                <FontAwesome6 color={active ? colors.accent : colors.primary} name={tab.icon} size={18} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {trip?.hasLeft ? (
          <View style={styles.readOnlyBanner}>
            <FontAwesome6
              name="triangle-exclamation"
              size={16}
              color={colors.warning}
            />

            <View style={styles.readOnlyBannerContent}>
              <Text style={styles.readOnlyBannerTitle}>
                Ya no formás parte de este viaje
              </Text>

              <Text style={styles.readOnlyBannerText}>
                Podés consultar la información del viaje, pero ya no podés realizar modificaciones.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.body}>
          {loadError ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>No se pudo cargar el viaje</Text>
              <Text style={styles.sectionCopy}>{loadError}</Text>
            </View>
          ) : null}
          {activeTab === "itinerario" ? (
            <>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Explorar destinos</Text>
                <Text style={styles.sectionCopy}>
                  Abre el mapa del viaje para revisar destinos base y guardar lugares de interés con Google Maps.
                </Text>
                <PrimaryButton
                  icon="map-location-dot"
                  iconPosition="left"
                  label="Explorar destinos de interés"
                  onPress={() => navigation.navigate("ExplorePlaces", { tripId: trip.id })}
                  style={styles.fullButton}
                />
              </View>
              <View style={styles.itinerarioHeader}>
                <ItinerarioViewToggle onChange={setItinerarioView} value={itinerarioView} />
              </View>
            </>
          ) : null}

          {activeTab === "itinerario" && itinerarioView === "timeline" ? (
            itinerarioDias.length > 0 ? (
              itinerarioDias.map((day) => {
                const { dayId, dayIndex, dayDateText, actividades, ruta } = day;
                const isExpanded = expandedDayId === dayId;

                return (
                  <View key={dayId} style={[styles.dayCard, !isExpanded && styles.dayCardCompact]}>
                    <Pressable
                      onPress={() => setExpandedDayId(isExpanded ? null : dayId)}
                      style={styles.dayHeader}
                    >
                      <View style={[styles.dayIndex, isExpanded && styles.dayIndexActive]}>
                        <Text style={[styles.dayIndexText, isExpanded && styles.dayIndexTextActive]}>
                          {dayIndex}
                        </Text>
                      </View>
                      <View style={styles.dayTitleWrap} >
                        <Text style={styles.dayTitle}>{dayDateText}</Text> 
                        <Text style={styles.daySubtitle}>Día {dayIndex} del viaje</Text>
                      </View>
                      <FontAwesome6 
                        color={colors.textSecondary} 
                        name={isExpanded ? "chevron-up" : "chevron-down"} 
                        size={14} 
                      />
                    </Pressable>

                    {isExpanded ? (
                      <View style={styles.dayAgenda}>
                        {actividades.length > 0 ? (
                          actividades.map((item, actIndex) => (
                            <View key={item.id ?? actIndex} style={styles.agendaItem}>
                              <View style={styles.agendaIcon}>
                                <FontAwesome6 color={colors.primary} name={item.icon ?? "location-dot"} size={14} />
                              </View>
                              <View style={styles.agendaContent}>
                                <View style={styles.agendaHeaderRow}>
                                  <Text style={styles.agendaTime}>{item.time ?? item.Hora ?? "---"}</Text>
                                  <Text style={styles.agendaTitle}>{item.title ?? item.Titulo}</Text>
                                </View>
                                {!!item.note || item.Notas ? (
                                  <Text style={styles.agendaNote}>{item.note ?? item.Notas}</Text>
                                ) : null}
                              </View>
                              {!trip?.hasLeft ? (
                                <View style={styles.agendaActions}>
                                <Pressable
                                  hitSlop={8}
                                  onPress={() => {
                                    const enviado = enviarMensajeWebSocket({
                                      tipo: "iniciar_edicion",
                                      idActividad: item.id,
                                    });

                                    if (!enviado) {
                                      return;
                                    }

                                    pendingEditRef.current = {
                                      id: dayId,
                                      label: `${dayDateText} · Día ${dayIndex}`,
                                      activity: item,
                                    };
                                  }}
                                  style={styles.agendaActionButton}
                                >
                                  <FontAwesome6 color={colors.primary} name="pen" size={13} />
                                </Pressable>

                                <Pressable
                                  hitSlop={8}
                                  onPress={() =>
                                    handleDeleteActivity(dayId, item.id, item.title ?? item.Titulo)
                                  }
                                  style={styles.agendaActionButton}
                                >
                                  <FontAwesome6 color={colors.textMuted} name="trash" size={13} />
                                </Pressable>
                              </View>
                          ): null}
                          </View>
                        ))
                      ): (
                          <Text style={styles.sectionCopy}>No hay actividades agendadas para este día todavía.</Text>
                        )}

                        {!trip?.hasLeft ? (
                          <Pressable
                            onPress={() =>
                              setActivityModalDay({
                                id: dayId,
                                label: `${dayDateText} · Día ${dayIndex}`,
                              })
                            }
                            style={styles.addActivityButton}
                          >
                            <FontAwesome6 color={colors.primary} name="plus" size={12} />
                            <Text style={styles.addActivityText}>Agregar actividad</Text>
                          </Pressable>
                        ) : null}

                        {(() => {
                          const actividadesConUbicacion = actividades.filter(
                            (item) => item.idLugarInteres || item.lugarInteres
                          );
                          const puedeGenerarRuta = actividadesConUbicacion.length >= 2;
                          const generando = generandoRutaDayId === dayId;
                          const routeMarkers = buildRouteMarkers(actividades, ruta);
                          const modoSeleccionado = resolverModoDelDia(dayId, ruta);

                          return (
                            <View style={styles.routeSection}>
                              {ruta ? (
                                <View style={styles.routeSummaryRow}>
                                  <View style={styles.routeSummary}>
                                    <FontAwesome6 color={colors.primary} name="route" size={13} />
                                    <Text style={styles.routeSummaryText}>
                                      {(ruta.distanciaMetros / 1000).toFixed(1)} km ·{" "}
                                      {Math.round(ruta.duracionSegundos / 60)} min
                                    </Text>
                                  </View>
                                  {ruta.polilineaCodificada ? (
                                    <Pressable
                                      onPress={() =>
                                        setDiaConMapaVisible((current) =>
                                          current === dayId ? null : dayId
                                        )
                                      }
                                      style={styles.routeMapToggle}
                                    >
                                      <FontAwesome6
                                        color={colors.primary}
                                        name={diaConMapaVisible === dayId ? "chevron-up" : "map-location-dot"}
                                        size={12}
                                      />
                                      <Text style={styles.routeMapToggleText}>
                                        {diaConMapaVisible === dayId ? "Ocultar mapa" : "Ver mapa"}
                                      </Text>
                                    </Pressable>
                                  ) : null}
                                </View>
                              ) : null}

                              {ruta && diaConMapaVisible === dayId ? (
                                <View style={styles.routeMapWrap}>
                                  <MapCanvas
                                    initialCenter={
                                      routeMarkers[0]
                                        ? { lat: routeMarkers[0].lat, lng: routeMarkers[0].lng }
                                        : undefined
                                    }
                                    markers={routeMarkers}
                                    routePolyline={ruta.polilineaCodificada}
                                  />

                                  {/* Botón para abrir en Google Maps */}
                                  <Pressable
                                    style={styles.openGoogleMapsButton}
                                    onPress={() => abrirGoogleMaps(dayId, actividadesConUbicacion, ruta)}
                                  >
                                    <FontAwesome6 name="map-location-dot" size={14} color={colors.textInverse} />
                                    <Text style={styles.openGoogleMapsText}>Abrir en Google Maps</Text>
                                  </Pressable>
                                </View>
                              ) : null}

                              {!ruta ? (
                                <Text style={styles.routeHint}>
                                  {getRouteAvailabilityMessage(puedeGenerarRuta)}
                                </Text>
                              ) : null}

                              {puedeGenerarRuta && !trip?.hasLeft ? (
                                <>
                                  <View style={styles.modoTransporteWrap}>
                                    {MODOS_RUTA.map((modo) => {
                                      const active = modo.valor === modoSeleccionado;
                                      return (
                                        <Pressable
                                          key={modo.valor}
                                          disabled={generando}
                                          onPress={() =>
                                            setModoTransporteDayId((current) => ({
                                              ...current,
                                              [dayId]: modo.valor,
                                            }))
                                          }
                                          style={[styles.modoChip, active && styles.modoChipActive]}
                                        >
                                          <FontAwesome6
                                            color={active ? colors.textInverse : colors.primary}
                                            name={modo.icono}
                                            size={12}
                                          />
                                          <Text
                                            style={[
                                              styles.modoChipText,
                                              active && styles.modoChipTextActive,
                                            ]}
                                          >
                                            {modo.label}
                                          </Text>
                                        </Pressable>
                                      );
                                    })}
                                  </View>

                                  <Pressable
                                    disabled={generando}
                                    onPress={() => handleGenerarRuta(dayId, modoSeleccionado)}
                                    style={[
                                      styles.addActivityButton,
                                      generando && styles.addActivityButtonDisabled,
                                    ]}
                                  >
                                    {generando ? (
                                      <ActivityIndicator color={colors.primary} size="small" />
                                    ) : (
                                      <FontAwesome6 color={colors.primary} name="route" size={12} />
                                    )}
                                    <Text style={styles.addActivityText}>
                                      {generando
                                        ? "Generando ruta..."
                                        : ruta
                                        ? "Regenerar ruta"
                                        : "Generar ruta"}
                                    </Text>
                                  </Pressable>
                                </>
                              ) : (
                                <Text style={styles.routeHint}>
                                  Agregá al menos 2 actividades con ubicación para generar una ruta
                                  automática.
                                </Text>
                              )}
                            </View>
                          );
                        })()}
                      </View>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Fechas sin definir</Text>
                <Text style={styles.sectionCopy}>Establecé las fechas de ida y vuelta para estructurar el cronograma.</Text>
              </View>
            )
          ) : null}

          {activeTab === "itinerario" && itinerarioView === "calendario" ? (
            <ItinerarioCalendarView
              dias={itinerarioDias}
              generandoRutaDayId={generandoRutaDayId}
              onGenerarRuta={handleGenerarRuta}
              onAddActivity={(day) =>
                setActivityModalDay({
                  id: day.dayId,
                  label: `${day.dayDateText} · Día ${day.dayIndex}`,
                })
              }
              onDeleteActivity={!trip?.hasLeft ? (day, actividad) => 
                handleDeleteActivity(day.dayId, actividad.id, actividad.title): undefined
              }
              onEditActivity={!trip?.hasLeft ? (day, actividad) => {
                const enviado = enviarMensajeWebSocket({
                  tipo: "iniciar_edicion",
                  idActividad: actividad.id,
                });

                if (!enviado) {
                  return;
                }

                pendingEditRef.current = {
                  id: day.dayId,
                  label: `${day.dayDateText} · Día ${day.dayIndex}`,
                  activity: actividad,
                };
              } : undefined}
            />
          ) : null}

          {activeTab === "gastos" ? (
            <View style={styles.sectionStack}>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Gastos del viaje</Text>
                <Text style={styles.sectionCopy}>Moneda base: {trip.currency}. Puedes cargar nuevos gastos o revisar el balance del grupo.</Text>
                {!trip?.hasLeft ? (
                  <PrimaryButton
                    icon="plus"
                    iconPosition="left"
                    label="Agregar gasto"
                    onPress={() => navigation.navigate("AddGasto", { IdViaje: trip.id, Moneda: trip.currency })}
                    style={styles.fullButton}
                  />
                ) : null}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Balance general</Text>
                <Text style={styles.sectionCopy}>
                  El sistema calcula automáticamente las deudas netas y propone la menor cantidad posible de transferencias.
                </Text>
                {!trip?.hasLeft ? (
                  <PrimaryButton
                    icon="rotate"
                    iconPosition="left"
                    label="Recalcular liquidación"
                    loading={loadingSettlement}
                    onPress={handleRebuildSettlement}
                    style={styles.fullButton}
                    variant="secondary"
                  />
                ) : null}
                {settlementError ? (
                  <Text style={styles.settlementError}>{settlementError}</Text>
                ) : null}
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.settlementHeaderRow}>
                  <Text style={styles.sectionHeading}>Resumen financiero</Text>
                  {loadingSettlement ? <ActivityIndicator color={colors.primary} /> : null}
                </View>
                <Text style={styles.sectionCopy}>
                  El estado de cuenta se recalcula con cada gasto nuevo y refleja tanto lo pagado como el gasto individual asignado.
                </Text>
                <View style={[styles.metricsRow, isNarrowMobile ? styles.metricsRowCompact : null]}>
                  <MetricCard
                    label="Total gastado"
                    style={isNarrowMobile ? styles.metricCardHalf : null}
                    valueStyle={isNarrowMobile ? styles.metricValueCompact : null}
                    value={formatMoney(settlement?.TotalGastosViaje ?? 0, settlement?.Moneda ?? trip.currency)}
                  />
                  <MetricCard
                    label="Por saldar"
                    style={isNarrowMobile ? styles.metricCardHalf : null}
                    valueStyle={isNarrowMobile ? styles.metricValueCompact : null}
                    value={formatMoney(totalPendienteLiquidacion, settlement?.Moneda ?? trip.currency)}
                  />
                  <MetricCard
                    label="Participantes"
                    style={isNarrowMobile ? styles.metricCardFull : null}
                    valueStyle={isNarrowMobile ? styles.metricValueCompact : null}
                    value={String(settlement?.ResumenParticipantes?.length ?? 0)}
                  />
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.settlementHeaderRow}>
                  <Text style={styles.sectionHeading}>Resumen por participante</Text>
                  {loadingSettlement ? <ActivityIndicator color={colors.primary} /> : null}
                </View>
                {settlement?.ResumenParticipantes?.length ? (
                  <View style={styles.settlementList}>
                    {settlement.ResumenParticipantes.map((item) => {
                      const balancePendiente = Number(item.BalancePendiente ?? 0);
                      const esAcreedor = balancePendiente > 0;
                      const esDeudor = balancePendiente < 0;
                      return (
                        <View key={item.IdParticipanteViaje} style={styles.settlementRow}>
                          <View style={styles.settlementPerson}>
                            <Text style={styles.settlementPersonName}>{item.NombreCompleto}</Text>
                            <Text style={styles.settlementPersonMeta}>
                              Pagó: {formatMoney(item.TotalPagado, settlement.Moneda)} · Gasto individual:{" "}
                              {formatMoney(item.GastoIndividual, settlement.Moneda)}
                            </Text>
                            <Text style={styles.settlementPersonMeta}>
                              Saldo neto: {formatMoney(item.BalanceOriginal, settlement.Moneda)}
                            </Text>
                          </View>
                          <View style={styles.settlementRight}>
                            <View
                              style={[
                                styles.settlementBadge,
                                esAcreedor
                                  ? styles.settlementBadgeSuccess
                                  : esDeudor
                                    ? styles.settlementBadgeWarning
                                    : styles.settlementBadgeNeutral,
                              ]}
                            >
                              <Text style={styles.settlementBadgeText}>
                                {esAcreedor ? "Debe cobrar" : esDeudor ? "Debe pagar" : "Saldado"}
                              </Text>
                            </View>
                            <Text style={styles.settlementAmount}>
                              {formatMoney(item.BalancePendiente, settlement.Moneda)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : !loadingSettlement ? (
                  <Text style={styles.sectionCopy}>Todavía no hay participantes aceptados para calcular la liquidación.</Text>
                ) : null}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Plan de liquidación</Text>
                {settlement?.Transferencias?.length ? (
                  <View style={styles.settlementList}>
                    {settlement.Transferencias.map((transfer) => {
                      const pendiente = transfer.Estado === "pendiente";
                      return (
                        <View key={transfer.IdTransferenciaLiquidacion} style={styles.transferCard}>
                          <View style={styles.transferHeader}>
                            <View style={styles.transferTextWrap}>
                              <Text style={styles.transferTitle}>
                                {transfer.NombreDeudor} paga a {transfer.NombreAcreedor}
                              </Text>
                              <Text style={styles.transferMeta}>
                                {formatMoney(transfer.Monto, settlement.Moneda)}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.settlementBadge,
                                pendiente ? styles.settlementBadgeWarning : styles.settlementBadgeSuccess,
                              ]}
                            >
                              <Text style={styles.settlementBadgeText}>
                                {pendiente ? "Pendiente" : "Realizada"}
                              </Text>
                            </View>
                          </View>

                          <PrimaryButton
                            icon={pendiente ? "check" : "arrow-rotate-left"}
                            iconPosition="left"
                            label={pendiente ? "Marcar como realizada" : "Volver a pendiente"}
                            loading={updatingTransferId === transfer.IdTransferenciaLiquidacion}
                            onPress={() =>
                              handleMarkTransferPaid(
                                transfer.IdTransferenciaLiquidacion,
                                pendiente
                              )
                            }
                            style={styles.transferButton}
                            variant={pendiente ? "primary" : "secondary"}
                          />
                        </View>
                      );
                    })}
                  </View>
                ) : !loadingSettlement ? (
                  <Text style={styles.sectionCopy}>No hay deudas pendientes. El grupo está balanceado.</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {activeTab === "docs" ? (
            <>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>Documentos</Text>
              {loadingDocumentos ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
              ) : documentosError ? (
                <Text style={styles.settlementError}>{documentosError}</Text>
              ) : (
                <View style={{ marginTop: spacing.sm }}>
                  <DocumentosPorCategoria
                    documentos={documentos}
                    categoriaFiltro={categoriaDocFiltro}
                    onCategoriaChange={setCategoriaDocFiltro}
                    onAbrir={(documento) => abrirDocumento(documento.UrlArchivo)}
                    onDescargar={handleDescargarDocumento}
                    onEditar={!trip?.hasLeft ? (documento) =>
                      navigation.navigate("EditDocument", {
                        tripId: trip.id,
                        documento,
                      }): undefined
                    }
                    onEliminar={!trip?.hasLeft ? eliminarDocumento : undefined}
                    descargandoDocId={descargandoDocId}
                    eliminandoDocId={eliminandoDocId}
                  />
                </View>
              )}

              {!trip?.hasLeft ? (
                <PrimaryButton
                  label="Subir documentos"
                  icon="folder-open"
                  iconPosition="left"
                  onPress={() =>
                    navigation.navigate("Documents", {
                      tripId: trip.id,
                    })
                  }
                  style={[styles.fullButton, { marginTop: spacing.md }]}
                />
              ) : null}
            </View>

            <View style={[styles.sectionCard, { marginTop: spacing.md }]}>
              <Text style={styles.sectionHeading}>Información relevante</Text>

              {loadingRepositorio ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
              ) : repositorioError ? (
                <Text style={styles.settlementError}>{repositorioError}</Text>
              ) : repositorioItems.length === 0 ? (
                <Text style={styles.sectionCopy}>
                  Enlaces, direcciones y contactos útiles para el viaje aparecerán aquí.
                </Text>
              ) : (
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  {repositorioItems.map((item) => {
                    const eliminandoEsteItem = eliminandoItemId === item.IdItemRepositorio;
                    const iconoPorTipo = {
                      enlace: "link",
                      direccion: "location-dot",
                      contacto: "address-book",
                      otro: "circle-info",
                    };
                    return (
                      <View
                        key={item.IdItemRepositorio}
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: radii.md,
                          padding: spacing.md,
                          gap: 6,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
                          <FontAwesome6
                            name={iconoPorTipo[item.Tipo] || "circle-info"}
                            size={16}
                            color={colors.primary}
                          />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={styles.sectionCopy}>{item.Titulo}</Text>
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
                            <Text style={[styles.sectionCopy, { fontSize: 13, marginTop: 2 }]}>
                              {item.Contenido}
                            </Text>
                            {item.Descripcion ? (
                              <Text style={[styles.sectionCopy, { fontSize: 12, opacity: 0.7, marginTop: 2 }]}>
                                {item.Descripcion}
                              </Text>
                            ) : null}
                            <Text style={[styles.sectionCopy, { fontSize: 11, opacity: 0.6, marginTop: 2 }]}>
                              Subido por {item.NombreUsuarioCreador}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: "row", gap: spacing.md, marginTop: 6 }}>
                          <Pressable
                            onPress={() => copiarContenido(item.Contenido)}
                            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                          >
                            <FontAwesome6 name="copy" size={12} color={colors.textSecondary} />
                            <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: "600" }}>Copiar</Text>
                          </Pressable>

                          {item.EsPropio && !trip?.hasLeft ? (
                            <>
                              <Pressable
                                onPress={() =>
                                  navigation.navigate("GuardarInformacion", {
                                    tripId: trip.id,
                                    item,
                                    onItemGuardado: (actualizado) =>
                                      setRepositorioItems((prev) =>
                                        prev.map((i) =>
                                          i.IdItemRepositorio === actualizado.IdItemRepositorio ? actualizado : i
                                        )
                                      ),
                                  })
                                }
                                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                              >
                                <FontAwesome6 name="pen" size={13} color={colors.textSecondary} />
                                <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: "600" }}>Editar</Text>
                              </Pressable>

                              <Pressable
                                onPress={() => eliminarItemRepositorio(item)}
                                disabled={eliminandoEsteItem}
                                style={{ flexDirection: "row", alignItems: "center", gap: 4, opacity: eliminandoEsteItem ? 0.6 : 1 }}
                              >
                                <FontAwesome6 name="trash" size={12} color={colors.danger} />
                                <Text style={{ fontSize: 12, color: colors.danger, fontWeight: "600" }}>
                                  {eliminandoEsteItem ? "Eliminando..." : "Eliminar"}
                                </Text>
                              </Pressable>
                            </>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
              {!trip?.hasLeft ? (
                <PrimaryButton
                  label="Agregar información"
                  icon="plus"
                  iconPosition="left"
                  onPress={() =>
                    navigation.navigate("GuardarInformacion", {
                      tripId: trip.id,
                      onItemGuardado: (nuevoItem) =>
                        setRepositorioItems((prev) => [nuevoItem, ...prev]),
                    })
                  }
                  style={[styles.fullButton, { marginTop: spacing.md }]}
                />
              ) : null}
            </View>
            </>
          ) : null}

          {activeTab === "votar" ? (
            <View style={styles.sectionStack}>
              {!trip?.hasLeft ? (
                <Pressable
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    backgroundColor: colors.primary,
                    height: 48,
                    borderRadius: 12,
                    marginBottom: 16,
                    opacity: pressed ? 0.85 : 1,
                  })}
                  onPress={() => navigation.navigate("CrearVotacion", {
                      IdViaje: trip.id,
                      onVotacionCreada: (nuevaVotacion) =>
                          setVotacionesActivas((prev) => [nuevaVotacion, ...prev]),
                  })}
                >
                  <FontAwesome6 name="plus" size={14} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Crear votación</Text>
                </Pressable>
              ) : null} 

              {loadingVotaciones ? (
                <ActivityIndicator color={colors.primary} />
              ) : votacionesError ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionCopy}>{votacionesError}</Text>
                </View>
              ) : votacionesVisibles.length === 0 ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionCopy}>
                    Todavía no hay votaciones para este viaje. ¡Creá la primera!
                  </Text>
                </View>
              ) : null}

              {votacionesVisibles.map((votacion) => {
                const esCancelada = votacion.Estado === "cancelada";
                const esCerrada = votacion.Estado
                  ? votacion.Estado === "cerrada"
                  : new Date(votacion.FechaCierre) < new Date();
                const finalizada = esCerrada || esCancelada;
                const mostrarResultados = finalizada || votacion.YaVoto;
                const opcionesElegidas = votosSeleccionados[votacion.IdVotacion] || [];
                const enviandoEsteVoto = votandoId === votacion.IdVotacion;
                const cancelandoEstaVotacion = cancelandoId === votacion.IdVotacion;
                const esCreador = currentUser && String(currentUser.id) === String(votacion.IdCreador);
                const puedeCancelar = esCreador && !finalizada;
                const estadoVotacion = votacion.Estado || (finalizada ? "cerrada" : "abierta");
                const estadoLabel = ESTADO_VOTACION_LABEL[estadoVotacion] || estadoVotacion;
                const fechaCierreTexto = formatFechaHoraCierre(votacion.FechaCierre);

                const togglePropuesta = (idPropuesta, tipo) => {
                  if (trip?.hasLeft) return;
                  setVotosSeleccionados(prev => {
                    const actuales = prev[votacion.IdVotacion] || [];
                    if (tipo === "opcion_unica") {
                      return { ...prev, [votacion.IdVotacion]: [idPropuesta] };
                    } else {
                      return actuales.includes(idPropuesta)
                        ? { ...prev, [votacion.IdVotacion]: actuales.filter(id => id !== idPropuesta) }
                        : { ...prev, [votacion.IdVotacion]: [...actuales, idPropuesta] };
                    }
                  });
                };

                const registrarVoto = async () => {
                  if (trip?.hasLeft) return;
                  if (opcionesElegidas.length === 0) {
                    avisar("Atención", "Por favor, seleccioná al menos una opción.");
                    return;
                  }

                  try {
                    setVotandoId(votacion.IdVotacion);
                    const resultado = await emitirVoto(votacion.IdVotacion, opcionesElegidas);
                    avisar(
                      "¡Listo!",
                      resultado?.detail || "Voto registrado correctamente. ¡Gracias por participar!"
                    );
                    setVotacionesActivas(prev =>
                      prev.map(v => v.IdVotacion === votacion.IdVotacion ? { ...v, YaVoto: true } : v)
                    );
                  } catch (error) {
                    avisar("No se pudo votar", error.message || "Ocurrió un error al registrar tu voto.");
                  } finally {
                    setVotandoId(null);
                  }
                };

                const ejecutarCancelacion = async () => {
                  try {
                    setCancelandoId(votacion.IdVotacion);
                    const actualizada = await cancelarVotacion(votacion.IdVotacion);
                    avisar("Votación cancelada", "La votación se canceló correctamente.");
                    setVotacionesActivas(prev =>
                      prev.map(v => v.IdVotacion === votacion.IdVotacion ? { ...v, ...actualizada } : v)
                    );
                  } catch (error) {
                    avisar("No se pudo cancelar", error.message || "Ocurrió un error al cancelar la votación.");
                  } finally {
                    setCancelandoId(null);
                  }
                };

                const cancelarEstaVotacion = () => {
                  confirmar(
                    "Cancelar votación",
                    `¿Seguro que querés cancelar "${votacion.Titulo}"? Los votos ya registrados se conservarán como histórico, pero no se podrán emitir nuevos votos.`,
                    ejecutarCancelacion
                  );
                };

                return (
                  <View key={votacion.IdVotacion} style={styles.sectionCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={[styles.sectionHeading, { fontSize: 18, flex: 1 }]}>{votacion.Titulo}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <StatusPill 
                          tone={estadoVotacion}
                          style={{ paddingHorizontal: 6, paddingVertical: 6, borderRadius: 6 }}
                          textStyle={{ fontSize: 10, textTransform: 'uppercase' }}
                        >
                          {estadoLabel}
                        </StatusPill>
                        <View style={{ backgroundColor: votacion.Tipo === 'opcion_unica' ? '#e0f2fe' : '#efe8ff', padding: 6, borderRadius: 6 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: votacion.Tipo === 'opcion_unica' ? '#0369a1' : '#6b21a8' }}>
                            {votacion.Tipo === 'opcion_unica' ? 'ÚNICA' : 'MÚLTIPLE'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {estadoVotacion === "abierta" && fechaCierreTexto ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                        <FontAwesome6 name="clock" size={11} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                          Cierra: {fechaCierreTexto}
                        </Text>
                      </View>
                    ) : null}

                    <View style={{ marginTop: 15, gap: 10 }}>
                      {mostrarResultados ? (
                        (() => {
                          const resultado = resultadosPorVotacion[votacion.IdVotacion];
                          if (!resultado) {
                            return <ActivityIndicator color={colors.primary} />;
                          }
                          if (resultado.error) {
                            return (
                              <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 13 }}>
                                {resultado.error}
                              </Text>
                            );
                          }
                          return <ResultadosVotacion resultados={resultado} mostrarGanador={esCerrada} totalParticipantes={participantItems.length} titulo={votacion.Titulo}/>;
                        })()
                      ) : (
                        votacion.Propuestas.map((propuesta) => {
                        const marcada = opcionesElegidas.includes(propuesta.IdPropuesta);
                        return (
                          <Pressable
                            key={propuesta.IdPropuesta}
                            disabled={votacion.YaVoto || finalizada}
                            onPress={() => togglePropuesta(propuesta.IdPropuesta, votacion.Tipo)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              padding: 12,
                              borderWidth: 1,
                              borderColor: marcada ? colors.primary : colors.border,
                              borderRadius: radii.md,
                              backgroundColor: marcada ? '#f0f4f8' : colors.surface
                            }}
                          >
                            <View style={{
                              width: 18, height: 18, borderRadius: votacion.Tipo === 'opcion_unica' ? 9 : 4,
                              borderWidth: 2, borderColor: marcada ? colors.primary : colors.textMuted,
                              marginRight: 10, justifyContent: 'center', alignItems: 'center'
                            }}>
                              {marcada && <View style={{ width: 10, height: 10, borderRadius: votacion.Tipo === 'opcion_unica' ? 5 : 2, backgroundColor: colors.primary }} />}
                            </View>
                            <Text style={{ color: colors.textPrimary }}>{propuesta.Texto}</Text>
                          </Pressable>
                        );
                        })
                      )}
                    </View>

                    <View style={{ marginTop: 15 }}>
                      {esCancelada ? (
                        <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: 13 }}>
                          🚫 Esta votación fue cancelada por su creador.
                        </Text>
                      ) : esCerrada ? null : votacion.YaVoto ? (
                        <Text style={{ color: colors.success, fontWeight: '600', fontSize: 13 }}>✓ Ya registraste tu voto en esta decisión grupal.</Text>
                      ) : !trip?.hasLeft ? (
                        <PrimaryButton
                          label={enviandoEsteVoto ? "Enviando..." : "Confirmar voto"}
                          onPress={registrarVoto}
                          disabled={enviandoEsteVoto}
                          style={{ marginTop: 5 }}
                        />
                      ) : null}

                      {puedeCancelar ? (
                        <Pressable
                          onPress={cancelarEstaVotacion}
                          disabled={cancelandoEstaVotacion}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            marginTop: 10,
                            paddingVertical: 10,
                            opacity: cancelandoEstaVotacion ? 0.6 : 1,
                          }}
                        >
                          <FontAwesome6 name="ban" size={12} color={colors.danger} />
                          <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>
                            {cancelandoEstaVotacion ? "Cancelando..." : "Cancelar votación"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {activeTab === "grupo" ? (
            <View style={styles.sectionStack}>
            {!trip?.hasLeft ? (
                <View style={styles.sectionCard}>
                  <ParticipantSearch
                    canInviteExternal={canInviteExternal}
                    message={participantMessage}
                    onInviteExternal={handleAddExternalInvite}
                    onSearchChange={setParticipantSearch}
                    onSelectUser={handleAddParticipant}
                    search={participantSearch}
                    suggestions={selectableUsers}
                  />
                </View>
              ) : null}
              
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Participantes</Text>
                <ParticipantList 
                  onRemove={!trip?.hasLeft ? handleRemoveParticipant : undefined} 
                  participants={participantesActivos} 
                  isAdmin={isAdmin && !trip?.hasLeft} 
                />
              </View>

              {/* Sección de Invitaciones Pendientes (Visible si hay alguna) */}
              {invitadosPendientes.length > 0 ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>Invitaciones pendientes</Text>
                  <Text style={styles.sectionCopy}>Usuarios que aún no han respondido a la invitación</Text>
                  <ParticipantList 
                    participants={invitadosPendientes} 
                    isAdmin={isAdmin && !trip?.hasLeft} 
                  />
                </View>
              ) : null}
            
              {!trip?.hasLeft ? (
                <View style={[styles.sectionCard, { marginTop: spacing.md }]}>
                  <Pressable
                    onPress={() => {
                      if (isUserAdmin && eligibleNewAdmins.length > 0) {
                        setNuevoAdminId(null);
                        setShowLeaveModal(true); // Abre el modal para elegir sucesor
                      } else {
                        // Si es participante común o único administrador, va directo al flujo normal
                        handleLeaveTripPress();
                      }
                    }}
                    style={({ pressed }) => [
                      styles.logoutButton, 
                      pressed && styles.logoutButtonPressed,
                    ]}
                  >
                    <FontAwesome6 name="arrow-right-from-bracket" size={16} color={colors.danger} />
                    <Text style={styles.logoutText}>Abandonar viaje</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
      {mutatingParticipants ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : null}
      <AddActivityScreen
        dayLabel={activityModalDay?.label}
        tripId={trip?.id}
        onClose={() => setActivityModalDay(null)}
        onSubmit={handleCreateActivity}
        visible={!!activityModalDay}
        activityToEdit={activityModalDay?.activity}
        onCancelEdit={(activityId) => {
          finalizarEdicionActividad(activityId);
        }}
      />

      <Modal
        animationType="fade"
        transparent={true}
        visible={showOptionsMenu}
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowOptionsMenu(false)}>
          <View style={styles.menuContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
              onPress={() => {
                setShowOptionsMenu(false);
                setShowDeleteModal(true);
              }}
            >
              <FontAwesome6 name="trash-can" size={14} color={colors.danger || "#ef4444"} />
              <Text style={styles.menuItemText}>Eliminar viaje</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={showDeleteModal}
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <FontAwesome6 name="trash-can" size={22} color={colors.danger || "#ef4444"} />
            </View>
            <Text style={styles.modalTitle}>¿Dar de baja viaje?</Text>
            <Text style={styles.modalMessage}>
              Esta acción eliminará el viaje "{trip?.title}". Una vez eliminado, ninguno de los participantes podrá volver a acceder a la información.
            </Text>
            <View style={{ height: 10 }} /> 
            <View style={styles.modalActions}>
              <Pressable 
                style={[styles.modalButton, styles.modalButtonCancel]} 
                onPress={() => setShowDeleteModal(false)} 
              >
                <Text style={styles.modalButtonTextCancel}>Conservar</Text>
              </Pressable>
              <Pressable 
                style={[styles.modalButton, styles.modalButtonConfirm]} 
                onPress={handleConfirmDelete} 
              >
                <Text style={styles.modalButtonTextConfirm}>Eliminar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={!!activityToDelete}
        onRequestClose={() => setActivityToDelete(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <FontAwesome6 name="trash-can" size={22} color={colors.danger || "#ef4444"} />
            </View>
            <Text style={styles.modalTitle}>¿Eliminar actividad?</Text>
            <Text style={styles.modalMessage}>
              Se va a eliminar "{activityToDelete?.title}" del itinerario. Esta acción no se puede deshacer.
            </Text>
            <View style={{ height: 10 }} />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setActivityToDelete(null)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleConfirmDeleteActivity}
              >
                <Text style={styles.modalButtonTextConfirm}>Eliminar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={!!activityFeedback}
        onRequestClose={() => setActivityFeedback(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActivityFeedback(null)}>
          <Pressable style={styles.modalContent} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalIconContainer}>
              <FontAwesome6
                name={displayedFeedback?.success ? "circle-check" : "circle-exclamation"}
                size={22}
                color={displayedFeedback?.success ? colors.primary : (colors.danger || "#ef4444")}
              />
            </View>
            <Text style={styles.modalTitle}>
              {displayedFeedback?.success ? "Listo" : "Error"}
            </Text>
            <Text style={styles.modalMessage}>{displayedFeedback?.message}</Text>

            <Pressable
              style={styles.activityEditOkButton}
              onPress={() => setActivityFeedback(null)}
            >
              <Text style={styles.activityEditOkButtonText}>Cerrar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={!!activityEditMessage}
        onRequestClose={() => setActivityEditMessage("")}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setActivityEditMessage("")}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <FontAwesome6
                name="triangle-exclamation"
                size={22}
                color={colors.danger || "#ef4444"}
              />
            </View>

            <Text style={styles.modalTitle}>
              Actividad en edición
            </Text>

            <Text style={styles.modalMessage}>
              {activityEditMessage}
            </Text>

            <Pressable
              style={styles.activityEditOkButton}
              onPress={() => setActivityEditMessage("")}
            >
              <Text style={styles.activityEditOkButtonText}>
                Entendido
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={showLeaveModal}
        onRequestClose={() => setShowLeaveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <FontAwesome6 name="user-shield" size={22} color={colors.primary} />
            </View>
            <Text style={styles.modalTitle}>Transferir administración</Text>
            <Text style={styles.modalMessage}>
              Sos el administrador de este viaje. Antes de abandonarlo, debés designar a otro participante como nuevo administrador:
            </Text>

            <ScrollView style={{ width: "100%", maxHeight: 150, marginBottom: 15 }}>
              {eligibleNewAdmins.map((p) => {
                const pId = p.id ?? p.IdUsuario;
                const isSelected = Number(nuevoAdminId) === Number(pId);
                return (
                  <Pressable
                    key={pId}
                    testID={`admin-candidate-${pId}`}
                    onPress={() => setNuevoAdminId(pId)}
                    style={{
                      padding: 10,
                      marginVertical: 4,
                      borderRadius: radii.md,
                      backgroundColor: isSelected ? colors.surfaceAlt : colors.surface,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ fontWeight: isSelected ? "bold" : "normal", color: colors.textPrimary }}>
                      {p.nombreCompleto || p.Nombre || p.email}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowLeaveModal(false);
                  setNuevoAdminId(null);
                }
              }
              >
                <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={() => ejecutarSalidaViaje(nuevoAdminId)}
                disabled={leavingTrip}
              >
                <Text style={styles.modalButtonTextConfirm}>
                  {leavingTrip ? "Saliendo..." : "Confirmar salida"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 132,
  },
  hero: {
    minHeight: 300,
  },
  heroImage: {
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  heroGradient: {
    minHeight: 300,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    justifyContent: "space-between",
  },
  heroActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroActionsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  heroContent: {
    marginTop: spacing.xxxl,
  },
  heroMeta: {
    ...textStyles.meta,
    color: "#dde7fb",
    fontSize: 15,
  },
  heroTitle: {
    ...textStyles.screenTitle,
    color: colors.textInverse,
    marginTop: spacing.xs,
  },
  heroSubtitle: {
    ...textStyles.body,
    color: "#f1f6ff",
    marginTop: spacing.xxs,
  },
  heroFooter: {
    marginTop: spacing.lg,
  },
  tabBar: {
    flexDirection: "row",
    flexWrap: "nowrap",
    justifyContent: "space-between",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: radii.md,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...textStyles.nav,
    fontSize: 10,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.accent,
  },
  body: {
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  itinerarioHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  loadingWrap: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,242,232,0.35)",
    zIndex: 10,
  },
  dayCard: {
    ...surfaces.card,
    padding: spacing.lg,
  },
  dayCardCompact: {
    paddingVertical: spacing.md,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  dayIndex: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  dayIndexActive: {
    backgroundColor: colors.primary,
  },
  dayIndexText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  dayIndexTextActive: {
    color: colors.textInverse,
  },
  dayTitleWrap: {
    flex: 1,
    marginLeft: spacing.md,
  },
  dayTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 18,
  },
  daySubtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  dayAgenda: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  agendaItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  agendaIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  agendaContent: {
    flex: 1,
  },
  agendaActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  agendaActionButton: {
    padding: spacing.xs,
    marginTop: 2,
  },
  agendaHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  agendaTime: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  agendaTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 17,
  },
  agendaNote: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  addActivityButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    marginTop: spacing.xs,
  },
  addActivityText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
  },
  addActivityButtonDisabled: {
    opacity: 0.6,
  },
  routeSection: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  routeSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  routeSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill ?? 999,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    alignSelf: "flex-start",
  },
  routeSummaryText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
  },
  routeMapToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  routeMapToggleText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
  },
  routeMapWrap: {
    marginTop: spacing.xs,
  },
  routeHint: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  modoTransporteWrap: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  modoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill ?? 999,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  modoChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modoChipText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
  },
  modoChipTextActive: {
    color: colors.textInverse,
  },
  sectionStack: {
    gap: spacing.md,
  },
  sectionCard: {
    ...surfaces.card,
    padding: spacing.lg,
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metricsRowCompact: {
    flexWrap: "wrap",
  },
  metricCardHalf: {
    flexBasis: "48%",
    minWidth: 0,
  },
  metricCardFull: {
    flexBasis: "100%",
    minWidth: 0,
  },
  metricValueCompact: {
    fontSize: 18,
  },
  sectionHeading: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
  },
  sectionCopy: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  settlementHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  settlementList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  settlementRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settlementPerson: {
    flex: 1,
    minWidth: 0,
  },
  settlementPersonName: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  settlementPersonMeta: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  settlementRight: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  settlementBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  settlementBadgeSuccess: {
    backgroundColor: colors.successSurface,
  },
  settlementBadgeWarning: {
    backgroundColor: colors.warningSurface,
  },
  settlementBadgeNeutral: {
    backgroundColor: colors.surfaceAlt,
  },
  settlementBadgeText: {
    ...textStyles.meta,
    color: colors.primaryStrong,
    fontSize: 12,
  },
  settlementAmount: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  settlementError: {
    ...textStyles.meta,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  transferCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  transferHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  transferTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  transferTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  transferMeta: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  transferButton: {
    minHeight: 46,
  },
  fullButton: {
    marginTop: spacing.lg,
  },
  menuOverlay: {
    flex: 1,
    alignItems: "flex-end",
    paddingTop: Platform.OS === "ios" ? 68 : 52,
    paddingRight: spacing.lg,
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    minWidth: 180,
    paddingVertical: spacing.xs,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  menuItemPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  menuItemText: {
    ...textStyles.bodyStrong,
    color: colors.danger || "#ef4444",
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(9, 19, 45, 0.7)", 
    padding: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ffeecf", 
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
    marginBottom: spacing.xs,
  },
  modalMessage: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
    width: "100%",
  },
  modalButton: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
  },
  modalButtonCancel: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonConfirm: {
    backgroundColor: colors.danger || "#ef4444",
  },
  modalButtonTextCancel: {
    ...textStyles.bodyStrong,
    color: colors.textSecondary,
    fontSize: 14,
  },
  modalButtonTextConfirm: {
    ...textStyles.bodyStrong,
    color: colors.textInverse,
    fontSize: 14,
  },
  activityEditOkButton: {
  backgroundColor: colors.primary,
  borderRadius: radii.md,
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.lg,
  marginTop: spacing.lg,
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
},
activityEditOkButtonText: {
  color: colors.textInverse,
  fontSize: 15,
  fontWeight: "700",
},
logoutButton: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.sm,
  paddingVertical: spacing.md,
  borderRadius: radii.md,
  borderWidth: 1,
  borderColor: colors.danger,
  backgroundColor: colors.surface,
},

logoutButtonPressed: {
  opacity: 0.7,
},

logoutText: {
  ...textStyles.bodyStrong,
  color: colors.danger,
},
readOnlyBanner: {
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.sm,
  marginHorizontal: spacing.lg,
  marginTop: spacing.md,
  padding: spacing.md,
  borderRadius: radii.md,
  backgroundColor: colors.warningSurface,
  borderWidth: 1,
  borderColor: colors.warning,
},

readOnlyBannerContent: {
  flex: 1,
},

readOnlyBannerTitle: {
  ...textStyles.bodyStrong,
  color: colors.primary,
},

readOnlyBannerText: {
  ...textStyles.meta,
  color: colors.textSecondary,
  marginTop: spacing.xxs,
},

readOnlyBackButton: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xs,
  alignSelf: "flex-start",
  marginTop: spacing.sm,
  paddingVertical: spacing.xs,
},

readOnlyBackButtonText: {
  ...textStyles.bodyStrong,
  color: colors.primary,
  fontSize: 13,
},
openGoogleMapsButton: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xs,
  backgroundColor: colors.primary,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  borderRadius: radii.md,
  marginTop: spacing.xs,
},
openGoogleMapsText: {
  ...textStyles.bodyStrong,
  color: colors.textInverse,
  fontSize: 13,
},
});