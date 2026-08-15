// test-math-debug.ts — Run with: node --loader ts-node/esm test-math-debug.ts
// Or compile first: npx tsc test-math-debug.ts --module commonjs --target es2020 --outDir . --skip-lib-check

import { renderMath } from './lib/mathRenderer';
import { normalizeMathEquations } from './lib/text';

// Simulate actual question text from a typical Maths question bank
const testCases = [
  // Plain English - should work
  { label: "Plain English", text: "Two individuals, A and B, rent a pasture together." },
  
  // Typical maths question with fractions
  { label: "Fraction", text: "If 3/4 of a number is 24, what is the number?" },
  
  // With table content (first screenshot)
  { label: "Table header", text: "Table – Daily Wages of 5 Workers Over 4 Days" },
  
  // Day column header  
  { label: "Day text", text: "Day" },
  
  // Single letter option (image option)
  { label: "Single letter A", text: "A" },
  
  // Percentage question
  { label: "Percentage", text: "What is 15% of 240?" },
  
  // Ratio question
  { label: "Ratio", text: "If A : B = 2 : 3 and B : C = 4 : 5, find A : B : C" },
  
  // Empty text (image-only question)
  { label: "Empty", text: "" },
  
  // With superscript
  { label: "Superscript", text: "Find x² + 2x + 1 = 0" },
  
  // With rupee symbol
  { label: "Rupee", text: "Find profit if CP = ₹200 and SP = ₹240" },
  
  // With word OMML fragments that get through
  { label: "OMML remnant", text: "The value is &@& 25" },
  
  // With backslash sequences from Markdown converter 
  { label: "Escaped chars", text: "A\\_B = 2\\_3" },
  
  // Long math question
  { label: "Long math", text: "A invested ₹12000 for 6 months and B invested ₹16000 for 8 months in a business. Find the ratio of their profits." },
  
  // Question with colon that could be confused with ratio
  { label: "With colon", text: "Tap A fills tank in 6 hours, Tap B fills in 8 hours. How long together?" },
];

console.log("=== renderMath Debug Test ===\n");

let failures = 0;

testCases.forEach(({ label, text }) => {
  try {
    const html = renderMath(text);
    const isEmpty = html.trim() === '' && text.trim() !== '';
    const length = html.length;
    
    if (isEmpty) {
      failures++;
      console.log(`❌ [${label}]`);
      console.log(`   Input: "${text}"`);
      console.log(`   Output: (EMPTY - should not be empty!)\n`);
    } else {
      // Check for KaTeX error markers
      if (html.includes('katex-error') || html.includes('color:red')) {
        console.log(`⚠️  [${label}] - KaTeX error in output`);
        console.log(`   Input: "${text}"`);
        console.log(`   First 200 chars: "${html.slice(0, 200)}"\n`);
      } else {
        console.log(`✅ [${label}] - OK (${length} bytes)`);
        // Show a snippet of plain text vs math output
        const hasKatex = html.includes('class="katex"');
        console.log(`   Has KaTeX: ${hasKatex}`);
        if (!hasKatex && text) {
          console.log(`   Output (plain): "${html.slice(0, 80)}"`);
        }
        console.log();
      }
    }
  } catch (e: any) {
    failures++;
    console.log(`💥 [${label}] - THREW ERROR`);
    console.log(`   Input: "${text}"`);
    console.log(`   Error: ${e.message}\n`);
  }
});

// Test normalizeMathEquations specifically
console.log("\n=== normalizeMathEquations Debug ===\n");
const mathInputs = [
  "A : B = 2 : 3",
  "100%",
  "₹200",
  "x² + y² = z²",
  "\\frac{1}{2}",
  "$\\frac{1}{2}$",
  "3/4",
];

mathInputs.forEach(input => {
  const normalized = normalizeMathEquations(input);
  console.log(`Input:      "${input}"`);
  console.log(`Normalized: "${normalized}"`);
  const html = renderMath(input);
  console.log(`HTML:       "${html.slice(0, 100)}"`);
  console.log();
});

console.log(`\nTotal failures: ${failures}`);
