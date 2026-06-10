# Release Announcement Brief — vX.Y.Z

This brief generates the inputs for a FugaEdge `release_announcement` social post.
Claude Code fills it out at the end of a release session, the founder pastes the
filled brief into a Canva chat, and the Canva chat produces the final slot values
+ X caption.

**Template:** `FugaEdge / release_announcement` (already built + published in Canva Brand Kit).
This brief produces FILL VALUES for that template — not a rebuild.

---

## CRITICAL — verify against the actual GitHub release

Before filling this brief, read the ACTUAL published GitHub release notes for this
version — NOT just the day's headline work. Briefs generated from memory or from a
single session's work have historically missed shipped features (e.g. v0.2.3's brief
missed Trash, the headline feature). The release notes are the source of truth for
what shipped.

GitHub release URL: https://github.com/jahjafuga/FugaEdge/releases/tag/vX.Y.Z

---

## Sprint position

- Version: vX.Y.Z
- Status: shipped
- Date shipped: YYYY-MM-DD (the actual GitHub release date)

## Theme codename

A snake_case name for the RELEASE as a whole (not a single feature). This becomes
the codename under the version number on the post. Examples: universal_import,
dedup_fix, day_detail, trash_recovery.

**Codename:**

## Hero version

The version number, exactly as it appears on GitHub. Examples: v0.2.0, v0.2.3.

**Version:**

## Body (one to two sentences)

The "what this release means" statement in plain, peer-to-peer language. NOT a feature
list — the single most important user-facing change, stated as the new state of the
world. Rhythm: [the new capability]. [what the user can now do].

Examples:
- "FugaEdge now works regardless of broker. Drop any supported CSV — the right parser fires automatically."
- "Deleted the wrong trade? It now goes to Trash, not gone. 30 days to restore."

**Body:**

## What shipped (bullets)

The user-facing features that shipped, pulled from the ACTUAL release notes. Each
becomes a → bullet on the image. Rules:
- 3 bullets for a focused patch, 4-5 for a meaty release. Don't pad.
- Plain English, not internal jargon (e.g. "Cross-format duplicate detection", not "content_hash column").
- ONLY user-facing features. Exclude internal work (security audits, release ceremony,
  refactors, test infrastructure) — those don't go on the post.
- Lead with the biggest / most relatable feature.

**Bullets:**
-
-
-

## What's next

Optional. The next version or major feature, if you want a forward hook. Often omitted
on release posts (the release itself is the moment).

**Next codename:**

## Public attribution check

Anyone named in the release (e.g. a beta tester whose bug was fixed) — confirm public
mention is OK OR mark generic. NOTE: GitHub release notes often credit testers by name
already; the X post usually stays generic and leads with the feature, not the person.

- [ ] Names cleared for public attribution
- [ ] Use generic references instead

## Anything off-limits

Internal items that must NOT appear publicly — security findings, PII/history remediation,
partnership specifics, revenue/user numbers, infrastructure quirks, cost decisions.

-

---

## X caption guidance for the Canva chat

- Standard pattern: mirror the image (version + codename headline, then the bullets,
  then a download link). Consistent with all prior release posts.
- Download link: `github.com/jahjafuga/FugaEdge/releases/latest` (future-proof — always
  resolves to the current release, even after later versions ship).
- Keep under 280 characters. The image carries the full bullet list; the caption can
  carry the top 3-4 if all 5 don't fit.
- End with #buildinpublic.
- Always verify the GitHub release is live, public, and downloadable BEFORE posting.

## Instruction to Claude Code

At the end of a release session, before final handoff, generate this brief by reading
the ACTUAL published GitHub release notes (not just today's session work) and filling in
every section above. Output the filled brief in a code block for copy-paste. Do NOT
include commentary, just the filled brief.
