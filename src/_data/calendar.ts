import EleventyFetch from "@11ty/eleventy-fetch";
import ICAL from "ical.js";
import { DateTime } from "luxon";

import site from "./site.json" with { type: "json" };

/** How far ahead of today the calendar page and homepage look. */
const MONTHS_AHEAD = 12;

/** Guard against a malformed RRULE producing an unbounded expansion. */
const MAX_OCCURRENCES_PER_EVENT = 400;

/** How long a fetched calendar is reused before Eleventy refetches it. */
const CACHE_DURATION = "1h";

export type EventKind = "pascha" | "patronal" | "feast" | "fast" | "charity" | "social";

export interface CalendarEvent {
  /** ISO date (yyyy-mm-dd) in the parish timezone. */
  date: string;
  /** ISO timestamp, or null for all-day events. */
  start: string | null;
  allDay: boolean;
  title: string;
  description: string;
  location: string;
  /** null when no rule matches, in which case no tag is shown. */
  kind: EventKind | null;
}

export interface CalendarMonth {
  /** Sort/anchor key, e.g. "2026-09". */
  key: string;
  /** Display label, e.g. "September 2026". */
  label: string;
  events: CalendarEvent[];
}

export interface CalendarData {
  configured: boolean;
  error: string | null;
  events: CalendarEvent[];
  /** Events falling within the next fortnight, for the homepage. */
  upcoming: CalendarEvent[];
  months: CalendarMonth[];
  /** Google's month-grid embed, or null when there is nothing safe to embed. */
  embedUrl: string | null;
  timezone: string;
  updated: string;
}

/**
 * Google Calendar has no notion of a category we can read from an ICS feed, so
 * the kind (which drives the coloured tag) is inferred from the event title.
 * Order matters: the first match wins. An event matching nothing is untagged,
 * which is the common case for ordinary services.
 */
const KIND_RULES: Array<{ kind: EventKind; pattern: RegExp }> = [
  { kind: "pascha", pattern: /\b(pascha|holy week|great and holy|bright week)\b/i },
  { kind: "patronal", pattern: /\b(elizabeth|patronal|parish feast|altar feast)\b/i },
  { kind: "charity", pattern: /\b(homeless|charity|food bank|outreach|almsgiving|benefit)\b/i },
  { kind: "social", pattern: /\b(fellowship|meal|potluck|picnic|coffee hour|social|banquet)\b/i },
  { kind: "fast", pattern: /\b(fast|lent|lenten|abstinence|no meat|strict)\b/i },
  {
    kind: "feast",
    pattern:
      /\b(nativity|theophany|epiphany|annunciation|transfiguration|dormition|ascension|pentecost|presentation|meeting|exaltation|cross|palm sunday|entrance|beheading|circumcision|feast)\b/i,
  },
];

function classify(title: string): EventKind | null {
  for (const { kind, pattern } of KIND_RULES) {
    if (pattern.test(title)) return kind;
  }
  return null;
}

function calendarId(): string {
  const fromEnv = (process.env.GOOGLE_CALENDAR_ID ?? "").trim();
  if (fromEnv) return fromEnv;

  const fromSite = (site.googleCalendarId ?? "").trim();
  if (/^https?:\/\//i.test(fromSite)) {
    console.warn(
      "[calendar] site.json holds a full ICS URL. Google's private iCal address is a " +
        "credential and must not be committed. Move it to the GOOGLE_CALENDAR_ID environment " +
        "variable, or publish the calendar and use its plain ID instead.",
    );
  }
  return fromSite;
}

