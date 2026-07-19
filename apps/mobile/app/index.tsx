import { Redirect } from "expo-router";
import { useStore } from "../src/store/useStore";
import { View, ActivityIndicator } from "react-native";
import { useTheme } from "../src/theme/ThemeContext";

export default function Index() {
  const store = useStore();
  const { tokens } = useTheme();

  // Wait for SecureStore to finish loading before deciding where to go
  if (!store.loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: tokens.bgPage }}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  if (store.apiKey) {
    return <Redirect href="/(tabs)/" />;
  }

  return <Redirect href="/setup" />;
}
