export interface Paginated<T> {
  values: T[];
  size?: number;
  page?: number;
  pagelen?: number;
  next?: string;
  previous?: string;
}

export async function collectPages<T>(
  fetchPage: (url: string | undefined) => Promise<Paginated<T>>,
  options?: { maxPages?: number; startUrl?: string },
): Promise<T[]> {
  const maxPages = options?.maxPages ?? 50;
  const items: T[] = [];
  let next: string | undefined = options?.startUrl;
  let page = 0;

  do {
    const result = await fetchPage(page === 0 ? options?.startUrl : next);
    items.push(...(result.values ?? []));
    next = result.next;
    page += 1;
  } while (next && page < maxPages);

  return items;
}
