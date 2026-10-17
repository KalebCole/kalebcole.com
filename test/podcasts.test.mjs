import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPodcastShelf } from '../src/lib/podcasts.mjs';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const catalogue = JSON.parse(read('src/data/podcasts.json'));
const episodeId = 'a'.repeat(22);
const entry = (overrides = {}) => ({
  podcastId: 'dwarkesh',
  episodeId,
  title: 'A reviewed episode',
  platform: 'spotify',
  url: `https://open.spotify.com/episode/${episodeId}`,
  listenedAt: '2026-10-05T12:00:00Z',
  ...overrides,
});

test('all supplied picks are categorized without a nine-item cap or made-up history', () => {
  const shelf = buildPodcastShelf(catalogue, JSON.parse(read('src/data/podcast-listening.json')));
  assert.equal(catalogue.length, 25);
  assert.deepEqual(shelf.categories.map(({ podcasts }) => podcasts.length), [16, 6, 3]);
  assert.equal(shelf.hasHistory, false);
  assert.deepEqual(shelf.recent, []);
  assert.deepEqual(shelf.spotlights.map(({ id }) => id), ['david-senra']);
  assert.equal(shelf.categories.flatMap(({ podcasts }) => podcasts).filter(({ spotifyShowId }) => spotifyShowId).length, 5);
  for (const id of ['syntax', 'very-important', 'humanlayer', 'boundary-ai']) {
    const podcast = shelf.categories[0].podcasts.find((podcast) => podcast.id === id);
    assert.equal(podcast.linkLabel, 'Search YouTube');
    assert.equal(new URL(podcast.href).hostname, 'www.youtube.com');
  }
});

test('counts distinct episodes, keeps the latest repeat, and sorts podcast-only activity', () => {
  const shelf = buildPodcastShelf(catalogue, [
    entry(),
    entry({ listenedAt: '2026-10-06T12:00:00Z', url: `https://open.spotify.com/episode/${episodeId}?si=private-tracking` }),
    entry({ episodeId: 'b'.repeat(22), url: `https://open.spotify.com/episode/${'b'.repeat(22)}`, listenedAt: '2026-10-04T12:00:00Z' }),
    entry({ podcastId: 'syntax', episodeId: 'abcDEF_1234', platform: 'youtube', url: 'https://www.youtube.com/watch?v=abcDEF_1234&private=tracking', listenedAt: '2026-10-07T12:00:00Z' }),
  ]);
  assert.equal(shelf.recent.length, 3);
  assert.deepEqual(shelf.recent.map(({ podcastId }) => podcastId), ['syntax', 'dwarkesh', 'dwarkesh']);
  assert.equal(shelf.categories[0].podcasts.find(({ id }) => id === 'dwarkesh').episodeCount, 2);
  assert.equal(shelf.recent[0].url, 'https://www.youtube.com/watch?v=abcDEF_1234');
  assert.equal(shelf.recent[1].url, `https://open.spotify.com/episode/${episodeId}`);
});

test('draft episodes and draft podcasts never contribute counts or recent activity', () => {
  const podcasts = catalogue.map((podcast) => podcast.id === 'dwarkesh' ? { ...podcast, draft: true } : podcast);
  const shelf = buildPodcastShelf(podcasts, [entry(), entry({ podcastId: 'founders', draft: true })]);
  assert.equal(shelf.hasHistory, false);
  assert.equal(shelf.categories.flatMap(({ podcasts }) => podcasts).some(({ id }) => id === 'dwarkesh'), false);
  assert.deepEqual(shelf.recent, []);
});

test('recent episodes have a six-item cap but counts cover all reviewed records', () => {
  const records = Array.from({ length: 9 }, (_, i) => entry({
    episodeId: String(i).repeat(22),
    url: `https://open.spotify.com/episode/${String(i).repeat(22)}`,
    listenedAt: `2026-10-0${i + 1}T12:00:00Z`,
  }));
  const shelf = buildPodcastShelf(catalogue, records);
  assert.equal(shelf.recent.length, 6);
  assert.equal(shelf.recent[0].episodeId, '8'.repeat(22));
  assert.equal(shelf.categories[0].podcasts.find(({ id }) => id === 'dwarkesh').episodeCount, 9);
});

test('invalid or private export fields fail instead of being silently published', () => {
  for (const changes of [
    { podcastId: 'music' }, { platform: 'music' }, { title: '' },
    { url: 'javascript:alert(1)' }, { url: `https://open.spotify.com/track/${episodeId}` },
    { url: `https://open.spotify.com.evil.test/episode/${episodeId}` },
    { url: 'https://www.youtube.com/watch?v=abcDEF_1234' },
    { listenedAt: '2026-02-31T12:00:00Z' }, { listenedAt: 'yesterday' },
    { episodeId: 'wrong-id' }, { email: 'private@example.com' }, { draft: 'false' },
  ]) {
    assert.throws(() => buildPodcastShelf(catalogue, [entry(changes)]));
  }
  assert.throws(() => buildPodcastShelf(catalogue, [entry(), entry({ podcastId: 'founders' })]), /two podcasts/);
  assert.throws(() => buildPodcastShelf([...catalogue, catalogue[0]], []), /unique/);
  assert.throws(() => buildPodcastShelf([{ ...catalogue[0], category: 'unknown' }], []), /category/);
  assert.throws(() => buildPodcastShelf([{ ...catalogue[0], spotifyShowId: 'not-a-show' }], []), /Spotify/);
});

test('podcast surface preserves static links and loads players only by explicit choice', () => {
  const component = read('src/components/PodcastShelf.astro');
  const page = read('src/pages/recommends/index.astro');
  assert.match(page, /<PodcastShelf \/>/);
  assert.match(component, /<nav class="podcast-jumps" aria-label="Podcast categories">/);
  assert.match(component, /Episodes listened to: not shared yet/);
  assert.doesNotMatch(component, /<iframe\b/);
  assert.match(component, /button\.addEventListener\('click',[\s\S]*document\.createElement\('iframe'\)/);
  assert.match(component, /unload\.addEventListener\('click',[\s\S]*frame\.remove\(\)/);
  assert.match(component, /frame\.title = `Spotify player for/);
  assert.doesNotMatch(component, /autoplay/);
});
