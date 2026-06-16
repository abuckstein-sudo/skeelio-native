import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface CameraCaptureModalProps {
  visible: boolean;
  onCaptured: (uri: string) => void;
  onClose: () => void;
}

type CaptureMode = "camera" | "preview";

export default function CameraCaptureModal({
  visible,
  onCaptured,
  onClose,
}: CameraCaptureModalProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const wasVisibleRef = useRef(false);
  const [mode, setMode] = useState<CaptureMode>("camera");
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [cameraSessionKey, setCameraSessionKey] = useState(0);
  const [captureError, setCaptureError] = useState("");

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      setMode("camera");
      setCapturedUri(null);
      setIsCapturing(false);
      setIsPicking(false);
      setIsReady(false);
      setCameraSessionKey((current) => current + 1);
      setCaptureError("");
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  const handleTakePicture = async () => {
    if (!cameraRef.current || isCapturing || !isReady) return;

    try {
      setCaptureError("");
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (photo?.uri) {
        setCapturedUri(photo.uri);
        setMode("preview");
      }
    } catch (err) {
      console.error("[CameraCaptureModal] capture error:", err);
      setCaptureError("Could not take a photo. Please try again.");
    } finally {
      setIsCapturing(false);
    }
  };

  const handlePickFromLibrary = async () => {
    if (isPicking) return;

    try {
      setCaptureError("");
      setIsPicking(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        onCaptured(result.assets[0].uri);
        onClose();
      }
    } catch (err) {
      console.error("[CameraCaptureModal] library picker error:", err);
      setCaptureError("Could not open the photo library. Please try again.");
    } finally {
      setIsPicking(false);
    }
  };

  const handleUsePhoto = () => {
    if (!capturedUri) return;
    onCaptured(capturedUri);
    onClose();
  };

  const handleRetake = () => {
    setIsReady(false);
    setMode("camera");
  };

  const renderPermissionState = () => {
    const permanentlyDenied = permission && !permission.granted && !permission.canAskAgain;

    return (
      <View style={styles.permissionContainer}>
        <MaterialCommunityIcons name="camera-outline" size={52} color="#2196f3" />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          Skeelio uses the camera to capture photos of worksheets so it can build practice from them.
        </Text>
        {permanentlyDenied ? (
          <TouchableOpacity style={styles.permissionButton} onPress={() => Linking.openSettings()}>
            <Text style={styles.permissionButtonText}>Open Settings</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Allow Camera</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.permissionButton, styles.libraryPermissionButton]}
          onPress={handlePickFromLibrary}
          disabled={isPicking}
        >
          <Text style={styles.permissionButtonText}>
            {isPicking ? "Opening..." : "Upload from Library"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permissionCloseButton} onPress={onClose}>
          <Text style={styles.permissionCloseText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        {!permission ? (
          <View style={styles.permissionContainer}>
            <ActivityIndicator size="large" color="#2196f3" />
          </View>
        ) : !permission.granted ? (
          renderPermissionState()
        ) : mode === "preview" && capturedUri ? (
          <>
            <Image source={{ uri: capturedUri }} style={styles.previewImage} resizeMode="contain" />
            <View style={[styles.previewBar, { paddingBottom: insets.bottom + 20 }]}>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleRetake}>
                <Text style={styles.secondaryButtonText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleUsePhoto}>
                <Text style={styles.primaryButtonText}>Use photo</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <CameraView
              key={cameraSessionKey}
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              active={visible}
              onCameraReady={() => setIsReady(true)}
            />
            <TouchableOpacity
              style={[styles.closeButton, { top: insets.top + 8 }]}
              onPress={onClose}
              hitSlop={12}
            >
              <MaterialCommunityIcons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <View style={[styles.cameraBar, { paddingBottom: insets.bottom + 20 }]}>
              {captureError ? <Text style={styles.captureError}>{captureError}</Text> : null}
              <TouchableOpacity
                style={[styles.libraryButton, isPicking && styles.libraryButtonDisabled]}
                onPress={handlePickFromLibrary}
                disabled={isPicking}
              >
                <MaterialCommunityIcons name="image-outline" size={26} color="#fff" />
                <Text style={styles.libraryText}>Library</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.shutterButton,
                  (!isReady || isCapturing) && styles.shutterButtonDisabled,
                ]}
                onPress={handleTakePicture}
                disabled={!isReady || isCapturing}
              >
                <View style={styles.shutterButtonInner} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: "#f7fbff",
  },
  permissionTitle: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: "800",
    color: "#1f2933",
    textAlign: "center",
  },
  permissionBody: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: "#52616b",
    textAlign: "center",
  },
  permissionButton: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 8,
    backgroundColor: "#2196f3",
  },
  libraryPermissionButton: {
    marginTop: 10,
    backgroundColor: "#111827",
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  permissionCloseButton: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  permissionCloseText: {
    color: "#52616b",
    fontSize: 15,
    fontWeight: "700",
  },
  closeButton: {
    position: "absolute",
    left: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 112,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  libraryButton: {
    position: "absolute",
    left: 24,
    bottom: 34,
    alignItems: "center",
    gap: 4,
  },
  libraryButtonDisabled: {
    opacity: 0.55,
  },
  libraryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  captureError: {
    position: "absolute",
    left: 20,
    right: 20,
    top: 12,
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  shutterButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterButtonDisabled: {
    opacity: 0.55,
  },
  shutterButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },
  previewImage: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  previewBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fff",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#2196f3",
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});
