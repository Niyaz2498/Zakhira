import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";

declare const process: { env: Record<string, string | undefined> };
import { useTheme } from "../src/theme/ThemeContext";
import { saveToken, sync } from "../src/store";
import { ZakhiraClient } from "@zakhira/core";

export default function SetupScreen() {
  const { tokens } = useTheme();
  const router = useRouter();
  const url = process.env.EXPO_PUBLIC_API_URL ?? "https://zakhira-backend.zakhira.workers.dev";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const s = makeStyles(tokens);

  async function handleSave() {
    if (!username.trim() || !password || !url.trim()) {
      Alert.alert("Missing fields", "Please enter your username, password, and server URL.");
      return;
    }
    setLoading(true);
    try {
      const client = new ZakhiraClient(url.trim(), "");
      const res = await client.login(username.trim(), password);
      if (!res.ok) {
        Alert.alert("Login failed", res.error ?? "Invalid username or password.");
        return;
      }
      await saveToken(res.data.token, url.trim());
      sync(); // fire-and-forget full sync on first login
      router.replace("/(tabs)/");
    } catch {
      Alert.alert("Connection failed", "Could not reach the server. Check the URL.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[s.root]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.wordmark}>Zakhira</Text>
        <Text style={s.subtitle}>Your personal quest log</Text>

        <View style={s.card}>
          <Text style={s.label}>Username</Text>
          <TextInput
            style={s.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="your username"
            placeholderTextColor={tokens.textTertiary}
          />

          <Text style={[s.label, { marginTop: 16 }]}>Password</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="your password"
            placeholderTextColor={tokens.textTertiary}
          />
        </View>

        <TouchableOpacity
          style={[s.button, loading && s.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={s.buttonText}>{loading ? "Connecting…" : "Sign In"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(tokens: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: tokens.bgPage },
    inner: { flex: 1, padding: 24, justifyContent: "center" },
    wordmark: {
      fontSize: 36,
      fontWeight: "700",
      color: tokens.accent,
      textAlign: "center",
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: tokens.textTertiary,
      textAlign: "center",
      marginBottom: 40,
    },
    card: {
      backgroundColor: tokens.bgCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.border,
      padding: 16,
      marginBottom: 24,
    },
    label: { fontSize: 12, color: tokens.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
    input: {
      backgroundColor: tokens.bgInput,
      borderWidth: 1,
      borderColor: tokens.border,
      borderRadius: 8,
      padding: 12,
      color: tokens.textPrimary,
      fontSize: 14,
    },
    button: {
      backgroundColor: tokens.accent,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: tokens.accentOn, fontSize: 16, fontWeight: "600" },
  });
}
