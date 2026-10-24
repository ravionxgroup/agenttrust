"""Verify checkouts; manual overrides must be reachable from fixed-repo branches."""
import os
import subprocess

def git(directory, *args):
    return subprocess.check_output(["git", "-C", directory, *args], text=True).strip()

for directory, key in (("agenttrust-platform", "PLATFORM_EXPECTED"), ("agenttrust", "SDK_EXPECTED")):
    revision = git(directory, "rev-parse", "HEAD")
    if revision != os.environ[key]:
        raise SystemExit("Checkout did not match selected revision")
    if os.environ.get("MANUAL_PAIR") == "true":
        # checkout fetch-depth: 0 populates origin branches, never arbitrary repos.
        branches = git(directory, "for-each-ref", "--format=%(refname)", "refs/remotes/origin/").splitlines()
        if not any(subprocess.run(
            ["git", "-C", directory, "merge-base", "--is-ancestor", revision, branch],
            capture_output=True, check=False,
        ).returncode == 0 for branch in branches):
            raise SystemExit("Manual revision is not reachable from a branch of the configured repository")
    message = directory + ": " + revision
    print(message)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as output:
            output.write(message + "\n\n")
