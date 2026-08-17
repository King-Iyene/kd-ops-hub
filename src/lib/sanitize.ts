import DOMPurify from 'dompurify';

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ADD_TAGS: ['style'],
    ADD_ATTR: ['target', 'rel'],
  });
}
