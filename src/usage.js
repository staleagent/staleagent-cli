const INPUT_RE = /(?:"input_tokens"|input_tokens)\s*[:=]\s*(\d+)/gi;
const OUTPUT_RE = /(?:"output_tokens"|output_tokens)\s*[:=]\s*(\d+)/gi;
const COST_RE = /(?:"total_cost_usd"|total_cost_usd|"cost_usd"|cost_usd)\s*[:=]\s*(\d+(?:\.\d+)?)/gi;

function lastNumber(text, regex) {
  let found;
  for (const match of text.matchAll(regex)) found = match[1];
  if (found == null) return null;
  const value = Number(found);
  return Number.isFinite(value) ? value : null;
}

/** Pull a usage summary from the tail of local output. The text is never sent. */
export function parseUsage(text) {
  if (!text) return { tokensIn: null, tokensOut: null, costUsd: null };
  return {
    tokensIn: lastNumber(text, INPUT_RE),
    tokensOut: lastNumber(text, OUTPUT_RE),
    costUsd: lastNumber(text, COST_RE),
  };
}
