import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity
} from "react-native";
import { supabase } from "../lib/supabase";

export default function HomeScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Not logged in");
  const [children, setChildren] = useState<any[]>([]);

  async function login() {
    setStatus("Logging in...");
    setChildren([]);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setStatus("Login error: " + error.message);
      return;
    }
    setStatus("Logged in. Loading children...");
    const { data, error: qErr } = await supabase
      .from("children")
      .select("id, name, grade_level");
    if (qErr) {
      setStatus("Query error: " + qErr.message);
      return;
    }
    setChildren(data ?? []);
    setStatus("Loaded " + (data?.length ?? 0) + " children");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Skeelio login test</Text>
      <TextInput
        style={styles.input}
        placeholder="email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TouchableOpacity style={styles.button} onPress={login}>
        <Text style={styles.buttonText}>Log in</Text>
      </TouchableOpacity>
      <Text style={styles.status}>{status}</Text>
      {children.map((c) => (
        <Text key={c.id} style={styles.child}>
          • {c.name} ({c.grade_level})
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 80, gap: 14 },
  title: { fontSize: 20, fontWeight: "600", textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#208AEF",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
  status: { fontSize: 15, textAlign: "center", color: "#333" },
  child: { fontSize: 16 },
});
