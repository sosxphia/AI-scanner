export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
export const TOKEN_KEY = "auth_token";

let authToken: string | null = null;

export const setAuthToken = (t: string | null) => {
  authToken = t;
};

export const getAuthToken = () => authToken;
