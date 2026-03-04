/**
 * Categories management screen — mobile.
 * Shows 3-level category tree; system categories are read-only.
 * Custom sub-categories can be added, renamed, or deleted.
 * Household categories require owner role.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/store/authStore';
import { useHouseholdStore } from '../../src/store/householdStore';
import { useExpensesStore } from '../../src/store/expensesStore';
import type { ExpenseCategory, ExpenseScope } from '@sqirl/shared';

const SYSTEM_CAT_IDS = new Set([
  '00000000-0000-ec00-0000-000000000001',
  '00000000-0000-ec00-0000-000000000002',
  '00000000-0000-ec00-0000-000000000003',
  '00000000-0000-ec00-0000-000000000004',
  '00000000-0000-ec00-0000-000000000005',
  '00000000-0000-ec00-0000-000000000006',
  '00000000-0000-ec00-0000-000000000007',
]);

function isSystem(id: string) { return SYSTEM_CAT_IDS.has(id); }

// ── Category Node ──────────────────────────────────────────────────────────────

function CatNode({
  node, scope, canManage, onAdd, onEdit, onDelete, depth,
}: {
  node: ExpenseCategory;
  scope: ExpenseScope;
  canManage: boolean;
  onAdd: (parentId: string, parentLevel: number) => void;
  onEdit: (cat: ExpenseCategory) => void;
  onDelete: (cat: ExpenseCategory) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(depth === 0);
  const sys = isSystem(node.id);

  return (
    <View>
      <Pressable
        style={[styles.nodeRow, { paddingLeft: 14 + depth * 16 }]}
        onPress={() => setOpen((o) => !o)}
      >
        <Ionicons
          name={open ? 'chevron-down' : 'chevron-forward'}
          size={13}
          color="#d1d5db"
        />
        <Text style={[styles.nodeName, sys && { color: '#6b7280' }]} numberOfLines={1}>
          {node.name}
        </Text>
        {sys && <Text style={styles.sysBadge}>system</Text>}
        {!sys && canManage && (
          <View style={{ flexDirection: 'row', gap: 12, marginLeft: 8 }}>
            <TouchableOpacity onPress={() => onEdit(node)}>
              <Ionicons name="pencil" size={14} color="#60a5fa" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(node)}>
              <Ionicons name="trash-outline" size={14} color="#f87171" />
            </TouchableOpacity>
          </View>
        )}
        {canManage && node.level < 3 && (
          <TouchableOpacity
            style={styles.addChildBtn}
            onPress={() => onAdd(node.id, node.level)}
          >
            <Ionicons name="add" size={14} color="#60a5fa" />
          </TouchableOpacity>
        )}
      </Pressable>

      {open && (node.children ?? []).map((child) => (
        <CatNode
          key={child.id}
          node={child}
          scope={scope}
          canManage={canManage}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
          depth={depth + 1}
        />
      ))}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function CategoriesScreen() {
  const { user } = useAuthStore.getState();
  const household = useHouseholdStore((s) => s.household);
  const { personalCategories, householdCategories, setPersonalCategories, setHouseholdCategories } = useExpensesStore();

  const [scope, setScope] = useState<ExpenseScope>('personal');
  const [loading, setLoading] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editTarget, setEditTarget] = useState<ExpenseCategory | null>(null);
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const member = household?.members.find((m) => m.userId === user?.id);
  const isOwner = member?.role === 'owner';
  const canManage = scope === 'personal' || (scope === 'household' && isOwner);

  const categories = scope === 'personal' ? personalCategories : householdCategories;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getExpenseCategories(scope);
      scope === 'personal'
        ? setPersonalCategories(res.categories)
        : setHouseholdCategories(res.categories);
    } catch {
      /* offline — keep cached */
    } finally {
      setLoading(false);
    }
  }, [scope, setPersonalCategories, setHouseholdCategories]);

  useEffect(() => { void load(); }, [load]);

  function openAdd(pId: string, _parentLevel: number) {
    setModalMode('add');
    setParentId(pId);
    setName('');
    setEditTarget(null);
    setModalVisible(true);
  }

  function openEdit(cat: ExpenseCategory) {
    setModalMode('edit');
    setEditTarget(cat);
    setName(cat.name);
    setModalVisible(true);
  }

  function confirmDelete(cat: ExpenseCategory) {
    Alert.alert(
      'Delete Category',
      `Delete "${cat.name}" and all its sub-categories?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteExpenseCategory(cat.id);
              await load();
            } catch {
              Alert.alert('Error', 'Failed to delete category.');
            }
          },
        },
      ]
    );
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Required', 'Category name is required.'); return; }
    setSaving(true);
    try {
      if (modalMode === 'add') {
        await api.createExpenseCategory({ parentId, name: name.trim(), scope });
      } else if (editTarget) {
        await api.updateExpenseCategory(editTarget.id, { name: name.trim() });
      }
      setModalVisible(false);
      await load();
    } catch {
      Alert.alert('Error', 'Failed to save category.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Scope tabs */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, scope === 'personal' && styles.tabActive]}
          onPress={() => setScope('personal')}
        >
          <Text style={[styles.tabText, scope === 'personal' && styles.tabTextActive]}>Personal</Text>
        </Pressable>
        {household && (
          <Pressable
            style={[styles.tab, scope === 'household' && styles.tabActive]}
            onPress={() => setScope('household')}
          >
            <Text style={[styles.tabText, scope === 'household' && styles.tabTextActive]}>Household</Text>
          </Pressable>
        )}
      </View>

      {scope === 'household' && !isOwner && (
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={16} color="#d97706" />
          <Text style={styles.infoBannerText}>Only household owners can manage household categories.</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#60a5fa" style={{ marginTop: 48 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}>
          <View style={styles.card}>
            {categories.map((cat, i) => (
              <View key={cat.id} style={i > 0 ? styles.divider : {}}>
                <CatNode
                  node={cat}
                  scope={scope}
                  canManage={canManage}
                  onAdd={openAdd}
                  onEdit={openEdit}
                  onDelete={confirmDelete}
                  depth={0}
                />
              </View>
            ))}
            {categories.length === 0 && (
              <Text style={{ color: '#9ca3af', textAlign: 'center', padding: 24 }}>No categories loaded.</Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {modalMode === 'add' ? 'Add Sub-Category' : 'Edit Category'}
            </Text>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Category name"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f9fafb' },
  tabBar:         { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tab:            { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginRight: 8 },
  tabActive:      { backgroundColor: '#eff6ff' },
  tabText:        { fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  tabTextActive:  { color: '#60a5fa' },
  infoBanner:     { flexDirection: 'row', alignItems: 'center', gap: 6, margin: 12, padding: 12, backgroundColor: '#fffbeb', borderRadius: 10, borderWidth: 1, borderColor: '#fde68a' },
  infoBannerText: { fontSize: 13, color: '#92400e', flex: 1 },
  card:           { marginHorizontal: 14, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden' },
  divider:        { borderTopWidth: 1, borderTopColor: '#f9fafb' },
  nodeRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingRight: 14, gap: 6 },
  nodeName:       { fontSize: 14, fontWeight: '500', color: '#374151', flex: 1 },
  sysBadge:       { fontSize: 10, color: '#9ca3af', backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  addChildBtn:    { padding: 4 },
  // Modal
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle:     { fontSize: 17, fontWeight: '700', color: '#1f2937', marginBottom: 12 },
  label:          { fontSize: 12, color: '#6b7280', marginBottom: 4, marginTop: 10 },
  input:          { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1f2937' },
  modalActions:   { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  cancelBtn:      { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  cancelBtnText:  { fontSize: 14, color: '#6b7280' },
  saveBtn:        { paddingHorizontal: 24, paddingVertical: 8, borderRadius: 10, backgroundColor: '#60a5fa' },
  saveBtnText:    { fontSize: 14, color: '#fff', fontWeight: '600' },
});
