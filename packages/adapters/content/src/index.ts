import { tokenizeContent } from '@noisemap/core';
import type { Adapter, AdapterOutput, CommentStyle, FileInfo } from '@noisemap/core';

/**
 * Content adapter: whole-file Content. Every counted token is C; comments are excluded.
 * `.mdx` is deliberately absent — it routes to the React adapter (ruling 6).
 */
const COMMENT_STYLES: Readonly<Record<string, readonly CommentStyle[]>> = {
  '.css': ['block'],
  '.scss': ['block', 'line'],
  '.sass': ['block', 'line'],
  '.less': ['block', 'line'],
  '.html': ['html'],
  '.htm': ['html'],
  '.md': ['html'],
  '.markdown': ['html'],
  '.txt': [],
};

export const CONTENT_EXTENSIONS: readonly string[] = Object.keys(COMMENT_STYLES);

export const contentAdapter: Adapter = {
  id: 'content',
  match: (file: FileInfo): boolean => file.ext in COMMENT_STYLES,
  analyze: (file: FileInfo): AdapterOutput => {
    const styles = COMMENT_STYLES[file.ext] ?? [];
    return {
      framework: 'content',
      tokens: tokenizeContent(file.source, styles, `content:${file.ext.slice(1)}`),
    };
  },
};

