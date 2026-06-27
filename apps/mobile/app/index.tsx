import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useStore } from "../src/store/useStore";
import { View, ActivityIndicator } from "react-native";
import { useTheme } from "../src/theme/ThemeContext";

// Root redirects to the tabs or the setup screen
export default function Index() {
  const store = useStore();
  const router = useRouter();
  const { tokens } = useTheme();

  useEffect(() => {
    if (store.apiKey) {
      router.replace("/(tabs)/");
    } else {
      router.replace("/setup");
    }
  }, [store.apiKey]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: tokens.bgPage }}>
      <ActivityIndicator color={tokens.accent} />
    </View>
  );
}
