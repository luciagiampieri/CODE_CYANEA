import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookmark,
  faCompass,
  faRoute,
  faSuitcaseRolling,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import { Link, useLocation } from "react-router-dom";

import SiteHeader from "./SiteHeader";

const navItems = [
  { label: "Viajes", to: "/", icon: faSuitcaseRolling },
  { label: "Explorar", to: "/", icon: faCompass },
  { label: "Itinerarios", to: "/", icon: faRoute },
  { label: "Guardados", to: "/", icon: faBookmark },
  { label: "Perfil", to: "/", icon: faUser }
];

function NavLinks({ className = "", currentPath }) {
  return (
    <div className={className}>
      {navItems.map((item) => {
        const isActive = item.to === "/" ? currentPath === "/" : currentPath.startsWith(item.to);

        return (
          <Link
            className={`app-nav__item ${isActive ? "app-nav__item--active" : ""}`}
            key={`${item.label}-${item.to}`}
            to={item.to}
          >
            <span className="app-nav__icon" aria-hidden="true">
              <FontAwesomeIcon icon={item.icon} />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function MainLayout({ header, children, shellClassName = "" }) {
  const location = useLocation();

  return (
    <div className="page-shell">
      <div className={`app-frame ${shellClassName}`.trim()}>
        <div className="app-statusbar">
          <span>9:41</span>
          <div className="app-statusbar__icons" aria-hidden="true">
            <span className="app-statusbar__dot" />
            <span className="app-statusbar__bar" />
            <span className="app-statusbar__battery" />
          </div>
        </div>

        <div className="app-layout">
          <aside className="app-sidebar" aria-label="Secciones">
            <Link className="app-brand" to="/">
              <img alt="Cyanea" className="app-brand__mark" src="/cyanea-mark.svg" />
              <div>
                <strong>CYANEA</strong>
                <small>Planificacion colaborativa</small>
              </div>
            </Link>

            <NavLinks className="app-nav app-nav--sidebar" currentPath={location.pathname} />
          </aside>

          <div className="app-surface">
            <SiteHeader {...header} />
            <main className="app-content">{children}</main>
            <nav className="app-tabbar" aria-label="Principal">
              <NavLinks className="app-nav app-nav--tabbar" currentPath={location.pathname} />
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
