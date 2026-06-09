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
          {participants.map((participant) => (
            <div className="participant-chip" key={participant.key}>
              <div className="participant-chip__body">
                <Avatar imageUrl={participant.fotoUrl} name={participant.nombreCompleto} />
                <div>
                  <strong>{participant.nombreCompleto}</strong>
                  <small>{participant.email}</small>
                </div>
              </div>

              <div className="participant-chip__meta">
                <span
                  className={`participant-chip__badge ${
                    participant.kind === "external" ? "participant-chip__badge--pending" : ""
                  }`}
                >
                  {participant.kind === "external" ? "Invitacion pendiente" : "Registrado"}
                </span>
                <button type="button" onClick={() => onRemove(participant)}>
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
