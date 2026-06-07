import SiteHeader from "./SiteHeader";

export default function MainLayout({ header, children, shellClassName = "" }) {
  return (
    <div className="page-shell">
      <SiteHeader {...header} />
      <main className={`app-shell ${shellClassName}`.trim()}>{children}</main>
    </div>
  );
}
