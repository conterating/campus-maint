// Sample data for the Ramblin’ Repairs demo. Building coordinates come from OpenStreetMap.
import type { Category, Department, Severity } from "@/lib/domain";

export type BuildingSeed = {
  id: string;
  code: string;
  name: string;
  kind: string;
  lat: number;
  lng: number;
  floors: number;
  address?: string;
};

export const BUILDINGS: BuildingSeed[] = [
  // Residence halls
  { id: "b-glenn", code: "GLN", name: "Glenn Residence Hall", kind: "RESIDENCE", lat: 33.7734348, lng: -84.3915531, floors: 4, address: "118 Bobby Dodd Way NW" },
  { id: "b-towers", code: "TWR", name: "Towers Residence Hall", kind: "RESIDENCE", lat: 33.7734301, lng: -84.3910575, floors: 4, address: "112 Bobby Dodd Way NW" },
  { id: "b-nae", code: "NAE", name: "North Avenue East Apartments", kind: "RESIDENCE", lat: 33.7694995, lng: -84.3909458, floors: 6, address: "120 North Ave NW" },
  { id: "b-woodruff", code: "WDS", name: "Woodruff South Residence Hall", kind: "RESIDENCE", lat: 33.7788601, lng: -84.4063566, floors: 5, address: "890 Curran St NW" },
  { id: "b-fitten", code: "FIT", name: "Fitten Hall", kind: "RESIDENCE", lat: 33.7782258, lng: -84.4037192, floors: 4, address: "855 McMillan St NW" },
  // Library and student center
  { id: "b-library", code: "LIB", name: "Price Gilbert Memorial Library", kind: "LIBRARY", lat: 33.7743977, lng: -84.3957785, floors: 5, address: "704 Cherry St NW" },
  { id: "b-jlsc", code: "JLSC", name: "John Lewis Student Center", kind: "STUDENT_CENTER", lat: 33.7741957, lng: -84.3988236, floors: 4, address: "350 Ferst Dr NW" },
  // Dining
  { id: "b-wv", code: "WV", name: "West Village Dining Commons", kind: "DINING", lat: 33.7793586, lng: -84.4048503, floors: 2, address: "8th St NW" },
  { id: "b-navd", code: "NAVD", name: "North Avenue Dining Hall", kind: "DINING", lat: 33.7710443, lng: -84.3913365, floors: 2, address: "North Ave NW" },
  { id: "b-brittain", code: "BRT", name: "Brittain Dining Hall", kind: "DINING", lat: 33.7724322, lng: -84.391313, floors: 2, address: "649 Techwood Dr NW" },
  // Recreation
  { id: "b-crc", code: "CRC", name: "Campus Recreation Center", kind: "RECREATION", lat: 33.7755327, lng: -84.4039597, floors: 3, address: "750 Ferst Dr NW" },
  // Classroom buildings
  { id: "b-klaus", code: "KACB", name: "Klaus Advanced Computing Building", kind: "ACADEMIC", lat: 33.7771562, lng: -84.3962024, floors: 4, address: "266 Ferst Dr NW" },
  { id: "b-culc", code: "CULC", name: "Clough Undergraduate Learning Commons", kind: "ACADEMIC", lat: 33.7746495, lng: -84.3964166, floors: 4, address: "266 4th St NW" },
  { id: "b-howey", code: "HOW", name: "Howey Physics Building", kind: "ACADEMIC", lat: 33.7774399, lng: -84.3986777, floors: 4, address: "800 Atlantic Dr NW" },
  { id: "b-skiles", code: "SKL", name: "Skiles Classroom Building", kind: "ACADEMIC", lat: 33.7735678, lng: -84.3959406, floors: 4, address: "686 Cherry St NW" },
];

export type SpaceSeed = { id: string; buildingId: string; floor: number | null; label: string; scope: "DORM_ROOM" | "DORM_SHARED" | "PUBLIC"; kind: string };

const room = (id: string, b: string, floor: number, label: string): SpaceSeed => ({ id, buildingId: b, floor, label, scope: "DORM_ROOM", kind: "room" });
const shared = (id: string, b: string, floor: number | null, label: string, kind: string): SpaceSeed => ({ id, buildingId: b, floor, label, scope: "DORM_SHARED", kind });
const pub = (id: string, b: string, floor: number | null, label: string, kind: string): SpaceSeed => ({ id, buildingId: b, floor, label, scope: "PUBLIC", kind });

