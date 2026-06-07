import Avatar from "../ui/Avatar";
import EmptyState from "../ui/EmptyState";

export default function ParticipantChipList({ participants, onRemove }) {
  return (
    <div className="participant-selected">
      <div className="participant-selected__header">
        <h3>Lista del viaje</h3>
        <small>{participants.length} seleccionados</small>
      </div>

      {participants.length === 0 ? (
        <EmptyState>Todavia no agregaste participantes al viaje.</EmptyState>
      ) : (
        <div className="participant-chip-list">
          {participants.map((user) => (
            <div className="participant-chip" key={user.id}>
              <div className="participant-chip__body">
                <Avatar imageUrl={user.fotoUrl} name={user.nombreCompleto} />
                <div>
                  <strong>{user.nombreCompleto}</strong>
                  <small>{user.email}</small>
                </div>
              </div>
              <button type="button" onClick={() => onRemove(user.id)}>
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
