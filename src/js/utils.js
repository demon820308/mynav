import { marked } from 'marked';

/**
 * Escapes HTML special characters to prevent XSS injection.
 * Always call this before inserting user-supplied data into innerHTML.
 *
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function linkify(text) {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

const renderer = new marked.Renderer();

renderer.link = function ({ href, title, text }) {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

renderer.code = function ({ text, lang }) {
  const langClass = lang ? ` class="language-${lang}"` : '';
  return `<pre><code${langClass}>${text}</code></pre>`;
};

export function renderMarkdown(text) {
  if (!text) return '';
  return marked.parse(text, { renderer });
}

