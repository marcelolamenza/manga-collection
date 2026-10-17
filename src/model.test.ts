import { describe, expect, it } from 'vitest';
import { createManga, ownedCount, progressPercent, resizeManga, validateStatus, type VolumeStatus } from './model';
const make = (count=4) => createManga({ title:'Test manga', totalVolumes:count, coverUrl:'' },'test-id');
describe('manga business rules',()=>{
 it('creates exactly one missing status per volume',()=>expect(make(12).statuses).toHaveLength(12));
 it('starts new manga in In progress unless a section is chosen',()=>{expect(make().section).toBe('In progress');expect(createManga({title:'Moved',coverUrl:'',totalVolumes:1,section:'Complete'}).section).toBe('Complete');});
 it('validates title and volume count',()=>{expect(()=>createManga({title:' ',coverUrl:'',totalVolumes:2})).toThrow(/title/i);expect(()=>createManga({title:'X',coverUrl:'',totalVolumes:1.5})).toThrow(/whole number/i);});
 it('counts read and bought as owned, excluding transit',()=>{const m={...make(),statuses:['read','bought','transit','missing'] as VolumeStatus[]};expect(ownedCount(m)).toBe(2);expect(progressPercent(m)).toBe(50);});
 it('requires confirmation to drop non-missing statuses and preserves the rest',()=>{const m={...make(3),statuses:['read','bought','missing'] as VolumeStatus[]};const input={title:'Test manga',coverUrl:'',totalVolumes:1};expect(()=>resizeManga(m,input)).toThrow(/confirm/i);expect(resizeManga(m,input,true).statuses).toEqual(['read']);});
 it('accepts only the four status values',()=>{expect(validateStatus('read')).toBe(true);expect(validateStatus('owned')).toBe(false);});
});
