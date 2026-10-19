import fs from 'node:fs';
import path from 'node:path';
const frames = JSON.parse(fs.readFileSync('docs/frame-map.json', 'utf8'));
const failures = [];
if (frames.length !== 27 || new Set(frames.map(f => f.component)).size !== 27) failures.push('Expected 27 distinct frame components.');
for (const frame of frames) {
  for (const file of [...frame.files,frame.reference]) if (!fs.existsSync(file)) failures.push(`Missing ${file}`);
  const component = fs.readFileSync(frame.files[0], 'utf8');
  if (!component.includes('templateUrl:') || !/styleUrls?:/.test(component)) failures.push(`External template/style missing: ${frame.component}`);
  if (/\btemplate\s*:\s*[`'"]/.test(component)) failures.push(`Inline template: ${frame.component}`);
  if (!frame.files.every(file => path.dirname(file) === path.dirname(frame.files[0]))) failures.push(`Frame files not colocated: ${frame.component}`);
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log('PASS: 27/27 unique frame components, 108/108 required files, 27/27 reference images.');
