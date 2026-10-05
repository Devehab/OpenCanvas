/**
 * Arabic search words for the icon library. Icons carry English names and
 * tags; an Arabic query is matched through this dictionary
 * (English keyword → Arabic words, several synonyms separated by spaces).
 */
const DICTIONARY = `
add:إضافة زائد|airplane:طائرة|plane:طائرة سفر طيران|alarm:منبه إنذار|alert:تنبيه تحذير|album:ألبوم|ambulance:إسعاف
anchor:مرساة|android:أندرويد|apple:تفاحة|archive:أرشيف|arrow:سهم أسهم|arrows:أسهم|art:فن|at:بريد
attachment:مرفق|audio:صوت|award:جائزة وسام|baby:طفل رضيع|backpack:حقيبة ظهر|badge:شارة وسام|bag:حقيبة|ball:كرة
balloon:بالون|banana:موز|bank:بنك مصرف|bar:شريط|barcode:باركود|basket:سلة|bath:حمام|battery:بطارية|beach:شاطئ
bed:سرير|beer:مشروب|bell:جرس|bike:دراجة|bicycle:دراجة|bird:طائر عصفور|birthday:عيد ميلاد|bitcoin:بيتكوين
blender:خلاط|bluetooth:بلوتوث|boat:قارب|bold:عريض|bolt:برق صاعقة|bomb:قنبلة|bone:عظمة|book:كتاب|bookmark:إشارة مرجعية
books:كتب مكتبة|bottle:زجاجة|box:صندوق|brain:دماغ عقل|bread:خبز|briefcase:حقيبة عمل|brightness:سطوع|brush:فرشاة
bubble:فقاعة|bug:حشرة خطأ|building:مبنى بناية|bulb:مصباح فكرة|bus:حافلة باص|business:أعمال|butterfly:فراشة
cake:كعكة|calculator:آلة حاسبة|calendar:تقويم تاريخ|call:اتصال مكالمة|camera:كاميرا تصوير|camping:تخييم
candle:شمعة|candy:حلوى|car:سيارة|card:بطاقة|cart:عربة تسوق|cash:نقد نقود|castle:قلعة|cat:قطة|celebration:احتفال
certificate:شهادة|chair:كرسي|chart:رسم بياني مخطط|chat:دردشة محادثة|check:صح علامة|cheese:جبن|chef:طاهي طباخ
cherry:كرز|chess:شطرنج|child:طفل|church:كنيسة|circle:دائرة|city:مدينة|clean:تنظيف|clipboard:حافظة|clock:ساعة وقت
close:إغلاق|cloud:سحابة غيمة|code:برمجة كود|coffee:قهوة|coin:عملة نقود|coins:عملات نقود|color:لون ألوان
comment:تعليق|compass:بوصلة|computer:حاسوب كمبيوتر|contact:جهة اتصال|cookie:بسكويت|copy:نسخ|crown:تاج
cup:كوب فنجان|currency:عملة|cut:قص|dashboard:لوحة تحكم|database:قاعدة بيانات|delete:حذف|delivery:توصيل
desk:مكتب|desktop:حاسوب مكتبي|diamond:ماسة ألماس|dice:نرد|discount:خصم تخفيض|doctor:طبيب|document:مستند وثيقة
dog:كلب|dollar:دولار|door:باب|download:تنزيل تحميل|drink:مشروب|drop:قطرة|droplet:قطرة ماء|drum:طبل|earth:أرض عالم
edit:تعديل تحرير|education:تعليم|egg:بيضة|email:بريد إلكتروني|energy:طاقة|envelope:ظرف رسالة|eraser:ممحاة
euro:يورو|event:حدث مناسبة|eye:عين رؤية|face:وجه|factory:مصنع|family:عائلة أسرة|fashion:أزياء موضة|favorite:مفضل
feather:ريشة|female:أنثى|file:ملف|film:فيلم|filter:مرشح فلتر|finance:مالية|fingerprint:بصمة|fire:نار حريق
fish:سمكة|fitness:لياقة رياضة|flag:علم راية|flame:لهب نار|flash:فلاش|flower:زهرة وردة|folder:مجلد|food:طعام أكل
football:كرة قدم|forest:غابة|fork:شوكة|fruit:فاكهة|fuel:وقود|game:لعبة ألعاب|games:ألعاب|garden:حديقة|gas:غاز
gift:هدية|glass:كأس زجاج|glasses:نظارة|globe:كرة أرضية عالم|goal:هدف|gold:ذهب|graduation:تخرج|graph:رسم بياني
grid:شبكة|guitar:غيتار|hammer:مطرقة|hand:يد|happy:سعيد|hat:قبعة|headphones:سماعات|health:صحة|heart:قلب حب
help:مساعدة|history:تاريخ سجل|home:منزل بيت|hospital:مستشفى|hotel:فندق|hourglass:ساعة رملية|house:منزل بيت
ice:ثلج جليد|image:صورة|inbox:صندوق الوارد|info:معلومات|instagram:إنستغرام|internet:إنترنت|island:جزيرة
key:مفتاح|keyboard:لوحة مفاتيح|kitchen:مطبخ|lamp:مصباح|language:لغة|laptop:حاسوب محمول|leaf:ورقة شجر
library:مكتبة|light:ضوء|lightbulb:مصباح فكرة|lightning:برق|like:إعجاب|link:رابط|list:قائمة|location:موقع مكان
lock:قفل|love:حب|luggage:أمتعة حقيبة سفر|magnet:مغناطيس|mail:بريد رسالة|male:ذكر|man:رجل|map:خريطة|marker:علامة
mask:قناع|math:رياضيات|medal:ميدالية|medical:طبي|medicine:دواء|megaphone:مكبر صوت إعلان|menu:قائمة
message:رسالة|mic:ميكروفون|microphone:ميكروفون|money:مال نقود|monitor:شاشة|moon:قمر هلال|mosque:مسجد جامع
motorbike:دراجة نارية|mountain:جبل|mouse:فأرة|movie:فيلم سينما|music:موسيقى|nature:طبيعة|network:شبكة|news:أخبار
note:ملاحظة|notebook:دفتر|notification:إشعار|number:رقم|nurse:ممرضة|office:مكتب|oil:زيت|package:طرد|paint:طلاء رسم
palette:لوحة ألوان|paper:ورق|parking:موقف|party:حفلة|password:كلمة مرور|pause:إيقاف مؤقت|paw:مخلب|payment:دفع
pen:قلم|pencil:قلم رصاص|people:أشخاص ناس|percent:نسبة مئوية|person:شخص|pet:حيوان أليف|phone:هاتف جوال
photo:صورة|piano:بيانو|pie:دائري|pill:حبة دواء|pin:دبوس موقع|pizza:بيتزا|planet:كوكب|plant:نبات|play:تشغيل
plus:زائد إضافة|podcast:بودكاست|police:شرطة|power:طاقة تشغيل|present:هدية|price:سعر|print:طباعة|printer:طابعة
profile:ملف شخصي|puzzle:أحجية لغز|question:سؤال|quote:اقتباس|rain:مطر|rainbow:قوس قزح|receipt:إيصال فاتورة
recycle:إعادة تدوير|refresh:تحديث|restaurant:مطعم|ring:خاتم حلقة|road:طريق|robot:روبوت|rocket:صاروخ|rose:وردة
route:مسار|ruler:مسطرة|run:جري ركض|sad:حزين|safe:خزنة آمن|sale:تخفيضات بيع|save:حفظ|school:مدرسة|science:علوم
scissors:مقص|search:بحث|security:أمان حماية|send:إرسال|server:خادم|settings:إعدادات|share:مشاركة|shield:درع حماية
ship:سفينة|shirt:قميص|shoe:حذاء|shop:متجر|shopping:تسوق|shower:استحمام|sign:لافتة|signal:إشارة|smartphone:هاتف ذكي
smile:ابتسامة|snow:ثلج|soccer:كرة قدم|sofa:أريكة|sound:صوت|space:فضاء|sparkles:تألق لمعان|speaker:مكبر صوت
sport:رياضة|sports:رياضة|square:مربع|star:نجمة|stethoscope:سماعة طبيب|store:متجر|storm:عاصفة|student:طالب
sun:شمس|sunrise:شروق|sunset:غروب|swim:سباحة|table:جدول طاولة|tag:وسم سعر|target:هدف|taxi:سيارة أجرة|tea:شاي
teacher:معلم|team:فريق|telephone:هاتف|tent:خيمة|text:نص|thermometer:ميزان حرارة|thumb:إبهام|ticket:تذكرة
time:وقت زمن|timer:مؤقت|tool:أداة|tools:أدوات|tooth:سن أسنان|train:قطار|translate:ترجمة|trash:سلة مهملات
travel:سفر|tree:شجرة|trending:رائج|trophy:كأس جائزة|truck:شاحنة|tv:تلفاز|umbrella:مظلة|university:جامعة
unlock:فتح القفل|upload:رفع|user:مستخدم|users:مستخدمون فريق|vacation:إجازة عطلة|video:فيديو|volume:صوت
wallet:محفظة|watch:ساعة يد|water:ماء|wave:موجة|weather:طقس|wedding:زفاف|wheelchair:كرسي متحرك|wifi:واي فاي
wind:رياح|window:نافذة|wine:مشروب|woman:امرأة|work:عمل|world:عالم|write:كتابة|x:إغلاق|zoom:تكبير|wrench:مفتاح ربط
arabic:عربي|kaaba:كعبة|lantern:فانوس|ramadan:رمضان|crescent:هلال|camel:جمل|palm:نخلة|date:تمر تاريخ
facebook:فيسبوك|twitter:تويتر|youtube:يوتيوب|whatsapp:واتساب|linkedin:لينكدإن|tiktok:تيك توك|snapchat:سناب شات
`;

