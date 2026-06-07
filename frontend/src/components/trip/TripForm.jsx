import Button from "../ui/Button";
import ParticipantChipList from "./ParticipantChipList";
import ParticipantSearch from "./ParticipantSearch";

export default function TripForm({
  form,
  currentUser,
  submitStatus,
  submitMessage,
  participantSearch,
  inviteMessage,
  selectableUsers,
  participantItems,
  canInviteExternal,
  onParticipantSearchChange,
  onSelectParticipant,
  onInviteExternal,
  onRemoveParticipant,
  onInputChange,
  onSubmit,
  onCancel
}) {
  return (
    <form className="trip-form" onSubmit={onSubmit}>
      <div className="form-card form-card--span">
        <div className="form-card__header">
          <h3>Informacion del viaje</h3>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Titulo</span>
            <input
              name="title"
              value={form.title}
              onChange={onInputChange}
              placeholder="Escapada a Cordoba"
              required
            />
          </label>

          <label className="field">
            <span>Destino</span>
            <input
              name="destination"
              value={form.destination}
              onChange={onInputChange}
              placeholder="Cordoba"
              required
            />
          </label>

          <label className="field field--full">
            <span>Descripcion</span>
            <textarea
              name="description"
              value={form.description}
              onChange={onInputChange}
              rows="4"
              placeholder="Resumen del viaje, objetivos o notas iniciales."
            />
          </label>

          <label className="field">
            <span>Fecha inicio</span>
            <input type="date" name="startDate" value={form.startDate} onChange={onInputChange} />
          </label>

          <label className="field">
            <span>Fecha fin</span>
            <input type="date" name="endDate" value={form.endDate} onChange={onInputChange} />
          </label>

          <label className="field">
            <span>Moneda</span>
            <input
              name="currency"
              value={form.currency}
              onChange={onInputChange}
              maxLength="3"
              required
            />
          </label>

          <div className="field">
            <span>Creador / Administrador</span>
            <div className="field-readonly">
              {currentUser ? (
                <>
                  <strong>{currentUser.nombreCompleto}</strong>
                  <small>
                    @{currentUser.nombreUsuario} - {currentUser.email}
                  </small>
                </>
              ) : (
                <small>No se pudo resolver el usuario actual.</small>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="form-card form-card--span">
        <div className="participant-box__header">
          <h3>Participantes</h3>
        </div>

        <div className="participant-layout">
          <ParticipantSearch
            canInviteExternal={canInviteExternal}
            message={inviteMessage}
            onInviteExternal={onInviteExternal}
            onSearchChange={onParticipantSearchChange}
            onSelectUser={onSelectParticipant}
            search={participantSearch}
            suggestions={selectableUsers}
          />

          <ParticipantChipList onRemove={onRemoveParticipant} participants={participantItems} />
        </div>
      </div>

      {submitMessage ? (
        <p className={`form-message form-message--${submitStatus}`}>{submitMessage}</p>
      ) : null}

      <div className="form-actions form-actions--span">
        <Button disabled={!currentUser} type="submit" variant="primary">
          {submitStatus === "submitting" ? "Creando..." : "Guardar viaje"}
        </Button>
        <Button onClick={onCancel} variant="secondary">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
