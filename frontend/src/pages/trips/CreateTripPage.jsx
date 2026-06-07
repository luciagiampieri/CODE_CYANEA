import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import MainLayout from "../../components/layout/MainLayout";
import StatusBadge from "../../components/ui/StatusBadge";
import TripForm from "../../components/trip/TripForm";
import { createTrip, getCurrentUser, getUsers } from "../../services/api";

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

export default function CreateTripPage() {
  const navigate = useNavigate();
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

  const selectableUsers = useMemo(() => {
    return userOptions.filter((user) => {
      if (currentUser && user.id === currentUser.id) {
        return false;
      }

      return !form.participantUserIds.includes(user.id);
    });
  }, [currentUser, form.participantUserIds, userOptions]);

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
    const timeoutId = window.setTimeout(async () => {
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

    return () => window.clearTimeout(timeoutId);
  }, [participantSearch]);

  function handleInputChange(event) {
    const { name, value } = event.target;
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

  async function handleSubmit(event) {
    event.preventDefault();
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
      navigate("/");
    } catch (error) {
      if (error.message === "No se pudo crear el viaje") {
        setApiStatus("sin-conexion");
      }
      setSubmitStatus("error");
      setSubmitMessage(error.message);
    }
  }

  return (
    <MainLayout
      header={{
        variant: "detail",
        backTo: "/",
        title: "Nuevo Viaje",
        subtitle: "Crea el viaje y arma el grupo desde una sola pantalla."
      }}
      shellClassName="mobile-app--form"
    >
      <div className="responsive-page responsive-page--form responsive-page--single">
        <section className="content-section content-section--hero">
          <div className="hero-card hero-card--compact">
            <div className="hero-card__copy">
              <span className="eyebrow">Nuevo Viaje</span>
              <h2>Arma el viaje y el grupo desde una sola pantalla.</h2>
              <p>
                El administrador es el creador. Puedes sumar participantes registrados e invitados
                externos sin cambiar de vista.
              </p>
            </div>

            <div className="inline-status">
              <StatusBadge tone={apiStatus}>API {apiStatus.replace("-", " ")}</StatusBadge>
              <StatusBadge tone={usersStatus}>Usuarios {usersStatus.replace("-", " ")}</StatusBadge>
            </div>
          </div>
        </section>

        <section className="content-section">
          <TripForm
            canInviteExternal={canInviteExternal}
            currentUser={currentUser}
            form={form}
            inviteMessage={inviteMessage}
            onCancel={() => navigate("/")}
            onInputChange={handleInputChange}
            onInviteExternal={addExternalInvite}
            onParticipantSearchChange={handleParticipantSearchChange}
            onRemoveParticipant={removeParticipant}
            onSelectParticipant={addParticipant}
            onSubmit={handleSubmit}
            participantItems={participantItems}
            participantSearch={participantSearch}
            selectableUsers={selectableUsers}
            submitMessage={submitMessage}
            submitStatus={submitStatus}
          />
        </section>
      </div>
    </MainLayout>
  );
}
