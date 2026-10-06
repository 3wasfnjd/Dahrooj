# دحروج كتطبيق Meta Quest

نسخة النظارة من دحروج (VR وAR) تُغلَّف كتطبيق Android للنظارة بأداة Meta الرسمية **Bubblewrap لـ Meta Quest** (`@meta-quest/bubblewrap-cli`، ترخيص Apache-2.0). التطبيق يفتح الموقع المنشور في وضع **immersive**، فيدخل الواقع الافتراضي مباشرة من رابط `/Dahrooj/?xr=app` (إذا طلبت النظارة ضغطة، تظهر أزرار VR وAR).

- اسم الحزمة: `com.abodengames.dahrooj`
- الإعدادات كلها في `twa-manifest.json` (أُنشئ بمكتبة `@meta-quest/bubblewrap-core` 1.24.1 نفسها من `vr/manifest.webmanifest`).
- الأيقونة: `assets/icons/icon-512.png` و`maskable-512.png`.

## ١. على جهازك (مرة وحدة)

- Node.js 18 أو أحدث.
- `npm install --global @meta-quest/bubblewrap-cli`
- أول تشغيل لـ `bubblewrap` يعرض تنزيل JDK 17 وAndroid SDK تلقائيًا؛ وافق عليه.

## ٢. مفتاح التوقيع (احفظه، لا ترفعه)

```sh
cd quest
keytool -genkeypair -v -keystore dahrooj-upload.keystore -alias dahrooj -keyalg RSA -keysize 2048 -validity 10000
```

احتفظ بالملف وكلمة سره في مكان آمن. كل تحديث للتطبيق لازم يتوقّع بنفس المفتاح، وفقدانه يعني ما تقدر تحدّث التطبيق في المتجر. الملف مستثنى من git في `quest/.gitignore`.

## ٣. بناء الـ APK

```sh
cd quest
bubblewrap build
```

يطلب كلمة سر المفتاح، ويطلع `app-release-signed.apk`.

## ٤. ربط الموقع بالتطبيق (Digital Asset Links)

عشان يفتح التطبيق بدون شريط متصفح، لازم الموقع يعلن إن التطبيق تابع له:

```sh
bubblewrap fingerprint generateAssetLinks
```

يطلع ملف `assetlinks.json`. ينحط على **جذر النطاق**: `https://3wasfnjd.github.io/.well-known/assetlinks.json`. بما إن دحروج على GitHub Pages تحت `/Dahrooj/`، يحتاج مستودع اسمه `3wasfnjd.github.io` فيه المجلد `.well-known/` والملف، أو نطاق خاص لدحروج.

## ٥. التثبيت على كويست والتجربة

1. فعّل وضع المطوّر للنظارة من تطبيق Meta Horizon على الجوال (يحتاج حساب مطوّر في developers.meta.com).
2. وصّل النظارة بالكمبيوتر بكيبل USB ووافق على الطلب داخل النظارة.
3. `adb install -r app-release-signed.apk` (أداة adb تجي مع Android SDK اللي نزّله Bubblewrap، أو مع Meta Quest Developer Hub).
4. افتح دحروج من **Library ← Unknown Sources** داخل النظارة.

## ٦. الرفع للمتجر

1. أنشئ التطبيق في لوحة المطوّر (developers.meta.com ← My Apps)، نوعه Meta Horizon Store، المنصة Quest.
2. ارفع الـ APK على قناة ALPHA من لوحة المطوّر، أو بأداة Meta:
   `ovr-platform-util upload-quest-build --app-id <ID> --app-secret <SECRET> --apk app-release-signed.apk --channel ALPHA`
3. عبّ صفحة المتجر من `store-listing.md`، ورابط سياسة الخصوصية: `https://3wasfnjd.github.io/Dahrooj/privacy.html`.
4. حدّد السعر، وجاوب استبيان التصنيف العمري (IARC)، وأرسل للمراجعة.

## كل تحديث جديد

ارفع `appVersionCode` (رقم صحيح يزيد) و`appVersionName` في `twa-manifest.json`، ثم `bubblewrap update` و`bubblewrap build`. بما إن التطبيق يفتح الموقع المنشور، تعديلات اللعب تصل للتطبيق بمجرد نشرها على الموقع بدون APK جديد.
