import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GatewayFilters } from "../src/components/tables/gateway-filters";
import { AgentsTable } from "../src/components/tables/agents-table";
import { RunsTable } from "../src/components/tables/runs-table";
import { ToolsTable } from "../src/components/tables/tools-table";

test("Gateway filter presentation retains six native named fields, dates and GET actions", () => {
  const html = renderToStaticMarkup(<GatewayFilters filters={{ authorization: "DENY", tool: "http_restart" }} agents={["agent-a"]} tools={["http_restart"]} />);
  assert.match(html, /action="\/audit"/);
  assert.ok(!/method="(?!get)[^"]+"/i.test(html), "omitted method defaults to native GET");
  assert.equal((html.match(/<select /g) ?? []).length, 4);
  assert.equal((html.match(/type="datetime-local"/g) ?? []).length, 2);
  for (const name of ["agent", "tool", "authorization", "execution", "from", "to"]) assert.ok(html.includes(`name="${name}"`));
  assert.match(html, /2 filters active/);
  assert.match(html, /ui-button-primary/);
  assert.match(html, /<a class="ui-button ui-button-secondary" href="\/audit"/);
  assert.match(html, /aria-labelledby="gateway-filter-title"/);
  assert.ok(!html.includes('name="page"'));
});

test("applied filter count handles empty, singular and six applied filters", () => {
  for (const [filters, count] of [[{}, "0 filters active"], [{ agent: "a" }, "1 filter active"],
    [{ agent: "a", tool: "t", authorization: "ALLOW", execution: "UNKNOWN", from: "2026-10-24T12:00", to: "2026-10-24T13:00" }, "6 filters active"]] as const) {
    assert.ok(renderToStaticMarkup(<GatewayFilters filters={filters} agents={[]} tools={[]} />).replace(/<!--.*?-->/g, "").includes(count));
  }
});

test("listing searches use shared native controls and preserve accessible labels and empty wording", () => {
  for (const [element, name] of [[<AgentsTable agents={[]} />, "agents"], [<RunsTable runs={[]} />, "runs"], [<ToolsTable tools={[]} />, "tools"]] as const) {
    const html = renderToStaticMarkup(element);
    assert.match(html, /class="ui-control pl-9"/);
    assert.ok(html.includes(`Search ${name}`));
    assert.ok(html.includes(`No observed ${name} match the current search.`));
  }
});