function icsUrl(id: string): string {
  // A parish that keeps its calendar private can point GOOGLE_CALENDAR_ID at
  // Google's "secret address in iCal format" instead. That URL is a credential,
  // so it belongs in an environment variable, never in site.json.
  if (/^https?:\/\//i.test(id)) return id;

  // Public ICS feed. Requires the calendar to be "public" in Google Calendar's
  // sharing settings; no API key is involved, so nothing secret is committed.
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`;
}

/**
 * Register the VTIMEZONE definitions Google embeds in the feed so that ical.js
 * can resolve TZID references on timed events.
 */
function registerTimezones(root: ICAL.Component): void {
  for (const vtimezone of root.getAllSubcomponents("vtimezone")) {
    const tzid = vtimezone.getFirstPropertyValue("tzid");
    if (typeof tzid !== "string" || ICAL.TimezoneService.has(tzid)) continue;
    // Must be registered without an explicit name: passing one skips ical.js's
    // component-to-Timezone conversion and makes it throw.
    ICAL.TimezoneService.register(vtimezone);
  }
}

function toEvent(
  title: string,
  startTime: ICAL.Time,
  description: string,
  location: string,
): CalendarEvent {
  const jsDate = startTime.toJSDate();
  const zoned = DateTime.fromJSDate(jsDate, { zone: site.timezone });
  return {
    // All-day events carry no timezone; shifting them into the parish zone
    // would move them onto the previous day.
    date: (startTime.isDate ? DateTime.fromJSDate(jsDate, { zone: "utc" }) : zoned).toISODate()!,
    start: startTime.isDate ? null : zoned.toISO(),
    allDay: startTime.isDate,
    title,
    description,
    location,
    kind: classify(title),
  };
}

function expand(ics: string, from: ICAL.Time, to: ICAL.Time): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  registerTimezones(root);

  const vevents = root.getAllSubcomponents("vevent");
  const exceptions = vevents.filter((v) => v.hasProperty("recurrence-id"));
  const events: CalendarEvent[] = [];

  for (const vevent of vevents) {
    if (vevent.hasProperty("recurrence-id")) continue;

    const event = new ICAL.Event(vevent);
    for (const exception of exceptions) {
      const candidate = new ICAL.Event(exception);
      if (candidate.uid === event.uid) event.relateException(exception);
    }

    const summary = event.summary?.trim();
    if (!summary) continue;
    const description = event.description?.trim() ?? "";
    const location = event.location?.trim() ?? "";

    if (!event.isRecurring()) {
      if (event.startDate.compare(from) >= 0 && event.startDate.compare(to) <= 0) {
        events.push(toEvent(summary, event.startDate, description, location));
      }
      continue;
    }

    const iterator = event.iterator();
    let next: ICAL.Time | null;
    let seen = 0;
    while ((next = iterator.next()) && seen < MAX_OCCURRENCES_PER_EVENT) {
      seen += 1;
      if (next.compare(to) > 0) break;
      if (next.compare(from) < 0) continue;
      const details = event.getOccurrenceDetails(next);
      events.push(
        toEvent(
          details.item.summary?.trim() || summary,
          details.startDate,
          details.item.description?.trim() ?? description,
          details.item.location?.trim() ?? location,
        ),
      );
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Days of events the homepage's "Upcoming Events" section covers. */
const UPCOMING_DAYS = 14;

/**
 * Buckets events into calendar months. The parish calendar is a service
 * schedule running to several hundred entries a year, so the page needs month
 * headings to stay navigable.
 */
function groupByMonth(events: CalendarEvent[]): CalendarMonth[] {
  const months = new Map<string, CalendarMonth>();
  for (const event of events) {
    const key = event.date.slice(0, 7);
    let month = months.get(key);
    if (!month) {
      month = {
        key,
        label: DateTime.fromISO(event.date).toFormat("LLLL yyyy"),
        events: [],
      };
      months.set(key, month);
    }
    month.events.push(event);
  }
  return [...months.values()];
}

/**
 * Google's month-grid embed for the public calendar.
 *
 * Returns null when the configured value is a full ICS URL: that form is
 * Google's private "secret address", and building an embed from it would
 * publish the credential in the page source.
 */
function embedUrl(id: string): string | null {
  if (!id || /^https?:\/\//i.test(id)) return null;
  const params = new URLSearchParams({
    src: id,
    ctz: site.timezone,
    mode: "MONTH",
    showTitle: "0",
    showPrint: "0",
    showCalendars: "0",
    showTz: "0",
    wkst: "1",
  });
  return `https://calendar.google.com/calendar/embed?${params}`;
}

export default async function calendar(): Promise<CalendarData> {
  const base: CalendarData = {
    configured: false,
    error: null,
    events: [],
    upcoming: [],
    months: [],
    embedUrl: null,
    timezone: site.timezone,
    updated: DateTime.now().setZone(site.timezone).toISO()!,
  };

  const id = calendarId();
  if (!id) return base;

  try {
    const ics = (await EleventyFetch(icsUrl(id), {
      duration: CACHE_DURATION,
      type: "text",
      fetchOptions: { headers: { "User-Agent": "stelizabethorthodox.org (Eleventy build)" } },
    })) as string;

    const now = DateTime.now().setZone(site.timezone).startOf("day");

    // The ICAL window is deliberately loose: an all-day event carries no
    // timezone, so comparing it against a parish-local instant would drop
    // events happening today. A day of slack on each side keeps them, and the
    // exact bounds are applied below against the parish-local date we display.
    const from = ICAL.Time.fromJSDate(now.minus({ days: 1 }).toJSDate(), true);
    const to = ICAL.Time.fromJSDate(now.plus({ months: MONTHS_AHEAD, days: 1 }).toJSDate(), true);

    const firstDate = now.toISODate()!;
    const lastDate = now.plus({ months: MONTHS_AHEAD }).toISODate()!;
    const events = expand(ics, from, to).filter(
      (event) => event.date >= firstDate && event.date <= lastDate,
    );

    const upcomingEnd = now.plus({ days: UPCOMING_DAYS }).toISODate()!;
    return {
      ...base,
      configured: true,
      events,
      upcoming: events.filter((event) => event.date < upcomingEnd),
      months: groupByMonth(events),
      embedUrl: embedUrl(id),
    };
  } catch (cause) {
    // A calendar outage must not break the build: the page falls back to a
    // link to the parish calendar instead.
    const message = cause instanceof Error ? cause.message : String(cause);
    console.warn(`[calendar] could not load the parish calendar: ${message}`);
    return { ...base, configured: true, error: message, embedUrl: embedUrl(id) };
  }
}
