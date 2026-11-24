/**
 * Turn JSON text into HTML with coloured spans, for the API Explorer's response
 * panel (inserted with dangerouslySetInnerHTML). The text is HTML-escaped FIRST,
 * so nothing in a response body can inject markup.
 */
export function highlightJson(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(?:\\.|[^"\\])*")\s*:/g,
      '<span class="text-slate-200">$1</span>:',
    )
    .replace(
      /:\s*("(?:\\.|[^"\\])*")/g,
      ': <span class="text-emerald-400">$1</span>',
    )
    .replace(
      /:\s*(\d+(?:\.\d+)?)/g,
      ': <span class="text-blue-400">$1</span>',
    )
    .replace(
      /:\s*(true|false)/g,
      ': <span class="text-orange-400">$1</span>',
    )
    .replace(
      /:\s*(null)/g,
      ': <span class="text-slate-500">$1</span>',
    );
}
