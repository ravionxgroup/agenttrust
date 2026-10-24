"""CI helper regression checks; standard unittest, no new test dependencies."""
import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
SHA = "a" * 40


class CIHelpersTest(unittest.TestCase):
    def select(self, override="", repository="ravionxgroup/agenttrust-platform", sibling="ravionxgroup/agenttrust"):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            shutil.copy(HERE / "select-pair.py", directory)
            (directory / "compatible.json").write_text(json.dumps({"repository": sibling, "revision": "b" * 40}))
            output = directory / "output"
            env = dict(os.environ, SELF_REPOSITORY=repository, EVENT_SHA=SHA,
                       PLATFORM_OVERRIDE=override, SDK_OVERRIDE="", GITHUB_OUTPUT=str(output))
            result = subprocess.run([sys.executable, str(directory / "select-pair.py")],
                                    env=env, capture_output=True, text=True)
            return result.returncode, output.read_text() if output.exists() else ""

    def test_reviewed_default_pair(self):
        code, output = self.select()
        self.assertEqual(code, 0)
        self.assertIn("platform=" + SHA, output)
        self.assertIn("sdk=" + "b" * 40, output)

    def test_invalid_revisions_are_not_interpreted(self):
        for value in ("main", "a" * 39, "A" * 40, "$(echo unsafe)", SHA + "\nunsafe"):
            with self.subTest(value=value):
                self.assertNotEqual(self.select(value)[0], 0)

    def test_repository_allowlist(self):
        self.assertNotEqual(self.select(repository="external/untrusted")[0], 0)
        self.assertNotEqual(self.select(sibling="external/untrusted")[0], 0)

    def test_manual_pair_must_be_reachable(self):
        for reachable in (True, False):
            env = {"MANUAL_PAIR": "true", "PLATFORM_EXPECTED": SHA, "SDK_EXPECTED": SHA}
            def output(args, **kwargs):
                return "refs/remotes/origin/main\n" if "for-each-ref" in args else SHA + "\n"
            with patch.dict(os.environ, env, clear=True), patch("subprocess.check_output", side_effect=output), \
                 patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0 if reachable else 1)), \
                 contextlib.redirect_stdout(io.StringIO()):
                if reachable:
                    runpy.run_path(str(HERE / "check-pair.py"))
                else:
                    with self.assertRaises(SystemExit):
                        runpy.run_path(str(HERE / "check-pair.py"))

    def test_checkout_must_match_selection(self):
        with patch.dict(os.environ, {"PLATFORM_EXPECTED": SHA}, clear=True), \
             patch("subprocess.check_output", return_value="b" * 40):
            with self.assertRaises(SystemExit):
                runpy.run_path(str(HERE / "check-pair.py"))

    def test_results_require_executed_passing_tests(self):
        cases = [("<testsuites><testsuite><testcase/></testsuite></testsuites>", True),
                 ("<testsuite/>", False),
                 ("<testsuite><testcase><skipped/></testcase></testsuite>", False),
                 ("<testsuite><testcase><failure/></testcase></testsuite>", False),
                 ("<testsuite><testcase><error/></testcase></testsuite>", False)]
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.xml"
            for xml, passed in cases:
                report.write_text(xml)
                result = subprocess.run([sys.executable, str(HERE / "check-results.py"), str(report)],
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, passed)


if __name__ == "__main__":
    unittest.main()
