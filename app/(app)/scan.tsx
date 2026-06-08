import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";

interface ExtractResult {
  subject: string;
  method_name: string;
  method_description: string;
  example_observed: string;
  confidence: number;
}

export default function ScanScreen() {
  const router = useRouter();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState("");

  const handlePickImage = async (fromCamera: boolean) => {
    setError("");
    setResult(null);

    try {
      let imageResult;

      if (fromCamera) {
        imageResult = await ImagePicker.launchCameraAsync({
          base64: true,
          quality: 0.6,
        });
      } else {
        imageResult = await ImagePicker.launchImageLibraryAsync({
          base64: true,
          quality: 0.6,
        });
      }

      if (imageResult.canceled) {
        return;
      }

      const asset = imageResult.assets[0];
      const imageBase64 = asset.base64;
      const mimeType = asset.mimeType ?? "image/jpeg";

      if (!imageBase64) {
        setError("Couldn't read the image — try another photo");
        return;
      }

      setIsLoading(true);

      const { data, error: invokeError } = await supabase.functions.invoke("extract-method", {
        body: { imageBase64, mimeType },
      });

      console.log("[scan] error:", invokeError, "data:", data);

      if (invokeError) {
        setError("Couldn't read that worksheet — try another photo");
        console.error("[scan] invoke error:", invokeError);
        return;
      }

      setResult(data as ExtractResult);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scan a Worksheet</Text>
      </View>

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>Reading the worksheet…</Text>
        </View>
      )}

      {error && !isLoading && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {result && !isLoading && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultLabel}>Subject</Text>
          <Text style={styles.resultValue}>{result.subject}</Text>

          <Text style={styles.resultLabel}>Method</Text>
          <Text style={styles.resultValue}>{result.method_name}</Text>

          <Text style={styles.resultLabel}>Description</Text>
          <Text style={styles.resultText}>{result.method_description}</Text>

          <Text style={styles.resultLabel}>Example Observed</Text>
          <Text style={styles.resultText}>{result.example_observed}</Text>

          <Text style={styles.resultLabel}>Confidence</Text>
          <Text style={styles.resultValue}>{(result.confidence * 100).toFixed(0)}%</Text>
        </View>
      )}

      {!isLoading && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => handlePickImage(true)}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Take a photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.button}
            onPress={() => handlePickImage(false)}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Choose from library</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.backButton} onPress={handleBack}>
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
    marginTop: 16,
  },
  errorContainer: {
    backgroundColor: "#ffebee",
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#d32f2f",
    marginBottom: 24,
  },
  errorText: {
    fontSize: 15,
    color: "#d32f2f",
    lineHeight: 22,
  },
  resultContainer: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  resultValue: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 16,
  },
  resultText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
    marginBottom: 16,
  },
  buttonContainer: {
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#0000ff",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  backButton: {
    backgroundColor: "#e0e0e0",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  backButtonText: {
    color: "#1a1a1a",
    fontSize: 16,
    fontWeight: "bold",
  },
});
