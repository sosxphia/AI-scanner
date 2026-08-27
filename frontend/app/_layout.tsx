import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { useFonts } from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { initializeRevenueCat, SubscriptionProvider } from "@/src/lib/revenuecat";
import { AuthProvider } from "@/src/lib/auth";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

// RevenueCat SDK init — module scope, exactly once per launch.
try {
  initializeRevenueCat();
} catch (err) {
  console.warn("RevenueCat unavailable:", err);
}

const queryClient = new QueryClient();

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "SFPro-Bold": require("../assets/fonts/SF-Pro-Display-Bold.otf"),
    "SFPro-Heavy": require("../assets/fonts/SF-Pro-Display-Heavy.otf"),
    "SFPro-Regular": require("../assets/fonts/SF-Pro-Text-Regular.otf"),
    "SFPro-Medium": require("../assets/fonts/SF-Pro-Text-Medium.otf"),
    "SFPro-Semibold": require("../assets/fonts/SF-Pro-Text-Semibold.otf"),
  });

  const ready = (iconsLoaded || !!iconsError) && (fontsLoaded || !!fontsError);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  // If the CDN is unreachable we fall through on error rather than wedging
  // the app — icons will tofu, but the app still boots.
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <SubscriptionProvider>
            <AuthProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "#0D0D0D" },
                }}
              />
            </AuthProvider>
          </SubscriptionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
