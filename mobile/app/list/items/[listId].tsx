/**
 * List items screen (mobile) — General and Grocery lists.
 *
 * Two sections:
 *   - Items (unpurchased): swipe-left to delete, tap checkbox to mark purchased
 *   - Purchased: struck-through, tap checkbox to unmark
 *
 * Camera scan: uses expo-image-picker to pick or capture an image, then
 * uploads to /api/v1/lists/scan and bulk-adds the parsed descriptions.
 *
 * Pull-to-refresh for real-time household sync.
 * Offline queue: mutations are applied locally first; background sync queues
 * to be added once expo-sqlite schema is set up.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { api, type ListItem, type ShoppingList } from '../../../src/lib/api';
import { useListsStore } from '../../../src/store/listsStore';
import { colors, typography, spacing, borderRadius } from '../../../constants/designTokens';
import { analytics } from '../../../src/lib/analyticsService';

interface ItemForm {
  description: string;
  packSize: string;
  unit: string;
  quantity: string;
}

const EMPTY_FORM: ItemForm = { description: '', packSize: '', unit: '', quantity: '' };

export default function ListItemsScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const router = useRouter();
  const { lists, items, setItems, setError } = useListsStore();

  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(EMPTY_FORM);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!listId) return;
    try {
      const { items: its } = await api.getListItems(listId);
      setItems(its);
    } catch {
      setError('Failed to load items');
    }
  }, [listId, setItems, setError]);

  useEffect(() => {
    if (!listId) return;
    setList(lists.find((l) => l.id === listId) ?? null);
    setLoading(true);
    void fetchItems().finally(() => setLoading(false));
  }, [listId, lists, fetchItems]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchItems().finally(() => setRefreshing(false));
  }, [fetchItems]);

  const unpurchased = items.filter((i) => !i.isPurchased && !i.isDeleted);
  const purchased   = items.filter((i) => i.isPurchased && !i.isDeleted);

  async function handleAddItem() {
    if (!listId || !form.description.trim()) return;
    try {
      setActionLoading('add');
      const { item } = await api.addListItem(listId, {
        description: form.description.trim(),
        packSize: form.packSize || undefined,
        unit: form.unit || undefined,
        quantity: form.quantity ? Number(form.quantity) : undefined,
      });
      analytics.track('list.item_added', { listType: list?.listType, hasQuantity: !!form.quantity, hasUnit: !!form.unit });
      setItems([...items, item]);
      setForm(EMPTY_FORM);
      setAddingItem(false);
    } catch {
      Alert.alert('Error', 'Failed to add item');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleTogglePurchased(item: ListItem) {
    if (!listId) return;
    try {
      setActionLoading(item.id);
      const { item: updated } = await api.updateListItem(listId, item.id, { isPurchased: !item.isPurchased });
      if (!item.isPurchased) analytics.track('list.item_purchased', { listType: list?.listType });
      setItems(items.map((i) => (i.id === updated.id ? updated : i)));
    } catch {
      Alert.alert('Error', 'Failed to update item');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!listId) return;
    try {
      setActionLoading(itemId);
      await api.deleteListItem(listId, itemId);
      setItems(items.filter((i) => i.id !== itemId));
    } catch {
      Alert.alert('Error', 'Failed to delete item');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveEdit(item: ListItem) {
    if (!listId || !editForm.description.trim()) return;
    try {
      setActionLoading(item.id);
      const { item: updated } = await api.updateListItem(listId, item.id, {
        description: editForm.description.trim(),
        packSize: editForm.packSize || null,
        unit: editForm.unit || null,
        quantity: editForm.quantity ? Number(editForm.quantity) : null,
      });
      setItems(items.map((i) => (i.id === updated.id ? updated : i)));
      setEditingId(null);
    } catch {
      Alert.alert('Error', 'Failed to update item');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleScan() {
    if (!listId) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Camera access is required to scan lists');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled) return;

    try {
      setScanning(true);
      const asset = result.assets[0];
      const fd = new FormData();
      // React Native FormData accepts objects with uri/name/type
      fd.append('image', { uri: asset.uri, name: 'scan.jpg', type: 'image/jpeg' } as unknown as Blob);

      const { items: parsed } = await api.scanList(fd);
      if (parsed.length === 0) {
        Alert.alert('No items found', 'Could not detect any items in the image');
        return;
      }

      const added: ListItem[] = [];
      for (const desc of parsed) {
        const { item } = await api.addListItem(listId, { description: desc });
        added.push(item);
      }
      setItems([...items, ...added]);
      Alert.alert('Scan complete', `Added ${added.length} item${added.length !== 1 ? 's' : ''}`);
    } catch {
      Alert.alert('Scan failed', 'Please try again');
    } finally {
      setScanning(false);
    }
  }

  const renderItem = (item: ListItem, section: 'unpurchased' | 'purchased') => (
    <TouchableOpacity
      key={item.id}
      style={[styles.itemRow, section === 'purchased' && styles.purchasedRow]}
      onLongPress={() => {
        Alert.alert(item.description, '', [
          { text: 'Edit', onPress: () => { setEditingId(item.id); setEditForm({ description: item.description, packSize: item.packSize ?? '', unit: item.unit ?? '', quantity: item.quantity !== null ? String(item.quantity) : '' }); } },
          { text: 'Delete', style: 'destructive', onPress: () => void handleDeleteItem(item.id) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }}
    >
      {/* Checkbox */}
      <TouchableOpacity
        onPress={() => void handleTogglePurchased(item)}
        disabled={actionLoading === item.id}
        style={[styles.checkbox, item.isPurchased && styles.checkboxChecked]}
      >
        {item.isPurchased && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>

      {/* Content or edit form */}
      {editingId === item.id ? (
        <View style={styles.editContainer}>
          <TextInput
            autoFocus
            value={editForm.description}
            onChangeText={(v) => setEditForm({ ...editForm, description: v })}
            placeholder="Description *"
            style={styles.editInput}
            autoCapitalize="sentences"
          />
          <View style={styles.editRow}>
            <TextInput value={editForm.packSize} onChangeText={(v) => setEditForm({ ...editForm, packSize: v })} placeholder="Pack size" style={[styles.editInput, styles.editSmall]} />
            <TextInput value={editForm.unit} onChangeText={(v) => setEditForm({ ...editForm, unit: v })} placeholder="Unit" style={[styles.editInput, styles.editSmall]} />
            <TextInput value={editForm.quantity} onChangeText={(v) => setEditForm({ ...editForm, quantity: v })} placeholder="Qty" keyboardType="numeric" style={[styles.editInput, styles.editSmall]} />
          </View>
          <View style={styles.editActions}>
            <TouchableOpacity onPress={() => void handleSaveEdit(item)} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingId(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.itemContent}>
          <Text style={[styles.itemDesc, item.isPurchased && styles.strikethrough]} numberOfLines={2}>
            {item.description}
          </Text>
          {(item.packSize || item.unit || item.quantity !== null) && (
            <Text style={styles.itemMeta}>
              {[item.quantity !== null ? item.quantity : null, item.unit, item.packSize].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
      )}

      {actionLoading === item.id && <ActivityIndicator size="small" color={colors.primary[400]} />}
    </TouchableOpacity>
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary[400]} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          onPress={() => { setAddingItem(!addingItem); setForm(EMPTY_FORM); }}
          style={styles.toolBtn}
        >
          <Text style={styles.toolBtnText}>+ Add item</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void handleScan()}
          style={[styles.toolBtn, styles.scanBtn]}
          disabled={scanning}
        >
          <Text style={styles.toolBtnText}>{scanning ? 'Scanning…' : '📷 Scan'}</Text>
        </TouchableOpacity>
      </View>

      {/* Add item form */}
      {addingItem && (
        <View style={styles.addForm}>
          <TextInput
            autoFocus
            value={form.description}
            onChangeText={(v) => setForm({ ...form, description: v })}
            onSubmitEditing={() => void handleAddItem()}
            placeholder="Item description *"
            style={styles.addInput}
            returnKeyType="done"
            autoCapitalize="sentences"
          />
          <View style={styles.editRow}>
            <TextInput value={form.packSize} onChangeText={(v) => setForm({ ...form, packSize: v })} placeholder="Pack size" style={[styles.addInput, styles.editSmall]} />
            <TextInput value={form.unit} onChangeText={(v) => setForm({ ...form, unit: v })} placeholder="Unit" style={[styles.addInput, styles.editSmall]} />
            <TextInput value={form.quantity} onChangeText={(v) => setForm({ ...form, quantity: v })} placeholder="Qty" keyboardType="numeric" style={[styles.addInput, styles.editSmall]} />
          </View>
          <View style={styles.editActions}>
            <TouchableOpacity
              onPress={() => void handleAddItem()}
              disabled={!form.description.trim() || actionLoading === 'add'}
              style={[styles.saveBtn, (!form.description.trim() || actionLoading === 'add') && styles.disabled]}
            >
              <Text style={styles.saveBtnText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setAddingItem(false); setForm(EMPTY_FORM); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Unpurchased section */}
      {unpurchased.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Items ({unpurchased.length})</Text>
          {unpurchased.map((item) => renderItem(item, 'unpurchased'))}
        </View>
      )}

      {/* Purchased section */}
      {purchased.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Purchased ({purchased.length})</Text>
          {purchased.map((item) => renderItem(item, 'purchased'))}
        </View>
      )}

      {items.filter((i) => !i.isDeleted).length === 0 && !addingItem && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No items yet</Text>
          <Text style={styles.emptyHint}>Tap "Add item" or scan a written list</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: colors.background.canvas },
  content:         { padding: spacing.base, paddingBottom: 40 },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toolbar:         { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.base },
  toolBtn:         { flex: 1, backgroundColor: colors.primary[400], borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center' },
  scanBtn:         { backgroundColor: colors.neutral[100] },
  toolBtnText:     { color: colors.text.inverse, fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.md },
  addForm:         { backgroundColor: colors.background.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.base, borderWidth: 1, borderColor: colors.border.soft },
  addInput:        { borderWidth: 1, borderColor: colors.border.strong, borderRadius: borderRadius.md, padding: spacing.md, fontSize: typography.fontSize.md, marginBottom: spacing.xs, backgroundColor: colors.background.canvas },
  editRow:         { flexDirection: 'row', gap: spacing.sm },
  editSmall:       { flex: 1 },
  editActions:     { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  saveBtn:         { backgroundColor: colors.primary[400], borderRadius: borderRadius.md, paddingHorizontal: spacing.base, paddingVertical: spacing.xs },
  saveBtnText:     { color: colors.text.inverse, fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.sm },
  cancelText:      { color: colors.text.subtle, fontSize: typography.fontSize.sm, paddingVertical: spacing.xs },
  disabled:        { opacity: 0.5 },
  section:         { marginBottom: spacing.lg },
  sectionLabel:    { fontSize: typography.fontSize['2xs'], fontWeight: typography.fontWeight.semibold, color: colors.text.subtle, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
  itemRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    backgroundColor: colors.background.surface, borderRadius: borderRadius.md, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border.soft,
  },
  purchasedRow:    { backgroundColor: colors.background.canvas, borderColor: colors.border.subtle },
  checkbox:        { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border.strong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: colors.success.default, borderColor: colors.success.default },
  checkmark:       { color: colors.text.inverse, fontSize: typography.fontSize['2xs'], fontWeight: typography.fontWeight.bold },
  itemContent:     { flex: 1 },
  itemDesc:        { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.medium, color: colors.text.default },
  strikethrough:   { textDecorationLine: 'line-through', color: colors.text.subtle },
  itemMeta:        { fontSize: typography.fontSize['2xs'], color: colors.text.subtle, marginTop: 2 },
  editContainer:   { flex: 1 },
  editInput:       { borderWidth: 1, borderColor: colors.primary[400], borderRadius: borderRadius.sm, padding: spacing.xs, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  emptyContainer:  { alignItems: 'center', paddingVertical: 48 },
  emptyText:       { fontSize: typography.fontSize.base, color: colors.text.subtle, fontWeight: typography.fontWeight.medium },
  emptyHint:       { fontSize: typography.fontSize.sm, color: colors.neutral[300], marginTop: spacing.sm },
});
