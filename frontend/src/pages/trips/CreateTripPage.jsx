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

export default function CreateTripPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [userOptions, setUserOptions] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [participantSearch, setParticipantSearch] = useState("");
  const [externalInviteInput, setExternalInviteInput] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [apiStatus, setApiStatus] = useState("conectada");
  const [usersStatus, setUsersStatus] = useState("cargando");
  const [form, setForm] = useState(initialForm);
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  const selectableUsers = useMemo(() => {
    return userOptions.filter((user) => {
      if (currentUser && user.id === currentUser.id) {
        return false;
      }
      return !form.participantUserIds.includes(user.id);
    });
  }, [currentUser, form.participantUserIds, userOptions]);

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

  function removeParticipant(userId) {
    setSelectedParticipants((current) => current.filter((user) => user.id !== userId));
    setForm((current) => ({
      ...current,
      participantUserIds: current.participantUserIds.filter((id) => id !== userId)
    }));
  }

  function addExternalInvite() {
    const email = externalInviteInput.trim().toLowerCase();
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
    setExternalInviteInput("");
    setInviteMessage("");
  }

  function removeExternalInvite(email) {
    setForm((current) => ({
      ...current,
      invitedEmails: current.invitedEmails.filter((item) => item !== email)
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
        action: { kind: "link", label: "Volver a inicio", to: "/", variant: "ghost" }
      }}
      shellClassName="app-shell--form"
    >
      <section className="form-hero">
        <div className="section-heading">
          <p className="eyebrow">Nuevo viaje</p>
          <h1 className="page-title">Crea un viaje e incorpora participantes registrados.</h1>
          <p className="section-lead">
            El administrador es el usuario creador. Busca personas por nombre, usuario o email y
            agrega correos externos si todavia no tienen cuenta.
          </p>
        </div>
        <div className="status-row">
          <StatusBadge tone={apiStatus}>API {apiStatus.replace("-", " ")}</StatusBadge>
          <StatusBadge tone={usersStatus}>Usuarios {usersStatus.replace("-", " ")}</StatusBadge>
        </div>
      </section>

      <section className="trip-form-shell">
        <TripForm
          currentUser={currentUser}
          externalInviteInput={externalInviteInput}
          form={form}
          inviteMessage={inviteMessage}
          onAddExternalInvite={addExternalInvite}
          onCancel={() => navigate("/")}
          onExternalInviteChange={setExternalInviteInput}
          onInputChange={handleInputChange}
          onParticipantSearchChange={setParticipantSearch}
          onRemoveExternalInvite={removeExternalInvite}
          onRemoveParticipant={removeParticipant}
          onSelectParticipant={addParticipant}
          onSubmit={handleSubmit}
          participantSearch={participantSearch}
          selectableUsers={selectableUsers}
          selectedParticipants={selectedParticipants}
          submitMessage={submitMessage}
          submitStatus={submitStatus}
        />
      </section>
    </MainLayout>
  );
}
