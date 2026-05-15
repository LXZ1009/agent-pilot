import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8').replace(/\r\n/g, '\n');

describe('workspace scroll layout styles', () => {
  it('locks the desktop workspace to the viewport and keeps columns internally scrollable', () => {
    expect(css).toContain('height: 100dvh;');
    expect(css).toContain('body { margin: 0; min-width: 320px; min-height: 100vh; height: 100%; overflow: hidden; }');
    expect(css).toContain('.task-stage {\n  display: grid;\n  min-width: 0;\n  min-height: 0;');
    expect(css).toContain('.evidence-drawer {\n  display: grid;\n  width: 430px;\n  min-height: 0;');
    expect(css).toContain('.stage-scroll {\n  min-height: 0;\n  overflow-y: auto;');
    expect(css).toContain('.evidence-scroll {\n  min-height: 0;\n  overflow-y: auto;');
  });
});