/** Folds Arabic spelling variants so searches forgive hamza, ta marbuta and diacritics. */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ٰٟـ]/g, '') // diacritics, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();
}

export const hasArabic = (text: string) => /[؀-ۿ]/.test(text);

let index: [string, string][] | null = null;

/** Normalized Arabic word → English keyword pairs. */
function arabicIndex(): [string, string][] {
  if (index) return index;
  index = [];
  for (const entry of DICTIONARY.split(/[|\n]/)) {
    const [english, arabic] = entry.split(':');
    if (!english || !arabic) continue;
    for (const word of arabic.trim().split(/\s+/)) index.push([normalizeArabic(word), english.trim()]);
  }
  return index;
}

/** English keywords an Arabic search term stands for. */
export function englishFor(term: string): string[] {
  const q = normalizeArabic(term.trim());
  if (q.length < 2) return [];
  const out = new Set<string>();
  for (const [arabic, english] of arabicIndex()) {
    // "قلب" finds "قلب"; "قلوب" or "القلب" find it too (prefix/containment both ways).
    const bare = q.startsWith('ال') && q.length > 3 ? q.slice(2) : q;
    if (arabic === bare || arabic.startsWith(bare) || (bare.length >= 3 && bare.startsWith(arabic)))
      out.add(english);
  }
  return [...out];
}