export const SPACES: SpaceSeed[] = [
  room("s-gln-214", "b-glenn", 2, "Room 214"),
  room("s-gln-216", "b-glenn", 2, "Room 216"),
  room("s-gln-309", "b-glenn", 3, "Room 309"),
  shared("s-gln-2hall", "b-glenn", 2, "2nd floor hallway", "hallway"),
  shared("s-gln-2bath", "b-glenn", 2, "2nd floor bathroom", "bathroom"),
  shared("s-gln-3bath", "b-glenn", 3, "3rd floor bathroom", "bathroom"),
  shared("s-gln-lounge", "b-glenn", 1, "Lobby lounge", "lounge"),
  shared("s-gln-laundry", "b-glenn", 0, "Basement laundry room", "laundry"),

  room("s-twr-305", "b-towers", 3, "Room 305"),
  room("s-twr-112", "b-towers", 1, "Room 112"),
  shared("s-twr-3hall", "b-towers", 3, "3rd floor hallway", "hallway"),
  shared("s-twr-3bath", "b-towers", 3, "3rd floor bathroom", "bathroom"),
  shared("s-twr-lobby", "b-towers", 1, "Lobby", "lounge"),
  shared("s-twr-laundry", "b-towers", 1, "Laundry room", "laundry"),

  room("s-nae-504", "b-nae", 5, "Apartment 504"),
  room("s-nae-311", "b-nae", 3, "Apartment 311"),
  shared("s-nae-5hall", "b-nae", 5, "5th floor hallway", "hallway"),
  shared("s-nae-lounge", "b-nae", 2, "Study lounge", "lounge"),
  shared("s-nae-laundry", "b-nae", 1, "Laundry room", "laundry"),

  room("s-wds-221", "b-woodruff", 2, "Room 221"),
  shared("s-wds-lounge", "b-woodruff", 2, "2nd floor lounge", "lounge"),
  shared("s-wds-laundry", "b-woodruff", 1, "Laundry room", "laundry"),

  room("s-fit-118", "b-fitten", 1, "Room 118"),
  shared("s-fit-1bath", "b-fitten", 1, "1st floor bathroom", "bathroom"),
  shared("s-fit-laundry", "b-fitten", 0, "Laundry room", "laundry"),

  pub("s-lib-entry", "b-library", 1, "Main entrance", "lobby"),
  pub("s-lib-1rest", "b-library", 1, "1st floor restrooms", "restroom"),
  pub("s-lib-2study", "b-library", 2, "2nd floor quiet study", "study"),
  pub("s-lib-grp3e", "b-library", 3, "Group study room 3E", "study"),

  pub("s-jlsc-food", "b-jlsc", 1, "Food court", "dining"),
  pub("s-jlsc-commons", "b-jlsc", 1, "Commons lounge", "lounge"),
  pub("s-jlsc-2rest", "b-jlsc", 2, "2nd floor restrooms", "restroom"),

  pub("s-wv-line", "b-wv", 1, "Serving line", "dining"),
  pub("s-wv-dish", "b-wv", 1, "Dish return", "dining"),
  pub("s-wv-dining", "b-wv", 1, "Dining room", "dining"),

  pub("s-navd-dining", "b-navd", 1, "Dining room", "dining"),
  pub("s-navd-bev", "b-navd", 1, "Beverage station", "dining"),

  pub("s-brt-dining", "b-brittain", 1, "Main dining room", "dining"),
  pub("s-brt-rest", "b-brittain", 1, "Restrooms", "restroom"),

  pub("s-crc-cardio", "b-crc", 2, "Cardio deck", "gym"),
  pub("s-crc-weights", "b-crc", 1, "Weight room", "gym"),
  pub("s-crc-lockerm", "b-crc", 1, "Men's locker room", "locker room"),
  pub("s-crc-pool", "b-crc", 0, "Natatorium", "pool"),

  pub("s-klaus-1443", "b-klaus", 1, "Room 1443", "classroom"),
  pub("s-klaus-1456", "b-klaus", 1, "Room 1456", "classroom"),
  pub("s-klaus-atrium", "b-klaus", 1, "Atrium", "lobby"),

  pub("s-culc-152", "b-culc", 1, "Room 152", "classroom"),
  pub("s-culc-144", "b-culc", 1, "Room 144", "classroom"),
  pub("s-culc-3study", "b-culc", 3, "3rd floor study area", "study"),

  pub("s-howey-l1", "b-howey", 1, "Lecture hall L1", "classroom"),
  pub("s-howey-l2", "b-howey", 1, "Lecture hall L2", "classroom"),

  pub("s-skiles-249", "b-skiles", 2, "Room 249", "classroom"),
  pub("s-skiles-rest", "b-skiles", 1, "1st floor restrooms", "restroom"),
];

export type AssetSeed = { id: string; buildingId: string; spaceId: string | null; name: string; type: string; tag: string };

