"""A skipped real integration test is not a passing verification."""
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
tests = root.findall(".//testcase")
if not tests or any(test.find("skipped") is not None for test in tests):
    raise SystemExit("FAIL: integration requires executed tests with zero skips")
if any(test.find("failure") is not None or test.find("error") is not None for test in tests):
    raise SystemExit("FAIL: integration test failure")
print("PASS: " + str(len(tests)) + " tests executed; zero skips")
