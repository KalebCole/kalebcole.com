export const PODCAST_CATEGORIES = [
  { id: 'tech', name: 'Tech' },
  { id: 'entrepreneurship', name: 'Entrepreneurship' },
  { id: 'self-improvement', name: 'Self Improvement' },
];

/**
 * @typedef {{ id: string, name: string, category: string, spotifyShowId?: string,
 * youtubeSearch?: string, spotlight?: boolean, note?: string, draft?: boolean }} Podcast
 * @typedef {{ podcastId: string, episodeId: string, title: string, platform: string,
 * url: string, listenedAt: string, draft?: boolean }} Listening
 */

const text = (value) => typeof value === 'string' && value.trim().length > 0;

function checkFields(record, allowed, label) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`${label} must be an object.`);
  }
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new Error(`${label}: unexpected field "${key}".`);
  }
  for (const key of ['draft', 'spotlight']) {
    if (key in record && typeof record[key] !== 'boolean') {
      throw new Error(`${label}: ${key} must be a boolean.`);
    }
  }
}

/** @param {Podcast[]} podcasts @param {Listening[]} listening */
export function buildPodcastShelf(podcasts, listening) {
  if (!Array.isArray(podcasts) || !Array.isArray(listening)) {
    throw new Error('Podcast catalogue and listening history must be arrays.');
  }
  const ids = new Set();
  for (const podcast of podcasts) {
    checkFields(podcast, ['id', 'name', 'category', 'spotifyShowId', 'youtubeSearch', 'spotlight', 'note', 'draft'], 'Podcast');
    if (!text(podcast.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(podcast.id) || ids.has(podcast.id)) {
      throw new Error('Podcast IDs must be unique lowercase slugs.');
    }
    ids.add(podcast.id);
    if (!text(podcast.name) || !PODCAST_CATEGORIES.some(({ id }) => id === podcast.category)) {
      throw new Error(`Podcast "${podcast.id}" needs a name and a known category.`);
    }
    if (podcast.spotifyShowId !== undefined && !/^[A-Za-z0-9]{22}$/.test(podcast.spotifyShowId)) {
      throw new Error(`Podcast "${podcast.id}" has an invalid Spotify show ID.`);
    }
    for (const key of ['youtubeSearch', 'note']) {
      if (podcast[key] !== undefined && !text(podcast[key])) {
        throw new Error(`Podcast "${podcast.id}" has an empty ${key}.`);
      }
    }
  }

  const published = podcasts.filter((podcast) => !podcast.draft);
  const publishedIds = new Set(published.map(({ id }) => id));
  /** @type {Map<string, Listening & { podcast: Podcast }>} */
  const episodes = new Map();
  for (const entry of listening) {
    checkFields(entry, ['podcastId', 'episodeId', 'title', 'platform', 'url', 'listenedAt', 'draft'], 'Listening entry');
    if (!ids.has(entry.podcastId) || !text(entry.episodeId) || !text(entry.title)) {
      throw new Error('Listening entries need a known podcast ID, episode ID, and title.');
    }
    if (!['spotify', 'youtube'].includes(entry.platform)) {
      throw new Error('Listening entries must use Spotify or YouTube.');
    }
    const url = new URL(entry.url);
    const validSource = entry.platform === 'spotify'
      ? url.hostname === 'open.spotify.com' && /^\/episode\/[A-Za-z0-9]{22}$/.test(url.pathname) && entry.episodeId === url.pathname.split('/')[2]
      : url.hostname === 'www.youtube.com' && url.pathname === '/watch' && /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get('v') ?? '') && entry.episodeId === url.searchParams.get('v');
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !validSource) {
      throw new Error('Listening entries need an HTTPS episode link that matches the platform and episode ID.');
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(entry.listenedAt)
      || !Number.isFinite(Date.parse(entry.listenedAt))
      || new Date(entry.listenedAt).toISOString().slice(0, 19) !== entry.listenedAt.slice(0, 19)) {
      throw new Error('Listening entries need a UTC ISO listening date.');
    }
    if (entry.draft || !publishedIds.has(entry.podcastId)) continue;
    const key = `${entry.platform}:${entry.episodeId}`;
    const previous = episodes.get(key);
    if (previous && previous.podcastId !== entry.podcastId) {
      throw new Error('An episode cannot belong to two podcasts.');
    }
    if (!previous || Date.parse(entry.listenedAt) > Date.parse(previous.listenedAt)) {
      const podcast = published.find(({ id }) => id === entry.podcastId);
      if (!podcast) throw new Error('Published podcast not found.');
      // Publish only canonical episode links, not export query parameters.
      const canonical = entry.platform === 'spotify'
        ? `https://open.spotify.com/episode/${entry.episodeId}`
        : `https://www.youtube.com/watch?v=${entry.episodeId}`;
      episodes.set(key, { ...entry, url: canonical, podcast });
    }
  }
  const recent = [...episodes.values()].sort((a, b) => Date.parse(b.listenedAt) - Date.parse(a.listenedAt));
  const cards = published.map((podcast) => ({
    ...podcast,
    episodeCount: recent.filter(({ podcastId }) => podcastId === podcast.id).length,
    href: podcast.youtubeSearch
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(podcast.youtubeSearch)}`
      : podcast.spotifyShowId
        ? `https://open.spotify.com/show/${podcast.spotifyShowId}`
        : `https://open.spotify.com/search/${encodeURIComponent(podcast.name)}`,
    linkLabel: podcast.youtubeSearch ? 'Search YouTube' : podcast.spotifyShowId ? 'Open Spotify show' : 'Search Spotify',
  }));
  return {
    categories: PODCAST_CATEGORIES.map((category) => ({
      ...category,
      podcasts: cards.filter((podcast) => podcast.category === category.id),
    })),
    spotlights: cards.filter((podcast) => podcast.spotlight),
    recent: recent.slice(0, 6),
    hasHistory: recent.length > 0,
  };
}
