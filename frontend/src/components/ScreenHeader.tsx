import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors, fonts, spacing } from "@/src/theme";

export default function ScreenHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable
        testID="screen-header-back-button"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (router.canGoBack()) router.back();
          else router.replace("/");
        }}
        style={styles.backBtn}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  title: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 14,
    letterSpacing: 2,
    color: colors.onSurface,
  },
});
