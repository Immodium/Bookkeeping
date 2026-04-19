import { describe, it, expect } from 'vitest';

describe('Basic Test Suite', () => {
  it('should pass a simple test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should verify testing framework works', () => {
    const obj = { name: 'test' };
    expect(obj).toHaveProperty('name');
    expect(obj.name).toBe('test');
  });
});
