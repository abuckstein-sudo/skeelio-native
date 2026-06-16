import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Image,
  ScrollView,
  FlatList,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { decode } from "base64-arraybuffer";
import CameraCaptureModal from "@/components/CameraCaptureModal";
import { createSpellingAssignment } from "@/lib/assignments";
import {
  createSpellingItems,
  createSpellingList,
  type SpellingLanguage,
} from "@/lib/spelling";

interface Child {
  id: string;
  name: string;
  selected_avatar?: string;
  intro_seen?: boolean;
}

interface PracticeItem {
  question: string;
  correct_answer?: string;
  expected_answer?: string;
  answer?: string;
  kind?: string;
}

interface WorksheetData {
  concept: { label: string; description?: string };
  lesson: string;
  language: string;
  domain: string;
  source_type?: string;
  spelling_words?: string[];
  grade_band?: string;
  practice: PracticeItem[];
}

const AVATAR_EMOJI: Record<string, string> = {
  cat: "🐱",
  owl: "🦉",
  fox: "🦊",
  bear: "🐻",
  rabbit: "🐰",
  panda: "🐼",
};

function uniqueWords(words?: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const raw of words || []) {
    const word = String(raw || "").normalize("NFC").replace(/\s+/g, " ").trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(word);
  }

  return cleaned;
}

function toSpellingLanguage(language: string): SpellingLanguage {
  const normalized = (language || "").toLowerCase();
  return normalized.includes("fr") || normalized.includes("french") || normalized.includes("fran")
    ? "French"
    : "English";
}

function isSpellingListReview(data: WorksheetData): boolean {
  return data.source_type === "spelling_list" && uniqueWords(data.spelling_words).length > 0;
}

