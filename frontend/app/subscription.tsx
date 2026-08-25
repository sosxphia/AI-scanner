import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PurchasesPackage } from "react-native-purchases";

import ScreenHeader from "@/src/components/ScreenHeader";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { useSubscription } from "@/src/lib/revenuecat";
import { useAuth } from "@/src/lib/auth";

const PERKS = [
  "Priority access to new detection models",
  "Unlimited high-resolution scans",
  "Early access to upcoming features",
  "Support continued development",
];

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const { user, login, purchaseIdentityError } = useAuth();
  const {
    offerings,
    isSubscribed,
    identityReady,
    isLoading,
    purchase,
    restore,
    isPurchasing,
    isRestoring,
  } = useSubscription();

  const packages = useMemo(
    () => offerings?.current?.availablePackages ?? [],
    [offerings]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmPkg, setConfirmPkg] = useState<PurchasesPackage | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!selectedId && packages.length > 0) {
      const annual = packages.find((p) => p.identifier === "$rc_annual");
      setSelectedId((annual ?? packages[0]).identifier);
    }
  }, [packages, selectedId]);

  const selectedPkg = packages.find((p) => p.identifier === selectedId) ?? null;
  const simulated = Platform.OS === "web" || __DEV__;

  const periodLabel = (pkg: PurchasesPackage) => {
    if (pkg.identifier === "$rc_annual" || pkg.packageType === "ANNUAL") return "PER YEAR";
    if (pkg.identifier === "$rc_monthly" || pkg.packageType === "MONTHLY") return "PER MONTH";
    return "";
  };

  const planTitle = (pkg: PurchasesPackage) => {
    if (pkg.identifier === "$rc_annual" || pkg.packageType === "ANNUAL") return "ANNUAL";
    if (pkg.identifier === "$rc_monthly" || pkg.packageType === "MONTHLY") return "MONTHLY";
    return pkg.product.title?.toUpperCase() || pkg.identifier;
  };

  const doPurchase = async (pkg: PurchasesPackage) => {
    setConfirmPkg(null);
    setMessage("");
    try {
      await purchase(pkg);
      setMessage("PURCHASE COMPLETE — PRO UNLOCKED");
    } catch (e: unknown) {
      const err = e as { userCancelled?: boolean; message?: string };
      if (err?.userCancelled) return;
      setMessage(err?.message === "identity_not_ready"
        ? "Sign in required before purchasing."
        : `Purchase failed: ${err?.message || "unknown error"}`);
    }
  };

  const doRestore = async () => {
    setMessage("");
    try {
      const info = await restore();
      const active = info.entitlements.active?.pro !== undefined;
      setMessage(active ? "PURCHASES RESTORED — PRO ACTIVE" : "No active purchases found.");
    } catch (e: unknown) {
      setMessage(`Restore failed: ${(e as Error)?.message || "unknown error"}`);
    }
  };

  return (
    <View style={styles.container} testID="subscription-screen">
      <ScreenHeader title="PRO" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl + 60 }]}>
        <View style={styles.hero}>
          <View style={styles.proBadge}>
            <Ionicons name="diamond" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>DETECT·AI PRO</Text>
          <Text style={styles.heroSub}>FULL FORENSIC POWER. NO LIMITS.</Text>
        </View>

        {PERKS.map((perk, i) => (
          <View key={i} style={styles.perkRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.perkText}>{perk}</Text>
          </View>
        ))}

        <View style={styles.plansWrap}>
          {isSubscribed ? (
            <View style={styles.activeCard} testID="subscription-active-card">
              <Ionicons name="shield-checkmark" size={32} color={colors.success} />
              <Text style={styles.activeTitle}>PRO ACTIVE</Text>
              <Text style={styles.activeBody}>
                Your subscription is active. Thank you for supporting DETECT·AI.
              </Text>
            </View>
          ) : isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.loadingText}>LOADING PLANS_</Text>
            </View>
          ) : packages.length === 0 ? (
            <View style={styles.activeCard} testID="subscription-unavailable">
              <Text style={styles.activeBody}>
                Subscription options are unavailable right now. Please try again later.
              </Text>
            </View>
          ) : (
            packages.map((pkg) => {
              const selected = pkg.identifier === selectedId;
              return (
                <Pressable
                  key={pkg.identifier}
                  testID={`plan-card-${pkg.identifier === "$rc_annual" ? "annual" : "monthly"}`}
                  onPress={() => setSelectedId(pkg.identifier)}
                  style={[styles.planCard, selected && styles.planCardSelected]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planTitle}>{planTitle(pkg)}</Text>
                    <Text style={styles.planPeriod}>{periodLabel(pkg)}</Text>
                  </View>
                  <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
                  <Ionicons
                    name={selected ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={selected ? colors.brand : colors.onSurfaceSecondary}
                  />
                </Pressable>
              );
            })
          )}
        </View>

        {simulated && !isSubscribed && packages.length > 0 && (
          <Text style={styles.simNote} testID="simulated-purchase-note">
            TEST MODE: purchases here are simulated via the RevenueCat Test Store.
          </Text>
        )}

        {purchaseIdentityError && (
          <Text style={styles.errorNote} testID="identity-error-banner">
            Purchase identity error: {purchaseIdentityError}
          </Text>
        )}
        {message !== "" && (
          <Text style={styles.messageNote} testID="subscription-message">
            {message}
          </Text>
        )}

        {!isSubscribed && (
          <Pressable
            testID="restore-purchases-button"
            style={styles.restoreBtn}
            onPress={doRestore}
            disabled={isRestoring}
          >
            <Text style={styles.restoreText}>
              {isRestoring ? "RESTORING..." : "RESTORE PURCHASES"}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Sticky CTA */}
      {!isSubscribed && packages.length > 0 && (
        <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + spacing.lg }]}>
          {!user ? (
            <Pressable testID="subscription-signin-button" style={styles.ctaBtn} onPress={login}>
              <Ionicons name="logo-google" size={18} color="#FFFFFF" />
              <Text style={styles.ctaText}>SIGN IN TO SUBSCRIBE</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="upgrade-to-pro-button"
              style={[styles.ctaBtn, (!identityReady || isPurchasing || !selectedPkg) && styles.ctaBtnDisabled]}
              disabled={!identityReady || isPurchasing || !selectedPkg}
              onPress={() => selectedPkg && setConfirmPkg(selectedPkg)}
            >
              {isPurchasing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.ctaText}>UPGRADE TO PRO</Text>
              )}
            </Pressable>
          )}
        </View>
      )}

      {/* Purchase confirmation modal */}
      <Modal visible={!!confirmPkg} transparent animationType="fade" onRequestClose={() => setConfirmPkg(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="purchase-confirm-modal">
            <Text style={styles.modalTitle}>CONFIRM PURCHASE</Text>
            <Text style={styles.modalBody}>
              {confirmPkg ? `${planTitle(confirmPkg)} plan — ${confirmPkg.product.priceString} ${periodLabel(confirmPkg).toLowerCase()}` : ""}
            </Text>
            {simulated && (
              <Text style={styles.modalSim}>Simulated Test Store purchase (no real charge).</Text>
            )}
            <View style={styles.modalActions}>
              <Pressable
                testID="purchase-cancel-button"
                style={styles.modalCancel}
                onPress={() => setConfirmPkg(null)}
              >
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                testID="purchase-confirm-button"
                style={styles.modalConfirm}
                onPress={() => confirmPkg && doPurchase(confirmPkg)}
              >
                <Text style={styles.modalConfirmText}>CONFIRM</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingTop: spacing.xl,
  },
  hero: {
    alignItems: "center",
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  proBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontFamily: fonts.displayHeavy,
    fontSize: 28,
    letterSpacing: 2,
    color: colors.onSurface,
    marginTop: spacing.sm,
  },
  heroSub: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.onSurfaceSecondary,
  },
  perkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  perkText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.onSurfaceTertiary,
    flex: 1,
  },
  plansWrap: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    minHeight: 76,
  },
  planCardSelected: {
    borderColor: colors.brand,
  },
  planTitle: {
    fontFamily: fonts.display,
    fontSize: 17,
    letterSpacing: 1,
    color: colors.onSurface,
  },
  planPeriod: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.onSurfaceSecondary,
    marginTop: 2,
  },
  planPrice: {
    fontFamily: fonts.displayHeavy,
    fontSize: 20,
    color: colors.onSurface,
  },
  loadingWrap: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.onSurfaceSecondary,
  },
  activeCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(0,212,106,0.3)",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  activeTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    letterSpacing: 2,
    color: colors.success,
  },
  activeBody: {
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
  },
  simNote: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.warning,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  errorNote: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.error,
    textAlign: "center",
    marginTop: spacing.md,
  },
  messageNote: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: colors.onSurface,
    textAlign: "center",
    marginTop: spacing.md,
  },
  restoreBtn: {
    alignSelf: "center",
    marginTop: spacing.xl,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  restoreText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.onSurfaceSecondary,
    textDecorationLine: "underline",
  },
  ctaWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  ctaBtn: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 14,
    letterSpacing: 2,
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 2,
    color: colors.onSurface,
  },
  modalBody: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.onSurfaceTertiary,
  },
  modalSim: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.warning,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  modalCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    color: colors.onSurface,
  },
  modalConfirm: {
    flex: 1,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    color: "#FFFFFF",
  },
});
