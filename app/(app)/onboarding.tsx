import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import OnboardingCarousel from "@/components/OnboardingCarousel";
import { supabase } from "@/lib/supabase";

type AppLanguage = "en" | "fr";

const SLIDES: Record<AppLanguage, { id: string; title: string; body: string; cta?: string }[]> = {
  en: [
    { id: "welcome", title: "Welcome to Skeelio", body: "Skeelio turns your child's homework into guided practice, and gives you real proof of what they've learned." },
    { id: "snap", title: "Start with a photo", body: "Snap a picture of any worksheet, or pick a topic, and Skeelio builds the practice from it automatically." },
    { id: "teach", title: "Teaches, then checks its work", body: "Skeelio explains each idea in clear, kid-friendly language, then gives practice it verifies itself, so your child learns the right thing." },
    { id: "mastery", title: "Practice until it sticks", body: "Skeelio keeps going until your child can do it alone, and shows you what they've mastered and where they need a hand." },
    { id: "privacy", title: "Your child's privacy, protected", body: "Your child never signs in or gives an email; there's no separate account for them. Their practice is saved under the first name or nickname you choose, and the only login on Skeelio is yours." },
    { id: "setup", title: "Let's get started", body: "Add your child and give them their first bit of work. It only takes a minute.", cta: "Add my child" },
  ],
  fr: [
    { id: "welcome", title: "Bienvenue sur Skeelio", body: "Skeelio transforme les devoirs en exercices guidés et vous montre ce que votre enfant a vraiment compris." },
    { id: "snap", title: "Commencez avec une photo", body: "Prenez une photo d'une fiche, ou choisissez un sujet, et Skeelio crée automatiquement une séance d'entraînement." },
    { id: "teach", title: "Explique, puis vérifie", body: "Skeelio explique chaque notion avec des mots simples, puis propose des exercices corrigés pour consolider l'apprentissage." },
    { id: "mastery", title: "S'entraîner jusqu'à maîtriser", body: "Skeelio continue jusqu'à ce que votre enfant puisse réussir seul, et vous montre les acquis et les points à retravailler." },
    { id: "privacy", title: "La vie privée de votre enfant est protégée", body: "Votre enfant n'a pas de compte séparé ni d'adresse e-mail. Son travail reste rattaché au prénom ou surnom que vous choisissez." },
    { id: "setup", title: "C'est parti", body: "Ajoutez votre enfant et donnez-lui une première activité. Cela ne prend qu'une minute.", cta: "Ajouter mon enfant" },
  ],
};

const COPY = {
  en: {
    chooseTitle: "Choose your app language",
    chooseBody: "You can test Skeelio in English or French. This sets onboarding and setup text for this account.",
    english: "English",
    french: "French",
    skip: "Skip",
  },
  fr: {
    chooseTitle: "Choisissez la langue de l'app",
    chooseBody: "Vous pouvez tester Skeelio en français ou en anglais. Ce choix règle l'accueil et la configuration du compte.",
    english: "Anglais",
    french: "Français",
    skip: "Passer",
  },
};

export default function OnboardingScreen() {
  const router = useRouter();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreview = preview === "1";
  const [language, setLanguage] = useState<AppLanguage | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const loadLanguage = async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id ?? null;
      setUserId(id);
      const stored = id ? await AsyncStorage.getItem(`skeelio:appLanguage:${id}`) : null;
      if (stored === "en" || stored === "fr") setLanguage(stored);
    };

    loadLanguage();
  }, []);

  const chooseLanguage = async (nextLanguage: AppLanguage) => {
    setLanguage(nextLanguage);
    if (userId) {
      await AsyncStorage.setItem(`skeelio:appLanguage:${userId}`, nextLanguage);
    }
  };

  const markSeen = async () => {
    const { data } = await supabase.auth.getUser();
    const id = data.user?.id;
    if (id) {
      await AsyncStorage.setItem(`skeelio:onboardingSeen:${id}`, "1");
    }
  };

  const goToAddChild = () => {
    router.push({
      pathname: "/child-settings/[childId]",
      params: { childId: "new", mode: "add", fromOnboarding: "1" },
    });
  };

  const handleDone = async () => {
    if (isPreview) {
      goToAddChild();
      return;
    }

    await markSeen();
    goToAddChild();
  };

  const handleSkip = async () => {
    if (isPreview) {
      router.back();
      return;
    }

    await markSeen();
    router.replace("/children");
  };

  if (!language) {
    const copy = COPY.en;
    return (
      <View style={styles.languageContainer}>
        <View style={styles.languageCard}>
          <Text style={styles.languageTitle}>{copy.chooseTitle}</Text>
          <Text style={styles.languageBody}>{copy.chooseBody}</Text>
          <TouchableOpacity style={styles.languageButton} onPress={() => chooseLanguage("en")}>
            <Text style={styles.languageButtonText}>{copy.english}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.languageButtonSecondary} onPress={() => chooseLanguage("fr")}>
            <Text style={styles.languageButtonSecondaryText}>{copy.french}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <OnboardingCarousel
      slides={SLIDES[language]}
      onDone={handleDone}
      onSkip={handleSkip}
      skipLabel={COPY[language].skip}
    />
  );
}

const styles = StyleSheet.create({
  languageContainer: {
    flex: 1,
    backgroundColor: "#f7fbff",
    justifyContent: "center",
    padding: 22,
  },
  languageCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  languageTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1f2933",
    marginBottom: 10,
    textAlign: "center",
  },
  languageBody: {
    fontSize: 16,
    lineHeight: 23,
    color: "#52616b",
    textAlign: "center",
    marginBottom: 22,
  },
  languageButton: {
    backgroundColor: "#2196f3",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  languageButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  languageButtonSecondary: {
    borderWidth: 1,
    borderColor: "#2196f3",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  languageButtonSecondaryText: {
    color: "#2196f3",
    fontSize: 16,
    fontWeight: "800",
  },
});
