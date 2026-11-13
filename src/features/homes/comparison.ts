import type { JourneySummary } from '../commute/journeys';

export type HomeComparisonView = 'saved' | 'travel' | 'balance';

/** Only current summaries are passed by the owner of the journey identity key. */
export function arrangeHomes<T extends { id:string; name:string }>(rows:{home:T;eligible:boolean;summary:JourneySummary|null}[],view:HomeComparisonView) {
  const comparable=rows.filter(row=>row.eligible && row.summary?.complete &&
    row.summary.totalWeeklyMinutes!=null && Number.isFinite(row.summary.totalWeeklyMinutes) && row.summary.totalWeeklyMinutes>=0 &&
    row.summary.balanceMinutes!=null && Number.isFinite(row.summary.balanceMinutes) && row.summary.balanceMinutes>=0);
  const values=new Map(comparable.map(row=>[row.home.id,row.summary!]));
  const canCompare=comparable.length>=2;
  const ordered=view==='saved'||!canCompare?rows:[...rows].sort((a,b)=>{
    const measure=(id:string)=>{const summary=values.get(id);return (view==='travel'?summary?.totalWeeklyMinutes:summary?.balanceMinutes)??Infinity;};
    return measure(a.home.id)-measure(b.home.id)||a.home.name.localeCompare(b.home.name)||a.home.id.localeCompare(b.home.id);
  });
  const nonDominated=comparable.filter(a=>!comparable.some(b=>b.home.id!==a.home.id &&
    b.summary!.totalWeeklyMinutes!<=a.summary!.totalWeeklyMinutes! && b.summary!.balanceMinutes!<=a.summary!.balanceMinutes! &&
    (b.summary!.totalWeeklyMinutes!<a.summary!.totalWeeklyMinutes!||b.summary!.balanceMinutes!<a.summary!.balanceMinutes!)));
  return {canCompare,homes:ordered.map(row=>row.home),nonDominated:nonDominated.map(row=>row.home)};
}
