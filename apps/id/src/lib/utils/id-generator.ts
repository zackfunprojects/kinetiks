const ADJECTIVES = [
  "amber", "azure", "bold", "bright", "calm",
  "cedar", "clear", "cobalt", "cool", "copper",
  "coral", "crisp", "dusk", "ember", "fern",
  "flint", "frost", "gentle", "gilt", "golden",
  "granite", "harbor", "haze", "iron", "ivory",
  "jade", "keen", "lapis", "lunar", "maple",
  "mist", "moss", "nimble", "noble", "onyx",
  "opal", "pale", "pearl", "pine", "plum",
  "quiet", "rapid", "ridge", "ruby", "sage",
  "sand", "silver", "slate", "swift", "tidal",
  "timber", "velvet", "warm", "wild", "zinc",
] as const;

const ANIMALS = [
  "badger", "bear", "bison", "bobcat", "caribou",
  "condor", "crane", "crow", "deer", "dove",
  "eagle", "elk", "falcon", "finch", "fox",
  "hare", "hawk", "heron", "horse", "ibis",
  "jaguar", "jay", "kite", "lark", "lion",
  "llama", "lynx", "marten", "mink", "moose",
  "newt", "osprey", "otter", "owl", "panther",
  "puma", "quail", "raven", "robin", "salmon",
  "seal", "shrike", "sparrow", "stork", "swan",
  "tern", "thrush", "tiger", "viper", "wolf",
  "wren", "yak", "zebra",
] as const;

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateCodename(): string {
  return `${randomElement(ADJECTIVES)}-${randomElement(ANIMALS)}`;
}

export async function generateUniqueCodename(
  isAvailable: (codename: string) => Promise<boolean>
): Promise<string> {
  // Phase 1: try base codenames (adjective-animal)
  const maxBaseAttempts = 20;
  for (let i = 0; i < maxBaseAttempts; i++) {
    const codename = generateCodename();
    if (await isAvailable(codename)) {
      return codename;
    }
  }

  // Phase 2: append random digits and verify uniqueness
  const maxSuffixAttempts = 20;
  for (let i = 0; i < maxSuffixAttempts; i++) {
    const codename = `${generateCodename()}-${Math.floor(Math.random() * 9999)}`;
    if (await isAvailable(codename)) {
      return codename;
    }
  }

  throw new Error(
    "Failed to generate a unique codename after 40 attempts. This likely indicates a collision-heavy namespace."
  );
}
