import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db.js';

const db = openDatabase(config.databasePath);
const app = createApp({ db });

app.listen(config.port, () => {
  console.log(`aprova-api rodando em http://localhost:${config.port}`);
  console.log(`documentação interativa em http://localhost:${config.port}/docs`);
});
