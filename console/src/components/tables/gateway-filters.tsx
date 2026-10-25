"use client";

import Link from "next/link";
import Form from "next/form";
import { useState } from "react";
import { ChevronDown, ListFilter, RotateCcw, Search } from "lucide-react";
import type { InvocationFilters } from "../../lib/gateway/model";

const emptyFilters = { agent: "", tool: "", authorization: "", execution: "", from: "", to: "" };
type FilterValues = typeof emptyFilters;

// The server keys this component by applied filters and page. URL navigation
// therefore replaces draft values, while ordinary edits remain unapplied.
export function GatewayFilters({ filters, agents, tools }: {
  filters: InvocationFilters;
  agents: string[];
  tools: string[];
}) {
  const [values, setValues] = useState<FilterValues>(() => ({
    agent: filters.agent ?? "", tool: filters.tool ?? "",
    authorization: filters.authorization ?? "", execution: filters.execution ?? "",
    from: filters.from ?? "", to: filters.to ?? "",
  }));
  const activeCount = Object.values(filters).filter(Boolean).length;
  const change = (name: keyof FilterValues, value: string) => setValues(current => ({ ...current, [name]: value }));

  // Next Form keeps hydrated GET submissions in the router, so history restores
  // the server-keyed applied values instead of a browser-cached draft. It also
  // retains a native GET fallback when JavaScript is unavailable.
  return (
    <Form action="/audit" prefetch={false} className="ui-card mb-4" aria-labelledby="gateway-filter-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
        <div><h3 id="gateway-filter-title" className="ui-section-title flex items-center gap-2"><ListFilter className="h-4 w-4 text-muted" aria-hidden="true" />Investigate invocations</h3>
          <p className="ui-helper mt-1">Narrow persisted evidence by identity, decision or UTC time range.</p></div>
        <span className="ui-badge border-line bg-raised text-muted" aria-live="polite">{activeCount} {activeCount === 1 ? "filter" : "filters"} active</span>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
        <Select label="Agent" name="agent" value={values.agent} values={agents} onChange={change} />
        <Select label="Tool" name="tool" value={values.tool} values={tools} onChange={change} />
        <Select label="Authorization" name="authorization" value={values.authorization} values={["ALLOW", "DENY", "UNKNOWN"]} onChange={change} />
        <Select label="Execution" name="execution" value={values.execution} values={["SUCCEEDED", "FAILED", "NOT_EXECUTED", "UNKNOWN"]} onChange={change} />
        <label className="ui-field-label min-w-0">From (UTC)<input name="from" type="datetime-local" value={values.from} onChange={event => change("from", event.target.value)} className="ui-control mt-2" /></label>
        <label className="ui-field-label min-w-0">To (UTC)<input name="to" type="datetime-local" value={values.to} onChange={event => change("to", event.target.value)} className="ui-control mt-2" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
        <button className="ui-button ui-button-primary" type="submit"><Search className="h-4 w-4" aria-hidden="true" />Apply filters</button>
        <Link href="/audit" onNavigate={() => setValues({ ...emptyFilters })} className="ui-button ui-button-secondary"><RotateCcw className="h-4 w-4" aria-hidden="true" />Reset filters</Link>
        <p className="ui-helper sm:ml-auto">Changes apply when you select Apply filters.</p>
      </div>
    </Form>
  );
}

function Select({ label, name, value, values, onChange }: {
  label: string;
  name: keyof FilterValues;
  value: string;
  values: string[];
  onChange: (name: keyof FilterValues, value: string) => void;
}) {
  return <label className="ui-field-label min-w-0">{label}<span className="relative mt-2 block">
    <select aria-label={label} name={name} value={value} onChange={event => onChange(name, event.target.value)} className="ui-control ui-select"><option value="">All</option>{values.map(option => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
  </span></label>;
}
