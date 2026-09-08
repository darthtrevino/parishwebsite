# Editing the Website

You do not need to be a programmer to update this site. Most changes are edits to a text file, made
directly in GitHub's web editor.

## Where things live

| What you want to change                            | File                                          |
| -------------------------------------------------- | --------------------------------------------- |
| Address, phone, email, service times, social links | `src/_data/site.json`                         |
| Menu structure                                     | `src/_data/navigation.json`                   |
| Feasts, fasts, and events calendar                 | the parish Google Calendar (see below)        |
| Online giving funds and Stripe links               | `src/_data/giving.json` (preview only)        |
| A regular page (e.g. Our Parish)                   | `src/who-we-are/our-parish.md` and neighbours |
| The homepage                                       | `src/index.njk`                               |
| News posts                                         | `src/news/*.md`                               |
| Colours, fonts, spacing                            | `src/assets/css/style.css`                    |

## Editing a page

Pages are written in **Markdown**, a plain-text format:

```markdown
---
title: Our Parish
lede: A one-sentence summary shown under the title.
description: One or two sentences used by Google and social previews.
---

Regular paragraphs are just text with a blank line between them.

## A subheading

- a bullet
- another bullet

**Bold text**, _italic text_, and [a link](/come-and-see/visiting/).

> A quotation, such as a hymn or a passage of scripture.
```

The block between the `---` lines is called _front matter_. Keep `title` short: it appears in the
browser tab and in search results.

> **Careful with punctuation in front matter.** If a value starts with a quotation mark, wrap it
> like this instead:
>
> ```yaml
> lede: >-
>   "Come and see" — the answer we usually give.
> ```

## Adding a news post

Create a new file in `src/news/`, named after the headline in lowercase with hyphens, for example
`src/news/theophany-blessing-of-the-waters.md`:

```markdown
---
title: Theophany blessing of the waters
date: 2026-01-06
description: A short summary shown on the news index and the homepage.
---

The body of the announcement goes here.
```

The `date` controls the ordering and the published date. The file name becomes the web address:
`/news/theophany-blessing-of-the-waters/`.

To hide a post while you work on it, add `draft: true` to the front matter.

## Updating the calendar

The calendar is not edited here at all. Add, move, or delete the event in the parish **Google
Calendar** and it appears on the website the next time the site is built — both on the homepage and
on Resources → Dates & Events.

Some events carry a coloured label, worked out from words in the event's title:

- `feast` — a great feast
- `fast` — the start of a fasting season
- `pascha` — Pascha itself
- `patronal` — our patronal feast, July 18
- `charity` — outreach such as the Homeless Ministry
- `social` — parish gatherings such as the Fellowship Meal

Ordinary services carry no label. If an event shows the wrong one, rename it in Google Calendar. See
[calendar-setup.md](calendar-setup.md) for the full keyword table and for first-time setup.

## Adding images

1. Put the image file in `src/assets/img/`.
2. Reference it in a page: `![Description of the photo](/assets/img/filename.jpg)`.

Always write a real description in the square brackets — screen readers read it aloud, and Google
uses it. Resize photos to no more than 2000 pixels wide before uploading so pages stay fast.

## Embedding a video

Paste this into any page, replacing `VIDEO_ID` with the id from the YouTube URL:

```html
<div class="embed">
  <iframe
    src="https://www.youtube-nocookie.com/embed/VIDEO_ID"
    title="Descriptive title of the video"
    allowfullscreen
    loading="lazy"
  ></iframe>
</div>
```

## Previewing your changes

If you have the site checked out locally:

```bash
npm install     # once
npm start       # then open http://localhost:8080
```

The page reloads automatically as you save. If you are editing on GitHub instead, open a pull
request — the deploy provider builds a preview link for every pull request.

## Pages that still need parish attention

These pages were carried over from the Squarespace site and contain an editor's note asking for
current content:

- `src/who-we-are/our-stories.md` — the parishioner video interviews need re-uploading
- `src/resources/liturgical-chant.md` — the audio recordings need migrating
- `src/what-we-do/charity.md` — needs a current description of our charitable ministries
