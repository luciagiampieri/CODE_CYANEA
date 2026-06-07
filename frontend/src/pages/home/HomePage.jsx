import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import MainLayout from "../../components/layout/MainLayout";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { getTrips } from "../../services/api";

const showcaseTrips = [
  {
    title: "Santorini, Grecia",
    date: "12 - 19 Jun 2025",
    image:
      "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1200&q=80"
  },
  {
    title: "Banff, Canada",
    date: "05 - 12 Jul 2025",
    image:
      "https://images.unsplash.com/photo-1508261305436-e282fd32d20a?auto=format&fit=crop&w=1200&q=80"
  },
  {
    title: "Paris, Francia",
    date: "20 - 27 Ago 2025",
    image:
      "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=80"
  },
  {
    title: "Bali, Indonesia",
    date: "10 - 18 Sep 2025",
    image:
      "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80"
  }
];

const itineraryDays = [
  { title: "Dia 1", date: "12 Jun", active: true },
  { title: "Dia 2", date: "13 Jun", active: false },
  { title: "Dia 3", date: "14 Jun", active: false },
  { title: "Dia 4", date: "15 Jun", active: false },
  { title: "Dia 5", date: "16 Jun", active: false }
];

const itineraryItems = [
  {
    time: "09:00",
    title: "Llegada a Santorini",
    place: "Aeropuerto de Santorini (JTR)",
    note: "Check-in en el hotel",
    featured: true,
    marker: "A"
  },
  {
    time: "11:00",
    title: "Hotel Check-in",
    place: "Nostos Apartments",
    note: "Firostefani, Santorini",
    marker: "H"
  },
  {
    time: "13:30",
    title: "Almuerzo",
    place: "Karma Restaurant",
    note: "Comida con vista a la caldera",
    marker: "M"
  },
  {
    time: "16:00",
    title: "Oia Village",
    place: "Explorar las calles y tiendas",
    note: "Atardecer en Oia",
    marker: "O"
  },
  {
    time: "20:00",
    title: "Cena",
    place: "1800-Floga Restaurant",
    note: "Cocina local con vista al mar",
    marker: "C"
  },
  {
    time: "22:00",
    title: "Regreso al hotel",
    place: "Descanso y preparacion",
    note: "Lista para el dia siguiente",
    marker: "R"
  }
];

const phoneNavItems = ["Viajes", "Explorar", "Itinerarios", "Guardados", "Perfil"];

