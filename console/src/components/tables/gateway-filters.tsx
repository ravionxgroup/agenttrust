"use client";

import Link from "next/link";
import Form from "next/form";
import { useState } from "react";
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
  const change = (name: keyof FilterValues, value: string) => setValues(current => ({ ...current, [name]: value }));

  // Next Form keeps hydrated GET submissions in the router, so history restores
  // the server-keyed applied values instead of a browser-cached draft. It also
  // retains a native GET fallback when JavaScript is unavailable.
  return (
    <Form action="/audit" prefetch={false} className="ui-card mb-4 grid gap-3 p-4 md:grid-cols-3">
      <Select label="Agent" name="agent" value={values.agent} values={agents} onChange={change} />
      <Select label="Tool" name="tool" value={values.tool} values={tools} onChange={change} />
      <Select label="Authorization" name="authorization" value={values.authorization} values={["ALLOW", "DENY", "UNKNOWN"]} onChange={change} />
      <Select label="Execution" name="execution" value={values.execution} values={["SUCCEEDED", "FAILED", "NOT_EXECUTED", "UNKNOWN"]} onChange={change} />
      <label className="text-xs text-slate-400">From (UTC)<input name="from" type="datetime-local" value={values.from} onChange={event => change("from", event.target.value)} className="focus-ring mt-1 block w-full rounded border border-line bg-[#0b1424] px-3 py-2 text-sm text-white" /></label>
      <label className="text-xs text-slate-400">To (UTC)<input name="to" type="datetime-local" value={values.to} onChange={event => change("to", event.target.value)} className="focus-ring mt-1 block w-full rounded border border-line bg-[#0b1424] px-3 py-2 text-sm text-white" /></label>
      <button className="rounded bg-teal-400/10 px-4 py-2 text-sm text-teal-100" type="submit">Apply filters</button>
      <Link href="/audit" onNavigate={() => setValues({ ...emptyFilters })} className="self-center text-sm text-slate-400">Reset filters</Link>
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
  return <label className="text-xs text-slate-400">{label}<select aria-label={label} name={name} value={value} onChange={event => onChange(name, event.target.value)} className="focus-ring mt-1 block w-full rounded border border-line bg-[#0b1424] px-3 py-2 text-sm text-white"><option value="">All</option>{values.map(option => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></label>;
}
