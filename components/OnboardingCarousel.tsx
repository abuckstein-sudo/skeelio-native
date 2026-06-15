import { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export interface OnboardingSlide {
  id: string;
  title: string;
  body: string;
  cta?: string;
}

interface OnboardingCarouselProps {
  slides: OnboardingSlide[];
  onDone: () => void;
  onSkip: () => void;
}

const ICONS = ["school-outline", "camera-outline", "lightbulb-on-outline", "trophy-outline", "rocket-launch-outline"] as const;

export default function OnboardingCarousel({ slides, onDone, onSkip }: OnboardingCarouselProps) {
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [currentIndex, entrance]);

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(Math.max(0, Math.min(nextIndex, slides.length - 1)));
  };

  const renderSlide = ({ item, index }: { item: OnboardingSlide; index: number }) => {
    const isLast = index === slides.length - 1;
    const animatedStyle =
      index === currentIndex
        ? {
            opacity: entrance,
            transform: [
              {
                translateY: entrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          }
        : undefined;

    return (
      <View style={[styles.slide, { width }]}>
        {!isLast && (
          <TouchableOpacity style={styles.skipButton} onPress={onSkip} hitSlop={8}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}

        <Animated.View style={[styles.card, animatedStyle]}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name={ICONS[index % ICONS.length]} size={42} color="#2196f3" />
          </View>
          <View style={styles.accentPill} />
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
        </Animated.View>

        {isLast && (
          <TouchableOpacity style={styles.primaryButton} onPress={onDone}>
            <Text style={styles.primaryButtonText}>{item.cta || "Get started"}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={slides}
        keyExtractor={(item) => item.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
      />

      <View style={styles.dots}>
        {slides.map((slide, index) => (
          <View
            key={slide.id}
            style={[
              styles.dot,
              index === currentIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7fbff",
  },
  slide: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 40,
    justifyContent: "center",
  },
  skipButton: {
    position: "absolute",
    top: 18,
    right: 20,
    zIndex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  skipText: {
    color: "#2196f3",
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 34,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#e3f2fd",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  accentPill: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#4caf50",
    marginBottom: 20,
  },
  title: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "800",
    color: "#1f2933",
    textAlign: "center",
    marginBottom: 14,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: "#52616b",
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 28,
    backgroundColor: "#2196f3",
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: "center",
    shadowColor: "#2196f3",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  dots: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 24,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#c8d6e5",
  },
  dotActive: {
    width: 24,
    backgroundColor: "#4caf50",
  },
});
