export const pct = (v: number | null | undefined) => (v == null ? 'No data' : `${Math.round(v * 100)}%`);
export const num = (v: number | null | undefined, dp = 0) =>
  v == null ? 'No data' : v.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: dp });
export const usd = (v: number | null | undefined) =>
  v == null ? 'No data' : `$${Math.round(v).toLocaleString('en-US')}`;
