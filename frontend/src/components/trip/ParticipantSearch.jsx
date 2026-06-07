import Avatar from "../ui/Avatar";
import EmptyState from "../ui/EmptyState";

export default function ParticipantSearch({
  search,
  onSearchChange,
  suggestions,
  onSelectUser,
  canInviteExternal,
  onInviteExternal,
  message
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

      {message ? <p className="form-message form-message--error">{message}</p> : null}

      {search.trim() ? (
        <div className="participant-results participant-results--hint">
          {suggestions.length > 0 ? (
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
          ) : canInviteExternal ? (
            <div className="participant-invite">
              <div className="participant-invite__copy">
                <strong>No se encontro una cuenta para ese correo.</strong>
                <small>Enviar invitacion y agregarlo como participante pendiente.</small>
              </div>
              <button className="participant-invite__button" type="button" onClick={onInviteExternal}>
                Invitar por correo
              </button>
            </div>
          ) : (
            <EmptyState>No hay coincidencias para esa busqueda.</EmptyState>
          )}
        </div>
      ) : null}
    </div>
  );
}
