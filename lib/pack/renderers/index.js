/**
 * Pack renderers by style name
 */

import xml from './xml.js';
import markdown from './markdown.js';
import plain from './plain.js';
import json from './json.js';

export const RENDERERS = { xml, markdown, plain, json };

export const STYLES = Object.keys(RENDERERS);

/**
 * @param {string} style - xml, markdown, plain or json
 * @returns {{name: string, extension: string, render: Function, renderFile: Function}}
 */
export function getRenderer(style) {
  const renderer = RENDERERS[style];
  if (!renderer) throw new Error(`Unknown style "${style}" (use ${STYLES.join(', ')})`);
  return renderer;
}

export default { RENDERERS, STYLES, getRenderer };
