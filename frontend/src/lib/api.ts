import { storage } from "@/src/utils/storage";

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
export const TOKEN_KEY = "auth_token";
const DEVICE_KEY = "device_id";

let authToken: string | null = null;
let deviceId: string | null = null;

export const setAuthToken = (t: string | null) => {
  authToken = t;
};

export const getAuthToken = () => authToken;

const genUuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

// Stable per-install identifier used only for anonymous scan rate limiting.
export const getDeviceId = async (): Promise<string> => {
  if (deviceId) return deviceId;
  const stored = await storage.getItem<string | null>(DEVICE_KEY, null);
  if (stored && typeof stored === "string") {
    deviceId = stored;
    return stored;
  }
  const id = genUuid();
  await storage.setItem(DEVICE_KEY, id);
  deviceId = id;
  return id;
};
