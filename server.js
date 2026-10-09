'use strict';
// Inicia o site do Office Cast. Uso: node server.js
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');

const config = loadConfig();
const app = createApp(config);

app.server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nA porta ${config.port} já está em uso. O site pode já estar aberto em http://localhost:${config.port}\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

app.server.listen(config.port, config.host, () => {
  const url = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
  console.log(`\nOffice Cast rodando em ${url}`);
  console.log(`Painel: ${url}/admin`);
  console.log(`Dados salvos em: ${config.dataDir}`);
  if (!config.adminPasswordHash) console.log('\nATENÇÃO: senha do painel ainda não configurada. Rode "node tools/criar-senha.js".');
  console.log('\nPara encerrar, feche esta janela ou pressione Ctrl+C.\n');
  // baixa as miniaturas que faltarem (em segundo plano)
  app.refreshThumbs(app.allVideoIds());
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { app.server.close(); process.exit(0); });
