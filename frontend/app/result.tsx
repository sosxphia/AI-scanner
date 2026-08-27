import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Image as RNImage,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  FadeInDown,
} from "react-native-reanimated";

import { colors, fonts, radius, spacing } from "@/src/theme";
import { BACKEND_URL, getAuthToken, getDeviceId } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

type ScanResult = {
  id: string;
  verdict: "ai" | "real";
  confidence: number;
  summary: string;
  indicators: string[];
  saved: boolean;
};

export default function ResultScreen() {
  const { uri, mime } = useLocalSearchParams<{ uri: string; mime?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { user } = useAuth();

  const [status, setStatus] = useState<"analyzing" | "done" | "error">("analyzing");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<View>(null);

  const laser = useSharedValue(0);

  useEffect(() => {
    laser.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const laserStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: laser.value * (height - 120) }],
  }));

  const analyze = useCallback(async () => {
    if (!uri) {
      setErrorMsg("No image provided");
      setStatus("error");
      return;
    }
    setStatus("analyzing");
    try {
      const type = mime || "image/jpeg";
      const name = `scan.${type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg"}`;
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        form.append("file", blob, name);
      } else {
        form.append("file", { uri, name, type } as unknown as Blob);
      }
      const headers: Record<string, string> = {};
      const token = getAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      headers["X-Device-Id"] = await getDeviceId();

      const res = await fetch(`${BACKEND_URL}/api/scan`, {
        method: "POST",
        headers,
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Analysis failed (${res.status})`);
      }
      const data: ScanResult = await res.json();
      setResult(data);
      setStatus("done");
      if (data.verdict === "real") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Analysis failed");
      setStatus("error");
    }
  }, [uri, mime]);

  useEffect(() => {
    analyze();
  }, [analyze]);

  const isAi = result?.verdict === "ai";
  const verdictColor = isAi ? colors.brand : colors.success;

  const shareResult = async () => {
    if (!result || sharing) return;
    setSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const captureUri = await captureRef(shareCardRef, { format: "png", quality: 1 });
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(captureUri, {
          mimeType: "image/png",
          dialogTitle: "Share scan result",
        });
      }
    } catch (e) {
      console.warn("Share failed:", e);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.container} testID="scan-result-screen">
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      <LinearGradient
        colors={["rgba(13,13,13,0.55)", "rgba(13,13,13,0.15)", "rgba(13,13,13,0.92)"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Back button */}
      <Pressable
        testID="result-back-button"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        style={[styles.backBtn, { top: insets.top + spacing.sm }]}
      >
        <BlurView intensity={40} tint="dark" style={styles.backBtnInner}>
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </BlurView>
      </Pressable>

      {status === "analyzing" && (
        <>
          <Animated.View style={[styles.laser, laserStyle]} />
          <View style={[styles.analyzingWrap, { bottom: insets.bottom + spacing.xxxl }]}>
            <Text style={styles.analyzingText} testID="analyzing-label">
              SCANNING...
            </Text>
            <Text style={styles.analyzingSub}>Please Wait</Text>
          </View>
        </>
      )}

      {status === "error" && (
        <View style={[styles.centerWrap, { paddingBottom: insets.bottom + spacing.xl }]}>
          <Ionicons name="warning-outline" size={44} color={colors.error} />
          <Text style={styles.errorTitle}>SCAN FAILED</Text>
          <Text style={styles.errorBody} testID="scan-error-message">
            {errorMsg}
          </Text>
          <Pressable testID="retry-scan-button" style={styles.primaryBtn} onPress={analyze}>
            <Text style={styles.primaryBtnText}>RETRY</Text>
          </Pressable>
          <Pressable
            testID="error-back-to-scanner-button"
            style={styles.ghostBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          >
            <Text style={styles.ghostBtnText}>BACK TO SCANNER</Text>
          </Pressable>
        </View>
      )}

      {status === "done" && result && (
        <View style={[styles.resultWrap, { paddingBottom: insets.bottom + spacing.xl }]}>
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text style={[styles.verdictLabel, { color: verdictColor }]} testID="verdict-label">
              {isAi ? "AI GENERATED" : "REAL PHOTO"}
            </Text>
            <Text style={[styles.confidence, { color: verdictColor }]} testID="confidence-value">
              {result.confidence}%
            </Text>
            <Text style={styles.confidenceCaption}>CONFIDENCE</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150).duration(400)}>
            <BlurView intensity={50} tint="dark" style={styles.factorsCard}>
              <Text style={styles.summaryText} testID="scan-summary">
                {result.summary}
              </Text>
              <View style={styles.dividerLine} />
              {result.indicators.map((ind, i) => (
                <View key={i} style={styles.factorRow}>
                  <Text style={[styles.factorBullet, { color: verdictColor }]}>▸</Text>
                  <Text style={styles.factorText}>{ind}</Text>
                </View>
              ))}
              <View style={styles.dividerLine} />
              <Text style={styles.modelLine}>MODEL: CLAUDE SONNET 4.6</Text>
              {!user && (
                <Text style={styles.saveHint} testID="sign-in-save-hint">
                  SIGN IN TO SAVE SCANS TO HISTORY
                </Text>
              )}
            </BlurView>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.actionsRow}>
            <Pressable
              testID="scan-again-button"
              style={styles.primaryBtn}
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            >
              <Text style={styles.primaryBtnText}>SCAN AGAIN</Text>
            </Pressable>
            <Pressable
              testID="share-result-button"
              style={styles.ghostBtn}
              onPress={shareResult}
              disabled={sharing}
            >
              <Ionicons name="share-social-outline" size={16} color={colors.onSurface} />
              <Text style={styles.ghostBtnText}>{sharing ? "PREPARING..." : "SHARE RESULT"}</Text>
            </Pressable>
            {result.saved && (
              <Pressable
                testID="view-history-button"
                style={styles.ghostBtn}
                onPress={() => router.push("/history")}
              >
                <Text style={styles.ghostBtnText}>VIEW HISTORY</Text>
              </Pressable>
            )}
          </Animated.View>
        </View>
      )}

      {/* Off-screen shareable card */}
      {status === "done" && result && (
        <View style={styles.shareCardHost} pointerEvents="none">
          <View ref={shareCardRef} collapsable={false} style={styles.shareCard}>
            {uri ? (
              <RNImage source={{ uri }} style={styles.shareImage} resizeMode="cover" />
            ) : null}
            <LinearGradient
              colors={["rgba(13,13,13,0)", "rgba(13,13,13,0.55)", "rgba(13,13,13,0.96)"]}
              style={styles.shareGradient}
            />
            <View style={styles.shareContent}>
              <Text style={[styles.shareVerdict, { color: verdictColor }]}>
                {isAi ? "AI GENERATED" : "REAL PHOTO"}
              </Text>
              <Text style={[styles.shareConfidence, { color: verdictColor }]}>
                {result.confidence}%
              </Text>
              <Text style={styles.shareCaption}>CONFIDENCE</Text>
              <View style={styles.shareFooter}>
                <Ionicons name="scan-outline" size={16} color={colors.brand} />
                <Text style={styles.shareBrand}>DETECT·AI SCANNER</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  backBtn: {
    position: "absolute",
    left: spacing.lg,
    zIndex: 10,
  },
  backBtnInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(26,26,26,0.55)",
  },
  laser: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 60,
    height: 2,
    backgroundColor: colors.brand,
    shadowColor: colors.brand,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 8,
  },
  analyzingWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  analyzingText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 20,
    letterSpacing: 4,
    color: colors.onSurface,
  },
  analyzingSub: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.sm,
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  errorTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: 2,
    color: colors.onSurface,
  },
  errorBody: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
  },
  resultWrap: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  verdictLabel: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: 3,
  },
  confidence: {
    fontFamily: fonts.displayHeavy,
    fontSize: 76,
    lineHeight: 82,
    letterSpacing: -1,
  },
  confidenceCaption: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 3,
    color: colors.onSurfaceSecondary,
  },
  factorsCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
    padding: spacing.lg,
    backgroundColor: "rgba(26,26,26,0.6)",
    borderWidth: 1,
    borderColor: "rgba(64,64,64,0.5)",
  },
  summaryText: {
    fontFamily: fonts.monoMedium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.onSurface,
  },
  dividerLine: {
    height: 1,
    backgroundColor: "rgba(64,64,64,0.5)",
    marginVertical: spacing.md,
  },
  factorRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  factorBullet: {
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  factorText: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 17,
    color: colors.onSurfaceTertiary,
  },
  modelLine: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.onSurfaceSecondary,
  },
  saveHint: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  actionsRow: {
    gap: spacing.sm,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 14,
    letterSpacing: 2,
    color: "#FFFFFF",
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    minHeight: 48,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 13,
    letterSpacing: 2,
    color: colors.onSurface,
  },
  shareCardHost: {
    position: "absolute",
    left: -10000,
    top: 0,
  },
  shareCard: {
    width: 360,
    height: 480,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  shareImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  shareGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  shareContent: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.xl,
  },
  shareVerdict: {
    fontFamily: fonts.display,
    fontSize: 24,
    letterSpacing: 3,
  },
  shareConfidence: {
    fontFamily: fonts.displayHeavy,
    fontSize: 72,
    lineHeight: 78,
    letterSpacing: -1,
  },
  shareCaption: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 3,
    color: colors.onSurfaceSecondary,
  },
  shareFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  shareBrand: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 12,
    letterSpacing: 3,
    color: colors.onSurface,
  },
});
