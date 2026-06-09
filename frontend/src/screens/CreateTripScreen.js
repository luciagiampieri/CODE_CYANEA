import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import ParticipantList from "../components/trip/ParticipantList";
import ParticipantSearch from "../components/trip/ParticipantSearch";
import PrimaryButton from "../components/ui/PrimaryButton";
import StatusPill from "../components/ui/StatusPill";
import useResponsive from "../hooks/useResponsive";
import { createTrip, getCurrentUser, getUsers } from "../services/api.js";
import { colors, radii, spacing, typography, shadows } from "../theme/tokens";

const initialForm = {
  title: "",
  destination: "",
  description: "",
  startDate: "",
  endDate: "",
  currency: "ARS",
  participantUserIds: [],
  invitedEmails: []
};

function isValidEmail(email) {
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function getEmailLabel(email) {
  return email.split("@")[0].replace(/[._-]+/g, " ");
}

export default function CreateTripScreen({ navigation }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userOptions, setUserOptions] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [participantSearch, setParticipantSearch] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [apiStatus, setApiStatus] = useState("conectada");
  const [usersStatus, setUsersStatus] = useState("cargando");
  const [form, setForm] = useState(initialForm);
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const normalizedSearch = participantSearch.trim().toLowerCase();
  const { isDesktop } = useResponsive();

  const selectableUsers = useMemo(
    () =>
      userOptions.filter((user) => {
        if (currentUser && user.id === currentUser.id) {
          return false;
        }

        return !form.participantUserIds.includes(user.id);
      }),
    [currentUser, form.participantUserIds, userOptions]
  );

  const canInviteExternal = useMemo(() => {
    if (!isValidEmail(normalizedSearch)) {
      return false;
    }
    if (currentUser && currentUser.email.toLowerCase() === normalizedSearch) {
      return false;
    }
    if (selectedParticipants.some((user) => user.email.toLowerCase() === normalizedSearch)) {
      return false;
    }
    if (form.invitedEmails.includes(normalizedSearch)) {
      return false;
    }

    return !selectableUsers.some((user) => user.email.toLowerCase() === normalizedSearch);
  }, [currentUser, form.invitedEmails, normalizedSearch, selectableUsers, selectedParticipants]);

  const participantItems = useMemo(() => {
    const registered = selectedParticipants.map((user) => ({
      key: `user-${user.id}`,
      kind: "registered",
      id: user.id,
      nombreCompleto: user.nombreCompleto,
      email: user.email,
      fotoUrl: user.fotoUrl ?? ""
    }));

    const invited = form.invitedEmails.map((email) => ({
      key: `external-${email}`,
      kind: "external",
      email,
      nombreCompleto: getEmailLabel(email),
      fotoUrl: ""
    }));

    return [...registered, ...invited];
  }, [form.invitedEmails, selectedParticipants]);

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const me = await getCurrentUser();
        setCurrentUser(me);
        setUsersStatus("conectada");
      } catch {
        setUsersStatus("sin-conexion");
      }
    }

    loadCurrentUser();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (!participantSearch.trim()) {
        setUserOptions([]);
        return;
      }

      try {
        const users = await getUsers(participantSearch, 8);
        setUserOptions(users);
        setUsersStatus("conectada");
      } catch {
        setUserOptions([]);
        setUsersStatus("sin-conexion");
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [participantSearch]);

  function handleInputChange(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleParticipantSearchChange(value) {
    setParticipantSearch(value);
    setInviteMessage("");
  }

  function addParticipant(user) {
    if (form.participantUserIds.includes(user.id)) {
      return;
    }

    setSelectedParticipants((current) => [...current, user]);
    setForm((current) => ({
      ...current,
      participantUserIds: [...current.participantUserIds, user.id]
    }));
    setParticipantSearch("");
    setUserOptions([]);
    setInviteMessage("");
  }

  function addExternalInvite() {
    const email = normalizedSearch;
    if (!email) {
      return;
    }
    if (!isValidEmail(email)) {
      setInviteMessage("El correo ingresado no tiene un formato valido.");
      return;
    }
    if (currentUser && currentUser.email.toLowerCase() === email) {
      setInviteMessage("No puedes invitar al creador del viaje como invitado externo.");
      return;
    }
    if (selectedParticipants.some((user) => user.email.toLowerCase() === email)) {
      setInviteMessage("Ese correo ya corresponde a un participante registrado seleccionado.");
      return;
    }
    if (form.invitedEmails.includes(email)) {
      setInviteMessage("Ese correo ya fue agregado como invitado externo.");
      return;
    }

    setForm((current) => ({
      ...current,
      invitedEmails: [...current.invitedEmails, email]
    }));
    setParticipantSearch("");
    setUserOptions([]);
    setInviteMessage("");
  }

  function removeParticipant(participant) {
    if (participant.kind === "external") {
      setForm((current) => ({
        ...current,
        invitedEmails: current.invitedEmails.filter((item) => item !== participant.email)
      }));
      return;
    }

    setSelectedParticipants((current) => current.filter((user) => user.id !== participant.id));
    setForm((current) => ({
      ...current,
      participantUserIds: current.participantUserIds.filter((id) => id !== participant.id)
    }));
  }

  async function handleSubmit() {
    setSubmitStatus("submitting");
    setSubmitMessage("");

    try {
      await createTrip({
        ...form,
        participantUserIds: form.participantUserIds.map(Number),
        invitedEmails: form.invitedEmails
      });
      setSubmitStatus("success");
      setSubmitMessage("Viaje creado correctamente.");
      navigation.navigate("Tabs", { screen: "Viajes" });
    } catch (error) {
      if (error.message === "No se pudo crear el viaje") {
        setApiStatus("sin-conexion");
      }
      setSubmitStatus("error");
      setSubmitMessage(error.message);
    }
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Nuevo Viaje</Text>
          <Text style={styles.heroTitle}>Arma el viaje y el grupo desde una sola pantalla.</Text>
          <Text style={styles.heroCopy}>
            El administrador es el creador. Puedes sumar participantes registrados e invitados
            externos sin salir del flujo.
          </Text>

          <View style={styles.heroStatus}>
            <StatusPill tone={apiStatus}>API {apiStatus.replace("-", " ")}</StatusPill>
            <StatusPill tone={usersStatus}>Usuarios {usersStatus.replace("-", " ")}</StatusPill>
          </View>
        </View>

        <View style={[styles.contentLayout, isDesktop && styles.contentLayoutDesktop]}>
          <View style={[styles.formColumn, isDesktop && styles.formColumnDesktop]}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Informacion del viaje</Text>
              <View style={styles.row}>
                <Field
                  label="Titulo"
                  name="title"
                  onChange={handleInputChange}
                  placeholder="Escapada a Cordoba"
                  value={form.title}
                />
                <Field
                  label="Destino"
                  name="destination"
                  onChange={handleInputChange}
                  placeholder="Cordoba"
                  value={form.destination}
                />
              </View>

              <Field
                label="Descripcion"
                multiline
                name="description"
                onChange={handleInputChange}
                placeholder="Resumen del viaje, objetivos o notas iniciales."
                value={form.description}
              />

              <View style={styles.row}>
                <Field
                  label="Fecha inicio"
                  name="startDate"
                  onChange={handleInputChange}
                  placeholder="2026-06-12"
                  value={form.startDate}
                />
                <Field
                  label="Fecha fin"
                  name="endDate"
                  onChange={handleInputChange}
                  placeholder="2026-06-19"
                  value={form.endDate}
                />
              </View>

              <View style={styles.row}>
                <Field
                  label="Moneda"
                  name="currency"
                  onChange={handleInputChange}
                  placeholder="ARS"
                  value={form.currency}
                />
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Creador / Administrador</Text>
                  <View style={styles.readOnlyBox}>
                    {currentUser ? (
                      <>
                        <Text style={styles.readOnlyStrong}>{currentUser.nombreCompleto}</Text>
                        <Text style={styles.readOnlyText}>
                          @{currentUser.nombreUsuario} · {currentUser.email}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.readOnlyText}>No se pudo resolver el usuario actual.</Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.sideColumn, isDesktop && styles.sideColumnDesktop]}>
            <View style={styles.card}>
              <ParticipantSearch
                canInviteExternal={canInviteExternal}
                message={inviteMessage}
                onInviteExternal={addExternalInvite}
                onSearchChange={handleParticipantSearchChange}
                onSelectUser={addParticipant}
                search={participantSearch}
                suggestions={selectableUsers}
              />
            </View>

            <View style={styles.card}>
              <ParticipantList onRemove={removeParticipant} participants={participantItems} />
            </View>
          </View>
        </View>

        {submitMessage ? (
          <Text
            style={[
              styles.submitMessage,
              submitStatus === "error" ? styles.submitMessageError : styles.submitMessageSuccess
            ]}
          >
            {submitMessage}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <PrimaryButton
            disabled={!currentUser}
            label={submitStatus === "submitting" ? "Creando..." : "Guardar viaje"}
            loading={submitStatus === "submitting"}
            onPress={handleSubmit}
          />
          <PrimaryButton label="Cancelar" onPress={() => navigation.goBack()} variant="secondary" />
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function Field({ label, name, onChange, value, placeholder, multiline = false }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        multiline={multiline}
        onChangeText={(text) => onChange(name, text)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadows.card
  },
  heroEyebrow: {
    color: colors.primary,
    fontSize: typography.micro,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: typography.title,
    fontWeight: "900",
    marginTop: spacing.sm
  },
  heroCopy: {
    color: colors.textSecondary,
    marginTop: spacing.sm
  },
  heroStatus: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg
  },
  contentLayout: {
    gap: spacing.lg,
    marginTop: spacing.xl
  },
  contentLayoutDesktop: {
    flexDirection: "row",
    alignItems: "flex-start"
  },
  formColumn: {
    gap: spacing.lg
  },
  formColumnDesktop: {
    flex: 1.15
  },
  sideColumn: {
    gap: spacing.lg
  },
  sideColumnDesktop: {
    flex: 0.85
  },
  card: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: typography.subheading,
    fontWeight: "900"
  },
  row: {
    gap: spacing.md
  },
  field: {
    flex: 1,
    gap: 8
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontWeight: "800",
    fontSize: typography.small
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.textPrimary
  },
  inputMultiline: {
    minHeight: 110,
    textAlignVertical: "top"
  },
  readOnlyBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    minHeight: 52,
    justifyContent: "center"
  },
  readOnlyStrong: {
    color: colors.textPrimary,
    fontWeight: "800"
  },
  readOnlyText: {
    color: colors.textSecondary,
    marginTop: 2,
    fontSize: typography.micro
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.xl,
    paddingBottom: spacing.lg
  },
  submitMessage: {
    marginTop: spacing.lg,
    fontWeight: "700"
  },
  submitMessageError: {
    color: colors.danger
  },
  submitMessageSuccess: {
    color: colors.success
  }
});
