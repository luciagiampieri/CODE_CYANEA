import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  FlatList,
  Pressable,
  Animated,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Image,
  Switch,
} from "react-native";
import Modal from "../components/ui/AppModal";
import { File } from "expo-file-system";

import { FontAwesome6 } from "@expo/vector-icons";

import DatePickerModal from "../components/ui/DatePickerModal";             
import { toYMD, parseYMD, formatDateDisplay, getTodayIso } from "../utils/dates";  

import PrimaryButton from "../components/ui/PrimaryButton";
import CurrencySelector from "../components/trip/CurrencySelector";
import ReceiptScanButton from "../components/trip/ReceiptScanButton";

import {
  getExpenseCategories,
  getTripParticipants,
  createExpense,
  getCurrencies, 
  getExchangeRate,
  attachReceiptToExpense,
} from "../services/api";

import { colors, radii, spacing, textStyles } from "../theme/tokens";
import {
  MONEDA_PESOS_ARGENTINOS,
  mensajeFechaFueraDelViaje,
  parsearMonto,
  requiereConversionARS,
} from "../utils/comprobanteGasto";
import { avisar, confirmar } from "../utils/dialogs";

const DEMORA_COTIZACION_MS = 400;

import {
  guardarGastoOffline,
  guardarCategoriasEnCache,
  obtenerCategoriasCache,
  guardarParticipantesEnCache,
  obtenerParticipantesCache,
} from "../database/gastosLocal";

import { appAlert } from "../components/ui/AppDialog";

const ICONOS_CATEGORIAS = {
  "Comida y Bebida": "utensils",
  Transporte: "car",
  Alojamiento: "hotel",
  Entretenimiento: "ticket-simple",
  Compras: "bag-shopping",
  Servicios: "file-invoice-dollar",
  Otros: "ellipsis",
};

function getIniciales(persona) {
  const n = (persona?.Nombre || "").trim().charAt(0);
  const a = (persona?.Apellido || "").trim().charAt(0);
  return (n + a).toUpperCase() || "?";
}


function esErrorDeRed(error) {
  if (error?.status || error?.response?.status) return false;

  const msg = String(error?.message || "").toLowerCase();
  return (
    error instanceof TypeError ||
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("offline")
  );
}

// Campos del formulario que puede precargar el escaneo de comprobantes (US 93).
const CAMPO_NOMBRE = "Nombre";
const CAMPO_MONTO = "MontoOriginal";
const CAMPO_MONEDA = "MonedaOriginal";
const CAMPO_FECHA = "FechaGasto";
const CAMPO_CATEGORIA = "IdCategoria";

// Borra la imagen comprimida que quedó en caché tras el escaneo (US 94, AC9).
// En web es un blob/data URI que libera el navegador.
function eliminarImagenTemporal(uri) {
  if (!uri || Platform.OS === "web" || !String(uri).startsWith("file:")) return;
  try {
    const archivo = new File(uri);
    if (archivo.exists) archivo.delete();
  } catch (error) {
    console.log("No se pudo eliminar la imagen del comprobante:", error?.message);
  }
}

function montoParaInput(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? String(numero) : "";
}

