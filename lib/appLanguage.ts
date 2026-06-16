import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppLanguage = "en" | "fr";

export const DEFAULT_APP_LANGUAGE: AppLanguage = "en";

const keyForUser = (userId: string) => `skeelio:appLanguage:${userId}`;

export async function getStoredAppLanguage(userId?: string | null): Promise<AppLanguage> {
  if (!userId) return DEFAULT_APP_LANGUAGE;

  const stored = await AsyncStorage.getItem(keyForUser(userId));
  return stored === "fr" || stored === "en" ? stored : DEFAULT_APP_LANGUAGE;
}

export async function setStoredAppLanguage(userId: string | null | undefined, language: AppLanguage) {
  if (!userId) return;
  await AsyncStorage.setItem(keyForUser(userId), language);
}

export function childLanguageForApp(language: AppLanguage) {
  return language === "fr" ? "French" : "English";
}
