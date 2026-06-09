export default function StatusBadge({ children, tone = "note" }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}
