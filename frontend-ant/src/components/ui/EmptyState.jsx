export default function EmptyState({ children, className = "" }) {
  return <p className={`trip-preview__empty ${className}`.trim()}>{children}</p>;
}