export const ASSETS: AssetSeed[] = [
  { id: "a-gln-elev", buildingId: "b-glenn", spaceId: null, name: "Glenn elevator", type: "ELEVATOR", tag: "GLN-ELV-1" },
  { id: "a-gln-w3", buildingId: "b-glenn", spaceId: "s-gln-laundry", name: "Washer 3", type: "WASHER", tag: "GLN-WSH-03" },
  { id: "a-gln-d2", buildingId: "b-glenn", spaceId: "s-gln-laundry", name: "Dryer 2", type: "DRYER", tag: "GLN-DRY-02" },
  { id: "a-twr-w1", buildingId: "b-towers", spaceId: "s-twr-laundry", name: "Washer 1", type: "WASHER", tag: "TWR-WSH-01" },
  { id: "a-twr-elev", buildingId: "b-towers", spaceId: null, name: "Towers elevator", type: "ELEVATOR", tag: "TWR-ELV-1" },
  { id: "a-nae-elev", buildingId: "b-nae", spaceId: null, name: "Elevator A", type: "ELEVATOR", tag: "NAE-ELV-A" },
  { id: "a-lib-elev", buildingId: "b-library", spaceId: null, name: "Library elevator", type: "ELEVATOR", tag: "LIB-ELV-1" },
  { id: "a-lib-ap2e", buildingId: "b-library", spaceId: "s-lib-2study", name: "Wi-Fi access point 2-East", type: "ACCESS_POINT", tag: "LIB-AP-2E" },
  { id: "a-jlsc-ice", buildingId: "b-jlsc", spaceId: "s-jlsc-food", name: "Ice machine", type: "ICE_MACHINE", tag: "JLSC-ICE-1" },
  { id: "a-wv-dish", buildingId: "b-wv", spaceId: "s-wv-dish", name: "Dish machine", type: "DISH_MACHINE", tag: "WV-DSH-1" },
  { id: "a-crc-tm07", buildingId: "b-crc", spaceId: "s-crc-cardio", name: "Treadmill 7", type: "TREADMILL", tag: "CRC-TRD-07" },
  { id: "a-crc-tm12", buildingId: "b-crc", spaceId: "s-crc-cardio", name: "Treadmill 12", type: "TREADMILL", tag: "CRC-TRD-12" },
  { id: "a-klaus-1443", buildingId: "b-klaus", spaceId: "s-klaus-1443", name: "Room 1443 projector", type: "PROJECTOR", tag: "KACB-PRJ-1443" },
  { id: "a-klaus-elev", buildingId: "b-klaus", spaceId: null, name: "Klaus elevator", type: "ELEVATOR", tag: "KACB-ELV-1" },
  { id: "a-culc-152", buildingId: "b-culc", spaceId: "s-culc-152", name: "Room 152 projector", type: "PROJECTOR", tag: "CULC-PRJ-152" },
  { id: "a-howey-l1", buildingId: "b-howey", spaceId: "s-howey-l1", name: "L1 projector", type: "PROJECTOR", tag: "HOW-PRJ-L1" },
  { id: "a-skiles-249", buildingId: "b-skiles", spaceId: "s-skiles-249", name: "Room 249 projector", type: "PROJECTOR", tag: "SKL-PRJ-249" },
];

export type UserSeed = {
  id: string;
  name: string;
  email: string;
  role: "STUDENT" | "STAFF" | "ADMIN";
  department?: Department;
  isSupervisor?: boolean;
  residenceBuildingId?: string;
  roomId?: string;
  avatarHue: number;
  title?: string;
};

