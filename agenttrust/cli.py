"""
agenttrust CLI — local audit log viewer.

Usage:
    agenttrust audit                          # tail the default audit log
    agenttrust audit path/to/audit.jsonl     # specify a path
    agenttrust audit --last 20               # show last 20 events
    agenttrust audit --agent support-agent   # filter by agent
    agenttrust audit --decision deny         # show only denials
    agenttrust audit --raw                   # print raw JSON lines
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from typing import Optional


def _ts(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _pretty(ev: dict) -> str:
    symbol = "ALLOW" if ev["decision"] == "allow" else "DENY "
    status = ev.get("result_status") or ""
    reason = f"  reason: {ev['reason']}" if ev.get("reason") else ""
    line = (
        f"[{_ts(ev['ts'])}]  {symbol}  "
        f"agent={ev['agent_id']}  run={ev['run_id'][:16]}  "
        f"tool={ev['tool']}  scope={ev['required_scope']}"
    )
    if status:
        line += f"  status={status}"
    if reason:
        line += f"\n{reason}"
    return line


def _cmd_audit(args: argparse.Namespace) -> int:
    from .audit import AuditSink

    path = args.path or "agenttrust_audit.jsonl"
    events = AuditSink(path).read_all()

    if not events:
        print(f"No events in {path}")
        return 0

    if args.agent:
        events = [e for e in events if e.get("agent_id") == args.agent]
    if args.decision:
        events = [e for e in events if e.get("decision") == args.decision]
    if args.last:
        events = events[-args.last:]

    if not events:
        print("No events match the given filters.")
        return 0

    for ev in events:
        if args.raw:
            print(json.dumps(ev))
        else:
            print(_pretty(ev))

    if not args.raw:
        allow = sum(1 for e in events if e.get("decision") == "allow")
        deny  = sum(1 for e in events if e.get("decision") == "deny")
        print(f"\n{len(events)} event(s)  —  {allow} allowed  {deny} denied")

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="agenttrust",
        description="AgentTrust — least-privilege identity + audit for AI agents",
    )
    sub = parser.add_subparsers(dest="command", metavar="<command>")

    audit = sub.add_parser("audit", help="View the local audit log")
    audit.add_argument("path", nargs="?", help="Path to .jsonl audit file (default: agenttrust_audit.jsonl)")
    audit.add_argument("--last", "-n", type=int, metavar="N", help="Show last N events")
    audit.add_argument("--agent", metavar="ID", help="Filter by agent_id")
    audit.add_argument("--decision", choices=["allow", "deny"], help="Filter by decision")
    audit.add_argument("--raw", action="store_true", help="Print raw JSON lines")

    args = parser.parse_args()

    if args.command == "audit":
        sys.exit(_cmd_audit(args))
    else:
        parser.print_help()
        sys.exit(0)


if __name__ == "__main__":
    main()
