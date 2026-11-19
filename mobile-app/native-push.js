import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

let tokenListenerRegistered = false;

async function saveNativeToken(token, client) {
  if (!token || !client) return false;

  const { data, error } = await client.auth.getSession();

  if (error) throw error;
  if (!data.session) return false;

  const platform = Capacitor.getPlatform();

  const { error: saveError } = await client.functions.invoke(
    'register-native-push-token',
    {
      body: { token, platform }
    }
  );

  if (saveError) throw saveError;

  return true;
}

async function registerAfterLogin(client) {
  if (!Capacitor.isNativePlatform()) {
    return { skipped: true };
  }

  try {
    const permission = await FirebaseMessaging.checkPermissions();

    // Never request permission automatically during login.
    if (permission.receive !== 'granted') {
      return { permission: permission.receive };
    }

    const result = await FirebaseMessaging.getToken();
    const registered = await saveNativeToken(result.token, client);

    if (!tokenListenerRegistered) {
      tokenListenerRegistered = true;

      await FirebaseMessaging.addListener(
        'tokenReceived',
        async event => {
          try {
            await saveNativeToken(event.token, client);
          } catch (error) {
            console.warn('TDM native token refresh failed:', error);
          }
        }
      );
    }

    return { registered };
  } catch (error) {
    console.warn('TDM native push registration failed:', error);
    return { registered: false, error: error.message };
  }
}

async function enableFromPopup() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('This is not a native TDM app.');
  }

  try {
    let permission = await FirebaseMessaging.checkPermissions();

    if (permission.receive !== 'granted') {
      permission = await FirebaseMessaging.requestPermissions();
    }

    if (permission.receive !== 'granted') {
      return { permission: permission.receive };
    }

    const result = await FirebaseMessaging.getToken();

    // Save immediately if the customer is already signed in.
    const client = window.tdmGetSupabaseClient();
    const registered = await saveNativeToken(result.token, client);

    return {
      permission: 'granted',
      registered,
      pendingLogin: !registered
    };
  } catch (error) {
    console.warn('TDM notification permission failed:', error);
    throw error;
  }
}

window.TDMNativePush = {
  isNative: Capacitor.isNativePlatform(),
  enableFromPopup,
  registerAfterLogin
};
