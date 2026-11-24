# Egypt Legal News Aggregator — مجمّع الأخبار القانونية المصرية

لوحة تحكم مستقلة وقابلة للنشر (Deployable) لمؤسسة **عمرو منصور للمحاماة والاستشارات القانونية**:
تجمع أحدث أخبار مصر والتريندات من خلاصات RSS، وترتّبها حسب **الأهمية القانونية**، وتولّد منها
**بوستات فيسبوك** و**سكربتات فيديو** قصيرة بصوت المؤسسة — كل المسودات للمراجعة فقط، ولا يُنشر أي شيء تلقائياً.

This is a standalone clone of the hosted "Egypt Legal News Aggregator" dashboard — same features,
no dependency on Muse hosting, no Firebase/Firestore. Just Next.js + SQLite + the Anthropic API.

---

## المميزات | Features

- **نشرة أخبار حية (News stream):** جلب من جهة الخادم (server-side) من خلاصات RSS:
  اليوم السابع (Youm7)، المصري اليوم (Al-Masry Al-Youm)، Egypt Independent،
  بالإضافة إلى Google Trends مصر لإشارات الترند. إزالة التكرار (dedupe) حسب الرابط/العنوان،
  وتخزين الأخبار في SQLite وعرضها منها.
- **تقييم قانوني (Legal scoring):** كل خبر جديد يُقيَّم في نداء Claude واحد مجمّع لكل دفعة تحديث:
  درجة أهمية قانونية `legal_score` من 0–100، تصنيف من خمس فئات
  (قضية رأي عام، حكم محكمة، قانون جديد، قرار رسمي، تريند)، `is_legal`،
  و«زاوية قانونية» من جملة واحدة، و`is_trending` عند مطابقة Google Trends.
  التعليمات صارمة: الاعتماد على العنوان والوصف فقط — ممنوع اختراع قوانين أو أرقام مواد أو أحكام.
  وعند غياب مفتاح API يعمل **تقييم احتياطي بالكلمات المفتاحية** تلقائياً.
- **واجهة النشرة:** فرز حسب درجة الأهمية، رقائق فلاتر للفئات الخمس، مفتاح تصفية «قانوني» فقط،
  وقسم «التريندات» منفصل ومميز بصرياً، وبطاقة كل خبر تعرض المصدر ورابطه والوقت والتصنيف والدرجة والزاوية القانونية.
- **تحديث الآن (Refresh now):** زر يجلب ويقيّم فوراً، مع عرض وقت آخر تحديث،
  وتحديث تلقائي عند فتح الصفحة إذا كانت البيانات أقدم من 30 دقيقة.
- **توليد المسودات:** على كل خبر زرارا «بوست فيسبوك» و«سكربت فيديو» (60–90 ثانية، خطّاف في أول 3 ثوانٍ)
  عبر Claude وبنفس التعليمات الصارمة (لا اختراع لمواد قانونية، توقيع المؤسسة في النهاية).
- **إدارة المسودات (Drafts):** حفظ في SQLite، تعديل وحفظ، نسخ بضغطة، حذف، وتعليم «مستخدم»،
  مع عدّاد مسودات ظاهر. **لا يوجد أي نشر تلقائي في أي مكان.**
- **بوابة كلمة مرور اختيارية:** عند ضبط `DASHBOARD_PASSWORD` تُحمى كل الصفحات والـ API
  بتسجيل دخول (كوكي جلسة موقّعة HMAC). بدونها اللوحة مفتوحة كما في الأصل.

## المعمارية | Architecture

| الطبقة | التقنية |
|---|---|
| الإطار | Next.js 16 + TypeScript + Tailwind CSS 4 — واجهة عربية RTL |
| قاعدة البيانات | SQLite مدمجة في Node عبر `node:sqlite` — طبقة بيانات واحدة `src/lib/db.ts` (بدون Prisma) |
| الأخبار | `src/lib/feeds.ts` — جلب RSS بمحلّل XML يدوي خفيف + تطبيع وإزالة تكرار |
| التقييم | `src/lib/scoring.ts` — Claude batch scoring + keyword fallback |
| التوليد | `src/lib/generate.ts` — Claude مع تعليمات نظام صارمة حرفية |
| الذكاء الاصطناعي | Anthropic Claude API عبر `fetch` مباشر (`src/lib/claude.ts`) — بدون SDK |

