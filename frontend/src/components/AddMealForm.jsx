import { createTodo } from '../adapters/todo-adapters';

function AddTodoForm({ loadTodos }) {
  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const title = form.elements.title.value;
    if (!title) return;

    const { error } = await createTodo(title);
    if (error) return console.error(error);

    await loadTodos();
    form.reset();
  };

  return (
    <form id="add-todo-form" onSubmit={handleSubmit}>
      <label htmlFor="title-input">New Todo:</label>
      <input type="text" name="title" id="title-input" placeholder="What needs to be done?" />
      <button type="submit">Add</button>
    </form>
  );
}

export default AddTodoForm;
