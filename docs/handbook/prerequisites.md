# Prerequisites

A task can be held back by other tasks: *this cannot be done until those are*.
Zakhira calls those its **prerequisites**, and it will refuse to let you
complete a task while any of them is still open.

> **Read this first.** Prerequisites are enforced everywhere and shown on the
> desktop, but **neither app can currently set them.** There is no "add
> prerequisite" control in the phone app or the desktop app. A task only has
> prerequisites if something put them there through Zakhira's API.
>
> So this chapter describes a rule that is live and will affect you if you
> have such tasks — not a feature you can pick up and use today. The rest of
> the chapter is written for when you meet one.

## What they do

A prerequisite is simply another task. While **any** prerequisite of a task is
still open — To-Do, In Progress or Blocked — that task cannot be marked
Completed. The attempt is refused and tells you why.

A prerequisite stops blocking as soon as it is **closed**, which means either
**Completed** or **Scrapped**. Scrapping counts: deciding you are not going to
do something is a legitimate way to stop it holding up the work behind it.

Nothing else is affected. A blocked-by-prerequisites task can still be worked
on, timed, commented on, and moved to In Progress or Blocked. The only thing
it cannot do is finish.

## Seeing them

On the desktop, an open task lists its prerequisites. When it cannot yet be
completed, it says so directly — **"Blocked by:"** followed by the tasks still
in the way, and the Complete button explains itself rather than simply
failing.

The phone shows none of this. On the phone, a task with unmet prerequisites
looks ordinary until you tap **Completed**, at which point the change is
refused.

## The two rules that constrain them

**Prerequisites must be in the same group.** A task cannot depend on a task
somewhere else in the tree. This keeps a group readable on its own — you can
tell what is holding up the work without searching the rest of the app for an
invisible dependency.

The consequence to watch: **moving a task to a different group clears its
prerequisites.** They could not survive the move and remain valid, so they are
dropped rather than silently pointing somewhere unreachable. Nothing warns you
first.

**Prerequisites cannot form a loop.** A task cannot be made to depend on
itself, directly or through a chain of other tasks. A loop would be a set of
tasks none of which could ever be completed, because each is waiting on
another — so the whole chain is checked, not just the obvious case, and a
change that would close a loop is refused.

## Blocked the state, versus blocked by a prerequisite

These are unrelated, and the overlap in wording is unfortunate.

**Blocked** is a *state* you choose by hand, to record that something is
stuck — waiting on a delivery, a reply, a decision. Nothing enforces it and
nothing sets it for you.

**Blocked by a prerequisite** is a *rule* the app enforces, and it has no
effect on the task's state. A task with unmet prerequisites sits in To-Do like
anything else.

Setting a task's state to Blocked does not create a prerequisite, and a task
held up by a prerequisite does not move itself to Blocked.
