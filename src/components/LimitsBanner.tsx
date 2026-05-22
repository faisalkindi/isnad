// Permanent, non-dismissible statement of what this tool does and does not do.
// Required by the design's honest-use principles — there is no close control.
export function LimitsBanner() {
  return (
    <div
      dir="rtl"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
    >
      <strong>أداة مرجعية، وليست حُكمًا.</strong>{" "}
      تعرض هذه الأداة ما سجّله علماء الحديث عن الرواة الذين تُدخلهم. لا تكتشف
      الرواة المحذوفين من السلسلة، ولا تُقيّم صحة الحديث ولا العلل ولا الشذوذ —
      ذلك يتطلب عالمًا مؤهَّلًا.
    </div>
  );
}
