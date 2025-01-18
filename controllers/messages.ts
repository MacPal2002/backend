import { Hono, Context } from 'hono';
import { Message } from '../models/message.ts';  // Interfejs Message, który definiuje strukturę wiadomości
import { verifyAdmin } from '../middleware/verifyAdmin.ts';  // Middleware do weryfikacji admina
import { verifyUser } from '../middleware/verifyUser.ts';  // Middleware do weryfikacji użytkownika
import { kv } from '../config/kv.ts';  // Dostęp do bazy danych

const messagesRoutes = new Hono();

messagesRoutes.post('/', verifyUser, verifyAdmin, async (c: Context) => {
  const messagesData = await c.req.json(); // Pobieranie danych wielu wiadomości

  // Tworzenie tablicy z wiadomościami
  const messages = await Promise.all(messagesData.map(async (data: { from: string, to: string, subject: string, body: string }) => {
    const { from, to, subject, body } = data;
    const id = crypto.randomUUID(); // Generowanie unikalnego ID dla wiadomości
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // Data w formacie YYYY-MM-DD
    const time = now.toTimeString().split(' ')[0]; // Czas w formacie HH:MM:SS

    // Tworzenie obiektu wiadomości
    const message: Message = {
      id,
      from,
      to,
      subject,
      body,
      date,
      time,
      read: false,  // Nowa wiadomość jest domyślnie nieprzeczytana
    };

    // Zapisanie wiadomości w bazie danych
    await kv.set(['messages', id], message);
    console.log({ message: `Message created with ID: ${id}` });

    return message;
  }));

  return c.json({ message: `Created ${messages.length} messages.` }, 201); // Zwrócenie odpowiedzi
});


// Pobieranie wszystkich wiadomości - dostępne tylko dla admina
messagesRoutes.get('/', verifyUser, verifyAdmin, async (c: Context) => {
  const messages: Message[] = [];
  for await (const entry of kv.list({ prefix: ['messages'] })) {
    messages.push(entry.value as Message); // Rzutowanie na typ Message
  }

  return c.json({
    message: messages.length > 0 ? 'Messages retrieved successfully' : 'No messages found',
    data: messages,
  }, 200);
});


// Pobieranie wiadomości zalogowanego użytkownika - dostępne tylko dla zalogowanego użytkownika
messagesRoutes.get('/user', verifyUser, async (c: Context) => {
  const user = c.get('user'); // Pobranie danych użytkownika z kontekstu
  console.log("Getting messages from:", user);
  
  const messages: Message[] = [];

  // Sprawdzanie wszystkich wiadomości w bazie danych
  for await (const entry of kv.list({ prefix: ['messages'] })) {
    // Rzutowanie typu entry.value na Message
    const message = entry.value as Message; // Rzutowanie na typ Message

    // Filtrowanie wiadomości dla danego użytkownika
    if (message.to === user.username) {
      messages.push(message); // Dodanie wiadomości użytkownika
    }
  }

  return c.json({
    message: messages.length > 0 ? 'Messages retrieved successfully' : 'No messages found',
    data: messages,
  }, 200);
});


// Pobieranie konkretnej wiadomości - dostępne dla zalogowanego użytkownika lub admina
messagesRoutes.get('/:id', verifyUser, async (c: Context) => {
  const user = c.get('user'); // Pobranie danych użytkownika z kontekstu
  const id = c.req.param('id'); // Pobranie id wiadomości z parametru w URL

  const message = await kv.get(['messages', id]);
  const messageData = message.value as Message;

  if (!messageData) {
    return c.json({ message: 'Message not found', data: {} }, 200);
  }

  if (messageData.to !== user.username && !(user.role === 'admin')) {
    return c.json({ message: 'Access denied', data: {} }, 200);
  }

  return c.json({
    message: 'Message retrieved successfully',
    data: messageData,
  }, 200);
});


// Usuwanie wiadomości - dostępne tylko dla admina
messagesRoutes.delete('/:id', verifyUser, verifyAdmin, async (c: Context) => {
  const id = c.req.param('id');
  const message = await kv.get(['messages', id]);

  if (!message.value) {
    return c.json({ message: 'Message not found', data: {} }, 200);
  }

  await kv.delete(['messages', id]);
  return c.json({
    message: 'Message deleted',
    data: {},
  }, 200);
});


// Aktualizowanie wiadomości - dostępne tylko dla admina
messagesRoutes.put('/:id', verifyUser, verifyAdmin, async (c: Context) => {
  const id = c.req.param('id');
  const message = await kv.get(['messages', id]);

  if (!message.value) {
    return c.json({ message: 'Message not found', data: {} }, 200);
  }

  const messageData = message.value as Message;

  const { subject, body, readed } = await c.req.json();

  const updatedMessage: Message = {
    ...messageData,
    subject: subject ?? messageData.subject,
    body: body ?? messageData.body,
    read: readed ?? messageData.read,
  };

  await kv.set(['messages', id], updatedMessage);

  return c.json({
    message: 'Message updated successfully',
    data: updatedMessage,
  }, 200);
});



export { messagesRoutes }; // Eksportowanie tras do użycia w głównym pliku serwera
