/**
 * Modular Headline Adapter Pattern
 * 
 * Isolation layers:
 * 1. Headline Template Layer — Fixed sentence structure with three substitution slots
 * 2. Substitution Options Layer — Isolated word/phrase lists per slot
 * 3. Unified Output — Single-line proposition rendering
 */

// Isolation Layer 1: Headline Template
const TEMPLATE = "{rt1} our {rt2} collection of {rt3} places we'd actually stay ourselves.";

// Isolation Layer 2: Substitution Options
const RT1_OPTIONS = ["Explore", "Discover", "Uncover", "Browse and explore", "Find"];
const RT2_OPTIONS = ["hand-picked", "carefully chosen", "thoughtfully selected", "considered", "curated"];
const RT3_OPTIONS = ["exceptional", "standout", "memorable", "extraordinary", "unforgettable", "remarkable"];

/**
 * Unified Output - Composes a headline by selecting one random option per slot
 */
export function composeHeadline(): string {
  const rt1 = RT1_OPTIONS[Math.floor(Math.random() * RT1_OPTIONS.length)];
  const rt2 = RT2_OPTIONS[Math.floor(Math.random() * RT2_OPTIONS.length)];
  const rt3 = RT3_OPTIONS[Math.floor(Math.random() * RT3_OPTIONS.length)];
  
  return TEMPLATE
    .replace("{rt1}", rt1)
    .replace("{rt2}", rt2)
    .replace("{rt3}", rt3);
}
