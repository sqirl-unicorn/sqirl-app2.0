/**
 * Todo list detail screen (mobile) — tasks + subtasks.
 *
 * Tasks show a progress bar (auto from subtasks or manually overridden).
 * Tap task row to expand subtasks. Long-press for edit/delete actions.
 * Subtasks have due date capped at parent task due date.
 * Pull-to-refresh for real-time household sync.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api, type TodoTask, type TodoSubtask, type ShoppingList } from '../../../src/lib/api';
import { useListsStore } from '../../../src/store/listsStore';

export default function TodoListScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const { lists, tasks, setTasks, setError } = useListsStore();

  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [addingSubOf, setAddingSubOf] = useState<string | null>(null);
  const [newSubTitle, setNewSubTitle] = useState('');
  const [newSubDue, setNewSubDue] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
  }, [listId, lists, fetchTasks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchTasks().finally(() => setRefreshing(false));
  }, [fetchTasks]);

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
      setTasks([...tasks, task]);
      setNewTaskTitle('');
      setNewTaskDue('');
      setAddingTask(false);
    } catch {
      Alert.alert('Error', 'Failed to add task');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleTask(task: TodoTask) {
    if (!listId) return;
    try {
      setActionLoading(task.id);
      const { task: updated } = await api.updateTask(listId, task.id, { isCompleted: !task.isCompleted });
      setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      Alert.alert('Error', 'Failed to update task');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!listId) return;
    Alert.alert('Delete task', 'Delete this task and all its subtasks?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            setActionLoading(taskId);
            await api.deleteTask(listId, taskId);
            setTasks(tasks.filter((t) => t.id !== taskId));
          } catch {
            Alert.alert('Error', 'Failed to delete task');
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  }

  async function handleSetManualProgress(task: TodoTask, value: number) {
    if (!listId) return;
    try {
      const { task: updated } = await api.updateTask(listId, task.id, { useManualProgress: true, manualProgress: value });
      setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      Alert.alert('Error', 'Invalid progress value');
    }
  }

  async function handleAddSubtask(taskId: string, taskDueDate: string | null) {
    if (!listId || !newSubTitle.trim()) return;
    try {
      setActionLoading(`sub-${taskId}`);
      const { subtask } = await api.addSubtask(listId, taskId, {
        title: newSubTitle.trim(),
        dueDate: newSubDue || undefined,
      });
      setTasks(tasks.map((t) => t.id === taskId ? { ...t, subtasks: [...t.subtasks, subtask] } : t));
      setNewSubTitle('');
      setNewSubDue('');
      setAddingSubOf(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      Alert.alert('Error', msg === 'SQIRL-LIST-SUB-003'
        ? `Subtask due date cannot exceed task due date (${taskDueDate ?? 'none'})`
        : 'Failed to add subtask');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleSubtask(task: TodoTask, subtask: TodoSubtask) {
    if (!listId) return;
    try {
      setActionLoading(subtask.id);
      const { subtask: updated } = await api.updateSubtask(listId, task.id, subtask.id, { isCompleted: !subtask.isCompleted });
      // Refresh tasks to get updated progress
      const { tasks: refreshed } = await api.getTasks(listId);
      setTasks(refreshed);
      void updated; // used for side effect only
    } catch {
      Alert.alert('Error', 'Failed to update subtask');
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
      Alert.alert('Error', 'Failed to delete subtask');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#60a5fa" /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Add task button */}
      {!addingTask ? (
        <TouchableOpacity onPress={() => setAddingTask(true)} style={styles.addTaskBtn}>
          <Text style={styles.addTaskBtnText}>+ New task</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.addForm}>
          <TextInput
            autoFocus
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
            placeholder="Task title *"
            style={styles.addInput}
            returnKeyType="done"
            onSubmitEditing={() => void handleAddTask()}
          />
          <TextInput
            value={newTaskDue}
            onChangeText={setNewTaskDue}
            placeholder="Due date (YYYY-MM-DD)"
            style={styles.addInput}
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              onPress={() => void handleAddTask()}
              disabled={!newTaskTitle.trim() || actionLoading === 'add-task'}
              style={[styles.saveBtn, (!newTaskTitle.trim() || actionLoading === 'add-task') && styles.disabled]}
            >
              <Text style={styles.saveBtnText}>Add task</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setAddingTask(false); setNewTaskTitle(''); setNewTaskDue(''); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Task list */}
      {tasks.filter((t) => !t.isDeleted).length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No tasks yet</Text>
        </View>
      ) : (
        tasks.filter((t) => !t.isDeleted).map((task) => {
          const isExpanded = expandedTasks.has(task.id);
          const subtasks = task.subtasks.filter((s) => !s.isDeleted);

          return (
            <View key={task.id} style={styles.taskCard}>
              {/* Task row */}
              <TouchableOpacity
                style={styles.taskRow}
                onPress={() => toggleExpand(task.id)}
                onLongPress={() => Alert.alert(task.title, '', [
                  {
                    text: 'Set manual progress',
                    onPress: () => Alert.prompt('Progress (0-100)', '', (v) => {
                      const n = Number(v);
                      if (!isNaN(n)) void handleSetManualProgress(task, n);
                    }, 'plain-text', String(task.progress)),
                  },
                  { text: 'Delete', style: 'destructive', onPress: () => void handleDeleteTask(task.id) },
                  { text: 'Cancel', style: 'cancel' },
                ])}
              >
                {/* Checkbox */}
                <TouchableOpacity
                  onPress={() => void handleToggleTask(task)}
                  disabled={actionLoading === task.id}
                  style={[styles.checkbox, task.isCompleted && styles.checkboxChecked]}
                >
                  {task.isCompleted && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>

                <View style={styles.taskContent}>
                  <Text style={[styles.taskTitle, task.isCompleted && styles.strikethrough]} numberOfLines={2}>
                    {task.title}
                  </Text>
                  {task.dueDate && (
                    <Text style={styles.dueDateText}>Due {task.dueDate}</Text>
                  )}

                  {/* Progress bar */}
                  <View style={styles.progressRow}>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${task.progress}%` }]} />
                    </View>
                    <Text style={styles.progressLabel}>
                      {task.progress}%{task.useManualProgress ? ' (manual)' : ''}
                    </Text>
                  </View>
                </View>

                <Text style={styles.expandIcon}>
                  {isExpanded ? '▲' : `▼${subtasks.length > 0 ? ` ${subtasks.length}` : ''}`}
                </Text>
                {actionLoading === task.id && <ActivityIndicator size="small" color="#60a5fa" />}
              </TouchableOpacity>

              {/* Subtasks */}
              {isExpanded && (
                <View style={styles.subtasksContainer}>
                  {subtasks.map((sub) => (
                    <TouchableOpacity
                      key={sub.id}
                      style={styles.subtaskRow}
                      onLongPress={() => Alert.alert(sub.title, '', [
                        { text: 'Delete', style: 'destructive', onPress: () => void handleDeleteSubtask(task.id, sub.id) },
                        { text: 'Cancel', style: 'cancel' },
                      ])}
                    >
                      <TouchableOpacity
                        onPress={() => void handleToggleSubtask(task, sub)}
                        disabled={actionLoading === sub.id}
                        style={[styles.subCheckbox, sub.isCompleted && styles.subCheckboxChecked]}
                      >
                        {sub.isCompleted && <Text style={styles.subCheckmark}>✓</Text>}
                      </TouchableOpacity>
                      <View style={styles.subtaskContent}>
                        <Text style={[styles.subtaskTitle, sub.isCompleted && styles.strikethrough]} numberOfLines={2}>
                          {sub.title}
                        </Text>
                        {sub.dueDate && <Text style={styles.dueDateText}>Due {sub.dueDate}</Text>}
                      </View>
                      {actionLoading === sub.id && <ActivityIndicator size="small" color="#60a5fa" />}
                    </TouchableOpacity>
                  ))}

                  {/* Add subtask */}
                  {addingSubOf === task.id ? (
                    <View style={styles.addSubForm}>
                      <TextInput
                        autoFocus
                        value={newSubTitle}
                        onChangeText={setNewSubTitle}
                        placeholder="Subtask title *"
                        style={styles.addSubInput}
                        returnKeyType="done"
                        onSubmitEditing={() => void handleAddSubtask(task.id, task.dueDate)}
                      />
                      {task.dueDate && (
                        <TextInput
                          value={newSubDue}
                          onChangeText={setNewSubDue}
                          placeholder={`Due date (max ${task.dueDate})`}
                          style={styles.addSubInput}
                        />
                      )}
                      <View style={styles.editActions}>
                        <TouchableOpacity
                          onPress={() => void handleAddSubtask(task.id, task.dueDate)}
                          disabled={!newSubTitle.trim()}
                          style={[styles.saveBtn, !newSubTitle.trim() && styles.disabled]}
                        >
                          <Text style={styles.saveBtnText}>Add</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setAddingSubOf(null); setNewSubTitle(''); setNewSubDue(''); }}>
                          <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => { setAddingSubOf(task.id); setExpandedTasks((p) => new Set([...p, task.id])); }}
                      style={styles.addSubBtn}
                    >
                      <Text style={styles.addSubBtnText}>+ Add subtask</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addTaskBtn: { marginBottom: 16, flexDirection: 'row', alignItems: 'center' },
  addTaskBtnText: { color: '#60a5fa', fontSize: 15, fontWeight: '600' },
  addForm: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  addInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 8, backgroundColor: '#f9fafb' },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  saveBtn: { backgroundColor: '#60a5fa', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  cancelText: { color: '#9ca3af', fontSize: 13, paddingVertical: 8 },
  disabled: { opacity: 0.5 },
  emptyContainer: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 16, color: '#9ca3af' },
  taskCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxChecked: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '600', color: '#1f2937', marginBottom: 2 },
  strikethrough: { textDecorationLine: 'line-through', color: '#9ca3af' },
  dueDateText: { fontSize: 12, color: '#9ca3af', marginBottom: 6 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  progressBarBg: { flex: 1, height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#60a5fa', borderRadius: 3 },
  progressLabel: { fontSize: 11, color: '#9ca3af', width: 60 },
  expandIcon: { fontSize: 13, color: '#9ca3af', marginTop: 3 },
  subtasksContainer: { borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#f9fafb', padding: 12 },
  subtaskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  subCheckbox: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  subCheckboxChecked: { backgroundColor: '#4ade80', borderColor: '#4ade80' },
  subCheckmark: { color: '#fff', fontSize: 10, fontWeight: '700' },
  subtaskContent: { flex: 1 },
  subtaskTitle: { fontSize: 13, fontWeight: '500', color: '#374151' },
  addSubBtn: { paddingVertical: 6 },
  addSubBtnText: { color: '#60a5fa', fontSize: 13, fontWeight: '500' },
  addSubForm: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginTop: 6, borderWidth: 1, borderColor: '#e5e7eb' },
  addSubInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, padding: 8, fontSize: 13, marginBottom: 6 },
});
