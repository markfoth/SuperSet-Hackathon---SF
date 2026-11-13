import {test,expect} from '@playwright/test';
import type {Map,GeoJSONSource} from 'maplibre-gl';
type MapElement=HTMLElement&{__commonGroundMap:Map};

test('imagery failure is recoverable and preserves the selected place and matching',async({page})=>{
 await page.route('https://basemap.nationalmap.gov/**/tile/**',route=>route.abort());
 await page.goto('/');await page.getByRole('button',{name:/Try the SF/}).click();
 await page.locator('.cards>.card .card-title').first().click();
 const selection=await page.locator('.map').getAttribute('data-selection-id'),count=await page.locator('.map').getAttribute('data-eligible-count');
 await page.getByRole('button',{name:/Choose map style/}).click();await page.getByRole('button',{name:'Satellite',exact:true}).click();
 await expect(page.locator('.imagery-error')).toContainText('could not load');
 await expect(page.locator('.map')).toHaveAttribute('data-selection-id',selection!);await expect(page.locator('.map')).toHaveAttribute('data-eligible-count',count!);
 await page.unroute('https://basemap.nationalmap.gov/**/tile/**');await page.getByRole('button',{name:'Retry imagery',exact:true}).click();
 await expect(page.locator('.map')).toHaveAttribute('data-imagery-loaded','true');await expect(page.locator('.imagery-error')).toHaveCount(0);
});

test('three crime levels retain the same incident quantity and fixed height scales through style changes',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Focus on map/}).click();await page.locator('.layers-toggle').click();await page.getByRole('checkbox',{name:'Reported incidents',exact:true}).check();
 await expect(page.locator('.map')).toHaveAttribute('data-context-loaded',/crime/);
 const levels=await page.evaluate(async()=>{
  const m=(document.querySelector('.map') as MapElement).__commonGroundMap;
  const data=await(m.getSource('context-crime-columns') as GeoJSONSource).getData() as GeoJSON.FeatureCollection;
  return [6,7,8].map(level=>{const features=data.features.filter(f=>f.properties?.resolution===level);return{level,total:features.reduce((n,f)=>n+f.properties!.total,0),scales:[...new Set(features.map(f=>Math.round(100*f.properties!.graphic_height_m/f.properties!.total)/100))]};});
 });
 expect(levels).toEqual([{level:6,total:47808,scales:[.05]},{level:7,total:47808,scales:[.05]},{level:8,total:47808,scales:[.05]}]);
 for(const zoom of [10,11.5,13,15.5]){
  await page.evaluate(zoom=>(document.querySelector('.map') as MapElement).__commonGroundMap.jumpTo({center:[-122.416,37.775],zoom,pitch:45,padding:{top:0,bottom:0,left:0,right:0}}),zoom);
  await expect(page.locator('.crime-column-legend')).toContainText(zoom>=15.2?'Published approximate intersections':zoom<10.5?'H3 level 6':zoom<12.5?'H3 level 7':'H3 level 8');
 }
 await page.locator('.layers-toggle').click();await page.getByRole('button',{name:/Choose map style/}).click();await page.getByRole('button',{name:'Satellite',exact:true}).click();await page.keyboard.press('Escape');
 expect(await page.evaluate(()=>Object.keys((document.querySelector('.map') as MapElement).__commonGroundMap.getStyle().sources).filter(id=>id==='context-crime-columns').length)).toBe(1);
});
