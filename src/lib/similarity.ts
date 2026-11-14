// Lightweight text similarity for the duplicate check. Pure module.

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can cant could did do does doesnt dont for from get gets got has have " +
    "having i im in into is isnt it its just keeps like me my no not of on or our out over really so some still " +
    "that the their them then there these they this to too up very was wasnt we were what when where which while " +
    "who will with wont would you your again also all any been being both each few more most other own same " +
    "should than s t now here please hi hello thanks floor room building"
  ).split(" "),
);

// Fold common variants together so "leaking", "leaks" and "leaky" all match.
const SYNONYMS: Record<string, string> = {
  wifi: "wifi",
  "wi-fi": "wifi",
  internet: "wifi",
  eduroam: "wifi",
  network: "wifi",
  leaking: "leak",
  leaks: "leak",
  leaky: "leak",
  leaked: "leak",
  dripping: "leak",
  drip: "leak",
  drips: "leak",
  broken: "broken",
  busted: "broken",
  dead: "broken",
  "not working": "broken",
  projector: "projector",
  projectors: "projector",
  ac: "hvac",
  "a/c": "hvac",
  aircon: "hvac",
  heat: "hvac",
  heater: "hvac",
  heating: "hvac",
  cooling: "hvac",
  hot: "hvac",
  cold: "hvac",
  washer: "washer",
  washers: "washer",
  washing: "washer",
  dryer: "dryer",
  dryers: "dryer",
  toilets: "toilet",
  lights: "light",
  lighting: "light",
  bulb: "light",
  outlets: "outlet",
  doors: "door",
  elevators: "elevator",
  lift: "elevator",
  treadmills: "treadmill",
  dropping: "drop",
  drops: "drop",
  dropped: "drop",
  disconnecting: "drop",
  disconnects: "drop",
};

export function tokenize(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/wi-fi/g, "wifi")
    .replace(/a\/c/g, "ac")
    .replace(/not working/g, "broken")
    .replace(/[^a-z0-9\s]/g, " ");
  const out = new Set<string>();
  for (const raw of normalized.split(/\s+/)) {
    if (!raw || raw.length < 2 || STOPWORDS.has(raw)) continue;
    let w = SYNONYMS[raw] ?? raw;
    // crude stemming for words not in the synonym table
    if (!SYNONYMS[raw] && w.length > 4) w = w.replace(/(ing|ed|es|s)$/, "");
    out.add(w);
  }
  return out;
}

/** Jaccard similarity of the two token sets, 0–1. */
export function textSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}
