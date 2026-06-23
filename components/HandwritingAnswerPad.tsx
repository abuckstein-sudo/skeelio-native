import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

export type HandwritingStroke = { points: { x: number; y: number }[] };

type Props = {
  language?: "en" | "fr";
  questionText?: string;
  onRecognized: (text: string) => void;
  onDrawingChange?: (isDrawing: boolean) => void;
};

export default function HandwritingAnswerPad({ language = "en", questionText, onRecognized, onDrawingChange }: Props) {
  const [strokes, setStrokes] = useState<HandwritingStroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<HandwritingStroke | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const bounds = useRef({ width: 320, height: 180 });

  const finishActiveStroke = useCallback(() => {
    setActiveStroke((current) => {
      if (current && current.points.length > 1) {
        setStrokes((existing) => [...existing, current]);
      }
      return null;
    });
    onDrawingChange?.(false);
  }, [onDrawingChange]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      onDrawingChange?.(true);
      setActiveStroke({ points: [{ x: locationX, y: locationY }] });
    },
    onPanResponderMove: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      setActiveStroke((current) => {
        if (!current) return { points: [{ x: locationX, y: locationY }] };
        const points = current.points;
        const last = points[points.length - 1];
        if (last && Math.hypot(last.x - locationX, last.y - locationY) < 2) return current;
        return { points: [...points, { x: locationX, y: locationY }] };
      });
    },
    onPanResponderRelease: finishActiveStroke,
    onPanResponderTerminate: finishActiveStroke,
    onShouldBlockNativeResponder: () => true,
  }), [finishActiveStroke, onDrawingChange]);

  const allStrokes = activeStroke ? [...strokes, activeStroke] : strokes;

  const recognize = async () => {
    if (strokes.length === 0 || recognizing) return;
    setRecognizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("recognize-handwriting-answer", {
        body: {
          strokes,
          width: bounds.current.width,
          height: bounds.current.height,
          language,
          questionText,
        },
      });
      if (error) throw error;
      const text = String((data as any)?.text || "").trim();
      if (text) onRecognized(text);
    } catch (err) {
      console.error("[handwriting] recognition failed:", err);
    } finally {
      setRecognizing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.pad}
        onLayout={(event) => {
          bounds.current = {
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          };
        }}
        {...panResponder.panHandlers}
      >
        <Svg width="100%" height="100%" pointerEvents="none">
          {allStrokes.map((stroke, index) => (
            <Path
              key={index}
              d={pathForStroke(stroke)}
              stroke="#111827"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
        {allStrokes.length === 0 && (
          <Text style={styles.placeholder} pointerEvents="none">
            {language === "fr" ? "Écris ta réponse ici" : "Write your answer here"}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            setActiveStroke(null);
            setStrokes([]);
            onDrawingChange?.(false);
          }}
          disabled={recognizing}
        >
          <MaterialCommunityIcons name="eraser" size={16} color="#334155" />
          <Text style={styles.secondaryButtonText}>{language === "fr" ? "Effacer" : "Clear"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, (strokes.length === 0 || recognizing) && styles.disabledButton]}
          onPress={recognize}
          disabled={strokes.length === 0 || recognizing}
        >
          {recognizing ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="text-recognition" size={16} color="#fff" />}
          <Text style={styles.primaryButtonText}>{language === "fr" ? "Lire" : "Recognize"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function pathForStroke(stroke: HandwritingStroke) {
  if (stroke.points.length === 0) return "";
  const [first, ...rest] = stroke.points;
  return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${rest.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ")}`;
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  pad: {
    height: 178,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  placeholder: {
    position: "absolute",
    left: 12,
    top: 12,
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secondaryButtonText: {
    color: "#334155",
    fontWeight: "800",
  },
  primaryButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: "#2563eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.55,
  },
});
