export interface DecodedToken {
  username: string;
  role: string;
  exp: number;  // Data wygaśnięcia tokenu
}
