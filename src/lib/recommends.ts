import { getCollection, type CollectionEntry } from 'astro:content';

export type Recommend = CollectionEntry<'recommends'>;

export async function getPublishedRecommends(): Promise<Recommend[]> {
  const items = await getCollection('recommends');
  return items.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
