import type { CapacitorConfig } from "@capacitor/cli";

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
  appId: "com.farelune.app",
  appName: "Farelune",
  webDir: "capacitor-www",
  server: {
    // The production site is the app's content. HTTPS only.
    url: "https://farelune.com",
    cleartext: false,
    // Show the branded capacitor-www/index.html when the site can't load.
    errorPath: "index.html",
  },
  // The site detects this token (src/lib/app-shell.ts) and switches to its app
  // layout: bottom tab bar, compact cookie prompt, pull-to-refresh.
  appendUserAgent: "FareluneApp/1.0",
  // The site's canvas colour, so nothing flashes between splash and first paint.
  backgroundColor: "#fdfbf7",
  android: {
    // The site's CSS (Tailwind v4) needs Chrome 111+; older WebViews render it
    // unstyled. Below this Capacitor shows capacitor-www/index.html, which asks
    // the user to update Android System WebView.
    minWebViewVersion: 111,
  },
  ios: {
    // Edge-to-edge: the site declares viewport-fit=cover and pads itself with
    // env(safe-area-inset-*), the same as on Android.
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      // The site hides the splash once it has rendered; this is only the
      // upper bound if it never does (e.g. a very slow network).
      launchShowDuration: 8000,
      launchAutoHide: true,
      launchFadeOutDuration: 250,
      backgroundColor: "#fff7f1",
      showSpinner: false,
      // Android 11 and older draw the splash image full-screen; crop instead of
      // stretching it to the screen's aspect ratio.
      androidScaleType: "CENTER_CROP",
    },
    SystemBars: {
      // Dark status/navigation icons: the site is light-only.
      style: "LIGHT",
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
