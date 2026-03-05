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
import { colors, typography, spacing, borderRadius } from '../../../constants/designTokens';
import { analytics } from '../../../src/lib/analyticsService';

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
      analytics.track('list.task_added', { hasDueDate: !!newTaskDue });
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
      if (!task.isCompleted) analytics.track('list.task_completed', {});
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
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary[400]} /></View>;
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
            autoCapitalize="sentences"
            onSubmitEditing={() => void handleAddTask()}
          />
          <TextInput
            value={newTaskDue}
            onChangeText={setNewTaskDue}
            placeholder="Due date (YYYY-MM-DD)"
            style={styles.addInput}
            keyboardType="numbers-and-punctuation"
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
                {actionLoading === task.id && <ActivityIndicator size="small" color={colors.primary[400]} />}
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
                      {actionLoading === sub.id && <ActivityIndicator size="small" color={colors.primary[400]} />}
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
                        autoCapitalize="sentences"
                        onSubmitEditing={() => void handleAddSubtask(task.id, task.dueDate)}
                      />
                      {task.dueDate && (
                        <TextInput
                          value={newSubDue}
                          onChangeText={setNewSubDue}
                          placeholder={`Due date (max ${task.dueDate})`}
                          style={styles.addSubInput}
                          keyboardType="numbers-and-punctuation"
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
  container:          { flex: 1, backgroundColor: colors.background.canvas },
  content:            { padding: spacing.base, paddingBottom: 40 },
  center:             { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addTaskBtn:         { marginBottom: spacing.base, flexDirection: 'row', alignItems: 'center' },
  addTaskBtnText:     { color: colors.primary[400], fontSize: typography.fontSize.md + 1, fontWeight: typography.fontWeight.semibold },
  addForm:            { backgroundColor: colors.background.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.base, borderWidth: 1, borderColor: colors.border.soft },
  addInput:           { borderWidth: 1, borderColor: colors.border.strong, borderRadius: borderRadius.md, padding: spacing.md, fontSize: typography.fontSize.md, marginBottom: spacing.xs, backgroundColor: colors.background.canvas },
  editActions:        { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  saveBtn:            { backgroundColor: colors.primary[400], borderRadius: borderRadius.md, paddingHorizontal: spacing.base, paddingVertical: spacing.xs },
  saveBtnText:        { color: colors.text.inverse, fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.sm },
  cancelText:         { color: colors.text.subtle, fontSize: typography.fontSize.sm, paddingVertical: spacing.xs },
  disabled:           { opacity: 0.5 },
  emptyContainer:     { alignItems: 'center', paddingVertical: 48 },
  emptyText:          { fontSize: typography.fontSize.base, color: colors.text.subtle },
  taskCard:           { backgroundColor: colors.background.surface, borderRadius: borderRadius.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border.soft, overflow: 'hidden' },
  taskRow:            { flexDirection: 'row', alignItems: 'flex-start', padding: spacing.md, gap: spacing.md },
  checkbox:           { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border.strong, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxChecked:    { backgroundColor: colors.success.default, borderColor: colors.success.default },
  checkmark:          { color: colors.text.inverse, fontSize: typography.fontSize['2xs'], fontWeight: typography.fontWeight.bold },
  taskContent:        { flex: 1 },
  taskTitle:          { fontSize: typography.fontSize.md + 1, fontWeight: typography.fontWeight.semibold, color: colors.text.default, marginBottom: 2 },
  strikethrough:      { textDecorationLine: 'line-through', color: colors.text.subtle },
  dueDateText:        { fontSize: typography.fontSize['2xs'], color: colors.text.subtle, marginBottom: spacing.sm },
  progressRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  progressBarBg:      { flex: 1, height: 6, backgroundColor: colors.neutral[100], borderRadius: 3, overflow: 'hidden' },
  progressBarFill:    { height: '100%', backgroundColor: colors.primary[400], borderRadius: 3 },
  progressLabel:      { fontSize: typography.fontSize.xs, color: colors.text.subtle, width: 60 },
  expandIcon:         { fontSize: typography.fontSize.sm, color: colors.text.subtle, marginTop: 3 },
  subtasksContainer:  { borderTopWidth: 1, borderTopColor: colors.border.subtle, backgroundColor: colors.background.canvas, padding: spacing.md },
  subtaskRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginBottom: spacing.xs },
  subCheckbox:        { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.border.strong, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  subCheckboxChecked: { backgroundColor: colors.success.default, borderColor: colors.success.default },
  subCheckmark:       { color: colors.text.inverse, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  subtaskContent:     { flex: 1 },
  subtaskTitle:       { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.neutral[700] },
  addSubBtn:          { paddingVertical: spacing.sm },
  addSubBtnText:      { color: colors.primary[400], fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  addSubForm:         { backgroundColor: colors.background.surface, borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border.soft },
  addSubInput:        { borderWidth: 1, borderColor: colors.border.strong, borderRadius: borderRadius.sm, padding: spacing.xs, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
});
