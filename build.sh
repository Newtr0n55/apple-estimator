#!/usr/bin/env bash
# Builds dist/UsedAppleEstimator.apk without Gradle: aapt2 -> javac -> d8 -> zipalign -> apksigner.
# Needs: JDK 17+, Android build-tools 35, android-35 platform. Point to them with:
#   JAVA_HOME=...  BUILD_TOOLS=.../build-tools/35.0.0  ANDROID_JAR=.../platforms/android-35/android.jar
# The page comes from page/used-apple-estimator.html (override with SOURCE_HTML=...).
set -euo pipefail
cd "$(dirname "$0")"

: "${JAVA_HOME:?set JAVA_HOME}" "${BUILD_TOOLS:?set BUILD_TOOLS}" "${ANDROID_JAR:?set ANDROID_JAR}"
J="$JAVA_HOME/bin"
EXE=""; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) EXE=".exe";; esac
BAT=""; [ -n "$EXE" ] && BAT=".bat"

# version numbers live only in src/AndroidManifest.xml
VCODE=$(sed -n 's/.*android:versionCode="\([0-9]*\)".*/\1/p' src/AndroidManifest.xml)
VNAME=$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' src/AndroidManifest.xml)

node tools/make-www.js "${SOURCE_HTML:-page/used-apple-estimator.html}"
node tools/make-web.js   # web version + download page in docs/, served by GitHub Pages

B=build; rm -rf "$B"; mkdir -p "$B/res" "$B/gen" "$B/classes" "$B/assets" dist
cp -r www "$B/assets/www"

echo "== resources"
"$BUILD_TOOLS/aapt2$EXE" compile --dir src/res -o "$B/res.zip"
"$BUILD_TOOLS/aapt2$EXE" link -o "$B/unsigned.apk" -I "$ANDROID_JAR" \
  --manifest src/AndroidManifest.xml --java "$B/gen" "$B/res.zip" \
  --min-sdk-version 26 --target-sdk-version 34 --version-code "$VCODE" --version-name "$VNAME"

echo "== java"
"$J/javac" -source 8 -target 8 -Xlint:-options -encoding UTF-8 -bootclasspath "$ANDROID_JAR" -classpath "$BUILD_TOOLS/core-lambda-stubs.jar" -d "$B/classes" \
  $(find src/java "$B/gen" -name '*.java')

echo "== dex"
"$BUILD_TOOLS/d8$BAT" --release --min-api 26 --lib "$ANDROID_JAR" --output "$B" $(find "$B/classes" -name '*.class')
# assets are added with jar, not aapt2 -A, which writes backslash paths on Windows
(cd "$B" && "$J/jar" -u -M -f unsigned.apk classes.dex assets)

echo "== align and sign"
"$BUILD_TOOLS/zipalign$EXE" -f -p 4 "$B/unsigned.apk" "$B/aligned.apk"
KS="${KEYSTORE:-release.keystore}"
if [ ! -f "$KS" ]; then
  "$J/keytool" -genkeypair -keystore "$KS" -storepass estimator -keypass estimator -alias estimator \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Used Apple Estimator" >/dev/null 2>&1
fi
"$BUILD_TOOLS/apksigner$BAT" sign --ks "$KS" --ks-pass pass:estimator --key-pass pass:estimator \
  --ks-key-alias estimator --out dist/UsedAppleEstimator.apk "$B/aligned.apk"
"$BUILD_TOOLS/apksigner$BAT" verify --print-certs dist/UsedAppleEstimator.apk | head -3
ls -la dist/UsedAppleEstimator.apk
