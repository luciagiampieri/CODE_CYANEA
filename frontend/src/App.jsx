import { useEffect, useMemo, useState } from "react";

import { createTrip, getCurrentUser, getTrips, getUsers } from "./services/api";

const painPoints = [
  {
    title: "Chats interminables",
    text: "La informacion importante se pierde entre mensajes, audios y links sueltos."
  },
  {
    title: "Gastos confusos",
    text: "Nadie sabe bien quien pago, cuanto falta o como cerrar cuentas sin discusiones."
  },
  {
    title: "Decisiones dispersas",
    text: "Elegir horarios, actividades o lugares se vuelve lento cuando todo pasa por el chat."
  },
  {
    title: "Archivos desordenados",
    text: "Pasajes, seguros, reservas y contactos quedan repartidos entre muchas apps."
  }
];

const solutionCards = [
  {
    title: "Itinerario compartido",
    text: "Actividades, traslados y eventos organizados por dia y hora en un mismo cronograma."
  },
  {
    title: "Gastos y balances",
    text: "Registren gastos, repartan montos y sigan el saldo de cada participante."
  },
  {
    title: "Votaciones del grupo",
    text: "Propongan opciones y consoliden decisiones sin perder contexto."
  },
  {
    title: "Documentos y tareas",
    text: "Guarden archivos, enlaces y checklists dentro del espacio del viaje."
  }
];

const workflowSteps = [
  {
    step: "01",
    title: "Crea el viaje",
    text: "Defini destino, fechas y configuraciones generales desde un unico espacio."
  },
  {
    step: "02",
    title: "Invita al grupo",
    text: "Cada participante accede al mismo tablero compartido con permisos claros."
  },
  {
    step: "03",
    title: "Coordinen juntos",
    text: "Actualicen itinerario, gastos, tareas y documentos en tiempo real."
  }
];

const capabilityCards = [
  "Agenda diaria con actividades y traslados",
  "Mapa y puntos de interes del viaje",
  "Saldo por participante y resumen grupal",
  "Checklist previo a salir",
  "Votacion abierta con cierre definido",
  "Repositorio de documentos y enlaces"
];

const trustPoints = [
  "Todo queda asociado a un viaje concreto.",
  "Solo los participantes autorizados ven la informacion compartida.",
  "Los cambios relevantes impactan para todo el grupo.",
  "La informacion sincronizada sigue disponible para consulta cuando hace falta."
];

const sampleTimeline = [
  { time: "08:30", title: "Salida a terminal", meta: "Traslado grupal" },
  { time: "12:00", title: "Check-in alojamiento", meta: "Confirmado por admin" },
  { time: "15:30", title: "Votacion: excursion", meta: "8 participantes" }
];

const sampleBalances = [
  { name: "Lucia", detail: "Pago alojamiento", amount: "+ ARS 48.000" },
  { name: "Fatima", detail: "Debe al grupo", amount: "- ARS 12.500" },
  { name: "Ticiana", detail: "Saldo equilibrado", amount: "OK" }
];

const sampleTasks = [
  "Cargar comprobantes del alojamiento",
  "Definir traslado al aeropuerto",
  "Cerrar votacion de actividad del sabado"
];

const initialForm = {
  title: "",
  destination: "",
  description: "",
  startDate: "",
  endDate: "",
  currency: "ARS",
  participantUserIds: []
};

