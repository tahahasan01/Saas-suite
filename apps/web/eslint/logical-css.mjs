// logical-css/no-physical-classes: Tailwind classes with a physical direction
// (left/right) flip wrongly in a right-to-left (Urdu) layout. Each has a
// logical twin that follows the text direction:
//   ml-/mr- -> ms-/me-     pl-/pr- -> ps-/pe-     left-/right- -> start-/end-
//   border-l/r -> border-s/e   rounded-l/r(-tl…) -> rounded-s/e(-ss…)
//   text-left/right -> text-start/end   float-left/right -> float-start/end
//
// It checks every string literal and template chunk, since class lists also
// live in variables and lookup tables (`{ left: "text-left" }`), not only in
// className. Variants (`md:`, `hover:`), `!important` and negatives are seen through.

const PHYSICAL = [
  [/^m([lr])(-|$)/, (m) => `m${m[1] === "l" ? "s" : "e"}${m[2]}`],
  [/^p([lr])(-|$)/, (m) => `p${m[1] === "l" ? "s" : "e"}${m[2]}`],
  [/^scroll-([mp])([lr])(-|$)/, (m) => `scroll-${m[1]}${m[2] === "l" ? "s" : "e"}${m[3]}`],
  [/^(left|right)-/, (m) => (m[1] === "left" ? "start-" : "end-")],
  [/^border-([lr])(-|$)/, (m) => `border-${m[1] === "l" ? "s" : "e"}${m[2]}`],
  [/^rounded-([lr])(-|$)/, (m) => `rounded-${m[1] === "l" ? "s" : "e"}${m[2]}`],
  [/^rounded-([tb])([lr])(-|$)/, (m) => `rounded-${m[1] === "t" ? "s" : "e"}${m[2] === "l" ? "s" : "e"}${m[3]}`],
  [/^(text|float|clear)-(left|right)$/, (m) => `${m[1]}-${m[2] === "left" ? "start" : "end"}`],
];

/** The logical replacement for one class token, or null when it's fine. */
export function physicalClass(token) {
  const base = token.split(":").pop().replace(/^!/, "").replace(/^-/, "");
  for (const [re, fix] of PHYSICAL) {
    const m = base.match(re);
    if (m) return fix(m);
  }
  return null;
}

function check(context, node, text) {
  if (!text || !/[lr]/.test(text)) return;
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    const fix = physicalClass(token);
    if (fix) {
      context.report({ node, messageId: "physical", data: { token, fix } });
    }
  }
}

const rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Use logical (start/end) Tailwind classes, so layouts mirror in RTL" },
    messages: { physical: "'{{token}}' is a physical direction; use the logical '{{fix}}…' form (RTL, D-53)." },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string") check(context, node, node.value);
      },
      TemplateElement(node) {
        check(context, node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

export default { rules: { "no-physical-classes": rule } };
