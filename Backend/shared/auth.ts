import crypto from "crypto";
import type { Request, Response } from "express";
import { execute, query } from "./database";

const TOKEN_TTL_DAYS = Number(process.env.AUTH_TOKEN_TTL_DAYS || 7);
const DEFAULT_USER_EMAIL = process.env.AUTH_DEFAULT_EMAIL || "admin@nfr.local";
const DEFAULT_USER_PASSWORD = process.env.AUTH_DEFAULT_PASSWORD || "Admin123!";
const DEFAULT_USER_NAME = process.env.AUTH_DEFAULT_NAME || "Admin User";

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
}

interface SessionRow extends AuthUser {
  expiresAt: string;
}

interface UserRow extends AuthUser {
  passwordHash: string;
  isActive: number;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) {
    return false;
  }

  const actual = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return actual === expected;
}

function readBearerToken(req: Request): string | null {
  const header = req.headers?.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

export async function ensureDefaultUser(): Promise<void> {
  const rows = await query<{ total: number }>("SELECT COUNT(*) AS total FROM users");
  const total = Number(rows[0]?.total || 0);

  if (total > 0) {
    return;
  }

  await execute(
    `INSERT INTO users (email, displayName, role, passwordHash, isActive, createdAt)
     VALUES (?, ?, ?, ?, 1, NOW())`,
    [DEFAULT_USER_EMAIL.toLowerCase(), DEFAULT_USER_NAME, "admin", hashPassword(DEFAULT_USER_PASSWORD)],
  );

  // Ensure default account can be identified quickly in logs.
  await execute(
    `INSERT INTO audit_logs (userId, userEmail, action, entityType, entityId, details, createdAt)
     SELECT id, email, 'SYSTEM_BOOTSTRAP_USER', 'auth', email, ?, NOW()
     FROM users WHERE email = ? LIMIT 1`,
    [JSON.stringify({ reason: "auto-created default user" }), DEFAULT_USER_EMAIL.toLowerCase()],
  );
}

export async function loginWithEmail(email: string, password: string): Promise<{ token: string; user: AuthUser } | null> {
  await ensureDefaultUser();

  const rows = await query<UserRow>(
    `SELECT id, email, displayName, role, passwordHash, isActive
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email.toLowerCase()],
  );

  const user = rows[0];
  if (!user || user.isActive !== 1) {
    return null;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return null;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashValue(token);

  await execute(
    `INSERT INTO user_sessions (userId, tokenHash, expiresAt, createdAt)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
    [user.id, tokenHash, TOKEN_TTL_DAYS],
  );

  await execute(`UPDATE users SET lastLoginAt = NOW() WHERE id = ?`, [user.id]);

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  };
}

export async function getAuthUserFromRequest(req: Request): Promise<AuthUser | null> {
  if (req.user) {
    return req.user;
  }

  const token = readBearerToken(req);
  if (!token) {
    return null;
  }

  const tokenHash = hashValue(token);
  const rows = await query<SessionRow>(
    `SELECT u.id, u.email, u.displayName, u.role, s.expiresAt
     FROM user_sessions s
     INNER JOIN users u ON u.id = s.userId
     WHERE s.tokenHash = ?
       AND s.expiresAt > NOW()
       AND u.isActive = 1
     LIMIT 1`,
    [tokenHash],
  );

  const session = rows[0];
  if (!session) {
    return null;
  }

  req.user = {
    id: session.id,
    email: session.email,
    displayName: session.displayName,
    role: session.role,
  };

  return req.user;
}

export async function requireAuthUser(req: Request, res: Response): Promise<AuthUser | null> {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }

  return user;
}

export async function logoutFromRequest(req: Request): Promise<void> {
  const token = readBearerToken(req);
  if (!token) {
    return;
  }

  await execute(`DELETE FROM user_sessions WHERE tokenHash = ?`, [hashValue(token)]);
}
