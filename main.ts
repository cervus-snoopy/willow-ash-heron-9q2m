// Tiny stack VM (ISA v1), written from ISA.md.
// Per /input/<id>/: run program.bin with input.bin, write stdout.bin + exit.txt.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function run(p, inp) {
  const s = new Int32Array(257);
  let sp = 0;
  const cs = new Int32Array(64);
  let cp = 0;
  const m = new Int32Array(256);
  const out = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, steps = 0;
  const n = p.length;
  let code = -1;
  outer: for (;;) {
    if (steps >= 1e6) { code = 10; break; }
    if (pc < 0 || pc >= n) { code = 9; break; }
    const op = p[pc];
    // immediate length, -1 = no such opcode
    const il = op === 1 ? 1 : op === 2 ? 4 : op >= 0x30 && op <= 0x33 ? 2 : 0;
    if (op > 0x53 || (op > 7 && op < 0x10) || (op > 0x22 && op < 0x30) ||
        (op > 0x34 && op < 0x40) || (op > 0x41 && op < 0x50)) { code = 5; break; }
    if (pc + 1 + il > n) { code = 9; break; }
    steps++;
    const nx = pc + 1 + il;
    let a, b, r;
    switch (op) {
      case 0: code = 0; break outer;
      case 1:
        if (sp > 255) { code = 3; break outer; }
        b = p[pc + 1]; s[sp++] = b < 128 ? b : b - 256; break;
      case 2:
        if (sp > 255) { code = 3; break outer; }
        s[sp++] = p[pc + 1] | p[pc + 2] << 8 | p[pc + 3] << 16 | p[pc + 4] << 24; break;
      case 3:
        if (sp < 1) { code = 2; break outer; }
        sp--; break;
      case 4:
        if (sp < 1) { code = 2; break outer; }
        if (sp > 255) { code = 3; break outer; }
        s[sp] = s[sp - 1]; sp++; break;
      case 5:
        if (sp < 2) { code = 2; break outer; }
        r = s[sp - 1]; s[sp - 1] = s[sp - 2]; s[sp - 2] = r; break;
      case 6:
        if (sp < 2) { code = 2; break outer; }
        if (sp > 255) { code = 3; break outer; }
        s[sp] = s[sp - 2]; sp++; break;
      case 7:
        if (sp < 3) { code = 2; break outer; }
        r = s[sp - 3]; s[sp - 3] = s[sp - 2]; s[sp - 2] = s[sp - 1]; s[sp - 1] = r; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22:
        if (sp < 2) { code = 2; break outer; }
        b = s[--sp]; a = s[sp - 1];
        if (op === 0x10) r = a + b | 0;
        else if (op === 0x11) r = a - b | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (!b) { code = 4; break outer; } r = Math.trunc(a / b) | 0; }
        else if (op === 0x14) { if (!b) { code = 4; break outer; } r = a % b | 0; }
        else if (op === 0x15) { if (!b) { code = 4; break outer; } r = Math.trunc((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (!b) { code = 4; break outer; } r = (a >>> 0) % (b >>> 0) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = a >>> (b & 31);
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        s[sp - 1] = r; break;
      case 0x17:
        if (sp < 1) { code = 2; break outer; }
        s[sp - 1] = -s[sp - 1] | 0; break;
      case 0x1b:
        if (sp < 1) { code = 2; break outer; }
        s[sp - 1] = ~s[sp - 1]; break;
      case 0x30: case 0x31: case 0x32: {
        let off = p[pc + 1] | p[pc + 2] << 8;
        if (off > 32767) off -= 65536;
        if (op === 0x30) { pc = nx + off; continue; }
        if (sp < 1) { code = 2; break outer; }
        const v = s[--sp];
        if ((op === 0x31) === (v === 0)) { pc = nx + off; continue; }
        break;
      }
      case 0x33:
        if (cp > 63) { code = 7; break outer; }
        cs[cp++] = nx; pc = p[pc + 1] | p[pc + 2] << 8; continue;
      case 0x34:
        if (cp < 1) { code = 8; break outer; }
        pc = cs[--cp]; continue;
      case 0x40:
        if (sp < 1) { code = 2; break outer; }
        a = s[sp - 1];
        if (a < 0 || a > 255) { code = 6; break outer; }
        s[sp - 1] = m[a]; break;
      case 0x41:
        if (sp < 2) { code = 2; break outer; }
        a = s[--sp]; b = s[--sp];
        if (a < 0 || a > 255) { code = 6; break outer; }
        m[a] = b; break;
      case 0x50: {
        if (sp < 1) { code = 2; break outer; }
        const t = String(s[--sp]);
        if (ol + t.length > 65536) { code = 11; break outer; }
        for (let i = 0; i < t.length; i++) out[ol++] = t.charCodeAt(i);
        break;
      }
      case 0x51:
        if (sp < 1) { code = 2; break outer; }
        if (ol > 65535) { code = 11; break outer; }
        out[ol++] = s[--sp] & 255; break;
      case 0x52:
        if (sp > 255) { code = 3; break outer; }
        s[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53:
        if (sp < 1) { code = 2; break outer; }
        code = s[--sp] & 255; break outer;
    }
    pc = nx;
  }
  return [ol, out, code];
}

for (const id of readdirSync(I).sort()) {
  const d = join(I, id);
  const [ol, out, code] = run(readFileSync(join(d, 'program.bin')), readFileSync(join(d, 'input.bin')));
  const od = join(O, id);
  mkdirSync(od, { recursive: true });
  writeFileSync(join(od, 'stdout.bin'), Buffer.from(out.buffer, 0, ol));
  writeFileSync(join(od, 'exit.txt'), code + '\n');
}