export default function ScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const routeChildId = (params.childId as string) || null;

  const [userId, setUserId] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(routeChildId);
  const [childName, setChildName] = useState<string>("");
  const [children, setChildren] = useState<Child[]>([]);
  const [showChildPicker, setShowChildPicker] = useState(!routeChildId);
  const [loadingChildren, setLoadingChildren] = useState(false);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [jpegBase64, setJpegBase64] = useState<string | null>(null);
  const [base64Raw, setBase64Raw] = useState<string | null>(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [showReview, setShowReview] = useState(false);
  const [reviewData, setReviewData] = useState<WorksheetData | null>(null);
  const [assigning, setAssigning] = useState(false);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationData, setConfirmationData] = useState<{ conceptLabel: string; childName: string; kind?: "worksheet" | "spelling" } | null>(null);

  // Initialize auth and fetch children if needed
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) {
          setError("Not authenticated");
          return;
        }
        setUserId(user.id);

        if (!routeChildId) {
          await fetchChildren(user.id);
        } else {
          // Fetch child name for this childId
          await fetchChildName(routeChildId);
        }
      } catch (err) {
        console.error("[scan] init error:", err);
        setError("Failed to initialize");
      }
    };

    init();
  }, [routeChildId]);

  const fetchChildren = async (uid: string) => {
    try {
      setLoadingChildren(true);
      const { data, error: dbError } = await supabase
        .from("children")
        .select("id, name, selected_avatar, intro_seen")
        .eq("parent_id", uid);

      if (dbError) {
        console.error("[scan] children fetch error:", dbError);
        setChildren([]);
      } else {
        setChildren((data || []) as Child[]);
        setShowChildPicker(true);
      }
    } catch (err) {
      console.error("[scan] children fetch error:", err);
      setChildren([]);
    } finally {
      setLoadingChildren(false);
    }
  };

  const fetchChildName = async (cid: string) => {
    try {
      const { data, error: dbError } = await supabase
        .from("children")
        .select("name")
        .eq("id", cid)
        .single();

      if (!dbError && data?.name) {
        setChildName(data.name);
      }
    } catch {
      // Ignore error, use default
    }
  };

  const handleSelectChild = (child: Child) => {
    setChildId(child.id);
    setChildName(child.name);
    setShowChildPicker(false);
    setImageUri(null);
    setJpegBase64(null);
    setBase64Raw(null);
    setError("");
  };

  const handleBack = () => {
    if (showConfirmation) {
      setShowConfirmation(false);
      setConfirmationData(null);
      setImageUri(null);
      setJpegBase64(null);
      setBase64Raw(null);
      setReviewData(null);
      setShowReview(false);
      return;
    }
    if (showReview) {
      setShowReview(false);
      setReviewData(null);
      setImageUri(null);
      setJpegBase64(null);
      setBase64Raw(null);
      return;
    }
    router.back();
  };

  const handleConfirmationDone = () => {
    router.replace("/(app)/parent");
  };

  const pickImage = async () => {
    try {
      setError("");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        await processImage(result.assets[0].uri);
      }
    } catch (err) {
      console.error("[scan] image picker error:", err);
      setError("Failed to access photo library");
    }
  };

  const processImage = async (uri: string) => {
    try {
      setLoading(true);
      setImageUri(uri);
      setError("");

      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1500 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) {
        throw new Error("Failed to convert image to base64");
      }

      const dataUrl = "data:image/jpeg;base64," + manipulated.base64;
      setJpegBase64(dataUrl);
      setBase64Raw(manipulated.base64);

      // Call absorb-worksheet
      await callAbsorbWorksheet(dataUrl, manipulated.base64);
    } catch (err) {
      console.error("[scan] process image error:", err);
      setError("Failed to process image");
      setLoading(false);
    }
  };

  const callAbsorbWorksheet = async (dataUrl: string, raw: string) => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "absorb-worksheet",
        { body: { image: dataUrl } }
      );

      console.log("[scan absorb]", JSON.stringify({ err: invokeError?.message ?? null, keys: data ? Object.keys(data) : null }));

      if (invokeError) {
        console.error("[scan] absorb error:", invokeError);
        setError("Failed to analyze worksheet");
        setLoading(false);
        return;
      }

      const result = data as WorksheetData;

      // Validate required fields
      if (!result?.concept?.label || !result?.domain || !result?.language) {
        throw new Error("Missing required worksheet data");
      }

      // Show review screen instead of immediately assigning
      setReviewData(result);
      setShowReview(true);
      setLoading(false);
    } catch (err) {
      console.error("[scan] absorb error:", err);
      setError("Failed to analyze worksheet");
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    try {
      if (!reviewData || !childId || !userId || !base64Raw) {
        throw new Error("Missing required data for assignment");
      }

      setAssigning(true);

      if (isSpellingListReview(reviewData)) {
        const language = toSpellingLanguage(reviewData.language);
        const words = uniqueWords(reviewData.spelling_words);
        if (words.length === 0) {
          throw new Error("No spelling words found");
        }

        const today = new Date().toISOString().split("T")[0];
        const listTitle = `${language === "French" ? "Liste photo" : "Photo list"} · ${today}`;
        const list = await createSpellingList(childId, listTitle, language, "photo");
        await createSpellingItems(list.id, childId, words, language);
        await createSpellingAssignment(childId, list.id, listTitle, words.length, "practice");
        const countLabel = language === "French"
          ? `${words.length} ${words.length === 1 ? "mot" : "mots"}`
          : `${words.length} ${words.length === 1 ? "word" : "words"}`;

        setConfirmationData({
          conceptLabel: `${listTitle} · ${countLabel}`,
          childName,
          kind: "spelling",
        });
        setShowConfirmation(true);
        setShowReview(false);
        setReviewData(null);
        setBase64Raw(null);
        setJpegBase64(null);
        setImageUri(null);
        setAssigning(false);
        return;
      }

      // Normalize domain
      const rawDomain = reviewData.domain || "";
      const domainNorm = /math/i.test(rawDomain) ? "math" : "language";

      // Default missing fields
      const grade_band = reviewData.grade_band || "";
      const lesson = reviewData.lesson || "";

      // Upload photo to storage
      let image_path = null;
      let upErr = null;
      try {
        const path = `${userId}/${childId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from("worksheets")
          .upload(path, decode(base64Raw), { contentType: "image/jpeg", upsert: false });
        upErr = uploadErr;
        if (!uploadErr) {
          image_path = path;
        }
      } catch (e) {
        upErr = e;
      }

      console.log("[scan precheck]", JSON.stringify({
        userId: !!userId,
        childId,
        hasImage: !!base64Raw,
        concept: reviewData.concept?.label ?? null,
        domain: domainNorm,
        language: reviewData.language ?? null,
        grade_band: grade_band,
      }));

      // Create episode row with status 'pending'
      const { data: ep, error: epErr } = await supabase
        .from("tutor_episodes")
        .insert({
          parent_id: userId,
          child_id: childId,
          source: "photo",
          image_path,
          domain: domainNorm,
          language: reviewData.language,
          grade_band: grade_band,
          concept: reviewData.concept,
          lesson: lesson,
          status: "pending",
        })
        .select("id")
        .single();

      console.log("[episode created]", {
        id: ep?.id,
        image_path,
        epErr: epErr?.message,
        upErr: typeof upErr !== "undefined" ? (upErr as any)?.message : null,
        status: "pending",
      });

      if (epErr || !ep?.id) {
        throw new Error("Failed to create episode");
      }

      // Show confirmation screen
      setConfirmationData({
        conceptLabel: reviewData.concept.label,
        childName: childName,
        kind: "worksheet",
      });
      setShowConfirmation(true);
      setShowReview(false);
      setReviewData(null);
      setBase64Raw(null);
      setJpegBase64(null);
      setImageUri(null);
      setAssigning(false);
    } catch (err) {
      console.error("[scan] assignment error:", err);
      setError("Failed to assign episode: " + String(err));
      setAssigning(false);
    }
  };

  // Child picker modal
  if (showChildPicker && !childId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select Child</Text>
          <View style={{ width: 24 }} />
        </View>

        {loadingChildren ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#2196f3" />
          </View>
        ) : children.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No children found</Text>
            <TouchableOpacity style={styles.button} onPress={handleBack}>
              <Text style={styles.buttonText}>Back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={children}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.childRow}
                onPress={() => handleSelectChild(item)}
              >
                {item.intro_seen && item.selected_avatar && (
                  <Text style={styles.avatarEmoji}>
                    {AVATAR_EMOJI[item.selected_avatar] || AVATAR_EMOJI.fox}
                  </Text>
                )}
                <Text style={styles.childName}>{item.name}</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.listContent}
          />
        )}
      </SafeAreaView>
    );
  }

  // Review screen
  if (showReview && reviewData) {
    const practiceItems = (reviewData.practice || []).slice(0, 3);
    const spellingWords = uniqueWords(reviewData.spelling_words);
    const isSpellingList = isSpellingListReview(reviewData);

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Worksheet</Text>
          <View style={{ width: 24 }} />
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError("")}>
              <MaterialCommunityIcons name="close" size={20} color="#d32f2f" />
            </TouchableOpacity>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.reviewContent}>
          {/* Worksheet thumbnail */}
          {imageUri && (
            <View style={styles.reviewThumbnailContainer}>
              <Image source={{ uri: imageUri }} style={styles.reviewThumbnail} />
            </View>
          )}

          {/* Ce que Skeelio va travailler */}
          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>Ce que Skeelio va travailler</Text>
            <Text style={styles.reviewConceptLabel}>{reviewData.concept.label}</Text>
            {reviewData.concept.description && (
              <Text style={styles.reviewDescription}>{reviewData.concept.description}</Text>
            )}
          </View>

          {isSpellingList && (
            <View style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>Mots détectés</Text>
              <View style={styles.wordChipContainer}>
                {spellingWords.map((word, idx) => (
                  <View key={`${word}-${idx}`} style={styles.wordChip}>
                    <Text style={styles.wordChipText}>{word}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* La leçon */}
          {!isSpellingList && (
            <View style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>La leçon</Text>
              <Text style={styles.reviewLessonText}>{reviewData.lesson || "(No lesson text)"}</Text>
            </View>
          )}

          {/* Exemples de questions */}
          {!isSpellingList && practiceItems.length > 0 && (
            <View style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>Exemples de questions</Text>
              {practiceItems.map((item, idx) => {
                const answer = item.expected_answer || item.correct_answer || item.answer || "(No answer)";
                return (
                  <View key={idx} style={styles.reviewQuestionCard}>
                    <Text style={styles.reviewQuestion}>{item.question}</Text>
                    <View style={styles.reviewAnswerBox}>
                      <Text style={styles.reviewAnswerLabel}>Réponse attendue:</Text>
                      <Text style={styles.reviewAnswer}>{answer}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.reviewButtonContainer}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleBack}
            disabled={assigning}
          >
            <Text style={styles.secondaryButtonText}>Reprendre la photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, assigning && styles.buttonDisabled]}
            onPress={handleAssign}
            disabled={assigning}
          >
            {assigning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isSpellingList ? `Créer la liste pour ${childName}` : `Assigner à ${childName}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Confirmation screen
  if (showConfirmation && confirmationData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Worksheet</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.confirmationContent}>
          <View style={styles.confirmationCard}>
            <View style={styles.confirmationIconBadge}>
              <MaterialCommunityIcons name="check" size={40} color="#fff" />
            </View>
            <Text style={styles.confirmationEyebrow}>Worksheet ready</Text>
            <Text style={styles.confirmationTitle}>Séance prête</Text>
            <Text style={styles.confirmationText}>
              <Text style={styles.boldText}>{confirmationData.conceptLabel}</Text>
            </Text>
            <View style={styles.confirmationDetailRow}>
              <MaterialCommunityIcons name="account-child" size={18} color="#2196f3" />
              <Text style={styles.confirmationSubtext}>
                Assignée à <Text style={styles.boldText}>{confirmationData.childName}</Text>
              </Text>
            </View>

            <TouchableOpacity
              style={styles.confirmationButton}
              onPress={handleConfirmationDone}
            >
              <Text style={styles.primaryButtonText}>Retour au tableau parent</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Main scan screen (capture)
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Worksheet</Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError("")}>
            <MaterialCommunityIcons name="close" size={20} color="#d32f2f" />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#2196f3" />
            <Text style={styles.loadingText}>Analyse en cours…</Text>
          </View>
        ) : imageUri ? (
          <View style={styles.previewSection}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={() => {
                setImageUri(null);
                setJpegBase64(null);
                setBase64Raw(null);
              }}
            >
              <MaterialCommunityIcons name="camera" size={20} color="#fff" />
              <Text style={styles.retakeButtonText}>Retake Photo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.actionButton} onPress={() => setCameraVisible(true)}>
              <MaterialCommunityIcons name="camera" size={32} color="#fff" />
              <Text style={styles.actionButtonText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={pickImage}>
              <MaterialCommunityIcons name="image" size={32} color="#fff" />
              <Text style={styles.actionButtonText}>Choose from Library</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      <CameraCaptureModal
        visible={cameraVisible}
        onCaptured={(uri) => {
          processImage(uri);
        }}
        onClose={() => setCameraVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  errorBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffebee",
    borderBottomWidth: 1,
    borderBottomColor: "#ffcdd2",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#d32f2f",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  confirmationContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  confirmationCard: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 28,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  confirmationIconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4caf50",
    marginBottom: 16,
  },
  confirmationEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2196f3",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  confirmationDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    marginBottom: 22,
  },
  confirmationButton: {
    minWidth: 210,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#2196f3",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: "#666",
  },
  previewSection: {
    width: "100%",
    alignItems: "center",
    gap: 16,
  },
  previewImage: {
    width: 300,
    height: 300,
    borderRadius: 8,
    resizeMode: "contain",
  },
  retakeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#2196f3",
    borderRadius: 8,
  },
  retakeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  actionButtons: {
    width: "100%",
    gap: 16,
  },
  actionButton: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: "#2196f3",
    borderRadius: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 16,
  },
  avatarEmoji: {
    fontSize: 32,
  },
  childName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
  },
  button: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#2196f3",
    borderRadius: 6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  listContent: {
    flexGrow: 1,
  },
  // Review screen styles
  reviewThumbnailContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  reviewThumbnail: {
    width: 200,
    height: 200,
    borderRadius: 8,
    resizeMode: "contain",
  },
  reviewSection: {
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  reviewSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  reviewConceptLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2196f3",
    marginBottom: 4,
  },
  reviewDescription: {
    fontSize: 13,
    color: "#666",
    lineHeight: 19,
  },
  reviewLessonText: {
    fontSize: 13,
    color: "#666",
    lineHeight: 19,
  },
  wordChipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  wordChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#eef6ff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cfe7ff",
  },
  wordChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1769aa",
  },
  reviewQuestionCard: {
    backgroundColor: "#f9f9f9",
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
  },
  reviewQuestion: {
    fontSize: 13,
    fontWeight: "500",
    color: "#333",
    marginBottom: 8,
  },
  reviewAnswerBox: {
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
  },
  reviewAnswerLabel: {
    fontSize: 11,
    color: "#999",
    fontWeight: "500",
    marginBottom: 2,
  },
  reviewAnswer: {
    fontSize: 12,
    color: "#2196f3",
    fontWeight: "600",
  },
  reviewButtonContainer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  primaryButton: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#4caf50",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  secondaryButton: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#e0e0e0",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  confirmationBox: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
  },
  confirmationTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
  },
  confirmationText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
  },
  confirmationSubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    lineHeight: 20,
  },
  boldText: {
    fontWeight: "700",
    color: "#333",
  },
});
