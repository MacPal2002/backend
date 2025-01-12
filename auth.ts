import { kv } from './config/kv.ts';
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import { User, Student, Teacher, Admin } from './models/user.ts';
import { createJWT } from './utils/jwt.ts';
import { blacklistToken } from './utils/jwt.ts';

export async function registerUser<
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
    const passwordHash = await bcrypt.hash(password);
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
export async function loginUser(username: string, password: string) {
  try {
    const user = await kv.get(['users', username]);

    // Rzutowanie typu na User
    const userData = user.value as User;

    if (!userData) {
      return { message: 'User not found' };  // Użytkownik nie istnieje
    }

    // Porównanie hasła
    const isValidPassword = await bcrypt.compare(password, userData.passwordHash);
    if (!isValidPassword) {
      return { message: 'Invalid credentials' };  // Niepoprawne hasło
    }

    // Generowanie tokenu JWT
    const token = await createJWT(userData);
    return { token };
  } catch (error) {
    console.error("Error during login:", error);
    return { message: 'Internal Server Error' };
  }
}


// Wylogowywanie użytkownika
export async function logoutUser(token: string) {
  try {
    // Dodanie tokenu do czarnej listy
    await blacklistToken(token);

    console.log('Logout successful');
    return { message: 'Logout successful' };  // Odpowiedź po wylogowaniu
  } catch (error) {
    console.error("Error during logout:", error);
    return { message: 'Logout failed' };  // Jeśli wystąpi błąd
  }
}








