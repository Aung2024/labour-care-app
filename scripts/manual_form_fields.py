"""Detailed field-by-field manual sections for key clinical forms (Myanmar)."""

FIELD_HEADERS = ["Input Field", "ဖြည့်နည်း / တန်ဖိုး", "Alert နှင့် ဝှက်ထားသော Logic"]


def _t(*rows):
    return {"headers": FIELD_HEADERS, "rows": list(rows)}


REGISTRATION_SECTIONS = [
    {
        "heading": "လုပ်ငန်းစဉ် အကျဉ်းချုပ်",
        "steps": [
            "Home → Patient Registration ကိုနှိပ်ပါ။",
            "မှတ်ပုံတင်မီ list တွင် ဖုန်း/အမည်ဖြင့် ရှာပြီး duplicate မရှိကြောင်း စစ်ပါ။",
            "Form ဖြည့်ပြီး Save/Continue — ဤအဆင့်တွင် Firestore သို့ မသိမ်းသေးပါ။",
            "Patient Consent စာမျက်နှာတွင် digital သို့မဟုတ် verbal consent ယူပြီး အမှန်တကယ် သိမ်းပါ။",
        ],
        "callouts": [
            ("warning", "အရေးကြီး", "ဖုန်းနံပါတ် duplicate ဖြစ်ပါက Submit လုပ်မရပါ။ အမည် duplicate သည် warning သာ — ဆက်လုပ်နိုင်သော်လည်း စစ်ဆေးပါ။"),
        ],
        "screenshots": [
            ("Patient registration — top", "05-patient-registration.png", "အခြေခံ အချက်အလက် နှင့် G/P အပိုင်း"),
            ("Patient registration — alerts", "05b-registration-alerts.png", "အသက် alert နှင့် duplicate warning ဥပမာ"),
        ],
    },
    {
        "heading": "အခြေခံ အချက်အလက် — Field-by-Field",
        "field_table": _t(
            ["Name (အမည်)", "လူနာ၏ အမည်ကို မှန်ကန်စွာ ရိုက်ထည့်ပါ။", "မဖြည့်ပါက Save မလုပ်နိုင်ပါ။"],
            ["Age (အသက်)", "ဂဏန်း ၀–၁၁၀။ အင်္ဂလိပ်ဂဏန်းသာ လက်ခံပါသည်။", "အသက် ၁၂ နှစ်အောက် → ကလေးလူနာ mode။ ၁၂ နှစ်နှင့် အထက် → မိခင်လူနာ mode။"],
            ["Date of Registration", "မှတ်ပုံတင်ရက်စွဲ။", "မဖြည့်ပါက Save မလုပ်နိုင်ပါ။"],
            ["Phone Number", "ဖုန်းနံပါတ် (optional)။", "Online: တူညီဖုန်းရှိပါက အနီရောင် alert နှင့် Submit ပိတ်ပါ။ Offline: duplicate စစ်ဆေးမှု မလုပ်ပါ။"],
            ["Patient Address", "နေရပ်လိပ်စာ (optional)။", "—"],
            ["Occupation", "အလုပ်အကိုင် (optional)။", "—"],
            ["CHW Phone", "ကျန်းမာရေးလုပ်ငန်းရှင် ဖုန်း (optional)။", "—"],
            ["Emergency Contact / Phone", "အရေးပေါ် ဆက်သွယ်ရမည့်သူ (optional)။", "—"],
        ),
    },
    {
        "heading": "အသက် အပေါ် Alert Logic (မိခင်လူနာ)",
        "paragraphs": [
            "အသက် ၁၂ နှစ်နှင့် အထက် ထည့်သောအခါ app သည် maternal age risk ကို အလိုအလျောက် စစ်ဆေးပြီး အနီရောင် danger alert ပြပါသည်။ ဤ alert များသည် မှတ်တမ်းတင်ရုံသာ မဟုတ်ဘဲ ဆေးရုံ/ဆေးခန်းတွင် မွေးဖွားရန် အကြံပြုချက်ဖြစ်ပါသည်။",
        ],
        "field_table": _t(
            ["အသက် < ၁၈ နှစ်", "Adolescent pregnancy", "အနီရောင် Danger alert — အန္တရာယ်မြင့်။ ဆေးရုံ/ဆေးခန်းတွင် မွေးဖွားရန် အကြံပြုပါ။ age_risk = Yes သိမ်းပါ။"],
            ["အသက် ≥ ၃၅ နှစ်", "Advanced maternal age", "အနီရောင် Danger alert — အန္တရာယ်မြင့်။ ဆေးရုံ/ဆေးခန်းတွင် မွေးဖွားရန် အကြံပြုပါ။ (App တွင် ၃၅ နှစ်မှ စတင်ပါသည်။)"],
            ["အသက် ၁၈–၃၄ နှစ်", "ပုံမှန် အသက်အပိုင်း", "Alert မပြပါ။"],
            ["အသက် < ၁၂ နှစ်", "ကလေးလူနာ", "Maternal age alert ကို ဖျောက်ပါ။ ကလေးလူနာ panel ပေါ်ပါသည်။"],
        ),
        "callouts": [("danger", "သတိပြုရန်", "အသက် ၄၅ အထက် ဆိုသည့် သီးခြား rule မရှိပါ — app တွင် ≥ ၃၅ နှစ်မှ advanced maternal age အဖြစ် သတ်မှတ်ပါသည်။ High Risk ANC form တွင် ၁၈ နှစ် အောက် သို့မဟုတ် ၄၀ အထက် checkbox ရှိပါသည်။")],
    },
    {
        "heading": "Gravida / Parity — Field-by-Field (မိခင်လူနာ)",
        "field_table": _t(
            ["Gravida (G)", "ကိုယ်ဝန်ဆောင်အကြိမ် ၁–၁၀ ရွေးပါ။", "G = ၁ → First pregnancy warning (primigravida)။ G ≥ ၂ → ကလေးအသက် field များ ပေါ်ပါသည်။"],
            ["Parity Primary (P)", "မွေးဖွားပြီးအကြိမ် ၀–၁၀။", "မိခင်လူနာအတွက် မဖြစ်မနေ။ Preview: G2P1+0 ပုံစံ ပြသပါသည်။"],
            ["Parity Secondary (+)", "အပို parity (optional)။", "—"],
            ["Age of Youngest Child", "နှစ် (၀–၂၅) နှင့် လ (၀–၁၁)။ G ≥ ၂ ဖြစ်မှ ပေါ်ပါသည်။", "စုစုပေါင်း < ၂၄ လ ဖြစ်ပါက Warning — pregnancy within 24 months။ frequent_pregnancy = Yes သိမ်းပါ။"],
        ),
        "callouts": [("info", "မှတ်ချက်", "Gravida နှင့် Parity ကြားမှန်ကန်မှု (ဥပမာ P ≤ G−1) app မှ မစစ်ပါ — clinical judgment ဖြင့် ဖြည့်ပါ။")],
    },
    {
        "heading": "ကလေးလူနာ မှတ်ပုံတင်ခြင်း — Field-by-Field",
        "field_table": _t(
            ["Birth Date", "မွေးဖွားရက် (date only)။", "အသက် < ၁၂ ဖြစ်သောအခါ မဖြစ်မနေ။ Delivery notes မှ auto-created baby ကို ပြန် register မလိုပါ။"],
            ["Sex", "male / female ရွေးပါ။", "မဖြစ်မနေ။"],
            ["Birth Weight (g)", "မွေးချိန် ဂရမ် (optional)။", "—"],
            ["Mother Name", "မိခင်အမည်။", "မဖြစ်မနေ။ စနစ်ထဲ မိခင်ရှိပါက consent အဆင့်တွင် link လုပ်နိုင်ပါသည်။"],
        ),
        "callouts": [("info", "Patient ID", "မိခင်: TSP-FAC-YY####။ ကလေး: TSP-FAC-BYY####။ Offline: ယာယီ ID (L+timestamp)။")],
    },
    {
        "heading": "Duplicate နှင့် Submit ပိတ်ခြင်း",
        "field_table": _t(
            ["Phone duplicate", "Scope: Midwife=ကိုယ်ပိုင်၊ TMO=မြို့နယ်၊ Regional=တိုင်းဒေသကြီး", "Submit ပိတ်ပါ — မှတ်ပုံတင် မလုပ်နိုင်ပါ။"],
            ["Name duplicate", "အမည် normalize လုပ်ပြီး exact match", "Warning သာ — ဆက်လုပ်နိုင်ပါသည်။"],
            ["Township မသတ်မှတ်", "User profile တွင် township မရှိ", "Submit ပိတ်ပါ — administrator ကို ဆက်သွယ်ပါ။"],
            ["Not logged in", "—", "Submit ပိတ်ပါ။"],
        ),
        "screenshots": [("Patient consent", "06-patient-consent.png", "Consent ပြီးမှ Firestore သို့ သိမ်းပါ။ Digital signature သို့မဟုတ် Verbal agreed။")],
    },
]

