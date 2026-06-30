import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "./_layout";

export default function IndexScreen() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (session) {
    console.log("[nav] index: session found, redirecting to /parent");
    return <Redirect href="/parent" />;
  }

  console.log("[nav] index: no session, redirecting to /login");
  return <Redirect href="/(auth)/login" />;
}
