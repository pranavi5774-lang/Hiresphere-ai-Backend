// ============================================================
// HireSphere AI — Authentication core
// bcryptjs password hashing + JWT session tokens (jose, HS256).
// Tokens are delivered as httpOnly cookies (SameSite=Lax).
// ============================================================

import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { ROLES, type Role } from './constants';

function sessionSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error('SESSION_SECRET must be set to at least 32 characters in production');
    }
    return new TextEncoder().encode(secret);
  }
  return new TextEncoder().encode(secret || 'hiresphere-dev-secret-change-me-in-production');
}

export const SESSION_COOKIE = 'hs_token';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days (seconds)

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string;
  role: Role;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, name: payload.name, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer('hiresphere-ai')
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(sessionSecretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey(), { issuer: 'hiresphere-ai' });
    if (!payload.sub || !payload.role || !ROLES.includes(payload.role as Role)) return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ''),
      name: String(payload.name ?? ''),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

/** Cryptographically strong random token (for password reset flow) */
export function generateResetToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
