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
 *   GET    /api/v1/lists
 *   POST   /api/v1/lists
 *   PUT    /api/v1/lists/:listId
 *   DELETE /api/v1/lists/:listId
 *   GET    /api/v1/lists/:listId/items
 *   POST   /api/v1/lists/:listId/items
 *   PUT    /api/v1/lists/:listId/items/:itemId
 *   DELETE /api/v1/lists/:listId/items/:itemId
 *   PUT    /api/v1/lists/items/:itemId/move
 *   GET    /api/v1/lists/:listId/tasks
 *   POST   /api/v1/lists/:listId/tasks
 *   PUT    /api/v1/lists/:listId/tasks/:taskId
 *   DELETE /api/v1/lists/:listId/tasks/:taskId
 *   POST   /api/v1/lists/:listId/tasks/:taskId/subtasks
 *   PUT    /api/v1/lists/:listId/tasks/:taskId/subtasks/:subtaskId
 *   DELETE /api/v1/lists/:listId/tasks/:taskId/subtasks/:subtaskId
 *   GET    /api/v1/loyalty-cards
 *   POST   /api/v1/loyalty-cards
 *   PUT    /api/v1/loyalty-cards/:cardId
 *   DELETE /api/v1/loyalty-cards/:cardId
 *   GET    /api/v1/gift-cards
 *   POST   /api/v1/gift-cards
 *   PUT    /api/v1/gift-cards/:cardId
 *   PUT    /api/v1/gift-cards/:cardId/balance
 *   POST   /api/v1/gift-cards/:cardId/transactions
 *   GET    /api/v1/gift-cards/:cardId/transactions
 *   PUT    /api/v1/gift-cards/:cardId/archive
 *   DELETE /api/v1/gift-cards/:cardId
 *   GET    /api/v1/expenses/categories
 *   POST   /api/v1/expenses/categories
 *   PUT    /api/v1/expenses/categories/:id
 *   DELETE /api/v1/expenses/categories/:id
 *   GET    /api/v1/expenses/budgets
 *   PUT    /api/v1/expenses/budgets/:categoryId
 *   POST   /api/v1/expenses/budgets/carry-forward
 *   GET    /api/v1/expenses
 *   POST   /api/v1/expenses
 *   PUT    /api/v1/expenses/:id
 *   DELETE /api/v1/expenses/:id
 *   GET    /api/v1/expenses/:id/move-check
 *   POST   /api/v1/expenses/:id/move
 *   POST   /api/v1/analytics/events
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
import listsRouter from './routes/lists';
import loyaltyCardsRouter from './routes/loyaltyCards';
import giftCardsRouter from './routes/giftCards';
import expensesRouter from './routes/expenses';
import analyticsRouter from './routes/analytics';

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/profile', profileRouter);
app.use('/api/v1/household', householdRouter);
app.use('/api/v1/invitations', invitationsRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/lists', listsRouter);
app.use('/api/v1/loyalty-cards', loyaltyCardsRouter);
app.use('/api/v1/gift-cards', giftCardsRouter);
app.use('/api/v1/expenses', expensesRouter);
app.use('/api/v1/analytics', analyticsRouter);

export default app;
