# 👋 Hey, welcome to my site!

This is the repo behind [kalebcole.com](https://kalebcole.com), my personal site and blog.

[Visit the site](https://kalebcole.com) · [Read the blog](https://kalebcole.com/blog)

## Podcasts

The podcast shelf is at `/recommends#podcasts`. Edit
`src/data/podcasts.json` to change categories, source links, notes, or the
`spotlight` flag used by "Start here". Set `draft: true` to keep a pick private.
The initial list comes from Kaleb's Todoist task. Supplied Spotify show IDs are
preserved. Names without a confirmed destination use clearly marked search
links. Some supplied titles describe episodes but their supplied URLs identify
shows. Their public Spotify embeds resolve, but can feature newer episodes
instead of the episode named in the task. The page labels them as show links.
Confirm these names and destinations before replacing them. YouTube
search links include Syntax, VERY IMPORTANT podcast, HumanLayer, and Boundary
AI without claiming that they are exclusive to YouTube.

Spotify integration uses public show links and player embeds. Visitors choose
whether to load a player. No player or account request runs on page entry.
No Spotify or YouTube API credentials are configured in this repository.
The shelf is static and does not imply access to Kaleb's accounts.

### Shared listening history

`src/data/podcast-listening.json` starts empty. It accepts only reviewed podcast
episode records, not raw Spotify or YouTube exports. For each record, use:

```json
{
  "podcastId": "an-id-from-the-catalogue",
  "episodeId": "the-platform-episode-id",
  "title": "The episode title",
  "platform": "spotify",
  "url": "https://open.spotify.com/episode/REPLACE_WITH_EPISODE_ID",
  "listenedAt": "2026-10-06T12:00:00Z",
  "draft": true
}
```

For Spotify, `episodeId` must be the 22-character episode ID in the URL.
For YouTube, use `platform: "youtube"`, the 11-character video ID, and
`https://www.youtube.com/watch?v=VIDEO_ID`. Dates are UTC ISO timestamps. An
entry refers to a known podcast, so music and unrelated videos do not belong in
this file. Unknown podcasts, extra fields, invalid dates, and mismatched links
fail the build. Draft entries and entries for draft picks stay out of the page.
Only remove `draft` after Kaleb approves publication.

Counts show distinct episodes per platform in the shared records. Repeat
listens count once and use the latest date. The six latest distinct episodes
appear in "Recently listened". A podcast with no shared records has an unknown
count, not zero. These counts do not prove completion or cover all-time
listening. The same episode on two platforms needs manual review to avoid
counting it twice. This shelf does not add entries to the Recommends RSS feed.

### Account access limits and next steps

The [Spotify recently played endpoint](https://developer.spotify.com/documentation/web-api/reference/get-recently-played)
returns tracks, not podcast listening history. Saved shows and playback state
are separate, authorized API surfaces and cannot supply complete personal
episode counts. The [YouTube playlist endpoint](https://developers.google.com/youtube/v3/docs/playlistItems/list)
reports `watchHistoryNotAccessible` for watch history. API credentials alone
will not unlock either full history.

Kaleb must provide an export of his Spotify extended streaming history and,
if desired, YouTube watch history from Google Takeout, or a manual episode
list. Keep raw exports outside this repository. Select podcast episodes,
map them to catalogue IDs, remove private data, decide what counts as a listen,
and approve the titles and dates to publish. Then add only those reviewed
records to the shared history file. No account authorization is needed for
this reviewed-file route.

Live followed-show or current-playback integration is not implemented. It
would require Kaleb's approval, a Spotify developer app, applicable OAuth
scopes, server-side secret storage, and a private sync process. A YouTube
subscription integration would likewise require an approved Google project
and OAuth access. Do not put tokens in content files or browser code. Do not
request account credentials from visitors.

## Résumé publication

`public/resume.pdf` is generated publication output. Do not edit it directly.
The canonical source is `master.tex` in the private `KalebCole/Resume`
repository. That repository builds and validates `master.pdf`, then opens or
updates the website publication pull request.
