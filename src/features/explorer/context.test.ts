import { expect,it } from 'vitest';
import { activeService,proximity } from './LocationExplorer';
it('applies exceptions instead of treating an expired calendar as current',()=>{const data={calendar:[{service_id:'weekday',start_date:'20260101',end_date:'20261231',thursday:'1'}],exceptions:[{date:'20261112',service_id:'weekday',exception_type:'2'},{date:'20261112',service_id:'special',exception_type:'1'}]};expect([...activeService(data,'2026-11-12')]).toEqual(['special']);expect(activeService(data,'2027-11-12').size).toBe(0);});
it('labels proximity with geometric metres rather than invented walking time',()=>{expect(proximity({lat:37.75,lon:-122.4},{lat:37.75,lon:-122.4})).toBe(0);expect(proximity({lat:37.75,lon:-122.4},{lat:37.76,lon:-122.4})).toBeGreaterThan(1100);});
