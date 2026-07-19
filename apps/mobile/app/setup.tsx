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
import { useTheme } from "../src/theme/ThemeContext";
import { saveApiKey } from "../src/store";
import { ZakhiraClient } from "@zakhira/core";

export default function SetupScreen() {
  const { tokens } = useTheme();
  const router = useRouter();
  const [url, setUrl] = useState("http://localhost:8787");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);

  const s = makeStyles(tokens);

  async function handleSave() {
    if (!apiKey.trim() || !url.trim()) {
      Alert.alert("Missing fields", "Please enter both the server URL and your API key.");
      return;
    }
    setLoading(true);
    try {
      const client = new ZakhiraClient(url.trim(), apiKey.trim());
      const res = await client.listOperations();
      if (!res.ok) {
        Alert.alert("Connection failed", res.error ?? "Check your API key and URL.");
        return;
      }
      await saveApiKey(apiKey.trim(), url.trim());
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
          <Text style={s.label}>Server URL</Text>
          <TextInput
            style={s.input}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://localhost:8787"
            placeholderTextColor={tokens.textTertiary}
          />

          <Text style={[s.label, { marginTop: 16 }]}>API Key</Text>
          <TextInput
            style={[s.input, s.mono]}
            value={apiKey}
            onChangeText={setApiKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="Paste your key here"
            placeholderTextColor={tokens.textTertiary}
          />
        </View>

        <TouchableOpacity
          style={[s.button, loading && s.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={s.buttonText}>{loading ? "Connecting…" : "Connect"}</Text>
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
    mono: { fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
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
