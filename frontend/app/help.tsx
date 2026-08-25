import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenHeader from "@/src/components/ScreenHeader";
import { colors, fonts, spacing } from "@/src/theme";

const FAQ: { q: string; a: string }[] = [
  {
    q: "HOW DOES IT WORK?",
    a: "Capture a photo with the camera or upload one from your gallery. A forensic vision model (Claude Sonnet 4.6) inspects lighting physics, textures, anatomy, noise patterns and compositional statistics, then returns a verdict — REAL or AI GENERATED — with a confidence percentage.",
  },
  {
    q: "HOW ACCURATE IS THE VERDICT?",
    a: "The confidence percentage reflects the model's certainty in its own analysis. State-of-the-art AI generators evolve constantly, so no detector is perfect. Treat results as a strong signal, not absolute proof.",
  },
  {
    q: "WHAT IMAGES WORK BEST?",
    a: "Clear, uncompressed images give the best signal. Heavy compression, screenshots of screenshots, or very small images can reduce accuracy.",
  },
  {
    q: "WHERE ARE MY SCANS SAVED?",
    a: "Sign in with Google and every scan is saved to your Scan Log with the image, verdict and confidence — synced across your devices. Without signing in, scans are analyzed but not stored.",
  },
  {
    q: "WHAT DOES PRO INCLUDE?",
    a: "Pro is a monthly or annual subscription supporting continued development, with priority access to new detection models and features as they ship. Manage it from the Subscription tab.",
  },
  {
    q: "IS MY DATA PRIVATE?",
    a: "Images are sent securely to our backend for analysis. Saved scans are visible only to your account. Anonymous scans are never stored.",
  },
];

export default function HelpScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container} testID="help-screen">
      <ScreenHeader title="HELP" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.intro}>
          DETECT·AI examines photos for signs of AI generation and reports a confidence score.
        </Text>
        {FAQ.map((item, i) => (
          <View key={i} style={styles.block} testID={`help-faq-${i}`}>
            <Text style={styles.question}>{item.q}</Text>
            <Text style={styles.answer}>{item.a}</Text>
            {i < FAQ.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  intro: {
    fontFamily: fonts.monoMedium,
    fontSize: 13,
    lineHeight: 20,
    color: colors.onSurfaceTertiary,
    marginBottom: spacing.xl,
  },
  block: {
    marginBottom: spacing.md,
  },
  question: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    color: colors.brand,
    marginBottom: spacing.sm,
  },
  answer: {
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 20,
    color: colors.onSurfaceSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginTop: spacing.lg,
  },
});
