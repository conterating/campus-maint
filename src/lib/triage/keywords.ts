// Keyword classifier: the fallback when no Anthropic API key is configured or the
// API call fails. Deterministic and fast, so the app always works end to end.
import { CATEGORY_LABEL, type Category, type Severity } from "@/lib/domain";

type Rule = { category: Category; words: RegExp[]; weight?: number };

const CATEGORY_RULES: Rule[] = [
  {
    category: "PLUMBING",
    words: [/\bleak/i, /\bdrip/i, /\bpipe/i, /\btoilet/i, /\bsink\b/i, /\bfaucet/i, /\bshower/i, /\bdrain/i, /\bclog/i, /\bwater\b/i, /\bflood/i, /\boverflow/i, /\bsewage/i, /\burinal/i, /\bwater fountain/i],
  },
  {
    category: "ELECTRICAL",
    words: [/\boutlet/i, /\bpower\b/i, /\bbreaker/i, /\bwir(e|es|ing)\b/i, /\bspark/i, /\blights?\b/i, /\bbulb/i, /\bflicker/i, /\bswitch\b/i, /\belectric/i, /\bplug/i],
  },
  {
    category: "HVAC",
    words: [/\bhvac\b/i, /\bheat(er|ing)?\b/i, /\b(a\/c|ac)\b/i, /\bair ?condition/i, /\bthermostat/i, /\btoo (hot|cold)\b/i, /\bfreezing\b/i, /\bvent\b/i, /\bradiator/i, /\bcooling\b/i, /\bhumid/i],
  },
  {
    category: "ELEVATOR",
    words: [/\belevator/i, /\blift\b/i],
    weight: 2,
  },
  {
    category: "APPLIANCE",
    words: [/\bwasher/i, /\bdryer/i, /\blaundry/i, /\bwashing machine/i, /\bfridge/i, /\brefrigerator/i, /\bmicrowave/i, /\bdishwasher/i, /\bstove/i, /\boven\b/i, /\bvending/i],
    // A named appliance is stronger evidence than symptoms like "drain" or "water".
    weight: 2.5,
  },
  {
    category: "NETWORK",
    words: [/\bwi-?fi\b/i, /\binternet\b/i, /\beduroam\b/i, /\bethernet/i, /\bnetwork\b/i, /\brouter\b/i, /\bconnection\b/i, /\bdisconnect/i],
    weight: 1.5,
  },
  {
    category: "AV_TECH",
    words: [/\bprojector/i, /\bscreen\b/i, /\bhdmi\b/i, /\bspeaker/i, /\bmicrophone|\bmic\b/i, /\bdisplay\b/i, /\bclicker\b/i, /\bav\b/i, /\bdocument camera/i, /\bpodium/i],
    weight: 1.5,
  },
  {
    category: "FURNITURE",
    words: [/\bchair/i, /\bdesk\b/i, /\btable\b/i, /\bbed\b/i, /\bmattress/i, /\bdresser/i, /\bcouch/i, /\bsofa/i, /\bshel(f|ves)\b/i, /\bwardrobe/i, /\bblinds?\b/i],
  },
  {
    category: "DOORS_LOCKS",
    words: [/\bdoor/i, /\block(ed|s)?\b/i, /\bkey ?card/i, /\bbuzzcard/i, /\bwindow/i, /\bhinge/i, /\bcard reader/i, /\bhandle\b/i],
  },
  {
    category: "CLEANING",
    words: [/\bdirty\b/i, /\btrash\b/i, /\bgarbage/i, /\bspill/i, /\bmess\b/i, /\bsmell(s|y)?\b/i, /\broach/i, /\bcockroach/i, /\bmice\b|\bmouse\b/i, /\bants?\b/i, /\bpest/i, /\bbugs?\b/i, /\bmold/i, /\bvomit/i, /\bclean/i],
  },
  {
    category: "FOOD_SERVICE",
    words: [/\bdish (machine|return)/i, /\bice machine/i, /\bsoda/i, /\bfountain drink/i, /\bfryer/i, /\bserving line/i, /\bsalad bar/i, /\btray/i, /\bcoffee machine/i, /\bfreezer/i],
    weight: 1.5,
  },
  {
    category: "FITNESS",
    words: [/\btreadmill/i, /\belliptical/i, /\bbike\b/i, /\browing machine|\browers?\b/i, /\bweights?\b/i, /\bbench press/i, /\bsquat rack/i, /\bcable machine/i, /\bdumbbell/i, /\bpool\b/i, /\blocker/i],
    weight: 1.5,
  },
  {
    category: "STRUCTURAL",
    words: [/\bceiling/i, /\bwall\b/i, /\bfloor tile/i, /\bcrack/i, /\bhole in/i, /\bpaint/i, /\bcarpet/i, /\bstairs?\b/i, /\brailing/i, /\bplaster/i, /\broof/i],
  },
];

