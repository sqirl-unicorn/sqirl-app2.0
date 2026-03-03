/**
 * Lists routes — /api/v1/lists
 *
 * Handles shopping lists (general, grocery) and todo lists.
 * All routes require authentication. List access is enforced via household
 * membership check in listService (SQIRL-LIST-ACCESS-001).
 *
 * Route map:
 *   GET    /lists                              — get all visible lists
 *   POST   /lists                              — create list
 *   PUT    /lists/:listId                      — rename list
 *   DELETE /lists/:listId                      — delete list
 *   GET    /lists/:listId/items                — get items (general/grocery)
 *   POST   /lists/:listId/items                — add item
 *   PUT    /lists/:listId/items/:itemId        — update item
 *   DELETE /lists/:listId/items/:itemId        — delete item
 *   PUT    /lists/items/:itemId/move           — move item to another list
 *   GET    /lists/:listId/tasks                — get tasks + subtasks (todo)
 *   POST   /lists/:listId/tasks                — add task
 *   PUT    /lists/:listId/tasks/:taskId        — update task
 *   DELETE /lists/:listId/tasks/:taskId        — delete task
 *   POST   /lists/:listId/tasks/:taskId/subtasks              — add subtask
 *   PUT    /lists/:listId/tasks/:taskId/subtasks/:subtaskId   — update subtask
 *   DELETE /lists/:listId/tasks/:taskId/subtasks/:subtaskId   — delete subtask
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import * as listService from '../services/listService';

const router = Router();

// All list routes require a valid JWT
router.use(authenticate);

// ── Error code → HTTP status mapping ─────────────────────────────────────────

const ERROR_STATUS: Record<string, number> = {
  'SQIRL-LIST-ACCESS-001': 404,
  'SQIRL-LIST-CREATE-001': 400,
  'SQIRL-LIST-CREATE-002': 400,
  'SQIRL-LIST-ITEM-001': 404,
  'SQIRL-LIST-ITEM-002': 400,
  'SQIRL-LIST-ITEM-003': 400,
  'SQIRL-LIST-MOVE-001': 404,
  'SQIRL-LIST-TASK-001': 404,
  'SQIRL-LIST-TASK-002': 400,
  'SQIRL-LIST-TASK-003': 400,
  'SQIRL-LIST-SUB-001': 404,
  'SQIRL-LIST-SUB-002': 400,
  'SQIRL-LIST-SUB-003': 400,
};

/**
 * Handle service-layer errors with correct HTTP status and errorCode field.
 * Falls through to 500 for unexpected errors.
 */
function handleError(res: Response, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const status = ERROR_STATUS[msg] ?? 500;
  const errorCode = ERROR_STATUS[msg] ? msg : 'SQIRL-LIST-SERVER-001';
  if (status === 500) {
    console.error(`[lists] Unexpected error: ${msg}`, err);
  }
  res.status(status).json({ error: msg, errorCode });
}

// ── Lists CRUD ────────────────────────────────────────────────────────────────

/**
 * GET /lists — return all visible lists for the authenticated user.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const lists = await listService.getLists(req.user!.userId);
    res.json({ lists });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * POST /lists — create a new list.
 * Body: { name, listType, clientId? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, listType, clientId } = req.body as {
      name?: string;
      listType?: string;
      clientId?: string;
    };
    const isTest = false;
    const list = await listService.createList(
      req.user!.userId,
      name ?? '',
      listType ?? '',
      clientId ?? null,
      isTest
    );
    res.status(201).json({ list });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * PUT /lists/:listId — rename a list.
 * Body: { name }
 */
router.put('/:listId', async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name?: string };
    const list = await listService.renameList(req.params.listId, req.user!.userId, name ?? '');
    res.json({ list });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * DELETE /lists/:listId — soft-delete a list.
 */
