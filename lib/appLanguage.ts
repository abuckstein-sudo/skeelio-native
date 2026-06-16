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

export function appLanguageForChild(child?: {
  languages?: string[] | string | null;
  preferred_language?: string | null;
} | null): AppLanguage {
  const rawLanguages = child?.languages;
  let languages: string[] = [];

  if (Array.isArray(rawLanguages)) {
    languages = rawLanguages;
  } else if (typeof rawLanguages === "string") {
    try {
      const parsed = JSON.parse(rawLanguages);
      languages = Array.isArray(parsed) ? parsed : [rawLanguages];
    } catch {
      languages = [rawLanguages];
    }
  }

  const normalized = languages.map((language) => language.toLowerCase());
  const hasOnlyFrench = normalized.length === 1 && normalized[0] === "french";

  return hasOnlyFrench ? "fr" : "en";
}
