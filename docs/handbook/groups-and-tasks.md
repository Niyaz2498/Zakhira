# Groups and tasks

A **group** is an effort you are making. A **task** is a piece of work inside
it. Every task belongs to exactly one group, and every group can hold both
tasks and further groups.

## General Tasks

Every account starts with one group called **General Tasks**, marked with a
padlock. It is the inbox for anything that does not deserve a project of its
own — a phone call to make, a form to fill in.

It is deliberately not a category like the others:

- It cannot be renamed, moved or deleted.
- It cannot hold sub-groups.
- It always appears first (see [Ordering your groups](group-order.md)).
- It reports a plain count of active tasks rather than main-quest progress,
  because a to-do pile has no finish line.

## Creating a group

Tap **+** in the Groups header. A group needs only a **name**; everything else
is optional:

- **Parent group** — leave it on *None — top level*, or pick a group to nest
  inside. General Tasks is never offered, since it cannot hold sub-groups.
- **Description** — one line, shown under the name in the list.
- **Due date** — picked from a calendar. See
  [Dates and the calendar](dates-and-calendar.md).

To create a group already nested inside another, open the parent and use
**+ Subgroup** — it opens the same form with the parent filled in.

## How a group reports progress

Each group in the list shows **`done/total` main quests** and a progress bar.

Two rules decide those numbers, and both exist so the figure cannot flatter
you:

- **Only Main Quests count.** Side Quests and Exploration tasks are never in
  the total, however many you finish. Chapter 4 explains why.
- **Sub-groups roll up.** A parent counts its own main quests *and* every main
  quest beneath it, at any depth. The row says `· incl. subs` when it is doing
  this. A parent cannot read as finished while a sub-group still has open main
  quests.

A group with no main quests anywhere inside it never reads as complete. An
empty group is not an achievement.

## Nesting, and moving a group

Sub-groups are shown indented under their parent, with a caret beside the name
to collapse and expand. Collapsing is a view on your own screen — it changes
nothing and is not remembered between visits.

To re-nest an existing group, open it and choose **Move**, then pick its new
parent or *None — top level*.

Two moves are refused, and the app simply does not offer them:

- **Into General Tasks**, which holds no sub-groups.
- **Into itself or one of its own sub-groups**, which would detach the whole
  branch from the tree and take its tasks out of sight with it.

## Deleting a group

Open the group and choose **Delete**. You are told exactly what is inside —
how many sub-groups and how many tasks — and then offered two ways out:

**Keep contents.** Nothing is destroyed. The group's own tasks move to General
Tasks, and its sub-groups are promoted to wherever the deleted group sat. Use
this when the grouping was wrong but the work still matters.

**Delete all.** The group, every sub-group beneath it, and every task inside
any of them are removed. The button names the number of tasks this will take.
There is no undo.

General Tasks cannot be deleted.

## Creating a task

Open a group and tap **+**. A task needs a **title** and a **type**:

- **Title** — what the work is.
- **Type** — Main Quest, Side Quest or Exploration. Defaults to Main
  Quest. See [Task states and types](task-states-and-types.md).
- **Due date** — optional, picked from a calendar.
- **Notes** — optional. This is the task's *brief*: what it is and what done
  looks like. It is a single field that you overwrite when it changes, not a
  log — running commentary belongs in [Comments](comments.md).

On the desktop you can also set a **priority** — Low, Medium or High — when
creating the task. The phone's create form has no priority field; a priority
set on the desktop is shown on the phone.

## Changing a task after it exists

This is the sharpest difference between the two apps.

**On the desktop**, open a task and edit it: title, type, priority, due date
and notes can all be changed, and the priority can be cleared back to none.

**On the phone**, all of those are fixed once the task is created. What you
*can* do from the phone is everything about its progress — change its state,
run its timer, and write comments.

If you mistype a task title on the phone, you need the desktop to fix it. The
alternative is to scrap the task and create it again.

## Finding a task

Groups is the full tree, and tapping any group opens it: its sub-groups first,
then its tasks, with finished ones below a **Completed** divider.

The [Dashboard](overview.md) is usually faster. It shows every task that is
still open, and nothing that is finished, grouped however you ask:

- **Type** — Main Quests, then Side Quests, then Exploration.
- **Group** — one section per group, each headed by its full path
  (`Offl › Firmware`), so two sub-groups sharing a name stay distinct.
- **Status** — To-Do, In Progress, Blocked.

There is no search. With the Dashboard showing only open work and the Groups
tree ordered the way you chose, the lists stay short enough to read.
