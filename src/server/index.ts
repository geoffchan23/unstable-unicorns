import '../engine/cards';
import { startServer } from './server';

const dev = process.env.NODE_ENV === 'development';

startServer({
  port: Number(process.env.PORT ?? 8787),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'https://geoffreychan.com').split(',').map((s) => s.trim()).filter(Boolean),
  dev,
  hostGrace: Number(process.env.HOST_GRACE_MS) || undefined,
  botDelay: Number(process.env.BOT_DELAY_MS) || undefined,
})
  .then(({ port, close }) => {
    const devNote = dev ? ' (development: localhost origins allowed, no rate limit)' : '';
    console.log(`unicorns server on :${port}${devNote}`);
    for (const sig of ['SIGINT', 'SIGTERM'] as const) {
      process.on(sig, () => { close().then(() => process.exit(0)); });
    }
  })
  .catch((e) => { console.error(e); process.exit(1); });
