import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { catalog } from "./messages";

export type Locale = "ja" | "en";
const exact = new Map(catalog.map(([source, ja, en]) => [source, { ja, en }]));
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const templates = catalog
  .filter(([source]) => source.includes("{{"))
  .sort(
    (a, b) =>
      b[0].replace(/\{\{\d+\}\}/g, "").length -
      a[0].replace(/\{\{\d+\}\}/g, "").length,
  )
  .map(([source, ja, en]) => ({
    pattern: new RegExp(
      "^" +
        source
          .split(/\{\{\d+\}\}/)
          .map(escape)
          .join("([\\s\\S]*?)") +
        "$",
    ),
    ja,
    en,
  }));

/** Translate only registered application copy. Unknown strings (customer data, AI replies) stay intact. */
export function translate(text: string, locale: Locale, depth = 0): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  const entry = exact.get(normalized);
  if (entry) return entry[locale];
  if (depth < 3) {
    for (const template of templates) {
      const match = template.pattern.exec(text.trim());
      if (match)
        return template[locale].replace(/\{\{(\d+)\}\}/g, (_, index) =>
          translate(match[Number(index) + 1], locale, depth + 1),
        );
    }
    // Task titles consist of a registered task name and an original customer name.
    if (text.includes(" · "))
      return text
        .split(" · ")
        .map((part) => translate(part, locale, depth + 1))
        .join(" · ");
  }
  return text;
}

/** Localize the application UI tree, including accessible labels and placeholders, not form values. */
export function localizeUI(node: ReactNode, locale: Locale): ReactNode {
  if (typeof node === "string") return translate(node, locale);
  if (Array.isArray(node))
    return Children.map(node, (child) => localizeUI(child, locale));
  if (!isValidElement<Record<string, unknown>>(node)) return node;
  if (node.props["data-original"] === true) return node;
  const props: Record<string, unknown> = {};
  for (const key of ["title", "placeholder", "aria-label", "alt"]) {
    if (typeof node.props[key] === "string")
      props[key] = translate(node.props[key], locale);
  }
  if (node.props.children !== undefined)
    props.children = localizeUI(node.props.children as ReactNode, locale);
  return cloneElement(node, props);
}
