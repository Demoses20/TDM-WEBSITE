import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

let tokenListenerRegistered = false;

async function saveNativeToken(token, client) {
  if (!token || !client) return;

  const { data, error } = await client.auth.getSession();

  if (error) throw error;
  if (!data.session) return;

  const platform = Capacitor.getPlatform();

  const { error: saveError } = await client.functions.invoke(
    'register-native-push-token',
    {
      body: {
        token,
        platform
      }
    }
  );

  if (saveError) throw saveError;
}

async function registerAfterLogin(client) {
  if (!Capacitor.isNativePlatform()) {
    return { skipped: true };
  }

  try {
    let permission = await FirebaseMessaging.checkPermissions();

    if (permission.receive === 'prompt') {
      permission = await FirebaseMessaging.requestPermissions();
    }

    if (permission.receive !== 'granted') {
      return { permission: permission.receive };
    }

    const result = await FirebaseMessaging.getToken();

    await saveNativeToken(result.token, client);

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

    return { registered: true };
  } catch (error) {
    console.warn('TDM native push registration failed:', error);
    return { registered: false, error: error.message };
  }
}

export { registerAfterLogin };
