import { describe, it, expect } from 'vitest';
import { decodedName, carEmoji } from './car';

describe('decodedName', () => {
  it('joins year make model when present', () => {
    expect(decodedName({ make: 'Volkswagen', model: 'Golf', year: '2018' })).toBe('2018 Volkswagen Golf');
  });
  it('works with make + year only (no model — e.g. a European VIN)', () => {
    expect(decodedName({ make: 'Renault', year: '2022' })).toBe('2022 Renault');
  });
  it('is empty without a make', () => {
    expect(decodedName({})).toBe('');
    expect(decodedName({ year: '2022' })).toBe('');
  });
});

describe('carEmoji', () => {
  it('maps body classes to glyphs', () => {
    expect(carEmoji('Pickup')).toBe('🛻');
    expect(carEmoji('Sport Utility Vehicle (SUV)')).toBe('🚙');
    expect(carEmoji('Van')).toBe('🚐');
    expect(carEmoji('Convertible/Cabriolet')).toBe('🏎️');
    expect(carEmoji('Sedan/Saloon')).toBe('🚗');
    expect(carEmoji(undefined)).toBe('🚗');
  });
});
