# Task states and types

Every task carries two labels that mean different things. Its **type** says
whether the work counts. Its **state** says where the work has got to.

## Types: what counts

You pick a type when you create a task. It can be changed later on the
desktop, along with the task's other details; on the phone it is fixed once
created.

| | Type | What it means |
|---|---|---|
| ⚔ | **Main Quest** | Real progress. The group is not finished until this is. |
| 📍 | **Side Quest** | Worth doing, but the group can finish without it. |
| ⚗ | **Exploration** | Looking into something. May lead nowhere, and that is fine. |

**Only Main Quests count toward a group's progress.** A group showing `3/7
main quests` is counting main quests alone, however many side quests and
explorations sit beside them.

This is the one rule the whole app is arranged around. Work expands — you
start a project and immediately find six adjacent things worth doing — and if
everything counted, the finish line would move every time you were diligent.
Filing that work as a Side Quest or an Exploration lets you record it, track
time against it and comment on it, without it ever making the project look
further from done.

The type is also a colour. Dashboard tiles are outlined in their type's
colour, and an open task shows its type and icon at the top in the same
colour. Inside a group, the task rows are plainer — there the coloured dot on
each row is its *state*, not its type.

## States: where the work is

A task is always in exactly one of five states. Open a task and tap a state
under **Status** to change it.

**Open states** — the task is still live, and appears on the Dashboard:

- **To-Do** — not started. Where every task begins.
- **In Progress** — being worked on now.
- **Blocked** — stalled on something. Nothing enforces this; it is a flag you
  set so the Dashboard can count it.

**Closed states** — the task is finished with, and leaves the Dashboard:

- **Completed** — done.
- **Scrapped** — abandoned. Not a failure state, and not a lesser one; it
  exists so you can take something off the list honestly rather than leaving
  it to rot in To-Do, or deleting it and losing the record.

Within a group's task list, open tasks are ordered In Progress, then To-Do,
then Blocked — what you are doing now sits at the top. Finished tasks sink
below a **Completed** divider and render dimmed.

## Closing a task locks it

Marking a task Completed or Scrapped closes it, and a closed task is
deliberately rigid:

- Its title, type, priority, due date and notes can no longer be changed.
- Its comment log is **locked** — you cannot add, edit or delete entries. The
  existing log stays readable.
- The status buttons disappear, so you cannot move it to another state from
  the task itself.
- It stops counting as overdue, whatever its due date, because the deadline
  has stopped mattering.

The intent is that a finished task is a record of what happened, not a
document that keeps changing afterwards.

Two things are still allowed. A **timer left running** can be stopped, so
time is not stranded on a task you closed mid-session. And the task can be
**recovered**, below.

## Recovering a finished task

If you close a task by mistake, or a job comes back, use **Task History** on
the desktop. It lists everything completed and scrapped, newest first, grouped
by month, with filters for **All**, **Completed** and **Scrapped**.

**Recover** puts the task back into **To-Do**, unlocked and live again.

Recovery always lands on To-Do — never straight back to In Progress or
Blocked. Set the state you actually want afterwards.

Two limits worth knowing:

- **Task History is desktop-only.** The phone has no way to see or recover a
  finished task outside the group it lives in, where it still appears below
  the Completed divider.
- **A task whose group has been deleted cannot be recovered**, because there
  is nowhere to put it back.

## What the Dashboard counts

The tiles across the top of the Dashboard count tasks, not groups:

- **To-Do**, **In Progress**, **Blocked** — current totals by state.
- **Overdue** — open tasks whose due date has passed. Completed and scrapped
  tasks are never counted here.
- **Done/Month** and **Scrp/Month** — tasks completed and scrapped **this
  calendar month**, which resets on the 1st.

The two monthly tiles go by when the task was last changed, so recovering an
old task and re-completing it counts it in the month you did that.
