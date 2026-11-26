import { SEARCH_FUZZY_NONE, SearchFuzzy } from '@/ui/search/search_fuzzy.js';
import { SearchFuzzyText } from '@/ui/search/search_fuzzy_text.js';
import type { SolidScriptSuggestion } from './solid_script_suggestions.js';

/**
 * Rates how well a suggestion fits what is typed, by its name and the other
 * spelling it is found by.
 *
 * @param suggestion Suggestion.
 * @param typed Prepared typed text.
 * @returns Score, higher fits better; SEARCH_FUZZY_NONE when it does not fit.
 */
export function solidScriptSuggestionScore(suggestion: SolidScriptSuggestion, typed: SearchFuzzyText): number {
  const label = SearchFuzzy.score(typed, suggestion.label);
  return suggestion.alias === undefined ? label : Math.max(label, SearchFuzzy.score(typed, suggestion.alias));
}

/**
 * Keeps the suggestions that fit what is typed, the best fit first and equal
 * fits in their given order.
 *
 * @param suggestions Suggestions.
 * @param typed Prepared typed text.
 * @returns Fitting suggestions.
 */
export function solidScriptSuggestionsBestFirst(
  suggestions: readonly SolidScriptSuggestion[],
  typed: SearchFuzzyText,
): SolidScriptSuggestion[] {
  return suggestions
    .map((suggestion) => ({ suggestion, score: solidScriptSuggestionScore(suggestion, typed) }))
    .filter(({ score }) => score > SEARCH_FUZZY_NONE)
    .sort((a, b) => b.score - a.score)
    .map(({ suggestion }) => suggestion);
}

/**
 * Keeps the members that fit what is typed after the last dot of a path, the
 * best fit first and equal fits in their given order.
 *
 * @param members Members, each written after the typed value and a dot.
 * @param prefix Typed path, such as Brush.Ed.
 * @returns Fitting members.
 */
export function solidScriptSuggestionMembersFit(
  members: readonly SolidScriptSuggestion[],
  prefix: string,
): SolidScriptSuggestion[] {
  const cut = prefix.lastIndexOf('.') + 1;
  const typed = SearchFuzzyText.of(prefix.slice(cut));
  return members
    .map((member) => ({ member, score: SearchFuzzy.score(typed, member.label.slice(cut)) }))
    .filter(({ score }) => score > SEARCH_FUZZY_NONE)
    .sort((a, b) => b.score - a.score)
    .map(({ member }) => member);
}
