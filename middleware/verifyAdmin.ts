import { MiddlewareHandler, Context } from 'hono';

export const verifyAdmin: MiddlewareHandler = async (c: Context, next: () => Promise<void>) => {
  const user = c.get('user');  // Pobieranie użytkownika z kontekstu

  if (!user || user.role !== 'admin') {
    return c.json({ message: 'Forbidden: Admin role required' }, 403);
  }

  await next();  // Kontynuowanie przetwarzania żądania
};