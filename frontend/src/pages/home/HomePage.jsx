import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faPlus } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import MainLayout from "../../components/layout/MainLayout";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { getTrips } from "../../services/api";

const fallbackImages = [
  "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1508261305436-e282fd32d20a?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80"
];

const itineraryItems = [
  { time: "09:00", title: "Llegada y check-in", note: "Aterrizaje, hotel y primer reagrupamiento" },
  { time: "11:00", title: "Paseo inicial", note: "Recorrido liviano para ubicar al grupo" },
  { time: "13:30", title: "Almuerzo", note: "Punto de encuentro para definir el resto del dia" }
];

function formatDateRange(trip) {
  if (!trip.startDate || !trip.endDate) {
    return "Fechas por definir";
  }

  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Fechas por definir";
  }

  const formatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

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

  const decoratedTrips = useMemo(() => {
    return trips.map((trip, index) => ({
      ...trip,
      image: fallbackImages[index % fallbackImages.length],
      dateLabel: formatDateRange(trip)
    }));
  }, [trips]);

  return (
    <MainLayout
      header={{
        variant: "brand",
        action: {
          kind: "link",
          icon: faPlus,
          to: "/viajes/nuevo",
          variant: "icon",
          ariaLabel: "Crear nuevo viaje"
        }
      }}
    >
      <div className="responsive-page responsive-page--home">
        <div className="responsive-page__main">
          <section className="content-section content-section--hero">
            <div className="hero-card">
              <div className="hero-card__copy">
                <span className="eyebrow">Mis Viajes</span>
                <h2>Explora tus proximas aventuras</h2>
                <p>
                  Un unico frontend para planificar, invitar participantes y seguir el viaje desde
                  cualquier dispositivo.
                </p>
              </div>

              <div className="hero-card__meta">
                <div className="inline-status">
                  <StatusBadge tone={apiStatus}>API {apiStatus.replace("-", " ")}</StatusBadge>
                  <StatusBadge tone="note">{decoratedTrips.length} viajes</StatusBadge>
                </div>

                <Link className="cta-chip" to="/viajes/nuevo">
                  <FontAwesomeIcon icon={faPlus} />
                  Nuevo Viaje
                </Link>
              </div>
            </div>
          </section>

          <section className="content-section">
            {decoratedTrips.length === 0 ? (
              <div className="empty-card">
                <EmptyState>Todavia no hay viajes cargados. Crea el primero para empezar.</EmptyState>
              </div>
            ) : (
              <div className="trip-grid">
                {decoratedTrips.map((trip) => (
                  <article
                    className="trip-card"
                    key={trip.id}
                    style={{
                      backgroundImage: `linear-gradient(180deg, transparent 18%, rgba(8, 18, 39, 0.84) 100%), url(${trip.image})`
                    }}
                  >
                    <div className="trip-card__content">
                      <h3>{trip.title}</h3>
                      <p>{trip.destination}</p>
                      <small>{trip.dateLabel}</small>
                    </div>
                    <span className="trip-card__arrow" aria-hidden="true">
                      <FontAwesomeIcon icon={faChevronRight} />
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="responsive-page__side">
          <section className="content-section">
            <div className="panel-card panel-card--sticky">
              <div className="panel-card__header">
                <div>
                  <span className="eyebrow eyebrow--small">Resumen</span>
                  <h3>Itinerario sugerido</h3>
                  <p>Vista tipo agenda para el proximo paso del producto.</p>
                </div>
                <span className="day-pill day-pill--active">
                  <strong>Dia 1</strong>
                  <small>12 Jun</small>
                </span>
              </div>

              <div className="agenda-list">
                {itineraryItems.map((item, index) => (
                  <article className="agenda-item" key={`${item.time}-${item.title}`}>
                    <div className="agenda-item__time">{item.time}</div>
                    <div className="agenda-item__track">
                      <span className={`agenda-item__dot ${index === 0 ? "agenda-item__dot--active" : ""}`} />
                      {index < itineraryItems.length - 1 ? <span className="agenda-item__line" /> : null}
                    </div>
                    <div className={`agenda-item__card ${index === 0 ? "agenda-item__card--active" : ""}`}>
                      <strong>{item.title}</strong>
                      <small>{item.note}</small>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </MainLayout>
  );
}
