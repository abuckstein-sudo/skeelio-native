import { useRouter } from "expo-router";
import OnboardingCarousel from "@/components/OnboardingCarousel";

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

  const goToParent = () => {
    // Phase 2: wire first-run trigger + add-child -> assign funnel + 'seen' flag here.
    router.replace("/(app)/parent");
  };

  return (
    <OnboardingCarousel
      slides={SLIDES}
      onDone={goToParent}
      onSkip={goToParent}
    />
  );
}
