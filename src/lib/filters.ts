export type AudienceFilters = {
  district: string | null;
  exact: boolean;
  party: string[];
  age: string[];
  sex: string[];
  race: string[];
};

export const PARTY_OPTIONS = [
  { key: "D", label: "Dem" },
  { key: "R", label: "Rep" },
  { key: "I", label: "Ind" },
  { key: "U", label: "Not stated" },
];
export const AGE_OPTIONS = ["18-29", "30-44", "45-64", "65+", "unknown"];
export const SEX_OPTIONS = [
  { key: "f", label: "Women" },
  { key: "m", label: "Men" },
  { key: "x", label: "X on ID" },
  { key: "unknown", label: "Not collected" },
];
export const RACE_OPTIONS = ["White", "Hispanic", "Black", "Asian", "Other", "unknown"];

export const CATEGORY_LABEL: Record<string, string> = {
  clim: "Climate and environment",
  econ: "Economy",
  edu: "Education",
  heal: "Healthcare",
  hous: "Housing",
  immi: "Immigration",
  nyc: "New York City",
  pulse: "National pulse",
  safe: "Public safety",
  tech: "Technology",
  trans: "Transportation",
};

export function categoryLabel(code: string | null): string {
  if (!code) return "Other";
  return CATEGORY_LABEL[code] ?? code.charAt(0).toUpperCase() + code.slice(1);
}

export function districtLabel(id: string): string {
  if (id === "nyc") return "New York City";
  if (id === "us") return "United States";
  if (id.includes("-cc-")) return `Council District ${id.split("-cc-")[1]}`;
  return id;
}

export function parseAudience(sp: {
  d?: string;
  exact?: string;
  party?: string;
  age?: string;
  sex?: string;
  race?: string;
}): AudienceFilters {
  const list = (v?: string) => (v ? v.split(",").filter(Boolean) : []);
  return {
    district: sp.d || null,
    exact: sp.exact === "1",
    party: list(sp.party),
    age: list(sp.age),
    sex: list(sp.sex),
    race: list(sp.race),
  };
}

export function hasAudienceFilters(f: AudienceFilters): boolean {
  return Boolean(
    f.district ||
      f.party.length ||
      f.age.length ||
      f.sex.length ||
      f.race.length
  );
}
