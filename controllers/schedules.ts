import { Hono, Context } from 'hono';
import { Schedule } from '../models/schedule.ts';
import { verifyAdmin } from '../middleware/verifyAdmin.ts'; // Funkcja do weryfikacji uprawnień admina
import { verifyUser } from '../middleware/verifyUser.ts'; // Funkcja do weryfikacji użytkownika
import { kv } from '../config/kv.ts';
import { User } from "../models/user.ts";

const scheduleRoutes = new Hono();

// Tworzenie nowego zajęcia - dostępne tylko dla admina
scheduleRoutes.post('/', verifyUser, verifyAdmin, async (c: Context) => {
  const schedules: Schedule[] = await c.req.json(); // Oczekujemy tablicy zajęć
  const createdSchedules: Schedule[] = []; // Tablica do przechowywania stworzonych zajęć

  // Iterujemy po każdym elemencie w tablicy zajęć
  for (const scheduleData of schedules) {
    const { day, startTime, endTime, subject, year, classroom, teacher, course, group } = scheduleData;
    
    // Generowanie unikalnego ID
    const id = crypto.randomUUID();

    // Tworzymy nowe zajęcia z danymi z requestu
    const schedule: Schedule = {
      id,
      day,
      startTime,
      endTime,
      subject,
      year,      // Rok studiów (np. 1, 2, 3, 4)
      classroom,  // Sala wykładowa
      teacher,    // Nauczyciel przypisany do zajęć
      course,     // Kierunek studiów
      group,      // Grupa dziekańska
    };

    // Zapisujemy zajęcia w bazie danych
    await kv.set(['schedule', day, id], schedule);
    createdSchedules.push(schedule); // Dodajemy utworzone zajęcia do tablicy
  }

  // Zwracamy odpowiedź z liczbą utworzonych zajęć
  return c.json({ message: `${createdSchedules.length} schedules created.` }, 200);
});

// Pobieranie wszystkich zajęć - dostępne dla wszystkich
scheduleRoutes.get('/', verifyUser, async (c: Context) => {
  const schedules: Schedule[] = [];

  // Pobieranie wszystkich zajęć
  for await (const entry of kv.list({ prefix: ['schedule'] })) {
    schedules.push(entry.value as Schedule);  // Dodajemy zajęcia do tablicy
  }

  // Sprawdzanie, czy znaleziono jakiekolwiek zajęcia
  if (schedules.length === 0) {
    return c.json({ message: 'No schedules found', data: [] }, 200);
  }

  // Zwracamy dane o zajęciach
  return c.json({
    message: 'Schedules retrieved successfully',
    data: schedules,
  }, 200);
});

// Pobieranie wszystkich zajęć dla konkretnego dnia - dostępne dla wszystkich
scheduleRoutes.get('/:day', verifyUser, async (c: Context) => {
  const day = c.req.param('day'); // Pobranie dnia z parametru URL
  const user = c.get('user') as User; // Pobranie użytkownika z kontekstu

  // Opcjonalne zapytania (classroom, subject, grade, group, course)
  const classroom = c.req.query('classroom');
  const subject = c.req.query('subject');
  const year = c.req.query('year');
  const group = c.req.query('group');
  const course = c.req.query('course');

  const schedules: Schedule[] = [];

  // Pobieranie zajęć z bazy danych na podstawie prefiksu 'schedule' i dnia
  for await (const entry of kv.list({ prefix: ['schedule', day] })) {
    const schedule = entry.value as Schedule;

    // Filtracja zajęć na podstawie roli użytkownika
    if (user.role === 'admin') {
      // Admin może zobaczyć wszystkie zajęcia
      if ((classroom && schedule.classroom !== classroom) ||
          (subject && schedule.subject !== subject) ||
          (year && schedule.year !== year) ||
          (group && schedule.group !== group) ||
          (course && schedule.course !== course)) {
        continue;
      }
      schedules.push(schedule);
    } else if (user.role === 'teacher' && schedule.teacher === user.username) {
      // Nauczyciel widzi tylko swoje zajęcia
      if ((classroom && schedule.classroom !== classroom) ||
          (subject && schedule.subject !== subject) ||
          (year && schedule.year !== year) ||
          (group && schedule.group !== group) ||
          (course && schedule.course !== course)) {
        continue;
      }
      schedules.push(schedule);
    } else if (user.role === 'student') {
      // Student widzi zajęcia tylko dla swojego roku i kierunku
      if ((classroom && schedule.classroom !== classroom) ||
          (subject && schedule.subject !== subject) ||
          (year && schedule.year !== year) ||
          (group && schedule.group !== group) ||
          (course && schedule.course !== course)) {
        continue;
      }
      schedules.push(schedule);
    }
  }

  // Jeśli nie znaleziono żadnych zajęć
  if (schedules.length === 0) {
    return c.json({ message: 'No schedules found for the given criteria', data: [] }, 200);
  }

  // Odpowiedź z zajęciami
  return c.json({
    message: 'Schedules retrieved successfully',
    data: schedules,
  }, 200);
});


