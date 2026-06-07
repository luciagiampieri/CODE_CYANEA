function getInitials(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Avatar({ name, imageUrl = "", className = "" }) {
  if (imageUrl) {
    return <img className={`participant-avatar ${className}`.trim()} src={imageUrl} alt={name} />;
  }

  return (
    <span className={`participant-avatar ${className}`.trim()} aria-hidden="true">
      {getInitials(name)}
    </span>
  );
}
