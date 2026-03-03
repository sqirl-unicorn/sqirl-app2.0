/**
 * Express application factory.
 *
 * Registers middleware (CORS, JSON body parsing) and mounts all API routes
 * under /api/v1/. Returns the configured app without starting the server
 * so it can be imported by tests without binding to a port.
 *
 * Route mount points:
 *   POST   /api/v1/auth/register
 *   POST   /api/v1/auth/login
 *   GET    /api/v1/auth/verify
 *   GET    /api/v1/profile
 *   PUT    /api/v1/profile
 *   GET    /api/v1/household
 *   PUT    /api/v1/household
 *   POST   /api/v1/household/invite
 *   GET    /api/v1/household/invitations
 *   POST   /api/v1/household/members/:userId/promote
 *   POST   /api/v1/household/members/:userId/demote
 *   DELETE /api/v1/household/members/:userId
 *   POST   /api/v1/household/exit
 *   GET    /api/v1/household/copy-requests
 *   POST   /api/v1/household/copy-requests
 *   PUT    /api/v1/household/copy-requests/:id/review
 *   GET    /api/v1/invitations
 *   POST   /api/v1/invitations/:token/accept
 *   POST   /api/v1/invitations/:id/decline
 *   GET    /api/v1/notifications
 *   GET    /api/v1/notifications/unread-count
 *   PUT    /api/v1/notifications/read-all
 *   PUT    /api/v1/notifications/:id/read
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

// ── API Routes ───────────────────────────────────────────────────────────────
import authRouter from './routes/auth';
import profileRouter from './routes/profile';
import householdRouter from './routes/household';
import invitationsRouter from './routes/invitations';
import notificationsRouter from './routes/notifications';

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/profile', profileRouter);
app.use('/api/v1/household', householdRouter);
app.use('/api/v1/invitations', invitationsRouter);
app.use('/api/v1/notifications', notificationsRouter);

export default app;
