// Itqan source-book key -> the Arabic title of the classical text.
// 22 texts cover the dataset. A few key names are ambiguous as written; for
// those, a plain Arabic equivalent is used rather than guessing the author.
const SOURCE_BOOK_AR: Record<string, string> = {
  taqrib: "تقريب التهذيب",
  tahdhib_kamal: "تهذيب الكمال",
  tahdhib_tahdhib: "تهذيب التهذيب",
  mizan: "ميزان الاعتدال",
  lisan_mizan: "لسان الميزان",
  jarh: "الجرح والتعديل",
  thiqat: "الثقات",
  kamil: "الكامل في ضعفاء الرجال",
  mughni_ducafa: "المغني في الضعفاء",
  diwan_ducafa: "ديوان الضعفاء",
  dhayl_diwan: "ذيل ديوان الضعفاء",
  kashif: "الكاشف",
  isaba: "الإصابة في تمييز الصحابة",
  durar_kamina: "الدرر الكامنة",
  tarikh_islam: "تاريخ الإسلام",
  tarikh: "التاريخ",
  siyar: "سير أعلام النبلاء",
  tadhkirat_huffaz: "تذكرة الحفاظ",
  tabaqat: "الطبقات",
  mucin_tabaqat: "معين الطبقات",
  mucjam_shuyukh: "معجم الشيوخ",
  macrifa_qurra: "معرفة القراء الكبار",
};

export function sourceBookAr(key: string): string {
  return SOURCE_BOOK_AR[key] ?? key;
}
