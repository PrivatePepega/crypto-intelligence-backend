/**
 * Minimal, dependency-free XML reader for SEC ownership and 13F documents.
 *
 * SEC filings use a small, predictable subset of XML. This parser builds a
 * simple node tree so callers can read nested `<value>` elements and
 * attributes without pulling in a full XML dependency.
 *
 * It is intentionally not a general-purpose XML implementation: it does not
 * resolve namespaces or validate schemas. Unknown entities are preserved as
 * text rather than silently dropped.
 */

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Direct text content of this element (decoded, untrimmed). */
  text: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return NAMED_ENTITIES[entity] ?? match;
  });
}

function findTagEnd(source: string, start: number): number {
  let quote: '"' | "'" | null = null;

  for (let i = start; i < source.length; i++) {
    const char = source[i];

    if (quote !== null) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === ">") {
      return i;
    }
  }

  return -1;
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    if (!name) {
      continue;
    }
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? "");
  }

  return attrs;
}

/**
 * Parses an XML document and returns its root element.
 * Throws when the document has no element.
 */
export function parseXml(xml: string): XmlNode {
  const source = xml.replace(/^\uFEFF/, "");
  const documentNode: XmlNode = { name: "#document", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [documentNode];
  let index = 0;

  const appendText = (text: string): void => {
    if (!text) {
      return;
    }
    const current = stack[stack.length - 1];
    if (current) {
      current.text += decodeEntities(text);
    }
  };

  while (index < source.length) {
    const openBracket = source.indexOf("<", index);

    if (openBracket === -1) {
      appendText(source.slice(index));
      break;
    }

    if (openBracket > index) {
      appendText(source.slice(index, openBracket));
    }

    if (source.startsWith("<!--", openBracket)) {
      const end = source.indexOf("-->", openBracket + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }

    if (source.startsWith("<![CDATA[", openBracket)) {
      const end = source.indexOf("]]>", openBracket + 9);
      const cdata = source.slice(openBracket + 9, end === -1 ? source.length : end);
      const current = stack[stack.length - 1];
      if (current) {
        current.text += cdata;
      }
      index = end === -1 ? source.length : end + 3;
      continue;
    }

    if (source.startsWith("<?", openBracket)) {
      const end = source.indexOf("?>", openBracket + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }

    if (source.startsWith("<!", openBracket)) {
      const end = source.indexOf(">", openBracket + 2);
      index = end === -1 ? source.length : end + 1;
      continue;
    }

    const closeBracket = findTagEnd(source, openBracket + 1);
    if (closeBracket === -1) {
      break;
    }

    const rawTag = source.slice(openBracket + 1, closeBracket).trim();
    index = closeBracket + 1;

    if (!rawTag) {
      continue;
    }

    if (rawTag.startsWith("/")) {
      const closingName = rawTag.slice(1).trim();
      for (let level = stack.length - 1; level > 0; level--) {
        if (stack[level]?.name === closingName) {
          stack.length = level;
          break;
        }
      }
      continue;
    }

    const selfClosing = rawTag.endsWith("/");
    const body = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const nameMatch = /^([^\s/>]+)/.exec(body);
    const name = nameMatch?.[1];

    if (!name) {
      continue;
    }

    const node: XmlNode = {
      name,
      attrs: parseAttributes(body.slice(name.length)),
      children: [],
      text: "",
    };

    const parent = stack[stack.length - 1];
    if (!parent) {
      break;
    }
    parent.children.push(node);

    if (!selfClosing) {
      stack.push(node);
    }
  }

  const root = documentNode.children[0];
  if (!root) {
    throw new Error("XML document contains no root element");
  }

  return root;
}

/** Returns the tag name without its namespace prefix, when one is present. */
export function localNameOf(name: string): string {
  return name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
}

/**
 * Returns the first direct child whose local name matches, ignoring namespace
 * prefixes. SEC documents mix prefixed and unprefixed elements (`com:street1`
 * next to `issuerCik`), so callers should not depend on the prefix.
 */
export function childLocal(node: XmlNode | null | undefined, name: string): XmlNode | null {
  if (!node) {
    return null;
  }
  return node.children.find((candidate) => localNameOf(candidate.name) === name) ?? null;
}

/** Returns every direct child whose local name matches. */
export function childrenNamedLocal(node: XmlNode | null | undefined, name: string): XmlNode[] {
  if (!node) {
    return [];
  }
  return node.children.filter((candidate) => localNameOf(candidate.name) === name);
}

/** Returns every descendant (depth-first) whose local name matches. */
export function descendantsLocal(node: XmlNode | null | undefined, name: string): XmlNode[] {
  if (!node) {
    return [];
  }

  const matches: XmlNode[] = [];
  const visit = (current: XmlNode): void => {
    for (const nested of current.children) {
      if (localNameOf(nested.name) === name) {
        matches.push(nested);
      }
      visit(nested);
    }
  };

  visit(node);
  return matches;
}

/** Returns the first descendant text with the given local name, or null. */
export function descendantText(node: XmlNode | null | undefined, name: string): string | null {
  const match = descendantsLocal(node, name)[0];
  if (!match) {
    return null;
  }
  const value = flattenText(match);
  return value === "" ? null : value;
}

/**
 * Flattens an element and its descendants into one whitespace-normalized
 * string. Used for filing items that are free text with nested fields.
 */
export function flattenText(node: XmlNode | null | undefined): string {
  if (!node) {
    return "";
  }

  const parts: string[] = [];
  const visit = (current: XmlNode): void => {
    const own = current.text.trim();
    if (own !== "") {
      parts.push(own);
    }
    for (const nested of current.children) {
      visit(nested);
    }
  };

  visit(node);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Returns the first direct child with the given tag name. */
export function child(node: XmlNode | null | undefined, name: string): XmlNode | null {
  if (!node) {
    return null;
  }
  return node.children.find((candidate) => candidate.name === name) ?? null;
}

/** Returns every direct child with the given tag name. */
export function childrenNamed(node: XmlNode | null | undefined, name: string): XmlNode[] {
  if (!node) {
    return [];
  }
  return node.children.filter((candidate) => candidate.name === name);
}

/** Returns the direct text content of a node, trimmed. */
export function textOf(node: XmlNode | null | undefined): string {
  return node?.text.trim() ?? "";
}

/**
 * Reads the value of a node that either carries text directly or wraps it in
 * a `<value>` child, which is the common SEC ownership shape.
 */
export function valueOf(node: XmlNode | null | undefined): string | null {
  if (!node) {
    return null;
  }

  const wrapped = textOf(child(node, "value"));
  if (wrapped !== "") {
    return wrapped;
  }

  const direct = textOf(node);
  return direct === "" ? null : direct;
}

/** Returns the trimmed text of a direct child, or null when absent/empty. */
export function childText(node: XmlNode | null | undefined, name: string): string | null {
  const value = textOf(child(node, name));
  return value === "" ? null : value;
}

/** Parses a numeric string, tolerating commas. Returns null for invalid input. */
export function parseOptionalNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = value.replace(/,/g, "").trim();
  if (cleaned === "") {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Reads a numeric direct child. */
export function childNumber(node: XmlNode | null | undefined, name: string): number | null {
  return parseOptionalNumber(childText(node, name));
}

/** Reads 1/0 or true/false SEC boolean values. */
export function childBoolean(node: XmlNode | null | undefined, name: string): boolean | null {
  const value = childText(node, name)?.toLowerCase();
  if (value === null || value === undefined) {
    return null;
  }
  if (value === "1" || value === "true") {
    return true;
  }
  if (value === "0" || value === "false") {
    return false;
  }
  return null;
}

/** Recursively collects `id` attributes from `<footnoteId>` elements. */
export function collectFootnoteIds(node: XmlNode | null | undefined): string[] {
  if (!node) {
    return [];
  }

  const ids: string[] = [];
  const visit = (current: XmlNode): void => {
    if (current.name === "footnoteId") {
      const id = current.attrs["id"];
      if (id) {
        ids.push(id);
      }
    }
    for (const nested of current.children) {
      visit(nested);
    }
  };

  visit(node);
  return ids;
}
