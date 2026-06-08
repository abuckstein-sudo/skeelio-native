import { Stack, Redirect } from "expo-router";
import { useAuth } from "../_layout";

export default function AuthLayout() {
  const { session, isLoading } = useAuth();

  // If logged in, redirect out of auth group
  if (!isLoading && session) {
    console.log("[nav] auth layout: session found, redirecting to /children");
    return <Redirect href="/children" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
