import { resolveCrewLead } from './shipment-crew.util';

describe('resolveCrewLead', () => {
  it('honours an explicit request over everything else', () => {
    expect(resolveCrewLead(['a', 'b', 'c'], 'a', 'c')).toBe('c');
  });

  it('leaves the sitting lead on point when a colleague joins', () => {
    expect(resolveCrewLead(['a', 'b'], 'a', undefined)).toBe('a');
  });

  it('keeps the sitting lead even when they are no longer named first', () => {
    expect(resolveCrewLead(['b', 'a'], 'a', undefined)).toBe('a');
  });

  it('hands point to the first name when the sitting lead comes off the job', () => {
    expect(resolveCrewLead(['b', 'c'], 'a', undefined)).toBe('b');
  });

  it('gives the first person named point on a fresh crew', () => {
    expect(resolveCrewLead(['b', 'c'], undefined, undefined)).toBe('b');
  });

  it('leaves an empty crew with no lead rather than inventing one', () => {
    expect(resolveCrewLead([], 'a', undefined)).toBeUndefined();
  });
});
