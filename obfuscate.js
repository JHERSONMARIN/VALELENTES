const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const obfOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  numbersToExpressions: true,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 12,
  renameGlobals: false,
  identifierNamesGenerator: 'hexadecimal'
};

const filesToObfuscate = [
  'server-standalone.js',
  'db-sqlite.js',
  'public/js/app.js'
];

console.log('🔒 Iniciando ofuscación de código para VALE-LENTES by VT VALETEC...');

filesToObfuscate.forEach(file => {
  const filePath = path.resolve(__dirname, file);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ Archivo no encontrado: ${file}`);
    return;
  }

  const ext = path.extname(file);
  const base = file.slice(0, -ext.length);
  const srcBackup = path.resolve(__dirname, `${base}.src${ext}`);
  
  let sourceCode = '';
  if (fs.existsSync(srcBackup)) {
    sourceCode = fs.readFileSync(srcBackup, 'utf8');
  } else {
    sourceCode = fs.readFileSync(filePath, 'utf8');
    fs.writeFileSync(srcBackup, sourceCode, 'utf8');
    console.log(`💾 Respaldo original creado en: ${base}.src${ext}`);
  }

  // 2. Ofuscar
  console.log(`⚙️ Ofuscando ${file}...`);
  const obfResult = JavaScriptObfuscator.obfuscate(sourceCode, obfOptions);
  const header = `// VALE-LENTES Óptica POS - (c) VT VALETEC. All rights reserved. Protected Build.\n`;
  fs.writeFileSync(filePath, header + obfResult.getObfuscatedCode(), 'utf8');
  console.log(`✅ ${file} ofuscado y protegido exitosamente.`);
});

console.log('🎉 Ofuscación completa.');
