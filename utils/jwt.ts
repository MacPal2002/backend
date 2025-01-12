import { create, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { User } from '../models/user.ts';
import { DecodedToken } from "../models/token.ts"
import { secretKey } from '../config/secrets.ts';
import { kv } from '../config/kv.ts'; 

// Funkcja do dodania tokenu do czarnej listy
export async function blacklistToken(token: string) {
  try {
    // Przechowywanie tokenu w bazie danych kv z prefiksem 'blacklisted_tokens/'
    await kv.set(['blacklisted_tokens', token], true);  // Zapisujemy token na czarnej liście
  } catch (error) {
    console.error("Error blacklisting token:", error);
  }
}
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  try {
    console.log(`Checking if token is blacklisted: ${token}`);
    
    // Sprawdzamy, czy token jest na czarnej liście
    const tokenOnBlacklist = await kv.get(['blacklisted_tokens', token]);

    if (tokenOnBlacklist?.value) {
      console.log(`Token ${token} is on the blacklist.`);
      return true;
    }
    
    console.log(`Token ${token} is not on the blacklist.`);
    return false;
  } catch (error) {
    console.error("Error checking if token is blacklisted:", error);
    return false; // Zakładamy, że token nie jest na czarnej liście w przypadku błędu
  }
}



// Weryfikacja tokenu JWT
export async function verifyToken(token: string): Promise<DecodedToken> {
  try {
    console.log('Starting token verification...');

    // Sprawdzamy, czy token jest na czarnej liście
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      console.log('Token is blacklisted');
      throw new Error('Token is blacklisted');
    } else {
      console.log('Token is not blacklisted');
    }

    // Sprawdzamy poprawność tokenu
    console.log('Verifying token with secretKey...');
    
    // verify() zwraca Payload, który musimy przekształcić na DecodedToken
    const decoded = await verify(token, secretKey) as unknown;  // Rzutowanie na unknown
    
    // Teraz, kiedy mamy unknown, możemy bezpiecznie rzutować na DecodedToken
    const decodedToken = decoded as DecodedToken;

    console.log('Decoded JWT:', decodedToken);  // Logowanie dekodowanego tokenu

    // Sprawdzanie, czy token nie jest przeterminowany
    if (decodedToken.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token has expired');
    }

    return decodedToken;
  } catch (error) {
    console.error('JWT verification error:', error);
    throw new Error('JWT verification failed');
  }
}




// Funkcja do sprawdzenia, czy token ma prawidłowy format
export function isValidJWT(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.error("Invalid JWT format");
    return false;
  }
  return true;
}

// Tworzenie tokenu JWT
export async function createJWT(user: User) {
  try {
    const payload = {
      username: user.username,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365, // 1 rok w sekundach
    };

    console.log("Creating JWT with payload:", payload);

    if (!secretKey) {
      throw new Error("Signing key is missing");
    }

    const jwt = await create({ alg: "HS256", typ: "JWT" }, payload, secretKey);
    console.log("Generated JWT:", jwt);

    return jwt;
  } catch (error) {
    console.error("Error creating JWT:", error);
    throw new Error("Error creating JWT");
  }
}