ANC_SECTIONS = [
    {
        "heading": "ANC Form အကျဉ်းချုပ်",
        "steps": [
            "Patient Care Hub → Antenatal Care → Record New ANC Visit။",
            "Visit Date မဖြစ်မနေ — အနာဂတ် ရက်စွဲ မရွေးနိုင်ပါ။",
            "LMP known/unknown ရွေးပြီး EDD နှင့် GA ကို app တွက်ပေးပါ။",
            "Vitals, examination, danger signs ဖြည့်ပြီး Save Visit Data။",
        ],
        "screenshots": [
            ("ANC form — visit & history", "10-anc-form-top.png", "Visit number, LMP, EDD နှင့် early ANC badge"),
            ("ANC form — vitals & danger", "10-anc-form-vitals.png", "BP alert နှင့် danger signs panel"),
        ],
    },
    {
        "heading": "Visit Information",
        "field_table": _t(
            ["Visit Number", "Auto — ယခင် visit + ၁။ Edit mode တွင် lock။", "—"],
            ["Date of Visit", "လာရောက်ရက်။ မဖြစ်မနေ။", "အနာဂတ် ရက် ထည့်ပါက Save ပိတ် + warning။"],
            ["Other Visits", "no / yes။", "yes → အခြား facility visit rows ပေါ်ပါသည်။"],
            ["Other visit rows", "Facility #, Date, Type (Private/Public), Name", "ယခင် visit မှ carry-forward ဖြစ်နိုင်ပါသည်။"],
        ),
    },
    {
        "heading": "History — LMP, EDD, Gestational Age",
        "field_table": _t(
            ["LMP Status", "known (default) / unknown။", "known → LMP+EDD fields။ unknown → Manual GA+Manual EDD။"],
            ["LMP", "နောက်ဆုံးရာသီ ပထမရက်။", "ထည့်လိုက်ပါက EDD = LMP + ၂၈၀ ရက် (Naegele)။ GA display အလိုအလျောက်။"],
            ["EDD (known LMP)", "Readonly — auto calculated။", "—"],
            ["Manual Gestational Age", "၀–၄၂ ပတ် (LMP unknown)။", "Manual EDD = visit date + (40−GA)×7 ရက်။"],
            ["Early ANC badge", "Auto", "ပထမ ANC သည် < ၁၄ ပတ် → Yes (စိမ်းရောင်)။ မဟုတ်ပါက No (နီ)။ Unknown = LMP/GA မရှိ။"],
            ["Past History", "nad / risk။", "risk → notes field ပေါ်ပါသည်။"],
            ["Chief Complaint", "Free text (optional)။", "—"],
        ),
    },
    {
        "heading": "Anthropometry & Vitals",
        "field_table": _t(
            ["Weight (kg)", "၀–၂၀၀။", "BMI တွက်ရန် height လိုပါသည်။"],
            ["Height (ft/in)", "Visit ၁ တွင်သာ edit။ Visit ၂+ သည် Visit ၁ မှ lock။", "—"],
            ["BMI", "Auto display + save။", "<18.5 underweight, 18.5–24.9 normal, 25–29.9 overweight, ≥30 obese။"],
            ["Pulse (bpm)", "၄၀–၁၈၀။", "Alert: < ၆၀ သို့မဟုတ် ≥ ၁၄၀။"],
            ["Blood Pressure", "Sys ၅၀–၂၅၀, Dia ၃၀–၁၅၀။", "Alert: Sys < ၈၀ (low)။ Sys ≥ ၁၄၀ သို့မဟုတ် Dia ≥ ၉၀ (high) — အနီရောင်။"],
            ["Temperature", "C သို့မဟုတ် F။", "Alert: < ၃၅.၀°C သို့မဟုတ် ≥ ၃၇.၅°C။"],
        ),
    },
    {
        "heading": "Urine Dipstick",
        "field_table": _t(
            ["Urine Protein", "Not tested, Negative, Trace, +, ++, +++။", "Trace သို့မဟုတ် +/++/+++ ဖြစ်ပါက chip အနီရောင် (danger style)။"],
            ["Urine Glucose", "တူညီရွေးချယ်မှုများ။", "Positive ဖြစ်ပါက chip အနီရောင်။"],
        ),
    },
    {
        "heading": "Clinical Findings",
        "field_table": _t(
            ["Anemia (lower eyelid)", "Yes / No။", "Yes → အနီရောင် alert — Hb test + iron supplementation အကြံပြု။"],
            ["Pitting Edema (leg)", "Yes / No။", "Yes → danger alert — pre-eclampsia သံသယ၊ BP နှင့် urine protein စစ်ပါ။"],
            ["Co-infection symptoms", "Yes / No။", "Yes → specify notes field ပေါ်ပါသည်။"],
            ["Other Findings", "Free text။", "—"],
        ),
    },
    {
        "heading": "GBV (Gender-Based Violence)",
        "field_table": _t(
            ["GBV suspected", "no (default) / yes။", "no ရွေးပါက indicator checkboxes အားလုံး uncheck ဖြစ်ပါသည်။"],
            ["Bruise, cuts, injuries", "Checkbox။", "GBV yes ဖြစ်မှသာ ဖြည့်ပါ။"],
            ["Fatigue, pallor", "Checkbox။", "—"],
            ["Worry, stress, fear", "Checkbox။", "—"],
        ),
        "callouts": [("warning", "Clinical", "GBV သည် documentation သာ — runtime blocking alert မရှိပါ။ လုံခြုံရေး နှင့် referral protocol အတိုင်း ဆောင်ရွက်ပါ။")],
    },
    {
        "heading": "Fetal Examination",
        "field_table": _t(
            ["Fundal Height (cm)", "၀–၅၀။", "—"],
            ["Fetal Heart Rate", "၁၀၀–၁၈၀ bpm။ UI: > ၂၀ ပတ်။", "Range alert မရှိ — clinical judgment။"],
            ["Fetal Position", "OA, OP, Transverse။ UI: + ၃၆ ပတ်။", "—"],
            ["Fetal Presentation", "Cephalic, Breech, Shoulder။", "—"],
            ["Fetal Movement", "Yes / No radio။", "—"],
        ),
    },
    {
        "heading": "High Risk Pregnancy",
        "field_table": _t(
            ["High risk", "no / yes။", "yes → factor checkboxes ပေါ်ပါသည်။"],
            ["Risk factors", "အသက် ၁၈ အောက် သို့မဟုတ် ၄၀ အထက်, Diabetes, HTN, Heart/Kidney, PIH/Pre-eclampsia, Previous complications, Twins, Malpresentation, Placenta previa, Other", "ယခင် visit မှ carry-forward။ Patient doc တွင် high_risk flag update။"],
            ["Risk notes", "Free text — high risk မရွေးလည်း ဖြည့်နိုင်ပါသည်။", "—"],
            ["Hospital delivery info", "Static alert", "High risk ရွေးချယ်မှု မပါဘဲနှင့် section တွင် hospital delivery message ကို အမြဲပြပါသည်။"],
        ),
    },
    {
        "heading": "Danger Signs",
        "paragraphs": ["Urgent (အနီရောင် — ချက်ချင်း ဆေးရုံ): vaginal bleeding, convulsions, severe headache/blurred vision/vomiting, severe abdominal pain, fever, fast breathing။", "Other (အဝါရောင် — မကြာခင် ဆေးရုံ): puffiness, oliguria, excessive vomiting, fever, abdominal pain, post date (>7 days past EDD), reduced fetal movement, other severe symptoms။"],
        "field_table": _t(
            ["Danger signs present", "no / yes radio။", "yes → checkbox panels ပေါ်ပါသည်။"],
            ["Any danger checkbox", "Urgent သို့မဟုတ် Other စာရင်းမှ ရွေးပါ။", "Save တွင် checked box ရှိပါက dangerSignsPresent = Yes သိမ်းပါ — radio value ကို မသုံးပါ။"],
        ),
        "callouts": [("danger", "အရေးပေါ်", "Danger sign ရွေးပါက မှတ်တမ်းတင်ရုံသာ မဟုတ်ဘဲ transfer/referral protocol အတိုင်း ဆောင်ရွက်ပါ။")],
    },
    {
        "heading": "Medications & Next Visit",
        "field_table": _t(
            ["Iron & Folic Acid", "Given / Not Given။ Given → frequency + tablet count။", "—"],
            ["Micronutrients / Vitamin B1", "တူညီ pattern။", "—"],
            ["Deworming", "Yes / No။", "—"],
            ["Tetanus (TD)", "TD1, TD2, Completed, Not Given။", "ယခင် visit မှ pre-fill။"],
            ["Next visit date", "Auto from 8-visit schedule။", "Manual override checkbox မှန်ပါက user ပြင်နိုင်ပါသည်။ Visit ≥ ၈ ဖြစ်ပါက EDD/delivery planning။"],
            ["Clinical notes / Initial", "Free text။", "—"],
        ),
    },
    {
        "heading": "MoH ၈-ကြိမ် ANC အချိန်ဇယား",
        "table": {
            "headers": ["Visit", "ကာလ", "အကြံပြု ရက် (LMP မှ)"],
            "rows": [
                ["၁", "ကိုယ်ဝန်သိပြီး ၃ လအတွင်း", "ပထမ ANC မှတ်တမ်းတင်ရက်"],
                ["၂", "လ ၅", "LMP + ၅ လ"],
                ["၃", "လ ၆", "LMP + ၆ လ"],
                ["၄", "လ ၇", "LMP + ၇ လ"],
                ["၅", "လ ၈ — ၂ ပတ်တစ်ကြိမ်", "LMP + ၈ လ"],
                ["၆", "လ ၈ — ၂ ပတ်တစ်ကြိမ်", "LMP + ၈ လ + ၁၄ ရက်"],
                ["၇", "လ ၉ — ၂ ပတ်တစ်ကြိမ်", "LMP + ၉ လ"],
                ["၈", "လ ၉ — ၂ ပတ်တစ်ကြိမ်", "LMP + ၉ လ + ၁၄ ရက်"],
            ],
        },
        "callouts": [("info", "List tracking", "Visit ၁–၄: ၃၀ ရက် ကျော်ပါက overdue။ Visit ၅–၈: ၁၄ ရက် ကျော်ပါက overdue။ Grace ကျော်ပါက Defaulter/lost။")],
    },
    {
        "heading": "Save-Time Validation",
        "field_table": _t(
            ["Future visit date", "—", "Save ပိတ်။"],
            ["EDD vs LMP mismatch", "> ၁၄ ရက် ကွာခြား", "Warning — confirm လုပ်မှ ဆက်သိမ်း။"],
            ["GA vs LMP mismatch", "> ၂ ပတ် ကွာခြား", "Warning — confirm လုပ်မှ ဆက်သိမ်း။"],
            ["BP / urine / danger signs", "—", "Save မပိတ်ပါ — clinical action ကို midwife ဆုံးဖြတ်ပါ။"],
        ),
    },
]

