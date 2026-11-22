import 'dotenv/config';
import { createApp } from './app.js';
import { assertTransactionalEmailProviderConfigured } from './domain/auth/employee-invitation.js';

assertTransactionalEmailProviderConfigured();
const port = Number(process.env.PORT ?? 3001);
createApp().listen(port, () => console.info(`TaskFlow API listening on ${port}`));
