# Overview

Zakhira is a personal quest log. It holds the work you mean to do, in the
shape you actually think about it: a handful of ongoing efforts, each with
tasks underneath, some of which matter and some of which are just tinkering.

It is built for one person — you. There is no sharing, no assigning, nobody
else's notifications.

## The shape of it

**Groups** are the efforts. A group might be a project, a course, a house
move, or just "admin". Groups can contain other groups, so a large effort can
be broken into parts without inventing a second concept for it.

**Tasks** are the work. Every task lives in exactly one group and carries a
**type** — Main Quest, Side Quest or Exploration — that says whether finishing
it actually moves the group forward. That distinction is the point of the
whole app: a group is complete when its **main quests** are done, so the side
work you inevitably pick up never quietly moves the finish line.

A task also has a **state**, and optionally a due date, a priority, notes, a
running timer and a log of comments. Chapters 4 onward take these in turn.

## Two apps, one account

Zakhira runs as an **Android app** and a **macOS app**. You sign in to the same
account on both and they show the same data.

They are not identical, and it is worth knowing which is which:

| | Phone | Desktop |
|---|---|---|
| Browse, create groups and tasks | yes | yes |
| Change a task's state, run its timer, write comments | yes | yes |
| **Edit** a task's title, type, priority, due date or notes | no | yes |
| Set a task's priority when creating it | no | yes |
| Reorder your groups | yes | no |
| Task History — find and recover finished work | no | yes |
| Create a reminder | no | yes |
| Hourly alerts for a timer left running | yes | no |

The phone is for doing the work; the desktop is for arranging it. Where
something exists on only one of them, the chapter that covers it says so.

## Getting your data in step

Zakhira syncs on its own. The phone syncs when you open it and whenever you
bring it back to the foreground; pull down on the Dashboard, or tap **↻** in
its header, to sync immediately. The desktop syncs on launch and then every
minute.

Changes are written to your account as you make them — a state change, a
timer, a comment — rather than being held until you save, so nothing is lost
by closing the app. The few places that do have a Create or Save button are
forms, where the button is what tells Zakhira you have finished filling it in.

You can see when each app last synced, and which server it is talking to,
under **Settings → Sync**.

## Where things live

On the phone, four tabs along the bottom:

- **Dashboard** — everything still open, counted and laid out. Start here.
- **Groups** — the tree of groups, and the way into any task.
- **Reminders** — a read-only list of your reminders.
- **Settings** — theme, sync status, sign out.

On the desktop, the same four in a sidebar, plus **Task History** for work
that is already finished.

## What Zakhira deliberately does not do

- **No sharing or collaboration.** One account, one person.
- **No sub-tasks.** A task is the smallest unit. If something needs breaking
  down, it wants to be a sub-group with its own tasks.
- **No offline editing.** Both apps need to reach the server to change
  anything. A change attempted with no connection fails and tells you so; it
  is not queued up to send later.
- **Offline reading differs by app.** The desktop keeps your last-loaded
  groups and tasks, so it opens with them and you can read while offline. The
  phone does not: reopened with no connection, it comes up empty until it can
  reach the server again. Nothing is lost either way — the data is on your
  account, not on the device.
