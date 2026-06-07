import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBars } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";

export default function SiteHeader({ variant = "brand", title, subtitle, action, backTo = "/" }) {
  return (
    <header className={`app-header app-header--${variant}`}>
      <div className="app-header__top">
        {variant === "detail" ? (
          <Link aria-label="Volver" className="app-header__iconButton" to={backTo}>
            <FontAwesomeIcon icon={faArrowLeft} />
          </Link>
        ) : (
          <Link aria-label="Inicio" className="app-header__brand" to="/">
            <img alt="Cyanea" className="app-header__brandMark" src="/cyanea-mark.svg" />
            <div className="app-header__intro">
              <span className="app-header__eyebrow">Cyanea</span>
              <strong>Organiza tu proximo viaje</strong>
            </div>
          </Link>
        )}

        {action ? (
          action.kind === "link" ? (
            <Link
              aria-label={action.ariaLabel ?? action.label ?? "Accion"}
              className={`app-header__action app-header__action--${action.variant ?? "icon"}`}
              to={action.to}
            >
              {action.icon ? <FontAwesomeIcon icon={action.icon} /> : null}
              {action.label ? <span>{action.label}</span> : null}
            </Link>
          ) : (
            <button
              aria-label={action.ariaLabel ?? action.label ?? "Accion"}
              className={`app-header__action app-header__action--${action.variant ?? "icon"}`}
              type="button"
            >
              {action.icon ? <FontAwesomeIcon icon={action.icon} /> : null}
              {action.label ? <span>{action.label}</span> : null}
            </button>
          )
        ) : (
          <button aria-label="Menu" className="app-header__menu" type="button">
            <FontAwesomeIcon icon={faBars} />
          </button>
        )}
      </div>

      {title ? (
        <div className="app-header__body">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      ) : null}
    </header>
  );
}
