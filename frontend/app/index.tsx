import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { colors, fonts, radius, spacing } from "@/src/theme";
import { useSubscription } from "@/src/lib/revenuecat";

type RailItem = {
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  testID: string;
};

const RAIL_ITEMS: RailItem[] = [
  { icon: "person-outline", route: "/profile", testID: "rail-profile-button" },
  { icon: "time-outline", route: "/history", testID: "rail-history-button" },
  { icon: "help-circle-outline", route: "/help", testID: "rail-help-button" },
  { icon: "diamond-outline", route: "/subscription", testID: "rail-subscription-button" },
];

export default function CameraHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const { isSubscribed } = useSubscription();

  const openRoute = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as never);
  };

  const capture = async () => {
    if (capturing || !cameraRef.current) return;
    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) {
        router.push({ pathname: "/result", params: { uri: photo.uri, mime: "image/jpeg" } });
      }
    } catch (e) {
      console.warn("Capture failed:", e);
    } finally {
      setCapturing(false);
    }
  };

  const pickFromGallery = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!res.canceled && res.assets?.[0]?.uri) {
        const asset = res.assets[0];
        router.push({
          pathname: "/result",
          params: { uri: asset.uri, mime: asset.mimeType ?? "image/jpeg" },
        });
      }
    } catch (e) {
      console.warn("Picker failed:", e);
    }
  };

  const askCameraPermission = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (permission && !permission.granted && !permission.canAskAgain) {
      Linking.openSettings();
      return;
    }
    await requestPermission();
  };

  const renderCameraArea = () => {
    if (!permission) {
      return (
        <View style={styles.permissionWrap}>
          <ActivityIndicator color={colors.brand} />
        </View>
      );
    }
    if (!permission.granted) {
      const blocked = !permission.canAskAgain;
      return (
        <View style={styles.permissionWrap} testID="camera-permission-screen">
          <Ionicons name="scan-outline" size={56} color={colors.brand} />
          <Text style={styles.permTitle}>CAMERA ACCESS</Text>
          <Text style={styles.permBody}>
            Point at any photo to instantly check if it is real or AI-generated. You can also
            upload from your gallery below.
          </Text>
          <Pressable
            testID="camera-permission-button"
            style={styles.permButton}
            onPress={askCameraPermission}
          >
            <Text style={styles.permButtonText}>
              {blocked ? "OPEN SETTINGS" : "ENABLE CAMERA"}
            </Text>
          </Pressable>
        </View>
      );
    }
    return (
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing}>
        <View style={styles.crosshair} pointerEvents="none">
          <Ionicons name="scan-outline" size={220} color="rgba(245,245,245,0.14)" />
        </View>
      </CameraView>
    );
  };

  return (
    <View style={styles.container} testID="camera-home-screen">
      {renderCameraArea()}

      {/* Top label */}
      <View style={[styles.topBar, { top: insets.top + spacing.sm }]} pointerEvents="none">
        <Text style={styles.topLabel}>DETECT·AI</Text>
        {isSubscribed && (
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        )}
      </View>

      {/* Left vertical rail */}
      <View style={[styles.railWrap, { left: Math.max(insets.left, spacing.md) }]}>
        <BlurView intensity={40} tint="dark" style={styles.rail}>
          {RAIL_ITEMS.map((item) => (
            <Pressable
              key={item.route}
              testID={item.testID}
              onPress={() => openRoute(item.route)}
              style={styles.railButton}
              hitSlop={6}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={item.route === "/subscription" ? colors.brand : colors.onSurface}
              />
            </Pressable>
          ))}
        </BlurView>
      </View>

      {/* Bottom controls */}
      <View style={[styles.bottomControls, { bottom: insets.bottom + spacing.xl }]}>
        <Pressable
          testID="flip-camera-button"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFacing((f) => (f === "back" ? "front" : "back"));
          }}
          style={styles.sideButtonWrap}
        >
          <BlurView intensity={40} tint="dark" style={styles.sideButton}>
            <Ionicons name="camera-reverse-outline" size={22} color={colors.onSurface} />
          </BlurView>
        </Pressable>

        <Pressable
          testID="shutter-button"
          onPress={capture}
          disabled={!permission?.granted || capturing}
          style={({ pressed }) => [styles.shutterOuter, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          <View style={[styles.shutterInner, capturing && { backgroundColor: colors.brand }]}>
            {capturing && <ActivityIndicator color="#FFFFFF" />}
          </View>
        </Pressable>

        <Pressable testID="gallery-upload-button" onPress={pickFromGallery} style={styles.sideButtonWrap}>
          <BlurView intensity={40} tint="dark" style={styles.sideButton}>
            <Ionicons name="images-outline" size={22} color={colors.onSurface} />
          </BlurView>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  permissionWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 84,
    paddingRight: spacing.xl,
    backgroundColor: colors.surface,
  },
  permTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.onSurface,
    letterSpacing: 2,
    marginTop: spacing.lg,
  },
  permBody: {
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 20,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing.md,
  },
  permButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: 48,
    justifyContent: "center",
  },
  permButtonText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 14,
    color: "#FFFFFF",
    letterSpacing: 1.5,
  },
  crosshair: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
  },
  topLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 13,
    letterSpacing: 4,
    color: colors.onSurface,
  },
  proBadge: {
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  proBadgeText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  railWrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  rail: {
    borderRadius: radius.pill,
    overflow: "hidden",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    backgroundColor: "rgba(26,26,26,0.55)",
    borderWidth: 1,
    borderColor: "rgba(64,64,64,0.5)",
  },
  railButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomControls: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxl,
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sideButtonWrap: {
    borderRadius: radius.pill,
  },
  sideButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(26,26,26,0.55)",
    borderWidth: 1,
    borderColor: "rgba(64,64,64,0.5)",
  },
});
