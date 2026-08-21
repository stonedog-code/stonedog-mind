#!/usr/bin/env python3
"""One-off content fix: remove the length tell from correct answers.

The validator flagged 61 items where the correct option was conspicuously the
longest. That is a real defect in the questions, not a false positive: a
test-wise candidate can pick the longest option and score well without knowing
the material, which makes the retention signal meaningless.

The cause was uniform — the correct option carried a "…, so <justification>"
clause the distractors lacked. The justification already appears in `explain`,
which is where it belongs. This script trims the option down to the bare claim.

Text replacement, not a YAML round-trip, so the comments and block scalars in
the pack files survive.
"""

from pathlib import Path
import sys

# item id -> (old correct option text, new correct option text)
TRIMS = {
    # agile
    "velocity-misuse": ("Story points are a relative unit calibrated within one team, so the numbers are not commensurable", "Story points are calibrated within one team, not across teams"),
    "sprint-goal": ("A single coherent objective that gives the Sprint focus and allows scope to flex while the goal holds", "A single coherent objective that the Sprint's scope can flex around"),
    "retro-purpose": ("The Retrospective inspects the process and team; the Review inspects the product with stakeholders", "The Retrospective inspects the process; the Review inspects the product"),
    "invest": ("Negotiable — a story is a placeholder for a conversation, not a fixed contract", "Negotiable — a placeholder for a conversation, not a contract"),
    "standup-antipattern": ("Each person reports to the Scrum Master or a manager rather than the team planning its next day", "People report outward to a manager instead of planning together"),
    "tech-debt": ("A deliberate trade-off taken to ship sooner, carrying interest that must be repaid", "A deliberate trade-off taken to ship sooner, carrying interest"),
    "three-amigos": ("Business, development and testing — so intent, feasibility and falsifiability are all present before code", "Business, development and testing, together before any code"),
    # animals
    "swan-pairs": ("Pairing for many years, often for life", "Pairing for many years"),
    "horse-sleep": ("Standing up, thanks to a locking arrangement in their legs", "Standing up, on locking legs"),
    "cat-purr": ("When content, and also when unwell or unsettled", "When content, and when unsettled"),
    "bat-navigation": ("By listening to the echoes of its own calls", "By echoes of its own calls"),
    "pigeon-homing": ("It senses the Earth's magnetic field, alongside the sun and landmarks", "It senses the Earth's magnetic field"),
    # aws
    "iam-role-vs-user": ("Roles issue short-lived rotating credentials, so there is no long-lived secret to leak", "Roles issue short-lived credentials that rotate automatically"),
    "kms-envelope": ("KMS caps direct encryption at 4 KB, and a locally used data key avoids a network call per operation", "KMS caps direct encryption at 4 KB, and local keys avoid a network call"),
    "secrets-vs-param": ("Built-in automatic rotation with Lambda integration, and cross-region replication", "Built-in automatic rotation and cross-region replication"),
    "lambda-cold-start": ("Provisioned concurrency, which keeps initialised execution environments warm", "Provisioned concurrency, keeping environments initialised"),
    "sqs-fifo": ("Exactly-once processing within a deduplication window, and strict ordering within a message group", "Strict ordering per message group and deduplication"),
    "rds-multi-az": ("Synchronous standby replication in another AZ for automatic failover — availability, not read scaling", "A synchronous standby in another AZ for automatic failover"),
    "s3-lifecycle": ("Transitioning objects between storage classes or expiring them automatically as they age", "Transitioning objects between storage classes, or expiring them"),
    "cloudfront-oac": ("The bucket stays private and only CloudFront can read it, so nobody can bypass the CDN", "The bucket stays private and only CloudFront can read it"),
    "vpc-endpoint": ("Traffic to S3 stays on the AWS network instead of traversing a NAT gateway, cutting cost and exposure", "Traffic reaches S3 without traversing a NAT gateway"),
    "region-az": ("One or more discrete data centres within a region, with independent power and networking", "One or more discrete data centres with independent power"),
    # csharp
    "struct-vs-class": ("A struct is a value type copied on assignment; a class is a reference type where assignment copies the reference", "A struct is a value type; a class is a reference type"),
    "async-void": ("Exceptions cannot be caught by the caller and are raised on the synchronization context, usually crashing the process", "Its exceptions cannot be caught by the caller and crash the process"),
    "configureawait": ("Allows the continuation to run on any thread pool thread rather than resuming on the captured context", "Lets the continuation resume off the captured context"),
    "idisposable-using": ("Calls Dispose at the end of the enclosing scope, even if an exception is thrown", "Calls Dispose at the end of scope, even on an exception"),
    "string-immutable": ("Strings are immutable, so each concatenation allocates a new string and copies both operands", "Strings are immutable, so each concatenation allocates and copies"),
    "nullable-reference": ("The compiler will warn where the value is dereferenced without a null check — it is static analysis, not runtime enforcement", "The compiler warns on unchecked dereferences — analysis, not enforcement"),
    "record-equality": ("Records compare by value across all fields by default; classes compare by reference", "Records compare by value; classes compare by reference"),
    "yield-return": ("A compiler-generated state machine that yields items lazily as the caller enumerates", "A compiler-generated state machine that yields lazily"),
    "task-result-deadlock": ("The caller blocks the context thread that the awaited continuation needs in order to resume", "The caller blocks the thread the continuation needs to resume"),
    "ienumerable-vs-iqueryable": ("IQueryable translates the predicate into SQL; IEnumerable pulls every row into memory and filters there", "IQueryable becomes SQL; IEnumerable filters in memory"),
    "readonly-vs-const": ("const is inlined into consuming assemblies at compile time, so changing it requires recompiling them", "const is inlined into consuming assemblies at compile time"),
    "boxing": ("Wrapping a value type in a heap-allocated object so it can be treated as a reference type", "Wrapping a value type in a heap-allocated object"),
    # geography
    "tulips": ("The Netherlands", "The Netherlands"),  # handled by lengthening distractors below
    # playwright
    "auto-waiting": ("Waits for the element to be attached, visible, stable, enabled and able to receive events", "Waits for it to be visible, stable, enabled and hittable"),
    "locator-vs-elementhandle": ("A Locator is a lazy description re-resolved on each use; an ElementHandle points at one DOM node and goes stale", "A Locator is re-resolved on each use; an ElementHandle goes stale"),
    "web-first-assertions": ("The first retries until the text appears or the timeout expires; the second reads once and fails on any delay", "The first retries until the text appears; the second reads once"),
    "storage-state": ("It saves cookies and localStorage after one login so later tests start authenticated without repeating the UI flow", "It saves cookies and localStorage so later tests start signed in"),
    "test-isolation": ("A fresh browser context — its own cookies, storage and cache — reusing the browser process", "A fresh, isolated browser context"),
    "trace-viewer": ("A full recording — DOM snapshots, actions, network, console — of the retried run, for the trace viewer", "DOM snapshots, actions, network and console for the retried run"),
    "route-mocking": ("Intercepting matching network requests to fulfil, modify or abort them", "Intercepting requests to fulfil, modify or abort them"),
    "strict-mode-violation": ("A strict mode violation error, naming the matches", "A strict mode violation error"),
    "no-locators-in-tests": ("Selector knowledge belongs in one page object, so a markup change is one edit rather than many", "Selector knowledge belongs in one page object"),
    # pytest
    "fixture-scope": ("The fixture is created once for the whole test run and shared by every test that requests it", "It is created once per run and shared by every test"),
    "parametrize-ids": ("One separate test case per parameter set, each independently reported and selectable", "One separate, independently reported test per parameter set"),
    "conftest-purpose": ("Fixtures, hooks and plugins shared by every test in that directory and below, with no import needed", "Fixtures and hooks shared by that directory and below, unimported"),
    "raises-usage": ("It is too broad — any unexpected error, including a typo, satisfies it and the test passes", "It is too broad — any unexpected error satisfies it"),
    "xfail-vs-skip": ("skip does not run the test; xfail runs it and expects failure, reporting XPASS if it unexpectedly passes", "skip does not run the test; xfail runs it and expects failure"),
    "monkeypatch-scope": ("monkeypatch reverses every change at teardown, so it cannot leak into other tests", "monkeypatch reverses every change at teardown"),
    "strict-markers": ("A typo'd mark name silently doing nothing instead of failing", "A typo'd mark silently doing nothing"),
    "fixture-override": ("The module's own — the nearest definition wins, and it can request the outer one by the same name", "The module's own — the nearest definition wins"),
    # python
    "generator-vs-list": ("The first builds the whole list in memory; the second yields lazily and can only be consumed once", "The first builds a list; the second yields lazily, once only"),
    "dataclass-frozen": ("Immutability and a generated `__hash__`, so instances can be dict keys or set members", "Immutability and a generated `__hash__`"),
    "except-order": ("Handlers are tried in order and ValueError is a subclass of Exception, so the first matches first", "Handlers match in order, and ValueError subclasses Exception"),
    "context-manager-purpose": ("None in principle — it packages the same guarantee reusably, so callers cannot forget the cleanup", "None in principle — it packages the guarantee so callers cannot forget"),
    "walrus": ("Assigns a value as part of a larger expression, so a computed value can be tested and reused", "Assigns a value as part of a larger expression"),
    # istqb (private)
    "fl-1-3-1-presence": ("Testing shows the presence, not the absence of defects", "Testing shows presence, not absence, of defects"),
    "fl-1-4-4-traceability": ("It supports impact analysis, coverage assessment, and auditable reporting against requirements", "It supports impact analysis, coverage and auditable reporting"),
    "fl-5-1-3-entry-exit": ("Planned tests have been executed and the defect density is below the agreed threshold", "Planned tests are executed and defect density is below threshold"),
}

# A few items need longer DISTRACTORS instead — trimming the answer would lose
# meaning (a country name cannot be shortened).
DISTRACTOR_SWAPS = {
    "tulips": ('options: ["The Netherlands", "Denmark", "Belgium", "Sweden"]',
               'options: ["The Netherlands", "The Czech Republic", "Switzerland", "Luxembourg"]'),
}


def main() -> int:
    total = 0
    for path in sorted(Path("packs").glob("*.yaml")) + sorted(Path("packs-private").glob("*.yaml")):
        text = path.read_text(encoding="utf-8")
        original = text
        for old, new in TRIMS.values():
            if old != new and f"- {old}\n" in text:
                text = text.replace(f"- {old}\n", f"- {new}\n")
                total += 1
        for old, new in DISTRACTOR_SWAPS.values():
            if old in text:
                text = text.replace(old, new)
                total += 1
        if text != original:
            path.write_text(text, encoding="utf-8")
            print(f"  updated {path}")
    print(f"\n{total} option(s) rewritten.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
