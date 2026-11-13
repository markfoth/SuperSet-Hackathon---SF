import {expect,it} from 'vitest';
import {arrangeHomes} from './comparison';
import type {JourneySummary} from '../commute/journeys';
const row=(id:string,time:number|null,gap:number|null,eligible=true)=>({home:{id,name:id},eligible,
 summary:{complete:time!=null&&gap!=null,totalWeeklyMinutes:time,balanceMinutes:gap,worstMinutes:30,people:[]} as JourneySummary});
it('keeps fast excluded and unknown homes from winning, with distinct shortest and balanced alternatives',()=>{
 const rows=[row('excluded',1,0,false),row('unknown',null,null),row('shortest',100,80),row('balanced',150,10),row('dominated',180,90)];
 const travel=arrangeHomes(rows,'travel'),balance=arrangeHomes(rows,'balance');
 expect(travel.homes[0].id).toBe('shortest');expect(balance.homes[0].id).toBe('balanced');
 expect(travel.nonDominated.map(home=>home.id)).toEqual(['shortest','balanced']);
 expect(travel.homes.slice(0,3).map(home=>home.id)).toEqual(['shortest','balanced','dominated']);
});
it('retains tied alternatives and rejects incomplete or nonfinite comparisons',()=>{
 const tied=arrangeHomes([row('b',100,10),row('a',100,10)],'travel');
 expect(tied.nonDominated).toHaveLength(2);expect(tied.homes.map(home=>home.id)).toEqual(['a','b']);
 const invalid=[row('unmeasured',null,null),row('one measured',100,20),row('invalid',Infinity,0)];
 expect(arrangeHomes(invalid,'travel').canCompare).toBe(false);
 expect(arrangeHomes(invalid,'travel').homes.map(home=>home.id)).toEqual(invalid.map(row=>row.home.id));
});
