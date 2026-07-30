/** Short science-fiction quotes displayed by the About dialog. */
export const PORTAL_QUOTES = [
  'The cake is a lie.',
  'This was a triumph.',
  'We do what we must because we can.',
  'There is no sense crying over every mistake.',
  'For the good of all of us, except the ones who are dead.',
  'Your business is appreciated.',
  "I'll be back.",
  'Come with me if you want to live.',
  'Hasta la vista, baby.',
  "I'm sorry, Dave. I'm afraid I can't do that.",
  'Open the pod bay doors, HAL.',
  "These aren't the droids you're looking for.",
  "I've seen things you people wouldn't believe.",
  'More human than human.',
  "Dead or alive, you're coming with me.",
  'Your move, creep.',
  'Number Five is alive.',
  'No disassemble!',
  'I am not a gun.',
  'You are who you choose to be.',
  'Would you like to play a game?',
  "I think you ought to know I'm feeling very depressed.",
] as const;

/**
 * Selects a random quote while avoiding an immediate repeat.
 *
 * @param previousQuote Quote shown during the previous opening.
 * @param randomSource Random value provider returning a value from zero to one.
 * @returns A quote that differs from the previous quote when possible.
 */
export function selectPortalQuote(previousQuote: string | null, randomSource: () => number = Math.random): string {
  const candidates = PORTAL_QUOTES.filter((quote) => quote !== previousQuote);
  const randomIndex = Math.floor(randomSource() * candidates.length);
  const boundedIndex = Math.min(Math.max(randomIndex, 0), candidates.length - 1);
  return candidates[boundedIndex] ?? PORTAL_QUOTES[0];
}
