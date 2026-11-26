// dist/ 에 웹 연습판 묶기: src/web/main.ts → main.js, index.html·public 복사
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
await build({ entryPoints: ['src/web/main.ts'], bundle: true, format: 'esm', target: 'es2022', minify: true, outfile: 'dist/main.js' });
cpSync('index.html', 'dist/index.html');
cpSync('public', 'dist', { recursive: true });
console.log('dist 준비됨');
