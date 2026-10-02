/**
 * Icon library: Lucide icons (ISC license) converted to single SVG paths, so
 * they become editable vector `path` elements in the design.
 */
import {
  Airplay,
  AlarmClock,
  Anchor,
  Award,
  Bell,
  Bike,
  Book,
  Bookmark,
  Briefcase,
  Calendar,
  Camera,
  Car,
  ChartBar,
  ChartPie,
  Check,
  CircleCheck,
  Clock,
  Cloud,
  Coffee,
  Compass,
  CreditCard,
  Crown,
  Diamond,
  Download,
  Earth,
  Feather,
  Flag,
  Flame,
  Flower,
  Gift,
  GraduationCap,
  Headphones,
  Heart,
  House,
  type IconNode,
  Image,
  Info,
  Key,
  Leaf,
  Lightbulb,
  Link,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Mic,
  Moon,
  Mountain,
  Music,
  Palette,
  PartyPopper,
  Pencil,
  Phone,
  Plane,
  Play,
  Plus,
  Quote,
  Rocket,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smile,
  Sparkles,
  Star,
  Sun,
  Tag,
  Target,
  ThumbsUp,
  Trophy,
  Truck,
  Umbrella,
  User,
  Users,
  Utensils,
  Video,
  Wallet,
  Wifi,
  X,
  Zap,
} from 'lucide';

export interface IconDef {
  id: string;
  keywords: string;
  path: string;
}

const RAW: Record<string, [IconNode, string]> = {
  heart: [Heart, 'love like favorite قلب حب'],
  star: [Star, 'rating favorite نجمة تقييم'],
  check: [Check, 'done ok tick صح'],
  'circle-check': [CircleCheck, 'done success تم'],
  x: [X, 'close cancel إغلاق'],
  plus: [Plus, 'add زائد إضافة'],
  info: [Info, 'information معلومات'],
  sparkles: [Sparkles, 'magic ai new تألق'],
  zap: [Zap, 'flash energy fast برق'],
  flame: [Flame, 'fire hot نار'],
  sun: [Sun, 'day weather شمس'],
  moon: [Moon, 'night ليل قمر'],
  cloud: [Cloud, 'weather سحابة'],
  umbrella: [Umbrella, 'rain مظلة'],
  leaf: [Leaf, 'nature eco ورقة طبيعة'],
  flower: [Flower, 'nature زهرة'],
  mountain: [Mountain, 'nature travel جبل'],
  earth: [Earth, 'world globe عالم'],
  'map-pin': [MapPin, 'location place موقع'],
  compass: [Compass, 'travel بوصلة'],
  plane: [Plane, 'travel flight طائرة سفر'],
  car: [Car, 'vehicle سيارة'],
  bike: [Bike, 'bicycle دراجة'],
  truck: [Truck, 'delivery شاحنة توصيل'],
  anchor: [Anchor, 'sea مرساة'],
  rocket: [Rocket, 'launch startup صاروخ'],
  house: [House, 'home منزل'],
  phone: [Phone, 'call هاتف اتصال'],
  mail: [Mail, 'email بريد'],
  'message-circle': [MessageCircle, 'chat رسالة'],
  send: [Send, 'message إرسال'],
  'share-2': [Share2, 'share مشاركة'],
  link: [Link, 'url رابط'],
  wifi: [Wifi, 'internet واي فاي'],
  search: [Search, 'find بحث'],
  settings: [Settings, 'gear إعدادات'],
  lock: [Lock, 'security قفل'],
  key: [Key, 'password مفتاح'],
  shield: [Shield, 'security حماية'],
  bell: [Bell, 'notification جرس'],
  calendar: [Calendar, 'date event تقويم'],
  clock: [Clock, 'time ساعة وقت'],
  'alarm-clock': [AlarmClock, 'time منبه'],
  user: [User, 'person profile مستخدم'],
  users: [Users, 'team people فريق'],
  smile: [Smile, 'happy face ابتسامة'],
  'thumbs-up': [ThumbsUp, 'like إعجاب'],
  award: [Award, 'prize badge جائزة'],
  trophy: [Trophy, 'win كأس'],
  crown: [Crown, 'king premium تاج'],
  diamond: [Diamond, 'gem premium ماسة'],
  gift: [Gift, 'present هدية'],
  'party-popper': [PartyPopper, 'celebration احتفال'],
  tag: [Tag, 'price sale سعر'],
  'shopping-bag': [ShoppingBag, 'shop store حقيبة تسوق'],
  'shopping-cart': [ShoppingCart, 'shop cart عربة'],
  'credit-card': [CreditCard, 'payment بطاقة'],
  wallet: [Wallet, 'money محفظة'],
  briefcase: [Briefcase, 'work business عمل'],
  'chart-bar': [ChartBar, 'chart graph statistics رسم بياني'],
  'chart-pie': [ChartPie, 'chart pie دائري'],
  target: [Target, 'goal هدف'],
  megaphone: [Megaphone, 'announce marketing إعلان'],
  lightbulb: [Lightbulb, 'idea فكرة'],
  'graduation-cap': [GraduationCap, 'education school تعليم'],
  book: [Book, 'read كتاب'],
  bookmark: [Bookmark, 'save إشارة'],
  pencil: [Pencil, 'edit write قلم'],
  palette: [Palette, 'art design ألوان'],
  feather: [Feather, 'write ريشة'],
  quote: [Quote, 'quotation اقتباس'],
  camera: [Camera, 'photo كاميرا'],
  image: [Image, 'photo picture صورة'],
  video: [Video, 'movie فيديو'],
  play: [Play, 'video start تشغيل'],
  music: [Music, 'song موسيقى'],
  headphones: [Headphones, 'audio سماعات'],
  mic: [Mic, 'podcast microphone ميكروفون'],
  airplay: [Airplay, 'screen cast شاشة'],
  coffee: [Coffee, 'cafe drink قهوة'],
  utensils: [Utensils, 'food restaurant طعام مطعم'],
  download: [Download, 'save تنزيل'],
  flag: [Flag, 'goal علم'],
};

const n = (v: string | number | undefined) => Number(v ?? 0);

function elementToPath(tag: string, a: Record<string, string | number>): string {
  switch (tag) {
    case 'path':
      return String(a.d ?? '');
    case 'circle': {
      const cx = n(a.cx);
      const cy = n(a.cy);
      const r = n(a.r);
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    }
    case 'ellipse': {
      const cx = n(a.cx);
      const cy = n(a.cy);
      const rx = n(a.rx);
      const ry = n(a.ry);
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
    }
    case 'rect': {
      const x = n(a.x);
      const y = n(a.y);
      const w = n(a.width);
      const h = n(a.height);
      const r = Math.min(n(a.rx ?? a.ry), w / 2, h / 2);
      if (!r) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
    }
    case 'line':
      return `M${n(a.x1)} ${n(a.y1)}L${n(a.x2)} ${n(a.y2)}`;
    case 'polyline':
    case 'polygon': {
      const pts = String(a.points ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      let d = '';
      for (let i = 0; i + 1 < pts.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${pts[i]} ${pts[i + 1]}`;
      return tag === 'polygon' ? `${d}Z` : d;
    }
    default:
      return '';
  }
}

export function iconNodeToPath(node: IconNode): string {
  return node.map(([tag, attrs]) => elementToPath(tag, attrs as Record<string, string | number>)).join('');
}

export const ICONS: readonly IconDef[] = Object.entries(RAW).map(([id, [node, keywords]]) => ({
  id,
  keywords: `${id.replace(/-/g, ' ')} ${keywords}`,
  path: iconNodeToPath(node),
}));
