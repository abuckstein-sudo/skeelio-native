import { Stack, Redirect } from "expo-router";
import { useAuth } from "../_layout";

export default function AppLayout() {
  const { session, isLoading } = useAuth();

  // If logged out, redirect out of app group to login
  if (!isLoading && !session) {
    console.log("[nav] app layout: no session, redirecting to /login");
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
