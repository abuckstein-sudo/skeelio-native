import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { useAuth } from "./_layout";
import { hasSeenOnboarding } from "@/lib/onboardingSeen";

type SignedInTarget = "parent" | "onboarding";

export default function IndexScreen() {
  const { session, isLoading } = useAuth();
  const [signedInTarget, setSignedInTarget] = useState<SignedInTarget | null>(null);

  useEffect(() => {
    let cancelled = false;

    const chooseSignedInTarget = async () => {
      if (isLoading || !session?.user?.id) {
        setSignedInTarget(null);
        return;
      }

      const seen = await hasSeenOnboarding(session.user.id);
      if (!cancelled) {
        setSignedInTarget(seen ? "parent" : "onboarding");
      }
    };

    chooseSignedInTarget();

    return () => {
      cancelled = true;
    };
  }, [isLoading, session?.user?.id]);

  if (isLoading || (session && !signedInTarget)) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (session) {
    if (signedInTarget === "onboarding") {
      console.log("[nav] index: onboarding not seen, redirecting to /onboarding");
      return <Redirect href="/(app)/onboarding" />;
    }

    console.log("[nav] index: onboarding seen, redirecting to /parent");
    return <Redirect href="/parent" />;
  }

  console.log("[nav] index: no session, redirecting to /login");
  return <Redirect href="/(auth)/login" />;
}
