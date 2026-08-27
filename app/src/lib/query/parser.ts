/**
 * Safe, bounded query parser for the Log Explorer.
 *
 * NON-NEGOTIABLE (SKILL.md #9): this never compiles to eval, `new Function`,
 * arbitrary SQL, arbitrary shell, or a user-supplied RegExp. It produces a
 * small, typed AST that `evaluate.ts` walks. Wildcards compile to an escaped,
 * anchored matcher with a bounded number of `*`. Every failure returns a
 * specific, positioned error — never a silent empty result.
 *
 * The same parser is the only query path for humans AND agents (Investigation
 * Agent, Hunt Agent, Detection Engineer Agent) — there is no bypass.
 */
import {
  FIELD_MAP,
  OPERATOR_TOKENS,
  QUERY_LIMITS,
  type FieldDef,
  type QueryOperator,
} from "./fields";

export interface ComparisonNode {
  type: "comparison";
  field: string;
  fieldDef: FieldDef;
  operator: QueryOperator;
  value: string;
}
export interface FreeTextNode {
  type: "freetext";
  value: string;
}
export interface BoolNode {
  type: "and" | "or";
  children: QueryNode[];
}
export interface NotNode {
  type: "not";
  child: QueryNode;
}
export type QueryNode = ComparisonNode | FreeTextNode | BoolNode | NotNode;

export interface ParseError {
  ok: false;
  message: string;
  /** 0-based character offset into the source query, when known */
  position?: number;
  hint?: string;
}
export interface ParseSuccess {
  ok: true;
  ast: QueryNode | null; // null == match-all (empty query)
  conditionCount: number;
  wildcardCount: number;
}
export type ParseResult = ParseSuccess | ParseError;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokKind = "lparen" | "rparen" | "and" | "or" | "not" | "op" | "word" | "string";
interface Token {
  kind: TokKind;
  value: string;
  pos: number;
}

const OP_CHARS = new Set([":", "=", "!", ">", "<", "~"]);

function tokenize(input: string): Token[] | ParseError {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ kind: "lparen", value: "(", pos: i });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ kind: "rparen", value: ")", pos: i });
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      i++;
      let str = "";
      let closed = false;
      while (i < n) {
        if (input[i] === "\\" && i + 1 < n) {
          const next = input[i + 1];
          str += next === "n" ? "\n" : next;
          i += 2;
          continue;
        }
        if (input[i] === quote) {
          closed = true;
          i++;
          break;
        }
        str += input[i];
        i++;
      }
      if (!closed) {
        return { ok: false, message: "Unterminated quoted string", position: start };
      }
      tokens.push({ kind: "string", value: str, pos: start });
      continue;
    }
    if (OP_CHARS.has(c)) {
      const start = i;
      let op = c;
      i++;
      if ((op === "!" || op === ">" || op === "<" || op === "=") && input[i] === "=") {
        op += "=";
        i++;
      }
      if (op === "!") {
        return {
          ok: false,
          message: "Lone '!' is not a valid operator",
          position: start,
          hint: "Use '!=' for not-equals or the word NOT for negation.",
        };
      }
      tokens.push({ kind: "op", value: op, pos: start });
      continue;
    }
    // bareword — read until whitespace, paren, quote, or operator char
    const start = i;
    let word = "";
    while (i < n) {
      const ch = input[i];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") break;
      if (ch === "(" || ch === ")" || ch === '"' || ch === "'") break;
      if (OP_CHARS.has(ch)) break;
      word += ch;
      i++;
    }
    const upper = word.toUpperCase();
    if (upper === "AND") tokens.push({ kind: "and", value: "AND", pos: start });
    else if (upper === "OR") tokens.push({ kind: "or", value: "OR", pos: start });
    else if (upper === "NOT") tokens.push({ kind: "not", value: "NOT", pos: start });
    else tokens.push({ kind: "word", value: word, pos: start });
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser (recursive descent): orExpr := andExpr (OR andExpr)*
// ---------------------------------------------------------------------------

