import React, { useEffect, useState, useRef, useCallback } from "react";
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

const COLOR_SUPERFICIE_SUAVE = colors.surfaceMuted || "#F2F4F7";

function getIniciales(persona) {
  const n = (persona?.Nombre || "").trim().charAt(0);
  const a = (persona?.Apellido || "").trim().charAt(0);
  return (n + a).toUpperCase() || "?";
}

function fmt(numero) {
  return Number(numero || 0).toFixed(2);
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

const CAMPO_NOMBRE = "Nombre";
const CAMPO_MONTO = "MontoOriginal";
const CAMPO_MONEDA = "MonedaOriginal";
const CAMPO_FECHA = "FechaGasto";
const CAMPO_CATEGORIA = "IdCategoria";

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

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return visible;
}

/**
 * Mantiene visible el campo que se está editando moviendo el scroll SOLO lo necesario:
 * - Si el campo ya se ve completo sobre el teclado, no se mueve nada.
 * - Si queda tapado, se desplaza justo lo suficiente para que quede apenas por encima del teclado.
 * Usa la altura real visible del ScrollView (que ya descuenta el teclado), por eso se adapta
 * a cualquier dispositivo y tamaño de teclado.
 */
function useScrollAlCampo(margen = 20) {
  const ref = useRef(null);
  const scrollY = useRef(0);
  const alturaVisible = useRef(0);
  const campos = useRef({});
  const activo = useRef(null);

  const asegurarVisible = useCallback(() => {
    const campo = activo.current != null ? campos.current[activo.current] : null;
    if (!campo || !alturaVisible.current) return;

    const arriba = campo.y;
    const abajo = campo.y + campo.h;
    const visibleArriba = scrollY.current;
    const visibleAbajo = scrollY.current + alturaVisible.current;

    let destino = null;
    if (abajo + margen > visibleAbajo) {
      destino = abajo + margen - alturaVisible.current;
    } else if (arriba - margen < visibleArriba) {
      destino = arriba - margen;
    }

    if (destino !== null) {
      ref.current?.scrollTo({ y: Math.max(0, destino), animated: true });
    }
  }, [margen]);

  const registrar = useCallback(
    (key) => (e) => {
      const { y, height } = e.nativeEvent.layout;
      campos.current[key] = { y, h: height };
    },
    []
  );

  const enfocar = useCallback(
    (key) => {
      activo.current = key;
      // Se reintenta cuando el teclado terminó de abrirse
      setTimeout(asegurarVisible, 120);
      setTimeout(asegurarVisible, 380);
    },
    [asegurarVisible]
  );

  const limpiar = useCallback(() => {
    activo.current = null;
  }, []);

  const scrollProps = {
    scrollEventThrottle: 16,
    onScroll: (e) => {
      scrollY.current = e.nativeEvent.contentOffset.y;
    },
    onLayout: (e) => {
      alturaVisible.current = e.nativeEvent.layout.height;
      // Si el área visible cambió (se abrió el teclado), se reacomoda el campo activo
      if (activo.current != null) setTimeout(asegurarVisible, 50);
    },
  };

  return { ref, scrollProps, registrar, enfocar, limpiar };
}

function Avatar({ persona, small = false }) {
  return (
    <View style={[styles.avatar, small && styles.avatarSmall]}>
      <Text style={[styles.avatarText, small && styles.avatarTextSmall]}>{getIniciales(persona)}</Text>
    </View>
  );
}

function SheetOverlay({ visible, onClose, children, tall = false }) {
  const slide = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slide, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else {
      slide.setValue(320);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.modalOverlayAbsolute}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetKav}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[styles.bottomSheet, tall && styles.bottomSheetTall, { transform: [{ translateY: slide }] }]}
        >
          <View style={styles.grabber} />
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

