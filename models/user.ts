// Specyficzne pola dla Student
export interface Student {
  role: 'student';
  studentId: string; // Identyfikator studenta
  course: string; // Kierunek studiów
  year: number; // Rok studiów
  group: string; // Grupa dziekańska
}

// Specyficzne pola dla Teacher
export interface Teacher {
  role: 'teacher';
  teacherId: string; // Identyfikator nauczyciela
  department: string; // Wydział
  subjects: string[]; // Lista przedmiotów
}

// Specyficzne pola dla Admin
export interface Admin {
  role: 'admin';
  permissions: string[]; // Lista uprawnień administracyjnych
}

export interface BaseUser {
  id: string;
  username: string;
  passwordHash: string; // Hasło w formie hash
  role: 'student' | 'teacher' | 'admin'; // Rola użytkownika
  tokens?: string[];
}

export type User = BaseUser & (Student | Teacher | Admin);
