import { Link } from "react-router-dom";

import Button from "../ui/Button";

export default function SiteHeader({ navLinks = [], action }) {
  return (
    <header className="site-header">
      <Link className="brand-mark" to="/">
        <span className="brand-mark__icon" />
        <span className="brand-mark__text">Cyanea</span>
      </Link>

      {navLinks.length > 0 ? (
        <nav className="site-nav" aria-label="Principal">
          {navLinks.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      ) : null}

      {action ? (
        action.kind === "link" ? (
          <Link className={`button button--${action.variant ?? "ghost"} button-link`} to={action.to}>
            {action.label}
          </Link>
        ) : (
          <Button onClick={action.onClick} variant={action.variant ?? "ghost"}>
            {action.label}
          </Button>
        )
      ) : null}
    </header>
  );
}
