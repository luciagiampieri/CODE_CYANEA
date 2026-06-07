import Avatar from "../ui/Avatar";
import EmptyState from "../ui/EmptyState";
import Button from "../ui/Button";

function getEmailLabel(email) {
  return email.split("@")[0].replace(/[._-]+/g, " ");
}

export default function ExternalInviteList({
  value,
  onChange,
  onAdd,
  invitedEmails,
  onRemove,
  message
}) {
  return (
    <div className="participant-picker">
      <div className="participant-external">
        <label className="field field--full">
          <span>Correo del invitado</span>
          <input
            name="externalInvite"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="nombre@correo.com"
            autoComplete="off"
          />
        </label>

        <Button className="participant-external__action" onClick={onAdd} variant="secondary">
          Agregar correo
        </Button>
      </div>

      {message ? <p className="form-message form-message--error">{message}</p> : null}

      <div className="participant-selected">
        <div className="participant-selected__header">
          <h3>Invitaciones pendientes</h3>
          <small>{invitedEmails.length} correos agregados</small>
        </div>

        {invitedEmails.length === 0 ? (
          <EmptyState>Todavia no agregaste invitados externos al viaje.</EmptyState>
        ) : (
          <div className="participant-chip-list">
            {invitedEmails.map((email) => (
              <div className="participant-chip" key={email}>
                <div className="participant-chip__body">
                  <Avatar name={getEmailLabel(email)} />
                  <div>
                    <strong>{email}</strong>
                    <small>Invitacion externa pendiente</small>
                  </div>
                </div>
                <button type="button" onClick={() => onRemove(email)}>
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