// Pobieranie konkretnego zajęcia - dostępne dla wszystkich
scheduleRoutes.get('/:day/:id', verifyUser, async (c: Context) => {
  const day = c.req.param('day');
  const id = c.req.param('id');
  const schedule = await kv.get(['schedule', day, id]);

  if (!schedule.value) {
    return c.json({ message: 'Schedule not found', data: {} }, 200);
  }

  return c.json({
    message: 'Schedule retrieved successfully',
    data: schedule.value as Schedule,
  }, 200);
});

// Aktualizowanie zajęcia - dostępne tylko dla admina
scheduleRoutes.put('/:day/:id', verifyUser, verifyAdmin, async (c: Context) => {
  const day = c.req.param('day');
  const id = c.req.param('id');
  const schedule = await kv.get(['schedule', day, id]);

  // Jeśli zajęcia nie istnieją, zwrócimy błąd
  if (!schedule.value) {
    return c.json({ message: 'Schedule not found' }, 200);  // Wiadomość o braku zajęć
  }

  // Rzutowanie na typ Schedule
  const existingSchedule = schedule.value as Schedule;

  // Pobieranie nowych danych z body żądania
  const { startTime, endTime, subject, year, classroom, teacher, course, group } = await c.req.json();

  // Tworzenie nowego obiektu zajęcia z zaktualizowanymi danymi
  const updatedSchedule: Schedule = {
    ...existingSchedule,  // Zachowanie pozostałych danych
    startTime: startTime ?? existingSchedule.startTime,
    endTime: endTime ?? existingSchedule.endTime,
    subject: subject ?? existingSchedule.subject,
    year: year ?? existingSchedule.year,
    classroom: classroom ?? existingSchedule.classroom,
    teacher: teacher ?? existingSchedule.teacher,
    course: course ?? existingSchedule.course,  // Nowe pole
    group: group ?? existingSchedule.group,    // Nowe pole
  };

  // Zapisanie zaktualizowanych danych w bazie
  await kv.set(['schedule', day, id], updatedSchedule);

  // Zwrócenie zaktualizowanego zajęcia
  return c.json(updatedSchedule, 200);  // Zwrócenie zaktualizowanego zajęcia
});


// Usuwanie zajęcia - dostępne tylko dla admina
scheduleRoutes.delete('/:day/:id', verifyUser, verifyAdmin, async (c: Context) => {  // Dodanie verifyAdmin tutaj
  const day = c.req.param('day');
  const id = c.req.param('id');
  const schedule = await kv.get(['schedule', day, id]);

  if (!schedule.value) {
    return c.json({ message: 'Schedule not found' }, 200);  // Wiadomość o braku zajęć
  }

  await kv.delete(['schedule', day, id]);
  return c.json({ message: 'Schedule deleted' }, 200);  // Potwierdzenie usunięcia zajęć
});

export { scheduleRoutes };