function SummaryRow({ caption, leading, value, placeholder = false, sub, subTone, onPress, error, testID }) {
  return (
    <View style={styles.summaryBlock}>
      <Text style={styles.rowCaption}>{caption}</Text>
      <TouchableOpacity
        style={[styles.summaryRow, error && styles.inputError]}
        onPress={onPress}
        activeOpacity={0.7}
        testID={testID}
      >
        {leading}
        <View style={styles.summaryTextWrap}>
          <Text numberOfLines={1} style={placeholder ? styles.dropdownPlaceholder : styles.dropdownText}>
            {value}
          </Text>
          {sub ? (
            <Text
              style={[
                styles.summarySub,
                subTone === "ok" && styles.summarySubOk,
                subTone === "warn" && styles.summarySubWarn,
              ]}
            >
              {sub}
            </Text>
          ) : null}
        </View>
        <FontAwesome6 name="chevron-right" size={13} color={colors.textMuted} />
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
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
  const tecladoVisible = useKeyboardVisible();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [categorias, setCategorias] = useState([]);
  const [participantes, setParticipantes] = useState([]);
  const [monedasBD, setMonedasBD] = useState([]);

  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [monedaSeleccionada, setMonedaSeleccionada] = useState(monedaBase);

  // Declaración previa de montoValido para evitar ReferenceError
  const montoValido = parsearMonto(monto).valor;

  const [idCategoria, setIdCategoria] = useState(null);
  const [idPagador, setIdPagador] = useState(null);

  const [modalCategoriaVisible, setModalCategoriaVisible] = useState(false);
  const [modalPagadorVisible, setModalPagadorVisible] = useState(false);
  const [modalDivisionVisible, setModalDivisionVisible] = useState(false);

  const [esCompartido, setEsCompartido] = useState(false);
  const [esDivisionIgualitaria, setEsDivisionIgualitaria] = useState(true);
  const [idsParticipantesSeleccionados, setIdsParticipantesSeleccionados] = useState([]);
  const [montosPersonalizados, setMontosPersonalizados] = useState({});

  const [fechaIso, setFechaIso] = useState(toYMD(new Date()));
  const [mostrarCalendario, setMostrarCalendario] = useState(false);

  const [errores, setErrores] = useState({});

  const [camposRevisar, setCamposRevisar] = useState([]);
  const [escaneoAplicado, setEscaneoAplicado] = useState(false);

  const [comprobanteUri, setComprobanteUri] = useState(null);
  const [comprobanteAmpliado, setComprobanteAmpliado] = useState(false);
  const [montoARS, setMontoARS] = useState("");

  const [comprobanteImagen, setComprobanteImagen] = useState(null);
  const [guardarComprobante, setGuardarComprobante] = useState(true);

  const [conversion, setConversion] = useState({ estado: "idle", fecha: null });

  // Scroll inteligente: deja el campo editado justo sobre el teclado
  const scrollPrincipal = useScrollAlCampo();
  const scrollDivision = useScrollAlCampo();

  useEffect(() => {
    if (!tecladoVisible) {
      scrollPrincipal.limpiar();
      scrollDivision.limpiar();
    }
  }, [tecladoVisible]);

  const desdeComprobante = escaneoAplicado;
  const requiereConversion = desdeComprobante && requiereConversionARS(monedaSeleccionada);
  const avisoFechaViaje = desdeComprobante
    ? mensajeFechaFueraDelViaje(fechaIso, FechaInicioViaje, FechaFinViaje)
    : null;
  const participanteActual = participantes.find((p) => p.EsUsuarioActual);

  const categoriaSeleccionada = categorias.find((c) => c.IdCategoria === idCategoria);
  const pagadorSeleccionado = participantes.find((p) => p.IdParticipanteViaje === idPagador);

  const unicoParticipante = participantes.length <= 1;

  const montoDivision =
    requiereConversion && monedaBase.toUpperCase() === MONEDA_PESOS_ARGENTINOS
      ? montoARS
      : monto;
  const montoDivisionNum = parsearMonto(montoDivision).valor || 0;
  const monedaDivision =
    montoDivision === montoARS && requiereConversion
      ? MONEDA_PESOS_ARGENTINOS
      : monedaSeleccionada.toUpperCase();

  const sumaMontosPersonalizados = idsParticipantesSeleccionados.reduce((acc, id) => {
    const v = parseFloat(montosPersonalizados[id]);
    return acc + (isNaN(v) ? 0 : v);
  }, 0);

  const cantidadSeleccionados = idsParticipantesSeleccionados.length;
  // Participantes elegidos SIN contar al pagador (que siempre está incluido)
  const cantidadOtros = idsParticipantesSeleccionados.filter((id) => id !== idPagador).length;

  const montoPorPersona =
    cantidadSeleccionados > 0 && montoDivisionNum ? montoDivisionNum / cantidadSeleccionados : 0;

  const diferenciaPersonalizada = montoDivisionNum - sumaMontosPersonalizados;
  const personalizadaCuadra = Math.abs(diferenciaPersonalizada) <= 0.01;

  // Mientras no haya nadie más que el pagador, el campo sigue pidiendo seleccionar
  const textoParticipantes =
    cantidadOtros === 0
      ? "Seleccioná participantes"
      : cantidadSeleccionados === participantes.length
      ? "Todos los integrantes"
      : `${cantidadSeleccionados} participantes`;

  let subDivision = null;
  let subDivisionTono = null;
  if (cantidadOtros > 0 && montoDivisionNum > 0) {
    if (esDivisionIgualitaria) {
      subDivision = `Igualitaria · ${monedaDivision} ${fmt(montoPorPersona)} c/u`;
    } else if (personalizadaCuadra) {
      subDivision = "Personalizada · todo asignado";
      subDivisionTono = "ok";
    } else if (diferenciaPersonalizada > 0) {
      subDivision = `Personalizada · faltan ${monedaDivision} ${fmt(diferenciaPersonalizada)}`;
      subDivisionTono = "warn";
    } else {
      subDivision = `Personalizada · te pasaste ${monedaDivision} ${fmt(-diferenciaPersonalizada)}`;
      subDivisionTono = "warn";
    }
  } else if (cantidadOtros > 0) {
    subDivision = esDivisionIgualitaria ? "Igualitaria" : "Personalizada";
  }

  useEffect(() => {
    if (initialData && !loading && categorias.length > 0) {
      aplicarEscaneo(initialData);
    }
  }, [initialData, loading, categorias]);

  useEffect(() => {
    if (!requiereConversion || conversion.estado === "manual") return undefined;
    if (!montoValido) {
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
        setConversion({ estado: "error", fecha: null });
      }
    }, DEMORA_COTIZACION_MS);

    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [requiereConversion, monedaSeleccionada, montoValido, fechaIso, conversion.estado === "manual"]);

  // ───────────── Selección de participantes ─────────────

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

    // El pagador siempre está incluido: se ignora el toque sin molestar con alertas
    if (id === idPagador) return;

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

  function cambiarModoDivision(igualitaria) {
    setEsDivisionIgualitaria(igualitaria);
  }

  // ───────────── Flujo guiado de "Compartido" ─────────────

  function activarCompartido() {
    if (unicoParticipante) {
      appAlert("Aviso", "Solo hay un participante en este viaje, por lo que el gasto debe ser personal.");
      return;
    }
    if (esCompartido) return;

    Keyboard.dismiss();
    setEsCompartido(true);

    // Lleva al usuario al dato que falta
    setTimeout(() => {
      if (!idPagador) {
        setModalPagadorVisible(true);
      } else if (cantidadOtros === 0) {
        setModalDivisionVisible(true);
      }
    }, 250);
  }

  function seleccionarPagador(nuevoPagadorId) {
    const pagadorAnterior = idPagador;
    setIdPagador(nuevoPagadorId);
    setModalPagadorVisible(false);

    if (!esCompartido) return;

    let nuevaSeleccion;
    if (
      idsParticipantesSeleccionados.length === 1 &&
      idsParticipantesSeleccionados[0] === pagadorAnterior
    ) {
      // Solo estaba el pagador anterior: se reemplaza por el nuevo
      nuevaSeleccion = [nuevoPagadorId];
    } else if (idsParticipantesSeleccionados.includes(nuevoPagadorId)) {
      nuevaSeleccion = idsParticipantesSeleccionados;
    } else {
      nuevaSeleccion = [...idsParticipantesSeleccionados, nuevoPagadorId];
    }
    setIdsParticipantesSeleccionados(nuevaSeleccion);

    // Siguiente paso: elegir entre quiénes se divide
    const otros = nuevaSeleccion.filter((id) => id !== nuevoPagadorId).length;
    if (otros === 0) {
      setTimeout(() => setModalDivisionVisible(true), 300);
    }
  }

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
    setModalCategoriaVisible(false);
    setModalPagadorVisible(false);
    setModalDivisionVisible(false);

    async function cargarMonedas() {
      try {
        const monedas = await getCurrencies();
        if (Array.isArray(monedas) && monedas.length > 0) {
          setMonedasBD(monedas);
          return;
        }
      } catch (e) {}
      setMonedasBD([{ Codigo: monedaBase, Nombre: "Moneda base" }]);
    }

    async function cargarDatos() {
      try {
        setLoading(true);
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

        if (parts.length <= 1) {
          setEsCompartido(false);
        }
      } catch (error) {
        const catsLocal = obtenerCategoriasCache();
        const partsLocal = obtenerParticipantesCache(IdViaje);

        if (catsLocal.length > 0 && partsLocal.length > 0) {
          setCategorias(catsLocal);
          setParticipantes(partsLocal);
          if (partsLocal.length <= 1) {
            setEsCompartido(false);
          }
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

  function marcarRevisado(campo) {
    setCamposRevisar((prev) => (prev.includes(campo) ? prev.filter((c) => c !== campo) : prev));
  }

  function aplicarEscaneo(datos, imagen = null) {
    const revisar = new Set(datos?.CamposBajaConfianza || []);

    if (comprobanteUri && comprobanteUri !== imagen?.uri) eliminarImagenTemporal(comprobanteUri);
    setComprobanteUri(imagen?.uri || null);
    setComprobanteAmpliado(false);
    setMontoARS("");
    setConversion({ estado: "idle", fecha: null });
    setComprobanteImagen(imagen || null);

    const actual = participantes.find((p) => p.EsUsuarioActual);
    if (actual) setIdPagador(actual.IdParticipanteViaje);

    setNombre(datos?.Nombre || "");
    setMonto(montoParaInput(datos?.MontoOriginal));

    const codigo = String(datos?.MonedaOriginal || "").toUpperCase();
    const monedaDisponible =
      codigo && (monedasBD.length === 0 || monedasBD.some((m) => m.Codigo === codigo));
    if (monedaDisponible) {
      setMonedaSeleccionada(codigo);
    } else {
      setMonedaSeleccionada(monedaBase);
      revisar.add(CAMPO_MONEDA);
    }

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

    const montoParseado = parsearMonto(monto);
    if (montoParseado.error) {
      nuevosErrores.monto = montoParseado.error;
    }

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
          "Seleccioná al menos un participante además de quien pagó";
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
          nuevosErrores.divisionPersonalizada = `La suma de los montos individuales debe ser igual al monto total`;
        }
      }
    }

    setErrores(nuevosErrores);

    if (Object.keys(nuevosErrores).length > 0) {
      return;
    }

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
        const esCotizacionCaida = apiError?.status === 503 || apiError?.message?.includes("cotización");

        if (!esCotizacionCaida && !esErrorDeRed(apiError)) {
          appAlert(
            "No se pudo registrar el gasto",
            apiError?.message || "El servidor rechazó el gasto."
          );
          return;
        }

        const guardadoConExito = guardarGastoOffline(nuevoGasto);
        const avisoComprobanteOffline =
          desdeComprobante && guardarComprobante && comprobanteImagen
            ? " El comprobante no se guardó en el repositorio porque no hubo conexión."
            : "";

        if (guardadoConExito) {
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
              "El gasto quedó guardado localmente con su moneda original." + avisoComprobanteOffline,
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
    <Modal animationType="slide" transparent visible={visible} onRequestClose={handleCancelar}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.mainKav}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
        >
          <View style={styles.sheet}>
            <View style={styles.grabber} />

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
              <>
                <ScrollView
                  ref={scrollPrincipal.ref}
                  {...scrollPrincipal.scrollProps}
                  style={styles.mainScroll}
                  contentContainerStyle={[
                    styles.mainScrollContent,
                    { paddingBottom: tecladoVisible ? spacing.lg : 120 },
                  ]}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator={false}
                >
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

                  <View
                    onLayout={scrollPrincipal.registrar("monto")}
                    style={[styles.amountHero, debeRevisar(CAMPO_MONTO) && styles.campoRevisar]}
                  >
                    <Text style={styles.amountCaption}>Monto ({monedaSeleccionada.toUpperCase()})</Text>
                    <View style={styles.amountRow}>
                      <Text style={styles.amountCurrency}>{monedaSeleccionada.toUpperCase()}</Text>
                      <TextInput
                        style={styles.amountInput}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={monto}
                        onFocus={() => scrollPrincipal.enfocar("monto")}
                        onChangeText={(texto) => {
                          setMonto(texto);
                          marcarRevisado(CAMPO_MONTO);
                        }}
                      />
                    </View>
                  </View>
                  {debeRevisar(CAMPO_MONTO) && <Text style={styles.revisarHint}>Revisá este dato</Text>}
                  {errores.monto && <Text style={styles.error}>{errores.monto}</Text>}

                  <View
                    style={[styles.currencyWrap, debeRevisar(CAMPO_MONEDA) && styles.campoRevisarGrupo]}
                  >
                    <CurrencySelector
                      currencies={monedasBD.length > 0 ? monedasBD : [{ Codigo: monedaBase, Nombre: "Moneda Base" }]}
                      selectedCurrency={monedaSeleccionada}
                      onSelectCurrency={(codigo) => {
                        Keyboard.dismiss();
                        setMonedaSeleccionada(codigo);
                        marcarRevisado(CAMPO_MONEDA);
                      }}
                    />
                  </View>
                  {debeRevisar(CAMPO_MONEDA) && (
                    <Text style={styles.revisarHint}>Revisá la moneda del comprobante</Text>
                  )}
                  {!requiereConversion && monedaSeleccionada.toUpperCase() !== monedaBase.toUpperCase() && (
                    <Text style={styles.infoConversionText}>
                      ℹ El importe se convertirá automáticamente a la moneda base del viaje ({monedaBase.toUpperCase()}).
                    </Text>
                  )}

                  {requiereConversion ? (
                    <View
                      style={styles.conversionCard}
                      onLayout={scrollPrincipal.registrar("montoARS")}
                      testID="conversion-ars-warning"
                    >
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
                          onFocus={() => scrollPrincipal.enfocar("montoARS")}
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
                      {conversion.estado !== "auto" ? (
                        <Text style={styles.conversionEstado} testID="conversion-ars-estado">
                          {conversion.estado === "cargando"
                            ? "Calculando la conversión..."
                            : conversion.estado === "error"
                            ? "No pudimos obtener la cotización."
                            : conversion.estado === "manual"
                            ? "Monto ingresado manualmente."
                            : "Ingresá el monto para calcular la conversión."}
                        </Text>
                      ) : null}
                      {errores.montoARS && <Text style={styles.error}>{errores.montoARS}</Text>}
                    </View>
                  ) : null}

                  <Text style={styles.label}>Concepto</Text>
                  <View
                    onLayout={scrollPrincipal.registrar("nombre")}
                    style={[
                      styles.inputBox,
                      debeRevisar(CAMPO_NOMBRE) && styles.campoRevisar,
                      errores.nombre && styles.inputError,
                    ]}
                  >
                    <FontAwesome6 name="pen" size={14} color={colors.overlay} />
                    <TextInput
                      style={styles.input}
                      placeholder="Cena"
                      placeholderTextColor={colors.overlay}
                      value={nombre}
                      onFocus={() => scrollPrincipal.enfocar("nombre")}
                      onChangeText={(texto) => {
                        setNombre(texto);
                        marcarRevisado(CAMPO_NOMBRE);
                      }}
                    />
                  </View>
                  {debeRevisar(CAMPO_NOMBRE) && <Text style={styles.revisarHint}>Revisá este dato</Text>}
                  {errores.nombre && <Text style={styles.error}>{errores.nombre}</Text>}

                  <View style={styles.tilesRow}>
                    <View style={styles.tileWrap}>
                      <Text style={styles.label}>Fecha</Text>
                      {Platform.OS === "web" ? (
                        <View style={[styles.tile, debeRevisar(CAMPO_FECHA) && styles.campoRevisar]}>
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
                            style={{ border: "none", width: "100%", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: "16px", color: "inherit", cursor: "pointer" }}
                          />
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => {
                            Keyboard.dismiss();
                            setMostrarCalendario(true);
                          }}
                          style={[
                            styles.tile,
                            debeRevisar(CAMPO_FECHA) && styles.campoRevisar,
                            errores.fecha && styles.inputError,
                          ]}
                        >
                          <FontAwesome6 name="calendar" size={15} color={colors.primary} />
                          <Text
                            numberOfLines={1}
                            style={[styles.tileText, !fechaIso && styles.datePlaceholder]}
                          >
                            {fechaIso ? formatDateDisplay(fechaIso) : "Seleccionar"}
                          </Text>
                        </Pressable>
                      )}
                    </View>

                    <View style={styles.tileWrap}>
                      <Text style={styles.label}>Categoría</Text>
                      <TouchableOpacity
                        style={[
                          styles.tile,
                          debeRevisar(CAMPO_CATEGORIA) && styles.campoRevisar,
                          errores.categoria && styles.inputError,
                        ]}
                        onPress={() => {
                          Keyboard.dismiss();
                          setModalCategoriaVisible(true);
                        }}
                      >
                        <FontAwesome6
                          name={categoriaSeleccionada ? ICONOS_CATEGORIAS[categoriaSeleccionada.Nombre] || "tags" : "tags"}
                          size={15}
                          color={categoriaSeleccionada ? colors.primary : colors.overlay}
                        />
                        <Text
                          numberOfLines={1}
                          style={[styles.tileText, !idCategoria && styles.datePlaceholder]}
                        >
                          {categoriaSeleccionada ? categoriaSeleccionada.Nombre : "Elegir"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {debeRevisar(CAMPO_FECHA) && <Text style={styles.revisarHint}>Revisá la fecha</Text>}
                  {debeRevisar(CAMPO_CATEGORIA) && <Text style={styles.revisarHint}>Revisá la categoría</Text>}
                  {errores.fecha && <Text style={styles.error}>{errores.fecha}</Text>}
                  {errores.categoria && <Text style={styles.error}>{errores.categoria}</Text>}
                  {avisoFechaViaje ? (
                    <View style={styles.advertenciaRow} testID="fecha-fuera-viaje-warning">
                      <FontAwesome6 name="circle-info" size={13} color={colors.textSecondary} />
                      <Text style={styles.avisoFechaText}>{avisoFechaViaje}</Text>
                    </View>
                  ) : null}

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
                      style={[
                        styles.selectorOption,
                        esCompartido && styles.selectorOptionActive,
                        unicoParticipante && styles.selectorOptionDisabled,
                      ]}
                      onPress={activarCompartido}
                      disabled={unicoParticipante}
                    >
                      <FontAwesome6 name="users" size={14} color={esCompartido ? colors.textInverse : (unicoParticipante ? colors.textMuted : colors.primary)} />
                      <Text style={[styles.selectorOptionText, esCompartido && styles.selectorOptionTextActive, unicoParticipante && { color: colors.textMuted }]}>
                        Compartido
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {unicoParticipante && (
                    <Text style={styles.fieldHint}>Este viaje tiene un único participante, por lo que la opción compartida está deshabilitada.</Text>
                  )}

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

                      <SummaryRow
                        caption="¿Quién pagó?"
                        leading={
                          pagadorSeleccionado ? (
                            <Avatar persona={pagadorSeleccionado} />
                          ) : (
                            <View style={styles.avatarVacio}>
                              <FontAwesome6 name="user" size={12} color={colors.overlay} />
                            </View>
                          )
                        }
                        value={
                          pagadorSeleccionado
                            ? `${pagadorSeleccionado.Nombre} ${pagadorSeleccionado.Apellido}`
                            : "Seleccioná quién pagó"
                        }
                        placeholder={!pagadorSeleccionado}
                        onPress={() => {
                          Keyboard.dismiss();
                          setModalPagadorVisible(true);
                        }}
                        error={errores.pagador}
                      />

                      <SummaryRow
                        caption="¿Entre quiénes se divide?"
                        leading={
                          cantidadOtros > 0 ? (
                            <View style={styles.avatarStack}>
                              {participantes
                                .filter((p) => idsParticipantesSeleccionados.includes(p.IdParticipanteViaje))
                                .slice(0, 3)
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
                              {cantidadSeleccionados > 3 && (
                                <View style={[styles.avatarStackItem, styles.avatarStackMore, { marginLeft: -10 }]}>
                                  <Text style={styles.avatarStackText}>+{cantidadSeleccionados - 3}</Text>
                                </View>
                              )}
                            </View>
                          ) : (
                            <View style={styles.avatarVacio}>
                              <FontAwesome6 name="users" size={12} color={colors.overlay} />
                            </View>
                          )
                        }
                        value={textoParticipantes}
                        placeholder={cantidadOtros === 0}
                        sub={subDivision}
                        subTone={subDivisionTono}
                        onPress={() => {
                          Keyboard.dismiss();
                          setModalDivisionVisible(true);
                        }}
                        error={errores.participantes || errores.divisionPersonalizada}
                        testID="abrir-division"
                      />
                    </View>
                  )}
                </ScrollView>

                {/* El botón "Registrar gasto" NO se muestra mientras el teclado está abierto:
                    el usuario está escribiendo y el botón quedaría pegado encima del teclado. */}
                {!tecladoVisible && (
                  <View style={styles.footer}>
                    <PrimaryButton
                      label={saving ? "Guardando..." : "Registrar gasto"}
                      loading={saving}
                      onPress={handleGuardar}
                      disabled={saving}
                    />
                    {desdeComprobante ? (
                      <PrimaryButton
                        label="Cancelar"
                        variant="secondary"
                        onPress={handleCancelar}
                        disabled={saving}
                        testID="add-gasto-cancel"
                      />
                    ) : null}
                  </View>
                )}
              </>
            )}
          </View>
        </KeyboardAvoidingView>

        <SheetOverlay visible={modalCategoriaVisible} onClose={() => setModalCategoriaVisible(false)}>
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
        </SheetOverlay>

        <SheetOverlay visible={modalPagadorVisible} onClose={() => setModalPagadorVisible(false)}>
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
              const esActivo = idPagador === item.IdParticipanteViaje;

              return (
                <TouchableOpacity
                  style={[styles.modalItem, esActivo && styles.modalItemActive, esElUltimo && { borderBottomWidth: 0 }]}
                  onPress={() => seleccionarPagador(item.IdParticipanteViaje)}
                >
                  <View style={styles.participanteRowLeft}>
                    <Avatar persona={item} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.modalItemText, esActivo && styles.modalItemTextActive]}>
                        {item.Nombre} {item.Apellido}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>@{item.NombreUsuario}</Text>
                    </View>
                  </View>
                  {esActivo && <FontAwesome6 name="check" size={14} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </SheetOverlay>

        <SheetOverlay visible={modalDivisionVisible} onClose={() => setModalDivisionVisible(false)} tall>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Dividir gasto</Text>
              <Text style={styles.modalSubtitle}>
                Total {monedaDivision} {fmt(montoDivisionNum)}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setModalDivisionVisible(false)} hitSlop={10}>
              <FontAwesome6 name="xmark" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={[styles.selectorContainer, { marginBottom: spacing.sm }]}>
            <TouchableOpacity
              style={[styles.selectorOption, esDivisionIgualitaria && styles.selectorOptionActive]}
              onPress={() => cambiarModoDivision(true)}
            >
              <FontAwesome6 name="scale-balanced" size={13} color={esDivisionIgualitaria ? "#fff" : colors.primary} />
              <Text style={[styles.selectorOptionText, esDivisionIgualitaria && styles.selectorOptionTextActive]}>
                Igualitaria
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectorOption, !esDivisionIgualitaria && styles.selectorOptionActive]}
              onPress={() => cambiarModoDivision(false)}
            >
              <FontAwesome6 name="sliders" size={13} color={!esDivisionIgualitaria ? "#fff" : colors.primary} />
              <Text style={[styles.selectorOptionText, !esDivisionIgualitaria && styles.selectorOptionTextActive]}>
                Personalizada
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollDivision.ref}
            {...scrollDivision.scrollProps}
            style={styles.divisionScroll}
            contentContainerStyle={{ paddingBottom: tecladoVisible ? spacing.lg : spacing.sm }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {datosIntegrantes.map((item) => {
              if (item.IdParticipanteViaje === "TODOS") {
                const todosIds = participantes.map((p) => p.IdParticipanteViaje);
                const estanTodosSeleccionados =
                  todosIds.length > 0 && todosIds.every((idp) => idsParticipantesSeleccionados.includes(idp));

                return (
                  <TouchableOpacity
                    key="TODOS"
                    style={[styles.divisionRow, styles.divisionRowTodos]}
                    onPress={() => toggleSeleccionParticipante("TODOS")}
                  >
                    <View style={[styles.customCheckbox, estanTodosSeleccionados && styles.customCheckboxChecked]}>
                      {estanTodosSeleccionados && <FontAwesome6 name="check" size={10} color="#fff" />}
                    </View>
                    <Text style={[styles.modalItemText, { fontWeight: "700", color: colors.primary, marginLeft: 12 }]}>
                      Seleccionar Todos
                    </Text>
                  </TouchableOpacity>
                );
              }

              const id = item.IdParticipanteViaje;
              const estaSeleccionado = idsParticipantesSeleccionados.includes(id);
              const esElPagador = id === idPagador;

              return (
                <Pressable
                  key={id}
                  onLayout={scrollDivision.registrar(id)}
                  style={[
                    styles.divisionRow,
                    estaSeleccionado && styles.divisionRowActiva,
                    esElPagador && { opacity: 0.8 },
                  ]}
                  onPress={() => toggleSeleccionParticipante(id)}
                >
                  <View
                    style={[
                      styles.customCheckbox,
                      estaSeleccionado && styles.customCheckboxChecked,
                      esElPagador && { backgroundColor: "#9ca3af", borderColor: "#9ca3af" },
                    ]}
                  >
                    {estaSeleccionado && <FontAwesome6 name="check" size={10} color="#fff" />}
                  </View>
                  <View style={{ marginLeft: 12 }}>
                    <Avatar persona={item} small />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text numberOfLines={1} style={[styles.modalItemText, estaSeleccionado && styles.modalItemTextActive]}>
                      {item.Nombre} {item.Apellido}
                    </Text>
                    <Text style={styles.divisionSub}>
                      {esElPagador ? "Pagó el gasto · siempre incluido" : `@${item.NombreUsuario}`}
                    </Text>
                  </View>

                  {estaSeleccionado ? (
                    esDivisionIgualitaria ? (
                      <Text style={styles.divisionMonto}>
                        {montoPorPersona ? `${monedaDivision} ${fmt(montoPorPersona)}` : "—"}
                      </Text>
                    ) : (
                      <View style={styles.divisionInputWrap}>
                        <Text style={styles.divisionInputPrefix}>{monedaDivision}</Text>
                        <TextInput
                          style={styles.divisionInput}
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                          value={montosPersonalizados[id] || ""}
                          onChangeText={(val) => handleMontoPersonalizadoChange(id, val)}
                          onFocus={() => scrollDivision.enfocar(id)}
                          selectTextOnFocus
                          testID={`monto-personalizado-${id}`}
                        />
                      </View>
                    )
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.divisionFooter}>
            {esDivisionIgualitaria ? (
              cantidadSeleccionados > 0 && montoDivisionNum ? (
                <View style={styles.equalSummary}>
                  <FontAwesome6 name="circle-info" size={13} color={colors.primary} />
                  <Text style={styles.equalSummaryText}>
                    {cantidadSeleccionados} personas · {monedaDivision} {fmt(montoPorPersona)} c/u
                  </Text>
                </View>
              ) : null
            ) : (
              <View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      personalizadaCuadra ? styles.progressFillOk : styles.progressFillWarn,
                      {
                        width: `${Math.min(
                          100,
                          montoDivisionNum ? (sumaMontosPersonalizados / montoDivisionNum) * 100 : 0
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <View style={styles.personalizadoResumen}>
                  <Text style={styles.personalizadoResumenLabel}>
                    Asignado {monedaDivision} {fmt(sumaMontosPersonalizados)} / {fmt(montoDivisionNum)}
                  </Text>
                  <Text
                    style={[
                      styles.personalizadoResumenValor,
                      personalizadaCuadra
                        ? styles.personalizadoResumenValorOk
                        : styles.personalizadoResumenValorAlerta,
                    ]}
                  >
                    {personalizadaCuadra
                      ? "Todo asignado"
                      : diferenciaPersonalizada > 0
                      ? `Faltan ${fmt(diferenciaPersonalizada)}`
                      : `Te pasaste ${fmt(-diferenciaPersonalizada)}`}
                  </Text>
                </View>
              </View>
            )}

            {errores.participantes && <Text style={styles.error}>{errores.participantes}</Text>}
            {errores.divisionPersonalizada && <Text style={styles.error}>{errores.divisionPersonalizada}</Text>}

            {/* Igual que en la pantalla principal: el botón no aparece con el teclado abierto */}
            {!tecladoVisible && (
              <PrimaryButton label="Listo" onPress={() => setModalDivisionVisible(false)} />
            )}
          </View>
        </SheetOverlay>

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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayStrong,
    justifyContent: "flex-end",
  },
  mainKav: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    maxHeight: "92%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.xs,
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
  mainScroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  mainScrollContent: {
    paddingBottom: spacing.md,
  },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  label: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.primary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  fieldHint: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 4,
  },
  amountHero: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: COLOR_SUPERFICIE_SUAVE,
    alignItems: "center",
  },
  amountCaption: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
  },
  amountCurrency: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textMuted,
  },
  amountInput: {
    flexShrink: 1,
    minWidth: 80,
    fontSize: 38,
    fontWeight: "800",
    color: colors.primary,
    paddingVertical: 4,
    textAlign: "center",
  },
  currencyWrap: {
    marginTop: spacing.sm,
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
    marginTop: 4,
    marginBottom: 2,
    fontStyle: "italic",
  },
  tilesRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  tileWrap: {
    flex: 1,
  },
  tile: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "flex-start",
  },
  tileText: {
    ...textStyles.body,
    color: colors.textPrimary,
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
  selectorOptionDisabled: {
    opacity: 0.5,
  },
  selectorOptionText: {
    ...textStyles.body,
    color: colors.primary,
  },
  selectorOptionTextActive: {
    color: "#fff",
  },
  sharedCard: {
    marginTop: spacing.md,
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
    marginBottom: 2,
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
  summaryBlock: {
    marginTop: spacing.sm,
  },
  rowCaption: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  summaryRow: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  summaryTextWrap: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  summarySub: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 1,
  },
  summarySubOk: {
    color: "#16a34a",
    fontWeight: "600",
  },
  summarySubWarn: {
    color: colors.danger,
    fontWeight: "600",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  avatarTextSmall: {
    fontSize: 10,
  },
  avatarVacio: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLOR_SUPERFICIE_SUAVE,
    alignItems: "center",
    justifyContent: "center",
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
  divisionScroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  divisionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    marginBottom: 4,
    minHeight: 56,
  },
  divisionRowActiva: {
    backgroundColor: "#f0f4f8",
  },
  divisionRowTodos: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    borderRadius: 0,
    marginBottom: spacing.xs,
  },
  divisionSub: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  divisionMonto: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
  },
  divisionInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLOR_SUPERFICIE_SUAVE,
    borderRadius: radii.md,
    paddingLeft: 10,
    height: 42,
    width: 140,
  },
  divisionInputPrefix: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontWeight: "700",
  },
  divisionInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 8,
    textAlign: "right",
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  divisionFooter: {
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: spacing.lg,
  },
  equalSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#eef4ff",
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  equalSummaryText: {
    ...textStyles.body,
    color: colors.primary,
    fontWeight: "600",
    fontSize: 13,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLOR_SUPERFICIE_SUAVE,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressFillOk: {
    backgroundColor: "#16a34a",
  },
  progressFillWarn: {
    backgroundColor: colors.warning,
  },
  personalizadoResumen: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
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
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
  },
  modalSubtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
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
  participanteRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
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
  sheetKav: {
    flex: 1,
    justifyContent: "flex-end",
  },
  bottomSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: 20,
    maxHeight: "70%",
  },
  bottomSheetTall: {
    maxHeight: "90%",
  },
});