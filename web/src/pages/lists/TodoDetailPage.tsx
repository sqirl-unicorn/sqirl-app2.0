/**
 * TodoDetailPage — detail view for a To Do list.
 *
 * Displays tasks with inline subtasks.
 * Each task has:
 *   - Title, optional due date
 *   - Progress bar (auto from subtask completion, or manually overridden)
 *   - Collapsible subtask list
 *
 * Subtasks have:
 *   - Title, optional due date (must not exceed task due date)
 *   - Completion checkbox
 *
 * Polls every 30 s for real-time household updates.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useListsStore } from '../../store/listsStore';
import * as wsClient from '../../lib/wsClient';
import { analytics } from '../../lib/analyticsService';
import type { ShoppingList, TodoTask, TodoSubtask } from '@sqirl/shared';

export default function TodoDetailPage() {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const { lists, tasks, setTasks, setError } = useListsStore();

  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [addingSubtask, setAddingSubtask] = useState<string | null>(null);
  const [newSubTitle, setNewSubTitle] = useState('');
  const [newSubDue, setNewSubDue] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDue, setEditTaskDue] = useState('');
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubTitle, setEditSubTitle] = useState('');
  const [editSubDue, setEditSubDue] = useState('');
  const [manualProgressId, setManualProgressId] = useState<string | null>(null);
  const fetchTasks = useCallback(async () => {
    if (!listId) return;
    try {
      const { tasks: ts } = await api.getTasks(listId);
      setTasks(ts);
    } catch {
      setError('Failed to load tasks');
    }
  }, [listId, setTasks, setError]);

  useEffect(() => {
    if (!listId) return;
    setList(lists.find((l) => l.id === listId) ?? null);
    setLoading(true);
    void fetchTasks().finally(() => setLoading(false));
    return wsClient.on('lists:changed', () => void fetchTasks());
  }, [listId, lists, fetchTasks]);

  function toggleExpand(taskId: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  }

  async function handleAddTask() {
    if (!listId || !newTaskTitle.trim()) return;
    try {
      setActionLoading('add-task');
      const { task } = await api.addTask(listId, { title: newTaskTitle.trim(), dueDate: newTaskDue || undefined });
      analytics.track('list.task_added', { hasDueDate: !!newTaskDue });
      setTasks([...tasks, task]);
      setNewTaskTitle('');
      setNewTaskDue('');
      setAddingTask(false);
    } catch {
      setError('Failed to add task');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleTask(task: TodoTask) {
    if (!listId) return;
    try {
      setActionLoading(task.id);
      const { task: updated } = await api.updateTask(listId, task.id, { isCompleted: !task.isCompleted });
      if (!task.isCompleted) analytics.track('list.task_completed', {});
      setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      setError('Failed to update task');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveTaskEdit(task: TodoTask) {
    if (!listId) return;
    try {
      setActionLoading(task.id);
      const { task: updated } = await api.updateTask(listId, task.id, {
        title: editTaskTitle.trim() || task.title,
        dueDate: editTaskDue || null,
      });
      setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
      setEditingTaskId(null);
    } catch {
      setError('Failed to update task');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!listId || !confirm('Delete this task and all its subtasks?')) return;
    try {
      setActionLoading(taskId);
      await api.deleteTask(listId, taskId);
      setTasks(tasks.filter((t) => t.id !== taskId));
    } catch {
      setError('Failed to delete task');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSetManualProgress(task: TodoTask, value: number) {
    if (!listId) return;
    try {
      const { task: updated } = await api.updateTask(listId, task.id, { useManualProgress: true, manualProgress: value });
      setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      setError('Invalid progress value');
    }
  }

  async function handleDisableManualProgress(task: TodoTask) {
    if (!listId) return;
    try {
      const { task: updated } = await api.updateTask(listId, task.id, { useManualProgress: false });
      setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      setError('Failed to update task');
    }
  }

  async function handleAddSubtask(taskId: string) {
    if (!listId || !newSubTitle.trim()) return;
    try {
      setActionLoading(`sub-${taskId}`);
      const { subtask } = await api.addSubtask(listId, taskId, { title: newSubTitle.trim(), dueDate: newSubDue || undefined });
      setTasks(tasks.map((t) => t.id === taskId ? { ...t, subtasks: [...t.subtasks, subtask] } : t));
      setNewSubTitle('');
      setNewSubDue('');
      setAddingSubtask(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(msg === 'SQIRL-LIST-SUB-003' ? 'Subtask due date cannot exceed task due date' : 'Failed to add subtask');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleSubtask(task: TodoTask, subtask: TodoSubtask) {
    if (!listId) return;
    try {
      setActionLoading(subtask.id);
      const { subtask: updated } = await api.updateSubtask(listId, task.id, subtask.id, { isCompleted: !subtask.isCompleted });
      // Re-fetch tasks to get updated progress
      const { tasks: refreshed } = await api.getTasks(listId);
      setTasks(refreshed.map((t) => t.id === task.id ? { ...t, subtasks: t.subtasks.map((s) => s.id === updated.id ? updated : s) } : t));
    } catch {
      setError('Failed to update subtask');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteSubtask(taskId: string, subtaskId: string) {
    if (!listId) return;
    try {
      setActionLoading(subtaskId);
      await api.deleteSubtask(listId, taskId, subtaskId);
      setTasks(tasks.map((t) => t.id === taskId ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) } : t));
    } catch {
      setError('Failed to delete subtask');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveSubEdit(task: TodoTask, sub: TodoSubtask) {
    if (!listId) return;
    try {
      setActionLoading(sub.id);
      const { subtask: updated } = await api.updateSubtask(listId, task.id, sub.id, {
        title: editSubTitle.trim() || sub.title,
        dueDate: editSubDue || null,
      });
      setTasks(tasks.map((t) => t.id === task.id ? { ...t, subtasks: t.subtasks.map((s) => s.id === updated.id ? updated : s) } : t));
      setEditingSubId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(msg === 'SQIRL-LIST-SUB-003' ? 'Subtask due date cannot exceed task due date' : 'Failed to update subtask');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>;
  if (!list) return <div className="p-8 text-gray-400">List not found</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="text-xl font-semibold text-gray-800 flex-1">{list.name}</h1>
        <span className="text-xs text-gray-400 uppercase tracking-wide">To Do</span>
      </div>

      {/* Add task button */}
      {!addingTask ? (
        <button
          onClick={() => setAddingTask(true)}
          className="mb-6 flex items-center gap-2 text-sm text-primary-400 hover:text-primary-600 font-medium"
        >
          <span className="text-xl leading-none">+</span> New task
        </button>
      ) : (
        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
          <input
            autoFocus
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAddTask(); if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle(''); } }}
            placeholder="Task title *"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Due date</label>
            <input
              type="date"
              value={newTaskDue}
              onChange={(e) => setNewTaskDue(e.target.value)}
              className="px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void handleAddTask()}
              disabled={actionLoading === 'add-task' || !newTaskTitle.trim()}
              className="px-4 py-2 bg-primary-400 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Add task
            </button>
            <button onClick={() => { setAddingTask(false); setNewTaskTitle(''); setNewTaskDue(''); }} className="px-3 py-2 text-gray-500 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No tasks yet</div>
      ) : (
        <ul className="space-y-3">
          {tasks.filter((t) => !t.isDeleted).map((task) => {
            const isExpanded = expandedTasks.has(task.id);
            const subtasks = task.subtasks.filter((s) => !s.isDeleted);

            return (
              <li key={task.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Task header */}
                <div className="flex items-start gap-3 p-4">
                  {/* Complete checkbox */}
                  <button
                    disabled={actionLoading === task.id}
                    onClick={() => void handleToggleTask(task)}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                      task.isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-primary-400'
                    }`}
                  >
                    {task.isCompleted && <span className="text-xs">✓</span>}
                  </button>

                  <div className="flex-1 min-w-0">
                    {editingTaskId === task.id ? (
                      <div className="space-y-2">
                        <input
                          autoFocus
                          value={editTaskTitle}
                          onChange={(e) => setEditTaskTitle(e.target.value)}
                          className="w-full px-2 py-1 border border-primary-400 rounded text-sm focus:outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Due</label>
                          <input
                            type="date"
                            value={editTaskDue}
                            onChange={(e) => setEditTaskDue(e.target.value)}
                            className="px-2 py-1 border border-gray-200 rounded text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => void handleSaveTaskEdit(task)} className="px-3 py-1 bg-primary-400 text-white rounded text-xs">Save</button>
                          <button onClick={() => setEditingTaskId(null)} className="px-3 py-1 text-gray-500 text-xs">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className={`text-sm font-medium ${task.isCompleted ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                          {task.title}
                        </p>
                        {task.dueDate && (
                          <p className="text-xs text-gray-400 mt-0.5">Due {task.dueDate}</p>
                        )}
                      </>
                    )}

                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">Progress</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-600">{task.progress}%</span>
                          {task.useManualProgress ? (
                            <button
                              onClick={() => void handleDisableManualProgress(task)}
                              title="Switch to auto progress"
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              auto
                            </button>
                          ) : (
                            <button
                              onClick={() => setManualProgressId(task.id)}
                              title="Set manually"
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              set
                            </button>
                          )}
                        </div>
                      </div>
                      {manualProgressId === task.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            defaultValue={task.progress}
                            className="flex-1"
                            onMouseUp={(e) => {
                              void handleSetManualProgress(task, Number((e.target as HTMLInputElement).value));
                              setManualProgressId(null);
                            }}
                          />
                        </div>
                      ) : (
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-400 rounded-full transition-all duration-300"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {editingTaskId !== task.id && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        title="Subtasks"
                        onClick={() => toggleExpand(task.id)}
                        className="p-1 text-gray-400 hover:text-gray-600 text-xs"
                      >
                        {isExpanded ? '▲' : `▼ ${subtasks.length}`}
                      </button>
                      <button
                        title="Edit"
                        onClick={() => { setEditingTaskId(task.id); setEditTaskTitle(task.title); setEditTaskDue(task.dueDate ?? ''); }}
                        className="p-1 text-gray-300 hover:text-gray-600 text-xs"
                      >
                        ✏️
                      </button>
                      <button
                        title="Delete"
                        disabled={actionLoading === task.id}
                        onClick={() => void handleDeleteTask(task.id)}
                        className="p-1 text-gray-300 hover:text-red-500 text-xs disabled:opacity-50"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>

                {/* Subtasks */}
                {isExpanded && (
                  <div className="border-t border-gray-50 bg-gray-50 px-4 py-3 space-y-2">
                    {subtasks.map((sub) => (
                      <div key={sub.id} className="flex items-start gap-2">
                        <button
                          disabled={actionLoading === sub.id}
                          onClick={() => void handleToggleSubtask(task, sub)}
                          className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                            sub.isCompleted ? 'bg-green-400 border-green-400 text-white' : 'border-gray-300 hover:border-primary-400'
                          }`}
                        >
                          {sub.isCompleted && <span className="text-[10px]">✓</span>}
                        </button>

                        {editingSubId === sub.id ? (
                          <div className="flex-1 space-y-1">
                            <input
                              autoFocus
                              value={editSubTitle}
                              onChange={(e) => setEditSubTitle(e.target.value)}
                              className="w-full px-2 py-1 border border-primary-400 rounded text-xs focus:outline-none"
                            />
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-400">Due</label>
                              <input
                                type="date"
                                value={editSubDue}
                                onChange={(e) => setEditSubDue(e.target.value)}
                                max={task.dueDate ?? undefined}
                                className="px-1.5 py-0.5 border border-gray-200 rounded text-xs"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => void handleSaveSubEdit(task, sub)} className="px-2 py-0.5 bg-primary-400 text-white rounded text-xs">Save</button>
                              <button onClick={() => setEditingSubId(null)} className="px-2 py-0.5 text-gray-500 text-xs">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className={`flex-1 min-w-0 ${sub.isCompleted ? 'line-through text-gray-400' : ''}`}>
                            <p className="text-xs font-medium text-gray-700">{sub.title}</p>
                            {sub.dueDate && <p className="text-[11px] text-gray-400">Due {sub.dueDate}</p>}
                          </div>
                        )}

                        {editingSubId !== sub.id && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setEditingSubId(sub.id); setEditSubTitle(sub.title); setEditSubDue(sub.dueDate ?? ''); }}
                              className="p-0.5 text-gray-300 hover:text-gray-500 text-[11px]"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => void handleDeleteSubtask(task.id, sub.id)}
                              disabled={actionLoading === sub.id}
                              className="p-0.5 text-gray-300 hover:text-red-400 text-[11px]"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add subtask */}
                    {addingSubtask === task.id ? (
                      <div className="space-y-1 pt-1">
                        <input
                          autoFocus
                          value={newSubTitle}
                          onChange={(e) => setNewSubTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleAddSubtask(task.id); if (e.key === 'Escape') { setAddingSubtask(null); setNewSubTitle(''); } }}
                          placeholder="Subtask title *"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-400">Due</label>
                          <input
                            type="date"
                            value={newSubDue}
                            onChange={(e) => setNewSubDue(e.target.value)}
                            max={task.dueDate ?? undefined}
                            className="px-1.5 py-0.5 border border-gray-200 rounded text-xs"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => void handleAddSubtask(task.id)}
                            disabled={!newSubTitle.trim() || actionLoading === `sub-${task.id}`}
                            className="px-2 py-1 bg-primary-400 text-white rounded text-xs disabled:opacity-50"
                          >
                            Add
                          </button>
                          <button onClick={() => { setAddingSubtask(null); setNewSubTitle(''); setNewSubDue(''); }} className="px-2 py-1 text-gray-400 text-xs">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingSubtask(task.id); setExpandedTasks((p) => new Set([...p, task.id])); }}
                        className="text-xs text-primary-400 hover:text-primary-600 flex items-center gap-1"
                      >
                        + Add subtask
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
