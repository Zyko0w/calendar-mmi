import { connect } from './db.js';
import { createApp } from './app.js';
import { startScheduler } from './hyperplanning.js';

const db = await connect();
const app = createApp(db);
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`API Agend-A à l'écoute sur le port ${port}`));
startScheduler(db);
