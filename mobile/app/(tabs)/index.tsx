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
      {actionLoading === list.id && <ActivityIndicator size="small" color="#60a5fa" />}
      <Text style={styles.listChevron}>›</Text>
    </TouchableOpacity>
  );

  if (loading && lists.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#60a5fa" />
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
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#ef4444', fontSize: 13, marginBottom: 12 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionIcon: { fontSize: 18, marginRight: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#374151', flex: 1 },
  addBtn: { fontSize: 24, color: '#60a5fa', lineHeight: 28, paddingHorizontal: 4 },
  addForm: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  addInput: {
    flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, backgroundColor: '#fff',
  },
  addConfirm: { backgroundColor: '#60a5fa', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addConfirmText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  addCancel: { padding: 8 },
  addCancelText: { color: '#9ca3af', fontSize: 14 },
  emptyText: { color: '#9ca3af', fontSize: 13, paddingVertical: 8, paddingHorizontal: 4 },
  listCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 6, borderWidth: 1, borderColor: '#f3f4f6',
  },
  listIcon: { fontSize: 20 },
  listName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#1f2937' },
  listChevron: { fontSize: 20, color: '#d1d5db' },
});
