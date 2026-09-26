import { useState } from 'react';

// Form for planning one meal in a chosen day and slot. Calls onSubmit with
// the plan fields and shows any error it returns.
function PlanForm({ dayLabel, slot, onSubmit, onCancel }) {
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const toNumber = (field) => Number(form.elements[field].value || 0);

    setIsSaving(true);
    const error = await onSubmit({
      name: form.elements.name.value.trim(),
      calories: toNumber('calories'),
      protein_g: toNumber('protein'),
      carbs_g: toNumber('carbs'),
      fat_g: toNumber('fat'),
    });
    setIsSaving(false);
    if (error) setErrorMessage(error);
  };

  return (
    <div className="plan-form-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="meal-form plan-form"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Plan ${slot} for ${dayLabel}`}
      >
        <p className="small-label">{dayLabel}</p>
        <h2>Plan {slot}</h2>
        <label htmlFor="plan-name">Meal name</label>
        <input id="plan-name" name="name" type="text" maxLength={100} required autoFocus />
        <label htmlFor="plan-calories">Calories</label>
        <input id="plan-calories" name="calories" type="number" min="0" max="10000" step="1" required />
        <div className="macro-grid">
          <label>
            Protein (g)
            <input name="protein" type="number" min="0" max="1000" step="1" />
          </label>
          <label>
            Carbs (g)
            <input name="carbs" type="number" min="0" max="1000" step="1" />
          </label>
          <label>
            Fat (g)
            <input name="fat" type="number" min="0" max="1000" step="1" />
          </label>
        </div>
        {errorMessage && <p className="error">{errorMessage}</p>}
        <div className="account-actions">
          <button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Add to plan'}</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default PlanForm;