export default function App() {
  const [screen, setScreen] = useState("home");
  const [trips, setTrips] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [userOptions, setUserOptions] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [participantSearch, setParticipantSearch] = useState("");
  const [apiStatus, setApiStatus] = useState("cargando");
  const [usersStatus, setUsersStatus] = useState("cargando");
  const [form, setForm] = useState(initialForm);
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  const availableUserOptions = useMemo(() => {
    return userOptions.filter((user) => {
      if (currentUser && user.id === currentUser.id) {
        return false;
      }
      return !form.participantUserIds.includes(user.id);
    });
  }, [currentUser, form.participantUserIds, userOptions]);

  async function loadTrips() {
    try {
      const data = await getTrips();
      setTrips(data);
      setApiStatus("conectada");
    } catch {
      setApiStatus("sin conexion");
    }
  }

  async function loadCurrentUser() {
    try {
      const me = await getCurrentUser();
      setCurrentUser(me);
      setUsersStatus("conectada");
    } catch {
      setUsersStatus("sin conexion");
    }
  }

  async function loadUserOptions(search = "") {
    try {
      const users = await getUsers(search, 8);
      setUserOptions(users);
      setUsersStatus("conectada");
    } catch {
      setUsersStatus("sin conexion");
    }
  }

  useEffect(() => {
    loadTrips();
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (screen !== "createTrip") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      loadUserOptions(participantSearch);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [participantSearch, screen]);

  function openCreateTrip() {
    setScreen("createTrip");
    setParticipantSearch("");
    setSelectedParticipants([]);
    setForm(initialForm);
    setSubmitStatus("idle");
    setSubmitMessage("");
    setUserOptions([]);
  }

  function goHome() {
    setScreen("home");
  }

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
  }

  function removeParticipant(userId) {
    setSelectedParticipants((current) => current.filter((user) => user.id !== userId));
    setForm((current) => ({
      ...current,
      participantUserIds: current.participantUserIds.filter((id) => id !== userId)
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitStatus("submitting");
    setSubmitMessage("");

    try {
      await createTrip({
        ...form,
        participantUserIds: form.participantUserIds.map(Number)
      });

      await loadTrips();
      setForm(initialForm);
      setSelectedParticipants([]);
      setParticipantSearch("");
      setUserOptions([]);
      setSubmitStatus("success");
      setSubmitMessage("Viaje creado correctamente.");
      setScreen("home");
    } catch (error) {
      setSubmitStatus("error");
      setSubmitMessage(error.message);
    }
  }

  if (screen === "createTrip") {
    return (
      <div className="page-shell">
        <header className="site-header">
          <div className="brand-mark">
            <span className="brand-mark__icon" />
            <span className="brand-mark__text">Cyanea</span>
          </div>

          <button className="button button--ghost" type="button" onClick={goHome}>
            Volver a inicio
          </button>
        </header>

        <main className="app-shell app-shell--form">
          <section className="form-hero">
            <div className="section-heading">
              <p className="eyebrow">Nuevo viaje</p>
              <h1 className="page-title">Crea un viaje e incorpora participantes registrados.</h1>
              <p className="section-lead">
                El administrador es el usuario creador. Busca personas por nombre, usuario o
                email y agregalas a la lista del viaje.
              </p>
            </div>
            <div className="status-row">
              <span className={`status-pill status-${apiStatus.replace(" ", "-")}`}>
                API {apiStatus}
              </span>
              <span className={`status-pill status-${usersStatus.replace(" ", "-")}`}>
                Usuarios {usersStatus}
              </span>
            </div>
          </section>

          <section className="trip-form-shell">
            <form className="trip-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="field">
                  <span>Titulo</span>
                  <input
                    name="title"
                    value={form.title}
                    onChange={handleInputChange}
                    placeholder="Escapada a Cordoba"
                    required
                  />
                </label>

                <label className="field">
                  <span>Destino</span>
                  <input
                    name="destination"
                    value={form.destination}
                    onChange={handleInputChange}
                    placeholder="Cordoba"
                    required
                  />
                </label>

                <label className="field field--full">
                  <span>Descripcion</span>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleInputChange}
                    rows="4"
                    placeholder="Resumen del viaje, objetivos o notas iniciales."
                  />
                </label>

                <label className="field">
                  <span>Fecha inicio</span>
                  <input
                    type="date"
                    name="startDate"
                    value={form.startDate}
                    onChange={handleInputChange}
                  />
                </label>

                <label className="field">
                  <span>Fecha fin</span>
                  <input
                    type="date"
                    name="endDate"
                    value={form.endDate}
                    onChange={handleInputChange}
                  />
                </label>

                <label className="field">
                  <span>Moneda</span>
                  <input
                    name="currency"
                    value={form.currency}
                    onChange={handleInputChange}
                    maxLength="3"
                    required
                  />
                </label>

                <div className="field">
                  <span>Creador / Administrador</span>
                  <div className="field-readonly">
                    {currentUser ? (
                      <>
                        <strong>{currentUser.nombreCompleto}</strong>
                        <small>
                          @{currentUser.nombreUsuario} - {currentUser.email}
                        </small>
                      </>
                    ) : (
                      <small>No se pudo resolver el usuario actual.</small>
                    )}
                  </div>
                </div>
              </div>

              <div className="participant-box">
                <div className="participant-box__header">
                  <h2>Participantes registrados</h2>
                  <p>Busca usuarios existentes y agregalos a una lista compacta.</p>
                </div>

                <div className="participant-picker">
                  <label className="field field--full">
                    <span>Buscar participante</span>
                    <input
                      name="participantSearch"
                      value={participantSearch}
                      onChange={(event) => setParticipantSearch(event.target.value)}
                      placeholder="Escribe un nombre, usuario o email"
                      autoComplete="off"
                    />
                  </label>

                  <div className="participant-results">
                    {availableUserOptions.length === 0 ? (
                      <p className="trip-preview__empty">
                        {participantSearch.trim()
                          ? "No hay coincidencias para esa busqueda."
                          : "No hay sugerencias disponibles por el momento."}
                      </p>
                    ) : (
                      availableUserOptions.map((user) => (
                        <button
                          className="participant-result"
                          key={user.id}
                          type="button"
                          onClick={() => addParticipant(user)}
                        >
                          <div>
                            <strong>{user.nombreCompleto}</strong>
                            <small>
                              @{user.nombreUsuario} - {user.email}
                            </small>
                          </div>
                          <span>Agregar</span>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="participant-selected">
                    <div className="participant-selected__header">
                      <h3>Lista del viaje</h3>
                      <small>{selectedParticipants.length} seleccionados</small>
                    </div>

                    {selectedParticipants.length === 0 ? (
                      <p className="trip-preview__empty">
                        Todavia no agregaste participantes al viaje.
                      </p>
                    ) : (
                      <div className="participant-chip-list">
                        {selectedParticipants.map((user) => (
                          <div className="participant-chip" key={user.id}>
                            <div>
                              <strong>{user.nombreCompleto}</strong>
                              <small>{user.email}</small>
                            </div>
                            <button type="button" onClick={() => removeParticipant(user.id)}>
                              Quitar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {submitMessage ? (
                <p className={`form-message form-message--${submitStatus}`}>{submitMessage}</p>
              ) : null}

              <div className="form-actions">
                <button className="button button--primary" type="submit" disabled={!currentUser}>
                  {submitStatus === "submitting" ? "Creando..." : "Guardar viaje"}
                </button>
                <button className="button button--secondary" type="button" onClick={goHome}>
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="brand-mark">
          <span className="brand-mark__icon" />
          <span className="brand-mark__text">Cyanea</span>
        </div>

        <nav className="site-nav" aria-label="Principal">
          <a href="#problema">Problema</a>
          <a href="#solucion">Solucion</a>
          <a href="#modulos">Modulos</a>
          <a href="#empezar">Empezar</a>
        </nav>

        <button className="button button--ghost" type="button" onClick={openCreateTrip}>
          Crear viaje
        </button>
      </header>

      <main className="app-shell">
        <section className="hero-section">
          <div className="hero-copy hero-copy--home">
            <p className="eyebrow">Muchas manos, un unico destino</p>
            <h1>Organicen el viaje. No el caos.</h1>
            <p className="lead lead--hero">
              Cyanea centraliza itinerario, gastos, votaciones, tareas y documentos para
              que el grupo viaje con menos friccion y mas claridad.
            </p>

            <div className="cta-row">
              <button className="button button--primary" type="button" onClick={openCreateTrip}>
                Crear viaje
              </button>
              <a className="button button--secondary" href="#solucion">
                Ver como funciona
              </a>
            </div>

            <div className="status-row">
              <span className={`status-pill status-${apiStatus.replace(" ", "-")}`}>
                API {apiStatus}
              </span>
              <span className="status-pill status-note">
                Web y mobile con un espacio colaborativo por viaje
              </span>
            </div>
          </div>

          <div className="hero-stage">
            <div className="dashboard-card dashboard-card--primary">
              <div className="dashboard-card__header">
                <span className="dashboard-label">Viaje activo</span>
                <strong>Escapada a Cordoba</strong>
              </div>

              <div className="dashboard-grid">
                <article className="dashboard-panel">
                  <h2>Itinerario del dia</h2>
                  <ul className="timeline-list">
                    {sampleTimeline.map((item) => (
                      <li key={item.time}>
                        <span>{item.time}</span>
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.meta}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="dashboard-panel dashboard-panel--accent">
                  <h2>Saldo del grupo</h2>
                  <ul className="balance-list">
                    {sampleBalances.map((item) => (
                      <li key={item.name}>
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.detail}</small>
                        </div>
                        <span>{item.amount}</span>
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="dashboard-panel dashboard-panel--compact">
                  <h2>Votacion abierta</h2>
                  <p>Sabado por la tarde</p>
                  <div className="vote-bar">
                    <span style={{ width: "62%" }} />
                  </div>
                  <small>City tour lidera con 62%</small>
                </article>

                <article className="dashboard-panel dashboard-panel--compact">
                  <h2>Checklist</h2>
                  <ul className="task-list">
                    {sampleTasks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="section-block" id="problema">
          <div className="section-heading">
            <p className="eyebrow">Problema real</p>
            <h2>Viajar en grupo suele romperse por lo mismo.</h2>
            <p className="section-lead">
              El problema no es el destino. Es la desorganizacion entre personas, decisiones,
              gastos e informacion repartida.
            </p>
          </div>

          <div className="grid grid--four">
            {painPoints.map((item) => (
              <article className="card card--feature" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section-block section-block--highlight" id="solucion">
          <div className="section-heading">
            <p className="eyebrow">Solucion</p>
            <h2>Cyanea reune todo el viaje en un solo lugar.</h2>
            <p className="section-lead">
              Cada viaje tiene su propio espacio colaborativo para coordinar al grupo sin
              depender de cinco herramientas distintas.
            </p>
          </div>

          <div className="grid grid--solution">
            {solutionCards.map((item, index) => (
              <article
                className={`card card--solution ${index === 1 ? "card--solution-accent" : ""}`}
                key={item.title}
              >
                <span className="card-kicker">Modulo {index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <p className="eyebrow">Como funciona</p>
            <h2>Un espacio colaborativo para cada viaje.</h2>
          </div>

          <div className="workflow-grid">
            {workflowSteps.map((item) => (
              <article className="workflow-step" key={item.step}>
                <span className="workflow-step__index">{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section-block" id="modulos">
          <div className="section-heading">
            <p className="eyebrow">Modulos clave</p>
            <h2>Disenado para el alcance real del viaje.</h2>
            <p className="section-lead">
              Cyanea no intenta vender pasajes ni procesar pagos: organiza el viaje y la
              coordinacion del grupo.
            </p>
          </div>

          <div className="modules-layout">
            <article className="modules-overview">
              <h3>Todo queda asociado a un viaje concreto</h3>
              <p>
                Itinerarios, documentos, gastos, votaciones y tareas viven dentro del mismo
                contexto compartido.
              </p>

              <ul className="trust-list">
                {trustPoints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <div className="trip-preview">
                <span className="trip-preview__tag">Vista resumen</span>
                {trips.length === 0 ? (
                  <p className="trip-preview__empty">No hay viajes cargados todavia.</p>
                ) : (
                  <ul className="trip-list">
                    {trips.map((trip) => (
                      <li key={trip.id}>
                        <strong>{trip.title}</strong>
                        <span>{trip.destination}</span>
                        <small>
                          {trip.status} - {trip.currency}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>

            <div className="modules-grid">
              {capabilityCards.map((item) => (
                <article className="module-tile" key={item}>
                  <span className="module-tile__dot" />
                  <p>{item}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section-block section-block--cta" id="empezar">
          <div className="cta-panel">
            <div>
              <p className="eyebrow">Empezar</p>
              <h2>Empiecen a planear el proximo viaje con claridad compartida.</h2>
              <p className="section-lead">
                Menos mensajes perdidos, menos cuentas confusas y mas tiempo para disfrutar el
                viaje.
              </p>
            </div>

            <div className="cta-row">
              <button className="button button--primary" type="button" onClick={openCreateTrip}>
                Crear primer viaje
              </button>
              <a className="button button--secondary button--secondary-light" href="#solucion">
                Explorar funcionalidades
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
