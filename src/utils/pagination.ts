export interface PaginationRequest<T> {
  limit: number;
  pageSize: number;
  fetchPage: (start: number, count: number) => Promise<{
    items: T[];
    total?: number;
    nextStart?: number;
  }>;
}

export async function paginate<T>(request: PaginationRequest<T>): Promise<{
  items: T[];
  total?: number;
  nextStart?: number;
}> {
  const items: T[] = [];
  let start = 0;
  let total: number | undefined;
  let nextStart: number | undefined;

  while (items.length < request.limit) {
    const remaining = request.limit - items.length;
    const count = Math.min(request.pageSize, remaining);
    const page = await request.fetchPage(start, count);

    items.push(...page.items);
    total = page.total ?? total;
    nextStart = page.nextStart;

    if (page.items.length === 0 || nextStart === undefined || nextStart === start) {
      break;
    }

    start = nextStart;
  }

  return {
    items,
    total,
    nextStart,
  };
}

