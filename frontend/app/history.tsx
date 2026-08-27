import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenHeader from "@/src/components/ScreenHeader";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { BACKEND_URL } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

type Scan = {
  id: string;
  verdict: "ai" | "real";
  confidence: number;
  summary: string;
  image_path: string | null;
  created_at: string;
};

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, login, loading: authLoading } = useAuth();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchScans = useCallback(async () => {
    if (!token) return;
    try {
      setError("");
      const res = await fetch(`${BACKEND_URL}/api/scans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not fetch history");
      setScans(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch history");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchScans();
    else setLoading(false);
  }, [token, fetchScans]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  const renderItem = ({ item }: { item: Scan }) => {
    const isAi = item.verdict === "ai";
    return (
      <View style={styles.row} testID={`history-row-${item.id}`}>
        {item.image_path && token ? (
          <Image
            source={{
              uri: `${BACKEND_URL}/api/files/${item.image_path}`,
              headers: { Authorization: `Bearer ${token}` },
            }}
            style={styles.thumb}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="image-outline" size={20} color={colors.onSurfaceSecondary} />
          </View>
        )}
        <View style={styles.rowBody}>
          <Text style={styles.timestamp}>{formatDate(item.created_at)}</Text>
          <View style={styles.verdictRow}>
            <View
              style={[
                styles.verdictTag,
                { backgroundColor: isAi ? colors.brandTertiary : "rgba(0,212,106,0.12)" },
              ]}
            >
              <Text
                style={[styles.verdictTagText, { color: isAi ? colors.onBrandTertiary : colors.success }]}
              >
                {isAi ? "AI" : "REAL"}
              </Text>
            </View>
            <Text style={styles.confidenceText}>{item.confidence}%</Text>
          </View>
          <Text style={styles.summary} numberOfLines={1}>
            {item.summary}
          </Text>
        </View>
      </View>
    );
  };

  if (!authLoading && !user) {
    return (
      <View style={styles.container} testID="history-screen">
        <ScreenHeader title="SCAN LOG" />
        <View style={styles.gateWrap}>
          <Ionicons name="lock-closed-outline" size={44} color={colors.brand} />
          <Text style={styles.gateTitle}>SIGN IN REQUIRED</Text>
          <Text style={styles.gateBody}>
            Sign in with Google to save scans and view your history across devices.
          </Text>
          <Pressable testID="history-google-signin-button" style={styles.googleBtn} onPress={login}>
            <Ionicons name="logo-google" size={18} color="#0D0D0D" />
            <Text style={styles.googleBtnText}>Sign in with Google</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="history-screen">
      <ScreenHeader title="SCAN LOG" />
      {loading || authLoading ? (
        <View style={styles.gateWrap}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error ? (
        <View style={styles.gateWrap}>
          <Text style={styles.gateBody} testID="history-error-message">{error}</Text>
          <Pressable testID="history-retry-button" style={styles.googleBtn} onPress={fetchScans}>
            <Text style={styles.googleBtnText}>RETRY</Text>
          </Pressable>
        </View>
      ) : scans.length === 0 ? (
        <View style={styles.gateWrap} testID="history-empty-state">
          <Text style={styles.emptyText}>LOG EMPTY_</Text>
          <Text style={styles.gateBody}>Captured and uploaded scans will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={scans}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          testID="history-list"
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchScans();
              }}
              tintColor={colors.brand}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  gateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
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
  emptyText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 18,
    letterSpacing: 3,
    color: colors.onSurface,
  },
  row: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    gap: spacing.md,
    alignItems: "center",
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  timestamp: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    letterSpacing: 0.5,
  },
  verdictRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  verdictTag: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  verdictTagText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  confidenceText: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: colors.onSurface,
  },
  summary: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.onSurfaceTertiary,
  },
});
