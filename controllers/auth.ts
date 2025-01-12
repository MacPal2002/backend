import { Hono, Context } from 'hono';
import { kv } from '../config/kv.ts';
import { verifyAdmin } from '../middleware/verifyAdmin.ts'; // Middleware do weryfikacji admina
import { verifyUser } from '../middleware/verifyUser.ts'; // Middleware do weryfikacji użytkownika
import { hashSync, compareSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { User, Student, Teacher, Admin } from '../models/user.ts';
import { blacklistToken, createJWT, verifyToken } from '../utils/jwt.ts';

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
  const token = c.req.header('Authorization')?.split(' ')[1];

  console.log(`Logout request received. Token: ${token ? 'Present' : 'Missing'}`);  // Logowanie obecności tokenu

  if (!token) {
    return c.json({ message: 'Unauthorized: Missing token in header' }, 401);
  }

  try {
    // Pobieramy dane użytkownika na podstawie tokenu (zakładając, że token zawiera username)
    const decoded = await verifyToken(token);
    const username = decoded.username;

    console.log(`Token verified. User: ${username}`);  // Logowanie po pomyślnej weryfikacji tokenu

    // Sprawdzamy, czy użytkownik istnieje w bazie
    const user = await kv.get(['users', username]);
    if (!user) {
      console.log(`User ${username} not found in database.`);  // Logowanie, jeśli użytkownik nie istnieje
      return c.json({ message: 'User not found' }, 404);
    }

    // Usunięcie tokenu z listy tokenów użytkownika
    const userData = user.value as User;
    const initialTokenCount = userData.tokens?.length || 0;
    userData.tokens = userData.tokens?.filter(t => t !== token) || [];
    const finalTokenCount = userData.tokens?.length || 0;

    console.log(`User ${username} logged out. Tokens before: ${initialTokenCount}, after: ${finalTokenCount}`);  // Logowanie przed i po usunięciu tokenu

    // Zapisanie zaktualizowanych danych użytkownika w bazie
    await kv.set(['users', userData.username], userData);

    // Dodanie tokenu do czarnej listy
    await blacklistToken(token);
    console.log(`Token ${token} added to the blacklist.`);  // Logowanie dodania tokenu do czarnej listy

    return c.json({ message: 'Logged out successfully' }, 200);
  } catch (error: unknown) {
    console.error('Error during logout:', error);  // Logowanie błędu w przypadku problemów
    return c.json({ message: 'Logout failed', error: (error instanceof Error ? error.message : 'Unknown error') }, 500);
  }
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

// Usuwanie użytkownika - dostępne tylko dla admina
authRoutes.delete("/delete/:username", verifyUser, verifyAdmin, async (c: Context) => {
  const { username } = c.req.param(); // Pobranie nazwy użytkownika z parametru w URL

  console.log(`Request to delete user: ${username}`);  // Logowanie zapytania o usunięcie użytkownika

  try {
    // Sprawdzanie, czy użytkownik o danej nazwie istnieje w bazie
    const user = await kv.get(['users', username]);
    console.log(`User found: ${user ? 'Yes' : 'No'}`);  // Logowanie, czy użytkownik został znaleziony

    // Rzutowanie typu na User
    const userData = user.value as User;

    if (!userData) {
      console.log(`User ${username} not found in the database`);  // Logowanie przypadku, gdy użytkownik nie istnieje
      return c.json({ message: 'User not found' }, 404);  // Użytkownik nie istnieje
    }

    // Usuwanie wszystkich tokenów użytkownika z czarnej listy
    if (userData.tokens && userData.tokens.length > 0) {
      console.log(`User ${username} has ${userData.tokens.length} token(s), invalidating them.`);  // Logowanie liczby tokenów do unieważnienia
      for (const token of userData.tokens) {
        await blacklistToken(token);  // Dodajemy token do czarnej listy
        console.log(`Token ${token} added to the blacklist.`);  // Logowanie dodania tokenu do czarnej listy
      }
    } else {
      console.log(`No tokens found for user ${username}.`);  // Logowanie, gdy użytkownik nie ma tokenów
    }

    // Usuwanie użytkownika z bazy
    await kv.delete(['users', username]);
    console.log(`User ${username} successfully deleted from the database.`);  // Logowanie sukcesu usunięcia użytkownika

    return c.json({ message: 'User deleted and all tokens invalidated successfully' }, 200);  // Zwrócenie komunikatu o sukcesie
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error during user deletion:', error.message);  // Logowanie błędu
      return c.json({ message: 'Failed to delete user', error: error.message }, 500); // Obsługa błędów
    }
    console.error('Unknown error during user deletion', error);  // Logowanie nieznanego błędu
    return c.json({ message: 'Failed to delete user', error: 'Unknown error occurred' }, 500); // Obsługa nieznanych błędów
  }
});





