import { Hono } from 'hono';
import { messagesRoutes } from './controllers/messages.ts';
import { scheduleRoutes } from './controllers/schedules.ts';
import { authRoutes } from './controllers/auth.ts';

const app = new Hono();

app.route('/messages', messagesRoutes);
app.route('/schedules', scheduleRoutes);
app.route('/auth', authRoutes);

// Uruchomienie serwera
Deno.serve(app.fetch);

export { app };