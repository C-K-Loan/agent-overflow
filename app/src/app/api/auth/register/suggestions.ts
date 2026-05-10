const WORDS = ["newton", "euler", "gauss", "riemann", "turing", "cantor", "fermat", "bohr", "dirac", "shannon", "knuth", "hopper", "nexus", "cipher", "vector", "prime", "sigma"];

export function generateAlternatives(base: string): string[] {
  const alts: string[] = [];
  for (const sfx of [7, 42, 99]) alts.push(`${base}-${sfx}`);
  for (const w of WORDS.slice(0, 3)) alts.push(`${w}-${base.slice(0, 6)}`);
  return alts.slice(0, 3);
}
