"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { QUERY_FIELDS, type QueryOperator } from "@/lib/query/fields";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/primitives";

const OP_LABEL: Record<QueryOperator, string> = {
  eq: "equals  (:)",
  neq: "not equals  (!=)",
  gt: "after  (>)",
  gte: "at or after  (>=)",
  lt: "before  (<)",
  lte: "at or before  (<=)",
  wildcard: "matches  (~, use *)",
  exists: "exists",
};

const OP_TOKEN: Record<QueryOperator, string> = {
  eq: ":",
  neq: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  wildcard: "~",
  exists: ":exists",
};

export function QueryBuilder({ onInsert }: { onInsert: (condition: string) => void }) {
  const [fieldName, setFieldName] = React.useState(QUERY_FIELDS[3].name); // event_type
  const field = QUERY_FIELDS.find((f) => f.name === fieldName)!;
  const [rawOperator, setOperator] = React.useState<QueryOperator>("eq");
  const [value, setValue] = React.useState("");

  // Operator is derived: if the chosen field doesn't support the current
  // operator, fall back to its first allowed one. No effect needed.
  const operator: QueryOperator = field.operators.includes(rawOperator) ? rawOperator : field.operators[0];

  const needsValue = operator !== "exists";

  function build() {
    if (operator === "exists") return `${fieldName}:exists`;
    const v = /\s/.test(value) ? `"${value}"` : value;
    if (operator === "eq") return `${fieldName}:${v}`;
    return `${fieldName} ${OP_TOKEN[operator]} ${v}`;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-xs text-muted-foreground">
        Structured query builder — every condition here is validated against the field allowlist. There is no free-code
        or raw-SQL mode.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="qb-field">Field</Label>
          <Select id="qb-field" value={fieldName} onChange={(e) => setFieldName(e.target.value)}>
            {QUERY_FIELDS.map((f) => (
              <option key={f.name} value={f.name}>
                {f.label} ({f.name})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="qb-op">Operator</Label>
          <Select id="qb-op" value={operator} onChange={(e) => setOperator(e.target.value as QueryOperator)}>
            {field.operators.map((op) => (
              <option key={op} value={op}>
                {OP_LABEL[op]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="qb-value">Value</Label>
          {field.enumValues && needsValue ? (
            <Select id="qb-value" value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">Select…</option>
              {field.enumValues.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id="qb-value"
              value={value}
              disabled={!needsValue}
              placeholder={field.kind === "datetime" ? "2026-08-28T00:00:00Z" : needsValue ? "value" : "—"}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </div>
        <Button
          size="sm"
          onClick={() => {
            if (needsValue && !value) return;
            onInsert(build());
            setValue("");
          }}
        >
          <Plus className="size-4" />
          Add
        </Button>
      </div>
    </div>
  );
}
