# Parish calendar setup

The calendar on the homepage and on **Resources → Dates & Events** is pulled straight from a Google
Calendar every time the site is built. Nobody has to edit code to add a service: add the event in
Google Calendar and it appears on the site.

Until a calendar is connected, the Dates & Events page shows a short "not connected yet" notice and
the homepage calendar section hides itself. The build never fails because of the calendar.

## 1. Create the calendar

1. Sign in to [Google Calendar](https://calendar.google.com/) with the parish account.
2. In the left sidebar, next to **Other calendars**, click **+** → **Create new calendar**.
3. Name it something like `Saint Elizabeth Parish Calendar`, set the timezone to **(GMT-08:00)
   Pacific Time**, and click **Create calendar**.

Use a parish account rather than a personal one, so access survives a change of secretary.

## 2. Make it public

1. Open **Settings and sharing** for the new calendar.
2. Under **Access permissions for events**, tick **Make available to public**.
3. Leave the dropdown on **See all event details**.

This is what lets the website read the calendar without any password or API key, so there is nothing
secret to commit.

## 3. Find the calendar ID

On the same settings page, scroll to **Integrate calendar**. Copy the **Calendar ID**. It looks
like:

```
abc123def456@group.calendar.google.com
```

## 4. Tell the site about it

Open `src/_data/site.json` and paste the ID:

```json
"googleCalendarId": "abc123def456@group.calendar.google.com"
```

Commit the change. The next build picks it up. A public calendar ID is not a secret, so it is safe
in the repository.

### If the calendar has to stay private

Prefer the public route above. If the parish genuinely cannot make the calendar public, use the
**Secret address in iCal format** from the **Integrate calendar** section instead. That URL _is_ a
credential — anyone holding it can read the calendar — so it must never be committed. Set it as an
environment variable in the host's build settings (in Netlify: **Site configuration → Environment
variables**):

```
GOOGLE_CALENDAR_ID=https://calendar.google.com/calendar/ical/.../private-.../basic.ics
```

`GOOGLE_CALENDAR_ID` always wins over `site.json`, so it also works for local testing:

```sh
GOOGLE_CALENDAR_ID='...' task build
```

## How events are displayed

- **Dates & Events** shows Google's month grid at the top, then every event for the next 12 months
  grouped under month headings, with links to jump to a month.
- The **homepage** shows an "Upcoming Events" list covering the next 14 days. It hides itself when
  there is nothing in that window.
- **All-day events** show only a date. Use these for feasts, fasts, and observances.
- **Timed events** also show the start time in Pacific time. Use these for services.
- The **location** is shown when the event has one.

To change how far ahead each looks, edit `MONTHS_AHEAD` and `UPCOMING_DAYS` in
`src/_data/calendar.ts`.

## Colour tags

Some events get a coloured tag. An ICS feed carries no category field, so the tag is inferred from
words in the **event title**. The first rule that matches wins; an event matching nothing gets no
tag, which is normal for ordinary services like Divine Liturgy or Vespers.

| Tag        | Title contains any of                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pascha`   | pascha, holy week, great and holy, bright week                                                                                                                                                 |
| `patronal` | elizabeth, patronal, parish feast, altar feast                                                                                                                                                 |
| `charity`  | homeless, charity, food bank, outreach, almsgiving, benefit                                                                                                                                    |
| `social`   | fellowship, meal, potluck, picnic, coffee hour, social, banquet                                                                                                                                |
| `fast`     | fast, lent, lenten, abstinence, no meat, strict                                                                                                                                                |
| `feast`    | nativity, theophany, epiphany, annunciation, transfiguration, dormition, ascension, pentecost, presentation, meeting, exaltation, cross, palm sunday, entrance, beheading, circumcision, feast |

So `Homeless Ministry` is tagged `charity`, `Fellowship Meal` is tagged `social`,
`Nativity Fast begins` is tagged `fast` (the fast rule is checked before the feast rule), and
`Nativity of our Lord` is tagged `feast`. If an event gets the wrong tag, rename it in Google
Calendar; to change the rules themselves, edit `KIND_RULES` in `src/_data/calendar.ts`.

## Recurring services

Google Calendar's normal repeat options are fully supported, including:

- weekly, monthly, and yearly repeats;
- **skipping** a single occurrence (delete just that one);
- **changing** a single occurrence — moving next Saturday's Vespers to 4:00 PM shows the new time on
  that date only.

## Refresh timing

The site caches the feed for one hour during local development, so a change in Google Calendar may
take up to an hour to appear when running `task serve`. To see it immediately, delete the `.cache`
folder and rebuild. A deployed build always fetches fresh.

Because the site is static, **a calendar change only reaches the public site when the site is
rebuilt.** If the parish wants edits to publish automatically, set up a scheduled daily build in the
host (Netlify: **Build hooks** plus a scheduled trigger).

## Troubleshooting

| Symptom                              | Cause                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "not connected yet" notice           | `googleCalendarId` is still empty.                                                                                                                         |
| "could not load the calendar" notice | The ID is wrong, or the calendar is not public. Check the build log for the `[calendar]` warning.                                                          |
| Page loads but lists no events       | The calendar is connected and empty, or all its events are in the past.                                                                                    |
| The month grid is missing            | `GOOGLE_CALENDAR_ID` holds a full ICS URL. Only public calendars can be embedded, and embedding a private URL would publish it, so the grid is suppressed. |
| An event is missing                  | It is more than 12 months out. Change `MONTHS_AHEAD` in `src/_data/calendar.ts`.                                                                           |
| An all-day event shows the wrong day | It was created as a timed event just after midnight. Recreate it as all-day.                                                                               |
