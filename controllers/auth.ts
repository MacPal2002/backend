import { Hono, Context } from 'hono';
import { User } from '../models/user.ts';
import { kv } from '../config/kv.ts';
import { verifyAdmin } from '../middleware/verifyAdmin.ts'; // Middleware do weryfikacji admina
import { verifyUser } from '../middleware/verifyUser.ts'; // Middleware do weryfikacji użytkownika
import { registerUser } from '../auth.ts';
import { loginUser } from '../auth.ts';
import { logoutUser } from '../auth.ts';

const authRoutes = new Hono();

// Endpoint logowania
authRoutes.post('/login', async (c: Context) => {
  const { username, password } = await c.req.json();  // Oczekiwanie na dane JSON z żądania (username, password)

  const result = await loginUser(username, password);  // Funkcja logowania

  if (result.token) {
    return c.json({ message: 'Login successful', token: result.token }, 200);
  } else {
    return c.json({ message: result.message }, 401);  // Jeśli logowanie nie uda się
  }
});

// Endpoint rejestracji
authRoutes.post('/register', async (c: Context) => {
  const { username, password, role, additionalData } = await c.req.json();  // Oczekiwanie na dane JSON

  // Jeśli rola nie jest podana, ustawiamy domyślnie "user"
  const userRole = role || 'user';

  // Sprawdzenie, czy dodatkowe dane zostały podane w zależności od roli
  if (userRole === 'student' && (!additionalData.studentId || !additionalData.course || !additionalData.year || !additionalData.group)) {
    return c.json({ message: 'Missing required fields for student' }, 400);
  }
  if (userRole === 'teacher' && (!additionalData.teacherId || !additionalData.department || !additionalData.subjects)) {
    return c.json({ message: 'Missing required fields for teacher' }, 400);
  }
  if (userRole === 'admin' && !additionalData.permissions) {
    return c.json({ message: 'Missing permissions for admin' }, 400);
  }

  // Rejestracja użytkownika
  try {
    const result = await registerUser(username, password, userRole, additionalData);

    // Odpowiedź na udaną rejestrację
    return c.json({ message: result.message }, result.message === "User registered successfully" ? 201 : 400);
  } catch (error: unknown) { // Dodanie typu 'unknown' dla błędu
    if (error instanceof Error) {
      // Obsługa błędów, jeżeli 'error' jest instancją klasy Error
      console.error('Error during user registration:', error.message);
      return c.json({ message: 'Registration failed', error: error.message }, 500);
    }
    // Obsługa innych typów błędów, jeśli nie jest to instancja Error
    console.error('Unknown error during user registration:', error);
    return c.json({ message: 'Registration failed', error: 'Unknown error occurred' }, 500);
  }
});


// Endpoint wylogowywania
authRoutes.post('/logout', async (c: Context) => {
  // Pobieramy token z nagłówka
  const token = c.req.header('Authorization')?.split(' ')[1];

  if (!token) {
    return c.json({ message: 'Unauthorized: Missing token in header' }, 401);
  }

  // Przekazujemy token do logoutUser, aby dodać go do czarnej listy
  const result = await logoutUser(token);

  return c.json(result, 200);  // Odpowiedź po wylogowaniu
});


// Pobieranie użytkowników - dostępne tylko dla admina
authRoutes.get("/userlist", verifyUser, verifyAdmin, async (c: Context) => {
  try {
      const users: User[] = [];
      // Przechodzenie po wszystkich użytkownikach w bazie
      for await (const entry of kv.list({ prefix: ['users'] })) {
          // Rzutowanie typu entry.value na User
          users.push(entry.value as User);
      }

      // Zwrócenie listy użytkowników
      return c.json(users, 200);
  } catch (_error) { // Oznaczenie zmiennej jako nieużywanej
      // Obsługa błędów, np. w przypadku problemu z bazą danych
      return c.json({ error: 'Nie udało się pobrać użytkowników' }, 500);
  }
});



export { authRoutes };

