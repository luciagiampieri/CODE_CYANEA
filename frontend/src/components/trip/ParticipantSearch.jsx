import Avatar from "../ui/Avatar";
import EmptyState from "../ui/EmptyState";

export default function ParticipantSearch({
  search,
  onSearchChange,
  suggestions,
  onSelectUser
}) {
  return (
    <div className="participant-picker">
      <label className="field field--full">
        <span>Buscar participante</span>
        <input
          name="participantSearch"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Escribe un nombre, usuario o email"
          autoComplete="off"
        />
      </label>

      <div className="participant-results participant-results--hint">
        {!search.trim() ? (
          <EmptyState>
            Escribe al menos un nombre, usuario o email para buscar participantes.
          </EmptyState>
        ) : suggestions.length === 0 ? (
          <EmptyState>No hay coincidencias para esa busqueda.</EmptyState>
        ) : (
          <ul className="participant-suggestion-list">
            {suggestions.map((user) => (
              <li key={user.id}>
                <button
                  className="participant-suggestion"
                  type="button"
                  onClick={() => onSelectUser(user)}
                >
                  <Avatar imageUrl={user.fotoUrl} name={user.nombreCompleto} />
                  <span className="participant-suggestion__body">
                    <strong>{user.nombreCompleto}</strong>
                    <small>
                      @{user.nombreUsuario} - {user.email}
                    </small>
                  </span>
                  <span className="participant-suggestion__action">Agregar</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