export const USERS: UserSeed[] = [
  // Students
  { id: "u-maya", name: "Maya Patel", email: "maya.patel@ramblinrepairs.test", role: "STUDENT", residenceBuildingId: "b-glenn", roomId: "s-gln-214", avatarHue: 340 },
  { id: "u-jordan", name: "Jordan Lee", email: "jordan.lee@ramblinrepairs.test", role: "STUDENT", residenceBuildingId: "b-glenn", roomId: "s-gln-214", avatarHue: 200 },
  { id: "u-ethan", name: "Ethan Brooks", email: "ethan.brooks@ramblinrepairs.test", role: "STUDENT", residenceBuildingId: "b-glenn", roomId: "s-gln-309", avatarHue: 120 },
  { id: "u-sam", name: "Sam Okoro", email: "sam.okoro@ramblinrepairs.test", role: "STUDENT", residenceBuildingId: "b-towers", roomId: "s-twr-305", avatarHue: 30 },
  { id: "u-priya", name: "Priya Raman", email: "priya.raman@ramblinrepairs.test", role: "STUDENT", residenceBuildingId: "b-nae", roomId: "s-nae-504", avatarHue: 280 },
  { id: "u-chloe", name: "Chloe Nguyen", email: "chloe.nguyen@ramblinrepairs.test", role: "STUDENT", residenceBuildingId: "b-woodruff", roomId: "s-wds-221", avatarHue: 10 },
  { id: "u-diego", name: "Diego Alvarez", email: "diego.alvarez@ramblinrepairs.test", role: "STUDENT", residenceBuildingId: "b-fitten", roomId: "s-fit-118", avatarHue: 170 },
  { id: "u-alex", name: "Alex Kim", email: "alex.kim@ramblinrepairs.test", role: "STUDENT", avatarHue: 240 },
  // Staff: a technician and a supervisor for each department
  { id: "u-terrence", name: "Terrence Wallace", email: "t.wallace@ramblinrepairs.test", role: "STAFF", department: "HOUSING", avatarHue: 25, title: "Maintenance technician" },
  { id: "u-linda", name: "Linda Okafor", email: "l.okafor@ramblinrepairs.test", role: "STAFF", department: "HOUSING", isSupervisor: true, avatarHue: 300, title: "Maintenance supervisor" },
  { id: "u-marcus", name: "Marcus Bell", email: "m.bell@ramblinrepairs.test", role: "STAFF", department: "FACILITIES", avatarHue: 190, title: "Facilities technician" },
  { id: "u-rosa", name: "Rosa Delgado", email: "r.delgado@ramblinrepairs.test", role: "STAFF", department: "FACILITIES", isSupervisor: true, avatarHue: 0, title: "Facilities supervisor" },
  { id: "u-kevin", name: "Kevin Tran", email: "k.tran@ramblinrepairs.test", role: "STAFF", department: "IT", avatarHue: 220, title: "Support technician" },
  { id: "u-aisha", name: "Aisha Rahman", email: "a.rahman@ramblinrepairs.test", role: "STAFF", department: "IT", isSupervisor: true, avatarHue: 260, title: "Support supervisor" },
  { id: "u-brenda", name: "Brenda Hollis", email: "b.hollis@ramblinrepairs.test", role: "STAFF", department: "DINING", avatarHue: 45, title: "Dining operations" },
  { id: "u-omar", name: "Omar Haddad", email: "o.haddad@ramblinrepairs.test", role: "STAFF", department: "DINING", isSupervisor: true, avatarHue: 150, title: "Dining supervisor" },
  { id: "u-grace", name: "Grace Liu", email: "g.liu@ramblinrepairs.test", role: "STAFF", department: "LIBRARY", avatarHue: 320, title: "Library facilities" },
  { id: "u-henry", name: "Henry Osei", email: "h.osei@ramblinrepairs.test", role: "STAFF", department: "LIBRARY", isSupervisor: true, avatarHue: 90, title: "Library supervisor" },
  { id: "u-tasha", name: "Tasha Green", email: "t.green@ramblinrepairs.test", role: "STAFF", department: "RECREATION", avatarHue: 110, title: "Recreation facilities" },
  { id: "u-paul", name: "Paul Fischer", email: "p.fischer@ramblinrepairs.test", role: "STAFF", department: "RECREATION", isSupervisor: true, avatarHue: 205, title: "Recreation supervisor" },
  // Administrator
  { id: "u-elena", name: "Elena Vasquez", email: "e.vasquez@ramblinrepairs.test", role: "ADMIN", avatarHue: 55, title: "Director, Campus Services" },
];

/** Something that happens to a ticket, `t` hours after it was created. */
export type Step =
  | { t: number; do: "assign"; note?: string }
  | { t: number; do: "start"; note?: string }
  | { t: number; do: "resolve"; note?: string }
  | { t: number; do: "confirm" }
  | { t: number; do: "reopen"; reason: string }
  | { t: number; do: "note"; text: string; internal?: boolean }
  | { t: number; do: "metoo"; who: string }
  | { t: number; do: "reassign"; dept: Department; reason: string }
  | { t: number; do: "override"; sev?: Severity; cat?: Category; reason: string };

export type TicketSeed = {
  b: string;
  s?: string;
  a?: string;
  by: string;
  desc: string;
  sum: string;
  cat: Category;
  sev: Severity;
  /** What the AI said, when the reporter corrected it. */
  ai?: { cat?: Category; sev?: Severity };
  /** Hours before "now" that it was reported. */
  age: number;
  steps?: Step[];
  /** Leave in Submitted, as if it arrived while triage was offline. */
  untriaged?: boolean;
};

