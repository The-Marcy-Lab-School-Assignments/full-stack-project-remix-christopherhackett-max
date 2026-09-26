import { useState } from 'react';
import { createSavedMeal } from '../adapters/saved-meal-adapters';
import { MEAL_TYPES } from '../mealTypes';

// Saves a meal to My Meals. It does not log it as eaten.
function AddMealForm({ defaultType, onMealAdded }) {
  const [errorMessage, setErrorMessage] = useState(null);
  const [photoData, setPhotoData] = useState(null);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    setErrorMessage(null);

    if (!file) {
      setPhotoData(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload an image file.');
      e.target.value = '';
      setPhotoData(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPhotoData(reader.result);
    reader.onerror = () => setErrorMessage('Could not read that photo.');
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.elements.name.value.trim();
    const calories = Number(form.elements.calories.value);
    const protein = Number(form.elements.protein.value || 0);
    const carbs = Number(form.elements.carbs.value || 0);
    const fat = Number(form.elements.fat.value || 0);

    if (!name || Number.isNaN(calories)) {
      setErrorMessage('Meal name and calories are required.');
      return;
    }

    const { error } = await createSavedMeal({
      name,
      meal_type: form.elements.meal_type.value,
      calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      photo_data: photoData,
    });
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    onMealAdded();
  };

  return (
    <form className="meal-form" onSubmit={handleSubmit}>
      <label htmlFor="name-input">Meal Name</label>
      <input type="text" name="name" id="name-input" placeholder="Grilled chicken bowl" required />

      <label htmlFor="type-input">Meal Type</label>
      <select name="meal_type" id="type-input" defaultValue={defaultType}>
        {MEAL_TYPES.map((type) => (
          <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>
        ))}
      </select>

      <label htmlFor="calories-input">Calories</label>
      <input type="number" name="calories" id="calories-input" min="0" placeholder="520" required />

      <label htmlFor="photo-input">Meal Photo</label>
      <div className="photo-upload">
        <input
          type="file"
          name="photo"
          id="photo-input"
          accept="image/*"
          onChange={handlePhotoChange}
        />
        <div className="photo-preview">
          {photoData
            ? <img src={photoData} alt="Meal preview" />
            : <span>Preview</span>}
        </div>
      </div>

      <div className="macro-grid">
        <label htmlFor="protein-input">
          Protein
          <input type="number" name="protein" id="protein-input" min="0" placeholder="35" />
        </label>
        <label htmlFor="carbs-input">
          Carbs
          <input type="number" name="carbs" id="carbs-input" min="0" placeholder="48" />
        </label>
        <label htmlFor="fat-input">
          Fat
          <input type="number" name="fat" id="fat-input" min="0" placeholder="18" />
        </label>
      </div>

      {errorMessage && <p className="error">{errorMessage}</p>}
      <button type="submit">Save Meal</button>
    </form>
  );
}

export default AddMealForm;
