/** Server-side paging for DataTable: `rows` is one page, `total` how many match
 *  in all (the API's X-Total-Count). */
export type Pagination = {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Plural noun for the count line, e.g. "products" -> "Showing 51–100 of 230 products". */
  noun?: string;
  /** A page request is in flight: the buttons wait, the rows stay up. */
  busy?: boolean;
};

export const pageCount = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));

/** "Showing 51–100 of 230 products", or "230 products" when it all fits on one page. */
export function pageSummary({ page, pageSize, total, noun = "rows" }: Pick<Pagination, "page" | "pageSize" | "total" | "noun">): string {
  if (total <= pageSize) return `${total} ${noun}`;
  const from = Math.min(total, (page - 1) * pageSize + 1);
  const to = Math.min(total, page * pageSize);
  return `Showing ${from}–${to} of ${total} ${noun}`;
}
