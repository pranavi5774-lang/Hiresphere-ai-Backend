import { describe, expect, it } from 'vitest';
import { extractSection, lightStem, normalizeText, splitSentences, tokenize } from '@/lib/ai/text-preprocessing';

describe('resume text preprocessing', () => {
  it('normalizes line endings, bullet prefixes, control characters, and excess whitespace', () => {
    expect(normalizeText('  • React developer\r\n\r\n\r\nSkills:\u0001 TypeScript  '))
      .toBe('React developer\n\nSkills: TypeScript');
  });

  it('removes stopwords while stemming ordinary words and preserving technical symbols', () => {
    expect(tokenize('The candidate is using React.js, node.js, C++, C#, and JavaScript.'))
      .toEqual(['candidate', 'react.js', 'node.js', 'c++', 'c#', 'javascript']);
    expect(tokenize('applications')).toEqual(['application']);
  });

  it('leaves technical identifiers intact during light stemming', () => {
    expect(['react.js', 'node.js', 'c++', 'c#'].map(lightStem))
      .toEqual(['react.js', 'node.js', 'c++', 'c#']);
  });

  it('splits sentences and extracts a named section', () => {
    const text = 'Education\nBSc Computer Science.\n\nEXPERIENCE\nBuilt a hiring platform.';
    expect(splitSentences(text)).toEqual([
      'Education',
      'BSc Computer Science.',
      'EXPERIENCE',
      'Built a hiring platform.',
    ]);
    expect(extractSection(text, ['education'])).toBe('BSc Computer Science.');
  });
});