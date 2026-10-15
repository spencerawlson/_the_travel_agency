import type { CapacitorConfig } from '@capacitor/cli';

// Farelune native shell (Capacitor 8). The app runs in REMOTE-URL mode:
// the WebView loads the live production site (https://farelune.com), which
// is server-rendered (Next.js + next-intl middleware + live API + partner
// widgets) and cannot be statically bundled. `capacitor-www/` holds only a
// small branded fallback page synced into the native projects.
//
// What is committed: ./ios and ./android (native config + icon sets; they
// hold no secrets). webDir exists only so `npx cap sync` has a folder to copy.
//
// Building for stores:
//  - iOS (.ipa) requires Xcode on macOS — CANNOT build on Linux. Use CI: a
//    GitHub Actions `macos-latest` runner or Codemagic. Needs an Apple
//    Developer Program membership ($99/yr) for signing + App Store Connect.
//  - Android (.aab/.apk) builds anywhere with the Android SDK:
//    `cd android && ./gradlew assembleDebug` (debug) or
//    `./gradlew bundleRelease` (store). Google Play one-time $25 fee.
// Flow after any webDir/config change: `npx cap sync`.

const config: CapacitorConfig = {
  appId: 'com.farelune.app',
  appName: 'Farelune',
  webDir: 'capacitor-www',
  server: {
    // The production site is the app's content. HTTPS only.
    url: 'https://farelune.com',
    cleartext: false,
  },
  ios: {
    // Prefer the WKWebView content inset behavior the responsive layout expects.
    contentInset: 'automatic',
  },
  android: {
    // Brand coral behind the WebView so launch never flashes white or black.
    backgroundColor: '#f58a5c',
  },
};

export default config;
