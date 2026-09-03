import { descendantsOf, isWithin } from './drive-folders.util';

const TREE = [
  { id: 'root', parentId: null },
  { id: 'a', parentId: 'root' },
  { id: 'b', parentId: 'root' },
  { id: 'a1', parentId: 'a' },
  { id: 'a1x', parentId: 'a1' },
  { id: 'other', parentId: null },
];

describe('descendantsOf', () => {
  it('returns the folder itself first, then everything beneath it', () => {
    expect(descendantsOf('a', TREE)).toEqual(['a', 'a1', 'a1x']);
  });

  it('returns only the folder when it has no children', () => {
    expect(descendantsOf('b', TREE)).toEqual(['b']);
  });

  it('does not stray into a sibling tree', () => {
    expect(descendantsOf('root', TREE)).not.toContain('other');
  });

  it('survives a cycle instead of spinning on it', () => {
    const cyclic = [
      { id: 'p', parentId: 'q' },
      { id: 'q', parentId: 'p' },
    ];
    expect(descendantsOf('p', cyclic)).toEqual(['p', 'q']);
  });
});

describe('isWithin', () => {
  it('is true for the folder itself and for anything under it', () => {
    expect(isWithin('a', 'a', TREE)).toBe(true);
    expect(isWithin('a', 'a1x', TREE)).toBe(true);
  });

  it('is false for a folder elsewhere in the tree', () => {
    expect(isWithin('a', 'b', TREE)).toBe(false);
    expect(isWithin('a', 'root', TREE)).toBe(false);
  });
});