NEWBORN_SECTIONS = [
    {
        "heading": "Newborn Care Form အကျဉ်းချုပ်",
        "steps": [
            "Patient Care Hub → Newborn Care → Record New Visit (သို့မဟုတ် Visit ၁ အသစ်)။",
            "Visit ၁–၄: မွေးပြီး ၀, ၃, ၁၄, ၄၂ ရက် အချိန်ဇယား။",
            "Vitals, Respiration, Feeding — ကလေးအားလုံးအတွက် ဖြည့်ပါ။",
            "KMC eligible ဖြစ်ပါက Visit ၁ တွင် Yes/No ဆုံးဖြတ်ချက် မဖြစ်မနေ။",
            "Save Newborn Care Data။",
        ],
        "screenshots": [
            ("Newborn form — identity", "18-newborn-identity.png", "Birth time, weight, locked fields"),
            ("Newborn form — vitals & KMC", "18-newborn-vitals-kmc.png", "Vitals alerts နှင့် KMC section"),
        ],
    },
    {
        "heading": "Delivery & Visit Information",
        "field_table": _t(
            ["Visit Number", "Auto ၁–၄။ Days since birth မှ infer ဖြစ်နိုင်ပါသည်။", "—"],
            ["Birthplace", "Facility / Private။", "မဖြစ်မနေ။ Visit ၁ save ပြီးပါက lock။"],
            ["Mode of Delivery", "normal_vaginal, assisted_vaginal, caesarean_section။", "Visit ၁ save ပြီးပါက lock။"],
            ["Birth Time", "datetime-local။", "မဖြစ်မနေ။ PNC/delivery notes နှင့် shared anchor — lock after save။"],
        ),
    },
    {
        "heading": "Baby Information",
        "field_table": _t(
            ["Baby Name", "Auto: Baby {mother name}။", "Readonly။"],
            ["Gender", "male / female။", "Visit ၁ save ပြီးပါက lock။"],
            ["Birth Weight (g)", "မွေးချိန် ဂရမ်။", "မဖြစ်မနေ။ < ၂၀၀၀ g → KMC eligibility (low birth weight)။ Visit ၁ lock။"],
            ["Current Weight (g)", "ယခု visit အလေးချိန်။", "Visit ၂+ တွင်သာ ပေါ်ပါသည်။ Trend panel: gain=green, loss=red။"],
            ["Birth Length / Head circumference", "cm (optional)။", "—"],
        ),
    },
    {
        "heading": "Follow-up Schedule",
        "field_table": _t(
            ["Next follow-up date", "Standard: birth + ၃/၁၄/၄၂ ရက်။", "KMC Yes + discharge date → KMC schedule (+၃, +၇, +၁၄, +၃၀, +၁ လ...)။"],
            ["Adjust manually", "Checkbox။", "Check လုပ်ပါက date edit + Today button။"],
            ["Schedule panel", "Table display။", "Birth date မရှိပါက panel ဖျောက်ပါသည်။"],
        ),
    },
    {
        "heading": "Danger Signs",
        "field_table": _t(
            ["Umbilical infection", "Checkbox။", "ရွေးပါက referral စာသား ပြပါသည် — save မပိတ်။"],
            ["Skin infection", "Checkbox။", "—"],
            ["Severe jaundice", "Checkbox။", "—"],
            ["Fast breathing", "Checkbox။", "—"],
            ["Convulsion / fit", "Checkbox။", "—"],
            ["Fever / hypothermia", "Checkbox။", "—"],
            ["Not feeding well", "Checkbox။", "—"],
            ["Very weak / unconscious", "Checkbox။", "—"],
        ),
    },
    {
        "heading": "Vitals, Respiration & Feeding",
        "field_table": _t(
            ["Temperature", "C or F။", "Alert: < 36.5 or > 37.5°C (< 97.7 or > 99.5°F)။"],
            ["Heart rate", "bpm။", "Alert: < 120 or > 160။"],
            ["Respiration rate", "/min။", "Alert: < 40 or > 60။"],
            ["Difficult breathing", "yes / no။", "yes → grunting, chest indrawing, fast/slow rate checkboxes ပေါ်ပါသည်။"],
            ["Feeding type", "Formula, Breastfeeding, Mixed။", "—"],
            ["Feeding method", "Breastfeeding, Bottle, Cup/Spoon, Nasal Tube, Mixed။", "—"],
        ),
    },
    {
        "heading": "Assessment",
        "field_table": _t(
            ["Eye infection", "nad / ad။", "ad → redness, swelling, pus checkboxes။"],
            ["Eye care", "clean_and_dry / discharge_present။", "—"],
            ["Cord care", "yes / no။", "—"],
            ["Anatomy abnormalities", "Checkbox။", "—"],
            ["Exclusive breastfeeding on demand", "Checkbox။", "—"],
            ["Immunization button", "Modal ဖွင့်။", "Hep B, BCG, OPV0 သို့မဟုတ် other — vaccinations collection သို့ သီးခြား save။ vaccineId = hepb (canonical)။"],
        ),
    },
    {
        "heading": "KMC Logic",
        "field_table": _t(
            ["KMC eligibility", "Auto", "Birth weight < ၂၀၀၀ g သို့မဟုတ် မွေးရက် EDD ထက် ≥ ၂၁ ရက် စောက် (preterm)။"],
            ["KMC section visible", "Auto", "Eligible သို့မဟုတ် ယခင် visit တွင် potential KMC decision ရှိမှ ပေါ်ပါသည်။"],
            ["KMC = Yes (Visit 1)", "Required if eligible။", "discharge_date, kmc_hours_per_day (၀–၂၄), kmc_total_hours။"],
            ["KMC = No (Visit 1)", "Required if eligible။", "kmc_no_category + kmc_no_reason (barrier reasons)။"],
            ["Visit 2+ after KMC Yes", "—", "KMC radios disabled, discharge readonly။ Hours fields သီးခြင်း visit တိုင်း ပြန်ဖြည့်ပါ။"],
        ),
        "callouts": [("info", "Newborn Report", "KMC table သည် KMC baby (potential KMC / Yes) ဖြစ်မှသာ print/report တွင် ပါဝင်ပါသည်။")],
    },
    {
        "heading": "Outcome & Save Rules",
        "field_table": _t(
            ["Outcome", "alive / death။", "မဖြစ်မနေ။ death → cause_of_death field ပေါ်ပါသည်။"],
            ["Clinical notes", "Free text။", "—"],
            ["Save validation", "—", "birthplace, birth_time, birth_weight, outcome မရှိပါက Save မလုပ်နိုင်ပါ။ Visit ၁ KMC eligible → KMC decision မဖြစ်မနေ။"],
        ),
    },
]