const URGENT_PATTERNS: RegExp[] = [
  /\bno (heat|hot water|power|water|ac|a\/c|air)\b/i,
  /\b(won'?t|doesn'?t|can'?t|cannot) (lock|close|flush)\b/i,
  /\bleak(ing)? (from|through) (the )?ceiling\b/i,
  /\bactive(ly)? leak/i,
  /\bpool(ing|ed|s)? (of water|on the floor)\b|\bwater (is )?pooling\b/i,
  /\b(leak|drip)\w* .{0,30}\bwon'?t stop\b/i,
  /\boverflow/i,
  /\bentire (floor|building|class)\b/i,
  /\bwhole (floor|building|class)\b/i,
  /\b(locked|stuck) out\b/i,
  /\bout of service\b/i,
  /\bbroken (window|lock)\b/i,
  /\bmold\b/i,
  /\b(roach|cockroach|mice|mouse|bed ?bugs?)\b/i,
  /\bexam\b|\bmidterm\b|\bfinals?\b/i,
];

const LOW_PATTERNS: RegExp[] = [
  /\bcosmetic\b/i,
  /\bscuff/i,
  /\bsqueak/i,
  /\bchipped\b/i,
  /\bwobbl/i,
  /\bloose\b/i,
  /\bminor\b/i,
  /\bwhen(ever)? you get a chance\b/i,
  /\bnot urgent\b/i,
  /\bpeeling\b/i,
  /\bstain(ed)?\b/i,
];

export type KeywordResult = {
  category: Category;
  severity: Severity;
  summary: string;
  rationale: string;
};

export function classifyByKeywords(description: string, context?: { assetType?: string | null }): KeywordResult {
  const text = description.trim();
  const scores = new Map<Category, number>();
  const hits: string[] = [];

  for (const rule of CATEGORY_RULES) {
    let s = 0;
    for (const w of rule.words) {
      const m = text.match(w);
      if (m) {
        s += rule.weight ?? 1;
        hits.push(m[0].toLowerCase());
      }
    }
    if (s > 0) scores.set(rule.category, s);
  }

  // A QR code on an asset is strong evidence of what the problem is about.
  const assetHint = assetCategory(context?.assetType);
  if (assetHint) scores.set(assetHint, (scores.get(assetHint) ?? 0) + 2);

  let category: Category = "OTHER";
  let best = 0;
  for (const [c, s] of scores) {
    if (s > best) {
      best = s;
      category = c;
    }
  }

  let severity: Severity = "STANDARD";
  if (URGENT_PATTERNS.some((p) => p.test(text))) severity = "URGENT";
  else if (LOW_PATTERNS.some((p) => p.test(text))) severity = "LOW";

  const uniqueHits = [...new Set(hits)].slice(0, 4);
  return {
    category,
    severity,
    summary: summarize(text, category),
    rationale: uniqueHits.length
      ? `Matched keywords: ${uniqueHits.join(", ")}`
      : "No strong keywords found; defaulted to a general request.",
  };
}

function assetCategory(type?: string | null): Category | null {
  switch (type) {
    case "PROJECTOR":
    case "DISPLAY":
      return "AV_TECH";
    case "WASHER":
    case "DRYER":
      return "APPLIANCE";
    case "ELEVATOR":
      return "ELEVATOR";
    case "TREADMILL":
    case "ELLIPTICAL":
      return "FITNESS";
    case "DISH_MACHINE":
    case "ICE_MACHINE":
      return "FOOD_SERVICE";
    case "ACCESS_POINT":
      return "NETWORK";
    default:
      return null;
  }
}

/** One-line summary: the first clause of the report, tidied, max ~80 characters. */
export function summarize(text: string, category: Category): string {
  const withoutGreeting = text.trim().replace(/^(hi|hello|hey)( there)?[,!.\s]+/i, "");
  const firstSentence = withoutGreeting.split(/(?<=[.!?])\s+|\n/)[0]?.trim() ?? "";
  let s = firstSentence.replace(/[.!?]+$/, "");
  if (s.length > 80) s = s.slice(0, 77).replace(/\s+\S*$/, "") + "…";
  if (!s) return CATEGORY_LABEL[category];
  return s.charAt(0).toUpperCase() + s.slice(1);
}
