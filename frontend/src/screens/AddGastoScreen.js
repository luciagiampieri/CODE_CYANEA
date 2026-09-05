import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
  Modal,
  FlatList,
} from "react-native";

import DateTimePicker from "@react-native-community/datetimepicker";
import { FontAwesome6 } from "@expo/vector-icons";

import {
  getExpenseCategories,
  getTripParticipants,
  createExpense,
} from "../services/api";

import { colors, radii, spacing, shadows, textStyles } from "../theme/tokens";

import {
  guardarGastoOffline,
  guardarCategoriasEnCache,
  obtenerCategoriasCache,
  guardarParticipantesEnCache,
  obtenerParticipantesCache,
} from "../database/gastosLocal";

const ICONOS_CATEGORIAS = {
  "Comida y Bebida": "utensils",
  Transporte: "car",
  Alojamiento: "hotel",
  Entretenimiento: "ticket-simple",
  Compras: "bag-shopping",
  Servicios: "file-invoice-dollar",
  Otros: "ellipsis",
};


export default function AddGastoScreen({ visible, onClose, IdViaje, Moneda, onGastoCreado }) {
  const monedaBase = Moneda || "USD";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [categorias, setCategorias] = useState([]);
  const [participantes, setParticipantes] = useState([]);

  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");

  const [idCategoria, setIdCategoria] = useState(null);
  const [idPagador, setIdPagador] = useState(null);

  const [modalCategoriaVisible, setModalCategoriaVisible] = useState(false);
  const [modalPagadorVisible, setModalPagadorVisible] = useState(false);
  const [modalParticipantesVisible, setModalParticipantesVisible] = useState(false);

  const [esCompartido, setEsCompartido] = useState(false);
  const [esDivisionIgualitaria, setEsDivisionIgualitaria] = useState(true);
  const [idsParticipantesSeleccionados, setIdsParticipantesSeleccionados] = useState([]);
  const [montosPersonalizados, setMontosPersonalizados] = useState({}); // { idParticipante: "monto" }

  const [fecha, setFecha] = useState(new Date());
  const [mostrarFecha, setMostrarFecha] = useState(false);

  const [errores, setErrores] = useState({});

  function fechaFormato(dateObj = fecha) {
    return dateObj.toISOString().split("T")[0];
  }

  const categoriaSeleccionada = categorias.find((c) => c.IdCategoria === idCategoria);
  const pagadorSeleccionado = participantes.find((p) => p.IdParticipanteViaje === idPagador);

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
      Alert.alert(
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
    setIdCategoria(null);
    setIdPagador(null);
    setEsCompartido(false);
    setEsDivisionIgualitaria(true);
    setIdsParticipantesSeleccionados([]);
    setMontosPersonalizados({});
    setFecha(new Date());
    setErrores({});

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
      } catch (error) {
        console.log("📡 API caída o modo avión detectado. Buscando respaldo local en SQLite...");

        const catsLocal = obtenerCategoriasCache();
        const partsLocal = obtenerParticipantesCache(IdViaje);

        if (catsLocal.length > 0 && partsLocal.length > 0) {
          setCategorias(catsLocal);
          setParticipantes(partsLocal);
          console.log("Formulario cargado con datos de respaldo local exitosamente.");
        } else {
          Alert.alert("Sin conexión", "No hay datos locales guardados para este viaje todavía.");
          onClose();
        }
      } finally {
        setLoading(false);
      }
    }
    cargarDatos();
  }, [IdViaje, visible]);

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

  async function handleGuardar() {
    let nuevosErrores = {};

    if (!nombre.trim()) {
      nuevosErrores.nombre = "El concepto es obligatorio";
    }

    if (!monto) {
      nuevosErrores.monto = "El monto es obligatorio";
    } else if (Number(monto) <= 0) {
      nuevosErrores.monto = "El monto debe ser mayor a cero";
    }

    if (!idCategoria) {
      nuevosErrores.categoria = "Seleccioná una categoría";
    }

    if (esCompartido && !idPagador) {
      nuevosErrores.pagador = "Seleccioná quién pagó";
    }

    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    if (fecha > hoy) {
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
        } else if (Math.abs(sumaMontos - Number(monto)) > 0.01) {
          nuevosErrores.divisionPersonalizada = `La suma de los montos individuales debe ser igual al monto total (${monto} ${monedaBase})`;
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
        Monto: Number(monto),
        IdCategoria: idCategoria,
        IdPagador: esCompartido ? idPagador : null,
        FechaGasto: fechaFormato(),
        DividirEntreTodos: esCompartido
          ? esDivisionIgualitaria && idsParticipantesSeleccionados.length === participantes.length
          : false,
        IdParticipantes: esCompartido ? idsParticipantesSeleccionados : [],
        EsCompartido: esCompartido,
        TipoDivision: esCompartido ? (esDivisionIgualitaria ? "igualitaria" : "personalizada") : null,
        DetalleMontosPersonalizados:
          !esDivisionIgualitaria && esCompartido ? detalleMontosPersonalizados : [],
      };

      try {
        await createExpense(nuevoGasto);
        Alert.alert("Éxito", "Gasto registrado correctamente en el servidor.");
        onGastoCreado?.();
        onClose();
      } catch (apiError) {
        console.log("ERROR createExpense:", apiError);
        console.log("⚠️ Sin conexión. Guardando gasto localmente...");
        const guardadoConExito = guardarGastoOffline(nuevoGasto);

        if (guardadoConExito) {
          Alert.alert(
            "Modo Offline",
            "El gasto quedó guardado localmente. Se sincronizará cuando vuelva la conexión.",
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
          throw new Error("No se pudo guardar el gasto offline");
        }
      }
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.headerRow}>
                <Text style={styles.title}>Nuevo gasto</Text>
                <TouchableOpacity onPress={onClose}>
                  <FontAwesome6 name="xmark" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {loading ? (
                <View style={styles.center}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : (
                <View style={styles.content}>

                  <Text style={styles.label}>Concepto</Text>
                  <View style={styles.inputBox}>
                    <FontAwesome6 name="pen" size={14} color={colors.textMuted} />
                    <TextInput
                      style={styles.input}
                      placeholder="Cena"
                      placeholderTextColor={colors.textMuted}
                      value={nombre}
                      onChangeText={setNombre}
                    />
                  </View>
                  {errores.nombre && <Text style={styles.error}>{errores.nombre}</Text>}

                  <Text style={styles.label}>Monto</Text>
                  <View style={styles.inputBox}>
                    <Text style={styles.currencyCodePrefix}>{monedaBase.toUpperCase()}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      value={monto}
                      onChangeText={setMonto}
                    />
                  </View>
                  {errores.monto && <Text style={styles.error}>{errores.monto}</Text>}

                  <Text style={styles.label}>Fecha</Text>
                  {Platform.OS === "web" ? (
                    <View style={styles.dateBox}>
                      <input
                        type="date"
                        value={fechaFormato()}
                        max={fechaFormato(new Date())}
                        onChange={(e) => {
                          const p = e.target.value.split("-");
                          const nuevaFecha = new Date(p[0], p[1] - 1, p[2]);
                          const limiteHoy = new Date();
                          limiteHoy.setHours(23, 59, 59, 999);

                          if (nuevaFecha > limiteHoy) {
                            Alert.alert("Fecha inválida", "No podés registrar un gasto en una fecha futura.");
                            setFecha(new Date());
                          } else {
                            setFecha(nuevaFecha);
                          }
                        }}
                        style={{ border: "none", width: "100%", outline: "none" }}
                      />
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity style={styles.dateBox} onPress={() => setMostrarFecha(true)}>
                        <FontAwesome6 name="calendar" size={15} color={colors.primary} />
                        <Text>{fechaFormato()}</Text>
                      </TouchableOpacity>

                      {mostrarFecha && (
                        <DateTimePicker
                          value={fecha}
                          mode="date"
                          maximumDate={new Date()}
                          onChange={(e, date) => {
                            setMostrarFecha(false);
                            if (date) {
                              const limiteHoy = new Date();
                              limiteHoy.setHours(23, 59, 59, 999);

                              if (date > limiteHoy) {
                                Alert.alert(
                                  "Fecha inválida",
                                  "No podés registrar un gasto en una fecha futura."
                                );
                                setFecha(new Date());
                              } else {
                                setFecha(date);
                              }
                            }
                          }}
                        />
                      )}
                    </>
                  )}
                  {errores.fecha && <Text style={styles.error}>{errores.fecha}</Text>}

                  <Text style={styles.label}>Categoría</Text>
                  <TouchableOpacity style={styles.dropdownButton} onPress={() => setModalCategoriaVisible(true)}>
                    <View style={styles.dropdownLeftContent}>
                      <FontAwesome6
                        name={categoriaSeleccionada ? ICONOS_CATEGORIAS[categoriaSeleccionada.Nombre] || "tags" : "tags"}
                        size={14}
                        color={categoriaSeleccionada ? colors.primary : colors.textMuted}
                        style={{ marginRight: 10, width: 20, textAlign: "center" }}
                      />
                      <Text style={idCategoria ? styles.dropdownText : styles.dropdownPlaceholder}>
                        {categoriaSeleccionada ? categoriaSeleccionada.Nombre : "Seleccioná una categoría"}
                      </Text>
                    </View>
                    <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                  {errores.categoria && <Text style={styles.error}>{errores.categoria}</Text>}

                  <Text style={styles.label}>Tipo de Gasto</Text>
                  <View style={styles.selectorContainer}>
                    <TouchableOpacity
                      style={[styles.selectorOption, !esCompartido && styles.selectorOptionActive]}
                      onPress={() => setEsCompartido(false)}
                    >
                      <FontAwesome6 name="user" size={14} color={!esCompartido ? "#fff" : colors.overlayStrong} />
                      <Text style={[styles.selectorOptionText, !esCompartido && styles.selectorOptionTextActive]}>
                        Personal
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.selectorOption, esCompartido && styles.selectorOptionActive]}
                      onPress={() => setEsCompartido(true)}
                    >
                      <FontAwesome6 name="users" size={14} color={esCompartido ? "#fff" : colors.overlayStrong} />
                      <Text style={[styles.selectorOptionText, esCompartido && styles.selectorOptionTextActive]}>
                        Compartido
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {esCompartido && (
                    <>
                      <Text style={styles.label}>¿Quién pagó?</Text>

                      <TouchableOpacity style={styles.dropdownButton} onPress={() => setModalPagadorVisible(true)}>
                        <View style={styles.dropdownLeftContent}>
                          <FontAwesome6
                            name="user"
                            size={14}
                            color={colors.textMuted}
                            style={{ marginRight: 10 }}
                          />

                          <Text style={idPagador ? styles.dropdownText : styles.dropdownPlaceholder}>
                            {pagadorSeleccionado
                              ? `${pagadorSeleccionado.Nombre} ${pagadorSeleccionado.Apellido} (${pagadorSeleccionado.NombreUsuario})`
                              : "Seleccioná quién pagó"}
                          </Text>
                        </View>

                        <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
                      </TouchableOpacity>

                      {errores.pagador && <Text style={styles.error}>{errores.pagador}</Text>}
                    </>
                  )}

                  {esCompartido && (
                    <View style={styles.compartidoSection}>
                      <Text style={styles.label}>¿Entre quiénes se divide?</Text>
                      <TouchableOpacity
                        style={[styles.dropdownButton, errores.participantes && { borderColor: "#dc2626", borderWidth: 1 }]}
                        onPress={() => setModalParticipantesVisible(true)}
                      >
                        <View style={styles.dropdownLeftContent}>
                          <FontAwesome6 name="users" size={14} color={colors.textMuted} style={{ marginRight: 10 }} />
                          <Text style={idsParticipantesSeleccionados.length > 0 ? styles.dropdownText : styles.dropdownPlaceholder}>
                            {idsParticipantesSeleccionados.length === participantes.length
                              ? "Dividido entre Todos"
                              : `${idsParticipantesSeleccionados.length} participantes seleccionados`}
                          </Text>
                        </View>
                        <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
                      </TouchableOpacity>
                      {errores.participantes && <Text style={styles.error}>{errores.participantes}</Text>}

                      <Text style={styles.label}>Distribución de la división</Text>
                      <View style={styles.selectorContainer}>
                        <TouchableOpacity
                          style={[styles.selectorOption, esDivisionIgualitaria && styles.selectorOptionActive]}
                          onPress={() => setEsDivisionIgualitaria(true)}
                        >
                          <Text style={[styles.selectorOptionText, esDivisionIgualitaria && styles.selectorOptionTextActive]}>
                            Igualitaria / Equitativa
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.selectorOption, !esDivisionIgualitaria && styles.selectorOptionActive]}
                          onPress={() => setEsDivisionIgualitaria(false)}
                        >
                          <Text style={[styles.selectorOptionText, !esDivisionIgualitaria && styles.selectorOptionTextActive]}>
                            Personalizada
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {!esDivisionIgualitaria && idsParticipantesSeleccionados.length > 0 && (
                        <View style={styles.personalizadoCard}>
                          <Text style={styles.personalizadoTitle}>
                            Asignar Montos Individuales ({monedaBase.toUpperCase()})
                          </Text>
                          {participantes
                            .filter((p) => idsParticipantesSeleccionados.includes(p.IdParticipanteViaje))
                            .map((p) => (
                              <View key={p.IdParticipanteViaje} style={styles.personalizadoRow}>
                                <Text style={styles.personalizadoNombre}>
                                  {p.Nombre} {p.Apellido}
                                </Text>
                                <TextInput
                                  style={styles.personalizadoInput}
                                  placeholder="0"
                                  placeholderTextColor={colors.textMuted}
                                  keyboardType="numeric"
                                  value={montosPersonalizados[p.IdParticipanteViaje] || ""}
                                  onChangeText={(val) => handleMontoPersonalizadoChange(p.IdParticipanteViaje, val)}
                                />
                              </View>
                            ))}
                          {errores.divisionPersonalizada && (
                            <Text style={styles.error}>{errores.divisionPersonalizada}</Text>
                          )}
                        </View>
                      )}
                    </View>
                  )}

                  <TouchableOpacity style={styles.button} onPress={handleGuardar} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Registrar gasto</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={modalCategoriaVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
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
                    style={[styles.modalItem, esActivo && styles.modalItemActive,esElUltimo && { borderBottomWidth: 0 }]}
                    onPress={() => {
                      setIdCategoria(item.IdCategoria);
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
          </View>
        </View>
      </Modal>

      <Modal visible={modalPagadorVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
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
          </View>
        </View>
      </Modal>

      <Modal visible={modalParticipantesVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
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

          </View>
        </View>
      </Modal>
    </>
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
    maxHeight: "90%",
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
    padding: 20,
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
  currencyCodePrefix: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontWeight: "700",
    marginRight: 6,
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
    gap: 10,
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
    color: colors.textMuted,
  },
  dropdownText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  button: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff", 
    fontWeight: "700",
    ...textStyles.body,
  },
  error: {
    color: "#dc2626",
    fontSize: 12,
    marginTop: 5,
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
  compartidoSection: {
    marginTop: 5,
    backgroundColor: "#f9fafb",
    borderRadius: radii.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContainer: {
    backgroundColor: colors.surface,
    width: "100%",
    maxHeight: "70%",
    borderRadius: radii.lg,
    padding: 20,
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
});