export { authRoutes };

async function registerUser<
  T extends 'student' | 'teacher' | 'admin' // Typ użytkownika
>(
  username: string,
  password: string,
  role: T, // Rola użytkownika
  additionalData: T extends 'student'
    ? Partial<Student>
    : T extends 'teacher'
    ? Partial<Teacher>
    : T extends 'admin'
    ? Partial<Admin>
    : never // Gdyby rola była inna niż student/teacher/admin
) {
  try {
    // Debugowanie danych wejściowych
    console.log('Registering user:', { username, password, role, additionalData });

    // Sprawdzenie, czy użytkownik już istnieje
    const existingUser = await kv.get(['users', username]);
    if (existingUser?.value) {
      console.log('User already exists:', username);  // Logowanie, że użytkownik już istnieje
      return { message: "User already exists" };
    }

    // Haszowanie hasła
    console.log("Hashing password...");
    const passwordHash = await hashSync(password);
    console.log("Password hashed successfully");
    const id = crypto.randomUUID(); // Generowanie unikalnego ID
    console.log('Generated user ID:', id);  // Logowanie ID użytkownika

    // Tworzenie użytkownika w zależności od roli
    let user: User;

    switch (role) {
      case 'student':
        // Logowanie danych studenta przed przypisaniem
        console.log('Creating student user:', additionalData);
        user = {
          id,
          username,
          passwordHash,
          role,
          studentId: (additionalData as Partial<Student>).studentId || '',
          course: (additionalData as Partial<Student>).course || '',
          year: (additionalData as Partial<Student>).year || 1,
          group: (additionalData as Partial<Student>).group || '',
        } as User;
        break;

      case 'teacher':
        // Logowanie danych nauczyciela przed przypisaniem
        console.log('Creating teacher user:', additionalData);
        user = {
          id,
          username,
          passwordHash,
          role,
          teacherId: (additionalData as Partial<Teacher>).teacherId || '',
          department: (additionalData as Partial<Teacher>).department || '',
          subjects: (additionalData as Partial<Teacher>).subjects || [],
        } as User;
        break;

      case 'admin':
        // Logowanie danych administratora przed przypisaniem
        console.log('Creating admin user:', additionalData);
        user = {
          id,
          username,
          passwordHash,
          role,
          permissions: (additionalData as Partial<Admin>).permissions || [],
        } as User;
        break;

      default:
        console.error('Invalid role:', role);  // Logowanie nieprawidłowej roli
        throw new Error("Invalid role");
    }

    // Zapisanie użytkownika w bazie danych
    console.log('Saving user to database:', user);  // Logowanie użytkownika przed zapisaniem
    await kv.set(['users', username], user);

    // Zwrócenie komunikatu po pomyślnej rejestracji
    return { message: "User registered successfully" };
  } catch (error) {
    // Logowanie błędów
    if (error instanceof Error) {
      console.error('Error during user registration:', error.message);
      return { message: 'Registration failed', error: error.message };
    }
    console.error('Unknown error during user registration:', error);
    return { message: 'Registration failed', error: 'Unknown error occurred' };
  }
}




// Logowanie użytkownika
async function loginUser(username: string, password: string) {
  try {
    const user = await kv.get(['users', username]);

    // Rzutowanie typu na User
    const userData = user.value as User;

    if (!userData) {
      return { message: 'User not found' };  // Użytkownik nie istnieje
    }

    // Porównanie hasła
    const isValidPassword = await compareSync(password, userData.passwordHash);
    if (!isValidPassword) {
      return { message: 'Invalid credentials' };  // Niepoprawne hasło
    }

    // Generowanie tokenu JWT
    const token = await createJWT(userData);

    // Dodanie tokenu do listy tokenów użytkownika
    userData.tokens = userData.tokens || [];
    userData.tokens.push(token);
    
    // Zapisanie użytkownika z nowym tokenem
    await kv.set(['users', userData.username], userData);

    return { token };
  } catch (error) {
    console.error("Error during login:", error);
    return { message: 'Internal Server Error' };
  }
}








