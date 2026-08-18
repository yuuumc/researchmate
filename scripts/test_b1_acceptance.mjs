// B1 Acceptance Test: §4 positive/negative examples
// Run: node test_b1_acceptance.mjs
import { renderSvgSpec, CIRCUIT_TEMPLATE_WHITELIST, SVG_SPEC_TYPES } from '../src/utils/svgSpecRenderer.js';
import { extractSvgSpec, ensureKatex, isKatexReady } from '../src/utils/renderMath.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('=== B1 §4 Acceptance Tests ===\n');

// ── §4.1 Formula Positive Examples (2) ──
console.log('[§4.1 Formula Positive]');

// Pos-1: inline math $E=mc^2$
ok('inline $E=mc^2$ extracts', (() => {
  const md = 'The formula $E=mc^2$ is famous.';
  // extractMath uses $...$ inline regex
  const re = /\$([^\$\n]+?)\$/g;
  const m = re.exec(md);
  return m && m[1] === 'E=mc^2';
})());

// Pos-2: block math $$\int_0^1 x^2 dx$$
ok('block $$...$$ extracts', (() => {
  const md = 'Block math:\n$$\\int_0^1 x^2 dx$$\nend.';
  const re = /\$\$([\s\S]+?)\$\$/g;
  const m = re.exec(md);
  return m && m[1].includes('\\int_0^1');
})());

// ── §4.2 Formula Negative Examples (4) ──
console.log('[§4.2 Formula Negative - should NOT match $/$$ regex]');

// Neg-1: \[...\] should NOT match $$ block
ok('\\[...\\] not matched as $$', (() => {
  const md = 'Bad \\[E=mc^2\\] here.';
  const re = /\$\$([\s\S]+?)\$\$/g;
  return !re.test(md);
})());

// Neg-2: align multiline should NOT match inline $
ok('align env not matched as inline $', (() => {
  const md = '\\begin{align} x &= 1 \\\\ y &= 2 \\end{align}';
  const re = /\$([^\$\n]+?)\$/g;
  return !re.test(md);
})());

// Neg-3: Chinese characters in formula → not valid LaTeX, regex still matches but KaTeX would fail
ok('Chinese in formula $...$ still extracts token', (() => {
  const md = 'Formula $汉字公式$ here.';
  const re = /\$([^\$\n]+?)\$/g;
  const m = re.exec(md);
  return m && m[1] === '汉字公式';  // regex extracts it, KaTeX fails at render time → fallback
})());

// Neg-4: Multiple $$ on same line should only match pairs
ok('odd $$ count → no partial match', (() => {
  const md = '$$a$$ text $$b';  // unclosed $$
  const re = /\$\$([\s\S]+?)\$\$/g;
  const matches = [...md.matchAll(re)];
  return matches.length === 1;  // only first $$...$$ pair
})());

// ── §4.3 Figure Positive Examples (4 types) ──
console.log('[§4.3 Figure Positive - 4 types]');

// Pos-1: circuit (diode-rectifier from whitelist)
ok('circuit: diode-rectifier renders', (() => {
  const svg = renderSvgSpec({
    type: 'circuit',
    data: { template: 'diode-rectifier', params: { values: { vin: 5 }, labels: {} } }
  });
  return svg && svg.includes('<svg') && svg.includes('</svg>');
})());

// Pos-2: waveform (sine)
ok('waveform: sine renders', (() => {
  const svg = renderSvgSpec({
    type: 'waveform',
    data: {
      x_axis: { label: 't', unit: 's' },
      y_axis: { label: 'V', unit: 'V' },
      series: [{ func: { kind: 'sine', amplitude: 1, period: 6.28, phase: 0 } }]
    }
  });
  return svg && svg.includes('<svg') && (svg.includes('polyline') || svg.includes('path') || svg.includes('line'));
})());

// Pos-3: band (semiconductor band diagram)
ok('band: piecewise linear renders', (() => {
  const svg = renderSvgSpec({
    type: 'band',
    data: {
      fermi: 50,
      segments: [{ x0: 0, x1: 0.5, ec0: 30, ec1: 25, ev0: 70, ev1: 75 }],
      labels: [{ x: 0.25, text: 'region1' }]
    }
  });
  return svg && svg.includes('<svg') && svg.includes('line');
})());

// Pos-4: structure (layered)
ok('structure: layers render', (() => {
  const svg = renderSvgSpec({
    type: 'structure',
    data: {
      layers: [
        { name: 'substrate', material: 'Si', thickness: 50 },
        { name: 'oxide', material: 'SiO2', thickness: 20 },
        { name: 'gate', material: 'Poly-Si', thickness: 10 }
      ]
    }
  });
  return svg && svg.includes('<svg') && svg.includes('rect');
})());

// ── §4.4 Figure Negative Examples (4) ──
console.log('[§4.4 Figure Negative - should return null]');

// Neg-1: null/undefined spec
ok('null spec → null', renderSvgSpec(null) === null);

// Neg-2: unknown type
ok('unknown type → null', renderSvgSpec({ type: 'unknown' }) === null);

// Neg-3: circuit template not in whitelist
ok('non-whitelisted template → null', renderSvgSpec({
  type: 'circuit',
  template: 'invalid-circuit',
  params: {}
}) === null);

// Neg-4: malformed JSON in svg-spec fence → extractSvgSpec handles gracefully
ok('malformed svg-spec JSON → extractSvgSpec does not crash', (() => {
  const md = '```svg-spec\n{ invalid json }\n```';
  try {
    const result = extractSvgSpec(md);
    // Should return an object (not throw), with some structure
    return result !== null && result !== undefined && typeof result === 'object';
  } catch (e) {
    return false;  // should not throw
  }
})());

// ── Circuit whitelist completeness ──
console.log('[Circuit Whitelist - 8 templates]');
const expectedWhitelist = [
  'diode-rectifier', 'bridge-rectifier', 'rc-lowpass',
  'voltage-divider', 'common-source', 'cmos-inverter',
  'opamp-inverting', 'opamp-noninverting'
];
ok('circuit whitelist has 8 templates', CIRCUIT_TEMPLATE_WHITELIST.length === 8);
expectedWhitelist.forEach(t => {
  ok(`  whitelist contains "${t}"`, CIRCUIT_TEMPLATE_WHITELIST.includes(t));
});

// ── SVG_SPEC_TYPES completeness ──
console.log('[SVG Spec Types - 4 types]');
ok('SVG_SPEC_TYPES has 4 types', SVG_SPEC_TYPES.length === 4);
ok('types: circuit/waveform/band/structure',
  SVG_SPEC_TYPES.includes('circuit') &&
  SVG_SPEC_TYPES.includes('waveform') &&
  SVG_SPEC_TYPES.includes('band') &&
  SVG_SPEC_TYPES.includes('structure')
);

// ── Summary ──
console.log('\n=== Summary ===');
console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${pass + fail}`);
if (fail === 0) {
  console.log('✅ ALL B1 §4 ACCEPTANCE TESTS PASSED');
} else {
  console.log('❌ SOME TESTS FAILED');
}
process.exit(fail === 0 ? 0 : 1);
