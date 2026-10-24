"""Select only full commit SHAs from the two fixed AgentTrust repositories."""
import json
import os
from pathlib import Path
import re

repositories = {
    "ravionxgroup/agenttrust-platform": "platform",
    "ravionxgroup/agenttrust": "sdk",
}
self_repository = os.environ["SELF_REPOSITORY"]
if self_repository not in repositories:
    raise SystemExit("Unsupported CI repository")
config = json.loads(Path(__file__).with_name("compatible.json").read_text())
sibling = next(name for name in repositories if name != self_repository)
if config["repository"] != sibling:
    raise SystemExit("Compatibility pin must name the fixed sibling repository")
pair = {repositories[self_repository]: os.environ["EVENT_SHA"],
        repositories[sibling]: config["revision"]}
for name in ("platform", "sdk"):
    pair[name] = os.environ.get(name.upper() + "_OVERRIDE") or pair[name]
    if not re.fullmatch(r"[0-9a-f]{40}", pair[name]):
        raise SystemExit("Revisions must be lowercase, full 40-character commit SHAs")
with open(os.environ["GITHUB_OUTPUT"], "a") as output:
    for name, revision in pair.items():
        output.write(name + "=" + revision + "\n")
        print(name + ": " + revision)
