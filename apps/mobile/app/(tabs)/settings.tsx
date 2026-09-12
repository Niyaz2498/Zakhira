import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme/ThemeContext";
import { useStore } from "../../src/store/useStore";
import { logout } from "../../src/store";
import { useCallback } from "react";
import { useRouter } from "expo-router";

export default function SettingsScreen() {
  const { tokens, theme, toggleTheme } = useTheme();
  const store = useStore();
  const router = useRouter();

  const handleSignOut = useCallback(() => {
    Alert.alert("Sign out?", "You'll need to sign in again to reconnect.", [
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
