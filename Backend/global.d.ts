declare const process: {
  env: Record<string, string | undefined>;
};

declare module "cors" {
  import type { RequestHandler } from "express";
  function cors(...args: unknown[]): RequestHandler;
  export default cors;
}

declare module "dotenv" {
  export function config(): void;
}

declare module "express" {
  export interface AuthUser {
    id: number;
    email: string;
    displayName: string;
    role: string;
  }

  export interface Request {
    params: Record<string, string>;
    query: Record<string, string | string[] | undefined>;
    body: any;
    headers: Record<string, string | undefined>;
    user?: AuthUser;
  }

  export interface Response {
    json(body: unknown): Response;
    status(code: number): Response;
    send(body?: unknown): Response;
  }

  export type NextFunction = (error?: unknown) => void;
  export type RequestHandler = (req: Request, res: Response, next: NextFunction) => unknown;

  export interface Router {
    get(path: string, ...handlers: RequestHandler[]): Router;
    post(path: string, ...handlers: RequestHandler[]): Router;
    put(path: string, ...handlers: RequestHandler[]): Router;
    delete(path: string, ...handlers: RequestHandler[]): Router;
  }

  export interface Application extends Router {
    use(...args: unknown[]): Application;
    listen(port: number, callback?: () => void): unknown;
    get(path: string, ...handlers: RequestHandler[]): Application;
  }

  export function Router(): Router;
  export function json(options?: unknown): RequestHandler;
  export interface ExpressFactory {
    (): Application;
    json(options?: unknown): RequestHandler;
    Router(): Router;
  }

  const express: ExpressFactory;
  export default express;
}

declare module "crypto" {
  export interface Hash {
    update(data: string): Hash;
    digest(encoding: "hex"): string;
  }

  export function createHash(algorithm: string): Hash;
  export function randomBytes(size: number): { toString(encoding: "hex"): string };
  export function pbkdf2Sync(password: string, salt: string, iterations: number, keylen: number, digest: string): { toString(encoding: "hex"): string };
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}

declare module "mysql2/promise" {
  export interface ResultSetHeader {
    affectedRows: number;
    insertId: number;
    warningStatus: number;
  }

  export interface Pool {
    query<T>(sql: string, params?: unknown[]): Promise<[T[], unknown]>;
    execute<T>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
  }

  export function createPool(config: Record<string, unknown>): Pool;
  const mysql: {
    createPool: typeof createPool;
  };
  export default mysql;
}