PNC_SECTIONS = [
    {
        "heading": "PNC Form အကျဉ်းချုပ်",
        "steps": [
            "Patient Care Hub → Postnatal Care → Record New PNC Visit။",
            "Delivered date/time သည် newborn visit ၁ နှင့် မျှဝေထားနိုင်ပါသည်။",
            "Vitals, physical exam, danger signs ဖြည့်ပါ။",
            "Maternal outcome မဖြစ်မနေ — dead ဖြစ်ပါက death type လိုပါသည်။",
            "Save Postpartum Visit။",
        ],
        "screenshots": [
            ("PNC form — visit & vitals", "21-pnc-form-top.png", "Delivery anchor နှင့် vital alerts"),
            ("PNC form — exam & danger", "21-pnc-form-exam.png", "Lochia, danger signs, outcome"),
        ],
    },
    {
        "heading": "Visit Information",
        "field_table": _t(
            ["Visit Date", "မဖြစ်မနေ။", "အနာဂတ် ရက် မရွေးနိုင်ပါ။"],
            ["Visit Number", "Auto ၁–၄။", "—"],
            ["Delivered Date & Time", "datetime-local။", "Newborn/delivery notes နှင့် shared — lock after first save။ Postpartum days/hours auto calc။"],
            ["Next PNC visit", "Auto +၃, +၁၄, +၄၂ ရက်။", "Manual override ရွေးနိုင်ပါသည်။"],
            ["Other PNC visits", "no / yes + rows။", "ANC/other visits pattern တူညီပါသည်။"],
            ["ANC history summary", "Readonly display။", "—"],
        ),
    },
    {
        "heading": "Vital Signs",
        "field_table": _t(
            ["Pulse", "၄၀–၁၈၀ bpm။", "Alert: < ၆၀ or ≥ ၁၄၀ (non-blocking)။"],
            ["Blood Pressure", "Sys/Dia။", "Alert: Sys < ၈၀, Sys ≥ ၁၄၀, Dia ≥ ၉၀။"],
            ["Temperature", "C/F။", "Alert: < ၃၅.၀°C or ≥ ၃၇.၅°C။"],
        ),
    },
    {
        "heading": "Physical Examination",
        "field_table": _t(
            ["Breast engorgement", "Yes / No။", "Empty save → default No။"],
            ["Breast milk / feeding", "Yes / No။", "—"],
            ["Nipple condition", "Normal, Cracked, Inverted, Flat, Inflamed။", "—"],
            ["Uterine involution", "Normal, Delayed, Subinvolution။", "—"],
            ["Vaginal discharge (Lochia)", "Rubra, Serosa, Alba, Heavy bleeding, No bleeding။", "Heavy bleeding → PPH alert (E-MOTIVE bundle prompt) — အနီရောင်။"],
            ["Discharge smell", "Foul / No foul။", "Foul → clinical သံသယ — danger sign checkbox နှင့် ဆက်စပ်စဉ်းစားပါ။"],
            ["Episiotomy wound", "Healing well, Infected, Dehiscence, No episiotomy။", "—"],
            ["Urination / Constipation", "can void / cannot; Yes/No။", "—"],
            ["Mental health", "Feeling Well, Blues, Depression, Psychosis။", "—"],
        ),
    },
    {
        "heading": "Treatment & Counselling",
        "field_table": _t(
            ["Vitamin B / Vitamin A / Iron Folic", "Checkboxes။", "—"],
            ["Contraception (42 days)", "Yes / No။", "Yes → method checkboxes (Injection, Pills, Condom, IUD, Implant) ပေါ်ပါသည်။"],
        ),
    },
    {
        "heading": "Danger Signs",
        "field_table": _t(
            ["Heavy vaginal bleeding", "Checkbox။", "Lochia Heavy bleeding နှင့် ဆက်စပ်စဉ်းစားပါ။"],
            ["Severe headache / blurred vision", "Checkbox။", "—"],
            ["Convulsions", "Checkbox။", "—"],
            ["Fast / difficult breathing", "Checkbox။", "—"],
            ["Fever / fatigue", "Checkbox။", "—"],
            ["Breast engorgement danger", "Checkbox။", "—"],
            ["Urinary problems", "Checkbox။", "—"],
            ["Wound inflammation", "Checkbox။", "—"],
            ["Foul smelling discharge", "Checkbox။", "—"],
        ),
        "callouts": [("danger", "အရေးပေါ်", "Danger sign ရွေးပါက ချက်ချင်း clinical action နှင့် transfer စဉ်းစားပါ — app မှ save မပိတ်ပါ။")],
    },
    {
        "heading": "Maternal Outcome & Save",
        "field_table": _t(
            ["Maternal Outcome", "alive (default) / dead။", "မဖြစ်မနေ။ dead → obstetric / other death type မဖြစ်မနေ။"],
            ["Other symptoms / Treatment / Notes", "Textarea (optional)။", "—"],
            ["Save blocks", "—", "Visit date မရှိ၊ outcome မရှိ၊ dead ဖြစ်ပြီး death type မရှိ — သုံးခုသာ ပိတ်ပါ။ Vitals/danger signs သည် ပိတ်မထားပါ။"],
            ["Refer Patient", "Button။", "transfer-patient.html?type=pnc သို့ သွားပါသည်။"],
        ),
    },
]

CHAPTER_SECTIONS = {
    "လူနာမှတ်ပုံတင်ခြင်း": REGISTRATION_SECTIONS,
    "ANC — ကိုယ်ဝန်ဆောင် စောင့်ရှောက်မှု": ANC_SECTIONS,
    "မွေးကင်းစ စောင့်ရှောက်မှု": NEWBORN_SECTIONS,
    "PNC — မွေးပြီးမိခင် ပြုစုမှု": PNC_SECTIONS,
}


def apply_detailed_sections(manual):
    """Replace chapter sections with detailed field documentation where available."""
    for chapter in manual:
        title = chapter.get("title")
        if title in CHAPTER_SECTIONS:
            chapter["sections"] = CHAPTER_SECTIONS[title]
    return manual
