import { View, Text, StyleSheet } from 'react-native';
export default function ExpensesScreen() {
  return <View style={s.c}><Text style={s.t}>Expenses — coming soon</Text></View>;
}
const s = StyleSheet.create({ c: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }, t: { fontSize: 16, color: '#9ca3af' } });
