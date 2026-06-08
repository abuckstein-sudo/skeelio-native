import { createContext, useContext, useEffect, useState } from "react";
import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { supabase } from "@/lib/supabase";

type AuthContextType = {
  session: any;
  isLoading: boolean;
};

export const AuthContext = createContext<AuthContextType>({
  session: null,
  isLoading: true,
});

export const useAuth = () => useContext(AuthContext);

function RootLayoutContent() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}

export default function RootLayout() {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        console.log("[auth] checking");
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.log("[auth] getSession error:", error.message);
          setSession(null);
          return;
        }

        console.log("[auth] getSession resolved, session =", session ? "present" : "null");
        setSession(session);
      } catch (err) {
        console.log("[auth] exception during getSession:", err);
        setSession(null);
      } finally {
        console.log("[auth] loading set false");
        setIsLoading(false);
      }
    };

    initAuth();

    // Subscribe to auth state changes (only updates state, no navigation)
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[auth] state changed:", event, session ? "authenticated" : "unauthenticated");
        setSession(session);
      }
    );

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ session, isLoading }}>
      <RootLayoutContent />
    </AuthContext.Provider>
  );
}
