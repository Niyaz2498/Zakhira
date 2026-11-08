# The Zakhira handbook

What the app does, written for someone who will use it and never read the code.

This is the answer to "what exactly does Zakhira have?" — and, if the app is
ever rebuilt for another platform, the list of what must survive the move.

## What belongs here, and what does not

| Question | File |
|---|---|
| What does it do, and how do I use it? | **here** |
| How is it built? | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) |
| Why was it built that way? | [`DECISIONS.md`](../../DECISIONS.md) |
| What was it originally meant to be? | [`DESIGN.md`](../../DESIGN.md) |
| How do I deploy or release it? | [`DEPLOY.md`](../../DEPLOY.md), [`RELEASING.md`](../RELEASING.md) |

The split is by **audience**, and keeping it clean is what stops these files
contradicting each other. If a paragraph here explains the sync protocol, the
group-cycle check or anything about a table, it belongs in `ARCHITECTURE.md`.
A reader of this handbook should be able to finish it without learning that
the backend exists.

`DESIGN.md` is the original product vision — intent, written up front. It is
**not** a description of the app as it stands, and parts of it were overtaken
by the code. Where the two disagree, this handbook is right.

## Chapters

The order lives here rather than in filename prefixes, so inserting a chapter
never means renaming the ones after it. When the PDF build arrives, it reads
this list.

1. *Overview* — not yet written
2. *Groups and tasks* — not yet written
3. *Task states and types* — not yet written
4. *Prerequisites* — not yet written
5. *Tracking time* — not yet written
6. *Comments* — not yet written
7. [Dates and the calendar](dates-and-calendar.md)
8. *Reminders* — not yet written
9. *Themes and settings* — not yet written

"Not yet written" is deliberate and honest: the handbook starts from today and
fills in backwards, rather than pretending to be complete. A chapter is written
when its feature is next touched, or in a dedicated pass.

## Writing conventions

- **Second person, present tense.** "You pick a date", not "the user selects a
  date" or "we added a date picker".
- **Describe what is, not what changed.** No release notes, no "new in 1.4" —
  this is a description of the app, and git already records history.
- **Lead with the task, not the control.** A reader arrives wanting to set a
  due date, not wanting to meet a calendar component.
- **Name the limits.** Where something cannot be done — a due date in the past,
  a prerequisite from another group — say so plainly and say why. Unexplained
  restrictions read as bugs.

## Screenshots

- Live in `images/`, named for what they show: `calendar-sheet-dark.png`.
- **Dark theme by default.** Add a light shot only where the difference is the
  point, not for parity.
- **Every image gets a caption**, and the caption carries the meaning — a
  reader skimming only prose should miss nothing. The picture confirms, it does
  not inform.
- **Only where the visual is the point:** a grid, a layout, the two themes. A
  picture of a text field teaches less than a sentence.

That last rule is a maintenance decision, not an aesthetic one. Screenshots are
the fastest-rotting thing in any documentation: one change to an accent token
silently falsifies every image in the book, and nothing fails to warn you. Keep
the count low enough that re-shooting them is an afternoon, not a project.

Shots are captured on the Pixel_10_Pro AVD, cropped to the region that matters.
Keep the device and the crop style consistent or the pages look ragged.

## Keeping it true

Handbook changes ride in the **same PR** as the feature that caused them, which
is phase 4 of the `ship-feature` skill — screenshots are taken while the
emulator from the testing phase is still running, before teardown.

This is the whole mechanism. A doc updated on its own cadence drifts by
construction; `DESIGN.md` is the proof, and it drifted inside a single day.
