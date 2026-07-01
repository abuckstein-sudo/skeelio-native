import AsyncStorage from "@react-native-async-storage/async-storage";

const onboardingSeenKey = (userId: string) => `skeelio:onboardingSeen:${userId}`;

export async function hasSeenOnboarding(userId: string): Promise<boolean> {
  const seen = await AsyncStorage.getItem(onboardingSeenKey(userId));
  return !!seen;
}

export async function markOnboardingSeen(userId: string): Promise<void> {
  await AsyncStorage.setItem(onboardingSeenKey(userId), "1");
}
