-- Canonical-narrator trust list.
--
-- For ~50 universally-accepted narrators (Four Imams, Six Books authors,
-- famous Ḥuffāẓ, major Tabaqāt narrators), the Itqan import sometimes
-- left them with parser-noise weak/fabricator rows in source_grade (e.g.,
-- "Sufyan al-Thawri" being tagged كذاب in tahdhib_tahdhib because the
-- editor's note quoted Thawri SAYING someone else was a kadhdhab).
--
-- This table overrides the harshest_grade computation for these narrators
-- — if a narrator's id is in this table, the HARSHEST_SUBQUERY treats
-- only `reliable`/`companion` rows as candidates. The override is name-
-- agnostic — it's keyed on narrator.id, so it survives renames.
--
-- We populate by SQL match on name patterns + tabaqat to avoid hand-
-- listing every variant of every famous name. The script then INSERTs
-- the matching ids.

CREATE TABLE IF NOT EXISTS narrator_trust_override (
  narrator_id INTEGER PRIMARY KEY REFERENCES narrator(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  added_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Populate. Each WHERE block matches narrators by canonical name + nasab
-- features. Run on a fresh DB or after the source_grade import.

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Bukhārī (compiler of Sahih)' FROM narrator
  WHERE full_name LIKE 'محمد بن إسماعيل بن إبراهيم بن المغيرة%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Muslim ibn al-Hajjaj' FROM narrator
  WHERE full_name LIKE 'مسلم بن الحجاج%القشيري%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Mālik ibn Anas' FROM narrator
  WHERE full_name LIKE 'مالك بن أنس بن مالك%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Sufyān al-Thawrī' FROM narrator
  WHERE full_name LIKE 'سفيان بن سعيد بن مسروق%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Sufyān ibn ʿUyaynah' FROM narrator
  WHERE full_name LIKE 'سفيان بن عيينة%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Shu''ba ibn al-Hajjaj' FROM narrator
  WHERE full_name LIKE 'شعبة بن الحجاج بن الورد%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Yahya ibn Sa''id al-Qattan' FROM narrator
  WHERE full_name LIKE 'يحيى بن سعيد بن فروخ%' OR full_name LIKE 'يحيى بن سعيد القطان%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Yahya ibn Sa''id al-Ansari' FROM narrator
  WHERE full_name LIKE 'يحيى بن سعيد بن قيس%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Muhammad ibn Ibrahim al-Taymi' FROM narrator
  WHERE full_name LIKE 'محمد بن إبراهيم بن الحارث بن خالد%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'al-Humaydi' FROM narrator
  WHERE full_name LIKE 'عبد الله بن الزبير بن عيسى%الحميدي%'
     OR full_name LIKE 'الحميدي عبد الله بن الزبير%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'al-Awza''i' FROM narrator
  WHERE full_name LIKE 'عبد الرحمن بن عمرو بن أبي عمرو%الأوزاعي%'
     OR full_name LIKE 'الأوزاعي عبد الرحمن%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'al-Zuhri (Ibn Shihab)' FROM narrator
  WHERE full_name LIKE 'محمد بن مسلم بن عبيد الله بن عبد الله بن شهاب%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Hammad ibn Salama' FROM narrator
  WHERE full_name LIKE 'حماد بن سلمة بن دينار%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Hammad ibn Zayd' FROM narrator
  WHERE full_name LIKE 'حماد بن زيد بن درهم%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Ibn al-Mubarak' FROM narrator
  WHERE full_name LIKE 'عبد الله بن المبارك بن واضح%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Waki''' FROM narrator
  WHERE full_name LIKE 'وكيع بن الجراح بن مليح%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Ahmad ibn Hanbal' FROM narrator
  WHERE full_name LIKE 'أحمد بن محمد بن حنبل بن هلال%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'al-Shafi''i' FROM narrator
  WHERE full_name LIKE 'محمد بن إدريس بن العباس بن عثمان%الشافعي%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Yahya ibn Ma''in' FROM narrator
  WHERE full_name LIKE 'يحيى بن معين بن عون%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Ali ibn al-Madini' FROM narrator
  WHERE full_name LIKE 'علي بن عبد الله بن جعفر بن نجيح%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Ibn Jurayj' FROM narrator
  WHERE full_name LIKE 'عبد الملك بن عبد العزيز بن جريج%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'al-A''mash' FROM narrator
  WHERE full_name LIKE 'سليمان بن مهران الأعمش%'
     OR full_name LIKE 'الأعمش سليمان بن مهران%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Abu Dawud (compiler of Sunan)' FROM narrator
  WHERE full_name LIKE 'سليمان بن الأشعث بن إسحاق بن بشير%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'al-Tirmidhi' FROM narrator
  WHERE full_name LIKE 'محمد بن عيسى بن سورة%الترمذي%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'al-Nasa''i' FROM narrator
  WHERE full_name LIKE 'أحمد بن شعيب بن علي%النسائي%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'Ibn Maja' FROM narrator
  WHERE full_name LIKE 'محمد بن يزيد%ابن ماجه%' OR full_name LIKE 'محمد بن يزيد القزويني%'
ON CONFLICT (narrator_id) DO NOTHING;

INSERT INTO narrator_trust_override (narrator_id, reason)
SELECT id, 'al-Darimi' FROM narrator
  WHERE full_name LIKE 'عبد الله بن عبد الرحمن بن الفضل%الدارمي%'
ON CONFLICT (narrator_id) DO NOTHING;

-- Future additions go here.
