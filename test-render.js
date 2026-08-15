// Test specific math content from actual questions
const katex = require('./node_modules/katex');

const testCases = [
  // From Q3
  "k^(-1)= -2",
  "k^(-1)",
  // From Q1
  "x^2+1/x^2",
  "(x^2+1/x^2)",
  // From Q2
  "8k^6+15k^3-2=0",
  "(8k^3-1)(k^3+2)=0",
  // From Q4 explanation
  "(x-1/x)^2=5",
  "x-1/x=\\sqrt{5}",
  // Ratio notation
  "A:B=2:3",
  // Mixed 
  "21/2",
  "k+1/k=2+1/2",
];

console.log("Testing KaTeX rendering:\n");
testCases.forEach(text => {
  try {
    katex.renderToString(text, { throwOnError: true, displayMode: false, output: 'html', strict: false });
    console.log(`✅ OK: "${text}"`);
  } catch(e) {
    console.log(`❌ FAIL: "${text}" → ${e.message}`);
  }
});

// Test normalizeMathEquations behavior
console.log("\n=== Testing normalizeMathEquations on actual question texts ===\n");

// Simulate autoWrapBareMath on key patterns
const bareCmdRe = /\\(?:sqrt|frac|vec|overline|begin|end|alpha|beta|theta|pi|pm|infty|le|ge|neq|times|div|cdot|sum|int|therefore|because|Delta)(?:\{[^{}]*\}|\[[^\[\]]*\])*/g;

const bareEqRe = /(?:^|\s)((?:[a-zA-Z0-9()]+(?:\^[0-9a-zA-Z]+|\/[0-9a-zA-Z]+)?\s*[-+*=:\/]\s*)+[a-zA-Z0-9().]+)(?=\s|$)/g;

const inputs = [
  "If x = 4 + √1 5 , what is the value of (x^2+1/x^2 )?",
  "X is a negative number such thatk+k^(-1)= -2",
  "(k^2+4k-2)/(k^2+k-5)",
  "A:B=2:3, B:C=3:4",
  "₹200 and ₹300",
];

inputs.forEach(input => {
  let s = input;
  
  // Unicode math
  s = s.replace(/√\(([^)]+)\)/g, '\\sqrt{$1}');
  s = s.replace(/√([0-9a-zA-Z]+)/g, '\\sqrt{$1}');
  
  // Bare latex commands
  s = s.replace(bareCmdRe, (match) => `$${match.trim()}$`);
  
  // Bare equations
  const wrapped = [];
  s = s.replace(bareEqRe, (match, eqGroup) => {
    const trimmed = eqGroup.trim();
    if (/[\^=]/.test(trimmed) || (/\/|\*/.test(trimmed) && /\d/.test(trimmed))) {
      wrapped.push(trimmed);
      return match.replace(trimmed, `$${trimmed}$`);
    }
    return match;
  });
  
  console.log(`Input:   "${input}"`);
  console.log(`Output:  "${s}"`);
  if (wrapped.length > 0) {
    console.log(`Wrapped: ${JSON.stringify(wrapped)}`);
    // Test if KaTeX can render each wrapped segment
    wrapped.forEach(seg => {
      try {
        katex.renderToString(seg, { throwOnError: true, displayMode: false, output: 'html', strict: false });
        console.log(`  KaTeX OK: "${seg}"`);
      } catch(e) {
        console.log(`  KaTeX FAIL: "${seg}" → ${e.message}`);
      }
    });
  }
  console.log();
});
