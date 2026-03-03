/**
 * Lists tab — placeholder until lists feature is implemented.
 */
import { View, Text, StyleSheet } from 'react-native';

export default function ListsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Lists — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  text: { fontSize: 16, color: '#9ca3af' },
});
