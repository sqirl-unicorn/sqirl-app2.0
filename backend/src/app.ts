/**
 * Express application factory.
 *
 * Registers middleware (CORS, JSON body parsing) and mounts all API routes
 * under /api/v1/. Returns the configured app without starting the server
 * so it can be imported by tests without binding to a port.
 *
 * Route mount points (populated as routes are added):
 *   POST /api/v1/auth/register
 *   POST /api/v1/auth/login
 *   POST /api/v1/auth/verify-token
 */

import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

// ── API Routes (mounted as they are built) ─────────────────────────────────
// import authRouter from './routes/auth';
// app.use('/api/v1/auth', authRouter);

export default app;