router.delete('/:listId', async (req: Request, res: Response) => {
  try {
    await listService.deleteList(req.params.listId, req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

// ── Move item (registered before /:listId/items to avoid route conflicts) ─────

/**
 * PUT /lists/items/:itemId/move — move an item to a different list.
 * Body: { targetListId }
 */
router.put('/items/:itemId/move', async (req: Request, res: Response) => {
  try {
    const { targetListId } = req.body as { targetListId?: string };
    if (!targetListId) {
      res.status(400).json({ error: 'targetListId is required', errorCode: 'SQIRL-LIST-MOVE-001' });
      return;
    }
    const item = await listService.moveItem(req.params.itemId, targetListId, req.user!.userId);
    res.json({ item });
  } catch (err) {
    handleError(res, err);
  }
});

// ── List items ────────────────────────────────────────────────────────────────

/**
 * GET /lists/:listId/items — get all items for a list.
 */
router.get('/:listId/items', async (req: Request, res: Response) => {
  try {
    const items = await listService.getItems(req.params.listId, req.user!.userId);
    res.json({ items });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * POST /lists/:listId/items — add an item to a list.
 * Body: { description, packSize?, unit?, quantity?, clientId? }
 */
router.post('/:listId/items', async (req: Request, res: Response) => {
  try {
    const { description, packSize, unit, quantity, clientId } = req.body as {
      description?: string;
      packSize?: string;
      unit?: string;
      quantity?: number;
      clientId?: string;
    };
    const item = await listService.addItem(
      req.params.listId,
      req.user!.userId,
      description ?? '',
      packSize ?? null,
      unit ?? null,
      quantity ?? null,
      clientId ?? null,
      false
    );
    res.status(201).json({ item });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * PUT /lists/:listId/items/:itemId — update an item.
 * Body: { description?, packSize?, unit?, quantity?, isPurchased?, position? }
 */
router.put('/:listId/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { description, packSize, unit, quantity, isPurchased, position } = req.body as {
      description?: string;
      packSize?: string | null;
      unit?: string | null;
      quantity?: number | null;
      isPurchased?: boolean;
      position?: number;
    };
    const fields: Parameters<typeof listService.updateItem>[3] = {};
    if (description !== undefined) fields.description = description;
    if ('packSize' in req.body) fields.packSize = packSize;
    if ('unit' in req.body) fields.unit = unit;
    if ('quantity' in req.body) fields.quantity = quantity;
    if (isPurchased !== undefined) fields.isPurchased = isPurchased;
    if (position !== undefined) fields.position = position;

    const item = await listService.updateItem(req.params.listId, req.params.itemId, req.user!.userId, fields);
    res.json({ item });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * DELETE /lists/:listId/items/:itemId — soft-delete an item.
 */
router.delete('/:listId/items/:itemId', async (req: Request, res: Response) => {
  try {
    await listService.deleteItem(req.params.listId, req.params.itemId, req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

// ── Todo tasks ────────────────────────────────────────────────────────────────

/**
 * GET /lists/:listId/tasks — get all tasks with subtasks.
 */
router.get('/:listId/tasks', async (req: Request, res: Response) => {
  try {
    const tasks = await listService.getTasks(req.params.listId, req.user!.userId);
    res.json({ tasks });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * POST /lists/:listId/tasks — add a task.
 * Body: { title, dueDate?, clientId? }
 */
router.post('/:listId/tasks', async (req: Request, res: Response) => {
  try {
    const { title, dueDate, clientId } = req.body as {
      title?: string;
      dueDate?: string;
      clientId?: string;
    };
    const task = await listService.addTask(
      req.params.listId,
      req.user!.userId,
      title ?? '',
      dueDate ?? null,
      clientId ?? null,
      false
    );
    res.status(201).json({ task });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * PUT /lists/:listId/tasks/:taskId — update a task.
 * Body: { title?, dueDate?, isCompleted?, manualProgress?, useManualProgress?, position? }
 */
router.put('/:listId/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const { title, dueDate, isCompleted, manualProgress, useManualProgress, position } = req.body as {
      title?: string;
      dueDate?: string | null;
      isCompleted?: boolean;
      manualProgress?: number | null;
      useManualProgress?: boolean;
      position?: number;
    };
    const fields: Parameters<typeof listService.updateTask>[3] = {};
    if (title !== undefined) fields.title = title;
    if ('dueDate' in req.body) fields.dueDate = dueDate;
    if (isCompleted !== undefined) fields.isCompleted = isCompleted;
    if ('manualProgress' in req.body) fields.manualProgress = manualProgress;
    if (useManualProgress !== undefined) fields.useManualProgress = useManualProgress;
    if (position !== undefined) fields.position = position;

    const task = await listService.updateTask(req.params.listId, req.params.taskId, req.user!.userId, fields);
    res.json({ task });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * DELETE /lists/:listId/tasks/:taskId — soft-delete a task and its subtasks.
 */
router.delete('/:listId/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    await listService.deleteTask(req.params.listId, req.params.taskId, req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

// ── Subtasks ──────────────────────────────────────────────────────────────────

/**
 * POST /lists/:listId/tasks/:taskId/subtasks — add a subtask.
 * Body: { title, dueDate?, clientId? }
 */
router.post('/:listId/tasks/:taskId/subtasks', async (req: Request, res: Response) => {
  try {
    const { title, dueDate, clientId } = req.body as {
      title?: string;
      dueDate?: string;
      clientId?: string;
    };
    const subtask = await listService.addSubtask(
      req.params.listId,
      req.params.taskId,
      req.user!.userId,
      title ?? '',
      dueDate ?? null,
      clientId ?? null,
      false
    );
    res.status(201).json({ subtask });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * PUT /lists/:listId/tasks/:taskId/subtasks/:subtaskId — update a subtask.
 * Body: { title?, dueDate?, isCompleted?, position? }
 */
router.put('/:listId/tasks/:taskId/subtasks/:subtaskId', async (req: Request, res: Response) => {
  try {
    const { title, dueDate, isCompleted, position } = req.body as {
      title?: string;
      dueDate?: string | null;
      isCompleted?: boolean;
      position?: number;
    };
    const fields: Parameters<typeof listService.updateSubtask>[4] = {};
    if (title !== undefined) fields.title = title;
    if ('dueDate' in req.body) fields.dueDate = dueDate;
    if (isCompleted !== undefined) fields.isCompleted = isCompleted;
    if (position !== undefined) fields.position = position;

    const subtask = await listService.updateSubtask(
      req.params.listId,
      req.params.taskId,
      req.params.subtaskId,
      req.user!.userId,
      fields
    );
    res.json({ subtask });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * DELETE /lists/:listId/tasks/:taskId/subtasks/:subtaskId — soft-delete a subtask.
 */
router.delete('/:listId/tasks/:taskId/subtasks/:subtaskId', async (req: Request, res: Response) => {
  try {
    await listService.deleteSubtask(
      req.params.listId,
      req.params.taskId,
      req.params.subtaskId,
      req.user!.userId
    );
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

export default router;