class Parser {
  private idx = 0;
  conditionCount = 0;
  wildcardCount = 0;

  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.idx];
  }
  private next(): Token | undefined {
    return this.tokens[this.idx++];
  }

  parse(): { node: QueryNode | null } | ParseError {
    if (this.tokens.length === 0) return { node: null };
    const result = this.parseOr(0);
    if ("ok" in result) return result;
    if (this.idx < this.tokens.length) {
      const t = this.tokens[this.idx];
      return {
        ok: false,
        message: `Unexpected '${t.value}'`,
        position: t.pos,
        hint: "Conditions must be joined with AND / OR.",
      };
    }
    if (this.conditionCount > QUERY_LIMITS.maxConditions) {
      return {
        ok: false,
        message: `Too many conditions (${this.conditionCount}); limit is ${QUERY_LIMITS.maxConditions}`,
      };
    }
    if (this.wildcardCount > QUERY_LIMITS.maxWildcardsPerQuery) {
      return {
        ok: false,
        message: `Too many wildcard conditions (${this.wildcardCount}); limit is ${QUERY_LIMITS.maxWildcardsPerQuery}`,
      };
    }
    return { node: result.node };
  }

  private parseOr(depth: number): { node: QueryNode } | ParseError {
    const first = this.parseAnd(depth);
    if ("ok" in first) return first;
    const children = [first.node];
    while (this.peek()?.kind === "or") {
      this.next();
      const rhs = this.parseAnd(depth);
      if ("ok" in rhs) return rhs;
      children.push(rhs.node);
    }
    return { node: children.length === 1 ? children[0] : { type: "or", children } };
  }

  private parseAnd(depth: number): { node: QueryNode } | ParseError {
    const first = this.parseUnary(depth);
    if ("ok" in first) return first;
    const children = [first.node];
    for (;;) {
      const p = this.peek();
      if (!p) break;
      if (p.kind === "and") {
        this.next();
      } else if (p.kind === "rparen" || p.kind === "or") {
        break;
      } else {
        // implicit AND between adjacent terms
      }
      const nextTok = this.peek();
      if (!nextTok || nextTok.kind === "rparen" || nextTok.kind === "or" || nextTok.kind === "and") {
        if (p.kind === "and") {
          return { ok: false, message: "Dangling AND with nothing after it", position: p.pos };
        }
        break;
      }
      const rhs = this.parseUnary(depth);
      if ("ok" in rhs) return rhs;
      children.push(rhs.node);
    }
    return { node: children.length === 1 ? children[0] : { type: "and", children } };
  }

  private parseUnary(depth: number): { node: QueryNode } | ParseError {
    const p = this.peek();
    if (p?.kind === "not") {
      this.next();
      const child = this.parseUnary(depth);
      if ("ok" in child) return child;
      return { node: { type: "not", child: child.node } };
    }
    return this.parsePrimary(depth);
  }

  private parsePrimary(depth: number): { node: QueryNode } | ParseError {
    const p = this.peek();
    if (!p) return { ok: false, message: "Unexpected end of query" };

    if (p.kind === "lparen") {
      if (depth + 1 > QUERY_LIMITS.maxGroupDepth) {
        return { ok: false, message: `Grouping nested too deep; limit is ${QUERY_LIMITS.maxGroupDepth}`, position: p.pos };
      }
      this.next();
      const inner = this.parseOr(depth + 1);
      if ("ok" in inner) return inner;
      const close = this.peek();
      if (close?.kind !== "rparen") {
        return { ok: false, message: "Missing closing ')'", position: p.pos };
      }
      this.next();
      return { node: inner.node };
    }

    if (p.kind === "op") {
      return {
        ok: false,
        message: `Operator '${p.value}' with no field before it`,
        position: p.pos,
        hint: "Write conditions as field:value, e.g. event_type:windows_security_4625",
      };
    }

    if (p.kind === "string") {
      this.next();
      this.conditionCount++;
      return { node: { type: "freetext", value: p.value } };
    }

    if (p.kind === "word") {
      // could be "field op value" or a bare free-text term
      const opTok = this.tokens[this.idx + 1];
      if (opTok?.kind === "op") {
        return this.parseComparison(p);
      }
      this.next();
      this.conditionCount++;
      return { node: { type: "freetext", value: p.value } };
    }

    return { ok: false, message: `Unexpected '${p.value}'`, position: p.pos };
  }

  private parseComparison(fieldTok: Token): { node: QueryNode } | ParseError {
    const fieldName = fieldTok.value;
    const fieldDef = FIELD_MAP[fieldName];
    if (!fieldDef) {
      return {
        ok: false,
        message: `Unknown field '${fieldName}'`,
        position: fieldTok.pos,
        hint: "Only allowlisted normalized-event fields are queryable. Use the field picker in the query builder.",
      };
    }
    this.next(); // field
    const opTok = this.next()!; // op
    const operator = OPERATOR_TOKENS[opTok.value];
    if (!operator) {
      return { ok: false, message: `Unsupported operator '${opTok.value}'`, position: opTok.pos };
    }

    // `field:exists` special form — value token is the bareword "exists"
    const valueTok = this.peek();

    if (
      operator === "eq" &&
      valueTok?.kind === "word" &&
      valueTok.value.toLowerCase() === "exists"
    ) {
      this.next();
      this.conditionCount++;
      return { node: { type: "comparison", field: fieldName, fieldDef, operator: "exists", value: "" } };
    }

    if (!valueTok || valueTok.kind === "op" || valueTok.kind === "lparen" || valueTok.kind === "rparen" || valueTok.kind === "and" || valueTok.kind === "or") {
      return { ok: false, message: `Missing value for '${fieldName} ${opTok.value}'`, position: opTok.pos + opTok.value.length };
    }

    if (!fieldDef.operators.includes(operator)) {
      return {
        ok: false,
        message: `Operator '${opTok.value}' is not allowed on field '${fieldName}'`,
        position: opTok.pos,
        hint: `Allowed: ${fieldDef.operators.join(", ")}`,
      };
    }

    this.next();
    const value = valueTok.value;

    if (fieldDef.kind === "datetime") {
      if (Number.isNaN(Date.parse(value))) {
        return {
          ok: false,
          message: `'${value}' is not a valid ISO-8601 date-time for field '${fieldName}'`,
          position: valueTok.pos,
          hint: 'Example: occurred_at >= "2026-08-28T00:00:00Z"',
        };
      }
    }

    if (fieldDef.kind === "enum" && fieldDef.enumValues && !fieldDef.enumValues.includes(value)) {
      return {
        ok: false,
        message: `'${value}' is not a valid value for '${fieldName}'`,
        position: valueTok.pos,
        hint: `Allowed: ${fieldDef.enumValues.join(", ")}`,
      };
    }

    if (operator === "wildcard") {
      const stars = (value.match(/\*/g) ?? []).length;
      if (stars === 0) {
        return {
          ok: false,
          message: "Wildcard match '~' used with no '*' in the value",
          position: valueTok.pos,
          hint: "Use ':' for an exact match, or add a '*' (e.g. entity.host ~ web-*).",
        };
      }
      if (stars > QUERY_LIMITS.maxWildcardStars) {
        return {
          ok: false,
          message: `Too many '*' in one wildcard (${stars}); limit is ${QUERY_LIMITS.maxWildcardStars}`,
          position: valueTok.pos,
        };
      }
      this.wildcardCount++;
    }

    this.conditionCount++;
    return { node: { type: "comparison", field: fieldName, fieldDef, operator, value } };
  }
}

