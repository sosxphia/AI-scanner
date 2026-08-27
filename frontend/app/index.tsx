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

type MenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  testID: string;
};

const MENU_ITEMS: MenuItem[] = [
  { icon: "person-outline", label: "Profile", route: "/profile", testID: "rail-profile-button" },
  { icon: "time-outline", label: "History", route: "/history", testID: "rail-history-button" },
  { icon: "diamond-outline", label: "Pro", route: "/subscription", testID: "rail-subscription-button" },
];

export default function CameraHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [menuOpen, setMenuOpen] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const openRoute = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenuOpen(false);
    router.push(route as never);
  };

  const toggleMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenuOpen((o) => !o);
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
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flash}>
        <View style={styles.reticle} pointerEvents="none">
          <View style={styles.reticleBox}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>
      </CameraView>
    );
  };

  return (
    <View style={styles.container} testID="camera-home-screen">
      {renderCameraArea()}

      {/* Top-left dropdown menu */}
      <View style={[styles.topLeft, { top: insets.top + spacing.sm, left: Math.max(insets.left, spacing.md) }]}>
        <Pressable
          testID="menu-toggle-button"
          onPress={toggleMenu}
          style={styles.iconChipWrap}
          hitSlop={8}
        >
          <BlurView intensity={40} tint="dark" style={styles.iconChip}>
            <Ionicons name={menuOpen ? "close" : "menu"} size={24} color={colors.onSurface} />
          </BlurView>
        </Pressable>

        {menuOpen && (
          <View style={styles.dropdown} testID="menu-dropdown">
            <BlurView intensity={40} tint="dark" style={styles.dropdownInner}>
              {MENU_ITEMS.map((item, idx) => (
                <Pressable
                  key={item.route}
                  testID={item.testID}
                  onPress={() => openRoute(item.route)}
                  style={[styles.dropdownItem, idx < MENU_ITEMS.length - 1 && styles.dropdownItemBorder]}
                  hitSlop={4}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={item.route === "/subscription" ? colors.brand : colors.onSurface}
                  />
                  <Text
                    style={[
                      styles.dropdownLabel,
                      item.route === "/subscription" && { color: colors.brand },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </BlurView>
          </View>
        )}
      </View>

      {/* Top-right help button */}
      <View style={[styles.topRight, { top: insets.top + spacing.sm, right: Math.max(insets.right, spacing.md) }]}>
        <Pressable
          testID="rail-help-button"
          onPress={() => openRoute("/help")}
          style={styles.iconChipWrap}
          hitSlop={8}
        >
          <BlurView intensity={40} tint="dark" style={styles.iconChip}>
            <Ionicons name="help-circle-outline" size={24} color={colors.onSurface} />
          </BlurView>
        </Pressable>
      </View>

      {/* Bottom controls */}
      <View style={[styles.bottomControls, { bottom: insets.bottom + spacing.xl }]}>
        <Pressable
          testID="gallery-upload-button"
          onPress={pickFromGallery}
          style={styles.sideButton}
          hitSlop={12}
        >
          <Ionicons name="images-outline" size={26} color={colors.onSurface} />
        </Pressable>

        <Pressable
          testID="shutter-button"
          onPress={capture}
          disabled={!permission?.granted || capturing}
          style={({ pressed }) => [styles.shutterOuter, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          <View style={styles.shutterInner}>
            {capturing && <ActivityIndicator color="#FFFFFF" />}
          </View>
        </Pressable>

        <Pressable
          testID="flash-toggle-button"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFlash((f) => (f === "off" ? "on" : "off"));
          }}
          style={styles.sideButton}
          hitSlop={12}
        >
          <Ionicons
            name={flash === "on" ? "flash" : "flash-off"}
            size={26}
            color={flash === "on" ? colors.brand : colors.onSurface}
          />
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
    paddingHorizontal: spacing.xl,
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
  reticle: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  reticleBox: {
    width: 280,
    height: 280,
    marginBottom: 120,
  },
  corner: {
    position: "absolute",
    width: 34,
    height: 34,
    borderColor: "rgba(255,31,31,0.55)",
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 6,
  },
  topLeft: {
    position: "absolute",
    alignItems: "flex-start",
  },
  topRight: {
    position: "absolute",
    alignItems: "flex-end",
  },
  iconChipWrap: {
    borderRadius: radius.pill,
  },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(26,26,26,0.55)",
    borderWidth: 1,
    borderColor: "rgba(64,64,64,0.5)",
  },
  dropdown: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    overflow: "hidden",
    minWidth: 168,
  },
  dropdownInner: {
    backgroundColor: "rgba(26,26,26,0.75)",
    borderWidth: 1,
    borderColor: "rgba(64,64,64,0.5)",
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  dropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(64,64,64,0.4)",
  },
  dropdownLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 14,
    letterSpacing: 1,
    color: colors.onSurface,
  },
  bottomControls: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
  },
  sideButton: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterOuter: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "rgba(255,31,31,0.28)",
    borderWidth: 2,
    borderColor: "rgba(255,31,31,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FF1F1F",
    alignItems: "center",
    justifyContent: "center",
  },
});
