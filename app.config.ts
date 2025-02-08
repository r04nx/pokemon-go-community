import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'pokemon-go-community',
  slug: 'pokemon-go-community',
    owner: "atharva_01",
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'pokemongo-community',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff'
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.pokemongo.community',
    config: {
      usesNonExemptEncryption: false
    }
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#ffffff'
    },
    package: 'com.pokemongo.community'
  },
  plugins: [
    'expo-router',
    'expo-build-properties'
  ],
  extra: {
    eas: {
      projectId: "2cde2950-ecff-4fcd-a1ad-82bc6d2ce42e"
    }
  },
  web: {
    bundler: 'metro'
  },
  updates: {
    url: "https://u.expo.dev/2cde2950-ecff-4fcd-a1ad-82bc6d2ce42e"
  },
  runtimeVersion: {
    policy: "appVersion"
  }
};

export default config; 