export default function AddGastoScreen({
  visible,
  onClose,
  IdViaje,
  Moneda,
  onGastoCreado,
  puedeEscanear = true,
  initialData = null,
  mostrarAlertaExito = true,
  FechaInicioViaje = null,
  FechaFinViaje = null,
}) {
  const monedaBase = Moneda || "USD";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [categorias, setCategorias] = useState([]);
  const [participantes, setParticipantes] = useState([]);
  const [monedasBD, setMonedasBD] = useState([]);

  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [monedaSeleccionada, setMonedaSeleccionada] = useState(monedaBase);

  const [idCategoria, setIdCategoria] = useState(null);
  const [idPagador, setIdPagador] = useState(null);

  const [modalCategoriaVisible, setModalCategoriaVisible] = useState(false);
  const [modalPagadorVisible, setModalPagadorVisible] = useState(false);
  const [modalParticipantesVisible, setModalParticipantesVisible] = useState(false);

  const [esCompartido, setEsCompartido] = useState(false);
  const [esDivisionIgualitaria, setEsDivisionIgualitaria] = useState(true);
  const [idsParticipantesSeleccionados, setIdsParticipantesSeleccionados] = useState([]);
  const [montosPersonalizados, setMontosPersonalizados] = useState({});

  const [fechaIso, setFechaIso] = useState(toYMD(new Date()));
  const [mostrarCalendario, setMostrarCalendario] = useState(false);

  const [errores, setErrores] = useState({});

  // Escaneo de comprobantes (US 93): campos con baja confianza a revisar (AC10).
  const [camposRevisar, setCamposRevisar] = useState([]);
  const [escaneoAplicado, setEscaneoAplicado] = useState(false);

  // Confirmación del gasto precargado (US 94).
  const [comprobanteUri, setComprobanteUri] = useState(null);
  const [comprobanteAmpliado, setComprobanteAmpliado] = useState(false);
  const [montoARS, setMontoARS] = useState("");

  // Imagen completa del comprobante (con uri, mimeType, fileName) para subirla al repositorio.
  const [comprobanteImagen, setComprobanteImagen] = useState(null);
  const [guardarComprobante, setGuardarComprobante] = useState(true);

  // Conversión a ARS: "auto" la calcula con la cotización del día del gasto
  // (como la US-85); "manual" respeta lo que corrigió el usuario; "error" pide
  // ingresarla a mano porque el servicio de cotización no respondió.
  const [conversion, setConversion] = useState({ estado: "idle", fecha: null });

  // Las reglas de la US 94 aplican cuando el formulario se precargó desde un comprobante.
  const desdeComprobante = escaneoAplicado;
  const requiereConversion = desdeComprobante && requiereConversionARS(monedaSeleccionada);
  const avisoFechaViaje = desdeComprobante
    ? mensajeFechaFueraDelViaje(fechaIso, FechaInicioViaje, FechaFinViaje)
    : null;
  const participanteActual = participantes.find((p) => p.EsUsuarioActual);

  const categoriaSeleccionada = categorias.find((c) => c.IdCategoria === idCategoria);
  const pagadorSeleccionado = participantes.find((p) => p.IdParticipanteViaje === idPagador);

  // Monto contra el que se reparte el gasto: si se pidió la conversión a ARS y
  // el viaje está en pesos, la división se hace sobre el monto convertido.
  const montoDivision =
    requiereConversion && monedaBase.toUpperCase() === MONEDA_PESOS_ARGENTINOS
      ? montoARS
      : monto;
  const montoDivisionNum = parsearMonto(montoDivision).valor || 0;

  const sumaMontosPersonalizados = idsParticipantesSeleccionados.reduce((acc, id) => {
    const v = parseFloat(montosPersonalizados[id]);
    return acc + (isNaN(v) ? 0 : v);
  }, 0);

  const montoPorPersona =
    idsParticipantesSeleccionados.length > 0 && montoDivisionNum
      ? montoDivisionNum / idsParticipantesSeleccionados.length
      : 0;

  // Un valor animado por cada bottom sheet, para que se muevan de forma independiente
  const slideAnimCategoria = useRef(new Animated.Value(300)).current;
  const slideAnimPagador = useRef(new Animated.Value(300)).current;
  const slideAnimParticipantes = useRef(new Animated.Value(300)).current;

  // Añadimos este efecto para que cuando carguen los datos y haya initialData, se autocomplemente el formulario
  useEffect(() => {
    if (initialData && !loading && categorias.length > 0) {
      aplicarEscaneo(initialData);
    }
  }, [initialData, loading, categorias]);

  // AC6/AC7: si el comprobante no está en ARS, se completa el monto en pesos
  // con la cotización automática; el usuario puede corregirlo.
  const montoValido = parsearMonto(monto).valor;
  useEffect(() => {
    if (!requiereConversion || conversion.estado === "manual") return undefined;
    if (!montoValido) {
      // Sin monto de origen no hay nada que convertir: no se deja un valor viejo.
      setMontoARS("");
      setConversion({ estado: "idle", fecha: null });
      return undefined;
    }

    let vigente = true;
    setConversion((prev) => ({ ...prev, estado: "cargando" }));
    const timer = setTimeout(async () => {
      try {
        const resultado = await getExchangeRate({
          origen: monedaSeleccionada.toUpperCase(),
          destino: MONEDA_PESOS_ARGENTINOS,
          monto: montoValido,
          fecha: fechaIso || undefined,
        });
        if (!vigente) return;
        setMontoARS(String(Number(resultado.MontoConvertido)));
        setConversion({ estado: "auto", fecha: resultado.Fecha });
      } catch (error) {
        if (!vigente) return;
        console.log("No se pudo obtener la cotización:", error?.message);
        setConversion({ estado: "error", fecha: null });
      }
    }, DEMORA_COTIZACION_MS);

    return () => {
      vigente = false;
      clearTimeout(timer);
    };
    // conversion.estado solo importa para no pisar una corrección manual
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiereConversion, monedaSeleccionada, montoValido, fechaIso, conversion.estado === "manual"]);

  function animarSheet(anim, visible) {
    if (visible) {
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else {
      anim.setValue(300);
    }
  }

  useEffect(() => animarSheet(slideAnimCategoria, modalCategoriaVisible), [modalCategoriaVisible]);
  useEffect(() => animarSheet(slideAnimPagador, modalPagadorVisible), [modalPagadorVisible]);
  useEffect(() => animarSheet(slideAnimParticipantes, modalParticipantesVisible), [modalParticipantesVisible]);

  function toggleSeleccionParticipante(id) {
    if (id === "TODOS") {
      const todosIds = participantes.map((p) => p.IdParticipanteViaje);
      const estanTodosSeleccionados = todosIds.every((idp) =>
        idsParticipantesSeleccionados.includes(idp)
      );

      if (estanTodosSeleccionados) {
        setIdsParticipantesSeleccionados(idPagador ? [idPagador] : []);
      } else {
        setIdsParticipantesSeleccionados(todosIds);
      }
      return;
    }

    if (id === idPagador) {
      appAlert(
        "Acción no permitida",
        "El responsable del gasto debe estar incluido sí o sí."
      );
      return;
    }

    if (idsParticipantesSeleccionados.includes(id)) {
      setIdsParticipantesSeleccionados(
        idsParticipantesSeleccionados.filter((item) => item !== id)
      );
      const nuevosMontos = { ...montosPersonalizados };
      delete nuevosMontos[id];
      setMontosPersonalizados(nuevosMontos);
    } else {
      setIdsParticipantesSeleccionados([...idsParticipantesSeleccionados, id]);
    }
  }

  const handleMontoPersonalizadoChange = (id, valor) => {
    setMontosPersonalizados((prev) => ({
      ...prev,
      [id]: valor,
    }));
  };

  useEffect(() => {
    if (!visible) return;

    setNombre("");
    setMonto("");
    setMonedaSeleccionada(monedaBase);
    setIdCategoria(null);
    setIdPagador(null);
    setEsCompartido(false);
    setEsDivisionIgualitaria(true);
    setIdsParticipantesSeleccionados([]);
    setMontosPersonalizados({});
    setFechaIso(toYMD(new Date()));
    setErrores({});
    setCamposRevisar([]);
    setEscaneoAplicado(false);
    setComprobanteUri(null);
    setComprobanteAmpliado(false);
    setMontoARS("");
    setConversion({ estado: "idle", fecha: null });
    setComprobanteImagen(null);
    setGuardarComprobante(true);

    // Las monedas se cargan aparte: no dependen de que categorías/participantes carguen bien
    async function cargarMonedas() {
      try {
        const monedas = await getCurrencies();
        if (Array.isArray(monedas) && monedas.length > 0) {
          setMonedasBD(monedas);
          return;
        }
        console.log("getCurrencies devolvió vacío o formato inesperado:", monedas);
      } catch (e) {
        console.log("Error cargando monedas:", e?.message, e);
      }
      setMonedasBD([{ Codigo: monedaBase, Nombre: "Moneda base" }]);
    }

    async function cargarDatos() {
      try {
        setLoading(true);

        // Categorías y participantes
        const [cats, parts] = await Promise.all([
          getExpenseCategories(),
          getTripParticipants(IdViaje),
        ]);

        const categoriasOrdenadas = cats.sort((a, b) => {
          if (a.Nombre === "Otros") return 1;
          if (b.Nombre === "Otros") return -1;
          return a.Nombre.localeCompare(b.Nombre);
        });

        setCategorias(categoriasOrdenadas);
        setParticipantes(parts);
      } catch (error) {
        console.log("ERROR REAL:", error.message, error);
        console.log("📡 API caída o modo avión detectado. Buscando respaldo local en SQLite...");

        const catsLocal = obtenerCategoriasCache();
        const partsLocal = obtenerParticipantesCache(IdViaje);

        if (catsLocal.length > 0 && partsLocal.length > 0) {
          setCategorias(catsLocal);
          setParticipantes(partsLocal);
          console.log("Formulario cargado con datos de respaldo local exitosamente.");
        } else {
          appAlert("Sin conexión", "No hay datos locales guardados para este viaje todavía.");
          onClose();
        }
      } finally {
        setLoading(false);
      }
    }
    cargarMonedas();
    cargarDatos();
  }, [IdViaje, visible, monedaBase]);

  useEffect(() => {
    if (esCompartido && idPagador) {
      setIdsParticipantesSeleccionados((prev) => {
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

  const debeRevisar = (campo) => camposRevisar.includes(campo);

  // Al editar un campo resaltado, se entiende que el usuario ya lo revisó.
  function marcarRevisado(campo) {
    setCamposRevisar((prev) => (prev.includes(campo) ? prev.filter((c) => c !== campo) : prev));
  }

  // Precarga el formulario con los datos del comprobante (AC11). No registra
  // nada: el gasto se guarda recién cuando el usuario confirma (AC12).
  function aplicarEscaneo(datos, imagen = null) {
    const revisar = new Set(datos?.CamposBajaConfianza || []);

    // AC1: vista previa del comprobante. Si se re-escanea, se descarta la anterior.
    if (comprobanteUri && comprobanteUri !== imagen?.uri) eliminarImagenTemporal(comprobanteUri);
    setComprobanteUri(imagen?.uri || null);
    setComprobanteAmpliado(false);
    setMontoARS("");
    setConversion({ estado: "idle", fecha: null });
    setComprobanteImagen(imagen || null);

    // AC4: el pagador se completa con el usuario que escaneó (se puede cambiar).
    const actual = participantes.find((p) => p.EsUsuarioActual);
    if (actual) setIdPagador(actual.IdParticipanteViaje);

    setNombre(datos?.Nombre || "");
    setMonto(montoParaInput(datos?.MontoOriginal));

    // El selector de moneda no puede quedar vacío: si no se detectó (o no es
    // una moneda disponible) se deja la del viaje y se pide revisarla.
    const codigo = String(datos?.MonedaOriginal || "").toUpperCase();
    const monedaDisponible =
      codigo && (monedasBD.length === 0 || monedasBD.some((m) => m.Codigo === codigo));
    if (monedaDisponible) {
      setMonedaSeleccionada(codigo);
    } else {
      setMonedaSeleccionada(monedaBase);
      revisar.add(CAMPO_MONEDA);
    }

    // AC9: sin fecha legible, el campo queda vacío (no se asume "hoy").
    setFechaIso(datos?.FechaGasto || "");

    const categoriaValida = categorias.some((c) => c.IdCategoria === datos?.IdCategoria);
    setIdCategoria(categoriaValida ? datos.IdCategoria : null);

    setCamposRevisar(Array.from(revisar));
    setErrores({});
    setEscaneoAplicado(true);
  }

  function descartarComprobante() {
    eliminarImagenTemporal(comprobanteUri);
    setComprobanteUri(null);
    setComprobanteAmpliado(false);
    setComprobanteImagen(null);
  }

  // AC9: cancelar descarta los datos y la imagen procesada sin registrar el gasto.
  async function handleCancelar() {
    if (saving) return;
    if (desdeComprobante) {
      const descartar = await confirmar({
        titulo: "Descartar gasto",
        mensaje: comprobanteUri
          ? "Se descartarán los datos y la imagen del comprobante. El gasto no se registrará."
          : "Se descartarán los datos del comprobante. El gasto no se registrará.",
        textoConfirmar: "Descartar",
        textoCancelar: "Seguir editando",
        destructivo: true,
      });
      if (!descartar) return;
      descartarComprobante();
    }
    onClose();
  }

  async function handleGuardar() {
    let nuevosErrores = {};

    if (!nombre.trim()) {
      nuevosErrores.nombre = "El concepto es obligatorio";
    }

    // RN-21: monto numérico y mayor a cero.
    const montoParseado = parsearMonto(monto);
    if (montoParseado.error) {
      nuevosErrores.monto = montoParseado.error;
    }

    // RN-39: un comprobante en otra moneda requiere el monto convertido a ARS.
    const montoARSParseado = requiereConversion
      ? parsearMonto(montoARS, {
          obligatorio: `Ingresá el monto convertido a pesos argentinos (${MONEDA_PESOS_ARGENTINOS}) para continuar`,
        })
      : {};
    if (requiereConversion && conversion.estado === "cargando") {
      nuevosErrores.montoARS = "Esperá a que termine de calcularse la conversión a ARS";
    } else if (montoARSParseado.error) {
      nuevosErrores.montoARS = montoARSParseado.error;
    }

    if (!idCategoria) {
      nuevosErrores.categoria = "Seleccioná una categoría";
    }

    if (esCompartido && !idPagador) {
      nuevosErrores.pagador = "Seleccioná quién pagó";
    }

    const hoyIso = toYMD(new Date());
    if (!fechaIso) {
      nuevosErrores.fecha = "La fecha es obligatoria";
    } else if (fechaIso > hoyIso) {
      nuevosErrores.fecha = "La fecha del gasto no puede ser posterior a hoy";
    }

    if (esCompartido) {
      if (idsParticipantesSeleccionados.length < 2) {
        nuevosErrores.participantes =
          "Debes seleccionar al menos un participante adicional además del pagador";
      } else if (!idsParticipantesSeleccionados.includes(idPagador)) {
        nuevosErrores.participantes = "El pagador debe formar parte de la división del gasto";
      }

      if (esCompartido && !esDivisionIgualitaria) {
        let sumaMontos = 0;
        let hayMontosVacios = false;

        idsParticipantesSeleccionados.forEach((id) => {
          const montoParticipante = montosPersonalizados[id];
          const montoNum = parseFloat(montoParticipante);

          if (isNaN(montoNum) || montoNum <= 0) {
            hayMontosVacios = true;
          }
          sumaMontos += isNaN(montoNum) ? 0 : montoNum;
        });

        if (hayMontosVacios) {
          nuevosErrores.divisionPersonalizada = "Se debe asignar un monto a todos los participantes";
        } else if (Math.abs(sumaMontos - montoDivisionNum) > 0.01) {
          const monedaDivision =
            montoDivision === montoARS && requiereConversion ? MONEDA_PESOS_ARGENTINOS : monedaSeleccionada;
          nuevosErrores.divisionPersonalizada = `La suma de los montos individuales debe ser igual al monto total (${montoDivision} ${monedaDivision})`;
        }
      }
    }

    setErrores(nuevosErrores);

    if (Object.keys(nuevosErrores).length > 0) {
      return;
    }

    // AC8: la fecha fuera del viaje se informa en el formulario pero no frena
    // el registro (pagar antes del viaje, por ejemplo una reserva, es válido).

    try {
      setSaving(true);

      const detalleMontosPersonalizados = !esDivisionIgualitaria
        ? idsParticipantesSeleccionados.map((id) => ({
            IdParticipanteViaje: id,
            MontoAsignado: Number(montosPersonalizados[id] || 0),
          }))
        : null;

      const nuevoGasto = {
        IdViaje,
        Nombre: nombre,
        Monto: montoParseado.valor,
        MontoOriginal: montoParseado.valor,
        MonedaOriginal: monedaSeleccionada,
        IdCategoria: idCategoria,
        IdPagador: esCompartido ? idPagador : null,
        FechaGasto: fechaIso,
        DividirEntreTodos: esCompartido
          ? esDivisionIgualitaria && idsParticipantesSeleccionados.length === participantes.length
          : false,
        IdParticipantes: esCompartido ? idsParticipantesSeleccionados : [],
        EsCompartido: esCompartido,
        TipoDivision: esCompartido ? (esDivisionIgualitaria ? "igualitaria" : "personalizada") : null,
        DetalleMontosPersonalizados:
          !esDivisionIgualitaria && esCompartido ? detalleMontosPersonalizados : [],
        DesdeComprobante: desdeComprobante,
        MontoConvertidoARS: requiereConversion ? montoARSParseado.valor : null,
      };

      try {
        const respuestaGasto = await createExpense(nuevoGasto);

        let estadoComprobante = null; 
        if (desdeComprobante && guardarComprobante && comprobanteImagen && respuestaGasto?.IdGasto) {
          try {
            await attachReceiptToExpense(respuestaGasto.IdGasto, comprobanteImagen);
            estadoComprobante = "guardado";
          } catch (errorComprobante) {
            console.log("No se pudo guardar el comprobante:", errorComprobante?.message);
            estadoComprobante = "error";
          }
        }
        descartarComprobante();

        if (estadoComprobante === "error") {
          avisar(
            "Gasto registrado",
            "El gasto se registró correctamente, pero no se pudo guardar el comprobante en el repositorio."
          );
        } else if (mostrarAlertaExito) {
          avisar(
            "Éxito",
            estadoComprobante === "guardado"
              ? "Gasto registrado correctamente y comprobante guardado en el repositorio."
              : "Gasto registrado correctamente en el servidor."
          );
        }
        onGastoCreado?.();
        onClose();
      } catch (apiError) {
        console.log("ERROR createExpense:", apiError?.status, apiError?.message, apiError);

        const esCotizacionCaida = apiError?.status === 503 || apiError?.message?.includes("cotización");

        // Error del servidor común (validación, 4xx/5xx distintos a 503): NO se guarda offline
        if (!esCotizacionCaida && !esErrorDeRed(apiError)) {
          appAlert(
            "No se pudo registrar el gasto",
            apiError?.message || "El servidor rechazó el gasto."
          );
          return;
        }

        // Si es un error de red o el servicio de cotización no está disponible (503), guardamos offline
        console.log("⚠️ Guardando gasto localmente debido a fallo de red o servicio de cotización...");
        const guardadoConExito = guardarGastoOffline(nuevoGasto);

        // Offline no se puede subir el comprobante: se avisa al usuario.
        const avisoComprobanteOffline =
          desdeComprobante && guardarComprobante && comprobanteImagen
            ? " El comprobante no se guardó en el repositorio porque no hubo conexión."
            : "";

        if (guardadoConExito) {
          // Si fue por 503, mostramos la alerta específica que el test espera o el mensaje offline general
          if (esCotizacionCaida) {
            appAlert(
              "Servicio no disponible",
              "El servicio de cotización no se encuentra disponible en este momento." + avisoComprobanteOffline,
              [
                {
                  text: "Entendido",
                  onPress: () => {
                    onGastoCreado?.();
                    onClose();
                  },
                },
              ]
            );
          } else {
            appAlert(
              "Modo Offline",
              "El gasto quedó guardado localmente con su moneda original. Se convertirá y sincronizará cuando vuelva la conexión." +
                avisoComprobanteOffline,
              [
                {
                  text: "Entendido",
                  onPress: () => {
                    onGastoCreado?.();
                    onClose();
                  },
                },
              ]
            );
          }
        } else {
          throw new Error("No se pudo guardar el gasto offline");
        }
      }
    } catch (error) {
      appAlert("Error", error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={handleCancelar}>
      <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView 
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Nuevo gasto</Text>
              <TouchableOpacity onPress={handleCancelar} hitSlop={10} testID="add-gasto-close">
                <FontAwesome6 name="xmark" size={18} color={colors.overlay} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <View style={styles.content}>

                {puedeEscanear ? (
                  <ReceiptScanButton tripId={IdViaje} onScanned={aplicarEscaneo} disabled={saving} />
                ) : null}

                {escaneoAplicado ? (
                  <View style={styles.scanInfo} testID="receipt-scan-applied">
                    <FontAwesome6 name="circle-check" size={13} color={colors.success} />
                    <Text style={styles.scanInfoText}>
                      Completamos los datos del comprobante. Revisalos antes de registrar el gasto.
                    </Text>
                  </View>
                ) : null}

                {comprobanteUri ? (
                  <Pressable
                    style={styles.comprobantePreview}
                    onPress={() => setComprobanteAmpliado((v) => !v)}
                    testID="receipt-preview"
                    accessibilityRole="imagebutton"
                    accessibilityLabel={comprobanteAmpliado ? "Achicar comprobante" : "Ampliar comprobante"}
                  >
                    <Image
                      source={{ uri: comprobanteUri }}
                      style={comprobanteAmpliado ? styles.comprobanteImagenAmpliada : styles.comprobanteMiniatura}
                      resizeMode="contain"
                    />
                    {!comprobanteAmpliado ? (
                      <View style={styles.comprobanteInfo}>
                        <Text style={styles.comprobanteTitulo}>Comprobante escaneado</Text>
                        <Text style={styles.comprobanteHint}>Tocá para ampliar y comparar los datos</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ) : null}

                {/* Guardar comprobante en el repositorio*/}
                {desdeComprobante && comprobanteImagen ? (
                  <View style={styles.guardarComprobanteRow} testID="guardar-comprobante-row">
                    <View style={styles.guardarComprobanteTextos}>
                      <Text style={styles.guardarComprobanteTitulo}>
                        Guardar comprobante en el repositorio
                      </Text>
                      <Text style={styles.guardarComprobanteHint}>
                        {guardarComprobante
                          ? 'Se guardará en la categoría "Comprobantes" y quedará asociado al gasto.'
                          : "El comprobante no se guardará: solo se registrará el gasto."}
                      </Text>
                    </View>
                    <Switch
                      value={guardarComprobante}
                      onValueChange={setGuardarComprobante}
                      disabled={saving}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#fff"
                      testID="guardar-comprobante-switch"
                    />
                  </View>
                ) : null}

                <Text style={styles.label}>Concepto</Text>
                <View style={[styles.inputBox, debeRevisar(CAMPO_NOMBRE) && styles.campoRevisar]}>
                  <FontAwesome6 name="pen" size={14} color={colors.overlay} />
                  <TextInput
                    style={styles.input}
                    placeholder="Cena"
                    placeholderTextColor={colors.overlay}
                    value={nombre}
                    onChangeText={(texto) => {
                      setNombre(texto);
                      marcarRevisado(CAMPO_NOMBRE);
                    }}
                  />
                </View>
                {debeRevisar(CAMPO_NOMBRE) && <Text style={styles.revisarHint}>Revisá este dato</Text>}
                {errores.nombre && <Text style={styles.error}>{errores.nombre}</Text>}

                {/* Selector de Moneda conectado a la BD */}
                <View
                  style={[{ marginTop: spacing.sm }, debeRevisar(CAMPO_MONEDA) && styles.campoRevisarGrupo]}
                >
                  <CurrencySelector
                    currencies={monedasBD.length > 0 ? monedasBD : [{ Codigo: monedaBase, Nombre: "Moneda Base" }]}
                    selectedCurrency={monedaSeleccionada}
                    onSelectCurrency={(codigo) => {
                      setMonedaSeleccionada(codigo);
                      marcarRevisado(CAMPO_MONEDA);
                    }}
                  />
                </View>
                {debeRevisar(CAMPO_MONEDA) && (
                  <Text style={styles.revisarHint}>Revisá la moneda del comprobante</Text>
                )}

                <Text style={styles.label}>Monto ({monedaSeleccionada.toUpperCase()})</Text>
                <View style={[styles.inputBox, debeRevisar(CAMPO_MONTO) && styles.campoRevisar]}>
                  <Text style={styles.currencyCodePrefix}>{monedaSeleccionada.toUpperCase()}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={colors.overlay}
                    keyboardType="numeric"
                    value={monto}
                    onChangeText={(texto) => {
                      setMonto(texto);
                      marcarRevisado(CAMPO_MONTO);
                    }}
                  />
                </View>
                {debeRevisar(CAMPO_MONTO) && <Text style={styles.revisarHint}>Revisá este dato</Text>}
                {!requiereConversion && monedaSeleccionada.toUpperCase() !== monedaBase.toUpperCase() && (
                  <Text style={styles.infoConversionText}>
                    ℹ El importe se convertirá automáticamente a la moneda base del viaje ({monedaBase.toUpperCase()}).
                  </Text>
                )}
                {errores.monto && <Text style={styles.error}>{errores.monto}</Text>}

                {requiereConversion ? (
                  <View style={styles.conversionCard} testID="conversion-ars-warning">
                    <View style={styles.advertenciaRow}>
                      <FontAwesome6 name="triangle-exclamation" size={13} color={colors.warning} />
                      <Text style={styles.advertenciaText}>
                        El comprobante está en {monedaSeleccionada.toUpperCase()}. El gasto se registra en pesos
                        argentinos ({MONEDA_PESOS_ARGENTINOS}).
                      </Text>
                    </View>
                    <Text style={styles.label}>Monto en pesos argentinos ({MONEDA_PESOS_ARGENTINOS})</Text>
                    <View style={[styles.inputBox, errores.montoARS && styles.inputError]}>
                      <Text style={styles.currencyCodePrefix}>{MONEDA_PESOS_ARGENTINOS}</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="0"
                        placeholderTextColor={colors.overlay}
                        keyboardType="numeric"
                        value={montoARS}
                        onChangeText={(texto) => {
                          setMontoARS(texto);
                          setConversion({ estado: "manual", fecha: null });
                        }}
                        testID="monto-ars-input"
                      />
                      {conversion.estado === "cargando" ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : null}
                    </View>
                    {/* Con la conversión automática el monto ya está cargado: no hace falta texto. */}
                    {conversion.estado !== "auto" ? (
                      <Text style={styles.conversionEstado} testID="conversion-ars-estado">
                        {conversion.estado === "cargando"
                          ? "Calculando la conversión con la cotización del día..."
                          : conversion.estado === "error"
                          ? "No pudimos obtener la cotización. Ingresá el monto convertido manualmente."
                          : conversion.estado === "manual"
                          ? "Monto ingresado manualmente."
                          : "Ingresá el monto para calcular la conversión."}
                      </Text>
                    ) : null}
                    {conversion.estado === "manual" && montoValido ? (
                      <TouchableOpacity
                        onPress={() => setConversion({ estado: "idle", fecha: null })}
                        testID="usar-cotizacion-automatica"
                      >
                        <Text style={styles.conversionLink}>Usar la cotización automática</Text>
                      </TouchableOpacity>
                    ) : null}
                    {errores.montoARS && <Text style={styles.error}>{errores.montoARS}</Text>}
                  </View>
                ) : null}

                <Text style={styles.label}>Fecha</Text>
                {Platform.OS === "web" ? (
                  <View style={[styles.dateBox, debeRevisar(CAMPO_FECHA) && styles.campoRevisar]}>
                    <input
                      type="date"
                      value={fechaIso}
                      max={toYMD(new Date())}
                      onChange={(e) => {
                        const val = e.target.value;
                        const limiteHoy = toYMD(new Date());
                        marcarRevisado(CAMPO_FECHA);

                        if (val > limiteHoy) {
                          appAlert("Fecha inválida", "No podés registrar un gasto en una fecha futura.");
                          setFechaIso(limiteHoy);
                        } else {
                          setFechaIso(val);
                        }
                      }}
                      style={{ border: "none", width: "100%", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: "16px", color: 'inherit', cursor: 'pointer' }}
                    />
                  </View>
                ) : (
                  <>
                    <Pressable
                      onPress={() => setMostrarCalendario(true)}
                      style={[
                        styles.dateBox,
                        debeRevisar(CAMPO_FECHA) && styles.campoRevisar,
                        errores.fecha && styles.inputError,
                      ]}
                    >
                      <FontAwesome6 name="calendar" size={15} color={colors.overlay} />
                      <Text style={[styles.inputDateText, !fechaIso && styles.datePlaceholder]}>
                        {fechaIso ? formatDateDisplay(fechaIso) : "Seleccionar fecha"}
                      </Text>
                    </Pressable>
                  </>
                )}
                {debeRevisar(CAMPO_FECHA) && <Text style={styles.revisarHint}>Revisá este dato</Text>}
                {errores.fecha && <Text style={styles.error}>{errores.fecha}</Text>}
                {avisoFechaViaje ? (
                  <View style={styles.advertenciaRow} testID="fecha-fuera-viaje-warning">
                    <FontAwesome6 name="circle-info" size={13} color={colors.textSecondary} />
                    <Text style={styles.avisoFechaText}>{avisoFechaViaje}</Text>
                  </View>
                ) : null}

                <Text style={styles.label}>Categoría</Text>
                <TouchableOpacity
                  style={[styles.dropdownButton, debeRevisar(CAMPO_CATEGORIA) && styles.campoRevisar]}
                  onPress={() => setModalCategoriaVisible(true)}
                >
                  <View style={styles.dropdownLeftContent}>
                    <FontAwesome6
                      name={categoriaSeleccionada ? ICONOS_CATEGORIAS[categoriaSeleccionada.Nombre] || "tags" : "tags"}
                      size={14}
                      color={categoriaSeleccionada ? colors.primary : colors.overlay}
                      style={{ marginRight: 10, width: 20, textAlign: "center" }}
                    />
                    <Text style={idCategoria ? styles.dropdownText : styles.dropdownPlaceholder}>
                      {categoriaSeleccionada ? categoriaSeleccionada.Nombre : "Seleccioná una categoría"}
                    </Text>
                  </View>
                  <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
                </TouchableOpacity>
                {debeRevisar(CAMPO_CATEGORIA) && (
                  <Text style={styles.revisarHint}>Revisá la categoría sugerida</Text>
                )}
                {errores.categoria && <Text style={styles.error}>{errores.categoria}</Text>}

                <Text style={styles.label}>Tipo de Gasto</Text>
                <View style={styles.selectorContainer}>
                  <TouchableOpacity
                    style={[styles.selectorOption, !esCompartido && styles.selectorOptionActive]}
                    onPress={() => setEsCompartido(false)}
                  >
                    <FontAwesome6 name="user" size={14} color={!esCompartido ? colors.textInverse : colors.primary} />
                    <Text style={[styles.selectorOptionText, !esCompartido && styles.selectorOptionTextActive]}>
                      Personal
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selectorOption, esCompartido && styles.selectorOptionActive]}
                    onPress={() => setEsCompartido(true)}
                  >
                    <FontAwesome6 name="users" size={14} color={esCompartido ? colors.textInverse : colors.primary} />
                    <Text style={[styles.selectorOptionText, esCompartido && styles.selectorOptionTextActive]}>
                      Compartido
                    </Text>
                  </TouchableOpacity>
                </View>

                {desdeComprobante && !esCompartido && participanteActual ? (
                  <Text style={styles.pagadorPersonalText} testID="pagador-personal">
                    Pagado por {participanteActual.Nombre} {participanteActual.Apellido} (vos)
                  </Text>
                ) : null}

                {esCompartido && (
                  <View style={styles.sharedCard}>
                    <View style={styles.sharedCardHeader}>
                      <View style={styles.sharedCardIconWrap}>
                        <FontAwesome6 name="users" size={13} color={colors.primary} />
                      </View>
                      <Text style={styles.sharedCardTitle}>División del gasto</Text>
                    </View>

                    <Text style={styles.label}>¿Quién pagó?</Text>
                    <TouchableOpacity style={styles.dropdownButton} onPress={() => setModalPagadorVisible(true)}>
                      <View style={styles.dropdownLeftContent}>
                        <View style={styles.avatarCircle}>
                          <Text style={styles.avatarCircleText}>
                            {pagadorSeleccionado ? getIniciales(pagadorSeleccionado) : "?"}
                          </Text>
                        </View>
                        <Text
                          style={[
                            idPagador ? styles.dropdownText : styles.dropdownPlaceholder,
                            { marginLeft: 10 },
                          ]}
                        >
                          {pagadorSeleccionado
                            ? `${pagadorSeleccionado.Nombre} ${pagadorSeleccionado.Apellido}`
                            : "Seleccioná quién pagó"}
                        </Text>
                      </View>
                      <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                    {errores.pagador && <Text style={styles.error}>{errores.pagador}</Text>}

                    <Text style={styles.label}>¿Entre quiénes se divide?</Text>
                    <TouchableOpacity
                      style={[styles.dropdownButton, errores.participantes && styles.inputError]}
                      onPress={() => setModalParticipantesVisible(true)}
                    >
                      <View style={styles.dropdownLeftContent}>
                        {idsParticipantesSeleccionados.length > 0 ? (
                          <View style={styles.avatarStack}>
                            {participantes
                              .filter((p) => idsParticipantesSeleccionados.includes(p.IdParticipanteViaje))
                              .slice(0, 4)
                              .map((p, i) => (
                                <View
                                  key={p.IdParticipanteViaje}
                                  style={[
                                    styles.avatarStackItem,
                                    { marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i },
                                  ]}
                                >
                                  <Text style={styles.avatarStackText}>{getIniciales(p)}</Text>
                                </View>
                              ))}
                            {idsParticipantesSeleccionados.length > 4 && (
                              <View
                                style={[styles.avatarStackItem, styles.avatarStackMore, { marginLeft: -10 }]}
                              >
                                <Text style={styles.avatarStackText}>
                                  +{idsParticipantesSeleccionados.length - 4}
                                </Text>
                              </View>
                            )}
                          </View>
                        ) : (
                          <FontAwesome6 name="users" size={14} color={colors.overlay} />
                        )}
                        <Text
                          style={[
                            idsParticipantesSeleccionados.length > 0
                              ? styles.dropdownText
                              : styles.dropdownPlaceholder,
                            { marginLeft: 10 },
                          ]}
                        >
                          {idsParticipantesSeleccionados.length === 0
                            ? "Seleccioná participantes"
                            : idsParticipantesSeleccionados.length === participantes.length
                            ? "Todos los integrantes"
                            : `${idsParticipantesSeleccionados.length} participantes`}
                        </Text>
                      </View>
                      <FontAwesome6 name="chevron-down" size={14} color={colors.overlay} />
                    </TouchableOpacity>
                    {errores.participantes && <Text style={styles.error}>{errores.participantes}</Text>}

                    <Text style={styles.label}>Distribución</Text>
                    <View style={styles.selectorContainer}>
                      <TouchableOpacity
                        style={[styles.selectorOption, esDivisionIgualitaria && styles.selectorOptionActive]}
                        onPress={() => setEsDivisionIgualitaria(true)}
                      >
                        <FontAwesome6
                          name="scale-balanced"
                          size={13}
                          color={esDivisionIgualitaria ? "#fff" : colors.primary}
                        />
                        <Text style={[styles.selectorOptionText, esDivisionIgualitaria && styles.selectorOptionTextActive]}>
                          Igualitaria
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.selectorOption, !esDivisionIgualitaria && styles.selectorOptionActive]}
                        onPress={() => setEsDivisionIgualitaria(false)}
                      >
                        <FontAwesome6
                          name="sliders"
                          size={13}
                          color={!esDivisionIgualitaria ? "#fff" : colors.primary}
                        />
                        <Text style={[styles.selectorOptionText, !esDivisionIgualitaria && styles.selectorOptionTextActive]}>
                          Personalizada
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {esDivisionIgualitaria && idsParticipantesSeleccionados.length > 0 && montoDivisionNum ? (
                      <View style={styles.equalSummary}>
                        <FontAwesome6 name="circle-info" size={13} color={colors.primary} />
                        <Text style={styles.equalSummaryText}>
                          {idsParticipantesSeleccionados.length} personas · {monedaBase.toUpperCase()}{" "}
                          {montoPorPersona.toFixed(2)} c/u
                        </Text>
                      </View>
                    ) : null}

                    {!esDivisionIgualitaria && idsParticipantesSeleccionados.length > 0 && (
                      <View style={styles.personalizadoCard}>
                        <Text style={styles.personalizadoTitle}>
                          Montos individuales ({monedaBase.toUpperCase()})
                        </Text>
                        {participantes
                          .filter((p) => idsParticipantesSeleccionados.includes(p.IdParticipanteViaje))
                          .map((p) => (
                            <View key={p.IdParticipanteViaje} style={styles.personalizadoRow}>
                              <View style={styles.personalizadoPersonaWrap}>
                                <View style={styles.avatarCircleSmall}>
                                  <Text style={styles.avatarCircleSmallText}>{getIniciales(p)}</Text>
                                </View>
                                <Text style={styles.personalizadoNombre} numberOfLines={1}>
                                  {p.Nombre} {p.Apellido}
                                </Text>
                              </View>
                              <TextInput
                                style={styles.personalizadoInput}
                                placeholder="0"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numeric"
                                value={montosPersonalizados[p.IdParticipanteViaje] || ""}
                                onChangeText={(val) => handleMontoPersonalizadoChange(p.IdParticipanteViaje, val)}
                                testID={`monto-personalizado-${p.IdParticipanteViaje}`}
                              />
                            </View>
                          ))}

                        <View style={styles.personalizadoResumen}>
                          <Text style={styles.personalizadoResumenLabel}>Asignado</Text>
                          <Text
                            style={[
                              styles.personalizadoResumenValor,
                              Math.abs(sumaMontosPersonalizados - montoDivisionNum) > 0.01
                                ? styles.personalizadoResumenValorAlerta
                                : styles.personalizadoResumenValorOk,
                            ]}
                          >
                            {monedaBase.toUpperCase()} {sumaMontosPersonalizados.toFixed(2)} /{" "}
                            {montoDivisionNum.toFixed(2)}
                          </Text>
                        </View>

                        {errores.divisionPersonalizada && (
                          <Text style={styles.error}>{errores.divisionPersonalizada}</Text>
                        )}
                      </View>
                    )}
                  </View>
                )}

                <PrimaryButton
                  label={saving ? "Guardando..." : "Registrar gasto"}
                  loading={saving}
                  onPress={handleGuardar}
                  disabled={saving}
                  style={styles.submitButton}
                />
                {desdeComprobante ? (
                  <PrimaryButton
                    label="Cancelar"
                    variant="secondary"
                    onPress={handleCancelar}
                    disabled={saving}
                    style={styles.cancelButton}
                    testID="add-gasto-cancel"
                  />
                ) : null}
              </View>
            )}
            </View>
            </TouchableWithoutFeedback>
          </ScrollView>
        </View>

        {/* Bottom sheet: Categoría */}
        {modalCategoriaVisible && (
          <View style={styles.modalOverlayAbsolute}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalCategoriaVisible(false)} />
            <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: slideAnimCategoria }] }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Seleccionar Categoría</Text>
                <TouchableOpacity onPress={() => setModalCategoriaVisible(false)}>
                  <FontAwesome6 name="xmark" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={categorias}
                keyExtractor={(item) => item.IdCategoria.toString()}
                renderItem={({ item, index }) => {
                  const iconoName = ICONOS_CATEGORIAS[item.Nombre] || "tags";
                  const esActivo = idCategoria === item.IdCategoria;
                  const esElUltimo = index === categorias.length - 1;

                  return (
                    <TouchableOpacity
                      style={[styles.modalItem, esActivo && styles.modalItemActive, esElUltimo && { borderBottomWidth: 0 }]}
                      onPress={() => {
                        setIdCategoria(item.IdCategoria);
                        marcarRevisado(CAMPO_CATEGORIA);
                        setModalCategoriaVisible(false);
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <FontAwesome6
                          name={iconoName}
                          size={16}
                          color={esActivo ? colors.primary : "#4b5563"}
                          style={{ marginRight: 12, width: 24, textAlign: "center" }}
                        />
                        <Text style={[styles.modalItemText, esActivo && styles.modalItemTextActive]}>
                          {item.Nombre}
                        </Text>
                      </View>
                      {esActivo && <FontAwesome6 name="check" size={14} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                }}
              />
            </Animated.View>
          </View>
        )}

        {/* Bottom sheet: Pagador */}
        {modalPagadorVisible && (
          <View style={styles.modalOverlayAbsolute}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalPagadorVisible(false)} />
            <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: slideAnimPagador }] }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>¿Quién pagó?</Text>
                <TouchableOpacity onPress={() => setModalPagadorVisible(false)}>
                  <FontAwesome6 name="xmark" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={participantes}
                keyExtractor={(item) => item.IdParticipanteViaje.toString()}
                renderItem={({ item, index }) => {
                  const esElUltimo = index === participantes.length - 1;

                  return (
                    <TouchableOpacity
                      style={[styles.modalItem, idPagador === item.IdParticipanteViaje && styles.modalItemActive, esElUltimo && { borderBottomWidth: 0 }]}
                      onPress={() => {
                        const nuevoPagadorId = item.IdParticipanteViaje;
                        setIdPagador(nuevoPagadorId);
                        setModalPagadorVisible(false);

                        if (esCompartido) {
                          setIdsParticipantesSeleccionados((prev) => {
                            if (!prev.includes(nuevoPagadorId)) {
                              return [...prev, nuevoPagadorId];
                            }
                            return prev;
                          });
                        }
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.modalItemText,
                            idPagador === item.IdParticipanteViaje && styles.modalItemTextActive,
                          ]}
                        >
                          {item.Nombre} {item.Apellido}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>@{item.NombreUsuario}</Text>
                      </View>
                      {idPagador === item.IdParticipanteViaje && (
                        <FontAwesome6 name="check" size={14} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            </Animated.View>
          </View>
        )}

        <DatePickerModal
          visible={mostrarCalendario}
          onClose={() => setMostrarCalendario(false)}
          title="Fecha del gasto"
          value={fechaIso}
          onChange={(fecha) => {
            setFechaIso(fecha);
            marcarRevisado(CAMPO_FECHA);
          }}
          maxDate={new Date()}
        />

        {/* Bottom sheet: Participantes */}
        {modalParticipantesVisible && (
          <View style={styles.modalOverlayAbsolute}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalParticipantesVisible(false)} />
            <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: slideAnimParticipantes }] }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Integrantes del Gasto</Text>
                <TouchableOpacity
                  style={styles.modalDoneButton}
                  onPress={() => setModalParticipantesVisible(false)}
                >
                  <Text style={styles.modalDoneButtonText}>Listo</Text>
                </TouchableOpacity>
              </View>

              {(() => {
                const datosIntegrantes = [
                  {
                    IdParticipanteViaje: "TODOS",
                    Nombre: "Todos",
                    Apellido: "",
                    NombreUsuario: "marcar_desmarcar",
                  },
                  ...participantes,
                ];

                return (
                  <FlatList
                    data={datosIntegrantes}
                    keyExtractor={(item) => item.IdParticipanteViaje.toString()}
                    renderItem={({ item, index }) => {
                      const esElUltimo = index === datosIntegrantes.length - 1;

                      if (item.IdParticipanteViaje === "TODOS") {
                        const todosIds = participantes.map((p) => p.IdParticipanteViaje);
                        const estanTodosSeleccionados =
                          todosIds.length > 0 &&
                          todosIds.every((idp) => idsParticipantesSeleccionados.includes(idp));

                        return (
                          <TouchableOpacity
                            style={[
                              styles.modalItem,
                              estanTodosSeleccionados && styles.modalItemActive,
                              { borderBottomWidth: 2, borderBottomColor: colors.primary },
                            ]}
                            onPress={() => toggleSeleccionParticipante("TODOS")}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.modalItemText, { fontWeight: "bold", color: colors.primary }]}>
                                Seleccionar Todos
                              </Text>
                            </View>
                            <View
                              style={[styles.customCheckbox, estanTodosSeleccionados && styles.customCheckboxChecked]}
                            >
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
                            esElPagador && { backgroundColor: "#f9fafb" },
                            esElUltimo && { borderBottomWidth: 0 },
                          ]}
                          onPress={() => toggleSeleccionParticipante(item.IdParticipanteViaje)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.modalItemText,
                                estaSeleccionado && styles.modalItemTextActive,
                                esElPagador && { color: "#6b7280", fontWeight: "600" },
                              ]}
                            >
                              {item.Nombre} {item.Apellido} {esElPagador && "(Responsable)"}
                            </Text>
                            <Text style={{ fontSize: 12, color: colors.textMuted }}>@{item.NombreUsuario}</Text>
                          </View>
                          <View
                            style={[
                              styles.customCheckbox,
                              estaSeleccionado && styles.customCheckboxChecked,
                              esElPagador && { backgroundColor: "#9ca3af", borderColor: "#9ca3af" },
                            ]}
                          >
                            {estaSeleccionado && <FontAwesome6 name="check" size={10} color="#fff" />}
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                  />
                );
              })()}
            </Animated.View>
          </View>
        )}
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayStrong,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    maxHeight: "85%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  center: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 0,
  },
  label: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.primary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
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
    marginBottom: 5,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 8,
    ...textStyles.body,
  },
  inputDateText: {
    flex: 1,
    color: colors.textPrimary,
    ...textStyles.body,
  },
  datePlaceholder: {
    color: colors.overlay,
  },
  currencyCodePrefix: {
    ...textStyles.body,
    color: colors.overlay,
    fontWeight: "700",
    marginRight: 6,
  },
  infoConversionText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 6,
    fontStyle: "italic",
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
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 5,
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
  },
  dropdownPlaceholder: {
    ...textStyles.body,
    color: colors.overlay,
  },
  dropdownText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  submitButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  cancelButton: {
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },
  inputError: {
    borderColor: colors.danger,
  },
  comprobantePreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  comprobanteMiniatura: {
    width: 56,
    height: 76,
    borderRadius: radii.sm,
    backgroundColor: colors.border,
  },
  comprobanteImagenAmpliada: {
    width: "100%",
    height: 360,
    borderRadius: radii.sm,
  },
  comprobanteInfo: {
    flex: 1,
  },
  comprobanteTitulo: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  comprobanteHint: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  guardarComprobanteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  guardarComprobanteTextos: {
    flex: 1,
    gap: 2,
  },
  guardarComprobanteTitulo: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  guardarComprobanteHint: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  conversionCard: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radii.md,
    backgroundColor: colors.warningSurface,
  },
  advertenciaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  advertenciaText: {
    ...textStyles.meta,
    color: colors.textPrimary,
    flex: 1,
  },
  conversionEstado: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  conversionLink: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  avisoFechaText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    flex: 1,
  },
  pagadorPersonalText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  campoRevisar: {
    borderColor: colors.warning,
    backgroundColor: colors.warningSurface,
  },
  campoRevisarGrupo: {
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radii.md,
    backgroundColor: colors.warningSurface,
    padding: 4,
  },
  revisarHint: {
    ...textStyles.meta,
    color: colors.warning,
    fontWeight: "600",
    marginTop: 2,
  },
  scanInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    backgroundColor: colors.successSurface,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  scanInfoText: {
    ...textStyles.meta,
    color: colors.textPrimary,
    flex: 1,
  },
  error: {
    ...textStyles.meta,
    color: colors.danger,
    marginTop: spacing.xs,
    fontWeight: "600",
  },
  selectorContainer: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 5,
  },
  selectorOption: {
    flex: 1,
    flexDirection: "row",
    height: 42,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  selectorOptionActive: {
    backgroundColor: colors.primary,
  },
  selectorOptionText: {
    ...textStyles.body,
    color: colors.primary,
  },
  selectorOptionTextActive: {
    color: "#fff",
  },
  sharedCard: {
    marginTop: spacing.sm,
    backgroundColor: "#f7f9fc",
    borderRadius: radii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e6ebf2",
  },
  sharedCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  sharedCardIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e4ecff",
    alignItems: "center",
    justifyContent: "center",
  },
  sharedCardTitle: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.primary,
    fontSize: 14,
  },
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCircleText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  avatarCircleSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  avatarCircleSmallText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarStackItem: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarStackMore: {
    backgroundColor: "#9ca3af",
  },
  avatarStackText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  equalSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#eef4ff",
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  equalSummaryText: {
    ...textStyles.body,
    color: colors.primary,
    fontWeight: "600",
    fontSize: 13,
  },
  personalizadoCard: {
    marginTop: 15,
    backgroundColor: colors.surface,
    padding: 15,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  personalizadoTitle: {
    ...textStyles.label,
    color: colors.primary,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 5,
  },
  personalizadoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f9fafb",
  },
  personalizadoPersonaWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  personalizadoNombre: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
  },
  personalizadoInput: {
    backgroundColor: "#f3f4f6",
    width: 100,
    height: 38,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    textAlign: "right",
    ...textStyles.body,
    color: colors.textPrimary,
  },
  personalizadoResumen: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  personalizadoResumenLabel: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  personalizadoResumenValor: {
    ...textStyles.bodyStrong,
    fontSize: 13,
  },
  personalizadoResumenValorOk: {
    color: "#16a34a",
  },
  personalizadoResumenValorAlerta: {
    color: colors.danger,
  },
  customCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  customCheckboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
  },
  modalDoneButton: {
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  modalDoneButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  modalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  modalItemActive: {
    backgroundColor: "#f0f4f8",
    borderRadius: 8,
  },
  modalItemText: {
    fontSize: 15,
    color: "#333",
  },
  modalItemTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  modalOverlayAbsolute: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
    elevation: 999,
  },
  bottomSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: 20,
    maxHeight: "70%",
  },
});