```
src/
  app/
    page.tsx                 # الصفحة الرئيسية (Server Component)
    login/page.tsx           # صفحة الدخول (عند تفعيل كلمة المرور)
    api/
      stories/route.ts       # GET قائمة الأخبار
      refresh/route.ts       # POST تحديث (جلب + تقييم)
      generate/route.ts      # POST توليد مسودة لخبر
      drafts/route.ts        # GET المسودات
      drafts/[id]/route.ts   # PATCH تعديل/حالة — DELETE حذف
      auth/login|logout      # جلسة بوابة كلمة المرور
  components/Dashboard.tsx   # واجهة اللوحة (Client Component)
  lib/ db.ts · feeds.ts · scoring.ts · refresh.ts · generate.ts · claude.ts · auth.ts
```

## متغيرات البيئة | Environment variables

انسخ `.env.example` إلى `.env.local` واملأ القيم:

| المتغير | مطلوب؟ | الوصف |
|---|---|---|
| `ANTHROPIC_API_KEY` | مطلوب للتوليد | مفتاح Anthropic Claude API. بدونه: التقييم يعمل بالكلمات المفتاحية، ونهايات التوليد (endpoints) تعيد رسالة خطأ عربية واضحة بأن المفتاح مفقود. |
| `SCORING_MODEL` | اختياري | موديل تقييم الأخبار. الافتراضي: `claude-haiku-4-5-20251001` |
| `GENERATION_MODEL` | اختياري | موديل توليد البوستات والسكربتات. الافتراضي: `claude-sonnet-4-5-20250929` |
| `DATABASE_FILE` | اختياري | مسار ملف SQLite. الافتراضي: `./data/app.db` — على Vercel استخدم `/tmp/app.db` |
| `DASHBOARD_PASSWORD` | اختياري | كلمة مرور بوابة الدخول. اتركها فارغة لتعطيل البوابة. |

## التشغيل محلياً | Local run

```bash
npm install
cp .env.example .env.local   # ثم ضع ANTHROPIC_API_KEY الحقيقي
npm run dev                  # http://localhost:3000
```

للإنتاج محلياً: `npm run build && npm run start`

عند أول فتح اضغط «تحديث الآن» لجلب الأخبار وتقييمها.

## النشر على Vercel | Deploy to Vercel

1. ادفع المستودع إلى GitHub ثم من لوحة Vercel اختر **Add New → Project** واستورد المستودع
   `egypt-legal-news-aggregator` (إعدادات Next.js الافتراضية تكفي — لا حاجة لأي تعديل).
2. في **Settings → Environment Variables** أضف:
   - `ANTHROPIC_API_KEY` = مفتاحك الحقيقي (Production + Preview).
   - `DATABASE_FILE` = `/tmp/app.db`
   - `DASHBOARD_PASSWORD` = كلمة مرور قوية (موصى بها بشدة لأن اللوحة ستكون عامة الرابط).
   - اختيارياً: `SCORING_MODEL` و`GENERATION_MODEL`.
3. اضغط **Deploy**. بعد النشر افتح الرابط واضغط «تحديث الآن» لأول جلب.

### ملحوظة مهمة عن قاعدة البيانات على Vercel

نظام ملفات Vercel **مؤقت (ephemeral)**: ملف SQLite في `/tmp` يُمسح مع كل إعادة نشر
وقد يُعاد ضبطه في أي وقت، وبالتالي **الأخبار والمسودات المحفوظة لن تدوم** على Vercel.
للمسودات الدائمة اختر أحد الحلول:

- النشر على خادم/حاوية بحجم تخزين دائم (VPS، Railway، Render مع Persistent Disk، Fly.io مع Volume)
  مع `DATABASE_FILE` داخل المجلد الدائم — يعمل كل شيء كما هو دون أي تغيير في الكود.
- أو استبدال طبقة `src/lib/db.ts` لاحقاً بقاعدة مستضافة (Postgres/SQLite سحابية) —
  كل الوصول للبيانات معزول في هذا الملف وحده لهذا الغرض.

## الأمان والدقة | Safety

- لا تُخترع أي معلومة قانونية: التقييم والتوليد مقيدان بنص الخبر ومصدره فقط.
- كل المخرجات مسودات للمراجعة البشرية — التطبيق لا ينشر على فيسبوك ولا أي منصة.
- لا تضع مفتاح API الحقيقي في الكود أو في Git — متغيرات البيئة فقط.
