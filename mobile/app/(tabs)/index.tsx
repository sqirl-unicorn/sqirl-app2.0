/**
 * Lists tab (mobile) — shows all lists grouped by type.
 *
 * Three sections: General, Grocery, To Do.
 * Tapping a list navigates to its detail screen.
 * Pull-to-refresh for real-time household updates.
 * Long-press shows rename/delete actions.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api, type ShoppingList, type ListType } from '../../src/lib/api';
import { useListsStore } from '../../src/store/listsStore';
import { colors, typography, spacing, borderRadius } from '../../constants/designTokens';
import { analytics } from '../../src/lib/analyticsService';

const SECTIONS: { key: ListType; label: string; icon: string }[] = [
  { key: 'general', label: 'General', icon: '📋' },
  { key: 'grocery', label: 'Grocery', icon: '🛒' },
  { key: 'todo',    label: 'To Do',   icon: '✅' },
];

export default function ListsScreen() {
  const router = useRouter();
  const { lists, setLists, loading, setLoading, error, setError } = useListsStore();
  const [refreshing, setRefreshing] = useState(false);
  const [addingType, setAddingType] = useState<ListType | null>(null);
  const [newName, setNewName] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchLists = useCallback(async () => {
    try {
      const { lists: ls } = await api.getLists();
      setLists(ls);
      setError(null);
    } catch {
      setError('Failed to load lists');
    }
  }, [setLists, setError]);

  useEffect(() => {
    setLoading(true);
    void fetchLists().finally(() => setLoading(false));
  }, [fetchLists, setLoading]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchLists().finally(() => setRefreshing(false));
  }, [fetchLists]);

  async function handleCreate(listType: ListType) {
    if (!newName.trim()) return;
    try {
      setActionLoading('create');
      const { list } = await api.createList({ name: newName.trim(), listType });
      analytics.track('list.created', { listType });
      setLists([list, ...lists]);
      setNewName('');
      setAddingType(null);
    } catch {
      Alert.alert('Error', 'Failed to create list');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(listId: string, name: string) {
    Alert.alert('Delete list', `Delete "${name}" and all its items?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            setActionLoading(listId);
            await api.deleteList(listId);
            const deletedList = lists.find((l) => l.id === listId);
            if (deletedList) analytics.track('list.deleted', { listType: deletedList.listType });
            setLists(lists.filter((l) => l.id !== listId));
          } catch {
            Alert.alert('Error', 'Failed to delete list');
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  }

  async function handleRename(list: ShoppingList) {
    Alert.prompt(
      'Rename list',
      '',
      async (name) => {
        if (!name?.trim() || name === list.name) return;
        try {
          setActionLoading(list.id);
          const { list: updated } = await api.renameList(list.id, name.trim());
          setLists(lists.map((l) => (l.id === updated.id ? updated : l)));
        } catch {
          Alert.alert('Error', 'Failed to rename list');
        } finally {
          setActionLoading(null);
        }
      },
      'plain-text',
      list.name
    );
  }

  function openList(list: ShoppingList) {
    const path = list.listType === 'todo'
      ? `/list/todo/${list.id}`
      : `/list/items/${list.id}`;
    void router.push(path as never);
  }

  const renderListRow = (list: ShoppingList) => (
    <TouchableOpacity
      key={list.id}
      style={styles.listCard}
      onPress={() => openList(list)}
      onLongPress={() => Alert.alert(list.name, '', [
        { text: 'Rename', onPress: () => void handleRename(list) },
        { text: 'Delete', style: 'destructive', onPress: () => void handleDelete(list.id, list.name) },
        { text: 'Cancel', style: 'cancel' },
      ])}
    >
      <Text style={styles.listIcon}>
        {SECTIONS.find((s) => s.key === list.listType)?.icon ?? '📋'}
      </Text>
      <Text style={styles.listName} numberOfLines={1}>{list.name}</Text>
      {actionLoading === list.id && <ActivityIndicator size="small" color={colors.primary[400]} />}
      <Text style={styles.listChevron}>›</Text>
    </TouchableOpacity>
  );

  if (loading && lists.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary[400]} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      data={SECTIONS}
      keyExtractor={(s) => s.key}
      ListHeaderComponent={
        error ? <Text style={styles.errorText}>{error}</Text> : null
      }
      renderItem={({ item: section }) => {
        const sectionLists = lists.filter((l) => l.listType === section.key && !l.isDeleted);
        return (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>{section.icon}</Text>
              <Text style={styles.sectionTitle}>{section.label}</Text>
              <TouchableOpacity onPress={() => { setAddingType(section.key); setNewName(''); }}>
                <Text style={styles.addBtn}>+</Text>
              </TouchableOpacity>
            </View>

            {addingType === section.key && (
              <View style={styles.addForm}>
                <TextInput
                  autoFocus
                  value={newName}
                  onChangeText={setNewName}
                  onSubmitEditing={() => void handleCreate(section.key)}
                  placeholder="List name…"
                  style={styles.addInput}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  onPress={() => void handleCreate(section.key)}
                  disabled={actionLoading === 'create' || !newName.trim()}
                  style={[styles.addConfirm, (!newName.trim() || actionLoading === 'create') && styles.disabled]}
                >
                  <Text style={styles.addConfirmText}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setAddingType(null); setNewName(''); }} style={styles.addCancel}>
                  <Text style={styles.addCancelText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {sectionLists.length === 0 && addingType !== section.key && (
              <Text style={styles.emptyText}>No {section.label.toLowerCase()} lists</Text>
            )}
            {sectionLists.map(renderListRow)}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.background.canvas },
  content:        { padding: spacing.base, paddingBottom: 40 },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText:      { color: colors.error.default, fontSize: typography.fontSize.sm, marginBottom: spacing.md },
  section:        { marginBottom: spacing.lg },
  sectionHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  sectionIcon:    { fontSize: typography.fontSize.base, marginRight: spacing.sm },
  sectionTitle:   { fontSize: typography.fontSize.md + 1, fontWeight: typography.fontWeight.semibold, color: colors.neutral[700], flex: 1 },
  addBtn:         { fontSize: 24, color: colors.primary[400], lineHeight: 28, paddingHorizontal: spacing.xs },
  addForm:        { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  addInput: {
    flex: 1, borderWidth: 1, borderColor: colors.border.strong, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, fontSize: typography.fontSize.md, backgroundColor: colors.background.surface,
  },
  addConfirm:     { backgroundColor: colors.primary[400], borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  addConfirmText: { color: colors.text.inverse, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold },
  disabled:       { opacity: 0.5 },
  addCancel:      { padding: spacing.xs },
  addCancelText:  { color: colors.text.subtle, fontSize: typography.fontSize.md },
  emptyText:      { color: colors.text.subtle, fontSize: typography.fontSize.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  listCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.background.surface, borderRadius: borderRadius.lg, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border.subtle,
  },
  listIcon:     { fontSize: typography.fontSize.lg },
  listName:     { flex: 1, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.medium, color: colors.text.default },
  listChevron:  { fontSize: typography.fontSize.lg, color: colors.border.strong },
});
