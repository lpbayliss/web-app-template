/**
 * Dedicated queue worker process for production (`node dist/server/worker.js`). Scales
 * independently of the web tier and is drained gracefully on SIGTERM.
 */
import { bootstrap } from "./bootstrap";

const { shutdown, startWorker } = await bootstrap();
await startWorker();
shutdown.install();
