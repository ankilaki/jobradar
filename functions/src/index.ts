import { setGlobalOptions } from 'firebase-functions/v2';
import { initAdmin } from './firebaseAdmin.js';

// Initialize Admin SDK at cold start so every callable/scheduled fn has an app.
initAdmin();

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

export { syncJobBoards, syncJobBoardsManual } from './syncJobBoards.js';
export {
  adminTestCompanyBoard,
  adminUpsertCompany,
  adminBulkUpsertCompanies,
  adminSetCompanyActive,
  adminDeleteCompany,
} from './admin.js';
