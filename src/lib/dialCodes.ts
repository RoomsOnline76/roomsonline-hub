/**
 * Country dial codes for guest / booker phone capture.
 *
 * `src/lib/countries.ts` stays as-is for existing nationality selectors; this
 * list supersedes it wherever a phone prefix is needed too.
 */
export interface DialCountry {
  /** ISO 3166-1 alpha-2 */
  iso: string;
  name: string;
  /** Flag emoji, derived from the ISO code. */
  flag: string;
  /** Dial code including the leading "+". */
  dial: string;
}

const RAW: Array<[string, string, string]> = [
  ["ZA", "South Africa", "+27"],
  ["US", "United States", "+1"],
  ["GB", "United Kingdom", "+44"],
  ["DE", "Germany", "+49"],
  ["FR", "France", "+33"],
  ["NL", "Netherlands", "+31"],
  ["BE", "Belgium", "+32"],
  ["AU", "Australia", "+61"],
  ["CA", "Canada", "+1"],
  ["IN", "India", "+91"],
  ["BR", "Brazil", "+55"],
  ["CN", "China", "+86"],
  ["JP", "Japan", "+81"],
  ["KR", "South Korea", "+82"],
  ["IT", "Italy", "+39"],
  ["ES", "Spain", "+34"],
  ["PT", "Portugal", "+351"],
  ["CH", "Switzerland", "+41"],
  ["AT", "Austria", "+43"],
  ["SE", "Sweden", "+46"],
  ["NO", "Norway", "+47"],
  ["DK", "Denmark", "+45"],
  ["FI", "Finland", "+358"],
  ["IE", "Ireland", "+353"],
  ["NZ", "New Zealand", "+64"],
  ["SG", "Singapore", "+65"],
  ["AE", "United Arab Emirates", "+971"],
  ["SA", "Saudi Arabia", "+966"],
  ["QA", "Qatar", "+974"],
  ["KW", "Kuwait", "+965"],
  ["IL", "Israel", "+972"],
  ["EG", "Egypt", "+20"],
  ["MA", "Morocco", "+212"],
  ["KE", "Kenya", "+254"],
  ["NG", "Nigeria", "+234"],
  ["GH", "Ghana", "+233"],
  ["TZ", "Tanzania", "+255"],
  ["UG", "Uganda", "+256"],
  ["RW", "Rwanda", "+250"],
  ["ET", "Ethiopia", "+251"],
  ["MZ", "Mozambique", "+258"],
  ["BW", "Botswana", "+267"],
  ["NA", "Namibia", "+264"],
  ["ZW", "Zimbabwe", "+263"],
  ["ZM", "Zambia", "+260"],
  ["MW", "Malawi", "+265"],
  ["LS", "Lesotho", "+266"],
  ["SZ", "Eswatini", "+268"],
  ["AO", "Angola", "+244"],
  ["MU", "Mauritius", "+230"],
  ["SC", "Seychelles", "+248"],
  ["MG", "Madagascar", "+261"],
  ["RE", "Réunion", "+262"],
  ["MX", "Mexico", "+52"],
  ["AR", "Argentina", "+54"],
  ["CL", "Chile", "+56"],
  ["CO", "Colombia", "+57"],
  ["PE", "Peru", "+51"],
  ["UY", "Uruguay", "+598"],
  ["PL", "Poland", "+48"],
  ["CZ", "Czech Republic", "+420"],
  ["SK", "Slovakia", "+421"],
  ["HU", "Hungary", "+36"],
  ["RO", "Romania", "+40"],
  ["BG", "Bulgaria", "+359"],
  ["HR", "Croatia", "+385"],
  ["SI", "Slovenia", "+386"],
  ["RS", "Serbia", "+381"],
  ["GR", "Greece", "+30"],
  ["CY", "Cyprus", "+357"],
  ["MT", "Malta", "+356"],
  ["LU", "Luxembourg", "+352"],
  ["IS", "Iceland", "+354"],
  ["EE", "Estonia", "+372"],
  ["LV", "Latvia", "+371"],
  ["LT", "Lithuania", "+370"],
  ["UA", "Ukraine", "+380"],
  ["TR", "Turkey", "+90"],
  ["RU", "Russia", "+7"],
  ["KZ", "Kazakhstan", "+7"],
  ["TH", "Thailand", "+66"],
  ["MY", "Malaysia", "+60"],
  ["ID", "Indonesia", "+62"],
  ["PH", "Philippines", "+63"],
  ["VN", "Vietnam", "+84"],
  ["TW", "Taiwan", "+886"],
  ["HK", "Hong Kong", "+852"],
  ["MO", "Macau", "+853"],
  ["PK", "Pakistan", "+92"],
  ["BD", "Bangladesh", "+880"],
  ["LK", "Sri Lanka", "+94"],
  ["NP", "Nepal", "+977"],
  ["MV", "Maldives", "+960"],
];

const flagFor = (iso: string) =>
  iso.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

export const DIAL_COUNTRIES: DialCountry[] = RAW.map(([iso, name, dial]) => ({
  iso,
  name,
  dial,
  flag: flagFor(iso),
})).sort((a, b) => a.name.localeCompare(b.name));

/** Default when nothing else can be inferred. */
export const DEFAULT_DIAL_ISO = "ZA";

export function countryByIso(iso?: string | null): DialCountry | undefined {
  if (!iso) return undefined;
  const key = iso.trim().toUpperCase();
  return DIAL_COUNTRIES.find((c) => c.iso === key);
}

/** Resolves a free-text nationality/country ("South Africa", "ZA", "za") to a country. */
export function countryByName(value?: string | null): DialCountry | undefined {
  if (!value) return undefined;
  const key = value.trim().toLowerCase();
  if (!key) return undefined;
  if (key.length === 2) return countryByIso(key);
  return DIAL_COUNTRIES.find((c) => c.name.toLowerCase() === key);
}

/** Longest-prefix match so "+27" wins over "+2". */
export function countryByDial(dial?: string | null): DialCountry | undefined {
  if (!dial) return undefined;
  const digits = dial.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  let best: DialCountry | undefined;
  for (const c of DIAL_COUNTRIES) {
    const d = c.dial.replace("+", "");
    if (digits.startsWith(d) && (!best || d.length > best.dial.length - 1)) best = c;
  }
  return best;
}

export function dialForCountry(iso?: string | null): string {
  return countryByIso(iso)?.dial ?? "";
}

/**
 * Splits a stored phone number into its dial code and local part. Numbers with
 * no recognised prefix come back as local-only so nothing is lost.
 */
export function splitPhone(value?: string | null): { iso: string | null; dial: string; local: string } {
  const raw = (value || "").trim();
  if (!raw) return { iso: null, dial: "", local: "" };
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/[^\d]/g, "");
    const match = countryByDial(digits);
    if (match) {
      const codeDigits = match.dial.replace("+", "");
      return { iso: match.iso, dial: match.dial, local: digits.slice(codeDigits.length) };
    }
    return { iso: null, dial: "", local: raw };
  }
  return { iso: null, dial: "", local: raw };
}

/** Joins a dial code and local number into a single E.164-style value. */
export function joinPhone(dial: string, local: string): string {
  const localDigits = (local || "").replace(/[^\d]/g, "").replace(/^0+/, "");
  if (!localDigits) return "";
  if (!dial) return local.trim();
  return `${dial}${localDigits}`;
}
