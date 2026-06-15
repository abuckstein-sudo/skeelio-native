import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import OnboardingCarousel from "@/components/OnboardingCarousel";
import { supabase } from "@/lib/supabase";

const SLIDES = [
  { id: "welcome", title: "Welcome to Skeelio", body: "Skeelio turns your child's homework into guided practice, and gives you real proof of what they've learned." },
  { id: "snap", title: "Start with a photo", body: "Snap a picture of any worksheet, or pick a topic, and Skeelio builds the practice from it automatically." },
  { id: "teach", title: "Teaches, then checks its work", body: "Skeelio explains each idea in clear, kid-friendly language, then gives practice it verifies itself, so your child learns the right thing." },
  { id: "mastery", title: "Practice until it sticks", body: "Skeelio keeps going until your child can do it alone, and shows you what they've mastered and where they need a hand." },
  { id: "privacy", title: "Your child's privacy, protected", body: "Your child never signs in or gives an email; there's no separate account for them. Their practice is saved under the first name or nickname you choose, and the only login on Skeelio is yours." },
  { id: "setup", title: "Let's get started", body: "Add your child and give them their first bit of work. It only takes a minute.", cta: "Add my child" },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreview = preview === "1";

  const markSeen = async () => {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (userId) {
      await AsyncStorage.setItem(`skeelio:onboardingSeen:${userId}`, "1");
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

  return (
    <OnboardingCarousel
      slides={SLIDES}
      onDone={handleDone}
      onSkip={handleSkip}
    />
  );
}