export function parseQuery(raw: string): ParseResult {
  const input = raw ?? "";
  if (input.length > QUERY_LIMITS.maxQueryLength) {
    return {
      ok: false,
      message: `Query is too long (${input.length} chars); limit is ${QUERY_LIMITS.maxQueryLength}`,
    };
  }
  // Defensive: reject characters that have no meaning in this grammar and are
  // common in injection attempts. This is belt-and-suspenders on top of the
  // fact that we never eval — it keeps error messages honest.
  const bannedMatch = input.match(/[;{}$\\`]|--|\/\*|\*\//);
  if (bannedMatch && bannedMatch.index !== undefined) {
    return {
      ok: false,
      message: `Character sequence '${bannedMatch[0]}' is not allowed in a query`,
      position: bannedMatch.index,
      hint: "The Log Explorer query language is a structured filter, not SQL or code. Use field:value conditions joined with AND/OR.",
    };
  }

  const toks = tokenize(input);
  if ("ok" in toks) return toks;

  const parser = new Parser(toks);
  const result = parser.parse();
  if ("ok" in result) return result;

  return {
    ok: true,
    ast: result.node,
    conditionCount: parser.conditionCount,
    wildcardCount: parser.wildcardCount,
  };
}

/**
 * Compile a bounded glob (`*` = any run of chars) to a safe predicate.
 * Implemented as a linear two-pointer match — no RegExp is built from user
 * input, so there is no ReDoS surface at all (security-governance.md:
 * "no unsafe regular expressions").
 */
export function globToPredicate(pattern: string): (value: string) => boolean {
  const parts = pattern.toLowerCase().split("*"); // literals between the stars
  const leadingStar = pattern.startsWith("*");
  const trailingStar = pattern.endsWith("*");
  return (raw: string) => {
    const value = raw.toLowerCase();
    let cursor = 0;
    for (let p = 0; p < parts.length; p++) {
      const lit = parts[p];
      if (lit === "") continue;
      if (p === 0 && !leadingStar) {
        if (!value.startsWith(lit)) return false;
        cursor = lit.length;
        continue;
      }
      if (p === parts.length - 1 && !trailingStar) {
        return value.slice(cursor).endsWith(lit);
      }
      const found = value.indexOf(lit, cursor);
      if (found === -1) return false;
      cursor = found + lit.length;
    }
    return true;
  };
}
