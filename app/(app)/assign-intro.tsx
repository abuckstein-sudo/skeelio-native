import { useLocalSearchParams, useRouter } from "expo-router";
import OnboardingCarousel, { OnboardingSlide } from "@/components/OnboardingCarousel";

export default function AssignIntroScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string; childName?: string }>();
  const childId = String(params.childId || "");
  const childName = params.childName ? String(params.childName) : "your child";
  const possessiveName = params.childName ? `${childName}'s` : "your child's";

  const slides: OnboardingSlide[] = [
    {
      id: "give",
      icon: "clipboard-text-outline",
      title: "Give them their first work",
      body: `From ${possessiveName} page, add an assignment in seconds: snap a worksheet photo, or pick a topic.`,
    },
    {
      id: "lands",
      icon: "home-outline",
      title: "It lands on their home screen",
      body: `Skeelio turns it into guided practice and puts it on ${possessiveName} home, ready to start.`,
    },
    {
      id: "ready",
      icon: "rocket-launch-outline",
      title: "Ready when you are",
      body: `Let's set up ${possessiveName} first assignment now.`,
      cta: "Choose first assignment",
    },
  ];

  const goToAssign = () => {
    router.replace({
      pathname: "/(app)/assign",
      params: { childId, childName },
    });
  };

  return (
    <OnboardingCarousel
      slides={slides}
      onDone={goToAssign}
      onSkip={goToAssign}
    />
  );
}