export default function HomePage() {
  const [trips, setTrips] = useState([]);
  const [apiStatus, setApiStatus] = useState("cargando");

  useEffect(() => {
    async function loadTrips() {
      try {
        const data = await getTrips();
        setTrips(data);
        setApiStatus("conectada");
      } catch {
        setApiStatus("sin-conexion");
      }
    }

    loadTrips();
  }, []);

  return (
    <MainLayout
      header={{
        action: { kind: "link", label: "Nuevo viaje", to: "/viajes/nuevo", variant: "ghost" }
      }}
    >
      <section className="showcase-shell">
        <div className="showcase-intro">
          <p className="eyebrow">Preview de producto</p>
          <h1>Cyanea como experiencia mobile-first.</h1>
          <p className="lead lead--hero">
            La propuesta visual se acerca a una app real de viajes: lista de aventuras, detalle del
            viaje y un itinerario claro para consultar todo desde el mismo espacio.
          </p>
          <div className="status-row">
            <StatusBadge tone={apiStatus}>API {apiStatus.replace("-", " ")}</StatusBadge>
            <StatusBadge tone="note">PWA pensada para uso diario del grupo</StatusBadge>
          </div>
        </div>

        <div className="showcase-grid">
          <article className="phone-frame">
            <div className="phone-statusbar">
              <span>9:41</span>
              <div className="phone-statusbar__icons">
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="phone-topbar">
              <div className="phone-brand">
                <span className="phone-brand__mark" />
                <strong>CYANEA</strong>
              </div>
              <button className="phone-menu" type="button" aria-label="Abrir menu">
                <span />
                <span />
                <span />
              </button>
            </div>

            <div className="phone-body">
              <div className="trip-mobile-head">
                <div>
                  <h2>Mis Viajes</h2>
                  <p>Explora tus proximas aventuras</p>
                </div>
                <Link className="trip-mobile-head__action" to="/viajes/nuevo">
                  <span>+</span>
                  Nuevo Viaje
                </Link>
              </div>

              <div className="trip-mobile-list">
                {showcaseTrips.map((trip) => (
                  <article
                    className="trip-mobile-card"
                    key={trip.title}
                    style={{ backgroundImage: `linear-gradient(180deg, transparent 28%, rgba(6, 16, 33, 0.76) 100%), url(${trip.image})` }}
                  >
                    <div className="trip-mobile-card__content">
                      <h3>{trip.title}</h3>
                      <p>{trip.date}</p>
                    </div>
                    <span className="trip-mobile-card__arrow">&gt;</span>
                  </article>
                ))}
              </div>
            </div>

            <div className="phone-nav">
              {phoneNavItems.map((item, index) => (
                <div className={`phone-nav__item ${index === 0 ? "phone-nav__item--active" : ""}`} key={item}>
                  <span className="phone-nav__icon" />
                  <small>{item}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="phone-frame phone-frame--detail">
            <div className="phone-statusbar">
              <span>9:41</span>
              <div className="phone-statusbar__icons">
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="phone-topbar phone-topbar--detail">
              <button className="phone-icon-button" type="button" aria-label="Volver">
                {"<"}
              </button>
              <div className="phone-topbar__actions">
                <button className="phone-icon-button" type="button" aria-label="Compartir">
                  ^
                </button>
                <button className="phone-icon-button" type="button" aria-label="Opciones">
                  ...
                </button>
              </div>
            </div>

            <div className="phone-detail-hero">
              <div className="phone-detail-hero__copy">
                <h2>Santorini, Grecia</h2>
                <p>12 - 19 Jun 2025</p>
              </div>
              <div className="phone-detail-hero__image" />
            </div>

            <div className="phone-detail-tabs">
              <button type="button">Resumen</button>
              <button className="is-active" type="button">
                Itinerario
              </button>
              <button type="button">Informacion</button>
              <button type="button">Notas</button>
            </div>

            <div className="phone-detail-body">
              <div className="phone-day-strip">
                {itineraryDays.map((day) => (
                  <button
                    className={`phone-day-pill ${day.active ? "phone-day-pill--active" : ""}`}
                    key={day.title}
                    type="button"
                  >
                    <strong>{day.title}</strong>
                    <small>{day.date}</small>
                  </button>
                ))}
              </div>

              <div className="phone-agenda">
                <h3>Jueves, 12 de Junio</h3>

                <div className="phone-timeline">
                  {itineraryItems.map((item) => (
                    <article className="phone-timeline__item" key={`${item.time}-${item.title}`}>
                      <div className="phone-timeline__time">{item.time}</div>
                      <div className="phone-timeline__track">
                        <span
                          className={`phone-timeline__marker ${item.featured ? "phone-timeline__marker--active" : ""}`}
                        >
                          {item.marker}
                        </span>
                        <span className="phone-timeline__line" />
                      </div>
                      <div
                        className={`phone-timeline__card ${item.featured ? "phone-timeline__card--active" : ""}`}
                      >
                        <strong>{item.title}</strong>
                        <p>{item.place}</p>
                        <small>{item.note}</small>
                      </div>
                    </article>
                  ))}
                </div>

                <button className="phone-map-button" type="button">
                  Ver en mapa
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="showcase-live">
        <div className="showcase-live__header">
          <div>
            <p className="eyebrow">Datos reales</p>
            <h2>Estado actual del backend</h2>
          </div>
          <StatusBadge tone={apiStatus}>{trips.length} viajes cargados</StatusBadge>
        </div>

        {trips.length === 0 ? (
          <EmptyState>No hay viajes reales cargados todavia.</EmptyState>
        ) : (
          <ul className="showcase-live__list">
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
      </section>
    </MainLayout>
  );
}
