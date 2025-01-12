import { MiddlewareHandler, Context } from 'hono';
import { isValidJWT, verifyToken } from '../utils/jwt.ts';
import { isTokenBlacklisted } from '../utils/jwt.ts';  // Importujemy funkcję sprawdzającą czarną listę

export const verifyUser: MiddlewareHandler = async (c: Context, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ message: 'Unauthorized: Missing or invalid token' }, 401);
  }

  const token = authHeader.split(' ')[1];

  if (!isValidJWT(token)) {
    return c.json({ message: 'Unauthorized: Invalid JWT format' }, 401);
  }

  // Sprawdzamy, czy token jest na czarnej liście
  if (await isTokenBlacklisted(token)) {
    return c.json({ message: 'Unauthorized: Token is blacklisted' }, 401);
  }

  try {
    const decoded = await verifyToken(token);  // Verify token sprawdza wygasłe tokeny
    if (!decoded || !decoded.username) {
      return c.json({ message: 'Unauthorized: Missing expected fields in JWT' }, 401);
    }

    c.set('user', decoded);
  } catch (error) {
    console.error('JWT verification error:', error);
    return c.json({ message: 'Unauthorized: Invalid or expired token' }, 401);
  }

  await next();
};

