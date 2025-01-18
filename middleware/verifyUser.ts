import { MiddlewareHandler, Context } from 'hono';
import { isValidJWT, verifyToken } from '../utils/jwt.ts';
import { isTokenBlacklisted } from '../utils/jwt.ts';
import { kv } from '../config/kv.ts'; // Dostęp do bazy danych
import { User } from "../models/user.ts";

export const verifyUser: MiddlewareHandler = async (c: Context, next: () => Promise<void>) => {
  console.log('Starting user verification...');

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('Unauthorized: Missing or invalid token');
    return c.json({ message: 'Unauthorized: Missing or invalid token' }, 401);
  }

  const token = authHeader.split(' ')[1];
  console.log(`Received token: ${token}`);

  if (!isValidJWT(token)) {
    console.warn('Unauthorized: Invalid JWT format');
    return c.json({ message: 'Unauthorized: Invalid JWT format' }, 401);
  }

  // Sprawdzanie czarnej listy
  const isBlacklisted = await isTokenBlacklisted(token);
  if (isBlacklisted) {
    console.warn('Unauthorized: Token is blacklisted');
    return c.json({ message: 'Unauthorized: Token is blacklisted' }, 401);
  }
  console.log('Token is not blacklisted');

  try {
    const decoded = await verifyToken(token);
    console.log('Decoded token:', decoded);

    if (!decoded || !decoded.username) {
      console.warn('Unauthorized: Missing expected fields in JWT');
      return c.json({ message: 'Unauthorized: Missing expected fields in JWT' }, 401);
    }

    console.log(`Token is valid for user: ${decoded.username}`);

    // Sprawdzanie, czy token znajduje się na liście aktywnych tokenów użytkownika
    const user = await kv.get(['users', decoded.username]);
    const userData = user.value as User;

    if (!userData) {
      console.warn(`Unauthorized: User ${decoded.username} not found`);
      return c.json({ message: 'Unauthorized: User not found' }, 401);
    }

    if (!userData.tokens?.includes(token)) {
      console.warn(`Unauthorized: Token is not valid for user ${decoded.username}`);
      return c.json({ message: 'Unauthorized: Token is not valid for this user' }, 401);
    }

    console.log(`User ${decoded.username} successfully verified`);
    c.set('user', decoded);
  } catch (error) {
    console.error('JWT verification error:', error);
    return c.json({ message: 'Unauthorized: Invalid or expired token' }, 401);
  }

  console.log('User verification completed successfully');
  await next();
};
