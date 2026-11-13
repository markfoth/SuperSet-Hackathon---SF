import { expect, test } from '@playwright/test';

test('right drag anchors terrain zoom and ends outside the map, on cancellation and blur', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.map')).toHaveAttribute('data-vector-loaded','true');
  await page.getByRole('button',{name:/Focus on map/}).click();
  await page.getByRole('button',{name:'Dismiss navigation hint'}).click();
  await expect(page.locator('.map')).toHaveAttribute('data-terrain-loaded','true');
  for(const [zoom,pitch,bearing] of [[14,0,0],[15,35,85],[16,60,-35]]) {
    await page.evaluate(({zoom,pitch,bearing}) => (document.querySelector('.map') as any).__commonGroundMap.jumpTo({center:[-122.444,37.756],zoom,pitch,bearing,padding:{top:0,bottom:0,left:0,right:0}}),{zoom,pitch,bearing});
    await page.waitForTimeout(450);
    const rect=(await page.locator('.map canvas').boundingBox())!;
    const point={x:rect.width*.44,y:rect.height*.58};
    const anchor=await page.evaluate(point=>(document.querySelector('.map') as any).__commonGroundMap.unproject(point).toArray(),point);
    await page.mouse.move(rect.x+point.x,rect.y+point.y); await page.mouse.down({button:'right'});
    await page.mouse.move(rect.x+point.x,rect.y+point.y-100,{steps:15});
    const state=await page.evaluate(({anchor,point})=>{const m=(document.querySelector('.map') as any).__commonGroundMap,p=m.project(anchor);return{error:Math.hypot(p.x-point.x,p.y-point.y),zoom:m.getZoom(),pitch:m.getPitch(),bearing:m.getBearing()};},{anchor,point});
    expect(state.error).toBeLessThan(2);expect(state.zoom).toBeCloseTo(zoom+.8,1);expect(state.pitch).toBeCloseTo(pitch);expect(state.bearing).toBeCloseTo(bearing);
    await page.mouse.move(rect.x+point.x,20,{steps:10});await page.mouse.up({button:'right'});
    await expect(page.locator('.map canvas')).toHaveAttribute('data-right-drag','false');
    const released=await page.locator('.map').getAttribute('data-zoom');await page.mouse.move(700,500,{steps:5});expect(await page.locator('.map').getAttribute('data-zoom')).toBe(released);
  }
  for(const event of ['blur','pointercancel']) {
    await page.mouse.move(700,500);await page.mouse.down({button:'right'});
    if(event==='blur') await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    else await page.locator('.map canvas').evaluate(canvas=>canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
    await page.mouse.up({button:'right'});await expect(page.locator('.map canvas')).toHaveAttribute('data-right-drag','false');
  }
  const menus=await page.evaluate(()=>{const outside=new MouseEvent('contextmenu',{cancelable:true,bubbles:true});document.querySelector('.topbar')!.dispatchEvent(outside);const inside=new MouseEvent('contextmenu',{cancelable:true,bubbles:true});document.querySelector('.map canvas')!.dispatchEvent(inside);return{outside:outside.defaultPrevented,inside:inside.defaultPrevented};});
  expect(menus).toEqual({outside:false,inside:true});
});

test('left pan, wheel, explicit rotation and destination dragging remain available',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/Try the SF/}).click();
  await expect(page.locator('.map')).toHaveAttribute('data-eligible-count',/^[1-9]\d*$/);
  await page.getByRole('button',{name:/Focus on map/}).click();
  const before=await page.locator('.map').getAttribute('data-centre');
  await page.mouse.move(700,400);await page.mouse.down();await page.mouse.move(780,450,{steps:12});await page.mouse.up();
  await expect(page.locator('.map')).not.toHaveAttribute('data-centre',before!);
  const zoom=await page.locator('.map').getAttribute('data-zoom');await page.mouse.wheel(0,-400);
  await expect(page.locator('.map')).not.toHaveAttribute('data-zoom',zoom!);
  await page.locator('.map canvas').focus();await page.locator('.map canvas').press('Shift+ArrowRight');await expect(page.locator('.map')).toHaveAttribute('data-bearing','15');
  await page.evaluate(()=>{const m=(document.querySelector('.map') as HTMLElement & {__commonGroundMap:import('maplibre-gl').Map}).__commonGroundMap;m.jumpTo({center:[-122.3855,37.6213],zoom:12,bearing:0,padding:{top:0,bottom:0,left:0,right:0}});});
 const marker=page.locator('.cg-destination-pin').first(), rect=(await marker.boundingBox())!;
  const transform=await marker.getAttribute('style');await page.mouse.move(rect.x+16,rect.y+16);await page.mouse.down();await page.mouse.move(rect.x+55,rect.y+45,{steps:8});await page.mouse.up();
  await expect(marker).not.toHaveAttribute('style',transform!);
});
