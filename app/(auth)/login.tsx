import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "@/lib/supabase";

type AuthMode = "sign-in" | "create";

export default function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isCreate = mode === "create";

  const handleAuth = async () => {
    setError("");
    setMessage("");
    setIsLoading(true);

    const trimmedEmail = email.trim();
    const result = isCreate
      ? await supabase.auth.signUp({ email: trimmedEmail, password })
      : await supabase.auth.signInWithPassword({ email: trimmedEmail, password });

    if (result.error) {
      console.log("[auth] auth error:", result.error.message);
      setError(result.error.message);
      setIsLoading(false);
      return;
    }

    if (isCreate && !result.data.session) {
      setMessage("Check your email to confirm your account, then come back to sign in.");
      setMode("sign-in");
      setPassword("");
      setIsLoading(false);
      return;
    }

    console.log("[auth] auth successful");
    setIsLoading(false);
    // Auth state change will trigger routing in root layout.
  };

  const handleResetPassword = async () => {
    setError("");
    setMessage("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email first.");
      return;
    }

    setIsLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
    setIsLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage("Password reset email sent.");
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandBlock}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>S</Text>
          </View>
          <Text style={styles.appName}>Skeelio</Text>
          <Text style={styles.tagline}>Turn schoolwork into calm, focused practice.</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>For parents helping children practise</Text>
          <Text style={styles.infoBody}>
            Scan worksheets, assign short practice, and see what your child has finished.
          </Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeButton, !isCreate && styles.modeButtonActive]}
              onPress={() => setMode("sign-in")}
              disabled={isLoading}
            >
              <Text style={[styles.modeText, !isCreate && styles.modeTextActive]}>Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, isCreate && styles.modeButtonActive]}
              onPress={() => setMode("create")}
              disabled={isLoading}
            >
              <Text style={[styles.modeText, isCreate && styles.modeTextActive]}>Create account</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formTitle}>{isCreate ? "Create your parent account" : "Welcome back"}</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            editable={!isLoading}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!isLoading}
            textContentType={isCreate ? "newPassword" : "password"}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>{isCreate ? "Create account" : "Sign in"}</Text>
            )}
          </TouchableOpacity>

          {!isCreate && (
            <TouchableOpacity style={styles.linkButton} onPress={handleResetPassword} disabled={isLoading}>
              <Text style={styles.linkText}>Forgot password?</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 22,
  },
  brandBlock: {
    alignItems: "center",
    marginBottom: 22,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  logoText: {
    color: "#fff",
    fontSize: 38,
    fontWeight: "900",
  },
  appName: {
    fontSize: 34,
    fontWeight: "900",
    color: "#0f172a",
  },
  tagline: {
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 22,
  },
  infoCard: {
    backgroundColor: "#e0f2fe",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  infoTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },
  infoBody: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 20,
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modeRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: "#fff",
  },
  modeText: {
    color: "#64748b",
    fontWeight: "800",
  },
  modeTextActive: {
    color: "#0f172a",
  },
  formTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
    borderRadius: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  error: {
    color: "#b91c1c",
    backgroundColor: "#fee2e2",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    fontWeight: "600",
  },
  message: {
    color: "#166534",
    backgroundColor: "#dcfce7",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#2563eb",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  linkButton: {
    alignItems: "center",
    paddingTop: 14,
  },
  linkText: {
    color: "#2563eb",
    fontWeight: "800",
  },
});
