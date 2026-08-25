import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenHeader from "@/src/components/ScreenHeader";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, loading, login, logout } = useAuth();
  const { isSubscribed } = useSubscription();

  return (
    <View style={styles.container} testID="profile-screen">
      <ScreenHeader title="PROFILE" />
      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : !user ? (
        <View style={styles.centerWrap} testID="profile-logged-out">
          <View style={styles.avatarBox}>
            <Ionicons name="person-outline" size={40} color={colors.onBrandTertiary} />
          </View>
          <Text style={styles.gateTitle}>NOT SIGNED IN</Text>
          <Text style={styles.gateBody}>
            Sign in to sync scan history across devices and manage your Pro subscription.
          </Text>
          <Pressable testID="profile-google-signin-button" style={styles.googleBtn} onPress={login}>
            <Ionicons name="logo-google" size={18} color="#0D0D0D" />
            <Text style={styles.googleBtnText}>Sign in with Google</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          testID="profile-logged-in"
        >
          <View style={styles.userHeader}>
            <View style={styles.avatarBox}>
              {user.picture ? (
                <Image source={{ uri: user.picture }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Ionicons name="person" size={40} color={colors.onBrandTertiary} />
              )}
            </View>
            <Text style={styles.userName} testID="profile-user-name">
              {user.name || "OPERATOR"}
            </Text>
            <Text style={styles.userEmail} testID="profile-user-email">
              {user.email}
            </Text>
          </View>

          <View style={styles.section}>
            <Pressable
              testID="profile-subscription-row"
              style={styles.row}
              onPress={() => router.push("/subscription")}
            >
              <Ionicons name="diamond-outline" size={20} color={colors.brand} />
              <Text style={styles.rowLabel}>SUBSCRIPTION</Text>
              <View style={[styles.statusTag, isSubscribed && styles.statusTagActive]}>
                <Text style={[styles.statusTagText, isSubscribed && { color: colors.success }]}>
                  {isSubscribed ? "PRO" : "FREE"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
            <View style={styles.rowDivider} />
            <Pressable
              testID="profile-history-row"
              style={styles.row}
              onPress={() => router.push("/history")}
            >
              <Ionicons name="time-outline" size={20} color={colors.onSurface} />
              <Text style={styles.rowLabel}>SCAN LOG</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
            <View style={styles.rowDivider} />
            <Pressable
              testID="profile-help-row"
              style={styles.row}
              onPress={() => router.push("/help")}
            >
              <Ionicons name="help-circle-outline" size={20} color={colors.onSurface} />
              <Text style={styles.rowLabel}>HELP</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <Pressable testID="profile-logout-button" style={styles.row} onPress={logout}>
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={[styles.rowLabel, { color: colors.error }]}>SIGN OUT</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  avatarBox: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  gateTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    letterSpacing: 2,
    color: colors.onSurface,
  },
  gateBody: {
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 19,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#F5F5F5",
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    minHeight: 48,
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  googleBtnText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 14,
    color: "#0D0D0D",
  },
  userHeader: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  userName: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: 1,
    color: colors.onSurface,
    marginTop: spacing.sm,
  },
  userEmail: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
  },
  section: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.monoMedium,
    fontSize: 13,
    letterSpacing: 1.5,
    color: colors.onSurface,
  },
  statusTag: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: colors.surfaceTertiary,
  },
  statusTagActive: {
    backgroundColor: "rgba(0,212,106,0.12)",
  },
  statusTagText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.onSurfaceSecondary,
  },
});
