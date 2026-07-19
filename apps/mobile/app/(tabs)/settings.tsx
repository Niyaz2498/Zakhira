import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeContext";
import { useStore } from "../../src/store/useStore";
import { getClient, logout } from "../../src/store";
import type { ApiKey } from "@zakhira/core";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "expo-router";

function KeyRow({
  apiKey,
  tokens,
  onRevoke,
}: {
  apiKey: ApiKey;
  tokens: any;
  onRevoke: (id: string) => void;
}) {
  return (
    <View style={[kStyles.row, { borderColor: tokens.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: tokens.textPrimary, fontWeight: "500" }}>{apiKey.name}</Text>
        <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>
          {apiKey.scope === "all" ? "Full access" : `Scoped (${apiKey.operationIds?.length ?? 0} ops)`}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() =>
          Alert.alert("Revoke key?", `"${apiKey.name}" will stop working immediately.`, [
            { text: "Cancel", style: "cancel" },
            { text: "Revoke", style: "destructive", onPress: () => onRevoke(apiKey.id) },
          ])
        }
      >
        <Text style={{ color: "#e05555", fontSize: 13 }}>Revoke</Text>
      </TouchableOpacity>
    </View>
  );
}

const kStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
});

export default function SettingsScreen() {
  const { tokens, theme, toggleTheme } = useTheme();
  const store = useStore();
  const router = useRouter();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);

  const handleSignOut = useCallback(() => {
    Alert.alert("Sign out?", "You'll need your API key to reconnect.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/setup");
        },
      },
    ]);
  }, [router]);

  useEffect(() => {
    const client = getClient();
    if (!client) return;
    client.listApiKeys().then((res) => {
      if (res.ok) setApiKeys(res.data);
    });
  }, []);

  async function handleRevoke(id: string) {
    const client = getClient();
    if (!client) return;
    const res = await client.revokeApiKey(id);
    if (res.ok) setApiKeys((prev) => prev.filter((k) => k.id !== id));
  }

  const s = makeStyles(tokens);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bgPage }}>
      <View style={[s.header, { borderBottomColor: tokens.border }]}>
        <Text style={[s.heading, { color: tokens.textPrimary }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Theme */}
        <View style={[s.section, { borderColor: tokens.border }]}>
          <Text style={[s.sectionTitle, { color: tokens.textSecondary }]}>Appearance</Text>
          <TouchableOpacity style={s.row} onPress={toggleTheme}>
            <Text style={{ color: tokens.textPrimary }}>Theme</Text>
            <Text style={{ color: tokens.textTertiary }}>
              {theme === "dark" ? "🌙 Dark" : "☀ Light"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sync */}
        <View style={[s.section, { borderColor: tokens.border, marginTop: 24 }]}>
          <Text style={[s.sectionTitle, { color: tokens.textSecondary }]}>Sync</Text>
          <View style={s.row}>
            <Text style={{ color: tokens.textPrimary }}>Last synced</Text>
            <Text style={{ color: tokens.textTertiary, fontSize: 12 }}>
              {store.lastSyncedAt
                ? new Date(store.lastSyncedAt).toLocaleTimeString()
                : "Never"}
            </Text>
          </View>
          <View style={s.row}>
            <Text style={{ color: tokens.textPrimary }}>Server</Text>
            <Text style={{ color: tokens.textTertiary, fontSize: 12, maxWidth: 200 }} numberOfLines={1}>
              {store.apiUrl}
            </Text>
          </View>
        </View>

        {/* API Keys */}
        <View style={[s.section, { borderColor: tokens.border, marginTop: 24 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[s.sectionTitle, { color: tokens.textSecondary }]}>API Keys</Text>
            <TouchableOpacity>
              <Text style={{ color: tokens.accent, fontSize: 13 }}>+ New key</Text>
            </TouchableOpacity>
          </View>
          {apiKeys.map((k) => (
            <KeyRow key={k.id} apiKey={k} tokens={tokens} onRevoke={handleRevoke} />
          ))}
          {apiKeys.length === 0 && (
            <Text style={{ color: tokens.textTertiary, fontSize: 13 }}>No keys loaded</Text>
          )}
        </View>
        {/* Sign out */}
        <TouchableOpacity
          style={[s.signOutBtn, { borderColor: "#e05555" }]}
          onPress={handleSignOut}
        >
          <Text style={{ color: "#e05555", fontWeight: "600", fontSize: 15 }}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(tokens: any) {
  return StyleSheet.create({
    header: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    heading: { fontSize: 22, fontWeight: "700" },
    section: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 10,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 10,
    },
    signOutBtn: {
      marginTop: 32,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
    },
  });
}
