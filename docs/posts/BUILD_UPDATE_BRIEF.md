# Build Update Brief — Day X

This template generates the inputs for a FugaEdge `build_update` social post.
Claude Code fills it out at the end of a day-shipping session, the founder
pastes the filled brief into the Canva chat, and the Canva chat produces the
final post.

---

## Sprint position

- Version: vX.Y.Z (e.g. v0.2.0)
- Day: NN or NN.5 (zero-padded, e.g. 08, 07.5)
- Status: shipped | in_progress | blocked
- Date shipped: YYYY-MM-DD (ISO 8601)

## What shipped

Two to four bullet points. Plain language, no jargon. Include test counts and
commit hashes if relevant.

-
-
-

## Headline codename

A snake_case name for the most important thing that shipped. 1-3 segments,
all lowercase, underscore-separated. Examples: safety_net, aggregator_fix,
universal_import, webull_parser. This becomes the hero of the post.

**Codename:**

## Why it matters (one sentence)

The human-readable "why this shipped" — usually traces back to a real user
incident, real friction, or a known limitation being closed. Keep it
peer-to-peer, not vendor-to-customer. Name the trader if relevant and if
public attribution is appropriate.

**Why:**

## What's next

The single most important thing coming next. Either tomorrow's Day or the
next major milestone. Snake_case codename, same format as the headline.

**Next codename:**

## Public attribution check

Anyone named in the brief (e.g. a beta tester) — confirm they're OK with
public mention OR mark them as "generic" so the post uses "a beta tester"
instead of their name.

- [ ] Names cleared for public attribution
- [ ] Use generic references instead

## Anything off-limits

Anything the founder doesn't want mentioned publicly in this post — internal
metrics, partnership discussions, unshipped features, anything sensitive.

-

---

## Instruction to Claude Code

At the end of a day-shipping session, before final handoff, generate this
brief by filling in every section above using the actual work that shipped
today. Output the filled brief in a code block so the founder can copy-paste
it directly. Do NOT include any commentary, just the filled brief.
