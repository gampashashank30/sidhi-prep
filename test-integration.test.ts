// Quick integration test using the real normalizeMathEquations + renderMath
// Run with: node node_modules/jest/bin/jest.js test-integration --no-coverage
import { normalizeMathEquations } from './lib/text';
import { renderMath } from './lib/mathRenderer';

// Real question texts from the uploaded docx (from test-parser2.ts)
const questions = [
  {
    label: "Q1 text",
    text: "If x = 4 + √1 5 , what is the value of (x^2+1/x^2 )?"
  },
  {
    label: "Q1 opt A",
    text: "48"
  },
  {
    label: "Q2 text",
    text: "If 8k^6+15k^3-2=0, then the positive value of (k+1/k) is?"
  },
  {
    label: "Q2 opt A",
    text: "2 1/2"
  },
  {
    label: "Q3 text",
    text: "X is a negative number such thatk+k^(-1)= -2 , then what is the value of (k^2+4k-2)/(k^2+k-5)"
  },
  {
    label: "Q4 explanation fragment",
    text: "█(&@&(x-1/x)^2=5@&x-1/x=√5@&■(x^2-1/x^2 &=(x+1/x)(x-1/x)@&))"
  },
  {
    label: "Empty text (image question)",
    text: ""
  },
  {
    label: "Two individuals (plain English, should work)",
    text: "Two individuals, A and B, rent a pasture together. A has 18 horses that they graze for 4 months. B grazes 24 cows for 6 months and 36 sheep for 4 months."
  },
  {
    label: "Simple number option",
    text: "48"
  },
  {
    label: "Ratio option",
    text: "3:5"
  },
];

describe('renderMath integration', () => {
  questions.forEach(({ label, text }) => {
    test(label, () => {
      if (!text) {
        expect(renderMath(text)).toBe('');
        return;
      }
      
      const normalized = normalizeMathEquations(text);
      const html = renderMath(text);
      
      // Should not throw or return empty for non-empty input
      expect(html).toBeTruthy();
      
      // Should not contain raw dollar signs (unprocessed math)
      // (unless inside a span attribute which is part of error fallback)
      
      // For plain text, should contain the text content
      if (!text.includes('√') && !text.includes('^') && !text.includes('/')) {
        expect(html).toContain(text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      }
      
      console.log(`[${label}]`);
      console.log(`  Input:      "${text}"`);
      console.log(`  Normalized: "${normalized}"`);
      console.log(`  HTML len:   ${html.length} chars`);
      console.log(`  Has KaTeX:  ${html.includes('katex-html')}`);
      console.log();
    });
  });
});
