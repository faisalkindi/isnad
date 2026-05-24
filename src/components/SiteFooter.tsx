// Public-facing footer. Documents the data sources and clarifies the tool's
// scope so users understand what the verdicts actually represent.

export function SiteFooter() {
  return (
    <footer
      dir="rtl"
      className="mt-12 border-t border-gray-200 bg-white px-4 py-6 text-xs leading-relaxed text-gray-700"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <section>
          <h2 className="mb-1 text-sm font-bold text-gray-900">
            عن الأداة
          </h2>
          <p>
            <strong>مدقّق الإسناد</strong> أداةٌ حاسوبية تساعد على فحص سلاسل
            رواة الحديث وفق منهج ابن الصلاح: تتعرَّف على كل راوٍ، وتعرض حكم
            العلماء عليه من 22 كتاباً من كتب الرجال، وتتحقَّق من اتصال السلسلة
            زمنيًّا وبتوثيقات كتب الرجال (شرط البخاري في ثبوت اللقاء)، وتقارن
            متن الحديث بـ112,221 حديثاً من 18 كتاباً.
          </p>
          <p className="mt-2">
            <strong>هذه أداةٌ مرجعيّة وليست حُكماً شرعيًّا.</strong>{" "}
            أحكام التطبيق محسوبة آليًّا على ظاهر الإسناد فقط؛ ولا تَقوم مَقام
            نظر العالم المتخصِّص في الشذوذ والعلل وضوابط القبول والردّ.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-bold text-gray-900">
            مصادر البيانات
          </h2>
          <ul className="list-inside list-disc space-y-0.5">
            <li>
              <a
                href="https://github.com/R3GENESI5/Itqan"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-800 underline hover:text-emerald-900"
              >
                Itqan
              </a>{" "}
              — 115,735 ترجمة للرواة و196,488 صورة للأسماء و336,175 صلة شيخ-تلميذ
              من 22 كتاباً كلاسيكيًّا.
            </li>
            <li>
              <a
                href="https://github.com/AhmedBaset/hadith-json"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-800 underline hover:text-emerald-900"
              >
                AhmedBaset/hadith-json
              </a>{" "}
              — متون 112,221 حديثاً من 18 كتاباً (الصحيحان، السنن الأربع،
              المسانيد، رياض الصالحين، …).
            </li>
            <li>
              <a
                href="https://github.com/somaia02/Narrator-Disambiguation"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-800 underline hover:text-emerald-900"
              >
                AR-Sanad 280K
              </a>{" "}
              — سنوات الوفاة والمدن للرواة (تكميل لِما نقصَ في Itqan).
            </li>
            <li>
              <strong>طبقات المدلِّسين</strong> لابن حجر (تعريف أهل التقديس) —
              منقاة من 34 مدلِّساً عبر 5 مراتب.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-bold text-gray-900">
            سياسة الحكم
          </h2>
          <p>
            يُطبَّق على كل راوٍ <strong>أشدّ جرحٍ موثَّق</strong> في الكتب
            الـ22، على قاعدة «الجرح المفسَّر مقدَّم على التعديل». ويُستثنى من
            ذلك <strong>الصحابة</strong> لإجماع أهل السنة على عدالتهم. وهذا
            أحوط ما يُمكن الحكم به، وقد يكون أشدّ مما يأخذ به بعض العلماء.
          </p>
        </section>

        <p className="text-center text-[11px] text-gray-600">
          البيانات الكلاسيكيّة في الملك العام؛ المصادر الحاسوبيّة تحت رخصة
          MIT. هذه الأداةُ مجّانيّة ومفتوحةُ المصدر.
        </p>
      </div>
    </footer>
  );
}