export const TICKETS: TicketSeed[] = [
  // ---- Glenn ----
  {
    b: "b-glenn", s: "s-gln-214", by: "u-maya", age: 410, cat: "FURNITURE", sev: "LOW",
    desc: "The top desk drawer came off its track and won't slide back in.", sum: "Desk drawer off its track in Glenn 214",
    steps: [{ t: 20, do: "assign" }, { t: 60, do: "start" }, { t: 70, do: "resolve", note: "Replaced the drawer slide." }, { t: 80, do: "confirm" }],
  },
  {
    b: "b-glenn", s: "s-gln-2bath", by: "u-jordan", age: 30, cat: "PLUMBING", sev: "STANDARD",
    desc: "Two of the shower heads in the 2nd floor bathroom barely drip. No water pressure at all.", sum: "Two showers with no pressure, Glenn 2nd floor bathroom",
    steps: [{ t: 1, do: "metoo", who: "u-maya" }, { t: 4, do: "metoo", who: "u-ethan" }, { t: 6, do: "assign" }, { t: 22, do: "start", note: "Ordered replacement cartridges; parts arrive tomorrow." }],
  },
  {
    b: "b-glenn", s: "s-gln-laundry", a: "a-gln-w3", by: "u-ethan", age: 20, cat: "APPLIANCE", sev: "STANDARD",
    desc: "Washer 3 stops mid-cycle and won't drain. Clothes are left sitting in water.", sum: "Washer 3 stops mid-cycle and won't drain",
    steps: [{ t: 2, do: "metoo", who: "u-maya" }, { t: 5, do: "metoo", who: "u-jordan" }, { t: 10, do: "assign" }],
  },
  {
    b: "b-glenn", s: "s-gln-laundry", a: "a-gln-w3", by: "u-jordan", age: 900, cat: "APPLIANCE", sev: "STANDARD",
    desc: "Washer 3 is leaking water from the door seal onto the floor.", sum: "Washer 3 leaking from the door seal",
    steps: [{ t: 8, do: "assign" }, { t: 30, do: "start" }, { t: 40, do: "resolve", note: "Replaced door gasket." }, { t: 50, do: "confirm" }],
  },
  {
    b: "b-glenn", s: "s-gln-laundry", a: "a-gln-w3", by: "u-maya", age: 520, cat: "APPLIANCE", sev: "STANDARD",
    desc: "Washer 3 takes my card payment but never starts.", sum: "Washer 3 charges but won't start",
    steps: [{ t: 30, do: "assign" }, { t: 50, do: "start" }, { t: 60, do: "resolve", note: "Reset the controller board." }, { t: 75, do: "confirm" }],
  },
  {
    b: "b-glenn", a: "a-gln-elev", by: "u-ethan", age: 7, cat: "ELEVATOR", sev: "URGENT",
    desc: "The elevator makes a loud grinding noise between floors 2 and 3 and shakes.", sum: "Glenn elevator grinding and shaking between floors 2–3",
    steps: [{ t: 0.5, do: "metoo", who: "u-jordan" }],
  },
  {
    b: "b-glenn", s: "s-gln-lounge", by: "u-jordan", age: 0.3, cat: "AV_TECH", sev: "LOW", untriaged: true,
    desc: "The TV in the lobby lounge shows 'no signal' on every input.", sum: "Lobby lounge TV shows no signal",
  },
  {
    b: "b-glenn", s: "s-gln-3bath", by: "u-ethan", age: 50, cat: "PLUMBING", sev: "LOW",
    desc: "Toilet in the far stall keeps running after flushing.", sum: "Running toilet, far stall, Glenn 3rd floor bathroom",
  },

  // ---- Towers ----
  {
    b: "b-towers", s: "s-twr-305", by: "u-sam", age: 5, cat: "HVAC", sev: "URGENT",
    desc: "AC only blows warm air. My room is 82°F and I can't sleep.", sum: "AC blowing warm air, Towers 305 at 82°F",
    steps: [{ t: 2, do: "assign", note: "Coming by this afternoon to check the unit." }],
  },
  {
    b: "b-towers", s: "s-twr-laundry", a: "a-twr-w1", by: "u-sam", age: 60, cat: "APPLIANCE", sev: "STANDARD",
    desc: "Washer 1 has had an out-of-order sign on it for a week.", sum: "Washer 1 out of order for a week",
  },
  {
    b: "b-towers", s: "s-twr-3hall", by: "u-sam", age: 72, cat: "ELECTRICAL", sev: "STANDARD",
    desc: "The hallway lights flicker constantly near the stairwell. Gives me a headache.", sum: "Hallway lights flickering by the stairwell, Towers 3rd floor",
    steps: [{ t: 20, do: "assign" }, { t: 50, do: "start" }, { t: 68, do: "resolve", note: "Replaced two ballasts. Let us know if it's still flickering." }],
  },

  // ---- North Avenue East ----
  {
    b: "b-nae", s: "s-nae-504", by: "u-priya", age: 10, cat: "DOORS_LOCKS", sev: "URGENT",
    desc: "My bedroom window won't latch shut, so I can't lock it at night.", sum: "Bedroom window won't latch, NAE 504",
    steps: [{ t: 1.5, do: "assign" }, { t: 4, do: "start", note: "Latch is broken; replacement part ordered." }],
  },
  {
    b: "b-nae", s: "s-nae-5hall", by: "u-priya", age: 120, cat: "OTHER", sev: "EMERGENCY",
    desc: "Strong smell of gas near the 5th floor trash chute.", sum: "Gas smell near the 5th floor trash chute",
    steps: [{ t: 0.3, do: "assign", note: "On the way. Please stay away from the chute." }, { t: 0.6, do: "start" }, { t: 2, do: "resolve", note: "Odor traced to a discarded propane canister. Removed; area ventilated and cleared." }, { t: 3, do: "confirm" }],
  },
  {
    b: "b-nae", s: "s-nae-laundry", by: "u-priya", age: 26, cat: "APPLIANCE", sev: "STANDARD",
    desc: "Two of the dryers run but don't heat up at all.", sum: "Two dryers not heating, NAE laundry room",
  },

  // ---- Woodruff South ----
  {
    b: "b-woodruff", s: "s-wds-221", by: "u-chloe", age: 200, cat: "CLEANING", sev: "URGENT",
    desc: "Black mold spots spreading on the bathroom ceiling.", sum: "Mold spots on bathroom ceiling, Woodruff 221",
    steps: [{ t: 3, do: "assign" }, { t: 20, do: "start" }, { t: 48, do: "resolve", note: "Treated and repainted the ceiling." }, { t: 199, do: "reopen", reason: "The spots are coming back above the shower." }],
  },
  {
    b: "b-woodruff", s: "s-wds-laundry", by: "u-chloe", age: 40, cat: "APPLIANCE", sev: "STANDARD",
    desc: "The card readers on the laundry machines aren't accepting BuzzCard.", sum: "Laundry card readers rejecting BuzzCard, Woodruff",
    steps: [{ t: 6, do: "reassign", dept: "IT", reason: "Card readers are on the BuzzCard network — IT owns these." }, { t: 30, do: "assign" }],
  },

  // ---- Fitten ----
  {
    b: "b-fitten", s: "s-fit-118", by: "u-diego", age: 2, cat: "ELECTRICAL", sev: "EMERGENCY",
    desc: "The outlet by my desk sparks when I plug in my charger. There's a burn mark on the cover.", sum: "Outlet sparking with burn mark, Fitten 118",
    steps: [{ t: 0.4, do: "assign", note: "Turned off the breaker for that circuit. Don't use the outlet." }, { t: 0.9, do: "start" }],
  },
  {
    b: "b-fitten", s: "s-fit-1bath", by: "u-diego", age: 300, cat: "PLUMBING", sev: "STANDARD",
    desc: "Sink is clogged and draining very slowly.", sum: "Slow sink drain, Fitten 1st floor bathroom",
    steps: [{ t: 12, do: "assign" }, { t: 20, do: "start" }, { t: 30, do: "resolve" }, { t: 40, do: "confirm" }],
  },

  // ---- Library (public) ----
  {
    b: "b-library", s: "s-lib-2study", by: "u-alex", age: 28, cat: "NETWORK", sev: "STANDARD",
    desc: "Wi-Fi keeps dropping in the 2nd floor quiet study area. Eduroam disconnects every few minutes.", sum: "Wi-Fi dropping every few minutes, library 2nd floor quiet study",
    steps: [
      { t: 1, do: "metoo", who: "u-maya" },
      { t: 2, do: "metoo", who: "u-sam" },
      { t: 2.5, do: "metoo", who: "u-priya" },
      { t: 3, do: "assign" },
      { t: 5, do: "start", note: "Access point 2-East is rebooting under load. Replacement scheduled." },
      { t: 9, do: "metoo", who: "u-chloe" },
      { t: 14, do: "metoo", who: "u-diego" },
    ],
  },
  {
    b: "b-library", s: "s-lib-1rest", by: "u-chloe", age: 150, cat: "CLEANING", sev: "STANDARD",
    desc: "Paper towel dispensers are empty and the trash is overflowing.", sum: "Empty towel dispensers, overflowing trash, library restrooms",
    steps: [{ t: 60, do: "assign" }, { t: 61, do: "resolve" }, { t: 70, do: "confirm" }],
  },
  {
    b: "b-library", a: "a-lib-elev", by: "u-diego", age: 3, cat: "ELEVATOR", sev: "URGENT",
    desc: "The library elevator is out of service, so people who can't use stairs can't reach floors 2–5.", sum: "Library elevator out of service; floors 2–5 inaccessible",
    steps: [{ t: 0.4, do: "metoo", who: "u-chloe" }, { t: 0.7, do: "metoo", who: "u-priya" }, { t: 1, do: "assign", note: "Elevator contractor dispatched." }],
  },
  {
    b: "b-library", s: "s-lib-grp3e", by: "u-sam", age: 70, cat: "FURNITURE", sev: "LOW", ai: { cat: "OTHER" },
    desc: "One of the chairs in group study room 3E has a broken wheel and tips over.", sum: "Chair with a broken wheel, library room 3E",
  },
  {
    b: "b-library", s: "s-lib-entry", by: "u-alex", age: 9, cat: "DOORS_LOCKS", sev: "URGENT",
    desc: "The accessible door opener button at the main entrance does nothing.", sum: "Accessible door opener broken at library main entrance",
    steps: [{ t: 1, do: "metoo", who: "u-sam" }],
  },

  // ---- John Lewis Student Center ----
  {
    b: "b-jlsc", s: "s-jlsc-food", a: "a-jlsc-ice", by: "u-maya", age: 22, cat: "FOOD_SERVICE", sev: "STANDARD",
    desc: "The ice machine at the food court is leaking onto the floor and it's slippery.", sum: "Ice machine leaking, slippery floor, food court",
    steps: [{ t: 2, do: "assign" }, { t: 3, do: "start", note: "Put down wet-floor signs; technician booked." }],
  },
  {
    b: "b-jlsc", s: "s-jlsc-2rest", by: "u-alex", age: 15, cat: "ELECTRICAL", sev: "LOW",
    desc: "Hand dryer in the 2nd floor restroom doesn't turn on.", sum: "Hand dryer not working, 2nd floor restroom",
  },
  {
    b: "b-jlsc", s: "s-jlsc-commons", by: "u-priya", age: 30, cat: "ELECTRICAL", sev: "LOW",
    desc: "Several outlets along the long study table in the commons are dead.", sum: "Dead outlets at the long study table, commons",
    steps: [{ t: 3, do: "metoo", who: "u-maya" }, { t: 6, do: "metoo", who: "u-sam" }, { t: 9, do: "metoo", who: "u-diego" }, { t: 25, do: "assign" }],
  },

  // ---- Dining ----
  {
    b: "b-wv", s: "s-wv-dish", a: "a-wv-dish", by: "u-chloe", age: 30, cat: "FOOD_SERVICE", sev: "URGENT",
    desc: "The dish return conveyor stopped and trays are piling up.", sum: "Dish return conveyor stopped, trays piling up",
    steps: [{ t: 1, do: "assign" }, { t: 2, do: "start" }, { t: 6, do: "resolve", note: "Motor belt replaced." }],
  },
  {
    b: "b-wv", s: "s-wv-dining", by: "u-diego", age: 40, cat: "STRUCTURAL", sev: "STANDARD",
    desc: "A ceiling tile above the tables by the windows is stained and sagging.", sum: "Stained, sagging ceiling tile by the windows",
  },
  {
    b: "b-navd", s: "s-navd-bev", by: "u-priya", age: 600, cat: "FOOD_SERVICE", sev: "LOW",
    desc: "Soda fountain only dispenses carbonated water, no syrup.", sum: "Soda fountain dispensing only carbonated water",
    steps: [{ t: 130, do: "assign" }, { t: 132, do: "resolve" }, { t: 140, do: "confirm" }],
  },
  {
    b: "b-navd", s: "s-navd-dining", by: "u-sam", age: 55, cat: "ELECTRICAL", sev: "STANDARD",
    desc: "The lights are out over the back half of the dining room.", sum: "Lights out over the back half of the dining room",
    steps: [{ t: 4, do: "metoo", who: "u-priya" }],
  },
  {
    b: "b-brittain", s: "s-brt-rest", by: "u-sam", age: 260, cat: "PLUMBING", sev: "URGENT",
    desc: "Toilet overflowing in the men's restroom.", sum: "Overflowing toilet, men's restroom",
    steps: [{ t: 0.8, do: "assign" }, { t: 1, do: "start" }, { t: 3, do: "resolve" }, { t: 6, do: "confirm" }],
  },

  // ---- Campus Recreation Center ----
  {
    b: "b-crc", s: "s-crc-cardio", a: "a-crc-tm12", by: "u-alex", age: 18, cat: "FITNESS", sev: "STANDARD",
    desc: "Treadmill 12's belt slips and jerks when you run on it.", sum: "Treadmill 12 belt slipping and jerking",
    steps: [{ t: 1, do: "metoo", who: "u-sam" }, { t: 2, do: "metoo", who: "u-diego" }, { t: 2.5, do: "metoo", who: "u-chloe" }, { t: 3, do: "assign", note: "Marked out of order until the belt is replaced." }],
  },
  {
    b: "b-crc", s: "s-crc-cardio", a: "a-crc-tm07", by: "u-diego", age: 700, cat: "FITNESS", sev: "LOW",
    desc: "Treadmill 7's display is dead.", sum: "Treadmill 7 display dead",
    steps: [{ t: 30, do: "assign" }, { t: 90, do: "resolve" }, { t: 100, do: "confirm" }],
  },
  {
    b: "b-crc", s: "s-crc-cardio", a: "a-crc-tm12", by: "u-sam", age: 1000, cat: "FITNESS", sev: "LOW",
    desc: "Emergency stop clip is missing from treadmill 12.", sum: "Treadmill 12 missing its emergency stop clip",
    steps: [{ t: 10, do: "assign" }, { t: 12, do: "resolve" }, { t: 20, do: "confirm" }],
  },
  {
    b: "b-crc", s: "s-crc-cardio", a: "a-crc-tm12", by: "u-chloe", age: 380, cat: "FITNESS", sev: "STANDARD",
    desc: "Treadmill 12 speed buttons are unresponsive.", sum: "Treadmill 12 speed buttons unresponsive",
    steps: [{ t: 52, do: "assign" }, { t: 60, do: "resolve" }, { t: 66, do: "confirm" }],
  },
  {
    b: "b-crc", s: "s-crc-lockerm", by: "u-diego", age: 6, cat: "PLUMBING", sev: "URGENT",
    desc: "Shower drain in the men's locker room is backed up with standing water.", sum: "Backed-up shower drain, men's locker room",
    steps: [{ t: 2, do: "assign" }, { t: 3, do: "start" }],
  },
  {
    b: "b-crc", s: "s-crc-pool", by: "u-chloe", age: 12, cat: "ELECTRICAL", sev: "STANDARD",
    desc: "Lights over the pool deck are flickering on and off.", sum: "Pool deck lights flickering",
    steps: [{ t: 2, do: "override", sev: "LOW", reason: "Only two fixtures affected; pool remains open." }],
  },

  // ---- Klaus ----
  {
    b: "b-klaus", s: "s-klaus-1443", a: "a-klaus-1443", by: "u-jordan", age: 4, cat: "AV_TECH", sev: "URGENT",
    desc: "The projector in 1443 has a purple tint and the slides are unreadable.", sum: "Room 1443 projector purple tint, slides unreadable",
    steps: [{ t: 0.3, do: "metoo", who: "u-alex" }, { t: 0.5, do: "metoo", who: "u-maya" }, { t: 1, do: "assign" }, { t: 1.5, do: "start" }],
  },
  {
    b: "b-klaus", s: "s-klaus-1443", a: "a-klaus-1443", by: "u-alex", age: 500, cat: "AV_TECH", sev: "STANDARD",
    desc: "The 1443 projector won't pick up a laptop over HDMI.", sum: "Room 1443 projector not detecting HDMI",
    steps: [{ t: 55, do: "assign" }, { t: 56, do: "resolve", note: "Replaced the HDMI wall plate." }, { t: 70, do: "confirm" }],
  },
  {
    b: "b-klaus", s: "s-klaus-1443", a: "a-klaus-1443", by: "u-maya", age: 1200, cat: "AV_TECH", sev: "URGENT",
    desc: "The projector bulb in 1443 burned out right before a lecture.", sum: "Room 1443 projector bulb burned out",
    steps: [{ t: 1, do: "assign" }, { t: 3, do: "resolve" }, { t: 5, do: "confirm" }],
  },
  {
    b: "b-klaus", s: "s-klaus-atrium", by: "u-sam", age: 100, cat: "NETWORK", sev: "STANDARD",
    desc: "Wi-Fi is very slow in the atrium during the lunch rush.", sum: "Slow Wi-Fi in the Klaus atrium at lunch",
    steps: [{ t: 30, do: "assign" }, { t: 60, do: "start" }, { t: 90, do: "resolve", note: "Added a second access point." }],
  },

  // ---- Clough (CULC) ----
  {
    b: "b-culc", s: "s-culc-152", a: "a-culc-152", by: "u-ethan", age: 30, cat: "AV_TECH", sev: "LOW",
    desc: "The projector fan in 152 is extremely loud during lectures.", sum: "Loud projector fan, CULC 152",
  },
  {
    b: "b-culc", s: "s-culc-3study", by: "u-alex", age: 8, cat: "HVAC", sev: "STANDARD",
    desc: "Heat isn't working. The 3rd floor study area is freezing.", sum: "No heat in the CULC 3rd floor study area",
    steps: [{ t: 0.5, do: "metoo", who: "u-jordan" }, { t: 1, do: "metoo", who: "u-ethan" }, { t: 1.5, do: "metoo", who: "u-chloe" }, { t: 2, do: "metoo", who: "u-priya" }, { t: 3, do: "assign" }],
  },

  // ---- Howey ----
  {
    b: "b-howey", s: "s-howey-l1", by: "u-diego", age: 90, cat: "FURNITURE", sev: "LOW",
    desc: "Several seats in row F of L1 have broken writing tablets.", sum: "Broken writing tablets, row F, Howey L1",
    steps: [{ t: 60, do: "assign" }],
  },
  {
    b: "b-howey", s: "s-howey-l2", by: "u-priya", age: 48, cat: "AV_TECH", sev: "URGENT",
    desc: "The lecture microphone in L2 cuts out every few seconds.", sum: "Lecture mic cutting out, Howey L2",
    steps: [{ t: 2, do: "assign" }, { t: 4, do: "start" }, { t: 30, do: "resolve", note: "Swapped the wireless receiver." }],
  },

  // ---- Skiles ----
  {
    // Demo: due in 45 minutes. Fast-forward one hour to watch it escalate.
    b: "b-skiles", s: "s-skiles-249", a: "a-skiles-249", by: "u-alex", age: 3.25, cat: "AV_TECH", sev: "URGENT",
    desc: "The projector in room 249 won't turn on. Our class meets here at 2pm every day.", sum: "Room 249 projector won't turn on before 2pm class",
  },
  {
    b: "b-skiles", s: "s-skiles-rest", by: "u-jordan", age: 10, cat: "PLUMBING", sev: "STANDARD",
    desc: "The water fountain outside the restrooms is leaking at the base.", sum: "Water fountain leaking at the base, Skiles 1st floor",
  },
];
