/**
 * Modular Headline Adapter Pattern
 * 
 * Isolation layers:
 * 1. Headline Template Layer — Fixed sentence structure with substitution slots
 * 2. Substitution Options Layer — Isolated word/phrase lists per slot
 * 3. Unified Output — Single-line proposition rendering
 */

// Isolation Layer 1: Headline Templates
const HERO_TEMPLATE = "{rt1} our {rt2} collection of {rt3} places we'd actually stay ourselves.";
const MAP_TEMPLATE = "Our {rt2} collection of {rt3} destinations";

// Isolation Layer 2: Substitution Options
const RT1_OPTIONS = ["Explore", "Discover", "Uncover", "Browse and explore", "Find"];
const RT2_OPTIONS = ["hand-picked", "carefully chosen", "thoughtfully selected", "considered", "curated"];
const RT3_OPTIONS = ["exceptional", "standout", "memorable", "extraordinary", "unforgettable", "remarkable"];

// Helper to get random option
const randomOption = (options: string[]) => options[Math.floor(Math.random() * options.length)];

/**
 * Composes the hero headline with RT1, RT2, RT3 slots
 */
export function composeHeadline(): string {
  return HERO_TEMPLATE
    .replace("{rt1}", randomOption(RT1_OPTIONS))
    .replace("{rt2}", randomOption(RT2_OPTIONS))
    .replace("{rt3}", randomOption(RT3_OPTIONS));
}

/**
 * Composes the map section subheadline with RT2, RT3 slots
 */
export function composeMapSubheadline(): string {
  return MAP_TEMPLATE
    .replace("{rt2}", randomOption(RT2_OPTIONS))
    .replace("{rt3}", randomOption(RT3_OPTIONS));
}
