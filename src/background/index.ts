import { registerMessaging } from './messaging';

// MV3 service-worker entry. The worker is stateless (architecture §1.5): it registers
// its listeners on every wake and reads any persistent state from storage on demand.
// No navigation listener: the redirect chain is dormant by decision (navigation.ts).
registerMessaging();
