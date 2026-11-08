# Reminders

A **reminder** is a note to yourself attached to an hour of the day — take
medication at 9, renew the insurance every year, call someone back this
afternoon.

> **Read this first.** Reminders in Zakhira are **a stored list, not an
> alarm.** Nothing fires them: neither app will notify you when a reminder's
> hour arrives, and no alert, badge or sound is produced. A reminder is
> something you create and then go and look at.
>
> The one thing in Zakhira that *does* notify you is an hourly nudge about a
> task timer left running, which is unrelated to reminders and covered in
> [Tracking time](tracking-time.md).
>
> The rest of this chapter describes what reminders do today.

## What a reminder holds

- **Title** — required. What you want to be reminded of.
- **Hour** — required, `0`–`23`. Whole hours only; there are no minutes.
- **Recurrence** — **Once**, **Daily** or **Yearly**.
- **Date** — offered for Once and Yearly. For Yearly it is the month and day
  the reminder lands on each year. Daily reminders have no date.
- **Linked task** — optional. A reminder can be attached to a task, or stand
  on its own. Only open tasks can be linked.

## Creating one

**On the desktop:** Reminders → **+ New Reminder**.

**On the phone: you cannot.** The Reminders tab lists what you already have
and nothing more — the **+ New** button in its header does not currently open
anything. Create reminders on the desktop; they appear on the phone at the
next sync.

## Reading the list

Both apps show the same two sections, and only the sections that have
anything in them:

- **Standalone** — reminders not attached to a task.
- **Task Reminders** — reminders linked to a task.

Each row shows the title, then the hour, the recurrence and the date if it
has one — `9:00 · Daily`, or `8:00 · Yearly · 2027-03-14`.

A reminder that has been snoozed shows a **Snoozed** marker. Nothing in
either app can snooze one, so in practice you will only see this if something
set it through Zakhira's API.

## What you cannot do yet

Stated plainly, because an unexplained gap reads as a bug:

- **No notifications.** A reminder never alerts you.
- **No creating on the phone.**
- **No editing.** A reminder's title, hour, recurrence, date or linked task
  cannot be changed in either app once created.
- **No deleting.** Tapping a reminder does nothing in either app.
- **No snoozing or dismissing**, and nothing marks a reminder as dealt with.

Taken together: today a reminder is a durable note that syncs between your
devices. If you need something to actually tell you at a particular time, use
your phone's own clock or calendar.
