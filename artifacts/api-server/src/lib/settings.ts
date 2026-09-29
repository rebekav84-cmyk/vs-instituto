import { db, settings } from "@workspace/db";

export type SalonSettings = {
  name: string;
  whatsapp: string;
  address: string;
  instagram: string;
  about: string;
  salonSharePercent: number;
};

export const DEFAULT_SETTINGS: SalonSettings = {
  name: "VS Instituto de Beleza",
  whatsapp: "",
  address: "",
  instagram: "",
  about: "",
  salonSharePercent: 30,
};

let cache: { value: SalonSettings; at: number } | null = null;

export async function getSalonSettings(): Promise<SalonSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const rows = await db.select().from(settings);
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const percent = Number(stored.salonSharePercent);
  const value: SalonSettings = {
    name: stored.name?.trim() || DEFAULT_SETTINGS.name,
    whatsapp: stored.whatsapp ?? "",
    address: stored.address ?? "",
    instagram: stored.instagram ?? "",
    about: stored.about ?? "",
    salonSharePercent: Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : DEFAULT_SETTINGS.salonSharePercent,
  };
  cache = { value, at: Date.now() };
  return value;
}

export async function saveSalonSettings(next: SalonSettings): Promise<SalonSettings> {
  const entries = Object.entries(next).map(([key, value]) => ({ key, value: String(value) }));
  for (const entry of entries) {
    await db.insert(settings).values(entry).onConflictDoUpdate({ target: settings.key, set: { value: entry.value } });
  }
  cache = null;
  return getSalonSettings();
}
