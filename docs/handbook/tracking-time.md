# Tracking time

Every task has a stopwatch. Open a task and you will find **Time Logged**,
showing the total time banked against it and the controls to add more.

Timing is entirely optional. A task you never time simply reads `0s` forever,
and nothing asks you about it.

## Running the timer

**Start** begins a session. The total starts counting up live, once a second,
and the card picks up the accent colour so a running timer is obvious at a
glance.

**Stop** ends the session and adds its length to the task's total.

**Reset** clears the task's logged time back to zero. It asks first, because
it discards every session ever recorded against the task, not just the last
one. It is unavailable while a timer is running — stop first.

The running total you see is the banked time plus the current session, so the
number on screen is always the real figure rather than the last saved one.

## The timer belongs to the task, not the device

A session is anchored on your account, so it keeps running when you close the
app, and a timer started on one device can be seen and stopped from the other.

The practical consequence: **a timer left running keeps counting**. Closing
the app, locking the phone or going offline does not pause it. Only Stop
stops it.

## Hourly nudges, on the phone

Because a forgotten timer runs all night, the phone reminds you about one
that is still going: once an hour, for up to a day, a notification says which
task it is and how long the current session has been running.

Some details worth knowing:

- **The phone asks for notification permission the first time you start a
  timer**, not on first launch. Decline it and timers still work exactly as
  before — you simply get no nudges.
- **The alerts count the current session**, not the task's total. A task with
  45 minutes already banked that you restart will nudge at one hour of *new*
  running time.
- **They follow the timer, not the device.** Stop a timer on the desktop and
  the phone drops the pending alerts the next time it syncs.
- **This is phone-only.** The desktop app never notifies you about a running
  timer.

## Timers and finished tasks

The Start and Reset buttons disappear once a task is Completed or Scrapped —
you cannot log new time against finished work.

One exception exists on purpose: a timer that was **already running** when the
task was closed can still be stopped, so the session is not stranded.

## The Dashboard's time tiles

The Dashboard shows four totals — **Today**, **Week**, **Month** and **All**.

Read these as a rough sense of activity rather than a timesheet, because of
how they are counted: each tile adds up the **whole** logged time of every
task that was *touched* in that period. A task you have timed for ten hours
over a month, and changed today, contributes all ten hours to **Today**.

So the tiles answer "how much time is on the things I have been working on
lately", not "how many hours did I log today". **All** is the only one that
is unambiguous: the total logged time across every task.

There is no per-session history. A task records one running total, not a list
of when the time was spent.
