export interface Schedule {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  subject: string;
  year?: string;  // Rok studiów (np. 1, 2, 3, 4)
  classroom?: string;
  teacher?: string;
  course?: string;  // Kierunek studiów
  group?: string;  // Grupa dziekańska
}