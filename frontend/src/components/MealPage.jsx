import { useState, useEffect } from 'react';
import { fetchAllTodos } from '../adapters/todo-adapters';
import AddTodoForm from './AddMealForm';
import TodoList from './MealList';

function TodoPage({ currentUser, handleLogout }) {
  const [todos, setTodos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // This helper fetches todos on page load with useEffect
  // It is also used within the AddTodoForm and TodoList
  // to re-fetch the todos when a mutation action is performed
  // such as creating, deleting, or updating a todo.
  const loadTodos = async () => {
    setIsLoading(true);
    setError(null);
    const { data, error: fetchError } = await fetchAllTodos();
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setTodos(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadTodos();
  }, []);

  return (
    <section>
      <div id="user-controls">
        <span>Welcome, <strong>{currentUser.username}</strong>!</span>
        <button onClick={handleLogout}>Log Out</button>
      </div>
      <AddTodoForm loadTodos={loadTodos} />
      {isLoading && <p>Loading todos...</p>}
      {error && <p className="error">Something went wrong: {error}</p>}
      <TodoList todos={todos} loadTodos={loadTodos} />
    </section>
  );
}

export default TodoPage;
