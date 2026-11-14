import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Ban,
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleDot,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  Link,
  LogOut,
  type LucideIcon,
  Nfc,
  Package,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  UploadCloud,
  Users,
  X,
} from "lucide-react";

/**
 * Single entry point for icons. Screens use semantic names; the mapping to
 * the icon set (lucide, tree-shaken per icon) lives only here.
 */
const icons = {
  overview: LayoutDashboard,
  customers: Building2,
  touchpoint: CircleDot,
  publications: UploadCloud,
  audit: ScrollText,
  plans: Layers,
  billing: CreditCard,
  staff: ShieldCheck,
  team: Users,
  logout: LogOut,
  plus: Plus,
  copy: Copy,
  check: Check,
  close: X,
  download: Download,
  external: ExternalLink,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "chevron-down": ChevronDown,
  search: Search,
  alert: TriangleAlert,
  info: Info,
  refresh: RefreshCw,
  "trend-up": TrendingUp,
  "trend-down": TrendingDown,
  nfc: Nfc,
  qr: QrCode,
  link: Link,
  ban: Ban,
  restore: RotateCcw,
  key: KeyRound,
  bell: Bell,
  status: Activity,
  pieces: Package,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number | undefined;
  className?: string | undefined;
}) {
  const Component = icons[name];
  return (
    <Component
      aria-hidden="true"
      className={className ? `icon ${className}` : "icon"}
      focusable="false"
      size={size}
      strokeWidth={1.7}
    />
  );
}
